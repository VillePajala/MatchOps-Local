/**
 * useTimerManagement Hook
 *
 * **Purpose**: Game timer coordination and goal event logging
 *
 * **Responsibilities**:
 * - Timer state management (elapsed time, running state, substitution alerts)
 * - Timer controls (start/pause, reset, substitution acknowledgment)
 * - Large timer overlay toggle
 * - Goal log modal toggle
 * - Goal event creation (own goals and opponent goals)
 * - Timer interactions object for UI components
 *
 * **Dependencies**:
 * - useGameTimer: Core timer hook with interval management
 * - GameSessionState: Current game state (for time elapsed, events)
 * - dispatchGameSession: Reducer dispatch for state updates
 *
 * **Extracted from**: useGameOrchestration.ts (Step 2.6.5)
 *
 * @module useTimerManagement
 * @category HomePage Hooks
 */

import { useState, useCallback, useMemo, Dispatch } from 'react';
import { useGameTimer } from '@/hooks/useGameTimer';
import type { GameSessionState, GameSessionAction } from '@/hooks/useGameSessionReducer';
import type { GameEvent, Player, SubAlertLevel } from '@/types';
import type { TimerInteractions } from '@/components/HomePage/containers/FieldContainer';
import logger from '@/utils/logger';
import { useOptionalGameState } from '@/contexts/GameStateContext';

/**
 * Props for useTimerManagement hook
 */
export interface UseTimerManagementProps {
  /** Current game session state */
  gameSessionState?: GameSessionState;
  /** Reducer dispatch for game state updates */
  dispatchGameSession?: Dispatch<GameSessionAction>;
  /** Current game ID (for timer persistence) */
  currentGameId?: string | null;
  /** Available players for goal scorer lookup */
  availablePlayers?: Player[];
  /** Fallback master roster if available players empty */
  masterRoster: Player[];
  /** Setter for goal log modal state (uses functional update pattern) */
  setIsGoalLogModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Return interface for useTimerManagement hook
 */
export interface UseTimerManagementReturn {
  // Timer state
  timeElapsedInSeconds: number;
  isTimerRunning: boolean;
  subAlertLevel: SubAlertLevel;
  lastSubConfirmationTimeSeconds: number;

  // Timer UI state
  showLargeTimerOverlay: boolean;

  // Timer controls
  handleStartPauseTimer: () => void;
  handleResetTimer: () => void;
  handleSubstitutionMade: () => void;
  handleSetSubInterval: (minutes: number) => void;

  // Timer UI controls
  handleToggleLargeTimerOverlay: () => void;
  handleToggleGoalLogModal: () => void;

  // Goal event handlers
  handleAddGoalEvent: (scorerId: string, assisterId?: string) => void;
  handleLogOpponentGoal: (time: number) => void;

