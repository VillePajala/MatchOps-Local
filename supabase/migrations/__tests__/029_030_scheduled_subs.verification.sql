-- Verification script for migrations 029 + 030
-- Run after applying both migrations to confirm:
--   1. games.scheduled_subs column exists with the right shape and default
--   2. save_game_with_relations RPC writes scheduled_subs through ON CONFLICT updates
--
-- Usage (against staging):
--   psql "$STAGING_URL" -f supabase/migrations/__tests__/029_030_scheduled_subs.verification.sql
--
-- Expected: every check prints "OK". Any "FAIL" line indicates a regression.

\echo === Migration 029: scheduled_subs column ===

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'games'
      AND column_name = 'scheduled_subs'
      AND data_type = 'jsonb'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'FAIL: games.scheduled_subs missing or wrong type/nullable';
  END IF;
  RAISE NOTICE 'OK: games.scheduled_subs is jsonb NOT NULL';
END $$;

DO $$
DECLARE
  v_default text;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'games'
    AND column_name = 'scheduled_subs';

  IF v_default IS NULL OR v_default !~ '\[\]' THEN
    RAISE EXCEPTION 'FAIL: games.scheduled_subs default is %, expected an empty jsonb array', v_default;
  END IF;
  RAISE NOTICE 'OK: games.scheduled_subs defaults to []';
END $$;

\echo === Migration 030: RPC upsert clause ===

DO $$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'save_game_with_relations';

  IF v_body IS NULL THEN
    RAISE EXCEPTION 'FAIL: save_game_with_relations not found';
  END IF;

  IF v_body !~ 'scheduled_subs\s*=\s*EXCLUDED\.scheduled_subs' THEN
    RAISE EXCEPTION 'FAIL: save_game_with_relations missing scheduled_subs in ON CONFLICT DO UPDATE SET clause';
  END IF;
  RAISE NOTICE 'OK: save_game_with_relations updates scheduled_subs on conflict';
END $$;

\echo === Done. ===
