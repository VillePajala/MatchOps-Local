-- ============================================================================
-- Migration: user_consents table and RPC functions
-- ============================================================================
--
-- Creates the user_consents table for GDPR-compliant consent tracking.
-- Also creates RPC functions for recording and retrieving consent.
--
-- GDPR COMPLIANCE:
-- - Consent records are NOT deleted by clear_all_user_data()
-- - Records retained even after account deletion for legal compliance
-- - Audit trail includes timestamp, IP address, and user agent
--
-- DEPLOYMENT:
-- Run via: supabase db push
-- Or execute in Supabase Dashboard > SQL Editor
--
-- @see docs/02-technical/database/supabase-schema.md Section 16
-- ============================================================================

-- ============================================================================
-- Table: user_consents
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_consents (
  id text PRIMARY KEY,  -- Format: consent_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('terms_and_privacy', 'marketing')),
  policy_version text NOT NULL,  -- e.g., '2025-01' for January 2025 policy
  consented_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,  -- Optional: for audit trail
  user_agent text,  -- Optional: browser/device info
  created_at timestamptz DEFAULT now()
);

-- Index for efficient user lookup
CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);

-- Unique constraint prevents duplicate consent records for same user/type/version
-- This is defense-in-depth: RPC also uses ON CONFLICT DO NOTHING
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_consents_unique
  ON user_consents(user_id, consent_type, policy_version);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (for idempotency)
DROP POLICY IF EXISTS "Users can only access their own consents" ON user_consents;

CREATE POLICY "Users can only access their own consents"
  ON user_consents FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- RPC Function: record_user_consent
-- ============================================================================
--
-- Records user consent for Terms/Privacy Policy.
-- SECURITY: Uses auth.uid() exclusively - cannot record consent for other users
-- IDEMPOTENT: Safe to call multiple times with same version (ON CONFLICT DO NOTHING)

CREATE OR REPLACE FUNCTION record_user_consent(
  p_consent_type text,
  p_policy_version text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- REQUIRED: Prevents search_path injection
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

  -- Generate consent ID
  v_consent_id := 'consent_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 8);

  -- Insert consent record (idempotent: ON CONFLICT DO NOTHING)
  -- If user already consented to this version, no duplicate is created
  INSERT INTO user_consents (id, user_id, consent_type, policy_version, ip_address, user_agent)
  VALUES (v_consent_id, v_user_id, p_consent_type, p_policy_version, p_ip_address, p_user_agent)
  ON CONFLICT (user_id, consent_type, policy_version) DO NOTHING;

  -- Return the consent record (either newly inserted or existing)
  SELECT jsonb_build_object(
    'id', uc.id,
    'user_id', uc.user_id,
    'consent_type', uc.consent_type,
    'policy_version', uc.policy_version,
    'consented_at', uc.consented_at
  ) INTO v_result
  FROM user_consents uc
  WHERE uc.user_id = v_user_id
    AND uc.consent_type = p_consent_type
    AND uc.policy_version = p_policy_version;

  RETURN v_result;
END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION record_user_consent FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_user_consent TO authenticated;

-- ============================================================================
-- RPC Function: get_user_consent
-- ============================================================================
--
-- Retrieves the latest consent record for the authenticated user.
-- Returns NULL if no consent record exists for the given type.

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
  WHERE user_id = v_user_id AND consent_type = p_consent_type
  ORDER BY consented_at DESC
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

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION get_user_consent FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_consent TO authenticated;
