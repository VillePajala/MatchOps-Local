-- ============================================================================
-- VERIFICATION TESTS FOR MIGRATION 037 (planning_sessions.included_game_ids)
-- ============================================================================
--
-- PURPOSE: Verify the included_game_ids column exists with the expected
--          shape (text[], nullable, default NULL) and that existing rows
--          carry NULL — the "all included" semantic the app reads.
-- WHEN TO RUN: After deploying 037 to STAGING, before production cutover.
-- HOW TO RUN: Execute in Supabase Dashboard > SQL Editor (service role).
--
-- EXPECTED: All assertions should print "OK". Any failure means the
--           migration did not produce the documented column state.
-- IF ANY FAIL: Do NOT proceed to production. Investigate and fix.
--
-- Why this column matters: SupabaseDataStore.transformPlanningSessionFromDb
-- reads `included_game_ids` and maps it to PlanningSession.includedGameIds.
-- Without 037 the cast yields undefined for every row, silently dropping
-- per-game include flags on every cloud read. Migration 037 is in the
-- mandatory cutover checklist (PR #404) — this file locks the contract.
-- ============================================================================

-- A. Column exists with the expected shape.
DO $$
DECLARE
  v_data_type     text;
  v_is_nullable   text;
  v_column_default text;
BEGIN
  SELECT data_type, is_nullable, column_default
  INTO v_data_type, v_is_nullable, v_column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'planning_sessions'
    AND column_name = 'included_game_ids';

  IF v_data_type IS NULL THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.included_game_ids column does not exist';
  END IF;
  IF v_data_type <> 'ARRAY' THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.included_game_ids data_type = %, expected ARRAY (text[])', v_data_type;
  END IF;
  IF v_is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.included_game_ids is_nullable = %, expected YES (NULL = "all included")', v_is_nullable;
  END IF;
  -- column_default may be NULL or '' depending on how the migration was
  -- written; either is acceptable as long as is_nullable = YES.
  RAISE NOTICE 'OK: planning_sessions.included_game_ids exists as nullable text[]';
END $$;

-- B. Element type is text (the app stores game id strings).
DO $$
DECLARE
  v_udt_name text;
BEGIN
  SELECT udt_name
  INTO v_udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'planning_sessions'
    AND column_name = 'included_game_ids';

  -- text[] surfaces as udt_name = '_text' in information_schema.
  IF v_udt_name <> '_text' THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.included_game_ids udt_name = %, expected _text (text[])', v_udt_name;
  END IF;
  RAISE NOTICE 'OK: planning_sessions.included_game_ids is text[]';
END $$;

-- C. Insert + read round-trip — NULL → "all included".
-- Uses an isolated transaction so the assertion never leaves rows behind.
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_id  text := 'verify_037_null_' || extract(epoch from now())::bigint;
  v_read text[];
BEGIN
  INSERT INTO planning_sessions (
    id, user_id, team_id, name, draft, game_ids, is_active
  ) VALUES (
    v_id, v_uid, 'team_verify', 'Verify 037 NULL', '{}'::jsonb, ARRAY['g1', 'g2'], false
  );
  SELECT included_game_ids INTO v_read FROM planning_sessions
  WHERE user_id = v_uid AND id = v_id;
  IF v_read IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: included_game_ids defaulted to %, expected NULL', v_read;
  END IF;
  DELETE FROM planning_sessions WHERE user_id = v_uid AND id = v_id;
  RAISE NOTICE 'OK: insert without included_game_ids produces NULL (all-included semantic)';
END $$;

-- D. Insert + read round-trip — explicit subset of game_ids.
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_id  text := 'verify_037_subset_' || extract(epoch from now())::bigint;
  v_read text[];
BEGIN
  INSERT INTO planning_sessions (
    id, user_id, team_id, name, draft, game_ids, included_game_ids, is_active
  ) VALUES (
    v_id, v_uid, 'team_verify', 'Verify 037 subset',
    '{}'::jsonb, ARRAY['g1', 'g2', 'g3'], ARRAY['g1', 'g3'], false
  );
  SELECT included_game_ids INTO v_read FROM planning_sessions
  WHERE user_id = v_uid AND id = v_id;
  IF v_read IS DISTINCT FROM ARRAY['g1', 'g3'] THEN
    RAISE EXCEPTION 'FAIL: round-trip lost subset, got %', v_read;
  END IF;
  DELETE FROM planning_sessions WHERE user_id = v_uid AND id = v_id;
  RAISE NOTICE 'OK: explicit subset round-trips through included_game_ids';
END $$;

-- E. Existing pre-migration rows (if any) should have NULL — additive
-- migration adds a nullable column without backfilling.
DO $$
DECLARE
  v_non_null_count integer;
BEGIN
  SELECT count(*)
  INTO v_non_null_count
  FROM planning_sessions
  WHERE included_game_ids IS NOT NULL
    -- Skip rows the verification script itself just inserted, which
    -- explicitly tested the non-NULL path. id prefix isolates them.
    AND id NOT LIKE 'verify_037_%';

  -- We cannot assert v_non_null_count = 0 in environments where the app
  -- has already run post-migration and saved sessions with explicit
  -- includes. Instead just log the count for operator review.
  RAISE NOTICE 'INFO: % rows have non-NULL included_game_ids (non-verify rows)', v_non_null_count;
END $$;

-- ============================================================================
-- All checks passed if you got here without RAISE EXCEPTION.
-- ============================================================================
