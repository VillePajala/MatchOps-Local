-- ============================================================================
-- MatchOps-Local PostgreSQL Schema
-- ============================================================================
-- Run this FIRST before 001_rpc_functions.sql and 002_rls_policies.sql
--
-- This creates all 14 tables in dependency order:
-- 1. Independent tables (no foreign keys to other app tables)
-- 2. Tables with foreign keys
-- 3. All indexes
--
-- @see docs/02-technical/database/supabase-schema.md for full documentation
-- ============================================================================

-- ============================================================================
-- 1. INDEPENDENT TABLES (no foreign keys to other app tables)
-- ============================================================================

-- Players (Master Roster)
CREATE TABLE players (
  id text PRIMARY KEY,  -- Format: player_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  nickname text,
  jersey_number text,
  is_goalie boolean DEFAULT false,
  color text,
  notes text,
  received_fair_play_card boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
  -- NOTE: No name uniqueness constraint - app allows duplicate player names
);

-- Seasons
CREATE TABLE seasons (
  id text PRIMARY KEY,  -- Format: season_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text,
  period_count integer CHECK (period_count IN (1, 2)),
  period_duration integer, -- minutes
  start_date date,
  end_date date,
  game_dates date[],
  archived boolean DEFAULT false,
  notes text,
  color text,
  badge text,
  age_group text,

  -- Game type and gender filtering
  game_type text CHECK (game_type IN ('soccer', 'futsal')),
  gender text CHECK (gender IN ('boys', 'girls')),

  -- League configuration
  league_id text,           -- e.g., 'sm-sarja', 'harrastesarja', 'muu'
  custom_league_name text,  -- Only used when league_id = 'muu'

  -- Club season label (calculated from start_date)
  club_season text,         -- e.g., '24/25'

  -- Team placements (jsonb for flexibility)
  team_placements jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Uniqueness: App-level validation enforces composite uniqueness
  -- (name + clubSeason + gameType + gender + ageGroup + leagueId)
  -- No database constraint - allows same name in different contexts
);

-- Tournaments
CREATE TABLE tournaments (
  id text PRIMARY KEY,  -- Format: tournament_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text,
  period_count integer CHECK (period_count IN (1, 2)),
  period_duration integer, -- minutes
  start_date date,
  end_date date,
  game_dates date[],
  archived boolean DEFAULT false,
  notes text,
  color text,
  badge text,
  level text,  -- Legacy single-level field
  age_group text,
  awarded_player_id text, -- No FK constraint (graceful degradation)

  -- Game type and gender filtering
  game_type text CHECK (game_type IN ('soccer', 'futsal')),
  gender text CHECK (gender IN ('boys', 'girls')),

  -- Club season label (calculated from start_date)
  club_season text,         -- e.g., '24/25'

  -- Team placements (jsonb for flexibility)
  team_placements jsonb DEFAULT '{}'::jsonb,

  -- Tournament series (multiple competition levels)
  series jsonb DEFAULT '[]'::jsonb,  -- [{ id: "series_...", level: "Elite" }, ...]

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Uniqueness: App-level validation enforces composite uniqueness
  -- (name + clubSeason + gameType + gender + ageGroup)
  -- No database constraint - allows same name in different contexts
);

-- Personnel
CREATE TABLE personnel (
  id text PRIMARY KEY,  -- Format: personnel_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'other',  -- PersonnelRole enum
  email text,
  phone text,
  certifications text[] DEFAULT '{}',  -- e.g., ['UEFA A License', 'First Aid']
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT personnel_name_user_unique UNIQUE (user_id, name)
);

-- Warmup Plans
CREATE TABLE warmup_plans (
  id text PRIMARY KEY,  -- Typically 'user_warmup_plan' (single plan per user)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Schema version for future migrations
  version integer NOT NULL DEFAULT 1,

  -- Last modification timestamp
  last_modified timestamptz DEFAULT now(),

  -- True if this is the unmodified default template
  is_default boolean DEFAULT false,

  -- Ordered list of sections: [{ id: string, title: string, content: string }]
  sections jsonb DEFAULT '[]'::jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- One warmup plan per user
  CONSTRAINT warmup_plans_user_unique UNIQUE (user_id)
);

