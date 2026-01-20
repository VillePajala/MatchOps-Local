-- ============================================================================
-- Fix Composite Uniqueness Constraints
-- ============================================================================
-- The original schema used simple UNIQUE(user_id, name) constraints, but the
-- app allows duplicate names when context differs (season binding, game type, etc.)
--
-- Example valid data that the old constraints would reject:
--   - Team "Eagles" bound to Season A
--   - Team "Eagles" bound to Season B  <-- REJECTED by UNIQUE(user_id, name)
--
-- The app enforces composite uniqueness at the application level:
--   - Teams: name + boundSeasonId + boundTournamentId + boundTournamentSeriesId + gameType
--   - Seasons: name + clubSeason + gameType + gender + ageGroup + leagueId
--   - Tournaments: name + clubSeason + gameType + gender + ageGroup
--
-- This migration removes the overly restrictive database constraints.
-- App-level validation in SupabaseDataStore handles the correct composite checks.
--
-- @see src/datastore/LocalDataStore.ts - createTeamCompositeKey, createSeasonCompositeKey, createTournamentCompositeKey
-- @see src/datastore/SupabaseDataStore.ts - Rule #6 composite uniqueness checks
-- ============================================================================

-- Drop the overly restrictive unique constraints
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_name_user_unique;
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_name_user_unique;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_name_user_unique;

-- Note: personnel constraint is kept - personnel names should be unique per user
-- (no context bindings like teams/seasons/tournaments have)
