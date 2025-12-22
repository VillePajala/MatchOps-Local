import { SEASONS_LIST_KEY } from '@/config/storageKeys';
import type { Season } from '@/types';
import logger from '@/utils/logger';
import { setStorageItem } from '@/utils/storage';
import { withKeyLock } from './storageKeyLock';
import { getDataStore } from '@/datastore';

// Note: SEASONS_LIST_KEY, setStorageItem, and withKeyLock are still needed
// for the deprecated saveSeasons() function (used by tests).

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
 * Retrieves all seasons from IndexedDB.
 * DataStore handles initialization and storage access.
 * @returns A promise that resolves to an array of Season objects.
 */
export const getSeasons = async (): Promise<Season[]> => {
  try {
    const dataStore = await getDataStore();
    return await dataStore.getSeasons();
  } catch (error) {
    logger.error('[getSeasons] Error getting seasons:', error);
    return [];
  }
};

/**
 * Saves an array of seasons to storage, overwriting any existing seasons.
 *
 * @deprecated This function bypasses DataStore and should not be used for new code.
 * Use individual season operations (addSeason, updateSeason, deleteSeason)
 * which route through DataStore for proper abstraction.
 *
 * @internal Kept for test setup only (mocking storage directly).
 *
 * @param seasons - The array of Season objects to save.
 * @returns A promise that resolves to true if successful, false otherwise.
 */
export const saveSeasons = async (seasons: Season[]): Promise<boolean> => {
  return withKeyLock(SEASONS_LIST_KEY, async () => {
    try {
      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(seasons));
      return true;
    } catch (error) {
      logger.error('[saveSeasons] Error saving seasons to storage:', error);
      return false;
    }
  });
};

/**
 * Adds a new season to the list of seasons in storage.
 * DataStore handles ID generation, validation, and storage.
 *
 * Error handling: Returns null on failure (graceful degradation for local-first UX).
 * Errors are logged with context for debugging. Callers should handle null returns
 * gracefully rather than expecting exceptions.
 *
 * @param newSeasonName - The name of the new season.
 * @param extra - Optional additional fields for the season (excludes id and name).
 * @returns A promise that resolves to the newly created Season object, or null if validation/save fails.
 */
export const addSeason = async (newSeasonName: string, extra: Partial<Omit<Season, 'id' | 'name'>> = {}): Promise<Season | null> => {
  const trimmedName = newSeasonName?.trim();
  if (!trimmedName) {
    logger.warn('[addSeason] Validation failed: Season name cannot be empty.');
    return null;
  }

  try {
    const dataStore = await getDataStore();
    const newSeason = await dataStore.createSeason(trimmedName, extra);
    return newSeason;
  } catch (error) {
    if (isExpectedDataStoreError(error)) {
      logger.warn('[addSeason] Operation failed:', { error });
      return null;
    }
    logger.error('[addSeason] Unexpected error adding season:', { seasonName: trimmedName, error });
    return null;
  }
};

/**
 * Updates an existing season in storage.
 * DataStore handles validation and storage.
 *
 * @param updatedSeasonData - The Season object with updated details.
 * @returns A promise that resolves to the updated Season object, or null if not found or save fails.
 */
export const updateSeason = async (updatedSeasonData: Season): Promise<Season | null> => {
  if (!updatedSeasonData || !updatedSeasonData.id || !updatedSeasonData.name?.trim()) {
    logger.error('[updateSeason] Invalid season data provided for update.');
    return null;
  }

  try {
    const dataStore = await getDataStore();
    const updatedSeason = await dataStore.updateSeason(updatedSeasonData);

    if (!updatedSeason) {
      logger.error(`[updateSeason] Season with ID ${updatedSeasonData.id} not found.`);
      return null;
    }

    return updatedSeason;
  } catch (error) {
    if (isExpectedDataStoreError(error)) {
      logger.warn('[updateSeason] Operation failed:', { error });
      return null;
    }
    logger.error('[updateSeason] Unexpected error updating season:', {
      seasonId: updatedSeasonData.id,
      error
    });
    return null;
  }
};

/**
 * Deletes a season from storage by its ID.
 * DataStore handles storage and atomicity.
 *
 * @param seasonId - The ID of the season to delete.
 * @returns A promise that resolves to true if successful, false if not found or error occurs.
 */
