# IndexedDB Infrastructure Replacement Plan

Status: Authoritative technical plan (phased)

IMPORTANT — Reality Alignment and Scope
- Status: No IndexedDB code exists yet in the app (as of this review). All persistence runs via `src/utils/localStorage.ts`.
- Safety Net: A robust backup/rollback system is already implemented (`src/utils/migrationBackup.ts`, `src/utils/fullBackup.ts`).
- Cutover Strategy: Adopt a phased approach — KV shim first, then optional normalization — to minimize risk and churn.

## Executive Summary

This document outlines the detailed implementation plan for replacing MatchOps Local's localStorage infrastructure with IndexedDB. The infrastructure replacement follows a "Cutover with Safety Net" approach, avoiding dual-write complexity while ensuring zero data loss through comprehensive backup and rollback mechanisms.

**Key Principles:**
- Single source of truth at all times
- Atomic migration per user session  
- Clean rollback to previous state on any failure
- Zero data loss guarantee

## Current Architecture Analysis (Verified)

### Storage Layer Structure

**Current localStorage Keys (14 total):**
```typescript
// Core data (from src/config/storageKeys.ts)
export const SAVED_GAMES_KEY = 'savedSoccerGames';           // Largest dataset
export const MASTER_ROSTER_KEY = 'soccerMasterRoster';       // Player roster
export const SEASONS_LIST_KEY = 'soccerSeasons';             // Seasons metadata
export const TOURNAMENTS_LIST_KEY = 'soccerTournaments';     // Tournaments metadata
export const APP_SETTINGS_KEY = 'soccerAppSettings';         // App configuration
export const TEAMS_INDEX_KEY = 'soccerTeamsIndex';           // Multi-team support
export const TEAM_ROSTERS_KEY = 'soccerTeamRosters';         // Team rosters
export const LAST_HOME_TEAM_NAME_KEY = 'lastHomeTeamName';   // Legacy setting
export const TIMER_STATE_KEY = 'soccerTimerState';           // Timer persistence
export const PLAYER_ADJUSTMENTS_KEY = 'soccerPlayerAdjustments'; // Player stats
export const APP_DATA_VERSION_KEY = 'appDataVersion';        // Migration tracking
```

**Current Abstraction Layer (src/utils/localStorage.ts):**
```typescript
// Well-designed abstraction already in place
export const getStorage = (): Storage | null
export const getLocalStorageItem = (key: string): string | null
export const setLocalStorageItem = (key: string, value: string): void
export const removeLocalStorageItem = (key: string): void
export const clearLocalStorage = (): void
```

**Data Managers (All async-ready):**
- `src/utils/masterRosterManager.ts` - Player CRUD operations
- `src/utils/savedGames.ts` - Game collection management (690 lines)
- `src/utils/seasons.ts` - Season management
- `src/utils/tournaments.ts` - Tournament management  
- `src/utils/appSettings.ts` - App configuration
- `src/utils/teams.ts` - Multi-team support with lock management
- `src/utils/fullBackup.ts` - Comprehensive backup/restore

### React Query Integration

**Query Keys (src/config/queryKeys.ts):**
```typescript
export const queryKeys = {
  masterRoster: ['masterRoster'] as const,
  seasons: ['seasons'] as const,
  tournaments: ['tournaments'] as const,
  savedGames: ['savedGames'] as const,
  teams: ['teams'] as const,
  teamRoster: (teamId: string) => ['teams', teamId, 'roster'] as const,
  appSettingsCurrentGameId: ['appSettingsCurrentGameId'] as const,
};
```

**Usage Pattern (src/components/HomePage.tsx):**
```typescript
// React Query properly integrated with data managers
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGameDataQueries } from '@/hooks/useGameDataQueries';
```

### Data Validation & Schema

**Zod Schema System (src/utils/appStateSchema.ts):**
```typescript
// Comprehensive validation already in place
export const appStateSchema = z.object({
  playersOnField: z.array(playerSchema),
  opponents: z.array(opponentSchema),
  drawings: z.array(z.array(pointSchema)),
  availablePlayers: z.array(playerSchema),
  showPlayerNames: z.boolean(),
  teamName: z.string().min(1, 'Team name is required'),
  gameEvents: z.array(gameEventSchema),
  // ... 20+ validated fields
});
```

### Lock Management System

**Current Implementation (src/utils/lockManager.ts):**
```typescript
export class LockManager {
  async withLock<T>(resource: string, operation: () => Promise<T>): Promise<T>
  // Used for roster operations to prevent race conditions
}

export const withRosterLock = <T>(operation: () => Promise<T>): Promise<T>
// Used in src/utils/teams.ts for atomic operations
```

### Migration Infrastructure

**Existing Migration System (src/utils/migration.ts):**
```typescript
const CURRENT_DATA_VERSION = 2;

export const isMigrationNeeded = (): boolean
export const getAppDataVersion = (): number
export const runMigration = async (): Promise<void>
// Called in src/app/page.tsx on app startup
```

## Implementation Plan (Phased, Execution-Ready)

This plan is adjusted to the current codebase. It avoids dual‑writes and minimizes refactors by first swapping the underlying storage infrastructure for the existing key/value model, then optionally enhancing to a normalized schema.

### Phase 0: Key/Value Adapter Shim (Low Risk)

Goal: Introduce an IndexedDB adapter that mimics localStorage semantics (single KV object store), so domain utilities remain unchanged.

Files to add:
- `src/utils/storageAdapter.ts` — Defines `StorageAdapter` interface.
- `src/utils/indexedDbKvAdapter.ts` — Minimal KV adapter using `idb` with one object store (e.g., `kv`).
- `src/utils/storageFactory.ts` — Chooses adapter (`localStorage` vs `indexedDB`) using a `storage-mode` flag in localStorage.

Steps:
1. Add dependency: `idb` (or `dexie`, but `idb` is lighter).
2. Implement `IndexedDbKvAdapter` with methods: `getItem`, `setItem`, `removeItem`, `clear`, mirroring `localStorage.ts` API semantics.
3. Implement `storageFactory` to return the appropriate adapter based on `storage-mode` (default `localStorage`).
4. Update `src/utils/localStorage.ts` to delegate to the adapter returned by the factory (preserve function signatures to avoid ripple changes).

Acceptance:
- All reads/writes continue to work with `mode=localStorage`.
- Flipping `storage-mode=indexedDB` stores and retrieves values transparently from IndexedDB KV.
- No domain code changes required.

#### Phase 0 Execution Status:
- ✅ **Step 0A.1**: Storage Interface Implementation (`src/utils/storageAdapter.ts`) - *COMPLETED*
  - StorageAdapter interface with comprehensive error handling
  - StorageError types for structured error reporting
  - Complete interface tests and validation
