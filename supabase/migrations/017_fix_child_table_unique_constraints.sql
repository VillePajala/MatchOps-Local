-- ============================================================================
-- FIX CHILD TABLE UNIQUE CONSTRAINTS FOR COMPOSITE PRIMARY KEYS
-- Updates UNIQUE constraints to include user_id for multi-user support
-- ============================================================================
--
-- PROBLEM:
-- Migration 013 changed primary keys to composite (user_id, id), allowing
-- the same entity IDs to exist for different users (backup sharing).
-- However, child table UNIQUE constraints were not updated:
--
--   game_events:        UNIQUE(game_id, order_index)     -- Missing user_id!
--   game_players:       UNIQUE(game_id, player_id)       -- Missing user_id!
--   player_assessments: UNIQUE(game_id, player_id)       -- Missing user_id!
--   team_players:       UNIQUE(team_id, player_id)       -- Missing user_id!
--
-- This causes cross-user conflicts when two users import the same backup
-- (which contains identical game/team IDs).
--
-- SOLUTION:
-- Update constraints to include user_id:
--
--   game_events:        UNIQUE(user_id, game_id, order_index)
--   game_players:       UNIQUE(user_id, game_id, player_id)
--   player_assessments: UNIQUE(user_id, game_id, player_id)
--   team_players:       UNIQUE(user_id, team_id, player_id)
--
-- ============================================================================

-- Prevent indefinite lock wait - fail fast after 30 seconds
SET lock_timeout = '30s';

BEGIN;

-- ============================================================================
-- game_events: UNIQUE(game_id, order_index) -> UNIQUE(user_id, game_id, order_index)
-- ============================================================================
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_order_unique;
ALTER TABLE game_events ADD CONSTRAINT game_events_order_unique
  UNIQUE (user_id, game_id, order_index);

-- ============================================================================
-- game_players: UNIQUE(game_id, player_id) -> UNIQUE(user_id, game_id, player_id)
-- ============================================================================
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_game_player_unique;
ALTER TABLE game_players ADD CONSTRAINT game_players_game_player_unique
  UNIQUE (user_id, game_id, player_id);

-- ============================================================================
-- player_assessments: UNIQUE(game_id, player_id) -> UNIQUE(user_id, game_id, player_id)
-- ============================================================================
ALTER TABLE player_assessments DROP CONSTRAINT IF EXISTS player_assessments_game_player_unique;
ALTER TABLE player_assessments ADD CONSTRAINT player_assessments_game_player_unique
  UNIQUE (user_id, game_id, player_id);

-- ============================================================================
-- team_players: UNIQUE(team_id, player_id) -> UNIQUE(user_id, team_id, player_id)
-- ============================================================================
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_team_player_unique;
ALTER TABLE team_players ADD CONSTRAINT team_players_team_player_unique
  UNIQUE (user_id, team_id, player_id);

COMMIT;

-- Add comments for documentation
COMMENT ON CONSTRAINT game_events_order_unique ON game_events IS
  'User-scoped event ordering: one event per (user, game, order_index). Supports multi-user with same game IDs.';

COMMENT ON CONSTRAINT game_players_game_player_unique ON game_players IS
  'User-scoped game roster: one entry per (user, game, player). Supports multi-user with same game IDs.';

COMMENT ON CONSTRAINT player_assessments_game_player_unique ON player_assessments IS
  'User-scoped assessments: one assessment per (user, game, player). Supports multi-user with same game IDs.';

COMMENT ON CONSTRAINT team_players_team_player_unique ON team_players IS
  'User-scoped team roster: one entry per (user, team, player). Supports multi-user with same team IDs.';
