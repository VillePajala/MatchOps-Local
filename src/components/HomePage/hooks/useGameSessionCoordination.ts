/**
 * useGameSessionCoordination Hook
 *
 * **Purpose**: Core game session state and history management
 *
 * **Responsibilities**:
 * - Game session reducer integration
 * - History management (undo/redo for main game state)
 * - Game metadata handlers (team name, opponent, date, notes, location, time)
 * - Game structure (periods, duration)
 * - Season/tournament selection
 * - Demand factor, home/away status
 * - Game personnel management
 *
 * **Dependencies**: None (uses initial constants only)
 *
 * @module useGameSessionCoordination
 * @category HomePage Hooks
 */

import { useCallback, useEffect, useRef, Dispatch } from 'react';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useGameSessionWithHistory } from '@/hooks/useGameSessionWithHistory';
import { useTacticalHistory, type TacticalState } from '@/hooks/useTacticalHistory';
import type { GameSessionState, GameSessionAction } from '@/hooks/useGameSessionReducer';
import type { AppState } from '@/types';
import logger from '@/utils/logger';

/**
 * Parameters for useGameSessionCoordination hook
 */
export interface UseGameSessionCoordinationParams {
  /**
   * Initial app state (from page.tsx)
   */
  initialState: AppState;
}

/**
 * Return value from useGameSessionCoordination hook
 */
export interface UseGameSessionCoordinationReturn {
  // Core session state
  gameSessionState: GameSessionState;
  dispatchGameSession: Dispatch<GameSessionAction>;

  // Initial game session data (for reset operations and default values)
  initialGameSessionData: GameSessionState;

  // History management
  historyState: AppState;
  undo: () => AppState | null;
  redo: () => AppState | null;
  canUndo: boolean;
  canRedo: boolean;
  resetHistory: (state: AppState) => void;

  // History callbacks for other hooks
  saveStateToHistory: (newState: Partial<AppState>) => void;
  saveTacticalStateToHistory: (newState: Partial<TacticalState>) => void;

  // Tactical history (separate stack)
  tacticalHistory: ReturnType<typeof useTacticalHistory>;

  // Apply history state helper
  applyHistoryState: (state: AppState) => void;

  // Game metadata handlers
  handlers: {
    setTeamName: (name: string) => void;
    setOpponentName: (name: string) => void;
    setGameDate: (date: string) => void;
    setGameNotes: (notes: string) => void;
    setGameLocation: (location: string) => void;
    setGameTime: (time: string) => void;
    setAgeGroup: (group: string) => void;
    setTournamentLevel: (level: string) => void;
    setNumberOfPeriods: (periods: number) => void;
    setPeriodDuration: (minutes: number) => void;
    setDemandFactor: (factor: number) => void;
    setHomeOrAway: (status: 'home' | 'away') => void;
    setSeasonId: (seasonId: string | undefined) => void;
    setTournamentId: (tournamentId: string | undefined) => void;
    setGamePersonnel: (personnelIds: string[]) => void;
  };
}

/**
 * Custom hook for managing game session state and history
 *
 * @example
 * ```tsx
 * const session = useGameSessionCoordination({
 *   initialState: appState
 * });
 *
 * // Access session state
 * const { teamName, homeScore } = session.gameSessionState;
 *
 * // Update metadata
 * session.handlers.setTeamName('New Team');
 *
 * // Use history
 * session.undo();
 * session.redo();
 * ```
 */
