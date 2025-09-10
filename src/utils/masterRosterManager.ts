import { Player } from '@/types'; // Assuming Player type is in @/types
import {
    getMasterRoster as utilGetMasterRoster,
    addPlayerToRoster as utilAddPlayerToRoster,
    updatePlayerInRoster as utilUpdatePlayerInRoster,
    removePlayerFromRoster as utilRemovePlayerFromRoster,
    setPlayerGoalieStatus as utilSetPlayerGoalieStatus,
    setPlayerFairPlayCardStatus as utilSetPlayerFairPlayCardStatus
} from '@/utils/masterRoster';
import logger from '@/utils/logger';

/**
 * Retrieves the master roster of players.
 * Calls the underlying async utility from masterRoster.ts.
 * @returns {Promise<Player[]>} The current roster.
 */
export const getMasterRoster = async (): Promise<Player[]> => {
    // logger.log('[masterRosterManager] getMasterRoster called');
    try {
        const roster = await utilGetMasterRoster();
        // logger.log('[masterRosterManager] Roster fetched by util:', roster);
        return roster;
    } catch (error) {
        logger.error("[masterRosterManager] Error in getMasterRoster", error as Error, { component: 'masterRosterManager', section: 'getMasterRoster' });
        return []; // Return empty array on error to maintain type consistency
    }
};

/**
 * Adds a new player to the master roster.
 * Calls the underlying async utility from masterRoster.ts.
 * @param {Omit<Player, 'id' | 'isGoalie' | 'receivedFairPlayCard'>} playerData Data for the new player.
 * @returns {Promise<Player | null>} The newly added player, or null if operation failed.
 */
export const addPlayer = async (
    playerData: Omit<Player, 'id' | 'isGoalie' | 'receivedFairPlayCard'>
): Promise<Player | null> => {
    // logger.log('[masterRosterManager] addPlayer called with:', playerData);
    try {
        const newPlayer = await utilAddPlayerToRoster(playerData);
        // logger.log('[masterRosterManager] Player added by util:', newPlayer);
        return newPlayer;
    } catch (error) {
        logger.error("[masterRosterManager] Error in addPlayer", error as Error, { component: 'masterRosterManager', section: 'addPlayer' });
        return null;
    }
};

/**
 * Updates an existing player in the master roster.
 * Calls the underlying async utility from masterRoster.ts.
 * @param {string} playerId The ID of the player to update.
 * @param {Partial<Omit<Player, 'id'>>} updates An object containing the fields to update.
 * @returns {Promise<Player | null>} The updated player object, or null if player not found or save failed.
 */
export const updatePlayer = async (
    playerId: string,
    updates: Partial<Omit<Player, 'id'>>
): Promise<Player | null> => {
    // logger.log('[masterRosterManager] updatePlayer called for ID:', playerId, 'with updates:', updates);
    try {
        const updatedPlayer = await utilUpdatePlayerInRoster(playerId, updates);
        // logger.log('[masterRosterManager] Player updated by util:', updatedPlayer);
        return updatedPlayer;
    } catch (error) {
        logger.error(`[masterRosterManager] Error in updatePlayer for ID ${playerId}`, error as Error, { component: 'masterRosterManager', section: 'updatePlayer' });
        return null;
    }
};

/**
 * Removes a player from the master roster.
 * Calls the underlying async utility from masterRoster.ts.
 * @param {string} playerId The ID of the player to remove.
 * @returns {Promise<boolean>} True if the player was successfully removed, false otherwise.
 */
export const removePlayer = async (playerId: string): Promise<boolean> => {
    // logger.log('[masterRosterManager] removePlayer called for ID:', playerId);
    try {
        const success = await utilRemovePlayerFromRoster(playerId);
        // logger.log('[masterRosterManager] Player removal by util status:', success);
        return success;
    } catch (error) {
        logger.error(`[masterRosterManager] Error in removePlayer for ID ${playerId}`, error as Error, { component: 'masterRosterManager', section: 'removePlayer' });
        return false;
    }
};

/**
 * Sets the goalie status for a player in the master roster.
 * Calls the underlying async utility from masterRoster.ts.
 * @param {string} playerId The ID of the player to update.
 * @param {boolean} isGoalie Whether the player should be marked as a goalie.
 * @returns {Promise<Player | null>} The updated player object, or null if player not found or operation failed.
 */
export const setGoalieStatus = async (
    playerId: string,
    isGoalie: boolean
): Promise<Player | null> => {
    // logger.log('[masterRosterManager] setGoalieStatus called for ID:', playerId, 'to:', isGoalie);
    try {
        const updatedPlayer = await utilSetPlayerGoalieStatus(playerId, isGoalie);
        // logger.log('[masterRosterManager] Goalie status updated by util:', updatedPlayer);
        return updatedPlayer;
    } catch (error) {
        logger.error(`[masterRosterManager] Error in setGoalieStatus for ID ${playerId}`, error as Error, { component: 'masterRosterManager', section: 'setGoalieStatus' });
        return null;
    }
};

/**
 * Sets the fair play card status for a player in the master roster.
 * Calls the underlying async utility from masterRoster.ts.
 * @param {string} playerId The ID of the player to update.
 * @param {boolean} receivedFairPlayCard Whether the player has received the card.
 * @returns {Promise<Player | null>} The updated player object, or null if player not found or operation failed.
 */
export const setFairPlayCardStatus = async (
    playerId: string,
    receivedFairPlayCard: boolean
): Promise<Player | null> => {
    // logger.log('[masterRosterManager] setFairPlayCardStatus called for ID:', playerId, 'to:', receivedFairPlayCard);
    try {
        const updatedPlayer = await utilSetPlayerFairPlayCardStatus(playerId, receivedFairPlayCard);
        // logger.log('[masterRosterManager] Fair play status updated by util:', updatedPlayer);
        return updatedPlayer;
    } catch (error) {
        logger.error(`[masterRosterManager] Error in setFairPlayCardStatus for ID ${playerId}`, error as Error, { component: 'masterRosterManager', section: 'setFairPlayCardStatus' });
        return null;
    }
}; 