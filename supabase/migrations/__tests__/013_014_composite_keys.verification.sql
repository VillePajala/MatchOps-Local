-- ============================================================================
-- VERIFICATION TESTS FOR MIGRATIONS 013-014 (Composite Primary Keys)
-- ============================================================================
--
-- PURPOSE: Verify composite key enforcement, cascade behavior, and security
-- WHEN TO RUN: After deploying 013 and 014 to STAGING, before production
-- HOW TO RUN: Execute in Supabase Dashboard > SQL Editor
--
-- EXPECTED: All tests should pass (see expected results in comments)
-- IF ANY FAIL: Do NOT proceed to production. Investigate and fix.
--
-- ============================================================================

-- ============================================================================
-- PRE-MIGRATION CHECKS (Run BEFORE applying migrations 013-014)
-- ============================================================================
-- Skip this section if migrations are already applied.

-- A. Verify current PK constraint names match expected
-- \d games | grep PRIMARY   (or use query below)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'games'::regclass AND contype = 'p';
-- EXPECTED (before migration): games_pkey with PRIMARY KEY (id)
-- EXPECTED (after migration): games_pkey with PRIMARY KEY (user_id, id)

-- B. Check for existing ID collisions across users (should return 0 rows)
-- If any rows returned, investigate before migration!
SELECT id, COUNT(DISTINCT user_id) as user_count
FROM games
GROUP BY id
HAVING COUNT(DISTINCT user_id) > 1;
-- EXPECTED: 0 rows (no ID collisions exist in current data)

-- C. Check existing data volume (for migration timing estimate)
SELECT
  (SELECT COUNT(*) FROM games) as games,
  (SELECT COUNT(*) FROM players) as players,
  (SELECT COUNT(*) FROM game_events) as events,
  (SELECT COUNT(*) FROM game_players) as game_players;
-- INFO: Large tables may take longer to migrate

-- ============================================================================
-- SETUP: Create test users (use service role or bypass RLS temporarily)
-- ============================================================================
--
-- HOW TO RUN THIS SCRIPT:
--
-- Supabase Dashboard SQL Editor:
--   - Automatically runs as service role (bypasses RLS)
--   - No additional setup needed
--
-- psql locally (if connected directly to database):
--   SET ROLE postgres;  -- Bypass RLS
--   [run tests]
--   RESET ROLE;         -- Restore normal role
--
-- ============================================================================

-- Note: These UUIDs are for testing only. In production, auth.uid() provides real UUIDs.
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
BEGIN
  RAISE NOTICE 'Test User A: %', v_user_a;
  RAISE NOTICE 'Test User B: %', v_user_b;
END $$;

-- ============================================================================
-- TEST 1: Composite Key Enforcement - Same ID for Different Users
-- ============================================================================
-- CRITICAL: This is the core feature that enables backup sharing

