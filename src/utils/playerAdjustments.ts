import { getDataStore } from '@/datastore';
import type { PlayerStatAdjustment } from '@/types';
import logger from '@/utils/logger';

export interface PlayerAdjustmentsIndex {
  [playerId: string]: PlayerStatAdjustment[];
}

/**
 * Get all adjustments for a specific player.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 */
export const getAdjustmentsForPlayer = async (playerId: string, userId?: string): Promise<PlayerStatAdjustment[]> => {
  try {
    const dataStore = await getDataStore(userId);
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
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @throws Error if DataStore operation fails (write operations surface errors)
 */
export const addPlayerAdjustment = async (
  adj: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string },
  userId?: string
): Promise<PlayerStatAdjustment> => {
  try {
    const dataStore = await getDataStore(userId);
    return await dataStore.addPlayerAdjustment(adj);
  } catch (error) {
    logger.error('Failed to add player adjustment', { playerId: adj.playerId, error });
    throw error;
  }
};

/**
 * Delete a player stat adjustment.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns true if deleted, false if not found OR if operation fails (check logs for errors)
 *
 * Design: In local-first mode, both "not found" and "error" return false
 * because UI recovery is the same (refresh/retry). Errors are logged for debugging.
 */
export const deletePlayerAdjustment = async (playerId: string, adjustmentId: string, userId?: string): Promise<boolean> => {
  try {
    const dataStore = await getDataStore(userId);
    return await dataStore.deletePlayerAdjustment(playerId, adjustmentId);
  } catch (error) {
    logger.warn('Failed to delete player adjustment', { playerId, adjustmentId, error });
    return false;
  }
};

/**
 * Update an existing player stat adjustment.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns Updated adjustment if successful, null if not found OR if operation fails (check logs for errors)
 *
 * Design: In local-first mode, both "not found" and "error" return null
 * because UI recovery is the same (refresh/retry). Errors are logged for debugging.
 */
export const updatePlayerAdjustment = async (
  playerId: string,
  adjustmentId: string,
  patch: Partial<PlayerStatAdjustment>,
  userId?: string
): Promise<PlayerStatAdjustment | null> => {
  try {
    const dataStore = await getDataStore(userId);
    return await dataStore.updatePlayerAdjustment(playerId, adjustmentId, patch);
  } catch (error) {
    logger.warn('Failed to update player adjustment', { playerId, adjustmentId, error });
    return null;
  }
};


