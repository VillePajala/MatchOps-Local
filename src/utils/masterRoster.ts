import { MASTER_ROSTER_KEY } from '@/config/storageKeys';
import type { Player } from '@/types';
import logger from '@/utils/logger';
import { setStorageItem } from '@/utils/storage';
import { withKeyLock } from './storageKeyLock';
import { getDataStore } from '@/datastore';

// Note: MASTER_ROSTER_KEY, setStorageItem, and withKeyLock are still needed
// for the deprecated saveMasterRoster() function (used by tests).

/**
 * Retrieves the master roster of players from IndexedDB.
 * DataStore handles initialization and storage access.
 * @returns An array of Player objects.
 */
export const getMasterRoster = async (): Promise<Player[]> => {
  try {
    const dataStore = await getDataStore();
    return await dataStore.getPlayers();
  } catch (error) {
    logger.error('[getMasterRoster] Error getting master roster:', error);
    return [];
  }
};

/**
 * Saves the master roster to IndexedDB, overwriting any existing roster.
 *
 * @deprecated This function bypasses DataStore and should not be used for new code.
 * Use individual player operations (addPlayerToRoster, updatePlayerInRoster, etc.)
 * which route through DataStore for proper abstraction.
 *
 * @internal Kept for test setup only (mocking storage directly).
 *
 * @param players - The array of Player objects to save.
 * @returns {boolean} True if successful, false otherwise.
 */
export const saveMasterRoster = async (players: Player[]): Promise<boolean> => {
  return withKeyLock(MASTER_ROSTER_KEY, async () => {
    try {
      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(players));
      return true;
    } catch (error) {
      logger.error('[saveMasterRoster] Error saving master roster to IndexedDB:', error);
      return false;
    }
  });
};

/**
 * Adds a new player to the master roster.
 * DataStore handles ID generation, validation, and storage.
 *
 * Error handling: Returns null on failure (graceful degradation for local-first UX).
 * Errors are logged with context for debugging. Callers should handle null returns
 * gracefully rather than expecting exceptions.
 *
 * @param playerData - The player data to add. Must contain at least a name.
 * @returns The new Player object with generated ID, or null if operation failed.
 */
export const addPlayerToRoster = async (playerData: {
  name: string;
  nickname?: string;
  jerseyNumber?: string;
  notes?: string;
}): Promise<Player | null> => {
  const trimmedName = playerData.name?.trim();
  if (!trimmedName) {
    logger.warn('[addPlayerToRoster] Validation Failed: Player name cannot be empty.');
    return null;
  }

  try {
    const dataStore = await getDataStore();
    const newPlayer = await dataStore.createPlayer({
      name: trimmedName,
      nickname: playerData.nickname,
      jerseyNumber: playerData.jerseyNumber,
      notes: playerData.notes,
      isGoalie: false,
      receivedFairPlayCard: false,
    });
    return newPlayer;
  } catch (error) {
    logger.error('[addPlayerToRoster] Unexpected error adding player:', {
      playerName: trimmedName,
      error
    });
    return null;
  }
};

/**
 * Updates an existing player in the master roster.
 * DataStore handles validation and storage.
 * @param playerId - The ID of the player to update.
 * @param updateData - The player data to update.
 * @returns The updated Player object, or null if player not found or operation failed.
 */
export const updatePlayerInRoster = async (
  playerId: string,
  updateData: Partial<Omit<Player, 'id'>>
): Promise<Player | null> => {
  if (!playerId) {
    logger.error('[updatePlayerInRoster] Validation Failed: Player ID cannot be empty.');
    return null;
  }

  // Validate and trim name if being updated
  if (updateData.name !== undefined) {
    const trimmedName = updateData.name.trim();
    if (!trimmedName) {
      logger.error('[updatePlayerInRoster] Validation Failed: Player name cannot be empty.');
      return null;
    }
    updateData = { ...updateData, name: trimmedName };
  }

  try {
    const dataStore = await getDataStore();
    const updatedPlayer = await dataStore.updatePlayer(playerId, updateData);

    if (!updatedPlayer) {
      logger.error(`[updatePlayerInRoster] Player with ID ${playerId} not found.`);
      return null;
    }

    return updatedPlayer;
  } catch (error) {
    logger.error('[updatePlayerInRoster] Unexpected error updating player:', {
      playerId,
      updateFields: Object.keys(updateData),
      error
    });
    return null;
  }
};

