-- ============================================================================
-- 048: Where the venue actually is
-- ============================================================================
-- A typed location is a guess. "Keskuskentta" could be any of a dozen places,
-- so a map has to SEARCH for it and may land on the wrong one. Picking a real
-- venue from the lookup attaches coordinates to the match, and those are the
-- durable part of this feature:
--
--   * the map link stops being a search and becomes an exact position;
--   * the venue gains an identity that does not depend on how it was spelled,
--     which is the same problem the opponent-name work had to solve;
--   * anything later about travel - when to leave, how far a season's away
--     games are - needs a position and cannot be derived from a string.
--
-- Two plain numeric columns rather than a JSON blob, because these are meant to
-- be queried (distance, grouping by venue) and not just carried around.
--
-- NULL for every existing row and for any venue typed by hand. The name is
-- still the location; the coordinates are an optional upgrade to it, and the
-- app must keep working for a coach who never picks a suggestion.
--
-- Separate from 047 on purpose: that migration is already applied to staging,
-- and editing an applied migration is how a database stops matching its own
-- history.
--
-- The function below is migration 047's, verbatim, with TWO lines added. Before
-- PROD, diff prod's live definition against 047 (per CLAUDE.md) and apply only
-- when the sole differences are comments and whitespace.
-- ============================================================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE games ADD COLUMN IF NOT EXISTS location_lng double precision;

COMMENT ON COLUMN games.location_lat IS
  'Latitude of the match venue; NULL when the location was typed rather than picked.';
COMMENT ON COLUMN games.location_lng IS
  'Longitude of the match venue; NULL when the location was typed rather than picked.';

CREATE OR REPLACE FUNCTION public.save_game_with_relations(p_game jsonb, p_players jsonb[], p_events jsonb[], p_assessments jsonb[], p_tactical_data jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_game_id text;
  v_user_id uuid;
  v_current_version integer;
  v_new_version integer;
  v_is_new_game boolean := false;
  v_season_id text;
  v_tournament_id text;
  v_team_id text;
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
  SELECT version INTO v_current_version
  FROM games
  WHERE user_id = v_user_id AND id = v_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Game doesn't exist for this user - it's a new game
    v_is_new_game := true;
    v_new_version := 1;
  ELSE
    -- Optimistic locking check (only if expected_version provided)
    IF p_expected_version IS NOT NULL AND v_current_version != p_expected_version THEN
      RAISE EXCEPTION 'Conflict: game was modified by another session (expected version %, found %)',
        p_expected_version, v_current_version
        USING ERRCODE = 'PT409';
    END IF;

    -- Overflow protection
    IF v_current_version >= 2147483647 THEN
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

  -- =========================================================================
  -- DEFENSIVE FK VALIDATION (added in migration 027)
  -- NULL out references to non-existent entities rather than failing the save.
  -- =========================================================================
  v_season_id := p_game->>'season_id';
  IF v_season_id IS NOT NULL AND v_season_id != '' THEN
    IF NOT EXISTS (SELECT 1 FROM seasons WHERE user_id = v_user_id AND id = v_season_id) THEN
      p_game := p_game || '{"season_id": null}'::jsonb;
    END IF;
  END IF;

  v_tournament_id := p_game->>'tournament_id';
  IF v_tournament_id IS NOT NULL AND v_tournament_id != '' THEN
    IF NOT EXISTS (SELECT 1 FROM tournaments WHERE user_id = v_user_id AND id = v_tournament_id) THEN
      p_game := p_game || '{"tournament_id": null, "tournament_series_id": null, "tournament_level": null}'::jsonb;
    END IF;
  END IF;

  v_team_id := p_game->>'team_id';
  IF v_team_id IS NOT NULL AND v_team_id != '' THEN
    IF NOT EXISTS (SELECT 1 FROM teams WHERE user_id = v_user_id AND id = v_team_id) THEN
      p_game := p_game || '{"team_id": null}'::jsonb;
    END IF;
  END IF;

  -- Upsert game (includes columns from migrations 021, 022, 032, 035, 039, 044, 045, 047 and 048)
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
    went_to_overtime = EXCLUDED.went_to_overtime,       -- Added in migration 021
    went_to_penalties = EXCLUDED.went_to_penalties,     -- Added in migration 021
    show_position_labels = EXCLUDED.show_position_labels, -- Added in migration 022
    shootout_kicks = EXCLUDED.shootout_kicks,           -- Added in migration 032
    player_positions = EXCLUDED.player_positions,       -- Added in migration 035
    is_friendly = EXCLUDED.is_friendly,                 -- Added in migration 039
    game_notes_ai_meta = EXCLUDED.game_notes_ai_meta,   -- Added in migration 044
    captain_id = EXCLUDED.captain_id,                   -- Added in migration 045
    field_number = EXCLUDED.field_number,               -- Added in migration 047
    location_lat = EXCLUDED.location_lat,               -- Added in migration 048
    location_lng = EXCLUDED.location_lng,               -- Added in migration 048
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

  -- Upsert tactical data (includes last_sub_confirmation_time_seconds and updated_at)
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
$function$
;
