-- ============================================================================
-- Add Composite Unique Indexes for Teams, Seasons, Tournaments
-- ============================================================================
--
-- Issue: #331 - Add database-level composite unique constraints
--
-- Previously (migration 003), we removed simple UNIQUE(user_id, name) constraints
-- because they were too restrictive. The app allows duplicate names when context
-- differs (e.g., "Eagles" team for Season A and "Eagles" team for Season B).
--
-- However, client-side validation has race condition risk - two concurrent requests
-- could both pass validation and create duplicates.
--
-- This migration adds database-level UNIQUE indexes that match the app-level
-- composite uniqueness rules. Client-side validation remains for better UX
-- (immediate feedback), while database constraints act as safety net.
--
-- Composite Keys (from SupabaseDataStore.ts):
--   - Teams: name + boundSeasonId + boundTournamentId + boundTournamentSeriesId + gameType
--   - Seasons: name + clubSeason + gameType + gender + ageGroup + leagueId
--   - Tournaments: name + clubSeason + gameType + gender + ageGroup
--
-- @see src/datastore/SupabaseDataStore.ts - createTeamCompositeKey, createSeasonCompositeKey, createTournamentCompositeKey
-- @see https://github.com/VillePajala/MatchOps-Local/issues/331
-- ============================================================================

-- Teams composite uniqueness
-- A team is unique per user by: name + season binding + tournament binding + series binding + game type
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_composite_unique ON teams (
  user_id,
  LOWER(name),
  COALESCE(bound_season_id, ''),
  COALESCE(bound_tournament_id, ''),
  COALESCE(bound_tournament_series_id, ''),
  COALESCE(game_type, '')
);

-- Seasons composite uniqueness
-- A season is unique per user by: name + club season + game type + gender + age group + league
CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_composite_unique ON seasons (
  user_id,
  LOWER(name),
  COALESCE(club_season, ''),
  COALESCE(game_type, ''),
  COALESCE(gender, ''),
  COALESCE(age_group, ''),
  COALESCE(league_id, '')
);

-- Tournaments composite uniqueness
-- A tournament is unique per user by: name + club season + game type + gender + age group
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_composite_unique ON tournaments (
  user_id,
  LOWER(name),
  COALESCE(club_season, ''),
  COALESCE(game_type, ''),
  COALESCE(gender, ''),
  COALESCE(age_group, '')
);

-- Add comments for documentation
COMMENT ON INDEX idx_teams_composite_unique IS
  'Composite uniqueness: name + season + tournament + series + game_type per user. Matches app-level validation.';

COMMENT ON INDEX idx_seasons_composite_unique IS
  'Composite uniqueness: name + club_season + game_type + gender + age_group + league per user. Matches app-level validation.';

COMMENT ON INDEX idx_tournaments_composite_unique IS
  'Composite uniqueness: name + club_season + game_type + gender + age_group per user. Matches app-level validation.';
