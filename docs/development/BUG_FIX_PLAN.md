# Bug Fix Implementation Plan

## Overview
This document provides a detailed implementation plan for fixing the 11 bugs identified in the BUG_REPORT.md. Each fix includes implementation steps, code changes, testing procedures, and rollback strategies.

---

## Phase 1: Critical Bugs (Immediate - Week 1)

### 🔴 Bug #1: Roster Lock Race Condition

#### Implementation Steps

1. **Create a new lock manager utility** (`src/utils/lockManager.ts`):
```typescript
// src/utils/lockManager.ts
export class LockManager {
  private locks: Map<string, Promise<void>> = new Map();
  private lockQueues: Map<string, Array<() => void>> = new Map();

  async acquire(resource: string): Promise<() => void> {
    // Wait for existing lock if present
    while (this.locks.has(resource)) {
      await this.locks.get(resource);
    }

    // Create new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = () => {
        this.locks.delete(resource);
        resolve();
        // Process next in queue
        const queue = this.lockQueues.get(resource);
        if (queue && queue.length > 0) {
          const next = queue.shift();
          next?.();
        }
      };
    });

    this.locks.set(resource, lockPromise);
    return releaseLock!;
  }

  async withLock<T>(resource: string, operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire(resource);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export const lockManager = new LockManager();
```

2. **Update `src/utils/teams.ts`** to use the new lock manager:
```typescript
import { lockManager } from './lockManager';

// Replace the existing withRosterLock function
const withRosterLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  return lockManager.withLock('roster_operation', operation);
};
```

3. **Add unit tests** (`src/utils/lockManager.test.ts`):
```typescript
import { LockManager } from './lockManager';

describe('LockManager', () => {
  it('should prevent concurrent access', async () => {
    const manager = new LockManager();
    const results: number[] = [];
    
    const operation = async (value: number) => {
      await manager.withLock('test', async () => {
        results.push(value);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
    };

    await Promise.all([
      operation(1),
      operation(2),
      operation(3)
    ]);

    expect(results).toEqual([1, 2, 3]); // Sequential, not concurrent
  });
});
```

#### Testing Strategy
- Unit tests for lock manager with concurrent operations
- Integration test simulating rapid team switching
- Stress test with 100+ concurrent roster operations
- Manual testing with multiple browser tabs

#### Rollback Plan
- Keep old implementation commented for quick revert
- Feature flag to toggle between old and new lock implementation
- Monitor error logs for lock timeout issues

---

### 🔴 Bug #2: Migration Failure Recovery

#### Implementation Steps

1. **Create backup utility** (`src/utils/migrationBackup.ts`):
```typescript
// src/utils/migrationBackup.ts
import { STORAGE_KEYS } from '@/config/storageKeys';

export interface MigrationBackup {
  timestamp: number;
  version: string;
  data: Record<string, any>;
}

export const createMigrationBackup = async (): Promise<MigrationBackup> => {
  const backup: MigrationBackup = {
    timestamp: Date.now(),
    version: await getAppDataVersion(),
    data: {}
  };

  // Backup all critical data
  for (const key of Object.values(STORAGE_KEYS)) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        backup.data[key] = value;
      }
    } catch (error) {
      logger.error(`Failed to backup key ${key}:`, error);
    }
  }

  // Store backup
  localStorage.setItem('MIGRATION_BACKUP', JSON.stringify(backup));
  return backup;
};

export const restoreMigrationBackup = async (backup: MigrationBackup): Promise<void> => {
  // Clear current data
  for (const key of Object.values(STORAGE_KEYS)) {
    localStorage.removeItem(key);
  }

  // Restore backup data
  for (const [key, value] of Object.entries(backup.data)) {
    localStorage.setItem(key, value);
  }

  logger.log('Migration backup restored successfully');
};

export const clearMigrationBackup = (): void => {
  localStorage.removeItem('MIGRATION_BACKUP');
};
```

