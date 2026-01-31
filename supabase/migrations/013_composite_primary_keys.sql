-- ============================================================================
-- COMPOSITE PRIMARY KEY MIGRATION
-- Changes tables from PRIMARY KEY (id) to PRIMARY KEY (user_id, id)
-- ============================================================================
--
-- PURPOSE:
-- Enables same entity IDs to exist for different users (backup sharing).
-- Example: User A and User B can both have player_123 without conflict.
--
-- TABLES MIGRATED (13 tables):
-- - players, teams, seasons, tournaments, personnel, games
-- - game_events, game_players, game_tactical_data, player_assessments
-- - player_adjustments, warmup_plans, team_players
--
-- TABLES NOT MIGRATED:
-- - user_settings: Already has user_id as sole PRIMARY KEY (1:1 with user)
-- - user_consents: user_id can be NULL for GDPR retention (cannot be part of PK)
-- - subscriptions: Uses UUID primary key, has UNIQUE(user_id), billing not user content
--
-- DEPLOYMENT ORDER (see README.md for full details):
-- Scenario 1 (initial deployment, no users): Migrations first, then client
-- Scenario 2 (production with active users): Client first, then migrations
--
-- For Scenario 2:
-- 1. Deploy client code first (handles both old and new schemas)
--    - Client uses RPC save_game_with_relations (schema-agnostic)
--    - Client queries use RLS which adds user_id filter automatically
-- 2. Run this migration on STAGING during low-traffic window
-- 3. Verify on staging (see __tests__/013_014_composite_keys.verification.sql)
-- 4. Run this migration on PRODUCTION during low-traffic window
-- See docs/03-active-plans/user-scoped-storage-plan-v2.md Section 2.2.2
--
-- ROLLBACK:
-- See Section 7.1 of user-scoped-storage-plan-v2.md for rollback script
--
-- DOWNTIME NOTE:
-- ALTER TABLE ... DROP/ADD PRIMARY KEY acquires ACCESS EXCLUSIVE lock.
-- Estimate ~1-2 seconds write unavailability per table (13 tables total).
-- Schedule during low-traffic window for production with active users.
-- Impact: Low for initial release (no production data yet).
--
-- NOT VALID NOTE:
-- Nullable FKs use NOT VALID to allow NULL values without validation errors.
-- Existing orphaned data (e.g., game with non-existent season_id) will persist.
-- Client code prevents this; it's a data integrity issue, not security.
--
-- ============================================================================

-- PRE-MIGRATION CHECK (run BEFORE this migration to avoid lock waits):
-- SELECT pid, usename, state, query_start, query
-- FROM pg_stat_activity
-- WHERE datname = current_database() AND state != 'idle' AND pid != pg_backend_pid();
-- If any long-running queries (>30s), coordinate to clear them first.

-- Prevent indefinite lock wait - fail fast after 30 seconds
SET lock_timeout = '30s';

BEGIN;

-- ============================================================================
-- STEP 1: Drop all foreign keys referencing tables we're modifying
-- ============================================================================

-- Game child tables → games
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_game_id_fkey;
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_game_id_fkey;
ALTER TABLE game_tactical_data DROP CONSTRAINT IF EXISTS game_tactical_data_game_id_fkey;
ALTER TABLE player_assessments DROP CONSTRAINT IF EXISTS player_assessments_game_id_fkey;

-- Games → seasons, tournaments, teams
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_season_id_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_tournament_id_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_team_id_fkey;

-- Player adjustments → seasons, tournaments
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_season_id_fkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_tournament_id_fkey;

-- Team players → teams
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_team_id_fkey;

-- Drop composite FK constraints if they exist
-- (Handles case where migration was partially applied or re-run for idempotency)
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_game_fkey;
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_game_fkey;
ALTER TABLE game_tactical_data DROP CONSTRAINT IF EXISTS game_tactical_data_game_fkey;
ALTER TABLE player_assessments DROP CONSTRAINT IF EXISTS player_assessments_game_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_season_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_tournament_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_team_fkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_season_fkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_tournament_fkey;
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_team_fkey;

-- ============================================================================
-- STEP 2: Drop existing primary keys
-- ============================================================================

ALTER TABLE players DROP CONSTRAINT IF EXISTS players_pkey;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_pkey;
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_pkey;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_pkey;
ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_pkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_pkey;
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_pkey;
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_pkey;
ALTER TABLE game_tactical_data DROP CONSTRAINT IF EXISTS game_tactical_data_pkey;
ALTER TABLE player_assessments DROP CONSTRAINT IF EXISTS player_assessments_pkey;
ALTER TABLE player_adjustments DROP CONSTRAINT IF EXISTS player_adjustments_pkey;
ALTER TABLE warmup_plans DROP CONSTRAINT IF EXISTS warmup_plans_pkey;
ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_pkey;

