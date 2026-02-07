-- Fix: Revert subscription RLS policy from FOR ALL back to FOR SELECT
--
-- Migration 016 (initplan optimization) incorrectly widened the subscription policy
-- from FOR SELECT to FOR ALL. This allowed authenticated users to INSERT/UPDATE/DELETE
-- their own subscription rows via PostgREST, bypassing the intended pattern where
-- only Edge Functions (using service_role) can write to subscriptions.
--
-- Original correct policy: migration 010_subscriptions.sql lines 70-74
-- Broken by: migration 016_optimize_rls_policies_initplan.sql lines 57-60

DROP POLICY IF EXISTS "Users can read own subscription" ON public.subscriptions;
CREATE POLICY "Users can read own subscription" ON public.subscriptions
  FOR SELECT USING ((select auth.uid()) = user_id);