2. **Update `src/utils/migration.ts`** with transaction support:
```typescript
import { createMigrationBackup, restoreMigrationBackup, clearMigrationBackup } from './migrationBackup';

export const runMigration = async (): Promise<void> => {
  const currentVersion = await getAppDataVersion();
  
  if (currentVersion >= CURRENT_DATA_VERSION) {
    return; // Already migrated
  }

  logger.log(`[Migration] Starting migration from v${currentVersion} to v${CURRENT_DATA_VERSION}`);
  
  // Create backup before migration
  const backup = await createMigrationBackup();
  logger.log('[Migration] Backup created');

  try {
    // Perform migration steps
    if (currentVersion < 2) {
      await migrateV1ToV2();
    }
    // Add future migrations here
    
    // Update version only if all steps succeed
    await setAppDataVersion(CURRENT_DATA_VERSION);
    
    // Clear backup on success
    clearMigrationBackup();
    logger.log('[Migration] Completed successfully');
    
  } catch (error) {
    logger.error('[Migration] Failed, attempting rollback:', error);
    
    try {
      await restoreMigrationBackup(backup);
      logger.log('[Migration] Rollback successful');
    } catch (rollbackError) {
      logger.error('[Migration] Rollback failed:', rollbackError);
      // Show user error - data may be corrupted
      throw new Error('Migration failed and rollback unsuccessful. Please restore from a manual backup.');
    }
    
    throw error;
  }
};
```

3. **Add migration status UI** (`src/components/MigrationStatus.tsx`):
```typescript
import React, { useState, useEffect } from 'react';

export const MigrationStatus: React.FC = () => {
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const migrate = async () => {
      setMigrating(true);
      try {
        await runMigration();
      } catch (error) {
        setError(error.message);
      } finally {
        setMigrating(false);
      }
    };
    migrate();
  }, []);

  if (migrating) {
    return (
      <div className="migration-overlay">
        <div className="migration-message">
          <h2>Updating Application Data...</h2>
          <p>Please do not close this window</p>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="migration-error">
        <h2>Update Failed</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return null;
};
```

#### Testing Strategy
- Unit tests with simulated migration failures at each step
- Test rollback with corrupted data scenarios
- Test migration with missing localStorage keys
- Manual test with DevTools to simulate quota exceeded errors

#### Rollback Plan
- Automatic rollback built into the migration process
- Manual backup restore function in settings
- Export data before migration as additional safety

---

### 🔴 Bug #3: Game Import Validation

#### Implementation Steps

1. **Update `src/utils/savedGames.ts`** with partial import support:
```typescript
export interface ImportResult {
  successful: number;
  skipped: number;
  failed: Array<{
    gameId: string;
    error: string;
  }>;
  warnings: string[];
}

export const importGames = async (
  jsonString: string,
  overwrite: boolean = false
): Promise<ImportResult> => {
  const result: ImportResult = {
    successful: 0,
    skipped: 0,
    failed: [],
    warnings: []
  };

  try {
    const parsed = JSON.parse(jsonString);
    
    // Handle both single game and collection formats
    const gamesToImport = parsed.savedSoccerGames || 
                          (parsed.id ? { [parsed.id]: parsed } : parsed);

    const existingGames = await getSavedGames();
    const gamesToSave = { ...existingGames };

    for (const [gameId, gameData] of Object.entries(gamesToImport)) {
      try {
        // Skip existing games if not overwriting
        if (existingGames[gameId] && !overwrite) {
          result.skipped++;
          result.warnings.push(`Game ${gameId} already exists (skipped)`);
          continue;
        }

        // Validate game data
        const validation = appStateSchema.safeParse(gameData);
        if (!validation.success) {
          result.failed.push({
            gameId,
            error: validation.error.errors.map(e => e.message).join(', ')
          });
          continue;
        }

        // Additional data integrity checks
        if (!validation.data.teamName || !validation.data.opponentName) {
          result.failed.push({
            gameId,
            error: 'Missing required team information'
          });
          continue;
        }

        gamesToSave[gameId] = validation.data;
        result.successful++;
        
      } catch (error) {
        result.failed.push({
          gameId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Save all valid games
    if (result.successful > 0) {
      await setLocalStorageItem(SAVED_GAMES_KEY, JSON.stringify(gamesToSave));
      
      // Invalidate React Query cache
      if (queryClient) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
      }
    }

    return result;
    
  } catch (error) {
    logger.error('Import games error:', error);
    throw new Error('Failed to parse import file. Please check the file format.');
  }
};
```