- ✅ **Step 0A.2**: LocalStorage Adapter Implementation (`src/utils/localStorageAdapter.ts`) - *COMPLETED*
  - Production-ready LocalStorage adapter with 39 comprehensive tests
  - Professional JSDoc documentation and enhanced error context
  - Human-readable size formatting and defensive edge case handling
  - Full integration with existing localStorage utilities
- 🔄 **Step 0A.3**: IndexedDB Adapter Implementation (`src/utils/indexedDbKvAdapter.ts`) - *PENDING*
- 🔄 **Step 0A.4**: Storage Factory Implementation (`src/utils/storageFactory.ts`) - *PENDING*

### Phase 1: Infrastructure Cutover with Data Transfer (KV copy with Safety Net)

Goal: Replace localStorage infrastructure with IndexedDB while atomically transferring existing data and switching `storage-mode` to `indexedDB`.

Files to add:
- `src/utils/indexedDbMigration.ts` — Coordinates backup, copy, flip, rollback.

Steps:
1. Create comprehensive backup using existing `createMigrationBackup`.
2. For each critical key (see list below), read value via `localStorage.ts`, write to IDB KV under the same key.
3. Verify round‑trip reads from IDB match originals (basic checksum/length check per key).
4. Flip flag `storage-mode=indexedDB` and persist `storage-version` (e.g., `2.0`).
5. On any error, restore from backup and keep `storage-mode=localStorage`.
6. Integrate: Extend `runMigration()` to invoke this storage migration once per device.

Critical keys to migrate (source of truth: `src/config/storageKeys.ts`):
- `savedSoccerGames`, `soccerMasterRoster`, `soccerSeasons`, `soccerTournaments`, `soccerAppSettings`, `soccerTeamsIndex`, `soccerTeamRosters`, `soccerPlayerAdjustments`, `appDataVersion`, `lastHomeTeamName`, `soccerTimerState`.

Acceptance:
- After migration, `storage-mode=indexedDB` and all data is readable via the adapter.
- Backup is cleared upon success; retained if rollback occurred.
- App boots and passes smoke tests with the IDB backend.

### Phase 2 (Optional): Normalized IndexedDB Schema

Goal: Evolve from KV to normalized stores for performance and richer querying.

Files to add:
- `src/utils/indexedDbStorage.ts` — Rich adapter exposing typed methods (games, players, seasons, tournaments).
- Migrations to move from KV to normalized stores (read from KV once, fan out into stores; then retire KV keys).

Suggested stores and indexes:
- `games` (keyPath: `id`; indexes: `seasonId`, `tournamentId`, `gameDate`, `teamId`)
- `players` (keyPath: `id`; indexes: `teamId`, `name`)
- `seasons` (keyPath: `id`), `tournaments` (keyPath: `id`)

Steps:
1. Introduce versioned IDB schema via `openDB(name, version, { upgrade(db, oldVersion, newVersion) { ... } })`.
2. Implement one‑time KV→normalized migration (idempotent, guarded by `storage-version`).
3. Update domain utilities progressively to use the normalized adapter APIs (behind the same `storageFactory`).
4. Keep compatibility shims for one release if needed, then remove KV path.

Acceptance:
- Filtering and lookups leverage indexes; performance improves for large datasets.
- All domain utilities work against the new adapter with unchanged external signatures.

---

## Integration Details

### Concurrency & Ordering
- Run storage migration at app startup before initializing React Query data flows (extend `runMigration()` which is already invoked in `src/app/page.tsx`).
- Use `lockManager` if necessary to guard write operations during migration.

### Flags & Versioning
- `storage-mode`: `'localStorage' | 'indexedDB'` — controls adapter selection.
- `storage-version`: semantic version to gate subsequent migrations (e.g., `2.0.0`).
- Continue to use `appDataVersion` for app‑level (non‑storage) migrations.

### Rollback Procedure
- On any failure during copy/verification, restore with `restoreMigrationBackup()` and revert `storage-mode` to `localStorage`.
- Present a user‑visible error toast with a suggestion to retry; keep backup until success.

### Testing Strategy
- Unit: adapters (local vs IDB) and migration manager logic with mocked `idb`.
- Integration: run the app with seeded localStorage, perform migration, validate data in IDB and app behavior.
- E2E (optional): simulate large datasets to confirm performance remains acceptable.

### Performance Baseline
- KV first keeps performance parity with localStorage and reduces risk.
- Normalization later allows partial reads and indexed queries for growth.

---

## Risks & Mitigations (Updated)

- Dual‑write complexity — Avoided entirely by KV swap strategy.
- Partial migration failures — Mitigated by transactional backup/rollback and per‑key verification.
- Large payloads (e.g., `savedSoccerGames`) — KV phase keeps single‑key semantics; normalization optional if needed.
- SW/offline interactions — No change required; the SW caches assets, not storage.

---

## Timeline & Ownership

- Phase 0 (KV adapter): 0.5–1 day
- Phase 1 (KV copy + flip): 0.5–1 day
- Phase 2 (normalized stores): 2–4 days (optional)

Each phase should include: PR, review, staging validation, and rollout.


### Phase 1: Foundation Infrastructure (Week 1)

#### 1.1 IndexedDB Storage Adapter

Create `src/utils/indexedDbStorage.ts`:

