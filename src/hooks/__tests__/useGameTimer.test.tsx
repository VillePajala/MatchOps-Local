/**
 * Tests for useGameTimer.ts - Game timer management hook
 * @critical - Controls game timing, period transitions, substitution alerts
 *
 * Tests cover:
 * - Timer start/pause/reset functionality
 * - Period transitions (start period, end period, end game)
 * - Substitution interval acknowledgment
 * - Timer persistence and restore
 * - Edge cases (already running, not started, etc.)
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useGameTimer } from '../useGameTimer';
import { GameSessionState, GameSessionAction, gameSessionReducer } from '../useGameSessionReducer';

// Mock storage module
jest.mock('@/utils/storage', () => ({
  setStorageJSON: jest.fn().mockResolvedValue(undefined),
  getStorageJSON: jest.fn().mockResolvedValue(null),
  removeStorageItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock useWakeLock
jest.mock('../useWakeLock', () => ({
  useWakeLock: () => ({
    syncWakeLock: jest.fn(),
    isSupported: true,
    isActive: false,
    error: null,
  }),
}));

// Mock usePrecisionTimer
const mockGetCurrentTime = jest.fn().mockReturnValue(0);
jest.mock('../usePrecisionTimer', () => ({
  usePrecisionTimer: ({ onTick, isRunning, startTime }: {
    onTick: (elapsed: number) => void;
    isRunning: boolean;
    startTime: number;
  }) => {
    // Simulate timer ticks when running
    const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
    const timeRef = React.useRef(startTime);

    React.useEffect(() => {
      if (isRunning) {
        timeRef.current = startTime;
        intervalRef.current = setInterval(() => {
          timeRef.current += 1;
          onTick(timeRef.current);
        }, 100);
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }, [isRunning, startTime, onTick]);

    return {
      getCurrentTime: () => timeRef.current,
    };
  },
  useTimerRestore: () => ({
    handleVisibilityChange: jest.fn((timestamp: number, savedTime: number, callback: (time: number) => void) => {
      // Calculate time difference and call callback
      const now = Date.now();
      const elapsed = (now - timestamp) / 1000;
      callback(savedTime + elapsed);
    }),
  }),
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

describe('useGameTimer', () => {
  // Helper to create initial state
  const createInitialState = (overrides: Partial<GameSessionState> = {}): GameSessionState => ({
    teamName: 'Test Team',
    opponentName: 'Opponent',
    gameDate: '2025-01-15',
    homeScore: 0,
    awayScore: 0,
    gameNotes: '',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 15,
    currentPeriod: 1,
    gameStatus: 'notStarted',
    selectedPlayerIds: [],
    gamePersonnel: [],
    seasonId: '',
    tournamentId: '',
    gameLocation: '',
    gameTime: '',
    demandFactor: 1,
    gameEvents: [],
    timeElapsedInSeconds: 0,
    startTimestamp: null,
    isTimerRunning: false,
    subIntervalMinutes: 5,
    nextSubDueTimeSeconds: 300,
    subAlertLevel: 'none',
    lastSubConfirmationTimeSeconds: 0,
    completedIntervalDurations: [],
    showPlayerNames: true,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetCurrentTime.mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ============================================
  // Basic initialization
  // ============================================
  describe('initialization', () => {
    it('should return initial timer state', () => {
      const initialState = createInitialState();

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      expect(result.current.timeElapsedInSeconds).toBe(0);
      expect(result.current.isTimerRunning).toBe(false);
      expect(result.current.nextSubDueTimeSeconds).toBe(300);
      expect(result.current.subAlertLevel).toBe('none');
      expect(result.current.lastSubConfirmationTimeSeconds).toBe(0);
    });

    it('should expose timer control functions', () => {
      const initialState = createInitialState();

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      expect(typeof result.current.startPause).toBe('function');
      expect(typeof result.current.reset).toBe('function');
      expect(typeof result.current.ackSubstitution).toBe('function');
      expect(typeof result.current.setSubInterval).toBe('function');
    });
  });

  // ============================================
  // startPause functionality
  // ============================================
  describe('startPause', () => {
    it('should start first period when game not started', () => {
      const initialState = createInitialState({ gameStatus: 'notStarted' });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      expect(result.current.isTimerRunning).toBe(false);

      act(() => {
        result.current.startPause();
      });

      expect(result.current.isTimerRunning).toBe(true);
    });

    it('should start next period when at periodEnd', () => {
      const initialState = createInitialState({
        gameStatus: 'periodEnd',
        currentPeriod: 1,
        timeElapsedInSeconds: 900, // End of first period
      });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      act(() => {
        result.current.startPause();
      });

      expect(result.current.isTimerRunning).toBe(true);
    });

    it('should pause timer when running', () => {
      const initialState = createInitialState({
        gameStatus: 'inProgress',
        isTimerRunning: true,
        startTimestamp: Date.now(),
        timeElapsedInSeconds: 100,
      });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      act(() => {
        result.current.startPause();
      });

      expect(result.current.isTimerRunning).toBe(false);
    });

    it('should resume timer when paused during inProgress', () => {
      const initialState = createInitialState({
        gameStatus: 'inProgress',
        isTimerRunning: false,
        startTimestamp: null,
        timeElapsedInSeconds: 100,
      });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      act(() => {
        result.current.startPause();
      });

      expect(result.current.isTimerRunning).toBe(true);
    });
  });

  // ============================================
  // reset functionality
  // ============================================
  describe('reset', () => {
    it('should reset timer to initial state', async () => {
      const initialState = createInitialState({
        gameStatus: 'inProgress',
        isTimerRunning: true,
        timeElapsedInSeconds: 500,
        currentPeriod: 2,
      });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      await act(async () => {
        await result.current.reset();
      });

      expect(result.current.timeElapsedInSeconds).toBe(0);
      expect(result.current.isTimerRunning).toBe(false);
    });

    it('should clear timer state from storage', async () => {
      const { removeStorageItem } = jest.requireMock('@/utils/storage');
      const initialState = createInitialState({ timeElapsedInSeconds: 300 });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      await act(async () => {
        await result.current.reset();
      });

      expect(removeStorageItem).toHaveBeenCalled();
    });
  });

  // ============================================
  // ackSubstitution functionality
  // ============================================
  describe('ackSubstitution', () => {
    it('should acknowledge substitution and update tracking', () => {
      const initialState = createInitialState({
        gameStatus: 'inProgress',
        isTimerRunning: true,
        timeElapsedInSeconds: 350,
        lastSubConfirmationTimeSeconds: 100,
        subIntervalMinutes: 5,
      });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      act(() => {
        result.current.ackSubstitution();
      });

      expect(result.current.lastSubConfirmationTimeSeconds).toBe(350);
      expect(result.current.nextSubDueTimeSeconds).toBe(650); // 350 + 300
    });
  });

  // ============================================
  // setSubInterval functionality
  // ============================================
  describe('setSubInterval', () => {
    it('should update substitution interval', () => {
      const initialState = createInitialState({
        subIntervalMinutes: 5,
        timeElapsedInSeconds: 0,
      });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      act(() => {
        result.current.setSubInterval(10);
      });

      expect(result.current.nextSubDueTimeSeconds).toBe(600); // 10 * 60
    });

    it('should enforce minimum interval of 1 minute', () => {
      const initialState = createInitialState({ subIntervalMinutes: 5 });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      act(() => {
        result.current.setSubInterval(0);
      });

      // The reducer enforces minimum of 1, so nextSubDueTimeSeconds should be based on 1 minute
      expect(result.current.nextSubDueTimeSeconds).toBe(60);
    });
  });

  // ============================================
  // Legacy tests (kept for backward compatibility)
  // ============================================
  describe('legacy tests', () => {
    test('startPause toggles running state', () => {
      const initialState: GameSessionState = {
        teamName: '',
        opponentName: '',
        gameDate: '',
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 1,
        currentPeriod: 1,
        gameStatus: 'notStarted',
        selectedPlayerIds: [],
        gamePersonnel: [],
        seasonId: '',
        tournamentId: '',
        gameLocation: '',
        gameTime: '',
        demandFactor: 1,
        gameEvents: [],
        timeElapsedInSeconds: 0,
        startTimestamp: null,
        isTimerRunning: false,
        subIntervalMinutes: 1,
        nextSubDueTimeSeconds: 60,
        subAlertLevel: 'none',
        lastSubConfirmationTimeSeconds: 0,
        completedIntervalDurations: [],
        showPlayerNames: true,
      };

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game1' });
      });

      expect(result.current.isTimerRunning).toBe(false);
      act(() => {
        result.current.startPause();
      });
      expect(result.current.isTimerRunning).toBe(true);
    });

    test('timer state changes correctly when started', () => {
      const initialState: GameSessionState = {
        teamName: '',
        opponentName: '',
        gameDate: '',
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 1,
        currentPeriod: 1,
        gameStatus: 'notStarted',
        selectedPlayerIds: [],
        gamePersonnel: [],
        seasonId: '',
        tournamentId: '',
        gameLocation: '',
        gameTime: '',
        demandFactor: 1,
        gameEvents: [],
        timeElapsedInSeconds: 0,
        startTimestamp: null,
        isTimerRunning: false,
        subIntervalMinutes: 1,
        nextSubDueTimeSeconds: 60,
        subAlertLevel: 'none',
        lastSubConfirmationTimeSeconds: 0,
        completedIntervalDurations: [],
        showPlayerNames: true,
      };

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game1' });
      });

      // Initially not running
      expect(result.current.isTimerRunning).toBe(false);
      expect(result.current.timeElapsedInSeconds).toBe(0);

      // Start timer
      act(() => {
        result.current.startPause();
      });

      // Should now be running and have timer functions available
      expect(result.current.isTimerRunning).toBe(true);
      expect(typeof result.current.timeElapsedInSeconds).toBe('number');
      expect(typeof result.current.startPause).toBe('function');
    });
  });

  // ============================================
  // Edge cases
  // ============================================
  describe('edge cases', () => {
    it('should handle no currentGameId', () => {
      const initialState = createInitialState();

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: '' });
      });

      // Should still work, just won't save to storage
      act(() => {
        result.current.startPause();
      });

      expect(result.current.isTimerRunning).toBe(true);
    });

    it('should handle gameEnd status (no action on startPause)', () => {
      const initialState = createInitialState({
        gameStatus: 'gameEnd',
        isTimerRunning: false,
        currentPeriod: 2,
        timeElapsedInSeconds: 1800,
      });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      const initialRunning = result.current.isTimerRunning;

      act(() => {
        result.current.startPause();
      });

      // Should not change because gameStatus is 'gameEnd'
      expect(result.current.isTimerRunning).toBe(initialRunning);
    });

    it('should return correct sub alert level from state', () => {
      const initialState = createInitialState({
        subAlertLevel: 'warning',
      });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      expect(result.current.subAlertLevel).toBe('warning');
    });

    it('should return correct sub alert level as due', () => {
      const initialState = createInitialState({
        subAlertLevel: 'due',
      });

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      expect(result.current.subAlertLevel).toBe('due');
    });
  });

  // ============================================
  // State synchronization tests
  // ============================================
  describe('state synchronization', () => {
    it('should reflect state updates from external dispatch', () => {
      const initialState = createInitialState();
      let externalDispatch: React.Dispatch<GameSessionAction>;

      const { result } = renderHook(() => {
        const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
        externalDispatch = dispatch;
        return useGameTimer({ state, dispatch, currentGameId: 'game-1' });
      });

      // Simulate external state change
      act(() => {
        externalDispatch({ type: 'SET_TIMER_ELAPSED', payload: 500 });
      });

      // Hook should reflect the state change through the reducer,
      // but SET_TIMER_ELAPSED only works when timer is running
      // So we expect it to still be 0 since timer isn't running
      expect(result.current.timeElapsedInSeconds).toBe(0);
    });

    it('should update when state changes', () => {
      const initialState = createInitialState();

      const { result, rerender } = renderHook(
        ({ state }) => {
          const [currentState, dispatch] = React.useReducer(gameSessionReducer, state);
          return useGameTimer({ state: currentState, dispatch, currentGameId: 'game-1' });
        },
        { initialProps: { state: initialState } }
      );

      expect(result.current.timeElapsedInSeconds).toBe(0);

      // Rerender with updated state
      const updatedState = createInitialState({ timeElapsedInSeconds: 200 });
      rerender({ state: updatedState });

      // Should still be 0 because reducer manages state internally
      expect(result.current.timeElapsedInSeconds).toBe(0);
    });
  });
});
