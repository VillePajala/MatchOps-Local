-- ============================================================================
-- VERIFICATION TESTS FOR MIGRATIONS 035-036 (planning_sessions composite PK
--                                            + setActive RPC hardening)
-- ============================================================================
--
-- PURPOSE: Verify the composite PK is in place, the old single-column index
--          is dropped, and the set_active_planning_session RPC body carries
--          the canonicalize / cap / FOR UPDATE invariants from migration 036.
-- WHEN TO RUN: After deploying 035 + 036 to STAGING, before production.
-- HOW TO RUN: Execute in Supabase Dashboard > SQL Editor (service role).
--
-- EXPECTED: All assertions should print "OK". Any failure means the migration
--           did not produce the documented schema/function state.
-- IF ANY FAIL: Do NOT proceed to production. Investigate and fix.
--
-- ============================================================================

-- ============================================================================
-- 035 — Composite primary key on (user_id, id)
-- ============================================================================

-- A. PK exists and is composite (user_id, id) in that order.
DO $$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(a.attname, ',' ORDER BY k.idx_pos)
  INTO v_columns
  FROM pg_index i
  JOIN unnest(i.indkey) WITH ORDINALITY AS k(colnum, idx_pos) ON true
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.colnum
  WHERE i.indrelid = 'public.planning_sessions'::regclass
    AND i.indisprimary;

  IF v_columns IS DISTINCT FROM 'user_id,id' THEN
    RAISE EXCEPTION 'FAIL: planning_sessions PK is %, expected (user_id,id)', v_columns;
  END IF;
  RAISE NOTICE 'OK: planning_sessions PK is (user_id, id)';
END $$;

-- B. Old single-column index idx_planning_sessions_user_id is gone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'idx_planning_sessions_user_id'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'FAIL: idx_planning_sessions_user_id still exists — migration 035 should have dropped it';
  END IF;
  RAISE NOTICE 'OK: idx_planning_sessions_user_id dropped';
END $$;

-- C. Composite PK accepts cross-user id collisions (the whole point of 035).
-- Insert two rows with the same id but different user_ids; both should succeed.
-- Run as service role; clean up at the end.
DO $$
DECLARE
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
BEGIN
  -- Bypass RLS via SECURITY DEFINER context isn't needed here; service role
  -- has bypass-rls in Supabase SQL editor.
  INSERT INTO planning_sessions (id, user_id, team_id, name, game_ids, draft, is_active)
  VALUES ('shared_id_test_035', v_user_a, 'team_a', 'plan A', ARRAY['g1'], '{}'::jsonb, false);
  INSERT INTO planning_sessions (id, user_id, team_id, name, game_ids, draft, is_active)
  VALUES ('shared_id_test_035', v_user_b, 'team_b', 'plan B', ARRAY['g2'], '{}'::jsonb, false);
  -- Cleanup
  DELETE FROM planning_sessions WHERE id = 'shared_id_test_035';
  RAISE NOTICE 'OK: composite PK accepts cross-user id collisions';
EXCEPTION
  WHEN unique_violation THEN
    DELETE FROM planning_sessions WHERE id = 'shared_id_test_035';
    RAISE EXCEPTION 'FAIL: composite PK rejected cross-user id collision (still single-column?)';
END $$;

-- ============================================================================
-- 036 — set_active_planning_session hardening
-- ============================================================================

-- D. RPC body contains the size cap (max 100 game_ids).
DO $$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef('set_active_planning_session'::regproc)
  INTO v_body;
  IF v_body !~ 'too many game_ids' THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session missing the 100-entry cap (036)';
  END IF;
  RAISE NOTICE 'OK: RPC body carries the game_ids size cap';
END $$;

-- E. RPC body contains the dedupe/sort canonicalization step.
DO $$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef('set_active_planning_session'::regproc)
  INTO v_body;
  IF v_body !~ 'array_agg\s*\(\s*DISTINCT' THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session missing canonical_game_ids dedupe (036)';
  END IF;
  RAISE NOTICE 'OK: RPC body canonicalizes game_ids before scope match';
END $$;

-- F. RPC body contains the FOR UPDATE row lock.
DO $$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef('set_active_planning_session'::regproc)
  INTO v_body;
  IF v_body !~ 'FOR UPDATE' THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session missing FOR UPDATE row lock (036)';
  END IF;
  RAISE NOTICE 'OK: RPC body locks in-scope rows with FOR UPDATE';
END $$;

-- G. Defensive: SECURITY DEFINER and search_path are still set.
DO $$
DECLARE
  v_security_definer boolean;
  v_search_path text;
BEGIN
  SELECT prosecdef, array_to_string(proconfig, ',')
  INTO v_security_definer, v_search_path
  FROM pg_proc
  WHERE oid = 'set_active_planning_session'::regproc;

  IF NOT v_security_definer THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session lost SECURITY DEFINER (036)';
  END IF;
  IF v_search_path IS NULL OR v_search_path !~ 'search_path=public' THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session lost search_path lock (036)';
  END IF;
  RAISE NOTICE 'OK: RPC retains SECURITY DEFINER + search_path';
END $$;

-- H. Defensive: GRANT EXECUTE TO authenticated still in place.
DO $$
DECLARE
  v_authenticated_can_execute boolean;
BEGIN
  v_authenticated_can_execute := has_function_privilege(
    'authenticated',
    'set_active_planning_session(text,text,text[])',
    'execute'
  );
  IF NOT v_authenticated_can_execute THEN
    RAISE EXCEPTION 'FAIL: authenticated role cannot execute set_active_planning_session';
  END IF;
  RAISE NOTICE 'OK: authenticated role retains EXECUTE on the RPC';
END $$;

-- ============================================================================
-- Done.
-- ============================================================================
