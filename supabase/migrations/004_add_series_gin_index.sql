-- ============================================================================
-- Add GIN Index on tournaments.series
-- ============================================================================
-- The tournaments.series column stores JSONB array of tournament series/levels.
-- This index improves query performance when filtering or searching within
-- the series array (e.g., finding tournaments with a specific level).
--
-- GIN (Generalized Inverted Index) is optimal for JSONB containment queries:
--   WHERE series @> '[{"level": "Elite"}]'
--   WHERE series ? 'level'
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tournaments_series ON tournaments USING GIN (series);
