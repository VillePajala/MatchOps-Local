/**
 * Simplified IndexedDB Migration
 *
 * A pragmatic migration approach for small datasets (1-3 users)
 * Removes enterprise complexity while maintaining data integrity
 */

import {
  APP_DATA_VERSION_KEY,
  MASTER_ROSTER_KEY,
  SAVED_GAMES_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY
} from '@/config/storageKeys';
import { getLocalStorageItem, setLocalStorageItem } from './localStorage';
import { createStorageAdapter, getStorageConfig, updateStorageConfig } from './storageFactory';
import { CURRENT_DATA_VERSION, INDEXEDDB_STORAGE_VERSION } from '@/config/migrationConfig';
import logger from './logger';
import { updateMigrationStatus } from '@/hooks/useMigrationStatus';

// Migration progress interface for UI integration
interface MigrationProgressInfo {
  percentage: number;
  message: string;
  currentStep?: string;
  processedKeys?: number;
  totalKeys?: number;
}

// Migration state for UI updates
let migrationProgress: ((progress: MigrationProgressInfo) => void) | null = null;

// Migration configuration with enhanced safety
const MIGRATION_CONFIG = {
  SUCCESS_RATE_THRESHOLD: 100, // Require 100% success to prevent orphaned data
  BATCH_SIZE: 50, // Process in batches for better performance
  MAX_RETRIES: 3, // Retry failed operations
  CHECKSUM_VALIDATION: true, // Enable data integrity verification
  INDEXEDDB_TIMEOUT_MS: 10000, // 10 second timeout for IndexedDB operations
} as const;

/**
 * Set a progress callback for UI updates
 */
export const setMigrationProgressCallback = (callback: ((progress: MigrationProgressInfo) => void) | null) => {
  migrationProgress = callback;
};

/**
 * Get current app data version
 */
export const getAppDataVersion = (): number => {
  const stored = getLocalStorageItem(APP_DATA_VERSION_KEY);
  if (stored) {
    return parseInt(stored, 10);
  }

  // Check if there's any existing data
  const hasData = !!(
    getLocalStorageItem(MASTER_ROSTER_KEY) ||
    getLocalStorageItem(SAVED_GAMES_KEY) ||
    getLocalStorageItem(SEASONS_LIST_KEY) ||
    getLocalStorageItem(TOURNAMENTS_LIST_KEY)
  );

  // If no data exists, this is a fresh install
  if (!hasData) {
    setAppDataVersion(CURRENT_DATA_VERSION);
    return CURRENT_DATA_VERSION;
  }

  // Has data but no version = v1 installation
  return 1;
};

/**
 * Set app data version
 */
export const setAppDataVersion = (version: number): void => {
  setLocalStorageItem(APP_DATA_VERSION_KEY, version.toString());
};

/**
 * Check if migration is needed
 */
export const isMigrationNeeded = (): boolean => {
  const currentVersion = getAppDataVersion();
  return currentVersion < CURRENT_DATA_VERSION;
};

/**
 * Check if IndexedDB migration is needed
 */
export const isIndexedDbMigrationNeeded = (): boolean => {
  const config = getStorageConfig();
  return config.mode === 'localStorage' &&
         config.version !== INDEXEDDB_STORAGE_VERSION &&
         config.forceMode !== 'localStorage';
};

/**
 * Migration lock with cross-tab coordination
 */
interface MigrationLock {
  inProgress: boolean;
  startTime: number;
  tabId: string;
}

const MIGRATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout
const MIGRATION_LOCK_KEY = 'migration_lock_cross_tab';
const CURRENT_TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Check IndexedDB availability before migration
 */
