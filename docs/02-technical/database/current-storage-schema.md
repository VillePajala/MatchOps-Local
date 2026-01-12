# Current Storage Schema (IndexedDB)

**Status**: Active Documentation
**Last Updated**: 2026-01-04
**Applies To**: Current Production (IndexedDB backend)
**Related**: [Architecture](../architecture.md) | [Dual-Backend Architecture](../architecture/dual-backend-architecture.md)

## Overview

MatchOps-Local uses **IndexedDB** as the production storage backend with a **key-value storage model**. The storage abstraction (`src/utils/storage.ts`) provides async operations over a `StorageAdapter` interface.

**Key Characteristics**:
- **Single-user, single-device**: No multi-tenancy or user accounts
- **Local-first**: All data stays on device, no cloud synchronization
- **IndexedDB backend**: Production uses IndexedDB (50+ MB quota)
- **JSON serialization**: Complex objects stored as stringified JSON
- **Simple schema**: Flat key-value pairs, no relationships enforced at storage level
- **Typical data size**: ~50MB for 100 games, 50 players, 20 seasons/tournaments

## Storage Keys

All storage keys are centralized in `src/config/storageKeys.ts`:

```typescript
// Core application data
export const SAVED_GAMES_KEY = 'savedSoccerGames';           // Games collection
export const MASTER_ROSTER_KEY = 'soccerMasterRoster';       // Player roster
export const SEASONS_LIST_KEY = 'soccerSeasons';             // Seasons list
export const TOURNAMENTS_LIST_KEY = 'soccerTournaments';     // Tournaments list
export const APP_SETTINGS_KEY = 'soccerAppSettings';         // App configuration
export const PLAYER_ADJUSTMENTS_KEY = 'soccerPlayerAdjustments'; // External game stats

// Multi-team support
export const TEAMS_INDEX_KEY = 'soccerTeamsIndex';           // Teams list
export const TEAM_ROSTERS_KEY = 'soccerTeamRosters';         // Team-specific rosters

// Personnel management (added Dec 2025)
export const PERSONNEL_KEY = 'soccerPersonnel';              // Coaches, trainers, etc.

// Premium features
export const PREMIUM_LICENSE_KEY = 'soccerPremiumLicense';   // License validation
export const WARMUP_PLAN_KEY = 'soccerWarmupPlan';           // Warm-up routines

// Session/temporary data
export const TIMER_STATE_KEY = 'soccerTimerState';           // Active game timer
export const LAST_HOME_TEAM_NAME_KEY = 'lastHomeTeamName';   // Legacy setting

// UI state
export const INSTALL_PROMPT_DISMISSED_KEY = 'installPromptDismissed';
export const HAS_SEEN_FIRST_GAME_GUIDE_KEY = 'hasSeenFirstGameGuide';

// Metadata
export const APP_DATA_VERSION_KEY = 'appDataVersion';        // Schema version
```

## Data Models

### 1. Player (`MASTER_ROSTER_KEY`)

**Storage**: Single array of all players
**Format**: `Player[]` as JSON string
**Usage**: Global player roster (legacy single-team mode)

```typescript
interface Player {
  id: string;                      // "player_1234567890_abcde"
  name: string;                    // "John Doe"
  nickname?: string;               // "Johnny" (display on field disc)
  jerseyNumber?: string;           // "10"
  isGoalie?: boolean;              // true/false
  color?: string;                  // "#FF5733" (disc color)
  notes?: string;                  // "Left-footed striker"
  receivedFairPlayCard?: boolean;  // Fair play award tracking

  // Field position (ephemeral, stored per-game)
  relX?: number;                   // 0.0 to 1.0
  relY?: number;                   // 0.0 to 1.0
}
```

**Estimated Size**: ~200 bytes per player × 50 players = ~10KB

### 2. Team (`TEAMS_INDEX_KEY`)

**Storage**: Record mapping team ID to team object
**Format**: `Record<string, Team>` as JSON string (NOT an array)
**Usage**: Multi-team support with O(1) lookup by ID

