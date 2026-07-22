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
 * **Architectural Note - playerAssessments Dependency**:
 *
 * This hook requires `playerAssessments` as a parameter, which creates a dependency chain:
 * - usePlayerAssessments(currentGameId) → playerAssessments
 * - useGamePersistence(..., playerAssessments) → includes in snapshot
 *
 * **Why This Is A Code Smell**:
 * Player assessments are stored per-game (keyed by gameId) but treated as external
 * state passed into persistence. This split-brain architecture causes:
 * - Tight coupling between hooks
 * - Harder testing (must mock assessments)
 * - Inconsistency (scores are in gameSessionState, assessments are separate)
 *
 * **Better Architecture (Future Refactoring)**:
 * Option A: Move assessments into GameSessionState (single source of truth)
 * Option B: Don't include assessments in game snapshot (fully independent)
 *
 * **Current State**: Accepting assessments as parameter (Option C) works fine with no
 * bugs, but creates architectural debt. Consider refactoring when modifying assessment
 * or persistence logic.
 *
 * See: src/hooks/usePlayerAssessments.ts for assessment storage implementation
 *
 * @module useGamePersistence
 * @category HomePage Hooks
 */

import { useCallback, useRef, useEffect } from 'react';
import type { TFunction } from 'i18next';
import type { QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import { useAutoSave } from '@/hooks/useAutoSave';
import { NetworkError } from '@/interfaces/DataStoreErrors';
import type { AppState, GameEvent, PlayerAssessment, Player, SavedGamesCollection } from '@/types';
import type { GameSessionState, GameSessionAction } from '@/hooks/useGameSessionReducer';
import type { UseFieldCoordinationReturn } from './useFieldCoordination';
import {
  saveGame as utilSaveGame,
  removeGameEvent,
  createGame as utilCreateGame,
  getGame as utilGetGame,
} from '@/utils/savedGames';
import { saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting } from '@/utils/appSettings';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
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

  // Callbacks
  dispatchGameSession: React.Dispatch<GameSessionAction>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  t: TFunction;

  // Query client for cache invalidation
  queryClient: QueryClient;

  // Modal control
}

/**
 * Return type for useGamePersistence hook
 */
export interface UseGamePersistenceReturn {
  // Load game state

  // Delete game state

