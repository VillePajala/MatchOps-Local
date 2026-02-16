/**
 * Simplified IndexedDB Migration
 *
 * A pragmatic migration approach for small datasets (1-3 users)
 * Removes enterprise complexity while maintaining data integrity
 *
 * IMPORTANT: localStorage is preserved after migration as automatic backup
 * This is intentional - provides rollback capability and corruption recovery
 * See inline comments in performIndexedDbMigration() for detailed rationale
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

// Simple progress callback type
type ProgressCallback = (progress: {
  percentage: number;
  message: string;
}) => void;

// Migration state for UI updates
let migrationProgress: ProgressCallback | null = null;

/**
 * Set a progress callback for UI updates
 */
export const setMigrationProgressCallback = (callback: ProgressCallback | null) => {
  migrationProgress = callback;
};

/**
 * Get current app data version
 */
export const getAppDataVersion = (): number => {
  const stored = getLocalStorageItem(APP_DATA_VERSION_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    return isNaN(parsed) ? 1 : parsed; // Treat corrupt version as v1 (oldest) to trigger migration
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
export const isIndexedDbMigrationNeeded = async (): Promise<boolean> => {
  const config = await getStorageConfig();
  return config.mode === 'localStorage' &&
         config.version !== INDEXEDDB_STORAGE_VERSION &&
         config.forceMode !== 'localStorage';
};

/**
 * Simple migration lock to prevent concurrent runs
 */
let migrationInProgress = false;

/**
 * Main migration function - simplified for small datasets
 */
export const runMigration = async (): Promise<void> => {
  // Prevent concurrent migrations
  if (migrationInProgress) {
    logger.log('[Migration] Already in progress, skipping');
    return;
  }

  try {
    migrationInProgress = true;

    const needsAppMigration = isMigrationNeeded();
    const needsIndexedDbMigration = await isIndexedDbMigrationNeeded();

    if (!needsAppMigration && !needsIndexedDbMigration) {
      logger.log('[Migration] No migration needed');
      return;
    }

    // Handle app data migration (v1 → v2)
    if (needsAppMigration) {
      logger.log('[Migration] Starting app data migration');
      await performAppDataMigration();
      setAppDataVersion(CURRENT_DATA_VERSION);
      logger.log('[Migration] App data migration completed');
    }

    // Handle IndexedDB migration
    if (needsIndexedDbMigration) {
      logger.log('[Migration] Starting IndexedDB migration');
      await performIndexedDbMigration();
      logger.log('[Migration] IndexedDB migration completed');
    }

  } catch (error) {
    logger.error('[Migration] Migration failed:', error);
    // Don't throw - app can still work with localStorage
  } finally {
    migrationInProgress = false;
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
 * Perform simplified IndexedDB migration
 */
async function performIndexedDbMigration(): Promise<void> {
  try {
    // Create IndexedDB adapter only (read from localStorage directly)
    const targetAdapter = await createStorageAdapter('indexedDB');

    // Get all localStorage keys
    const allKeys = Object.keys(localStorage).filter(key =>
      !key.startsWith('migration_') && // Skip migration-specific keys
      !key.includes('backup') // Skip backup keys
    );

    const totalKeys = allKeys.length;
    logger.log(`[Migration] Found ${totalKeys} keys to migrate`);

    // Simple progress tracking
    let processed = 0;
    const updateProgress = (message: string) => {
      processed++;
      const percentage = Math.round((processed / totalKeys) * 100);
      logger.log(`[Migration] Progress: ${percentage}% - ${message}`);

      if (migrationProgress) {
        migrationProgress({ percentage, message });
      }
    };

    // Transfer data with simple error handling
    const errors: string[] = [];

    for (const key of allKeys) {
      try {
        // Read directly from localStorage (no adapter needed)
        const value = localStorage.getItem(key);
        if (value !== null) {
          await targetAdapter.setItem(key, value);
        }
        updateProgress(`Migrated ${key}`);
      } catch (error) {
        const errorMsg = `Failed to migrate ${key}: ${error}`;
        logger.warn(errorMsg);
        errors.push(errorMsg);
        // Continue with other keys even if one fails
      }
    }

    // Check if migration was successful enough
    const successRate = totalKeys > 0 ? ((totalKeys - errors.length) / totalKeys) * 100 : 100;

    if (successRate < 50) {
      throw new Error(`Migration failed: Only ${successRate.toFixed(1)}% of data transferred`);
    }

    if (errors.length > 0) {
      logger.warn(`[Migration] Completed with ${errors.length} errors (${successRate.toFixed(1)}% success rate)`);
    }

    // Update storage configuration to use IndexedDB
    await updateStorageConfig({
      mode: 'indexedDB',
      version: INDEXEDDB_STORAGE_VERSION,
      migrationState: 'completed'
    });

    logger.log('[Migration] Storage configuration updated to IndexedDB');

    // IMPORTANT: localStorage data is intentionally NOT deleted after migration
    // Rationale:
    // - Automatic backup: If IndexedDB corrupts, localStorage provides recovery source
    // - Rollback capability: Users can manually switch back to localStorage if needed
    // - Negligible cost: <50MB duplication for single-user local-first app (50-100 games)
    // - Data safety priority: Aligns with CLAUDE.md focus on data integrity over disk optimization
    // - No privacy risk: Origin-isolated storage, single-user PWA context
    // See CLAUDE.md "Data Integrity" guidelines for local-first architecture

  } catch (error) {
    logger.error('[Migration] IndexedDB migration failed:', error);

    // Update config to indicate failure but don't crash
    try {
      await updateStorageConfig({
        migrationState: 'failed'
      });
    } catch (configError) {
      logger.error('[Migration] Failed to update migration state:', configError);
    }

    throw error;
  }
}

/**
 * Get migration status for UI
 */
export const getMigrationStatus = async () => {
  const config = await getStorageConfig();

  return {
    currentVersion: getAppDataVersion(),
    targetVersion: CURRENT_DATA_VERSION,
    migrationNeeded: isMigrationNeeded(),
    storageMode: config.mode,
    storageVersion: config.version,
    indexedDbMigrationNeeded: await isIndexedDbMigrationNeeded(),
    migrationState: config.migrationState
  };
};

/**
 * Manually trigger IndexedDB migration (for settings UI)
 */
export const triggerIndexedDbMigration = async (): Promise<boolean> => {
  const config = await getStorageConfig();

  if (config.mode === 'indexedDB') {
    logger.log('[Migration] Already using IndexedDB');
    return true;
  }

  if (config.forceMode === 'localStorage') {
    logger.log('[Migration] Migration blocked: localStorage forced');
    return false;
  }

  try {
    await performIndexedDbMigration();
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