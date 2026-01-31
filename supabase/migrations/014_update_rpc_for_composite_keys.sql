-- ============================================================================
-- RPC FUNCTION UPDATES FOR COMPOSITE PRIMARY KEYS
-- Updates ON CONFLICT clauses to use composite keys (user_id, id)
-- ============================================================================
--
-- This migration updates save_game_with_relations to use composite primary keys.
-- Must be run AFTER 013_composite_primary_keys.sql.
--
-- IMPORTANT: This preserves the optimistic locking feature from migration 012:
-- - 6th parameter: p_expected_version
-- - Return type: integer (new version number)
-- - Version check and increment logic
--
-- CHANGES:
-- - save_game_with_relations: ON CONFLICT (id) → ON CONFLICT (user_id, id)
-- - save_game_with_relations: ON CONFLICT (game_id) → ON CONFLICT (user_id, game_id)
-- - Version SELECT: Added user_id filter (CRITICAL: id alone is no longer unique)
-- - Removed separate ownership check (now implicit via user_id-scoped SELECT)
--
-- CLIENT COMPATIBILITY: Function signature unchanged (6 params, returns integer).
-- No client code changes needed.
--
-- OTHER RPC FUNCTIONS (unchanged):
-- - delete_personnel_cascade: Uses DELETE with WHERE clause (no ON CONFLICT)
-- - set_team_roster: Uses DELETE + INSERT (no ON CONFLICT)
-- - record_user_consent: Uses unique index on (user_id, consent_type, policy_version)
--   which is not affected by this migration
--
-- ============================================================================

-- ============================================================================
-- UPDATED: save_game_with_relations
-- ============================================================================
-- Changes from migration 012:
-- 1. ON CONFLICT (id) → ON CONFLICT (user_id, id) for games table
-- 2. ON CONFLICT (game_id) → ON CONFLICT (user_id, game_id) for game_tactical_data
--
-- Preserved from migration 012:
-- - p_expected_version parameter for optimistic locking
-- - RETURNS integer (new version number)
-- - Version check and increment logic
-- - Overflow protection
-- ============================================================================

-- Drop the old function to allow signature change
-- (CREATE OR REPLACE cannot change return type)
DROP FUNCTION IF EXISTS save_game_with_relations(jsonb, jsonb[], jsonb[], jsonb[], jsonb, integer);

CREATE OR REPLACE FUNCTION save_game_with_relations(
  p_game jsonb,
  p_players jsonb[],
  p_events jsonb[],
  p_assessments jsonb[],
  p_tactical_data jsonb,
  p_expected_version integer DEFAULT NULL  -- NULL = skip version check (new game or migration)
)
RETURNS integer  -- Returns new version number
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_game_id text;
  v_user_id uuid;
  v_current_version integer;
  v_new_version integer;
  v_is_new_game boolean := false;
