import { getStorageItem, setStorageItem, removeStorageItem } from './storage';
import { MASTER_ROSTER_KEY, SEASONS_LIST_KEY } from '@/config/storageKeys';
import logger from './logger';

/**
 * Legacy Data Migration Utility
 *
 * Migrates old storage keys to new standardized keys.
 * This handles the transition from old key names to the new naming convention.
 *
 * Extracted from useGameOrchestration (Step 2.3) to reduce initialization complexity.
 */

/**
 * Migrates legacy storage keys to new keys
 *
 * Old keys → New keys:
 * - 'availablePlayers' → MASTER_ROSTER_KEY
 * - 'soccerSeasonsList' → SEASONS_LIST_KEY
 *
 * @returns {Promise<boolean>} True if any migrations were performed
 */
export async function migrateLegacyStorageKeys(): Promise<boolean> {
  let migrated = false;

  try {
    // Migrate old roster key
    const oldRosterJson = await getStorageItem('availablePlayers').catch(() => null);
    if (oldRosterJson) {
      await setStorageItem(MASTER_ROSTER_KEY, oldRosterJson);
      await removeStorageItem('availablePlayers');
      logger.log('[MIGRATION] Migrated availablePlayers → masterRoster');
      migrated = true;
    }

    // Migrate old seasons key
    const oldSeasonsJson = await getStorageItem('soccerSeasonsList').catch(() => null);
    if (oldSeasonsJson) {
      await setStorageItem(SEASONS_LIST_KEY, oldSeasonsJson);
      await removeStorageItem('soccerSeasonsList');
      logger.log('[MIGRATION] Migrated soccerSeasonsList → seasons');
      migrated = true;
    }
  } catch (error) {
    logger.error('[MIGRATION] Error during legacy data migration:', error);
  }

  return migrated;
}
