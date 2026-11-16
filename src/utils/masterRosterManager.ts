import { Player } from '@/types'; // Assuming Player type is in @/types
import {
    getMasterRoster as utilGetMasterRoster,
    addPlayerToRoster as utilAddPlayerToRoster,
    updatePlayerInRoster as utilUpdatePlayerInRoster,
    removePlayerFromRoster as utilRemovePlayerFromRoster,
    setPlayerGoalieStatus as utilSetPlayerGoalieStatus,
} from '@/utils/masterRoster';
import logger from '@/utils/logger';
import { getAllTeamRosters, removePlayerFromRoster as removePlayerFromTeamRoster } from '@/utils/teams';
import { getDataStore } from '@/datastore/factory';

/**
 * Retrieves the master roster of players.
 * Calls the underlying async utility from masterRoster.ts, which logs the failure.
 * A failed read throws rather than resolving to [] - see masterRoster.ts for why.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns {Promise<Player[]>} The current roster.
 * @throws When the roster cannot be read.
 */
export const getMasterRoster = (userId?: string): Promise<Player[]> => utilGetMasterRoster(userId);

/**
 * Adds a new player to the master roster.
 * Calls the underlying async utility from masterRoster.ts.
 * @param {Omit<Player, 'id' | 'isGoalie' | 'receivedFairPlayCard'>} playerData Data for the new player.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns {Promise<Player | null>} The newly added player, or null if operation failed.
 */
export const addPlayer = async (
    playerData: Omit<Player, 'id' | 'isGoalie' | 'receivedFairPlayCard'>,
    userId?: string
): Promise<Player | null> => {
    // logger.log('[masterRosterManager] addPlayer called with:', playerData);
    try {
        const newPlayer = await utilAddPlayerToRoster(playerData, userId);
        // logger.log('[masterRosterManager] Player added by util:', newPlayer);
        return newPlayer;
    } catch (error) {
        logger.error("[masterRosterManager] Error in addPlayer:", error);
        return null;
    }
};

/**
 * Updates an existing player in the master roster.
 * Calls the underlying async utility from masterRoster.ts.
 * @param {string} playerId The ID of the player to update.
 * @param {Partial<Omit<Player, 'id'>>} updates An object containing the fields to update.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns {Promise<Player | null>} The updated player object, or null if player not found or save failed.
 */
export const updatePlayer = async (
    playerId: string,
    updates: Partial<Omit<Player, 'id'>>,
    userId?: string
): Promise<Player | null> => {
    logger.log('[masterRosterManager] updatePlayer called for ID:', playerId, 'with updates:', updates);
    try {
        const updatedPlayer = await utilUpdatePlayerInRoster(playerId, updates, userId);
        logger.log('[masterRosterManager] Player updated by util:', updatedPlayer);
        return updatedPlayer;
    } catch (error) {
        logger.error(`[masterRosterManager] Error in updatePlayer for ID ${playerId}:`, error);
        return null;
    }
};

/**
 * Removes a player from the master roster.
 * Calls the underlying async utility from masterRoster.ts.
 * @param {string} playerId The ID of the player to remove.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns {Promise<boolean>} True if the player was successfully removed, false otherwise.
 */
/**
 * A deleted player leaves every team roster too (review 7.16). The team rosters hold
 * their own copy of the player (name, nickname, number, notes), so deleting only the
 * club entry left the Teams list counting the child and their details stored - in the
 * cloud too - until the coach happened to re-save that team.
 *
 * - Only teams that exist (archived included): a deleted team's roster is kept on
 *   purpose for recovery, and writing it would queue a cloud update the server
 *   rejects (team not found) - a permanently failed sync op caused by a delete.
 * - Each roster is read, filtered and written under the roster lock
 *   (removePlayerFromRoster), so an edit landing meanwhile is not overwritten.
 *
 * Best effort: the player is already deleted, and a roster that fails here is
 * logged, not reported as a failed delete.
 */
async function removePlayerFromAllTeamRosters(playerId: string, userId?: string): Promise<void> {
    try {
        const [rosters, teams] = await Promise.all([
            getAllTeamRosters(userId),
            getDataStore(userId).then((store) => store.getTeams(true)),
        ]);
        const existingTeamIds = new Set(teams.map((team) => team.id));
        for (const [teamId, roster] of Object.entries(rosters)) {
            if (!existingTeamIds.has(teamId)) continue;
            if (!roster?.some((p) => p.id === playerId)) continue;
            try {
                await removePlayerFromTeamRoster(teamId, playerId, userId);
            } catch (error) {
                logger.warn('[masterRosterManager] Could not remove the deleted player from a team roster', { teamId, error });
            }
        }
    } catch (error) {
        logger.warn('[masterRosterManager] Could not read team rosters after deleting a player', { error });
    }
}

export const removePlayer = async (playerId: string, userId?: string): Promise<boolean> => {
    // logger.log('[masterRosterManager] removePlayer called for ID:', playerId);
    try {
        const success = await utilRemovePlayerFromRoster(playerId, userId);
        // logger.log('[masterRosterManager] Player removal by util status:', success);
        if (success) await removePlayerFromAllTeamRosters(playerId, userId);
        return success;
    } catch (error) {
        logger.error(`[masterRosterManager] Error in removePlayer for ID ${playerId}:`, error);
        return false;
    }
};

/**
 * Sets the goalie status for a player in the master roster.
 * Calls the underlying async utility from masterRoster.ts.
 * @param {string} playerId The ID of the player to update.
 * @param {boolean} isGoalie Whether the player should be marked as a goalie.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns {Promise<Player | null>} The updated player object, or null if player not found or operation failed.
 */
export const setGoalieStatus = async (
    playerId: string,
    isGoalie: boolean,
    userId?: string
): Promise<Player | null> => {
    // logger.log('[masterRosterManager] setGoalieStatus called for ID:', playerId, 'to:', isGoalie);
    try {
        const updatedPlayer = await utilSetPlayerGoalieStatus(playerId, isGoalie, userId);
        // logger.log('[masterRosterManager] Goalie status updated by util:', updatedPlayer);
        return updatedPlayer;
    } catch (error) {
        logger.error(`[masterRosterManager] Error in setGoalieStatus for ID ${playerId}:`, error);
        return null;
    }
};
