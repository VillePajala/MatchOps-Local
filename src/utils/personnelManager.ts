import { PERSONNEL_KEY } from '@/config/storageKeys';
import { getStorageItem, setStorageItem } from './storage';
import type { Personnel, PersonnelCollection } from '@/types/personnel';
import logger from '@/utils/logger';
import { withKeyLock } from './storageKeyLock';
import { getSavedGames } from './savedGames';

/**
 * Get all personnel from storage
 */
export const getAllPersonnel = async (): Promise<Personnel[]> => {
  try {
    const personnelJson = await getStorageItem(PERSONNEL_KEY);
    if (!personnelJson) {
      return [];
    }
    const collection: PersonnelCollection = JSON.parse(personnelJson);
    // Sort by creation date, newest first
    return Object.values(collection).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    logger.error('Error getting personnel:', error);
    throw error;
  }
};

/**
 * Get personnel collection as object
 */
export const getPersonnelCollection = async (): Promise<PersonnelCollection> => {
  try {
    const personnelJson = await getStorageItem(PERSONNEL_KEY);
    if (!personnelJson) {
      return {};
    }
    return JSON.parse(personnelJson) as PersonnelCollection;
  } catch (error) {
    logger.error('Error getting personnel collection:', error);
    throw error;
  }
};

/**
 * Get single personnel by ID
 */
export const getPersonnelById = async (personnelId: string): Promise<Personnel | null> => {
  try {
    const collection = await getPersonnelCollection();
    return collection[personnelId] || null;
  } catch (error) {
    logger.error('Error getting personnel by ID:', error);
    throw error;
  }
};

/**
 * Add new personnel member
 */
export const addPersonnelMember = async (
  personnelData: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Personnel> => {
  return withKeyLock(PERSONNEL_KEY, async () => {
    try {
      // Generate unique ID
      const timestamp = Date.now();
      let uuid: string;

      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        uuid = crypto.randomUUID().split('-')[0];
      } else {
        uuid = Math.random().toString(16).substring(2, 10);
      }

      const personnelId = `personnel_${timestamp}_${uuid}`;
      const now = new Date().toISOString();

      const newPersonnel: Personnel = {
        ...personnelData,
        id: personnelId,
        createdAt: now,
        updatedAt: now,
      };

      const collection = await getPersonnelCollection();
      collection[personnelId] = newPersonnel;

      await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));
      logger.log('Personnel member added:', personnelId);

      return newPersonnel;
    } catch (error) {
      logger.error('Error adding personnel member:', error);
      throw error;
    }
  });
};

/**
 * Update existing personnel member
 */
export const updatePersonnelMember = async (
  personnelId: string,
  updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>
): Promise<Personnel | null> => {
  return withKeyLock(PERSONNEL_KEY, async () => {
    try {
      const collection = await getPersonnelCollection();
      const existing = collection[personnelId];

      if (!existing) {
        logger.warn('Personnel member not found for update:', personnelId);
        return null;
      }

      const updated: Personnel = {
        ...existing,
        ...updates,
        id: personnelId, // Ensure ID never changes
        createdAt: existing.createdAt, // Preserve creation time
        updatedAt: new Date().toISOString(),
      };

      collection[personnelId] = updated;
      await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));
      logger.log('Personnel member updated:', personnelId);

      return updated;
    } catch (error) {
      logger.error('Error updating personnel member:', error);
      throw error;
    }
  });
};

/**
 * Remove personnel member
 *
 * @remarks
 * This function performs a cascade delete - it removes the personnel from all games
 * that reference them before deleting the personnel record itself.
 *
 * **Concurrency Control**:
 * - Locks PERSONNEL_KEY to prevent concurrent personnel deletions
 * - SAVED_GAMES_KEY is modified without explicit lock for performance
 * - Single-user app assumption: Low risk of race conditions
 * - Operations are idempotent: Removing non-existent personnel ID is safe
 * - Multi-tab scenario: Both tabs read same games, filter same ID (harmless)
 *
 * For multi-user environments, implement two-phase locking:
 * ```typescript
 * await withKeyLock(PERSONNEL_KEY, async () => {
 *   await withKeyLock(SAVED_GAMES_KEY, async () => {
 *     // ... cascade delete operations ...
 *   });
 * });
 * ```
 */
export const removePersonnelMember = async (personnelId: string): Promise<boolean> => {
  return withKeyLock(PERSONNEL_KEY, async () => {
    try {
      const collection = await getPersonnelCollection();

      if (!collection[personnelId]) {
        logger.warn('Personnel member not found for removal:', personnelId);
        return false;
      }

      // CASCADE DELETE: Remove personnel from all games
      const games = await getSavedGames();
      let gamesUpdated = 0;

      for (const [gameId, gameState] of Object.entries(games)) {
        if (gameState.gamePersonnel?.includes(personnelId)) {
          // Remove personnel from this game
          gameState.gamePersonnel = gameState.gamePersonnel.filter(id => id !== personnelId);
          games[gameId] = gameState;
          gamesUpdated++;
        }
      }

      // Save updated games if any were modified
      if (gamesUpdated > 0) {
        const { setStorageItem: setGamesItem } = await import('./storage');
        const { SAVED_GAMES_KEY } = await import('@/config/storageKeys');
        await setGamesItem(SAVED_GAMES_KEY, JSON.stringify(games));
        logger.log(`Removed personnel ${personnelId} from ${gamesUpdated} games`);
      }

      // Now delete the personnel record
      delete collection[personnelId];
      await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));
      logger.log('Personnel member removed:', personnelId);

      return true;
    } catch (error) {
      logger.error('Error removing personnel member:', error);
      throw error;
    }
  });
};

/**
 * Get personnel by role (future enhancement - filtering)
 */
export const getPersonnelByRole = async (role: Personnel['role']): Promise<Personnel[]> => {
  try {
    const allPersonnel = await getAllPersonnel();
    return allPersonnel.filter(p => p.role === role);
  } catch (error) {
    logger.error('Error getting personnel by role:', error);
    throw error;
  }
};

/**
 * Get all games that reference a specific personnel member
 *
 * @param personnelId - The personnel ID to search for
 * @returns Array of game IDs that reference this personnel member
 */
export const getGamesWithPersonnel = async (personnelId: string): Promise<string[]> => {
  try {
    const games = await getSavedGames();
    const gameIds: string[] = [];

    for (const [gameId, gameState] of Object.entries(games)) {
      if (gameState.gamePersonnel?.includes(personnelId)) {
        gameIds.push(gameId);
      }
    }

    logger.log(`Found ${gameIds.length} games using personnel ${personnelId}`);
    return gameIds;
  } catch (error) {
    logger.error('Error getting games with personnel:', error);
    throw error;
  }
};
