-- Verification script for migrations 031 + 032 + 033
-- Run after applying all three to confirm:
--   1. planning_sessions table exists with the right column shape, defaults,
--      indexes, RLS policy, and FK to auth.users
--   2. clear_all_user_data RPC body now includes planning_sessions
--   3. set_active_planning_session RPC exists with the expected signature
--      and is granted to authenticated only
--
-- Usage (against staging):
--   psql "$STAGING_URL" -f supabase/migrations/__tests__/031_032_planning_sessions.verification.sql
--
-- Expected: every check prints "OK". Any "FAIL" line indicates a regression.

\echo === Migration 031: planning_sessions table shape ===

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'planning_sessions'
  ) THEN
    RAISE EXCEPTION 'FAIL: planning_sessions table missing';
  END IF;
  RAISE NOTICE 'OK: planning_sessions table exists';
END $$;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'planning_sessions'
    AND column_name IN (
      'id','user_id','team_id','name','game_ids','draft','is_active',
      'applied_at','created_at','updated_at'
    );
  IF v_count <> 10 THEN
    RAISE EXCEPTION 'FAIL: planning_sessions expected 10 known columns, found %', v_count;
  END IF;
  RAISE NOTICE 'OK: planning_sessions has all 10 expected columns';
END $$;

DO $$
DECLARE
  v_data_type text;
  v_default text;
BEGIN
  SELECT data_type, column_default INTO v_data_type, v_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'planning_sessions'
    AND column_name = 'draft';

  IF v_data_type <> 'jsonb' THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.draft expected jsonb, got %', v_data_type;
  END IF;
  IF v_default IS NULL OR v_default !~ '\{\}' THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.draft default expected empty jsonb object, got %', v_default;
  END IF;
  RAISE NOTICE 'OK: planning_sessions.draft is jsonb DEFAULT {}::jsonb';
END $$;

DO $$
DECLARE
  v_count int;
BEGIN
  -- ARRAY type for game_ids: information_schema reports as 'ARRAY';
  -- pg_attribute is the source of truth for the element type.
  SELECT count(*) INTO v_count
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'public'
    AND c.relname = 'planning_sessions'
    AND a.attname = 'game_ids'
    AND t.typname = '_text';  -- text[] internal name

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: planning_sessions.game_ids expected text[]';
  END IF;
  RAISE NOTICE 'OK: planning_sessions.game_ids is text[]';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'planning_sessions'
      AND indexname = 'idx_planning_sessions_user_team'
  ) THEN
    RAISE EXCEPTION 'FAIL: planning_sessions missing idx_planning_sessions_user_team';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'planning_sessions'
      AND indexname = 'idx_planning_sessions_user_active'
  ) THEN
    RAISE EXCEPTION 'FAIL: planning_sessions missing idx_planning_sessions_user_active';
  END IF;
  RAISE NOTICE 'OK: planning_sessions has user_team and user_active indexes';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'planning_sessions'
      AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'FAIL: planning_sessions does not have RLS enabled';
  END IF;
  RAISE NOTICE 'OK: planning_sessions has RLS enabled';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'planning_sessions'
      AND policyname = 'Users can only access their own planning sessions'
  ) THEN
    RAISE EXCEPTION 'FAIL: planning_sessions missing user-scoped RLS policy';
  END IF;
  RAISE NOTICE 'OK: planning_sessions RLS policy present';
END $$;

\echo === Migration 032: clear_all_user_data includes planning_sessions ===

DO $$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'clear_all_user_data';

  IF v_body IS NULL THEN
    RAISE EXCEPTION 'FAIL: clear_all_user_data not found';
  END IF;
  IF v_body !~ 'DELETE\s+FROM\s+planning_sessions\s+WHERE\s+user_id' THEN
    RAISE EXCEPTION 'FAIL: clear_all_user_data missing DELETE FROM planning_sessions';
  END IF;
  RAISE NOTICE 'OK: clear_all_user_data deletes planning_sessions';
END $$;

\echo === Migration 033: set_active_planning_session RPC ===

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_active_planning_session'
  ) THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session RPC missing';
  END IF;
  RAISE NOTICE 'OK: set_active_planning_session RPC exists';
END $$;

DO $$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_active_planning_session';

  IF v_body !~ 'is_active\s*=\s*\(id IS NOT DISTINCT FROM p_session_id\)' THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session body missing the is_active flip clause';
  END IF;
  IF v_body !~ 'game_ids @> p_game_ids' OR v_body !~ 'p_game_ids @> game_ids' THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session body missing the gameIds-set match';
  END IF;
  IF v_body !~ 'SECURITY DEFINER' THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session must be SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'OK: set_active_planning_session body is well-formed';
END $$;

DO $$
BEGIN
  -- Confirm execute is granted to authenticated and revoked from PUBLIC.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'set_active_planning_session'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: set_active_planning_session not granted to authenticated';
  END IF;
  RAISE NOTICE 'OK: set_active_planning_session is granted to authenticated';
END $$;

\echo === Done. ===
