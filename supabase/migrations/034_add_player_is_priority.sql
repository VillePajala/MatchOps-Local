-- Migration 034: Add is_priority flag to players (master) + game_players
-- (per-game snapshot).
--
-- Priority players surface a ★ marker in the planner's chip grid +
-- minutes dashboard and feed the standalone's "fair share for the
-- players that matter" heuristic. The flag is a property of the
-- player to the coach (not of any plan), so it lives on the master
-- players row. game_players carries it forward as a snapshot so a
-- saved game preserves the priority state at the time it was saved
-- — same pattern as the existing is_goalie / received_fair_play_card
-- snapshot fields.
--
-- All existing rows default to false. The save_game_with_relations
-- RPC (migration 030) does not currently reference is_priority on
-- game_players; it'll start including it once the SupabaseDataStore
-- transform is updated, with the column default providing safety
-- for any legacy in-flight saves.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false;

ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false;
