import { MASTER_ROSTER_KEY } from '@/config/storageKeys';
import type { Player } from '@/types';
import logger from '@/utils/logger';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { withKeyLock } from './storageKeyLock';

/**
 * Retrieves the master roster of players from IndexedDB.
 * @returns An array of Player objects.
 */
export const getMasterRoster = async (): Promise<Player[]> => {
  try {
    const rosterJson = await getStorageItem(MASTER_ROSTER_KEY);
    if (!rosterJson) {
      return Promise.resolve([]);
    }
    return Promise.resolve(JSON.parse(rosterJson) as Player[]);
  } catch (error) {
    logger.error('[getMasterRoster] Error getting master roster from IndexedDB:', error);
    return Promise.resolve([]); // Return empty array on error
  }
};

/**
 * Saves the master roster to IndexedDB, overwriting any existing roster.
 * @param players - The array of Player objects to save.
 * @returns {boolean} True if successful, false otherwise.
 */
export const saveMasterRoster = async (players: Player[]): Promise<boolean> => {
  return withKeyLock(MASTER_ROSTER_KEY, async () => {
    try {
      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(players));
      return Promise.resolve(true);
    } catch (error) {
      logger.error('[saveMasterRoster] Error saving master roster to IndexedDB:', error);
      // Handle potential errors, e.g., IndexedDB quota exceeded
      return Promise.resolve(false);
    }
  });
};

/**
 * Adds a new player to the master roster in IndexedDB.
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
    logger.error('[addPlayerToRoster] Validation Failed: Player name cannot be empty.');
    return Promise.resolve(null);
  }

  return withKeyLock(MASTER_ROSTER_KEY, async () => {
    try {
      const currentRoster = await getMasterRoster();

      // Create new player with unique ID
      const newPlayer: Player = {
        id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: trimmedName,
        nickname: playerData.nickname,
        jerseyNumber: playerData.jerseyNumber,
        notes: playerData.notes,
        isGoalie: false, // Default to not goalie
        receivedFairPlayCard: false, // Default to not having received fair play card
      };

      const updatedRoster = [...currentRoster, newPlayer];
      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(updatedRoster));
      return Promise.resolve(newPlayer);
    } catch (error) {
      logger.error('[addPlayerToRoster] Unexpected error adding player:', error);
      return Promise.resolve(null);
    }
  });
};

/**
 * Updates an existing player in the master roster.
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
    return Promise.resolve(null);
  }

  return withKeyLock(MASTER_ROSTER_KEY, async () => {
    try {
      const currentRoster = await getMasterRoster();
      const playerIndex = currentRoster.findIndex(p => p.id === playerId);

      if (playerIndex === -1) {
        logger.error(`[updatePlayerInRoster] Player with ID ${playerId} not found.`);
        return Promise.resolve(null);
      }

      // Create updated player object
      const updatedPlayer = {
        ...currentRoster[playerIndex],
        ...updateData
      };

      // Ensure name is not empty if it's being updated
      if (updateData.name !== undefined && !updatedPlayer.name?.trim()) {
        logger.error('[updatePlayerInRoster] Validation Failed: Player name cannot be empty.');
        return Promise.resolve(null);
      }
      // Ensure name is trimmed if updated
      if (updatedPlayer.name) {
        updatedPlayer.name = updatedPlayer.name.trim();
      }

      // Update roster
      const updatedRoster = [...currentRoster];
      updatedRoster[playerIndex] = updatedPlayer;
      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(updatedRoster));

      return Promise.resolve(updatedPlayer);
    } catch (error) {
      logger.error('[updatePlayerInRoster] Unexpected error updating player:', error);
      return Promise.resolve(null);
    }
  });
};

/**
 * Removes a player from the master roster.
 * @param playerId - The ID of the player to remove.
 * @returns True if player was successfully removed, false otherwise.
 */
export const removePlayerFromRoster = async (playerId: string): Promise<boolean> => {
  if (!playerId) {
    logger.error('[removePlayerFromRoster] Validation Failed: Player ID cannot be empty.');
    return Promise.resolve(false);
  }

  return withKeyLock(MASTER_ROSTER_KEY, async () => {
    try {
      const currentRoster = await getMasterRoster();
      const updatedRoster = currentRoster.filter(p => p.id !== playerId);

      if (updatedRoster.length === currentRoster.length) {
        logger.error(`[removePlayerFromRoster] Player with ID ${playerId} not found.`);
        return Promise.resolve(false);
      }

      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(updatedRoster));
      return Promise.resolve(true);
    } catch (error) {
      logger.error('[removePlayerFromRoster] Unexpected error removing player:', error);
      return Promise.resolve(false);
    }
  });
};

/**
 * Sets the goalie status for a player in the master roster.
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
    return Promise.resolve(null);
  }

  return withKeyLock(MASTER_ROSTER_KEY, async () => {
    try {
      const currentRoster = await getMasterRoster();
      let targetPlayer: Player | undefined = undefined;

      const updatedRoster = currentRoster.map(player => {
        if (player.id === playerId) {
          targetPlayer = { ...player, isGoalie };
          return targetPlayer;
        }
        // If we are setting a new goalie, unset goalie status for all other players.
        if (isGoalie && player.isGoalie) {
          return { ...player, isGoalie: false };
        }
        return player;
      });

      if (!targetPlayer) {
        logger.error(`[setPlayerGoalieStatus] Player with ID ${playerId} not found.`);
        return Promise.resolve(null);
      }

      // If isGoalie is true, we need a second pass to ensure the target player is definitely the goalie
      // This handles the case where the target player was not the one initially having player.isGoalie = true
      // when isGoalie=true was passed.
      let finalRoster = updatedRoster;
      if (isGoalie) {
        finalRoster = updatedRoster.map(p => {
          if (p.id === playerId) return { ...p, isGoalie: true };
          // Ensure all others are not goalie if we are definitively setting one.
          // This is slightly redundant if the first pass caught it, but ensures correctness.
          if (p.id !== playerId && p.isGoalie) return { ...p, isGoalie: false};
          return p;
        });
        // Update targetPlayer reference from the finalRoster
        targetPlayer = finalRoster.find(p => p.id === playerId);
      }

      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(finalRoster));
      return Promise.resolve(targetPlayer || null); // Should always be targetPlayer if found earlier
    } catch (error) {
      logger.error('[setPlayerGoalieStatus] Unexpected error:', error);
      return Promise.resolve(null);
    }
  });
};

/**
 * Sets the fair play card status for a player in the master roster.
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