2. **Update UI to show import results** (`src/components/ImportResultsModal.tsx`):
```typescript
import React from 'react';
import { ImportResult } from '@/utils/savedGames';

interface Props {
  result: ImportResult;
  onClose: () => void;
}

export const ImportResultsModal: React.FC<Props> = ({ result, onClose }) => {
  const { successful, skipped, failed, warnings } = result;
  
  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Import Results</h2>
        
        <div className="import-summary">
          <div className="stat success">
            ✓ {successful} games imported successfully
          </div>
          {skipped > 0 && (
            <div className="stat warning">
              ⚠ {skipped} games skipped (already exist)
            </div>
          )}
          {failed.length > 0 && (
            <div className="stat error">
              ✗ {failed.length} games failed to import
            </div>
          )}
        </div>

        {failed.length > 0 && (
          <div className="failed-games">
            <h3>Failed Imports:</h3>
            <ul>
              {failed.map(({ gameId, error }) => (
                <li key={gameId}>
                  <strong>{gameId}:</strong> {error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="warnings">
            <h3>Warnings:</h3>
            <ul>
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
};
```

#### Testing Strategy
- Test with valid, invalid, and mixed game collections
- Test with corrupted JSON
- Test with missing required fields
- Test with extremely large import files (1000+ games)
- Test overwrite functionality

---

## Phase 2: High Priority Bugs (Week 2)

### 🟡 Bug #4: Timer Drift Fix

#### Implementation Steps

1. **Create precision timer hook** (`src/hooks/usePrecisionTimer.ts`):
```typescript
import { useRef, useCallback, useEffect } from 'react';

interface PrecisionTimerOptions {
  onTick: (elapsed: number) => void;
  interval?: number;
}

export const usePrecisionTimer = ({ onTick, interval = 1000 }: PrecisionTimerOptions) => {
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const baseTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(false);

  const update = useCallback(() => {
    if (!isRunningRef.current || startTimeRef.current === null) return;

    const now = performance.now();
    const elapsed = (now - startTimeRef.current) / 1000;
    const totalElapsed = baseTimeRef.current + elapsed;
    
    // Only trigger onTick when crossing a second boundary
    const currentSecond = Math.floor(totalElapsed);
    if (currentSecond !== lastTickRef.current) {
      lastTickRef.current = currentSecond;
      onTick(totalElapsed);
    }

    rafRef.current = requestAnimationFrame(update);
  }, [onTick]);

  const start = useCallback((baseTime: number = 0) => {
    if (isRunningRef.current) return;
    
    baseTimeRef.current = baseTime;
    startTimeRef.current = performance.now();
    lastTickRef.current = Math.floor(baseTime);
    isRunningRef.current = true;
    
    update();
  }, [update]);

  const pause = useCallback((): number => {
    if (!isRunningRef.current || startTimeRef.current === null) {
      return baseTimeRef.current;
    }

    isRunningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const totalElapsed = baseTimeRef.current + elapsed;
    
    baseTimeRef.current = totalElapsed;
    startTimeRef.current = null;
    
    return totalElapsed;
  }, []);

  const reset = useCallback(() => {
    pause();
    baseTimeRef.current = 0;
    lastTickRef.current = 0;
  }, [pause]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { start, pause, reset, isRunning: isRunningRef.current };
};
```

2. **Update `src/hooks/useGameTimer.ts`** to use precision timer:
```typescript
import { usePrecisionTimer } from './usePrecisionTimer';

export const useGameTimer = (
  gameSessionState: GameSessionState,
  dispatch: React.Dispatch<GameSessionAction>
) => {
  const handleTick = useCallback((elapsed: number) => {
    const periodEnd = gameSessionState.currentPeriod * 
                     gameSessionState.periodDurationMinutes * 60;
    
    if (elapsed >= periodEnd) {
      // Period ended
      dispatch({
        type: 'END_PERIOD_OR_GAME',
        payload: {
          newStatus: gameSessionState.currentPeriod === gameSessionState.numberOfPeriods 
            ? 'gameEnd' 
            : 'periodEnd',
          finalTime: periodEnd
        }
      });
    } else {
      // Update elapsed time
      dispatch({
        type: 'SET_TIMER_ELAPSED',
        payload: elapsed
      });
    }
  }, [gameSessionState, dispatch]);

  const { start, pause, reset } = usePrecisionTimer({ onTick: handleTick });

  // Handle timer based on game state
  useEffect(() => {
    if (gameSessionState.isTimerRunning) {
      start(gameSessionState.timeElapsedInSeconds);
    } else {
      pause();
    }
  }, [gameSessionState.isTimerRunning, start, pause]);

  return { start, pause, reset };
};
```

#### Testing Strategy
- Run timer for extended periods (2+ hours) and measure drift
- Test with tab backgrounding and foregrounding
- Test with system clock changes
- Compare against external stopwatch

---

### 🟡 Bug #6: Game ID Generation

