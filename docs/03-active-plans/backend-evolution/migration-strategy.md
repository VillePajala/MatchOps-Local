# Migration Strategy: IndexedDB → Supabase

**Status**: Proposed Plan
**Last Updated**: 2025-10-11
**Purpose**: Detailed strategy for migrating user data from local IndexedDB to cloud Supabase backend
**Related**: [Dual-Backend Architecture](../../02-technical/architecture/dual-backend-architecture.md) | [Current Storage Schema](../../02-technical/database/current-storage-schema.md) | [Supabase Schema](../../02-technical/database/supabase-schema.md)

## Overview

This document describes the **user-initiated migration process** for transforming data from IndexedDB (key-value, local) to Supabase (PostgreSQL, cloud). Migration is a critical user experience touchpoint that must be reliable, transparent, and reversible.

**Migration Goals**:
- ✅ **Zero Data Loss**: Every record migrated successfully
- ✅ **Validation**: Verify data integrity before and after
- ✅ **Transparency**: Show progress and results to user
- ✅ **Reversibility**: Allow rollback if issues occur
- ✅ **Idempotency**: Safe to retry on failure

**User Flow**:
```
Local Mode (has data)
  → Sign up for cloud account
    → Click "Migrate to Cloud"
      → Export local data
        → Transform to relational format
          → Upload to Supabase
            → Verify migration
              → Switch to Cloud Mode
                → (Optional) Clear local data
```

## Migration Architecture

### High-Level Flow

```
┌────────────────────────────────────────────────────────┐
│  STAGE 1: EXPORT (LocalDataStore)                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Read all data from IndexedDB                    │  │
│  │  → Players, Teams, Seasons, Tournaments, Games   │  │
│  │  → Serialize to DataExport JSON                  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ DataExport object
                 │
┌────────────────┴───────────────────────────────────────┐
│  STAGE 2: VALIDATE (Migration Service)                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Validate export structure                       │  │
│  │  → Check required fields                         │  │
│  │  → Verify data types                             │  │
│  │  → Validate relationships                        │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ Validated DataExport
                 │
┌────────────────┴───────────────────────────────────────┐
│  STAGE 3: TRANSFORM (Migration Service)                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Transform key-value → relational                │  │
│  │  → Arrays → table rows                           │  │
│  │  → Nested objects → foreign keys                 │  │
│  │  → Flatten AppState → multiple tables            │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ RelationalData object
                 │
┌────────────────┴───────────────────────────────────────┐
│  STAGE 4: UPLOAD (SupabaseDataStore)                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Insert data into PostgreSQL tables              │  │
│  │  → Use transactions for atomicity                │  │
│  │  → Batch inserts for performance                 │  │
│  │  → Handle conflicts (overwrite vs skip)          │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ Import result (success/errors)
                 │
┌────────────────┴───────────────────────────────────────┐
│  STAGE 5: VERIFY (Migration Service)                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Compare record counts                           │  │
│  │  → Local: 50 players → Cloud: 50 players         │  │
│  │  → Local: 100 games → Cloud: 100 games           │  │
│  │  → Spot-check sample records                     │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

## Data Transformation Rules

### 1. Players (Array → Rows)

**Source** (`MASTER_ROSTER_KEY`):
```json
[
  {
    "id": "player_1234567890_abcde",
    "name": "John Doe",
    "jerseyNumber": "10",
    "isGoalie": false
  },
  ...
]
```

**Target** (`players` table):
```sql
INSERT INTO players (id, user_id, name, jersey_number, is_goalie, created_at)
VALUES
  ('player_1234567890_abcde', $userId, 'John Doe', '10', false, now()),
  ...;
```

**Transformation Logic**:
```typescript
function transformPlayers(players: Player[], userId: string): PlayerRow[] {
  return players.map(p => ({
    id: p.id,
    user_id: userId,
    name: p.name,
    nickname: p.nickname ?? null,
    jersey_number: p.jerseyNumber ?? null,
    is_goalie: p.isGoalie ?? false,
    color: p.color ?? null,
    notes: p.notes ?? null,
    received_fair_play_card: p.receivedFairPlayCard ?? false,
    created_at: new Date(),
    updated_at: new Date(),
  }));
}
```

### 2. Teams + Team Rosters (Object → Rows)

**Source** (`TEAMS_INDEX_KEY` + `TEAM_ROSTERS_KEY`):
```json
// Teams
[{ "id": "team_123", "name": "PEPO U10" }, ...]

