-- Verification script for migration 034
-- Run after applying to confirm the is_priority column lands on both
-- players (master) and game_players (per-game snapshot) with the
-- right defaults.
--
-- Usage (against staging):
--   psql "$STAGING_URL" -f supabase/migrations/__tests__/034_player_is_priority.verification.sql
--
-- Expected: every check prints "OK". Any "FAIL" line indicates a regression.

\echo === Migration 034: players.is_priority ===

DO $$
DECLARE
  v_data_type text;
  v_default text;
  v_is_nullable text;
BEGIN
  SELECT data_type, column_default, is_nullable
    INTO v_data_type, v_default, v_is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'players'
    AND column_name = 'is_priority';

  IF v_data_type IS NULL THEN
    RAISE EXCEPTION 'FAIL: players.is_priority column missing';
  END IF;
  IF v_data_type <> 'boolean' THEN
    RAISE EXCEPTION 'FAIL: players.is_priority expected boolean, got %', v_data_type;
  END IF;
  IF v_is_nullable <> 'NO' THEN
    RAISE EXCEPTION 'FAIL: players.is_priority must be NOT NULL';
  END IF;
  IF v_default IS NULL OR v_default !~* 'false' THEN
    RAISE EXCEPTION 'FAIL: players.is_priority default expected false, got %', v_default;
  END IF;
  RAISE NOTICE 'OK: players.is_priority is boolean NOT NULL DEFAULT false';
END $$;

\echo === Migration 034: game_players.is_priority ===

DO $$
DECLARE
  v_data_type text;
  v_default text;
  v_is_nullable text;
BEGIN
  SELECT data_type, column_default, is_nullable
    INTO v_data_type, v_default, v_is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'game_players'
    AND column_name = 'is_priority';

  IF v_data_type IS NULL THEN
    RAISE EXCEPTION 'FAIL: game_players.is_priority column missing';
  END IF;
  IF v_data_type <> 'boolean' THEN
    RAISE EXCEPTION 'FAIL: game_players.is_priority expected boolean, got %', v_data_type;
  END IF;
  IF v_is_nullable <> 'NO' THEN
    RAISE EXCEPTION 'FAIL: game_players.is_priority must be NOT NULL';
  END IF;
  IF v_default IS NULL OR v_default !~* 'false' THEN
    RAISE EXCEPTION 'FAIL: game_players.is_priority default expected false, got %', v_default;
  END IF;
  RAISE NOTICE 'OK: game_players.is_priority is boolean NOT NULL DEFAULT false';
END $$;

\echo === Done. ===
