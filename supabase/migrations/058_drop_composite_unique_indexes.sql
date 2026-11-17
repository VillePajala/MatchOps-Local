-- ============================================================================
-- 058: Drop the composite unique indexes on teams, seasons and tournaments
--      (review 3.21b)
-- ============================================================================
-- Migration 011 added idx_{teams,seasons,tournaments}_composite_unique (name plus
-- context: bound season/tournament/series and game type for teams; club season,
-- game type, gender, age group (and league for seasons) for the other two).
--
-- Why they have to go (as personnel's name constraint did in 056, review 3.21):
-- two devices that create the same team/season/tournament (same name and context)
-- while out of sync each give it their own id. The second upload violated the
-- index, the sync op could never succeed (no row with that id to resolve against),
-- and the "operations failed" indicator stayed until the coach discarded the change
-- - while that device's games pointed at an id the cloud never got.
--
-- Without them both entries sync; the coach can archive or delete the duplicate.
-- Duplicates are still prevented on each device by the app's composite checks
-- (LocalDataStore and SupabaseDataStore, CLAUDE.md Rule 6).
--
-- Only removes indexes: no data changes. Idempotent.
-- ============================================================================

DROP INDEX IF EXISTS idx_teams_composite_unique;
DROP INDEX IF EXISTS idx_seasons_composite_unique;
DROP INDEX IF EXISTS idx_tournaments_composite_unique;
