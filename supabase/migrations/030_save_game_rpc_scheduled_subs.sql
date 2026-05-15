-- ============================================================================
-- 030_save_game_rpc_scheduled_subs
-- ============================================================================
-- Adds `scheduled_subs` to the upsert clause of save_game_with_relations so
-- RPC saves persist the new column added in migration 029.
--
-- Without this, INSERT … SELECT * FROM jsonb_populate_record (line ~115 of
-- migration 027) writes scheduled_subs on first insert, but the
-- ON CONFLICT … DO UPDATE SET clause silently drops it on every subsequent
-- save. Since cloud-mode saves go exclusively through this RPC (see
-- src/datastore/SupabaseDataStore.ts saveGame), forgetting it would surface
-- as "scheduled subs disappear after a save" — a particularly nasty
-- regression because creates would look fine.
--
-- This is a CREATE OR REPLACE with the same 6-param signature as migration
-- 027. The function body is identical to 027 except for the added line in
-- the ON CONFLICT DO UPDATE SET clause.
--
-- ⚠ SYNC WARNING: any future change to save_game_with_relations must update
-- BOTH this file AND the latest migration that defines it. CREATE OR
-- REPLACE in plain SQL has no inheritance — the latest applied body wins
-- in full. The verification script `__tests__/029_030_scheduled_subs.
-- verification.sql` regression-guards the scheduled_subs clause specifically.
--
-- @see supabase/migrations/027_validate_game_fk_references.sql (prior body)
-- @see supabase/migrations/029_scheduled_subs.sql (the schema change)
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
  v_season_id text;
  v_tournament_id text;
  v_team_id text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_game_id := p_game->>'id';

  SELECT version INTO v_current_version
  FROM games
  WHERE user_id = v_user_id AND id = v_game_id;

  IF NOT FOUND THEN
    v_is_new_game := true;
    v_new_version := 1;
  ELSE
    IF p_expected_version IS NOT NULL AND v_current_version != p_expected_version THEN
      RAISE EXCEPTION 'Conflict: game was modified by another session (expected version %, found %)',
        p_expected_version, v_current_version
        USING ERRCODE = 'serialization_failure';
    END IF;

    IF v_current_version >= 2147483647 THEN
      RAISE EXCEPTION 'Version overflow: game version has reached maximum value. Please contact support.'
        USING ERRCODE = 'numeric_value_out_of_range';
    END IF;

    v_new_version := v_current_version + 1;
  END IF;

  p_game := jsonb_set(p_game, '{user_id}', to_jsonb(v_user_id::text));
  p_game := jsonb_set(p_game, '{version}', to_jsonb(v_new_version));
  p_game := jsonb_set(p_game, '{updated_at}', to_jsonb(now()));
  IF v_is_new_game OR NOT (p_game ? 'created_at') OR (p_game->>'created_at') IS NULL THEN
    p_game := jsonb_set(p_game, '{created_at}', to_jsonb(now()));
  END IF;

  -- Defensive FK validation (added in migration 027) — NULL out references to
  -- non-existent entities rather than failing the entire save.
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

  -- Upsert game (now includes scheduled_subs from migration 029)
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
    went_to_overtime = EXCLUDED.went_to_overtime,       -- migration 021
    went_to_penalties = EXCLUDED.went_to_penalties,     -- migration 021
    show_position_labels = EXCLUDED.show_position_labels, -- migration 022
    scheduled_subs = EXCLUDED.scheduled_subs,           -- migration 029 (NEW)
    version = EXCLUDED.version,
    updated_at = now();

  -- Players (delete + re-insert)
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

  -- Events
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

  -- Assessments
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

  -- Tactical data
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

  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION save_game_with_relations FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_game_with_relations TO authenticated;
