import { TOURNAMENTS_LIST_KEY } from '@/config/storageKeys';
import type { Tournament } from '@/types';
import logger from '@/utils/logger';
import { setStorageItem } from '@/utils/storage';
import { withKeyLock } from './storageKeyLock';
import { getDataStore } from '@/datastore';

// Note: TOURNAMENTS_LIST_KEY, setStorageItem, and withKeyLock are still needed
// for the deprecated saveTournaments() function (used by tests).

/**
 * Type guard to check if an error is an expected DataStore error (validation or duplicate).
 * Uses code property checking instead of instanceof to avoid module boundary issues.
 * @see src/interfaces/DataStoreErrors.ts for error class definitions
 */
const isExpectedDataStoreError = (error: unknown): boolean =>
  error !== null &&
  typeof error === 'object' &&
  'code' in error &&
  (error.code === 'VALIDATION_ERROR' || error.code === 'ALREADY_EXISTS');

/**
 * Retrieves all tournaments from IndexedDB.
 * DataStore handles initialization, storage access, and legacy level-to-series migration.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns A promise that resolves to an array of Tournament objects.
 */
export const getTournaments = async (userId?: string): Promise<Tournament[]> => {
  try {
    const dataStore = await getDataStore(userId);
    return await dataStore.getTournaments();
  } catch (error) {
    logger.error('[getTournaments] Error getting tournaments:', error);
    return [];
  }
};

/**
 * Saves an array of tournaments to storage, overwriting any existing tournaments.
 *
 * @deprecated This function bypasses DataStore and should not be used for new code.
 * Use individual tournament operations (addTournament, updateTournament, deleteTournament)
 * which route through DataStore for proper abstraction.
 *
 * @internal Kept for test setup only (mocking storage directly).
 *
 * @param tournaments - The array of Tournament objects to save.
 * @returns A promise that resolves to true if successful, false otherwise.
 */
export const saveTournaments = async (tournaments: Tournament[]): Promise<boolean> => {
  return withKeyLock(TOURNAMENTS_LIST_KEY, async () => {
    try {
      await setStorageItem(TOURNAMENTS_LIST_KEY, JSON.stringify(tournaments));
      return true;
    } catch (error) {
      logger.error('[saveTournaments] Error saving tournaments to storage:', error);
      return false;
    }
  });
};

/**
 * Adds a new tournament to the list of tournaments in storage.
 * DataStore handles ID generation, validation, and storage.
 *
 * Error handling: Returns null on failure (graceful degradation for local-first UX).
 * Errors are logged with context for debugging. Callers should handle null returns
 * gracefully rather than expecting exceptions.
 *
 * @param newTournamentName - The name of the new tournament.
 * @param extra - Optional additional fields for the tournament (excludes id and name).
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns A promise that resolves to the newly created Tournament object, or null if validation/save fails.
 */
export const addTournament = async (newTournamentName: string, extra: Partial<Omit<Tournament, 'id' | 'name'>> = {}, userId?: string): Promise<Tournament | null> => {
  const trimmedName = newTournamentName?.trim();
  if (!trimmedName) {
    logger.warn('[addTournament] Validation failed: Tournament name cannot be empty.');
    return null;
  }

  try {
    const dataStore = await getDataStore(userId);
    const newTournament = await dataStore.createTournament(trimmedName, extra);
    return newTournament;
  } catch (error) {
    if (isExpectedDataStoreError(error)) {
      logger.warn('[addTournament] Operation failed:', { error });
      return null;
    }
    logger.error('[addTournament] Unexpected error adding tournament:', { tournamentName: trimmedName, error });
    return null;
  }
};

/**
 * Updates an existing tournament in storage.
 * DataStore handles validation and storage.
 *
 * @param updatedTournamentData - The Tournament object with updated details.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns A promise that resolves to the updated Tournament object, or null if not found or save fails.
 */
export const updateTournament = async (updatedTournamentData: Tournament, userId?: string): Promise<Tournament | null> => {
  if (!updatedTournamentData || !updatedTournamentData.id || !updatedTournamentData.name?.trim()) {
    logger.error('[updateTournament] Invalid tournament data provided for update.');
    return null;
  }

  try {
    const dataStore = await getDataStore(userId);
    const updatedTournament = await dataStore.updateTournament(updatedTournamentData);

    if (!updatedTournament) {
      logger.error(`[updateTournament] Tournament with ID ${updatedTournamentData.id} not found.`);
      return null;
    }

    return updatedTournament;
  } catch (error) {
    if (isExpectedDataStoreError(error)) {
      logger.warn('[updateTournament] Operation failed:', { error });
      return null;
    }
    logger.error('[updateTournament] Unexpected error updating tournament:', {
      tournamentId: updatedTournamentData.id,
      error
    });
    return null;
  }
};

/**
 * Deletes a tournament from storage by its ID.
 * DataStore handles storage and atomicity.
 *
 * @param tournamentId - The ID of the tournament to delete.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns A promise that resolves to true if successful, false if not found or error occurs.
 */
