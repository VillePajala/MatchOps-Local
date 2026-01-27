-- ============================================================================
-- Add Optimistic Locking for Games Table
-- ============================================================================
--
-- Issue: #330 - Prevent concurrent game save corruption
--
-- Problem: When a user has the app open in multiple tabs and saves the same
-- game simultaneously, child table operations race and can result in
-- unpredictable/corrupted state.
--
-- Solution: Optimistic locking with a version field. Each save increments
-- the version and checks the expected version matches. If not, the save
-- fails with a conflict error.
--
-- @see https://github.com/VillePajala/MatchOps-Local/issues/330
-- ============================================================================

-- Add version column to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Add comment for documentation
COMMENT ON COLUMN games.version IS
  'Optimistic locking version. Incremented on each save, checked to prevent concurrent modification.';

-- ============================================================================
-- Update save_game_with_relations RPC to support optimistic locking
-- ============================================================================
-- Now accepts p_expected_version parameter:
-- - If NULL: No version check (for backwards compatibility and new games)
-- - If provided: Must match current version, otherwise raises conflict error
--
-- Returns the new version number after save.
-- ============================================================================

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

  -- Check if game exists and get current version
  SELECT version INTO v_current_version
  FROM games
  WHERE id = v_game_id;

  IF NOT FOUND THEN
    v_is_new_game := true;
    v_new_version := 1;
  ELSE
    -- Verify ownership
    IF EXISTS (SELECT 1 FROM games WHERE id = v_game_id AND user_id != v_user_id) THEN
      RAISE EXCEPTION 'Access denied: game belongs to another user';
    END IF;

    -- Optimistic locking check (only if expected_version provided)
    IF p_expected_version IS NOT NULL AND v_current_version != p_expected_version THEN
      RAISE EXCEPTION 'Conflict: game was modified by another session (expected version %, found %)',
        p_expected_version, v_current_version
        USING ERRCODE = 'serialization_failure';  -- Standard PostgreSQL code for serialization conflicts
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

  -- Upsert game (CRITICAL: List ALL updatable columns explicitly)
  INSERT INTO games SELECT * FROM jsonb_populate_record(null::games, p_game)
  ON CONFLICT (id) DO UPDATE SET
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
    version = EXCLUDED.version,  -- Include version in update
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
  IF p_tactical_data IS NOT NULL THEN
    p_tactical_data := jsonb_set(
      jsonb_set(p_tactical_data, '{user_id}', to_jsonb(v_user_id::text)),
      '{game_id}', to_jsonb(v_game_id)
    );
    INSERT INTO game_tactical_data SELECT * FROM jsonb_populate_record(null::game_tactical_data, p_tactical_data)
    ON CONFLICT (game_id) DO UPDATE SET
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
