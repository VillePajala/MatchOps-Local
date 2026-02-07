-- ============================================================================
-- PERFORMANCE INDEXES FOR COMPOSITE FOREIGN KEYS
-- ============================================================================
--
-- PURPOSE: Optimize CASCADE DELETE/SET NULL operations for composite FKs
--
-- BACKGROUND:
-- Migration 013 changed FKs from single-column to composite (user_id, fk_col).
-- PostgreSQL doesn't auto-create indexes for FKs. Single-column indexes exist
-- but composite indexes are more efficient for CASCADE operations.
--
-- IMPACT: Low - only affects deletion performance, not reads/writes.
-- Can be applied any time after migration 014.
--
-- ============================================================================
-- INDEX STRATEGY: WHY KEEP BOTH SINGLE AND COMPOSITE
-- ============================================================================
--
-- EXISTING INDEXES (from migration 000):
-- - Single-column: idx_game_events_game_id, idx_games_season_id, etc.
--
-- NEW INDEXES (this migration):
-- - Composite: idx_game_events_user_game (user_id, game_id), etc.
--
-- WHY KEEP BOTH:
-- - Single-column: Optimizes queries filtered only by FK column (rare with RLS)
-- - Composite: Optimizes CASCADE operations where both user_id and FK are known
--
-- PostgreSQL query planner will choose the most selective index per query.
-- Disk space impact: ~5-10KB per composite index (negligible for this scale).
--
-- ALTERNATIVE (not recommended): Drop single-column indexes to save space.
-- This would slow down any queries that don't filter by user_id first.
--
-- ============================================================================

-- Game child tables → games (user_id, game_id)
-- Used when: DELETE FROM games WHERE user_id = ? AND id = ?
CREATE INDEX IF NOT EXISTS idx_game_events_user_game
  ON game_events(user_id, game_id);

CREATE INDEX IF NOT EXISTS idx_game_players_user_game
  ON game_players(user_id, game_id);

-- Note: game_tactical_data PK is (user_id, game_id), which is already indexed

CREATE INDEX IF NOT EXISTS idx_player_assessments_user_game
  ON player_assessments(user_id, game_id);

-- Games → seasons, tournaments, teams (user_id, fk_col)
-- Used when: DELETE FROM seasons/tournaments/teams (SET NULL on games)
CREATE INDEX IF NOT EXISTS idx_games_user_season
  ON games(user_id, season_id);

CREATE INDEX IF NOT EXISTS idx_games_user_tournament
  ON games(user_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_games_user_team
  ON games(user_id, team_id);

-- Player adjustments → seasons, tournaments (user_id, fk_col)
CREATE INDEX IF NOT EXISTS idx_player_adjustments_user_season
  ON player_adjustments(user_id, season_id);

CREATE INDEX IF NOT EXISTS idx_player_adjustments_user_tournament
  ON player_adjustments(user_id, tournament_id);

-- Team players → teams (user_id, team_id)
CREATE INDEX IF NOT EXISTS idx_team_players_user_team
  ON team_players(user_id, team_id);
