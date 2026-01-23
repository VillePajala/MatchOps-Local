-- Migration 007: Add missing user_id index on game_tactical_data
--
-- Problem: RLS policies filter by user_id, but game_tactical_data table
-- was missing an index on user_id, causing sequential scans.
-- All other tables have this index.
--
-- Impact: Performance degradation at scale (500+ games)

CREATE INDEX IF NOT EXISTS idx_game_tactical_data_user_id
ON game_tactical_data(user_id);

-- Verify the index was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'game_tactical_data'
    AND indexname = 'idx_game_tactical_data_user_id'
  ) THEN
    RAISE EXCEPTION 'Index idx_game_tactical_data_user_id was not created';
  END IF;
END $$;