```typescript
interface Team {
  id: string;                      // "team_1234567890_abcde"
  name: string;                    // "PEPO U10"
  color?: string;                  // "#4A90E2" (brand color)
  createdAt: string;               // "2025-01-15T10:30:00.000Z"
  updatedAt: string;               // "2025-03-20T14:45:00.000Z"
  archived?: boolean;              // Soft delete flag
  notes?: string;                  // Team description
  ageGroup?: string;               // "U10"
  gameType?: GameType;             // 'soccer' | 'futsal'
  boundSeasonId?: string;          // Links to default season
  boundTournamentId?: string;      // Links to default tournament
  boundTournamentSeriesId?: string; // Links to tournament series
}

type GameType = 'soccer' | 'futsal';
```

**Estimated Size**: ~200 bytes per team × 5 teams = ~1KB

### 3. Team Rosters (`TEAM_ROSTERS_KEY`)

**Storage**: Object mapping team IDs to player arrays
**Format**: `{ [teamId: string]: TeamPlayer[] }` as JSON string
**Usage**: Players per team

```typescript
interface TeamPlayer {
  id: string;                      // "player_1234567890_abcde"
  name: string;                    // "John Doe"
  nickname?: string;               // "Johnny"
  jerseyNumber?: string;           // "10"
  isGoalie?: boolean;              // true/false
  color?: string;                  // "#FF5733"
  notes?: string;                  // "Left-footed striker"
  receivedFairPlayCard?: boolean;  // Fair play award tracking
}

// Storage structure
type TeamRostersStorage = {
  [teamId: string]: TeamPlayer[];
};
```

**Estimated Size**: ~200 bytes per player × 20 players per team × 5 teams = ~20KB

### 4. Personnel (`PERSONNEL_KEY`) — Added Dec 2025

**Storage**: Object mapping personnel IDs to personnel records
**Format**: `{ [personnelId: string]: Personnel }` as JSON string
**Usage**: Coaches, trainers, team managers, support staff

```typescript
interface Personnel {
  id: string;                      // "personnel_1234567890_abcde"
  name: string;                    // "Coach Smith"
  role: PersonnelRole;             // Primary role
  phone?: string;                  // "+358 40 123 4567"
  email?: string;                  // "coach@example.com"
  certifications?: string[];       // ["UEFA A License", "First Aid"]
  notes?: string;                  // General notes
  createdAt: string;               // ISO timestamp
  updatedAt: string;               // ISO timestamp
}

type PersonnelRole =
  | 'head_coach'
  | 'assistant_coach'
  | 'goalkeeper_coach'
  | 'fitness_coach'
  | 'physio'
  | 'team_manager'
  | 'support_staff'
  | 'other';

// Storage structure
interface PersonnelCollection {
  [personnelId: string]: Personnel;
}
```

**Estimated Size**: ~300 bytes per personnel × 10 personnel = ~3KB

### 5. Season (`SEASONS_LIST_KEY`)

**Storage**: Single array of all seasons
**Format**: `Season[]` as JSON string
**Usage**: Season management and game categorization

```typescript
interface Season {
  id: string;                      // "season_1234567890_abcde"
  name: string;                    // "Spring 2025"
  location?: string;               // "Helsinki Sports Center"
  periodCount?: number;            // 2 (halves)
  periodDuration?: number;         // 30 (minutes)
  startDate?: string;              // "2025-03-01"
  endDate?: string;                // "2025-05-31"
  gameDates?: string[];            // ["2025-03-05", "2025-03-12", ...]
  archived?: boolean;              // Soft delete flag
  notes?: string;                  // "Indoor season"
  color?: string;                  // "#8BC34A"
  badge?: string;                  // "🌸" (emoji badge)
  ageGroup?: string;               // "U10"

  // Game type support (added Dec 2025)
  gameType?: GameType;             // 'soccer' | 'futsal'
  gender?: Gender;                 // 'boys' | 'girls'

  // Finnish league system (added Dec 2025)
  leagueId?: string;               // 'sm-sarja' | 'harrastesarja' | 'muu'
  customLeagueName?: string;       // Custom name when leagueId === 'muu'

  // Team placements (added Dec 2025)
  teamPlacements?: {
    [teamId: string]: TeamPlacementInfo;
  };
}

type Gender = 'boys' | 'girls';

interface TeamPlacementInfo {
  placement: number;               // 1 = 1st place, 2 = 2nd place, etc.
  award?: string;                  // "Champion", "Runner-up", etc.
  note?: string;                   // Optional coach notes
}
```

**Estimated Size**: ~400 bytes per season × 10 seasons = ~4KB