-- User Settings
CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  current_game_id text, -- No FK (may reference archived game)
  last_home_team_name text,
  language text DEFAULT 'fi',
  has_seen_app_guide boolean DEFAULT false,
  use_demand_correction boolean DEFAULT false,
  is_drawing_mode_enabled boolean DEFAULT false,

  -- Club season dates (ISO format YYYY-MM-DD, stored as text to match app)
  club_season_start_date text DEFAULT '2000-11-15',
  club_season_end_date text DEFAULT '2000-10-20',
  has_configured_season_dates boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 2. TABLES WITH FOREIGN KEYS
-- ============================================================================

-- Teams
CREATE TABLE teams (
  id text PRIMARY KEY,  -- Format: team_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  notes text,
  age_group text,
  game_type text CHECK (game_type IN ('soccer', 'futsal')),
  archived boolean DEFAULT false,

  -- Context binding (optional, for filtering)
  bound_season_id text,           -- References seasons.id (no FK for flexibility)
  bound_tournament_id text,       -- References tournaments.id (no FK)
  bound_tournament_series_id text, -- References tournament_series.id (no FK)

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Uniqueness: App-level validation enforces composite uniqueness
  -- (name + boundSeasonId + boundTournamentId + boundTournamentSeriesId + gameType)
  -- No database constraint - allows same name in different contexts
);

-- Team Players
CREATE TABLE team_players (
  id text PRIMARY KEY,  -- Format: {team_id}_{player_id} (composite key)
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id text NOT NULL,  -- Master roster player ID (no FK - graceful degradation)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  nickname text,
  jersey_number text,
  is_goalie boolean DEFAULT false,
  color text,
  notes text,
  received_fair_play_card boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Ensure same player can't be added twice to same team
  CONSTRAINT team_players_team_player_unique UNIQUE (team_id, player_id)
);