#### Implementation Steps

1. **Create ID generator utility** (`src/utils/idGenerator.ts`):
```typescript
// src/utils/idGenerator.ts

/**
 * Generates a unique ID with timestamp for sorting
 */
export const generateGameId = (): string => {
  const timestamp = Date.now();
  const random = crypto.randomUUID().split('-')[0]; // First segment of UUID
  return `game_${timestamp}_${random}`;
};

/**
 * Generates a unique player ID
 */
export const generatePlayerId = (): string => {
  return `player_${crypto.randomUUID()}`;
};

/**
 * Generates a unique team ID
 */
export const generateTeamId = (): string => {
  return `team_${crypto.randomUUID()}`;
};

/**
 * Extract timestamp from game ID for sorting
 */
export const getTimestampFromGameId = (gameId: string): number => {
  const parts = gameId.split('_');
  if (parts.length >= 2) {
    const timestamp = parseInt(parts[1], 10);
    return isNaN(timestamp) ? 0 : timestamp;
  }
  return 0;
};

// Fallback for environments without crypto.randomUUID
if (!crypto.randomUUID) {
  crypto.randomUUID = function(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}
```

2. **Update all ID generation calls**:
```typescript
// src/utils/savedGames.ts
import { generateGameId } from './idGenerator';

export const createGame = async (initialData?: Partial<AppState>): Promise<string> => {
  const gameId = generateGameId(); // Changed from Date.now()
  // ... rest of function
};

// src/utils/teams.ts
import { generatePlayerId, generateTeamId } from './idGenerator';

export const duplicateTeam = async (teamId: string): Promise<string> => {
  const newTeamId = generateTeamId(); // Changed from Date.now() based
  // ... rest of function
};
```

#### Testing Strategy
- Create 1000 games in rapid succession and verify uniqueness
- Test ID generation in different browsers
- Verify sorting still works with new ID format

---

### 🟡 Bug #7: Mixed localStorage Usage

#### Implementation Steps

1. **Create async-only localStorage wrapper** (`src/utils/storage.ts`):
```typescript
// src/utils/storage.ts
import { logger } from './logger';

class StorageManager {
  private pendingOperations: Map<string, Promise<any>> = new Map();

  async getItem(key: string): Promise<string | null> {
    // Wait for any pending write operation on this key
    const pending = this.pendingOperations.get(key);
    if (pending) await pending;

    return new Promise((resolve) => {
      try {
        const value = localStorage.getItem(key);
        resolve(value);
      } catch (error) {
        logger.error(`Storage.getItem error for key "${key}":`, error);
        resolve(null);
      }
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    const operation = new Promise<void>((resolve, reject) => {
      try {
        localStorage.setItem(key, value);
        resolve();
      } catch (error) {
        logger.error(`Storage.setItem error for key "${key}":`, error);
        reject(error);
      }
    });

    this.pendingOperations.set(key, operation);
    
    try {
      await operation;
    } finally {
      this.pendingOperations.delete(key);
    }
  }

  async removeItem(key: string): Promise<void> {
    const operation = new Promise<void>((resolve) => {
      try {
        localStorage.removeItem(key);
        resolve();
      } catch (error) {
        logger.error(`Storage.removeItem error for key "${key}":`, error);
        resolve();
      }
    });

    this.pendingOperations.set(key, operation);
    
    try {
      await operation;
    } finally {
      this.pendingOperations.delete(key);
    }
  }

  async clear(): Promise<void> {
    return new Promise((resolve) => {
      try {
        localStorage.clear();
        resolve();
      } catch (error) {
        logger.error('Storage.clear error:', error);
        resolve();
      }
    });
  }
}

export const storage = new StorageManager();
```

2. **Update all direct localStorage calls** - Run this script to find and fix:
```bash
# Find all direct localStorage usage
grep -r "localStorage\." src/ --include="*.ts" --include="*.tsx" | grep -v "localStorage.test"

# Files to update:
# src/utils/seasons.ts
# src/utils/tournaments.ts
# src/utils/masterRoster.ts
# src/utils/migrateSavedGames.ts
```

3. **Update files to use storage wrapper**:
```typescript
// Example: src/utils/seasons.ts
import { storage } from './storage';

export const saveSeasons = async (seasons: Season[]): Promise<void> => {
  try {
    // OLD: localStorage.setItem(SEASONS_LIST_KEY, JSON.stringify(seasons));
    await storage.setItem(SEASONS_LIST_KEY, JSON.stringify(seasons));
    logger.log('Seasons saved to localStorage');
  } catch (error) {
    logger.error('Error saving seasons:', error);
    throw error;
  }
};
```

