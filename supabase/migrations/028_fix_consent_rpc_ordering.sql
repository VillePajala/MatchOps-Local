-- Migration 028: Fix consent RPC functions
--
-- Bug: get_user_consent ordered by consented_at DESC, which returns stale
-- consent records if an older policy version was recorded with a later timestamp
-- (e.g., during development or policy version rollback).
--
-- Fix 1: get_user_consent now orders by policy_version DESC and filters
-- status = 'granted' to always return the highest granted policy version.
--
-- Fix 2: record_user_consent now uses ON CONFLICT DO UPDATE to refresh the
-- timestamp when re-consenting to the same version, instead of DO NOTHING
-- which left stale timestamps that caused ordering issues.

-- ============================================================================
-- Fix get_user_consent: order by policy_version DESC, filter granted only
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

REVOKE ALL ON FUNCTION get_user_consent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_consent(text) TO authenticated;

-- ============================================================================
-- Fix record_user_consent: ON CONFLICT DO UPDATE (refresh timestamp)
-- Must match existing 5-parameter signature from migration 026
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

  -- Insert or update: refresh timestamp and metadata on re-consent
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

REVOKE ALL ON FUNCTION record_user_consent(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_user_consent(text, text, text, text, text) TO authenticated;