// Team Rosters
{
  "team_123": [
    { "id": "player_456", "name": "John Doe" },
    ...
  ]
}
```

**Target** (`teams` + `team_players` tables):
```sql
INSERT INTO teams (id, user_id, name, created_at, updated_at)
VALUES ('team_123', $userId, 'PEPO U10', now(), now());

INSERT INTO team_players (id, team_id, user_id, name, created_at, updated_at)
VALUES
  ('player_456', 'team_123', $userId, 'John Doe', now(), now()),
  ...;
```

**Transformation Logic**:
```typescript
function transformTeamsAndRosters(
  teams: Team[],
  rosters: { [teamId: string]: TeamPlayer[] },
  userId: string
): { teams: TeamRow[]; teamPlayers: TeamPlayerRow[] } {
  const teamRows = teams.map(t => ({
    id: t.id,
    user_id: userId,
    name: t.name,
    color: t.color ?? null,
    archived: t.archived ?? false,
    created_at: new Date(t.createdAt),
    updated_at: new Date(t.updatedAt),
  }));

  const teamPlayerRows = [];
  for (const [teamId, players] of Object.entries(rosters)) {
    for (const player of players) {
      teamPlayerRows.push({
        id: player.id,
        team_id: teamId,
        user_id: userId,
        name: player.name,
        nickname: player.nickname ?? null,
        jersey_number: player.jerseyNumber ?? null,
        is_goalie: player.isGoalie ?? false,
        color: player.color ?? null,
        notes: player.notes ?? null,
        received_fair_play_card: player.receivedFairPlayCard ?? false,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  return { teams: teamRows, teamPlayers: teamPlayerRows };
}
```

### 3. Seasons (Array → Rows)

**Source** (`SEASONS_LIST_KEY`):
```json
[
  {
    "id": "season_123",
    "name": "Spring 2025",
    "periodCount": 2,
    "periodDuration": 30,
    "gameDates": ["2025-03-01", "2025-03-08"]
  }
]
```

**Target** (`seasons` table):
```sql
INSERT INTO seasons (
  id, user_id, name, period_count, period_duration, game_dates, created_at
)
VALUES (
  'season_123', $userId, 'Spring 2025', 2, 30,
  ARRAY['2025-03-01', '2025-03-08']::date[], now()
);
```

**Transformation Logic**:
```typescript
function transformSeasons(seasons: Season[], userId: string): SeasonRow[] {
  return seasons.map(s => ({
    id: s.id,
    user_id: userId,
    name: s.name,
    location: s.location ?? null,
    period_count: s.periodCount ?? null,
    period_duration: s.periodDuration ?? null,
    start_date: s.startDate ?? null,
    end_date: s.endDate ?? null,
    game_dates: s.gameDates ?? [],
    archived: s.archived ?? false,
    notes: s.notes ?? null,
    color: s.color ?? null,
    badge: s.badge ?? null,
    age_group: s.ageGroup ?? null,
    created_at: new Date(),
    updated_at: new Date(),
  }));
}
```

### 4. Games (Object → Multiple Tables)

**Source** (`SAVED_GAMES_KEY`):
```json
{
  "game_123": {
    "teamName": "PEPO U10",
    "opponentName": "Vantaa FC",
    "homeScore": 3,
    "awayScore": 2,
    "playersOnField": [...],      // → game_players (on_field=true)
    "availablePlayers": [...],    // → game_players (on_field=false)
    "gameEvents": [...],          // → game_events
    "assessments": {...},         // → player_assessments
    "opponents": [...],           // → game_tactical_data.opponents (jsonb)
    "drawings": [...],            // → game_tactical_data.drawings (jsonb)
    ...
  }
}
```

**Target**: 5 tables per game
```sql
-- 1. games table (main record)
INSERT INTO games (id, user_id, team_name, opponent_name, home_score, away_score, ...)
VALUES ('game_123', $userId, 'PEPO U10', 'Vantaa FC', 3, 2, ...);

-- 2. game_players table (players on field + bench)
INSERT INTO game_players (game_id, player_id, on_field, rel_x, rel_y, ...)
VALUES
  ('game_123', 'player_456', true, 0.5, 0.3, ...),  -- on field
  ('game_123', 'player_789', false, null, null, ...);  -- on bench

-- 3. game_events table (goals, subs, cards)
INSERT INTO game_events (game_id, event_type, time_seconds, scorer_id, ...)
VALUES
  ('game_123', 'goal', 120, 'player_456', ...),
  ('game_123', 'substitution', 300, 'player_789', ...);

-- 4. player_assessments table (player ratings)
INSERT INTO player_assessments (game_id, player_id, overall_rating, intensity, ...)
VALUES ('game_123', 'player_456', 8, 9, ...);

-- 5. game_tactical_data table (jsonb arrays)
INSERT INTO game_tactical_data (game_id, opponents, drawings, tactical_discs, ...)
VALUES ('game_123', '[...]'::jsonb, '[[...]]'::jsonb, '[...]'::jsonb, ...);
```

**Transformation Logic**:
```typescript
function transformGame(
  gameId: string,
  game: AppState,
  userId: string
): {
  game: GameRow;
  gamePlayers: GamePlayerRow[];
  gameEvents: GameEventRow[];
  playerAssessments: PlayerAssessmentRow[];
  gameTacticalData: GameTacticalDataRow;
} {
  // 1. Main game record
  const gameRow: GameRow = {
    id: gameId,
    user_id: userId,
    team_id: game.teamId ?? null,
    season_id: game.seasonId,
    tournament_id: game.tournamentId ?? null,
    team_name: game.teamName,
    opponent_name: game.opponentName,
    game_date: game.gameDate,
    game_time: game.gameTime ?? null,
    game_location: game.gameLocation ?? null,
    home_or_away: game.homeOrAway,
    number_of_periods: game.numberOfPeriods,
    period_duration_minutes: game.periodDurationMinutes,
    sub_interval_minutes: game.subIntervalMinutes ?? null,
    game_status: game.gameStatus,
    current_period: game.currentPeriod,
    is_played: game.isPlayed ?? false,
    home_score: game.homeScore,
    away_score: game.awayScore,
    show_player_names: game.showPlayerNames,
    game_notes: game.gameNotes ?? '',
    tournament_level: game.tournamentLevel ?? null,
    age_group: game.ageGroup ?? null,
    demand_factor: game.demandFactor ?? null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // 2. Game players (on field + bench)
  const gamePlayerRows: GamePlayerRow[] = [
    ...game.playersOnField.map(p => ({
      id: crypto.randomUUID(),
      game_id: gameId,
      player_id: p.id,
      user_id: userId,
      player_name: p.name,
      nickname: p.nickname ?? null,
      jersey_number: p.jerseyNumber ?? null,
      is_goalie: p.isGoalie ?? false,
      color: p.color ?? null,
      on_field: true,
      rel_x: p.relX ?? null,
      rel_y: p.relY ?? null,
      created_at: new Date(),
    })),
    ...game.availablePlayers.map(p => ({
      id: crypto.randomUUID(),
      game_id: gameId,
      player_id: p.id,
      user_id: userId,
      player_name: p.name,
      nickname: p.nickname ?? null,
      jersey_number: p.jerseyNumber ?? null,
      is_goalie: p.isGoalie ?? false,
      color: p.color ?? null,
      on_field: false,
      rel_x: null,
      rel_y: null,
      created_at: new Date(),
    })),
  ];

  // 3. Game events (goals, subs, etc.)
  const gameEventRows: GameEventRow[] = game.gameEvents.map(e => ({
    id: e.id,
    game_id: gameId,
    user_id: userId,
    event_type: e.type,
    time_seconds: e.time,
    scorer_id: e.scorerId ?? null,
    assister_id: e.assisterId ?? null,
    entity_id: e.entityId ?? null,
    created_at: new Date(),
  }));

  // 4. Player assessments (ratings)
  const playerAssessmentRows: PlayerAssessmentRow[] = Object.entries(
    game.assessments ?? {}
  ).map(([playerId, assessment]) => ({
    id: crypto.randomUUID(),
    game_id: gameId,
    player_id: playerId,
    user_id: userId,
    overall_rating: assessment.overall,
    intensity: assessment.sliders.intensity,
    courage: assessment.sliders.courage,
    duels: assessment.sliders.duels,
    technique: assessment.sliders.technique,
    creativity: assessment.sliders.creativity,
    decisions: assessment.sliders.decisions,
    awareness: assessment.sliders.awareness,
    teamwork: assessment.sliders.teamwork,
    fair_play: assessment.sliders.fair_play,
    impact: assessment.sliders.impact,
    notes: assessment.notes ?? null,
    minutes_played: assessment.minutesPlayed,
    created_by: assessment.createdBy,
    created_at: new Date(assessment.createdAt),
  }));

  // 5. Tactical data (jsonb)
  const gameTacticalDataRow: GameTacticalDataRow = {
    id: crypto.randomUUID(),
    game_id: gameId,
    user_id: userId,
    opponents: game.opponents,
    drawings: game.drawings,
    tactical_discs: game.tacticalDiscs,
    tactical_drawings: game.tacticalDrawings,
    tactical_ball_position: game.tacticalBallPosition,
    completed_interval_durations: game.completedIntervalDurations ?? [],
    last_sub_confirmation_time_seconds: game.lastSubConfirmationTimeSeconds ?? null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  return {
    game: gameRow,
    gamePlayers: gamePlayerRows,
    gameEvents: gameEventRows,
    playerAssessments: playerAssessmentRows,
    gameTacticalData: gameTacticalDataRow,
  };
}
```

## Validation Rules

### Pre-Migration Validation

**Export Validation**:
```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateExport(data: DataExport): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Required fields
  if (!data.version) errors.push('Missing export version');
  if (!data.exportedAt) errors.push('Missing export timestamp');

  // 2. Data types
  if (!Array.isArray(data.players)) errors.push('Players must be array');
  if (!Array.isArray(data.seasons)) errors.push('Seasons must be array');
  if (typeof data.games !== 'object') errors.push('Games must be object');

  // 3. Required entity fields
  for (const player of data.players ?? []) {
    if (!player.id) errors.push(`Player missing id: ${player.name}`);
    if (!player.name) errors.push(`Player missing name: ${player.id}`);
  }

  for (const season of data.seasons ?? []) {
    if (!season.id) errors.push(`Season missing id: ${season.name}`);
    if (!season.name) errors.push(`Season missing name: ${season.id}`);
  }

  // 4. Relationships
  const seasonIds = new Set((data.seasons ?? []).map(s => s.id));
  for (const [gameId, game] of Object.entries(data.games ?? {})) {
    if (game.seasonId && !seasonIds.has(game.seasonId)) {
      warnings.push(`Game ${gameId} references missing season ${game.seasonId}`);
    }
  }

  // 5. Data size limits
  const gameCount = Object.keys(data.games ?? {}).length;
  if (gameCount > 1000) {
    warnings.push(`Large dataset: ${gameCount} games may take several minutes to upload`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### Post-Migration Verification

**Count Verification**:
```typescript
async function verifyMigration(
  localExport: DataExport,
  supabaseDataStore: SupabaseDataStore
): Promise<VerificationResult> {
  const localCounts = {
    players: localExport.players.length,
    teams: localExport.teams.length,
    seasons: localExport.seasons.length,
    tournaments: localExport.tournaments.length,
    games: Object.keys(localExport.games).length,
    adjustments: localExport.playerAdjustments.length,
  };

  const cloudCounts = {
    players: (await supabaseDataStore.getPlayers()).length,
    teams: (await supabaseDataStore.getTeams(true)).length,
    seasons: (await supabaseDataStore.getSeasons(true)).length,
    tournaments: (await supabaseDataStore.getTournaments(true)).length,
    games: (await supabaseDataStore.getGames()).length,
    adjustments: (await supabaseDataStore.getPlayerAdjustments()).length,
  };

  const mismatches: string[] = [];
  for (const [key, localCount] of Object.entries(localCounts)) {
    const cloudCount = cloudCounts[key as keyof typeof cloudCounts];
    if (localCount !== cloudCount) {
      mismatches.push(`${key}: local=${localCount}, cloud=${cloudCount}`);
    }
  }

  return {
    success: mismatches.length === 0,
    localCounts,
    cloudCounts,
    mismatches,
  };
}
```

## Upload Strategy

### Batch Inserts

**Why**: Single inserts are slow (network round-trip per insert)
**Solution**: Batch multiple rows into single INSERT statement

**Example**:
```typescript
// ❌ Slow: 100 inserts = 100 network round-trips
for (const player of players) {
  await supabase.from('players').insert(player);
}

// ✅ Fast: 1 insert with 100 rows = 1 network round-trip
await supabase.from('players').insert(players);
```

**Batch Size**: 500 rows per batch (Supabase limit: ~50 KB per request)

### Transaction Safety

**Goal**: All-or-nothing migration (no partial state)

**Implementation**:
```typescript
async function uploadDataWithTransaction(
  data: RelationalData,
  supabase: SupabaseClient
): Promise<void> {
  // Supabase doesn't expose BEGIN/COMMIT directly,
  // but individual table inserts are atomic

  // Strategy: Insert in dependency order
  // If any step fails, previous steps remain (not rolled back)
  // User can retry or manually clean up

  try {
    // 1. Independent entities (no dependencies)
    await supabase.from('players').insert(data.players);
    await supabase.from('teams').insert(data.teams);

    // 2. Entities with foreign keys
    await supabase.from('team_players').insert(data.teamPlayers);
    await supabase.from('seasons').insert(data.seasons);
    await supabase.from('tournaments').insert(data.tournaments);

    // 3. Games (depend on seasons/tournaments/teams)
    await supabase.from('games').insert(data.games);

    // 4. Game sub-entities (depend on games)
    await supabase.from('game_players').insert(data.gamePlayers);
    await supabase.from('game_events').insert(data.gameEvents);
    await supabase.from('player_assessments').insert(data.playerAssessments);
    await supabase.from('game_tactical_data').insert(data.gameTacticalData);

    // 5. Other entities
    await supabase.from('player_adjustments').insert(data.playerAdjustments);
    await supabase.from('user_settings').upsert(data.userSettings);

  } catch (error) {
    // Log error, but don't rollback (Supabase doesn't support transactions)
    throw new MigrationError('Upload failed', error);
  }
}
```

**Note**: Supabase client doesn't support multi-table transactions. Use careful ordering and retry logic.

### Conflict Resolution

**Scenario**: User already has some cloud data (previous migration attempt)

**Strategy**: Overwrite (default) or Skip (optional)

**Implementation**:
```typescript
// Overwrite mode (default)
await supabase.from('players')
  .upsert(players, { onConflict: 'id' });
  // → If player exists, update it

// Skip mode (preserve existing)
await supabase.from('players')
  .insert(players, { ignoreDuplicates: true });
  // → If player exists, skip it
```

## Error Handling

### Error Categories

**1. Export Errors** (rare):
- IndexedDB read failure
- Quota exceeded (browser storage full)
- **Recovery**: Retry, clear browser cache

**2. Validation Errors** (common during development):
- Missing required fields
- Invalid data types
- **Recovery**: Fix data locally, re-export

**3. Upload Errors** (network issues):
- Network timeout
- Supabase quota exceeded
- **Recovery**: Retry, check Supabase status

**4. Verification Errors** (data mismatch):
- Count mismatch (50 local players ≠ 49 cloud players)
- **Recovery**: Re-upload, investigate missing data

### Error Recovery Flow

```
┌────────────────────────────────────┐
│  Migration fails at stage X        │
└────────────┬───────────────────────┘
             │
      ┌──────┴──────┐
      │             │
┌─────┴─────┐ ┌─────┴─────┐
│ Transient │ │ Permanent │
│  Error    │ │  Error    │
│ (network) │ │ (invalid  │
│           │ │  data)    │
└─────┬─────┘ └─────┬─────┘
      │             │
┌─────┴─────┐ ┌─────┴─────┐
│  Retry    │ │ Manual    │
│ (auto)    │ │ Fix       │
└───────────┘ └───────────┘
```

**Retry Logic**:
```typescript
async function migrateWithRetry(
  maxRetries: number = 3
): Promise<MigrationResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await performMigration();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 2s, 4s, 8s
      const delayMs = Math.pow(2, attempt) * 1000;
      logger.warn(`Migration attempt ${attempt} failed, retrying in ${delayMs}ms`, error);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
```

## User Experience

### Migration UI Flow

**1. Migration Start**:
```
┌─────────────────────────────────────────┐
│  Migrate to Cloud                        │
├─────────────────────────────────────────┤
│  Your data will be uploaded to the      │
│  cloud for multi-device sync.           │
│                                          │
│  Local data:                             │
│  - 50 players                            │
│  - 2 seasons                             │
│  - 100 games                             │
│                                          │
│  Estimated time: 2-5 minutes             │
│                                          │
│  [Cancel]          [Start Migration]     │
└─────────────────────────────────────────┘
```

**2. Migration Progress**:
```
┌─────────────────────────────────────────┐
│  Migrating Data...                       │
├─────────────────────────────────────────┤
│  ⏳ Exporting local data...              │
│  ✅ Validating export...                 │
│  ⏳ Uploading players... (25/50)         │
│  ⏳ Uploading games... (10/100)          │
│                                          │
│  [████████░░░░░░░░░░] 40%               │
│                                          │
│  Please keep this window open            │
└─────────────────────────────────────────┘
```

**3. Migration Success**:
```
┌─────────────────────────────────────────┐
│  Migration Complete! ✅                  │
├─────────────────────────────────────────┤
│  Your data has been successfully         │
│  migrated to the cloud.                  │
│                                          │
│  Migrated:                               │
│  ✅ 50 players                           │
│  ✅ 2 seasons, 3 tournaments             │
│  ✅ 100 games                            │
│                                          │
│  Your app is now in Cloud Mode.          │
│  Data will sync across your devices.     │
│                                          │
│  [Keep Local Copy] [Clear Local Data]   │
└─────────────────────────────────────────┘
```

**4. Migration Failure**:
```
┌─────────────────────────────────────────┐
│  Migration Failed ❌                     │
├─────────────────────────────────────────┤
│  Some data could not be uploaded.        │
│                                          │
│  Uploaded:                               │
│  ✅ 50 players                           │
│  ✅ 2 seasons                            │
│  ❌ Games (network error)                │
│                                          │
│  Your local data is safe and unchanged.  │
│                                          │
│  [Retry] [View Error Log] [Cancel]      │
└─────────────────────────────────────────┘
```

### Post-Migration Options

**Keep Local Copy** (recommended):
- Local data remains on device
- Acts as backup if cloud issues occur
- User can manually clear later

**Clear Local Data**:
- Frees device storage
- Cannot be undone
- Only recommend if cloud verified

## Testing Strategy

### Unit Tests

**Transformation Functions**:
```typescript
describe('transformPlayers', () => {
  it('should transform player array to rows', () => {
    const players: Player[] = [
      { id: 'p1', name: 'John Doe', jerseyNumber: '10' },
    ];
    const rows = transformPlayers(players, 'user_123');
    expect(rows).toEqual([
      {
        id: 'p1',
        user_id: 'user_123',
        name: 'John Doe',
        jersey_number: '10',
        ...
      },
    ]);
  });
});
```

**Validation**:
```typescript
describe('validateExport', () => {
  it('should detect missing required fields', () => {
    const invalidExport: Partial<DataExport> = {
      players: [{ name: 'John' }], // Missing id
    };
    const result = validateExport(invalidExport as DataExport);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Player missing id: John');
  });
});
```

### Integration Tests

**End-to-End Migration** (with test database):
```typescript
describe('Migration E2E', () => {
  it('should migrate local data to Supabase', async () => {
    // 1. Setup: Create local data
    const localStore = new LocalDataStore();
    await localStore.createPlayer({ name: 'Test Player' });
    await localStore.createSeason({ name: 'Test Season' });

    // 2. Export
    const exported = await localStore.exportAllData();

    // 3. Upload
    const supabaseStore = new SupabaseDataStore(testSupabaseClient);
    const result = await supabaseStore.importData(exported);
    expect(result.success).toBe(true);

    // 4. Verify
    const players = await supabaseStore.getPlayers();
    expect(players).toHaveLength(1);
    expect(players[0].name).toBe('Test Player');
  });
});
```

### Manual Testing

**Scenarios**:
1. ✅ Happy path (clean migration, all data)
2. ✅ Partial migration (network fails mid-upload)
3. ✅ Retry after failure
4. ✅ Migration with large dataset (500+ games)
5. ✅ Migration with missing relationships (games without season)
6. ✅ Re-migration (overwrite existing cloud data)

---

**Next Steps**:
- Review [Phased Implementation Roadmap](./phased-implementation-roadmap.md) for execution timeline
- See [Dual-Backend Architecture](../../02-technical/architecture/dual-backend-architecture.md) for overall design
- Check [DataStore Interface](../../02-technical/architecture/datastore-interface.md) for API details