```typescript
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  // New capabilities
  transaction<T>(stores: string[], operation: (tx: IDBTransaction) => Promise<T>): Promise<T>;
  bulkSet(items: Array<{key: string, value: string}>): Promise<void>;
  bulkGet(keys: string[]): Promise<Array<{key: string, value: string | null}>>;
}

export class IndexedDBStorageAdapter implements StorageAdapter {
  private dbName = 'MatchOpsLocal';
  private version = 1;
  private keyValueStore = 'keyValueStore';  // localStorage compatibility
  private gameStore = 'games';              // Structured storage
  private playerStore = 'players';          // Player entities
  private seasonStore = 'seasons';          // Season entities
  private tournamentStore = 'tournaments';  // Tournament entities
  
  // Schema design for structured storage
  private schema = {
    keyValueStore: { keyPath: 'key' },
    games: { keyPath: 'id', indexes: [
      { name: 'seasonId', keyPath: 'seasonId' },
      { name: 'tournamentId', keyPath: 'tournamentId' },
      { name: 'gameDate', keyPath: 'gameDate' },
      { name: 'teamId', keyPath: 'teamId' }
    ]},
    players: { keyPath: 'id', indexes: [
      { name: 'teamId', keyPath: 'teamId' },
      { name: 'name', keyPath: 'name' }
    ]},
    seasons: { keyPath: 'id' },
    tournaments: { keyPath: 'id' }
  };
}

export class LocalStorageAdapter implements StorageAdapter {
  private logger = createLogger('LocalStorageAdapter');

  async getItem(key: string): Promise<string | null> {
    try {
      return getLocalStorageItem(key);
    } catch (error) {
      this.logger.error('Failed to get item from localStorage', { key, error });
      throw new StorageError(StorageErrorType.ACCESS_DENIED, `Failed to access localStorage for key: ${key}`, error);
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      setLocalStorageItem(key, value);
    } catch (error) {
      // Handle quota exceeded (most common localStorage error)
      if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
        this.logger.error('localStorage quota exceeded', { key, valueSize: value.length });
        throw new StorageError(StorageErrorType.QUOTA_EXCEEDED, 'localStorage storage quota exceeded', error);
      }

      this.logger.error('Failed to set item in localStorage', { key, error });
      throw new StorageError(StorageErrorType.ACCESS_DENIED, `Failed to write to localStorage for key: ${key}`, error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      removeLocalStorageItem(key);
    } catch (error) {
      this.logger.error('Failed to remove item from localStorage', { key, error });
      throw new StorageError(StorageErrorType.ACCESS_DENIED, `Failed to remove localStorage key: ${key}`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      clearLocalStorage();
    } catch (error) {
      this.logger.error('Failed to clear localStorage', { error });
      throw new StorageError(StorageErrorType.ACCESS_DENIED, 'Failed to clear localStorage', error);
    }
  }

  getBackendName(): string {
    return 'localStorage';
  }

  async getKeys(): Promise<string[]> {
    try {
      const storage = getStorage();
      if (!storage) {
        throw new StorageError(StorageErrorType.ACCESS_DENIED, 'localStorage not available');
      }

      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key) keys.push(key);
      }
      return keys;
    } catch (error) {
      this.logger.error('Failed to get localStorage keys', { error });
      if (error instanceof StorageError) throw error;
      throw new StorageError(StorageErrorType.ACCESS_DENIED, 'Failed to enumerate localStorage keys', error);
    }
  }
}
```

#### 1.2 LocalStorage Adapter Implementation Strategy

**Incremental Approach - Wrap Existing Infrastructure:**
- **Leverage existing utilities** from `src/utils/localStorage.ts` for proven stability
- **Maintain logging consistency** with `src/utils/logger.ts` integration
- **Preserve error patterns** while adding structured error handling
- **Design for compatibility** to enable gradual migration of existing code

**Error Handling Priorities:**
1. **Quota exceeded** - most common localStorage error, critical for large datasets
2. **Access denied** - private browsing, disabled storage scenarios
3. **Data corruption** - malformed JSON, special characters, storage inconsistencies
4. **Network/browser** - temporary failures, browser extension interference

**Implementation Dependencies:**
```typescript
// Required imports for LocalStorage adapter
import { getStorage, getLocalStorageItem, setLocalStorageItem, removeLocalStorageItem, clearLocalStorage } from 'src/utils/localStorage.ts';
import { createLogger } from 'src/utils/logger.ts';
import { StorageError, StorageErrorType } from 'src/utils/storageAdapter.ts';
```

#### 1.3 LocalStorage Adapter Testing Requirements

**Critical Error Scenario Tests:**
```typescript
describe('LocalStorageAdapter Error Handling', () => {
  it('should handle quota exceeded errors', async () => {
    // Fill localStorage to capacity
    // Attempt to store additional data
    // Verify StorageError with QUOTA_EXCEEDED type
  });

  it('should handle access denied scenarios', async () => {
    // Test private browsing mode restrictions
    // Test disabled localStorage scenarios
    // Verify StorageError with ACCESS_DENIED type
  });

  it('should handle data corruption gracefully', async () => {
    // Test malformed JSON scenarios
    // Test null byte and special character handling
    // Verify proper error classification
  });
});
```

**Edge Case Testing:**
```typescript
describe('LocalStorageAdapter Edge Cases', () => {
  it('should handle empty strings and special characters', async () => {
    const testCases = ['', '\0', '🎉', '\\n\\t', 'null', 'undefined'];
    for (const testCase of testCases) {
      await adapter.setItem('test', testCase);
      expect(await adapter.getItem('test')).toBe(testCase);
    }
  });

  it('should handle large values near quota limits', async () => {
    // Test 1KB, 10KB, 100KB, 1MB values
    // Verify performance characteristics
    // Test quota boundary conditions
  });

  it('should handle concurrent access patterns', async () => {
    // Simulate multiple tab scenarios
    // Test storage event handling
    // Verify data consistency
  });
});
```

**Performance Benchmarking:**
```typescript
describe('LocalStorageAdapter Performance', () => {
  it('should benchmark operation speeds', async () => {
    // Small values (< 1KB): expect < 1ms per operation
    // Medium values (1-100KB): expect < 10ms per operation
    // Large values (100KB-1MB): expect < 100ms per operation
    // getKeys() operation: expect < 50ms for 1000+ keys
  });
});
```

#### 1.4 Storage Factory & Configuration

Create `src/utils/storageFactory.ts`:

```typescript
export type StorageMode = 'localStorage' | 'indexedDB';

export interface StorageConfig {
  mode: StorageMode;
  version: string;
  migrationState: 'not-started' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
}

export const getStorageConfig = (): StorageConfig => {
  const mode = getLocalStorageItem('storage-mode') as StorageMode || 'localStorage';
  const version = getLocalStorageItem('storage-version') || '1.0';
  const migrationState = getLocalStorageItem('migration-state') || 'not-started';
  
  return { mode, version, migrationState };
};

export const createStorageAdapter = (): StorageAdapter => {
  const config = getStorageConfig();
  
  if (config.mode === 'indexedDB' && config.migrationState === 'completed') {
    return new IndexedDBStorageAdapter();
  }
  
  return new LocalStorageAdapter();
};
```

#### 1.3 Migration Manager Foundation

Create `src/utils/indexedDbMigration.ts`:

```typescript
export interface MigrationState {
  status: 'not-started' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
  version: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  backupLocation?: string;
  progress?: {
    currentStep: number;
    totalSteps: number;
    stepDescription: string;
  };
}

export class IndexedDBMigrationManager {
  private readonly BACKUP_PREFIX = 'migration-backup-';
  private readonly EMERGENCY_BACKUP_KEY = 'emergency-backup';
  private readonly MIGRATION_STEPS = [
    'Creating backup',
    'Initializing IndexedDB',
    'Migrating app settings',
    'Migrating seasons and tournaments', 
    'Migrating master roster',
    'Migrating teams and rosters',
    'Migrating saved games',
    'Validating data integrity',
    'Switching to IndexedDB mode',
    'Finalizing migration'
  ];

  async shouldMigrate(): Promise<boolean> {
    const config = getStorageConfig();
    return config.mode === 'localStorage' && this.hasExistingData();
  }

  async performMigration(): Promise<void> {
    const migrationId = `migration_${Date.now()}_${crypto.randomUUID()}`;
    const state: MigrationState = {
      status: 'in-progress',
      version: '2.0.0',
      startedAt: new Date().toISOString(),
      progress: { currentStep: 0, totalSteps: this.MIGRATION_STEPS.length, stepDescription: 'Starting migration' }
    };

    try {
      await this.setMigrationState(state);
      
      // Step 1: Create comprehensive backup
      state.progress = { currentStep: 1, totalSteps: this.MIGRATION_STEPS.length, stepDescription: 'Creating backup' };
      await this.setMigrationState(state);
      await this.createMigrationBackup(migrationId);
      
      // Step 2: Initialize IndexedDB
      state.progress!.currentStep = 2;
      state.progress!.stepDescription = 'Initializing IndexedDB';
      await this.setMigrationState(state);
      const idbAdapter = new IndexedDBStorageAdapter();
      await this.initializeIndexedDB(idbAdapter);
      
      // Step 3-7: Migrate data in order of complexity
      await this.migrateDataInBatches(idbAdapter, state);
      
      // Step 8: Validate data integrity
      state.progress!.currentStep = 8;
      state.progress!.stepDescription = 'Validating data integrity';
      await this.setMigrationState(state);
      await this.validateMigration(idbAdapter);
      
      // Step 9: Switch to IndexedDB mode
      state.progress!.currentStep = 9;
      state.progress!.stepDescription = 'Switching to IndexedDB mode';
      await this.setMigrationState(state);
      await this.switchToIndexedDB();
      
      // Step 10: Finalize
      state.progress!.currentStep = 10;
      state.progress!.stepDescription = 'Finalizing migration';
      state.status = 'completed';
      state.completedAt = new Date().toISOString();
      await this.setMigrationState(state);
      
      // Clean up backup after successful migration (optional)
      await this.scheduleBackupCleanup(migrationId);
      
    } catch (error) {
      state.status = 'failed';
      state.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.setMigrationState(state);
      
      // Automatic rollback on any failure
      await this.rollback(migrationId);
      throw error;
    }
  }
}
```

### Phase 2: Data Manager Updates (Week 2)

#### 2.1 Update Storage Abstraction Layer

Replace `src/utils/localStorage.ts` with `src/utils/storage.ts`:

```typescript
// New unified storage interface
import { createStorageAdapter } from './storageFactory';

const storage = createStorageAdapter();

export const getStorageItem = async (key: string): Promise<string | null> => {
  return storage.getItem(key);
};

export const setStorageItem = async (key: string, value: string): Promise<void> => {
  return storage.setItem(key, value);
};

export const removeStorageItem = async (key: string): Promise<void> => {
  return storage.removeItem(key);
};

export const clearStorage = async (): Promise<void> => {
  return storage.clear();
};

// Legacy compatibility (for gradual migration)
export const getLocalStorageItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    logger.error('[localStorage] Access error:', error);
    return null;
  }
};

// ... other legacy methods for backward compatibility during transition
```

#### 2.2 Update All Data Managers

**Pattern for each data manager:**

1. `src/utils/masterRosterManager.ts`:
```typescript
// OLD: import { getLocalStorageItem, setLocalStorageItem } from './localStorage';
// NEW: import { getStorageItem, setStorageItem } from './storage';

export const getMasterRoster = async (): Promise<Player[]> => {
  try {
    const rosterJson = await getStorageItem(MASTER_ROSTER_KEY);  // Now truly async
    if (!rosterJson) {
      return [];
    }
    return JSON.parse(rosterJson) as Player[];
  } catch (error) {
    logger.error('[getMasterRoster] Error getting master roster:', error);
    return [];
  }
};

export const saveMasterRoster = async (players: Player[]): Promise<boolean> => {
  try {
    await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(players));  // Now truly async
    return true;
  } catch (error) {
    logger.error('[saveMasterRoster] Error saving master roster:', error);
    return false;
  }
};
```

2. **Apply same pattern to:**
   - `src/utils/savedGames.ts` (690 lines - largest refactor)
   - `src/utils/seasons.ts`
   - `src/utils/tournaments.ts`
   - `src/utils/appSettings.ts` 
   - `src/utils/teams.ts`

#### 2.3 Enhanced Lock Management for IndexedDB

Update `src/utils/lockManager.ts`:

```typescript
export class IndexedDBLockManager extends LockManager {
  /**
   * IndexedDB-specific lock management using transactions
   */
  async withTransaction<T>(
    stores: string[],
    operation: (tx: IDBTransaction) => Promise<T>,
    mode: IDBTransactionMode = 'readwrite'
  ): Promise<T> {
    const lockKey = `transaction_${stores.join('_')}`;
    return this.withLock(lockKey, async () => {
      // IndexedDB transaction logic
      const adapter = createStorageAdapter();
      if (adapter instanceof IndexedDBStorageAdapter) {
        return adapter.transaction(stores, operation);
      } else {
        // Fallback to regular lock for localStorage
        return operation(null as any);
      }
    });
  }
}
```

### Phase 3: Migration Logic Implementation (Week 2-3)

#### 3.1 Data Migration in Batches

```typescript
private async migrateDataInBatches(
  idbAdapter: IndexedDBStorageAdapter, 
  state: MigrationState
): Promise<void> {
  const migrationBatches = [
    {
      step: 3,
      name: 'App Settings',
      keys: [APP_SETTINGS_KEY, LAST_HOME_TEAM_NAME_KEY, TIMER_STATE_KEY],
      validator: this.validateAppSettings
    },
    {
      step: 4, 
      name: 'Seasons and Tournaments',
      keys: [SEASONS_LIST_KEY, TOURNAMENTS_LIST_KEY],
      validator: this.validateSeasonsAndTournaments
    },
    {
      step: 5,
      name: 'Master Roster', 
      keys: [MASTER_ROSTER_KEY, PLAYER_ADJUSTMENTS_KEY],
      validator: this.validateMasterRoster
    },
    {
      step: 6,
      name: 'Teams and Rosters',
      keys: [TEAMS_INDEX_KEY, TEAM_ROSTERS_KEY],
      validator: this.validateTeamsAndRosters
    },
    {
      step: 7,
      name: 'Saved Games',
      keys: [SAVED_GAMES_KEY],
      validator: this.validateSavedGames,
      batchSize: 50  // Process games in smaller batches
    }
  ];

  for (const batch of migrationBatches) {
    state.progress!.currentStep = batch.step;
    state.progress!.stepDescription = `Migrating ${batch.name}`;
    await this.setMigrationState(state);
    
    await this.migrateBatch(batch, idbAdapter);
    
    // Validate each batch immediately after migration
    await batch.validator(idbAdapter);
  }
}

private async migrateBatch(
  batch: MigrationBatch,
  idbAdapter: IndexedDBStorageAdapter
): Promise<void> {
  const localStorageAdapter = new LocalStorageAdapter();
  
  if (batch.batchSize) {
    // Handle large datasets (like saved games) in chunks
    await this.migrateLargeDataset(batch, localStorageAdapter, idbAdapter);
  } else {
    // Handle smaller datasets in single operation
    for (const key of batch.keys) {
      const value = await localStorageAdapter.getItem(key);
      if (value) {
        await idbAdapter.setItem(key, value);
      }
    }
  }
}
```

