-- ============================================================================
-- 063: Privacy 2026-11 - diagnostics switch + consent records deleted with the account
-- ============================================================================
-- Two owner decisions from the GDPR audit (2026-11-19):
--
-- 1. user_settings.diagnostics_enabled - the per-account switch
--    Settings -> Data "Error reporting and usage statistics". NULL means
--    "never chosen", which the app reads as ON (the default). FALSE turns off
--    Sentry and the onboarding milestones for that account. Additive,
--    nullable, no backfill. The app sends the column only once it has a
--    value, so settings keep saving on a database this has not reached.
--
-- 2. user_consents are deleted WITH the account. Migration 009 made the FK
--    ON DELETE SET NULL so consent records outlived the account; the
--    2026-11 privacy policy instead says they are deleted with it. The FK
--    becomes ON DELETE CASCADE, so deleting the auth user (delete-account
--    Edge Function -> auth.admin.deleteUser) removes every consent row,
--    marketing included, in the same transaction. clear_all_user_data
--    ("delete all cloud data", account kept) still keeps them: the account
--    still exists and its acceptance record is still needed.
--
--    Rows already orphaned by earlier account deletions (user_id IS NULL)
--    belong to accounts that no longer exist; under the new policy they are
--    not kept, so they are removed here. THIS DELETE IS IRREVERSIBLE.
-- ============================================================================

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS diagnostics_enabled boolean;

COMMENT ON COLUMN user_settings.diagnostics_enabled IS
  'Error reporting (Sentry) and onboarding milestones. NULL = never chosen = on; false = off.';

ALTER TABLE user_consents
  DROP CONSTRAINT IF EXISTS user_consents_user_id_fkey;

ALTER TABLE user_consents
  ADD CONSTRAINT user_consents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

DELETE FROM user_consents WHERE user_id IS NULL;
