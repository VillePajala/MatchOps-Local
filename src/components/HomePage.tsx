'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameContainer } from '@/components/HomePage/containers/GameContainer';
import { ModalManager } from '@/components/HomePage/containers/ModalManager';
import { useAutoSave } from '@/hooks/useAutoSave';
import { saveGame as utilSaveGame, createGame, getSavedGames as utilGetSavedGames, removeGameEvent } from '@/utils/savedGames';
import {
  saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting,
  resetAppSettings as utilResetAppSettings,
  getHasSeenAppGuide,
  saveHasSeenAppGuide,
} from '@/utils/appSettings';
import { deleteSeason as utilDeleteSeason, updateSeason as utilUpdateSeason, addSeason as utilAddSeason } from '@/utils/seasons';
import { deleteTournament as utilDeleteTournament, updateTournament as utilUpdateTournament, addTournament as utilAddTournament } from '@/utils/tournaments';
// Import Player from types directory
import { Player, Season, Tournament } from '@/types';
// Import saveMasterRoster utility
import type { GameEvent, AppState, SavedGamesCollection, TimerState, PlayerAssessment } from "@/types";
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import { getLocalISODate } from '@/utils/time';
import { saveMasterRoster } from '@/utils/masterRoster';
import { useMutation } from '@tanstack/react-query';
import { usePersonnelManager } from '@/hooks/usePersonnelManager';
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
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import { useHomeModalControls } from './HomePage/hooks/useHomeModalControls';
import { useNewGameFlow } from './HomePage/hooks/useNewGameFlow';
import { useSavedGameManager } from './HomePage/hooks/useSavedGameManager';
import { useGameOrchestration } from './HomePage/hooks/useGameOrchestration';
import type { FieldContainerProps } from './HomePage/containers/FieldContainer';


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
  gameDate: getLocalISODate(), // Default to today's local date YYYY-MM-DD
  homeScore: 0,
  awayScore: 0,
  gameNotes: '', // Initialize game notes as empty string
  homeOrAway: 'home', // <<< Step 1: Initialize field
  // Initialize game structure
  numberOfPeriods: 2,
  periodDurationMinutes: 10, // Default to 10 minutes
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

interface HomePageProps {
  initialAction?: 'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'season' | 'stats' | 'roster' | 'teams' | 'settings';
  skipInitialSetup?: boolean;
  onDataImportSuccess?: () => void;
  isFirstTimeUser?: boolean;
}

