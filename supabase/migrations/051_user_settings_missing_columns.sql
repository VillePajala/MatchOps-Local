-- ============================================================================
-- 051: Settings that were only ever saved on one of the two backends
-- ============================================================================
-- user_settings stores each setting as its own COLUMN, and both transforms in
-- SupabaseDataStore are field-by-field whitelists. A setting absent from the
-- table is therefore dropped silently on save and never read back - no error,
-- no warning, the value simply does not survive a reload. Local mode keeps the
-- whole object, so the same code appears to work there, which is what let this
-- go unnoticed.
--
-- Two groups:
--
--   starting_point_* and arrival_buffer_minutes - the departure time on the
--     next-match card. Added with the feature and never given columns, so the
--     starting point vanished on every reload and no departure time could be
--     shown at all in cloud mode.
--
--   assessments_enabled, assessment_rating_style, assessment_template - older,
--     and broken the same way for longer. Turning assessments OFF appeared to
--     work only because false is also the default; turning them ON never
--     survived a reload.
--
-- All nullable with no backfill: an absent value falls back to the same default
-- the app already applies, so existing rows keep behaving exactly as they do
-- now. No function is recreated here - settings are a plain upsert, not the RPC.
-- ============================================================================

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS starting_point_name text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS starting_point_address text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS starting_point_lat double precision;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS starting_point_lng double precision;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS arrival_buffer_minutes integer;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS assessments_enabled boolean;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS assessment_rating_style text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS assessment_template text;

COMMENT ON COLUMN user_settings.starting_point_name IS
  'What the coach calls the place they set off from; only the coordinates can be measured from.';
COMMENT ON COLUMN user_settings.arrival_buffer_minutes IS
  'Club default minutes to be at the ground before kick-off; a match may override it.';
COMMENT ON COLUMN user_settings.assessments_enabled IS
  'Whether the player-assessment feature is shown; NULL means the app default (off).';
