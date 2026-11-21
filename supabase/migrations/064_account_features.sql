-- ============================================================================
-- 064: account_features - server-controlled per-account feature flags
-- ============================================================================
-- A small allowlist of features switched on for individual accounts, written
-- ONLY by the service role / SQL (the owner grants a feature by hand). The
-- first flag is 'pelitapa' (the Pelitapa library, hidden from everyone except
-- the owner and later the coaches of a club that has permission). See
-- docs/03-active-plans/UNIFIED-ROADMAP.md, "Pelitapa library".
--
-- Access:
-- - RLS on. One SELECT policy: a signed-in user reads their OWN rows.
-- - No INSERT/UPDATE/DELETE policy, and the table privileges are narrowed to
--   SELECT for authenticated and nothing for anon. Supabase's default
--   privileges grant ALL on new public tables to anon and authenticated; RLS
--   alone would already refuse writes, the REVOKE makes the intent explicit
--   and survives a policy mistake later.
-- - service_role (BYPASSRLS) keeps its default privileges, so a grant is one
--   INSERT from the SQL editor / Management API.
--
-- Lifetime:
-- - Account deletion: the FK cascades (auth.users ON DELETE CASCADE).
-- - clear_all_user_data ("delete all cloud data", account kept) deliberately
--   does NOT touch this table: a granted feature belongs to the account, not
--   to the coach's data, and the coach cannot re-grant it themselves.
--
-- Additive and re-runnable (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_features (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    text NOT NULL CHECK (feature ~ '^[a-z][a-z0-9_]{0,63}$'),
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature)
);

COMMENT ON TABLE account_features IS
  'Per-account feature flags. Written only by the service role / SQL; clients read their own rows. Kept by clear_all_user_data, removed with the account.';

ALTER TABLE account_features ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON account_features FROM PUBLIC, anon, authenticated;
GRANT SELECT ON account_features TO authenticated;

DROP POLICY IF EXISTS "Users can read their own account features" ON account_features;
CREATE POLICY "Users can read their own account features"
  ON account_features FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);