-- Drop unique index if exists (may be created implicitly by UNIQUE constraint)
DROP INDEX IF EXISTS game_tactical_data_game_id_key;
-- Drop the UNIQUE constraint on game_tactical_data.game_id
-- Note: This is intentionally NOT recreated because the new composite PRIMARY KEY
-- (user_id, game_id) already enforces uniqueness for this user/game combination.
-- The original UNIQUE(game_id) was for global uniqueness which is no longer needed.
ALTER TABLE game_tactical_data DROP CONSTRAINT IF EXISTS game_tactical_data_game_id_key;

-- ============================================================================
-- STEP 3: Add composite primary keys
-- ============================================================================

ALTER TABLE players ADD PRIMARY KEY (user_id, id);
ALTER TABLE teams ADD PRIMARY KEY (user_id, id);
ALTER TABLE seasons ADD PRIMARY KEY (user_id, id);
ALTER TABLE tournaments ADD PRIMARY KEY (user_id, id);
ALTER TABLE personnel ADD PRIMARY KEY (user_id, id);
ALTER TABLE games ADD PRIMARY KEY (user_id, id);
ALTER TABLE game_events ADD PRIMARY KEY (user_id, id);
ALTER TABLE game_players ADD PRIMARY KEY (user_id, id);
-- game_tactical_data: Uses game_id as identifier (1:1 with game)
ALTER TABLE game_tactical_data ADD PRIMARY KEY (user_id, game_id);
ALTER TABLE player_assessments ADD PRIMARY KEY (user_id, id);
ALTER TABLE player_adjustments ADD PRIMARY KEY (user_id, id);
ALTER TABLE warmup_plans ADD PRIMARY KEY (user_id, id);
-- team_players: id format is {team_id}_{player_id}
ALTER TABLE team_players ADD PRIMARY KEY (user_id, id);

-- ============================================================================
-- STEP 4: Add composite foreign keys
-- ============================================================================

-- Game child tables → games
ALTER TABLE game_events
  ADD CONSTRAINT game_events_game_fkey
  FOREIGN KEY (user_id, game_id) REFERENCES games(user_id, id) ON DELETE CASCADE;

ALTER TABLE game_players
  ADD CONSTRAINT game_players_game_fkey
  FOREIGN KEY (user_id, game_id) REFERENCES games(user_id, id) ON DELETE CASCADE;

ALTER TABLE game_tactical_data
  ADD CONSTRAINT game_tactical_data_game_fkey
  FOREIGN KEY (user_id, game_id) REFERENCES games(user_id, id) ON DELETE CASCADE;

ALTER TABLE player_assessments
  ADD CONSTRAINT player_assessments_game_fkey
  FOREIGN KEY (user_id, game_id) REFERENCES games(user_id, id) ON DELETE CASCADE;

-- Games → seasons, tournaments, teams (nullable FKs)
-- NOT VALID: Don't validate existing data (allows NULL values in FK columns)
ALTER TABLE games
  ADD CONSTRAINT games_season_fkey
  FOREIGN KEY (user_id, season_id) REFERENCES seasons(user_id, id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE games
  ADD CONSTRAINT games_tournament_fkey
  FOREIGN KEY (user_id, tournament_id) REFERENCES tournaments(user_id, id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE games
  ADD CONSTRAINT games_team_fkey
  FOREIGN KEY (user_id, team_id) REFERENCES teams(user_id, id) ON DELETE SET NULL
  NOT VALID;

-- Player adjustments → seasons, tournaments
ALTER TABLE player_adjustments
  ADD CONSTRAINT player_adjustments_season_fkey
  FOREIGN KEY (user_id, season_id) REFERENCES seasons(user_id, id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE player_adjustments
  ADD CONSTRAINT player_adjustments_tournament_fkey
  FOREIGN KEY (user_id, tournament_id) REFERENCES tournaments(user_id, id) ON DELETE SET NULL
  NOT VALID;

-- Team players → teams
-- NOTE: No FK to players table - INTENTIONAL DESIGN DECISION
-- Reason: Graceful degradation when players are deleted
-- Behavior: UI shows last known name via snapshot stored in team_players.name
-- Trade-off: Orphaned player_id references are acceptable for UX
-- See supabase-schema.md "Intentionally No Foreign Keys" section
ALTER TABLE team_players
  ADD CONSTRAINT team_players_team_fkey
  FOREIGN KEY (user_id, team_id) REFERENCES teams(user_id, id) ON DELETE CASCADE;

COMMIT;
