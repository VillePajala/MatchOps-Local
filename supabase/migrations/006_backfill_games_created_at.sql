-- Migration: Backfill null created_at values in games table
--
-- Context: The RPC function (001_rpc_functions.sql) now injects timestamps for new saves,
-- but existing rows with null created_at need backfilling for stable sorting in getGames().
--
-- Strategy: Use updated_at if available, otherwise use the current timestamp.
-- This is a best-effort approximation since original creation time is unknown.
--
-- Note: Only the games table needs backfilling as it's the only table used for sorting.
-- Child tables (game_events, game_players, player_assessments, game_tactical_data)
-- have DEFAULT now() on created_at and don't use updated_at for their created_at backfill.

-- Backfill games.created_at (the main table used for sorting in getGames)
UPDATE games
SET created_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL;
