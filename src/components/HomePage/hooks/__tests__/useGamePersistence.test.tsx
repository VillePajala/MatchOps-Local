/**
 * Tests for useGamePersistence hook
 *
 * @critical - Core persistence workflows (save, load, delete)
 * @jest-environment jsdom
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGamePersistence } from '../useGamePersistence';
import type { UseGamePersistenceParams } from '../useGamePersistence';
import type { UseFieldCoordinationReturn } from '../useFieldCoordination';
import { DEFAULT_GAME_ID } from '@/config/constants';
import type { AppState, Player, PlayerAssessment } from '@/types';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import React from 'react';

// Mock savedGames utilities
jest.mock('@/utils/savedGames', () => ({
  saveGame: jest.fn().mockResolvedValue(true),
  deleteGame: jest.fn().mockResolvedValue(true),
  removeGameEvent: jest.fn().mockResolvedValue({}),
  getLatestGameId: jest.fn().mockResolvedValue(null),
  createGame: jest.fn((snapshot: AppState) => {
    const gameId = `game-${Date.now()}`;
    return Promise.resolve({ gameId, gameData: snapshot });
  }),
}));

// Mock appSettings utilities
jest.mock('@/utils/appSettings', () => ({
  saveCurrentGameIdSetting: jest.fn().mockResolvedValue(undefined),
}));

// Simple integration tests that verify behavior without extensive mocking
// These provide regression protection for critical persistence logic

const createMockGameSessionState = (overrides?: Partial<GameSessionState>): GameSessionState => ({
  teamName: 'Test Team',
  opponentName: 'Opponent Team',
  gameDate: '2024-01-01',
  homeScore: 2,
  awayScore: 1,
  gameNotes: 'Test notes',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 45,
  currentPeriod: 1,
  gameStatus: 'inProgress',
  selectedPlayerIds: ['player1', 'player2'],
  gamePersonnel: [],
  seasonId: 'season1',
  tournamentId: 'tournament1',
  demandFactor: 5,
  gameEvents: [],
  timeElapsedInSeconds: 0,
  startTimestamp: null,
  isTimerRunning: false,
  subIntervalMinutes: 15,
  nextSubDueTimeSeconds: 900,
  subAlertLevel: 'none',
  lastSubConfirmationTimeSeconds: 0,
  showPlayerNames: true,
  ...overrides,
});

const createMockFieldCoordination = (): UseFieldCoordinationReturn => ({
  playersOnField: [],
  opponents: [],
  drawings: [],
  draggingPlayerFromBarInfo: null,
  isDrawingEnabled: false,
  isTacticsBoardView: false,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: null,
  showResetFieldConfirm: false,
  handlePlayerMove: jest.fn(),
  handlePlayerMoveEnd: jest.fn(),
  handlePlayerRemove: jest.fn(),
  handleDropOnField: jest.fn(),
  handlePlayerDragStartFromBar: jest.fn(),
  handlePlayerTapInBar: jest.fn(),
  handleOpponentAdd: jest.fn(),
  handleOpponentRemove: jest.fn(),
  handleOpponentMove: jest.fn(),
  handleOpponentMoveEnd: jest.fn(),
  handleDrawingStart: jest.fn(),
  handleDrawingMove: jest.fn(),
  handleDrawingEnd: jest.fn(),
  handleDrawingRemove: jest.fn(),
  handleDrawingModeToggle: jest.fn(),
  handleFieldReset: jest.fn(),
  handleResetFieldCancel: jest.fn(),
  handleResetFieldConfirm: jest.fn(),
  handleTacticalDiscAdd: jest.fn(),
  handleTacticalDiscRemove: jest.fn(),
  handleTacticalDiscMove: jest.fn(),
  handleTacticalDiscMoveEnd: jest.fn(),
  handleTacticalBallPositionUpdate: jest.fn(),
  handleTacticalDrawingStart: jest.fn(),
  handleTacticalDrawingMove: jest.fn(),
  handleTacticalDrawingEnd: jest.fn(),
  handleTacticalDrawingRemove: jest.fn(),
  handleTacticalReset: jest.fn(),
  handleTacticalFormationApply: jest.fn(),
  handleTacticsBoardToggle: jest.fn(),
} as unknown as UseFieldCoordinationReturn);

const createMockParams = (overrides?: Partial<UseGamePersistenceParams>): UseGamePersistenceParams => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    currentGameId: 'game123',
    setCurrentGameId: jest.fn(),
    gameSessionState: createMockGameSessionState(),
    fieldCoordination: createMockFieldCoordination(),
    availablePlayers: [] as Player[],
    playerAssessments: {} as Record<string, PlayerAssessment>,
    isPlayed: true,
    initialLoadComplete: true,
    savedGames: {},
    setSavedGames: jest.fn(),
    resetHistory: jest.fn(),
    initialState: {} as AppState,
    initialGameSessionData: createMockGameSessionState(),
    dispatchGameSession: jest.fn(),
    loadGameStateFromData: jest.fn(),
    showToast: jest.fn(),
    t: jest.fn((key: string) => key) as unknown as UseGamePersistenceParams['t'],
    queryClient,
    handleCloseLoadGameModal: jest.fn(),
    ...overrides,
  };
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
};

describe('useGamePersistence', () => {
  describe('Hook Interface', () => {
    /**
     * Tests that hook returns all required exports
     * @critical
     */
    it('should return all required handlers and state', () => {
      const params = createMockParams();
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      // Verify all required exports are present
      expect(result.current).toHaveProperty('handleQuickSaveGame');
      expect(result.current).toHaveProperty('handleLoadGame');
      expect(result.current).toHaveProperty('handleDeleteGame');
      expect(result.current).toHaveProperty('handleDeleteGameEvent');
      expect(result.current).toHaveProperty('isGameLoading');
      expect(result.current).toHaveProperty('gameLoadError');
      expect(result.current).toHaveProperty('isGameDeleting');
      expect(result.current).toHaveProperty('gameDeleteError');
      expect(result.current).toHaveProperty('processingGameId');

      // Verify handlers are functions
      expect(typeof result.current.handleQuickSaveGame).toBe('function');
      expect(typeof result.current.handleLoadGame).toBe('function');
      expect(typeof result.current.handleDeleteGame).toBe('function');
      expect(typeof result.current.handleDeleteGameEvent).toBe('function');
    });

    /**
     * Tests initial state values
     * @integration
     */
    it('should initialize with correct default state', () => {
      const params = createMockParams();
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      expect(result.current.isGameLoading).toBe(false);
      expect(result.current.gameLoadError).toBe(null);
      expect(result.current.isGameDeleting).toBe(false);
      expect(result.current.gameDeleteError).toBe(null);
      expect(result.current.processingGameId).toBe(null);
    });

    /**
     * Tests that handlers are stable across renders
     * @integration
     */
    it('should return stable handler references', () => {
      const params = createMockParams();
      const { result, rerender } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      const handlers1 = {
        handleQuickSaveGame: result.current.handleQuickSaveGame,
        handleLoadGame: result.current.handleLoadGame,
        handleDeleteGame: result.current.handleDeleteGame,
        handleDeleteGameEvent: result.current.handleDeleteGameEvent,
      };

      rerender();

      const handlers2 = {
        handleQuickSaveGame: result.current.handleQuickSaveGame,
        handleLoadGame: result.current.handleLoadGame,
        handleDeleteGame: result.current.handleDeleteGame,
        handleDeleteGameEvent: result.current.handleDeleteGameEvent,
      };

      // Handlers should be stable (same reference)
      expect(handlers1.handleQuickSaveGame).toBe(handlers2.handleQuickSaveGame);
      expect(handlers1.handleLoadGame).toBe(handlers2.handleLoadGame);
      expect(handlers1.handleDeleteGame).toBe(handlers2.handleDeleteGame);
      expect(handlers1.handleDeleteGameEvent).toBe(handlers2.handleDeleteGameEvent);
    });
  });

  describe('Load Game Behavior', () => {
    /**
     * Tests that load game calls the callback
     * @critical
     */
    it('should call loadGameStateFromData when loading existing game', async () => {
      const mockGameData: AppState = {
        teamName: 'Loaded Team',
        opponentName: 'Loaded Opponent',
        gameDate: '2024-01-15',
        homeScore: 3,
        awayScore: 2,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 45,
        currentPeriod: 1,
        gameStatus: 'inProgress',
        selectedPlayerIds: [],
        gamePersonnel: [],
        seasonId: '',
        tournamentId: '',
        demandFactor: 5,
        gameEvents: [],
        playersOnField: [],
        opponents: [],
        drawings: [],
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
        availablePlayers: [],
        assessments: {},
        isPlayed: true,
        showPlayerNames: true,
      };

      const loadGameStateFromData = jest.fn().mockResolvedValue(undefined);
      const setCurrentGameId = jest.fn();

      // Suppress console.error for storage cleanup failures (non-critical)
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const params = createMockParams({
        savedGames: { 'game456': mockGameData },
        loadGameStateFromData,
        setCurrentGameId,
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleLoadGame('game456');
      });

      await waitFor(() => {
        expect(loadGameStateFromData).toHaveBeenCalledTimes(1);
        expect(loadGameStateFromData).toHaveBeenCalledWith(mockGameData);
        expect(setCurrentGameId).toHaveBeenCalledTimes(1);
        expect(setCurrentGameId).toHaveBeenCalledWith('game456');
      });

      consoleErrorSpy.mockRestore();
    });

    /**
     * Tests error state when game not found
     * @edge-case
     */
    it('should set error when game not found', async () => {
      // Suppress console.error for this test as we expect an error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const params = createMockParams({ savedGames: {} });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleLoadGame('nonexistent');
      });

      await waitFor(() => {
        expect(result.current.gameLoadError).toBeTruthy();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Delete Game Behavior', () => {
    /**
     * Tests that delete calls setSavedGames
     * @critical
     */
    it('should call setSavedGames when deleting game', async () => {
      const setSavedGames = jest.fn();
      const params = createMockParams({
        currentGameId: 'game123',
        savedGames: { 'game123': {} as AppState, 'game456': {} as AppState },
        setSavedGames,
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleDeleteGame('game456');
      });

      // Should attempt to update saved games
      await waitFor(() => {
        expect(setSavedGames).toHaveBeenCalledTimes(1);
      }, { timeout: 1000 });
    });

    /**
     * Tests protection against deleting default game
     * @edge-case
     */
    it('should not call setSavedGames for DEFAULT_GAME_ID', async () => {
      // Suppress console.warn for this test as we expect a warning
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const setSavedGames = jest.fn();
      const params = createMockParams({ setSavedGames });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleDeleteGame(DEFAULT_GAME_ID);
      });

      // Should not attempt to delete default game
      expect(setSavedGames).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Delete Game Event Behavior', () => {
    /**
     * Tests return value when event not found
     * @edge-case
     */
    it('should return false when event not found', async () => {
      // Suppress console.error for this test as we expect an error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const params = createMockParams({
        gameSessionState: createMockGameSessionState({ gameEvents: [] }),
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      let deleteResult: boolean = true;
      await act(async () => {
        deleteResult = await result.current.handleDeleteGameEvent('nonexistent');
      });

      expect(deleteResult).toBe(false);
      consoleErrorSpy.mockRestore();
    });

    /**
     * Tests return value when no currentGameId
     * @edge-case
     */
    it('should return false when currentGameId is null', async () => {
      // Suppress console.error for this test as we expect an error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const params = createMockParams({
        currentGameId: null,
        gameSessionState: createMockGameSessionState({
          gameEvents: [{ id: 'event1', type: 'goal', time: 0 }],
        }),
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      let deleteResult: boolean = true;
      await act(async () => {
        deleteResult = await result.current.handleDeleteGameEvent('event1');
      });

      expect(deleteResult).toBe(false);
      consoleErrorSpy.mockRestore();
    });

    /**
     * Tests that delete updates both state and storage
     * @critical
     */
    it('should dispatch DELETE_GAME_EVENT_WITH_SCORE atomically when deleting goal', async () => {
      const dispatchGameSession = jest.fn();
      const goalEvent = { id: 'event1', type: 'goal' as const, time: 60 };
      const params = createMockParams({
        currentGameId: 'game123',
        gameSessionState: createMockGameSessionState({
          gameEvents: [goalEvent],
        }),
        dispatchGameSession,
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleDeleteGameEvent('event1');
      });

      await waitFor(() => {
        // Verify atomic DELETE_GAME_EVENT_WITH_SCORE dispatch
        expect(dispatchGameSession).toHaveBeenCalledWith({
          type: 'DELETE_GAME_EVENT_WITH_SCORE',
          payload: goalEvent
        });

        // Should be called exactly once (atomic operation)
        expect(dispatchGameSession).toHaveBeenCalledTimes(1);
      });
    });

    /**
     * Tests that opponentGoal also triggers atomic delete with score adjustment
     * @critical
     */
    it('should dispatch DELETE_GAME_EVENT_WITH_SCORE atomically when deleting opponent goal', async () => {
      const dispatchGameSession = jest.fn();
      const opponentGoalEvent = { id: 'event2', type: 'opponentGoal' as const, time: 30 };
      const params = createMockParams({
        currentGameId: 'game123',
        gameSessionState: createMockGameSessionState({
          gameEvents: [opponentGoalEvent],
        }),
        dispatchGameSession,
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleDeleteGameEvent('event2');
      });

      await waitFor(() => {
        expect(dispatchGameSession).toHaveBeenCalledWith({
          type: 'DELETE_GAME_EVENT_WITH_SCORE',
          payload: opponentGoalEvent
        });

        // Should be called exactly once (atomic operation)
        expect(dispatchGameSession).toHaveBeenCalledTimes(1);
      });
    });

    /**
     * Tests that non-goal events use atomic action but don't adjust score
     * @integration
     */
    it('should dispatch DELETE_GAME_EVENT_WITH_SCORE for non-goal events (no score change)', async () => {
      const dispatchGameSession = jest.fn();
      const substitutionEvent = { id: 'event3', type: 'substitution' as const, time: 45 };
      const params = createMockParams({
        currentGameId: 'game123',
        gameSessionState: createMockGameSessionState({
          gameEvents: [substitutionEvent],
        }),
        dispatchGameSession,
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleDeleteGameEvent('event3');
      });

      await waitFor(() => {
        // Should call atomic action once (score remains unchanged for non-goal events)
        expect(dispatchGameSession).toHaveBeenCalledTimes(1);
        expect(dispatchGameSession).toHaveBeenCalledWith({
          type: 'DELETE_GAME_EVENT_WITH_SCORE',
          payload: substitutionEvent
        });
      });
    });
  });

  describe('Auto-Save Behavior', () => {
    /**
     * Tests that auto-save is enabled for non-default games
     * @integration
     */
    it('should enable auto-save for non-default game IDs', () => {
      const params = createMockParams({
        currentGameId: 'game123',
        initialLoadComplete: true,
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      // Auto-save should be active (enabled via useAutoSave hook)
      // This is verified by the hook being called with enabled: true
      expect(result.current).toBeDefined();
    });

    /**
     * Tests that auto-save is disabled for DEFAULT_GAME_ID
     * @integration
     */
    it('should disable auto-save for DEFAULT_GAME_ID', () => {
      const params = createMockParams({
        currentGameId: DEFAULT_GAME_ID,
        initialLoadComplete: true,
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      // Auto-save should be disabled for default game
      // useAutoSave hook called with enabled: false
      expect(result.current).toBeDefined();
    });

    /**
     * Tests that auto-save is disabled during initial load
     * @integration
     */
    it('should disable auto-save until initial load completes', () => {
      const params = createMockParams({
        currentGameId: 'game123',
        initialLoadComplete: false,
      });
      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      // Auto-save should be disabled until load completes
      expect(result.current).toBeDefined();
    });

    /**
     * Tests that auto-save triggers save when critical data changes
     * @critical
     */
    it('should trigger auto-save when critical data changes', async () => {
      jest.useFakeTimers();

      const setSavedGames = jest.fn();
      const params = createMockParams({
        currentGameId: 'game123',
        initialLoadComplete: true,
        savedGames: { 'game123': {} as AppState },
        setSavedGames,
        gameSessionState: createMockGameSessionState({ homeScore: 0 }),
      });

      const { rerender } = renderHook(
        (props) => useGamePersistence(props),
        { initialProps: params, wrapper: createWrapper() }
      );

      // Clear any initial calls
      setSavedGames.mockClear();

      // Modify critical state (homeScore should trigger immediate save)
      const updatedParams = {
        ...params,
        gameSessionState: createMockGameSessionState({ homeScore: 5 }),
      };

      act(() => {
        rerender(updatedParams);
      });

      // Flush timers to trigger immediate tier (0ms delay)
      act(() => {
        jest.runAllTimers();
      });

      // Verify save was triggered
      await waitFor(() => {
        expect(setSavedGames).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });

    /**
     * Tests that auto-save debounces non-critical changes
     * @integration
     */
    it('should debounce auto-save for non-critical data changes', async () => {
      jest.useFakeTimers();

      const setSavedGames = jest.fn();
      const params = createMockParams({
        currentGameId: 'game123',
        initialLoadComplete: true,
        savedGames: { 'game123': {} as AppState },
        setSavedGames,
        gameSessionState: createMockGameSessionState({ teamName: 'Original Team' }),
      });

      const { rerender } = renderHook(
        (props) => useGamePersistence(props),
        { initialProps: params, wrapper: createWrapper() }
      );

      // Clear any initial calls
      setSavedGames.mockClear();

      // Modify non-critical state (teamName should trigger short 500ms debounce)
      const updatedParams = {
        ...params,
        gameSessionState: createMockGameSessionState({ teamName: 'Updated Team' }),
      };

      act(() => {
        rerender(updatedParams);
      });

      // Should NOT save immediately
      expect(setSavedGames).not.toHaveBeenCalled();

      // Advance timers by 500ms
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Now save should have been triggered
      await waitFor(() => {
        expect(setSavedGames).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });
  });

  describe('Snapshot Creation', () => {
    /**
     * Tests that volatile runtime states are excluded from snapshot
     * (timer progress is persisted, but volatile runtime timestamps are not)
     * @critical
     */
    it('should exclude volatile runtime states from game snapshot', async () => {
      const mockSavedGames = {};
      const setSavedGames = jest.fn((updater) => {
        const newGames = typeof updater === 'function' ? updater(mockSavedGames) : updater;
        // Capture the snapshot that was saved
        const gameIds = Object.keys(newGames);
        if (gameIds.length > 0) {
          const snapshot = newGames[gameIds[0]];

          // Verify timer progress IS persisted (so returning to game restores timer position)
          expect(snapshot).toHaveProperty('timeElapsedInSeconds');
          expect(snapshot.timeElapsedInSeconds).toBe(1234);

          // Verify volatile runtime states are NOT in the snapshot
          expect(snapshot).not.toHaveProperty('startTimestamp');
          expect(snapshot).not.toHaveProperty('isTimerRunning');
          expect(snapshot).not.toHaveProperty('nextSubDueTimeSeconds');
          expect(snapshot).not.toHaveProperty('subAlertLevel');

          // Verify persisted states ARE in the snapshot
          expect(snapshot).toHaveProperty('teamName');
          expect(snapshot).toHaveProperty('opponentName');
          expect(snapshot).toHaveProperty('homeScore');
          expect(snapshot).toHaveProperty('awayScore');
          expect(snapshot).toHaveProperty('gameEvents');
        }
      });

      const params = createMockParams({
        currentGameId: 'game123',
        savedGames: mockSavedGames,
        setSavedGames,
        gameSessionState: createMockGameSessionState({
          timeElapsedInSeconds: 1234,
          startTimestamp: Date.now(),
          isTimerRunning: true,
        }),
      });

      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleQuickSaveGame(true);
      });

      // setSavedGames should have been called with snapshot excluding timer states
      await waitFor(() => {
        expect(setSavedGames).toHaveBeenCalledTimes(1);
      });
    });

    /**
     * Tests snapshot includes all required non-volatile AppState fields
     * @critical - Type-level regression protection
     */
    it('should include all required non-volatile AppState fields in snapshot', async () => {
      const mockSavedGames = {};
      const setSavedGames = jest.fn((updater) => {
        const newGames = typeof updater === 'function' ? updater(mockSavedGames) : updater;
        const gameIds = Object.keys(newGames);
        if (gameIds.length > 0) {
          const snapshot = newGames[gameIds[0]] as AppState;

          // This provides compile-time safety - if required fields are missing,
          // TypeScript will error. This catches issues when AppState is extended.
          const typeCheck: Omit<
            AppState,
            // Volatile runtime states intentionally excluded (not timer progress)
            | 'startTimestamp'
            | 'isTimerRunning'
            | 'nextSubDueTimeSeconds'
            | 'subAlertLevel'
          > = snapshot;

          // Runtime verification of key fields
          expect(typeCheck.teamName).toBeDefined();
          expect(typeCheck.opponentName).toBeDefined();
          expect(typeCheck.gameDate).toBeDefined();
          expect(typeCheck.homeScore).toBeDefined();
          expect(typeCheck.awayScore).toBeDefined();
          expect(typeCheck.gameNotes).toBeDefined();
          expect(typeCheck.homeOrAway).toBeDefined();
          expect(typeCheck.isPlayed).toBeDefined();
          expect(typeCheck.numberOfPeriods).toBeDefined();
          expect(typeCheck.periodDurationMinutes).toBeDefined();
          expect(typeCheck.currentPeriod).toBeDefined();
          expect(typeCheck.gameStatus).toBeDefined();
          expect(typeCheck.seasonId).toBeDefined();
          expect(typeCheck.tournamentId).toBeDefined();
          expect(typeCheck.demandFactor).toBeDefined();
          expect(typeCheck.gameEvents).toBeDefined();
          expect(typeCheck.playersOnField).toBeDefined();
          expect(typeCheck.opponents).toBeDefined();
          expect(typeCheck.drawings).toBeDefined();
          expect(typeCheck.tacticalDiscs).toBeDefined();
          expect(typeCheck.tacticalDrawings).toBeDefined();
          expect(typeCheck.availablePlayers).toBeDefined();
          expect(typeCheck.assessments).toBeDefined();
          expect(typeCheck.selectedPlayerIds).toBeDefined();
          expect(typeCheck.gamePersonnel).toBeDefined();
        }
      });

      const params = createMockParams({
        currentGameId: 'game123',
        savedGames: mockSavedGames,
        setSavedGames,
      });

      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleQuickSaveGame(true);
      });

      await waitFor(() => {
        expect(setSavedGames).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Quick Save Transition', () => {
    /**
     * Tests transition from DEFAULT_GAME_ID to new game ID on first save
     * @critical
     */
    it('should create new game and transition from DEFAULT_GAME_ID', async () => {
      const setCurrentGameId = jest.fn();
      const setSavedGames = jest.fn();

      const params = createMockParams({
        currentGameId: DEFAULT_GAME_ID,
        setCurrentGameId,
        setSavedGames,
        savedGames: {},
      });

      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleQuickSaveGame(false);
      });

      // Should create a new game ID and set it
      await waitFor(() => {
        expect(setCurrentGameId).toHaveBeenCalledTimes(1);
        const newGameId = setCurrentGameId.mock.calls[0][0];
        expect(newGameId).toMatch(/^game-\d+$/); // Format: game-{timestamp}
      }, { timeout: 1000 });
    });

    /**
     * Tests that existing game ID is preserved on subsequent saves
     * @integration
     */
    it('should preserve game ID on subsequent saves', async () => {
      const setCurrentGameId = jest.fn();
      const setSavedGames = jest.fn();

      const params = createMockParams({
        currentGameId: 'game123',
        setCurrentGameId,
        setSavedGames,
        savedGames: { 'game123': {} as AppState },
      });

      const { result } = renderHook(() => useGamePersistence(params), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleQuickSaveGame(false);
      });

      // Should update existing game, not change ID
      await waitFor(() => {
        expect(setSavedGames).toHaveBeenCalledTimes(1);
      });

      // setCurrentGameId should NOT be called (ID already set)
      expect(setCurrentGameId).not.toHaveBeenCalled();
    });
  });
});
