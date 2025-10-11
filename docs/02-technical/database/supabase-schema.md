# Supabase PostgreSQL Schema

**Status**: Proposed Design
**Last Updated**: 2025-10-11
**Target**: Premium/Cloud Backend
**Related**: [Current Storage Schema](./current-storage-schema.md) | [Dual-Backend Architecture](../architecture/dual-backend-architecture.md) | [Migration Strategy](../../03-active-plans/backend-evolution/migration-strategy.md)

## Overview

This document defines the **target PostgreSQL schema** for MatchOps-Local's cloud backend using Supabase. This schema transforms the current key-value storage model into a normalized relational database optimized for multi-user access, data integrity, and query performance.

**Design Principles**:
- **User Isolation**: Every table has `user_id` for Row Level Security (RLS)
- **Referential Integrity**: Foreign keys with appropriate `ON DELETE` behaviors
- **Backward Compatibility**: Data migrations must preserve all current functionality
- **Normalization**: Avoid data duplication while maintaining query performance
- **Soft Deletes**: `archived` flags instead of hard deletes for seasons/tournaments
- **Timestamps**: Track creation and modification times

## Schema Overview

```
users (Supabase Auth)
 ├── teams
 │    └── team_rosters
 │         └── team_players
 ├── seasons
 ├── tournaments
 ├── players (legacy single-team roster)
 ├── games
 │    ├── game_events
 │    ├── player_assessments
 │    └── game_tactical_data
 ├── player_adjustments
 └── user_settings
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

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
- `TEAMS_INDEX_KEY` JSON array → `teams` table rows
- ID format preserved: `team_1234567890_abcde`
- Client-side ID generation maintained for offline support

### 3. `team_players`

Players within a team (normalized from `TEAM_ROSTERS_KEY`).

```sql
CREATE TABLE team_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
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

  CONSTRAINT team_players_name_team_unique UNIQUE (team_id, name)
);

CREATE INDEX idx_team_players_team_id ON team_players(team_id);
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
- Denormalize `user_id` for efficient RLS filtering

### 4. `players` (Legacy Single-Team Roster)

Global player roster (legacy mode, maintained for backward compatibility).

```sql
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

  CONSTRAINT players_name_user_unique UNIQUE (user_id, name)
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

Season definitions.

```sql
CREATE TABLE seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT seasons_name_user_unique UNIQUE (user_id, name)
);

CREATE INDEX idx_seasons_user_id ON seasons(user_id);
CREATE INDEX idx_seasons_archived ON seasons(user_id, archived);
CREATE INDEX idx_seasons_dates ON seasons(user_id, start_date, end_date);

-- RLS Policy
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own seasons"
  ON seasons FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `SEASONS_LIST_KEY` JSON array → `seasons` table rows
- `gameDates` string array → PostgreSQL `date[]` array

### 6. `tournaments`

Tournament definitions with optional player awards.

```sql
CREATE TABLE tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  level text,
  age_group text,
  awarded_player_id uuid, -- No FK constraint (graceful degradation)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT tournaments_name_user_unique UNIQUE (user_id, name)
);

CREATE INDEX idx_tournaments_user_id ON tournaments(user_id);
CREATE INDEX idx_tournaments_archived ON tournaments(user_id, archived);
CREATE INDEX idx_tournaments_dates ON tournaments(user_id, start_date, end_date);
CREATE INDEX idx_tournaments_awarded_player ON tournaments(awarded_player_id);

-- RLS Policy
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own tournaments"
  ON tournaments FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `TOURNAMENTS_LIST_KEY` JSON array → `tournaments` table rows
- `awardedPlayerId` → `awarded_player_id` (intentionally no FK for graceful degradation)

### 7. `games`

Core game records with metadata and scores.

```sql
CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,

  -- Game metadata
  team_name text NOT NULL,
  opponent_name text NOT NULL,
  game_date date NOT NULL,
  game_time time,
  game_location text,
  home_or_away text CHECK (home_or_away IN ('home', 'away')),

  -- Configuration
  number_of_periods integer CHECK (number_of_periods IN (1, 2)),
  period_duration_minutes integer NOT NULL,
  sub_interval_minutes integer,

  -- Game state
  game_status text CHECK (game_status IN ('notStarted', 'inProgress', 'periodEnd', 'gameEnd')),
  current_period integer,
  is_played boolean DEFAULT false,

  -- Score
  home_score integer DEFAULT 0,
  away_score integer DEFAULT 0,

  -- Settings
  show_player_names boolean DEFAULT true,
  game_notes text,
  tournament_level text,
  age_group text,
  demand_factor numeric(3,2) CHECK (demand_factor BETWEEN 0.5 AND 1.5),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_games_user_id ON games(user_id);
