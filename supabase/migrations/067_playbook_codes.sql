-- ============================================================================
-- 067: playbook_codes - club codes that unlock a playbook
-- ============================================================================
-- A club gives its coaches a code ("PEPO-7KQ2-M9XD-4HNA"); a coach types it in
-- the library and redeem_playbook_code() grants that account the playbook
-- (a playbook_access row, migration 065). Codes are created by the service
-- role (scripts/pelitapa/create-code.mjs); see
-- docs/03-active-plans/UNIFIED-ROADMAP.md, "Pelitapa library" -> ACCESS MODEL.
--
-- Only a HASH of each code is stored: hex sha256 of the NORMALISED code
-- (upper-case, spaces and dashes removed), so a leaked table does not hand
-- out working codes. The same normalisation runs in the script and here.
--
-- Access:
-- - playbook_codes and playbook_code_attempts: RLS on, NO policies, and all
--   client privileges revoked. Nobody reads them except the service role and
--   the SECURITY DEFINER function below.
-- - redeem_playbook_code(p_code): authenticated only (not anon / PUBLIC).
--   Returns json:
--     { ok: true,  playbook_id, playbook_name }              -- granted now
--     { ok: true,  playbook_id, playbook_name, already: true } -- had access
--                                                              (no use consumed)
--     { ok: false, error: 'invalid' | 'expired' | 'used_up' | 'revoked'
--                        | 'rate_limited' }
--   The answer never says more than that (no ids for a failed code).
--
-- Brute force: at most 10 FAILED redemptions per user per rolling hour
-- (playbook_code_attempts; a success does not count). Its own table rather
-- than rate_limits (024): check_rate_limit() deletes every row older than the
-- CALLER's window, so a 1-minute caller would wipe these 1-hour counters.
--
-- Concurrency: the code row is locked (FOR UPDATE) for the check-and-increment,
-- so two coaches redeeming the last use cannot both get it.
--
-- Lifetime:
-- - Deleting a playbook cascades to its codes.
-- - Account deletion: attempts cascade (auth.users ON DELETE CASCADE). The
--   access a code granted is a playbook_access row and goes with it (065).
-- - clear_all_user_data does not touch either table: codes are not the
--   coach's data, and clearing must not reset the attempt counter.
-- - Revoking or expiring a code stops new redemptions; access already granted
--   stays (remove playbook_access rows by hand to withdraw it).
--
-- Additive and re-runnable (IF NOT EXISTS / OR REPLACE).
-- ============================================================================

CREATE TABLE IF NOT EXISTS playbook_codes (
  code_hash   text PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  playbook_id text NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  label       text,
  expires_at  timestamptz,
  max_uses    int CHECK (max_uses IS NULL OR max_uses > 0),
  uses        int NOT NULL DEFAULT 0 CHECK (uses >= 0),
  revoked     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE playbook_codes IS
  'Codes that unlock a playbook (redeem_playbook_code). Only sha256 of the normalised code is stored. Service role only; no client access.';
COMMENT ON COLUMN playbook_codes.label IS
  'Who / what the code was made for (e.g. "PEPO P2014 coaches, spring 2027"). Not shown in the app.';

CREATE INDEX IF NOT EXISTS idx_playbook_codes_playbook ON playbook_codes (playbook_id);

CREATE TABLE IF NOT EXISTS playbook_code_attempts (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failures     int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE playbook_code_attempts IS
  'Failed redeem_playbook_code attempts per user in the current one-hour window (brute-force limit). No client access.';

ALTER TABLE playbook_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON playbook_codes, playbook_code_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION redeem_playbook_code(p_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_failures CONSTANT int := 10;
  c_window CONSTANT interval := interval '1 hour';
  v_user_id uuid := auth.uid();
  v_norm text;
  v_code playbook_codes%ROWTYPE;
  v_failures int;
  v_window_start timestamptz;
  v_name text;
  v_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Rate limit (failed attempts in the current window).
  SELECT failures, window_start INTO v_failures, v_window_start
    FROM playbook_code_attempts WHERE user_id = v_user_id;
  IF FOUND AND v_window_start > now() - c_window AND v_failures >= c_max_failures THEN
    RETURN json_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));

  IF length(v_norm) BETWEEN 1 AND 64 THEN
    SELECT * INTO v_code FROM playbook_codes
      WHERE code_hash = encode(sha256(convert_to(v_norm, 'UTF8')), 'hex')
      FOR UPDATE;
  END IF;

  IF v_code.code_hash IS NULL THEN
    v_error := 'invalid';
  ELSIF EXISTS (SELECT 1 FROM playbook_access
                 WHERE playbook_id = v_code.playbook_id AND user_id = v_user_id) THEN
    -- Already unlocked (by this code or another way): fine, no use consumed.
    SELECT name INTO v_name FROM playbooks WHERE id = v_code.playbook_id;
    RETURN json_build_object('ok', true, 'already', true,
                             'playbook_id', v_code.playbook_id, 'playbook_name', v_name);
  ELSIF v_code.revoked THEN
    v_error := 'revoked';
  ELSIF v_code.expires_at IS NOT NULL AND v_code.expires_at <= now() THEN
    v_error := 'expired';
  ELSIF v_code.max_uses IS NOT NULL AND v_code.uses >= v_code.max_uses THEN
    v_error := 'used_up';
  END IF;

  IF v_error IS NOT NULL THEN
    INSERT INTO playbook_code_attempts AS a (user_id, failures, window_start)
      VALUES (v_user_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE SET
        failures = CASE WHEN a.window_start <= now() - c_window THEN 1 ELSE a.failures + 1 END,
        window_start = CASE WHEN a.window_start <= now() - c_window THEN now() ELSE a.window_start END;
    RETURN json_build_object('ok', false, 'error', v_error);
  END IF;

  INSERT INTO playbook_access (playbook_id, user_id)
    VALUES (v_code.playbook_id, v_user_id)
    ON CONFLICT DO NOTHING;
  UPDATE playbook_codes SET uses = uses + 1 WHERE code_hash = v_code.code_hash;
  SELECT name INTO v_name FROM playbooks WHERE id = v_code.playbook_id;
  RETURN json_build_object('ok', true, 'playbook_id', v_code.playbook_id, 'playbook_name', v_name);
END;
$$;

COMMENT ON FUNCTION redeem_playbook_code(text) IS
  'Unlocks a playbook for the caller with a club code (migration 067). Max 10 failed attempts per user per hour.';

REVOKE ALL ON FUNCTION redeem_playbook_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION redeem_playbook_code(text) TO authenticated;