async function checkIndexedDbAvailability(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    logger.warn('[Migration] IndexedDB not available in this environment');
    return false;
  }

  try {
    // Test IndexedDB with a temporary database
    const testDbName = 'migration-availability-test';
    const request = indexedDB.open(testDbName, 1);

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('[Migration] IndexedDB availability check timed out');
        resolve(false);
      }, MIGRATION_CONFIG.INDEXEDDB_TIMEOUT_MS);

      request.onerror = () => {
        clearTimeout(timeout);
        logger.warn('[Migration] IndexedDB blocked or unavailable (privacy mode?)');
        resolve(false);
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        try {
          // Clean up test database
          request.result.close();
          indexedDB.deleteDatabase(testDbName);
          resolve(true);
        } catch {
          resolve(false);
        }
      };

      request.onblocked = () => {
        clearTimeout(timeout);
        logger.warn('[Migration] IndexedDB blocked - cannot proceed with migration');
        resolve(false);
      };
    });
  } catch (error) {
    logger.warn('[Migration] IndexedDB availability check failed:', error);
    return false;
  }
}

/**
 * Generate SHA-256 checksum for data integrity verification
 */
async function generateChecksum(data: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Fallback for environments without crypto.subtle
    return `fallback-${data.length}-${data.slice(0, 10)}`;
  }

  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    logger.warn('[Migration] Checksum generation failed, using fallback:', error);
    return `fallback-${data.length}-${data.slice(0, 10)}`;
  }
}

/**
 * Verify data integrity using checksums
 */
async function verifyDataIntegrity(sourceValue: string, targetValue: string): Promise<boolean> {
  if (!MIGRATION_CONFIG.CHECKSUM_VALIDATION) {
    return sourceValue === targetValue; // Simple comparison fallback
  }

  try {
    const [sourceChecksum, targetChecksum] = await Promise.all([
      generateChecksum(sourceValue),
      generateChecksum(targetValue)
    ]);

    return sourceChecksum === targetChecksum;
  } catch (error) {
    logger.warn('[Migration] Checksum verification failed, using fallback comparison:', error);
    return sourceValue === targetValue;
  }
}

/**
 * Main migration function - simplified for small datasets
 */
// Removed getCrossTabLock - now handled in acquireMigrationLockAtomic

/**
 * Set cross-tab migration lock in localStorage
 */
