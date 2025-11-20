/**
 * useGamePersistence Hook
 *
 * **Purpose**: Game save/load/delete and auto-save management
 *
 * **Responsibilities**:
 * - Auto-save game state with 3-tier debouncing (immediate/short/long)
 * - Quick save handler (manual save with toast)
 * - Load game from saved games
 * - Delete saved games
 * - Current game ID management
 * - Storage operations and React Query cache invalidation
 *
 * **Auto-Save Strategy**:
 * - **Immediate** (0ms): Critical data (goals, scores) - saves instantly
 * - **Short** (500ms): User-visible metadata (names, notes) - quick save
 * - **Long** (2000ms): Tactical data (positions, drawings) - delayed save
 *
 * **Dependencies**:
 * - useGameDataManagement: Provides savedGames state and mutations
 * - useGameSessionCoordination: Provides game session state
 * - useFieldCoordination: Provides field state (players, opponents, drawings)
 * - useHistory: Provides history management (reset after save/load)
 *
 * @module useGamePersistence
 * @category HomePage Hooks
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TFunction } from 'i18next';
import type { QueryClient } from '@tanstack/react-query';
import { useAutoSave } from '@/hooks/useAutoSave';
import type { AppState, GameEvent, PlayerAssessment, Player } from '@/types';
import type { GameSessionState, GameSessionAction } from '@/hooks/useGameSessionReducer';
import type { UseFieldCoordinationReturn } from './useFieldCoordination';
import {
  saveGame as utilSaveGame,
  deleteGame as utilDeleteGame,
  removeGameEvent,
  getLatestGameId,
  createGame as utilCreateGame,
} from '@/utils/savedGames';
import { saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting } from '@/utils/appSettings';
import { removeStorageItem } from '@/utils/storage';
import { TIMER_STATE_KEY } from '@/config/storageKeys';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { queryKeys } from '@/config/queryKeys';
import logger from '@/utils/logger';

/**
 * Parameters for useGamePersistence hook
 */
export interface UseGamePersistenceParams {
  // Current game ID (managed externally for usePlayerAssessments dependency)
  currentGameId: string | null;
  setCurrentGameId: React.Dispatch<React.SetStateAction<string | null>>;

  // State from other hooks
  gameSessionState: GameSessionState;
  fieldCoordination: UseFieldCoordinationReturn;
  availablePlayers: Player[];
  playerAssessments: Record<string, PlayerAssessment>;
  isPlayed: boolean;
  initialLoadComplete: boolean;

  // From useGameDataManagement
  savedGames: Record<string, AppState>;
  setSavedGames: React.Dispatch<React.SetStateAction<Record<string, AppState>>>;

  // History management
  resetHistory: (state: AppState) => void;

  // Initial state for resets
  initialState: AppState;
  initialGameSessionData: GameSessionState;

  // Callbacks
  dispatchGameSession: React.Dispatch<GameSessionAction>;
  loadGameStateFromData: (data: AppState) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  t: TFunction;

  // Query client for cache invalidation
  queryClient: QueryClient;

  // Modal control
  handleCloseLoadGameModal: () => void;
}

/**
 * Return type for useGamePersistence hook
 */
export interface UseGamePersistenceReturn {
  // Load game state
  isGameLoading: boolean;
  gameLoadError: string | null;
  processingGameId: string | null;

  // Delete game state
  isGameDeleting: boolean;
  gameDeleteError: string | null;

  // Handlers
  handleQuickSaveGame: (silent?: boolean) => Promise<void>;
  handleLoadGame: (gameId: string) => Promise<void>;
  handleDeleteGame: (gameId: string) => Promise<void>;
  handleDeleteGameEvent: (goalId: string) => Promise<boolean>;
}