CREATE INDEX idx_games_team_id ON games(team_id);
CREATE INDEX idx_games_season_id ON games(season_id);
CREATE INDEX idx_games_tournament_id ON games(tournament_id);
CREATE INDEX idx_games_date ON games(user_id, game_date DESC);
CREATE INDEX idx_games_status ON games(user_id, game_status);

-- RLS Policy
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own games"
  ON games FOR ALL
  USING (auth.uid() = user_id);
```

**Foreign Key Behaviors**:
- `season_id`: `RESTRICT` - cannot delete season with games
- `tournament_id`: `SET NULL` - allows tournament deletion
- `team_id`: `SET NULL` - allows team deletion (graceful degradation)

**Migration Notes**:
- `SAVED_GAMES_KEY` object keys → `games.id`
- Nested objects (`playersOnField`, `opponents`, `drawings`, etc.) → separate tables
- Most AppState fields map directly to columns

### 8. `game_players`

Players selected for a game with field positions and bench status.

```sql
CREATE TABLE game_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL, -- References team_players.id OR players.id (no FK)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Player snapshot (for deleted players)
  player_name text NOT NULL,
  nickname text,
  jersey_number text,
  is_goalie boolean DEFAULT false,
  color text,

  -- Field position
  on_field boolean DEFAULT false,
  rel_x numeric(5,4), -- 0.0000 to 1.0000
  rel_y numeric(5,4),

  created_at timestamptz DEFAULT now(),

  CONSTRAINT game_players_game_player_unique UNIQUE (game_id, player_id)
);

CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_players_player_id ON game_players(player_id);
CREATE INDEX idx_game_players_on_field ON game_players(game_id, on_field);

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
- `AppState.playersOnField` → `game_players` (on_field=true)
- `AppState.availablePlayers` → `game_players` (on_field=false)
- `AppState.selectedPlayerIds` → distinct `player_id` values

### 9. `game_events`

Events during a game (goals, substitutions, cards).

```sql
CREATE TABLE game_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  event_type text NOT NULL CHECK (event_type IN (
    'goal', 'opponentGoal', 'substitution', 'periodEnd', 'gameEnd', 'fairPlayCard'
  )),
  time_seconds integer NOT NULL, -- Seconds elapsed in game
  scorer_id uuid,     -- No FK (player may be deleted)
  assister_id uuid,   -- No FK
  entity_id uuid,     -- Generic reference

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_game_events_game_id ON game_events(game_id);
CREATE INDEX idx_game_events_time ON game_events(game_id, time_seconds);
CREATE INDEX idx_game_events_type ON game_events(game_id, event_type);

-- RLS Policy
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own game events"
  ON game_events FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `AppState.gameEvents[]` → `game_events` table rows
- No foreign keys on player references (graceful degradation)

### 10. `player_assessments`

Player performance assessments per game.

```sql
CREATE TABLE player_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL, -- No FK (graceful degradation)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  overall_rating integer CHECK (overall_rating BETWEEN 1 AND 10),

  -- Slider ratings (1-10)
  intensity integer CHECK (intensity BETWEEN 1 AND 10),
  courage integer CHECK (courage BETWEEN 1 AND 10),
  duels integer CHECK (duels BETWEEN 1 AND 10),
  technique integer CHECK (technique BETWEEN 1 AND 10),
  creativity integer CHECK (creativity BETWEEN 1 AND 10),
  decisions integer CHECK (decisions BETWEEN 1 AND 10),
  awareness integer CHECK (awareness BETWEEN 1 AND 10),
  teamwork integer CHECK (teamwork BETWEEN 1 AND 10),
  fair_play integer CHECK (fair_play BETWEEN 1 AND 10),
  impact integer CHECK (impact BETWEEN 1 AND 10),

  notes text,
  minutes_played integer,
  created_by text DEFAULT 'coach',
  created_at timestamptz DEFAULT now(),

  CONSTRAINT player_assessments_game_player_unique UNIQUE (game_id, player_id)
);