-- 1a. Insert same player ID for two different users
INSERT INTO players (user_id, id, name, jersey_number, position, created_at, updated_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_player_same_id', 'User A Player', '10', 'forward', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'test_player_same_id', 'User B Player', '10', 'forward', now(), now());
-- EXPECTED: Success (no constraint violation)

-- 1b. Verify both records exist
SELECT user_id, id, name FROM players WHERE id = 'test_player_same_id' ORDER BY user_id;
-- EXPECTED: 2 rows with different user_ids and names

-- 1c. Verify constraint prevents duplicate (user_id, id) pair
-- This should FAIL with unique constraint violation:
-- INSERT INTO players (user_id, id, name, jersey_number, position, created_at, updated_at)
-- VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_player_same_id', 'Duplicate', '99', 'defender', now(), now());
-- EXPECTED: ERROR: duplicate key value violates unique constraint "players_pkey"

-- ============================================================================
-- TEST 2: Foreign Key Cascade Behavior - Game Deletion
-- ============================================================================
-- CRITICAL: Child records must be deleted when parent game is deleted

-- 2a. Create test game for User A
INSERT INTO games (user_id, id, team_name, opponent_name, game_date, version, created_at, updated_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_cascade_game', 'Test Team', 'Test Opponent', '2025-01-01', 1, now(), now());

-- 2b. Create child records
INSERT INTO game_events (user_id, id, game_id, event_type, time_seconds, order_index, created_at, updated_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_cascade_event', 'test_cascade_game', 'goal', 300, 0, now(), now());

INSERT INTO game_players (user_id, id, game_id, player_id, jersey_number, is_selected, on_field, created_at, updated_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_cascade_player', 'test_cascade_game', 'test_player_same_id', '10', true, true, now(), now());

INSERT INTO game_tactical_data (user_id, game_id, created_at, updated_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_cascade_game', now(), now());

INSERT INTO player_assessments (user_id, id, game_id, player_id, created_at, updated_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_cascade_assessment', 'test_cascade_game', 'test_player_same_id', now(), now());

-- 2c. Verify child records exist
SELECT 'game_events' AS table_name, COUNT(*) AS count FROM game_events WHERE game_id = 'test_cascade_game'
UNION ALL
SELECT 'game_players', COUNT(*) FROM game_players WHERE game_id = 'test_cascade_game'
UNION ALL
SELECT 'game_tactical_data', COUNT(*) FROM game_tactical_data WHERE game_id = 'test_cascade_game'
UNION ALL
SELECT 'player_assessments', COUNT(*) FROM player_assessments WHERE game_id = 'test_cascade_game';
-- EXPECTED: All counts = 1

-- 2d. Delete parent game
DELETE FROM games WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND id = 'test_cascade_game';

-- 2e. Verify cascade deletion
SELECT 'game_events' AS table_name, COUNT(*) AS count FROM game_events WHERE game_id = 'test_cascade_game'
UNION ALL
SELECT 'game_players', COUNT(*) FROM game_players WHERE game_id = 'test_cascade_game'
UNION ALL
SELECT 'game_tactical_data', COUNT(*) FROM game_tactical_data WHERE game_id = 'test_cascade_game'
UNION ALL
SELECT 'player_assessments', COUNT(*) FROM player_assessments WHERE game_id = 'test_cascade_game';
-- EXPECTED: All counts = 0 (CASCADE delete worked)

-- ============================================================================
-- TEST 3: Version SELECT Security - User Isolation in RPC
-- ============================================================================
-- CRITICAL: save_game_with_relations must use user-scoped version lookup

-- 3a. Create games with same ID for both users, different versions
INSERT INTO games (user_id, id, team_name, opponent_name, game_date, version, created_at, updated_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_version_game', 'User A Team', 'Opponent A', '2025-01-01', 5, now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'test_version_game', 'User B Team', 'Opponent B', '2025-01-01', 10, now(), now());

-- 3b. Verify both exist with different versions
SELECT user_id, id, team_name, version FROM games WHERE id = 'test_version_game' ORDER BY user_id;
-- EXPECTED:
--   User A: version = 5
--   User B: version = 10

-- 3c. Verify RPC function definition includes user-scoped SELECT
-- Look for: "WHERE user_id = v_user_id AND id = v_game_id"
SELECT substring(pg_get_functiondef(oid) from 'SELECT version INTO v_current_version[^;]+;') AS version_select
FROM pg_proc
WHERE proname = 'save_game_with_relations';
-- EXPECTED: Should include "WHERE user_id = v_user_id AND id = v_game_id"
-- If only "WHERE id = v_game_id" is shown, migration 014 was NOT applied correctly!

-- 3d. Functional test: save_game_with_relations updates correct user's game
-- ============================================================================
-- HOW TO RUN TEST 3d (User Isolation Verification)
-- ============================================================================
--
-- OPTION A: Via Client Application (RECOMMENDED)
-- 1. Deploy migrations 013-014 to staging
-- 2. Create two test users (userA@test.com, userB@test.com)
-- 3. Sign in as User A, create game with specific ID (e.g., 'isolation-test')
-- 4. Sign in as User B, create game with SAME ID ('isolation-test')
-- 5. Sign in as User A, save/update their game
-- 6. Verify: User A's version incremented, User B's version unchanged
--    (Check Supabase Dashboard: SELECT user_id, version FROM games WHERE id = 'isolation-test')
--
-- OPTION B: Via Supabase Dashboard SQL Editor
-- The Dashboard runs as service role (bypasses RLS), so you cannot directly
-- test auth.uid() behavior. Use Option A for definitive security verification.
--
-- OPTION C: Via psql with JWT simulation (Advanced)
-- SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
-- SELECT save_game_with_relations(...);
-- (Note: This may not work depending on Supabase version/config)
--
-- ============================================================================
-- NOTE: This test requires auth context. Run as authenticated User A.
-- Setup: Both users have game 'test_version_game' (from 3a above)
--   User A: version = 5
--   User B: version = 10
--
-- Test (run as User A):
-- SELECT save_game_with_relations(
--   '{"id": "test_version_game", "team_name": "Updated by A", "opponent_name": "Test"}'::jsonb,
--   ARRAY[]::jsonb[],
--   ARRAY[]::jsonb[],
--   ARRAY[]::jsonb[],
--   NULL,
--   5  -- User A's expected version
-- );
-- EXPECTED: Returns 6 (User A's version incremented)
--
-- Verify User B's version unchanged:
-- SELECT user_id, version FROM games WHERE id = 'test_version_game' ORDER BY user_id;
-- EXPECTED:
--   User A: version = 6 (updated)
--   User B: version = 10 (unchanged - RPC only affected User A's row)

-- ============================================================================
-- TEST 4: Composite Foreign Keys - Nullable References
-- ============================================================================
-- Games can reference seasons/tournaments/teams that may be NULL

-- 4a. Create a game with NULL references (no season, tournament, or team)
INSERT INTO games (user_id, id, team_name, opponent_name, game_date, version,
  season_id, tournament_id, team_id, created_at, updated_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_null_refs_game', 'Friendly Team', 'Friendly Opponent',
  '2025-01-01', 1, NULL, NULL, NULL, now(), now());
-- EXPECTED: Success (NULL FKs are allowed via NOT VALID)

-- 4b. Create season and update game to reference it
INSERT INTO seasons (user_id, id, name, start_date, end_date, created_at, updated_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_season', 'Test Season 2025', '2025-01-01', '2025-12-31', now(), now());

UPDATE games
SET season_id = 'test_season'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND id = 'test_null_refs_game';
-- EXPECTED: Success

-- 4c. Verify FK constraint works (cannot reference non-existent season)
-- This should FAIL:
-- UPDATE games
-- SET season_id = 'nonexistent_season'
-- WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND id = 'test_null_refs_game';
-- EXPECTED: ERROR: insert or update on table "games" violates foreign key constraint

-- 4d. Verify ON DELETE SET NULL works
DELETE FROM seasons WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND id = 'test_season';

SELECT season_id FROM games
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND id = 'test_null_refs_game';
-- EXPECTED: season_id = NULL (SET NULL worked)

-- ============================================================================
-- TEST 5: Primary Key Structure Verification
-- ============================================================================

-- 5a. Verify all 13 tables have composite PKs
SELECT tc.table_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS pk_columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'players', 'teams', 'seasons', 'tournaments', 'personnel', 'games',
    'game_events', 'game_players', 'game_tactical_data', 'player_assessments',
    'player_adjustments', 'warmup_plans', 'team_players'
  )
GROUP BY tc.table_name
ORDER BY tc.table_name;
-- EXPECTED: All 13 tables should show "user_id, id" (or "user_id, game_id" for game_tactical_data)

-- ============================================================================
-- TEST 6: RLS Policy Compatibility
-- ============================================================================
-- Verify RLS policies still work with composite PKs (they should - RLS is independent)

-- 6a. Verify RLS is enabled on all 13 tables with composite PKs
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'players', 'teams', 'seasons', 'tournaments', 'personnel', 'games',
    'game_events', 'game_players', 'game_tactical_data', 'player_assessments',
    'player_adjustments', 'warmup_plans', 'team_players'
  )
ORDER BY tablename;
-- EXPECTED: All 13 tables show rowsecurity = true

-- 6b. Verify RLS policies exist and use correct pattern
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'players', 'teams', 'seasons', 'tournaments', 'personnel', 'games',
    'game_events', 'game_players', 'game_tactical_data', 'player_assessments',
    'player_adjustments', 'warmup_plans', 'team_players'
  )
ORDER BY tablename;
-- EXPECTED: All policies show qual containing "auth.uid() = user_id"
-- RLS uses user_id COLUMN, not primary key, so composite PK change doesn't affect it

-- 6c. RLS isolation test: User A cannot query User B's data
-- NOTE: This test requires running as an authenticated user (not service role)
-- After test data setup above, run this as User A:
-- SELECT * FROM games WHERE user_id != auth.uid();
-- EXPECTED: 0 rows (RLS blocks access to other users' data)
-- If rows returned, RLS is NOT working correctly - DO NOT proceed!

-- ============================================================================
-- CLEANUP: Remove test data
-- ============================================================================

DELETE FROM players WHERE id = 'test_player_same_id';
DELETE FROM games WHERE id = 'test_version_game';
DELETE FROM games WHERE id = 'test_null_refs_game';

-- Verify cleanup
SELECT 'players' AS table_name, COUNT(*) FROM players WHERE id LIKE 'test_%'
UNION ALL
SELECT 'games', COUNT(*) FROM games WHERE id LIKE 'test_%';
-- EXPECTED: All counts = 0

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- If all tests pass:
--   ✅ Composite primary keys are correctly enforced
--   ✅ Foreign key cascades work correctly
--   ✅ User isolation is enforced in RPC function
--   ✅ Nullable foreign keys work with NOT VALID
--   ✅ RLS policies compatible with composite PKs
--   ✅ Safe to proceed to production deployment
--
-- If any test fails:
--   ❌ Do NOT deploy to production
--   ❌ Investigate the failure
--   ❌ Check if migrations 013 and 014 were applied in correct order
--   ❌ See rollback script in user-scoped-storage-plan-v2.md Section 7.1
--
-- ============================================================================
