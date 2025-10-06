import { TOURNAMENTS_LIST_KEY } from '@/config/storageKeys';
import type { Tournament } from '@/types'; // Import Tournament type from shared types
import logger from '@/utils/logger';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { withKeyLock } from './storageKeyLock';

// Define the Tournament type (consider moving to a shared types file)
// export interface Tournament { // Remove local definition
//   id: string;
//   name: string;
//   // Add any other relevant tournament properties, e.g., date, location
// }

/**
 * Retrieves all tournaments from storage.
 * @returns A promise that resolves to an array of Tournament objects.
 */
export const getTournaments = async (): Promise<Tournament[]> => {
  try {
    const tournamentsJson = await getStorageItem(TOURNAMENTS_LIST_KEY);
    if (!tournamentsJson) {
      return Promise.resolve([]);
    }
    const tournaments = JSON.parse(tournamentsJson) as Tournament[];
    return Promise.resolve(
      tournaments.map(t => ({
        ...t,
        level: t.level ?? undefined,
        ageGroup: t.ageGroup ?? undefined,
      }))
    );
  } catch (error) {
    logger.error('[getTournaments] Error getting tournaments from storage:', error);
    return Promise.resolve([]);
  }
};

/**
 * Saves an array of tournaments to storage, overwriting any existing tournaments.
 * @param tournaments - The array of Tournament objects to save.
 * @returns A promise that resolves to true if successful, false otherwise.
 */
export const saveTournaments = async (tournaments: Tournament[]): Promise<boolean> => {
  return withKeyLock(TOURNAMENTS_LIST_KEY, async () => {
    try {
      await setStorageItem(TOURNAMENTS_LIST_KEY, JSON.stringify(tournaments));
      return Promise.resolve(true);
    } catch (error) {
      logger.error('[saveTournaments] Error saving tournaments to storage:', error);
      return Promise.resolve(false);
    }
  });
};

/**
 * Adds a new tournament to the list of tournaments in storage.
 * @param newTournamentName - The name of the new tournament.
 * @param extra - Optional additional fields for the tournament.
 * @returns A promise that resolves to the newly created Tournament object, or null if validation/save fails.
 */
export const addTournament = async (newTournamentName: string, extra: Partial<Tournament> = {}): Promise<Tournament | null> => {
  const trimmedName = newTournamentName.trim();
  if (!trimmedName) {
    logger.error('[addTournament] Validation failed: Tournament name cannot be empty.');
    return Promise.resolve(null);
  }

  return withKeyLock(TOURNAMENTS_LIST_KEY, async () => {
    try {
      const currentTournaments = await getTournaments();
      if (currentTournaments.some(t => t.name.toLowerCase() === trimmedName.toLowerCase())) {
        logger.error(`[addTournament] Validation failed: A tournament with name "${trimmedName}" already exists.`);
        return Promise.resolve(null);
      }
      const { level, ageGroup, ...rest } = extra;
      const newTournament: Tournament = {
        id: `tournament_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: trimmedName,
        ...rest,
        ...(level ? { level } : {}),
        ...(ageGroup ? { ageGroup } : {}),
      };
      const updatedTournaments = [...currentTournaments, newTournament];
      await setStorageItem(TOURNAMENTS_LIST_KEY, JSON.stringify(updatedTournaments));
      return Promise.resolve(newTournament);
    } catch (error) {
      logger.error('[addTournament] Unexpected error adding tournament:', error);
      return Promise.resolve(null);
    }
  });
};

/**
 * Updates an existing tournament in storage.
 * @param updatedTournamentData - The Tournament object with updated details.
 * @returns A promise that resolves to the updated Tournament object, or null if not found or save fails.
 */
export const updateTournament = async (updatedTournamentData: Tournament): Promise<Tournament | null> => {
  if (!updatedTournamentData || !updatedTournamentData.id || !updatedTournamentData.name?.trim()) {
    logger.error('[updateTournament] Invalid tournament data provided for update.');
    return Promise.resolve(null);
  }
  const trimmedName = updatedTournamentData.name.trim();

  return withKeyLock(TOURNAMENTS_LIST_KEY, async () => {
    try {
      const currentTournaments = await getTournaments();
      const tournamentIndex = currentTournaments.findIndex(t => t.id === updatedTournamentData.id);

      if (tournamentIndex === -1) {
        logger.error(`[updateTournament] Tournament with ID ${updatedTournamentData.id} not found.`);
        return Promise.resolve(null);
      }

      if (currentTournaments.some(t => t.id !== updatedTournamentData.id && t.name.toLowerCase() === trimmedName.toLowerCase())) {
        logger.error(`[updateTournament] Validation failed: Another tournament with name "${trimmedName}" already exists.`);
        return Promise.resolve(null);
      }

      const tournamentsToUpdate = [...currentTournaments];
      tournamentsToUpdate[tournamentIndex] = {
        ...currentTournaments[tournamentIndex],
        ...updatedTournamentData,
        name: trimmedName,
      };

      await setStorageItem(TOURNAMENTS_LIST_KEY, JSON.stringify(tournamentsToUpdate));
      return Promise.resolve(tournamentsToUpdate[tournamentIndex]);
    } catch (error) {
      logger.error('[updateTournament] Unexpected error updating tournament:', error);
      return Promise.resolve(null);
    }
  });
};

/**
 * Deletes a tournament from storage by its ID.
 * @param tournamentId - The ID of the tournament to delete.
 * @returns A promise that resolves to true if successful, false if not found or error occurs.
 */
export const deleteTournament = async (tournamentId: string): Promise<boolean> => {
  if (!tournamentId) {
    logger.error('[deleteTournament] Invalid tournament ID provided.');
    return Promise.resolve(false);
  }

  return withKeyLock(TOURNAMENTS_LIST_KEY, async () => {
    try {
      const currentTournaments = await getTournaments();
      const updatedTournaments = currentTournaments.filter(t => t.id !== tournamentId);

      if (updatedTournaments.length === currentTournaments.length) {
        logger.error(`[deleteTournament] Tournament with id ${tournamentId} not found.`);
        return Promise.resolve(false);
      }

      await setStorageItem(TOURNAMENTS_LIST_KEY, JSON.stringify(updatedTournaments));
      return Promise.resolve(true);
    } catch (error) {
      logger.error('[deleteTournament] Unexpected error deleting tournament:', error);
      return Promise.resolve(false);
    }
  });
}; 