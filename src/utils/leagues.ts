import { SEASONS_LIST_KEY, SAVED_GAMES_KEY } from '@/config/storageKeys';
import type { League } from '@/types'; // Import League type
import type { AppState } from '@/types/game';
import logger from '@/utils/logger';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { withKeyLock } from './storageKeyLock';

/**
 * Retrieves all leagues from storage.
 * @returns A promise that resolves to an array of League objects.
 */
export const getLeagues = async (): Promise<League[]> => {
  try {
    const leaguesJson = await getStorageItem(SEASONS_LIST_KEY);
    if (!leaguesJson) {
      return Promise.resolve([]);
    }
    const leagues = JSON.parse(leaguesJson) as League[];
    return Promise.resolve(leagues.map(l => ({ ...l, ageGroup: l.ageGroup ?? undefined })));
  } catch (error) {
    logger.error('[getLeagues] Error reading leagues from storage:', error);
    return Promise.resolve([]); // Resolve with empty array on error
  }
};

/**
 * Saves an array of leagues to storage, overwriting any existing leagues.
 * @param leagues - The array of League objects to save.
 * @returns A promise that resolves to true if successful, false otherwise.
 */
export const saveLeagues = async (leagues: League[]): Promise<boolean> => {
  return withKeyLock(SEASONS_LIST_KEY, async () => {
    try {
      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(leagues));
      return Promise.resolve(true);
    } catch (error) {
      logger.error('[saveLeagues] Error saving leagues to storage:', error);
      return Promise.resolve(false);
    }
  });
};

/**
 * Adds a new league to the list of leagues in storage.
 * @param newLeagueName - The name of the new league.
 * @param extra - Optional additional fields for the league.
 * @returns A promise that resolves to the newly created League object, or null if validation/save fails.
 */
export const addLeague = async (newLeagueName: string, extra: Partial<League> = {}): Promise<League | null> => {
  const trimmedName = newLeagueName.trim();
  if (!trimmedName) {
    logger.error('[addLeague] Validation failed: League name cannot be empty.');
    return Promise.resolve(null);
  }

  return withKeyLock(SEASONS_LIST_KEY, async () => {
    try {
      const currentLeagues = await getLeagues();
      if (currentLeagues.some(l => l.name.toLowerCase() === trimmedName.toLowerCase())) {
        logger.error(`[addLeague] Validation failed: A league with name "${trimmedName}" already exists.`);
        return Promise.resolve(null);
      }
      const newLeague: League = {
        id: `season_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: trimmedName,
        ...extra,
      };
      const updatedLeagues = [...currentLeagues, newLeague];
      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(updatedLeagues));
      return Promise.resolve(newLeague);
    } catch (error) {
      logger.error('[addLeague] Unexpected error adding league:', error);
      return Promise.resolve(null);
    }
  });
};

/**
 * Updates an existing league in storage.
 * @param updatedLeague - The League object with updated details.
 * @returns A promise that resolves to the updated League object, or null if not found or save fails.
 */
export const updateLeague = async (updatedLeagueData: League): Promise<League | null> => {
  if (!updatedLeagueData || !updatedLeagueData.id || !updatedLeagueData.name?.trim()) {
    logger.error('[updateLeague] Invalid league data provided for update.');
    return Promise.resolve(null);
  }
  const trimmedName = updatedLeagueData.name.trim();

  return withKeyLock(SEASONS_LIST_KEY, async () => {
    try {
      const currentLeagues = await getLeagues();
      const leagueIndex = currentLeagues.findIndex(l => l.id === updatedLeagueData.id);

      if (leagueIndex === -1) {
        logger.error(`[updateLeague] League with ID ${updatedLeagueData.id} not found.`);
        return Promise.resolve(null);
      }

      if (currentLeagues.some(l => l.id !== updatedLeagueData.id && l.name.toLowerCase() === trimmedName.toLowerCase())) {
        logger.error(`[updateLeague] Validation failed: Another league with name "${trimmedName}" already exists.`);
        return Promise.resolve(null);
      }

      const leaguesToUpdate = [...currentLeagues];
      leaguesToUpdate[leagueIndex] = { ...updatedLeagueData, name: trimmedName };

      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(leaguesToUpdate));
      return Promise.resolve(leaguesToUpdate[leagueIndex]);
    } catch (error) {
      logger.error('[updateLeague] Unexpected error updating league:', error);
      return Promise.resolve(null);
    }
  });
};

/**
 * Deletes a league from storage by its ID.
 * @param leagueId - The ID of the league to delete.
 * @returns A promise that resolves to true if successful, false if not found or error occurs.
 */
export const deleteLeague = async (leagueId: string): Promise<boolean> => {
  if (!leagueId) {
     logger.error('[deleteLeague] Invalid league ID provided.');
     return Promise.resolve(false);
  }

  return withKeyLock(SEASONS_LIST_KEY, async () => {
    try {
      const currentLeagues = await getLeagues();
      const updatedLeagues = currentLeagues.filter(l => l.id !== leagueId);

      if (updatedLeagues.length === currentLeagues.length) {
        logger.error(`[deleteLeague] League with id ${leagueId} not found.`);
        return Promise.resolve(false);
      }

      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(updatedLeagues));
      return Promise.resolve(true);
    } catch (error) {
      logger.error('[deleteLeague] Unexpected error deleting league:', error);
      return Promise.resolve(false);
    }
  });
};

/**
 * Count games associated with a league (for deletion impact analysis).
 * @param leagueId - The ID of the league to count games for.
 * @returns A promise that resolves to the number of games associated with this league.
 */
export const countGamesForLeague = async (leagueId: string): Promise<number> => {
  try {
    const savedGamesJson = await getStorageItem(SAVED_GAMES_KEY);
    if (!savedGamesJson) return 0;

    const savedGames = JSON.parse(savedGamesJson);
    let count = 0;

    for (const gameState of Object.values(savedGames)) {
      if ((gameState as AppState).seasonId === leagueId) {
        count++;
      }
    }

    return count;
  } catch (error) {
    logger.warn('Failed to count games for league, returning 0', { leagueId, error });
    return 0;
  }
};
