-- ============================================================================
-- VERIFICATION TESTS FOR MIGRATION 038 (planning_sessions.parent_session_id)
-- ============================================================================
--
-- PURPOSE: Verify the parent_session_id column exists with the expected
--          shape (text, nullable, default NULL) and that the supporting
--          partial index is in place.
-- WHEN TO RUN: After deploying 038 to STAGING, before production cutover.
-- HOW TO RUN: Execute in Supabase Dashboard > SQL Editor (service role).
--
-- EXPECTED: All assertions should print "OK". Any failure means the
--           migration did not produce the documented column / index state.
-- IF ANY FAIL: Do NOT proceed to production. Investigate and fix.
--
-- Why this column matters: SupabaseDataStore.transformPlanningSessionFromDb
-- reads parent_session_id and maps it to PlanningSession.parentSessionId.
-- Without 038 the cast yields undefined for every row, silently dropping
-- the named-version → parent linkage on every cloud read. The named
-- versions UI relies on this linkage to load child sessions for a parent.
-- ============================================================================

-- A. Column exists with the expected shape (text, nullable, no default).
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
    AND column_name = 'parent_session_id';

  IF v_data_type IS NULL THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.parent_session_id column does not exist';
  END IF;
  IF v_data_type <> 'text' THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.parent_session_id data_type = %, expected text', v_data_type;
  END IF;
  IF v_is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.parent_session_id is_nullable = %, expected YES (NULL = "top-level parent")', v_is_nullable;
  END IF;
  -- column_default is expected to be NULL (no DEFAULT clause); accept
  -- either a missing default or an explicit NULL default.
  RAISE NOTICE 'OK: planning_sessions.parent_session_id exists as nullable text';
END $$;

-- B. Supporting partial index exists with the expected definition.
DO $$
DECLARE
  v_indexdef text;
BEGIN
  SELECT pg_get_indexdef(c.oid)
  INTO v_indexdef
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'idx_planning_sessions_parent'
    AND n.nspname = 'public';

  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'FAIL: index idx_planning_sessions_parent does not exist';
  END IF;
  -- Match column order via positional regex: ensures user_id comes
  -- before parent_session_id within the parenthesised column list.
  -- A bare LIKE '%user_id%parent_session_id%' would also match a
  -- malformed index that mentioned both columns in any context (e.g.
  -- a comment or a different bracket nesting).
  IF v_indexdef !~ '\([^)]*user_id[^)]*,[^)]*parent_session_id[^)]*\)' THEN
    RAISE EXCEPTION 'FAIL: idx_planning_sessions_parent column order = %, expected (user_id, parent_session_id)', v_indexdef;
  END IF;
  IF v_indexdef NOT LIKE '%WHERE%parent_session_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'FAIL: idx_planning_sessions_parent missing partial-index WHERE clause; got %', v_indexdef;
  END IF;
  RAISE NOTICE 'OK: idx_planning_sessions_parent exists with correct definition';
END $$;

-- C. Insert + read round-trip — NULL → "top-level parent".
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_id  text := 'verify_038_parent_' || extract(epoch from now())::bigint;
  v_read text;
BEGIN
  INSERT INTO planning_sessions (
    id, user_id, team_id, name, draft, game_ids, is_active
  ) VALUES (
    v_id, v_uid, 'team_verify', 'Verify 038 parent', '{}'::jsonb, ARRAY['g1', 'g2'], false
  );
  SELECT parent_session_id INTO v_read FROM planning_sessions
  WHERE user_id = v_uid AND id = v_id;
  IF v_read IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: parent_session_id defaulted to %, expected NULL', v_read;
  END IF;
  DELETE FROM planning_sessions WHERE user_id = v_uid AND id = v_id;
  RAISE NOTICE 'OK: insert without parent_session_id produces NULL (top-level parent)';
END $$;

-- D. Insert + read round-trip — child session points at a parent.
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  -- Random UUIDs (vs. epoch-based suffixes) so test D is immune to
  -- clock skew, sub-second re-runs, and confused operators reading
  -- "why two tests have the same suffix".
  v_parent_id text := 'verify_038_p_' || gen_random_uuid()::text;
  v_child_id  text := 'verify_038_c_' || gen_random_uuid()::text;
  v_read text;
BEGIN
  INSERT INTO planning_sessions (
    id, user_id, team_id, name, draft, game_ids, is_active
  ) VALUES (
    v_parent_id, v_uid, 'team_verify', 'Verify 038 parent', '{}'::jsonb, ARRAY['g1', 'g2'], false
  );
  INSERT INTO planning_sessions (
    id, user_id, team_id, name, draft, game_ids, is_active, parent_session_id
  ) VALUES (
    v_child_id, v_uid, 'team_verify', 'Verify 038 child',
    '{}'::jsonb, ARRAY['g1', 'g2'], false, v_parent_id
  );
  SELECT parent_session_id INTO v_read FROM planning_sessions
  WHERE user_id = v_uid AND id = v_child_id;
  IF v_read IS DISTINCT FROM v_parent_id THEN
    RAISE EXCEPTION 'FAIL: child round-trip lost parent pointer, got %', v_read;
  END IF;
  DELETE FROM planning_sessions WHERE user_id = v_uid AND id IN (v_parent_id, v_child_id);
  RAISE NOTICE 'OK: child session round-trips parent_session_id correctly';
END $$;

-- E. INFO — pre-existing child rows count.
-- This is NOT a hard assertion: post-migration application traffic
-- may legitimately create child sessions. We just log the count so
-- an operator running verification on a fresh staging deployment
-- can sanity-check the additive migration didn't backfill anything.
-- (Hard assertion would require a separate "fresh deployment" mode
-- the verification script doesn't currently distinguish.)
DO $$
DECLARE
  v_non_null_count integer;
BEGIN
  SELECT count(*)
  INTO v_non_null_count
  FROM planning_sessions
  WHERE parent_session_id IS NOT NULL
    AND id NOT LIKE 'verify_038_%';
  RAISE NOTICE 'INFO: % rows have non-NULL parent_session_id (non-verify rows)', v_non_null_count;
END $$;

-- ============================================================================
-- All checks passed if you got here without RAISE EXCEPTION.
-- ============================================================================
