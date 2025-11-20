/**
 * @fileoverview Tests for useTimerManagement hook
 *
 * Tests timer state management, goal event creation, modal state,
 * and integration with game timer functionality.
 *
 * @critical Timer state integration with useGameTimer
 * @critical Goal event creation with timestamp rounding
 * @critical Modal state management with functional updates
 * @integration Goal logging flow
 * @edge-case Player pool fallback
 * @edge-case Invalid scorer handling
 */

import { renderHook, act } from '@testing-library/react';
import { useTimerManagement } from '../useTimerManagement';
import type { Player, GameSessionState } from '@/types';
import type { GameSessionAction } from '@/hooks/useGameSessionReducer';

// Mock dependencies
jest.mock('@/hooks/useGameTimer');
jest.mock('@/utils/logger');

import { useGameTimer } from '@/hooks/useGameTimer';

const mockUseGameTimer = useGameTimer as jest.MockedFunction<typeof useGameTimer>;

describe('useTimerManagement', () => {
  // Setup common test data
  const mockPlayers: Player[] = [
    {
      id: 'player1',
      name: 'John Doe',
      jerseyNumber: '10',
      nickname: 'Johnny',
      isGoalkeeper: false,
    },
    {
      id: 'player2',
      name: 'Jane Smith',
      jerseyNumber: '7',
      nickname: 'Janey',
      isGoalkeeper: false,
    },
    {
      id: 'player3',
      name: 'Bob Keeper',
      jerseyNumber: '1',
      nickname: 'Bobby',
      isGoalkeeper: true,
    },
  ];

  const mockGameSessionState: GameSessionState = {
    currentGameId: 'game1',
    homeScore: 2,
    awayScore: 1,
    currentPeriod: 1,
    timeElapsedInSeconds: 725.456, // 12:05.456 (will be rounded to 725.46)
    isTimerRunning: true,
    events: [],
    startedAt: null,
    opponent: 'Opponent Team',
    isNewGame: false,
    metadata: {
      seasonId: 'season1',
      tournamentId: '',
      teamId: 'team1',
    },
    playerIdsForNewGame: [],
  };

  const mockDispatch = jest.fn<void, [GameSessionAction]>();
  const mockSetIsGoalLogModalOpen = jest.fn();

  // Mock useGameTimer return value
  const mockGameTimerReturn = {
    timeElapsedInSeconds: 725.456,
    isTimerRunning: true,
    subAlertLevel: 'none' as const,
    lastSubConfirmationTimeSeconds: 0,
    startPause: jest.fn(),
    reset: jest.fn(),
    ackSubstitution: jest.fn(),
    setSubInterval: jest.fn(),
  };

  const defaultProps = {
    gameSessionState: mockGameSessionState,
    dispatchGameSession: mockDispatch,
    currentGameId: 'game1',
    availablePlayers: mockPlayers,
    masterRoster: mockPlayers,
    setIsGoalLogModalOpen: mockSetIsGoalLogModalOpen,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGameTimer.mockReturnValue(mockGameTimerReturn);
  });

  /**
   * @critical - Timer state integration with useGameTimer
   * Verifies that timer state from useGameTimer is correctly integrated
   */
  describe('Timer State Integration', () => {
    it('should integrate timer state from useGameTimer', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      // Verify timer state is exposed
      expect(result.current.timeElapsedInSeconds).toBe(725.456);
      expect(result.current.isTimerRunning).toBe(true);
      expect(result.current.subAlertLevel).toBe('none');
      expect(result.current.lastSubConfirmationTimeSeconds).toBe(0);
    });

    it('should expose timer controls from useGameTimer', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      // Verify timer controls are exposed
      expect(result.current.handleStartPauseTimer).toBe(mockGameTimerReturn.startPause);
      expect(result.current.handleResetTimer).toBe(mockGameTimerReturn.reset);
      expect(result.current.handleSubstitutionMade).toBe(mockGameTimerReturn.ackSubstitution);
      expect(result.current.handleSetSubInterval).toBe(mockGameTimerReturn.setSubInterval);
    });

    it('should pass correct props to useGameTimer', () => {
      renderHook(() => useTimerManagement(defaultProps));

      expect(mockUseGameTimer).toHaveBeenCalledWith({
        state: mockGameSessionState,
        dispatch: mockDispatch,
        currentGameId: 'game1',
      });
    });

    it('should handle null currentGameId gracefully', () => {
      renderHook(() => useTimerManagement({
        ...defaultProps,
        currentGameId: null,
      }));

      expect(mockUseGameTimer).toHaveBeenCalledWith({
        state: mockGameSessionState,
        dispatch: mockDispatch,
        currentGameId: '', // Converted to empty string
      });
    });

    it('should update timer state when useGameTimer returns new values', () => {
      const { result, rerender } = renderHook(
        (props) => useTimerManagement(props),
        { initialProps: defaultProps }
      );

      // Update useGameTimer mock
      mockUseGameTimer.mockReturnValue({
        ...mockGameTimerReturn,
        timeElapsedInSeconds: 800.123,
        isTimerRunning: false,
      });

      rerender(defaultProps);

      expect(result.current.timeElapsedInSeconds).toBe(800.123);
      expect(result.current.isTimerRunning).toBe(false);
    });
  });

  /**
   * @critical - Goal event creation with timestamp rounding
   * Verifies timestamp rounding to 2 decimal places (bug fix validation)
   */
  describe('Goal Event Creation', () => {
    it('should create goal events with rounded timestamps (own goal)', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleAddGoalEvent('player1');
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          time: 725.46, // 725.456 rounded to 2 decimals
        }),
      });
    });

    it('should create opponent goal events with rounded timestamps', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleLogOpponentGoal(725.456);
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          time: 725.46, // 725.456 rounded to 2 decimals
        }),
      });
    });

    it('should round timestamps correctly for various decimal places', () => {
      const testCases = [
        { input: 100.123, expected: 100.12 },
        { input: 100.126, expected: 100.13 },
        { input: 100.125, expected: 100.13 }, // Banker's rounding
        { input: 100.1, expected: 100.1 },
        { input: 100, expected: 100 },
        { input: 0.456, expected: 0.46 },
      ];

      testCases.forEach(({ input, expected }) => {
        jest.clearAllMocks();

        const { result } = renderHook(() => useTimerManagement(defaultProps));

        act(() => {
          result.current.handleLogOpponentGoal(input);
        });

        expect(mockDispatch).toHaveBeenCalledWith({
          type: 'ADD_GAME_EVENT',
          payload: expect.objectContaining({
            time: expected,
          }),
        });
      });
    });

    it('should create opponent goal event with correct structure', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleLogOpponentGoal(725.456);
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          id: expect.stringContaining('oppGoal-'),
          type: 'opponentGoal',
          time: 725.46,
          scorerId: 'opponent',
        }),
      });
    });

    it('should create own goal event with correct structure', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleAddGoalEvent('player1', 'player2');
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          id: expect.stringContaining('goal-'),
          type: 'goal',
          time: 725.46,
          scorerId: 'player1',
          assisterId: 'player2',
        }),
      });
    });

    it('should generate unique event IDs', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      const eventIds: string[] = [];

      act(() => {
        result.current.handleLogOpponentGoal(725.456);
        const action = mockDispatch.mock.calls[0][0] as Extract<GameSessionAction, { type: 'ADD_GAME_EVENT' }>;
        eventIds.push(action.payload.id);
      });

      act(() => {
        result.current.handleLogOpponentGoal(725.456);
        const action = mockDispatch.mock.calls[2][0] as Extract<GameSessionAction, { type: 'ADD_GAME_EVENT' }>;
        eventIds.push(action.payload.id);
      });

      // Verify IDs are unique
      expect(eventIds[0]).not.toBe(eventIds[1]);
      expect(new Set(eventIds).size).toBe(2);
    });
  });

  /**
   * @critical - Modal state management with functional updates
   * Verifies functional update pattern works correctly
   */
  describe('Modal State Management', () => {
    it('should toggle goal log modal correctly', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleToggleGoalLogModal();
      });

      // Verify functional update pattern (callback with previous state)
      expect(mockSetIsGoalLogModalOpen).toHaveBeenCalledWith(expect.any(Function));

      // Test the callback function
      const callback = mockSetIsGoalLogModalOpen.mock.calls[0][0];
      expect(callback(false)).toBe(true);
      expect(callback(true)).toBe(false);
    });

    it('should toggle large timer overlay correctly', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      expect(result.current.showLargeTimerOverlay).toBe(false);

      act(() => {
        result.current.handleToggleLargeTimerOverlay();
      });

      expect(result.current.showLargeTimerOverlay).toBe(true);

      act(() => {
        result.current.handleToggleLargeTimerOverlay();
      });

      expect(result.current.showLargeTimerOverlay).toBe(false);
    });

    it('should not cause re-renders when modal state handler reference is stable', () => {
      const { result, rerender } = renderHook(
        (props) => useTimerManagement(props),
        { initialProps: defaultProps }
      );

      const firstToggle = result.current.handleToggleGoalLogModal;

      // Re-render with different timer state
      mockUseGameTimer.mockReturnValue({
        ...mockGameTimerReturn,
        timeElapsedInSeconds: 800,
      });

      rerender(defaultProps);

      const secondToggle = result.current.handleToggleGoalLogModal;

      // Handler should be stable (memoized) since setIsGoalLogModalOpen hasn't changed
      expect(firstToggle).toBe(secondToggle);
    });
  });

  /**
   * @integration - Goal logging flow
   * Verifies complete flow from goal logging to modal closure and score updates
   */
  describe('Goal Logging Flow', () => {
    it('should log opponent goal and close modal', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleLogOpponentGoal(725.456);
      });

      // Verify dispatch was called twice (event + score adjustment)
      expect(mockDispatch).toHaveBeenCalledTimes(2);

      // Verify event was added
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          type: 'opponentGoal',
        }),
      });

      // Verify score was adjusted
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADJUST_SCORE_FOR_EVENT',
        payload: { eventType: 'opponentGoal', action: 'add' },
      });

      // Verify modal was closed
      expect(mockSetIsGoalLogModalOpen).toHaveBeenCalledWith(false);
    });

    it('should log own goal and adjust score', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleAddGoalEvent('player1');
      });

      // Verify dispatch was called twice (event + score adjustment)
      expect(mockDispatch).toHaveBeenCalledTimes(2);

      // Verify event was added
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          type: 'goal',
          scorerId: 'player1',
        }),
      });

      // Verify score was adjusted
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADJUST_SCORE_FOR_EVENT',
        payload: { eventType: 'goal', action: 'add' },
      });
    });

    it('should handle rapid goal logging', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      // Log multiple goals rapidly
      act(() => {
        result.current.handleLogOpponentGoal(100);
        result.current.handleLogOpponentGoal(200);
        result.current.handleLogOpponentGoal(300);
      });

      // Verify all goals were dispatched (2 dispatches per goal)
      expect(mockDispatch).toHaveBeenCalledTimes(6);
      expect(mockSetIsGoalLogModalOpen).toHaveBeenCalledTimes(3);
    });

    it('should maintain correct timestamps for sequential goals', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      // Log first goal at 725.456 seconds
      act(() => {
        result.current.handleLogOpponentGoal(725.456);
      });

      expect((mockDispatch.mock.calls[0][0] as any).payload.time).toBe(725.46);

      // Log second goal at 800.123 seconds
      act(() => {
        result.current.handleLogOpponentGoal(800.123);
      });

      expect((mockDispatch.mock.calls[2][0] as any).payload.time).toBe(800.12);
    });
  });

  /**
   * @edge-case - Player pool fallback
   * Verifies fallback to master roster when availablePlayers is empty
   */
  describe('Player Pool Fallback', () => {
    it('should fall back to master roster when availablePlayers is empty', () => {
      const { result } = renderHook(() =>
        useTimerManagement({
          ...defaultProps,
          availablePlayers: [], // Empty available players
          masterRoster: mockPlayers, // But master roster has players
        })
      );

      act(() => {
        result.current.handleAddGoalEvent('player1');
      });

      // Should still be able to log goals using master roster
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          scorerId: 'player1',
        }),
      });
    });

    it('should prefer availablePlayers over master roster when both exist', () => {
      const limitedPlayers: Player[] = [{
        id: 'limited1',
        name: 'Limited Player',
        jerseyNumber: '99',
        isGoalkeeper: false,
      }];

      const { result } = renderHook(() =>
        useTimerManagement({
          ...defaultProps,
          availablePlayers: limitedPlayers,
          masterRoster: mockPlayers, // Has different players
        })
      );

      act(() => {
        result.current.handleAddGoalEvent('limited1');
      });

      // Should use available players (not master roster)
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          scorerId: 'limited1',
        }),
      });
    });

    it('should handle empty player pools gracefully for opponent goals', () => {
      const { result } = renderHook(() =>
        useTimerManagement({
          ...defaultProps,
          availablePlayers: [],
          masterRoster: [],
        })
      );

      // Opponent goals don't require players
      act(() => {
        result.current.handleLogOpponentGoal(100);
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          type: 'opponentGoal',
          scorerId: 'opponent',
        }),
      });
    });
  });

  /**
   * @edge-case - Invalid scorer handling
   * Verifies graceful handling of missing or invalid scorer
   */
  describe('Invalid Scorer Handling', () => {
    it('should handle missing scorer gracefully', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      // Try to add goal for non-existent player
      act(() => {
        result.current.handleAddGoalEvent('nonexistent-player');
      });

      // Should NOT dispatch (scorer not found)
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('should add goal with valid scorer', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleAddGoalEvent('player1');
      });

      // Should dispatch event
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          scorerId: 'player1',
        }),
      });
    });

    it('should handle missing assister gracefully', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleAddGoalEvent('player1', 'nonexistent-assister');
      });

      // Should dispatch with undefined assisterId
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          scorerId: 'player1',
          assisterId: undefined,
        }),
      });
    });

    it('should add goal with both scorer and assister', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      act(() => {
        result.current.handleAddGoalEvent('player1', 'player2');
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          scorerId: 'player1',
          assisterId: 'player2',
        }),
      });
    });
  });

  /**
   * @integration - Timer interactions object
   */
  describe('Timer Interactions Object', () => {
    it('should expose timer interactions with all required methods', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      const { timerInteractions } = result.current;

      // Verify all methods are present
      expect(timerInteractions).toHaveProperty('toggleLargeOverlay');
      expect(timerInteractions).toHaveProperty('toggleGoalLogModal');
      expect(timerInteractions).toHaveProperty('logOpponentGoal');
      expect(timerInteractions).toHaveProperty('substitutionMade');
      expect(timerInteractions).toHaveProperty('setSubInterval');
      expect(timerInteractions).toHaveProperty('startPauseTimer');
      expect(timerInteractions).toHaveProperty('resetTimer');

      // Verify all methods are functions
      expect(typeof timerInteractions.toggleLargeOverlay).toBe('function');
      expect(typeof timerInteractions.toggleGoalLogModal).toBe('function');
      expect(typeof timerInteractions.logOpponentGoal).toBe('function');
      expect(typeof timerInteractions.substitutionMade).toBe('function');
      expect(typeof timerInteractions.setSubInterval).toBe('function');
      expect(typeof timerInteractions.startPauseTimer).toBe('function');
      expect(typeof timerInteractions.resetTimer).toBe('function');
    });

    it('should call correct handlers from timer interactions', () => {
      const { result } = renderHook(() => useTimerManagement(defaultProps));

      // Test toggleLargeOverlay
      act(() => {
        result.current.timerInteractions.toggleLargeOverlay();
      });
      expect(result.current.showLargeTimerOverlay).toBe(true);

      // Test toggleGoalLogModal
      act(() => {
        result.current.timerInteractions.toggleGoalLogModal();
      });
      expect(mockSetIsGoalLogModalOpen).toHaveBeenCalled();

      // Test logOpponentGoal
      act(() => {
        result.current.timerInteractions.logOpponentGoal(100);
      });
      expect(mockDispatch).toHaveBeenCalled();

      // Test substitutionMade
      act(() => {
        result.current.timerInteractions.substitutionMade();
      });
      expect(mockGameTimerReturn.ackSubstitution).toHaveBeenCalled();

      // Test setSubInterval
      act(() => {
        result.current.timerInteractions.setSubInterval(5);
      });
      expect(mockGameTimerReturn.setSubInterval).toHaveBeenCalledWith(5);

      // Test startPauseTimer
      act(() => {
        result.current.timerInteractions.startPauseTimer();
      });
      expect(mockGameTimerReturn.startPause).toHaveBeenCalled();

      // Test resetTimer
      act(() => {
        result.current.timerInteractions.resetTimer();
      });
      expect(mockGameTimerReturn.reset).toHaveBeenCalled();
    });

    it('should maintain stable timer interactions reference', () => {
      const { result, rerender } = renderHook(
        (props) => useTimerManagement(props),
        { initialProps: defaultProps }
      );

      const firstInteractions = result.current.timerInteractions;

      // Update timer state (shouldn't affect interactions reference)
      mockUseGameTimer.mockReturnValue({
        ...mockGameTimerReturn,
        timeElapsedInSeconds: 800,
      });

      rerender(defaultProps);

      const secondInteractions = result.current.timerInteractions;

      // Should be the same reference (memoized)
      expect(firstInteractions).toBe(secondInteractions);
    });
  });

  /**
   * @edge-case - Timer state edge cases
   */
  describe('Timer State Edge Cases', () => {
    it('should handle timer at exactly 0 seconds', () => {
      const { result } = renderHook(() =>
        useTimerManagement({
          ...defaultProps,
          gameSessionState: {
            ...mockGameSessionState,
            timeElapsedInSeconds: 0,
          },
        })
      );

      act(() => {
        result.current.handleAddGoalEvent('player1');
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          time: 0,
        }),
      });
    });

    it('should handle very large timer values', () => {
      const { result } = renderHook(() =>
        useTimerManagement({
          ...defaultProps,
          gameSessionState: {
            ...mockGameSessionState,
            timeElapsedInSeconds: 9999.999,
          },
        })
      );

      act(() => {
        result.current.handleAddGoalEvent('player1');
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          time: 10000, // Rounded to 2 decimals
        }),
      });
    });

    it('should handle negative timer values (edge case)', () => {
      const { result } = renderHook(() =>
        useTimerManagement({
          ...defaultProps,
          gameSessionState: {
            ...mockGameSessionState,
            timeElapsedInSeconds: -5.123,
          },
        })
      );

      act(() => {
        result.current.handleAddGoalEvent('player1');
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'ADD_GAME_EVENT',
        payload: expect.objectContaining({
          time: -5.12,
        }),
      });
    });
  });
});
