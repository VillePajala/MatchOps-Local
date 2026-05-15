-- ============================================================================
-- VERIFICATION TESTS FOR MIGRATION 039
--   set_active_planning_session parent-scope evolution
-- ============================================================================
--
-- PURPOSE: Verify the RPC carries the migration 036 invariants
--          (canonical gameIds, FOR UPDATE lock, 100-cap) AND the
--          new migration 039 parent-scope semantics:
--            - p_parent_session_id IS NULL → legacy (team, gameIds,
--              parent_session_id IS NULL) scope
--            - p_parent_session_id IS NOT NULL → siblings-of-parent
--              scope; team_id + gameIds are validated but not
--              part of the scope match
--            - empty-string p_parent_session_id is rejected
-- WHEN TO RUN: After deploying 039 to STAGING, before production cutover.
-- HOW TO RUN: Execute in Supabase Dashboard > SQL Editor (service role).
--
-- EXPECTED: All assertions should print "OK". Any failure means the
--           migration did not produce the documented function state.
-- IF ANY FAIL: Do NOT proceed to production. Investigate and fix.
-- ============================================================================

-- A. RPC exists with the new 4-arg signature.
DO $$
DECLARE
  v_sig text;
BEGIN
  SELECT pg_get_function_arguments(p.oid)::text
  INTO v_sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'set_active_planning_session'
    AND n.nspname = 'public'
    AND p.pronargs = 4;

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session 4-arg overload is missing';
  END IF;
  -- Defence-in-depth: require the new arg name to appear in the
  -- arguments list, otherwise we'd accept a 4-arg overload with the
  -- wrong final parameter (e.g. an unrelated future migration).
  IF v_sig NOT LIKE '%p_parent_session_id%' THEN
    RAISE EXCEPTION 'FAIL: 4-arg overload exists but missing p_parent_session_id; got %', v_sig;
  END IF;
  RAISE NOTICE 'OK: set_active_planning_session 4-arg signature exists with p_parent_session_id';
END $$;

-- B. The function is SECURITY DEFINER with locked search_path.
DO $$
DECLARE
  v_secdef boolean;
  v_config text[];
BEGIN
  SELECT p.prosecdef, p.proconfig
  INTO v_secdef, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'set_active_planning_session'
    AND n.nspname = 'public'
    AND p.pronargs = 4;

  IF NOT v_secdef THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session is not SECURITY DEFINER';
  END IF;
  IF v_config IS NULL OR NOT (v_config @> ARRAY['search_path=public, pg_temp']) THEN
    RAISE EXCEPTION 'FAIL: search_path is not locked to (public, pg_temp); got %', v_config;
  END IF;
  RAISE NOTICE 'OK: SECURITY DEFINER + search_path locked';
END $$;

-- C. authenticated role has EXECUTE; anon does not.
DO $$
DECLARE
  v_authenticated_has boolean;
  v_anon_has boolean;
BEGIN
  SELECT
    has_function_privilege('authenticated', 'set_active_planning_session(text, text, text[], text)', 'EXECUTE'),
    has_function_privilege('anon', 'set_active_planning_session(text, text, text[], text)', 'EXECUTE')
  INTO v_authenticated_has, v_anon_has;

  IF NOT v_authenticated_has THEN
    RAISE EXCEPTION 'FAIL: authenticated role does not have EXECUTE on the 4-arg overload';
  END IF;
  IF v_anon_has THEN
    RAISE EXCEPTION 'FAIL: anon role unexpectedly has EXECUTE — REVOKE ALL FROM PUBLIC must run first';
  END IF;
  RAISE NOTICE 'OK: GRANT/REVOKE matrix correct (authenticated EXECUTE, anon denied)';
END $$;

-- D. Function body still contains the migration 036 invariants:
--    100-entry cap, dedup-via-DISTINCT-ORDER-BY, FOR UPDATE lock.
DO $$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'set_active_planning_session'
    AND n.nspname = 'public'
    AND p.pronargs = 4;

  IF v_body NOT LIKE '%array_length(p_game_ids, 1) > 100%' THEN
    RAISE EXCEPTION 'FAIL: 100-entry gameIds cap missing from function body';
  END IF;
  IF v_body NOT LIKE '%DISTINCT g ORDER BY g%' THEN
    RAISE EXCEPTION 'FAIL: dedup/sort canonicalization missing from function body';
  END IF;
  IF v_body NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'FAIL: FOR UPDATE lock missing from function body';
  END IF;
  IF v_body NOT LIKE '%IS NOT DISTINCT FROM p_session_id%' THEN
    RAISE EXCEPTION 'FAIL: NULL-safe activation predicate missing';
  END IF;
  RAISE NOTICE 'OK: 036 invariants (cap, dedup, FOR UPDATE, NULL-safe) preserved';
END $$;

-- E. Function body contains the new 039 parent-scope branches.
DO $$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'set_active_planning_session'
    AND n.nspname = 'public'
    AND p.pronargs = 4;

  IF v_body NOT LIKE '%parent_session_id = p_parent_session_id%' THEN
    RAISE EXCEPTION 'FAIL: parent-scope branch (parent_session_id = p_parent_session_id) missing';
  END IF;
  IF v_body NOT LIKE '%parent_session_id IS NULL%' THEN
    RAISE EXCEPTION 'FAIL: legacy-scope branch (parent_session_id IS NULL) missing';
  END IF;
  IF v_body NOT LIKE '%p_parent_session_id, when provided%' THEN
    RAISE EXCEPTION 'FAIL: empty-string p_parent_session_id guard missing';
  END IF;
  RAISE NOTICE 'OK: 039 parent-scope branches + empty-string guard present';
END $$;

-- ============================================================================
-- All checks passed if you got here without RAISE EXCEPTION.
-- ============================================================================
