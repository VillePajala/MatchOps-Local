/**
 * useGameOrchestration Hook
 *
 * Central state management hook for HomePage that orchestrates all game-related state.
 * Extracted from HomePage.tsx as part of P0 refactoring to reduce component complexity.
 *
 * This hook consolidates:
 * - Game session state (reducer-based)
 * - History management (undo/redo)
 * - React Query data fetching (roster, games, seasons, tournaments)
 * - Timer management
 * - Auto-save functionality
 * - Core state handlers
 *
 * @returns All state, handlers, and data needed for game management
 */

import { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';

// Types
import type {
  Player,
  Season,
  Tournament,
  AppState,
  SavedGamesCollection,
} from '@/types';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';

// Hooks
import { useGameState, UseGameStateReturn } from '@/hooks/useGameState';
import { useGameTimer } from '@/hooks/useGameTimer';
import { useGameDataQueries } from '@/hooks/useGameDataQueries';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useTacticalBoard } from '@/hooks/useTacticalBoard';
import { useRoster } from '@/hooks/useRoster';
import { useTeamsQuery } from '@/hooks/useTeamQueries';
import usePlayerAssessments from '@/hooks/usePlayerAssessments';
import { gameSessionReducer } from '@/hooks/useGameSessionReducer';

// Utils
import {
  getLastHomeTeamName as utilGetLastHomeTeamName,
  updateAppSettings as utilUpdateAppSettings,
} from '@/utils/appSettings';

// Config
import { DEFAULT_GAME_ID } from '@/config/constants';

// Initial data and state
const initialAvailablePlayersData: Player[] = [];

const initialState: AppState = {
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: initialAvailablePlayersData,
  showPlayerNames: true,
  teamName: 'My Team',
  gameEvents: [],
  opponentName: 'Opponent',
  gameDate: new Date().toISOString().split('T')[0],
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 10,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  demandFactor: 1,
  selectedPlayerIds: [],
  gamePersonnel: [],
  seasonId: '',
  tournamentId: '',
  ageGroup: '',
  tournamentLevel: '',
  gameLocation: '',
  gameTime: '',
  subIntervalMinutes: 5,
  completedIntervalDurations: [],
  lastSubConfirmationTimeSeconds: 0,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0.5, relY: 0.5 },
};

interface UseGameOrchestrationProps {
  initialAction?: 'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'season' | 'stats' | 'roster' | 'teams' | 'settings';
  skipInitialSetup?: boolean;
  isFirstTimeUser?: boolean;
}

