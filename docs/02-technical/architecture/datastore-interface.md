# DataStore Interface Specification

**Status**: ✅ **Implemented** (Phase 1-3 Complete)
**Last Updated**: 2025-12-19
**Purpose**: Unified data access interface for both IndexedDB (local) and Supabase (cloud) backends
**Related**: [Dual-Backend Architecture](./dual-backend-architecture.md) | [Current Storage Schema](../database/current-storage-schema.md) | [Supabase Schema](../database/supabase-schema.md)

## Overview

The `DataStore` interface provides a **unified, domain-oriented API** for data operations that works seamlessly across both local (IndexedDB) and cloud (Supabase) backends. It replaces the low-level `StorageAdapter` interface with higher-level methods that understand application entities (players, games, seasons, etc.).

### Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| DataStore Interface | ✅ Implemented | `src/interfaces/DataStore.ts` |
| AuthService Interface | ✅ Implemented | `src/interfaces/AuthService.ts` |
| LocalDataStore | ✅ Implemented | `src/datastore/LocalDataStore.ts` |
| LocalAuthService | ✅ Implemented | `src/auth/LocalAuthService.ts` |
| Factory | ✅ Implemented | `src/datastore/factory.ts` |
| SupabaseDataStore | 📋 Planned (Phase 4) | - |
| SupabaseAuthService | 📋 Planned (Phase 4) | - |

**Test Coverage**: 2,700+ tests including comprehensive LocalDataStore test suite.

**Key Design Principles**:
1. **Backend Agnostic**: Same interface for IndexedDB and Supabase implementations
2. **Type-Safe**: Full TypeScript support with generic types
3. **Domain-Oriented**: Methods match domain operations, not storage primitives
4. **Async by Default**: All operations return Promises
5. **Error Handling**: Typed errors with context
6. **Offline-First**: Works offline with automatic sync when online (cloud mode)

## Interface Definition