function HomePage({ initialAction, skipInitialSetup = false, onDataImportSuccess, isFirstTimeUser = false }: HomePageProps) {
  // Sync hasSkippedInitialSetup with prop to prevent flash
  const [hasSkippedInitialSetup, setHasSkippedInitialSetup] = useState<boolean>(skipInitialSetup);

  const {
    gameSessionState,
    dispatchGameSession,
    saveStateToHistory,
    resetHistory,
    undoHistory,
    redoHistory,
    canUndo,
    canRedo,
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
    availablePlayers,
    setAvailablePlayers,
    setHighlightRosterButton,
    isRosterUpdating,
    setRosterError,
    rosterError,
    playersForCurrentGame,
    handleAddPlayer,
    handleUpdatePlayer,
    handleRemovePlayer,
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
    playerAssessments,
    saveAssessment,
    deleteAssessment,
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,
    handleStartPauseTimer,
    handleResetTimer,
    handleSubstitutionMade,
    handleSetSubInterval,
    masterRosterQueryResultData,
    seasonsQueryResultData,
    tournamentsQueryResultData,
    allSavedGamesQueryResultData,
    currentGameIdSettingQueryResultData,
    isGameDataLoading,
    gameDataError,
    teams,
    savedGames,
    setSavedGames,
    currentGameId,
    setCurrentGameId,
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
    queryClient,
    t,
  } = useGameOrchestration({ initialAction, skipInitialSetup, isFirstTimeUser });

 
  
  // Personnel management with consolidated hook
  const personnelManager = usePersonnelManager();

  const isMasterRosterQueryLoading = isGameDataLoading;
  const areSeasonsQueryLoading = isGameDataLoading;
  const areTournamentsQueryLoading = isGameDataLoading;
  const isAllSavedGamesQueryLoading = isGameDataLoading;
  const isCurrentGameIdSettingQueryLoading = isGameDataLoading;

  const isMasterRosterQueryError = !!gameDataError;
  const isSeasonsQueryError = !!gameDataError;
  const isTournamentsQueryError = !!gameDataError;
  const isAllSavedGamesQueryError = !!gameDataError;
  const isCurrentGameIdSettingQueryError = !!gameDataError;

  const masterRosterQueryErrorData = gameDataError;
  const seasonsQueryErrorData = gameDataError;
  const tournamentsQueryErrorData = gameDataError;
  const allSavedGamesQueryErrorData = gameDataError;
  const currentGameIdSettingQueryErrorData = gameDataError;

  const [draggingPlayerFromBarInfo, setDraggingPlayerFromBarInfo] = useState<Player | null>(null);
  const [isPlayed, setIsPlayed] = useState<boolean>(true);
  const modalContext = useModalContext();
  const { showToast } = useToast();
  // const [isPlayerStatsModalOpen, setIsPlayerStatsModalOpen] = useState(false);
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<Player | null>(null);
  const [isTeamManagerOpen, setIsTeamManagerOpen] = useState<boolean>(false);
  const [isPersonnelManagerOpen, setIsPersonnelManagerOpen] = useState<boolean>(false);

  // --- Timer State (Still needed here) ---
  const [showLargeTimerOverlay, setShowLargeTimerOverlay] = useState<boolean>(false); // State for overlay visibility
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState<boolean>(false);
  const [showFirstGameGuide, setShowFirstGameGuide] = useState<boolean>(false);
  const [firstGameGuideStep, setFirstGameGuideStep] = useState<number>(0);
  // Initialize as true for experienced users to prevent any flash
  const [hasCheckedFirstGameGuide, setHasCheckedFirstGameGuide] = useState<boolean>(!isFirstTimeUser);

  const newGameFlow = useNewGameFlow({
    availablePlayers,
    savedGames,
    setSavedGames,
    currentGameId,
    setIsNewGameSetupModalOpen: modalContext.setIsNewGameSetupModalOpen,
    setIsRosterModalOpen: modalContext.setIsRosterModalOpen,
    setHasSkippedInitialSetup,
    setHighlightRosterButton,
    setIsPlayed,
    resetHistory,
    dispatchGameSession,
    setCurrentGameId,
    queryClient,
    showToast,
    t,
    defaultSubIntervalMinutes: initialState.subIntervalMinutes ?? 5,
  });

  const {
    modalState: {
      isGameSettingsModalOpen,
      isLoadGameModalOpen,
      isRosterModalOpen,
      setIsRosterModalOpen,
      isSeasonTournamentModalOpen,
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
    },
    openLoadGameModal: handleOpenLoadGameModal,
    closeLoadGameModal: handleCloseLoadGameModal,
    openSeasonTournamentModal: handleOpenSeasonTournamentModal,
    closeSeasonTournamentModal: handleCloseSeasonTournamentModal,
    openRosterModal: baseOpenRosterModal,
    closeRosterModal,
    openGameSettingsModal: handleOpenGameSettingsModal,
    closeGameSettingsModal: handleCloseGameSettingsModal,
    openSettingsModal: handleOpenSettingsModal,
    closeSettingsModal: handleCloseSettingsModal,
    openPlayerAssessmentModal: openPlayerAssessmentModalBase,
    closePlayerAssessmentModal: closePlayerAssessmentModalBase,
  } = useHomeModalControls({
    initialAction,
    onRequestNewGameFromShortcut: newGameFlow.handleInitialActionNewGame,
    onOpenTeamManager: () => setIsTeamManagerOpen(true),
    modalContextOverride: modalContext,
  });

  const savedGameManager = useSavedGameManager({
    savedGames,
    setSavedGames,
    currentGameId,
    setCurrentGameId,
    availablePlayers,
    setAvailablePlayers,
    masterRoster: masterRosterQueryResultData,
    setPlayersOnField,
    setOpponents,
    setDrawings,
    setTacticalDiscs,
    setTacticalDrawings,
    setTacticalBallPosition,
    setIsPlayed,
    dispatchGameSession,
    resetHistory,
    initialState,
    initialGameSessionData: initialGameSessionStatePlaceholder,
    queryClient,
    t,
    onCloseLoadGameModal: handleCloseLoadGameModal,
  });

  const {
    playerIdsForNewGame,
    newGameDemandFactor,
    setNewGameDemandFactor,
    showNoPlayersConfirm,
    showSaveBeforeNewConfirm,
    showStartNewConfirm,
    gameIdentifierForSave,
    handleStartNewGame: handleStartNewGameFlow,
    handleNoPlayersConfirmed,
    handleSaveBeforeNewCancelled,
    handleStartNewConfirmed,
    openSetupAfterPreSave,
    handleStartNewGameWithSetup,
    handleCancelNewGameSetup,
    setShowSaveBeforeNewConfirm,
    setShowStartNewConfirm,
    setShowNoPlayersConfirm,
  } = newGameFlow;

  const handleStartNewGame = handleStartNewGameFlow;

  const {
    isLoadingGamesList,
    setIsLoadingGamesList,
    loadGamesListError,
    setLoadGamesListError,
    isGameLoading,
    gameLoadError,
    isGameDeleting,
    gameDeleteError,
    processingGameId,
    orphanedGameInfo,
    isTeamReassignModalOpen,
    setIsTeamReassignModalOpen,
    availableTeams,
    teamLoadError,
    loadGameStateFromData,
    handleLoadGame,
    handleDeleteGame,
    handleTeamReassignment,
  } = savedGameManager;

  const openNewGameSetupModalDirect = useCallback(() => {
    setIsNewGameSetupModalOpen(true);
  }, [setIsNewGameSetupModalOpen]);

  const openTeamReassignModal = useCallback(() => {
    setIsTeamReassignModalOpen(true);
  }, [setIsTeamReassignModalOpen]);

  // --- Modal States handled via context ---

  // <<< ADD State to hold player IDs for the next new game >>>
  // <<< ADD State for the roster prompt toast >>>
  // const [showRosterPrompt, setShowRosterPrompt] = useState<boolean>(false);

  // State for game saving error (loading state is from saveGameMutation.isLoading)

  // NEW: States for LoadGameModal operations
  const [showHardResetConfirm, setShowHardResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false); // For app reset operation

  // --- Mutation for Adding a new Season ---
  const addSeasonMutation = useMutation<
    Season | null,
    Error,
    Partial<Season> & { name: string }
  >({
    mutationFn: async (data) => {
      const { name, ...extra } = data;
      return utilAddSeason(name, extra);
    },
    onSuccess: (newSeason, variables) => {
      if (newSeason) {
        logger.log('[Mutation Success] Season added:', newSeason.name, newSeason.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.seasons });
        // Potentially set an optimistic update or directly update local 'seasons' state if needed
        // For now, relying on query invalidation to refresh the seasons list
      } else {
        // This case might indicate a duplicate name or some other non-exception failure from utilAddSeason
        logger.warn('[Mutation Non-Success] utilAddSeason returned null for season:', variables.name);
        // Consider setting a specific error state for the NewGameSetupModal if it's a common issue
        // alert(t('newGameSetupModal.errors.addSeasonFailed', 'Failed to add season: {seasonName}. It might already exist.', { seasonName: variables.name }));
      }
    },
    onError: (error, variables) => {
      logger.error(`[Mutation Error] Failed to add season ${variables.name}:`, error);
      // alert(t('newGameSetupModal.errors.addSeasonFailedUnexpected', 'An unexpected error occurred while adding season: {seasonName}.', { seasonName: variables.name }));
    },
  });

  const updateSeasonMutation = useMutation<Season | null, Error, Season>({
    mutationFn: async (season) => utilUpdateSeason(season),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seasons });
    },
  });

  const deleteSeasonMutation = useMutation<boolean, Error, string>({
    mutationFn: async (id) => utilDeleteSeason(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seasons });
    },
  });

  const updateTournamentMutation = useMutation<Tournament | null, Error, Tournament>({
      mutationFn: async (tournament) => utilUpdateTournament(tournament),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
      },
  });

  const deleteTournamentMutation = useMutation({
    mutationFn: (id: string) => utilDeleteTournament(id),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
      queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
    },
  });

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
  const hasRunLegacyMigrationRef = useRef(false);
  const initialLoadInProgressRef = useRef(false);

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

  // --- Mutation for Adding a new Tournament ---
  const addTournamentMutation = useMutation<
    Tournament | null,
    Error,
    Partial<Tournament> & { name: string }
  >({
    mutationFn: async (data) => {
      const { name, ...extra } = data;
      return utilAddTournament(name, extra);
    },
    onSuccess: (newTournament, variables) => {
      if (newTournament) {
        logger.log('[Mutation Success] Tournament added:', newTournament.name, newTournament.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
        // Similar to seasons, could optimistically update or rely on invalidation
      } else {
        logger.warn('[Mutation Non-Success] utilAddTournament returned null for tournament:', variables.name);
        // alert(t('newGameSetupModal.errors.addTournamentFailed', 'Failed to add tournament: {tournamentName}. It might already exist.', { tournamentName: variables.name }));
      }
    },
    onError: (error, variables) => {
      logger.error(`[Mutation Error] Failed to add tournament ${variables.name}:`, error);
      // alert(t('newGameSetupModal.errors.addTournamentFailedUnexpected', 'An unexpected error occurred while adding tournament: {tournamentName}.', { tournamentName: variables.name }));
    },
  });
  // Fixed: Sync master roster from React Query to local state
  // Guard: Only update availablePlayers from master roster when NOT in an active game
  // This prevents overwriting per-game goalie selections
  useEffect(() => {
    if (isMasterRosterQueryLoading) {
      logger.log('[TanStack Query] Master Roster is loading...');
      return;
    }

    if (isMasterRosterQueryError) {
      logger.error('[TanStack Query] Error loading master roster:', masterRosterQueryErrorData);
      setAvailablePlayers([]);
      return;
    }

    if (masterRosterQueryResultData && Array.isArray(masterRosterQueryResultData)) {
      // Only update if we're on the default game (not a saved/loaded game)
      // This prevents overwriting per-game goalie status when master roster updates
      if (!currentGameId || currentGameId === DEFAULT_GAME_ID) {
        logger.log('[TanStack Query] Syncing master roster to availablePlayers (default game)');
        setAvailablePlayers(masterRosterQueryResultData);
      } else {
        logger.log('[TanStack Query] Skipping master roster sync (active game with per-game state)');
      }
    }
  }, [masterRosterQueryResultData, isMasterRosterQueryLoading, isMasterRosterQueryError, masterRosterQueryErrorData, setAvailablePlayers, currentGameId]);

  // Fixed: Sync seasons from React Query to local state
  useEffect(() => {
    if (areSeasonsQueryLoading) {
      logger.log('[TanStack Query] Seasons are loading...');
      return;
    }
    
    if (isSeasonsQueryError) {
      logger.error('[TanStack Query] Error loading seasons:', seasonsQueryErrorData);
      setSeasons([]);
      return;
    }
    
    if (seasonsQueryResultData && Array.isArray(seasonsQueryResultData)) {
      setSeasons(seasonsQueryResultData);
    }
  }, [seasonsQueryResultData, areSeasonsQueryLoading, isSeasonsQueryError, seasonsQueryErrorData, setSeasons]);

  // Fixed: Sync tournaments from React Query to local state  
  useEffect(() => {
    if (areTournamentsQueryLoading) {
      logger.log('[TanStack Query] Tournaments are loading...');
      return;
    }
    
    if (isTournamentsQueryError) {
      logger.error('[TanStack Query] Error loading tournaments:', tournamentsQueryErrorData);
      setTournaments([]);
      return;
    }
    
    if (tournamentsQueryResultData && Array.isArray(tournamentsQueryResultData)) {
      setTournaments(tournamentsQueryResultData);
    }
  }, [tournamentsQueryResultData, areTournamentsQueryLoading, isTournamentsQueryError, tournamentsQueryErrorData, setTournaments]);

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
    if (hasRunLegacyMigrationRef.current) {
      return;
    }

    hasRunLegacyMigrationRef.current = true;
    let cancelled = false;

    const migrateLegacyData = async () => {
      try {
        const oldRosterJson = await getStorageItem('availablePlayers').catch(() => null);
        if (!cancelled && oldRosterJson) {
          await setStorageItem(MASTER_ROSTER_KEY, oldRosterJson);
          await removeStorageItem('availablePlayers');
        }

        const oldSeasonsJson = await getStorageItem('soccerSeasonsList').catch(() => null);
        if (!cancelled && oldSeasonsJson) {
          await setStorageItem(SEASONS_LIST_KEY, oldSeasonsJson);
        }
      } catch (migrationError) {
        if (!cancelled) {
          logger.error('[EFFECT init] Error during data migration:', migrationError);
        }
      }
    };

    migrateLegacyData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAllSavedGamesQueryLoading) {
      setIsLoadingGamesList(true);
      setLoadGamesListError(null);
      return;
    }

    if (isAllSavedGamesQueryError) {
      logger.error('[EFFECT init] Error loading all saved games via TanStack Query:', allSavedGamesQueryErrorData);
      setLoadGamesListError(t('loadGameModal.errors.listLoadFailed', 'Failed to load saved games list.'));
      setSavedGames({});
      setIsLoadingGamesList(false);
      return;
    }

    if (allSavedGamesQueryResultData) {
      setSavedGames(allSavedGamesQueryResultData || {});
      setIsLoadingGamesList(false);
      setLoadGamesListError(null);
      return;
    }

    if (!isAllSavedGamesQueryLoading && !isAllSavedGamesQueryError) {
      setSavedGames({});
      setIsLoadingGamesList(false);
      setLoadGamesListError(null);
    }
  }, [
    allSavedGamesQueryResultData,
    allSavedGamesQueryErrorData,
    isAllSavedGamesQueryError,
    isAllSavedGamesQueryLoading,
    setIsLoadingGamesList,
    setLoadGamesListError,
    setSavedGames,
    t,
  ]);

  useEffect(() => {
    if (initialLoadComplete || initialLoadInProgressRef.current) {
      return;
    }

    const queriesLoading =
      isMasterRosterQueryLoading ||
      areSeasonsQueryLoading ||
      areTournamentsQueryLoading ||
      isAllSavedGamesQueryLoading ||
      isCurrentGameIdSettingQueryLoading;

    if (queriesLoading) {
      return;
    }

    initialLoadInProgressRef.current = true;
    if (initialLoadComplete) {
      initialLoadInProgressRef.current = false;
      return;
    }

    let cancelled = false;

    const initializeAppState = async () => {
      try {
        const currentSavedGames = allSavedGamesQueryResultData || {};
        const lastGameIdSetting = currentGameIdSettingQueryResultData;

        if (lastGameIdSetting && lastGameIdSetting !== DEFAULT_GAME_ID && currentSavedGames[lastGameIdSetting]) {
          if (!cancelled) {
            setCurrentGameId(lastGameIdSetting);
            setHasSkippedInitialSetup(true);
          }
        } else {
          if (!cancelled) {
            if (lastGameIdSetting && lastGameIdSetting !== DEFAULT_GAME_ID) {
              logger.warn(`[EFFECT init] Last game ID ${lastGameIdSetting} not found in saved games (from TanStack Query). Loading default.`);
            }
            setCurrentGameId(DEFAULT_GAME_ID);
          }
        }

        try {
          const savedTimerStateJSON = await getStorageItem(TIMER_STATE_KEY).catch(() => null);
          const lastGameId = currentGameIdSettingQueryResultData;

          if (!cancelled && savedTimerStateJSON) {
            const savedTimerState: TimerState = JSON.parse(savedTimerStateJSON);
            if (savedTimerState && savedTimerState.gameId === lastGameId) {
              const elapsedOfflineSeconds = (Date.now() - savedTimerState.timestamp) / 1000;
              const correctedElapsedSeconds = Math.round(savedTimerState.timeElapsedInSeconds + elapsedOfflineSeconds);

              dispatchGameSession({ type: 'SET_TIMER_ELAPSED', payload: correctedElapsedSeconds });
              dispatchGameSession({ type: 'START_TIMER' });
            } else {
              await removeStorageItem(TIMER_STATE_KEY).catch((error) => {
                logger.debug('[Timer Cleanup] Failed to remove timer state (non-critical):', error);
              });
            }
          }
        } catch (error) {
          if (!cancelled) {
            logger.error('[EFFECT init] Error restoring timer state:', error);
          }
          await removeStorageItem(TIMER_STATE_KEY).catch((cleanupError) => {
            logger.debug('[Timer Cleanup] Failed to remove timer state after error (non-critical):', cleanupError);
          });
        }

        if (!cancelled) {
          try {
            const seenGuide = await getHasSeenAppGuide();
            if (!cancelled) {
              const hasAnyData = Object.keys(currentSavedGames).length > 0;
              if (!seenGuide && initialAction !== null && hasAnyData) {
                setIsInstructionsModalOpen(true);
              }
            }
          } catch (guideError) {
            if (!cancelled) {
              logger.error('[EFFECT init] Error checking instructions guide state:', guideError);
            }
          }
        }
      } finally {
        initialLoadInProgressRef.current = false;
        if (!cancelled) {
          setInitialLoadComplete(true);
        }
      }
    };

    initializeAppState();

    return () => {
      cancelled = true;
    };
  }, [
    allSavedGamesQueryResultData,
    areSeasonsQueryLoading,
    areTournamentsQueryLoading,
    currentGameIdSettingQueryResultData,
    dispatchGameSession,
    initialAction,
    initialLoadComplete,
    isAllSavedGamesQueryLoading,
    isCurrentGameIdSettingQueryLoading,
    isMasterRosterQueryLoading,
    setCurrentGameId,
    setHasSkippedInitialSetup,
    setInitialLoadComplete,
    setIsInstructionsModalOpen,
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
      playersOnField, opponents, drawings, availablePlayers, masterRosterQueryResultData,
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
      setIsNewGameSetupModalOpen(true);
      } else {
        logger.log('Not prompting: Specific game loaded.');
    }
    }
  // Depend only on load completion and skip status
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoadComplete, hasSkippedInitialSetup, currentGameId]);

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
  


  // --- Reset Handler ---
  const handleResetField = useCallback(() => {
    if (isTacticsBoardView) {
      clearTacticalElements();
    } else {
      // Only clear game elements in normal view
      setPlayersOnField([]);
      setOpponents([]);
      setDrawings([]);
      saveStateToHistory({ playersOnField: [], opponents: [], drawings: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTacticsBoardView, saveStateToHistory, clearTacticalElements]);

  const handleClearDrawingsForView = () => {
    if (isTacticsBoardView) {
      setTacticalDrawings([]);
      saveStateToHistory({ tacticalDrawings: [] });
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

  

  // --- Team Name Handler ---
  const handleTeamNameChange = (newName: string) => {
    const trimmedName = newName.trim();
    if (trimmedName) {
        logger.log("Updating team name to:", trimmedName);
        dispatchGameSession({ type: 'SET_TEAM_NAME', payload: trimmedName });
        // REMOVED: saveStateToHistory({ teamName: trimmedName }); 
    }
  };

  const applyHistoryState = (state: AppState) => {
    setPlayersOnField(state.playersOnField);
    setOpponents(state.opponents);
    setDrawings(state.drawings);
    setAvailablePlayers(state.availablePlayers);
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
        completedIntervalDurations: state.completedIntervalDurations ?? [],
        lastSubConfirmationTimeSeconds: state.lastSubConfirmationTimeSeconds ?? 0,
        showPlayerNames: state.showPlayerNames,
        gameEvents: state.gameEvents,
        selectedPlayerIds: state.selectedPlayerIds,
        seasonId: state.seasonId,
        tournamentId: state.tournamentId,
        gameLocation: state.gameLocation,
        gameTime: state.gameTime,
        // Include all GameSessionState properties for complete restoration
        ageGroup: state.ageGroup,
        tournamentLevel: state.tournamentLevel,
        teamId: state.teamId,
        gamePersonnel: state.gamePersonnel ?? [],
        demandFactor: state.demandFactor ?? 1,
        subIntervalMinutes: state.subIntervalMinutes ?? 5,
        homeOrAway: state.homeOrAway,
      },
    });
    setTacticalDiscs(state.tacticalDiscs || []);
    setTacticalDrawings(state.tacticalDrawings || []);
    setTacticalBallPosition(state.tacticalBallPosition || null);
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

  // --- Timer Handlers provided by useGameTimer ---

  const handleToggleLargeTimerOverlay = () => {
    setShowLargeTimerOverlay(!showLargeTimerOverlay);
  };


  // Handler to specifically deselect player when bar background is clicked
  const handleDeselectPlayer = () => {
    if (draggingPlayerFromBarInfo) { // Only log if there was a selection
      logger.log("Deselecting player by clicking bar background.");
      setDraggingPlayerFromBarInfo(null);
    }
  };


  // Handler to open/close the goal log modal
  const handleToggleGoalLogModal = () => {
    setIsGoalLogModalOpen(!isGoalLogModalOpen);
  };

  // Handler to add a goal event
  const handleAddGoalEvent = (scorerId: string, assisterId?: string) => {
    const scorer = (masterRosterQueryResultData || availablePlayers).find(p => p.id === scorerId);
    const assister = assisterId ? (masterRosterQueryResultData || availablePlayers).find(p => p.id === assisterId) : undefined;

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
  const handleLogOpponentGoal = (time: number) => {
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
  };

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

  // Placeholder handlers for updating game info (will be passed to modal)
  const handleOpponentNameChange = (newName: string) => {
    logger.log('[page.tsx] handleOpponentNameChange called with:', newName);
    dispatchGameSession({ type: 'SET_OPPONENT_NAME', payload: newName });
  };
  const handleGameDateChange = (newDate: string) => {
    dispatchGameSession({ type: 'SET_GAME_DATE', payload: newDate });
  };
  // const handleHomeScoreChange = (newScore: number) => {
  //   dispatchGameSession({ type: 'SET_HOME_SCORE', payload: newScore });
  // };
  // const handleAwayScoreChange = (newScore: number) => {
  //   dispatchGameSession({ type: 'SET_AWAY_SCORE', payload: newScore });
  // };
  const handleGameNotesChange = (notes: string) => {
    dispatchGameSession({ type: 'SET_GAME_NOTES', payload: notes });
  };

  // --- Handlers for Game Structure ---
  const handleSetNumberOfPeriods = (periods: number) => { 
    // Keep the check inside
    if (periods === 1 || periods === 2) {
      // Keep the type assertion for the state setter
      const validPeriods = periods as (1 | 2); 
      dispatchGameSession({ type: 'SET_NUMBER_OF_PERIODS', payload: validPeriods });
      logger.log(`Number of periods set to: ${validPeriods}`);
    } else {
      logger.warn(`Invalid number of periods attempted: ${periods}. Must be 1 or 2.`);
    }
  };

  const handleSetPeriodDuration = (minutes: number) => {
    const safeMinutes = Number.isFinite(minutes) ? minutes : 1;
    const newMinutes = Math.max(1, safeMinutes);
    dispatchGameSession({ type: 'SET_PERIOD_DURATION', payload: newMinutes });
    logger.log(`Period duration set to: ${newMinutes} minutes`);
  };

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
    baseOpenRosterModal();
    setHighlightRosterButton(false); // <<< Remove highlight when modal is opened
  };

  const openPlayerAssessmentModal = () => openPlayerAssessmentModalBase();
  const handleOpenPersonnelManager = useCallback(() => setIsPersonnelManagerOpen(true), []);
  const handleClosePersonnelManager = useCallback(() => setIsPersonnelManagerOpen(false), []);
  const handleSetGamePersonnel = useCallback((personnelIds: string[]) => {
    dispatchGameSession({ type: 'SET_GAME_PERSONNEL', payload: personnelIds });
  }, [dispatchGameSession]);
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

      const currentRoster = masterRosterQueryResultData || [];
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
    }, [masterRosterQueryResultData, handleAddPlayer, t, setRosterError]);

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
  }, [
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
    setCurrentGameId,
    resetHistory,
    showToast,
    gameSessionState, // This now covers all migrated game session fields
    playerAssessments,
    isPlayed,
    queryClient,
  ]);

  const handleSaveBeforeNewConfirmed = useCallback(async () => {
    await handleQuickSaveGame();
    openSetupAfterPreSave(gameSessionState.selectedPlayerIds);
  }, [handleQuickSaveGame, openSetupAfterPreSave, gameSessionState.selectedPlayerIds]);
  // --- END Quick Save Handler ---

  // --- Auto-Save with Smart Debouncing ---
  // Different delays based on user impact:
  // - Immediate (0ms): Goals, assists, scores → Statistics update instantly
  // - Short (500ms): Game metadata → Near-instant feel
  // - Long (2000ms): Tactical data → Battery-friendly
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
    enabled: currentGameId !== DEFAULT_GAME_ID,
    currentGameId,
  });
  // --- END Auto-Save ---

  // --- Placeholder Handlers for GameSettingsModal (will be implemented properly later) ---
  const handleGameLocationChange = (location: string) => {
    dispatchGameSession({ type: 'SET_GAME_LOCATION', payload: location });
    // REMOVED: saveStateToHistory({ gameLocation: location });
  };
  const handleGameTimeChange = (time: string) => {
    dispatchGameSession({ type: 'SET_GAME_TIME', payload: time });
    // REMOVED: saveStateToHistory({ gameTime: time });
  };

  const handleAgeGroupChange = (group: string) => {
    dispatchGameSession({ type: 'SET_AGE_GROUP', payload: group });
  };

  const handleTournamentLevelChange = (level: string) => {
    dispatchGameSession({ type: 'SET_TOURNAMENT_LEVEL', payload: level });
  };

  const handleTeamIdChange = useCallback((newTeamId: string | null) => {
    logger.log('[HomePage] handleTeamIdChange called with:', newTeamId);
    // TeamId is stored in AppState (saved game), not GameSessionState
    // GameSettingsModal already handles calling updateGameDetailsMutation
    // This handler is just for any additional HomePage-level logic if needed in the future
  }, []);

  const handleSetDemandFactor = (factor: number) => {
    dispatchGameSession({ type: 'SET_DEMAND_FACTOR', payload: factor });
  };

  // Add handler for home/away status
  const handleSetHomeOrAway = (status: 'home' | 'away') => {
    dispatchGameSession({ type: 'SET_HOME_OR_AWAY', payload: status });
    // REMOVED: saveStateToHistory({ homeOrAway: status });
  };

  const handleSetIsPlayed = (played: boolean) => {
    setIsPlayed(played);
  };

  // --- NEW Handlers for Setting Season/Tournament ID ---
  const handleSetSeasonId = useCallback((newSeasonId: string | undefined) => {
    const idToSet = newSeasonId || ''; // Ensure empty string instead of null
    logger.log('[page.tsx] handleSetSeasonId called with:', idToSet);
    dispatchGameSession({ type: 'SET_SEASON_ID', payload: idToSet }); 
  }, [dispatchGameSession]);

  const handleSetTournamentId = useCallback((newTournamentId: string | undefined) => {
    const idToSet = newTournamentId || ''; // Ensure empty string instead of null
    logger.log('[page.tsx] handleSetTournamentId called with:', idToSet);
    dispatchGameSession({ type: 'SET_TOURNAMENT_ID', payload: idToSet });
  }, [dispatchGameSession]);

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
      // TODO: Pass external adjustments and context info for enhanced exports
      exportAggregateExcel(gamesData, aggregateStats, seasons, tournaments, []);
    } catch (error) {
      logger.error('[handleExportAggregateExcel] Export failed:', error);
      showToast(t('export.exportStatsFailed'), 'error');
    }
  }, [savedGames, seasons, tournaments, t, showToast]);

  const handleExportPlayerExcel = useCallback((playerId: string, playerData: import('@/types').PlayerStatRow, gameIds: string[]) => {
    const gamesData = gameIds.reduce((acc, id) => {
      const gameData = savedGames[id];
      if (gameData) {
        acc[id] = gameData;
      }
      return acc;
    }, {} as SavedGamesCollection);
    try {
      // TODO: Pass external adjustments for this player
      exportPlayerExcel(playerId, playerData, gamesData, seasons, tournaments, []);
    } catch (error) {
      logger.error('[handleExportPlayerExcel] Export failed:', error);
      showToast(t('export.exportPlayerFailed'), 'error');
    }
  }, [savedGames, seasons, tournaments, t, showToast]);

  // --- END AGGREGATE EXPORT HANDLERS ---

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

  const handleOpenPlayerStats = (playerId: string) => {
    const player = availablePlayers.find(p => p.id === playerId);
    if (player) {
      setSelectedPlayerForStats(player);
      setIsGameStatsModalOpen(true);
      setIsRosterModalOpen(false); // Close the roster modal
    }
  };

  

  const handleGameLogClick = (gameId: string) => {
    setCurrentGameId(gameId);
    // handleClosePlayerStats(); // This function no longer exists
    handleToggleGameStatsModal();
  };

  // --- Render Logic ---
  const isLoading = isMasterRosterQueryLoading || areSeasonsQueryLoading || areTournamentsQueryLoading || isAllSavedGamesQueryLoading || isCurrentGameIdSettingQueryLoading;

  if (isLoading && !initialLoadComplete) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-slate-900 text-white">
        {/* You can replace this with a more sophisticated loading spinner component */}
        <p>Loading Game Data...</p>
      </div>
    );
  }

  // Define a consistent, premium style for the top and bottom bars
  // We can add a noise texture via pseudo-elements or a background image later if desired

  // Determine which players are available for the current game based on selected IDs


  // Early return during reset to prevent any component rendering
  if (isResetting) {
    return (
      <div
        className="fixed inset-0 bg-slate-900 z-[9999] flex flex-col items-center justify-center"
        role="alert"
        aria-live="assertive"
        data-testid="reset-overlay"
      >
        <div className="flex flex-col items-center gap-4">
          {/* Spinner */}
          <div className="w-16 h-16 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />

          {/* Message */}
          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-200 mb-2">
              {t('reset.resetting', 'Resetting Application...')}
            </h2>
            <p className="text-sm text-slate-400">
              {t('reset.pleaseWait', 'Please wait while we clear all data')}
            </p>
          </div>
        </div>
      </div>
    );
  }
  const playerBarProps = {
    players: playersForCurrentGame || [],
    onPlayerDragStartFromBar: handlePlayerDragStartFromBar,
    selectedPlayerIdFromBar: draggingPlayerFromBarInfo?.id,
    onBarBackgroundClick: handleDeselectPlayer,
    gameEvents: gameSessionState.gameEvents,
    onPlayerTapInBar: handlePlayerTapInBar,
    onToggleGoalie: handleToggleGoalieForModal,
  };

  const gameInfoBarProps = {
    teamName: gameSessionState.teamName,
    opponentName: gameSessionState.opponentName,
    homeScore: gameSessionState.homeScore,
    awayScore: gameSessionState.awayScore,
    onTeamNameChange: handleTeamNameChange,
    onOpponentNameChange: handleOpponentNameChange,
    homeOrAway: gameSessionState.homeOrAway,
  };

  const fieldProps: FieldContainerProps = {
    gameSessionState,
    playersOnField: playersOnField || [],
    opponents: opponents || [],
    drawings: drawings || [],
    isTacticsBoardView: isTacticsBoardView || false,
    tacticalDrawings: tacticalDrawings || [],
    tacticalDiscs: tacticalDiscs || [],
    tacticalBallPosition: tacticalBallPosition || { relX: 0.5, relY: 0.5 },
    draggingPlayerFromBarInfo: draggingPlayerFromBarInfo || null,
    timeElapsedInSeconds: timeElapsedInSeconds || 0,
    isTimerRunning: isTimerRunning || false,
    subAlertLevel: subAlertLevel || 'none',
    lastSubConfirmationTimeSeconds: lastSubConfirmationTimeSeconds || 0,
    showLargeTimerOverlay,
    initialLoadComplete: initialLoadComplete || false,
    currentGameId: currentGameId || DEFAULT_GAME_ID,
    availablePlayers: availablePlayers || [],
    teams: teams || [],
    seasons: seasonsQueryResultData || [],
    tournaments: tournamentsQueryResultData || [],
    showFirstGameGuide,
    hasCheckedFirstGameGuide,
    firstGameGuideStep: firstGameGuideStep || 0,
    orphanedGameInfo,
    onOpenNewGameSetup: openNewGameSetupModalDirect,
    onOpenRosterModal: openRosterModal,
    onOpenSeasonTournamentModal: handleOpenSeasonTournamentModal,
    onOpenTeamManagerModal: handleOpenTeamManagerModal,
    onGuideStepChange: setFirstGameGuideStep,
    onGuideClose: () => {
      setShowFirstGameGuide(false);
      setStorageItem('hasSeenFirstGameGuide', 'true').catch(error => {
        logger.debug('Failed to store first game guide dismissal (non-critical)', { error });
      });
    },
    onOpenTeamReassignModal: openTeamReassignModal,
    handlePlayerMove,
    handlePlayerMoveEnd,
    handlePlayerRemove,
    handleOpponentMove,
    handleOpponentMoveEnd,
    handleOpponentRemove,
    handleDropOnField,
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
    handleToggleLargeTimerOverlay,
    handleToggleGoalLogModal,
    handleLogOpponentGoal,
    handleSubstitutionMade,
    handleSetSubInterval,
    handleStartPauseTimer,
    handleResetTimer,
  };

  const controlBarProps = {
    timeElapsedInSeconds: timeElapsedInSeconds || 0,
    isTimerRunning: isTimerRunning || false,
    onToggleLargeTimerOverlay: handleToggleLargeTimerOverlay,
    onUndo: handleUndo,
    onRedo: handleRedo,
    canUndo: canUndo || false,
    canRedo: canRedo || false,
    onResetField: handleResetField,
    onClearDrawings: handleClearDrawingsForView,
    onAddOpponent: handleAddOpponent,
    onPlaceAllPlayers: handlePlaceAllPlayers,
    isTacticsBoardView: isTacticsBoardView || false,
    onToggleTacticsBoard: handleToggleTacticsBoard,
    onAddHomeDisc: () => handleAddTacticalDisc?.('home'),
    onAddOpponentDisc: () => handleAddTacticalDisc?.('opponent'),
    onToggleGoalLogModal: handleToggleGoalLogModal,
    onToggleTrainingResources: handleToggleTrainingResources,
    onToggleGameStatsModal: handleToggleGameStatsModal,
    onOpenLoadGameModal: handleOpenLoadGameModal,
    onStartNewGame: handleStartNewGame,
    onOpenRosterModal: openRosterModal,
    onQuickSave: handleQuickSaveGame,
    onOpenGameSettingsModal: handleOpenGameSettingsModal,
    onOpenSeasonTournamentModal: handleOpenSeasonTournamentModal,
    onToggleInstructionsModal: handleToggleInstructionsModal,
    onOpenSettingsModal: handleOpenSettingsModal,
    onOpenPlayerAssessmentModal: openPlayerAssessmentModal,
    onOpenTeamManagerModal: handleOpenTeamManagerModal,
    onOpenPersonnelManager: handleOpenPersonnelManager,
    isGameLoaded: !!currentGameId && currentGameId !== DEFAULT_GAME_ID,
  };

  const gameContainerProps = {
    gameInfoBarProps,
    playerBarProps,
    fieldProps,
    controlBarProps,
    currentGameId,
  };

  const modalManagerProps = {
    gameSessionState,
    playersForCurrentGame,
    availablePlayers,
    savedGames,
    masterRosterQueryResultData,
    seasons,
    tournaments,
    personnel: personnelManager.personnel,
    personnelManager,
    isGoalLogModalOpen,
    isGameStatsModalOpen,
    isTrainingResourcesOpen,
    isInstructionsModalOpen,
    isLoadGameModalOpen,
    isNewGameSetupModalOpen,
    isRosterModalOpen,
    isSeasonTournamentModalOpen,
    isGameSettingsModalOpen,
    isSettingsModalOpen,
    isPlayerAssessmentModalOpen,
    isTeamManagerOpen,
    isPersonnelManagerOpen,
    onClosePersonnelManager: handleClosePersonnelManager,
    selectedPlayerForStats,
    showNoPlayersConfirm,
    showHardResetConfirm,
    showSaveBeforeNewConfirm,
    showStartNewConfirm,
    gameIdentifierForSave,
    isTeamReassignModalOpen,
    orphanedGameInfo,
    availableTeams,
    teamLoadError,
    isLoadingGamesList,
    loadGamesListError,
    isGameLoading,
    gameLoadError,
    isGameDeleting,
    gameDeleteError,
    processingGameId,
    isPlayed,
    playerIdsForNewGame,
    newGameDemandFactor,
    defaultTeamNameSetting,
    appLanguage,
    playerAssessments,
    isRosterUpdating,
    rosterError,
    handleToggleGoalLogModal,
    handleAddGoalEvent,
    handleLogOpponentGoal,
    handleUpdateGameEvent,
    handleDeleteGameEvent,
    handleToggleGameStatsModal,
    handleExportOneExcel,
    handleExportAggregateExcel,
    handleExportPlayerExcel,
    handleGameLogClick,
    handleCloseLoadGameModal,
    handleLoadGame,
    handleDeleteGame,
    handleExportOneJson,
    handleStartNewGameWithSetup,
    handleCancelNewGameSetup,
    setNewGameDemandFactor,
    closeRosterModal,
    handleUpdatePlayerForModal,
    handleRenamePlayerForModal,
    handleSetJerseyNumberForModal,
    handleSetPlayerNotesForModal,
    handleRemovePlayerForModal,
    handleAddPlayerForModal,
    handleOpenPlayerStats,
    handleCloseSeasonTournamentModal,
    addSeasonMutation,
    addTournamentMutation,
    updateSeasonMutation,
    deleteSeasonMutation,
    updateTournamentMutation,
    deleteTournamentMutation,
    handleCloseGameSettingsModal,
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
    handleSetIsPlayed,
    handleUpdateSelectedPlayers,
    handleSetGamePersonnel,
    updateGameDetailsMutation,
    handleTeamIdChange,
    handleCloseSettingsModal,
    handleShowAppGuide,
    handleHardResetApp,
    onDataImportSuccess,
    closePlayerAssessmentModal: closePlayerAssessmentModalBase,
    handleSavePlayerAssessment,
    handleDeletePlayerAssessment,
    handleCloseTeamManagerModal,
    handleToggleTrainingResources,
    handleToggleInstructionsModal,
    setShowNoPlayersConfirm,
    handleNoPlayersConfirmed,
    setShowHardResetConfirm,
    handleHardResetConfirmed,
    setShowSaveBeforeNewConfirm,
    handleSaveBeforeNewConfirmed,
    handleSaveBeforeNewCancelled,
    setShowStartNewConfirm,
    handleStartNewConfirmed,
    handleTeamReassignment,
    setAppLanguage,
    setDefaultTeamNameSetting,
    handleOpenLoadGameModal,
    handleStartNewGame,
    openRosterModal,
    handleQuickSaveGame,
    handleOpenGameSettingsModal,
    handleOpenSeasonTournamentModal,
    handleOpenSettingsModal,
    openPlayerAssessmentModal,
    handleOpenTeamManagerModal,
    handleOpenPersonnelManager,
    handleUndo,
    handleRedo,
    handleResetField,
    handleClearDrawingsForView,
    handlePlaceAllPlayers,
    setIsNewGameSetupModalOpen,
    handleTeamNameChange,
    handleOpponentNameChange,
    setIsTeamReassignModalOpen,
  };

  return (
    <>
      <GameContainer {...gameContainerProps} />
      <ModalManager {...modalManagerProps} />
    </>
  );
}
export default HomePage;