export const deleteSeason = async (seasonId: string): Promise<boolean> => {
  if (!seasonId) {
    logger.error('[deleteSeason] Invalid season ID provided.');
    return false;
  }

  try {
    const dataStore = await getDataStore();
    const deleted = await dataStore.deleteSeason(seasonId);

    if (!deleted) {
      logger.error(`[deleteSeason] Season with id ${seasonId} not found.`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('[deleteSeason] Unexpected error deleting season:', {
      seasonId,
      error
    });
    return false;
  }
};

/**
 * Count games associated with a season (for deletion impact analysis).
 * DataStore handles loading saved games.
 *
 * @param seasonId - The ID of the season to count games for.
 * @returns A promise that resolves to the number of games associated with this season.
 */
export const countGamesForSeason = async (seasonId: string): Promise<number> => {
  try {
    const dataStore = await getDataStore();
    const savedGames = await dataStore.getGames();

    let count = 0;
    for (const gameState of Object.values(savedGames)) {
      // Defensive check: ensure gameState has seasonId property
      if (gameState && typeof gameState === 'object' && 'seasonId' in gameState) {
        if (gameState.seasonId === seasonId) {
          count++;
        }
      }
    }

    return count;
  } catch (error) {
    logger.warn('[countGamesForSeason] Failed to count games for season, returning 0', { seasonId, error });
    return 0;
  }
};

/**
 * Updates a team's placement in a season.
 * DataStore handles individual season updates; this function coordinates the placement logic.
 *
 * PERFORMANCE NOTE: Loads all seasons to find target (no getSeasonById in DataStore interface).
 * This is a deliberate design decision - per CLAUDE.md the expected scale is ~10 seasons,
 * so filtering client-side is acceptable. Optimize only if profiling shows need.
 *
 * @param seasonId - The ID of the season.
 * @param teamId - The ID of the team.
 * @param placement - The team's placement (1 = 1st place, 2 = 2nd place, etc.). Pass null to remove placement.
 * @param award - Optional award label (e.g., "Champion", "Runner-up").
 * @param note - Optional coach note.
 * @returns A promise that resolves to true if successful, false otherwise.
 */
export const updateTeamPlacement = async (
  seasonId: string,
  teamId: string,
  placement: number | null,
  award?: string,
  note?: string
): Promise<boolean> => {
  if (!seasonId || !teamId) {
    logger.error('[updateTeamPlacement] Invalid season ID or team ID provided.');
    return false;
  }

  try {
    const dataStore = await getDataStore();
    const seasons = await dataStore.getSeasons();
    const season = seasons.find(s => s.id === seasonId);

    if (!season) {
      logger.error(`[updateTeamPlacement] Season with ID ${seasonId} not found.`);
      return false;
    }

    // Clone the season for modification
    const updatedSeason = { ...season };

    if (placement === null) {
      // Remove the team's placement
      if (updatedSeason.teamPlacements) {
        delete updatedSeason.teamPlacements[teamId];
        // Clean up empty object
        if (Object.keys(updatedSeason.teamPlacements).length === 0) {
          delete updatedSeason.teamPlacements;
        }
      }
    } else {
      // Set or update the team's placement
      updatedSeason.teamPlacements = {
        ...updatedSeason.teamPlacements,
        [teamId]: {
          placement,
          ...(award && { award }),
          ...(note && { note }),
        },
      };
    }

    const result = await dataStore.updateSeason(updatedSeason);
    return result !== null;
  } catch (error) {
    logger.error('[updateTeamPlacement] Unexpected error updating team placement:', {
      seasonId,
      teamId,
      error
    });
    return false;
  }
};

/**
 * Gets a team's placement in a season.
 * DataStore handles loading seasons.
 *
 * PERFORMANCE NOTE: Loads all seasons to find target (no getSeasonById in DataStore interface).
 * This is a deliberate design decision - per CLAUDE.md the expected scale is ~10 seasons,
 * so filtering client-side is acceptable. Optimize only if profiling shows need.
 *
 * @param seasonId - The ID of the season.
 * @param teamId - The ID of the team.
 * @returns A promise that resolves to the team's placement data, or null if not found.
 */
export const getTeamPlacement = async (
  seasonId: string,
  teamId: string
): Promise<{ placement: number; award?: string; note?: string } | null> => {
  try {
    const dataStore = await getDataStore();
    const seasons = await dataStore.getSeasons();
    const season = seasons.find(s => s.id === seasonId);

    if (!season || !season.teamPlacements || !season.teamPlacements[teamId]) {
      return null;
    }

    return season.teamPlacements[teamId];
  } catch (error) {
    logger.error('[getTeamPlacement] Error getting team placement:', { seasonId, teamId, error });
    return null;
  }
};
