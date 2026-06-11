-- ============================================================================
-- Migration: Fix composite FK ON DELETE SET NULL to null only the entity column
-- ============================================================================
--
-- BUG (CR-C3, code review 2026-06-11):
-- Migration 013 created composite foreign keys like
--   FOREIGN KEY (user_id, season_id) REFERENCES seasons(user_id, id)
--   ON DELETE SET NULL
-- PostgreSQL's SET NULL action nulls ALL referencing columns unless a column
-- list is given. games.user_id and player_adjustments.user_id are NOT NULL,
-- so deleting any season/tournament/team that a game (or adjustment)
-- references raises 23502 (not-null violation) and the whole DELETE fails:
--   - SupabaseDataStore.deleteSeason/deleteTournament/deleteTeam error out
--   - In cloud sync mode the local delete succeeds but the queued cloud
--     delete fails permanently -> local/cloud divergence
--
-- FIX:
-- Recreate the five FKs with a SET NULL column list (PostgreSQL 15+ syntax)
-- so only the entity reference column is nulled, never user_id.
--
-- NOT VALID NOTE (same rationale as 013):
-- NOT VALID skips validation of existing rows; client code prevents orphaned
-- references and any that exist are a data-integrity, not security, concern.
--
-- @see supabase/migrations/013_composite_primary_keys.sql (original FKs)
-- ============================================================================

-- Prevent indefinite lock wait - fail fast after 30 seconds
SET lock_timeout = '30s';

BEGIN;

-- Games -> seasons
ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_season_fkey;
ALTER TABLE games
  ADD CONSTRAINT games_season_fkey
  FOREIGN KEY (user_id, season_id) REFERENCES seasons(user_id, id)
  ON DELETE SET NULL (season_id)
  NOT VALID;

-- Games -> tournaments
ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_tournament_fkey;
ALTER TABLE games
  ADD CONSTRAINT games_tournament_fkey
  FOREIGN KEY (user_id, tournament_id) REFERENCES tournaments(user_id, id)
  ON DELETE SET NULL (tournament_id)
  NOT VALID;

-- Games -> teams
ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_team_fkey;
ALTER TABLE games
  ADD CONSTRAINT games_team_fkey
  FOREIGN KEY (user_id, team_id) REFERENCES teams(user_id, id)
  ON DELETE SET NULL (team_id)
  NOT VALID;

-- Player adjustments -> seasons
ALTER TABLE player_adjustments
  DROP CONSTRAINT IF EXISTS player_adjustments_season_fkey;
ALTER TABLE player_adjustments
  ADD CONSTRAINT player_adjustments_season_fkey
  FOREIGN KEY (user_id, season_id) REFERENCES seasons(user_id, id)
  ON DELETE SET NULL (season_id)
  NOT VALID;

-- Player adjustments -> tournaments
ALTER TABLE player_adjustments
  DROP CONSTRAINT IF EXISTS player_adjustments_tournament_fkey;
ALTER TABLE player_adjustments
  ADD CONSTRAINT player_adjustments_tournament_fkey
  FOREIGN KEY (user_id, tournament_id) REFERENCES tournaments(user_id, id)
  ON DELETE SET NULL (tournament_id)
  NOT VALID;

COMMIT;

-- ============================================================================
-- VERIFICATION (run manually after applying):
--
-- 1. Confirm the SET NULL column lists (confdelsetcols non-empty):
--    SELECT conname, confdeltype, confdelsetcols
--    FROM pg_constraint
--    WHERE conname IN (
--      'games_season_fkey', 'games_tournament_fkey', 'games_team_fkey',
--      'player_adjustments_season_fkey', 'player_adjustments_tournament_fkey'
--    );
--    -- confdeltype = 'n', confdelsetcols should list ONE attnum each
--
-- 2. Behavioral check with a throwaway user (in a transaction, then ROLLBACK):
--    INSERT a season, a game referencing it, DELETE the season
--    -> expect: delete succeeds, game.season_id IS NULL, game.user_id intact
-- ============================================================================