BEGIN
  -- CRITICAL: Get authenticated user ID from Supabase Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Extract game ID
  v_game_id := p_game->>'id';

  -- Check if THIS USER's game exists and get current version
  -- CRITICAL: With composite PK (user_id, id), must filter by user_id
  -- Without this, the query could return another user's game with the same id
  SELECT version INTO v_current_version
  FROM games
  WHERE user_id = v_user_id AND id = v_game_id;

  IF NOT FOUND THEN
    -- Game doesn't exist for this user - it's a new game
    -- Note: With composite PK, another user may have the same id (that's allowed)
    v_is_new_game := true;
    v_new_version := 1;
  ELSE
    -- Game exists for this user - no need for separate ownership check
    -- The SELECT above already scoped to this user's data

    -- Optimistic locking check (only if expected_version provided)
    IF p_expected_version IS NOT NULL AND v_current_version != p_expected_version THEN
      RAISE EXCEPTION 'Conflict: game was modified by another session (expected version %, found %)',
        p_expected_version, v_current_version
        USING ERRCODE = 'serialization_failure';  -- Standard PostgreSQL code for serialization conflicts
    END IF;

    -- CRITICAL: Check for INTEGER overflow before incrementing
    -- Max INTEGER is 2147483647 (2^31 - 1), column defined as INTEGER
    -- This should never happen in practice (~68 years at 1 save/second)
    -- but prevents silent corruption if it ever does
    IF v_current_version >= 2147483646 THEN
      RAISE EXCEPTION 'Version overflow: game version has reached maximum value. Please contact support.'
        USING ERRCODE = 'numeric_value_out_of_range';
    END IF;

    v_new_version := v_current_version + 1;
  END IF;

  -- Override user_id in payload with authenticated user
  p_game := jsonb_set(p_game, '{user_id}', to_jsonb(v_user_id::text));

  -- Set version in payload
  p_game := jsonb_set(p_game, '{version}', to_jsonb(v_new_version));

  -- Set timestamps
  p_game := jsonb_set(p_game, '{updated_at}', to_jsonb(now()));
  IF v_is_new_game OR NOT (p_game ? 'created_at') OR (p_game->>'created_at') IS NULL THEN
    p_game := jsonb_set(p_game, '{created_at}', to_jsonb(now()));
  END IF;

  -- Upsert game
  -- UPDATED: ON CONFLICT uses composite primary key (user_id, id)
  INSERT INTO games SELECT * FROM jsonb_populate_record(null::games, p_game)
  ON CONFLICT (user_id, id) DO UPDATE SET
    team_id = EXCLUDED.team_id,
    season_id = EXCLUDED.season_id,
    tournament_id = EXCLUDED.tournament_id,
    tournament_series_id = EXCLUDED.tournament_series_id,
    tournament_level = EXCLUDED.tournament_level,
    team_name = EXCLUDED.team_name,
    opponent_name = EXCLUDED.opponent_name,
    game_date = EXCLUDED.game_date,
    game_time = EXCLUDED.game_time,
    game_location = EXCLUDED.game_location,
    home_or_away = EXCLUDED.home_or_away,
    age_group = EXCLUDED.age_group,
    number_of_periods = EXCLUDED.number_of_periods,
    period_duration_minutes = EXCLUDED.period_duration_minutes,
    sub_interval_minutes = EXCLUDED.sub_interval_minutes,
    demand_factor = EXCLUDED.demand_factor,
    game_status = EXCLUDED.game_status,
    current_period = EXCLUDED.current_period,
    is_played = EXCLUDED.is_played,
    time_elapsed_in_seconds = EXCLUDED.time_elapsed_in_seconds,
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score,
    show_player_names = EXCLUDED.show_player_names,
    game_notes = EXCLUDED.game_notes,
    game_type = EXCLUDED.game_type,
    gender = EXCLUDED.gender,
    league_id = EXCLUDED.league_id,
    custom_league_name = EXCLUDED.custom_league_name,
    game_personnel = EXCLUDED.game_personnel,
    formation_snap_points = EXCLUDED.formation_snap_points,
    version = EXCLUDED.version,  -- Include version in update (from migration 012)
    updated_at = now();

  -- Delete and re-insert players (only for this user's game)
  DELETE FROM game_players WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_players, 1) > 0 THEN
    INSERT INTO game_players
    SELECT * FROM jsonb_populate_recordset(null::game_players,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)
        )
      )
      FROM unnest(p_players) elem));
  END IF;

  -- Delete and re-insert events
  DELETE FROM game_events WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_events, 1) > 0 THEN
    INSERT INTO game_events
    SELECT * FROM jsonb_populate_recordset(null::game_events,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)
        )
      )
      FROM unnest(p_events) elem));
  END IF;

  -- Delete and re-insert assessments
  DELETE FROM player_assessments WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_assessments, 1) > 0 THEN
    INSERT INTO player_assessments
    SELECT * FROM jsonb_populate_recordset(null::player_assessments,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)
        )
      )
      FROM unnest(p_assessments) elem));
  END IF;

  -- Upsert tactical data
  -- UPDATED: ON CONFLICT uses composite primary key (user_id, game_id)
  IF p_tactical_data IS NOT NULL THEN
    p_tactical_data := jsonb_set(
      jsonb_set(p_tactical_data, '{user_id}', to_jsonb(v_user_id::text)),
      '{game_id}', to_jsonb(v_game_id)
    );
    INSERT INTO game_tactical_data SELECT * FROM jsonb_populate_record(null::game_tactical_data, p_tactical_data)
    ON CONFLICT (user_id, game_id) DO UPDATE SET
      opponents = EXCLUDED.opponents,
      drawings = EXCLUDED.drawings,
      tactical_discs = EXCLUDED.tactical_discs,
      tactical_drawings = EXCLUDED.tactical_drawings,
      tactical_ball_position = EXCLUDED.tactical_ball_position,
      completed_interval_durations = EXCLUDED.completed_interval_durations,
      last_sub_confirmation_time_seconds = EXCLUDED.last_sub_confirmation_time_seconds,
      updated_at = now();
  END IF;

  -- Return new version for client to cache
  RETURN v_new_version;
END;
$$;

-- Permissions remain the same
REVOKE ALL ON FUNCTION save_game_with_relations FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_game_with_relations TO authenticated;
