/**
 * Tests for playerAdjustments.ts - Player stat adjustment persistence
 * @critical - Manages player stat adjustments stored in IndexedDB
 *
 * Tests cover:
 * - CRUD operations for player adjustments
 * - Index management by playerId
 * - Error handling and edge cases
 * - Default values for optional fields
 */

import {
  getAllPlayerAdjustments,
  getAdjustmentsForPlayer,
  addPlayerAdjustment,
  deletePlayerAdjustment,
  updatePlayerAdjustment,
  PlayerAdjustmentsIndex,
} from './playerAdjustments';
import { getStorageItem, setStorageItem } from './storage';
import type { PlayerStatAdjustment } from '@/types';

// Mock storage module
jest.mock('./storage', () => ({
  getStorageItem: jest.fn(),
  setStorageItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock storageKeyLock to pass through the function
jest.mock('./storageKeyLock', () => ({
  withKeyLock: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
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

const mockedGetStorageItem = getStorageItem as jest.MockedFunction<typeof getStorageItem>;
const mockedSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;

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
    mockedGetStorageItem.mockResolvedValue(null);
    mockedSetStorageItem.mockResolvedValue(undefined);
  });

  // ============================================
  // getAllPlayerAdjustments
  // ============================================
  describe('getAllPlayerAdjustments', () => {
    it('should return empty object when storage is empty', async () => {
      mockedGetStorageItem.mockResolvedValue(null);

      const result = await getAllPlayerAdjustments();

      expect(result).toEqual({});
    });

    it('should return parsed adjustments from storage', async () => {
      const stored: PlayerAdjustmentsIndex = {
        'player-1': [createAdjustment({ id: 'adj-1', playerId: 'player-1' })],
        'player-2': [createAdjustment({ id: 'adj-2', playerId: 'player-2' })],
      };
      mockedGetStorageItem.mockResolvedValue(JSON.stringify(stored));

      const result = await getAllPlayerAdjustments();

      expect(result).toEqual(stored);
      expect(Object.keys(result)).toHaveLength(2);
    });

    it('should return empty object on parse error', async () => {
      mockedGetStorageItem.mockResolvedValue('invalid json{{{');

      const result = await getAllPlayerAdjustments();

      expect(result).toEqual({});
    });

    it('should return empty object on storage read error', async () => {
      mockedGetStorageItem.mockRejectedValue(new Error('Storage error'));

      const result = await getAllPlayerAdjustments();

      expect(result).toEqual({});
    });
  });

  // ============================================
  // getAdjustmentsForPlayer
  // ============================================
  describe('getAdjustmentsForPlayer', () => {
    it('should return adjustments for specific player', async () => {
      const adjustments = [
        createAdjustment({ id: 'adj-1', playerId: 'player-1' }),
        createAdjustment({ id: 'adj-2', playerId: 'player-1' }),
      ];
      const stored: PlayerAdjustmentsIndex = {
        'player-1': adjustments,
        'player-2': [createAdjustment({ id: 'adj-3', playerId: 'player-2' })],
      };
      mockedGetStorageItem.mockResolvedValue(JSON.stringify(stored));

      const result = await getAdjustmentsForPlayer('player-1');

      expect(result).toHaveLength(2);
      expect(result.every((a) => a.playerId === 'player-1')).toBe(true);
    });

    it('should return empty array for player with no adjustments', async () => {
      const stored: PlayerAdjustmentsIndex = {
        'player-1': [createAdjustment({ playerId: 'player-1' })],
      };
      mockedGetStorageItem.mockResolvedValue(JSON.stringify(stored));

      const result = await getAdjustmentsForPlayer('player-2');

      expect(result).toEqual([]);
    });

    it('should return empty array when storage is empty', async () => {
      mockedGetStorageItem.mockResolvedValue(null);

      const result = await getAdjustmentsForPlayer('player-1');

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // addPlayerAdjustment
  // ============================================
  describe('addPlayerAdjustment', () => {
    it('should add adjustment to empty storage', async () => {
      mockedGetStorageItem.mockResolvedValue(null);

      const result = await addPlayerAdjustment({
        playerId: 'player-1',
        gamesPlayedDelta: 1,
        goalsDelta: 5,
        assistsDelta: 3,
      });

      expect(result.playerId).toBe('player-1');
      expect(result.gamesPlayedDelta).toBe(1);
      expect(result.goalsDelta).toBe(5);
      expect(result.assistsDelta).toBe(3);
      expect(result.id).toBeDefined();
      expect(result.appliedAt).toBeDefined();

      expect(mockedSetStorageItem).toHaveBeenCalledTimes(1);
      const savedData = JSON.parse(mockedSetStorageItem.mock.calls[0][1]);
      expect(savedData['player-1']).toHaveLength(1);
    });

    it('should append adjustment to existing player adjustments', async () => {
      const existing = [createAdjustment({ id: 'existing', playerId: 'player-1' })];
      mockedGetStorageItem.mockResolvedValue(
        JSON.stringify({ 'player-1': existing })
      );

      await addPlayerAdjustment({
        playerId: 'player-1',
        gamesPlayedDelta: 2,
        goalsDelta: 1,
        assistsDelta: 0,
      });

      const savedData = JSON.parse(mockedSetStorageItem.mock.calls[0][1]);
      expect(savedData['player-1']).toHaveLength(2);
    });

    it('should use provided id and appliedAt if given', async () => {
      mockedGetStorageItem.mockResolvedValue(null);
      const customId = 'custom-adj-id';
      const customDate = '2025-06-15T10:00:00.000Z';

      const result = await addPlayerAdjustment({
        id: customId,
        appliedAt: customDate,
        playerId: 'player-1',
        gamesPlayedDelta: 1,
        goalsDelta: 0,
        assistsDelta: 0,
      });

      expect(result.id).toBe(customId);
      expect(result.appliedAt).toBe(customDate);
    });

    it('should default missing delta values to 0', async () => {
      mockedGetStorageItem.mockResolvedValue(null);

      const result = await addPlayerAdjustment({
        playerId: 'player-1',
        gamesPlayedDelta: 0,
        goalsDelta: 0,
        assistsDelta: 0,
      });

      expect(result.gamesPlayedDelta).toBe(0);
      expect(result.goalsDelta).toBe(0);
      expect(result.assistsDelta).toBe(0);
    });

    it('should handle optional fields correctly', async () => {
      mockedGetStorageItem.mockResolvedValue(null);

      const result = await addPlayerAdjustment({
        playerId: 'player-1',
        gamesPlayedDelta: 1,
        goalsDelta: 2,
        assistsDelta: 1,
        seasonId: 'season-1',
        teamId: 'team-1',
        tournamentId: 'tournament-1',
        externalTeamName: 'External FC',
        opponentName: 'Opponent FC',
        scoreFor: 3,
        scoreAgainst: 2,
        gameDate: '2025-01-15',
        homeOrAway: 'home',
        note: 'Test note',
        createdBy: 'admin',
      });

      expect(result.seasonId).toBe('season-1');
      expect(result.teamId).toBe('team-1');
      expect(result.tournamentId).toBe('tournament-1');
      expect(result.externalTeamName).toBe('External FC');
      expect(result.opponentName).toBe('Opponent FC');
      expect(result.scoreFor).toBe(3);
      expect(result.scoreAgainst).toBe(2);
      expect(result.gameDate).toBe('2025-01-15');
      expect(result.homeOrAway).toBe('home');
      expect(result.note).toBe('Test note');
      expect(result.createdBy).toBe('admin');
    });
  });

  // ============================================
  // deletePlayerAdjustment
  // ============================================
  describe('deletePlayerAdjustment', () => {
    it('should delete existing adjustment', async () => {
      const adjustments = [
        createAdjustment({ id: 'adj-1', playerId: 'player-1' }),
        createAdjustment({ id: 'adj-2', playerId: 'player-1' }),
      ];
      mockedGetStorageItem.mockResolvedValue(
        JSON.stringify({ 'player-1': adjustments })
      );

      const result = await deletePlayerAdjustment('player-1', 'adj-1');

      expect(result).toBe(true);
      const savedData = JSON.parse(mockedSetStorageItem.mock.calls[0][1]);
      expect(savedData['player-1']).toHaveLength(1);
      expect(savedData['player-1'][0].id).toBe('adj-2');
    });

    it('should return false when adjustment not found', async () => {
      const adjustments = [createAdjustment({ id: 'adj-1', playerId: 'player-1' })];
      mockedGetStorageItem.mockResolvedValue(
        JSON.stringify({ 'player-1': adjustments })
      );

      const result = await deletePlayerAdjustment('player-1', 'non-existent');

      expect(result).toBe(false);
      expect(mockedSetStorageItem).not.toHaveBeenCalled();
    });

    it('should return false when player has no adjustments', async () => {
      mockedGetStorageItem.mockResolvedValue(JSON.stringify({}));

      const result = await deletePlayerAdjustment('player-1', 'adj-1');

      expect(result).toBe(false);
    });

    it('should handle deleting last adjustment for player', async () => {
      const adjustments = [createAdjustment({ id: 'adj-1', playerId: 'player-1' })];
      mockedGetStorageItem.mockResolvedValue(
        JSON.stringify({ 'player-1': adjustments })
      );

      const result = await deletePlayerAdjustment('player-1', 'adj-1');

      expect(result).toBe(true);
      const savedData = JSON.parse(mockedSetStorageItem.mock.calls[0][1]);
      expect(savedData['player-1']).toHaveLength(0);
    });
  });

  // ============================================
  // updatePlayerAdjustment
  // ============================================
  describe('updatePlayerAdjustment', () => {
    it('should update existing adjustment', async () => {
      const adjustment = createAdjustment({
        id: 'adj-1',
        playerId: 'player-1',
        goalsDelta: 2,
      });
      mockedGetStorageItem.mockResolvedValue(
        JSON.stringify({ 'player-1': [adjustment] })
      );

      const result = await updatePlayerAdjustment('player-1', 'adj-1', {
        goalsDelta: 5,
        note: 'Updated note',
      });

      expect(result).not.toBeNull();
      expect(result?.goalsDelta).toBe(5);
      expect(result?.note).toBe('Updated note');

      const savedData = JSON.parse(mockedSetStorageItem.mock.calls[0][1]);
      expect(savedData['player-1'][0].goalsDelta).toBe(5);
    });

    it('should return null when adjustment not found', async () => {
      const adjustment = createAdjustment({ id: 'adj-1', playerId: 'player-1' });
      mockedGetStorageItem.mockResolvedValue(
        JSON.stringify({ 'player-1': [adjustment] })
      );

      const result = await updatePlayerAdjustment('player-1', 'non-existent', {
        goalsDelta: 10,
      });

      expect(result).toBeNull();
      expect(mockedSetStorageItem).not.toHaveBeenCalled();
    });

    it('should return null when player has no adjustments', async () => {
      mockedGetStorageItem.mockResolvedValue(JSON.stringify({}));

      const result = await updatePlayerAdjustment('player-1', 'adj-1', {
        goalsDelta: 10,
      });

      expect(result).toBeNull();
    });

    it('should preserve unmodified fields', async () => {
      const adjustment = createAdjustment({
        id: 'adj-1',
        playerId: 'player-1',
        goalsDelta: 2,
        assistsDelta: 3,
        gamesPlayedDelta: 1,
      });
      mockedGetStorageItem.mockResolvedValue(
        JSON.stringify({ 'player-1': [adjustment] })
      );

      const result = await updatePlayerAdjustment('player-1', 'adj-1', {
        goalsDelta: 5,
      });

      expect(result?.goalsDelta).toBe(5);
      expect(result?.assistsDelta).toBe(3); // Preserved
      expect(result?.gamesPlayedDelta).toBe(1); // Preserved
    });

    it('should update correct adjustment when multiple exist', async () => {
      const adjustments = [
        createAdjustment({ id: 'adj-1', playerId: 'player-1', goalsDelta: 1 }),
        createAdjustment({ id: 'adj-2', playerId: 'player-1', goalsDelta: 2 }),
        createAdjustment({ id: 'adj-3', playerId: 'player-1', goalsDelta: 3 }),
      ];
      mockedGetStorageItem.mockResolvedValue(
        JSON.stringify({ 'player-1': adjustments })
      );

      await updatePlayerAdjustment('player-1', 'adj-2', { goalsDelta: 10 });

      const savedData = JSON.parse(mockedSetStorageItem.mock.calls[0][1]);
      expect(savedData['player-1'][0].goalsDelta).toBe(1); // Unchanged
      expect(savedData['player-1'][1].goalsDelta).toBe(10); // Updated
      expect(savedData['player-1'][2].goalsDelta).toBe(3); // Unchanged
    });
  });
});
