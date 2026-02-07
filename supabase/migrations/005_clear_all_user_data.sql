-- ============================================================================
-- RPC Function: clear_all_user_data
-- ============================================================================
--
-- Atomically deletes ALL data for the authenticated user across ALL tables.
-- This is used by the "Clear All Cloud Data" feature in Settings.
--
-- CRITICAL: Uses a single PostgreSQL transaction to ensure all-or-nothing
-- semantics. If any DELETE fails, the entire operation rolls back.
--
-- SECURITY NOTES:
-- 1. Uses SECURITY DEFINER with search_path restriction
-- 2. auth.uid() is used for user identification - no client-provided user_id
-- 3. Execute permissions restricted to 'authenticated' role only
--
-- DEPLOYMENT:
-- Run this SQL in Supabase Dashboard > SQL Editor, or via:
--   supabase db push
--
-- @see docs/02-technical/database/supabase-schema.md
-- ============================================================================

CREATE OR REPLACE FUNCTION clear_all_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- REQUIRED: Prevents search_path injection
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- CRITICAL: Get authenticated user ID from Supabase Auth
  -- This ensures user can only delete their own data
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete in FK-compliant order: child tables first, then parent tables
  -- This respects foreign key constraints even without CASCADE
  --
  -- FK Constraints (from supabase-schema.md):
  -- - game_events, game_players, game_tactical_data, player_assessments:
  --     game_id REFERENCES games(id) ON DELETE CASCADE
  -- - games:
  --     season_id REFERENCES seasons(id) ON DELETE SET NULL
  --     tournament_id REFERENCES tournaments(id) ON DELETE SET NULL
  --     team_id REFERENCES teams(id) ON DELETE SET NULL
  -- - player_adjustments:
  --     season_id REFERENCES seasons(id) ON DELETE SET NULL
  --     tournament_id REFERENCES tournaments(id) ON DELETE SET NULL
  -- - team_players:
  --     team_id REFERENCES teams(id) ON DELETE CASCADE

  -- Game child tables first (would CASCADE from games, but explicit is clearer)
  DELETE FROM game_events WHERE user_id = v_user_id;
  DELETE FROM game_players WHERE user_id = v_user_id;
  DELETE FROM game_tactical_data WHERE user_id = v_user_id;
  DELETE FROM player_assessments WHERE user_id = v_user_id;

  -- Games next (SET NULL on seasons/tournaments/teams)
  DELETE FROM games WHERE user_id = v_user_id;

  -- Player adjustments (SET NULL on seasons/tournaments)
  DELETE FROM player_adjustments WHERE user_id = v_user_id;

  -- Team players (would CASCADE from teams)
  DELETE FROM team_players WHERE user_id = v_user_id;

  -- Independent entities last
  DELETE FROM teams WHERE user_id = v_user_id;
  DELETE FROM tournaments WHERE user_id = v_user_id;
  DELETE FROM seasons WHERE user_id = v_user_id;
  DELETE FROM personnel WHERE user_id = v_user_id;
  DELETE FROM players WHERE user_id = v_user_id;
  DELETE FROM warmup_plans WHERE user_id = v_user_id;
  DELETE FROM user_settings WHERE user_id = v_user_id;

  -- NOTE: user_consents are intentionally NOT deleted here.
  -- GDPR compliance requires retaining consent records:
  -- - "Clear Cloud Data": User keeps account, consents remain linked
  -- - Account deletion: ON DELETE SET NULL anonymizes (user_id → NULL)
  -- See migration 008_user_consents.sql for design rationale.
  -- Fixed in migration 020_fix_clear_user_data_preserve_consents.sql

END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION clear_all_user_data FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_all_user_data TO authenticated;
