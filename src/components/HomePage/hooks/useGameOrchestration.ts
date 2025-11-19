import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ComponentProps } from 'react';
import type ControlBar from '@/components/ControlBar';
import type { GameContainerProps } from '@/components/HomePage/containers/GameContainer';
import type { ModalManagerProps } from '@/components/HomePage/containers/ModalManager';
import usePlayerAssessments from '@/hooks/usePlayerAssessments';
import { exportFullBackup } from '@/utils/fullBackup';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useGameTimer } from '@/hooks/useGameTimer';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useFieldInteractions } from '@/hooks/useFieldInteractions';
import { useGameState } from '@/hooks/useGameState';
import type { UseGameStateReturn } from '@/hooks/useGameState';
// Import game session types (reducer is used internally by useGameSessionWithHistory)
import {
  GameSessionState,
  // initialGameSessionStatePlaceholder // We will derive initial state from page.tsx's initialState
} from '@/hooks/useGameSessionReducer';
// Import roster utility functions
// roster mutations now managed inside useRoster hook

// Removed unused import of utilGetMasterRoster

// Import utility functions for seasons and tournaments
import { saveGame as utilSaveGame, deleteGame as utilDeleteGame, getLatestGameId, createGame, getSavedGames as utilGetSavedGames, removeGameEvent } from '@/utils/savedGames';
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
import { useTacticalBoard } from '@/hooks/useTacticalBoard';
import type { TacticalState } from '@/hooks/useTacticalHistory';
import { useRoster } from '@/hooks/useRoster';
import { useModalContext } from '@/contexts/ModalProvider';
import { useGameDataManagement } from './useGameDataManagement';
import { useGameSessionCoordination } from './useGameSessionCoordination';
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
import type { FieldContainerProps, FieldInteractions, TimerInteractions } from '@/components/HomePage/containers/FieldContainer';
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

  // --- Core Game State (Managed by Hook) ---
  const {
    playersOnField,
    opponents,
    drawings, // State from hook
    setPlayersOnField,
    setOpponents,
    setDrawings,
    handlePlayerDrop,
    // Destructure drawing handlers from hook
    handleDrawingStart,
    handleDrawingAddPoint,
    handleDrawingEnd,
    handleClearDrawings,
    // Get opponent handlers from hook
    handleAddOpponent,
    handleOpponentMove,
    handleOpponentMoveEnd,
    handleOpponentRemove,
    // handleRenamePlayer, // This is the one from useGameState, will be passed to PlayerBar
  }: UseGameStateReturn = useGameState({
    initialState,
    saveStateToHistory,
    // masterRosterKey: MASTER_ROSTER_KEY, // Removed as no longer used by useGameState
  });

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
  const [draggingPlayerFromBarInfo, setDraggingPlayerFromBarInfo] = useState<Player | null>(null);
  // Persistence state
  // TODO: Remove savedGames local state once all references are updated to use gameDataManagement.savedGames
  const [savedGames, setSavedGames] = useState<SavedGamesCollection>({});
  const [currentGameId, setCurrentGameId] = useState<string | null>(DEFAULT_GAME_ID);
  const [isPlayed, setIsPlayed] = useState<boolean>(true);
  
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

  const {
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,
    startPause: handleStartPauseTimer,
    reset: handleResetTimer,
    ackSubstitution: handleSubstitutionMade,
    setSubInterval: handleSetSubInterval,
  } = useGameTimer({ state: gameSessionState, dispatch: dispatchGameSession, currentGameId: currentGameId || '' });

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
    isGoalLogModalOpen,
    setIsGoalLogModalOpen,
    isGameStatsModalOpen,
    setIsGameStatsModalOpen,
    isNewGameSetupModalOpen,
    setIsNewGameSetupModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
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

  const { showToast } = useToast();
  // const [isPlayerStatsModalOpen, setIsPlayerStatsModalOpen] = useState(false);
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<Player | null>(null);
  const [isTeamManagerOpen, setIsTeamManagerOpen] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_selectedTeamForRoster, setSelectedTeamForRoster] = useState<string | null>(null);
  const [isPersonnelManagerOpen, setIsPersonnelManagerOpen] = useState<boolean>(false);

  // --- Timer State (Still needed here) ---
  const [showLargeTimerOverlay, setShowLargeTimerOverlay] = useState<boolean>(false); // State for overlay visibility
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState<boolean>(false);
  const [showFirstGameGuide, setShowFirstGameGuide] = useState<boolean>(false);
  const [showResetFieldConfirm, setShowResetFieldConfirm] = useState<boolean>(false);

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

  // Field interaction state (drawing mode, etc.) - extracted to dedicated hook
  const { isDrawingEnabled, toggleDrawingMode: handleToggleDrawingMode } = useFieldInteractions({
    onPersistError: () => {
      // Non-blocking notice; preference save failed, UI still toggled
      showToast(
        t('errors.failedToSaveDrawingMode', 'Failed to save drawing mode setting. Changes may not persist.'),
        'info'
      );
    }
  });

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
    draggingPlayerFromBarInfo,
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
    draggingPlayerFromBarInfo,
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

  // Confirmation modal states
  const [showNoPlayersConfirm, setShowNoPlayersConfirm] = useState(false);
  const [showHardResetConfirm, setShowHardResetConfirm] = useState(false);
  const [showSaveBeforeNewConfirm, setShowSaveBeforeNewConfirm] = useState(false);
  const [gameIdentifierForSave, setGameIdentifierForSave] = useState<string>('');
  const [showStartNewConfirm, setShowStartNewConfirm] = useState(false);
  const [loadGamesListError, setLoadGamesListError] = useState<string | null>(null);
  const [isGameLoading, setIsGameLoading] = useState(false); // For loading a specific game
  const [gameLoadError, setGameLoadError] = useState<string | null>(null);
  const [orphanedGameInfo, setOrphanedGameInfo] = useState<{ teamId: string; teamName?: string } | null>(null);
  const [isTeamReassignModalOpen, setIsTeamReassignModalOpen] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [isGameDeleting, setIsGameDeleting] = useState(false); // For deleting a specific game
  const [gameDeleteError, setGameDeleteError] = useState<string | null>(null);
  const [processingGameId, setProcessingGameId] = useState<string | null>(null); // To track which game item is being processed
  const [isResetting, setIsResetting] = useState(false); // For app reset operation
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
    saveStateToHistory: saveTacticalStateToHistory,
  });

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
      setPlayersOnField(prevPlayersOnField => {
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

        // Only show automatic instructions for experienced users with specific actions, not first-time users
        const seenGuide = await getHasSeenAppGuide();
        const hasAnyData = Object.keys(savedGames).length > 0; // Check if user has any saved games
        if (!seenGuide && initialAction !== null && hasAnyData) {
          setIsInstructionsModalOpen(true);
        }

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
    dispatchGameSession // Used for timer restoration
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
    setPlayersOnField(gameData?.playersOnField || (isInitialDefaultLoad ? initialState.playersOnField : []));
    setOpponents(gameData?.opponents || (isInitialDefaultLoad ? initialState.opponents : []));
    setDrawings(gameData?.drawings || (isInitialDefaultLoad ? initialState.drawings : []));
    setTacticalDiscs(gameData?.tacticalDiscs || (isInitialDefaultLoad ? initialState.tacticalDiscs : []));
    setTacticalDrawings(gameData?.tacticalDrawings || (isInitialDefaultLoad ? initialState.tacticalDrawings : []));
    setTacticalBallPosition(gameData?.tacticalBallPosition || { relX: 0.5, relY: 0.5 });
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

      let gameToLoad: AppState | null = null; // Ensure this is AppState
      if (currentGameId && currentGameId !== DEFAULT_GAME_ID && savedGames[currentGameId]) {
        logger.log(`[EFFECT game load] Found game data for ${currentGameId}`);
        gameToLoad = savedGames[currentGameId] as AppState; // Cast to AppState
      } else {
        logger.log('[EFFECT game load] No specific game to load or ID is default. Applying default game state.');
      }
      await loadGameStateFromData(gameToLoad); 
    };
    
    loadGame();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGameId, initialLoadComplete]); // IMPORTANT: initialLoadComplete ensures this runs after master roster is loaded. savedGames removed to prevent auto-save from triggering reload and resetting timer.

  // --- Save state to localStorage ---
  useEffect(() => {
    // Only auto-save if loaded AND we have a proper game ID (not the default unsaved one)
    const autoSave = async () => {
    if (initialLoadComplete && currentGameId && currentGameId !== DEFAULT_GAME_ID) {
      try {
        // 1. Create the current game state snapshot (excluding history and volatile timer states)
        const currentSnapshot: AppState = {
          // Fields from gameSessionState (persisted ones)
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
          currentPeriod: gameSessionState.currentPeriod, // Persisted
          gameStatus: gameSessionState.gameStatus, // Persisted
          seasonId: gameSessionState.seasonId, // USE gameSessionState
          tournamentId: gameSessionState.tournamentId, // USE gameSessionState
          teamId: gameSessionState.teamId, // USE gameSessionState
          gameLocation: gameSessionState.gameLocation,
          gameTime: gameSessionState.gameTime,
          demandFactor: gameSessionState.demandFactor,
          subIntervalMinutes: gameSessionState.subIntervalMinutes,
          completedIntervalDurations: gameSessionState.completedIntervalDurations,
          lastSubConfirmationTimeSeconds: gameSessionState.lastSubConfirmationTimeSeconds,
          showPlayerNames: gameSessionState.showPlayerNames, // from gameSessionState
          selectedPlayerIds: gameSessionState.selectedPlayerIds, // from gameSessionState
          gamePersonnel: gameSessionState.gamePersonnel ?? [],
          gameEvents: gameSessionState.gameEvents, // from gameSessionState
          assessments: playerAssessments,

          // Other states
          playersOnField,
          opponents,
          drawings,
          tacticalDiscs,
          tacticalDrawings,
          tacticalBallPosition,
          availablePlayers, // Per-game roster with per-game goalie status
          
          // Volatile timer states are intentionally EXCLUDED from the snapshot to be saved.
          // They are not part of GameData and should be re-initialized on load by the reducer.
        };

        // 2. Save the game snapshot using utility
          await utilSaveGame(currentGameId, currentSnapshot as AppState); // Cast to AppState for the util

        // 3. Save App Settings (only the current game ID) using utility
          await utilSaveCurrentGameIdSetting(currentGameId);

        // Invalidate React Query cache to update LoadGameModal
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

      } catch (error) {
        logger.error("Failed to auto-save game state:", error);
        showToast("Error saving game.", 'error');
      }
    }
    };
    autoSave();
    // Dependencies: Include all state variables that are part of the saved snapshot
  }, [initialLoadComplete, currentGameId,
      playersOnField, opponents, drawings, availablePlayers, gameDataManagement.masterRoster,
      // showPlayerNames, // REMOVED - Covered by gameSessionState
      // Local states that are part of the snapshot but not yet in gameSessionState:
      // gameEvents, // REMOVE - Now from gameSessionState
      gameSessionState,
      playerAssessments,
      tacticalDiscs,
      tacticalDrawings,
      tacticalBallPosition,
      isPlayed,
      queryClient,
      showToast,
    ]);

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

  // --- Player Management Handlers (Updated for relative coords) ---
  // Wrapped handleDropOnField in useCallback as suggested
  const handleDropOnField = useCallback((playerId: string, relX: number, relY: number) => {
    const droppedPlayer = availablePlayers.find(p => p.id === playerId);
    if (droppedPlayer) {
      handlePlayerDrop(droppedPlayer, { relX, relY }); // Call the handler from the hook
    } else {
      logger.error(`Dropped player with ID ${playerId} not found in availablePlayers.`);
    }
  }, [availablePlayers, handlePlayerDrop]); 

  const handlePlayerMove = useCallback((playerId: string, relX: number, relY: number) => {
    // Update visual state immediately
    setPlayersOnField(prevPlayers => 
      prevPlayers.map(p => 
        p.id === playerId ? { ...p, relX, relY } : p
      )
    );
    // State saved on move end
  }, [setPlayersOnField]); // ADDED setPlayersOnField dependency

  const handlePlayerMoveEnd = useCallback(() => {
    saveStateToHistory({ playersOnField });
  }, [playersOnField, saveStateToHistory]);

  const handlePlayerRemove = useCallback((playerId: string) => {
    logger.log(`Removing player ${playerId} from field`);
    const updatedPlayersOnField = playersOnField.filter(p => p.id !== playerId);
    setPlayersOnField(updatedPlayersOnField); 
    saveStateToHistory({ playersOnField: updatedPlayersOnField });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playersOnField, saveStateToHistory]); 
  


  // --- Reset Handlers ---
  const handleResetFieldConfirmed = useCallback(() => {
    if (isTacticsBoardView) {
      clearTacticalElements();
    } else {
      // Only clear game elements in normal view
      setPlayersOnField([]);
      setOpponents([]);
      setDrawings([]);
      saveStateToHistory({ playersOnField: [], opponents: [], drawings: [] });
    }
    setShowResetFieldConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTacticsBoardView, saveStateToHistory, clearTacticalElements]);

  const handleResetFieldClick = useCallback(() => {
    setShowResetFieldConfirm(true);
  }, []);

  const handleClearDrawingsForView = () => {
    if (isTacticsBoardView) {
      // Clear only tactical drawings and record it in tactical history (not main)
      setTacticalDrawings([]);
      saveTacticalStateToHistory({ tacticalDrawings: [] });
    } else {
      handleClearDrawings();
    }
  };

  // --- Touch Drag from Bar Handlers (Updated for relative coords) ---
  const handlePlayerDragStartFromBar = useCallback((playerInfo: Player) => {
    // This is now primarily for HTML Drag and Drop OR potential long-press drag
    setDraggingPlayerFromBarInfo(playerInfo);
    logger.log("Setting draggingPlayerFromBarInfo (Drag Start):", playerInfo);
  }, []);

  // NEW Handler for simple tap selection in the bar
  const handlePlayerTapInBar = useCallback((playerInfo: Player | null) => {
    // If the tapped player is already selected, deselect them
    if (draggingPlayerFromBarInfo?.id === playerInfo?.id) {
      logger.log("Tapped already selected player, deselecting:", playerInfo?.id);
      setDraggingPlayerFromBarInfo(null);
    } else {
      // Otherwise, select the tapped player
      logger.log("Setting draggingPlayerFromBarInfo (Tap):", playerInfo);
      setDraggingPlayerFromBarInfo(playerInfo);
    }
  }, [draggingPlayerFromBarInfo]); // Dependency needed

  const handlePlayerDropViaTouch = useCallback((relX: number, relY: number) => {
    // This handler might be less relevant now if tap-on-field works
    if (draggingPlayerFromBarInfo) {
      logger.log("Player Drop Via Touch (field):", { id: draggingPlayerFromBarInfo.id, relX, relY });
      handleDropOnField(draggingPlayerFromBarInfo.id, relX, relY); 
      setDraggingPlayerFromBarInfo(null); // Deselect player after placing
    }
  }, [draggingPlayerFromBarInfo, handleDropOnField]);

  const handlePlayerDragCancelViaTouch = useCallback(() => {
    setDraggingPlayerFromBarInfo(null);
  }, []);

  // --- Apply History State Helper ---
  // TODO(Step 2.6.3): Once useFieldCoordination is extracted, move field state
  // restoration (playersOnField, opponents, drawings) into that hook's
  // applyFieldHistoryState method. Tactical state should also move there.
  // This wrapper will then simplify to only call sessionCoordination.applyHistoryState(state).
  //
  // Wraps sessionCoordination.applyHistoryState and adds field state updates
  const applyHistoryState = (state: AppState) => {
    // Update field state (not managed by session coordination)
    setPlayersOnField(state.playersOnField);
    setOpponents(state.opponents);
    setDrawings(state.drawings);
    setAvailablePlayers(state.availablePlayers);

    // Update tactical state
    setTacticalDiscs(state.tacticalDiscs || []);
    setTacticalDrawings(state.tacticalDrawings || []);
    setTacticalBallPosition(state.tacticalBallPosition || null);

    // Apply session state via the hook
    sessionCoordination.applyHistoryState(state);
  };

  // Legacy handler - delegates to session coordination
  const handleTeamNameChange = (newName: string) => {
    sessionCoordination.handlers.setTeamName(newName);
  };

  const handleUndo = () => {
    const prevState = undoHistory();
    if (prevState) {
      logger.log('Undoing...');
      applyHistoryState(prevState);
    } else {
      logger.log('Cannot undo: at beginning of history');
    }
  };

  const handleRedo = () => {
    const nextState = redoHistory();
    if (nextState) {
      logger.log('Redoing...');
      applyHistoryState(nextState);
    } else {
      logger.log('Cannot redo: at end of history');
    }
  };

  // Apply tactical history state (for tactical undo/redo)
  const applyTacticalHistoryState = (state: TacticalState) => {
    setTacticalDiscs(state.tacticalDiscs || []);
    setTacticalDrawings(state.tacticalDrawings || []);
    setTacticalBallPosition(state.tacticalBallPosition || null);
  };

  const handleTacticalUndo = () => {
    const prevState = tacticalHistory.undo();
    if (prevState) {
      logger.log('[TacticalHistory] undo -> state', {
        drawingsLen: (prevState.tacticalDrawings || []).length,
      });
      applyTacticalHistoryState(prevState);
    } else {
      logger.log('Cannot undo: at beginning of tactical history');
    }
  };

  const handleTacticalRedo = () => {
    const nextState = tacticalHistory.redo();
    if (nextState) {
      logger.log('[TacticalHistory] redo -> state', {
        drawingsLen: (nextState.tacticalDrawings || []).length,
      });
      applyTacticalHistoryState(nextState);
    } else {
      logger.log('Cannot redo: at end of tactical history');
    }
  };

  // --- Timer Handlers provided by useGameTimer ---

  const handleToggleLargeTimerOverlay = useCallback(() => {
    setShowLargeTimerOverlay((prev) => !prev);
  }, []);

  // handleToggleDrawingMode is now provided by useFieldInteractions hook

  // Handler to specifically deselect player when bar background is clicked
  const handleDeselectPlayer = () => {
    if (draggingPlayerFromBarInfo) { // Only log if there was a selection
      logger.log("Deselecting player by clicking bar background.");
      setDraggingPlayerFromBarInfo(null);
    }
  };


  // Handler to open/close the goal log modal
  const handleToggleGoalLogModal = useCallback(() => {
    setIsGoalLogModalOpen((prev) => !prev);
  }, [setIsGoalLogModalOpen]);

  // Handler to add a goal event
  const handleAddGoalEvent = (scorerId: string, assisterId?: string) => {
    // Prefer current game's availablePlayers; fall back to master roster if empty
    const playerPool = (availablePlayers && availablePlayers.length > 0)
      ? availablePlayers
      : (gameDataManagement.masterRoster || []);

    const scorer = playerPool.find(p => p.id === scorerId);
    const assister = assisterId ? playerPool.find(p => p.id === assisterId) : undefined;

    if (!scorer) {
      logger.error("Scorer not found!");
      return;
    }

    const newEvent: GameEvent = {
      id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'goal',
      time: gameSessionState.timeElapsedInSeconds, // Use from gameSessionState
      scorerId: scorer.id,
      assisterId: assister?.id,
    };
    
    // Dispatch actions to update game state via reducer
    dispatchGameSession({ type: 'ADD_GAME_EVENT', payload: newEvent });
    dispatchGameSession({ type: 'ADJUST_SCORE_FOR_EVENT', payload: { eventType: 'goal', action: 'add' } });
  };

  // NEW Handler to log an opponent goal
  const handleLogOpponentGoal = useCallback((time: number) => {
    logger.log(`Logging opponent goal at time: ${time}`);
    const newEvent: GameEvent = {
      id: `oppGoal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'opponentGoal',
      time: time, // Use provided time
      scorerId: 'opponent', 
    };

    dispatchGameSession({ type: 'ADD_GAME_EVENT', payload: newEvent });
    dispatchGameSession({ type: 'ADJUST_SCORE_FOR_EVENT', payload: { eventType: 'opponentGoal', action: 'add' } });
    setIsGoalLogModalOpen(false);
  }, [dispatchGameSession, setIsGoalLogModalOpen]);

  // Handler to update an existing game event
  const handleUpdateGameEvent = (updatedEvent: GameEvent) => {
    const cleanUpdatedEvent: GameEvent = { id: updatedEvent.id, type: updatedEvent.type, time: updatedEvent.time, scorerId: updatedEvent.scorerId, assisterId: updatedEvent.assisterId }; // Keep cleaning
    
    dispatchGameSession({ type: 'UPDATE_GAME_EVENT', payload: cleanUpdatedEvent });
    
    logger.log("Updated game event via dispatch:", updatedEvent.id);
  };

  // Handler to delete a game event
  const handleDeleteGameEvent = async (goalId: string): Promise<boolean> => {
    const eventToDelete = gameSessionState.gameEvents.find(e => e.id === goalId);
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
      const eventIndex = gameSessionState.gameEvents.findIndex(e => e.id === goalId);
      if (eventIndex === -1) {
        logger.error("Event index not found for deletion:", goalId);
        return false;
      }

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

      logger.log("Deleted game event successfully (storage then state):", goalId);
      return true; // Success
    } catch (error) {
      logger.error("Error deleting game event:", error);
      return false; // Error
    }
  };
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

  // Handler to open/close the stats modal
  const handleToggleGameStatsModal = () => {
    // If the modal is currently open, we are about to close it.
    if (isGameStatsModalOpen) {
      // Clear the selected player so it doesn't open to the same player next time.
      setSelectedPlayerForStats(null);
    }
    setIsGameStatsModalOpen(!isGameStatsModalOpen);
  };

  const handleOpenTeamManagerModal = () => {
    setIsTeamManagerOpen(true);
  };
  const handleCloseTeamManagerModal = () => {
    setIsTeamManagerOpen(false);
  };

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

  const handleToggleInstructionsModal = () => {
    if (isInstructionsModalOpen) {
      saveHasSeenAppGuide(true);
    }
    setIsInstructionsModalOpen(!isInstructionsModalOpen);
  };

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

  const handleOpenLoadGameModal = () => {
    logger.log("Opening Load Game Modal...");
    reducerDrivenModals.loadGame.open();
  };

  const handleCloseLoadGameModal = () => {
    reducerDrivenModals.loadGame.close();
  };

  const handleOpenSeasonTournamentModal = () => {
    openSeasonTournamentViaReducer();
  };

  const handleCloseSeasonTournamentModal = () => {
    closeSeasonTournamentViaReducer();
  };


  // Function to handle loading a selected game
  const handleLoadGame = async (gameId: string) => {
    logger.log(`[handleLoadGame] Attempting to load game: ${gameId}`);
    
    // Clear any existing timer state before loading a new game
    try {
      await removeStorageItem(TIMER_STATE_KEY);
    } catch (error) {
      // Silent fail - timer cleanup is not critical for game loading
      logger.debug('Failed to clear timer state before loading game (non-critical)', { error });
    }
    
    setProcessingGameId(gameId);
    setIsGameLoading(true);
    setGameLoadError(null);

    const gameDataToLoad = savedGames[gameId] as AppState | undefined; // Ensure this is AppState

    if (gameDataToLoad) {
      try {
        // Dispatch to reducer to load the game state
        await loadGameStateFromData(gameDataToLoad); // This now primarily uses the reducer

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
  };

  // Function to handle deleting a saved game
  const handleDeleteGame = async (gameId: string) => {
    logger.log(`Deleting game with ID: ${gameId}`);
    if (gameId === DEFAULT_GAME_ID) {
      logger.warn("Cannot delete the default unsaved state.");
      setGameDeleteError(t('loadGameModal.errors.cannotDeleteDefault', 'Cannot delete the current unsaved game progress.'));
      return; // Prevent deleting the default placeholder
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

        // Invalidate React Query cache to update LoadGameModal
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

        if (currentGameId === gameId) {
          const latestId = getLatestGameId(updatedSavedGames);
          if (latestId) {
            logger.log(`Deleted active game. Loading latest game ${latestId}.`);
            setCurrentGameId(latestId);
            await utilSaveCurrentGameIdSetting(latestId);
          } else {
            logger.log("Currently loaded game was deleted with no other games remaining. Resetting to initial state.");
            dispatchGameSession({ type: 'RESET_TO_INITIAL_STATE', payload: initialGameSessionData });
            setPlayersOnField(initialState.playersOnField || []);
            setOpponents(initialState.opponents || []);
            setDrawings(initialState.drawings || []);
            resetHistory(initialState as AppState);
            setCurrentGameId(DEFAULT_GAME_ID);
            await utilSaveCurrentGameIdSetting(DEFAULT_GAME_ID);
          }
        }
      } else {
        // ... (existing error handling)
        logger.warn(`handleDeleteGame: utilDeleteGame returned null for gameId: ${gameId}. Game might not have been found or ID was invalid.`);
        setGameDeleteError(t('loadGameModal.errors.deleteFailedNotFound', 'Error deleting game: {gameId}. Game not found or ID was invalid.', { gameId }));
      }
    } catch (error) {
      // ... (existing error handling)
      const errorMessage = error instanceof Error ? error.message : String(error);
      setGameDeleteError(t('loadGameModal.errors.deleteFailedCatch', 'Error deleting saved game: {gameId}. Details: {errorMessage}', { gameId, errorMessage }));
    } finally {
      setIsGameDeleting(false);
      setProcessingGameId(null);
    }
  };

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
  const closePlayerAssessmentModal = () => setIsPlayerAssessmentModalOpen(false);

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

  const closeRosterModal = () => {
    closeRosterViaReducer();
  };

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
      const updatedFieldPlayers = playersOnField.map(fieldPlayer => {
        const updatedAvailablePlayer = updatedAvailablePlayers.find(p => p.id === fieldPlayer.id);
        return updatedAvailablePlayer ? { ...fieldPlayer, isGoalie: updatedAvailablePlayer.isGoalie } : fieldPlayer;
      });
      setPlayersOnField(updatedFieldPlayers);

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
    availablePlayers, playersOnField, currentGameId, gameSessionState, t,
    // Setter dependencies (React guarantees these are stable but ESLint requires them)
    setAvailablePlayers, setPlayersOnField, setRosterError, queryClient
  ]);

  // --- END Roster Management Handlers ---

  // --- NEW: Handler to Award Fair Play Card ---
  const handleAwardFairPlayCard = useCallback(async (playerId: string | null) => {
      // <<< ADD LOG HERE >>>
      logger.log(`[page.tsx] handleAwardFairPlayCard called with playerId: ${playerId}`);
      logger.log(`[page.tsx] availablePlayers BEFORE update:`, JSON.stringify(availablePlayers.map(p => ({id: p.id, fp: p.receivedFairPlayCard}))));
      logger.log(`[page.tsx] playersOnField BEFORE update:`, JSON.stringify(playersOnField.map(p => ({id: p.id, fp: p.receivedFairPlayCard}))));

      if (!currentGameId || currentGameId === DEFAULT_GAME_ID) {
          logger.warn("Cannot award fair play card in unsaved/default state.");
          return; // Prevent awarding in default state
      }

      let updatedAvailablePlayers = availablePlayers;
      let updatedPlayersOnField = playersOnField;

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
      setPlayersOnField(updatedPlayersOnField);
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
    }, [availablePlayers, playersOnField, saveStateToHistory, currentGameId, setAvailablePlayers, setPlayersOnField]);


  const handleUpdateSelectedPlayers = (playerIds: string[]) => {
    // This function is used by GameSettingsModal to set the roster for that specific game.
    // It replaces the entire selection.
    dispatchGameSession({ type: 'SET_SELECTED_PLAYER_IDS', payload: playerIds });
  };

  // --- NEW: Quick Save Handler ---
  const handleQuickSaveGame = useCallback(async (silent = false) => {
    if (currentGameId && currentGameId !== DEFAULT_GAME_ID) {
      logger.log(`Quick saving game with ID: ${currentGameId}${silent ? ' (silent)' : ''}`, {
        teamId: gameSessionState.teamId,
        tournamentId: gameSessionState.tournamentId,
      });
      try {
        // 1. Create the current game state snapshot
        const currentSnapshot: AppState = {
          playersOnField,
          opponents,
          drawings,
          tacticalDiscs,
          tacticalDrawings,
          tacticalBallPosition,
          availablePlayers: availablePlayers, // <<< ADD BACK: Include roster available *at time of save*
          showPlayerNames: gameSessionState.showPlayerNames, // USE gameSessionState
          teamName: gameSessionState.teamName,
          gameEvents: gameSessionState.gameEvents, // USE gameSessionState
          assessments: playerAssessments,
          opponentName: gameSessionState.opponentName,
          gameDate: gameSessionState.gameDate,
          homeScore: gameSessionState.homeScore,
          awayScore: gameSessionState.awayScore,
          gameNotes: gameSessionState.gameNotes,
          numberOfPeriods: gameSessionState.numberOfPeriods, // Use gameSessionState
          periodDurationMinutes: gameSessionState.periodDurationMinutes, // Use gameSessionState
          currentPeriod: gameSessionState.currentPeriod, // Use gameSessionState
          gameStatus: gameSessionState.gameStatus, // Use gameSessionState
          selectedPlayerIds: gameSessionState.selectedPlayerIds, // CORRECTED
          seasonId: gameSessionState.seasonId,                // CORRECTED (anticipating migration)
          tournamentId: gameSessionState.tournamentId,          // CORRECTED (anticipating migration)
          gameLocation: gameSessionState.gameLocation,          // CORRECTED (anticipating migration)
          gameTime: gameSessionState.gameTime, 
          // Add timer related state (persisted ones)
          subIntervalMinutes: gameSessionState.subIntervalMinutes, // Use gameSessionState for subIntervalMinutes
          completedIntervalDurations: gameSessionState.completedIntervalDurations, // Use gameSessionState for completedIntervalDurations
          lastSubConfirmationTimeSeconds: gameSessionState.lastSubConfirmationTimeSeconds, // Use gameSessionState for lastSubConfirmationTimeSeconds
          homeOrAway: gameSessionState.homeOrAway,
          teamId: gameSessionState.teamId, // Use teamId from gameSessionState
          isPlayed,
          // VOLATILE TIMER STATES ARE EXCLUDED:
          // timeElapsedInSeconds: gameSessionState.timeElapsedInSeconds, // REMOVE from AppState snapshot
          // isTimerRunning: gameSessionState.isTimerRunning, // REMOVE from AppState snapshot
          // nextSubDueTimeSeconds: gameSessionState.nextSubDueTimeSeconds, // REMOVE from AppState snapshot
          // subAlertLevel: gameSessionState.subAlertLevel, // REMOVE from AppState snapshot
        };

        // 2. Update the savedGames state and localStorage
        const updatedSavedGames = { ...savedGames, [currentGameId]: currentSnapshot };
        setSavedGames(updatedSavedGames);
        // localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(updatedSavedGames));
        await utilSaveGame(currentGameId, currentSnapshot); // Use utility function
        await utilSaveCurrentGameIdSetting(currentGameId); // Save current game ID setting

        // Invalidate React Query cache to update LoadGameModal
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });

        // 3. Update history to reflect the saved state
        // This makes the quick save behave like loading a game, resetting undo/redo
        resetHistory(currentSnapshot);

        if (!silent) {
          showToast('Game saved!');
        }

      } catch (error) {
        logger.error("Failed to quick save game state:", error);
        showToast("Error quick saving game.", 'error');
      }
    } else {
      // If no current game ID, create a new saved game entry
      try {
        const newSnapshot: AppState = {
          playersOnField,
          opponents,
          drawings,
          tacticalDiscs,
          tacticalDrawings,
          tacticalBallPosition,
          availablePlayers: availablePlayers,
          showPlayerNames: gameSessionState.showPlayerNames,
          teamName: gameSessionState.teamName,
          gameEvents: gameSessionState.gameEvents,
          opponentName: gameSessionState.opponentName,
          gameDate: gameSessionState.gameDate,
          homeScore: gameSessionState.homeScore,
          awayScore: gameSessionState.awayScore,
          gameNotes: gameSessionState.gameNotes,
          numberOfPeriods: gameSessionState.numberOfPeriods,
          periodDurationMinutes: gameSessionState.periodDurationMinutes,
          currentPeriod: gameSessionState.currentPeriod,
          gameStatus: gameSessionState.gameStatus,
          selectedPlayerIds: gameSessionState.selectedPlayerIds,
          seasonId: gameSessionState.seasonId,
          tournamentId: gameSessionState.tournamentId,
          gameLocation: gameSessionState.gameLocation,
          gameTime: gameSessionState.gameTime,
          subIntervalMinutes: gameSessionState.subIntervalMinutes,
          completedIntervalDurations: gameSessionState.completedIntervalDurations,
          lastSubConfirmationTimeSeconds: gameSessionState.lastSubConfirmationTimeSeconds,
          homeOrAway: gameSessionState.homeOrAway,
          isPlayed,
        };

        const { gameId, gameData } = await createGame(newSnapshot);
        setSavedGames(prev => ({ ...prev, [gameId]: gameData }));
        setCurrentGameId(gameId);
        await utilSaveCurrentGameIdSetting(gameId);
        resetHistory(gameData);
        if (!silent) {
          showToast('Game saved!');
        }
      } catch (error) {
        logger.error('Failed to save new game:', error);
        showToast('Error quick saving game.', 'error');
      }
    }
  },    [
    currentGameId,
    savedGames,
    playersOnField,
    opponents,
    drawings,
    tacticalDiscs,
    tacticalDrawings,
    tacticalBallPosition,
    availablePlayers,
    setSavedGames,
    resetHistory,
    showToast,
    gameSessionState, // This now covers all migrated game session fields
    playerAssessments,
    isPlayed,
    queryClient
  ]);
  // --- END Quick Save Handler ---

  // --- Auto-Save with Smart Debouncing ---
  // Different delays based on user impact:
  // - Immediate (0ms): Goals, assists, scores → Statistics update instantly
  // - Short (500ms): Game metadata → Near-instant feel
  // - Long (2000ms): Tactical data → Battery-friendly
  // Determine if any blocking modal is open to pause auto-save
  const isAutoSaveBlockedByModal = isLoadGameModalOpen || isNewGameSetupModalOpen;

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
      // Tactical/position data - battery-friendly
      states: {
        playersOnField,
        opponents,
        drawings,
        tacticalDiscs,
        tacticalDrawings,
        tacticalBallPosition,
      },
      delay: 2000,
    },
    saveFunction: () => handleQuickSaveGame(true), // Silent auto-save
    enabled: currentGameId !== DEFAULT_GAME_ID && !isAutoSaveBlockedByModal,
    currentGameId,
  });
  // --- END Auto-Save ---

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
  const handleOpenGameSettingsModal = () => {
      setIsGameSettingsModalOpen(true); // Corrected State Setter
  };
  const handleCloseGameSettingsModal = () => {
    setIsGameSettingsModalOpen(false); // Corrected State Setter
  };
  const handleOpenSettingsModal = () => {
    setIsSettingsModalOpen(true);
  };
  const handleCloseSettingsModal = () => {
    setIsSettingsModalOpen(false);
  };

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
    handleQuickSaveGame(); // Call quick save directly
    setPlayerIdsForNewGame(gameSessionState.selectedPlayerIds); // Use the current selection
    setShowSaveBeforeNewConfirm(false);
    openNewGameViaReducer(); // Open setup modal immediately after
  }, [handleQuickSaveGame, gameSessionState.selectedPlayerIds, openNewGameViaReducer]);

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

  // New handler to place all selected players on the field at once
  const handlePlaceAllPlayers = useCallback(() => {
    // Get the list of selected players who are not yet on the field
           const selectedButNotOnField = gameSessionState.selectedPlayerIds.filter((id: string) => 
      !playersOnField.some(fieldPlayer => fieldPlayer.id === id)
    );
    
    if (selectedButNotOnField.length === 0) {
      // All selected players are already on the field
      logger.log('All selected players are already on the field');
      return;
    }

    // Find the corresponding player objects from availablePlayers
    const playersToPlace = selectedButNotOnField
      .map(id => availablePlayers.find(p => p.id === id))
      .filter((p): p is Player => p !== undefined);
    
    logger.log(`Placing ${playersToPlace.length} players on the field...`);

    // Define a reasonable soccer formation based on number of players
    // For simplicity, we'll use these common formations:
    // 3-4 players: simple triangle or diamond
    // 5-7 players: 2-3-1 or 2-3-2 formation
    // 8+ players: 3-3-2 or 3-4-1 formation
    
    // Calculate positions for players in a reasonable soccer formation
    const newFieldPlayers: Player[] = [...playersOnField]; // Start with existing players
    
    // Find if there's a goalie in the players to place
    const goalieIndex = playersToPlace.findIndex(p => p.isGoalie);
    let goalie: Player | null = null;
    
    if (goalieIndex !== -1) {
      // Remove goalie from the array and handle separately
      goalie = playersToPlace.splice(goalieIndex, 1)[0];
    }
    
    // Place goalie first if one exists
    if (goalie) {
      // Place at the goal line, slightly offset from center
      newFieldPlayers.push({
        ...goalie,
        relX: 0.5,
        relY: 0.95 // Near our own goal line
      });
    }
    
    // Determine formation based on remaining players
    const remainingCount = playersToPlace.length;
    let positions: { relX: number, relY: number }[] = [];
    
    if (remainingCount <= 3) {
      // Simple triangle/diamond formation for 1-3 players (not including goalie)
      if (remainingCount >= 1) positions.push({ relX: 0.5, relY: 0.8 }); // Defender
      if (remainingCount >= 2) positions.push({ relX: 0.5, relY: 0.5 }); // Midfielder
      if (remainingCount >= 3) positions.push({ relX: 0.5, relY: 0.3 }); // Forward
    } 
    else if (remainingCount <= 7) {
      // 2-3-1 or 2-3-2 formation for 6-7 players (not including goalie)
      // Defenders
      positions.push({ relX: 0.3, relY: 0.8 });
      positions.push({ relX: 0.7, relY: 0.8 });
      
      // Midfielders
      positions.push({ relX: 0.25, relY: 0.6 });
      positions.push({ relX: 0.5, relY: 0.55 });
      positions.push({ relX: 0.75, relY: 0.6 });
      
      // Forwards
      positions.push({ relX: 0.35, relY: 0.3 });
      if (remainingCount >= 7) positions.push({ relX: 0.65, relY: 0.3 });
    }
    else {
      // 3-4-1 or 3-3-2 formation for 8+ players (not including goalie)
      // Defenders
      positions.push({ relX: 0.25, relY: 0.85 });
      positions.push({ relX: 0.5, relY: 0.8 });
      positions.push({ relX: 0.75, relY: 0.85 });
      
      // Midfielders
      positions.push({ relX: 0.2, relY: 0.6 });
      positions.push({ relX: 0.4, relY: 0.55 });
      positions.push({ relX: 0.6, relY: 0.55 });
      positions.push({ relX: 0.8, relY: 0.6 });
      
      // Forwards
      positions.push({ relX: 0.5, relY: 0.3 });
      if (remainingCount >= 9) positions.push({ relX: 0.35, relY: 0.3 });
      if (remainingCount >= 10) positions.push({ relX: 0.65, relY: 0.3 });
    }
    
    // Take only the positions we need for the remaining players
    positions = positions.slice(0, remainingCount);
    
    // Add player in each position
    playersToPlace.forEach((player, index) => {
      if (index < positions.length) {
        newFieldPlayers.push({
          ...player,
          relX: positions[index].relX,
          relY: positions[index].relY
        });
      }
    });
    
    // Update players on field
    setPlayersOnField(newFieldPlayers);
    saveStateToHistory({ playersOnField: newFieldPlayers });
    
    logger.log(`Successfully placed ${playersToPlace.length} players on the field`);
         }, [playersOnField, gameSessionState.selectedPlayerIds, availablePlayers, saveStateToHistory, setPlayersOnField]);

  // --- END Quick Save Handler ---

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
    handleToggleGameStatsModal();
  };

  const fieldInteractions = useMemo<FieldInteractions>(() => ({
    players: {
      move: handlePlayerMove,
      moveEnd: handlePlayerMoveEnd,
      remove: handlePlayerRemove,
      drop: handleDropOnField,
    },
    opponents: {
      move: handleOpponentMove,
      moveEnd: handleOpponentMoveEnd,
      remove: handleOpponentRemove,
    },
    drawing: {
      start: handleDrawingStart,
      addPoint: handleDrawingAddPoint,
      end: handleDrawingEnd,
    },
    tactical: {
      drawingStart: handleTacticalDrawingStart,
      drawingAddPoint: handleTacticalDrawingAddPoint,
      drawingEnd: handleTacticalDrawingEnd,
      discMove: handleTacticalDiscMove,
      discRemove: handleTacticalDiscRemove,
      discToggleType: handleToggleTacticalDiscType,
      ballMove: handleTacticalBallMove,
    },
    touch: {
      playerDrop: handlePlayerDropViaTouch,
      playerDragCancel: handlePlayerDragCancelViaTouch,
    },
  }), [
    handlePlayerMove,
    handlePlayerMoveEnd,
    handlePlayerRemove,
    handleDropOnField,
    handleOpponentMove,
    handleOpponentMoveEnd,
    handleOpponentRemove,
    handleDrawingStart,
    handleDrawingAddPoint,
    handleDrawingEnd,
    handleTacticalDrawingStart,
    handleTacticalDrawingAddPoint,
    handleTacticalDrawingEnd,
    handleTacticalDiscMove,
    handleTacticalDiscRemove,
    handleToggleTacticalDiscType,
    handleTacticalBallMove,
    handlePlayerDropViaTouch,
    handlePlayerDragCancelViaTouch,
  ]);

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

  const fieldContainerProps: FieldContainerProps = {
    gameSessionState,
    fieldVM: {
      playersOnField,
      opponents,
      drawings,
      isTacticsBoardView,
      tacticalDrawings,
      tacticalDiscs,
      tacticalBallPosition,
      draggingPlayerFromBarInfo,
      isDrawingEnabled,
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
    canUndo,
    canRedo,
    onTacticalUndo: handleTacticalUndo,
    onTacticalRedo: handleTacticalRedo,
    canTacticalUndo: tacticalHistory.canUndo,
    canTacticalRedo: tacticalHistory.canRedo,
    onResetField: handleResetFieldClick,
    onClearDrawings: handleClearDrawingsForView,
    onAddOpponent: handleAddOpponent,
    onPlaceAllPlayers: handlePlaceAllPlayers,
    isTacticsBoardView,
    onToggleTacticsBoard: handleToggleTacticsBoard,
    onAddHomeDisc: () => handleAddTacticalDisc('home'),
    onAddOpponentDisc: () => handleAddTacticalDisc('opponent'),
    isDrawingEnabled,
    onToggleDrawingMode: handleToggleDrawingMode,
    onToggleTrainingResources: handleToggleTrainingResources,
    onToggleGameStatsModal: handleToggleGameStatsModal,
    onOpenLoadGameModal: handleOpenLoadGameModal,
    onStartNewGame: handleStartNewGame,
    onOpenRosterModal: openRosterModal,
    onQuickSave: handleQuickSaveGame,
    onOpenGameSettingsModal: handleOpenGameSettingsModal,
    isGameLoaded: Boolean(currentGameId && currentGameId !== DEFAULT_GAME_ID),
    onOpenSeasonTournamentModal: handleOpenSeasonTournamentModal,
    onToggleInstructionsModal: handleToggleInstructionsModal,
    onOpenSettingsModal: handleOpenSettingsModal,
    onOpenPlayerAssessmentModal: openPlayerAssessmentModal,
    onOpenTeamManagerModal: handleOpenTeamManagerModal,
    onOpenPersonnelManager: () => setIsPersonnelManagerOpen(true),
  };

  const isLoading = gameDataManagement.isLoading;

  const isBootstrapping = isLoading && !initialLoadComplete;

  const gameContainerProps = {
    playerBar: playerBarViewModel,
    gameInfo: gameInfoViewModel,
    onPlayerDragStartFromBar: handlePlayerDragStartFromBar,
    onBarBackgroundClick: handleDeselectPlayer,
    onPlayerTapInBar: handlePlayerTapInBar,
    onToggleGoalie: handleToggleGoalieForModal,
    onTeamNameChange: handleTeamNameChange,
    onOpponentNameChange: handleOpponentNameChange,
    orphanedGameInfo,
    onOpenTeamReassignModal: () => setIsTeamReassignModalOpen(true),
    fieldProps: fieldContainerProps,
    controlBarProps,
  };

  const masterRoster = gameDataManagement.masterRoster;

  const modalManagerProps: ModalManagerProps = {
    state: {
      isTrainingResourcesOpen,
      isInstructionsModalOpen,
      isPersonnelManagerOpen,
      isTeamManagerOpen,
      isGoalLogModalOpen,
      isGameStatsModalOpen,
      isLoadGameModalOpen,
      isNewGameSetupModalOpen,
      isRosterModalOpen,
      isSeasonTournamentModalOpen,
      isGameSettingsModalOpen,
      isSettingsModalOpen,
      isPlayerAssessmentModalOpen,
      isTeamReassignModalOpen,
      showNoPlayersConfirm,
      showHardResetConfirm,
      showSaveBeforeNewConfirm,
      showStartNewConfirm,
      showResetFieldConfirm,
    },
    data: {
      gameSessionState,
      availablePlayers,
      playersForCurrentGame,
      savedGames,
      currentGameId,
      teams: gameDataManagement.teams,
      seasons: gameDataManagement.seasons,
      tournaments: gameDataManagement.tournaments,
      masterRoster,
      personnel: gameDataManagement.personnel,
      personnelManager: {
        addPersonnel: gameDataManagement.personnelManager.addPersonnel,
        updatePersonnel: gameDataManagement.personnelManager.updatePersonnel,
        removePersonnel: gameDataManagement.personnelManager.removePersonnel,
        isLoading: gameDataManagement.personnelManager.isLoading,
      },
      playerAssessments,
      selectedPlayerForStats,
      playerIdsForNewGame,
      newGameDemandFactor,
      availableTeams,
      orphanedGameInfo,
      appLanguage,
      defaultTeamNameSetting,
      gameIdentifierForSave,
      isPlayed,
      isRosterUpdating,
      rosterError,
      loadGameState: {
        isLoadingGamesList,
        loadGamesListError,
        isGameLoading,
        gameLoadError,
        isGameDeleting,
        gameDeleteError,
        processingGameId,
      },
      seasonTournamentMutations: {
        addSeason: gameDataManagement.mutationResults.addSeason,
        addTournament: gameDataManagement.mutationResults.addTournament,
        updateSeason: gameDataManagement.mutationResults.updateSeason,
        deleteSeason: gameDataManagement.mutationResults.deleteSeason,
        updateTournament: gameDataManagement.mutationResults.updateTournament,
        deleteTournament: gameDataManagement.mutationResults.deleteTournament,
      },
      updateGameDetailsMutation,
    },
    handlers: {
      toggleTrainingResources: handleToggleTrainingResources,
      toggleInstructionsModal: handleToggleInstructionsModal,
      closePersonnelManager: () => setIsPersonnelManagerOpen(false),
      closeTeamManagerModal: handleCloseTeamManagerModal,
      toggleGoalLogModal: handleToggleGoalLogModal,
      addGoalEvent: handleAddGoalEvent,
      logOpponentGoal: handleLogOpponentGoal,
      updateGameEvent: handleUpdateGameEvent,
      deleteGameEvent: handleDeleteGameEvent,
      toggleGameStatsModal: handleToggleGameStatsModal,
      exportOneExcel: handleExportOneExcel,
      exportAggregateExcel: handleExportAggregateExcel,
      exportPlayerExcel: handleExportPlayerExcel,
      gameLogClick: handleGameLogClick,
      closeLoadGameModal: handleCloseLoadGameModal,
      loadGame: handleLoadGame,
      deleteGame: handleDeleteGame,
      exportOneJson: handleExportOneJson,
      setSelectedTeamForRoster,
      setNewGameDemandFactor,
      startNewGameWithSetup: handleStartNewGameWithSetup,
      cancelNewGameSetup: handleCancelNewGameSetup,
      closeRosterModal,
      updatePlayerForModal: handleUpdatePlayerForModal,
      renamePlayerForModal: handleRenamePlayerForModal,
      setJerseyNumberForModal: handleSetJerseyNumberForModal,
      setPlayerNotesForModal: handleSetPlayerNotesForModal,
      removePlayerForModal: handleRemovePlayerForModal,
      addPlayerForModal: handleAddPlayerForModal,
      openPlayerStats: handleOpenPlayerStats,
      closeSeasonTournamentModal: handleCloseSeasonTournamentModal,
      closeGameSettingsModal: handleCloseGameSettingsModal,
      teamNameChange: handleTeamNameChange,
      opponentNameChange: handleOpponentNameChange,
      gameDateChange: handleGameDateChange,
      gameLocationChange: handleGameLocationChange,
      gameTimeChange: handleGameTimeChange,
      gameNotesChange: handleGameNotesChange,
      ageGroupChange: handleAgeGroupChange,
      tournamentLevelChange: handleTournamentLevelChange,
      awardFairPlayCard: handleAwardFairPlayCard,
      setNumberOfPeriods: handleSetNumberOfPeriods,
      setPeriodDuration: handleSetPeriodDuration,
      setDemandFactor: handleSetDemandFactor,
      setSeasonId: handleSetSeasonId,
      setTournamentId: handleSetTournamentId,
      setHomeOrAway: handleSetHomeOrAway,
      setIsPlayed,
      updateSelectedPlayers: handleUpdateSelectedPlayers,
      setGamePersonnel: handleSetGamePersonnel,
      closeSettingsModal: handleCloseSettingsModal,
      setAppLanguage,
      setDefaultTeamName: setDefaultTeamNameSetting,
      showAppGuide: handleShowAppGuide,
      hardResetApp: handleHardResetApp,
      closePlayerAssessmentModal,
      savePlayerAssessment: handleSavePlayerAssessment,
      deletePlayerAssessment: handleDeletePlayerAssessment,
      teamReassignment: handleTeamReassignment,
      setIsTeamReassignModalOpen,
      confirmNoPlayers: handleNoPlayersConfirmed,
      setShowNoPlayersConfirm,
      confirmHardReset: handleHardResetConfirmed,
      setShowHardResetConfirm,
      saveBeforeNewConfirmed: handleSaveBeforeNewConfirmed,
      saveBeforeNewCancelled: handleSaveBeforeNewCancelled,
      setShowStartNewConfirm,
      startNewConfirmed: handleStartNewConfirmed,
      setShowResetFieldConfirm,
      resetFieldConfirmed: handleResetFieldConfirmed,
      openSettingsModal: handleOpenSettingsModal,
      onCreateBackup: handleCreateBackup,
      onDataImportSuccess,
      manageTeamRosterFromNewGame: handleManageTeamRosterFromNewGame,
    },
  };

  return {
    gameContainerProps,
    modalManagerProps,
    isBootstrapping,
    isResetting,
  };
}
