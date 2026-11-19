-- ============================================================================
-- 062: Home layout + onboarding milestones (Onboarding v3)
-- ============================================================================
-- Two per-account settings for the Onboarding v3 plan
-- (docs/03-active-plans/new-user-funnel-fix-plan.md, "Onboarding v3"):
--
-- app_layout - which layout the coach sees: 'basic' (Perusnäkymä) or 'full'
--   (Koko näkymä, the app as it was). NULL means "never chosen", which the app
--   reads as 'full': every account that existed before this column keeps the
--   app it knows (OD4/D14). Only an account whose setup wizard ran is written
--   'basic'; after that only the coach's own tap changes it.
--
-- onboarding_milestones - first-time timestamps (D17): an object of
--   {milestone: ISO timestamp}, e.g. {"signedUp": "...", "wizardDone": "..."}.
--   Measurement only, in the coach's own settings row: no event stream, no
--   content, no third party. The app checks every entry on read.
--
-- Both nullable, no backfill (nobody's view changes). Settings are a plain
-- upsert, so no function is recreated.
-- ============================================================================

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS app_layout text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_app_layout_check'
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_app_layout_check
      CHECK (app_layout IS NULL OR app_layout IN ('basic', 'full'));
  END IF;
END $$;

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_milestones jsonb;

COMMENT ON COLUMN user_settings.app_layout IS
  'Home/app layout: basic (Perusnäkymä) or full (Koko näkymä). NULL = never chosen = full.';

COMMENT ON COLUMN user_settings.onboarding_milestones IS
  'First-time onboarding milestone timestamps: {milestone: ISO timestamp}. Measurement only.';
