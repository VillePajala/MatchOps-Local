-- Migration 040: persist the Home view preference (simple launcher vs dashboard)
--
-- The opt-in Home dashboard toggle (homeView) had no column, so in CLOUD mode
-- transformSettingsToDb/FromDb silently dropped it and the toggle never
-- persisted (local mode already round-trips it via JSON). Add a nullable column;
-- an unset value reads as 'simple' in the app, so this is safe for existing rows.
--
-- Metadata-only: ADD COLUMN with no NOT NULL/DEFAULT rewrite. No RPC touches
-- user_settings (settings use a direct upsert), so nothing else to recreate.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS home_view text
  CHECK (home_view IS NULL OR home_view IN ('simple', 'dashboard'));
