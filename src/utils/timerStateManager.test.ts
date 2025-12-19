/**
 * Tests for Timer State Manager
 *
 * @critical Timer state persistence is essential for timer recovery after tab switch
 */

import {
  saveTimerState,
  loadTimerState,
  clearTimerState,
  hasTimerState,
  loadTimerStateForGame,
  TimerState,
} from './timerStateManager';
import type { DataStore } from '@/interfaces/DataStore';

// Create mock DataStore
const mockDataStore: jest.Mocked<Pick<DataStore, 'getTimerState' | 'saveTimerState' | 'clearTimerState'>> = {
  getTimerState: jest.fn(),
  saveTimerState: jest.fn(),
  clearTimerState: jest.fn(),
};

// Mock the datastore factory
jest.mock('@/datastore', () => ({
  getDataStore: jest.fn(() => Promise.resolve(mockDataStore)),
}));

// Mock logger to prevent console output during tests
jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('timerStateManager', () => {
  const mockTimerState: TimerState = {
    gameId: 'game-123',
    timeElapsedInSeconds: 300,
    timestamp: 1702900000000,
    wasRunning: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveTimerState', () => {
    it('should save timer state via DataStore', async () => {
      mockDataStore.saveTimerState.mockResolvedValue(undefined);

      await saveTimerState(mockTimerState);

      expect(mockDataStore.saveTimerState).toHaveBeenCalledTimes(1);
      expect(mockDataStore.saveTimerState).toHaveBeenCalledWith(mockTimerState);
    });

    it('should save timer state without wasRunning field', async () => {
      mockDataStore.saveTimerState.mockResolvedValue(undefined);
      const stateWithoutWasRunning: TimerState = {
        gameId: 'game-456',
        timeElapsedInSeconds: 120,
        timestamp: 1702900000000,
      };

      await saveTimerState(stateWithoutWasRunning);

      expect(mockDataStore.saveTimerState).toHaveBeenCalledWith(stateWithoutWasRunning);
    });

    it('should handle DataStore errors gracefully (non-critical)', async () => {
      mockDataStore.saveTimerState.mockRejectedValue(new Error('DataStore error'));

      // Should not throw - timer state save is not critical
      await expect(saveTimerState(mockTimerState)).resolves.not.toThrow();
    });
  });

  describe('loadTimerState', () => {
    it('should load timer state from DataStore', async () => {
      mockDataStore.getTimerState.mockResolvedValue(mockTimerState);

      const result = await loadTimerState();

      expect(mockDataStore.getTimerState).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTimerState);
    });

    it('should return null when no timer state exists', async () => {
      mockDataStore.getTimerState.mockResolvedValue(null);

      const result = await loadTimerState();

      expect(result).toBeNull();
    });

    it('should return null and handle DataStore errors gracefully', async () => {
      mockDataStore.getTimerState.mockRejectedValue(new Error('DataStore error'));

      const result = await loadTimerState();

      expect(result).toBeNull();
    });
  });

  describe('clearTimerState', () => {
    it('should clear timer state via DataStore', async () => {
      mockDataStore.clearTimerState.mockResolvedValue(undefined);

      await clearTimerState();

      expect(mockDataStore.clearTimerState).toHaveBeenCalledTimes(1);
    });

    it('should handle DataStore errors gracefully (non-critical)', async () => {
      mockDataStore.clearTimerState.mockRejectedValue(new Error('DataStore error'));

      // Should not throw - timer state clear is not critical
      await expect(clearTimerState()).resolves.not.toThrow();
    });
  });

  describe('hasTimerState', () => {
    it('should return true when timer state exists', async () => {
      mockDataStore.getTimerState.mockResolvedValue(mockTimerState);

      const result = await hasTimerState();

      expect(result).toBe(true);
    });

    it('should return false when no timer state exists', async () => {
      mockDataStore.getTimerState.mockResolvedValue(null);

      const result = await hasTimerState();

      expect(result).toBe(false);
    });

    it('should return false when DataStore errors occur', async () => {
      mockDataStore.getTimerState.mockRejectedValue(new Error('DataStore error'));

      const result = await hasTimerState();

      expect(result).toBe(false);
    });
  });

  describe('loadTimerStateForGame', () => {
    it('should return timer state when game ID matches', async () => {
      mockDataStore.getTimerState.mockResolvedValue(mockTimerState);

      const result = await loadTimerStateForGame('game-123');

      expect(result).toEqual(mockTimerState);
    });

    it('should return null when game ID does not match', async () => {
      mockDataStore.getTimerState.mockResolvedValue(mockTimerState);

      const result = await loadTimerStateForGame('different-game');

      expect(result).toBeNull();
    });

    it('should return null when no timer state exists', async () => {
      mockDataStore.getTimerState.mockResolvedValue(null);

      const result = await loadTimerStateForGame('game-123');

      expect(result).toBeNull();
    });

    it('should return null when DataStore errors occur', async () => {
      mockDataStore.getTimerState.mockRejectedValue(new Error('DataStore error'));

      const result = await loadTimerStateForGame('game-123');

      expect(result).toBeNull();
    });
  });

  describe('TimerState interface', () => {
    it('should accept valid timer state with all fields', () => {
      const fullState: TimerState = {
        gameId: 'game-789',
        timeElapsedInSeconds: 600,
        timestamp: Date.now(),
        wasRunning: true,
      };

      // TypeScript compile-time check - if this compiles, interface is correct
      expect(fullState.gameId).toBe('game-789');
      expect(fullState.timeElapsedInSeconds).toBe(600);
      expect(fullState.wasRunning).toBe(true);
    });

    it('should accept valid timer state without optional wasRunning', () => {
      const minimalState: TimerState = {
        gameId: 'game-minimal',
        timeElapsedInSeconds: 0,
        timestamp: Date.now(),
      };

      // TypeScript compile-time check
      expect(minimalState.gameId).toBe('game-minimal');
      expect(minimalState.wasRunning).toBeUndefined();
    });
  });
});
