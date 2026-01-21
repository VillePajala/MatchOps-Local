-- ============================================================================
-- RPC Functions for MatchOps-Local Supabase Backend
-- ============================================================================
--
-- These functions provide atomic transactions for multi-table operations.
-- Deploy to Supabase via Dashboard SQL Editor or Supabase CLI.
--
-- SECURITY NOTES:
-- 1. All functions use SECURITY DEFINER with search_path restriction
-- 2. auth.uid() is used for all user validation - ignores client-provided user_id
-- 3. Execute permissions restricted to 'authenticated' role only
--
-- REQUIRED INDEXES FOR PERFORMANCE:
-- These RPC functions rely on the following indexes for efficient operation:
-- - game_players: INDEX ON (game_id, user_id)
-- - game_events: INDEX ON (game_id, user_id) + INDEX ON (game_id, order_index)
-- - player_assessments: INDEX ON (game_id, user_id)
-- - game_tactical_data: PRIMARY KEY ON (game_id)
-- - team_players: INDEX ON (team_id, user_id)
-- Verify these exist in the schema before deploying RPC functions.
--
-- DEPLOYMENT:
-- Run this SQL in Supabase Dashboard > SQL Editor, or via:
--   supabase db push
--
-- @see docs/02-technical/database/supabase-schema.md
-- ============================================================================

-- ============================================================================
-- 1. save_game_with_relations
-- ============================================================================
-- Atomically saves a game with all related data across 5 tables:
-- - games (main game metadata)
-- - game_players (available players with on_field/is_selected flags)
-- - game_events (ordered by order_index)
-- - player_assessments (with flattened slider columns)
-- - game_tactical_data (JSONB fields for tactical data)
--
-- Uses delete + insert for child tables to maintain order_index integrity.
-- ============================================================================

CREATE OR REPLACE FUNCTION save_game_with_relations(
  p_game jsonb,
  p_players jsonb[],         -- Array of player records
  p_events jsonb[],          -- Array of event records
  p_assessments jsonb[],     -- Array of assessment records
  p_tactical_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- REQUIRED: Prevents search_path injection
AS $$
DECLARE
  v_game_id text;
  v_user_id uuid;
BEGIN
  -- CRITICAL: Get authenticated user ID from Supabase Auth
  -- This ensures user cannot write to another user's data
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Extract game ID
  v_game_id := p_game->>'id';

  -- Verify ownership: if game exists, must belong to current user
  IF EXISTS (SELECT 1 FROM games WHERE id = v_game_id AND user_id != v_user_id) THEN
    RAISE EXCEPTION 'Access denied: game belongs to another user';
  END IF;

  -- Override user_id in payload with authenticated user
  -- This prevents client from injecting another user's ID
  p_game := jsonb_set(p_game, '{user_id}', to_jsonb(v_user_id::text));

  -- Set timestamps: created_at for new games, updated_at for all
  -- jsonb_populate_record doesn't apply column defaults, so we must inject them
  p_game := jsonb_set(p_game, '{updated_at}', to_jsonb(now()));
  IF NOT (p_game ? 'created_at') OR (p_game->>'created_at') IS NULL THEN
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
    updated_at = now();

  -- Delete and re-insert players (only for this user's game)
  DELETE FROM game_players WHERE game_id = v_game_id AND user_id = v_user_id;
  -- Inject user_id AND game_id into each player record (override client values)
  IF array_length(p_players, 1) > 0 THEN
    INSERT INTO game_players
    SELECT * FROM jsonb_populate_recordset(null::game_players,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)  -- Force correct game_id
        )
      )
      FROM unnest(p_players) elem));
  END IF;

  -- Delete and re-insert events (inject user_id AND game_id)
  DELETE FROM game_events WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_events, 1) > 0 THEN
    INSERT INTO game_events
    SELECT * FROM jsonb_populate_recordset(null::game_events,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)  -- Force correct game_id
        )
      )
      FROM unnest(p_events) elem));
  END IF;

  -- Delete and re-insert assessments (inject user_id AND game_id)
  DELETE FROM player_assessments WHERE game_id = v_game_id AND user_id = v_user_id;
  IF array_length(p_assessments, 1) > 0 THEN
    INSERT INTO player_assessments
    SELECT * FROM jsonb_populate_recordset(null::player_assessments,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{game_id}', to_jsonb(v_game_id)  -- Force correct game_id
        )
      )
      FROM unnest(p_assessments) elem));
  END IF;

  -- Upsert tactical data (inject user_id AND game_id)
  IF p_tactical_data IS NOT NULL THEN
    p_tactical_data := jsonb_set(
      jsonb_set(p_tactical_data, '{user_id}', to_jsonb(v_user_id::text)),
      '{game_id}', to_jsonb(v_game_id)  -- Force correct game_id
    );
    -- Upsert tactical data (CRITICAL: List ALL updatable columns explicitly)
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

END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION save_game_with_relations FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_game_with_relations TO authenticated;


-- ============================================================================
-- 2. delete_personnel_cascade
-- ============================================================================
-- Deletes a personnel member and removes their ID from all games'
-- game_personnel arrays. This implements Rule #7 from the implementation guide.
--
-- Returns TRUE if personnel was deleted, FALSE if not found or unauthorized.
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_personnel_cascade(
  p_personnel_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- REQUIRED: Prevents search_path injection
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- CRITICAL: Get authenticated user ID from Supabase Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify ownership before delete
  IF NOT EXISTS (SELECT 1 FROM personnel WHERE id = p_personnel_id AND user_id = v_user_id) THEN
    RETURN FALSE;  -- Personnel doesn't exist or belongs to another user
  END IF;

  -- Remove from all games' game_personnel arrays (only user's own games)
  UPDATE games
  SET game_personnel = array_remove(game_personnel, p_personnel_id)
  WHERE user_id = v_user_id AND p_personnel_id = ANY(game_personnel);

  -- Delete the personnel record
  DELETE FROM personnel WHERE id = p_personnel_id AND user_id = v_user_id;

  RETURN FOUND;
END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION delete_personnel_cascade FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_personnel_cascade TO authenticated;


-- ============================================================================
-- 3. set_team_roster
-- ============================================================================
-- Atomically replaces a team's roster. Deletes existing team_players rows
-- and inserts new ones in a single transaction.
--
-- This prevents data loss if network fails between delete and insert operations.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_team_roster(
  p_team_id text,
  p_roster jsonb[]  -- Array of team_player records
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- REQUIRED: Prevents search_path injection
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- CRITICAL: Get authenticated user ID from Supabase Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify team ownership
  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Access denied: team not found or belongs to another user';
  END IF;

  -- Delete existing roster
  DELETE FROM team_players WHERE team_id = p_team_id AND user_id = v_user_id;

  -- Insert new roster (if not empty)
  IF array_length(p_roster, 1) > 0 THEN
    INSERT INTO team_players
    SELECT * FROM jsonb_populate_recordset(null::team_players,
      (SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
          '{team_id}', to_jsonb(p_team_id)  -- Force correct team_id
        )
      )
      FROM unnest(p_roster) elem));
  END IF;

END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION set_team_roster FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_team_roster TO authenticated;