  // Timer interactions object
  timerInteractions: TimerInteractions;
}

/**
 * useTimerManagement Hook
 *
 * Manages game timer state, controls, and goal event logging.
 *
 * @param props - Hook configuration
 * @returns Timer state, controls, and handlers
 */
export function useTimerManagement(props: UseTimerManagementProps): UseTimerManagementReturn {
  const {
    gameSessionState: providedGameSessionState,
    dispatchGameSession: providedDispatch,
    currentGameId: providedCurrentGameId,
    availablePlayers: providedAvailablePlayers,
    masterRoster,
    setIsGoalLogModalOpen,
  } = props;

  // Prefer shared context; fall back to explicitly provided values for tests/legacy callers
  const optionalGameState = useOptionalGameState();
  const gameSessionState = providedGameSessionState ?? optionalGameState?.gameSessionState;
  const dispatchGameSession = providedDispatch ?? optionalGameState?.dispatchGameSession;
  const currentGameId = providedCurrentGameId ?? optionalGameState?.currentGameId ?? null;
  const availablePlayers = providedAvailablePlayers ?? optionalGameState?.availablePlayers ?? [];

  if (!gameSessionState || !dispatchGameSession) {
    throw new Error('useTimerManagement requires gameSessionState and dispatchGameSession via props or GameStateContext');
  }

  // --- Core Timer State (from useGameTimer) ---
  const {
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,
    startPause: handleStartPauseTimer,
    reset: handleResetTimer,
    ackSubstitution: handleSubstitutionMade,
    setSubInterval: handleSetSubInterval,
  } = useGameTimer({
    state: gameSessionState,
    dispatch: dispatchGameSession,
    currentGameId: currentGameId || '',
  });

  // --- Timer UI State ---
  const [showLargeTimerOverlay, setShowLargeTimerOverlay] = useState<boolean>(false);

  // --- Timer UI Handlers ---
  const handleToggleLargeTimerOverlay = useCallback(() => {
    setShowLargeTimerOverlay((prev) => !prev);
  }, []);

  const handleToggleGoalLogModal = useCallback(() => {
    setIsGoalLogModalOpen((prev) => !prev);
  }, [setIsGoalLogModalOpen]);

  // --- Goal Event Handlers ---

  /**
   * Add a goal event for own team
   *
   * @param scorerId - Player ID who scored
   * @param assisterId - Optional player ID who assisted
   */
  const handleAddGoalEvent = useCallback((scorerId: string, assisterId?: string) => {
    // Prefer current game's availablePlayers; fall back to master roster if empty
    const playerPool = (availablePlayers && availablePlayers.length > 0)
      ? availablePlayers
      : (masterRoster || []);

    const scorer = playerPool.find(p => p.id === scorerId);
    const assister = assisterId ? playerPool.find(p => p.id === assisterId) : undefined;

    if (!scorer) {
      logger.error("Scorer not found!");
      return;
    }

    const newEvent: GameEvent = {
      id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'goal',
      time: Math.round(gameSessionState.timeElapsedInSeconds * 100) / 100, // Round to 2 decimal places
      scorerId: scorer.id,
      assisterId: assister?.id,
    };

    // Dispatch actions to update game state via reducer
    dispatchGameSession({ type: 'ADD_GAME_EVENT', payload: newEvent });
    dispatchGameSession({ type: 'ADJUST_SCORE_FOR_EVENT', payload: { eventType: 'goal', action: 'add' } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    availablePlayers,
    masterRoster,
    dispatchGameSession,
    // Note: gameSessionState.timeElapsedInSeconds is intentionally omitted
    // It's read from gameSessionState when the function executes, not closed over
    // Including it would cause callback recreation every second when timer is running
  ]);

  /**
   * Log an opponent goal
   *
   * @param time - Time when goal was scored (in seconds)
   */
  const handleLogOpponentGoal = useCallback((time: number) => {
    logger.log(`Logging opponent goal at time: ${time}`);
    const newEvent: GameEvent = {
      id: `oppGoal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'opponentGoal',
      time: Math.round(time * 100) / 100, // Round to 2 decimal places
      scorerId: 'opponent',
    };

    dispatchGameSession({ type: 'ADD_GAME_EVENT', payload: newEvent });
    dispatchGameSession({ type: 'ADJUST_SCORE_FOR_EVENT', payload: { eventType: 'opponentGoal', action: 'add' } });
    setIsGoalLogModalOpen(false);
  }, [dispatchGameSession, setIsGoalLogModalOpen]);

  // --- Timer Interactions Object ---
  const timerInteractions = useMemo<TimerInteractions>(() => ({
    toggleLargeOverlay: handleToggleLargeTimerOverlay,
    toggleGoalLogModal: handleToggleGoalLogModal,
    logOpponentGoal: handleLogOpponentGoal,
    substitutionMade: handleSubstitutionMade,
    setSubInterval: handleSetSubInterval,
    startPauseTimer: handleStartPauseTimer,
    resetTimer: handleResetTimer,
  }), [
    handleToggleLargeTimerOverlay,
    handleToggleGoalLogModal,
    handleLogOpponentGoal,
    handleSubstitutionMade,
    handleSetSubInterval,
    handleStartPauseTimer,
    handleResetTimer,
  ]);

  return {
    // Timer state
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,

    // Timer UI state
    showLargeTimerOverlay,

    // Timer controls
    handleStartPauseTimer,
    handleResetTimer,
    handleSubstitutionMade,
    handleSetSubInterval,

    // Timer UI controls
    handleToggleLargeTimerOverlay,
    handleToggleGoalLogModal,

    // Goal event handlers
    handleAddGoalEvent,
    handleLogOpponentGoal,

    // Timer interactions object
    timerInteractions,
  };
}
