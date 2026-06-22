-- ============================================================================
-- 031: user_consents RLS — read-only for users (CR-M8)
-- ============================================================================
-- Migration 016 (initplan optimization) widened the user_consents policy to
-- FOR ALL (USING only, no WITH CHECK). That let any authenticated user directly
-- INSERT/UPDATE/DELETE their OWN user_consents rows via PostgREST — bypassing
-- record_user_consent / revoke_user_consent (both SECURITY DEFINER), which are
-- the ONLY intended write path and validate consent_type / policy_version /
-- status. A user could forge a 'granted' record they never gave, or delete a
-- withdrawal, corrupting the GDPR consent audit trail.
--
-- Fix (mirrors the 018 subscriptions fix): revert to FOR SELECT. Every consent
-- RPC (record_/revoke_/get_user_consent, get_marketing_consent_status) is
-- SECURITY DEFINER and bypasses RLS, so reads and writes through the app are
-- unaffected; only direct table mutation by users is removed.
-- ============================================================================

DROP POLICY IF EXISTS "Users can only access their own consents" ON public.user_consents;

CREATE POLICY "Users can read their own consents" ON public.user_consents
  FOR SELECT USING (((select auth.uid()) = user_id) AND (user_id IS NOT NULL));