CREATE INDEX idx_player_assessments_game_id ON player_assessments(game_id);
CREATE INDEX idx_player_assessments_player_id ON player_assessments(player_id);

-- RLS Policy
ALTER TABLE player_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own player assessments"
  ON player_assessments FOR ALL
  USING (auth.uid() = user_id);
```

**Migration Notes**:
- `AppState.assessments[playerId]` → `player_assessments` rows
- `assessments[id].sliders.intensity` → `intensity` column (flattened)

### 11. `game_tactical_data`

Tactical board data (opponents, drawings, ball position).

```sql
CREATE TABLE game_tactical_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE UNIQUE,
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
  last_sub_confirmation_time_seconds integer,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_game_tactical_data_game_id ON game_tactical_data(game_id);

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

### 12. `player_adjustments`

Manual stat adjustments for external games.

```sql
CREATE TABLE player_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id uuid NOT NULL, -- No FK (graceful degradation)
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,

  external_team_name text,
  opponent_name text,
  score_for integer,
  score_against integer,
  game_date date,
  home_or_away text CHECK (home_or_away IN ('home', 'away', 'neutral')),
  include_in_season_tournament boolean DEFAULT true,

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
- `PLAYER_ADJUSTMENTS_KEY` JSON array → `player_adjustments` table rows
- Direct mapping, minimal transformation

### 13. `user_settings`

Application settings per user.

```sql
CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  current_game_id uuid, -- No FK (may reference archived game)
  last_home_team_name text,
  language text DEFAULT 'fi',
  has_seen_app_guide boolean DEFAULT false,
  use_demand_correction boolean DEFAULT false,
  club_season_start_month integer CHECK (club_season_start_month BETWEEN 1 AND 12) DEFAULT 10,
  club_season_end_month integer CHECK (club_season_end_month BETWEEN 1 AND 12) DEFAULT 5,

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

### 14. `timer_state` (Optional - Ephemeral)

Active game timer state (may be client-only).

```sql
CREATE TABLE timer_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL,
  time_elapsed_seconds integer NOT NULL,
  timestamp bigint NOT NULL, -- JavaScript timestamp

  updated_at timestamptz DEFAULT now()
);

-- RLS Policy
ALTER TABLE timer_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own timer state"
  ON timer_state FOR ALL
  USING (auth.uid() = user_id);
```

**Design Decision**: Timer state could remain client-only (localStorage) as it's:
- Ephemeral session data
- High update frequency (every second)
- Not critical to sync across devices
- Increases Supabase costs with frequent writes

**Alternative**: Store timer state locally, sync game state periodically

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

## Foreign Key Strategy

### ON DELETE Behaviors

| Parent Table | Child Table | Behavior | Rationale |
|--------------|-------------|----------|-----------|
| `auth.users` | All tables | `CASCADE` | Delete all user data when account deleted |
| `teams` | `team_players` | `CASCADE` | Players belong to team |
| `teams` | `games` | `SET NULL` | Games survive team deletion |
| `seasons` | `games` | `RESTRICT` | Can't delete season with games |
| `tournaments` | `games` | `SET NULL` | Games survive tournament deletion |
| `games` | `game_events` | `CASCADE` | Events belong to game |
| `games` | `player_assessments` | `CASCADE` | Assessments belong to game |
| `games` | `game_tactical_data` | `CASCADE` | Tactical data belongs to game |

### Intentionally No Foreign Keys

**Player References** (`player_id` in various tables):
- **Reason**: Graceful degradation when players deleted
- **Behavior**: UI shows last known name via snapshot
- **Trade-off**: Risk of orphaned references (acceptable)

**Tournament Awards** (`tournaments.awarded_player_id`):
- **Reason**: Award remains visible even if player deleted
- **Behavior**: UI hides trophy if player not found
- **Trade-off**: More resilient to deletions

## Indexes

### Performance Optimization