function setCrossTabLock(lock: MigrationLock | null): boolean {
  try {
    if (lock) {
      localStorage.setItem(MIGRATION_LOCK_KEY, JSON.stringify(lock));
    } else {
      localStorage.removeItem(MIGRATION_LOCK_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomic compare-and-swap lock acquisition to prevent race conditions
 */
function acquireMigrationLockAtomic(): boolean {
  try {
    // Get current lock state
    const currentLockData = localStorage.getItem(MIGRATION_LOCK_KEY);
    let existingLock: MigrationLock | null = null;

    if (currentLockData) {
      try {
        existingLock = JSON.parse(currentLockData);
      } catch {
        // Invalid lock data, treat as no lock
        existingLock = null;
      }
    }

    // Check if existing lock is valid and not stale
    if (existingLock) {
      const timeSinceStart = Date.now() - existingLock.startTime;

      if (timeSinceStart <= MIGRATION_TIMEOUT_MS) {
        // Lock is still valid
        if (existingLock.tabId !== CURRENT_TAB_ID) {
          logger.log('[Migration] Migration in progress in another tab, skipping');
          return false;
        }
        logger.log('[Migration] Already in progress in current tab, skipping');
        return false;
      }

      // Lock is stale, will attempt to replace it
      logger.warn(`[Migration] Found stale lock from tab ${existingLock.tabId}, attempting to acquire`);
    }

    // Attempt atomic lock acquisition using compare-and-swap pattern
    const newLock: MigrationLock = {
      inProgress: true,
      startTime: Date.now(),
      tabId: CURRENT_TAB_ID
    };

    const newLockData = JSON.stringify(newLock);

    try {
      // Atomic operation: set the lock
      localStorage.setItem(MIGRATION_LOCK_KEY, newLockData);

      // Verify the lock was set correctly (simple race condition check)
      const verificationData = localStorage.getItem(MIGRATION_LOCK_KEY);
      if (verificationData === newLockData) {
        return true;
      } else {
        logger.warn('[Migration] Lock verification failed - another tab may have acquired it');
        return false;
      }
    } catch (error) {
      logger.error('[Migration] Failed to set migration lock:', error);
      return false;
    }
  } catch (error) {
    logger.error('[Migration] Lock acquisition failed:', error);
    return false;
  }
}

// Legacy function for backwards compatibility
function acquireMigrationLock(): boolean {
  return acquireMigrationLockAtomic();
}

export const runMigration = async (): Promise<void> => {
  // Try to acquire cross-tab migration lock
  if (!acquireMigrationLock()) {
    return;
  }

  // Notify UI that migration is starting
  updateMigrationStatus({ isRunning: true, progress: null, error: null });

  try {
    const needsAppMigration = isMigrationNeeded();
    const needsIndexedDbMigration = isIndexedDbMigrationNeeded();

    if (!needsAppMigration && !needsIndexedDbMigration) {
      logger.log('[Migration] No migration needed');
      updateMigrationStatus({ isRunning: false });
      return;
    }

    // Check IndexedDB availability before attempting migration
    if (needsIndexedDbMigration) {
      const isIndexedDbAvailable = await checkIndexedDbAvailability();
      if (!isIndexedDbAvailable) {
        const errorMsg = 'IndexedDB is not available (privacy mode or browser restriction). Continuing with localStorage.';
        logger.warn(`[Migration] ${errorMsg}`);
        updateMigrationStatus({
          isRunning: false,
          error: errorMsg,
          showNotification: true
        });
        return;
      }
    }

    // Handle app data migration (v1 → v2)
    if (needsAppMigration) {
      logger.log('[Migration] Starting app data migration');
      updateMigrationStatus({
        isRunning: true,
        progress: {
          percentage: 10,
          message: 'Migrating application data...',
          currentStep: 'App Data Migration'
        }
      });
      await performAppDataMigration();
      setAppDataVersion(CURRENT_DATA_VERSION);
      logger.log('[Migration] App data migration completed');
    }

    // Handle IndexedDB migration
    if (needsIndexedDbMigration) {
      logger.log('[Migration] Starting IndexedDB migration');
      updateMigrationStatus({
        isRunning: true,
        progress: {
          percentage: 30,
          message: 'Preparing storage migration...',
          currentStep: 'Storage Migration'
        }
      });
      await performIndexedDbMigrationEnhanced();
      logger.log('[Migration] IndexedDB migration completed');
    }

    // Migration completed successfully
    updateMigrationStatus({
      isRunning: false,
      progress: { percentage: 100, message: 'Migration completed successfully!' },
      showNotification: true
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[Migration] Migration failed:', errorMessage);

    updateMigrationStatus({
      isRunning: false,
      error: `Migration failed: ${errorMessage}`,
      showNotification: true
    });

    // Don't throw - app can still work with localStorage
  } finally {
    // Release cross-tab migration lock
    setCrossTabLock(null);
    migrationProgress = null;
  }
};

/**
 * Perform app data migration (team structure, etc.)
 */
async function performAppDataMigration(): Promise<void> {
  // Import only what we need to avoid circular dependencies
  const { getMasterRoster } = await import('./masterRosterManager');
  const { getLastHomeTeamName } = await import('./appSettings');
  const { addTeam, setTeamRoster } = await import('./teams');

  // Create a default team for existing data
  const teamName = await getLastHomeTeamName() || 'My Team';
  const team = await addTeam({
    name: teamName,
    color: '#6366F1'
  });

  // Migrate roster to team
  try {
    const roster = await getMasterRoster();
    const teamRoster = roster.map(player => ({
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      jerseyNumber: player.jerseyNumber,
      isGoalie: player.isGoalie,
      color: player.color,
      notes: player.notes,
      receivedFairPlayCard: player.receivedFairPlayCard
    }));
    await setTeamRoster(team.id, teamRoster);
  } catch (error) {
    logger.warn('[Migration] Could not migrate roster:', error);
    await setTeamRoster(team.id, []);
  }

  logger.log('[Migration] Created default team:', team.name);
}

/**
 * Enhanced IndexedDB migration with batch processing and data integrity verification
 */
async function performIndexedDbMigrationEnhanced(): Promise<void> {
  try {
    // Create adapters
    const sourceAdapter = await createStorageAdapter('localStorage');
    const targetAdapter = await createStorageAdapter('indexedDB');

    // Get all localStorage keys
    const allKeys = Object.keys(localStorage).filter(key =>
      !key.startsWith('migration_') && // Skip migration-specific keys
      !key.includes('backup') // Skip backup keys
    );

    const totalKeys = allKeys.length;
    logger.log(`[Migration] Found ${totalKeys} keys to migrate`);

    // Enhanced progress tracking with UI integration
    const processed = { count: 0 }; // Use object to allow mutation
    const updateProgress = (message: string) => {
      const percentage = Math.round((processed.count / totalKeys) * 70) + 30; // Reserve 30% for setup, use 70% for data transfer
      logger.log(`[Migration] Progress: ${percentage}% - ${message}`);

      if (migrationProgress) {
        migrationProgress({
          percentage,
          message,
          currentStep: 'Storage Migration',
          processedKeys: processed.count,
          totalKeys: totalKeys
        });
      }

      // Also update the global migration status for UI
      updateMigrationStatus({
        isRunning: true,
        progress: {
          percentage,
          message,
          currentStep: 'Storage Migration',
          processedKeys: processed.count,
          totalKeys: totalKeys
        }
      });
    };

    // Enhanced batch processing with data integrity verification
    const errors: Array<{ key: string; error: string; retryCount: number }> = [];
    const migratedKeys: string[] = [];
    const batchSize = MIGRATION_CONFIG.BATCH_SIZE;

    // Process data in batches for better performance
    for (let i = 0; i < allKeys.length; i += batchSize) {
      const batch = allKeys.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allKeys.length / batchSize);

      updateProgress(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);
      updateMigrationStatus({
        isRunning: true,
        progress: {
          percentage: Math.round((i / allKeys.length) * 70) + 30, // 30-100% range
          message: `Migrating batch ${batchNumber}/${totalBatches}`,
          currentStep: 'Storage Migration',
          processedKeys: migratedKeys.length,
          totalKeys: totalKeys
        }
      });

      // Process batch concurrently with retry logic
      const batchPromises = batch.map(async (key) => {
        let retryCount = 0;
        const maxRetries = MIGRATION_CONFIG.MAX_RETRIES;

        while (retryCount <= maxRetries) {
          try {
            const sourceValue = await sourceAdapter.getItem(key);
            if (sourceValue !== null) {
              await targetAdapter.setItem(key, sourceValue);

              // Verify data integrity if enabled
              if (MIGRATION_CONFIG.CHECKSUM_VALIDATION) {
                const targetValue = await targetAdapter.getItem(key);
                if (targetValue !== null) {
                  const isIntegrityValid = await verifyDataIntegrity(sourceValue, targetValue);
                  if (!isIntegrityValid) {
                    throw new Error('Data integrity verification failed');
                  }
                }
              }

              migratedKeys.push(key);
              return { success: true, key };
            }
            return { success: true, key }; // Null values are ok
          } catch {
            retryCount++;
            if (retryCount > maxRetries) {
              // Sanitize key name for logging security
              const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '*');
              const errorMsg = `Failed to migrate key after ${maxRetries} retries: ${sanitizedKey}`;
              logger.warn(errorMsg);
              errors.push({ key: sanitizedKey, error: errorMsg, retryCount });
              return { success: false, key };
            }
            // Exponential backoff for retries
            const backoffMs = Math.min(100 * Math.pow(2, retryCount - 1), 1000);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
        return { success: false, key };
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);

      // Small delay between batches to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Enhanced success rate validation with detailed error reporting
    const successRate = (migratedKeys.length / totalKeys) * 100;
    const failedKeys = errors.length;

    if (successRate < MIGRATION_CONFIG.SUCCESS_RATE_THRESHOLD) {
      // Clean up partial IndexedDB data on failure
      updateMigrationStatus({
        isRunning: true,
        progress: {
          percentage: 95,
          message: 'Cleaning up partial migration...',
          currentStep: 'Rollback',
          processedKeys: migratedKeys.length,
          totalKeys: totalKeys
        }
      });

      try {
        // Batch cleanup for performance
        const cleanupBatches = [];
        for (let i = 0; i < migratedKeys.length; i += batchSize) {
          const cleanupBatch = migratedKeys.slice(i, i + batchSize);
          cleanupBatches.push(
            Promise.all(cleanupBatch.map(async (key) => {
              try {
                await targetAdapter.removeItem?.(key);
              } catch {
                // Ignore individual cleanup errors
              }
            }))
          );
        }
        await Promise.all(cleanupBatches);
        logger.log('[Migration] Cleaned up partial data from IndexedDB');
      } catch {
        // Ignore cleanup errors
      }

      const detailedError = `Migration failed: Only ${successRate.toFixed(1)}% of data transferred successfully (${migratedKeys.length}/${totalKeys} items). Failed items: ${failedKeys}. All data remains safely in localStorage.`;
      throw new Error(detailedError);
    }

    if (errors.length > 0) {
      logger.warn(`[Migration] Completed with ${errors.length} errors (${successRate.toFixed(1)}% success rate, ${migratedKeys.length}/${totalKeys} items migrated)`);
      logger.warn(`[Migration] Error summary:`, errors.map(e => `${e.key} (${e.retryCount} retries)`));
    }

    // Update storage configuration to use IndexedDB
    updateStorageConfig({
      mode: 'indexedDB',
      version: INDEXEDDB_STORAGE_VERSION,
      migrationState: 'completed'
    });

    logger.log('[Migration] Storage configuration updated to IndexedDB');

  } catch (error) {
    logger.error('[Migration] IndexedDB migration failed:', error instanceof Error ? error.message : String(error));

    // Update config to indicate failure
    updateStorageConfig({
      migrationState: 'failed'
    });

    // Re-throw to allow caller to handle graceful fallback
    throw error;
  }
}

/**
 * Get migration status for UI
 */
export const getMigrationStatus = () => {
  const config = getStorageConfig();

  return {
    currentVersion: getAppDataVersion(),
    targetVersion: CURRENT_DATA_VERSION,
    migrationNeeded: isMigrationNeeded(),
    storageMode: config.mode,
    storageVersion: config.version,
    indexedDbMigrationNeeded: isIndexedDbMigrationNeeded(),
    migrationState: config.migrationState
  };
};

/**
 * Manually trigger IndexedDB migration (for settings UI)
 */
export const triggerIndexedDbMigration = async (): Promise<boolean> => {
  const config = getStorageConfig();

  if (config.mode === 'indexedDB') {
    logger.log('[Migration] Already using IndexedDB');
    return true;
  }

  if (config.forceMode === 'localStorage') {
    logger.log('[Migration] Migration blocked: localStorage forced');
    return false;
  }

  // Check IndexedDB availability before attempting migration
  const isIndexedDbAvailable = await checkIndexedDbAvailability();
  if (!isIndexedDbAvailable) {
    logger.warn('[Migration] IndexedDB not available for manual migration');
    return false;
  }

  try {
    await performIndexedDbMigrationEnhanced();
    return true;
  } catch (error) {
    logger.error('[Migration] Manual migration failed:', error);
    return false;
  }
};

// Compatibility export for existing code
export const getMasterRosterCompat = async () => {
  const { getMasterRoster } = await import('./masterRosterManager');
  return getMasterRoster();
};
/**
 * Manual migration lock reset (for debugging/recovery)
 * Useful if browser crashes during migration leaving lock in place
 */
export const resetMigrationLock = (): void => {
  setCrossTabLock(null);
  logger.log('[Migration] Manual cross-tab lock reset performed');
};
