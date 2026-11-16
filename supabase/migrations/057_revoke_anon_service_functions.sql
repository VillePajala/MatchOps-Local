-- ============================================================================
-- 057: Service-only functions are no longer executable by anon (review 6.6)
-- ============================================================================
-- upsert_subscription (010) and check_rate_limit (024) are SECURITY DEFINER
-- functions meant only for the Edge Functions, which call them with the service
-- role. Their migrations revoked EXECUTE from PUBLIC and authenticated, but
-- Supabase's default privileges also grant EXECUTE on new public functions to
-- anon directly, and that grant stayed (verified on staging and production:
-- proacl {postgres=X, anon=X, service_role=X}).
--
-- With the public anon key, which ships in the client, anyone could therefore:
--  - POST /rest/v1/rpc/upsert_subscription with no user JWT and write an
--    'active' subscription for any user id - harmless while premium enforcement
--    is off, a free-premium bypass the day it is switched on;
--  - call check_rate_limit with another caller's key (e.g. 'delete-acct:<ip>')
--    to hold that key at its limit, or fill rate_limits with junk rows.
--
-- How it was missed: 010's comment says service_role is a superuser that bypasses
-- EXECUTE checks, so revoking from the client roles was enough. That premise is
-- false - service_role only has BYPASSRLS and needs EXECUTE like any other role -
-- and this migration supersedes that comment.
--
-- For every future service-only function: the project's default privileges grant
-- EXECUTE on new public functions to anon AND authenticated directly. Revoking
-- from PUBLIC does not remove those grants; revoke from anon and authenticated
-- explicitly (see supabase/migrations/README.md).
--
-- Grants only: the function bodies are not touched. The explicit service_role
-- grant states the intent; it already holds EXECUTE today.
--
-- Every other SECURITY DEFINER function in public that anon can execute was
-- checked: each acts on auth.uid() (directly, or via record_user_consent), so an
-- anon caller acts on no one. Those are left as they are.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.upsert_subscription(
  uuid, public.subscription_status, text, text, text, timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_subscription(
  uuid, public.subscription_status, text, text, text, timestamptz, timestamptz, timestamptz
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