/**
 * Custom hook for game persistence operations
 *
 * Manages all game save/load/delete operations, auto-save with 3-tier debouncing,
 * and current game ID tracking.
 *
 * @example
 * ```tsx
 * const persistence = useGamePersistence({
 *   currentGameId,
 *   setCurrentGameId,
 *   gameSessionState,
 *   fieldCoordination,
 *   availablePlayers,
 *   playerAssessments,
 *   isPlayed,
 *   initialLoadComplete,
 *   savedGames,
 *   setSavedGames,
 *   resetHistory,
 *   initialState,
 *   initialGameSessionData,
 *   dispatchGameSession,
 *   loadGameStateFromData,
 *   showToast,
 *   t,
 *   queryClient,
 *   handleCloseLoadGameModal,
 * });
 *
 * // Use the hook's exports
 * <Button onClick={() => persistence.handleQuickSaveGame()}>Save Game</Button>
 * ```
 */
export function useGamePersistence({
  currentGameId,
  setCurrentGameId,
  gameSessionState,
  fieldCoordination,
  availablePlayers,
  playerAssessments,
  isPlayed,
  initialLoadComplete,
  savedGames,
  setSavedGames,
  resetHistory,
  initialState,
  initialGameSessionData,
  dispatchGameSession,
  loadGameStateFromData,
  showToast,
  t,
  queryClient,
  handleCloseLoadGameModal,
}: UseGamePersistenceParams): UseGamePersistenceReturn {

  // --- Load/Delete Game UI State ---
  const [isGameLoading, setIsGameLoading] = useState(false);
  const [gameLoadError, setGameLoadError] = useState<string | null>(null);
  const [isGameDeleting, setIsGameDeleting] = useState(false);
  const [gameDeleteError, setGameDeleteError] = useState<string | null>(null);
  const [processingGameId, setProcessingGameId] = useState<string | null>(null);

  // --- Helper: Create AppState Snapshot ---
  /**
   * Creates a snapshot of current game state for persistence
   *
   * Excludes volatile timer states (timeElapsedInSeconds, isTimerRunning, etc.)
   * which are re-initialized on load by the reducer.
   */
  const createGameSnapshot = useCallback((): AppState => {
    return {
      // From gameSessionState (persisted fields)
      teamName: gameSessionState.teamName,
      opponentName: gameSessionState.opponentName,
      gameDate: gameSessionState.gameDate,
      homeScore: gameSessionState.homeScore,
      awayScore: gameSessionState.awayScore,
      gameNotes: gameSessionState.gameNotes,
      homeOrAway: gameSessionState.homeOrAway,
      isPlayed,
      numberOfPeriods: gameSessionState.numberOfPeriods,
      periodDurationMinutes: gameSessionState.periodDurationMinutes,
      currentPeriod: gameSessionState.currentPeriod,
      gameStatus: gameSessionState.gameStatus,
      seasonId: gameSessionState.seasonId,
      tournamentId: gameSessionState.tournamentId,
      teamId: gameSessionState.teamId,
      gameLocation: gameSessionState.gameLocation,
      gameTime: gameSessionState.gameTime,
      demandFactor: gameSessionState.demandFactor,
      subIntervalMinutes: gameSessionState.subIntervalMinutes,
      completedIntervalDurations: gameSessionState.completedIntervalDurations,
      lastSubConfirmationTimeSeconds: gameSessionState.lastSubConfirmationTimeSeconds,
      showPlayerNames: gameSessionState.showPlayerNames,
      selectedPlayerIds: gameSessionState.selectedPlayerIds,
      gamePersonnel: gameSessionState.gamePersonnel ?? [],
      gameEvents: gameSessionState.gameEvents,
      assessments: playerAssessments,

      // From fieldCoordination
      playersOnField: fieldCoordination.playersOnField,
      opponents: fieldCoordination.opponents,
      drawings: fieldCoordination.drawings,
      tacticalDiscs: fieldCoordination.tacticalDiscs,
      tacticalDrawings: fieldCoordination.tacticalDrawings,
      tacticalBallPosition: fieldCoordination.tacticalBallPosition,

      // Per-game roster
      availablePlayers,

      // Volatile timer states are intentionally EXCLUDED from the snapshot
      // They are re-initialized on load by the reducer
    };
  }, [
    gameSessionState,
    fieldCoordination.playersOnField,
    fieldCoordination.opponents,
    fieldCoordination.drawings,
    fieldCoordination.tacticalDiscs,
    fieldCoordination.tacticalDrawings,
    fieldCoordination.tacticalBallPosition,
    availablePlayers,
    playerAssessments,
    isPlayed,
  ]);

  // --- Quick Save Handler ---
  /**
   * Manual save triggered by user action (Ctrl+S, Save button)
   * Also used by auto-save (with silent=true)
   *
   * Creates new game if currentGameId is default, otherwise updates existing game.
   * Resets undo/redo history after save to reflect saved state.
   *
   * @param silent - If true, suppresses success toast (for auto-save)
   */
  const handleQuickSaveGame = useCallback(async (silent = false) => {
    if (currentGameId && currentGameId !== DEFAULT_GAME_ID) {
      logger.log(`Quick saving game with ID: ${currentGameId}${silent ? ' (silent)' : ''}`, {
        teamId: gameSessionState.teamId,
        tournamentId: gameSessionState.tournamentId,
      });

      try {
        const currentSnapshot = createGameSnapshot();

        // Update savedGames state and storage
        const updatedSavedGames = { ...savedGames, [currentGameId]: currentSnapshot };
        setSavedGames(updatedSavedGames);
        await utilSaveGame(currentGameId, currentSnapshot);
        await utilSaveCurrentGameIdSetting(currentGameId);

        // Invalidate React Query cache
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

        // Reset history to reflect saved state (clears undo/redo)
        resetHistory(currentSnapshot);

        if (!silent) {
          showToast(t('loadGameModal.gameSaved', 'Game saved!'));
        }

      } catch (error) {
        logger.error("Failed to quick save game state:", error);
        showToast(t('loadGameModal.errors.quickSaveFailed', 'Error quick saving game.'), 'error');
      }
    } else {
      // No current game ID - create new saved game entry using utility
      try {
        const newSnapshot = createGameSnapshot();

        // Use createGame utility (DRY principle)
        const { gameId: newGameId, gameData } = await utilCreateGame(newSnapshot);

        // Update local state
        setSavedGames(prev => ({ ...prev, [newGameId]: gameData }));
        setCurrentGameId(newGameId);
        await utilSaveCurrentGameIdSetting(newGameId);

        // Invalidate React Query cache
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

        // Reset history to new game state
        resetHistory(gameData);

        if (!silent) {
          showToast(t('loadGameModal.newGameSaved', 'New game saved!'));
        }

        logger.log(`New game created with ID: ${newGameId}`);

      } catch (error) {
        logger.error("Failed to create new saved game:", error);
        showToast(t('loadGameModal.errors.createGameFailed', 'Error creating new saved game.'), 'error');
      }
    }
  }, [
    currentGameId,
    setCurrentGameId,
    gameSessionState.teamId,
    gameSessionState.tournamentId,
    createGameSnapshot,
    savedGames,
    setSavedGames,
    queryClient,
    resetHistory,
    showToast,
    t,
  ]);

  // --- Auto-Save Function Ref ---
  /**
   * Ref-based save function to prevent stale closure race conditions
   *
   * This ensures useAutoSave always calls the latest version of handleQuickSaveGame,
   * even if dependencies change during the debounce period.
   */
  const autoSaveFnRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    autoSaveFnRef.current = () => handleQuickSaveGame(true);
  }, [handleQuickSaveGame]);

  // --- 3-Tier Debounced Auto-Save ---
  /**
   * Smart auto-save with tiered debouncing:
   * - Immediate: Goals, scores (critical statistics)
   * - Short (500ms): Names, notes (user-visible metadata)
   * - Long (2000ms): Field positions, drawings (tactical data)
   */
  useAutoSave({
    immediate: {
      // Critical for statistics - save instantly
      states: {
        gameEvents: gameSessionState.gameEvents,
        homeScore: gameSessionState.homeScore,
        awayScore: gameSessionState.awayScore,
      },
      delay: 0,
    },
    short: {
      // User-visible metadata - feels instant
      states: {
        teamName: gameSessionState.teamName,
        opponentName: gameSessionState.opponentName,
        gameNotes: gameSessionState.gameNotes,
        assessments: playerAssessments,
      },
      delay: 500,
    },
    long: {
      // Tactical data - debounce for performance
      states: {
        playersOnField: fieldCoordination.playersOnField,
        opponents: fieldCoordination.opponents,
        drawings: fieldCoordination.drawings,
        tacticalDiscs: fieldCoordination.tacticalDiscs,
        tacticalDrawings: fieldCoordination.tacticalDrawings,
        tacticalBallPosition: fieldCoordination.tacticalBallPosition,
      },
      delay: 2000,
    },
    saveFunction: () => autoSaveFnRef.current(), // Ref-based to prevent stale closures
    enabled: initialLoadComplete && currentGameId !== DEFAULT_GAME_ID,
    currentGameId,
  });

  // --- Load Game Handler ---
  /**
   * Load a saved game by ID
   *
   * Clears timer state, loads game data via reducer, updates current game ID.
   * Closes load game modal on success.
   *
   * @param gameId - ID of game to load
   */
  const handleLoadGame = useCallback(async (gameId: string) => {
    logger.log(`[handleLoadGame] Attempting to load game: ${gameId}`);

    // Clear any existing timer state before loading a new game
    try {
      await removeStorageItem(TIMER_STATE_KEY);
    } catch (error) {
      // Safe to ignore: Timer state will be overwritten by the loaded game's state.
      // Cleanup failure doesn't block game loading or affect UX.
      logger.debug('Failed to clear timer state before loading game (non-critical)', { error });
    }

    setProcessingGameId(gameId);
    setIsGameLoading(true);
    setGameLoadError(null);

    const gameDataToLoad = savedGames[gameId] as AppState | undefined;

    if (gameDataToLoad) {
      try {
        // Dispatch to reducer to load the game state
        await loadGameStateFromData(gameDataToLoad);

        // Update current game ID and save settings
        setCurrentGameId(gameId);
        await utilSaveCurrentGameIdSetting(gameId);

        logger.log(`Game ${gameId} load dispatched to reducer.`);
        handleCloseLoadGameModal();

      } catch(error) {
        logger.error("Error processing game load:", error);
        setGameLoadError(t('loadGameModal.errors.loadFailed', 'Error loading game state. Please try again.'));
      } finally {
        setIsGameLoading(false);
        setProcessingGameId(null);
      }
    } else {
      logger.error(`Game state not found for ID: ${gameId}`);
      setGameLoadError(t('loadGameModal.errors.notFound', 'Could not find saved game: {gameId}', { gameId }));
      setIsGameLoading(false);
      setProcessingGameId(null);
    }
  }, [
    savedGames,
    setCurrentGameId,
    loadGameStateFromData,
    handleCloseLoadGameModal,
    t,
  ]);

  // --- Delete Game Handler ---
  /**
   * Delete a saved game by ID
   *
   * Cannot delete the default game. If deleting the currently loaded game,
   * loads the latest remaining game or resets to initial state.
   *
   * @param gameId - ID of game to delete
   */
  const handleDeleteGame = useCallback(async (gameId: string) => {
    logger.log(`Deleting game with ID: ${gameId}`);

    if (gameId === DEFAULT_GAME_ID) {
      logger.warn("Cannot delete the default unsaved state.");
      setGameDeleteError(t('loadGameModal.errors.cannotDeleteDefault', 'Cannot delete the current unsaved game progress.'));
      return;
    }

    setGameDeleteError(null);
    setIsGameDeleting(true);
    setProcessingGameId(gameId);

    try {
      const deletedGameId = await utilDeleteGame(gameId);

      if (deletedGameId) {
        const updatedSavedGames = { ...savedGames };
        delete updatedSavedGames[gameId];
        setSavedGames(updatedSavedGames);

        logger.log(`Game ${gameId} deleted from state and persistence.`);

        // Invalidate React Query cache
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

        // If deleted the currently loaded game, load latest or reset
        if (currentGameId === gameId) {
          const latestId = getLatestGameId(updatedSavedGames);

          if (latestId) {
            logger.log(`Deleted active game. Loading latest game ${latestId}.`);
            setCurrentGameId(latestId);
            await utilSaveCurrentGameIdSetting(latestId);
          } else {
            logger.log("Currently loaded game was deleted with no other games remaining. Resetting to initial state.");
            dispatchGameSession({ type: 'RESET_TO_INITIAL_STATE', payload: initialGameSessionData });
            fieldCoordination.setPlayersOnField(initialState.playersOnField || []);
            fieldCoordination.setOpponents(initialState.opponents || []);
            fieldCoordination.setDrawings(initialState.drawings || []);
            resetHistory(initialState as AppState);
            setCurrentGameId(DEFAULT_GAME_ID);
            await utilSaveCurrentGameIdSetting(DEFAULT_GAME_ID);
          }
        }
      } else {
        logger.warn(`handleDeleteGame: utilDeleteGame returned null for gameId: ${gameId}. Game might not have been found or ID was invalid.`);
        setGameDeleteError(t('loadGameModal.errors.deleteFailedNotFound', 'Error deleting game: {gameId}. Game not found or ID was invalid.', { gameId }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setGameDeleteError(t('loadGameModal.errors.deleteFailedCatch', 'Error deleting saved game: {gameId}. Details: {errorMessage}', { gameId, errorMessage }));
    } finally {
      setIsGameDeleting(false);
      setProcessingGameId(null);
    }
  }, [
    savedGames,
    setSavedGames,
    currentGameId,
    setCurrentGameId,
    dispatchGameSession,
    initialGameSessionData,
    fieldCoordination,
    initialState,
    resetHistory,
    queryClient,
    t,
  ]);

  // --- Delete Game Event Handler ---
  /**
   * Delete a specific game event (goal) from the current game
   *
   * Removes the event from storage and invalidates query cache.
   *
   * @param goalId - ID of goal event to delete
   * @returns true if successful, false otherwise
   */
  const handleDeleteGameEvent = useCallback(async (goalId: string): Promise<boolean> => {
    const eventToDelete = gameSessionState.gameEvents.find((e: GameEvent) => e.id === goalId);
    if (!eventToDelete) {
      logger.error("Event to delete not found in gameSessionState.gameEvents:", goalId);
      return false;
    }

    if (!currentGameId) {
      logger.error("No current game ID for event deletion");
      return false;
    }

    try {
      // Storage FIRST - find event index and remove from storage
      const eventIndex = gameSessionState.gameEvents.findIndex((e: GameEvent) => e.id === goalId);
      if (eventIndex === -1) {
        logger.error("Event index not found for deletion:", goalId);
        return false;
      }

      // Remove from storage
      const updatedGame = await removeGameEvent(currentGameId, eventIndex);

      if (!updatedGame) {
        logger.error("Failed to remove event from storage:", goalId);
        return false; // Storage failed
      }

      // State update SECOND (only if storage succeeded)
      dispatchGameSession({ type: 'DELETE_GAME_EVENT', payload: goalId });
      if (eventToDelete.type === 'goal' || eventToDelete.type === 'opponentGoal') {
        dispatchGameSession({
          type: 'ADJUST_SCORE_FOR_EVENT',
          payload: { eventType: eventToDelete.type, action: 'delete' }
        });
      }

      // Invalidate cache to trigger re-fetch
      queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

      logger.log("Deleted game event successfully (storage then state):", goalId);
      return true;
    } catch (error) {
      logger.error("Failed to delete game event:", error);
      return false;
    }
  }, [gameSessionState.gameEvents, currentGameId, queryClient, dispatchGameSession]);

  return {
    // Load game state
    isGameLoading,
    gameLoadError,
    processingGameId,

    // Delete game state
    isGameDeleting,
    gameDeleteError,

    // Handlers
    handleQuickSaveGame,
    handleLoadGame,
    handleDeleteGame,
    handleDeleteGameEvent,
  };
}