export function useGameOrchestration({
  initialAction: _initialAction,
  skipInitialSetup: _skipInitialSetup = false,
  isFirstTimeUser: _isFirstTimeUser = false,
}: UseGameOrchestrationProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // TODO: Use initialAction, skipInitialSetup, isFirstTimeUser in final HomePage integration
  void _initialAction;
  void _skipInitialSetup;
  void _isFirstTimeUser;

  // --- Game Session Reducer ---
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
    timeElapsedInSeconds: 0,
    isTimerRunning: false,
    subIntervalMinutes: initialState.subIntervalMinutes ?? 5,
    nextSubDueTimeSeconds: (initialState.subIntervalMinutes ?? 5) * 60,
    subAlertLevel: 'none',
    lastSubConfirmationTimeSeconds: 0,
    completedIntervalDurations: initialState.completedIntervalDurations || [],
    showPlayerNames: initialState.showPlayerNames,
    startTimestamp: null,
  };

  const [gameSessionState, dispatchGameSession] = useReducer(gameSessionReducer, initialGameSessionData);

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

  const saveStateToHistory = useCallback((newState: Partial<AppState>) => {
    if (!currentHistoryState) return;

    const adjustedNewState: Partial<AppState> = {
      ...newState,
      ...(newState.seasonId && newState.tournamentId === undefined
        ? { tournamentId: '' }
        : {}),
      ...(newState.tournamentId && newState.seasonId === undefined
        ? { seasonId: '' }
        : {}),
    };

    const hasRelevantChanges = Object.keys(adjustedNewState).some((key) => {
      const k = key as keyof AppState;
      const prevVal = currentHistoryState[k];

      if (prevVal === (adjustedNewState as AppState)[k]) {
        return false;
      }

      const isObjectLike = (val: unknown) => typeof val === 'object' && val !== null;
      if (isObjectLike(prevVal) && isObjectLike((adjustedNewState as AppState)[k])) {
        try {
          return JSON.stringify(prevVal) !== JSON.stringify((adjustedNewState as AppState)[k]);
        } catch {
          return true;
        }
      }
      return true;
    });

    if (!hasRelevantChanges) return;

    const nextState: AppState = { ...currentHistoryState, ...adjustedNewState };
    pushHistoryState(nextState);
  }, [currentHistoryState, pushHistoryState]);

  // Sync game session state to history
  useEffect(() => {
    const gameSessionHistorySlice: Partial<AppState> = {
      teamName: gameSessionState.teamName,
      opponentName: gameSessionState.opponentName,
      gameDate: gameSessionState.gameDate,
      homeScore: gameSessionState.homeScore,
      awayScore: gameSessionState.awayScore,
      gameNotes: gameSessionState.gameNotes,
      homeOrAway: gameSessionState.homeOrAway,
      numberOfPeriods: gameSessionState.numberOfPeriods,
      periodDurationMinutes: gameSessionState.periodDurationMinutes,
      currentPeriod: gameSessionState.currentPeriod,
      gameStatus: gameSessionState.gameStatus,
      selectedPlayerIds: gameSessionState.selectedPlayerIds,
      gamePersonnel: gameSessionState.gamePersonnel,
      seasonId: gameSessionState.seasonId,
      tournamentId: gameSessionState.tournamentId,
      gameLocation: gameSessionState.gameLocation,
      gameTime: gameSessionState.gameTime,
      gameEvents: gameSessionState.gameEvents,
      subIntervalMinutes: gameSessionState.subIntervalMinutes,
      completedIntervalDurations: gameSessionState.completedIntervalDurations,
      lastSubConfirmationTimeSeconds: gameSessionState.lastSubConfirmationTimeSeconds,
      showPlayerNames: gameSessionState.showPlayerNames,
    };
    saveStateToHistory(gameSessionHistorySlice);
  }, [gameSessionState, saveStateToHistory]);

  // --- React Query Data Fetching ---
  const {
    masterRoster: masterRosterQueryResultData,
    seasons: seasonsQueryResultData,
    tournaments: tournamentsQueryResultData,
    savedGames: allSavedGamesQueryResultData,
    currentGameId: currentGameIdSettingQueryResultData,
    loading: isGameDataLoading,
    error: gameDataError,
  } = useGameDataQueries();

  const { data: teams = [] } = useTeamsQuery();

  // --- Game State Hook ---
  const {
    playersOnField,
    opponents,
    drawings,
    setPlayersOnField,
    setOpponents,
    setDrawings,
    handlePlayerDrop,
    handleDrawingStart,
    handleDrawingAddPoint,
    handleDrawingEnd,
    handleClearDrawings,
    handleAddOpponent,
    handleOpponentMove,
    handleOpponentMoveEnd,
    handleOpponentRemove,
  }: UseGameStateReturn = useGameState({
    initialState,
    saveStateToHistory,
  });

  // --- Roster Hook ---
  const {
    availablePlayers,
    setAvailablePlayers,
    highlightRosterButton,
    setHighlightRosterButton,
    isRosterUpdating,
    setRosterError,
    rosterError,
    playersForCurrentGame,
    handleAddPlayer,
    handleUpdatePlayer,
    handleRemovePlayer,
  } = useRoster({
    initialPlayers: initialState.availablePlayers,
    selectedPlayerIds: gameSessionState.selectedPlayerIds,
  });

  // --- Tactical Board Hook ---
  const {
    isTacticsBoardView,
    tacticalDiscs,
    setTacticalDiscs,
    tacticalDrawings,
    setTacticalDrawings,
    tacticalBallPosition,
    setTacticalBallPosition,
    handleToggleTacticsBoard,
    handleAddTacticalDisc,
    handleTacticalDiscMove,
    handleTacticalDiscRemove,
    handleToggleTacticalDiscType,
    handleTacticalBallMove,
    handleTacticalDrawingStart,
    handleTacticalDrawingAddPoint,
    handleTacticalDrawingEnd,
    clearTacticalElements,
  } = useTacticalBoard({
    initialDiscs: initialState.tacticalDiscs,
    initialDrawings: initialState.tacticalDrawings,
    initialBallPosition: initialState.tacticalBallPosition,
    saveStateToHistory,
  });

  // --- Local State ---
  const [savedGames, setSavedGames] = useState<SavedGamesCollection>({});
  const [currentGameId, setCurrentGameId] = useState<string | null>(DEFAULT_GAME_ID);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [defaultTeamNameSetting, setDefaultTeamNameSetting] = useState<string>('');
  const [appLanguage, setAppLanguage] = useState<string>(i18n.language);
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);

  const gameIdRef = useRef(currentGameId);
  useEffect(() => {
    gameIdRef.current = currentGameId;
  }, [currentGameId]);

  // --- Player Assessments Hook ---
  const {
    assessments: playerAssessments,
    saveAssessment,
    deleteAssessment,
  } = usePlayerAssessments(
    currentGameId || '',
    gameSessionState.completedIntervalDurations,
  );

  // --- Timer Hook ---
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

  // --- Language Effect ---
  useEffect(() => {
    i18n.changeLanguage(appLanguage);
    utilUpdateAppSettings({ language: appLanguage }).catch(() => {});
  }, [appLanguage]);

  // --- Load Default Team Name ---
  useEffect(() => {
    utilGetLastHomeTeamName().then((name) => setDefaultTeamNameSetting(name));
  }, []);

  // --- Return all orchestrated state and handlers ---
  return {
    // Game session state
    gameSessionState,
    dispatchGameSession,

    // History
    currentHistoryState,
    saveStateToHistory,
    resetHistory,
    undoHistory,
    redoHistory,
    canUndo,
    canRedo,

    // Game state
    playersOnField,
    opponents,
    drawings,
    setPlayersOnField,
    setOpponents,
    setDrawings,
    handlePlayerDrop,
    handleDrawingStart,
    handleDrawingAddPoint,
    handleDrawingEnd,
    handleClearDrawings,
    handleAddOpponent,
    handleOpponentMove,
    handleOpponentMoveEnd,
    handleOpponentRemove,

    // Roster
    availablePlayers,
    setAvailablePlayers,
    highlightRosterButton,
    setHighlightRosterButton,
    isRosterUpdating,
    setRosterError,
    rosterError,
    playersForCurrentGame,
    handleAddPlayer,
    handleUpdatePlayer,
    handleRemovePlayer,

    // Tactical board
    isTacticsBoardView,
    tacticalDiscs,
    setTacticalDiscs,
    tacticalDrawings,
    setTacticalDrawings,
    tacticalBallPosition,
    setTacticalBallPosition,
    handleToggleTacticsBoard,
    handleAddTacticalDisc,
    handleTacticalDiscMove,
    handleTacticalDiscRemove,
    handleToggleTacticalDiscType,
    handleTacticalBallMove,
    handleTacticalDrawingStart,
    handleTacticalDrawingAddPoint,
    handleTacticalDrawingEnd,
    clearTacticalElements,

    // Player assessments
    playerAssessments,
    saveAssessment,
    deleteAssessment,

    // Timer
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,
    handleStartPauseTimer,
    handleResetTimer,
    handleSubstitutionMade,
    handleSetSubInterval,

    // Data queries
    masterRosterQueryResultData,
    seasonsQueryResultData,
    tournamentsQueryResultData,
    allSavedGamesQueryResultData,
    currentGameIdSettingQueryResultData,
    isGameDataLoading,
    gameDataError,
    teams,

    // Local state
    savedGames,
    setSavedGames,
    currentGameId,
    setCurrentGameId,
    gameIdRef,
    seasons,
    setSeasons,
    tournaments,
    setTournaments,
    defaultTeamNameSetting,
    setDefaultTeamNameSetting,
    appLanguage,
    setAppLanguage,
    initialLoadComplete,
    setInitialLoadComplete,

    // Utility refs
    queryClient,
    t,
  };
}

export type UseGameOrchestrationReturn = ReturnType<typeof useGameOrchestration>;