export function useGameSessionCoordination({
  initialState,
}: UseGameSessionCoordinationParams): UseGameSessionCoordinationReturn {

  // --- Initialize Game Session Reducer ---
  // Map necessary fields from page.tsx's initialState to GameSessionState
  const initialGameSessionData: GameSessionState = {
    teamName: initialState.teamName,
    opponentName: initialState.opponentName,
    gameDate: initialState.gameDate,
    homeScore: initialState.homeScore,
    awayScore: initialState.awayScore,
    gameNotes: initialState.gameNotes,
    homeOrAway: initialState.homeOrAway,
    numberOfPeriods: initialState.numberOfPeriods,
    periodDurationMinutes: initialState.periodDurationMinutes,
    currentPeriod: initialState.currentPeriod,
    gameStatus: initialState.gameStatus,
    demandFactor: initialState.demandFactor ?? 1,
    selectedPlayerIds: initialState.selectedPlayerIds,
    gamePersonnel: initialState.gamePersonnel ?? [],
    seasonId: initialState.seasonId,
    tournamentId: initialState.tournamentId,
    ageGroup: initialState.ageGroup,
    tournamentLevel: initialState.tournamentLevel,
    gameLocation: initialState.gameLocation,
    gameTime: initialState.gameTime,
    gameEvents: initialState.gameEvents,
    timeElapsedInSeconds: 0, // Initial timer state should be 0
    isTimerRunning: false,    // Initial timer state
    subIntervalMinutes: initialState.subIntervalMinutes ?? 5,
    nextSubDueTimeSeconds: (initialState.subIntervalMinutes ?? 5) * 60,
    subAlertLevel: 'none',
    lastSubConfirmationTimeSeconds: 0,
    completedIntervalDurations: initialState.completedIntervalDurations || [],
    showPlayerNames: initialState.showPlayerNames,
    startTimestamp: null,
  };

  // --- History Management ---
  const {
    state: currentHistoryState,
    set: pushHistoryState,
    reset: resetHistory,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
  } = useUndoRedo<AppState>(initialState);

  // --- Tactical History Management (Separate Stack) ---
  const initialTacticalState = {
    tacticalDiscs: initialState.tacticalDiscs,
    tacticalDrawings: initialState.tacticalDrawings,
    tacticalBallPosition: initialState.tacticalBallPosition,
  };
  const tacticalHistory = useTacticalHistory(initialTacticalState);

  // Internal callback that contains the actual logic
  const saveStateToHistoryImpl = useCallback((newState: Partial<AppState>) => {
    if (!currentHistoryState) return; // Should not happen

    // If newState includes seasonId, ensure tournamentId is cleared if seasonId is truthy
    // This mirrors the reducer logic for SET_SEASON_ID.
    // Similarly, if newState includes tournamentId, ensure seasonId is cleared if tournamentId is truthy.
    const adjustedNewState: Partial<AppState> = {
      ...newState,
      ...(newState.seasonId && newState.tournamentId === undefined
          ? { tournamentId: '' }
          : {}),
      ...(newState.tournamentId && newState.seasonId === undefined
          ? { seasonId: '' }
          : {}),
    };

    // Only compare the fields present in adjustedNewState to avoid
    // expensive deep comparison of the full state tree.
    const hasRelevantChanges = Object.keys(adjustedNewState).some((key) => {
      const k = key as keyof AppState;
      const prevVal = currentHistoryState[k];
      // For primitives, strict equality is enough; for objects/arrays,
      // fall back to a lightweight structural check via JSON serialization.
      if (
        prevVal === (adjustedNewState as AppState)[k]
      ) {
        return false;
      }
      // If both are objects/arrays, do a cheap structural compare per field
      // Performance: Only compares fields in adjustedNewState (typically 1-3 fields),
      // not the entire state tree. If issues arise with large arrays (100+ items),
      // consider fast-deep-equal library.
      const isObjectLike = (val: unknown) => typeof val === 'object' && val !== null;
      if (isObjectLike(prevVal) && isObjectLike((adjustedNewState as AppState)[k])) {
        try {
          return JSON.stringify(prevVal) !== JSON.stringify((adjustedNewState as AppState)[k]);
        } catch {
          // On serialization failure, assume changed to be safe
          return true;
        }
      }
      return true;
    });

    if (!hasRelevantChanges) return; // Don't save if nothing changed in provided fields

    const nextState: AppState = { ...currentHistoryState, ...adjustedNewState };

    pushHistoryState(nextState);

  }, [currentHistoryState, pushHistoryState]);

  // Keep ref always pointing to latest implementation
  const saveStateToHistoryRef = useRef(saveStateToHistoryImpl);
  useEffect(() => {
    saveStateToHistoryRef.current = saveStateToHistoryImpl;
  }, [saveStateToHistoryImpl]);

  // Stable callback that never changes reference - prevents re-render loops in useGameState
  // This calls the latest version via the ref, so it always has current closure values
  const saveStateToHistory = useCallback((newState: Partial<AppState>) => {
    saveStateToHistoryRef.current(newState);
  }, []); // Empty deps - reference never changes

  // Save tactical state via dedicated tactical history manager
  const saveTacticalStateToHistory = useCallback((newState: Partial<TacticalState>) => {
    tacticalHistory.save(newState);
  }, [tacticalHistory]);

  const buildGameSessionHistorySlice = useCallback((state: GameSessionState) => {
    const slice = {
      teamName: state.teamName,
      opponentName: state.opponentName,
      gameDate: state.gameDate,
      homeScore: state.homeScore,
      awayScore: state.awayScore,
      gameNotes: state.gameNotes,
      homeOrAway: state.homeOrAway,
      numberOfPeriods: state.numberOfPeriods,
      periodDurationMinutes: state.periodDurationMinutes,
      currentPeriod: state.currentPeriod,
      gameStatus: state.gameStatus,
      selectedPlayerIds: state.selectedPlayerIds,
      gamePersonnel: state.gamePersonnel,
      seasonId: state.seasonId,
      tournamentId: state.tournamentId,
      teamId: state.teamId,
      ageGroup: state.ageGroup,
      tournamentLevel: state.tournamentLevel,
      gameLocation: state.gameLocation,
      gameTime: state.gameTime,
      gameEvents: state.gameEvents,
      demandFactor: state.demandFactor,
      subIntervalMinutes: state.subIntervalMinutes,
      completedIntervalDurations: state.completedIntervalDurations,
      lastSubConfirmationTimeSeconds: state.lastSubConfirmationTimeSeconds,
      showPlayerNames: state.showPlayerNames,
      timeElapsedInSeconds: state.timeElapsedInSeconds,
    } satisfies Partial<AppState>;
    return slice;
  }, []);

  // --- Game Session State with Automatic History Management ---
  // Uses useGameSessionWithHistory hook which handles history saving automatically
  // for user actions while skipping system actions (undo/redo/load)
  const [gameSessionState, dispatchGameSession] = useGameSessionWithHistory(
    initialGameSessionData,
    {
      buildHistorySlice: buildGameSessionHistorySlice,
      saveToHistory: saveStateToHistory,
    }
  );

  // --- Game Metadata Handlers ---

  /**
   * Updates team name with validation
   *
   * Note: Unlike other metadata handlers, this validates against empty/whitespace
   * because team name is the primary game identifier in the UI. Empty names
   * are silently ignored to prevent clearing this required field.
   */
  const handleTeamNameChange = useCallback((newName: string) => {
    const trimmedName = newName.trim();
    if (trimmedName) {
      logger.log("Updating team name to:", trimmedName);
      dispatchGameSession({ type: 'SET_TEAM_NAME', payload: trimmedName });
    }
  }, [dispatchGameSession]);

  const handleOpponentNameChange = useCallback((newName: string) => {
    logger.log('[useGameSessionCoordination] handleOpponentNameChange called with:', newName);
    dispatchGameSession({ type: 'SET_OPPONENT_NAME', payload: newName });
  }, [dispatchGameSession]);

  const handleGameDateChange = useCallback((newDate: string) => {
    dispatchGameSession({ type: 'SET_GAME_DATE', payload: newDate });
  }, [dispatchGameSession]);

  const handleGameNotesChange = useCallback((notes: string) => {
    dispatchGameSession({ type: 'SET_GAME_NOTES', payload: notes });
  }, [dispatchGameSession]);

  const handleGameLocationChange = useCallback((location: string) => {
    dispatchGameSession({ type: 'SET_GAME_LOCATION', payload: location });
  }, [dispatchGameSession]);

  const handleGameTimeChange = useCallback((time: string) => {
    dispatchGameSession({ type: 'SET_GAME_TIME', payload: time });
  }, [dispatchGameSession]);

  const handleAgeGroupChange = useCallback((group: string) => {
    dispatchGameSession({ type: 'SET_AGE_GROUP', payload: group });
  }, [dispatchGameSession]);

  const handleTournamentLevelChange = useCallback((level: string) => {
    dispatchGameSession({ type: 'SET_TOURNAMENT_LEVEL', payload: level });
  }, [dispatchGameSession]);

  // --- Handlers for Game Structure ---
  const handleSetNumberOfPeriods = useCallback((periods: number) => {
    // Keep the check inside
    if (periods === 1 || periods === 2) {
      // Keep the type assertion for the state setter
      const validPeriods = periods as (1 | 2);
      dispatchGameSession({ type: 'SET_NUMBER_OF_PERIODS', payload: validPeriods });
      logger.log(`Number of periods set to: ${validPeriods}`);
    } else {
      logger.warn(`Invalid number of periods attempted: ${periods}. Must be 1 or 2.`);
    }
  }, [dispatchGameSession]);

  const handleSetPeriodDuration = useCallback((minutes: number) => {
    const safeMinutes = Number.isFinite(minutes) ? minutes : 1;
    const newMinutes = Math.max(1, safeMinutes);
    dispatchGameSession({ type: 'SET_PERIOD_DURATION', payload: newMinutes });
    logger.log(`Period duration set to: ${newMinutes} minutes`);
  }, [dispatchGameSession]);

  const handleSetDemandFactor = useCallback((factor: number) => {
    dispatchGameSession({ type: 'SET_DEMAND_FACTOR', payload: factor });
  }, [dispatchGameSession]);

  // Add handler for home/away status
  const handleSetHomeOrAway = useCallback((status: 'home' | 'away') => {
    dispatchGameSession({ type: 'SET_HOME_OR_AWAY', payload: status });
  }, [dispatchGameSession]);

  // --- Handlers for Setting Season/Tournament ID ---
  const handleSetSeasonId = useCallback((newSeasonId: string | undefined) => {
    const idToSet = newSeasonId || ''; // Ensure empty string instead of null
    logger.log('[useGameSessionCoordination] handleSetSeasonId called with:', idToSet);
    dispatchGameSession({ type: 'SET_SEASON_ID', payload: idToSet });
  }, [dispatchGameSession]);

  const handleSetTournamentId = useCallback((newTournamentId: string | undefined) => {
    const idToSet = newTournamentId || ''; // Ensure empty string instead of null
    logger.log('[useGameSessionCoordination] handleSetTournamentId called with:', idToSet);
    dispatchGameSession({ type: 'SET_TOURNAMENT_ID', payload: idToSet });
  }, [dispatchGameSession]);

  const handleSetGamePersonnel = useCallback((personnelIds: string[]) => {
    dispatchGameSession({ type: 'SET_GAME_PERSONNEL', payload: personnelIds });
  }, [dispatchGameSession]);

  // --- Apply History State Helper ---
  /**
   * Applies history state to restore game session
   *
   * **IMPORTANT - Incomplete Abstraction (Step 2.6.2):**
   * This function ONLY restores game session state (team names, scores, periods, etc.).
   * It does NOT restore field state (player positions, opponents, drawings) or tactical state.
   *
   * **Why incomplete?**
   * Field state management will be extracted to useFieldCoordination in Step 2.6.3.
   * This hook should not have dependencies on field state setters (setPlayersOnField, etc.).
   *
   * **Current architecture:**
   * - This hook: Restores game session state only
   * - useGameOrchestration: Wraps this function and adds field state restoration
   * - Step 2.6.3: Will extract field restoration to useFieldCoordination.applyFieldHistoryState
   *
   * **After Step 2.6.3:**
   * The wrapper in useGameOrchestration will be removed, and field state restoration
   * will be handled by useFieldCoordination independently.
   *
   * @param state - Complete AppState from history (undo/redo operation)
   *
   * @see useGameOrchestration.ts lines 1300-1337 for current wrapper implementation
   * @see docs/03-active-plans/L2-2.6-useGameOrchestration-Splitting-PLAN.md for Step 2.6.3 details
   */
  const applyHistoryState = useCallback((state: AppState) => {
    // Note: useGameSessionWithHistory automatically skips saving for LOAD_STATE_FROM_HISTORY actions

    dispatchGameSession({ type: 'SET_TEAM_NAME', payload: state.teamName });
    dispatchGameSession({ type: 'SET_HOME_SCORE', payload: state.homeScore });
    dispatchGameSession({ type: 'SET_AWAY_SCORE', payload: state.awayScore });
    dispatchGameSession({ type: 'SET_OPPONENT_NAME', payload: state.opponentName });
    dispatchGameSession({ type: 'SET_GAME_DATE', payload: state.gameDate });
    dispatchGameSession({ type: 'SET_GAME_NOTES', payload: state.gameNotes });
    dispatchGameSession({ type: 'SET_NUMBER_OF_PERIODS', payload: state.numberOfPeriods });
    dispatchGameSession({ type: 'SET_PERIOD_DURATION', payload: state.periodDurationMinutes });
    dispatchGameSession({
      type: 'LOAD_STATE_FROM_HISTORY',
      payload: {
        currentPeriod: state.currentPeriod,
        gameStatus: state.gameStatus,
        selectedPlayerIds: state.selectedPlayerIds,
        seasonId: state.seasonId,
        tournamentId: state.tournamentId,
        demandFactor: state.demandFactor ?? 1,
        homeOrAway: state.homeOrAway,
        ageGroup: state.ageGroup,
        tournamentLevel: state.tournamentLevel,
        gameLocation: state.gameLocation,
        gameTime: state.gameTime,
        gameEvents: state.gameEvents,
        gamePersonnel: state.gamePersonnel ?? [],
        teamId: state.teamId,
        subIntervalMinutes: state.subIntervalMinutes ?? 5,
        completedIntervalDurations: state.completedIntervalDurations ?? [],
        lastSubConfirmationTimeSeconds: state.lastSubConfirmationTimeSeconds ?? 0,
        showPlayerNames: state.showPlayerNames,
        timeElapsedInSeconds: state.timeElapsedInSeconds,
      }
    });
  }, [dispatchGameSession]);

  return {
    // Core session state
    gameSessionState,
    dispatchGameSession,

    // Initial game session data (for reset operations and default values)
    initialGameSessionData,

    // History management
    historyState: currentHistoryState,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
    resetHistory,

    // History callbacks for other hooks
    saveStateToHistory,
    saveTacticalStateToHistory,

    // Tactical history (separate stack)
    tacticalHistory,

    // Apply history state helper
    applyHistoryState,

    // Game metadata handlers
    handlers: {
      setTeamName: handleTeamNameChange,
      setOpponentName: handleOpponentNameChange,
      setGameDate: handleGameDateChange,
      setGameNotes: handleGameNotesChange,
      setGameLocation: handleGameLocationChange,
      setGameTime: handleGameTimeChange,
      setAgeGroup: handleAgeGroupChange,
      setTournamentLevel: handleTournamentLevelChange,
      setNumberOfPeriods: handleSetNumberOfPeriods,
      setPeriodDuration: handleSetPeriodDuration,
      setDemandFactor: handleSetDemandFactor,
      setHomeOrAway: handleSetHomeOrAway,
      setSeasonId: handleSetSeasonId,
      setTournamentId: handleSetTournamentId,
      setGamePersonnel: handleSetGamePersonnel,
    },
  };
}