---

## Phase 3: Medium Priority Bugs (Week 3)

### 🟢 Bug #8: Timer State Rapid Tab Switching

#### Implementation Steps

1. **Add debounced visibility handler**:
```typescript
// src/hooks/useVisibilityRestore.ts
import { useRef, useEffect, useCallback } from 'react';

export const useVisibilityRestore = (
  onRestore: () => Promise<void>,
  debounceMs: number = 500
) => {
  const restoreInProgressRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleVisibilityChange = useCallback(() => {
    // Clear any pending restore
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!document.hidden) {
      // Debounce the restore operation
      timeoutRef.current = setTimeout(async () => {
        if (restoreInProgressRef.current) return;
        
        restoreInProgressRef.current = true;
        try {
          await onRestore();
        } catch (error) {
          logger.error('Visibility restore error:', error);
        } finally {
          restoreInProgressRef.current = false;
        }
      }, debounceMs);
    }
  }, [onRestore, debounceMs]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [handleVisibilityChange]);
};
```

---

### 🟢 Bug #9: Resume Game Validation

#### Implementation Steps

1. **Add game validation on resume**:
```typescript
// src/utils/appState.ts
export const validateAndGetResumableGame = async (): Promise<{
  gameId: string;
  gameData: AppState;
} | null> => {
  try {
    const lastGameId = await getCurrentGameIdSetting();
    if (!lastGameId) return null;

    const games = await getSavedGames();
    const gameData = games[lastGameId];
    
    if (!gameData) {
      // Game was deleted, clear the setting
      await saveCurrentGameIdSetting('');
      return null;
    }

    // Validate the game data
    const validation = appStateSchema.safeParse(gameData);
    if (!validation.success) {
      logger.error('Invalid game data for resume:', validation.error);
      await saveCurrentGameIdSetting('');
      return null;
    }

    // Additional checks for game resumability
    if (validation.data.gameStatus === 'gameEnd') {
      // Can't resume ended games
      await saveCurrentGameIdSetting('');
      return null;
    }

    return {
      gameId: lastGameId,
      gameData: validation.data
    };
  } catch (error) {
    logger.error('Error validating resumable game:', error);
    return null;
  }
};
```

2. **Update page.tsx to use validation**:
```typescript
// src/app/page.tsx
useEffect(() => {
  const checkAppState = async () => {
    try {
      // ... other checks
      
      // Check for resumable game
      const resumableGame = await validateAndGetResumableGame();
      setCanResume(resumableGame !== null);
      
    } catch (error) {
      logger.error('Error checking app state:', error);
      setCanResume(false);
    }
  };
  
  checkAppState();
}, []);
```

---

### 🟢 Bug #10: Schema Validation Gaps

#### Implementation Steps

1. **Update appStateSchema.ts**:
```typescript
// src/utils/appStateSchema.ts

// Add missing field validations
export const appStateSchema = z.object({
  // ... existing fields
  
  // Add demand factor validation
  demandFactor: z.number().min(0).max(5).default(1),
  
  // Add stricter validation for optional fields
  gameLocation: z.string().max(100).optional().default(''),
  gameTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().or(z.literal('')),
  
  // Add validation for array lengths
  selectedPlayerIds: z.array(z.string()).max(50), // Reasonable limit
  gameEvents: z.array(gameEventSchema).max(500), // Prevent huge arrays
  
  // Add custom refinements
}).refine(data => {
  // Ensure home or away scores match team position
  return data.homeScore >= 0 && data.awayScore >= 0;
}, {
  message: "Scores cannot be negative"
}).refine(data => {
  // Ensure period duration is reasonable
  return data.periodDurationMinutes > 0 && data.periodDurationMinutes <= 120;
}, {
  message: "Period duration must be between 1 and 120 minutes"
});
```

---

## Testing Strategy for All Fixes

### Unit Testing
Create test files for each fix:
```typescript
// Example: src/utils/__tests__/lockManager.test.ts
describe('LockManager', () => {
  test('prevents concurrent access', async () => {
    // Test implementation
  });
  
  test('handles errors gracefully', async () => {
    // Test implementation
  });
  
  test('releases locks on error', async () => {
    // Test implementation
  });
});
```