### 6. Tournament (`TOURNAMENTS_LIST_KEY`)

**Storage**: Single array of all tournaments
**Format**: `Tournament[]` as JSON string
**Usage**: Tournament tracking and player awards

```typescript
interface Tournament {
  id: string;                      // "tournament_1234567890_abcde"
  name: string;                    // "Helsinki Cup 2025"
  location?: string;               // "Olympic Stadium"
  periodCount?: number;            // 2
  periodDuration?: number;         // 25 (minutes)
  startDate?: string;              // "2025-06-10"
  endDate?: string;                // "2025-06-12"
  gameDates?: string[];            // ["2025-06-10", "2025-06-11", "2025-06-12"]
  archived?: boolean;              // Soft delete flag
  notes?: string;                  // "International youth tournament"
  color?: string;                  // "#FF5722"
  badge?: string;                  // "🏆" (emoji badge)
  level?: string;                  // "Regional" (legacy, see series)
  ageGroup?: string;               // "U10"
  awardedPlayerId?: string;        // Player of Tournament award

  // Game type support (added Dec 2025)
  gameType?: GameType;             // 'soccer' | 'futsal'
  gender?: Gender;                 // 'boys' | 'girls'

  // Tournament series (added Dec 2025) - multi-level tournaments
  series?: TournamentSeries[];     // Elite, Kilpa, Haaste levels

  // Team placements (added Dec 2025)
  teamPlacements?: {
    [teamId: string]: TeamPlacementInfo;
  };
}

interface TournamentSeries {
  id: string;                      // "series_1234567890_abcde"
  level: string;                   // "Elite" | "Kilpa" | "Haaste" etc.
}
```

**Estimated Size**: ~450 bytes per tournament × 5 tournaments = ~2KB

### 7. Game / AppState (`SAVED_GAMES_KEY`)

**Storage**: Object mapping game IDs to complete game states
**Format**: `{ [gameId: string]: AppState }` as JSON string
**Usage**: All saved games with complete state

```typescript
interface AppState {
  // Team information
  teamName: string;                // "PEPO U10"
  teamId?: string;                 // "team_1234567890_abcde"
  opponentName: string;            // "Vantaa FC"

  // Game metadata
  gameDate: string;                // "2025-03-15"
  gameTime?: string;               // "14:00"
  gameLocation?: string;           // "Keskuspuisto Stadium"
  homeOrAway: 'home' | 'away';     // Location perspective

  // Context linking
  seasonId: string;                // Links to Season.id
  tournamentId: string;            // Links to Tournament.id
  tournamentLevel?: string;        // "Regional" (legacy)
  tournamentSeriesId?: string;     // Links to TournamentSeries.id
  ageGroup?: string;               // "U10"

  // Game type (added Dec 2025)
  gameType?: GameType;             // 'soccer' | 'futsal'

  // Finnish league system (added Dec 2025)
  leagueId?: string;               // 'sm-sarja' | 'harrastesarja' | 'muu'
  customLeagueName?: string;       // Custom name when leagueId === 'muu'

  // Game configuration
  numberOfPeriods: 1 | 2;          // Halves
  periodDurationMinutes: number;   // 30
  subIntervalMinutes?: number;     // 10 (substitution reminders)

  // Game state
  gameStatus: 'notStarted' | 'inProgress' | 'periodEnd' | 'gameEnd';
  currentPeriod: number;           // 1, 2
  isPlayed?: boolean;              // Game completed flag

  // Score
  homeScore: number;               // 3
  awayScore: number;               // 2

  // Players
  playersOnField: Player[];        // Active players (with relX/relY)
  availablePlayers: Player[];      // Bench players
  selectedPlayerIds: string[];     // Selected for this game

  // Tactical board
  opponents: Opponent[];           // Opponent positions
  drawings: Point[][];             // Tactical drawings
  tacticalDiscs: TacticalDisc[];   // Tactical board pieces
  tacticalDrawings: Point[][];     // Tactical board drawings
  tacticalBallPosition: Point | null; // Ball position
  formationSnapPoints?: Point[];   // Formation assistance

  // Events
  gameEvents: GameEvent[];         // Goals, subs, cards
  completedIntervalDurations?: IntervalLog[]; // Period timing
  lastSubConfirmationTimeSeconds?: number; // Last sub reminder

  // Timer state (added Dec 2025)
  timeElapsedInSeconds?: number;   // Preserves timer across game switches

  // Assessments
  assessments?: {                  // Player evaluations
    [playerId: string]: PlayerAssessment;
  };

  // Personnel (added Dec 2025)
  gamePersonnel?: string[];        // Personnel IDs assigned to game

  // Display
  showPlayerNames: boolean;        // Show names on discs
  gameNotes: string;               // Coach notes

  // Advanced
  demandFactor?: number;           // 0.5-1.5 (UI slider), validation allows 0.1-10
}
```

