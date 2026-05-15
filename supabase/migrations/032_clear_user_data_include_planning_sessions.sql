-- ============================================================================
-- 032_clear_user_data_include_planning_sessions
-- ============================================================================
-- Updates `clear_all_user_data()` (last redefined in migration 020) to also
-- delete planning_sessions rows. Without this, "Clear Cloud Data" would leave
-- orphaned planning_sessions behind for the user — a privacy issue and a
-- footgun for users who replay the migration after a fresh import.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Mirrors the body of migration 020
-- with one new DELETE statement; the rest is preserved verbatim so this stays
-- a focused diff.
--
-- @see supabase/migrations/020_fix_clear_user_data_preserve_consents.sql
-- @see supabase/migrations/031_planning_sessions.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION clear_all_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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

  -- Independent entities
  DELETE FROM teams WHERE user_id = v_user_id;
  DELETE FROM tournaments WHERE user_id = v_user_id;
  DELETE FROM seasons WHERE user_id = v_user_id;
  DELETE FROM personnel WHERE user_id = v_user_id;
  DELETE FROM players WHERE user_id = v_user_id;
  DELETE FROM warmup_plans WHERE user_id = v_user_id;
  DELETE FROM planning_sessions WHERE user_id = v_user_id;
  DELETE FROM user_settings WHERE user_id = v_user_id;

  -- NOTE: user_consents and user_subscriptions intentionally retained.
  -- See migration 020 for full rationale.
END;
$$;

REVOKE ALL ON FUNCTION clear_all_user_data FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_all_user_data TO authenticated;
