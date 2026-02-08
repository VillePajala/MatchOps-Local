-- ============================================================================
-- Migration 026: Marketing consent support
-- ============================================================================
--
-- Adds status tracking to user_consents for marketing consent management.
-- Enables GDPR-compliant grant/withdraw of marketing consent with full audit trail.
--
-- Changes:
-- 1. Add 'status' column to user_consents ('granted' | 'withdrawn', default 'granted')
-- 2. Backfill existing rows with status = 'granted'
-- 3. Drop unique constraint that prevents multiple rows per (user_id, consent_type, policy_version)
--    Marketing consent needs multiple rows to track grant/withdraw history
-- 4. Add new unique constraint scoped to (user_id, consent_type, policy_version, status)
-- 5. Create get_marketing_consent_status RPC
-- 6. Update record_user_consent RPC to accept optional status parameter
-- 7. Create revoke_user_consent RPC
--
-- @see docs/03-active-plans/UNIFIED-ROADMAP.md
-- ============================================================================

-- ============================================================================
-- Step 1: Add status column
-- ============================================================================

ALTER TABLE user_consents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'granted'
  CHECK (status IN ('granted', 'withdrawn'));

-- ============================================================================
-- Step 2: Backfill existing rows (all existing consents are granted)
-- ============================================================================

UPDATE user_consents SET status = 'granted' WHERE status IS NULL;

-- ============================================================================
-- Step 3: Update unique constraint
-- ============================================================================
-- The old constraint (user_id, consent_type, policy_version) prevents recording
-- a withdraw after a grant for the same version. We need to allow multiple rows
-- with different statuses. Drop old constraints and add a new one that includes
-- status, so we prevent duplicate grant+grant but allow grant then withdraw.

-- Drop the constraints from migrations 008 and 025
DROP INDEX IF EXISTS idx_user_consents_unique;
ALTER TABLE user_consents
  DROP CONSTRAINT IF EXISTS user_consents_user_consent_unique;

-- New constraint: prevents duplicate (user_id, type, version, status) combos
-- e.g., can't have two 'granted' rows for the same user/type/version
ALTER TABLE user_consents
  ADD CONSTRAINT user_consents_user_consent_status_unique
  UNIQUE (user_id, consent_type, policy_version, status);

-- ============================================================================
-- Step 4: get_marketing_consent_status RPC
-- ============================================================================
--
-- Returns the latest marketing consent status for the authenticated user.
-- Returns NULL if no marketing consent record exists.

CREATE OR REPLACE FUNCTION get_marketing_consent_status()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT uc.status INTO v_status
  FROM user_consents uc
  WHERE uc.user_id = v_user_id
    AND uc.consent_type = 'marketing'
  ORDER BY uc.consented_at DESC
  LIMIT 1;

  RETURN v_status;  -- NULL if no record found
END;
$$;

REVOKE ALL ON FUNCTION get_marketing_consent_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_marketing_consent_status TO authenticated;

-- ============================================================================
-- Step 5: Update record_user_consent to accept optional status parameter
-- ============================================================================

CREATE OR REPLACE FUNCTION record_user_consent(
  p_consent_type text,
  p_policy_version text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_status text DEFAULT 'granted'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_consent_id text;
  v_result jsonb;
BEGIN
  -- CRITICAL: Get authenticated user ID from Supabase Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate consent_type
  IF p_consent_type NOT IN ('terms_and_privacy', 'marketing') THEN
    RAISE EXCEPTION 'Invalid consent_type: %', p_consent_type;
  END IF;

  -- Validate policy_version format (YYYY-MM)
  IF p_policy_version !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid policy_version format. Expected YYYY-MM, got: %', p_policy_version;
  END IF;

  -- Validate status
  IF p_status NOT IN ('granted', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid status: %. Expected granted or withdrawn', p_status;
  END IF;

  -- Generate consent ID
  v_consent_id := 'consent_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 8);

  -- Insert consent record (idempotent: ON CONFLICT DO NOTHING)
  INSERT INTO user_consents (id, user_id, consent_type, policy_version, ip_address, user_agent, status)
  VALUES (v_consent_id, v_user_id, p_consent_type, p_policy_version, p_ip_address, p_user_agent, p_status)
  ON CONFLICT (user_id, consent_type, policy_version, status) DO NOTHING;

  -- Return the consent record (either newly inserted or existing)
  SELECT jsonb_build_object(
    'id', uc.id,
    'user_id', uc.user_id,
    'consent_type', uc.consent_type,
    'policy_version', uc.policy_version,
    'consented_at', uc.consented_at,
    'status', uc.status
  ) INTO v_result
  FROM user_consents uc
  WHERE uc.user_id = v_user_id
    AND uc.consent_type = p_consent_type
    AND uc.policy_version = p_policy_version
    AND uc.status = p_status;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION record_user_consent FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_user_consent TO authenticated;

-- ============================================================================
-- Step 6: revoke_user_consent RPC
-- ============================================================================
--
-- Convenience function: records a 'withdrawn' consent entry for marketing.
-- Creates audit trail (old 'granted' row stays, new 'withdrawn' row added).

CREATE OR REPLACE FUNCTION revoke_user_consent(
  p_consent_type text,
  p_policy_version text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN record_user_consent(
    p_consent_type,
    p_policy_version,
    p_ip_address,
    p_user_agent,
    'withdrawn'
  );
END;
$$;

REVOKE ALL ON FUNCTION revoke_user_consent FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revoke_user_consent TO authenticated;
