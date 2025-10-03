/**
 * @jest-environment jsdom
 *
 * Tests for useAutoSave hook with smart debouncing
 *
 * @critical Tests core auto-save functionality for game state persistence
 */

import { renderHook } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';
import { act } from 'react';
import type { GameEvent } from '@/types/game';
import type { Player } from '@/types';

// Mock logger to avoid console noise
jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

describe('useAutoSave', () => {
  let mockSaveFunction: jest.Mock;

  // Helper function to create test GameEvent
  const createGameEvent = (id: string, time: number): GameEvent => ({
    id,
    type: 'goal',
    time,
  });

  // Helper function to create test Player
  const createPlayer = (id: string, name: string, relX: number, relY: number): Player => ({
    id,
    name,
    relX,
    relY,
    jerseyNumber: '1',
    isActive: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    mockSaveFunction = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /**
   * Tests immediate save tier (0ms delay)
   * Critical for statistics-affecting changes like goals and scores
   */
  describe('Immediate Save (0ms delay)', () => {
    /**
     * Goal logging should trigger instant save for statistics to update
     * @critical
     */
    it('should save immediately when immediate states change', () => {
      const { rerender } = renderHook(
        ({ gameEvents }) =>
          useAutoSave({
            immediate: {
              states: { gameEvents },
              delay: 0,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { gameEvents: [] as GameEvent[] },
        }
      );

      // Initial render - no save yet (no previous value)
      expect(mockSaveFunction).not.toHaveBeenCalled();

      // Change state - should save immediately
      act(() => {
        rerender({ gameEvents: [createGameEvent('1', 100)] });
      });

      expect(mockSaveFunction).toHaveBeenCalledTimes(1);

      // Another change - should save again immediately (no debouncing)
      act(() => {
        rerender({
          gameEvents: [
            createGameEvent('1', 100),
            createGameEvent('2', 200),
          ],
        });
      });

      expect(mockSaveFunction).toHaveBeenCalledTimes(2);
    });

    /**
     * Multiple immediate-tier states should all trigger instant saves
     */
    it('should save immediately for any immediate state change', () => {
      const { rerender } = renderHook(
        ({ gameEvents, homeScore, awayScore }) =>
          useAutoSave({
            immediate: {
              states: { gameEvents, homeScore, awayScore },
              delay: 0,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { gameEvents: [] as GameEvent[], homeScore: 0, awayScore: 0 },
        }
      );

      // Change homeScore
      act(() => {
        rerender({ gameEvents: [], homeScore: 1, awayScore: 0 });
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(1);

      // Change awayScore
      act(() => {
        rerender({ gameEvents: [], homeScore: 1, awayScore: 1 });
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(2);

      // Change gameEvents
      act(() => {
        rerender({ gameEvents: [createGameEvent('1', 100)], homeScore: 1, awayScore: 1 });
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(3);
    });
  });

  /**
   * Tests short delay tier (500ms)
   * For user-visible metadata like team names and notes
   */
  describe('Short Delay Save (500ms)', () => {
    /**
     * Metadata changes should debounce to prevent excessive saves
     */
    it('should save after 500ms delay when short-tier states change', () => {
      const { rerender } = renderHook(
        ({ teamName }) =>
          useAutoSave({
            short: {
              states: { teamName },
              delay: 500,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { teamName: 'Team A' },
        }
      );

      // Change state
      act(() => {
        rerender({ teamName: 'Team B' });
      });

      // Should not save immediately
      expect(mockSaveFunction).not.toHaveBeenCalled();

      // Advance time by 499ms - should still not save
      act(() => {
        jest.advanceTimersByTime(499);
      });
      expect(mockSaveFunction).not.toHaveBeenCalled();

      // Advance time by 1ms more (total 500ms) - should save
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(1);
    });

    /**
     * Multiple rapid changes should debounce to single save
     * @performance
     */
    it('should debounce multiple rapid changes to single save', () => {
      const { rerender } = renderHook(
        ({ teamName }) =>
          useAutoSave({
            short: {
              states: { teamName },
              delay: 500,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { teamName: 'Team A' },
        }
      );

      // Make 5 rapid changes
      act(() => {
        rerender({ teamName: 'Team B' });
      });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      act(() => {
        rerender({ teamName: 'Team C' });
      });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      act(() => {
        rerender({ teamName: 'Team D' });
      });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      act(() => {
        rerender({ teamName: 'Team E' });
      });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      act(() => {
        rerender({ teamName: 'Team F' });
      });

      // Should not have saved yet
      expect(mockSaveFunction).not.toHaveBeenCalled();

      // Advance time by 500ms after last change
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Should save only once with final value
      expect(mockSaveFunction).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Tests long delay tier (2000ms)
   * For tactical data like player positions and drawings
   */
  describe('Long Delay Save (2000ms)', () => {
    /**
     * Position changes should debounce with longer delay to save battery
     * @performance
     */
    it('should save after 2000ms delay when long-tier states change', () => {
      const { rerender } = renderHook(
        ({ playersOnField }) =>
          useAutoSave({
            long: {
              states: { playersOnField },
              delay: 2000,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { playersOnField: [] as Player[] },
        }
      );

      // Change state
      act(() => {
        rerender({ playersOnField: [createPlayer('1', 'Player 1', 0.5, 0.5)] });
      });

      // Should not save immediately
      expect(mockSaveFunction).not.toHaveBeenCalled();

      // Advance time by 1999ms - should still not save
      act(() => {
        jest.advanceTimersByTime(1999);
      });
      expect(mockSaveFunction).not.toHaveBeenCalled();

      // Advance time by 1ms more (total 2000ms) - should save
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(1);
    });

    /**
     * Multiple position drags should result in single save
     * @performance
     */
    it('should debounce 10 rapid position changes to single save', () => {
      const { rerender } = renderHook(
        ({ playersOnField }) =>
          useAutoSave({
            long: {
              states: { playersOnField },
              delay: 2000,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { playersOnField: [] as Player[] },
        }
      );

      // Simulate 10 rapid position updates (like dragging a player)
      for (let i = 0; i < 10; i++) {
        act(() => {
          rerender({
            playersOnField: [createPlayer('1', 'Player 1', i * 0.1, i * 0.1)],
          });
        });
        act(() => {
          jest.advanceTimersByTime(100);
        });
      }

      // Should not have saved yet
      expect(mockSaveFunction).not.toHaveBeenCalled();

      // Advance time by 2000ms after last change
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Should save only once
      expect(mockSaveFunction).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Tests interaction between different save tiers
   * @integration
   */
  describe('Mixed Tier Scenarios', () => {
    /**
     * Immediate and short tiers should work independently
     * @integration
     */
    it('should handle immediate and short tier changes independently', () => {
      const { rerender } = renderHook(
        ({ gameEvents, teamName }) =>
          useAutoSave({
            immediate: {
              states: { gameEvents },
              delay: 0,
            },
            short: {
              states: { teamName },
              delay: 500,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { gameEvents: [] as GameEvent[], teamName: 'Team A' },
        }
      );

      // Change immediate state - should save immediately
      act(() => {
        rerender({ gameEvents: [createGameEvent('1', 100)], teamName: 'Team A' });
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(1);

      // Change short state - should debounce
      act(() => {
        rerender({ gameEvents: [createGameEvent('1', 100)], teamName: 'Team B' });
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(1); // Still 1, not saved yet

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(2); // Now 2, short tier saved
    });

    /**
     * All three tiers should work independently without interference
     * @integration
     */
    it('should handle all three tiers independently', () => {
      const { rerender } = renderHook(
        ({ gameEvents, teamName, playersOnField }) =>
          useAutoSave({
            immediate: {
              states: { gameEvents },
              delay: 0,
            },
            short: {
              states: { teamName },
              delay: 500,
            },
            long: {
              states: { playersOnField },
              delay: 2000,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { gameEvents: [] as GameEvent[], teamName: 'Team A', playersOnField: [] as Player[] },
        }
      );

      // Change all three at once
      act(() => {
        rerender({
          gameEvents: [createGameEvent('1', 100)],
          teamName: 'Team B',
          playersOnField: [createPlayer('1', 'Player 1', 0.5, 0.5)],
        });
      });

      // Immediate tier should have saved
      expect(mockSaveFunction).toHaveBeenCalledTimes(1);

      // Advance 500ms - short tier should save
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(2);

      // Advance another 1500ms (total 2000ms) - long tier should save
      act(() => {
        jest.advanceTimersByTime(1500);
      });
      expect(mockSaveFunction).toHaveBeenCalledTimes(3);
    });
  });

  /**
   * Tests edge cases and error handling
   * @edge-case
   */
  describe('Edge Cases', () => {
    /**
     * Disabled hook should not trigger any saves
     */
    it('should not save when disabled', () => {
      const { rerender } = renderHook(
        ({ gameEvents, enabled }) =>
          useAutoSave({
            immediate: {
              states: { gameEvents },
              delay: 0,
            },
            saveFunction: mockSaveFunction,
            enabled,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { gameEvents: [], enabled: false },
        }
      );

      // Change state while disabled
      act(() => {
        rerender({ gameEvents: [createGameEvent('1', 100)], enabled: false });
      });

      expect(mockSaveFunction).not.toHaveBeenCalled();

      // Enable hook (this sets the initial reference)
      act(() => {
        rerender({
          gameEvents: [createGameEvent('1', 100)],
          enabled: true,
        });
      });

      // Still no save (first render after enabling just sets reference)
      expect(mockSaveFunction).not.toHaveBeenCalled();

      // Now change state - should trigger save
      act(() => {
        rerender({
          gameEvents: [
            createGameEvent('1', 100),
            createGameEvent('2', 200),
          ],
          enabled: true,
        });
      });

      expect(mockSaveFunction).toHaveBeenCalledTimes(1);
    });

    /**
     * Cleanup should clear all pending timers to prevent memory leaks
     * @critical
     */
    it('should cleanup timers on unmount', () => {
      const { unmount, rerender } = renderHook(
        ({ teamName, playersOnField }) =>
          useAutoSave({
            short: {
              states: { teamName },
              delay: 500,
            },
            long: {
              states: { playersOnField },
              delay: 2000,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { teamName: 'Team A', playersOnField: [] as Player[] },
        }
      );

      // Change states to start timers
      act(() => {
        rerender({ teamName: 'Team B', playersOnField: [createPlayer('1', 'Player 1', 0.5, 0.5)] });
      });

      // Unmount before timers fire
      unmount();

      // Advance time - should not save because timers were cleared
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(mockSaveFunction).not.toHaveBeenCalled();
    });

    /**
     * Hook should handle undefined state groups gracefully
     */
    it('should handle undefined state groups', () => {
      const { rerender } = renderHook(
        ({ gameEvents }) =>
          useAutoSave({
            immediate: {
              states: { gameEvents },
              delay: 0,
            },
            // short and long are undefined
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { gameEvents: [] as GameEvent[] },
        }
      );

      act(() => {
        rerender({ gameEvents: [createGameEvent('1', 100)] });
      });

      // Should only save for immediate tier
      expect(mockSaveFunction).toHaveBeenCalledTimes(1);
    });

    /**
     * Hook should not crash on serialization errors
     * @edge-case
     */
    it('should handle circular references gracefully', () => {
      const circularObj: { self?: unknown } = {};
      circularObj.self = circularObj; // Create circular reference

      const { rerender } = renderHook(
        ({ data }) =>
          useAutoSave({
            immediate: {
              states: { data },
              delay: 0,
            },
            saveFunction: mockSaveFunction,
            enabled: true,
            currentGameId: 'test-game-1',
          }),
        {
          initialProps: { data: {} },
        }
      );

      // Try to change to circular object - should not crash
      expect(() => {
        act(() => {
          rerender({ data: circularObj });
        });
      }).not.toThrow();

      // Should not have saved due to serialization error
      expect(mockSaveFunction).not.toHaveBeenCalled();
    });
  });
});
