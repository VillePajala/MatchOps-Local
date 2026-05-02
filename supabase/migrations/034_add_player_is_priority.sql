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
-- Nullable with DEFAULT false matches the existing boolean snapshot
-- fields (is_goalie, received_fair_play_card, is_selected, on_field).
-- save_game_with_relations (migration 030) inserts via
-- jsonb_populate_recordset, which produces NULL for keys absent in
-- the JSON payload — older clients that haven't been updated to
-- include is_priority must still be able to save without violating
-- a NOT NULL constraint. Reads always coalesce via `?? false` so the
-- nullable column behaves like a non-null boolean to consumers.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_priority boolean DEFAULT false;

ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS is_priority boolean DEFAULT false;