**Estimated Size**: ~5KB per game × 100 games = ~500KB

**Storage Structure**:
```typescript
type SavedGamesCollection = {
  [gameId: string]: AppState;
};
```

### 8. App Settings (`APP_SETTINGS_KEY`)

**Storage**: Single settings object
**Format**: `AppSettings` as JSON string
**Usage**: Global application configuration

```typescript
interface AppSettings {
  currentGameId: string | null;    // "game_1234567890_abcde"
  lastHomeTeamName?: string;       // "PEPO U10" (legacy)
  language?: string;               // "fi" | "en"
  hasSeenAppGuide?: boolean;       // true/false
  useDemandCorrection?: boolean;   // Enable difficulty weighting
  isDrawingModeEnabled?: boolean;  // Drawing tool state

  // Club season dates (ISO format YYYY-MM-DD)
  clubSeasonStartDate?: string;    // Default: "2000-11-15" (November 15th)
  clubSeasonEndDate?: string;      // Default: "2000-10-20" (October 20th next year)
  hasConfiguredSeasonDates?: boolean; // Enables season filtering UI
}
```

**Estimated Size**: ~300 bytes

### 9. Player Adjustments (`PLAYER_ADJUSTMENTS_KEY`)

**Storage**: Record mapping player ID to array of adjustments
**Format**: `Record<string, PlayerStatAdjustment[]>` as JSON string (NOT a flat array)
**Usage**: External games not tracked in app, grouped by player for efficient lookup

```typescript
interface PlayerStatAdjustment {
  id: string;                       // "adj_1234567890_abcde"
  playerId: string;                 // Links to Player.id
  seasonId?: string;                // Optional season context
  teamId?: string;                  // Optional team context
  tournamentId?: string;            // Optional tournament context
  externalTeamName?: string;        // "Regional Selection"
  opponentName?: string;            // "City Team"
  scoreFor?: number;                // 3
  scoreAgainst?: number;            // 2
  gameDate?: string;                // "2025-03-20"
  homeOrAway?: 'home' | 'away' | 'neutral';
  includeInSeasonTournament?: boolean; // Include in stats
  gamesPlayedDelta: number;         // +1
  goalsDelta: number;               // +2
  assistsDelta: number;             // +1
  fairPlayCardsDelta?: number;      // +1
  note?: string;                    // "Hat trick performance"
  createdBy?: string;               // User identifier
  appliedAt: string;                // "2025-03-20T15:30:00.000Z"
}
```

**Estimated Size**: ~400 bytes per adjustment × 20 adjustments = ~8KB

### 10. Supporting Types

**PlayerAssessment** (stored within AppState.assessments):
```typescript
interface PlayerAssessment {
  overall: number;                  // 1-10 rating
  sliders: {
    intensity: number;              // 1-10
    courage: number;                // 1-10
    duels: number;                  // 1-10
    technique: number;              // 1-10
    creativity: number;             // 1-10
    decisions: number;              // 1-10
    awareness: number;              // 1-10
    teamwork: number;               // 1-10
    fair_play: number;              // 1-10
    impact: number;                 // 1-10
  };
  notes: string;                    // Coach comments
  minutesPlayed: number;            // 45
  createdAt: number;                // Timestamp
  createdBy: string;                // "coach"
}
```

**GameEvent** (stored within AppState.gameEvents):
```typescript
interface GameEvent {
  id: string;                       // "evt_1234567890_abcde"
  type: 'goal' | 'opponentGoal' | 'substitution' | 'periodEnd' | 'gameEnd' | 'fairPlayCard';
  time: number;                     // Seconds elapsed (rounded to 2 decimals)
  scorerId?: string;                // Player.id (for goals)
  assisterId?: string;              // Player.id (for assists)
  entityId?: string;                // Generic entity reference
}
```

## Data Relationships

