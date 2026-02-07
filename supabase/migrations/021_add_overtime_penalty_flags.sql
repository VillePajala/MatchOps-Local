-- Migration 021: Add overtime and penalty shootout flags to games
-- These are simple boolean metadata flags for recording whether a game
-- went to overtime or was decided by penalty shootout.

-- Add columns
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS went_to_overtime boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS went_to_penalties boolean NOT NULL DEFAULT false;

-- Update RPC function to include new columns in upsert
CREATE OR REPLACE FUNCTION save_game_with_relations(
  p_game jsonb,
  p_players jsonb[],
  p_events jsonb[],
  p_assessments jsonb[],
  p_tactical_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_game_id text;
  v_is_new_game boolean := false;
  v_version integer;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Extract game ID
  v_game_id := p_game->>'id';
  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'Game ID is required';
  END IF;

  -- Check if this is a new game
  SELECT NOT EXISTS(
    SELECT 1 FROM games WHERE id = v_game_id AND user_id = v_user_id
  ) INTO v_is_new_game;

  -- Inject user_id into game data
  p_game := jsonb_set(p_game, '{user_id}', to_jsonb(v_user_id::text));

  -- Optimistic locking: only increment version on update, set to 1 on insert
  IF v_is_new_game THEN
    p_game := jsonb_set(p_game, '{version}', to_jsonb(1));
  ELSE
    -- Get current version and increment
    SELECT COALESCE(version, 0) + 1 INTO v_version
    FROM games WHERE id = v_game_id AND user_id = v_user_id;
    p_game := jsonb_set(p_game, '{version}', to_jsonb(COALESCE(v_version, 1)));
  END IF;

  -- Set timestamps
  p_game := jsonb_set(p_game, '{updated_at}', to_jsonb(now()));
  IF v_is_new_game OR NOT (p_game ? 'created_at') OR (p_game->>'created_at') IS NULL THEN
    p_game := jsonb_set(p_game, '{created_at}', to_jsonb(now()));
  END IF;

  -- Upsert game
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
    went_to_overtime = EXCLUDED.went_to_overtime,
    went_to_penalties = EXCLUDED.went_to_penalties,
    version = EXCLUDED.version,
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
      ) FROM unnest(p_players) AS elem)
    );
  END IF;

  -- Delete and re-insert events (only for this user's game)
  DELETE FROM game_events WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_events, 1) > 0 THEN
    INSERT INTO game_events
    SELECT * FROM jsonb_populate_recordset(null::game_events,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)
        )
      ) FROM unnest(p_events) AS elem)
    );
  END IF;

  -- Delete and re-insert assessments (only for this user's game)
  DELETE FROM player_assessments WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_assessments, 1) > 0 THEN
    INSERT INTO player_assessments
    SELECT * FROM jsonb_populate_recordset(null::player_assessments,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)
        )
      ) FROM unnest(p_assessments) AS elem)
    );
  END IF;

  -- Upsert tactical data (only if provided)
  IF p_tactical_data IS NOT NULL THEN
    p_tactical_data := jsonb_set(p_tactical_data, '{user_id}', to_jsonb(v_user_id::text));
    p_tactical_data := jsonb_set(p_tactical_data, '{game_id}', to_jsonb(v_game_id));

    INSERT INTO game_tactical_data
    SELECT * FROM jsonb_populate_record(null::game_tactical_data, p_tactical_data)
    ON CONFLICT (user_id, game_id) DO UPDATE SET
      opponents = EXCLUDED.opponents,
      drawings = EXCLUDED.drawings,
      tactical_discs = EXCLUDED.tactical_discs,
      tactical_drawings = EXCLUDED.tactical_drawings,
      tactical_ball_position = EXCLUDED.tactical_ball_position,
      completed_interval_durations = EXCLUDED.completed_interval_durations;
  END IF;

  RETURN jsonb_build_object('success', true, 'game_id', v_game_id, 'is_new', v_is_new_game);
END;
$$;