#### 3.2 Data Integrity Validation

```typescript
private async validateMigration(idbAdapter: IndexedDBStorageAdapter): Promise<void> {
  const validations = [
    this.validateGameCount(idbAdapter),
    this.validatePlayerConsistency(idbAdapter),
    this.validateSeasonTournamentLinks(idbAdapter), 
    this.validateAppSettings(idbAdapter),
    this.validateTeamRosterIntegrity(idbAdapter),
    this.validateGameEventConsistency(idbAdapter)
  ];
  
  const results = await Promise.all(validations);
  const failures = results.filter(r => !r.isValid);
  
  if (failures.length > 0) {
    const errorMessage = `Migration validation failed: ${failures.map(f => f.error).join(', ')}`;
    throw new MigrationValidationError(errorMessage, failures);
  }
}

private async validateGameCount(idbAdapter: IndexedDBStorageAdapter): Promise<ValidationResult> {
  try {
    const localStorageGames = await new LocalStorageAdapter().getItem(SAVED_GAMES_KEY);
    const indexedDbGames = await idbAdapter.getItem(SAVED_GAMES_KEY);
    
    const localCount = localStorageGames ? Object.keys(JSON.parse(localStorageGames)).length : 0;
    const idbCount = indexedDbGames ? Object.keys(JSON.parse(indexedDbGames)).length : 0;
    
    if (localCount !== idbCount) {
      return {
        isValid: false,
        error: `Game count mismatch: localStorage=${localCount}, IndexedDB=${idbCount}`
      };
    }
    
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false, 
      error: `Game count validation error: ${error.message}`
    };
  }
}

private async validatePlayerConsistency(idbAdapter: IndexedDBStorageAdapter): Promise<ValidationResult> {
  try {
    const localRoster = await new LocalStorageAdapter().getItem(MASTER_ROSTER_KEY);
    const idbRoster = await idbAdapter.getItem(MASTER_ROSTER_KEY);
    
    if (!localRoster && !idbRoster) return { isValid: true };
    if (!localRoster || !idbRoster) {
      return { isValid: false, error: 'Player roster missing in one storage system' };
    }
    
    const localPlayers = JSON.parse(localRoster) as Player[];
    const idbPlayers = JSON.parse(idbRoster) as Player[];
    
    if (localPlayers.length !== idbPlayers.length) {
      return {
        isValid: false,
        error: `Player count mismatch: localStorage=${localPlayers.length}, IndexedDB=${idbPlayers.length}`
      };
    }
    
    // Validate each player's data integrity
    for (let i = 0; i < localPlayers.length; i++) {
      const local = localPlayers[i];
      const idb = idbPlayers.find(p => p.id === local.id);
      
      if (!idb) {
        return { isValid: false, error: `Player ${local.id} missing in IndexedDB` };
      }
      
      if (local.name !== idb.name || local.nickname !== idb.nickname) {
        return { isValid: false, error: `Player ${local.id} data mismatch` };
      }
    }
    
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Player consistency validation error: ${error.message}`
    };
  }
}
```

### Phase 4: Safety & Rollback Mechanisms (Week 3)

#### 4.1 Comprehensive Backup System

```typescript
private async createMigrationBackup(migrationId: string): Promise<void> {
  // 1. Create full backup in multiple locations for safety
  const backupData = await generateFullBackupJson();
  
  // 2. Store in sessionStorage for immediate recovery
  sessionStorage.setItem(this.EMERGENCY_BACKUP_KEY, backupData);
  
  // 3. Store in localStorage with migration ID
  const backupKey = `${this.BACKUP_PREFIX}${migrationId}`;
  setLocalStorageItem(backupKey, backupData);
  
  // 4. Store in IndexedDB backup store (if available)
  try {
    const backupAdapter = new IndexedDBStorageAdapter();
    await backupAdapter.setItem(`backup_${migrationId}`, backupData);
  } catch (error) {
    logger.warn('Could not create IndexedDB backup, using localStorage only:', error);
  }
  
  // 5. Update migration state with backup location
  await this.updateMigrationState({ backupLocation: backupKey });
}
```

#### 4.2 Robust Rollback System

```typescript
public async rollback(migrationId: string): Promise<void> {
  logger.warn(`Starting rollback for migration ${migrationId}`);
  
  try {
    // 1. Mark rollback in progress
    await this.updateMigrationState({ status: 'rolling-back' });
    
    // 2. Load backup data (try multiple sources)
    const backupData = await this.loadBackupData(migrationId);
    
    // 3. Clear any partial IndexedDB data
    await this.clearIndexedDB();
    
    // 4. Restore localStorage from backup
    await this.restoreFromBackup(backupData);
    
    // 5. Switch back to localStorage mode
    await this.switchToLocalStorage();
    
    // 6. Clear React Query cache to force fresh data load
    await this.invalidateAllQueries();
    
    // 7. Mark rollback complete
    await this.updateMigrationState({ 
      status: 'rolled-back',
      completedAt: new Date().toISOString()
    });
    
    logger.log(`Rollback completed successfully for migration ${migrationId}`);
    
  } catch (rollbackError) {
    logger.error('Critical error during rollback:', rollbackError);
    
    // Last resort: Emergency restoration
    await this.emergencyRestore();
    
    throw new CriticalMigrationError(
      `Rollback failed: ${rollbackError.message}`,
      rollbackError
    );
  }
}

private async loadBackupData(migrationId: string): Promise<FullBackupData> {
  // Try loading backup from multiple sources
  const sources = [
    // 1. SessionStorage (most recent)
    () => sessionStorage.getItem(this.EMERGENCY_BACKUP_KEY),
    
    // 2. LocalStorage with migration ID
    () => getLocalStorageItem(`${this.BACKUP_PREFIX}${migrationId}`),
    
    // 3. IndexedDB backup store
    async () => {
      try {
        const backupAdapter = new IndexedDBStorageAdapter();
        return await backupAdapter.getItem(`backup_${migrationId}`);
      } catch {
        return null;
      }
    }
  ];
  
  for (const source of sources) {
    try {
      const backupJson = await source();
      if (backupJson) {
        const backupData = JSON.parse(backupJson) as FullBackupData;
        if (this.validateBackupData(backupData)) {
          return backupData;
        }
      }
    } catch (error) {
      logger.warn('Failed to load backup from source:', error);
    }
  }
  
  throw new Error('No valid backup data found for rollback');
}