```typescript
/**
 * Unified data access interface for both local (IndexedDB) and cloud (Supabase) backends.
 *
 * Implementations:
 * - LocalDataStore: Wraps existing IndexedDB adapter
 * - SupabaseDataStore: PostgreSQL with Supabase client
 */
export interface DataStore {
  // ==================== LIFECYCLE ====================

  /**
   * Initialize the datastore (open connections, validate schema, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Close connections and cleanup resources
   */
  close(): Promise<void>;

  /**
   * Get the backend name for logging/debugging
   */
  getBackendName(): string;

  /**
   * Check if the backend is available and operational
   */
  isAvailable(): Promise<boolean>;

  // ==================== PLAYERS ====================

  /**
   * Get all players for current user
   * @returns Array of players (empty if none)
   */
  getPlayers(): Promise<Player[]>;

  /**
   * Get player by ID
   * @param id - Player ID
   * @returns Player or null if not found
   */
  getPlayerById(id: string): Promise<Player | null>;

  /**
   * Create a new player
   * @param player - Player data (without id)
   * @returns Created player with generated ID
   */
  createPlayer(player: Omit<Player, 'id'>): Promise<Player>;

  /**
   * Update existing player
   * @param id - Player ID
   * @param updates - Partial player data to update
   * @returns Updated player or null if not found
   */
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | null>;

  /**
   * Delete player
   * @param id - Player ID
   * @returns true if deleted, false if not found
   */
  deletePlayer(id: string): Promise<boolean>;

  // ==================== TEAMS ====================

  /**
   * Get all teams for current user
   * @param includeArchived - Include archived teams
   * @returns Array of teams (empty if none)
   */
  getTeams(includeArchived?: boolean): Promise<Team[]>;

  /**
   * Get team by ID
   * @param id - Team ID
   * @returns Team or null if not found
   */
  getTeamById(id: string): Promise<Team | null>;

  /**
   * Create a new team
   * @param team - Team data (without id, timestamps)
   * @returns Created team with generated ID
   */
  createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team>;

  /**
   * Update existing team
   * @param id - Team ID
   * @param updates - Partial team data to update
   * @returns Updated team or null if not found
   */
  updateTeam(id: string, updates: Partial<Team>): Promise<Team | null>;

  /**
   * Delete team (soft delete via archived flag)
   * @param id - Team ID
   * @returns true if deleted, false if not found
   */
  deleteTeam(id: string): Promise<boolean>;

  // ==================== TEAM PLAYERS ====================

  /**
   * Get players for a specific team
   * @param teamId - Team ID
   * @returns Array of team players (empty if none)
   */
  getTeamPlayers(teamId: string): Promise<TeamPlayer[]>;

  /**
   * Add player to team
   * @param teamId - Team ID
   * @param player - Player data (without id)
   * @returns Created team player with generated ID
   */
  addTeamPlayer(teamId: string, player: Omit<TeamPlayer, 'id'>): Promise<TeamPlayer>;

  /**
   * Update team player
   * @param teamId - Team ID
   * @param playerId - Player ID
   * @param updates - Partial player data to update
   * @returns Updated player or null if not found
   */
  updateTeamPlayer(teamId: string, playerId: string, updates: Partial<TeamPlayer>): Promise<TeamPlayer | null>;

  /**
   * Remove player from team
   * @param teamId - Team ID
   * @param playerId - Player ID
   * @returns true if removed, false if not found
   */
  removeTeamPlayer(teamId: string, playerId: string): Promise<boolean>;

  // ==================== SEASONS ====================

  /**
   * Get all seasons for current user
   * @param includeArchived - Include archived seasons
   * @returns Array of seasons (empty if none)
   */
  getSeasons(includeArchived?: boolean): Promise<Season[]>;

  /**
   * Get season by ID
   * @param id - Season ID
   * @returns Season or null if not found
   */
  getSeasonById(id: string): Promise<Season | null>;

  /**
   * Create a new season
   * @param season - Season data (without id)
   * @returns Created season with generated ID
   */
  createSeason(season: Omit<Season, 'id'>): Promise<Season>;

  /**
   * Update existing season
   * @param id - Season ID
   * @param updates - Partial season data to update
   * @returns Updated season or null if not found
   */
  updateSeason(id: string, updates: Partial<Season>): Promise<Season | null>;

  /**
   * Delete season (soft delete via archived flag)
   * @param id - Season ID
   * @returns true if deleted, false if not found
   */
  deleteSeason(id: string): Promise<boolean>;

  /**
   * Count games associated with a season
   * @param id - Season ID
   * @returns Number of games
   */
  countGamesForSeason(id: string): Promise<number>;

  // ==================== TOURNAMENTS ====================

  /**
   * Get all tournaments for current user
   * @param includeArchived - Include archived tournaments
   * @returns Array of tournaments (empty if none)
   */
  getTournaments(includeArchived?: boolean): Promise<Tournament[]>;

  /**
   * Get tournament by ID
   * @param id - Tournament ID
   * @returns Tournament or null if not found
   */
  getTournamentById(id: string): Promise<Tournament | null>;

  /**
   * Create a new tournament
   * @param tournament - Tournament data (without id)
   * @returns Created tournament with generated ID
   */
  createTournament(tournament: Omit<Tournament, 'id'>): Promise<Tournament>;

  /**
   * Update existing tournament
   * @param id - Tournament ID
   * @param updates - Partial tournament data to update
   * @returns Updated tournament or null if not found
   */
  updateTournament(id: string, updates: Partial<Tournament>): Promise<Tournament | null>;

  /**
   * Delete tournament (soft delete via archived flag)
   * @param id - Tournament ID
   * @returns true if deleted, false if not found
   */
  deleteTournament(id: string): Promise<boolean>;

  /**
   * Count games associated with a tournament
   * @param id - Tournament ID
   * @returns Number of games
   */
  countGamesForTournament(id: string): Promise<number>;

  // ==================== GAMES ====================

  /**
   * Get all games for current user
   * @param options - Filtering options
   * @returns Array of games (empty if none)
   */
  getGames(options?: GameFilterOptions): Promise<AppState[]>;

  /**
   * Get game by ID
   * @param id - Game ID
   * @returns Complete game state or null if not found
   */
  getGameById(id: string): Promise<AppState | null>;

  /**
   * Create a new game
   * @param game - Complete game state (without id)
   * @returns Created game with generated ID
   */
  createGame(game: Omit<AppState, 'id'>): Promise<AppState>;

  /**
   * Update existing game
   * @param id - Game ID
   * @param updates - Partial game data to update
   * @returns Updated game or null if not found
   */
  updateGame(id: string, updates: Partial<AppState>): Promise<AppState | null>;

  /**
   * Save complete game state (upsert operation)
   * @param id - Game ID
   * @param game - Complete game state
   * @returns Saved game state
   */
  saveGame(id: string, game: AppState): Promise<AppState>;

  /**
   * Delete game
   * @param id - Game ID
   * @returns true if deleted, false if not found
   */
  deleteGame(id: string): Promise<boolean>;

  /**
   * Delete multiple games
   * @param ids - Array of game IDs
   * @returns Number of games deleted
   */
  deleteGames(ids: string[]): Promise<number>;

  // ==================== PLAYER ADJUSTMENTS ====================

  /**
   * Get all player adjustments for current user
   * @param options - Filtering options
   * @returns Array of adjustments (empty if none)
   */
  getPlayerAdjustments(options?: AdjustmentFilterOptions): Promise<PlayerStatAdjustment[]>;

  /**
   * Create a new player adjustment
   * @param adjustment - Adjustment data (without id)
   * @returns Created adjustment with generated ID
   */
  createPlayerAdjustment(adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'>): Promise<PlayerStatAdjustment>;

  /**
   * Update existing player adjustment
   * @param id - Adjustment ID
   * @param updates - Partial adjustment data to update
   * @returns Updated adjustment or null if not found
   */
  updatePlayerAdjustment(id: string, updates: Partial<PlayerStatAdjustment>): Promise<PlayerStatAdjustment | null>;

  /**
   * Delete player adjustment
   * @param id - Adjustment ID
   * @returns true if deleted, false if not found
   */
  deletePlayerAdjustment(id: string): Promise<boolean>;

  // ==================== SETTINGS ====================

  /**
   * Get user settings
   * @returns User settings (defaults if not found)
   */
  getSettings(): Promise<AppSettings>;

  /**
   * Update user settings
   * @param updates - Partial settings to update
   * @returns Updated settings
   */
  updateSettings(updates: Partial<AppSettings>): Promise<AppSettings>;

  /**
   * Reset settings to defaults
   * @returns Default settings
   */
  resetSettings(): Promise<AppSettings>;

  // ==================== BULK OPERATIONS ====================

  /**
   * Export all user data for backup/migration
   * @returns Complete data export
   */
  exportAllData(): Promise<DataExport>;

  /**
   * Import data from backup/migration
   * @param data - Complete data export
   * @param options - Import options
   * @returns Import result with counts
   */
  importData(data: DataExport, options?: ImportOptions): Promise<ImportResult>;

  /**
   * Clear all user data (reset app)
   * @returns true if successful
   */
  clearAllData(): Promise<boolean>;

  // ==================== ANALYTICS / STATS ====================

  /**
   * Get player statistics across games
   * @param playerId - Player ID
   * @param options - Filtering options (season, tournament, date range)
   * @returns Player statistics
   */
  getPlayerStats(playerId: string, options?: StatsFilterOptions): Promise<PlayerStatRow>;

  /**
   * Get team statistics
   * @param teamId - Team ID (optional, uses legacy roster if not provided)
   * @param options - Filtering options
   * @returns Array of player statistics for team
   */
  getTeamStats(teamId?: string, options?: StatsFilterOptions): Promise<PlayerStatRow[]>;
}
```

