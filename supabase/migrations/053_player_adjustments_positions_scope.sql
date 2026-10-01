-- ============================================================================
-- 053: External games carry positions and their own scope
-- ============================================================================
-- An external game (player_adjustments) was a scoreboard row: team, opponent,
-- score, goals, assists. It could not say WHERE the player played, which is the
-- one thing the app's own matches record so carefully, and it could not be
-- placed under the sport / gender / age-group filters without hand-filtering
-- (the scope rule treated both as unknown and dropped every row).
--
-- Four nullable columns, no backfill: an absent value means "not recorded",
-- which is exactly what older rows are. `positions` holds the finish flow's
-- position ids (gk, lb, cam, st ...). No function is recreated; the table is
-- written by plain inserts and upserts.
-- ============================================================================

ALTER TABLE player_adjustments ADD COLUMN IF NOT EXISTS positions text[];
ALTER TABLE player_adjustments ADD COLUMN IF NOT EXISTS game_type text CHECK (game_type IN ('soccer', 'futsal'));
ALTER TABLE player_adjustments ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('boys', 'girls'));
ALTER TABLE player_adjustments ADD COLUMN IF NOT EXISTS age_group text;

COMMENT ON COLUMN player_adjustments.positions IS
  'Positions the player held in this external game: the app''s position ids (gk, lb, cam, st ...). NULL on rows recorded before 053.';
COMMENT ON COLUMN player_adjustments.game_type IS 'soccer or futsal; places the row under the sport filter. NULL = not recorded.';
COMMENT ON COLUMN player_adjustments.gender IS 'boys or girls; places the row under the gender filter. NULL = not recorded.';
COMMENT ON COLUMN player_adjustments.age_group IS 'Age group such as U12; places the row under the age-group filter. NULL = not recorded.';