**Primary Access Patterns**:
1. Get user's entities: `user_id` index (all tables)
2. Get games by season: `season_id` index
3. Get games by date: `(user_id, game_date DESC)` composite
4. Get team roster: `team_id` index
5. Get game events: `game_id` index

**Index Strategy**:
- Every `user_id` column indexed (RLS filtering)
- Foreign key columns indexed (join performance)
- Composite indexes for common queries
- Date columns for chronological queries

## Data Types

### PostgreSQL ↔ TypeScript Mapping

| PostgreSQL | TypeScript | Notes |
|------------|------------|-------|
| `uuid` | `string` | Generate client-side: `crypto.randomUUID()` |
| `text` | `string` | Variable length |
| `integer` | `number` | 32-bit signed |
| `numeric(5,4)` | `number` | Precise decimals (0.0000-1.0000) |
| `boolean` | `boolean` | true/false |
| `date` | `string` | ISO 8601: "2025-03-15" |
| `time` | `string` | ISO 8601: "14:30:00" |
| `timestamptz` | `string` | ISO 8601: "2025-03-15T14:30:00Z" |
| `jsonb` | `object/array` | Arbitrary JSON |
| `date[]` | `string[]` | Array of ISO dates |

### UUID Generation

**Strategy**: Client-side generation for offline support
```typescript
const id = crypto.randomUUID(); // "550e8400-e29b-41d4-a716-446655440000"
```

**Benefits**:
- Works offline (no server round-trip)
- Consistent with current `id: 'prefix_timestamp_random'` pattern
- Supabase supports client-provided UUIDs

## Migration Mapping

### Key-Value → Relational

| Storage Key | Target Table(s) | Transformation |
|-------------|-----------------|----------------|
| `MASTER_ROSTER_KEY` | `players` | Array → rows |
| `TEAMS_INDEX_KEY` | `teams` | Array → rows |
| `TEAM_ROSTERS_KEY` | `team_players` | Object → rows with `team_id` FK |
| `SEASONS_LIST_KEY` | `seasons` | Array → rows |
| `TOURNAMENTS_LIST_KEY` | `tournaments` | Array → rows |
| `SAVED_GAMES_KEY` | `games` + `game_players` + `game_events` + `player_assessments` + `game_tactical_data` | Object → 5 tables |
| `PLAYER_ADJUSTMENTS_KEY` | `player_adjustments` | Array → rows |
| `APP_SETTINGS_KEY` | `user_settings` | Object → single row |

### Complex Transformations

**Games → Multiple Tables**:
```typescript
// Source: SAVED_GAMES_KEY
{
  "game_123": {
    teamName: "PEPO U10",
    playersOnField: [...],      // → game_players (on_field=true)
    availablePlayers: [...],    // → game_players (on_field=false)
    gameEvents: [...],          // → game_events
    assessments: {...},         // → player_assessments
    opponents: [...],           // → game_tactical_data.opponents (jsonb)
    drawings: [...],            // → game_tactical_data.drawings (jsonb)
    ...
  }
}

// Target: Multiple tables
INSERT INTO games (...);
INSERT INTO game_players (...);
INSERT INTO game_events (...);
INSERT INTO player_assessments (...);
INSERT INTO game_tactical_data (...);
```

## Query Examples

### Common Operations

**Get user's seasons**:
```sql
SELECT * FROM seasons
WHERE user_id = $1 AND archived = false
ORDER BY start_date DESC;
```

**Get games for season**:
```sql
SELECT * FROM games
WHERE user_id = $1 AND season_id = $2
ORDER BY game_date DESC;
```

**Get game with players**:
```sql
SELECT
  g.*,
  json_agg(gp.*) AS players
FROM games g
LEFT JOIN game_players gp ON gp.game_id = g.id
WHERE g.id = $1 AND g.user_id = $2
GROUP BY g.id;
```

