# Supabase PostgreSQL Schema

**Status**: Proposed Design (Revised v15)
**Last Updated**: 2026-01-12 (v15: RPC upsert lists all columns explicitly)
**Target**: Premium/Cloud Backend
**Related**: [Current Storage Schema](./current-storage-schema.md) | [Dual-Backend Architecture](../architecture/dual-backend-architecture.md) | [Migration Strategy](../../03-active-plans/backend-evolution/migration-strategy.md)

## Overview

This document defines the **target PostgreSQL schema** for MatchOps-Local's cloud backend using Supabase. This schema transforms the current key-value storage model into a normalized relational database optimized for multi-user access, data integrity, and query performance.

**Design Principles**:
- **User Isolation**: Every table has `user_id` for Row Level Security (RLS)
- **ID Preservation**: Application IDs are `text` (not `uuid`) to preserve `{prefix}_{timestamp}_{random}` format used for chronological sorting
- **Referential Integrity**: Foreign keys with appropriate `ON DELETE` behaviors
- **Backward Compatibility**: Data migrations must preserve all current functionality
- **Normalization**: Avoid data duplication while maintaining query performance
- **Soft Deletes**: `archived` flags instead of hard deletes for seasons/tournaments
- **Timestamps**: Track creation and modification times

## Critical: ID Strategy

**App uses prefixed string IDs**, not UUIDs:
```typescript
// src/utils/idGenerator.ts
function generateId(prefix: string): string {
  const timestamp = Date.now();
  const randomPart = generateRandomPart();
  return `${prefix}_${timestamp}_${randomPart}`;  // e.g., "player_1703123456789_a1b2c"
}

// Timestamp extraction for chronological sorting
function extractTimestampFromId(id: string): number {
  const parts = id.split('_');
  return parts.length >= 2 ? parseInt(parts[1], 10) || 0 : 0;
}
```

**Schema uses `text PRIMARY KEY`** for all entity IDs to:
1. Preserve existing IDs during migration (no data transformation needed)
2. Support `extractTimestampFromId()` for chronological sorting
3. Enable offline ID generation (no server round-trip)

**Exception**: `user_id` remains `uuid` as it comes from Supabase Auth.

**Legacy ID Preservation**: Test data and production installations contain IDs that predate the `{prefix}_{timestamp}_{random}` format (e.g., `p1`, `p2`, `player-1745687645300-6fq88`). These legacy IDs MUST be preserved as-is during migration. The new ID format only applies to entities created after the cloud backend is enabled. Schema `text` type accommodates any string ID format.

## Schema Overview

```
users (Supabase Auth)
 ├── teams
 │    └── team_players
 ├── seasons
 ├── tournaments
 │    └── series (jsonb column, not separate table)
 ├── players (master roster)
 ├── personnel
 ├── games
 │    ├── game_players
 │    ├── game_events
 │    ├── player_assessments
 │    └── game_tactical_data
 ├── player_adjustments
 ├── warmup_plans
 ├── user_settings
 └── user_consents (GDPR compliance)
```

## Core Tables

### 1. `users` (Managed by Supabase Auth)

Supabase Auth handles user management. We reference `auth.users.id` in our tables.

**Not Created by Us**: Managed by Supabase Auth system
**Referenced by**: All user-owned data via `user_id` column

```sql
-- Reference only, managed by Supabase
auth.users
  id uuid PRIMARY KEY
  email text UNIQUE
  created_at timestamptz
  ...
```

### 2. `teams`

User's teams (multi-team support).

```sql
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

  -- NOTE: LocalDataStore uses composite uniqueness (name + context bindings + gameType)
  -- Database uses simple name uniqueness; app-level validation handles composite rules
  CONSTRAINT teams_name_user_unique UNIQUE (user_id, name)
);

CREATE INDEX idx_teams_user_id ON teams(user_id);
CREATE INDEX idx_teams_archived ON teams(user_id, archived);

-- RLS Policy
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own teams"
  ON teams FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `TEAMS_INDEX_KEY` stored as `Record<teamId, Team>` (NOT a JSON array)
- Migration: `Object.values(teamsIndex)` → `teams` table rows
- ID format preserved: `team_1234567890_abcde`
- Client-side ID generation maintained for offline support

### 3. `team_players`

Players within a team (normalized from `TEAM_ROSTERS_KEY`).

**CRITICAL DESIGN NOTE**: The app reuses master roster player IDs across teams. A single player (e.g., `player_123`) can appear on multiple teams. Therefore:
- `player_id` stores the master roster ID (the original player's ID)
- `id` is a generated composite key `{team_id}_{player_id}` ensuring uniqueness
- The same player on different teams = different rows with different `id` values

```sql
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
  -- NOTE: No name uniqueness constraint - app allows duplicate player names within team
  -- Ensure same player can't be added twice to same team
  CONSTRAINT team_players_team_player_unique UNIQUE (team_id, player_id)
);

CREATE INDEX idx_team_players_team_id ON team_players(team_id);
CREATE INDEX idx_team_players_player_id ON team_players(player_id);
CREATE INDEX idx_team_players_user_id ON team_players(user_id);

-- RLS Policy
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own team players"
  ON team_players FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `TEAM_ROSTERS_KEY` object → `team_players` table
- `{ [teamId]: TeamPlayer[] }` → rows with `team_id` foreign key
- **ID Transform**: Original `player.id` becomes `player_id`; new `id` = `{team_id}_{player_id}`
- Same player on multiple teams creates separate rows (different `id`, same `player_id`)
- Denormalize `user_id` for efficient RLS filtering

### 4. `players` (Master Roster)

Global player roster (single-team mode or shared across teams).