### Logical Relationships (Not Enforced)

```
Team
 ├─ teamId referenced by: AppState.teamId
 └─ teamId keys into: TeamRostersStorage

Season
 ├─ seasonId referenced by: AppState.seasonId, PlayerStatAdjustment.seasonId
 └─ teamPlacements[teamId] references: Team.id

Tournament
 ├─ tournamentId referenced by: AppState.tournamentId, PlayerStatAdjustment.tournamentId
 ├─ series[].id referenced by: AppState.tournamentSeriesId
 ├─ awardedPlayerId references: Player.id
 └─ teamPlacements[teamId] references: Team.id

Player
 ├─ id referenced by: TeamPlayer.id, AppState.selectedPlayerIds
 ├─ id referenced by: PlayerAssessment keys, GameEvent.scorerId/assisterId
 └─ id referenced by: PlayerStatAdjustment.playerId, Tournament.awardedPlayerId

Personnel
 └─ id referenced by: AppState.gamePersonnel[]

AppState (Game)
 ├─ seasonId -> Season.id
 ├─ tournamentId -> Tournament.id
 ├─ tournamentSeriesId -> TournamentSeries.id
 ├─ teamId -> Team.id
 └─ gamePersonnel[] -> Personnel.id
```

**Important**: These relationships are maintained by application logic, not database constraints. Deleted entities may leave dangling references (handled gracefully by UI).

### Reference Integrity Strategy

**Current Behavior** (Graceful Degradation):
1. **Deleted entities**: References remain, but UI shows fallback names
2. **Entity name changes**: Resolved live via `src/utils/entityLookup.ts`
3. **Cross-device imports**: Entity names preserved via snapshot in backup
4. **Orphaned games**: Games with deleted seasons/tournaments still load

**See**: [Linked Entities and Game Sync](../../09-design/linked-entities-and-game-sync.md) for design decisions

## Storage Patterns

### Read Patterns

**1. Get Single Entity by ID** (e.g., `getPlayerById`):
```typescript
// Read entire collection → filter in memory
const roster = await getStorageItem(MASTER_ROSTER_KEY);
const players = roster ? JSON.parse(roster) : [];
return players.find(p => p.id === playerId);
```

**2. Get All Entities** (e.g., `getSeasons`):
```typescript
const seasonsJson = await getStorageItem(SEASONS_LIST_KEY);
return seasonsJson ? JSON.parse(seasonsJson) : [];
```

**3. Query/Filter** (e.g., `getFilteredGames`):
```typescript
// Read all games → filter in JavaScript
const gamesJson = await getStorageItem(SAVED_GAMES_KEY);
const allGames = gamesJson ? JSON.parse(gamesJson) : {};
return Object.entries(allGames)
  .filter(([_, game]) => game.seasonId === seasonId)
  .map(([id, game]) => ({ ...game, id }));
```

### Write Patterns

**1. Create/Add** (e.g., `addSeason`):
```typescript
return withKeyLock(SEASONS_LIST_KEY, async () => {
  const current = await getSeasons();            // Read all
  const updated = [...current, newSeason];       // Modify
  await setStorageItem(KEY, JSON.stringify(updated)); // Write all
});
```

**2. Update** (e.g., `updateSeason`):
```typescript
return withKeyLock(SEASONS_LIST_KEY, async () => {
  const current = await getSeasons();            // Read all
  const index = current.findIndex(s => s.id === id);
  current[index] = updatedSeason;                // Modify
  await setStorageItem(KEY, JSON.stringify(current)); // Write all
});
```

**3. Delete** (e.g., `deleteSeason`):
```typescript
return withKeyLock(SEASONS_LIST_KEY, async () => {
  const current = await getSeasons();            // Read all
  const filtered = current.filter(s => s.id !== id); // Modify
  await setStorageItem(KEY, JSON.stringify(filtered)); // Write all
});
```

**4. Bulk Update** (e.g., `saveGame`):
```typescript
return withKeyLock(SAVED_GAMES_KEY, async () => {
  const allGames = await getSavedGames();        // Read all
  allGames[gameId] = gameState;                  // Modify
  await setStorageItem(KEY, JSON.stringify(allGames)); // Write all
});
```

### Concurrency Protection