**Get player stats across season**:
```sql
SELECT
  gp.player_id,
  gp.player_name,
  COUNT(DISTINCT g.id) AS games_played,
  SUM(CASE WHEN ge.event_type = 'goal' AND ge.scorer_id = gp.player_id THEN 1 ELSE 0 END) AS goals,
  SUM(CASE WHEN ge.event_type = 'goal' AND ge.assister_id = gp.player_id THEN 1 ELSE 0 END) AS assists
FROM games g
JOIN game_players gp ON gp.game_id = g.id
LEFT JOIN game_events ge ON ge.game_id = g.id
WHERE g.user_id = $1 AND g.season_id = $2
GROUP BY gp.player_id, gp.player_name
ORDER BY goals DESC;
```

## Storage Estimates

### Row Counts (Typical User)

| Table | Rows | Size per Row | Total Size |
|-------|------|--------------|------------|
| `players` | 50 | 200 bytes | 10 KB |
| `teams` | 1 | 150 bytes | 150 bytes |
| `team_players` | 50 | 200 bytes | 10 KB |
| `seasons` | 2 | 300 bytes | 600 bytes |
| `tournaments` | 3 | 350 bytes | 1 KB |
| `games` | 100 | 800 bytes | 80 KB |
| `game_players` | 2000 | 150 bytes | 300 KB |
| `game_events` | 500 | 100 bytes | 50 KB |
| `player_assessments` | 1500 | 300 bytes | 450 KB |
| `game_tactical_data` | 100 | 500 bytes | 50 KB |
| `player_adjustments` | 20 | 400 bytes | 8 KB |
| `user_settings` | 1 | 200 bytes | 200 bytes |
| **Total** | | | **~960 KB** |

**vs. Current**: ~530 KB (localStorage) → ~960 KB (PostgreSQL)
**Overhead**: ~80% increase due to normalization and indexing

**Supabase Free Tier**: 500 MB database (enough for 500+ users with typical data)

## Performance Considerations

### Query Optimization

**Strengths**:
- Efficient JOINs for game + players + events
- Indexed lookups by user/season/tournament
- RLS filtering via indexed `user_id`
- Composite indexes for date-based queries

**Potential Bottlenecks**:
- Stats aggregations across many games (requires indexes)
- Large `jsonb` columns (opponents, drawings) - acceptable trade-off
- Cross-table queries (games + events + assessments) - use materialized views if needed

### Caching Strategy

**React Query Integration**:
- Query key structure: `['user', userId, 'seasons']`
- Invalidation on mutations (create/update/delete)
- Optimistic updates for instant UI
- Background refetch for multi-device sync

## Migration Tools

**Supabase Client Setup**:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

**Migration Script Structure**:
```typescript
// 1. Export from IndexedDB
const localData = await exportAllLocalData();

// 2. Transform to relational format
const relationalData = transformToRelational(localData);

// 3. Upload to Supabase
await uploadToSupabase(relationalData);

// 4. Verify migration
const verification = await verifyMigration();

// 5. Clear local data (optional)
if (verification.success) {
  await clearLocalData();
}
```

## Security Considerations

### Row Level Security

**Every query filtered by user**:
```sql
-- User tries to query another user's data
SELECT * FROM games WHERE id = 'other_user_game';
-- RLS returns 0 rows (not an error)
```

**Policy Testing**:
```sql
-- Test RLS as specific user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims.sub TO 'user-uuid';
SELECT * FROM games; -- Only this user's games
```

### API Key Security

**Supabase Keys**:
- **Anon Key**: Public, embedded in client (safe with RLS)
- **Service Key**: Server-only, never exposed to client
- **User JWT**: Generated by Supabase Auth, expires after session

**RLS Protects**:
- Even with exposed anon key, users can't access others' data
- Database enforces access control, not client

## Future Enhancements

### Potential Additions

1. **Materialized Views**: Pre-computed player statistics
2. **Full-Text Search**: Search games/players by name
3. **Triggers**: Automatic `updated_at` timestamps
4. **Soft Delete Auditing**: Track who deleted what
5. **Data Archival**: Move old games to cold storage

### Scaling Considerations

**When to Optimize**:
- >1000 games per user: Consider materialized views for stats
- >10,000 events: Partition game_events by date
- >100,000 rows: Evaluate query performance, add indexes

---

**Next Steps**:
- Review [Migration Strategy](../../03-active-plans/backend-evolution/migration-strategy.md) for transformation logic
- See [DataStore Interface](../architecture/datastore-interface.md) for unified API over both backends