```sql
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

CREATE INDEX idx_players_user_id ON players(user_id);

-- RLS Policy
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own players"
  ON players FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `MASTER_ROSTER_KEY` JSON array → `players` table rows
- Used when user doesn't have multi-team setup
- `relX`/`relY` fields NOT stored here (ephemeral per-game data)

### 5. `seasons`

Season definitions with full field coverage.

```sql
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
  team_placements jsonb DEFAULT '{}'::jsonb,  -- { [teamId]: { placement: 1, award?: "Champion", note?: "..." } }

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- NOTE: LocalDataStore uses composite uniqueness (name + clubSeason + gameType + gender + ageGroup + leagueId)
  -- Database uses simple name uniqueness; app-level validation handles composite rules
  CONSTRAINT seasons_name_user_unique UNIQUE (user_id, name)
);

CREATE INDEX idx_seasons_user_id ON seasons(user_id);
CREATE INDEX idx_seasons_archived ON seasons(user_id, archived);
CREATE INDEX idx_seasons_dates ON seasons(user_id, start_date, end_date);
CREATE INDEX idx_seasons_game_type ON seasons(user_id, game_type);
CREATE INDEX idx_seasons_gender ON seasons(user_id, gender);

-- RLS Policy
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own seasons"
  ON seasons FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `SEASONS_LIST_KEY` JSON array → `seasons` table rows
- `gameDates` string array → PostgreSQL `date[]` array
- `teamPlacements` object → `jsonb` column

### 6. `tournaments`

Tournament definitions with series support.

```sql
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
  team_placements jsonb DEFAULT '{}'::jsonb,  -- { [teamId]: { placement: 1, award?: "Champion", note?: "..." } }

  -- Tournament series (multiple competition levels)
  series jsonb DEFAULT '[]'::jsonb,  -- [{ id: "series_...", level: "Elite" }, ...]

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- NOTE: LocalDataStore uses composite uniqueness (name + clubSeason + gameType + gender + ageGroup)
  -- Database uses simple name uniqueness; app-level validation handles composite rules
  CONSTRAINT tournaments_name_user_unique UNIQUE (user_id, name)
);

CREATE INDEX idx_tournaments_user_id ON tournaments(user_id);
CREATE INDEX idx_tournaments_archived ON tournaments(user_id, archived);
CREATE INDEX idx_tournaments_dates ON tournaments(user_id, start_date, end_date);
CREATE INDEX idx_tournaments_awarded_player ON tournaments(awarded_player_id);
CREATE INDEX idx_tournaments_game_type ON tournaments(user_id, game_type);
CREATE INDEX idx_tournaments_gender ON tournaments(user_id, gender);

-- RLS Policy
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own tournaments"
  ON tournaments FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `TOURNAMENTS_LIST_KEY` JSON array → `tournaments` table rows
- `awardedPlayerId` → `awarded_player_id` (intentionally no FK for graceful degradation)
- `series[]` array stored as jsonb (rarely queried individually)

### 7. `personnel`

Coaches, trainers, and other team staff.

```sql
CREATE TABLE personnel (
  id text PRIMARY KEY,  -- Format: personnel_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'other',  -- PersonnelRole enum: 'head_coach', 'assistant_coach', 'goalkeeper_coach',
                                       -- 'fitness_coach', 'physio', 'team_manager', 'support_staff', 'other'
  email text,
  phone text,
  certifications text[] DEFAULT '{}',  -- e.g., ['UEFA A License', 'First Aid']
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT personnel_name_user_unique UNIQUE (user_id, name)
);

CREATE INDEX idx_personnel_user_id ON personnel(user_id);

-- RLS Policy
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own personnel"
  ON personnel FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `PERSONNEL_KEY` stored as `Record<personnelId, Personnel>` (NOT a JSON array)
- Migration: `Object.values(personnelIndex)` → `personnel` table rows
- Personnel referenced by `gamePersonnel` array in games
- `certifications` stored as PostgreSQL text array

### 8. `games`

Core game records with metadata and scores.

```sql
CREATE TABLE games (
  id text PRIMARY KEY,  -- Format: game_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id text REFERENCES teams(id) ON DELETE SET NULL,

  -- Season/Tournament associations (nullable - games can be unassigned)
  season_id text REFERENCES seasons(id) ON DELETE SET NULL,  -- NULLABLE: games can exist without season
  tournament_id text REFERENCES tournaments(id) ON DELETE SET NULL,
  tournament_series_id text,  -- References series within tournament (no FK, stored in tournament.series jsonb)
  tournament_level text,      -- Legacy field, use tournament_series_id for new games

  -- Game metadata
  team_name text NOT NULL,
  opponent_name text NOT NULL,
  game_date date NOT NULL,
  game_time time,
  game_location text,
  home_or_away text NOT NULL DEFAULT 'home' CHECK (home_or_away IN ('home', 'away')),  -- Required; 'home' is common default
  age_group text,

  -- Configuration
  number_of_periods integer NOT NULL DEFAULT 2 CHECK (number_of_periods IN (1, 2)),  -- Required; 2 periods is standard
  period_duration_minutes integer NOT NULL,
  sub_interval_minutes integer,
  demand_factor numeric(4,2) CHECK (demand_factor BETWEEN 0.1 AND 10),  -- App allows 0.1-10 range

  -- Game state
  game_status text NOT NULL DEFAULT 'notStarted' CHECK (game_status IN ('notStarted', 'inProgress', 'periodEnd', 'gameEnd')),
  current_period integer NOT NULL DEFAULT 1,  -- Starts at period 1
  is_played boolean NOT NULL DEFAULT true,  -- LocalDataStore defaults to true for new games
  time_elapsed_in_seconds numeric(10,3),  -- Timer state; 3 decimals matches app precision (123.456)

  -- Score
  home_score integer NOT NULL DEFAULT 0,
  away_score integer NOT NULL DEFAULT 0,

  -- Settings
  show_player_names boolean NOT NULL DEFAULT true,
  game_notes text NOT NULL DEFAULT '',  -- Required in TypeScript, empty string is valid

  -- Game type and gender
  game_type text CHECK (game_type IN ('soccer', 'futsal')),
  gender text CHECK (gender IN ('boys', 'girls')),

  -- League (can override season's league)
  league_id text,
  custom_league_name text,

  -- Personnel assigned to this game (array of personnel IDs)
  game_personnel text[] DEFAULT '{}',

  -- Formation snap points for positioning assistance
  formation_snap_points jsonb,  -- [{ relX: 0.5, relY: 0.3 }, ...]

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_games_user_id ON games(user_id);
CREATE INDEX idx_games_team_id ON games(team_id);
CREATE INDEX idx_games_season_id ON games(season_id);
CREATE INDEX idx_games_tournament_id ON games(tournament_id);
CREATE INDEX idx_games_date ON games(user_id, game_date DESC);
CREATE INDEX idx_games_status ON games(user_id, game_status);
CREATE INDEX idx_games_game_type ON games(user_id, game_type);
CREATE INDEX idx_games_gender ON games(user_id, gender);

-- RLS Policy
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own games"
  ON games FOR ALL
  USING (auth.uid() = user_id);
```