## Supporting Types

### Filter Options

```typescript
/**
 * Options for filtering games
 */
export interface GameFilterOptions {
  seasonId?: string;
  tournamentId?: string;
  teamId?: string;
  startDate?: string;
  endDate?: string;
  homeOrAway?: 'home' | 'away';
  isPlayed?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Options for filtering player adjustments
 */
export interface AdjustmentFilterOptions {
  playerId?: string;
  seasonId?: string;
  tournamentId?: string;
  teamId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Options for filtering statistics
 */
export interface StatsFilterOptions {
  seasonId?: string;
  tournamentId?: string;
  startDate?: string;
  endDate?: string;
  includeAdjustments?: boolean; // Include external game adjustments
}
```

### Import/Export Types

```typescript
/**
 * Complete data export structure
 */
export interface DataExport {
  version: string;               // Export format version
  exportedAt: string;            // ISO timestamp
  backend: 'local' | 'supabase'; // Source backend

  players: Player[];
  teams: Team[];
  teamRosters: { [teamId: string]: TeamPlayer[] };
  seasons: Season[];
  tournaments: Tournament[];
  games: { [gameId: string]: AppState };
  playerAdjustments: PlayerStatAdjustment[];
  settings: AppSettings;
}

/**
 * Options for importing data
 */
export interface ImportOptions {
  overwrite?: boolean;           // Overwrite existing data
  validateSchema?: boolean;      // Validate data structure
  skipInvalid?: boolean;         // Skip invalid entries instead of failing
}

/**
 * Result of import operation
 */
export interface ImportResult {
  success: boolean;
  counts: {
    players: number;
    teams: number;
    teamPlayers: number;
    seasons: number;
    tournaments: number;
    games: number;
    adjustments: number;
  };
  errors: string[];
}
```

