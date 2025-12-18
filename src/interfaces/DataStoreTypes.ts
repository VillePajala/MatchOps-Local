/**
 * DataStore Supporting Types
 *
 * Additional types used by DataStore interface and implementations.
 * Part of Phase 2 backend abstraction (PR #4).
 *
 * @see DataStore.ts for main interface
 * @see docs/03-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md
 */

/**
 * DataStore backend mode.
 * Currently only 'local' is implemented.
 */
export type DataStoreMode = 'local' | 'cloud';

/**
 * DataStore configuration options.
 */
export interface DataStoreConfig {
  /** Backend mode */
  mode: DataStoreMode;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Result of a bulk operation with partial success tracking.
 * @reserved Phase 4 (SupabaseDataStore) - for batch sync operations
 */
export interface BulkOperationResult<T> {
  /** Successfully processed items */
  succeeded: T[];
  /** Failed items with error information */
  failed: Array<{ item: T; error: Error }>;
  /** Total items attempted */
  total: number;
}

/**
 * Options for filtering operations.
 * @reserved Phase 3+ - for enhanced query methods in LocalDataStore/SupabaseDataStore
 */
export interface FilterOptions {
  /** Include archived items */
  includeArchived?: boolean;
  /** Filter by team ID */
  teamId?: string;
  /** Filter by season ID */
  seasonId?: string;
  /** Filter by tournament ID */
  tournamentId?: string;
  /** Maximum number of results */
  limit?: number;
  /** Skip first N results */
  offset?: number;
}

/**
 * Options for game filtering.
 * @reserved Phase 3+ - for getFilteredGames() in LocalDataStore/SupabaseDataStore
 */
export interface GameFilterOptions extends FilterOptions {
  /** Filter by game status */
  status?: 'notStarted' | 'inProgress' | 'periodEnd' | 'gameEnd';
  /** Filter by date range start (ISO string) */
  fromDate?: string;
  /** Filter by date range end (ISO string) */
  toDate?: string;
  /** Filter by game type */
  gameType?: 'soccer' | 'futsal';
  /** Filter by gender */
  gender?: 'boys' | 'girls';
  /** Filter by played status */
  isPlayed?: boolean;
}

/**
 * Sync status for cloud-enabled data stores.
 * (For future SupabaseDataStore implementation)
 */
export interface SyncStatus {
  /** Last successful sync timestamp */
  lastSyncedAt: string | null;
  /** Number of pending local changes */
  pendingChanges: number;
  /** Current sync state */
  state: 'synced' | 'syncing' | 'offline' | 'error';
  /** Error message if state is 'error' */
  errorMessage?: string;
}

/**
 * Conflict resolution strategy for cloud sync.
 * (For future SupabaseDataStore implementation)
 */
export type ConflictResolution = 'local-wins' | 'remote-wins' | 'newest-wins' | 'manual';

/**
 * Connection status for data store.
 */
export interface ConnectionStatus {
  /** Is the data store connected/available */
  connected: boolean;
  /** Backend name */
  backend: string;
  /** Additional status info */
  message?: string;
}