**Foreign Key Behaviors**:
- `season_id`: `SET NULL` - games survive season deletion (can be reassigned)
- `tournament_id`: `SET NULL` - games survive tournament deletion
- `team_id`: `SET NULL` - games survive team deletion (graceful degradation)

**Migration Notes**:
- `SAVED_GAMES_KEY` object keys → `games.id`
- Nested objects (`playersOnField`, `opponents`, `drawings`, etc.) → separate tables
- Empty strings → NULL for all nullable fields (see [Empty String Normalization](#empty-string-normalization) for complete list: `seasonId`, `tournamentId`, `teamId`, `gameTime`, `gameLocation`, `tournamentLevel`, `ageGroup`)

### 9. `game_players`

Players selected for a game with field positions and bench status.

```sql
CREATE TABLE game_players (
  id text PRIMARY KEY,  -- Can use format: {game_id}_{player_id} for uniqueness
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id text NOT NULL, -- Always the master roster ID (player_{ts}_{random}), NOT composite team_players.id
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Player snapshot (for deleted players and historical accuracy)
  player_name text NOT NULL,
  nickname text,
  jersey_number text,
  is_goalie boolean DEFAULT false,
  color text,
  notes text,                                    -- Player notes at time of game
  received_fair_play_card boolean DEFAULT false, -- Fair play card status

  -- Selection and field status
  is_selected boolean DEFAULT false, -- True if player was selected for this game (part of selectedPlayerIds)
  on_field boolean DEFAULT false,    -- True if player is currently positioned on field
  rel_x double precision, -- Field position (0.0 to 1.0, arbitrary precision)
  rel_y double precision,

  created_at timestamptz DEFAULT now(),

  CONSTRAINT game_players_game_player_unique UNIQUE (game_id, player_id)
  -- NOTE: No on_field→is_selected constraint. Real data has players on field
  -- who were not explicitly in selectedPlayerIds (likely added during game).
  -- Transform layer normalizes: is_selected = true when on_field = true.
);

CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_players_player_id ON game_players(player_id);
CREATE INDEX idx_game_players_on_field ON game_players(game_id, on_field);
CREATE INDEX idx_game_players_is_selected ON game_players(game_id, is_selected);
CREATE INDEX idx_game_players_user_id ON game_players(user_id);  -- RLS performance

-- RLS Policy
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own game players"
  ON game_players FOR ALL
  USING (auth.uid() = user_id);
```

**Design Decision**: No FK constraint on `player_id` allows:
- Players deleted from roster still appear in historical games
- Player names snapshotted for cross-device imports
- Graceful degradation (UI shows snapshot name if player deleted)

**Migration Notes**:
- `AppState.playersOnField` → `game_players` (on_field=true, is_selected=true)
- `AppState.availablePlayers` → `game_players` (one row per player)
- `AppState.selectedPlayerIds` → **Stored via `is_selected` column**: Players in selectedPlayerIds have `is_selected=true`. Players on field are also marked `is_selected=true` (normalized). Reconstruct by filtering `game_players WHERE is_selected = true`.

### 10. `game_events`

Events during a game (goals, substitutions, cards) with **order preservation**.

```sql
CREATE TABLE game_events (
  id text PRIMARY KEY,  -- Format: event_{timestamp}_{random}
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  event_type text NOT NULL CHECK (event_type IN (
    'goal', 'opponentGoal', 'substitution', 'periodEnd', 'gameEnd', 'fairPlayCard'
  )),
  time_seconds numeric(10,2) NOT NULL, -- Seconds elapsed (supports 2 decimal precision)

  -- Order index for preserving insertion order (critical for index-based operations)
  order_index integer NOT NULL,  -- 0, 1, 2, ... within game

  scorer_id text,     -- No FK (player may be deleted)
  assister_id text,   -- No FK
  entity_id text,     -- Generic reference (e.g., player who received card)

  created_at timestamptz DEFAULT now(),

  CONSTRAINT game_events_order_unique UNIQUE (game_id, order_index)
);

CREATE INDEX idx_game_events_game_id ON game_events(game_id);
CREATE INDEX idx_game_events_order ON game_events(game_id, order_index);
CREATE INDEX idx_game_events_time ON game_events(game_id, time_seconds);
CREATE INDEX idx_game_events_type ON game_events(game_id, event_type);
CREATE INDEX idx_game_events_user_id ON game_events(user_id);  -- RLS performance

-- RLS Policy
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own game events"
  ON game_events FOR ALL
  USING (auth.uid() = user_id);
```

**Critical: Order Index**
The `order_index` column preserves insertion order for index-based DataStore operations:
- `updateGameEvent(gameId, eventIndex, event)` uses `order_index` to find event
- `removeGameEvent(gameId, eventIndex)` uses `order_index` to identify event
- Events at same `time_seconds` are distinguished by `order_index`

**Migration Notes**:
- `AppState.gameEvents[]` → `game_events` table rows
- Array index becomes `order_index`
- No foreign keys on player references (graceful degradation)

### 11. `player_assessments`

Player performance assessments per game.

```sql
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

CREATE INDEX idx_player_assessments_game_id ON player_assessments(game_id);
CREATE INDEX idx_player_assessments_player_id ON player_assessments(player_id);
CREATE INDEX idx_player_assessments_user_id ON player_assessments(user_id);  -- RLS performance

-- RLS Policy
ALTER TABLE player_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own player assessments"
  ON player_assessments FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `AppState.assessments[playerId]` → `player_assessments` rows
- `assessments[id].sliders.intensity` → `intensity` column (flattened)

### 12. `game_tactical_data`

Tactical board data (opponents, drawings, ball position).

```sql
CREATE TABLE game_tactical_data (
  id text PRIMARY KEY,  -- Can use game_id as id (1:1 relationship)
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Opponents
  opponents jsonb DEFAULT '[]'::jsonb, -- [{ id, relX, relY }]

  -- Field drawings
  drawings jsonb DEFAULT '[]'::jsonb, -- [[ { relX, relY }, ... ]]

  -- Tactical board
  tactical_discs jsonb DEFAULT '[]'::jsonb, -- [{ id, relX, relY, type }]
  tactical_drawings jsonb DEFAULT '[]'::jsonb, -- [[ { relX, relY }, ... ]]
  tactical_ball_position jsonb, -- { relX, relY } | null

  -- Interval logs
  completed_interval_durations jsonb DEFAULT '[]'::jsonb, -- [{ period, duration, timestamp }]
  last_sub_confirmation_time_seconds numeric(10,3),  -- Derived from timer; 3 decimals matches app precision

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_game_tactical_data_game_id ON game_tactical_data(game_id);
CREATE INDEX idx_game_tactical_data_user_id ON game_tactical_data(user_id);  -- RLS performance

-- RLS Policy
ALTER TABLE game_tactical_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own game tactical data"
  ON game_tactical_data FOR ALL
  USING (auth.uid() = user_id);
```

**Design Decision**: Store complex arrays as `jsonb` rather than normalized tables:
- **Why**: These are tightly coupled to a single game
- **Benefit**: Simpler queries, atomic updates, less join overhead
- **Trade-off**: Can't query individual points (not needed)

**Migration Notes**:
- All array fields from `AppState` (opponents, drawings, tactical data) → jsonb columns
- Single row per game for efficient retrieval

### 13. `player_adjustments`

Manual stat adjustments for external games.

```sql
CREATE TABLE player_adjustments (
  id text PRIMARY KEY,  -- Format: adj_{timestamp}_{random} (matches generateId('adj'))
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
  home_or_away text CHECK (home_or_away IN ('home', 'away', 'neutral')),  -- Allows 'neutral' (unlike games) for external/practice games
  include_in_season_tournament boolean DEFAULT false,  -- Match UI default (false)

  games_played_delta integer DEFAULT 0,
  goals_delta integer DEFAULT 0,
  assists_delta integer DEFAULT 0,
  fair_play_cards_delta integer DEFAULT 0,

  note text,
  created_by text,
  applied_at timestamptz DEFAULT now(),

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_player_adjustments_user_id ON player_adjustments(user_id);
CREATE INDEX idx_player_adjustments_player_id ON player_adjustments(player_id);
CREATE INDEX idx_player_adjustments_season_id ON player_adjustments(season_id);
CREATE INDEX idx_player_adjustments_tournament_id ON player_adjustments(tournament_id);

-- RLS Policy
ALTER TABLE player_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own player adjustments"
  ON player_adjustments FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `PLAYER_ADJUSTMENTS_KEY` stored as `Record<playerId, PlayerStatAdjustment[]>` (NOT a flat array)
- Migration must flatten: `Object.values(record).flat()` → `player_adjustments` table rows
- Each adjustment already contains `playerId`, so no data loss

### 14. `warmup_plans`

User-customizable warmup plans with section-based content.

```sql
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

CREATE INDEX idx_warmup_plans_user_id ON warmup_plans(user_id);

-- RLS Policy
ALTER TABLE warmup_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own warmup plans"
  ON warmup_plans FOR ALL
  USING (auth.uid() = user_id);
```

**TypeScript Interface** (for reference):
```typescript
interface WarmupPlan {
  id: string;
  version: number;
  lastModified: string;  // ISO timestamp
  isDefault: boolean;
  sections: WarmupPlanSection[];
}

interface WarmupPlanSection {
  id: string;
  title: string;
  content: string;  // Free-form text content
}
```

**Migration Notes**:
- `WARMUP_PLAN_KEY` JSON → `warmup_plans` table (single row per user)
- `sections` array stored as jsonb with structure: `[{ id, title, content }]`
- `lastModified` string → `last_modified` timestamptz

### 15. `user_settings`

Application settings per user.

```sql
CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  current_game_id text, -- No FK (may reference archived game)
  last_home_team_name text,
  language text DEFAULT 'fi',
  has_seen_app_guide boolean DEFAULT false,
  use_demand_correction boolean DEFAULT false,
  is_drawing_mode_enabled boolean DEFAULT false,

  -- Club season dates (ISO format YYYY-MM-DD, stored as text to match app)
  club_season_start_date text DEFAULT '2000-11-15',  -- Default: November 15th (matches clubSeasonDefaults.ts)
  club_season_end_date text DEFAULT '2000-10-20',    -- Default: October 20th (matches clubSeasonDefaults.ts)
  has_configured_season_dates boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS Policy
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `APP_SETTINGS_KEY` JSON object → `user_settings` single row per user
- One row per user (upsert pattern)
- Date strings preserved as-is (not converted to integers)
- **Deprecated fields (silently dropped during migration)**:
  - `autoBackupEnabled`, `autoBackupIntervalHours`, `lastBackupTime`, `backupEmail`
  - `encryptionEnabled`, `encryptionPassphrase`, `backupIntervalDays`, `lastBackupAt`
  - These were experimental/unused features in older app versions. Cloud mode has server-side backups.

### 16. `user_consents`

Tracks user consent for Terms of Service and Privacy Policy (GDPR compliance).

```sql
CREATE TABLE user_consents (
  id text PRIMARY KEY,  -- Format: consent_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('terms_and_privacy', 'marketing')),
  policy_version text NOT NULL,  -- e.g., '2025-01' for January 2025 policy
  consented_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,  -- Optional: for audit trail
  user_agent text,  -- Optional: browser/device info
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_user_consents_user_id ON user_consents(user_id);

-- Unique constraint prevents duplicate consent records for same user/type/version
-- This is defense-in-depth: RPC also uses ON CONFLICT DO NOTHING
CREATE UNIQUE INDEX idx_user_consents_unique
  ON user_consents(user_id, consent_type, policy_version);

-- RLS Policy
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own consents"
  ON user_consents FOR ALL
  USING (auth.uid() = user_id);
```

**GDPR Compliance Notes**:
- **Consent is demonstrable**: Server-side record with timestamp proves when user agreed
- **Policy versioning**: `policy_version` tracks which version of Terms/Privacy was accepted
- **Re-consent required**: When policies change, check if user has consented to new version
- **Audit trail**: Optional IP/user agent for legal compliance
- **Data retention**: Consent records should be retained even after account deletion (legal requirement)

**Usage Pattern**:
- Record consent during sign-up via `record_user_consent()` RPC
- Check consent version on login to detect outdated consent
- Query latest consent for a user: `SELECT * FROM user_consents WHERE user_id = ? AND consent_type = 'terms_and_privacy' ORDER BY consented_at DESC LIMIT 1`

### Timer State: LOCAL ONLY

**Timer state is NOT stored in Supabase.** It remains in local storage because:
- **Ephemeral session data**: Only needed during active game
- **High update frequency**: Every second during play
- **Not critical to sync**: Timer restored from `time_elapsed_in_seconds` on games table
- **Cost considerations**: Frequent writes increase Supabase costs

The `games.time_elapsed_in_seconds` column stores the last known timer value for game restoration.

---

## Transaction Strategy: RPC Functions

Multi-table operations (especially game creation/updates) require atomic transactions.
Supabase doesn't support client-side multi-table transactions, so we use **RPC functions**.

### Game Save Transaction

```sql
-- Function to atomically save a game with all related data
-- SECURITY: Uses auth.uid() for all operations - ignores client-provided user_id
-- NOTE: SET search_path prevents privilege escalation attacks
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
  INSERT INTO game_players
  SELECT * FROM jsonb_populate_recordset(null::game_players,
    (SELECT jsonb_agg(
      jsonb_set(
        jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
        '{game_id}', to_jsonb(v_game_id)  -- Force correct game_id
      )
    )
    FROM unnest(p_players) elem));

  -- Delete and re-insert events (inject user_id AND game_id)
  DELETE FROM game_events WHERE game_id = v_game_id AND user_id = v_user_id;
  INSERT INTO game_events
  SELECT * FROM jsonb_populate_recordset(null::game_events,
    (SELECT jsonb_agg(
      jsonb_set(
        jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
        '{game_id}', to_jsonb(v_game_id)  -- Force correct game_id
      )
    )
    FROM unnest(p_events) elem));

  -- Upsert assessments (inject user_id AND game_id)
  DELETE FROM player_assessments WHERE game_id = v_game_id AND user_id = v_user_id;
  INSERT INTO player_assessments
  SELECT * FROM jsonb_populate_recordset(null::player_assessments,
    (SELECT jsonb_agg(
      jsonb_set(
        jsonb_set(elem, '{user_id}', to_jsonb(v_user_id::text)),
        '{game_id}', to_jsonb(v_game_id)  -- Force correct game_id
      )
    )
    FROM unnest(p_assessments) elem));

  -- Upsert tactical data (inject user_id AND game_id)
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

END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION save_game_with_relations FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_game_with_relations TO authenticated;
```

**CRITICAL: Payload Field Requirements**

The RPC function uses `jsonb_populate_record` which requires each JSON object to include ALL required columns. The transform layer (client-side) MUST inject these fields before calling RPC:

| Table | Required Fields to Inject |
|-------|--------------------------|
| `games` | `id`, `user_id` (from auth.uid()) |
| `game_players` | `id` (format: `{game_id}_{player_id}`), `user_id`, `game_id` |
| `game_events` | `id`, `user_id`, `game_id`, `order_index` |
| `player_assessments` | `id` (format: `assessment_{game_id}_{player_id}`), `user_id`, `game_id` |
| `game_tactical_data` | `id` (can be same as `game_id`), `user_id`, `game_id` |

Example transform:
```typescript
// In transformGameToTables()
players: game.playersOnField.map((p) => ({
  id: `${gameId}_${p.id}`,           // Generated composite key
  game_id: gameId,                    // Injected
  user_id: userId,                    // Injected (from auth context)
  player_id: p.id,
  player_name: p.name,
  // ... other fields
})),
```

### Usage from Client

```typescript
// SupabaseDataStore.ts
async saveGame(gameId: string, game: AppState): Promise<AppState> {
  const tables = transformGameToTables(gameId, game, this.userId!);

  const { data, error } = await this.client!.rpc('save_game_with_relations', {
    p_game: tables.game,
    p_players: tables.players,
    p_events: tables.events,
    p_assessments: tables.assessments,
    p_tactical_data: tables.tacticalData,
  });

  if (error) throw new StorageError(`Failed to save game: ${error.message}`);
  return game;
}
```

### Personnel Cascade Delete

```sql
-- Function to delete personnel and remove from all games
-- SECURITY: Uses auth.uid() - ignores any client-provided user_id
-- NOTE: SET search_path prevents privilege escalation attacks
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
```

**Note**: The `p_user_id` parameter was removed - the function now uses `auth.uid()` exclusively to prevent cross-user operations.

### Clear All User Data (Atomic)

```sql
-- Function to atomically delete ALL user data
-- SECURITY: Uses auth.uid() exclusively - no client-provided user_id
-- ATOMIC: All deletions in single transaction - all-or-nothing semantics
-- ORDER: Child tables first to respect FK constraints (CASCADE would handle it, but explicit is clearer)
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete in order: child tables first, then parent tables
  -- This respects FK constraints even though CASCADE would handle most

  -- Game child tables (would CASCADE from games, but explicit is clearer)
  DELETE FROM game_events WHERE user_id = v_user_id;
  DELETE FROM game_players WHERE user_id = v_user_id;
  DELETE FROM game_tactical_data WHERE user_id = v_user_id;
  DELETE FROM player_assessments WHERE user_id = v_user_id;

  -- Games (SET NULL on seasons/tournaments/teams)
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
  DELETE FROM user_settings WHERE user_id = v_user_id;

  -- Success - transaction commits automatically
END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION clear_all_user_data FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_all_user_data TO authenticated;
```

**Note**: `user_consents` is intentionally NOT deleted by `clear_all_user_data()`. Consent records must be retained for GDPR compliance even after account deletion to prove consent was given.

**Why RPC instead of sequential client-side deletes?**
- **Atomicity**: Single PostgreSQL transaction ensures all-or-nothing semantics
- **Network resilience**: One round-trip instead of 14 (one per table)
- **No partial state**: If any delete fails, entire transaction rolls back
- **Performance**: Database executes deletes in sequence without network latency

### Record User Consent (GDPR)

```sql
-- Function to record user consent for Terms/Privacy Policy
-- SECURITY: Uses auth.uid() exclusively - cannot record consent for other users
-- IDEMPOTENT: Safe to call multiple times with same version
CREATE OR REPLACE FUNCTION record_user_consent(
  p_consent_type text,
  p_policy_version text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- REQUIRED: Prevents search_path injection
AS $$
DECLARE
  v_user_id uuid;
  v_consent_id text;
  v_result jsonb;
BEGIN
  -- CRITICAL: Get authenticated user ID from Supabase Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate consent_type
  IF p_consent_type NOT IN ('terms_and_privacy', 'marketing') THEN
    RAISE EXCEPTION 'Invalid consent_type: %', p_consent_type;
  END IF;

  -- Generate consent ID
  v_consent_id := 'consent_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 8);

  -- Insert consent record (idempotent: ON CONFLICT DO NOTHING)
  -- If user already consented to this version, no duplicate is created
  INSERT INTO user_consents (id, user_id, consent_type, policy_version, ip_address, user_agent)
  VALUES (v_consent_id, v_user_id, p_consent_type, p_policy_version, p_ip_address, p_user_agent)
  ON CONFLICT (user_id, consent_type, policy_version) DO NOTHING;

  -- Return the consent record (either newly inserted or existing)
  SELECT jsonb_build_object(
    'id', uc.id,
    'user_id', uc.user_id,
    'consent_type', uc.consent_type,
    'policy_version', uc.policy_version,
    'consented_at', uc.consented_at
  ) INTO v_result
  FROM user_consents uc
  WHERE uc.user_id = v_user_id
    AND uc.consent_type = p_consent_type
    AND uc.policy_version = p_policy_version;

  RETURN v_result;
END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION record_user_consent FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_user_consent TO authenticated;
```

**Check User Consent Version**:

```sql
-- Function to check if user has consented to a specific policy version
-- Returns the latest consent record for the given type, or null if none exists
CREATE OR REPLACE FUNCTION get_user_consent(
  p_consent_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_consent record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, consent_type, policy_version, consented_at
  INTO v_consent
  FROM user_consents
  WHERE user_id = v_user_id AND consent_type = p_consent_type
  ORDER BY consented_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_consent.id,
    'consent_type', v_consent.consent_type,
    'policy_version', v_consent.policy_version,
    'consented_at', v_consent.consented_at
  );
END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION get_user_consent FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_consent TO authenticated;
```

---

## Row Level Security (RLS)

**Every table enforces**: `auth.uid() = user_id`

**Benefits**:
1. **Defense in Depth**: Database enforces access control, not just app logic
2. **Multi-tenancy**: Users can't access other users' data
3. **API Security**: Supabase APIs automatically filter by user

**Policy Pattern**:
```sql
CREATE POLICY "Users can only access their own {table}"
  ON {table} FOR ALL
  USING (auth.uid() = user_id);
```

**Performance**: `user_id` indexed on all tables for efficient RLS filtering

---

## Foreign Key Strategy

### ON DELETE Behaviors

| Parent Table | Child Table | Behavior | Rationale |
|--------------|-------------|----------|-----------|
| `auth.users` | All tables | `CASCADE` | Delete all user data when account deleted |
| `teams` | `team_players` | `CASCADE` | Roster belongs to team (see note below) |
| `teams` | `games` | `SET NULL` | Games survive team deletion |
| `seasons` | `games` | `SET NULL` | Games survive season deletion (can be reassigned) |
| `tournaments` | `games` | `SET NULL` | Games survive tournament deletion |
| `games` | `game_events` | `CASCADE` | Events belong to game |
| `games` | `player_assessments` | `CASCADE` | Assessments belong to game |
| `games` | `game_tactical_data` | `CASCADE` | Tactical data belongs to game |

**Behavior Difference: Team Roster Deletion**

| Mode | Behavior | Rationale |
|------|----------|-----------|
| **Local** | Roster preserved after team delete | Recovery possible; roster data kept for undo |
| **Cloud** | Roster deleted (CASCADE) | Referential integrity; no orphaned data |

This is an **intentional behavior change** for cloud mode:
- Cloud prioritizes data integrity over recovery
- Deleted teams are permanent (no undo in cloud)
- Users should archive teams instead of deleting if roster preservation is desired
- Migration handles this by requiring users to confirm team deletions are intentional

### Intentionally No Foreign Keys

**Player References** (`player_id` in various tables):
- **Reason**: Graceful degradation when players deleted
- **Behavior**: UI shows last known name via snapshot
- **Trade-off**: Risk of orphaned references (acceptable)

**Tournament Awards** (`tournaments.awarded_player_id`):
- **Reason**: Award remains visible even if player deleted
- **Behavior**: UI hides trophy if player not found
- **Trade-off**: More resilient to deletions

**Context Bindings** (`teams.bound_season_id`, etc.):
- **Reason**: Flexible filtering, not strict relationships
- **Behavior**: Invalid bindings ignored during filtering
- **Trade-off**: Simpler schema, no cascade complexity

---

## Migration Data Integrity

### Stale Reference Handling

Local mode doesn't enforce referential integrity. During migration, data may contain orphaned references that would violate FK constraints.

**Migration Transform Requirements**:

| Reference | Strategy |
|-----------|----------|
| `games.season_id` → deleted season | Set to `NULL` if season doesn't exist |
| `games.tournament_id` → deleted tournament | Set to `NULL` if tournament doesn't exist |
| `games.team_id` → deleted team | Set to `NULL` if team doesn't exist |
| `team_rosters` for deleted teams | Skip entirely (team doesn't exist) |
| `player_adjustments.season_id` → deleted | Set to `NULL` if season doesn't exist |
| `player_adjustments.tournament_id` → deleted | Set to `NULL` if tournament doesn't exist |

### Empty String Normalization

The app uses empty string `''` to represent "not set" for optional fields. The database uses `NULL`. Transform layer MUST normalize:

| Field | App Value | DB Value |
|-------|-----------|----------|
| `season_id` | `''` | `NULL` |
| `tournament_id` | `''` | `NULL` |
| `team_id` | `''` | `NULL` |
| `game_time` | `''` | `NULL` |
| `game_location` | `''` | `NULL` |
| `tournament_level` | `''` | `NULL` |
| `age_group` | `''` | `NULL` |

**Critical**: `game_time` accepts empty string in Zod schema (`z.union([z.literal(''), z.string().regex(...)])`). The DB column is `time` type which rejects empty strings - MUST normalize to NULL.

**Implementation**:
```typescript
// In migration service
function sanitizeGameForMigration(game: AppState, validIds: {
  seasons: Set<string>;
  tournaments: Set<string>;
  teams: Set<string>;
}): AppState {
  return {
    ...game,
    seasonId: validIds.seasons.has(game.seasonId) ? game.seasonId : null,
    tournamentId: validIds.tournaments.has(game.tournamentId) ? game.tournamentId : null,
    teamId: validIds.teams.has(game.teamId) ? game.teamId : null,
  };
}
```

### Uniqueness Constraint Conflicts

**Issue**: Schema uses simple `(user_id, name)` uniqueness, but app allows same name with different context:
- Teams: same name allowed with different `boundSeasonId`/`boundTournamentId`/`gameType`
- Seasons: same name allowed with different `clubSeason`/`gameType`/`gender`
- Tournaments: same name allowed with different `clubSeason`/`gameType`/`gender`

**Migration Strategy Options**:

1. **Pre-migration validation** (Recommended):
   - Scan for name collisions before migration
   - Alert user to rename duplicates manually
   - Block migration until resolved

2. **Automatic suffix**:
   - Append context to name if collision detected
   - Example: "Team A" → "Team A (Soccer 24/25)"
   - Risk: User may not recognize renamed entities

3. **Drop DB uniqueness** (Alternative):
   - Remove `CONSTRAINT *_name_user_unique` from schema
   - Rely on app-level validation only
   - Risk: Cloud API could create duplicates bypassing app

**Current Approach**: Schema keeps simple uniqueness with NOTE comments. Migration service should implement Option 1 (pre-migration validation).

---

## Indexes

### Performance Optimization

**Primary Access Patterns**:
1. Get user's entities: `user_id` index (all tables)
2. Get games by season: `season_id` index
3. Get games by date: `(user_id, game_date DESC)` composite
4. Get games by type/gender: `(user_id, game_type)`, `(user_id, gender)`
5. Get team roster: `team_id` index
6. Get game events in order: `(game_id, order_index)` composite
7. Get user's personnel: `user_id` index on personnel table

**Index Strategy**:
- Every `user_id` column indexed (RLS filtering)
- Foreign key columns indexed (join performance)
- Composite indexes for common queries
- Date columns for chronological queries

---

## Data Types

### PostgreSQL ↔ TypeScript Mapping

| PostgreSQL | TypeScript | Notes |
|------------|------------|-------|
| `text` | `string` | Primary keys preserve app format |
| `uuid` | `string` | Only for user_id (from Supabase Auth) |
| `integer` | `number` | 32-bit signed |
| `numeric(5,4)` | `number` | Precise decimals (0.0000-1.0000) |
| `boolean` | `boolean` | true/false |
| `date` | `string` | ISO 8601: "2025-03-15" |
| `time` | `string` | ISO 8601: "14:30:00" |
| `timestamptz` | `string` | ISO 8601: "2025-03-15T14:30:00Z" |
| `jsonb` | `object/array` | Arbitrary JSON |
| `date[]` | `string[]` | Array of ISO dates |
| `text[]` | `string[]` | Array of strings (e.g., game_personnel) |

### ID Generation (Client-Side)

**Strategy**: Preserve existing ID format for offline support
```typescript
// src/utils/idGenerator.ts
const id = generateId('player'); // "player_1703123456789_a1b2c"
```

**Benefits**:
- Works offline (no server round-trip)
- Chronological sorting via `extractTimestampFromId()`
- No migration transformation needed

---

## Migration Mapping

### Key-Value → Relational

| Storage Key | Target Table(s) | Transformation |
|-------------|-----------------|----------------|
| `MASTER_ROSTER_KEY` | `players` | Array → rows |
| `TEAMS_INDEX_KEY` | `teams` | Record<teamId, Team> → flattened rows |
| `TEAM_ROSTERS_KEY` | `team_players` | Object → rows with `team_id` FK |
| `SEASONS_LIST_KEY` | `seasons` | Array → rows |
| `TOURNAMENTS_LIST_KEY` | `tournaments` | Array → rows |
| `PERSONNEL_KEY` | `personnel` | Record<personnelId, Personnel> → flattened rows |
| `SAVED_GAMES_KEY` | `games` + `game_players` + `game_events` + `player_assessments` + `game_tactical_data` | Object → 5 tables |
| `PLAYER_ADJUSTMENTS_KEY` | `player_adjustments` | Record<playerId, []> → flattened rows |
| `WARMUP_PLAN_KEY` | `warmup_plans` | Object → row |
| `APP_SETTINGS_KEY` | `user_settings` | Object → single row |

### Special Transformations

**Empty String → NULL** (all nullable string fields):
```typescript
// Complete list of fields requiring empty-string normalization:
const normalize = (value: string | undefined) => value === '' ? null : value;

// On games table:
const season_id = normalize(game.seasonId);           // games.season_id
const tournament_id = normalize(game.tournamentId);   // games.tournament_id
const tournament_series_id = normalize(game.tournamentSeriesId);  // games.tournament_series_id
const tournament_level = normalize(game.tournamentLevel);         // games.tournament_level
const game_time = normalize(game.gameTime);           // games.game_time
const game_location = normalize(game.gameLocation);   // games.game_location
const age_group = normalize(game.ageGroup);           // games.age_group
const league_id = normalize(game.leagueId);           // games.league_id
const custom_league_name = normalize(game.customLeagueName);      // games.custom_league_name

// On players/teams/seasons/tournaments:
const nickname = normalize(player.nickname);          // players.nickname, team_players.nickname
const notes = normalize(entity.notes);                // All entities with notes field
const color = normalize(entity.color);                // All entities with color field
const badge = normalize(entity.badge);                // seasons.badge, tournaments.badge
```

**Events Array → order_index**:
```typescript
// Preserve array index as order_index
game.gameEvents.map((event, index) => ({
  ...transformEvent(event),
  order_index: index,
}));
```

---

## Storage Estimates

### Row Counts (Typical User)

| Table | Rows | Size per Row | Total Size |
|-------|------|--------------|------------|
| `players` | 50 | 200 bytes | 10 KB |
| `teams` | 1 | 200 bytes | 200 bytes |
| `team_players` | 50 | 200 bytes | 10 KB |
| `seasons` | 2 | 400 bytes | 800 bytes |
| `tournaments` | 3 | 450 bytes | 1.3 KB |
| `personnel` | 5 | 200 bytes | 1 KB |
| `games` | 100 | 900 bytes | 90 KB |
| `game_players` | 2000 | 150 bytes | 300 KB |
| `game_events` | 500 | 120 bytes | 60 KB |
| `player_assessments` | 1500 | 300 bytes | 450 KB |
| `game_tactical_data` | 100 | 500 bytes | 50 KB |
| `player_adjustments` | 20 | 400 bytes | 8 KB |
| `warmup_plans` | 1 | 1000 bytes | 1 KB |
| `user_settings` | 1 | 300 bytes | 300 bytes |
| **Total** | | | **~980 KB** |

**vs. Current**: ~530 KB (IndexedDB) → ~980 KB (PostgreSQL)
**Overhead**: ~85% increase due to normalization and indexing

**Supabase Free Tier**: 500 MB database (enough for 500+ users with typical data)

---

## Security Considerations

### Row Level Security

**Every query filtered by user**:
```sql
-- User tries to query another user's data
SELECT * FROM games WHERE id = 'other_user_game';
-- RLS returns 0 rows (not an error)
```

**RPC Function Security**:
```sql
-- SECURITY DEFINER ensures RLS is enforced
CREATE FUNCTION save_game_with_relations(...)
RETURNS text AS $$ ... $$
LANGUAGE plpgsql SECURITY DEFINER;
```

### API Key Security

**Supabase Keys**:
- **Anon Key**: Public, embedded in client (safe with RLS)
- **Service Key**: Server-only, never exposed to client
- **User JWT**: Generated by Supabase Auth, expires after session

---

## Summary of Changes from Previous Version

| Issue | Previous | Fixed |
|-------|----------|-------|
| ID type | `uuid` | `text` (preserves `{prefix}_{timestamp}_{random}` format) |
| Team fields | 3 fields | 10 fields (added bindings, notes, age_group, game_type) |
| Season fields | 10 fields | 16 fields (added placements, game_type, gender, league, club_season) |
| Tournament fields | 11 fields | 16 fields (added series, placements, game_type, gender, club_season) |
| Game fields | 18 fields | 26 fields (added personnel, formations, elapsed time, game_type, gender, league) |
| Personnel table | Missing | Added |
| Personnel fields | Missing `certifications` | Added `certifications text[]`, removed unused `is_active` |
| Warmup table | Missing | Added |
| Warmup structure | Wrong (exercises/duration) | Fixed to match app (`version`, `sections[]` with id/title/content) |
| season_id constraint | `NOT NULL` | Nullable (games can be unassigned) |
| Event ordering | None | `order_index` column added |
| Settings types | Integer months | Text dates (matches app) |
| Timer state | Table defined | LOCAL ONLY (documented) |
| Transactions | Not specified | RPC functions documented |
| demand_factor range | `0.5-1.5` | `0.1-10` (matches app validation) |
| game_players fields | Missing notes, fair_play_card | Added `notes`, `received_fair_play_card` |
| Assessment sliders | `integer` | `numeric(3,1)` (supports step=0.5 values) |
| Assessment createdAt | `timestamptz` | `bigint` (epoch milliseconds matches TypeScript) |
| PLAYER_ADJUSTMENTS_KEY | "array" | `Record<playerId, []>` with flatten docs |
| Uniqueness constraints | Simple name | Documented app-level composite uniqueness |
| Empty-string normalization | Only seasonId | Comprehensive list of all nullable fields |

---

**Next Steps**:
- Review [Migration Strategy](../../03-active-plans/backend-evolution/migration-strategy.md) for transformation logic
- See [DataStore Interface](../../architecture/datastore-interface.md) for unified API over both backends