### Error Handling

```typescript
/**
 * DataStore-specific errors
 */
export class DataStoreError extends Error {
  constructor(
    message: string,
    public code: DataStoreErrorCode,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DataStoreError';
  }
}

export enum DataStoreErrorCode {
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
```

## Implementation: LocalDataStore

**Wrapper around existing IndexedDB adapter**:

```typescript
/**
 * Local-first implementation using IndexedDB key-value storage
 */
export class LocalDataStore implements DataStore {
  private adapter: StorageAdapter;

  constructor(adapter?: StorageAdapter) {
    // Use existing IndexedDB adapter or create new one
    this.adapter = adapter ?? createStorageAdapter({ mode: 'indexeddb' });
  }

  async initialize(): Promise<void> {
    // IndexedDB adapter handles initialization
  }

  getBackendName(): string {
    return 'IndexedDB (Local)';
  }

  async getPlayers(): Promise<Player[]> {
    // Read from MASTER_ROSTER_KEY (existing pattern)
    const json = await this.adapter.getItem(MASTER_ROSTER_KEY);
    return json ? JSON.parse(json) : [];
  }

  async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
    // Use existing addPlayerToRoster() logic
    return withKeyLock(MASTER_ROSTER_KEY, async () => {
      const players = await this.getPlayers();
      const newPlayer: Player = {
        id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        ...player,
      };
      await this.adapter.setItem(MASTER_ROSTER_KEY, JSON.stringify([...players, newPlayer]));
      return newPlayer;
    });
  }

  async getGames(options?: GameFilterOptions): Promise<AppState[]> {
    // Use existing getFilteredGames() logic
    const json = await this.adapter.getItem(SAVED_GAMES_KEY);
    const allGames = json ? JSON.parse(json) : {};

    let games = Object.entries(allGames).map(([id, game]) => ({ ...game as AppState, id }));

    // Apply filters
    if (options?.seasonId) {
      games = games.filter(g => g.seasonId === options.seasonId);
    }
    if (options?.tournamentId) {
      games = games.filter(g => g.tournamentId === options.tournamentId);
    }
    // ... more filters

    return games;
  }

  // ... implement all DataStore methods by delegating to existing utilities
}
```

