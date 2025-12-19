import { getDataStore } from '@/datastore';
import type { PlayerStatAdjustment } from '@/types';
import logger from '@/utils/logger';

export interface PlayerAdjustmentsIndex {
  [playerId: string]: PlayerStatAdjustment[];
}

/**
 * Get all adjustments for a specific player.
 */
export const getAdjustmentsForPlayer = async (playerId: string): Promise<PlayerStatAdjustment[]> => {
  try {
    const dataStore = await getDataStore();
    return await dataStore.getPlayerAdjustments(playerId);
  } catch (error) {
    logger.warn('Failed to get adjustments for player', { playerId, error });
    return [];
  }
};

/**
 * Add a new player stat adjustment.
 * DataStore handles ID generation and appliedAt timestamp automatically.
 * Optional id/appliedAt parameters exist for backup/restore flows only.
 * @throws Error if DataStore operation fails (write operations surface errors)
 */
export const addPlayerAdjustment = async (
  adj: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
): Promise<PlayerStatAdjustment> => {
  try {
    const dataStore = await getDataStore();
    return await dataStore.addPlayerAdjustment(adj);
  } catch (error) {
    logger.error('Failed to add player adjustment', { playerId: adj.playerId, error });
    throw error;
  }
};

/**
 * Delete a player stat adjustment.
 * @returns true if deleted, false if not found OR if operation fails (check logs for errors)
 */
export const deletePlayerAdjustment = async (playerId: string, adjustmentId: string): Promise<boolean> => {
  try {
    const dataStore = await getDataStore();
    return await dataStore.deletePlayerAdjustment(playerId, adjustmentId);
  } catch (error) {
    logger.warn('Failed to delete player adjustment', { playerId, adjustmentId, error });
    return false;
  }
};

/**
 * Update an existing player stat adjustment.
 * @returns Updated adjustment if successful, null if not found OR if operation fails (check logs for errors)
 */
export const updatePlayerAdjustment = async (
  playerId: string,
  adjustmentId: string,
  patch: Partial<PlayerStatAdjustment>
): Promise<PlayerStatAdjustment | null> => {
  try {
    const dataStore = await getDataStore();
    return await dataStore.updatePlayerAdjustment(playerId, adjustmentId, patch);
  } catch (error) {
    logger.warn('Failed to update player adjustment', { playerId, adjustmentId, error });
    return null;
  }
};