  // Handlers
  // Returns true only if the game is now persisted (see implementation note).
  handleQuickSaveGame: (silent?: boolean, suppressErrorToast?: boolean) => Promise<boolean>;
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
 *   dispatchGameSession,
 *   showToast,
 *   t,
 *   queryClient,
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
  dispatchGameSession,
  showToast,
  t,
  queryClient,
}: UseGamePersistenceParams): UseGamePersistenceReturn {
  // --- User-Scoped Storage ---
  const { userId } = useDataStore();


  // --- Load/Delete Game UI State ---
  // CR-H6: in-flight guard for event deletion. A double-tapped delete confirm could
  // call handleDeleteGameEvent twice while the first await is pending; the second
  // call used the (now stale) index and deleted the WRONG event + double-decremented
  // the score. Tracking in-flight goalIds rejects the concurrent repeat.
  const deletingEventIdsRef = useRef<Set<string>>(new Set());

  // --- Helper: Create AppState Snapshot ---
  /**
   * Creates a snapshot of current game state for persistence
   *
   * Uses destructuring to automatically include all GameSessionState fields
   * except volatile timer states, which are explicitly excluded and re-initialized
   * on load by the reducer.
   *
   * Benefits:
   * - Automatically includes new fields added to GameSessionState
   * - Explicitly documents excluded volatile fields
   * - Reduces maintenance burden and error risk
   */
  const createGameSnapshot = useCallback((): AppState => {
    // Volatile timer states are intentionally EXCLUDED from the snapshot:
    // - startTimestamp: Timestamp when timer started/resumed
    // - isTimerRunning: Whether timer is currently running
    // - nextSubDueTimeSeconds: Next substitution due time (recalculated from timeElapsedInSeconds)
    // - subAlertLevel: Current substitution alert level (recalculated)
    //
    // These fields are re-initialized on load by the reducer to ensure:
    // - Timer starts in stopped state when loading a game
    // - No race conditions with stale timestamps
    // - Clean slate for substitution tracking
    //
    // Note: timeElapsedInSeconds IS persisted to preserve timer progress across game switches
    const {
      startTimestamp, // eslint-disable-line @typescript-eslint/no-unused-vars
      isTimerRunning, // eslint-disable-line @typescript-eslint/no-unused-vars
      nextSubDueTimeSeconds, // eslint-disable-line @typescript-eslint/no-unused-vars
      subAlertLevel, // eslint-disable-line @typescript-eslint/no-unused-vars
      ...persistedGameSessionState
    } = gameSessionState;

    return {
      // Spread all persisted GameSessionState fields (includes timeElapsedInSeconds)
      ...persistedGameSessionState,

      // Override/add additional fields not in gameSessionState
      isPlayed,
      // isFriendly is game metadata, not part of the live session reducer, so a
      // full-overwrite autosave would otherwise silently drop it. Preserve it
      // from the persisted record - it is only ever set at creation or via the
      // reclassify toggle, both of which update savedGames first.
      isFriendly: savedGames[currentGameId ?? '']?.isFriendly ?? false,
      assessments: playerAssessments,

      // From fieldCoordination
      playersOnField: fieldCoordination.playersOnField,
      opponents: fieldCoordination.opponents,
      drawings: fieldCoordination.drawings,
      tacticalDiscs: fieldCoordination.tacticalDiscs,
      tacticalDrawings: fieldCoordination.tacticalDrawings,
      tacticalBallPosition: fieldCoordination.tacticalBallPosition,
      formationSnapPoints: fieldCoordination.formationSnapPoints,

      // Per-game roster
      availablePlayers,
    };
  }, [
    gameSessionState,
    isPlayed,
    savedGames,
    currentGameId,
    playerAssessments,
    fieldCoordination.playersOnField,
    fieldCoordination.opponents,
    fieldCoordination.drawings,
    fieldCoordination.tacticalDiscs,
    fieldCoordination.tacticalDrawings,
    fieldCoordination.tacticalBallPosition,
    fieldCoordination.formationSnapPoints,
    availablePlayers,
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
   * @param suppressErrorToast - If true, suppresses error toast (for auto-save retry logic)
   */
  // Returns true only if the game is now persisted; false if the save was skipped
  // (transient empty-field state) or failed. Callers that discard/replace the
  // current session (e.g. "Save before new game") MUST check this before proceeding.
  const handleQuickSaveGame = useCallback(async (silent = false, suppressErrorToast = false): Promise<boolean> => {
    // Create snapshot first (needed for both validation and save)
    const currentSnapshot = createGameSnapshot();

    // Pre-validate: skip auto-save if required fields are empty (transient editing state)
    // This is expected during typing - user clears field before entering new value
    // Manual saves (silent=false) should still attempt save and show validation error to user
    if (silent && (!currentSnapshot.teamName || !currentSnapshot.opponentName || !currentSnapshot.gameDate)) {
      logger.log('[handleQuickSaveGame] Skipping auto-save: required fields empty (user editing)');
      return false; // nothing persisted (transient editing state)
    }

    if (currentGameId && currentGameId !== DEFAULT_GAME_ID) {
      logger.log(`Quick saving game with ID: ${currentGameId}${silent ? ' (silent)' : ''}`, {
        teamId: gameSessionState.teamId,
        tournamentId: gameSessionState.tournamentId,
      });

      try {
        // Deep-review race guards (silent/auto-save path only):
        // 1) A save landing AFTER a club-side level crossing (load/create/
        //    delete changed the persisted current id) must not act on a
        //    game that no longer exists - check existence first, so a
        //    just-deleted game cannot be resurrected by a late debounce.
        if (silent) {
          const stillExists = await utilGetGame(currentGameId, userId);
          if (!stillExists) {
            logger.log('[handleQuickSaveGame] Skipping auto-save: game no longer exists (deleted mid-flight)');
            return false;
          }
        }
        // Update savedGames state and storage
        const updatedSavedGames = { ...savedGames, [currentGameId]: currentSnapshot };
        setSavedGames(updatedSavedGames);
        await utilSaveGame(currentGameId, currentSnapshot, userId);
        // 2) The AUTO-save must never rewrite the persisted current-game-id
        //    setting: it cannot change while this match is mounted, and a
        //    late write raced the level crossings (reverting the id the
        //    club side had just persisted, booting the WRONG game on the
        //    fresh mount). Manual saves keep the write for legacy parity.
        if (!silent) {
          await utilSaveCurrentGameIdSetting(currentGameId, userId);
        }

        // CR-H7 + deep-review: keep the saved-games cache fresh by MERGING
        // this game's snapshot into the CURRENT cache (functional update) -
        // replacing the whole collection from this mount's local state
        // erased games created by the club side after this mount's snapshot
        // of `savedGames` was taken.
        queryClient.setQueryData<SavedGamesCollection>(
          [...queryKeys.savedGames, userId],
          (prev) => ({ ...(prev ?? updatedSavedGames), [currentGameId]: currentSnapshot }),
        );

        // CR-H7: Only clear undo/redo on an explicit (manual) save — "saved = clean
        // baseline". Silent auto-saves must NOT wipe undo, or the user can never undo
        // more than the single most-recent change during a match.
        if (!silent) {
          resetHistory(currentSnapshot);
          showToast(t('loadGameModal.gameSaved', 'Game saved!'));
        }

        return true;
      } catch (error) {
        // Network errors are transient — warn only, don't flood Sentry
        if (error instanceof NetworkError) {
          logger.warn("Network error saving game:", error.message);
        } else {
          logger.error("Failed to quick save game state:", error);

          // Report non-network errors to Sentry for monitoring
          try {
            Sentry.captureException(error, {
              tags: {
                operation: 'quick_save_game',
                silent,
                gameId: currentGameId,
              },
              extra: {
                teamId: gameSessionState.teamId,
                tournamentId: gameSessionState.tournamentId,
              },
            });
          } catch {
            // Sentry failure must not affect save error handling
          }
        }

        // Show error toast unless explicitly suppressed (for retry logic)
        if (!suppressErrorToast) {
          showToast(t('loadGameModal.errors.quickSaveFailed', 'Error quick saving game.'), 'error');
        }
        return false;
      }
    } else {
      // No current game ID - create new saved game entry using utility
      try {
        // Use createGame utility (DRY principle)
        // Note: currentSnapshot was already created at the start of handleQuickSaveGame
        const { gameId: newGameId, gameData } = await utilCreateGame(currentSnapshot, userId);

        // Update local state
        setSavedGames(prev => ({ ...prev, [newGameId]: gameData }));
        setCurrentGameId(newGameId);
        await utilSaveCurrentGameIdSetting(newGameId, userId);

        // CR-H7: keep the cache fresh without a refetch (see update branch above).
        queryClient.setQueryData<SavedGamesCollection>(
          [...queryKeys.savedGames, userId],
          (old) => ({ ...(old ?? {}), [newGameId]: gameData })
        );

        // CR-H7: only clear undo/redo on an explicit (manual) save, not silent auto-save.
        if (!silent) {
          resetHistory(gameData);
          showToast(t('loadGameModal.newGameSaved', 'New game saved!'));
        }

        logger.log(`New game created with ID: ${newGameId}`);

        return true;
      } catch (error) {
        // Network errors are transient — warn only, don't flood Sentry
        if (error instanceof NetworkError) {
          logger.warn("Network error creating new game:", error.message);
        } else {
          logger.error("Failed to create new saved game:", error);

          // Report non-network errors to Sentry for monitoring
          try {
            Sentry.captureException(error, {
              tags: {
                operation: 'create_new_game',
                silent,
              },
              extra: {
                teamId: gameSessionState.teamId,
                tournamentId: gameSessionState.tournamentId,
              },
            });
          } catch {
            // Sentry failure must not affect create game error handling
          }
        }

        // Show error toast unless explicitly suppressed
        if (!suppressErrorToast) {
          showToast(t('loadGameModal.errors.createGameFailed', 'Error creating new saved game.'), 'error');
        }
        return false;
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
    userId,
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
    // Auto-save with silent=true (no success toast) and suppressErrorToast=true
    // Errors are logged to Sentry but don't show intrusive toasts during auto-save
    // Auto-save ignores the success boolean (errors are logged/Sentry'd, not surfaced).
    autoSaveFnRef.current = () => handleQuickSaveGame(true, true).then(() => {});
  }, [handleQuickSaveGame]);

  // --- 3-Tier Debounced Auto-Save ---
  /**
   * Smart auto-save with tiered debouncing:
   * - Immediate: Goals, scores (critical statistics)
   * - Short (500ms): Names, notes (user-visible metadata)
   * - Long (2000ms): Field positions, drawings (tactical data)
   *
   * Error Handling:
   * - Auto-save errors are logged to Sentry for monitoring
   * - Error toasts are suppressed to avoid disrupting user workflow
   * - Manual saves (Ctrl+S) show error toasts for immediate feedback
   *
   * IMPORTANT: DEFAULT_GAME_ID ("unsaved_game") Policy
   * -------------------------------------------------
   * Auto-save is INTENTIONALLY disabled for scratch/unsaved games:
   * - enabled: currentGameId !== DEFAULT_GAME_ID
   *
   * This is BY DESIGN for these reasons:
   * 1. Scratch sessions are ephemeral - for quick demos, testing, or exploration
   * 2. Users can save anytime via Ctrl+S or the Save button:
   *    → This creates a real game ID, removing DEFAULT_GAME_ID
   *    → Subsequent changes are then auto-saved with the new ID
   * 3. Avoids cluttering the saved games list with auto-created entries
   * 4. Matches user mental model: "I haven't saved yet, so it's not persisted"
   *
   * RELOAD SAFETY (as of 2026-01-02):
   * - Service worker auto-reload on controllerchange is disabled
   * - Settings "Update now" shows a message instead of reloading
   * - This means scratch games are safe from surprise data loss
   * - User-initiated reloads (F5, closing tab) will still lose scratch data as expected
   *
   * Future Enhancement: Consider adding retry logic with exponential backoff
   * for transient errors (network, storage quota). See ARCHITECTURAL_DEBT.md.
   */
  useAutoSave({
    immediate: {
      // Critical for statistics - save instantly
      states: {
        gameEvents: gameSessionState.gameEvents,
        homeScore: gameSessionState.homeScore,
        awayScore: gameSessionState.awayScore,
        // Shootout/overtime decide the W/L result and are logged rarely (once per
        // game), so persist instantly — otherwise a recorded shootout wouldn't
        // save (auto-save only fires on the fields watched here).
        wentToOvertime: gameSessionState.wentToOvertime,
        wentToPenalties: gameSessionState.wentToPenalties,
        shootoutKicks: gameSessionState.shootoutKicks,
        // Save the clock when the timer STOPS/STARTS (isTimerRunning flips), not on
        // every tick. timeElapsedInSeconds was here, but it changes every second, so
        // a running match fired a full save + cloud sync ~once/second (CR-H7 — the
        // sync icon flickered constantly). The save always persists the precise
        // timeElapsedInSeconds; we just no longer trigger it on each tick. Crash/
        // reload recovery of the live clock is covered by the timer-state record
        // (IndexedDB) + the localStorage wall-clock anchor.
        isTimerRunning: gameSessionState.isTimerRunning,
        // Substitution log. These change only when a sub is CONFIRMED (a discrete,
        // infrequent action — no per-second churn), but if the app is killed before
        // any other watched field changes, the interval log is lost and sub-due
        // timing shifts on reload. Persist instantly so the sub record survives.
        completedIntervalDurations: gameSessionState.completedIntervalDurations,
        lastSubConfirmationTimeSeconds: gameSessionState.lastSubConfirmationTimeSeconds,
      },
      delay: 0,
    },
    short: {
      // User-visible metadata - feels instant
      states: {
        teamName: gameSessionState.teamName,
        opponentName: gameSessionState.opponentName,
        gameNotes: gameSessionState.gameNotes,
        playerPositions: gameSessionState.playerPositions,
        assessments: playerAssessments,
        availablePlayers, // For fair play card and per-game player data
        leagueId: gameSessionState.leagueId, // League selection
        customLeagueName: gameSessionState.customLeagueName, // Custom league name when leagueId === CUSTOM_LEAGUE_ID
        subIntervalMinutes: gameSessionState.subIntervalMinutes, // Sub interval setting (adjustable on timer overlay)
        periodDurationMinutes: gameSessionState.periodDurationMinutes, // Period duration (adjustable in game settings)
        showPlayerNames: gameSessionState.showPlayerNames, // Player name visibility toggle
        showPositionLabels: gameSessionState.showPositionLabels, // Position labels toggle (FieldContainer button)
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
        formationSnapPoints: fieldCoordination.formationSnapPoints,
      },
      delay: 2000,
    },
    saveFunction: () => autoSaveFnRef.current(), // Ref-based to prevent stale closures
    enabled: initialLoadComplete && currentGameId !== DEFAULT_GAME_ID,
    currentGameId,
  });

  // handleLoadGame + handleDeleteGame LIFTED to useLoadGameController (L.3a):
  // LoadGameModal renders in ClubModalsHost; picking a game persists the id and
  // freshly mounts the match (enterMatch), replacing in-place game switching.

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
    // CR-H6: reject a concurrent repeat for the same event (double-tapped confirm).
    // Without this, the second call ran with a stale index and deleted the wrong
    // event and decremented the score twice.
    if (deletingEventIdsRef.current.has(goalId)) {
      logger.debug('[useGamePersistence] Delete already in flight for event, ignoring repeat:', goalId);
      return false;
    }

    // Find event index (single lookup for both validation and storage deletion)
    const eventIndex = gameSessionState.gameEvents.findIndex((e: GameEvent) => e.id === goalId);
    if (eventIndex === -1) {
      logger.error("Event to delete not found in gameSessionState.gameEvents:", goalId);
      return false;
    }

    const eventToDelete = gameSessionState.gameEvents[eventIndex];

    if (!currentGameId) {
      logger.error("No current game ID for event deletion");
      return false;
    }

    deletingEventIdsRef.current.add(goalId);
    try {
      // Storage FIRST - remove from storage using the index we already found
      // (safe: the in-flight guard above ensures this is the only call for this
      // event, so the index computed from current state is the one to delete).

      // Remove from storage
      const updatedGame = await removeGameEvent(currentGameId, eventIndex, userId);

      if (!updatedGame) {
        logger.error("Failed to remove event from storage:", goalId);
        return false; // Storage failed
      }

      // State update SECOND (only if storage succeeded)
      // Use atomic action to prevent race condition between event deletion and score adjustment
      dispatchGameSession({
        type: 'DELETE_GAME_EVENT_WITH_SCORE',
        payload: eventToDelete
      });

      // Invalidate cache to trigger re-fetch
      queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });

      logger.log("Deleted game event successfully (storage then state):", goalId);
      return true;
    } catch (error) {
      logger.error("Failed to delete game event:", error);
      return false;
    } finally {
      deletingEventIdsRef.current.delete(goalId);
    }
  }, [gameSessionState.gameEvents, currentGameId, queryClient, dispatchGameSession, userId]);

  return {
    // Load game state

    // Delete game state

    // Handlers
    handleQuickSaveGame,
    handleDeleteGameEvent,
  };
}