**Key Pattern**: LocalDataStore wraps existing code without changing it, providing the new interface while maintaining backward compatibility.

## Implementation: SupabaseDataStore

**PostgreSQL via Supabase client**:

```typescript
/**
 * Cloud implementation using Supabase PostgreSQL + Auth
 */
export class SupabaseDataStore implements DataStore {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async initialize(): Promise<void> {
    // Verify connection and auth
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      throw new DataStoreError(
        'Not authenticated',
        DataStoreErrorCode.PERMISSION_DENIED
      );
    }
  }

  getBackendName(): string {
    return 'Supabase (Cloud)';
  }

  async getPlayers(): Promise<Player[]> {
    // Query players table with RLS
    const { data, error } = await this.supabase
      .from('players')
      .select('*');

    if (error) {
      throw new DataStoreError(
        'Failed to fetch players',
        DataStoreErrorCode.UNKNOWN_ERROR,
        { error }
      );
    }

    return data.map(row => this.mapPlayerFromDb(row));
  }

  async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
    const { data, error } = await this.supabase
      .from('players')
      .insert([{
        name: player.name,
        nickname: player.nickname,
        jersey_number: player.jerseyNumber,
        is_goalie: player.isGoalie,
        color: player.color,
        notes: player.notes,
      }])
      .select()
      .single();

    if (error) {
      throw new DataStoreError(
        'Failed to create player',
        DataStoreErrorCode.CONSTRAINT_VIOLATION,
        { error }
      );
    }

    return this.mapPlayerFromDb(data);
  }

  async getGames(options?: GameFilterOptions): Promise<AppState[]> {
    // Build query with filters
    let query = this.supabase.from('games').select(`
      *,
      game_players(*),
      game_events(*),
      player_assessments(*),
      game_tactical_data(*)
    `);

    if (options?.seasonId) {
      query = query.eq('season_id', options.seasonId);
    }
    if (options?.tournamentId) {
      query = query.eq('tournament_id', options.tournamentId);
    }

    const { data, error } = await query;

    if (error) {
      throw new DataStoreError(
        'Failed to fetch games',
        DataStoreErrorCode.UNKNOWN_ERROR,
        { error }
      );
    }

    // Transform relational data back to AppState format
    return data.map(row => this.mapGameFromDb(row));
  }

  private mapPlayerFromDb(row: any): Player {
    return {
      id: row.id,
      name: row.name,
      nickname: row.nickname,
      jerseyNumber: row.jersey_number,
      isGoalie: row.is_goalie,
      color: row.color,
      notes: row.notes,
      receivedFairPlayCard: row.received_fair_play_card,
    };
  }

  private mapGameFromDb(row: any): AppState {
    // Complex transformation: relational → flat AppState
    return {
      teamName: row.team_name,
      opponentName: row.opponent_name,
      gameDate: row.game_date,
      homeScore: row.home_score,
      awayScore: row.away_score,
      playersOnField: row.game_players.filter((p: any) => p.on_field).map(this.mapGamePlayerFromDb),
      availablePlayers: row.game_players.filter((p: any) => !p.on_field).map(this.mapGamePlayerFromDb),
      gameEvents: row.game_events.map(this.mapGameEventFromDb),
      assessments: this.mapAssessmentsFromDb(row.player_assessments),
      // ... map all fields
    };
  }

  // ... implement all DataStore methods using Supabase client
}
```

**Key Pattern**: SupabaseDataStore transforms between relational (PostgreSQL) and document (AppState) formats.

## Usage in Application

### Initialization

