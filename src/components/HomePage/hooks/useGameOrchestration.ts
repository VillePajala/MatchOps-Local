import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ComponentProps } from 'react';
import type ControlBar from '@/components/ControlBar';
import type { GameContainerProps } from '@/components/HomePage/containers/GameContainer';
import type { ModalManagerProps } from '@/components/HomePage/containers/ModalManager';
import usePlayerAssessments from '@/hooks/usePlayerAssessments';
import { exportFullBackup } from '@/utils/fullBackup';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useFieldCoordination } from './useFieldCoordination';
import { useTimerManagement } from './useTimerManagement';
// Import game session types (reducer is used internally by useGameSessionWithHistory)
import {
  GameSessionState,
  // initialGameSessionStatePlaceholder // We will derive initial state from page.tsx's initialState
} from '@/hooks/useGameSessionReducer';
// Import roster utility functions
// roster mutations now managed inside useRoster hook

// Removed unused import of utilGetMasterRoster

// Import utility functions for seasons and tournaments
import { saveGame as utilSaveGame, getLatestGameId, getSavedGames as utilGetSavedGames } from '@/utils/savedGames';
import {
  saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting,
  resetAppSettings as utilResetAppSettings,
  getHasSeenAppGuide,
  saveHasSeenAppGuide,
  getLastHomeTeamName as utilGetLastHomeTeamName,
  updateAppSettings as utilUpdateAppSettings,
} from '@/utils/appSettings';
import { getTeams, getTeam } from '@/utils/teams';
// Import Player from types directory
import { Player, Season, Tournament, Team } from '@/types';
// Import saveMasterRoster utility
import type { GameEvent, AppState, SavedGamesCollection, TimerState, PlayerAssessment } from "@/types";
import { saveMasterRoster } from '@/utils/masterRoster';
// Import useQuery, useMutation, useQueryClient
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoster } from '@/hooks/useRoster';
import { useGameDataManagement } from './useGameDataManagement';
import { useGameSessionCoordination } from './useGameSessionCoordination';
import { useGamePersistence } from './useGamePersistence';
import { useModalOrchestration } from './useModalOrchestration';
import { useModalContext } from '@/contexts/ModalProvider';
// Import async storage utilities
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from '@/utils/storage';
// Import query keys
import { queryKeys } from '@/config/queryKeys';
// Also import addSeason and addTournament for the new mutations
import { updateGameDetails as utilUpdateGameDetails } from '@/utils/savedGames';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { MASTER_ROSTER_KEY, TIMER_STATE_KEY, SEASONS_LIST_KEY } from "@/config/storageKeys";
import { exportJson } from '@/utils/exportGames';
import { exportCurrentGameExcel, exportAggregateExcel, exportPlayerExcel } from '@/utils/exportExcel';
// Icons imported where used; remove unused here to satisfy lint
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import { startNewGameWithSetup, cancelNewGameSetup } from '../utils/newGameHandlers';
import { buildGameContainerViewModel, isValidGameContainerVMInput } from '@/viewModels/gameContainer';
import type { BuildGameContainerVMInput } from '@/viewModels/gameContainer';
import type { FieldContainerProps, FieldInteractions } from '@/components/HomePage/containers/FieldContainer';
import type { ReducerDrivenModals } from '@/types';
import { debug } from '@/utils/debug';


// Empty initial data for clean app start
const initialAvailablePlayersData: Player[] = [];

const initialState: AppState = {
  playersOnField: [], // Start with no players on field
  opponents: [], // Start with no opponents
  drawings: [],
  availablePlayers: initialAvailablePlayersData, // <<< ADD: Use initial data here
  showPlayerNames: true,
  teamName: "My Team",
  gameEvents: [], // Initialize game events as empty array
  // Initialize game info
  opponentName: "Opponent",
  gameDate: new Date().toISOString().split('T')[0], // Default to today's date YYYY-MM-DD
  homeScore: 0,
  awayScore: 0,
  gameNotes: '', // Initialize game notes as empty string
  homeOrAway: 'home', // <<< Step 1: Initialize field
  // Initialize game structure
  numberOfPeriods: 2,
  periodDurationMinutes: 15, // Default to 15 minutes
  currentPeriod: 1,
  gameStatus: 'notStarted', // Initialize game status
  demandFactor: 1,
  // Initialize selectedPlayerIds as empty for clean app start
  selectedPlayerIds: [],
  gamePersonnel: [],
  // gameType: 'season', // REMOVED
  seasonId: '', // Initialize season ID
  tournamentId: '', // Initialize tournament ID
  ageGroup: '',
  tournamentLevel: '',
  gameLocation: '', // Initialize optional fields
  gameTime: '', // Initialize optional fields
  // Timer related state
  subIntervalMinutes: 5, // Add sub interval with default
  completedIntervalDurations: [], // Initialize completed interval logs
  lastSubConfirmationTimeSeconds: 0, // Initialize last substitution confirmation time
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0.5, relY: 0.5 },
};

export interface UseGameOrchestrationProps {
  initialAction?: 'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'season' | 'stats' | 'roster' | 'teams' | 'settings';
  skipInitialSetup?: boolean;
  onDataImportSuccess?: () => void;
  isFirstTimeUser?: boolean;
}

export interface UseGameOrchestrationReturn {
  gameContainerProps: GameContainerProps;
  modalManagerProps: ModalManagerProps;
  isBootstrapping: boolean;
  isResetting: boolean;
}