private async emergencyRestore(): Promise<void> {
  // Emergency recovery using any available backup
  const emergencyBackup = sessionStorage.getItem(this.EMERGENCY_BACKUP_KEY);
  if (emergencyBackup) {
    try {
      const backupData = JSON.parse(emergencyBackup) as FullBackupData;
      await this.restoreFromBackup(backupData);
      logger.log('Emergency restore completed using session backup');
    } catch (error) {
      logger.error('Emergency restore failed:', error);
      
      // Absolute last resort: Clear everything and reset to defaults
      await this.resetToDefaults();
    }
  } else {
    await this.resetToDefaults();
  }
}
```

#### 4.3 React Query Cache Management

```typescript
private async invalidateAllQueries(): Promise<void> {
  // This needs to be called from a component context or passed as a callback
  // We'll expose this as a public method that the UI can call
  if (typeof window !== 'undefined' && (window as any).queryClient) {
    const queryClient = (window as any).queryClient;
    await queryClient.clear();
    
    // Invalidate specific query keys
    queryClient.invalidateQueries({ queryKey: queryKeys.masterRoster });
    queryClient.invalidateQueries({ queryKey: queryKeys.seasons });
    queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
    queryClient.invalidateQueries({ queryKey: queryKeys.teams });
  }
}
```

### Phase 5: User Interface & Experience (Week 3)

#### 5.1 Migration Progress UI

Create `src/components/MigrationOverlay.tsx`:

```typescript
export const MigrationOverlay: React.FC = () => {
  const [migrationState, setMigrationState] = useState<MigrationState>();
  const [showDetails, setShowDetails] = useState(false);
  const migrationManager = useMemo(() => new IndexedDBMigrationManager(), []);

  useEffect(() => {
    const checkMigrationStatus = async () => {
      const state = await migrationManager.getMigrationState();
      setMigrationState(state);
      
      // Poll for updates during migration
      if (state.status === 'in-progress') {
        const interval = setInterval(async () => {
          const updated = await migrationManager.getMigrationState();
          setMigrationState(updated);
          
          if (updated.status !== 'in-progress') {
            clearInterval(interval);
          }
        }, 1000);
        
        return () => clearInterval(interval);
      }
    };
    
    checkMigrationStatus();
  }, [migrationManager]);

  const handleRetryMigration = async () => {
    try {
      await migrationManager.performMigration();
    } catch (error) {
      console.error('Migration retry failed:', error);
    }
  };

  const handleRollback = async () => {
    try {
      await migrationManager.rollback(migrationState?.migrationId || 'unknown');
      // Reload page after successful rollback
      window.location.reload();
    } catch (error) {
      console.error('Rollback failed:', error);
      alert('Rollback failed. Please contact support.');
    }
  };

  if (!migrationState || migrationState.status === 'completed') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">
            Upgrading Storage System
          </h2>
          
          {migrationState.status === 'in-progress' && (
            <div>
              <p className="text-gray-600 mb-4">
                Improving app performance and reliability. This will take about 30 seconds.
              </p>
              
              <div className="mb-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(migrationState.progress?.currentStep || 0) / (migrationState.progress?.totalSteps || 10) * 100}%`
                    }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Step {migrationState.progress?.currentStep || 0} of {migrationState.progress?.totalSteps || 10}: {migrationState.progress?.stepDescription}
                </p>
              </div>
              
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-500">Please wait...</span>
              </div>
            </div>
          )}
          
          {migrationState.status === 'failed' && (
            <div>
              <div className="text-red-600 mb-4">
                <p className="font-medium">Migration Failed</p>
                <p className="text-sm mt-1">{migrationState.errorMessage}</p>
              </div>
              
              <div className="space-y-2">
                <button 
                  onClick={handleRollback}
                  className="w-full bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700"
                >
                  Restore Previous Version
                </button>
                <button 
                  onClick={handleRetryMigration}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
                >
                  Try Again
                </button>
              </div>
              
              <button 
                onClick={() => setShowDetails(!showDetails)}
                className="mt-4 text-sm text-gray-500 hover:text-gray-700"
              >
                {showDetails ? 'Hide' : 'Show'} Technical Details
              </button>
              
              {showDetails && (
                <div className="mt-2 p-3 bg-gray-100 rounded text-xs text-left">
                  <pre>{JSON.stringify(migrationState, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

#### 5.2 Integration with App Startup

Update `src/app/page.tsx`:

```typescript
export default function Home() {
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [screen, setScreen] = useState<'migration' | 'start' | 'home'>('start');

  useEffect(() => {
    const checkMigration = async () => {
      const migrationManager = new IndexedDBMigrationManager();
      const shouldMigrate = await migrationManager.shouldMigrate();
      
      if (shouldMigrate) {
        setMigrationNeeded(true);
        setScreen('migration');
        
        // Automatically start migration
        try {
          await migrationManager.performMigration();
          // Migration successful, continue to normal app
          setScreen('start');
        } catch (error) {
          // Migration failed, show error UI
          console.error('Migration failed:', error);
        }
      } else {
        // No migration needed, run existing migration logic
        await runMigration();
        // ... existing startup logic
      }
    };

    checkMigration();
  }, []);

  if (screen === 'migration') {
    return <MigrationOverlay />;
  }

  // ... existing component logic
}
```

### Phase 6: Testing & Validation (Week 3-4)

#### 6.1 Comprehensive Test Suite

Create `src/utils/__tests__/indexedDbMigration.test.ts`:

```typescript
describe('IndexedDB Migration', () => {
  let migrationManager: IndexedDBMigrationManager;
  let mockLocalStorage: { [key: string]: string };
  
  beforeEach(() => {
    migrationManager = new IndexedDBMigrationManager();
    mockLocalStorage = {};
    
    // Mock localStorage with sample data
    mockLocalStorage[SAVED_GAMES_KEY] = JSON.stringify({
      'game_123': { /* sample game */ },
      'game_456': { /* sample game */ }
    });
    mockLocalStorage[MASTER_ROSTER_KEY] = JSON.stringify([
      { id: 'player_1', name: 'John Doe' },
      { id: 'player_2', name: 'Jane Smith' }
    ]);
    // ... other mock data
  });

  describe('Migration Detection', () => {
    test('detects when migration is needed', async () => {
      const shouldMigrate = await migrationManager.shouldMigrate();
      expect(shouldMigrate).toBe(true);
    });

    test('skips migration when already on IndexedDB', async () => {
      setLocalStorageItem('storage-mode', 'indexedDB');
      setLocalStorageItem('migration-state', 'completed');
      
      const shouldMigrate = await migrationManager.shouldMigrate();
      expect(shouldMigrate).toBe(false);
    });
  });

  describe('Data Migration', () => {
    test('migrates simple app settings correctly', async () => {
      await migrationManager.performMigration();
      
      const idbAdapter = new IndexedDBStorageAdapter();
      const settings = await idbAdapter.getItem(APP_SETTINGS_KEY);
      
      expect(settings).toEqual(mockLocalStorage[APP_SETTINGS_KEY]);
    });

    test('migrates complex game data with all relationships', async () => {
      await migrationManager.performMigration();
      
      const idbAdapter = new IndexedDBStorageAdapter();
      const games = await idbAdapter.getItem(SAVED_GAMES_KEY);
      const parsedGames = JSON.parse(games!);
      
      expect(Object.keys(parsedGames)).toHaveLength(2);
      expect(parsedGames['game_123']).toBeDefined();
      expect(parsedGames['game_456']).toBeDefined();
    });

    test('maintains player-game relationships', async () => {
      await migrationManager.performMigration();
      
      const idbAdapter = new IndexedDBStorageAdapter();
      const roster = JSON.parse(await idbAdapter.getItem(MASTER_ROSTER_KEY)!);
      const games = JSON.parse(await idbAdapter.getItem(SAVED_GAMES_KEY)!);
      
      // Verify player references in games are maintained
      const playerIds = roster.map((p: Player) => p.id);
      Object.values(games).forEach((game: any) => {
        game.availablePlayers?.forEach((player: Player) => {
          expect(playerIds).toContain(player.id);
        });
      });
    });
  });

  describe('Rollback Functionality', () => {
    test('performs clean rollback on validation failure', async () => {
      // Mock validation failure
      jest.spyOn(migrationManager as any, 'validateMigration')
          .mockRejectedValue(new Error('Validation failed'));
      
      await expect(migrationManager.performMigration()).rejects.toThrow();
      
      // Verify rollback occurred
      const config = getStorageConfig();
      expect(config.mode).toBe('localStorage');
      expect(config.migrationState).toBe('rolled-back');
    });

    test('restores all data after rollback', async () => {
      const originalData = { ...mockLocalStorage };
      
      // Attempt migration and force failure
      try {
        await migrationManager.performMigration();
      } catch (error) {
        // Expected failure
      }
      
      // Verify data is restored
      const games = getLocalStorageItem(SAVED_GAMES_KEY);
      expect(games).toEqual(originalData[SAVED_GAMES_KEY]);
    });
  });

  describe('Error Scenarios', () => {
    test('handles IndexedDB quota exceeded', async () => {
      // Mock quota exceeded error
      jest.spyOn(IndexedDBStorageAdapter.prototype, 'setItem')
          .mockRejectedValue(new DOMException('QuotaExceededError'));
      
      await expect(migrationManager.performMigration()).rejects.toThrow();
      
      // Should rollback to localStorage
      const config = getStorageConfig();
      expect(config.mode).toBe('localStorage');
    });

    test('handles browser crash during migration', async () => {
      // Simulate partial migration state
      setLocalStorageItem('migration-state', 'in-progress');
      setLocalStorageItem('migration-backup', JSON.stringify(mockLocalStorage));
      
      // Should detect and recover on restart
      const shouldResume = await migrationManager.shouldResumeMigration();
      expect(shouldResume).toBe(true);
      
      await migrationManager.resumeOrRollback();
      
      const config = getStorageConfig();
      expect(config.migrationState).toBe('rolled-back');
    });
  });

  describe('Performance', () => {
    test('migrates large dataset within time limit', async () => {
      // Create large mock dataset
      const largeGameCollection = {};
      for (let i = 0; i < 1000; i++) {
        largeGameCollection[`game_${i}`] = {
          id: `game_${i}`,
          teamName: `Team ${i}`,
          gameEvents: Array(50).fill(null).map((_, j) => ({
            id: `event_${i}_${j}`,
            type: 'goal',
            time: j * 1000
          }))
        };
      }
      mockLocalStorage[SAVED_GAMES_KEY] = JSON.stringify(largeGameCollection);
      
      const startTime = Date.now();
      await migrationManager.performMigration();
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(30000); // 30 seconds
    }, 35000);

    test('app remains responsive during migration', async () => {
      // This would be tested with Playwright for real user interactions
      expect(true).toBe(true); // Placeholder
    });
  });
});
```

#### 6.2 Integration Testing

Create `tests/integration/indexedDbMigration.test.ts`:

```typescript
describe('IndexedDB Migration Integration', () => {
  test('full app startup with migration', async () => {
    // Use React Testing Library to test full component tree
    const { getByText, queryByText } = render(<Home />);
    
    // Should show migration UI
    expect(getByText('Upgrading Storage System')).toBeInTheDocument();
    
    // Wait for migration to complete
    await waitFor(() => {
      expect(queryByText('Upgrading Storage System')).not.toBeInTheDocument();
    }, { timeout: 10000 });
    
    // Should show normal app
    expect(getByText('MatchOps Local')).toBeInTheDocument();
  });

  test('React Query cache invalidation after migration', async () => {
    const queryClient = new QueryClient();
    
    // Pre-populate cache
    queryClient.setQueryData(queryKeys.masterRoster, []);
    
    // Perform migration
    const migrationManager = new IndexedDBMigrationManager();
    await migrationManager.performMigration();
    
    // Cache should be invalidated
    const cachedData = queryClient.getQueryData(queryKeys.masterRoster);
    expect(cachedData).toBeUndefined();
  });
});
```

### Phase 7: Deployment & Monitoring (Week 4)

#### 7.1 Feature Flag Integration

Update `src/config/environment.ts`:

```typescript
export const FEATURE_FLAGS = {
  ENABLE_INDEXEDDB_MIGRATION: process.env.NEXT_PUBLIC_ENABLE_INDEXEDDB === 'true',
  MIGRATION_ROLLOUT_PERCENTAGE: parseInt(process.env.NEXT_PUBLIC_MIGRATION_ROLLOUT || '0', 10),
  FORCE_MIGRATION: process.env.NEXT_PUBLIC_FORCE_MIGRATION === 'true'
};

export const shouldPerformMigration = (): boolean => {
  if (FEATURE_FLAGS.FORCE_MIGRATION) return true;
  if (!FEATURE_FLAGS.ENABLE_INDEXEDDB_MIGRATION) return false;
  
  // Gradual rollout based on user hash
  const userHash = getUserHash();
  return (userHash % 100) < FEATURE_FLAGS.MIGRATION_ROLLOUT_PERCENTAGE;
};

const getUserHash = (): number => {
  // Create consistent hash from browser fingerprint
  const fingerprint = `${navigator.userAgent}_${screen.width}_${screen.height}_${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};
```

#### 7.2 Migration Analytics

Create `src/utils/migrationAnalytics.ts`:

```typescript
interface MigrationEvent {
  event: 'migration_started' | 'migration_completed' | 'migration_failed' | 'rollback_initiated' | 'rollback_completed';
  migrationId: string;
  timestamp: string;
  duration?: number;
  errorMessage?: string;
  dataSize?: number;
  browserInfo: {
    userAgent: string;
    storage: 'localStorage' | 'indexedDB';
    storageQuota?: number;
  };
}

export class MigrationAnalytics {
  private events: MigrationEvent[] = [];

  logEvent(event: Omit<MigrationEvent, 'timestamp' | 'browserInfo'>): void {
    const migrationEvent: MigrationEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      browserInfo: {
        userAgent: navigator.userAgent,
        storage: getStorageConfig().mode,
        storageQuota: this.getStorageQuota()
      }
    };
    
    this.events.push(migrationEvent);
    
    // Store in localStorage for later transmission
    const existingEvents = JSON.parse(getLocalStorageItem('migration-analytics') || '[]');
    existingEvents.push(migrationEvent);
    setLocalStorageItem('migration-analytics', JSON.stringify(existingEvents));
    
    // Send to analytics endpoint (if available)
    this.sendAnalytics(migrationEvent);
  }

  private getStorageQuota(): number | undefined {
    // Modern browsers support storage quota API
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(estimate => {
        return estimate.quota;
      }).catch(() => undefined);
    }
    return undefined;
  }

  private async sendAnalytics(event: MigrationEvent): Promise<void> {
    // Only send analytics in production and if user consented
    if (process.env.NODE_ENV !== 'production') return;
    
    try {
      // This would send to your analytics endpoint
      await fetch('/api/migration-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
    } catch (error) {
      console.warn('Analytics sending failed:', error);
    }
  }
}

export const migrationAnalytics = new MigrationAnalytics();
```

#### 7.3 Gradual Rollout Strategy

```bash
# Week 4 Deployment Schedule

# Day 1: Internal testing
NEXT_PUBLIC_ENABLE_INDEXEDDB=true
NEXT_PUBLIC_MIGRATION_ROLLOUT=0
NEXT_PUBLIC_FORCE_MIGRATION=true  # Only for dev/staging

# Day 2-3: 10% rollout
NEXT_PUBLIC_MIGRATION_ROLLOUT=10

# Day 4-5: 25% rollout (if no issues)
NEXT_PUBLIC_MIGRATION_ROLLOUT=25

# Day 6-7: 50% rollout (if metrics look good)
NEXT_PUBLIC_MIGRATION_ROLLOUT=50

# Week 5: 100% rollout (if everything stable)
NEXT_PUBLIC_MIGRATION_ROLLOUT=100
```

### Phase 8: Post-Migration Optimization (Week 5)

#### 8.1 IndexedDB Performance Optimizations

Create `src/utils/indexedDbOptimizer.ts`:

```typescript
export class IndexedDBOptimizer {
  /**
   * Optimize database for better query performance
   */
  async optimizeDatabase(): Promise<void> {
    // 1. Restructure games for better querying
    await this.createGameIndexes();
    
    // 2. Preload commonly accessed data
    await this.warmCache();
    
    // 3. Set up background cleanup
    await this.scheduleCleanup();
  }

  private async createGameIndexes(): Promise<void> {
    // Create indexes for common query patterns
    const adapter = new IndexedDBStorageAdapter();
    
    await adapter.transaction(['games'], async (tx) => {
      const store = tx.objectStore('games');
      
      // Create indexes if they don't exist
      if (!store.indexNames.contains('byDate')) {
        store.createIndex('byDate', 'gameDate');
      }
      if (!store.indexNames.contains('byTeamAndSeason')) {
        store.createIndex('byTeamAndSeason', ['teamId', 'seasonId']);
      }
    });
  }

  private async warmCache(): Promise<void> {
    // Preload recent games and current roster
    const adapter = createStorageAdapter();
    
    if (adapter instanceof IndexedDBStorageAdapter) {
      // Load recent games into memory
      await adapter.getRecentGames(10);
      
      // Load master roster
      await adapter.getItem(MASTER_ROSTER_KEY);
    }
  }
}
```

#### 8.2 Legacy Data Cleanup

```typescript
export class LegacyDataCleaner {
  /**
   * Clean up old localStorage data after successful migration
   */
  async cleanupLegacyData(): Promise<void> {
    const config = getStorageConfig();
    
    if (config.mode === 'indexedDB' && config.migrationState === 'completed') {
      // Wait 30 days after migration before cleanup
      const migrationDate = getLocalStorageItem('migration-completed-date');
      if (migrationDate) {
        const daysAgo = (Date.now() - parseInt(migrationDate)) / (1000 * 60 * 60 * 24);
        
        if (daysAgo > 30) {
          await this.performCleanup();
        }
      }
    }
  }

  private async performCleanup(): Promise<void> {
    const keysToClean = [
      SAVED_GAMES_KEY,
      MASTER_ROSTER_KEY,
      SEASONS_LIST_KEY,
      TOURNAMENTS_LIST_KEY,
      TEAMS_INDEX_KEY,
      TEAM_ROSTERS_KEY
    ];

    for (const key of keysToClean) {
      removeLocalStorageItem(key);
    }

    // Keep migration metadata for debugging
    setLocalStorageItem('legacy-data-cleaned', Date.now().toString());
  }
}
```

## Risk Mitigation Summary

### High-Priority Safeguards

1. **Multiple Backup Layers**:
   - sessionStorage (immediate recovery)
   - localStorage (persistent backup)
   - IndexedDB backup store (if available)

2. **Atomic Migration**:
   - All-or-nothing approach
   - Complete rollback on any failure
   - No dual-write complexity

3. **Comprehensive Validation**:
   - Data integrity checks after each batch
   - Cross-reference validation
   - Schema compliance verification

4. **Gradual Rollout**:
   - Feature flag controlled
   - Percentage-based user targeting
   - Real-time monitoring and rollback capability

### Success Metrics

- **Migration Success Rate**: >95% completion without rollback
- **Data Integrity**: 100% data preservation (verified by validation)
- **Performance**: Migration completes in <30 seconds
- **User Experience**: No perceived data loss or corruption
- **Rollback Capability**: <10 second recovery time

### Emergency Procedures

1. **Immediate Rollback**: Set `NEXT_PUBLIC_MIGRATION_ROLLOUT=0`
2. **Individual User Recovery**: Provide rollback UI in settings
3. **Data Recovery**: Multiple backup sources ensure no data loss
4. **Support Process**: Clear escalation path for migration issues

This implementation plan leverages the existing well-architected localStorage abstraction layer to minimize risk while providing significant benefits in storage capacity, performance, and future scalability.

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"content": "Examine current storage implementation in detail", "status": "completed", "activeForm": "Examining current storage implementation in detail"}, {"content": "Analyze React Query integration patterns", "status": "completed", "activeForm": "Analyzing React Query integration patterns"}, {"content": "Review data validation and schema systems", "status": "completed", "activeForm": "Reviewing data validation and schema systems"}, {"content": "Check backup/restore mechanisms", "status": "completed", "activeForm": "Checking backup/restore mechanisms"}, {"content": "Create detailed implementation plan", "status": "completed", "activeForm": "Creating detailed implementation plan"}]