```typescript
// src/utils/datastore.ts

import { AuthService } from './authService';
import { LocalDataStore } from './datastore/LocalDataStore';
import { SupabaseDataStore } from './datastore/SupabaseDataStore';

let datastoreInstance: DataStore | null = null;

export async function getDataStore(): Promise<DataStore> {
  if (datastoreInstance) {
    return datastoreInstance;
  }

  const authService = getAuthService();
  const mode = authService.getMode(); // 'local' | 'cloud'

  if (mode === 'local') {
    datastoreInstance = new LocalDataStore();
  } else {
    const supabase = await authService.getSupabaseClient();
    datastoreInstance = new SupabaseDataStore(supabase);
  }

  await datastoreInstance.initialize();
  return datastoreInstance;
}
```

### React Query Integration

```typescript
// src/hooks/useRoster.ts (updated)

export function useRoster() {
  const datastore = getDataStore();

  const { data: roster = [], isLoading } = useQuery({
    queryKey: ['roster'],
    queryFn: () => datastore.getPlayers(),
  });

  const addPlayerMutation = useMutation({
    mutationFn: (player: Omit<Player, 'id'>) => datastore.createPlayer(player),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
  });

  return {
    roster,
    isLoading,
    addPlayer: addPlayerMutation.mutate,
  };
}
```

### Component Usage

```typescript
// No changes needed in components - React Query handles caching/invalidation
function RosterList() {
  const { roster, addPlayer } = useRoster();

  return (
    <ul>
      {roster.map(player => (
        <li key={player.id}>{player.name}</li>
      ))}
      <button onClick={() => addPlayer({ name: 'New Player' })}>
        Add Player
      </button>
    </ul>
  );
}
```

## Migration Path

### Phase 1: Introduce DataStore

1. Create `DataStore` interface
2. Implement `LocalDataStore` (wraps existing code)
3. Update React Query hooks to use `getDataStore()`
4. **Result**: Same functionality, new interface

### Phase 2: Implement Supabase

1. Implement `SupabaseDataStore`
2. Add Supabase client initialization
3. Test with cloud backend
4. **Result**: Both backends work independently

### Phase 3: Backend Selection

1. Add UI for backend selection (local vs cloud)
2. Implement auth flow for cloud mode
3. Add migration tool (export from local → import to cloud)
4. **Result**: User can choose backend

### Phase 4: Deprecate StorageAdapter

1. Remove direct `StorageAdapter` usage from utilities
2. All code uses `DataStore` interface
3. **Result**: Clean abstraction, ready for future backends

## Performance Considerations

### LocalDataStore

**Same as Current**:
- Read/write entire collections
- In-memory filtering
- Key-level locking
- No network overhead

**Optimizations**:
- Cache parsed JSON (avoid repeated `JSON.parse`)
- Batch operations where possible
- Lazy load large objects (games)

### SupabaseDataStore

**Network Overhead**:
- Every operation requires network round-trip
- Batch operations critical for performance
- Caching essential (React Query handles this)

**Optimizations**:
- Use `select` to fetch only needed fields
- Batch inserts/updates where possible
- Use Supabase real-time subscriptions for multi-device sync
- Materialized views for complex stats queries

## Comparison to StorageAdapter

| Feature | StorageAdapter | DataStore |
|---------|----------------|-----------|
| **Level** | Low-level (key-value) | High-level (domain entities) |
| **Methods** | `getItem`, `setItem`, `removeItem` | `getPlayers`, `createGame`, etc. |
| **Type Safety** | JSON strings | Typed entities |
| **Backend Support** | IndexedDB, localStorage | IndexedDB, Supabase |
| **Filtering** | App-level (after fetch) | Interface-level (push down) |
| **Relationships** | None | Foreign keys (Supabase) |
| **Error Handling** | Generic `StorageError` | Typed `DataStoreError` |

**Migration**: DataStore wraps StorageAdapter (LocalDataStore) or replaces it (SupabaseDataStore)

---

**Next Steps**:
- Review [AuthService Interface](./auth-service-interface.md) for authentication layer
- See [Dual-Backend Architecture](./dual-backend-architecture.md) for complete system design
- Check [Phased Implementation Roadmap](../../03-active-plans/backend-evolution/phased-implementation-roadmap.md) for rollout plan