/**
 * Removes a player from the master roster.
 * DataStore handles storage and atomicity.
 * @param playerId - The ID of the player to remove.
 * @returns True if player was successfully removed, false otherwise.
 */
export const removePlayerFromRoster = async (playerId: string): Promise<boolean> => {
  if (!playerId) {
    logger.error('[removePlayerFromRoster] Validation Failed: Player ID cannot be empty.');
    return false;
  }

  try {
    const dataStore = await getDataStore();
    const deleted = await dataStore.deletePlayer(playerId);

    if (!deleted) {
      logger.error(`[removePlayerFromRoster] Player with ID ${playerId} not found.`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('[removePlayerFromRoster] Unexpected error removing player:', {
      playerId,
      error
    });
    return false;
  }
};

/**
 * Sets the goalie status for a player in the master roster.
 * Only one player can be goalie at a time - setting a new goalie clears others.
 * DataStore handles individual player updates; this function coordinates the exclusive logic.
 *
 * DESIGN NOTE (Partial Atomicity):
 * The goalie clearing loop tracks success/failure of each update. If any clear fails,
 * the operation aborts before setting the new goalie, preventing multiple goalies.
 * True rollback (reverting successful clears) is not implemented - for a local-first
 * PWA with 50-100 players, the added complexity isn't justified.
 *
 * PERFORMANCE NOTE: Multiple storage operations (getPlayers + N updatePlayer calls).
 * Acceptable for roster size of 50-100 players. Optimize only if profiling shows need.
 *
 * @param playerId - The ID of the player to update.
 * @param isGoalie - Whether the player should be marked as a goalie.
 * @returns The updated Player object, or null if player not found or operation failed.
 */
export const setPlayerGoalieStatus = async (
  playerId: string,
  isGoalie: boolean
): Promise<Player | null> => {
  if (!playerId) {
    logger.error('[setPlayerGoalieStatus] Validation Failed: Player ID cannot be empty.');
    return null;
  }

  try {
    const dataStore = await getDataStore();
    const currentRoster = await dataStore.getPlayers();

    // Check if target player exists
    const targetPlayer = currentRoster.find(p => p.id === playerId);
    if (!targetPlayer) {
      logger.error(`[setPlayerGoalieStatus] Player with ID ${playerId} not found.`);
      return null;
    }

    // If setting as goalie, first clear goalie status from all other players
    if (isGoalie) {
      const otherGoalies = currentRoster.filter(p => p.id !== playerId && p.isGoalie);
      const clearResults: Array<{ id: string; success: boolean }> = [];

      for (const goalie of otherGoalies) {
        const result = await dataStore.updatePlayer(goalie.id, { isGoalie: false });
        clearResults.push({ id: goalie.id, success: result !== null });
      }

      // Check if all clears succeeded before setting new goalie
      const failedClears = clearResults.filter(r => !r.success);
      if (failedClears.length > 0) {
        logger.error('[setPlayerGoalieStatus] Failed to clear existing goalies:', {
          failedPlayerIds: failedClears.map(r => r.id),
          playerId,
        });
        return null;
      }
    }

    // Update the target player's goalie status
    const updatedPlayer = await dataStore.updatePlayer(playerId, { isGoalie });
    return updatedPlayer;
  } catch (error) {
    logger.error('[setPlayerGoalieStatus] Unexpected error:', {
      playerId,
      isGoalie,
      error
    });
    return null;
  }
};

/**
 * Sets the fair play card status for a player in the master roster.
 * Delegates to updatePlayerInRoster which routes through DataStore.
 * @param playerId - The ID of the player to update.
 * @param receivedFairPlayCard - Whether the player should be marked as having received the fair play card.
 * @returns The updated Player object, or null if player not found or operation failed.
 */
export const setPlayerFairPlayCardStatus = async (
  playerId: string,
  receivedFairPlayCard: boolean
): Promise<Player | null> => {
  return updatePlayerInRoster(playerId, { receivedFairPlayCard });
}; 