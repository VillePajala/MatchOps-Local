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
import { GameSessionState } from '@/hooks/useGameSessionReducer';
import { saveGame as utilSaveGame, getGame as utilGetGame, getLatestGameId } from '@/utils/savedGames';
import {
  saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting,
  resetAppSettings as utilResetAppSettings,
  resetUserAppSettings as utilResetUserAppSettings,
  saveHasSeenAppGuide,
  getLastHomeTeamName as utilGetLastHomeTeamName,
  updateAppSettings as utilUpdateAppSettings,
} from '@/utils/appSettings';
import { getDataStore } from '@/datastore';
import { setMigrationCompleted } from '@/config/backendConfig';
import { getTeams, getTeam } from '@/utils/teams';
import { Player, Team } from '@/types';
import type { GameType } from '@/types/game';
import type { GameEvent, AppState, SavedGamesCollection, PlayerAssessment, UpdateGameDetailsMutationVariables } from "@/types";
import { setPlayerFairPlayCardStatus } from '@/utils/masterRoster';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoster } from '@/hooks/useRoster';
import { useGameDataManagement } from './useGameDataManagement';
import { useGameSessionCoordination } from './useGameSessionCoordination';
import { useGamePersistence } from './useGamePersistence';
import { useModalOrchestration } from './useModalOrchestration';
import { useModalContext } from '@/contexts/ModalProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { getStorageItem, setStorageItem, removeStorageItem } from '@/utils/storage';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { updateGameDetails as utilUpdateGameDetails } from '@/utils/savedGames';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { MASTER_ROSTER_KEY, SEASONS_LIST_KEY } from "@/config/storageKeys";
import { loadTimerStateForGame, clearTimerState } from '@/utils/timerStateManager';
import { exportJson } from '@/utils/exportGames';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import { startNewGameWithSetup, cancelNewGameSetup } from '../utils/newGameHandlers';
import { usePremium } from '@/hooks/usePremium';
import { buildGameContainerViewModel, isValidGameContainerVMInput } from '@/viewModels/gameContainer';
import type { BuildGameContainerVMInput } from '@/viewModels/gameContainer';
import type { FieldContainerProps, FieldInteractions } from '@/components/HomePage/containers/FieldContainer';
import type { ReducerDrivenModals } from '@/types';
import { debug } from '@/utils/debug';
import { generateSubSlots } from '@/utils/formations';

// Empty initial data for clean app start
const initialAvailablePlayersData: Player[] = [];

const initialState: AppState = {
  playersOnField: [], // Start with no players on field
  opponents: [], // Start with no opponents
  drawings: [],
  availablePlayers: initialAvailablePlayersData,
  showPlayerNames: true,
  teamName: "My Team",
  gameEvents: [], // Initialize game events as empty array
  // Initialize game info
  opponentName: "Opponent",
  gameDate: new Date().toISOString().split('T')[0], // Default to today's date YYYY-MM-DD
  homeScore: 0,
  awayScore: 0,
  gameNotes: '', // Initialize game notes as empty string
  homeOrAway: 'home',
  // Initialize game structure
  numberOfPeriods: 2,
  periodDurationMinutes: 15, // Default to 15 minutes
  currentPeriod: 1,
  gameStatus: 'notStarted', // Initialize game status
  demandFactor: 1,
  // Initialize selectedPlayerIds as empty for clean app start
  selectedPlayerIds: [],
  gamePersonnel: [],
  seasonId: '', // Initialize season ID
  tournamentId: '', // Initialize tournament ID
  leagueId: undefined, // Initialize league ID (optional, can override season's default)
  customLeagueName: undefined, // Initialize custom league name (used when leagueId === 'muu')
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
  onGoToStartScreen?: () => void;
  /** Pre-fetched game type from the last loaded game. Used to set correct field color on first render,
   *  preventing a green→blue flash when resuming a futsal game. */
  initialGameType?: GameType;
}

export interface UseGameOrchestrationReturn {
  gameContainerProps: GameContainerProps;
  modalManagerProps: ModalManagerProps;
  isBootstrapping: boolean;
  isResetting: boolean;
}

