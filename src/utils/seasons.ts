import { SEASONS_LIST_KEY, SAVED_GAMES_KEY } from '@/config/storageKeys';
import type { Season } from '@/types'; // Import Season type from shared types
import type { AppState } from '@/types/game';
import logger from '@/utils/logger';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { withKeyLock } from './storageKeyLock';

// Define the Season type (consider moving to a shared types file if not already there)
// export interface Season { // Remove local definition
//   id: string;
//   name: string;
//   // Add any other relevant season properties, e.g., startDate, endDate
// }

/**
 * Retrieves all seasons from storage.
 * @returns A promise that resolves to an array of Season objects.
 */
export const getSeasons = async (): Promise<Season[]> => {
  try {
    const seasonsJson = await getStorageItem(SEASONS_LIST_KEY);
    if (!seasonsJson) {
      return Promise.resolve([]);
    }
    const seasons = JSON.parse(seasonsJson) as Season[];
    return Promise.resolve(seasons.map(s => ({ ...s, ageGroup: s.ageGroup ?? undefined })));
  } catch (error) {
    logger.error('[getSeasons] Error reading seasons from storage:', error);
    return Promise.resolve([]); // Resolve with empty array on error
  }
};

/**
 * Saves an array of seasons to storage, overwriting any existing seasons.
 * @param seasons - The array of Season objects to save.
 * @returns A promise that resolves to true if successful, false otherwise.
 */
export const saveSeasons = async (seasons: Season[]): Promise<boolean> => {
  return withKeyLock(SEASONS_LIST_KEY, async () => {
    try {
      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(seasons));
      return Promise.resolve(true);
    } catch (error) {
      logger.error('[saveSeasons] Error saving seasons to storage:', error);
      return Promise.resolve(false);
    }
  });
};

/**
 * Adds a new season to the list of seasons in storage.
 * @param newSeasonName - The name of the new season.
 * @param extra - Optional additional fields for the season.
 * @returns A promise that resolves to the newly created Season object, or null if validation/save fails.
 */
export const addSeason = async (newSeasonName: string, extra: Partial<Season> = {}): Promise<Season | null> => {
  const trimmedName = newSeasonName.trim();
  if (!trimmedName) {
    logger.error('[addSeason] Validation failed: Season name cannot be empty.');
    return Promise.resolve(null);
  }

  return withKeyLock(SEASONS_LIST_KEY, async () => {
    try {
      const currentSeasons = await getSeasons();
      if (currentSeasons.some(s => s.name.toLowerCase() === trimmedName.toLowerCase())) {
        logger.error(`[addSeason] Validation failed: A season with name "${trimmedName}" already exists.`);
        return Promise.resolve(null);
      }
      const newSeason: Season = {
        id: `season_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: trimmedName,
        ...extra,
      };
      const updatedSeasons = [...currentSeasons, newSeason];
      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(updatedSeasons));
      return Promise.resolve(newSeason);
    } catch (error) {
      logger.error('[addSeason] Unexpected error adding season:', error);
      return Promise.resolve(null);
    }
  });
};

/**
 * Updates an existing season in storage.
 * @param updatedSeason - The Season object with updated details.
 * @returns A promise that resolves to the updated Season object, or null if not found or save fails.
 */
export const updateSeason = async (updatedSeasonData: Season): Promise<Season | null> => {
  if (!updatedSeasonData || !updatedSeasonData.id || !updatedSeasonData.name?.trim()) {
    logger.error('[updateSeason] Invalid season data provided for update.');
    return Promise.resolve(null);
  }
  const trimmedName = updatedSeasonData.name.trim();

  return withKeyLock(SEASONS_LIST_KEY, async () => {
    try {
      const currentSeasons = await getSeasons();
      const seasonIndex = currentSeasons.findIndex(s => s.id === updatedSeasonData.id);

      if (seasonIndex === -1) {
        logger.error(`[updateSeason] Season with ID ${updatedSeasonData.id} not found.`);
        return Promise.resolve(null);
      }

      if (currentSeasons.some(s => s.id !== updatedSeasonData.id && s.name.toLowerCase() === trimmedName.toLowerCase())) {
        logger.error(`[updateSeason] Validation failed: Another season with name "${trimmedName}" already exists.`);
        return Promise.resolve(null);
      }

      const seasonsToUpdate = [...currentSeasons];
      seasonsToUpdate[seasonIndex] = { ...updatedSeasonData, name: trimmedName };

      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(seasonsToUpdate));
      return Promise.resolve(seasonsToUpdate[seasonIndex]);
    } catch (error) {
      logger.error('[updateSeason] Unexpected error updating season:', error);
      return Promise.resolve(null);
    }
  });
};

/**
 * Deletes a season from storage by its ID.
 * @param seasonId - The ID of the season to delete.
 * @returns A promise that resolves to true if successful, false if not found or error occurs.
 */
export const deleteSeason = async (seasonId: string): Promise<boolean> => {
  if (!seasonId) {
     logger.error('[deleteSeason] Invalid season ID provided.');
     return Promise.resolve(false);
  }

  return withKeyLock(SEASONS_LIST_KEY, async () => {
    try {
      const currentSeasons = await getSeasons();
      const updatedSeasons = currentSeasons.filter(s => s.id !== seasonId);

      if (updatedSeasons.length === currentSeasons.length) {
        logger.error(`[deleteSeason] Season with id ${seasonId} not found.`);
        return Promise.resolve(false);
      }

      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(updatedSeasons));
      return Promise.resolve(true);
    } catch (error) {
      logger.error('[deleteSeason] Unexpected error deleting season:', error);
      return Promise.resolve(false);
    }
  });
};

/**
 * Count games associated with a season (for deletion impact analysis).
 * @param seasonId - The ID of the season to count games for.
 * @returns A promise that resolves to the number of games associated with this season.
 */
export const countGamesForSeason = async (seasonId: string): Promise<number> => {
  try {
    const savedGamesJson = await getStorageItem(SAVED_GAMES_KEY);
    if (!savedGamesJson) return 0;

    const savedGames = JSON.parse(savedGamesJson);
    let count = 0;

    for (const gameState of Object.values(savedGames)) {
      if ((gameState as AppState).seasonId === seasonId) {
        count++;
      }
    }

    return count;
  } catch (error) {
    logger.warn('Failed to count games for season, returning 0', { seasonId, error });
    return 0;
  }
}; 