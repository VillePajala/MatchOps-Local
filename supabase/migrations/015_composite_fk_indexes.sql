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