export function useGameOrchestration({ initialAction, skipInitialSetup = false, onDataImportSuccess, isFirstTimeUser: _isFirstTimeUser = false, onGoToStartScreen, initialGameType }: UseGameOrchestrationProps): UseGameOrchestrationReturn {
  // Sync hasSkippedInitialSetup with prop to prevent flash
  const [hasSkippedInitialSetup, setHasSkippedInitialSetup] = useState<boolean>(skipInitialSetup);
  const { t } = useTranslation(); // Get translation function
  const queryClient = useQueryClient(); // Get query client instance

  // --- Game Session Coordination (Step 2.6.2) ---
  // Override initialState's gameType with pre-fetched value to prevent field color flash
  // (e.g., green soccer field briefly showing before blue futsal field loads)
  const effectiveInitialState = useMemo(() =>
    initialGameType ? { ...initialState, gameType: initialGameType } : initialState,
  [initialGameType]);
  const sessionCoordination = useGameSessionCoordination({
    initialState: effectiveInitialState,
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

  // --- Premium limits ---
  const { canCreate, showUpgradePrompt } = usePremium();

  // --- Get showToast early (needed by Field Coordination) ---
  const { showToast } = useToast();

  // --- Auth (for cloud mode sign out) ---
  const { signOut, mode: authMode } = useAuth();

  // --- User-Scoped Storage ---
  const { userId } = useDataStore();

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

  // Extract stable setters for use in effects
  // React useState setters are guaranteed stable (same identity across renders)
  // This avoids depending on the whole fieldCoordination object (which is recreated each render)
  const setPlayersOnField = fieldCoordination.setPlayersOnField;
  const setOpponents = fieldCoordination.setOpponents;
  const setDrawings = fieldCoordination.setDrawings;
  const setTacticalDiscs = fieldCoordination.setTacticalDiscs;
  const setTacticalDrawings = fieldCoordination.setTacticalDrawings;
  const setTacticalBallPosition = fieldCoordination.setTacticalBallPosition;
  const setFormationSnapPoints = fieldCoordination.setFormationSnapPoints;
  const setSubSlots = fieldCoordination.setSubSlots;

  // --- History Orchestration (Undo/Redo) ---
  /**
   * Orchestrate undo across both field and session state
   *
   * Separates concerns: field coordination restores field state,
   * session coordination restores game session state.
   */
  // Destructure stable methods to avoid depending on full coordination objects
  // (which are recreated every render, defeating useCallback memoization)
  const { applyFieldHistoryState } = fieldCoordination;
  const { applyHistoryState } = sessionCoordination;

  const handleUndo = useCallback(() => {
    const prevState = undoHistory();
    if (prevState) {
      logger.log('Undoing...');
      // Apply field state (players, opponents, drawings, tactical)
      applyFieldHistoryState(prevState);
      // Apply session state (score, timer, periods, etc.)
      applyHistoryState(prevState);
    } else {
      logger.log('Cannot undo: at beginning of history');
    }
  }, [undoHistory, applyFieldHistoryState, applyHistoryState]);

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
      applyFieldHistoryState(nextState);
      // Apply session state (score, timer, periods, etc.)
      applyHistoryState(nextState);
    } else {
      logger.log('Cannot redo: at end of history');
    }
  }, [redoHistory, applyFieldHistoryState, applyHistoryState]);

  // --- Persistence State ---
  const [currentGameId, setCurrentGameId] = useState<string | null>(DEFAULT_GAME_ID);
  const [isPlayed, setIsPlayed] = useState<boolean>(true);

  // This ref needs to be declared after currentGameId
  const gameIdRef = useRef(currentGameId);
  // Track which game has been successfully loaded to prevent reload on auto-save
  const loadedGameIdRef = useRef<string | null>(null);
  // Track which initialAction has been processed to prevent re-processing
  const processedInitialActionRef = useRef<string | null>(null);

  useEffect(() => { gameIdRef.current = currentGameId; }, [currentGameId]);

  const {
    assessments: playerAssessments,
    saveAssessment,
    deleteAssessment,
  } = usePlayerAssessments(
    currentGameId || '',
    gameSessionState.completedIntervalDurations,
  );

  // --- Game Data Management Hook ---
  // NOTE: seasons and tournaments are now accessed via gameDataManagement.seasons/tournaments
  // Local state was removed as part of Step 2.7.1 cleanup
  const gameDataManagement = useGameDataManagement({
    currentGameId,
    setAvailablePlayers,
    // setSeasons and setTournaments removed - using gameDataManagement.seasons/tournaments directly
  });

  // Local state for savedGames - DO NOT replace with React Query cache directly!
  // The useState ensures local state persists across renders and isn't affected by
  // query cache invalidations. Previous attempt to use useMemo + queryClient.setQueryData
  // caused game data to reset to defaults when navigating between games.
  const [savedGames, setSavedGames] = useState<SavedGamesCollection>({});

  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  const [defaultTeamNameSetting, setDefaultTeamNameSetting] = useState<string>('');
  const [appLanguage, setAppLanguage] = useState<string>(i18n.language);

  useEffect(() => {
    utilGetLastHomeTeamName(userId).then((name) => setDefaultTeamNameSetting(name));
  }, [userId]);

  useEffect(() => {
    i18n.changeLanguage(appLanguage);
    utilUpdateAppSettings({ language: appLanguage }).catch((error) => {
      logger.warn('[useGameOrchestration] Failed to save language preference (non-critical)', { language: appLanguage, error });
    });
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
    isRulesDirectoryOpen,
    setIsRulesDirectoryOpen,
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

  // Wrapper around reducer-backed modals (load/new). Memoized to prevent
  // child re-renders when modal states haven't changed.
  const reducerDrivenModals: ReducerDrivenModals = useMemo(() => ({
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
  }), [
    isLoadGameModalOpen, openLoadGameViaReducer, closeLoadGameViaReducer,
    isNewGameSetupModalOpen, openNewGameViaReducer, closeNewGameViaReducer,
    isRosterModalOpen, openRosterViaReducer, closeRosterViaReducer,
    isSeasonTournamentModalOpen, openSeasonTournamentViaReducer, closeSeasonTournamentViaReducer,
  ]);

  // showToast already defined earlier (needed by useFieldCoordination)
  // const [isPlayerStatsModalOpen, setIsPlayerStatsModalOpen] = useState(false);
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<Player | null>(null);
   
  const [_selectedTeamForRoster, setSelectedTeamForRoster] = useState<string | null>(null);

  const handleCreateBackup = useCallback(() => {
    exportFullBackup(showToast, userId);
  }, [showToast, userId]);

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

  const {
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,
    showLargeTimerOverlay,
    handleToggleLargeTimerOverlay,
    timerInteractions,
  } = timerManagement;

  // Merge goalie status from playersOnField into players for the PlayerBar.
  // When on DEFAULT_GAME_ID (no real game), show all availablePlayers so users can explore.
  // When on a real game, show only playersForCurrentGame (selected players).
  const playersWithFieldGoalieStatus = useMemo(() => {
    // Show all roster players when exploring (no game created yet)
    const basePlayers = currentGameId === DEFAULT_GAME_ID ? availablePlayers : playersForCurrentGame;

    const fieldPlayerMap = new Map(
      fieldCoordination.playersOnField.map(p => [p.id, p])
    );
    return basePlayers.map(player => {
      const fieldPlayer = fieldPlayerMap.get(player.id);
      if (fieldPlayer && fieldPlayer.isGoalie !== player.isGoalie) {
        return { ...player, isGoalie: fieldPlayer.isGoalie };
      }
      return player;
    });
  }, [currentGameId, availablePlayers, playersForCurrentGame, fieldCoordination.playersOnField]);

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
    playersForCurrentGame: playersWithFieldGoalieStatus,
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
    playersWithFieldGoalieStatus,
    fieldCoordination.draggingPlayerFromBarInfo,
  ]);

  if (process.env.NODE_ENV !== 'production' && !isValidGameContainerVMInput(gameContainerVMInput)) {
    throw new Error('[HomePage] Invalid GameContainer view-model input detected.');
  }

  const gameContainerVM = useMemo(() => buildGameContainerViewModel(gameContainerVMInput), [gameContainerVMInput]);
  const playerBarViewModel = gameContainerVM.playerBar;
  const gameInfoViewModel = gameContainerVM.gameInfo;

  useEffect(() => {
    if (!initialAction) return;

    // Skip if we've already processed this exact action
    if (processedInitialActionRef.current === initialAction) return;
    processedInitialActionRef.current = initialAction;

    // Process the initial action
    switch (initialAction) {
      case 'newGame':
        // Check if roster is empty before opening new game modal
        if (availablePlayers.length === 0) {
          setShowNoPlayersConfirm(true);
        } else {
          setPlayerIdsForNewGame(gameSessionState.selectedPlayerIds);
          openNewGameViaReducer();
        }
        break;
      case 'loadGame':
        openLoadGameViaReducer();
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
  // All callbacks are stable (useCallback with proper deps).
  // Intentionally omitting modal setters (setIsGameStatsModalOpen, setIsTeamManagerOpen,
  // setIsSettingsModalOpen) from deps - they're stable React setters but are not available
  // at effect registration time due to hook call order (useModalOrchestration called after
  // useGameOrchestration). Adding them would require restructuring the hook initialization.
  // The processedInitialActionRef guard prevents stale closure issues.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, availablePlayers.length, gameSessionState.selectedPlayerIds,
      openLoadGameViaReducer, openNewGameViaReducer, openSeasonTournamentViaReducer, openRosterViaReducer]);
  
  const [playerIdsForNewGame, setPlayerIdsForNewGame] = useState<string[] | null>(null);
  const [newGameDemandFactor, setNewGameDemandFactor] = useState(1);
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
  const [orphanedGameInfo, setOrphanedGameInfo] = useState<{ teamId: string; teamName?: string } | null>(null);
  const [isTeamReassignModalOpen, setIsTeamReassignModalOpen] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [isResetting, setIsResetting] = useState(false);

  // Load teams when orphaned game is detected
  // Uses mounted flag to prevent setState on unmounted component
  useEffect(() => {
    let isMounted = true;

    if (orphanedGameInfo) {
      getTeams(userId).then(teams => {
        if (isMounted) {
          setAvailableTeams(teams);
        }
      }).catch(error => {
        logger.error('[ORPHANED GAME] Error loading teams:', error);
        if (isMounted) {
          setAvailableTeams([]);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [orphanedGameInfo, userId]);

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
      await utilSaveGame(currentGameId, updatedGame, userId);

      // Update local state
      setSavedGames(prev => ({
        ...prev,
        [currentGameId]: updatedGame
      }));

      // Invalidate React Query cache to update LoadGameModal
      queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });

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

  const lastAppliedMutationSequenceRef = useRef(0);

  const updateGameDetailsMutation = useMutation<AppState | null, Error, UpdateGameDetailsMutationVariables>({
    mutationFn: ({ gameId, updates }) => utilUpdateGameDetails(gameId, updates, userId),
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
      queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });

      // Optimistically update the query cache
      queryClient.setQueryData([...queryKeys.savedGames, userId], (oldData: SavedGamesCollection | undefined) => {
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
  // Also removes players that were deleted from the roster
  useEffect(() => {
    if (availablePlayers && availablePlayers.length > 0) {
      setPlayersOnField(prevPlayersOnField => {
        // Build a lookup map for O(1) access
        const rosterLookup = new Map(availablePlayers.map(p => [p.id, p]));

        // Filter out deleted players and update details for existing ones
        const nextPlayersOnField = prevPlayersOnField
          .filter(fieldPlayer => rosterLookup.has(fieldPlayer.id)) // Remove deleted players
          .map(fieldPlayer => {
            const rosterPlayer = rosterLookup.get(fieldPlayer.id)!;
            // Sync relevant properties from rosterPlayer to fieldPlayer
            // Only update if there's a difference to avoid unnecessary re-renders / history saves
            // Note: isGoalie is NOT synced - it's per-game field state, not roster metadata.
            // A player's goalie status can vary per game (e.g., goalie in one game, defender in another).
            // isGoalie is set by: formation picker, manual toggle, or player movement.
            if (fieldPlayer.name !== rosterPlayer.name ||
                fieldPlayer.jerseyNumber !== rosterPlayer.jerseyNumber ||
                fieldPlayer.nickname !== rosterPlayer.nickname ||
                fieldPlayer.notes !== rosterPlayer.notes
            ) {
              return {
                ...fieldPlayer, // Keep position (relX, relY) and isGoalie (per-game state)
                name: rosterPlayer.name,
                jerseyNumber: rosterPlayer.jerseyNumber,
                nickname: rosterPlayer.nickname,
                notes: rosterPlayer.notes,
                // Ensure other essential Player properties are maintained if not in rosterPlayer directly
                receivedFairPlayCard: rosterPlayer.receivedFairPlayCard !== undefined ? rosterPlayer.receivedFairPlayCard : fieldPlayer.receivedFairPlayCard
              };
            }
            return fieldPlayer;
          });

        // Only save to history if actual changes were made to playersOnField
        if (JSON.stringify(prevPlayersOnField) !== JSON.stringify(nextPlayersOnField)) {
          saveStateToHistory({ playersOnField: nextPlayersOnField });
        }
        return nextPlayersOnField;
      });
    }
  // setPlayersOnField is stable (React useState setter extracted from fieldCoordination)
  // saveStateToHistory is stable (ref pattern from useGameSessionCoordination)
  }, [availablePlayers, setPlayersOnField, saveStateToHistory]);
  
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
      // IMPORTANT: Only sync on initial load to prevent race conditions.
      // After initial load, local state is the source of truth for savedGames.
      // React Query refetches (e.g., from app-resume invalidation) could complete with stale data
      // that doesn't include recent optimistic updates (new games, saves in progress).
      // See: "new game becomes copy of old game" bug investigation.
      if (!initialLoadComplete) {
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
          const lastGameId = gameDataManagement.currentGameIdSetting;
          const savedTimerState = await loadTimerStateForGame(lastGameId || '', userId);

          if (savedTimerState) {
            const elapsedOfflineSeconds = (Date.now() - savedTimerState.timestamp) / 1000;
            const correctedElapsedSeconds = Math.round(savedTimerState.timeElapsedInSeconds + elapsedOfflineSeconds);

            // Use RESTORE_TIMER_STATE which atomically sets elapsed time + starts timer
            // (SET_TIMER_ELAPSED is a no-op when timer is not running)
            dispatchGameSession({ type: 'RESTORE_TIMER_STATE', payload: { savedTime: correctedElapsedSeconds, timestamp: Date.now() } });
          } else {
            // Clear any stale timer state (might be for a different game)
            await clearTimerState(userId);
          }
        } catch (error) {
          logger.error('[EFFECT init] Error restoring timer state:', error);
          await clearTimerState(userId);
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
    userId, // User-scoped storage
    // setIsInstructionsModalOpen intentionally excluded - useState setter is stable (from useModalOrchestration)
  ]);

  // --- NEW: Robust Visibility Change Handling ---
  // --- Wake Lock Effect ---
  useEffect(() => {
    // This effect is now replaced by the direct call in the main timer effect
    // to avoid race conditions.
  }, []);

  // Helper function to load game state from game data
  // Wrapped in useCallback for proper dependency tracking in the game loading effect
  const loadGameStateFromData = useCallback(async (gameData: AppState | null, isInitialDefaultLoad = false) => {
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
        leagueId: gameData.leagueId ?? undefined,
        customLeagueName: gameData.customLeagueName ?? undefined,
        gameType: gameData.gameType ?? 'soccer',
        gender: gameData.gender,
        teamId: gameData.teamId,
        gameLocation: gameData.gameLocation,
        gameTime: gameData.gameTime,
        demandFactor: gameData.demandFactor,
        gameEvents: gameData.gameEvents,
        subIntervalMinutes: gameData.subIntervalMinutes,
        completedIntervalDurations: gameData.completedIntervalDurations,
        lastSubConfirmationTimeSeconds: gameData.lastSubConfirmationTimeSeconds,
        showPlayerNames: gameData.showPlayerNames,
        showPositionLabels: gameData.showPositionLabels,
        timeElapsedInSeconds: gameData.timeElapsedInSeconds,
        ageGroup: gameData.ageGroup,
        tournamentLevel: gameData.tournamentLevel,
        tournamentSeriesId: gameData.tournamentSeriesId,
        wentToOvertime: gameData.wentToOvertime,
        wentToPenalties: gameData.wentToPenalties,
      };
      dispatchGameSession({ type: 'LOAD_PERSISTED_GAME_DATA', payload });
    } else {
      dispatchGameSession({ type: 'RESET_TO_INITIAL_STATE', payload: initialGameSessionData });
      setIsPlayed(true);
    }

    // Update non-reducer states (these will eventually be migrated or handled differently)
    // For fields not yet in gameSessionState but are in GameData, update their local states if needed.
    // This part will shrink as more state moves to the reducer.
    // Don't apply position-based goalie detection when loading saved games.
    // Position-based detection is for: (1) formation picker, (2) player movement.
    // Saved games already have correct isGoalie status stored - preserve it.
    const loadedPlayers = gameData?.playersOnField || (isInitialDefaultLoad ? initialState.playersOnField : []);
    logger.info('[LOAD GAME STATE] Setting playersOnField', {
      loadedPlayersCount: loadedPlayers.length,
      isInitialDefaultLoad,
      gameDataPlayersOnFieldCount: gameData?.playersOnField?.length ?? 'undefined',
      playerIds: loadedPlayers.slice(0, 5).map(p => p.id?.slice(0, 8)),
    });
    setPlayersOnField(loadedPlayers);
    setOpponents(gameData?.opponents || (isInitialDefaultLoad ? initialState.opponents : []));
    setDrawings(gameData?.drawings || (isInitialDefaultLoad ? initialState.drawings : []));
    setTacticalDiscs(gameData?.tacticalDiscs || (isInitialDefaultLoad ? initialState.tacticalDiscs : []));
    setTacticalDrawings(gameData?.tacticalDrawings || (isInitialDefaultLoad ? initialState.tacticalDrawings : []));
    setTacticalBallPosition(gameData?.tacticalBallPosition || { relX: 0.5, relY: 0.5 });
    setFormationSnapPoints(gameData?.formationSnapPoints || []);

    // Regenerate subSlots from persisted formationSnapPoints for sideline visuals
    // subSlots are not persisted, but can be reconstructed from field positions
    // Works for both soccer and futsal - generateSubSlots is sport-agnostic
    const snapPoints = gameData?.formationSnapPoints || [];
    if (snapPoints.length > 0) {
      // Extract field positions only (exclude GK at relY > 0.9 and sideline at relX > 0.95)
      const fieldPositions = snapPoints.filter(p =>
        p.relY <= 0.9 && p.relX > 0.05 && p.relX < 0.95
      );
      if (fieldPositions.length > 0) {
        const newSubSlots = generateSubSlots(fieldPositions);
        setSubSlots(newSubSlots);
      } else {
        setSubSlots([]);
      }
    } else {
      setSubSlots([]);
    }

    setIsPlayed(gameData?.isPlayed === false ? false : true);

    // Load per-game availablePlayers (with per-game goalie status)
    // Prioritize saved game data, fall back to master roster for new games
    setAvailablePlayers(gameData?.availablePlayers || gameDataManagement.masterRoster || availablePlayers);
    
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
      leagueId: gameData?.leagueId ?? initialGameSessionData.leagueId,
      customLeagueName: gameData?.customLeagueName ?? initialGameSessionData.customLeagueName,
      gameType: gameData?.gameType ?? initialGameSessionData.gameType,
      gender: gameData?.gender ?? initialGameSessionData.gender,
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
      formationSnapPoints: gameData?.formationSnapPoints || [],
      availablePlayers: gameData?.availablePlayers || gameDataManagement.masterRoster || availablePlayers,
    };
    resetHistory(newHistoryState);
    logger.log('[LOAD GAME STATE] Finished dispatching. Reducer will update gameSessionState.');
  }, [
    // Stable setters (React guarantees stability)
    setOrphanedGameInfo, dispatchGameSession, setIsPlayed, setAvailablePlayers, resetHistory,
    // Extracted stable setters from fieldCoordination
    setPlayersOnField, setOpponents, setDrawings, setTacticalDiscs,
    setTacticalDrawings, setTacticalBallPosition, setFormationSnapPoints, setSubSlots,
    // Stable data from hooks (initialGameSessionData from useGameSessionCoordination)
    initialGameSessionData,
    // Data dependencies (used as fallbacks - changes trigger callback recreation)
    // Note: initialState is a function parameter (outer scope), not a dep
    availablePlayers, gameDataManagement.masterRoster,
  ]);

  // --- Effect to load game state when currentGameId changes or savedGames updates ---
  useEffect(() => {
    const loadGame = async () => {
      logger.log('[EFFECT game load] currentGameId or savedGames changed:', { currentGameId, loadedGameId: loadedGameIdRef.current });
      if (!initialLoadComplete) {
        logger.log('[EFFECT game load] Initial load not complete, skipping game state application.');
        return;
      }

      if (currentGameId && currentGameId !== DEFAULT_GAME_ID) {
        // Skip if we've already loaded this game (prevents timer reset on auto-save)
        if (loadedGameIdRef.current === currentGameId) {
          logger.log('[EFFECT game load] Game already loaded, skipping to prevent state clobbering (e.g., timer reset)');
          return;
        }

        const gameToLoad = savedGames[currentGameId] as AppState | undefined;
        if (!gameToLoad) {
          logger.warn('[EFFECT game load] Saved game not yet available for currentGameId, skipping to avoid clobbering with defaults', { currentGameId });
          return;
        }
        logger.log(`[EFFECT game load] Found game data for ${currentGameId}`);
        logger.info('[EFFECT game load] Game data details', {
          gameId: currentGameId?.slice(0, 20),
          playersOnFieldCount: gameToLoad.playersOnField?.length ?? 0,
          selectedPlayerIdsCount: gameToLoad.selectedPlayerIds?.length ?? 0,
          availablePlayersCount: gameToLoad.availablePlayers?.length ?? 0,
          hasPlayersOnField: (gameToLoad.playersOnField?.length ?? 0) > 0,
        });

        // DEFENSIVE: If game has no players on field, explicitly clear the field first
        // This ensures players from previous game don't persist due to state update timing
        if (!gameToLoad.playersOnField || gameToLoad.playersOnField.length === 0) {
          logger.info('[EFFECT game load] Game has empty playersOnField - clearing field explicitly');
          setPlayersOnField([]);
        }

        await loadGameStateFromData(gameToLoad);
        loadedGameIdRef.current = currentGameId; // Mark as loaded
        return;
      }

      // Default game or no game - reset the loaded game tracker
      loadedGameIdRef.current = null;
      logger.log('[EFFECT game load] No specific game to load or ID is default. Skipping default load to avoid overwriting state.');
    };

    loadGame();
  // loadGameStateFromData is now properly memoized with useCallback.
  // The loadedGameIdRef guard prevents duplicate loads for the same game.
  // setPlayersOnField is a stable React setter used for defensive field clearing.
  }, [currentGameId, initialLoadComplete, savedGames, loadGameStateFromData, setPlayersOnField]);

  // Effect to prompt for setup if default game ID is loaded
  useEffect(() => {
    logger.log('[Modal Trigger Effect] Running. initialLoadComplete:', initialLoadComplete, 'hasSkipped:', hasSkippedInitialSetup);
    // Only run the check *after* initial load is fully complete and setup hasn't been skipped
    if (initialLoadComplete && !hasSkippedInitialSetup) {
      // Check currentGameId *inside* the effect body
      if (currentGameId === DEFAULT_GAME_ID) {
        logger.log('Default game ID loaded, prompting for setup...');
        setPlayerIdsForNewGame(gameSessionState.selectedPlayerIds);
        if (!isNewGameSetupModalOpen) {
          openNewGameViaReducer();
        }
      } else {
        logger.log('Not prompting: Specific game loaded.');
    }
    }
  }, [
    initialLoadComplete,
    hasSkippedInitialSetup,
    currentGameId,
    openNewGameViaReducer,
    gameSessionState.selectedPlayerIds,
    isNewGameSetupModalOpen,
    setPlayerIdsForNewGame,
  ]);

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

  // Handler to update an existing game event
  const handleUpdateGameEvent = (updatedEvent: GameEvent) => {
    const cleanUpdatedEvent: GameEvent = { id: updatedEvent.id, type: updatedEvent.type, time: updatedEvent.time, scorerId: updatedEvent.scorerId, assisterId: updatedEvent.assisterId }; // Keep cleaning
    
    dispatchGameSession({ type: 'UPDATE_GAME_EVENT', payload: cleanUpdatedEvent });
    
    logger.log("Updated game event via dispatch:", updatedEvent.id);
  };

  // Session coordination handlers
  const handleOpponentNameChange = sessionCoordination.handlers.setOpponentName;
  const handleGameDateChange = sessionCoordination.handlers.setGameDate;
  const handleGameNotesChange = sessionCoordination.handlers.setGameNotes;

  // --- Handlers for Game Structure ---
  const handleSetNumberOfPeriods = sessionCoordination.handlers.setNumberOfPeriods;
  const handleSetPeriodDuration = sessionCoordination.handlers.setPeriodDuration;

  const handleToggleTrainingResources = () => {
    setIsTrainingResourcesOpen(!isTrainingResourcesOpen);
  };

  const handleToggleRulesDirectory = () => {
    setIsRulesDirectoryOpen(!isRulesDirectoryOpen);
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

      // Clear storage completely (hard reset clears all user data)
      await utilResetAppSettings();

      logger.log("Hard reset complete, reloading app...");

      // Note: In development mode, Next.js HMR may show harmless module errors
      // after reload. These are cosmetic and don't affect functionality.
      // Production builds don't have this issue.
      window.location.reload();
    } catch (error) {
      logger.error("Error during hard reset:", error);
      setIsResetting(false); // Re-enable UI on error
      showToast(t('page.failedResetAppData', 'Failed to reset application data.'), 'error');
    } finally {
      setShowHardResetConfirm(false);
    }
  }, [showToast, t]);

  // Handler for Re-sync from Cloud (cloud mode)
  // Clears local data and migration flag - on reload, migration wizard will reimport from cloud
  const handleResyncFromCloud = useCallback(async () => {
    if (!userId) {
      showToast(t('page.noUserForResync', 'No user logged in'), 'error');
      return;
    }

    try {
      logger.log('[handleResyncFromCloud] Starting re-sync...');
      setIsResetting(true);

      // Clear user's local IndexedDB data and migration flag
      await utilResetUserAppSettings(userId, { clearMigrationFlag: true });

      logger.log('[handleResyncFromCloud] Local data cleared, reloading...');
      window.location.reload();
    } catch (error) {
      logger.error('[handleResyncFromCloud] Failed:', error);
      setIsResetting(false);
      showToast(t('page.resyncFailed', 'Failed to re-sync. Please try again.'), 'error');
    }
  }, [userId, showToast, t]);

  // Handler for Factory Reset (cloud mode - clears local + cloud)
  // Clears both local and cloud data, sets migration flag as complete (both are empty)
  const handleFactoryReset = useCallback(async () => {
    if (!userId) {
      showToast(t('page.noUserForFactoryReset', 'No user logged in'), 'error');
      return;
    }

    try {
      logger.log('[handleFactoryReset] Starting factory reset...');
      setIsResetting(true);

      // 1. Clear all data (cloud + local) via SyncedDataStore
      // SyncedDataStore.clearAllUserData() always clears local, even if cloud
      // clear fails (e.g., AbortError on Chrome Mobile). If cloud fails, it
      // re-throws after local is cleared, which we catch here.
      let cloudClearFailed = false;
      try {
        const dataStore = await getDataStore(userId);
        await dataStore.clearAllUserData();
        logger.log('[handleFactoryReset] Cloud and local data cleared');
      } catch (clearError) {
        // Local data is always cleared by SyncedDataStore, but cloud may have failed.
        // Log and continue — the user's primary intent is to reset local state.
        // Cloud data can be cleaned up on next attempt or via account deletion.
        logger.warn('[handleFactoryReset] Data clear partial failure (local cleared, cloud may have failed):', clearError);
        cloudClearFailed = true;
      }

      // 2. Close the storage adapter to ensure clean state
      await utilResetUserAppSettings(userId, { clearMigrationFlag: false });

      // 3. Set migration flag to skip cloud check (both local and cloud are empty now)
      setMigrationCompleted(userId);

      logger.log('[handleFactoryReset] Factory reset complete, reloading...');

      if (cloudClearFailed) {
        // Brief toast before reload so user knows cloud data may remain
        showToast(
          t('page.factoryResetPartial', 'Local data cleared. Cloud data may not have been fully removed — try again if needed.'),
          'error'
        );
        // Small delay so toast is visible before reload
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      window.location.reload();
    } catch (error) {
      // Only reaches here if getDataStore, utilResetUserAppSettings, or setMigrationCompleted fails
      logger.error('[handleFactoryReset] Failed:', error);
      setIsResetting(false);
      showToast(t('page.factoryResetFailed', 'Failed to reset. Please try again.'), 'error');
    }
  }, [userId, showToast, t]);



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
      showToast(t('page.gameDataNotFound', { gameId, defaultValue: `Error: Could not find game data for ${gameId}` }), 'error');
      return;
    }
    exportJson(gameId, gameData, gameDataManagement.seasons, gameDataManagement.tournaments);
  };

  const handleExportOneExcel = async (gameId: string) => {
    const gameData = savedGames[gameId];
    if (!gameData) {
      showToast(t('page.gameDataNotFound', { gameId, defaultValue: `Error: Could not find game data for ${gameId}` }), 'error');
      return;
    }
    try {
      // Dynamic import: xlsx (~7.8MB) is only loaded when user actually exports
      const { exportCurrentGameExcel } = await import('@/utils/exportExcel');
      // Wrap t() to match TranslationFn signature
      const translate = (key: string, defaultValue?: string) => t(key, defaultValue ?? key);
      exportCurrentGameExcel(gameId, gameData, availablePlayers, gameDataManagement.seasons, gameDataManagement.tournaments, translate);
    } catch (error) {
      logger.error('[handleExportOneExcel] Export failed:', error);
      showToast(t('export.exportGameFailed'), 'error');
    }
  };

  const openRosterModal = () => {
    openRosterViaReducer();
    setHighlightRosterButton(false);
  };

  const openPlayerAssessmentModal = () => setIsPlayerAssessmentModalOpen(true);

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

  // --- Roster Management Handlers for RosterSettingsModal ---
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

      // Save the updated state - fetch FRESH state from storage to avoid stale data
      //
      // WHY FRESH FETCH: React state could be stale if the game was modified elsewhere
      // (e.g., another save operation completed, or React Query invalidation hasn't propagated).
      // Fetching fresh ensures we don't overwrite fields like assessments, isPlayed, etc.
      //
      // WHITELIST APPROACH: Explicitly list fields from each source to prevent stale data.
      // 1. freshGameState - fresh from storage (preserves assessments, isPlayed, etc.)
      // 2. Reducer-authoritative fields - timer, score, status, metadata from gameSessionState
      // 3. Field coordination - player positions, tactical elements
      if (currentGameId) {
        const freshGameState = await utilGetGame(currentGameId, userId);

        if (!freshGameState) {
          logger.warn(`[handleToggleGoalieForModal] Cannot save - game ${currentGameId} not found in storage`);
          return;
        }

        await utilSaveGame(currentGameId, {
          // Base: fresh from storage, preserves fields not managed elsewhere
          ...freshGameState,
          // Reducer-authoritative: game metadata
          teamName: gameSessionState.teamName,
          opponentName: gameSessionState.opponentName,
          gameDate: gameSessionState.gameDate,
          gameNotes: gameSessionState.gameNotes,
          homeOrAway: gameSessionState.homeOrAway,
          seasonId: gameSessionState.seasonId,
          tournamentId: gameSessionState.tournamentId,
          leagueId: gameSessionState.leagueId,
          customLeagueName: gameSessionState.customLeagueName,
          teamId: gameSessionState.teamId,
          gameType: gameSessionState.gameType,
          gender: gameSessionState.gender,
          ageGroup: gameSessionState.ageGroup,
          tournamentLevel: gameSessionState.tournamentLevel,
          tournamentSeriesId: gameSessionState.tournamentSeriesId,
          gameLocation: gameSessionState.gameLocation,
          gameTime: gameSessionState.gameTime,
          demandFactor: gameSessionState.demandFactor,
          gamePersonnel: gameSessionState.gamePersonnel,
          selectedPlayerIds: gameSessionState.selectedPlayerIds,
          showPlayerNames: gameSessionState.showPlayerNames,
          // Reducer-authoritative: game progress
          homeScore: gameSessionState.homeScore,
          awayScore: gameSessionState.awayScore,
          currentPeriod: gameSessionState.currentPeriod,
          gameStatus: gameSessionState.gameStatus,
          numberOfPeriods: gameSessionState.numberOfPeriods,
          periodDurationMinutes: gameSessionState.periodDurationMinutes,
          gameEvents: gameSessionState.gameEvents,
          // Reducer-authoritative: timer/substitution state (only persisted fields)
          // Note: nextSubDueTimeSeconds and subAlertLevel are runtime-only (not in AppState)
          subIntervalMinutes: gameSessionState.subIntervalMinutes,
          lastSubConfirmationTimeSeconds: gameSessionState.lastSubConfirmationTimeSeconds,
          completedIntervalDurations: gameSessionState.completedIntervalDurations,
          // Field coordination: player arrays and tactical elements
          availablePlayers: updatedAvailablePlayers,
          playersOnField: updatedFieldPlayers,
          opponents: fieldCoordination.opponents,
          drawings: fieldCoordination.drawings,
          tacticalDiscs: fieldCoordination.tacticalDiscs,
          tacticalDrawings: fieldCoordination.tacticalDrawings,
          tacticalBallPosition: fieldCoordination.tacticalBallPosition,
        }, userId);

        // Invalidate React Query cache to update LoadGameModal
        queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });
      }

      logger.log(`[Page.tsx] per-game goalie toggle success for ${playerId}.`);
    } catch (error) {
      logger.error(`[Page.tsx] Exception during per-game goalie toggle of ${playerId}:`, error);
    }
  }, [
    // Data dependencies (values that change the function's behavior)
    availablePlayers, currentGameId, gameSessionState, t, userId,
    // Setter dependencies (React guarantees these are stable but ESLint requires them)
    setAvailablePlayers, setRosterError, queryClient,
    // fieldCoordination provides playersOnField and setPlayersOnField
    fieldCoordination,
  ]);

  // --- END Roster Management Handlers ---

  // --- NEW: Handler to Award Fair Play Card ---
  const handleAwardFairPlayCard = useCallback(async (playerId: string | null) => {
    if (!currentGameId || currentGameId === DEFAULT_GAME_ID) {
      logger.warn("Cannot award fair play card in unsaved/default state.");
      return;
    }

    let updatedAvailablePlayers = availablePlayers;
    let updatedPlayersOnField = fieldCoordination.playersOnField;

    const currentlyAwardedPlayerId = availablePlayers.find(p => p.receivedFairPlayCard)?.id;

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
      updatedAvailablePlayers = updatedAvailablePlayers.map(p =>
        p.id === playerId ? { ...p, receivedFairPlayCard: true } : p
      );
      updatedPlayersOnField = updatedPlayersOnField.map(p =>
        p.id === playerId ? { ...p, receivedFairPlayCard: true } : p
      );
    }

    setAvailablePlayers(updatedAvailablePlayers);
    fieldCoordination.setPlayersOnField(updatedPlayersOnField);

    // Persist fair play card changes to master roster via DataStore
    // Uses individual player updates rather than replacing entire roster
    try {
      // Clear previous holder (if different from new recipient)
      if (currentlyAwardedPlayerId && currentlyAwardedPlayerId !== playerId) {
        await setPlayerFairPlayCardStatus(currentlyAwardedPlayerId, false);
      }
      // Award to new player (or toggle off if same player clicked again)
      if (playerId) {
        const shouldAward = playerId !== currentlyAwardedPlayerId;
        await setPlayerFairPlayCardStatus(playerId, shouldAward);
      }
    } catch (error) {
      logger.error('[handleAwardFairPlayCard] Error updating fair play card status:', error);
    }

    saveStateToHistory({ playersOnField: updatedPlayersOnField, availablePlayers: updatedAvailablePlayers });
    logger.log(`[page.tsx] Updated Fair Play card award. ${playerId ? `Awarded to ${playerId}` : 'Cleared'}`);
  }, [availablePlayers, saveStateToHistory, currentGameId, setAvailablePlayers, fieldCoordination]);


  const handleUpdateSelectedPlayers = (playerIds: string[]) => {
    dispatchGameSession({ type: 'SET_SELECTED_PLAYER_IDS', payload: playerIds });
  };

  // Deterministic init fallback: auto-select latest real game if default or stale
  useEffect(() => {
    if (!initialLoadComplete) return;
    const ids = Object.keys(savedGames || {}).filter(id => id !== DEFAULT_GAME_ID);
    const isStale = !currentGameId || currentGameId === DEFAULT_GAME_ID || !savedGames[currentGameId];
    if (isStale && ids.length > 0) {
      const latestId = getLatestGameId(savedGames);
      if (latestId) {
        logger.log('[Init Fallback] Selecting latest game as current', { latestId });
        setCurrentGameId(latestId);
        utilSaveCurrentGameIdSetting(latestId, userId).catch((error) => {
          logger.warn('[Init Fallback] Failed to persist current game ID (non-critical)', { latestId, error });
        });
      }
    }
  }, [initialLoadComplete, currentGameId, savedGames, userId]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in controlBarProps
  const handleOpenGameSettingsModal = () => {
    setIsGameSettingsModalOpen(true);
  };

  // Handlers for GameSettingsModal (delegate to session coordination)
  const handleGameLocationChange = sessionCoordination.handlers.setGameLocation;
  const handleGameTimeChange = sessionCoordination.handlers.setGameTime;
  const handleAgeGroupChange = sessionCoordination.handlers.setAgeGroup;
  const handleTournamentLevelChange = sessionCoordination.handlers.setTournamentLevel;
  const handleTournamentSeriesIdChange = sessionCoordination.handlers.setTournamentSeriesId;
  const handleTeamIdChange = sessionCoordination.handlers.setTeamId;
  const handleSetDemandFactor = sessionCoordination.handlers.setDemandFactor;
  const handleSetHomeOrAway = sessionCoordination.handlers.setHomeOrAway;
  const handleSetSeasonId = sessionCoordination.handlers.setSeasonId;
  const handleSetTournamentId = sessionCoordination.handlers.setTournamentId;
  const handleSetLeagueId = sessionCoordination.handlers.setLeagueId;
  const handleSetCustomLeagueName = sessionCoordination.handlers.setCustomLeagueName;
  const handleSetGameType = sessionCoordination.handlers.setGameType;
  const handleSetGender = sessionCoordination.handlers.setGender;
  const handleSetWentToOvertime = sessionCoordination.handlers.setWentToOvertime;
  const handleSetWentToPenalties = sessionCoordination.handlers.setWentToPenalties;
  const handleSetShowPositionLabels = sessionCoordination.handlers.setShowPositionLabels;
  const handleSetGamePersonnel = sessionCoordination.handlers.setGamePersonnel;

  // --- AGGREGATE EXPORT HANDLERS ---

  const handleExportAggregateExcel = useCallback(async (gameIds: string[], aggregateStats: import('@/types').PlayerStatRow[]) => {
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
      const { exportAggregateExcel } = await import('@/utils/exportExcel');
      // Wrap t() to match TranslationFn signature
      const translate = (key: string, defaultValue?: string) => t(key, defaultValue ?? key);
      exportAggregateExcel(gamesData, aggregateStats, gameDataManagement.seasons, gameDataManagement.tournaments, [], undefined, undefined, translate);
    } catch (error) {
      logger.error('[handleExportAggregateExcel] Export failed:', error);
      showToast(t('export.exportStatsFailed'), 'error');
    }
  }, [savedGames, gameDataManagement.seasons, gameDataManagement.tournaments, t, showToast]);

  const handleExportPlayerExcel = useCallback(async (playerId: string, playerData: import('@/types').PlayerStatRow, gameIds: string[]) => {
    const gamesData = gameIds.reduce((acc, id) => {
      const gameData = savedGames[id];
      if (gameData) {
        acc[id] = gameData;
      }
      return acc;
    }, {} as SavedGamesCollection);
    try {
      const [{ exportPlayerExcel }, { getAdjustmentsForPlayer }] = await Promise.all([
        import('@/utils/exportExcel'),
        import('@/utils/playerAdjustments'),
      ]);
      const adjustments = await getAdjustmentsForPlayer(playerId, userId);
      // Wrap t() to match TranslationFn signature
      const translate = (key: string, defaultValue?: string) => t(key, defaultValue ?? key);
      exportPlayerExcel(playerId, playerData, gamesData, gameDataManagement.seasons, gameDataManagement.tournaments, adjustments, translate);
    } catch (error) {
      logger.error('[handleExportPlayerExcel] Export failed:', error);
      showToast(t('export.exportPlayerFailed'), 'error');
    }
  }, [savedGames, gameDataManagement.seasons, gameDataManagement.tournaments, t, showToast, userId]);

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
    tournamentSeriesId: string | null,
    isPlayedParam: boolean,
    teamId: string | null,
    availablePlayersForGame: Player[],
    selectedPersonnelIds: string[],
    leagueId: string,
    customLeagueName: string,
    gameType: import('@/types').GameType,
    gender: import('@/types').Gender | undefined
  ) => {
    // Clear field state before creating new game to prevent stale data
    logger.info('[NEW GAME] Clearing field state BEFORE game creation', {
      previousPlayersOnFieldCount: fieldCoordination.playersOnField.length,
      newGameTeamId: teamId,
      newGameSelectedPlayersCount: initialSelectedPlayerIds.length,
    });
    fieldCoordination.setPlayersOnField([]);
    fieldCoordination.setOpponents([]);
    fieldCoordination.setDrawings([]);
    fieldCoordination.setTacticalDiscs([]);
    fieldCoordination.setTacticalDrawings([]);
    // DO NOT reset loadedGameIdRef.current = null here!
    // When savedGames changes (new game added), the effect fires while currentGameId
    // is still the OLD game. If loadedGameIdRef.current is null, the effect will
    // load the old game's players onto the field.
    // By keeping loadedGameIdRef.current as the old game ID, the effect will skip
    // loading (oldId === oldId), and only load when currentGameId changes to newGameId.

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
        canCreate,
        showUpgradePrompt,
        userId,
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
        tournamentSeriesId,
        isPlayed: isPlayedParam,
        teamId,
        availablePlayersForGame,
        selectedPersonnelIds,
        leagueId,
        customLeagueName,
        gameType,
        gender,
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
    fieldCoordination,
    canCreate,
    showUpgradePrompt,
    userId,
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

    // Only prompt to save for unsaved scratch games (DEFAULT_GAME_ID)
    // Saved games are auto-saved, so no prompt needed
    if (currentGameId === DEFAULT_GAME_ID) {
      setGameIdentifierForSave(t('controlBar.unsavedGame', 'Unsaved game'));
      setShowSaveBeforeNewConfirm(true);
    } else {
      // For saved games (auto-saved), go directly to new game setup modal
      setPlayerIdsForNewGame(gameSessionState.selectedPlayerIds); // Prefill with last game's selection
      openNewGameViaReducer();
    }
  }, [currentGameId, availablePlayers, t, openNewGameViaReducer, gameSessionState.selectedPlayerIds]);

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
    setPlayerIdsForNewGame(gameSessionState.selectedPlayerIds);
    setShowStartNewConfirm(false);
    openNewGameViaReducer(); // Open the setup modal
  }, [openNewGameViaReducer, gameSessionState.selectedPlayerIds]);

  if (debug.enabled('home')) {
    logger.log('[Home Render] highlightRosterButton:', highlightRosterButton);
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

  // Memoize fieldInteractions with explicit handler dependencies.
  // All handlers are useCallback-wrapped in useFieldCoordination, so they're stable.
  // Using explicit deps instead of [fieldCoordination] (which is a new object every render).
  const fieldInteractions = useMemo<FieldInteractions>(() => ({
    players: {
      move: fieldCoordination.handlePlayerMove,
      moveEnd: fieldCoordination.handlePlayerMoveEnd,
      remove: fieldCoordination.handlePlayerRemove,
      drop: fieldCoordination.handleDropOnField,
      swap: fieldCoordination.handlePlayersSwap,
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
      discMoveEnd: fieldCoordination.handleTacticalDiscMoveEnd,
      discRemove: fieldCoordination.handleTacticalDiscRemove,
      discToggleType: fieldCoordination.handleToggleTacticalDiscType,
      ballMove: fieldCoordination.handleTacticalBallMove,
      ballMoveEnd: fieldCoordination.handleTacticalBallMoveEnd,
    },
    touch: {
      playerDrop: fieldCoordination.handlePlayerDropViaTouch,
      playerDragCancel: fieldCoordination.handlePlayerDragCancelViaTouch,
    },
  }), [
    // Player handlers
    fieldCoordination.handlePlayerMove,
    fieldCoordination.handlePlayerMoveEnd,
    fieldCoordination.handlePlayerRemove,
    fieldCoordination.handleDropOnField,
    fieldCoordination.handlePlayersSwap,
    // Opponent handlers
    fieldCoordination.handleOpponentMove,
    fieldCoordination.handleOpponentMoveEnd,
    fieldCoordination.handleOpponentRemove,
    // Drawing handlers
    fieldCoordination.handleDrawingStart,
    fieldCoordination.handleDrawingAddPoint,
    fieldCoordination.handleDrawingEnd,
    // Tactical handlers
    fieldCoordination.handleTacticalDrawingStart,
    fieldCoordination.handleTacticalDrawingAddPoint,
    fieldCoordination.handleTacticalDrawingEnd,
    fieldCoordination.handleTacticalDiscMove,
    fieldCoordination.handleTacticalDiscMoveEnd,
    fieldCoordination.handleTacticalDiscRemove,
    fieldCoordination.handleToggleTacticalDiscType,
    fieldCoordination.handleTacticalBallMove,
    fieldCoordination.handleTacticalBallMoveEnd,
    // Touch handlers
    fieldCoordination.handlePlayerDropViaTouch,
    fieldCoordination.handlePlayerDragCancelViaTouch,
  ]);

  // timerInteractions now provided by useTimerManagement (Step 2.6.5)

  // Memoize fieldVM to prevent unnecessary re-renders of SoccerField
  const fieldVM = useMemo(() => ({
    playersOnField: fieldCoordination.playersOnField,
    opponents: fieldCoordination.opponents,
    drawings: fieldCoordination.drawings,
    isTacticsBoardView: fieldCoordination.isTacticsBoardView,
    tacticalDrawings: fieldCoordination.tacticalDrawings,
    tacticalDiscs: fieldCoordination.tacticalDiscs,
    tacticalBallPosition: fieldCoordination.tacticalBallPosition,
    draggingPlayerFromBarInfo: fieldCoordination.draggingPlayerFromBarInfo,
    isDrawingEnabled: fieldCoordination.isDrawingEnabled,
    formationSnapPoints: fieldCoordination.formationSnapPoints,
    subSlots: fieldCoordination.subSlots,
  }), [
    fieldCoordination.playersOnField,
    fieldCoordination.opponents,
    fieldCoordination.drawings,
    fieldCoordination.isTacticsBoardView,
    fieldCoordination.tacticalDrawings,
    fieldCoordination.tacticalDiscs,
    fieldCoordination.tacticalBallPosition,
    fieldCoordination.draggingPlayerFromBarInfo,
    fieldCoordination.isDrawingEnabled,
    fieldCoordination.formationSnapPoints,
    fieldCoordination.subSlots,
  ]);

  // Memoize timerVM to prevent unnecessary re-renders of TimerOverlay
  const timerVM = useMemo(() => ({
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,
    showLargeTimerOverlay,
    initialLoadComplete,
  }), [
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,
    showLargeTimerOverlay,
    initialLoadComplete,
  ]);

  const fieldContainerProps: FieldContainerProps = {
    gameSessionState,
    fieldVM,
    timerVM,
    currentGameId,
    availablePlayers,
    teams: gameDataManagement.teams,
    seasons: gameDataManagement.seasons,
    tournaments: gameDataManagement.tournaments,
    orphanedGameInfo,
    onOpenNewGameSetup: reducerDrivenModals.newGameSetup.open,
    onOpenRosterModal: reducerDrivenModals.roster.open,
    onOpenSeasonTournamentModal: reducerDrivenModals.seasonTournament.open,
    onOpenTeamManagerModal: () => setIsTeamManagerOpen(true),
    onOpenTeamReassignModal: () => setIsTeamReassignModalOpen(true),
    onOpenRulesModal: handleToggleRulesDirectory,
    onTeamNameChange: handleTeamNameChange,
    onOpponentNameChange: handleOpponentNameChange,
    onTogglePositionLabels: handleSetShowPositionLabels,
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
    selectedPlayerCount: gameSessionState.selectedPlayerIds.length,
    isTacticsBoardView: fieldCoordination.isTacticsBoardView,
    onToggleTacticsBoard: fieldCoordination.handleToggleTacticsBoard,
    onAddHomeDisc: () => fieldCoordination.handleAddTacticalDisc('home'),
    onAddOpponentDisc: () => fieldCoordination.handleAddTacticalDisc('opponent'),
    isDrawingEnabled: fieldCoordination.isDrawingEnabled,
    onToggleDrawingMode: fieldCoordination.handleToggleDrawingMode,
    onToggleTrainingResources: handleToggleTrainingResources,
    onToggleRulesDirectory: handleToggleRulesDirectory,
    onToggleGameStatsModal: () => setIsGameStatsModalOpen(prev => !prev),
    onOpenLoadGameModal: openLoadGameViaReducer,
    onStartNewGame: handleStartNewGame,
    onOpenRosterModal: openRosterModal,
    onQuickSave: persistence.handleQuickSaveGame,
    onOpenGameSettingsModal: () => setIsGameSettingsModalOpen(true),
    isGameLoaded: Boolean(currentGameId && currentGameId !== DEFAULT_GAME_ID),
    onOpenSeasonTournamentModal: openSeasonTournamentViaReducer,
    onToggleInstructionsModal: () => setIsInstructionsModalOpen(prev => !prev),
    onOpenSettingsModal: () => setIsSettingsModalOpen(true),
    onOpenPlayerAssessmentModal: openPlayerAssessmentModal,
    onOpenTeamManagerModal: () => setIsTeamManagerOpen(true),
    onOpenPersonnelManager: () => setIsPersonnelManagerOpen(true),
    onGoToStartScreen,
    onSignOut: signOut,
    isCloudMode: authMode === 'cloud',
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

  // --- Modal Orchestration Hook (Step 2.6.6 - FINAL, Step 2.8 - Grouped interface) ---
  const modalOrchestration = useModalOrchestration({
    // 4 grouped objects instead of 76 flat params
    hooks: {
      gameDataManagement,
      fieldCoordination,
      persistence,
      timerManagement,
    },
    session: {
      gameSessionState,
      dispatchGameSession,
    },
    ui: {
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
    },
    handlers: {
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
      handleTournamentSeriesIdChange,
      handleTeamIdChange,
      handleAwardFairPlayCard,
      handleSetNumberOfPeriods,
      handleSetPeriodDuration,
      handleSetDemandFactor,
      handleSetSeasonId,
      handleSetTournamentId,
      handleSetLeagueId,
      handleSetCustomLeagueName,
      handleSetGameType,
      handleSetGender,
      handleSetWentToOvertime,
      handleSetWentToPenalties,
      handleSetHomeOrAway,
      handleUpdateSelectedPlayers,
      handleSetGamePersonnel,
      handleShowAppGuide,
      handleHardResetApp,
      handleResyncFromCloud,
      handleFactoryReset,
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
    },
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

  // Instructions modal is now only opened explicitly from menu - no auto-open logic

  return {
    gameContainerProps,
    modalManagerProps,
    isBootstrapping,
    isResetting,
  };
}
