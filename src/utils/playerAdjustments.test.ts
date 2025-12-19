/**
 * Tests for playerAdjustments.ts - Player stat adjustment persistence
 * @critical - Manages player stat adjustments stored in IndexedDB
 *
 * Tests cover:
 * - CRUD operations for player adjustments via DataStore
 * - Error handling and edge cases
 * - Default values for optional fields
 */

import {
  getAdjustmentsForPlayer,
  addPlayerAdjustment,
  deletePlayerAdjustment,
  updatePlayerAdjustment,
} from './playerAdjustments';
import type { DataStore } from '@/interfaces/DataStore';
import type { PlayerStatAdjustment } from '@/types';

// Create mock DataStore
const mockDataStore: jest.Mocked<Pick<DataStore, 'getPlayerAdjustments' | 'addPlayerAdjustment' | 'updatePlayerAdjustment' | 'deletePlayerAdjustment'>> = {
  getPlayerAdjustments: jest.fn(),
  addPlayerAdjustment: jest.fn(),
  updatePlayerAdjustment: jest.fn(),
  deletePlayerAdjustment: jest.fn(),
};

// Mock the datastore factory
jest.mock('@/datastore', () => ({
  getDataStore: jest.fn(() => Promise.resolve(mockDataStore)),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('playerAdjustments', () => {
  // Helper to create a test adjustment
  const createAdjustment = (
    overrides: Partial<PlayerStatAdjustment> = {}
  ): PlayerStatAdjustment => ({
    id: `adj_${Date.now()}`,
    playerId: 'player-1',
    appliedAt: new Date().toISOString(),
    gamesPlayedDelta: 1,
    goalsDelta: 2,
    assistsDelta: 1,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // getAdjustmentsForPlayer
  // ============================================
  describe('getAdjustmentsForPlayer', () => {
    it('should return adjustments for specific player via DataStore', async () => {
      const adjustments = [
        createAdjustment({ id: 'adj-1', playerId: 'player-1' }),
        createAdjustment({ id: 'adj-2', playerId: 'player-1' }),
      ];
      mockDataStore.getPlayerAdjustments.mockResolvedValue(adjustments);

      const result = await getAdjustmentsForPlayer('player-1');

      expect(mockDataStore.getPlayerAdjustments).toHaveBeenCalledWith('player-1');
      expect(result).toHaveLength(2);
      expect(result.every((a) => a.playerId === 'player-1')).toBe(true);
    });

    it('should return empty array for player with no adjustments', async () => {
      mockDataStore.getPlayerAdjustments.mockResolvedValue([]);

      const result = await getAdjustmentsForPlayer('player-2');

      expect(result).toEqual([]);
    });

    it('should return empty array when DataStore throws an error', async () => {
      mockDataStore.getPlayerAdjustments.mockRejectedValue(new Error('DataStore error'));

      const result = await getAdjustmentsForPlayer('player-1');

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // addPlayerAdjustment
  // ============================================
  describe('addPlayerAdjustment', () => {
    it('should add adjustment via DataStore', async () => {
      const newAdjustment = createAdjustment({
        id: 'adj-new',
        playerId: 'player-1',
        gamesPlayedDelta: 1,
        goalsDelta: 5,
        assistsDelta: 3,
      });
      mockDataStore.addPlayerAdjustment.mockResolvedValue(newAdjustment);

      const result = await addPlayerAdjustment({
        playerId: 'player-1',
        gamesPlayedDelta: 1,
        goalsDelta: 5,
        assistsDelta: 3,
      });

      expect(mockDataStore.addPlayerAdjustment).toHaveBeenCalledTimes(1);
      expect(result.playerId).toBe('player-1');
      expect(result.goalsDelta).toBe(5);
    });

    it('should pass optional fields to DataStore', async () => {
      const adjustmentWithOptionalFields = createAdjustment({
        playerId: 'player-1',
        seasonId: 'season-1',
        teamId: 'team-1',
        note: 'Test note',
      });
      mockDataStore.addPlayerAdjustment.mockResolvedValue(adjustmentWithOptionalFields);

      const result = await addPlayerAdjustment({
        playerId: 'player-1',
        gamesPlayedDelta: 1,
        goalsDelta: 2,
        assistsDelta: 1,
        seasonId: 'season-1',
        teamId: 'team-1',
        note: 'Test note',
      });

      expect(result.seasonId).toBe('season-1');
      expect(result.teamId).toBe('team-1');
      expect(result.note).toBe('Test note');
    });
  });

  // ============================================
  // deletePlayerAdjustment
  // ============================================
  describe('deletePlayerAdjustment', () => {
    it('should delete adjustment via DataStore', async () => {
      mockDataStore.deletePlayerAdjustment.mockResolvedValue(true);

      const result = await deletePlayerAdjustment('player-1', 'adj-1');

      expect(mockDataStore.deletePlayerAdjustment).toHaveBeenCalledWith('player-1', 'adj-1');
      expect(result).toBe(true);
    });

    it('should return false when adjustment not found', async () => {
      mockDataStore.deletePlayerAdjustment.mockResolvedValue(false);

      const result = await deletePlayerAdjustment('player-1', 'non-existent');

      expect(result).toBe(false);
    });

    it('should return false when DataStore throws an error', async () => {
      mockDataStore.deletePlayerAdjustment.mockRejectedValue(new Error('DataStore error'));

      const result = await deletePlayerAdjustment('player-1', 'adj-1');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // updatePlayerAdjustment
  // ============================================
  describe('updatePlayerAdjustment', () => {
    it('should update adjustment via DataStore', async () => {
      const updatedAdjustment = createAdjustment({
        id: 'adj-1',
        playerId: 'player-1',
        goalsDelta: 5,
        note: 'Updated note',
      });
      mockDataStore.updatePlayerAdjustment.mockResolvedValue(updatedAdjustment);

      const result = await updatePlayerAdjustment('player-1', 'adj-1', {
        goalsDelta: 5,
        note: 'Updated note',
      });

      expect(mockDataStore.updatePlayerAdjustment).toHaveBeenCalledWith(
        'player-1',
        'adj-1',
        { goalsDelta: 5, note: 'Updated note' }
      );
      expect(result).not.toBeNull();
      expect(result?.goalsDelta).toBe(5);
      expect(result?.note).toBe('Updated note');
    });

    it('should return null when adjustment not found', async () => {
      mockDataStore.updatePlayerAdjustment.mockResolvedValue(null);

      const result = await updatePlayerAdjustment('player-1', 'non-existent', {
        goalsDelta: 10,
      });

      expect(result).toBeNull();
    });

    it('should return null when DataStore throws an error', async () => {
      mockDataStore.updatePlayerAdjustment.mockRejectedValue(new Error('DataStore error'));

      const result = await updatePlayerAdjustment('player-1', 'adj-1', {
        goalsDelta: 10,
      });

      expect(result).toBeNull();
    });
  });
});
