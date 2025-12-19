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
 * DataStore handles ID generation, appliedAt, and persistence.
 */
export const addPlayerAdjustment = async (
  adj: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
): Promise<PlayerStatAdjustment> => {
  const dataStore = await getDataStore();
  return await dataStore.addPlayerAdjustment(adj);
};

/**
 * Delete a player stat adjustment.
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


