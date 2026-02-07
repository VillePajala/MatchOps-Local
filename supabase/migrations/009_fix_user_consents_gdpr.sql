-- ============================================================================
-- Migration: Fix user_consents for GDPR compliance
-- ============================================================================
--
-- CRITICAL FIX: Changes ON DELETE CASCADE to ON DELETE SET NULL
-- GDPR requires retaining consent records even after account deletion.
--
-- Changes:
-- 1. Make user_id nullable (allows NULL after account deletion)
-- 2. Change FK constraint from CASCADE to SET NULL
-- 3. Add policy_version format validation
-- 4. Update RLS policy to handle NULL user_id
-- 5. Update RPC function with policy_version validation
--
-- @see docs/02-technical/database/supabase-schema.md
-- ============================================================================

-- ============================================================================
-- Step 1: Drop existing FK constraint and recreate with SET NULL
-- ============================================================================

-- Drop the existing constraint
ALTER TABLE user_consents
  DROP CONSTRAINT IF EXISTS user_consents_user_id_fkey;

-- Make user_id nullable (required for SET NULL to work)
ALTER TABLE user_consents
  ALTER COLUMN user_id DROP NOT NULL;

-- Add new FK constraint with ON DELETE SET NULL
ALTER TABLE user_consents
  ADD CONSTRAINT user_consents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- Step 2: Add policy_version format validation
-- ============================================================================

-- Add CHECK constraint for policy_version format (YYYY-MM)
-- Use DO block to handle case where constraint already exists
DO $$
BEGIN
  ALTER TABLE user_consents
    ADD CONSTRAINT user_consents_policy_version_format
    CHECK (policy_version ~ '^\d{4}-\d{2}$');
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Constraint already exists, ignore
END $$;

-- ============================================================================
-- Step 3: Update RLS policy to handle NULL user_id
-- ============================================================================

DROP POLICY IF EXISTS "Users can only access their own consents" ON user_consents;

-- Policy allows access only to own consents (user_id must match and not be NULL)
-- After account deletion, user_id becomes NULL and records are inaccessible but retained
CREATE POLICY "Users can only access their own consents"
  ON user_consents FOR ALL
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- ============================================================================
-- Step 4: Update RPC function with policy_version validation
-- ============================================================================

CREATE OR REPLACE FUNCTION record_user_consent(
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

-- Ensure permissions are correct
REVOKE ALL ON FUNCTION record_user_consent FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_user_consent TO authenticated;