-- Games
CREATE TABLE games (
  id text PRIMARY KEY,  -- Format: game_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id text REFERENCES teams(id) ON DELETE SET NULL,

  -- Season/Tournament associations (nullable - games can be unassigned)
  season_id text REFERENCES seasons(id) ON DELETE SET NULL,
  tournament_id text REFERENCES tournaments(id) ON DELETE SET NULL,
  tournament_series_id text,  -- References series within tournament (no FK)
  tournament_level text,      -- Legacy field

  -- Game metadata
  team_name text NOT NULL,
  opponent_name text NOT NULL,
  game_date date NOT NULL,
  game_time time,
  game_location text,
  home_or_away text NOT NULL DEFAULT 'home' CHECK (home_or_away IN ('home', 'away')),
  age_group text,

  -- Configuration
  number_of_periods integer NOT NULL DEFAULT 2 CHECK (number_of_periods IN (1, 2)),
  period_duration_minutes integer NOT NULL DEFAULT 10,  -- Safety net default per CLAUDE.md Rule 10
  sub_interval_minutes integer DEFAULT 5,
  demand_factor numeric(4,2) CHECK (demand_factor BETWEEN 0.1 AND 10),

  -- Game state
  game_status text NOT NULL DEFAULT 'notStarted' CHECK (game_status IN ('notStarted', 'inProgress', 'periodEnd', 'gameEnd')),
  current_period integer NOT NULL DEFAULT 1,
  is_played boolean NOT NULL DEFAULT true,
  time_elapsed_in_seconds numeric(10,3),

  -- Score
  home_score integer NOT NULL DEFAULT 0,
  away_score integer NOT NULL DEFAULT 0,

  -- Settings
  show_player_names boolean NOT NULL DEFAULT true,
  game_notes text NOT NULL DEFAULT '',

  -- Game type and gender
  game_type text CHECK (game_type IN ('soccer', 'futsal')),
  gender text CHECK (gender IN ('boys', 'girls')),

  -- League (can override season's league)
  league_id text,
  custom_league_name text,

  -- Personnel assigned to this game (array of personnel IDs)
  game_personnel text[] DEFAULT '{}',

  -- Formation snap points for positioning assistance
  formation_snap_points jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Game Players
CREATE TABLE game_players (
  id text PRIMARY KEY,  -- Format: {game_id}_{player_id}
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id text NOT NULL, -- Master roster ID (no FK - graceful degradation)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Player snapshot (for deleted players and historical accuracy)
  player_name text NOT NULL,
  nickname text,
  jersey_number text,
  is_goalie boolean DEFAULT false,
  color text,
  notes text,
  received_fair_play_card boolean DEFAULT false,

  -- Selection and field status
  is_selected boolean DEFAULT false,
  on_field boolean DEFAULT false,
  rel_x double precision,
  rel_y double precision,

  created_at timestamptz DEFAULT now(),

  CONSTRAINT game_players_game_player_unique UNIQUE (game_id, player_id)
);

-- Game Events
CREATE TABLE game_events (
  id text PRIMARY KEY,  -- Format: event_{timestamp}_{random}
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  event_type text NOT NULL CHECK (event_type IN (
    'goal', 'opponentGoal', 'substitution', 'periodEnd', 'gameEnd', 'fairPlayCard'
  )),
  time_seconds numeric(10,2) NOT NULL,

  -- Order index for preserving insertion order (critical for index-based operations)
  order_index integer NOT NULL,

  scorer_id text,     -- No FK (player may be deleted)
  assister_id text,   -- No FK
  entity_id text,     -- Generic reference (e.g., player who received card)

  created_at timestamptz DEFAULT now(),

  CONSTRAINT game_events_order_unique UNIQUE (game_id, order_index)
);

-- Player Assessments
CREATE TABLE player_assessments (
  id text PRIMARY KEY,  -- Format: assessment_{game_id}_{player_id}
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id text NOT NULL, -- No FK (graceful degradation)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  overall_rating numeric(3,1) CHECK (overall_rating BETWEEN 1 AND 10),

  -- Slider ratings (1-10, step 0.5 in UI)
  intensity numeric(3,1) CHECK (intensity BETWEEN 1 AND 10),
  courage numeric(3,1) CHECK (courage BETWEEN 1 AND 10),
  duels numeric(3,1) CHECK (duels BETWEEN 1 AND 10),
  technique numeric(3,1) CHECK (technique BETWEEN 1 AND 10),
  creativity numeric(3,1) CHECK (creativity BETWEEN 1 AND 10),
  decisions numeric(3,1) CHECK (decisions BETWEEN 1 AND 10),
  awareness numeric(3,1) CHECK (awareness BETWEEN 1 AND 10),
  teamwork numeric(3,1) CHECK (teamwork BETWEEN 1 AND 10),
  fair_play numeric(3,1) CHECK (fair_play BETWEEN 1 AND 10),
  impact numeric(3,1) CHECK (impact BETWEEN 1 AND 10),

  notes text,
  minutes_played integer,
  created_by text DEFAULT 'coach',
  created_at bigint NOT NULL,  -- Unix timestamp milliseconds (matches TypeScript number)

  CONSTRAINT player_assessments_game_player_unique UNIQUE (game_id, player_id)
);

-- Game Tactical Data
CREATE TABLE game_tactical_data (
  id text PRIMARY KEY,  -- Can use game_id as id (1:1 relationship)
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Opponents
  opponents jsonb DEFAULT '[]'::jsonb,

  -- Field drawings
  drawings jsonb DEFAULT '[]'::jsonb,

  -- Tactical board
  tactical_discs jsonb DEFAULT '[]'::jsonb,
  tactical_drawings jsonb DEFAULT '[]'::jsonb,
  tactical_ball_position jsonb,

  -- Interval logs
  completed_interval_durations jsonb DEFAULT '[]'::jsonb,
  last_sub_confirmation_time_seconds numeric(10,3),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Player Adjustments
CREATE TABLE player_adjustments (
  id text PRIMARY KEY,  -- Format: adj_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id text NOT NULL, -- No FK (graceful degradation)
  season_id text REFERENCES seasons(id) ON DELETE SET NULL,
  team_id text,  -- No FK: can be "External" or other non-team values
  tournament_id text REFERENCES tournaments(id) ON DELETE SET NULL,

  external_team_name text,
  opponent_name text,
  score_for integer,
  score_against integer,
  game_date date,
  home_or_away text CHECK (home_or_away IN ('home', 'away', 'neutral')),
  include_in_season_tournament boolean DEFAULT false,

  games_played_delta integer DEFAULT 0,
  goals_delta integer DEFAULT 0,
  assists_delta integer DEFAULT 0,
  fair_play_cards_delta integer DEFAULT 0,

  note text,
  created_by text,
  applied_at timestamptz DEFAULT now(),

  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

-- Players
CREATE INDEX idx_players_user_id ON players(user_id);

-- Seasons
CREATE INDEX idx_seasons_user_id ON seasons(user_id);
CREATE INDEX idx_seasons_archived ON seasons(user_id, archived);
CREATE INDEX idx_seasons_dates ON seasons(user_id, start_date, end_date);
CREATE INDEX idx_seasons_game_type ON seasons(user_id, game_type);
CREATE INDEX idx_seasons_gender ON seasons(user_id, gender);

-- Tournaments
CREATE INDEX idx_tournaments_user_id ON tournaments(user_id);
CREATE INDEX idx_tournaments_archived ON tournaments(user_id, archived);
CREATE INDEX idx_tournaments_dates ON tournaments(user_id, start_date, end_date);
CREATE INDEX idx_tournaments_awarded_player ON tournaments(awarded_player_id);
CREATE INDEX idx_tournaments_game_type ON tournaments(user_id, game_type);
CREATE INDEX idx_tournaments_gender ON tournaments(user_id, gender);

-- Personnel
CREATE INDEX idx_personnel_user_id ON personnel(user_id);

-- Warmup Plans
CREATE INDEX idx_warmup_plans_user_id ON warmup_plans(user_id);

-- Teams
CREATE INDEX idx_teams_user_id ON teams(user_id);
CREATE INDEX idx_teams_archived ON teams(user_id, archived);

-- Team Players
CREATE INDEX idx_team_players_team_id ON team_players(team_id);
CREATE INDEX idx_team_players_player_id ON team_players(player_id);
CREATE INDEX idx_team_players_user_id ON team_players(user_id);

-- Games
CREATE INDEX idx_games_user_id ON games(user_id);
CREATE INDEX idx_games_team_id ON games(team_id);
CREATE INDEX idx_games_season_id ON games(season_id);
CREATE INDEX idx_games_tournament_id ON games(tournament_id);
CREATE INDEX idx_games_date ON games(user_id, game_date DESC);
CREATE INDEX idx_games_status ON games(user_id, game_status);
CREATE INDEX idx_games_game_type ON games(user_id, game_type);
CREATE INDEX idx_games_gender ON games(user_id, gender);

-- Game Players
CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_players_player_id ON game_players(player_id);
CREATE INDEX idx_game_players_on_field ON game_players(game_id, on_field);
CREATE INDEX idx_game_players_is_selected ON game_players(game_id, is_selected);
CREATE INDEX idx_game_players_user_id ON game_players(user_id);

-- Game Events
CREATE INDEX idx_game_events_game_id ON game_events(game_id);
CREATE INDEX idx_game_events_order ON game_events(game_id, order_index);
CREATE INDEX idx_game_events_time ON game_events(game_id, time_seconds);
CREATE INDEX idx_game_events_type ON game_events(game_id, event_type);
CREATE INDEX idx_game_events_user_id ON game_events(user_id);

-- Player Assessments
CREATE INDEX idx_player_assessments_game_id ON player_assessments(game_id);
CREATE INDEX idx_player_assessments_player_id ON player_assessments(player_id);
CREATE INDEX idx_player_assessments_user_id ON player_assessments(user_id);

-- Game Tactical Data
CREATE INDEX idx_game_tactical_data_game_id ON game_tactical_data(game_id);
CREATE INDEX idx_game_tactical_data_user_id ON game_tactical_data(user_id);

-- Player Adjustments
CREATE INDEX idx_player_adjustments_user_id ON player_adjustments(user_id);
CREATE INDEX idx_player_adjustments_player_id ON player_adjustments(player_id);
CREATE INDEX idx_player_adjustments_season_id ON player_adjustments(season_id);
CREATE INDEX idx_player_adjustments_tournament_id ON player_adjustments(tournament_id);