export const deleteTournament = async (tournamentId: string, userId?: string): Promise<boolean> => {
  if (!tournamentId) {
    logger.error('[deleteTournament] Invalid tournament ID provided.');
    return false;
  }

  try {
    const dataStore = await getDataStore(userId);
    const deleted = await dataStore.deleteTournament(tournamentId);

    if (!deleted) {
      logger.error(`[deleteTournament] Tournament with id ${tournamentId} not found.`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('[deleteTournament] Unexpected error deleting tournament:', {
      tournamentId,
      error
    });
    return false;
  }
};

/**
 * Count games associated with a tournament (for deletion impact analysis).
 * DataStore handles loading saved games.
 *
 * @param tournamentId - The ID of the tournament to count games for.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns A promise that resolves to the number of games associated with this tournament.
 */
export const countGamesForTournament = async (tournamentId: string, userId?: string): Promise<number> => {
  try {
    const dataStore = await getDataStore(userId);
    const savedGames = await dataStore.getGames();

    let count = 0;
    for (const gameState of Object.values(savedGames)) {
      // Defensive check: ensure gameState has tournamentId property
      if (gameState && typeof gameState === 'object' && 'tournamentId' in gameState) {
        if (gameState.tournamentId === tournamentId) {
          count++;
        }
      }
    }

    return count;
  } catch (error) {
    logger.warn('[countGamesForTournament] Failed to count games for tournament, returning 0', { tournamentId, error });
    return 0;
  }
};

/**
 * Updates a team's placement in a tournament.
 * DataStore handles individual tournament updates; this function coordinates the placement logic.
 *
 * PERFORMANCE NOTE: Loads all tournaments to find target (no getTournamentById in DataStore interface).
 * This is a deliberate design decision - per CLAUDE.md the expected scale is ~10 tournaments,
 * so filtering client-side is acceptable. Optimize only if profiling shows need.
 *
 * @param tournamentId - The ID of the tournament.
 * @param teamId - The ID of the team.
 * @param placement - The team's placement (1 = 1st place, 2 = 2nd place, etc.). Pass null to remove placement.
 * @param award - Optional award label (e.g., "Champion", "Runner-up").
 * @param note - Optional coach note.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns A promise that resolves to true if successful, false otherwise.
 */
export const updateTeamPlacement = async (
  tournamentId: string,
  teamId: string,
  placement: number | null,
  award?: string,
  note?: string,
  userId?: string
): Promise<boolean> => {
  if (!tournamentId || !teamId) {
    logger.error('[updateTeamPlacement] Invalid tournament ID or team ID provided.');
    return false;
  }

  try {
    const dataStore = await getDataStore(userId);
    const tournaments = await dataStore.getTournaments();
    const tournament = tournaments.find(t => t.id === tournamentId);

    if (!tournament) {
      logger.error(`[updateTeamPlacement] Tournament with ID ${tournamentId} not found.`);
      return false;
    }

    // Clone the tournament for modification
    const updatedTournament = { ...tournament };

    if (placement === null) {
      // Remove the team's placement
      if (updatedTournament.teamPlacements) {
        delete updatedTournament.teamPlacements[teamId];
        // Clean up empty object
        if (Object.keys(updatedTournament.teamPlacements).length === 0) {
          delete updatedTournament.teamPlacements;
        }
      }
    } else {
      // Set or update the team's placement
      updatedTournament.teamPlacements = {
        ...updatedTournament.teamPlacements,
        [teamId]: {
          placement,
          ...(award && { award }),
          ...(note && { note }),
        },
      };
    }

    const result = await dataStore.updateTournament(updatedTournament);
    return result !== null;
  } catch (error) {
    logger.error('[updateTeamPlacement] Unexpected error updating team placement:', {
      tournamentId,
      teamId,
      error
    });
    return false;
  }
};

/**
 * Gets a team's placement in a tournament.
 * DataStore handles loading tournaments.
 *
 * PERFORMANCE NOTE: Loads all tournaments to find target (no getTournamentById in DataStore interface).
 * This is a deliberate design decision - per CLAUDE.md the expected scale is ~10 tournaments,
 * so filtering client-side is acceptable. Optimize only if profiling shows need.
 *
 * @param tournamentId - The ID of the tournament.
 * @param teamId - The ID of the team.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns A promise that resolves to the team's placement data, or null if not found.
 */
export const getTeamPlacement = async (
  tournamentId: string,
  teamId: string,
  userId?: string
): Promise<{ placement: number; award?: string; note?: string } | null> => {
  try {
    const dataStore = await getDataStore(userId);
    const tournaments = await dataStore.getTournaments();
    const tournament = tournaments.find(t => t.id === tournamentId);

    if (!tournament || !tournament.teamPlacements || !tournament.teamPlacements[teamId]) {
      return null;
    }

    return tournament.teamPlacements[teamId];
  } catch (error) {
    logger.error('[getTeamPlacement] Error getting team placement:', { tournamentId, teamId, error });
    return null;
  }
};
