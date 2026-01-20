/**
 * Clear Local IndexedDB Data
 *
 * Provides a safe way to clear local IndexedDB data stores without
 * affecting localStorage settings (like backend mode and migration flags).
 *
 * Used after successful cloud migration when user wants to free up local storage.
 *
 * Part of Phase 4: Supabase Cloud Backend implementation (PR #9).
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 10.2.4
 */

import { clearStorage } from './storage';
import logger from './logger';

/**
 * Clear all local IndexedDB data stores.
 *
 * DOES NOT clear:
 * - localStorage settings (backend mode, migration flags, etc.)
 * - Session storage
 * - Service worker cache
 *
 * Safe to call in cloud mode after successful migration.
 *
 * @returns Promise that resolves when data is cleared
 * @throws Error if IndexedDB clear fails
 *
 * @example
 * ```typescript
 * // After successful migration
 * if (migrationResult.success) {
 *   await clearLocalIndexedDBData();
 *   console.log('Local data cleared successfully');
 * }
 * ```
 */
export async function clearLocalIndexedDBData(): Promise<void> {
  logger.info('[clearLocalData] Starting IndexedDB data clear...');

  try {
    // clearStorage() only affects IndexedDB, NOT localStorage
    // This is the key difference from resetAppSettings() which clears both
    await clearStorage();

    logger.info('[clearLocalData] IndexedDB data cleared successfully');
  } catch (error) {
    logger.error('[clearLocalData] Failed to clear IndexedDB data:', error);
    throw error;
  }
}

/**
 * Check if there is local data that can be cleared.
 *
 * This is a quick check to determine if the "clear local data" option
 * should be shown to the user after migration.
 *
 * @returns true if there is local data to clear
 */
export async function hasLocalDataToClear(): Promise<boolean> {
  try {
    // Import dynamically to avoid circular dependencies
    const { hasLocalDataToMigrate } = await import('@/services/migrationService');
    return hasLocalDataToMigrate();
  } catch {
    // If we can't check, assume there might be data
    return true;
  }
}
