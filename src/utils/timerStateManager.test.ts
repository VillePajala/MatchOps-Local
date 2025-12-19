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
import { TIMER_STATE_KEY } from '@/config/storageKeys';

// Mock the storage module
jest.mock('./storage', () => ({
  getStorageJSON: jest.fn(),
  setStorageJSON: jest.fn(),
  removeStorageItem: jest.fn(),
}));

// Mock logger to prevent console output during tests
// __esModule: true prevents Babel's _interopRequireDefault from wrapping again
jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { getStorageJSON, setStorageJSON, removeStorageItem } from './storage';

const mockGetStorageJSON = getStorageJSON as jest.MockedFunction<typeof getStorageJSON>;
const mockSetStorageJSON = setStorageJSON as jest.MockedFunction<typeof setStorageJSON>;
const mockRemoveStorageItem = removeStorageItem as jest.MockedFunction<typeof removeStorageItem>;

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

  describe('Storage Key Integrity', () => {
    it('should use correct storage key to maintain backward compatibility', () => {
      // This test ensures we never accidentally change the key
      // Changing this would orphan existing timer states in user browsers
      expect(TIMER_STATE_KEY).toBe('soccerTimerState');
    });
  });

  describe('saveTimerState', () => {
    it('should save timer state to storage with correct key', async () => {
      mockSetStorageJSON.mockResolvedValue(undefined);

      await saveTimerState(mockTimerState);

      expect(mockSetStorageJSON).toHaveBeenCalledTimes(1);
      expect(mockSetStorageJSON).toHaveBeenCalledWith(TIMER_STATE_KEY, mockTimerState);
    });

    it('should save timer state without wasRunning field', async () => {
      mockSetStorageJSON.mockResolvedValue(undefined);
      const stateWithoutWasRunning: TimerState = {
        gameId: 'game-456',
        timeElapsedInSeconds: 120,
        timestamp: 1702900000000,
      };

      await saveTimerState(stateWithoutWasRunning);

      expect(mockSetStorageJSON).toHaveBeenCalledWith(TIMER_STATE_KEY, stateWithoutWasRunning);
    });

    it('should handle storage errors gracefully (non-critical)', async () => {
      mockSetStorageJSON.mockRejectedValue(new Error('Storage error'));

      // Should not throw - timer state save is not critical
      await expect(saveTimerState(mockTimerState)).resolves.not.toThrow();
    });
  });

  describe('loadTimerState', () => {
    it('should load timer state from storage', async () => {
      mockGetStorageJSON.mockResolvedValue(mockTimerState);

      const result = await loadTimerState();

      expect(mockGetStorageJSON).toHaveBeenCalledTimes(1);
      expect(mockGetStorageJSON).toHaveBeenCalledWith(TIMER_STATE_KEY);
      expect(result).toEqual(mockTimerState);
    });

    it('should return null when no timer state exists', async () => {
      mockGetStorageJSON.mockResolvedValue(null);

      const result = await loadTimerState();

      expect(result).toBeNull();
    });

    it('should return null and handle storage errors gracefully', async () => {
      mockGetStorageJSON.mockRejectedValue(new Error('Storage error'));

      const result = await loadTimerState();

      expect(result).toBeNull();
    });
  });

  describe('clearTimerState', () => {
    it('should remove timer state from storage', async () => {
      mockRemoveStorageItem.mockResolvedValue(undefined);

      await clearTimerState();

      expect(mockRemoveStorageItem).toHaveBeenCalledTimes(1);
      expect(mockRemoveStorageItem).toHaveBeenCalledWith(TIMER_STATE_KEY);
    });

    it('should handle storage errors gracefully (non-critical)', async () => {
      mockRemoveStorageItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw - timer state clear is not critical
      await expect(clearTimerState()).resolves.not.toThrow();
    });
  });

  describe('hasTimerState', () => {
    it('should return true when timer state exists', async () => {
      mockGetStorageJSON.mockResolvedValue(mockTimerState);

      const result = await hasTimerState();

      expect(result).toBe(true);
    });

    it('should return false when no timer state exists', async () => {
      mockGetStorageJSON.mockResolvedValue(null);

      const result = await hasTimerState();

      expect(result).toBe(false);
    });

    it('should return false when storage errors occur', async () => {
      mockGetStorageJSON.mockRejectedValue(new Error('Storage error'));

      const result = await hasTimerState();

      expect(result).toBe(false);
    });
  });

  describe('loadTimerStateForGame', () => {
    it('should return timer state when game ID matches', async () => {
      mockGetStorageJSON.mockResolvedValue(mockTimerState);

      const result = await loadTimerStateForGame('game-123');

      expect(result).toEqual(mockTimerState);
    });

    it('should return null when game ID does not match', async () => {
      mockGetStorageJSON.mockResolvedValue(mockTimerState);

      const result = await loadTimerStateForGame('different-game');

      expect(result).toBeNull();
    });

    it('should return null when no timer state exists', async () => {
      mockGetStorageJSON.mockResolvedValue(null);

      const result = await loadTimerStateForGame('game-123');

      expect(result).toBeNull();
    });

    it('should return null when storage errors occur', async () => {
      mockGetStorageJSON.mockRejectedValue(new Error('Storage error'));

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