**Key-Level Locking** (`src/utils/storageKeyLock.ts`):
```typescript
// Prevents race conditions on same storage key
return withKeyLock(SEASONS_LIST_KEY, async () => {
  // Read → Modify → Write atomic operation
});
```

**Mutex Implementation**:
- Per-key mutex using `async-mutex` package
- Guarantees sequential access to same storage key
- Different keys can be modified concurrently
- No cross-key transaction support

## Storage Size Estimates

### Typical Use Case
**Coach with 1 team, 50 players, 2 seasons, 100 games**:

| Data Type | Count | Size per Item | Total Size |
|-----------|-------|---------------|------------|
| Players | 50 | 200 bytes | 10 KB |
| Teams | 1 | 200 bytes | 200 bytes |
| Team Rosters | 50 | 200 bytes | 10 KB |
| Seasons | 2 | 400 bytes | 800 bytes |
| Tournaments | 3 | 450 bytes | 1.5 KB |
| Games | 100 | 5 KB | 500 KB |
| Personnel | 5 | 300 bytes | 1.5 KB |
| Player Adjustments | 20 | 400 bytes | 8 KB |
| App Settings | 1 | 300 bytes | 300 bytes |
| **Total** | | | **~532 KB** |

### Maximum Expected Use Case
**Coach with 5 teams, 100 players total, 10 seasons, 500 games**:

| Data Type | Total Size |
|-----------|------------|
| Players + Teams + Rosters | 45 KB |
| Seasons + Tournaments | 15 KB |
| Games | 2.5 MB |
| Personnel | 3 KB |
| Player Adjustments | 40 KB |
| **Total** | **~2.6 MB** |

**IndexedDB Limit**: 50+ MB (typically much higher, up to 50% of disk space in some browsers)

## Performance Characteristics

### Current Performance (IndexedDB)

**Read Operations**:
- Get single entity: O(n) - read array, find item
- Get all entities: O(1) - read array
- Query/filter: O(n) - read all, filter in memory

**Write Operations**:
- Add entity: O(n) - read all, append, write all
- Update entity: O(n) - read all, find, modify, write all
- Delete entity: O(n) - read all, filter, write all

**IndexedDB Benefits**:
- Better quota (50+ MB vs localStorage's 5-10 MB)
- Async transactions (no main thread blocking)
- Cursor-based iteration (can reduce memory)
- Still limited by key-value semantics (no SQL queries)

**Bottlenecks**:
- Every operation reads/writes entire collection
- JSON parse/stringify overhead
- No indexing support
- Mutex locking reduces concurrency

## Migration Considerations

### Moving to Relational Database (Supabase)

**Key Challenges**:
1. **Key-value → Relational**: Each storage key becomes a table
2. **JSON Arrays → Rows**: Array items become individual rows with IDs
3. **Embedded Objects → Foreign Keys**: `AppState.assessments` → separate table
4. **No Constraints → Foreign Keys**: Add `ON DELETE` behaviors
5. **Soft Deletes**: Add `deleted_at` columns for archived entities

**Example Mapping**:
```
SEASONS_LIST_KEY (JSON array)
  → seasons table (rows)

savedSoccerGames['game_123'].assessments['player_456']
  → player_assessments table
    - game_id: 'game_123'
    - player_id: 'player_456'
    - ...assessment fields
```

**See Also**:
- [Supabase Schema](./supabase-schema.md) - Target relational design
- [Migration Strategy](../../03-active-plans/backend-evolution/migration-strategy.md) - Transformation plan

## Code References

**Storage Abstraction**:
- `src/utils/storage.ts` - Core storage operations
- `src/utils/storageAdapter.ts` - Interface definition
- `src/utils/storageFactory.ts` - IndexedDB adapter selection

**Domain Managers** (all use storage abstraction):
- `src/utils/masterRoster.ts` - Player CRUD
- `src/utils/savedGames.ts` - Game CRUD with filtering
- `src/utils/seasons.ts` - Season CRUD
- `src/utils/tournaments.ts` - Tournament CRUD
- `src/utils/appSettings.ts` - Settings management
- `src/utils/personnel.ts` - Personnel CRUD (added Dec 2025)

**Configuration**:
- `src/config/storageKeys.ts` - All storage key constants

---

**Next Steps**:
- Review [Supabase Schema](./supabase-schema.md) for target design
- See [Dual-Backend Architecture](../architecture/dual-backend-architecture.md) for migration strategy