export function useGameOrchestration({ initialAction, skipInitialSetup = false, onDataImportSuccess, isFirstTimeUser = false }: UseGameOrchestrationProps): UseGameOrchestrationReturn {
  // Sync hasSkippedInitialSetup with prop to prevent flash
  const [hasSkippedInitialSetup, setHasSkippedInitialSetup] = useState<boolean>(skipInitialSetup);
  const { t } = useTranslation(); // Get translation function
  const queryClient = useQueryClient(); // Get query client instance

  // --- Game Session Coordination (Step 2.6.2) ---
  const sessionCoordination = useGameSessionCoordination({
    initialState,
  });

  // Destructure commonly used values for convenience
  const {
    gameSessionState,
    dispatchGameSession,
    initialGameSessionData,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
    resetHistory,
    saveStateToHistory: saveStateToHistoryFromSession,
    saveTacticalStateToHistory: saveTacticalStateToHistoryFromSession,
    tacticalHistory,
  } = sessionCoordination;

  // Wrap in useCallback to satisfy custom lint rule (already stable from hook)
  const saveStateToHistory = useCallback(saveStateToHistoryFromSession, [saveStateToHistoryFromSession]);
  const saveTacticalStateToHistory = useCallback(saveTacticalStateToHistoryFromSession, [saveTacticalStateToHistoryFromSession]);

  // --- Get showToast early (needed by Field Coordination) ---
  const { showToast } = useToast();

  // --- Roster Management (Must come before Field Coordination) ---
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
    // handleSetGoalieStatus, // No longer used - using per-game implementation
  } = useRoster({
    initialPlayers: initialState.availablePlayers,
    selectedPlayerIds: gameSessionState.selectedPlayerIds,
  });

  // --- Field Coordination (Extracted to Hook) ---
  const fieldCoordination = useFieldCoordination({
    initialState,
    saveStateToHistory,
    saveTacticalStateToHistory,
    availablePlayers,
    selectedPlayerIds: gameSessionState.selectedPlayerIds,
    canUndo,
    canRedo,
    tacticalHistory,
    showToast,
    t,
  });

  // --- History Orchestration (Undo/Redo) ---
  /**
   * Orchestrate undo across both field and session state
   *
   * Separates concerns: field coordination restores field state,
   * session coordination restores game session state.
   */
  const handleUndo = useCallback(() => {
    const prevState = undoHistory();
    if (prevState) {
      logger.log('Undoing...');
      // Apply field state (players, opponents, drawings, tactical)
      fieldCoordination.applyFieldHistoryState(prevState);
      // Apply session state (score, timer, periods, etc.)
      sessionCoordination.applyHistoryState(prevState);
    } else {
      logger.log('Cannot undo: at beginning of history');
    }
  }, [undoHistory, fieldCoordination, sessionCoordination]);

  /**
   * Orchestrate redo across both field and session state
   *
   * Separates concerns: field coordination restores field state,
   * session coordination restores game session state.
   */
  const handleRedo = useCallback(() => {
    const nextState = redoHistory();
    if (nextState) {
      logger.log('Redoing...');
      // Apply field state (players, opponents, drawings, tactical)
      fieldCoordination.applyFieldHistoryState(nextState);
      // Apply session state (score, timer, periods, etc.)
      sessionCoordination.applyHistoryState(nextState);
    } else {
      logger.log('Cannot redo: at end of history');
    }
  }, [redoHistory, fieldCoordination, sessionCoordination]);

  // --- State Management (Remaining in Home component) ---
  // const [showPlayerNames, setShowPlayerNames] = useState<boolean>(initialState.showPlayerNames); // REMOVE - Migrated to gameSessionState
  // const [gameEvents, setGameEvents] = useState<GameEvent[]>(initialState.gameEvents); // REMOVE - Migrated to gameSessionState
  // const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(initialState.selectedPlayerIds); // REMOVE - Migrated to gameSessionState
  // const [seasonId, setSeasonId] = useState<string>(initialState.seasonId); // REMOVE - Migrate to gameSessionState
  // const [tournamentId, setTournamentId] = useState<string>(initialState.tournamentId); // REMOVE - Migrate to gameSessionState
  // Add state for location and time
  // const [gameLocation, setGameLocation] = useState<string>(initialState.gameLocation || ''); // REMOVE - Migrate to gameSessionState
  // const [gameTime, setGameTime] = useState<string>(initialState.gameTime || ''); // REMOVE - Migrate to gameSessionState
  // ... Timer state ...
  // ... Modal states ...
  // ... UI/Interaction states ...
  // draggingPlayerFromBarInfo now managed by useFieldCoordination
  // Persistence state
  // TODO: Remove savedGames local state once all references are updated to use gameDataManagement.savedGames
  const [savedGames, setSavedGames] = useState<SavedGamesCollection>({});
  const [currentGameId, setCurrentGameId] = useState<string | null>(DEFAULT_GAME_ID);
  const [isPlayed, setIsPlayed] = useState<boolean>(true);
  const [hasCheckedInstructionsModal, setHasCheckedInstructionsModal] = useState<boolean>(false);

  // This ref needs to be declared after currentGameId
  const gameIdRef = useRef(currentGameId);

  useEffect(() => { gameIdRef.current = currentGameId; }, [currentGameId]);

  const {
    assessments: playerAssessments,
    saveAssessment,
    deleteAssessment,
  } = usePlayerAssessments(
    currentGameId || '',
    gameSessionState.completedIntervalDurations,
  );

  // Temporary state for backward compatibility during migration
  // These will be removed once all references are updated to use gameDataManagement
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  // --- Game Data Management Hook ---
  const gameDataManagement = useGameDataManagement({
    currentGameId,
    setAvailablePlayers,
    setSeasons,
    setTournaments,
  });

  // TODO: Add useGamePersistence hook call here after reordering dependencies

  // <<< ADD: State for home/away status >>>
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  // hasSkippedInitialSetup moved to top of component to prevent flash
  const [defaultTeamNameSetting, setDefaultTeamNameSetting] = useState<string>('');
  const [appLanguage, setAppLanguage] = useState<string>(i18n.language);

  useEffect(() => {
    utilGetLastHomeTeamName().then((name) => setDefaultTeamNameSetting(name));
  }, []);



  useEffect(() => {
    i18n.changeLanguage(appLanguage);
    utilUpdateAppSettings({ language: appLanguage }).catch(() => {});
  }, [appLanguage]);

  // Modal state from context (needed for modal control within useGameOrchestration and reducerDrivenModals)
  const {
    isGameSettingsModalOpen,
    setIsGameSettingsModalOpen,
    isLoadGameModalOpen,
    setIsLoadGameModalOpen,
    isRosterModalOpen,
    setIsRosterModalOpen,
    isSeasonTournamentModalOpen,
    setIsSeasonTournamentModalOpen,
    isTrainingResourcesOpen,
    setIsTrainingResourcesOpen,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in reducerDrivenModals
    isGoalLogModalOpen,
    setIsGoalLogModalOpen,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- State managed by useModalOrchestration, setter used here
    isGameStatsModalOpen,
    setIsGameStatsModalOpen,
    isNewGameSetupModalOpen,
    setIsNewGameSetupModalOpen,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in reducerDrivenModals
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in reducerDrivenModals
    isPlayerAssessmentModalOpen,
    setIsPlayerAssessmentModalOpen,
  } = useModalContext();

  const openLoadGameViaReducer = useCallback(() => setIsLoadGameModalOpen(true), [setIsLoadGameModalOpen]);
  const closeLoadGameViaReducer = useCallback(() => setIsLoadGameModalOpen(false), [setIsLoadGameModalOpen]);
  const openNewGameViaReducer = useCallback(() => setIsNewGameSetupModalOpen(true), [setIsNewGameSetupModalOpen]);
  const closeNewGameViaReducer = useCallback(() => setIsNewGameSetupModalOpen(false), [setIsNewGameSetupModalOpen]);
  const openRosterViaReducer = useCallback(() => setIsRosterModalOpen(true), [setIsRosterModalOpen]);
  const closeRosterViaReducer = useCallback(() => setIsRosterModalOpen(false), [setIsRosterModalOpen]);
  const openSeasonTournamentViaReducer = useCallback(
    () => setIsSeasonTournamentModalOpen(true),
    [setIsSeasonTournamentModalOpen],
  );
  const closeSeasonTournamentViaReducer = useCallback(
    () => setIsSeasonTournamentModalOpen(false),
    [setIsSeasonTournamentModalOpen],
  );

  // Wrapper around reducer-backed modals (load/new). This mirrors the old setState-style API
  // so consumers can migrate incrementally before ModalManager adopts reducer helpers in 2.4.8.
  // Note: callbacks are already memoized via useCallback, so no useMemo needed for the object itself
  const reducerDrivenModals: ReducerDrivenModals = {
    loadGame: {
      isOpen: isLoadGameModalOpen,
      open: openLoadGameViaReducer,
      close: closeLoadGameViaReducer,
    },
    newGameSetup: {
      isOpen: isNewGameSetupModalOpen,
      open: openNewGameViaReducer,
      close: closeNewGameViaReducer,
    },
    roster: {
      isOpen: isRosterModalOpen,
      open: openRosterViaReducer,
      close: closeRosterViaReducer,
    },
    seasonTournament: {
      isOpen: isSeasonTournamentModalOpen,
      open: openSeasonTournamentViaReducer,
      close: closeSeasonTournamentViaReducer,
    },
  };

  // showToast already defined earlier (needed by useFieldCoordination)
  // const [isPlayerStatsModalOpen, setIsPlayerStatsModalOpen] = useState(false);
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<Player | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_selectedTeamForRoster, setSelectedTeamForRoster] = useState<string | null>(null);

  // --- Modal State now managed by useModalOrchestration (Step 2.6.6) ---
  // isTeamManagerOpen, isPersonnelManagerOpen, isInstructionsModalOpen moved to useModalOrchestration
  // Setters returned from useModalOrchestration and used by control bar handlers

  // --- Timer State now managed by useTimerManagement (Step 2.6.5) ---
  // showLargeTimerOverlay, isGoalLogModalOpen, timer handlers moved to useTimerManagement
  const [showFirstGameGuide, setShowFirstGameGuide] = useState<boolean>(false);
  // showResetFieldConfirm now managed by useFieldCoordination

  const handleCreateBackup = useCallback(() => {
    exportFullBackup(showToast);
  }, [showToast]);

  const handleManageTeamRosterFromNewGame = (teamId?: string) => {
    closeNewGameViaReducer();
    setPlayerIdsForNewGame(null);
    setIsTeamManagerOpen(true);
    if (teamId) {
      setSelectedTeamForRoster(teamId);
    }
  };

  // --- Timer Management Hook (Step 2.6.5) ---
  const timerManagement = useTimerManagement({
    gameSessionState,
    dispatchGameSession,
    currentGameId,
    availablePlayers,
    masterRoster: gameDataManagement.masterRoster || [],
    setIsGoalLogModalOpen,
  });

  // Destructure timer state and handlers for backward compatibility
  const {
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,
    showLargeTimerOverlay,
    handleToggleLargeTimerOverlay,
    // handleToggleGoalLogModal, handleAddGoalEvent, handleLogOpponentGoal moved to useModalOrchestration
    timerInteractions,
  } = timerManagement;

  // L2-2.4.1: Build GameContainer view-model (not yet consumed)
  const gameContainerVMInput = useMemo<BuildGameContainerVMInput>(() => ({
    gameSessionState: {
      teamName: gameSessionState.teamName,
      opponentName: gameSessionState.opponentName,
      homeScore: gameSessionState.homeScore,
      awayScore: gameSessionState.awayScore,
      homeOrAway: gameSessionState.homeOrAway,
      gameEvents: gameSessionState.gameEvents,
      timeElapsedInSeconds: gameSessionState.timeElapsedInSeconds,
      isTimerRunning: gameSessionState.isTimerRunning,
      subAlertLevel: gameSessionState.subAlertLevel,
      lastSubConfirmationTimeSeconds: gameSessionState.lastSubConfirmationTimeSeconds,
      numberOfPeriods: gameSessionState.numberOfPeriods,
      periodDurationMinutes: gameSessionState.periodDurationMinutes,
      currentPeriod: gameSessionState.currentPeriod,
      gameStatus: gameSessionState.gameStatus,
    },
    playersForCurrentGame,
    draggingPlayerFromBarInfo: fieldCoordination.draggingPlayerFromBarInfo,
  }), [
    gameSessionState.teamName,
    gameSessionState.opponentName,
    gameSessionState.homeScore,
    gameSessionState.awayScore,
    gameSessionState.homeOrAway,
    gameSessionState.gameEvents,
    gameSessionState.timeElapsedInSeconds,
    gameSessionState.isTimerRunning,
    gameSessionState.subAlertLevel,
    gameSessionState.lastSubConfirmationTimeSeconds,
    gameSessionState.numberOfPeriods,
    gameSessionState.periodDurationMinutes,
    gameSessionState.currentPeriod,
    gameSessionState.gameStatus,
    playersForCurrentGame,
    fieldCoordination.draggingPlayerFromBarInfo,
  ]);

  if (process.env.NODE_ENV !== 'production' && !isValidGameContainerVMInput(gameContainerVMInput)) {
    throw new Error('[HomePage] Invalid GameContainer view-model input detected.');
  }

  const gameContainerVM = useMemo(() => buildGameContainerViewModel(gameContainerVMInput), [gameContainerVMInput]);
  const playerBarViewModel = gameContainerVM.playerBar;
  const gameInfoViewModel = gameContainerVM.gameInfo;
  const [firstGameGuideStep, setFirstGameGuideStep] = useState<number>(0);
  // Initialize as true for experienced users to prevent any flash
  const [hasCheckedFirstGameGuide, setHasCheckedFirstGameGuide] = useState<boolean>(!isFirstTimeUser);

  useEffect(() => {
    if (!initialAction) return;
    
    // Only process the initial action once
    const processAction = () => {
      switch (initialAction) {
        case 'newGame':
          // Check if roster is empty before opening new game modal
          if (availablePlayers.length === 0) {
            setShowNoPlayersConfirm(true);
          } else {
            openNewGameViaReducer();
          }
          break;
        case 'loadGame':
          reducerDrivenModals.loadGame.open();
          break;
        case 'season':
          openSeasonTournamentViaReducer();
          break;
        case 'stats':
          setIsGameStatsModalOpen(true);
          break;
        case 'roster':
          openRosterViaReducer();
          break;
        case 'teams':
          setIsTeamManagerOpen(true);
          break;
        case 'settings':
          setIsSettingsModalOpen(true);
          break;
        case 'explore':
          // Explore mode - just let user access the temporary workspace
          // The first-game overlay will appear automatically for DEFAULT_GAME_ID
          // No modal needs to be opened, user can explore the interface freely
          break;
        default:
          break;
      }
    };
    
    processAction();
    // Only run once when initialAction changes, not when availablePlayers or t changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction]);
  
  // --- Modal States handled via context ---

  // <<< ADD State to hold player IDs for the next new game >>>
  const [playerIdsForNewGame, setPlayerIdsForNewGame] = useState<string[] | null>(null);
  const [newGameDemandFactor, setNewGameDemandFactor] = useState(1);
  // <<< ADD State for the roster prompt toast >>>
  // const [showRosterPrompt, setShowRosterPrompt] = useState<boolean>(false);

  // State for game saving error (loading state is from saveGameMutation.isLoading)

  // NEW: States for LoadGameModal operations
  const [isLoadingGamesList, setIsLoadingGamesList] = useState(false);

  // Confirmation modal states - Passed to useModalOrchestration
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- State passed to useModalOrchestration, setter used in handlers
  const [showNoPlayersConfirm, setShowNoPlayersConfirm] = useState(false);
  const [showHardResetConfirm, setShowHardResetConfirm] = useState(false);
  const [showSaveBeforeNewConfirm, setShowSaveBeforeNewConfirm] = useState(false);
  const [gameIdentifierForSave, setGameIdentifierForSave] = useState<string>('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- State passed to useModalOrchestration, setter used in handlers
  const [showStartNewConfirm, setShowStartNewConfirm] = useState(false);
  const [loadGamesListError, setLoadGamesListError] = useState<string | null>(null);
  // Load/delete game state moved to useGamePersistence hook
  const [orphanedGameInfo, setOrphanedGameInfo] = useState<{ teamId: string; teamName?: string } | null>(null);
  const [isTeamReassignModalOpen, setIsTeamReassignModalOpen] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  // processingGameId moved to useGamePersistence hook
  const [isResetting, setIsResetting] = useState(false); // For app reset operation

  // Load teams when orphaned game is detected
  useEffect(() => {
    if (orphanedGameInfo) {
      getTeams().then(teams => {
        setAvailableTeams(teams);
      }).catch(error => {
        logger.error('[ORPHANED GAME] Error loading teams:', error);
        setAvailableTeams([]);
      });
    }
  }, [orphanedGameInfo]);

  // Handle team reassignment for orphaned games
  const handleTeamReassignment = async (newTeamId: string | null) => {
    if (!currentGameId || currentGameId === DEFAULT_GAME_ID) {
      logger.error('[TEAM REASSIGN] No current game to reassign');
      return;
    }

    try {
      // Get current game data
      const currentGame = savedGames[currentGameId];
      if (!currentGame) {
        logger.error('[TEAM REASSIGN] Current game not found');
        return;
      }

      // Update game with new teamId
      const updatedGame = {
        ...currentGame,
        teamId: newTeamId || undefined
      };

      // Save updated game
      await utilSaveGame(currentGameId, updatedGame);

      // Update local state
      setSavedGames(prev => ({
        ...prev,
        [currentGameId]: updatedGame
      }));

      // Invalidate React Query cache to update LoadGameModal
      queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

      // Clear orphaned state if team was assigned
      if (newTeamId) {
        setOrphanedGameInfo(null);
      }

      // Close modal
      setIsTeamReassignModalOpen(false);

      // Show success message (could add a toast notification here)
      logger.log('[TEAM REASSIGN] Game reassigned to team:', newTeamId);
    } catch (error) {
      logger.error('[TEAM REASSIGN] Error reassigning team:', error);
    }
  };

  // Mutations for seasons and tournaments are now managed by useGameDataManagement hook

  type UpdateGameDetailsMetaBase = {
  source: 'seasonPrefill' | 'tournamentPrefill' | 'seasonSelection' | 'tournamentSelection' | 'stateSync';
  targetId?: string;
  expectedState?: {
    seasonId?: string;
    tournamentId?: string;
    gameLocation?: string;
    ageGroup?: string;
    tournamentLevel?: string;
    selectedPlayerIds?: string[];
    gamePersonnel?: string[];
    gameTime?: string;
    teamName?: string;
    opponentName?: string;
    demandFactor?: number;
    numberOfPeriods?: number;
    periodDurationMinutes?: number;
    homeOrAway?: 'home' | 'away';
  };
  expectedIsPlayed?: boolean;
};

type UpdateGameDetailsMeta = UpdateGameDetailsMetaBase & { sequence: number };

  type UpdateGameDetailsVariables = {
    gameId: string;
    updates: Partial<AppState>;
    meta?: UpdateGameDetailsMeta;
  };

  const lastAppliedMutationSequenceRef = useRef(0);

  const updateGameDetailsMutation = useMutation<AppState | null, Error, UpdateGameDetailsVariables>({
    mutationFn: ({ gameId, updates }) => utilUpdateGameDetails(gameId, updates),
    onSuccess: (data, variables) => {
      const { meta } = variables;
      const shouldApplyUpdate = (() => {
        if (!meta?.source) return true;
        if (meta.sequence && meta.sequence < lastAppliedMutationSequenceRef.current) {
          logger.log('[updateGameDetailsMutation] Skipping stale update based on sequence', {
            sequence: meta.sequence,
            lastApplied: lastAppliedMutationSequenceRef.current,
            updates: variables.updates,
          });
          return false;
        }
        if ((meta.source === 'seasonPrefill' || meta.source === 'seasonSelection') && meta.targetId) {
          if (gameSessionState.seasonId !== meta.targetId) {
            logger.log('[updateGameDetailsMutation] Skipping stale season update', {
              currentSeasonId: gameSessionState.seasonId,
              targetId: meta.targetId,
            });
            return false;
          }
        }
        if ((meta.source === 'tournamentPrefill' || meta.source === 'tournamentSelection') && meta.targetId) {
          if (gameSessionState.tournamentId !== meta.targetId) {
            logger.log('[updateGameDetailsMutation] Skipping stale tournament update', {
              currentTournamentId: gameSessionState.tournamentId,
              targetId: meta.targetId,
            });
            return false;
          }
        }
        if (meta.expectedState) {
          for (const [key, value] of Object.entries(meta.expectedState)) {
            // Only check fields that exist in GameSessionState (it's a subset of AppState)
            if (key in gameSessionState) {
              const stateValue = (gameSessionState as unknown as Record<string, unknown>)[key];
              if (stateValue !== value) {
                logger.log('[updateGameDetailsMutation] Skipping update due to mismatched state', {
                  field: key,
                  expected: value,
                  actual: stateValue,
                });
                return false;
              }
            }
          }
        }
        if (meta.expectedIsPlayed !== undefined && isPlayed !== meta.expectedIsPlayed) {
          logger.log('[updateGameDetailsMutation] Skipping isPlayed update due to mismatch', {
            expected: meta.expectedIsPlayed,
            actual: isPlayed,
          });
          return false;
        }
        return true;
      })();

      if (!shouldApplyUpdate) {
        return;
      }

      if (meta?.sequence) {
        lastAppliedMutationSequenceRef.current = meta.sequence;
      }

      // After a successful update, invalidate the savedGames query to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

      // Optimistically update the query cache
      queryClient.setQueryData(queryKeys.savedGames, (oldData: SavedGamesCollection | undefined) => {
        if (!oldData) return oldData;
        const existing = oldData[variables.gameId];
        return {
          ...oldData,
          [variables.gameId]: { ...existing, ...variables.updates },
        };
      });

      // Keep local state in sync so components using savedGames see the update
      setSavedGames(prev => {
        const existing = prev[variables.gameId];
        return {
          ...prev,
          [variables.gameId]: data ?? { ...existing, ...variables.updates },
        };
      });
    },
    onError: (error) => {
      logger.error("Error updating game details:", error);
      // Here you could show a toast notification to the user
      },
  });

  useEffect(() => {
    lastAppliedMutationSequenceRef.current = 0;
  }, [currentGameId]);

  useEffect(() => {
    if (isGameSettingsModalOpen) {
      lastAppliedMutationSequenceRef.current = 0;
    }
  }, [isGameSettingsModalOpen]);

  // Data synchronization effects are now managed by useGameDataManagement hook

  // --- Effect to sync playersOnField details with availablePlayers changes ---
  useEffect(() => {
    if (availablePlayers && availablePlayers.length > 0) {
      fieldCoordination.setPlayersOnField(prevPlayersOnField => {
        const nextPlayersOnField = prevPlayersOnField.map(fieldPlayer => {
          const rosterPlayer = availablePlayers.find(ap => ap.id === fieldPlayer.id);
          if (rosterPlayer) {
            // Sync relevant properties from rosterPlayer to fieldPlayer
            // Only update if there's a difference to avoid unnecessary re-renders / history saves
            if (fieldPlayer.name !== rosterPlayer.name || 
                fieldPlayer.jerseyNumber !== rosterPlayer.jerseyNumber || 
                fieldPlayer.isGoalie !== rosterPlayer.isGoalie ||
                fieldPlayer.nickname !== rosterPlayer.nickname ||
                fieldPlayer.notes !== rosterPlayer.notes
                // Add any other properties that should be synced
            ) {
              return {
                ...fieldPlayer, // Keep position (relX, relY)
                name: rosterPlayer.name,
                jerseyNumber: rosterPlayer.jerseyNumber,
                isGoalie: rosterPlayer.isGoalie,
                nickname: rosterPlayer.nickname,
                notes: rosterPlayer.notes,
                // Ensure other essential Player properties are maintained if not in rosterPlayer directly
                receivedFairPlayCard: rosterPlayer.receivedFairPlayCard !== undefined ? rosterPlayer.receivedFairPlayCard : fieldPlayer.receivedFairPlayCard
              };
            }
          }
          return fieldPlayer; // Return original if no corresponding roster player or no changes
        });

        // Only save to history if actual changes were made to playersOnField
        if (JSON.stringify(prevPlayersOnField) !== JSON.stringify(nextPlayersOnField)) {
          saveStateToHistory({ playersOnField: nextPlayersOnField });
        }
        return nextPlayersOnField;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePlayers, saveStateToHistory]); // setPlayersOnField is from useGameState, should be stable if not changing the hook itself
  // Note: We don't want setPlayersOnField in deps if it causes loops.
  // saveStateToHistory is also a dependency as it's used inside.
  
  useEffect(() => {
    const loadInitialAppData = async () => {
      if (initialLoadComplete) {
        return;
      }
      // This useEffect now primarily ensures that dependent state updates happen
      // after the core data (masterRoster, seasons, tournaments, savedGames, currentGameIdSetting)
      // has been fetched by their respective useQuery hooks.

      // Simple migration for old data keys (if any) - Run once
      // NOTE: This is legacy migration code - consider removing after main migration system is stable
      try {
        const oldRosterJson = await getStorageItem('availablePlayers').catch(() => null);
        if (oldRosterJson) {
          await setStorageItem(MASTER_ROSTER_KEY, oldRosterJson);
          await removeStorageItem('availablePlayers');
          // Consider invalidating and refetching masterRoster query here if migration happens
          // queryClient.invalidateQueries(queryKeys.masterRoster);
        }
        const oldSeasonsJson = await getStorageItem('soccerSeasonsList').catch(() => null); // Another old key
      if (oldSeasonsJson) {
          await setStorageItem(SEASONS_LIST_KEY, oldSeasonsJson); // New key
          // queryClient.invalidateQueries(queryKeys.seasons);
      }
    } catch (migrationError) {
        logger.error('[EFFECT init] Error during data migration:', migrationError);
      }

      // Master Roster, Seasons, Tournaments are handled by their own useEffects reacting to useQuery.

      // 4. Update local savedGames state from useQuery for allSavedGames
      if (gameDataManagement.isLoading) {
        setIsLoadingGamesList(true);
      }
      if (gameDataManagement.savedGames) {
        setSavedGames(gameDataManagement.savedGames || {});
        setIsLoadingGamesList(false);
      }
      if (gameDataManagement.error) {
        logger.error('[EFFECT init] Error loading all saved games via TanStack Query:', gameDataManagement.error);
        setLoadGamesListError(t('loadGameModal.errors.listLoadFailed', 'Failed to load saved games list.'));
      setSavedGames({});
        setIsLoadingGamesList(false);
      }

      // 5. Determine and set current game ID and related state from useQuery data
      if (gameDataManagement.isLoading) {
      } else {
        const lastGameIdSetting = gameDataManagement.currentGameIdSetting;
        const currentSavedGames = gameDataManagement.savedGames || {}; 

        if (lastGameIdSetting && lastGameIdSetting !== DEFAULT_GAME_ID && currentSavedGames[lastGameIdSetting]) {
          setCurrentGameId(lastGameIdSetting);
          setHasSkippedInitialSetup(true);
        } else {
          if (lastGameIdSetting && lastGameIdSetting !== DEFAULT_GAME_ID) {
            logger.warn(`[EFFECT init] Last game ID ${lastGameIdSetting} not found in saved games (from TanStack Query). Loading default.`);
          }
        setCurrentGameId(DEFAULT_GAME_ID);
      }
    }
    
      // Determine overall initial load completion
      if (!gameDataManagement.isLoading) {
        // --- TIMER RESTORATION LOGIC ---
        try {
          const savedTimerStateJSON = await getStorageItem(TIMER_STATE_KEY).catch(() => null);
          const lastGameId = gameDataManagement.currentGameIdSetting;

          if (savedTimerStateJSON) {
            const savedTimerState: TimerState = JSON.parse(savedTimerStateJSON);
            if (savedTimerState && savedTimerState.gameId === lastGameId) {
              const elapsedOfflineSeconds = (Date.now() - savedTimerState.timestamp) / 1000;
              const correctedElapsedSeconds = Math.round(savedTimerState.timeElapsedInSeconds + elapsedOfflineSeconds);

              dispatchGameSession({ type: 'SET_TIMER_ELAPSED', payload: correctedElapsedSeconds });
              // Use START_TIMER instead of SET_TIMER_RUNNING to properly set startTimestamp
              dispatchGameSession({ type: 'START_TIMER' });
            } else {
              await removeStorageItem(TIMER_STATE_KEY).catch(() => {});
            }
          }
        } catch (error) {
          logger.error('[EFFECT init] Error restoring timer state:', error);
          await removeStorageItem(TIMER_STATE_KEY).catch(() => {});
        }
        // --- END TIMER RESTORATION LOGIC ---

        // This is now the single source of truth for loading completion.
        setInitialLoadComplete(true);
      }
    };

    loadInitialAppData();
  }, [
    gameDataManagement.savedGames,
    gameDataManagement.currentGameIdSetting,
    gameDataManagement.isLoading,
    gameDataManagement.error,
    setSavedGames,
    setIsLoadingGamesList,
    setLoadGamesListError,
    setCurrentGameId,
    setHasSkippedInitialSetup,
    t,
    initialLoadComplete,
    initialAction, // Used to determine if instructions modal should show automatically
    savedGames, // Used to check if user has any saved games for instructions modal logic
    dispatchGameSession, // Used for timer restoration
    // setIsInstructionsModalOpen intentionally excluded - useState setter is stable (from useModalOrchestration)
  ]);

  // Check if we should show first game interface guide
  useEffect(() => {
    // If not a first-time user (experienced user), mark as checked and don't show guide
    if (!isFirstTimeUser) {
      setHasCheckedFirstGameGuide(true);
      return;
    }

    if (!initialLoadComplete) return;

    const checkFirstGameGuide = async () => {
      try {
        const firstGameGuideShown = await getStorageItem('hasSeenFirstGameGuide').catch(() => null);

        // Also check if user has any saved games (imported or created)
        const savedGames = await utilGetSavedGames();
        const hasMultipleGames = Object.keys(savedGames).length > 1; // More than just default game

        logger.log('[FirstGameGuide] Checking conditions:', {
          isFirstTimeUser,
          firstGameGuideShown,
          currentGameId,
          hasMultipleGames,
          isNotDefaultGame: currentGameId !== DEFAULT_GAME_ID,
          shouldShow: isFirstTimeUser && !firstGameGuideShown && !hasMultipleGames && currentGameId && currentGameId !== DEFAULT_GAME_ID
        });

        // Only show guide for first-time users who:
        // 1. Haven't seen it before, AND
        // 2. Don't have multiple games (imported or created), AND
        // 3. Have a current game that's not the default game
        if (!firstGameGuideShown && !hasMultipleGames && currentGameId && currentGameId !== DEFAULT_GAME_ID) {
          // Show immediately without delay to prevent flash
          logger.log('[FirstGameGuide] Showing first game guide');
          setShowFirstGameGuide(true);
        }

        // Mark that we've completed the check
        setHasCheckedFirstGameGuide(true);
      } catch (error) {
        // Silent fail - guide check is not critical
        logger.error('[FirstGameGuide] Error checking first game guide:', error);
        // Still mark as checked even on error to prevent blocking
        setHasCheckedFirstGameGuide(true);
      }
    };

    checkFirstGameGuide();
  }, [initialLoadComplete, currentGameId, isFirstTimeUser]);

  // --- NEW: Robust Visibility Change Handling ---
  // --- Wake Lock Effect ---
  useEffect(() => {
    // This effect is now replaced by the direct call in the main timer effect
    // to avoid race conditions.
  }, []);

  // Helper function to load game state from game data
  const loadGameStateFromData = async (gameData: AppState | null, isInitialDefaultLoad = false) => {
    logger.log('[LOAD GAME STATE] Called with gameData:', gameData, 'isInitialDefaultLoad:', isInitialDefaultLoad);

    // Check for orphaned game (has teamId but team doesn't exist)
    if (gameData?.teamId) {
      try {
        const team = await getTeam(gameData.teamId);
        if (!team) {
          // Team was deleted - game is orphaned
          setOrphanedGameInfo({ 
            teamId: gameData.teamId,
            teamName: gameData.teamName // Preserve original team name if available
          });
        } else {
          // Team exists - clear any previous orphaned state
          setOrphanedGameInfo(null);
        }
      } catch (error) {
        logger.error('[LOAD GAME] Error checking team existence:', error);
        // Assume orphaned on error
        setOrphanedGameInfo({ teamId: gameData.teamId, teamName: gameData.teamName });
      }
    } else {
      // No teamId - legacy game or "No Team" selection
      setOrphanedGameInfo(null);
    }

    if (gameData) {
      // gameData is AppState, map its fields directly to GameSessionState partial payload
      const payload: Partial<GameSessionState> = {
        teamName: gameData.teamName,
        opponentName: gameData.opponentName,
        gameDate: gameData.gameDate,
        homeScore: gameData.homeScore,
        awayScore: gameData.awayScore,
        gameNotes: gameData.gameNotes,
        homeOrAway: gameData.homeOrAway,
        numberOfPeriods: gameData.numberOfPeriods,
        periodDurationMinutes: gameData.periodDurationMinutes,
        currentPeriod: gameData.currentPeriod,
        gameStatus: gameData.gameStatus,
        selectedPlayerIds: gameData.selectedPlayerIds,
        gamePersonnel: Array.isArray(gameData.gamePersonnel) ? gameData.gamePersonnel : [],
        seasonId: gameData.seasonId ?? undefined,
        tournamentId: gameData.tournamentId ?? undefined,
        teamId: gameData.teamId,
        gameLocation: gameData.gameLocation,
        gameTime: gameData.gameTime,
        demandFactor: gameData.demandFactor,
        gameEvents: gameData.gameEvents,
        subIntervalMinutes: gameData.subIntervalMinutes,
        completedIntervalDurations: gameData.completedIntervalDurations,
        lastSubConfirmationTimeSeconds: gameData.lastSubConfirmationTimeSeconds,
        showPlayerNames: gameData.showPlayerNames,
      };
      dispatchGameSession({ type: 'LOAD_PERSISTED_GAME_DATA', payload });
    } else {
      dispatchGameSession({ type: 'RESET_TO_INITIAL_STATE', payload: initialGameSessionData });
      setIsPlayed(true);
    }

    // Update non-reducer states (these will eventually be migrated or handled differently)
    // For fields not yet in gameSessionState but are in GameData, update their local states if needed.
    // This part will shrink as more state moves to the reducer.
    fieldCoordination.setPlayersOnField(gameData?.playersOnField || (isInitialDefaultLoad ? initialState.playersOnField : []));
    fieldCoordination.setOpponents(gameData?.opponents || (isInitialDefaultLoad ? initialState.opponents : []));
    fieldCoordination.setDrawings(gameData?.drawings || (isInitialDefaultLoad ? initialState.drawings : []));
    fieldCoordination.setTacticalDiscs(gameData?.tacticalDiscs || (isInitialDefaultLoad ? initialState.tacticalDiscs : []));
    fieldCoordination.setTacticalDrawings(gameData?.tacticalDrawings || (isInitialDefaultLoad ? initialState.tacticalDrawings : []));
    fieldCoordination.setTacticalBallPosition(gameData?.tacticalBallPosition || { relX: 0.5, relY: 0.5 });
    setIsPlayed(gameData?.isPlayed === false ? false : true);

    // Load per-game availablePlayers (with per-game goalie status)
    // Prioritize saved game data, fall back to master roster for new games
    setAvailablePlayers(gameData?.availablePlayers || gameDataManagement.masterRoster || availablePlayers);
    
    // Update gameEvents from gameData if present, otherwise from initial state if it's an initial default load
    // setGameEvents(gameData?.events || (isInitialDefaultLoad ? initialState.gameEvents : [])); // REMOVE - Handled by LOAD_PERSISTED_GAME_DATA in reducer

    // Update selectedPlayerIds, seasonId, tournamentId, gameLocation, gameTime from gameData
    // These are also part of gameSessionState now, but local states might still be used by some components directly.
    // Prefer sourcing from gameSessionState once components are updated.
    // setSelectedPlayerIds(gameData?.selectedPlayerIds || (isInitialDefaultLoad ? initialState.selectedPlayerIds : [])); // REMOVE - Handled by LOAD_PERSISTED_GAME_DATA
    // setSeasonId(gameData?.seasonId || (isInitialDefaultLoad ? initialState.seasonId : '')); // REMOVE - Handled by LOAD_PERSISTED_GAME_DATA
    // setTournamentId(gameData?.tournamentId || (isInitialDefaultLoad ? initialState.tournamentId : '')); // REMOVE - Handled by LOAD_PERSISTED_GAME_DATA
    // setShowPlayerNames(gameData?.showPlayerNames === undefined ? (isInitialDefaultLoad ? initialState.showPlayerNames : true) : gameData.showPlayerNames); // REMOVE - Handled by LOAD_PERSISTED_GAME_DATA in reducer


    // History state should be based on the new gameSessionState + other states
    // For simplicity, we'll form history state AFTER the reducer has processed the load.
    // This requires a slight delay or a way to access the state post-dispatch if saveStateToHistory is called immediately.
    // For now, let's assume gameSessionState is updated for the next render cycle.
    // A more robust way would be to have LOAD_PERSISTED_GAME_DATA return the new state or use a useEffect.

    // Construct historyState using the *potentially* updated gameSessionState for the next render.
    // And combine with other non-reducer states.
    const newHistoryState: AppState = {
      teamName: gameData?.teamName ?? initialGameSessionData.teamName,
      opponentName: gameData?.opponentName ?? initialGameSessionData.opponentName,
      gameDate: gameData?.gameDate ?? initialGameSessionData.gameDate,
      homeScore: gameData?.homeScore ?? initialGameSessionData.homeScore,
      awayScore: gameData?.awayScore ?? initialGameSessionData.awayScore,
      gameNotes: gameData?.gameNotes ?? initialGameSessionData.gameNotes,
      homeOrAway: gameData?.homeOrAway ?? initialGameSessionData.homeOrAway,
      numberOfPeriods: gameData?.numberOfPeriods ?? initialGameSessionData.numberOfPeriods,
      periodDurationMinutes: gameData?.periodDurationMinutes ?? initialGameSessionData.periodDurationMinutes,
      currentPeriod: gameData?.currentPeriod ?? initialGameSessionData.currentPeriod,
      gameStatus: gameData?.gameStatus ?? initialGameSessionData.gameStatus,
      seasonId: gameData?.seasonId ?? initialGameSessionData.seasonId,
      tournamentId: gameData?.tournamentId ?? initialGameSessionData.tournamentId,
      gameLocation: gameData?.gameLocation ?? initialGameSessionData.gameLocation,
      gameTime: gameData?.gameTime ?? initialGameSessionData.gameTime,
      demandFactor: gameData?.demandFactor ?? initialGameSessionData.demandFactor,
      subIntervalMinutes: gameData?.subIntervalMinutes ?? initialGameSessionData.subIntervalMinutes,
      completedIntervalDurations: gameData?.completedIntervalDurations ?? initialGameSessionData.completedIntervalDurations,
      lastSubConfirmationTimeSeconds: gameData?.lastSubConfirmationTimeSeconds ?? initialGameSessionData.lastSubConfirmationTimeSeconds,
      showPlayerNames: gameData?.showPlayerNames === undefined ? initialGameSessionData.showPlayerNames : gameData.showPlayerNames,
      selectedPlayerIds: gameData?.selectedPlayerIds ?? initialGameSessionData.selectedPlayerIds,
      gameEvents: gameData?.gameEvents ?? initialGameSessionData.gameEvents,
      gamePersonnel: gameData?.gamePersonnel ?? [],
      playersOnField: gameData?.playersOnField || initialState.playersOnField,
      opponents: gameData?.opponents || initialState.opponents,
      drawings: gameData?.drawings || initialState.drawings,
      tacticalDiscs: gameData?.tacticalDiscs || [],
      tacticalDrawings: gameData?.tacticalDrawings || [],
      tacticalBallPosition: gameData?.tacticalBallPosition || { relX: 0.5, relY: 0.5 },
      availablePlayers: gameData?.availablePlayers || gameDataManagement.masterRoster || availablePlayers,
    };
    resetHistory(newHistoryState);
    logger.log('[LOAD GAME STATE] Finished dispatching. Reducer will update gameSessionState.');
  };

  // --- Effect to load game state when currentGameId changes or savedGames updates ---
  useEffect(() => {
    const loadGame = async () => {
      logger.log('[EFFECT game load] currentGameId or savedGames changed:', { currentGameId });
      if (!initialLoadComplete) {
        logger.log('[EFFECT game load] Initial load not complete, skipping game state application.');
        return; 
      }

      if (currentGameId && currentGameId !== DEFAULT_GAME_ID) {
        const gameToLoad = savedGames[currentGameId] as AppState | undefined;
        if (!gameToLoad) {
          logger.warn('[EFFECT game load] Saved game not yet available for currentGameId, skipping to avoid clobbering with defaults', { currentGameId });
          return;
        }
        logger.log(`[EFFECT game load] Found game data for ${currentGameId}`);
        await loadGameStateFromData(gameToLoad); 
        return;
      }

      // Only apply defaults if not transitioning to a specific game
      logger.log('[EFFECT game load] No specific game to load or ID is default. Skipping default load to avoid overwriting state.');
    };
    
    loadGame();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGameId, initialLoadComplete, savedGames]); // Ensure data is present before loading to avoid defaults clobbering new game.

  // --- Save state to localStorage ---
  // Legacy auto-save effect moved to useGamePersistence hook (with 3-tier debouncing)

  // **** ADDED: Effect to prompt for setup if default game ID is loaded ****
  useEffect(() => {
    logger.log('[Modal Trigger Effect] Running. initialLoadComplete:', initialLoadComplete, 'hasSkipped:', hasSkippedInitialSetup);
    // Only run the check *after* initial load is fully complete and setup hasn't been skipped
    if (initialLoadComplete && !hasSkippedInitialSetup) {
      // Check currentGameId *inside* the effect body
      if (currentGameId === DEFAULT_GAME_ID) {
        logger.log('Default game ID loaded, prompting for setup...');
        openNewGameViaReducer();
      } else {
        logger.log('Not prompting: Specific game loaded.');
    }
    }
  }, [initialLoadComplete, hasSkippedInitialSetup, currentGameId, openNewGameViaReducer]);

  // --- Player Management Handlers - MOVED TO useFieldCoordination ---


  // --- Reset Handlers - MOVED TO useFieldCoordination ---
  // --- Touch Drag from Bar Handlers - MOVED TO useFieldCoordination ---

  // --- History Handlers - MOVED TO useFieldCoordination ---

  // --- Game Persistence Hook ---
  const persistence = useGamePersistence({
    // Current game ID (managed externally)
    currentGameId,
    setCurrentGameId,

    // State from other hooks
    gameSessionState,
    fieldCoordination,
    availablePlayers,
    playerAssessments,
    isPlayed,
    initialLoadComplete,

    // From useGameDataManagement
    savedGames: gameDataManagement.savedGames || {},
    setSavedGames,

    // History management
    resetHistory,

    // Initial state for resets
    initialState,
    initialGameSessionData,

    // Callbacks
    dispatchGameSession,
    loadGameStateFromData,
    showToast,
    t,

    // Query client for cache invalidation
    queryClient,

    // Modal control
    handleCloseLoadGameModal: closeLoadGameViaReducer,
  });

  // useModalOrchestration hook call moved to line 2138 (after all handlers are defined)

  // Legacy handler - delegates to session coordination
  const handleTeamNameChange = (newName: string) => {
    sessionCoordination.handlers.setTeamName(newName);
  };

  // --- Timer Handlers now provided by useTimerManagement (Step 2.6.5) ---
  // handleToggleLargeTimerOverlay, handleToggleGoalLogModal, handleAddGoalEvent, handleLogOpponentGoal
  // moved to useTimerManagement hook

  // Handler to update an existing game event
  const handleUpdateGameEvent = (updatedEvent: GameEvent) => {
    const cleanUpdatedEvent: GameEvent = { id: updatedEvent.id, type: updatedEvent.type, time: updatedEvent.time, scorerId: updatedEvent.scorerId, assisterId: updatedEvent.assisterId }; // Keep cleaning
    
    dispatchGameSession({ type: 'UPDATE_GAME_EVENT', payload: cleanUpdatedEvent });
    
    logger.log("Updated game event via dispatch:", updatedEvent.id);
  };

  // handleDeleteGameEvent moved to useGamePersistence hook
  // --- Button/Action Handlers ---
  
  // RENAMED & UPDATED Handler: Just opens the setup modal after confirmation
  
  
  // NEW: Handler to actually reset state and set opponent/date/type from modal
  // Update signature to accept seasonId/tournamentId from the modal
    // Update signature to accept seasonId/tournamentId from the modal
  
  // NEW: Handler to cancel the new game setup
  // const handleCancelNewGameSetup = useCallback(() => { // REMOVED this line
  //   logger.log("Cancelling new game setup.");
  //   setIsNewGameSetupModalOpen(false);
  // }, []);

  // handleToggleGameStatsModal moved to useModalOrchestration
  // handleOpenTeamManagerModal and handleCloseTeamManagerModal moved to useModalOrchestration

  // Placeholder handlers - delegate to session coordination
  const handleOpponentNameChange = sessionCoordination.handlers.setOpponentName;
  const handleGameDateChange = sessionCoordination.handlers.setGameDate;
  const handleGameNotesChange = sessionCoordination.handlers.setGameNotes;

  // --- Handlers for Game Structure ---
  const handleSetNumberOfPeriods = sessionCoordination.handlers.setNumberOfPeriods;
  const handleSetPeriodDuration = sessionCoordination.handlers.setPeriodDuration;

  // Training Resources Modal
  const handleToggleTrainingResources = () => {
    setIsTrainingResourcesOpen(!isTrainingResourcesOpen);
  };

  // handleToggleInstructionsModal moved to useModalOrchestration

  const handleShowAppGuide = () => {
    saveHasSeenAppGuide(false);
    setIsSettingsModalOpen(false);
    setIsInstructionsModalOpen(true);
  };

  // NEW: Handler for Hard Reset
  const handleHardResetApp = useCallback(async () => {
    setShowHardResetConfirm(true);
  }, []);

  const handleHardResetConfirmed = useCallback(async () => {
    try {
      logger.log("Performing hard reset using utility...");

      // Show full-screen overlay to unmount all components
      setIsResetting(true);

      // Clear storage completely
      await utilResetAppSettings();

      logger.log("Hard reset complete, reloading app...");

      // Note: In development mode, Next.js HMR may show harmless module errors
      // after reload. These are cosmetic and don't affect functionality.
      // Production builds don't have this issue.
      window.location.reload();
    } catch (error) {
      logger.error("Error during hard reset:", error);
      setIsResetting(false); // Re-enable UI on error
      showToast("Failed to reset application data.", 'error');
    } finally {
      setShowHardResetConfirm(false);
    }
  }, [showToast]);


  
  // Placeholder handlers for Save/Load Modals

  // Modal open/close handlers moved to useModalOrchestration


  // Function to handle loading a selected game
  // handleLoadGame and handleDeleteGame moved to useGamePersistence hook

  // Function to export all saved games as a single JSON file (RENAMED & PARAMETERIZED)
  // const handleExportAllGamesJson = () => { // This function is no longer used
  //   // ...
  // };

  // Helper functions moved to exportGames util
  
  // --- INDIVIDUAL GAME EXPORT HANDLERS ---
  const handleExportOneJson = (gameId: string) => {
    const gameData = savedGames[gameId];
    if (!gameData) {
      showToast(`Error: Could not find game data for ${gameId}`, 'error');
      return;
    }
    exportJson(gameId, gameData, seasons, tournaments);
  };

  const handleExportOneExcel = (gameId: string) => {
    const gameData = savedGames[gameId];
    if (!gameData) {
      showToast(`Error: Could not find game data for ${gameId}`, 'error');
      return;
    }
    try {
      exportCurrentGameExcel(gameId, gameData, availablePlayers, seasons, tournaments);
    } catch (error) {
      logger.error('[handleExportOneExcel] Export failed:', error);
      showToast(t('export.exportGameFailed'), 'error');
    }
  };

  // --- END INDIVIDUAL GAME EXPORT HANDLERS ---

  // --- Roster Management Handlers ---
  const openRosterModal = () => {
    logger.log('[openRosterModal] Called. Setting highlightRosterButton to false.'); // Log modal open
    openRosterViaReducer();
    setHighlightRosterButton(false); // <<< Remove highlight when modal is opened
  };

  const openPlayerAssessmentModal = () => setIsPlayerAssessmentModalOpen(true);
  // closePlayerAssessmentModal moved to useModalOrchestration

  const handleSavePlayerAssessment = async (
    playerId: string,
    assessment: Partial<PlayerAssessment>,
  ) => {
    if (!currentGameId) return;
    const data: PlayerAssessment = {
      ...(assessment as PlayerAssessment),
      minutesPlayed: 0,
      createdAt: Date.now(),
      createdBy: 'local',
    };
    const updated = await saveAssessment(playerId, data);
    if (updated) {
      setSavedGames(prev => ({ ...prev, [currentGameId]: updated }));
    }
  };

  const handleDeletePlayerAssessment = async (playerId: string) => {
    if (!currentGameId) return;
    const updated = await deleteAssessment(playerId);
    if (updated) {
      setSavedGames(prev => ({ ...prev, [currentGameId]: updated }));
    }
  };
  

  // ... (other code in Home component) ...

  // closeRosterModal moved to useModalOrchestration

  // --- ASYNC Roster Management Handlers for RosterSettingsModal ---
  const handleRenamePlayerForModal = useCallback(async (playerId: string, playerData: { name: string; nickname?: string }) => {
    logger.log(`[Page.tsx] handleRenamePlayerForModal attempting mutation for ID: ${playerId}, new name: ${playerData.name}`);
    setRosterError(null); // Clear previous specific errors
    try {
      await handleUpdatePlayer(playerId, { name: playerData.name, nickname: playerData.nickname });
      logger.log(`[Page.tsx] rename player success for ${playerId}.`);
    } catch (error) {
      logger.error(`[Page.tsx] Exception during rename of ${playerId}:`, error);
    }
  }, [handleUpdatePlayer, setRosterError]);
  
  const handleSetJerseyNumberForModal = useCallback(async (playerId: string, jerseyNumber: string) => {
    logger.log(`[Page.tsx] handleSetJerseyNumberForModal attempting mutation for ID: ${playerId}, new number: ${jerseyNumber}`);
    setRosterError(null);

    try {
      await handleUpdatePlayer(playerId, { jerseyNumber });
      logger.log(`[Page.tsx] jersey number update successful for ${playerId}.`);
    } catch (error) {
      logger.error(`[Page.tsx] Exception during jersey number update of ${playerId}:`, error);
    }
  }, [handleUpdatePlayer, setRosterError]);

  const handleSetPlayerNotesForModal = useCallback(async (playerId: string, notes: string) => {
    logger.log(`[Page.tsx] handleSetPlayerNotesForModal attempting mutation for ID: ${playerId}`);
    setRosterError(null);

    try {
      await handleUpdatePlayer(playerId, { notes });
      logger.log(`[Page.tsx] notes update successful for ${playerId}.`);
    } catch (error) {
      logger.error(`[Page.tsx] Exception during notes update of ${playerId}:`, error);
    }
  }, [handleUpdatePlayer, setRosterError]);

  // Unified update handler for RosterSettingsModal (prevents race conditions)
  const handleUpdatePlayerForModal = useCallback(async (playerId: string, updates: Partial<Omit<Player, 'id'>>) => {
    logger.log(`[Page.tsx] handleUpdatePlayerForModal attempting mutation for ID: ${playerId}, updates:`, updates);
    setRosterError(null);

    try {
      await handleUpdatePlayer(playerId, updates);
      logger.log(`[Page.tsx] player update successful for ${playerId}.`);
    } catch (error) {
      logger.error(`[Page.tsx] Exception during update of ${playerId}:`, error);
    }
  }, [handleUpdatePlayer, setRosterError]);

    const handleRemovePlayerForModal = useCallback(async (playerId: string) => {
      logger.log(`[Page.tsx] handleRemovePlayerForModal attempting mutation for ID: ${playerId}`);
      setRosterError(null);

      try {
        await handleRemovePlayer(playerId);
        logger.log(`[Page.tsx] player removed: ${playerId}.`);
      } catch (error) {
        logger.error(`[Page.tsx] Exception during removal of ${playerId}:`, error);
      }
    }, [handleRemovePlayer, setRosterError]);

    // ... (rest of the code remains unchanged)

    const handleAddPlayerForModal = useCallback(async (playerData: { name: string; jerseyNumber: string; notes: string; nickname: string }) => {
      logger.log('[Page.tsx] handleAddPlayerForModal attempting to add player:', playerData);
      setRosterError(null); // Clear previous specific errors first

      const currentRoster = gameDataManagement.masterRoster || [];
      const newNameTrimmedLower = playerData.name.trim().toLowerCase();
      const newNumberTrimmed = playerData.jerseyNumber.trim();

      // Check for empty name after trimming
      if (!newNameTrimmedLower) {
        setRosterError(t('rosterSettingsModal.errors.nameRequired', 'Player name cannot be empty.'));
        return;
      }

      // Check for duplicate name (case-insensitive)
      const nameExists = currentRoster.some(p => p.name.trim().toLowerCase() === newNameTrimmedLower);
      if (nameExists) {
        setRosterError(t('rosterSettingsModal.errors.duplicateName', 'A player with this name already exists. Please use a different name.'));
        return;
      }

      // Check for duplicate jersey number (only if a number is provided and not empty)
      if (newNumberTrimmed) {
        const numberExists = currentRoster.some(p => p.jerseyNumber && p.jerseyNumber.trim() === newNumberTrimmed);
        if (numberExists) {
          setRosterError(t('rosterSettingsModal.errors.duplicateNumber', 'A player with this jersey number already exists. Please use a different number or leave it blank.'));
          return;
        }
      }

      // If all checks pass, proceed with the mutation
      try {
        logger.log('[Page.tsx] No duplicates found. Proceeding with addPlayer for:', playerData);
        await handleAddPlayer(playerData);
        logger.log(`[Page.tsx] add player success: ${playerData.name}.`);
      } catch (error) {
        // This catch block is for unexpected errors directly from mutateAsync call itself (e.g., network issues before mutationFn runs).
        // Errors from within mutationFn (like from the addPlayer utility) should ideally be handled by the mutation's onError callback.
        logger.error(`[Page.tsx] Exception during addPlayerMutation.mutateAsync for player ${playerData.name}:`, error);
        // Set a generic error message if rosterError hasn't been set by the mutation's onError callback.
        setRosterError(t('rosterSettingsModal.errors.addFailed', 'Error adding player {playerName}. Please try again.', { playerName: playerData.name }));
      }
    }, [gameDataManagement.masterRoster, handleAddPlayer, t, setRosterError]);

    // ... (rest of the code remains unchanged)

  const handleToggleGoalieForModal = useCallback(async (playerId: string) => {
    const player = availablePlayers.find(p => p.id === playerId);
    if (!player) {
        logger.error(`[Page.tsx] Player ${playerId} not found in availablePlayers for goalie toggle.`);
        setRosterError(t('rosterSettingsModal.errors.playerNotFound', 'Player not found. Cannot toggle goalie status.'));
        return;
    }
    const targetGoalieStatus = !player.isGoalie;
    logger.log(`[Page.tsx] handleToggleGoalieForModal per-game toggle for ID: ${playerId}, target status: ${targetGoalieStatus}`);
    
    setRosterError(null); // Clear previous specific errors

    try {
      // Update goalie status per-game instead of globally
      const updatedAvailablePlayers = availablePlayers.map(p => {
        if (p.id === playerId) {
          return { ...p, isGoalie: targetGoalieStatus };
        }
        // If setting this player as goalie, unset any other goalies in this game
        if (targetGoalieStatus && p.isGoalie) {
          return { ...p, isGoalie: false };
        }
        return p;
      });

      // Update local state
      setAvailablePlayers(updatedAvailablePlayers);

      // Update field players to reflect goalie status change
      const updatedFieldPlayers = fieldCoordination.playersOnField.map(fieldPlayer => {
        const updatedAvailablePlayer = updatedAvailablePlayers.find(p => p.id === fieldPlayer.id);
        return updatedAvailablePlayer ? { ...fieldPlayer, isGoalie: updatedAvailablePlayer.isGoalie } : fieldPlayer;
      });
      fieldCoordination.setPlayersOnField(updatedFieldPlayers);

      // Save the updated state
      if (currentGameId) {
        await utilSaveGame(currentGameId, {
          ...gameSessionState,
          availablePlayers: updatedAvailablePlayers,
          playersOnField: updatedFieldPlayers,
        });

        // Invalidate React Query cache to update LoadGameModal
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
      }

      logger.log(`[Page.tsx] per-game goalie toggle success for ${playerId}.`);
    } catch (error) {
      logger.error(`[Page.tsx] Exception during per-game goalie toggle of ${playerId}:`, error);
    }
  }, [
    // Data dependencies (values that change the function's behavior)
    availablePlayers, currentGameId, gameSessionState, t,
    // Setter dependencies (React guarantees these are stable but ESLint requires them)
    setAvailablePlayers, setRosterError, queryClient,
    // fieldCoordination provides playersOnField and setPlayersOnField
    fieldCoordination
  ]);

  // --- END Roster Management Handlers ---

  // --- NEW: Handler to Award Fair Play Card ---
  const handleAwardFairPlayCard = useCallback(async (playerId: string | null) => {
      // <<< ADD LOG HERE >>>
      logger.log(`[page.tsx] handleAwardFairPlayCard called with playerId: ${playerId}`);
      logger.log(`[page.tsx] availablePlayers BEFORE update:`, JSON.stringify(availablePlayers.map(p => ({id: p.id, fp: p.receivedFairPlayCard}))));
      logger.log(`[page.tsx] playersOnField BEFORE update:`, JSON.stringify(fieldCoordination.playersOnField.map(p => ({id: p.id, fp: p.receivedFairPlayCard}))));

      if (!currentGameId || currentGameId === DEFAULT_GAME_ID) {
          logger.warn("Cannot award fair play card in unsaved/default state.");
          return; // Prevent awarding in default state
      }

      let updatedAvailablePlayers = availablePlayers;
      let updatedPlayersOnField = fieldCoordination.playersOnField;

      // Find the currently awarded player, if any
      const currentlyAwardedPlayerId = availablePlayers.find(p => p.receivedFairPlayCard)?.id;

      // If the selected ID is the same as the current one, we are toggling it OFF.
      // If the selected ID is different, we are changing the award.
      // If the selected ID is null, we are clearing the award.

      // Clear any existing card first
      if (currentlyAwardedPlayerId) {
          updatedAvailablePlayers = updatedAvailablePlayers.map(p =>
              p.id === currentlyAwardedPlayerId ? { ...p, receivedFairPlayCard: false } : p
          );
          updatedPlayersOnField = updatedPlayersOnField.map(p =>
              p.id === currentlyAwardedPlayerId ? { ...p, receivedFairPlayCard: false } : p
          );
      }

      // Award the new card if a playerId is provided (and it's different from the one just cleared)
      if (playerId && playerId !== currentlyAwardedPlayerId) {
          // <<< MODIFY LOGGING HERE >>>
          updatedAvailablePlayers = updatedAvailablePlayers.map(p =>
              p.id === playerId ? { ...p, receivedFairPlayCard: true } : p
          );
          updatedPlayersOnField = updatedPlayersOnField.map(p =>
              p.id === playerId ? { ...p, receivedFairPlayCard: true } : p
          );
          logger.log(`[page.tsx] Awarding card to ${playerId}`);
      } else {
          // <<< ADD LOG HERE >>>
          logger.log(`[page.tsx] Clearing card (or toggling off). PlayerId: ${playerId}, Currently Awarded: ${currentlyAwardedPlayerId}`);
      }
      // If playerId is null, we only cleared the existing card.
      // If playerId is the same as currentlyAwardedPlayerId, we cleared it and don't re-award.

      // <<< ADD LOG HERE >>>
      logger.log(`[page.tsx] availablePlayers AFTER update logic:`, JSON.stringify(updatedAvailablePlayers.map(p => ({id: p.id, fp: p.receivedFairPlayCard}))));
      logger.log(`[page.tsx] playersOnField AFTER update logic:`, JSON.stringify(updatedPlayersOnField.map(p => ({id: p.id, fp: p.receivedFairPlayCard}))));

      // <<< ADD LOG HERE >>>
      logger.log(`[page.tsx] Calling setAvailablePlayers and setPlayersOnField...`);
      setAvailablePlayers(updatedAvailablePlayers);
      fieldCoordination.setPlayersOnField(updatedPlayersOnField);
      // Save updated global roster
      // localStorage.setItem(MASTER_ROSTER_KEY, JSON.stringify(updatedAvailablePlayers));
      try {
        const success = await saveMasterRoster(updatedAvailablePlayers);
        if (!success) {
          logger.error('[page.tsx] handleAwardFairPlayCard: Failed to save master roster using utility.');
          // Optionally, set an error state to inform the user
        }
      } catch (error) {
        logger.error('[page.tsx] handleAwardFairPlayCard: Error calling saveMasterRoster utility:', error);
        // Optionally, set an error state
      }
      // <<< ADD LOG HERE >>>
      logger.log(`[page.tsx] Calling saveStateToHistory... ONLY for playersOnField`);
      // Save ONLY the playersOnField change to the game history, not the global roster
      saveStateToHistory({ playersOnField: updatedPlayersOnField });

      logger.log(`[page.tsx] Updated Fair Play card award. ${playerId ? `Awarded to ${playerId}` : 'Cleared'}`);
    }, [availablePlayers, saveStateToHistory, currentGameId, setAvailablePlayers, fieldCoordination]);


  const handleUpdateSelectedPlayers = (playerIds: string[]) => {
    // This function is used by GameSettingsModal to set the roster for that specific game.
    // It replaces the entire selection.
    dispatchGameSession({ type: 'SET_SELECTED_PLAYER_IDS', payload: playerIds });
  };

  // --- NEW: Quick Save Handler ---
  // --- Quick Save and Auto-Save handlers moved to useGamePersistence hook ---

  // --- Deterministic init fallback: auto-select latest real game if default or stale ---
  useEffect(() => {
    if (!initialLoadComplete) return;
    const ids = Object.keys(savedGames || {}).filter(id => id !== DEFAULT_GAME_ID);
    const isStale = !currentGameId || currentGameId === DEFAULT_GAME_ID || !savedGames[currentGameId];
    if (isStale && ids.length > 0) {
      const latestId = getLatestGameId(savedGames);
      if (latestId) {
        logger.log('[Init Fallback] Selecting latest game as current', { latestId });
        setCurrentGameId(latestId);
        utilSaveCurrentGameIdSetting(latestId).catch(() => {});
      }
    }
  }, [initialLoadComplete, currentGameId, savedGames]);

  // --- NEW: Handlers for Game Settings Modal ---
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in controlBarProps
  const handleOpenGameSettingsModal = () => {
      setIsGameSettingsModalOpen(true); // Corrected State Setter
  };
  // handleCloseGameSettingsModal moved to useModalOrchestration
  // handleOpenSettingsModal moved to useModalOrchestration
  // handleCloseSettingsModal moved to useModalOrchestration
  // handleCloseSeasonTournamentModal moved to useModalOrchestration

  // --- Handlers for GameSettingsModal (delegate to session coordination) ---
  const handleGameLocationChange = sessionCoordination.handlers.setGameLocation;
  const handleGameTimeChange = sessionCoordination.handlers.setGameTime;
  const handleAgeGroupChange = sessionCoordination.handlers.setAgeGroup;
  const handleTournamentLevelChange = sessionCoordination.handlers.setTournamentLevel;
  const handleSetDemandFactor = sessionCoordination.handlers.setDemandFactor;
  const handleSetHomeOrAway = sessionCoordination.handlers.setHomeOrAway;
  const handleSetSeasonId = sessionCoordination.handlers.setSeasonId;
  const handleSetTournamentId = sessionCoordination.handlers.setTournamentId;
  const handleSetGamePersonnel = sessionCoordination.handlers.setGamePersonnel;

  // --- AGGREGATE EXPORT HANDLERS --- 
  
  // ENSURE this function is commented out
  // Helper to get Filter Name (Season/Tournament)
  // const getFilterContextName = (tab: string, filterId: string, seasons: Season[], tournaments: Tournament[]): string => {
  //   if (tab === 'season' && filterId !== 'all') {
  //       return seasons.find(s => s.id === filterId)?.name || filterId;
  //   }
  //   if (tab === 'tournament' && filterId !== 'all') {
  //       return tournaments.find(t => t.id === filterId)?.name || filterId;
  //   }
  //   if (tab === 'overall') return 'Overall';
  //   return 'Unknown Filter'; // Fallback
  // };

  const handleExportAggregateExcel = useCallback((gameIds: string[], aggregateStats: import('@/types').PlayerStatRow[]) => {
    if (gameIds.length === 0) {
      showToast(t('export.noGamesInSelection', 'No games match the current filter.'), 'error');
      return;
    }
    const gamesData = gameIds.reduce((acc, id) => {
      const gameData = savedGames[id];
      if (gameData) {
        acc[id] = gameData;
      }
      return acc;
    }, {} as SavedGamesCollection);
    try {
      exportAggregateExcel(gamesData, aggregateStats, seasons, tournaments, []);
    } catch (error) {
      logger.error('[handleExportAggregateExcel] Export failed:', error);
      showToast(t('export.exportStatsFailed'), 'error');
    }
  }, [savedGames, seasons, tournaments, t, showToast]);

  const handleExportPlayerExcel = useCallback(async (playerId: string, playerData: import('@/types').PlayerStatRow, gameIds: string[]) => {
    const gamesData = gameIds.reduce((acc, id) => {
      const gameData = savedGames[id];
      if (gameData) {
        acc[id] = gameData;
      }
      return acc;
    }, {} as SavedGamesCollection);
    try {
      const { getAdjustmentsForPlayer } = await import('@/utils/playerAdjustments');
      const adjustments = await getAdjustmentsForPlayer(playerId);
      exportPlayerExcel(playerId, playerData, gamesData, seasons, tournaments, adjustments);
    } catch (error) {
      logger.error('[handleExportPlayerExcel] Export failed:', error);
      showToast(t('export.exportPlayerFailed'), 'error');
    }
  }, [savedGames, seasons, tournaments, t, showToast]);

  // --- END AGGREGATE EXPORT HANDLERS ---

  // --- Handler that is called when setup modal is confirmed ---
  const handleStartNewGameWithSetup = useCallback(async (
    initialSelectedPlayerIds: string[],
    homeTeamName: string,
    opponentName: string,
    gameDate: string,
    gameLocation: string,
    gameTime: string,
    seasonId: string | null,
    tournamentId: string | null,
    numPeriods: 1 | 2,
    periodDuration: number,
    homeOrAway: 'home' | 'away',
    demandFactor: number,
    ageGroup: string,
    tournamentLevel: string,
    isPlayedParam: boolean,
    teamId: string | null,
    availablePlayersForGame: Player[],
    selectedPersonnelIds: string[]
  ) => {
    await startNewGameWithSetup(
      {
        availablePlayers,
        savedGames,
        setSavedGames,
        resetHistory,
        dispatchGameSession,
        setCurrentGameId,
        closeNewGameSetupModal: closeNewGameViaReducer,
        setNewGameDemandFactor,
        setPlayerIdsForNewGame,
        setHighlightRosterButton,
        setIsPlayed,
        queryClient,
        showToast,
        t,
        utilSaveGame,
        utilSaveCurrentGameIdSetting,
        defaultSubIntervalMinutes: initialState.subIntervalMinutes ?? 5,
      },
      {
        initialSelectedPlayerIds,
        homeTeamName,
        opponentName,
        gameDate,
        gameLocation,
        gameTime,
        seasonId,
        tournamentId,
        numPeriods,
        periodDuration,
        homeOrAway,
        demandFactor,
        ageGroup,
        tournamentLevel,
        isPlayed: isPlayedParam,
        teamId,
        availablePlayersForGame,
        selectedPersonnelIds,
      },
    );
  }, [
    availablePlayers,
    savedGames,
    setSavedGames,
    resetHistory,
    dispatchGameSession,
    setCurrentGameId,
    closeNewGameViaReducer,
    setNewGameDemandFactor,
    setPlayerIdsForNewGame,
    setHighlightRosterButton,
    setIsPlayed,
    queryClient,
    showToast,
    t,
  ]);

  // ** REVERT handleCancelNewGameSetup TO ORIGINAL **
  const handleCancelNewGameSetup = useCallback(() => {
    cancelNewGameSetup({
      setHasSkippedInitialSetup,
      closeNewGameSetupModal: closeNewGameViaReducer,
      setNewGameDemandFactor,
      setPlayerIdsForNewGame,
    });
  }, [setHasSkippedInitialSetup, closeNewGameViaReducer, setNewGameDemandFactor, setPlayerIdsForNewGame]);

  // --- Start New Game Handler (Uses Quick Save) ---
  const handleStartNewGame = useCallback(() => {
    // Check if roster is empty first
    if (availablePlayers.length === 0) {
      setShowNoPlayersConfirm(true);
      return; // Exit early
    }

    // Check if the current game is potentially unsaved (not the default ID and not null)
    if (currentGameId && currentGameId !== DEFAULT_GAME_ID) {
      // Prompt to save first
      const gameData = savedGames[currentGameId]; // Safe to access due to check above
      const gameIdentifier = gameData?.teamName
                             ? `${gameData.teamName} vs ${gameData.opponentName}`
                             : `ID: ${currentGameId}`;

      setGameIdentifierForSave(gameIdentifier);
      setShowSaveBeforeNewConfirm(true);
    } else {
      // If no real game is loaded, proceed directly to the main confirmation
      setShowStartNewConfirm(true);
    }
  }, [currentGameId, savedGames, availablePlayers]);

  // Handler for "No Players" confirmation
  const handleNoPlayersConfirmed = useCallback(() => {
    setShowNoPlayersConfirm(false);
    openRosterViaReducer();
  }, [openRosterViaReducer]);

  // Handler for "Save Before New" confirmation - user chooses to save
  const handleSaveBeforeNewConfirmed = useCallback(() => {
    persistence.handleQuickSaveGame(); // Call quick save directly
    setPlayerIdsForNewGame(gameSessionState.selectedPlayerIds); // Use the current selection
    setShowSaveBeforeNewConfirm(false);
    openNewGameViaReducer(); // Open setup modal immediately after
  }, [persistence, gameSessionState.selectedPlayerIds, openNewGameViaReducer]);

  // Handler for "Save Before New" cancellation - user chooses to discard
  const handleSaveBeforeNewCancelled = useCallback(() => {
    setShowSaveBeforeNewConfirm(false);
    // Show the "start new" confirmation after discarding
    setShowStartNewConfirm(true);
  }, []);

  // Handler for "Start New" confirmation
  const handleStartNewConfirmed = useCallback(() => {
    setPlayerIdsForNewGame(availablePlayers.map(p => p.id)); // SET default player selection (all players)
    setShowStartNewConfirm(false);
    openNewGameViaReducer(); // Open the setup modal
  }, [availablePlayers, openNewGameViaReducer]);
  // --- END Start New Game Handler ---

  // --- handlePlaceAllPlayers - MOVED TO useFieldCoordination ---

  // --- Step 3: Handler for Importing Games ---
  // const handleImportGamesFromJson = useCallback(async (jsonContent: string) => { // This function is no longer used
  //   // ...
  // }, [savedGames, setSavedGames, t]); 
  // --- End Step 3 --- 

  // --- NEW: Handlers for Game Settings Modal --- (Placeholder open/close)

  // Render null or a loading indicator until state is loaded
  // Note: Console log added before the check itself
 
  // Final console log before returning the main JSX
  if (debug.enabled('home')) {
    logger.log('[Home Render] highlightRosterButton:', highlightRosterButton);
  }

  // ATTEMPTING TO EXPLICITLY REMOVE THE CONDITIONAL HOOK
  // The useEffect for highlightRosterButton that was here (around lines 2977-2992)
  // should be removed as it's called conditionally and its correct version is at the top level.

  // Log gameEvents before PlayerBar is rendered
  if (debug.enabled('home')) {
    logger.log('[page.tsx] About to render PlayerBar, gameEvents for PlayerBar:', JSON.stringify(gameSessionState.gameEvents));
  }


  const handleOpenPlayerStats = (playerId: string) => {
    const player = availablePlayers.find(p => p.id === playerId);
    if (player) {
      setSelectedPlayerForStats(player);
      setIsGameStatsModalOpen(true);
      closeRosterViaReducer(); // Close the roster modal
    }
  };

  

  const handleGameLogClick = (gameId: string) => {
    setCurrentGameId(gameId);
    // handleClosePlayerStats(); // This function no longer exists
    setIsGameStatsModalOpen(prev => !prev); // handleToggleGameStatsModal moved to useModalOrchestration
  };

  const fieldInteractions = useMemo<FieldInteractions>(() => ({
    players: {
      move: fieldCoordination.handlePlayerMove,
      moveEnd: fieldCoordination.handlePlayerMoveEnd,
      remove: fieldCoordination.handlePlayerRemove,
      drop: fieldCoordination.handleDropOnField,
    },
    opponents: {
      move: fieldCoordination.handleOpponentMove,
      moveEnd: fieldCoordination.handleOpponentMoveEnd,
      remove: fieldCoordination.handleOpponentRemove,
    },
    drawing: {
      start: fieldCoordination.handleDrawingStart,
      addPoint: fieldCoordination.handleDrawingAddPoint,
      end: fieldCoordination.handleDrawingEnd,
    },
    tactical: {
      drawingStart: fieldCoordination.handleTacticalDrawingStart,
      drawingAddPoint: fieldCoordination.handleTacticalDrawingAddPoint,
      drawingEnd: fieldCoordination.handleTacticalDrawingEnd,
      discMove: fieldCoordination.handleTacticalDiscMove,
      discRemove: fieldCoordination.handleTacticalDiscRemove,
      discToggleType: fieldCoordination.handleToggleTacticalDiscType,
      ballMove: fieldCoordination.handleTacticalBallMove,
    },
    touch: {
      playerDrop: fieldCoordination.handlePlayerDropViaTouch,
      playerDragCancel: fieldCoordination.handlePlayerDragCancelViaTouch,
    },
  }), [fieldCoordination]);

  // timerInteractions now provided by useTimerManagement (Step 2.6.5)

  const fieldContainerProps: FieldContainerProps = {
    gameSessionState,
    fieldVM: {
      playersOnField: fieldCoordination.playersOnField,
      opponents: fieldCoordination.opponents,
      drawings: fieldCoordination.drawings,
      isTacticsBoardView: fieldCoordination.isTacticsBoardView,
      tacticalDrawings: fieldCoordination.tacticalDrawings,
      tacticalDiscs: fieldCoordination.tacticalDiscs,
      tacticalBallPosition: fieldCoordination.tacticalBallPosition,
      draggingPlayerFromBarInfo: fieldCoordination.draggingPlayerFromBarInfo,
      isDrawingEnabled: fieldCoordination.isDrawingEnabled,
    },
    timerVM: {
      timeElapsedInSeconds,
      isTimerRunning,
      subAlertLevel,
      lastSubConfirmationTimeSeconds,
      showLargeTimerOverlay,
      initialLoadComplete,
    },
    currentGameId,
    availablePlayers,
    teams: gameDataManagement.teams,
    seasons: gameDataManagement.seasons,
    tournaments: gameDataManagement.tournaments,
    showFirstGameGuide,
    hasCheckedFirstGameGuide,
    firstGameGuideStep,
    orphanedGameInfo,
    onOpenNewGameSetup: reducerDrivenModals.newGameSetup.open,
    onOpenRosterModal: reducerDrivenModals.roster.open,
    onOpenSeasonTournamentModal: reducerDrivenModals.seasonTournament.open,
    onOpenTeamManagerModal: () => setIsTeamManagerOpen(true),
    onGuideStepChange: setFirstGameGuideStep,
    onGuideClose: () => setShowFirstGameGuide(false),
    onOpenTeamReassignModal: () => setIsTeamReassignModalOpen(true),
    onTeamNameChange: handleTeamNameChange,
    onOpponentNameChange: handleOpponentNameChange,
    interactions: fieldInteractions,
    timerInteractions,
  };

  const controlBarProps: ComponentProps<typeof ControlBar> = {
    timeElapsedInSeconds,
    isTimerRunning,
    onToggleLargeTimerOverlay: handleToggleLargeTimerOverlay,
    onUndo: handleUndo,
    onRedo: handleRedo,
    canUndo: fieldCoordination.canUndoField,
    canRedo: fieldCoordination.canRedoField,
    onTacticalUndo: fieldCoordination.handleTacticalUndo,
    onTacticalRedo: fieldCoordination.handleTacticalRedo,
    canTacticalUndo: tacticalHistory.canUndo,
    canTacticalRedo: tacticalHistory.canRedo,
    onResetField: fieldCoordination.handleResetFieldClick,
    onClearDrawings: fieldCoordination.handleClearDrawingsForView,
    onAddOpponent: fieldCoordination.handleAddOpponent,
    onPlaceAllPlayers: fieldCoordination.handlePlaceAllPlayers,
    isTacticsBoardView: fieldCoordination.isTacticsBoardView,
    onToggleTacticsBoard: fieldCoordination.handleToggleTacticsBoard,
    onAddHomeDisc: () => fieldCoordination.handleAddTacticalDisc('home'),
    onAddOpponentDisc: () => fieldCoordination.handleAddTacticalDisc('opponent'),
    isDrawingEnabled: fieldCoordination.isDrawingEnabled,
    onToggleDrawingMode: fieldCoordination.handleToggleDrawingMode,
    onToggleTrainingResources: handleToggleTrainingResources,
    onToggleGameStatsModal: () => setIsGameStatsModalOpen(prev => !prev), // handleToggleGameStatsModal moved to useModalOrchestration
    onOpenLoadGameModal: () => setIsLoadGameModalOpen(true),
    onStartNewGame: handleStartNewGame,
    onOpenRosterModal: openRosterModal,
    onQuickSave: persistence.handleQuickSaveGame,
    onOpenGameSettingsModal: () => setIsGameSettingsModalOpen(true),
    isGameLoaded: Boolean(currentGameId && currentGameId !== DEFAULT_GAME_ID),
    onOpenSeasonTournamentModal: () => setIsSeasonTournamentModalOpen(true),
    onToggleInstructionsModal: () => setIsInstructionsModalOpen(prev => !prev), // handleToggleInstructionsModal moved to useModalOrchestration
    onOpenSettingsModal: () => setIsSettingsModalOpen(true), // handleOpenSettingsModal moved to useModalOrchestration
    onOpenPlayerAssessmentModal: openPlayerAssessmentModal,
    onOpenTeamManagerModal: () => setIsTeamManagerOpen(true),
    onOpenPersonnelManager: () => setIsPersonnelManagerOpen(true),
  };

  const isLoading = gameDataManagement.isLoading;

  const isBootstrapping = isLoading && !initialLoadComplete;

  const gameContainerProps = {
    playerBar: playerBarViewModel,
    gameInfo: gameInfoViewModel,
    onPlayerDragStartFromBar: fieldCoordination.handlePlayerDragStartFromBar,
    onBarBackgroundClick: fieldCoordination.handleDeselectPlayer,
    onPlayerTapInBar: fieldCoordination.handlePlayerTapInBar,
    onToggleGoalie: handleToggleGoalieForModal,
    onTeamNameChange: handleTeamNameChange,
    onOpponentNameChange: handleOpponentNameChange,
    orphanedGameInfo,
    onOpenTeamReassignModal: () => setIsTeamReassignModalOpen(true),
    fieldProps: fieldContainerProps,
    controlBarProps,
  };

  // --- Modal Orchestration Hook (Step 2.6.6 - FINAL) ---
  const modalOrchestration = useModalOrchestration({
    // Hook dependencies
    gameDataManagement,
    fieldCoordination,
    persistence,
    timerManagement,

    // Data from useGameOrchestration
    gameSessionState,
    dispatchGameSession,
    availablePlayers,
    playersForCurrentGame,
    savedGames,
    currentGameId,
    playerAssessments,
    selectedPlayerForStats,
    setSelectedPlayerForStats,
    playerIdsForNewGame,
    newGameDemandFactor,
    setNewGameDemandFactor,
    availableTeams,
    orphanedGameInfo,
    appLanguage,
    setAppLanguage,
    defaultTeamNameSetting,
    setDefaultTeamNameSetting,
    gameIdentifierForSave,
    isPlayed,
    setIsPlayed,
    isRosterUpdating,
    rosterError,
    isLoadingGamesList,
    loadGamesListError,
    updateGameDetailsMutation,
    isTeamReassignModalOpen,
    setIsTeamReassignModalOpen,
    setSelectedTeamForRoster,
    showSaveBeforeNewConfirm,
    showHardResetConfirm,
    setShowHardResetConfirm,

    // Handlers from useGameOrchestration
    handleUpdateGameEvent,
    handleExportOneExcel,
    handleExportAggregateExcel,
    handleExportPlayerExcel,
    handleGameLogClick,
    handleExportOneJson,
    handleStartNewGameWithSetup,
    handleCancelNewGameSetup,
    handleUpdatePlayerForModal,
    handleRenamePlayerForModal,
    handleSetJerseyNumberForModal,
    handleSetPlayerNotesForModal,
    handleRemovePlayerForModal,
    handleAddPlayerForModal,
    handleOpenPlayerStats,
    handleTeamNameChange,
    handleOpponentNameChange,
    handleGameDateChange,
    handleGameLocationChange,
    handleGameTimeChange,
    handleGameNotesChange,
    handleAgeGroupChange,
    handleTournamentLevelChange,
    handleAwardFairPlayCard,
    handleSetNumberOfPeriods,
    handleSetPeriodDuration,
    handleSetDemandFactor,
    handleSetSeasonId,
    handleSetTournamentId,
    handleSetHomeOrAway,
    handleUpdateSelectedPlayers,
    handleSetGamePersonnel,
    handleShowAppGuide,
    handleHardResetApp,
    handleSavePlayerAssessment,
    handleDeletePlayerAssessment,
    handleTeamReassignment,
    handleCreateBackup,
    onDataImportSuccess,
    handleManageTeamRosterFromNewGame,
    handleNoPlayersConfirmed,
    handleHardResetConfirmed,
    handleSaveBeforeNewConfirmed,
    handleSaveBeforeNewCancelled,
    handleStartNewConfirmed,
  });

  // Get modalManagerProps, modal state, setters, and handlers from useModalOrchestration hook
  const {
    modalManagerProps,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- State managed by useModalOrchestration, setter used in useEffect below
    isInstructionsModalOpen,
    setIsInstructionsModalOpen,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- State managed by useModalOrchestration, setter used in controlBarProps
    isPersonnelManagerOpen,
    setIsPersonnelManagerOpen,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- State managed by useModalOrchestration, setter used in controlBarProps
    isTeamManagerOpen,
    setIsTeamManagerOpen,
    // handleToggleGameStatsModal, handleToggleInstructionsModal, handleOpenSettingsModal
    // removed - these are no longer returned from useModalOrchestration
  } = modalOrchestration;

  // Show automatic instructions for experienced users with specific actions, not first-time users
  // Guard prevents multiple triggers when savedGames changes
  useEffect(() => {
    if (!initialLoadComplete || hasCheckedInstructionsModal) return;

    const checkInstructionsModal = async () => {
      const seenGuide = await getHasSeenAppGuide();
      const hasAnyData = Object.keys(savedGames).length > 0; // Check if user has any saved games
      if (!seenGuide && initialAction !== null && hasAnyData) {
        setIsInstructionsModalOpen(true);
      }
      setHasCheckedInstructionsModal(true); // Mark as checked to prevent re-triggering
    };

    checkInstructionsModal();
  }, [initialLoadComplete, initialAction, savedGames, setIsInstructionsModalOpen, hasCheckedInstructionsModal]);

  return {
    gameContainerProps,
    modalManagerProps,
    isBootstrapping,
    isResetting,
  };
}
