-- ============================================================================
-- Migration: Sync consent RPCs with production hotfix (repo catch-up)
-- ============================================================================
--
-- DRIFT: Production (matchops-cloud) received a direct hotfix migration
-- `fix_consent_rpc_ordering` on 2026-06-10 that was never committed to the
-- repo. This migration mirrors those definitions verbatim so repo and prod
-- match. Discovered during the CR-C3 deployment probe (2026-06-11).
--
-- What the hotfix changed:
--
-- 1. get_user_consent (#371 fix): only consider rows with status = 'granted'
--    and order by policy_version DESC. The 008 version ordered by
--    consented_at DESC with no status filter, so a withdrawn consent could
--    still read as granted.
--
-- 2. record_user_consent (re-grant fix, code-review CR-H9): ON CONFLICT now
--    DOES UPDATE (bumps consented_at + metadata) instead of DO NOTHING.
--    With DO NOTHING, withdraw -> re-grant silently no-op'd: both a
--    'granted' and a 'withdrawn' row existed for the (user, type, version),
--    the insert conflicted, and get_marketing_consent_status (latest
--    consented_at) kept returning 'withdrawn' forever. DO UPDATE bumps the
--    granted row's consented_at so it becomes the latest again.
--
-- Applying this migration to production is a no-op (definitions identical).
--
-- @see supabase/migrations/008_user_consents.sql (original get_user_consent)
-- @see supabase/migrations/026_marketing_consent.sql (original record_user_consent)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_consent(
  p_consent_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_consent record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, consent_type, policy_version, consented_at
  INTO v_consent
  FROM user_consents
  WHERE user_id = v_user_id
    AND consent_type = p_consent_type
    AND status = 'granted'
  ORDER BY policy_version DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_consent.id,
    'consent_type', v_consent.consent_type,
    'policy_version', v_consent.policy_version,
    'consented_at', v_consent.consented_at
  );
END;
$$;

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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_consent_type NOT IN ('terms_and_privacy', 'marketing') THEN
    RAISE EXCEPTION 'Invalid consent_type: %', p_consent_type;
  END IF;

  IF p_policy_version !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid policy_version format. Expected YYYY-MM, got: %', p_policy_version;
  END IF;

  IF p_status NOT IN ('granted', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid status: %. Expected granted or withdrawn', p_status;
  END IF;

  v_consent_id := 'consent_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 8);

  INSERT INTO user_consents (id, user_id, consent_type, policy_version, ip_address, user_agent, status)
  VALUES (v_consent_id, v_user_id, p_consent_type, p_policy_version, p_ip_address, p_user_agent, p_status)
  ON CONFLICT (user_id, consent_type, policy_version, status)
  DO UPDATE SET
    consented_at = now(),
    ip_address = EXCLUDED.ip_address,
    user_agent = EXCLUDED.user_agent;

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

-- Permissions unchanged: both functions already restricted to authenticated
-- (REVOKE/GRANT from 008/026 still apply to the replaced definitions).