### Integration Testing
```typescript
// tests/integration/bug-fixes.test.ts
describe('Bug Fix Integration Tests', () => {
  describe('Roster Operations', () => {
    test('handles concurrent team switches without corruption', async () => {
      // Simulate rapid team switching
    });
  });
  
  describe('Migration', () => {
    test('rolls back on failure', async () => {
      // Test migration rollback
    });
  });
  
  describe('Game Import', () => {
    test('imports valid games even with invalid ones', async () => {
      // Test partial import
    });
  });
});
```

### Manual Testing Checklist

#### Critical Bugs
- [ ] Open app in 3 tabs, rapidly switch teams in all tabs
- [ ] Corrupt localStorage data, attempt migration
- [ ] Import file with 50% invalid games
- [ ] Create 100 games rapidly (< 1 second)

#### High Priority Bugs
- [ ] Run timer for 2 hours, check accuracy
- [ ] Background/foreground tab 50 times rapidly
- [ ] Import 1000+ games at once

#### Medium Priority Bugs
- [ ] Delete active game while another tab has it open
- [ ] Modify localStorage directly, try to resume
- [ ] Import games with missing fields

---

## Rollout Plan

### Phase 1: Critical Fixes (Week 1)
1. **Day 1-2**: Implement lock manager and tests
2. **Day 3-4**: Implement migration backup/rollback
3. **Day 5**: Implement import validation improvements
4. **Day 6-7**: Testing and code review

### Phase 2: High Priority (Week 2)
1. **Day 1-2**: Implement precision timer
2. **Day 3**: Update ID generation
3. **Day 4-5**: Fix localStorage usage
4. **Day 6-7**: Testing and integration

### Phase 3: Medium Priority (Week 3)
1. **Day 1-2**: Fix visibility handling
2. **Day 3**: Add resume validation
3. **Day 4**: Update schemas
4. **Day 5-7**: Full regression testing

---

## Deployment Strategy

### Pre-deployment
1. Run full test suite with new fixes
2. Test on multiple devices/browsers
3. Create full data backup reminder for users
4. Prepare rollback plan

### Deployment Steps
1. **Version 0.1.1 - Critical Fixes**
   - Deploy with feature flags for new lock system
   - Monitor error logs for 48 hours
   - Enable for all users if stable

2. **Version 0.1.2 - High Priority Fixes**
   - Include timer and ID generation fixes
   - Add telemetry for timer accuracy
   - Monitor for 1 week

3. **Version 0.1.3 - Medium Priority Fixes**
   - Final fixes and schema updates
   - Full production release

### Post-deployment
1. Monitor error rates for 2 weeks
2. Gather user feedback
3. Plan next iteration based on findings

---

## Monitoring & Metrics

### Key Metrics to Track
1. **Lock timeout errors** - Should be < 0.1%
2. **Migration success rate** - Should be > 99.9%
3. **Import success rate** - Track partial vs full success
4. **Timer drift** - Should be < 1 second per hour
5. **ID collisions** - Should be 0

### Error Tracking
```typescript
// Add to each fix
try {
  // Fix implementation
} catch (error) {
  logger.error('BugFix #X failed:', {
    error,
    context: { /* relevant data */ },
    timestamp: Date.now(),
    version: APP_VERSION
  });
  
  // Report to monitoring service if available
  if (window.errorReporter) {
    window.errorReporter.report(error);
  }
}
```

---

## Success Criteria

### Phase 1 Success
- Zero data corruption reports
- Migration success rate > 99.9%
- Import handles 100% of mixed valid/invalid files

### Phase 2 Success
- Timer accuracy within 0.1% over 2 hours
- Zero ID collisions in 10,000 operations
- All localStorage operations async

### Phase 3 Success
- No resume failures for valid games
- Schema validation catches 100% of invalid data
- Zero race conditions in visibility changes

---

## Risk Mitigation

### Risks and Mitigations

1. **Risk**: Breaking changes in localStorage structure
   - **Mitigation**: Version all storage keys, maintain backwards compatibility

2. **Risk**: Performance regression from new locks
   - **Mitigation**: Add performance monitoring, optimize if needed

3. **Risk**: Browser compatibility issues with crypto.randomUUID
   - **Mitigation**: Include polyfill, test on older browsers

4. **Risk**: Data loss during migration
   - **Mitigation**: Automatic backups, manual export reminder

---

*Plan Created: 2025-08-27*
*Estimated Timeline: 3 weeks*
*Required Resources: 1-2 developers, QA support*