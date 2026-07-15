import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ComponentProps } from 'react';
import type ControlBar from '@/components/ControlBar';
import type { GameContainerProps } from '@/components/HomePage/containers/GameContainer';
import type { ModalManagerProps } from '@/components/HomePage/containers/ModalManager';
import usePlayerAssessments from '@/hooks/usePlayerAssessments';
import { useTranslation } from 'react-i18next';
import { useFieldCoordination } from './useFieldCoordination';
import { useTimerManagement } from './useTimerManagement';
import { GameSessionState } from '@/hooks/useGameSessionReducer';
import { saveGame as utilSaveGame, getGame as utilGetGame, getLatestGameId } from '@/utils/savedGames';
import {
  saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting,
} from '@/utils/appSettings';
import { getTeams, getTeam } from '@/utils/teams';
import { diffRemovedRosterIds } from '@/utils/rosterRemovalDiff';
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
import { exportJson, exportAggregateStatsExcel, exportPlayerStatsExcel } from '@/utils/exportGames';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import { readTimerAnchor, clearTimerAnchor } from '@/utils/timerAnchor';
import { buildGameContainerViewModel, isValidGameContainerVMInput } from '@/viewModels/gameContainer';
import type { BuildGameContainerVMInput } from '@/viewModels/gameContainer';
import type { FieldContainerProps, FieldInteractions } from '@/components/HomePage/containers/FieldContainer';
import type { ReducerDrivenModals } from '@/types';
import { debug } from '@/utils/debug';
import { generateSubSlots, isFieldPosition } from '@/utils/formations';
import { reapplyPlanToGame, type ReapplyResult } from '@/utils/playtimePlanner/reapply';
import { setGameSubs } from '@/utils/playtimePlanner/gameSubs';
import { getPlan } from '@/utils/playtimePlanner/storage';
import { getPlanLink, type PlanLink } from '@/utils/playtimePlanner/planLinks';

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
  playerPositions: {}, // Post-game position assignments, keyed by player id
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
  initialAction?: 'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'season' | 'stats' | 'roster' | 'teams' | 'personnel' | 'settings' | 'backup' | 'account' | 'training' | 'rules';
  skipInitialSetup?: boolean;
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
}

/**
 * Defensive single-goalie normalization for a loaded field array.
 *
 * A game should never have more than one goalie, but a hand-edited, migrated, or
 * legacy save could. When duplicates exist we keep the FIRST goalie and clear the
 * rest, so loaded games always satisfy the single-goalie invariant. Returns the
 * same array reference when already valid (no needless re-render).
 */
export function normalizeSingleGoalie(players: Player[]): Player[] {
  let seenGoalie = false;
  let changed = false;
  const normalized = players.map(p => {
    if (!p.isGoalie) return p;
    if (!seenGoalie) {
      seenGoalie = true;
      return p;
    }
    changed = true;
    return { ...p, isGoalie: false };
  });
  return changed ? normalized : players;
}

export function useGameOrchestration({ initialAction, skipInitialSetup = false, isFirstTimeUser: _isFirstTimeUser = false, onGoToStartScreen, initialGameType }: UseGameOrchestrationProps): UseGameOrchestrationReturn {
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
  // usePremium (game-limit gating) moved with creation to useNewGameSetupController (L.3b).

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
    playersForCurrentGame,
    // handleAdd/Update/RemovePlayer + isRosterUpdating/rosterError/setRosterError
    // now used only by the lifted roster modal (useRosterSettingsController, L.2);
    // game-side goalie errors surface via showToast instead.
    // handleSetGoalieStatus: no longer used - using per-game implementation
  } = useRoster({
    initialPlayers: initialState.availablePlayers,
    selectedPlayerIds: gameSessionState.selectedPlayerIds,
  });

  // Bridge from field coordination (position-driven goalie promotion) to the
  // authoritative goalie handler. The handler (applyGoalieStatus) is defined far
  // below and depends on field coordination, so we route through a ref to break
  // the definition-order cycle. handleAssignGoalieByPosition is stable (empty deps)
  // so it's safe to pass into useFieldCoordination at creation time.
  const assignGoalieByPositionRef = useRef<((playerId: string) => void) | null>(null);
  const handleAssignGoalieByPosition = useCallback((playerId: string) => {
    assignGoalieByPositionRef.current?.(playerId);
  }, []);
  // Serializes goalie updates so concurrent requests can't corrupt the single-goalie invariant.
  const goalieUpdateInProgressRef = useRef(false);

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
    onAssignGoalieByPosition: handleAssignGoalieByPosition,
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

  // Ref for field coordination state values read at call time in callbacks.
  // Using a ref avoids depending on the whole fieldCoordination object (new every render),
  // which would defeat useCallback memoization for handlers that read field state.
  const fieldStateRef = useRef({
    playersOnField: fieldCoordination.playersOnField,
    opponents: fieldCoordination.opponents,
    drawings: fieldCoordination.drawings,
    tacticalDiscs: fieldCoordination.tacticalDiscs,
    tacticalDrawings: fieldCoordination.tacticalDrawings,
    tacticalBallPosition: fieldCoordination.tacticalBallPosition,
  });
  useEffect(() => {
    fieldStateRef.current = {
      playersOnField: fieldCoordination.playersOnField,
      opponents: fieldCoordination.opponents,
      drawings: fieldCoordination.drawings,
      tacticalDiscs: fieldCoordination.tacticalDiscs,
      tacticalDrawings: fieldCoordination.tacticalDrawings,
      tacticalBallPosition: fieldCoordination.tacticalBallPosition,
    };
  }, [
    fieldCoordination.playersOnField, fieldCoordination.opponents,
    fieldCoordination.drawings, fieldCoordination.tacticalDiscs,
    fieldCoordination.tacticalDrawings, fieldCoordination.tacticalBallPosition,
  ]);

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

  // Surface a brief toast after a goal / opponent goal / substitution with an
  // Undo action, so a sideline mis-tap can be reverted in one tap via undo.
  const notifyUndoableAction = useCallback((kind: 'goal' | 'opponentGoal' | 'substitution') => {
    const message =
      kind === 'goal'
        ? t('undoToast.goal', 'Goal logged')
        : kind === 'opponentGoal'
          ? t('undoToast.opponentGoal', 'Opponent goal logged')
          : t('undoToast.substitution', 'Substitution logged');
    showToast(message, 'info', {
      action: { label: t('controlBar.undo', 'Undo'), onClick: handleUndo },
      durationMs: 5000,
    });
  }, [t, showToast, handleUndo]);

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
  // Bumped after a plan is re-applied so the live planned-sub prompts re-read the
  // (non-reactive) local schedule store for the same game.
  const [plannedSubsRefreshKey, setPlannedSubsRefreshKey] = useState(0);
  // The current game's plan link from the local-only link store (null when the game
  // wasn't created from a plan). Drives the "Re-apply plan" affordance.
  const [currentGamePlanLink, setCurrentGamePlanLink] = useState<PlanLink | null>(null);

  // This ref needs to be declared after currentGameId
  const gameIdRef = useRef(currentGameId);
  // Track which game has been successfully loaded to prevent reload on auto-save
  const loadedGameIdRef = useRef<string | null>(null);
  // Clock correction consumed from the persisted timer record at boot,
  // applied one-shot when the corresponding game loads (see loadGameStateFromData).
  // `resume` is set when the timer was running at hide time (wasRunning), so the
  // boot path can continue the clock without a tap after a >5 min force-reload.
  const pendingClockCorrectionRef = useRef<{ gameId: string; elapsed: number; resume: boolean } | null>(null);
  // Set when the boot path wants to auto-resume a loaded in-progress game. Consumed
  // by a dedicated effect ONE render after LOAD_PERSISTED_GAME_DATA commits, so the
  // precision timer's stableStartTime has synced to the recovered clock before
  // RESUME_GAME starts it — mirroring the working manual Start-tap flow (dispatching
  // RESUME in the same batch as LOAD starts the timer from a stale anchor / fails).
  const pendingAutoResumeRef = useRef(false);
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

  // L.2: club-roster deletions now happen in the lifted roster modal
  // (useRosterSettingsController), so the cascade that used to live in the
  // modal's remove handler runs here instead: when a player disappears from
  // the shared masterRoster query DURING the session, prune them from the
  // live field and the game's selection (an orphaned token could carry an
  // orphaned goalie flag). Only ids seen in a PREVIOUS roster snapshot are
  // pruned - loading a legacy game whose players were deleted long ago is
  // untouched, matching the old explicit-cascade semantics.
  const prevRosterIdsRef = useRef<Set<string> | null>(null);
  // Selection read via ref so roster changes are the effect's only trigger
  // (assigned in an effect - refs must not be written during render).
  const selectedPlayerIdsForPruneRef = useRef<string[]>(gameSessionState.selectedPlayerIds);
  useEffect(() => {
    selectedPlayerIdsForPruneRef.current = gameSessionState.selectedPlayerIds;
  }, [gameSessionState.selectedPlayerIds]);
  const masterRosterForPrune = gameDataManagement.masterRoster;
  useEffect(() => {
    const { removedIds, nextSnapshot } = diffRemovedRosterIds(prevRosterIdsRef.current, masterRosterForPrune);
    prevRosterIdsRef.current = nextSnapshot;
    if (removedIds.size === 0) return;
    setPlayersOnField(current =>
      current.some(p => removedIds.has(p.id))
        ? current.filter(p => !removedIds.has(p.id))
        : current
    );
    const selected = selectedPlayerIdsForPruneRef.current;
    if (selected.some(id => removedIds.has(id))) {
      dispatchGameSession({
        type: 'SET_SELECTED_PLAYER_IDS',
        payload: selected.filter(id => !removedIds.has(id)),
      });
    }
  // setPlayersOnField/dispatchGameSession are stable; selection read via ref
  // so roster changes are the ONLY trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterRosterForPrune]);

  // Local state for savedGames - DO NOT replace with React Query cache directly!
  // The useState ensures local state persists across renders and isn't affected by
  // query cache invalidations. Previous attempt to use useMemo + queryClient.setQueryData
  // caused game data to reset to defaults when navigating between games.
  const [savedGames, setSavedGames] = useState<SavedGamesCollection>({});

  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  // appLanguage + defaultTeamNameSetting LIFTED to useAppSettingsController
  // (L.0b) - SettingsModal renders in ClubModalsHost with no game mounted.

  // Data Safety - Layer 1: once data has loaded, request persistent storage (so the
  // browser is less likely to evict IndexedDB) and take an automatic restore-point
  // snapshot if the newest is older than 24h. Best-effort and one-shot per mount;
  // a failure here must never affect the app. Dynamic import keeps the IndexedDB
  // backup code out of the initial bundle.
  const autoBackupStartedRef = useRef(false);
  useEffect(() => {
    if (!initialLoadComplete || autoBackupStartedRef.current) {
      return;
    }
    autoBackupStartedRef.current = true;
    (async () => {
      try {
        const { requestPersistentStorage, maybeCreateAutoSnapshot } = await import('@/utils/backupSnapshots');
        await requestPersistentStorage();
        await maybeCreateAutoSnapshot(userId);
      } catch (error) {
        logger.warn('[useGameOrchestration] Automatic backup snapshot failed (non-fatal):', error);
      }
    })();
  }, [initialLoadComplete, userId]);

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
    isTrainingResourcesOpen: _isTrainingResourcesOpen,
    setIsTrainingResourcesOpen,
    isRulesDirectoryOpen: _isRulesDirectoryOpen,
    setIsRulesDirectoryOpen,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in reducerDrivenModals
    isGoalLogModalOpen,
    setIsGoalLogModalOpen,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- State managed by useModalOrchestration, setter used here
    isGameStatsModalOpen,
    setIsGameStatsModalOpen,
    openClubStatsToTab,
    isNewGameSetupModalOpen,
    setIsNewGameSetupModalOpen,
    // L.3b: NewGameSetup renders in ClubModalsHost; the prefill selection is
    // shared provider state so match-side openers can carry it across levels.
    setPlayerIdsForNewGame,
    // L.3c: planner renders in ClubModalsHost; the match registers its
    // live-game hooks (flush + post-bulk-re-apply refresh) while mounted.
    setPlannerLiveGameHooks,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in reducerDrivenModals
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    openSettingsToTab,
    // L.0b: Instructions open-state lives in ModalProvider (modal renders in ClubModalsHost)
    setIsInstructionsModalOpen,
    // L.1: Personnel open-state lives in ModalProvider (modal renders in ClubModalsHost)
    setIsPersonnelManagerOpen,
    // L.2: TeamManager open-state lives in ModalProvider (modal renders in ClubModalsHost)
    setIsTeamManagerOpen,
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
  // selectedPlayerForStats LIFTED to ModalProvider (L.2); the write-only
  // selectedTeamForRoster state was dead and is deleted with the lift.

  // handleCreateBackup + handleCloudDataDownload LIFTED to useAppSettingsController (L.0b).

  // handleManageTeamRosterFromNewGame LIFTED to ClubModalsHost (L.3b).

  // --- Timer Management Hook (Step 2.6.5) ---
  const timerManagement = useTimerManagement({
    gameSessionState,
    dispatchGameSession,
    currentGameId,
    availablePlayers,
    masterRoster: gameDataManagement.masterRoster || [],
    setIsGoalLogModalOpen,
    setIsPlayerAssessmentModalOpen,
    onActionLogged: notifyUndoableAction,
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
        // PWA shortcut "Pelaajatilastot": land on the club-level PLAYER
        // stats (L.4) - the match modal would show the current-game tab of
        // whatever game happened to boot, which is not what the shortcut
        // promises. (The match still mounts underneath via the deep-link
        // screen switch; rerouting that is 3.1's menu/navigation work.)
        openClubStatsToTab('player');
        break;
      case 'roster':
        openRosterViaReducer();
        break;
      case 'teams':
        setIsTeamManagerOpen(true);
        break;
      case 'personnel':
        setIsPersonnelManagerOpen(true);
        break;
      case 'settings':
        setIsSettingsModalOpen(true);
        break;
      // Gear-bucket entries (restructure PR 1.4): deep-tab settings opens +
      // the two standalone directories, all through existing modal state.
      case 'backup':
        openSettingsToTab('data');
        break;
      case 'account':
        openSettingsToTab('account');
        break;
      case 'training':
        setIsTrainingResourcesOpen(true);
        break;
      case 'rules':
        setIsRulesDirectoryOpen(true);
        break;
      case 'explore':
        // Explore mode - just let user access the temporary workspace
        // The first-game overlay will appear automatically for DEFAULT_GAME_ID
        // No modal needs to be opened, user can explore the interface freely
        break;
      default:
        break;
    }
  // Omitting stable React setters from deps: setIsGameStatsModalOpen, setIsSettingsModalOpen,
  // setIsTeamManagerOpen (from useModalContext — stable by React guarantee), setShowNoPlayersConfirm,
  // setPlayerIdsForNewGame (declared after this effect due to hook call order).
  // processedInitialActionRef guard prevents stale closures.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, availablePlayers.length, gameSessionState.selectedPlayerIds,
      openLoadGameViaReducer, openNewGameViaReducer, openSeasonTournamentViaReducer, openRosterViaReducer]);
  
  // playerIdsForNewGame LIFTED to ModalProvider (L.3b, destructured above);
  // the demand-factor slider state lives in useNewGameSetupController now.

  // Confirmation modal states - Passed to useModalOrchestration via ui object
  // (showHardResetConfirm LIFTED to useAppSettingsController, L.0b)
  const [showNoPlayersConfirm, setShowNoPlayersConfirm] = useState(false);
  const [showSaveBeforeNewConfirm, setShowSaveBeforeNewConfirm] = useState(false);
  // Re-entry guard for the async "Save & Continue" handler. The dialog stays open
  // during the save (it only closes on success - see the save-loss fix), so without
  // this a mobile double-tap would start two saves and create a duplicate game.
  const saveBeforeNewInFlightRef = useRef(false);
  const [gameIdentifierForSave, setGameIdentifierForSave] = useState<string>('');
  const [showStartNewConfirm, setShowStartNewConfirm] = useState(false);
  const [orphanedGameInfo, setOrphanedGameInfo] = useState<{ teamId: string; teamName?: string } | null>(null);
  const [isTeamReassignModalOpen, setIsTeamReassignModalOpen] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  // isResetting LIFTED to useAppSettingsController (L.0b) - the overlay
  // renders in ClubModalsHost so reset works with no game mounted.

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
  const handleTeamReassignment = useCallback(async (newTeamId: string | null) => {
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

      logger.log('[TEAM REASSIGN] Game reassigned to team:', newTeamId);
    } catch (error) {
      logger.error('[TEAM REASSIGN] Error reassigning team:', error);
    }
  }, [currentGameId, savedGames, userId, queryClient]);

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

  // Roster metadata sync (name, nickname, jerseyNumber, notes, color, receivedFairPlayCard)
  // is handled by useGameState.ts's roster sync effect via mergeRosterDetails().
  // That effect also removes players deleted from the roster and saves to history.
  // Note: isGoalie is intentionally NOT synced from roster — it's per-game field state.
  
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
        // (List loading/error FLAGS lifted with LoadGameModal to
        // useLoadGameController, L.3a - only the data sync remains.)
        if (gameDataManagement.savedGames) {
          setSavedGames(gameDataManagement.savedGames || {});
        }
        if (gameDataManagement.error) {
          logger.error('[EFFECT init] Error loading all saved games via TanStack Query:', gameDataManagement.error);
          setSavedGames({});
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
        // Consume the persisted timer record, then clear it. If the
        // timer was running when the app was hidden and a force-reload followed
        // (useAppResume after >5 min background), the real match kept running —
        // fold the background time into the loaded clock (same semantics as the
        // in-session visibility restore). Clearing without consuming would drop
        // that time; leaving the record behind would let a later background/
        // foreground cycle replay it and jump the clock.
        try {
          const lastGameId = gameDataManagement.currentGameIdSetting;
          const savedTimerState = lastGameId
            ? await loadTimerStateForGame(lastGameId, userId)
            : null;
          // Prefer the durable, synchronous localStorage anchor — it survives the
          // Android WebView freeze/kill that the async IndexedDB record does not.
          const anchor = readTimerAnchor();
          // Note: the period-boundary cap is applied downstream in
          // loadGameStateFromData (Math.min(elapsed, periodBoundary)); this just
          // computes the raw wall-clock-corrected elapsed.
          if (anchor && lastGameId && anchor.gameId === lastGameId) {
            const offlineSeconds = (Date.now() - anchor.wallClockMs) / 1000;
            pendingClockCorrectionRef.current = {
              gameId: lastGameId,
              elapsed: Math.round(anchor.elapsedSeconds + offlineSeconds),
              resume: true,
            };
          } else if (savedTimerState?.wasRunning && lastGameId) {
            const offlineSeconds = (Date.now() - savedTimerState.timestamp) / 1000;
            pendingClockCorrectionRef.current = {
              gameId: lastGameId,
              elapsed: Math.round(savedTimerState.timeElapsedInSeconds + offlineSeconds),
              resume: true,
            };
          }
          // Consume both recovery records unconditionally so a stale anchor/record
          // (incl. one for a different game) can never be replayed on a later boot.
          clearTimerAnchor();
          await clearTimerState(userId);
        } catch (error) {
          logger.error('[EFFECT init] Error consuming persisted timer state:', error);
          // Best-effort clear: a record we failed to read must still not
          // survive to be replayed on a later boot or visibility change.
          await clearTimerState(userId).catch(() => {});
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
    setCurrentGameId,
    setHasSkippedInitialSetup,
    t,
    initialLoadComplete,
    initialAction, // Used to determine if instructions modal should show automatically
    savedGames, // Used to check if user has any saved games for instructions modal logic
    userId, // User-scoped storage
    // setIsInstructionsModalOpen intentionally excluded - useState setter is stable (from useModalOrchestration)
  ]);

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
        playerPositions: gameData.playerPositions ?? {},
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
        shootoutKicks: gameData.shootoutKicks,
      };

      // Apply the boot-time clock correction (one-shot). Only for the
      // game that was live when the app was hidden and only if it loads as
      // in-progress. Capped at the current period boundary — the first tick
      // after resume then fires the period/game end normally.
      const pendingCorrection = pendingClockCorrectionRef.current;
      let shouldAutoResume = false;
      if (pendingCorrection) {
        if (pendingCorrection.gameId === currentGameId && gameData.gameStatus === 'inProgress') {
          // The game was live when the app was hidden and a force-reload followed.
          const periodBoundarySeconds =
            (gameData.currentPeriod ?? 1) * (gameData.periodDurationMinutes ?? 10) * 60;
          const corrected = Math.min(pendingCorrection.elapsed, periodBoundarySeconds);
          if (corrected > (gameData.timeElapsedInSeconds ?? 0)) {
            logger.info('[LOAD GAME STATE] Applying hidden-session clock correction', {
              storedElapsed: gameData.timeElapsedInSeconds,
              correctedElapsed: corrected,
            });
            payload.timeElapsedInSeconds = corrected;
          }
          // Auto-resume only if the period did NOT end during the background gap.
          // If the corrected clock reached the period boundary (phone locked past
          // the period), leave it paused so the user taps to acknowledge the period
          // end — we never silently auto-advance periods.
          shouldAutoResume = pendingCorrection.resume && corrected < periodBoundarySeconds;
        }
        pendingClockCorrectionRef.current = null;
      }

      dispatchGameSession({ type: 'LOAD_PERSISTED_GAME_DATA', payload });

      // Auto-resume a game that was running when the app was hidden/force-reloaded
      // (>5 min background, via useAppResume) and is still mid-period. LOAD_PERSISTED_
      // GAME_DATA coerces inProgress→notStarted and never auto-starts the timer; for a
      // game that WAS running we continue the clock so the match timer never silently
      // pauses awaiting a tap. RESUME_GAME acts only from the coerced notStarted state
      // and preserves the corrected clock/period (it does NOT reset to period 1 /
      // 0:00); the resetHistory() below sets the undo baseline from the loaded game.
      // This is the same transition a manual Start tap produces — just automatic.
      if (shouldAutoResume) {
        logger.info('[LOAD GAME STATE] Auto-resume armed (timer was running before reload)');
        // Defer the actual RESUME_GAME to a dedicated effect that fires AFTER this
        // LOAD render commits (see pendingAutoResumeRef declaration), so the timer
        // starts from the recovered clock rather than a stale anchor.
        pendingAutoResumeRef.current = true;
      }
    } else {
      // Consume any pending clock correction even when no game loads (e.g. the
      // recorded game no longer exists) so it cannot apply to a later load.
      pendingClockCorrectionRef.current = null;
      dispatchGameSession({ type: 'RESET_TO_INITIAL_STATE', payload: initialGameSessionData });
      setIsPlayed(true);
    }

    // Update non-reducer states (these will eventually be migrated or handled differently)
    // For fields not yet in gameSessionState but are in GameData, update their local states if needed.
    // This part will shrink as more state moves to the reducer.
    // Don't apply position-based goalie detection when loading saved games.
    // Position-based detection is for: (1) formation picker, (2) player movement.
    // Saved games already have correct isGoalie status stored - preserve it.
    const rawLoadedPlayers = gameData?.playersOnField || (isInitialDefaultLoad ? initialState.playersOnField : []);
    // Defensively enforce single-goalie on load (handles legacy/edited/migrated saves).
    const loadedPlayers = normalizeSingleGoalie(rawLoadedPlayers);
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
    setTacticalBallPosition(gameData?.tacticalBallPosition ?? { relX: 0.5, relY: 0.5 });
    setFormationSnapPoints(gameData?.formationSnapPoints || []);

    // Regenerate subSlots from persisted formationSnapPoints for sideline visuals
    // subSlots are not persisted, but can be reconstructed from field positions
    // Works for both soccer and futsal - generateSubSlots is sport-agnostic
    const snapPoints = gameData?.formationSnapPoints || [];
    if (snapPoints.length > 0) {
      // Extract field positions only (shared predicate: excludes GK + sideline)
      const fieldPositions = snapPoints.filter(isFieldPosition);
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
      playerPositions: gameData?.playerPositions ?? initialGameSessionData.playerPositions,
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
      tacticalBallPosition: gameData?.tacticalBallPosition ?? { relX: 0.5, relY: 0.5 },
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
    // Clock-correction match check (refs are stable; id changes per load)
    currentGameId,
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

        // Mark as loaded BEFORE the await: loadGameStateFromData is async, and the
        // effect can re-fire during it (savedGames/callback identity changes). If the
        // guard is set only after the await, the second run dispatches a second
        // LOAD_PERSISTED_GAME_DATA that re-pauses the game after the first run already
        // consumed the one-shot resume — leaving the timer paused.
        loadedGameIdRef.current = currentGameId;
        try {
          await loadGameStateFromData(gameToLoad);
        } catch (err) {
          // If the load failed, clear the guard so the effect can retry this game
          // rather than leaving it permanently "loaded" but unapplied.
          loadedGameIdRef.current = null;
          logger.error('[EFFECT game load] loadGameStateFromData failed; will retry', err);
        }
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

  // Deferred boot auto-resume: fires the render AFTER LOAD_PERSISTED_GAME_DATA has
  // coerced the recovered in-progress game to 'notStarted' with the recovered clock.
  // By then useGameTimer's stableStartTime has synced to that clock, so RESUME_GAME
  // starts the precision timer from the correct time — exactly like a manual Start
  // tap. Dispatching RESUME in the same batch as LOAD (the previous approach) left
  // the device timer paused. One-shot via pendingAutoResumeRef.
  useEffect(() => {
    if (
      pendingAutoResumeRef.current &&
      gameSessionState.gameStatus === 'notStarted' &&
      gameSessionState.timeElapsedInSeconds > 0
    ) {
      pendingAutoResumeRef.current = false;
      logger.info('[LOAD GAME STATE] Auto-resuming clock (deferred, post-load)');
      dispatchGameSession({ type: 'RESUME_GAME' });
    }
  }, [gameSessionState.gameStatus, gameSessionState.timeElapsedInSeconds, dispatchGameSession]);

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

    // Callbacks
    dispatchGameSession,
    showToast,
    t,

    // Query client for cache invalidation
    queryClient,
  });

  // useModalOrchestration hook call moved to line 2138 (after all handlers are defined)

  // Legacy handler - delegates to session coordination
  const { setTeamName: setTeamNameHandler } = sessionCoordination.handlers;
  const handleTeamNameChange = useCallback((newName: string) => {
    setTeamNameHandler(newName);
  }, [setTeamNameHandler]);

  // Handler to update an existing game event
  const handleUpdateGameEvent = useCallback((updatedEvent: GameEvent) => {
    const cleanUpdatedEvent: GameEvent = { id: updatedEvent.id, type: updatedEvent.type, time: updatedEvent.time, scorerId: updatedEvent.scorerId, assisterId: updatedEvent.assisterId }; // Keep cleaning

    dispatchGameSession({ type: 'UPDATE_GAME_EVENT', payload: cleanUpdatedEvent });

    logger.log("Updated game event via dispatch:", updatedEvent.id);
  }, [dispatchGameSession]);

  // Session coordination handlers
  const handleOpponentNameChange = sessionCoordination.handlers.setOpponentName;
  const handleGameDateChange = sessionCoordination.handlers.setGameDate;
  const handleGameNotesChange = sessionCoordination.handlers.setGameNotes;
  const handlePlayerPositionsChange = sessionCoordination.handlers.setPlayerPositions;

  // --- Handlers for Game Structure ---
  const handleSetNumberOfPeriods = sessionCoordination.handlers.setNumberOfPeriods;
  const handleSetPeriodDuration = sessionCoordination.handlers.setPeriodDuration;

  const handleToggleTrainingResources = useCallback(() => {
    setIsTrainingResourcesOpen(prev => !prev);
  }, [setIsTrainingResourcesOpen]);

  const handleToggleRulesDirectory = useCallback(() => {
    setIsRulesDirectoryOpen(prev => !prev);
  }, [setIsRulesDirectoryOpen]);

  // handleShowAppGuide, hard reset flow, resync-from-cloud and factory reset
  // LIFTED to useAppSettingsController (L.0b) - they render/act from ClubModalsHost.


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
  const handleExportOneJson = useCallback((gameId: string) => {
    const gameData = savedGames[gameId];
    if (!gameData) {
      showToast(t('page.gameDataNotFound', { gameId, defaultValue: `Error: Could not find game data for ${gameId}` }), 'error');
      return;
    }
    exportJson(gameId, gameData, gameDataManagement.seasons, gameDataManagement.tournaments);
  }, [savedGames, showToast, t, gameDataManagement.seasons, gameDataManagement.tournaments]);

  const handleExportOneExcel = useCallback(async (gameId: string) => {
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
  }, [savedGames, showToast, t, availablePlayers, gameDataManagement.seasons, gameDataManagement.tournaments]);

  const openRosterModal = useCallback(() => {
    openRosterViaReducer();
    setHighlightRosterButton(false);
  }, [openRosterViaReducer, setHighlightRosterButton]);

  const openPlayerAssessmentModal = useCallback(() => setIsPlayerAssessmentModalOpen(true), [setIsPlayerAssessmentModalOpen]);

  const handleSavePlayerAssessment = useCallback(async (
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
  }, [currentGameId, saveAssessment]);

  const handleDeletePlayerAssessment = useCallback(async (playerId: string) => {
    if (!currentGameId) return;
    const updated = await deleteAssessment(playerId);
    if (updated) {
      setSavedGames(prev => ({ ...prev, [currentGameId]: updated }));
    }
  }, [currentGameId, deleteAssessment]);

  // Roster Management handlers for RosterSettingsModal LIFTED to
  // useRosterSettingsController (L.2) - the modal renders in ClubModalsHost.
  // Deleted-player pruning from the live game happens in the effect below
  // (observes the shared masterRoster query).


  // Authoritative per-game goalie setter, shared by the manual toggle button and
  // position-driven promotion. Enforces a single goalie across BOTH availablePlayers
  // and playersOnField, then persists. Serialized via an in-flight guard so two
  // rapid requests can't read the same stale roster and corrupt the invariant
  // (last-write-wins).
  const applyGoalieStatus = useCallback(async (playerId: string, targetGoalieStatus: boolean) => {
    const player = availablePlayers.find(p => p.id === playerId);
    if (!player) {
        logger.error(`[Page.tsx] Player ${playerId} not found in availablePlayers for goalie change.`);
        // The roster modal's error banner lifted with it (L.2) - surface via toast.
        showToast(t('rosterSettingsModal.errors.playerNotFound', 'Player not found. Cannot toggle goalie status.'), 'error');
        return;
    }
    // Already in the desired state (e.g. position promote for the current goalie) — nothing to do.
    if (player.isGoalie === targetGoalieStatus) {
      return;
    }
    if (goalieUpdateInProgressRef.current) {
      logger.debug(`[Page.tsx] goalie update already in progress, ignoring request for ${playerId}`);
      return;
    }
    goalieUpdateInProgressRef.current = true;
    logger.log(`[Page.tsx] applyGoalieStatus per-game change for ID: ${playerId}, target status: ${targetGoalieStatus}`);

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
      const updatedFieldPlayers = fieldStateRef.current.playersOnField.map(fieldPlayer => {
        const updatedAvailablePlayer = updatedAvailablePlayers.find(p => p.id === fieldPlayer.id);
        return updatedAvailablePlayer ? { ...fieldPlayer, isGoalie: updatedAvailablePlayer.isGoalie } : fieldPlayer;
      });
      setPlayersOnField(updatedFieldPlayers);

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
          playerPositions: gameSessionState.playerPositions,
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
          opponents: fieldStateRef.current.opponents,
          drawings: fieldStateRef.current.drawings,
          tacticalDiscs: fieldStateRef.current.tacticalDiscs,
          tacticalDrawings: fieldStateRef.current.tacticalDrawings,
          tacticalBallPosition: fieldStateRef.current.tacticalBallPosition,
        }, userId);

        // Invalidate React Query cache to update LoadGameModal
        queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });
      }

      logger.log(`[Page.tsx] per-game goalie change success for ${playerId}.`);
    } catch (error) {
      logger.error(`[Page.tsx] Exception during per-game goalie change of ${playerId}:`, error);
    } finally {
      goalieUpdateInProgressRef.current = false;
    }
  }, [
    // Data dependencies (values that change the function's behavior)
    availablePlayers, currentGameId, gameSessionState, t, userId, showToast,
    // Setter dependencies (React guarantees these are stable but ESLint requires them)
    setAvailablePlayers, queryClient, setPlayersOnField,
    // fieldStateRef provides playersOnField/opponents/etc. at call time (no dep needed for ref)
  ]);

  // Manual toggle button: flip the current player's goalie status.
  const handleToggleGoalieForModal = useCallback(async (playerId: string) => {
    const player = availablePlayers.find(p => p.id === playerId);
    if (!player) {
      logger.error(`[Page.tsx] Player ${playerId} not found in availablePlayers for goalie toggle.`);
      showToast(t('rosterSettingsModal.errors.playerNotFound', 'Player not found. Cannot toggle goalie status.'), 'error');
      return;
    }
    await applyGoalieStatus(playerId, !player.isGoalie);
  }, [availablePlayers, applyGoalieStatus, showToast, t]);

  // Wire the position-promotion bridge to the authoritative setter. Position
  // changes only ever PROMOTE (target = true); they never clear a goalie.
  useEffect(() => {
    assignGoalieByPositionRef.current = (playerId: string) => {
      void applyGoalieStatus(playerId, true);
    };
  }, [applyGoalieStatus]);

  // --- END Roster Management Handlers ---

  // --- NEW: Handler to Award Fair Play Card ---
  const handleAwardFairPlayCard = useCallback(async (playerId: string | null) => {
    if (!currentGameId || currentGameId === DEFAULT_GAME_ID) {
      logger.warn("Cannot award fair play card in unsaved/default state.");
      return;
    }

    let updatedAvailablePlayers = availablePlayers;
    let updatedPlayersOnField = fieldStateRef.current.playersOnField;

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
    setPlayersOnField(updatedPlayersOnField);

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
  }, [availablePlayers, saveStateToHistory, currentGameId, setAvailablePlayers, setPlayersOnField]);


  const handleUpdateSelectedPlayers = useCallback((playerIds: string[]) => {
    dispatchGameSession({ type: 'SET_SELECTED_PLAYER_IDS', payload: playerIds });

    // Remove discs from the field for players that were deselected
    const selectedSet = new Set(playerIds);
    setPlayersOnField(currentPlayers => {
      const filtered = currentPlayers.filter(p => selectedSet.has(p.id));
      if (filtered.length === currentPlayers.length) return currentPlayers;
      return filtered;
    });
  }, [dispatchGameSession, setPlayersOnField]);

  // Load the current game's plan link from the local-only store whenever the game
  // changes. On creation-from-plan the link is persisted before setCurrentGameId
  // fires (newGameHandlers awaits setPlanLink first), so this read never races it.
  // The link only counts if the plan AND its planned game still exist - otherwise
  // the "Re-apply plan" button would be a dead affordance that errors after the
  // confirm dialog. (Plan deletion also purges its links, so a dangling link is
  // already rare; this is the belt-and-braces check.)
  useEffect(() => {
    const gameId = currentGameId;
    let cancelled = false;
    void (async () => {
      if (!gameId || gameId === DEFAULT_GAME_ID) {
        if (!cancelled) setCurrentGamePlanLink(null);
        return;
      }
      try {
        const link = await getPlanLink(gameId);
        const plan = link ? await getPlan(link.planId) : null;
        const planGameExists = !!plan?.games.some(g => g.id === link?.planGameId);
        if (!cancelled) setCurrentGamePlanLink(planGameExists ? link : null);
      } catch (err) {
        logger.error('[reapplyPlan] Failed to load plan link (non-fatal)', err);
        if (!cancelled) setCurrentGamePlanLink(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentGameId]);

  // Live mirror of currentGameId for the async re-apply guards below: a re-apply
  // captured against game A must never push its lineup into a game B the coach
  // loaded while the chain was in flight.
  const reapplyGameIdRef = useRef(currentGameId);
  useEffect(() => {
    reapplyGameIdRef.current = currentGameId;
  }, [currentGameId]);

  // Shared by the per-game and bulk re-apply paths: push a rebuilt lineup into live
  // state so the coach sees it without reloading - and, critically, so the next
  // autosave snapshot persists the NEW lineup instead of writing the stale one back
  // over the storage update.
  const applyReappliedLineup = useCallback(
    (patch: Pick<AppState, 'playersOnField' | 'selectedPlayerIds' | 'formationSnapPoints'>) => {
      const snapPoints = patch.formationSnapPoints ?? [];
      setPlayersOnField(patch.playersOnField);
      setFormationSnapPoints(snapPoints);
      dispatchGameSession({ type: 'SET_SELECTED_PLAYER_IDS', payload: patch.selectedPlayerIds });
      // Rebuild sideline sub-slot visuals from the new snap points (mirrors the load path).
      const fieldPositions = snapPoints.filter(isFieldPosition);
      setSubSlots(fieldPositions.length > 0 ? generateSubSlots(fieldPositions) : []);
      // Force the live sub-prompt hook to re-read the new planned schedule.
      setPlannedSubsRefreshKey(k => k + 1);
      // Record the re-applied lineup as an undo step. Without this, one Undo tap
      // would jump straight past the confirmed re-apply to a pre-reapply snapshot
      // (and the next autosave would persist that revert); with it, undo/redo
      // treat the re-apply as a normal, reversible action.
      saveStateToHistory({
        playersOnField: patch.playersOnField,
        selectedPlayerIds: patch.selectedPlayerIds,
        formationSnapPoints: snapPoints,
      });
    },
    [setPlayersOnField, setFormationSnapPoints, dispatchGameSession, setSubSlots, saveStateToHistory],
  );

  // Playing-Time Planner (Phase 3.3): re-apply the source plan to the CURRENT game.
  // Overwrites the live lineup (field + selection + snap points) and the planned sub
  // schedule from the (possibly edited) plan, preserving everything that is "what
  // happened". The persisted copy is re-saved by the core handler; here we also push
  // the new lineup into live state so the coach sees it without reloading.
  const handleReapplyPlan = useCallback(async () => {
    if (!currentGameId || currentGameId === DEFAULT_GAME_ID) return;

    // Flush live state to storage first (PR #650 review issue 2): fields like game
    // notes sit in a debounced autosave tier, and the re-apply below reads + fully
    // rewrites the PERSISTED blob - without the flush an edit made in the last
    // ~500ms would be missing from the rewrite (self-healing on the next autosave,
    // but a crash inside that window would drop it). Silent + no error toast: a
    // failed flush just means we proceed from the last persisted copy, no worse
    // than before this guard.
    try {
      await persistence.handleQuickSaveGame(true, true);
    } catch (err) {
      logger.warn('[reapplyPlan] Pre-reapply flush failed (non-fatal)', err);
    }

    let game: AppState | null = null;
    try {
      game = await utilGetGame(currentGameId, userId);
    } catch (err) {
      logger.error('[reapplyPlan] Failed to load current game', err);
    }
    if (!game) {
      showToast(t('gameSettingsModal.reapplyPlan.errorGeneric', 'Could not re-apply the plan.'), 'error');
      return;
    }

    // saveGame/setGameSubs can reject (IndexedDB write failure, quota); without
    // this catch the rejection would be a silent no-op while every other failure
    // path here toasts (PR #650 review bug 1).
    let result: ReapplyResult;
    try {
      result = await reapplyPlanToGame(
        { getPlan, getPlanLink, saveGame: (id, g) => utilSaveGame(id, g, userId), setGameSubs },
        currentGameId,
        game,
      );
    } catch (err) {
      logger.error('[reapplyPlan] Re-apply failed', err);
      showToast(t('gameSettingsModal.reapplyPlan.errorGeneric', 'Could not re-apply the plan.'), 'error');
      return;
    }

    if (!result.ok || !result.patch) {
      const msg =
        result.reason === 'played'
          ? t('gameSettingsModal.reapplyPlan.errorPlayed', "This game has already started, so its lineup can't be re-applied.")
          : result.reason === 'plan-missing'
            ? t('gameSettingsModal.reapplyPlan.errorPlanMissing', 'The source plan was deleted, so it can no longer be re-applied.')
            : t('gameSettingsModal.reapplyPlan.errorGeneric', 'Could not re-apply the plan.');
      showToast(msg, 'error');
      return;
    }

    // Push the rebuilt lineup into live state (persisted copy already saved) -
    // unless the coach loaded a DIFFERENT game while the async chain ran, in
    // which case the live field belongs to that game and must not be overwritten.
    // The storage/cache updates below are keyed to the original game and stay valid.
    if (reapplyGameIdRef.current === currentGameId) {
      applyReappliedLineup(result.patch);
    }
    // Keep the in-memory savedGames copy AND the query cache in step with storage
    // (mirrors the bulk path - readers of savedGames state would otherwise show
    // the pre-reapply lineup until the refetch lands).
    setSavedGames(prev => ({ ...prev, [currentGameId]: { ...game!, ...result.patch } }));
    queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });

    const missing = result.missingPlayerIds?.length ?? 0;
    showToast(
      missing > 0
        ? t(
            'gameSettingsModal.reapplyPlan.successMissing',
            "Lineup updated from the plan. Not in this game's roster, skipped: {{names}}.",
            { count: missing, names: (result.missingNames ?? result.missingPlayerIds ?? []).join(', ') },
          )
        : t('gameSettingsModal.reapplyPlan.success', 'Lineup updated from the plan.'),
      'success',
    );
  }, [
    currentGameId,
    userId,
    persistence,
    showToast,
    t,
    applyReappliedLineup,
    setSavedGames,
    queryClient,
  ]);

  // Bulk re-apply is about to read + rewrite persisted game blobs in the planner.
  // Flush the currently-loaded game's debounced autosave first so an edit made in
  // the last ~500ms (notes, personnel, ...) is IN the blob the bulk path reads -
  // the same guard the per-game path applies before its own read (PR #650 r4 bug 1).
  const handleFlushLiveGame = useCallback(async () => {
    // Same guard as the per-game path: with no real game loaded (DEFAULT_GAME_ID),
    // handleQuickSaveGame's no-id branch would CREATE a phantom saved game from
    // the default workspace ("My Team vs Opponent") - there is nothing to flush.
    if (!currentGameId || currentGameId === DEFAULT_GAME_ID) return;
    try {
      await persistence.handleQuickSaveGame(true, true);
    } catch (err) {
      logger.warn('[reapplyPlan] Pre-bulk flush failed (non-fatal)', err);
    }
  }, [currentGameId, persistence]);

  // Bulk re-apply ran in the planner (Phase 3.4). If the CURRENTLY LOADED game was
  // among the updated ones, its live state is now stale - without this refresh the
  // next autosave would silently write the old lineup back over the bulk update.
  const handleLinkedGamesUpdated = useCallback(
    async (updatedIds: string[]) => {
      if (!currentGameId || currentGameId === DEFAULT_GAME_ID) return;
      if (!updatedIds.includes(currentGameId)) return;
      try {
        const stored = await utilGetGame(currentGameId, userId);
        if (!stored) return;
        // Same async guard as the per-game path: only push into live state if
        // the game this refresh was captured for is still the loaded one.
        if (reapplyGameIdRef.current === currentGameId) {
          applyReappliedLineup({
            playersOnField: stored.playersOnField ?? [],
            selectedPlayerIds: stored.selectedPlayerIds ?? [],
            formationSnapPoints: stored.formationSnapPoints ?? [],
          });
        }
        // Keep the in-memory savedGames copy in step with storage too.
        setSavedGames(prev => ({ ...prev, [currentGameId]: stored }));
      } catch (err) {
        logger.error('[reapplyPlan] Failed to refresh live state after bulk re-apply', err);
      }
    },
    [currentGameId, userId, applyReappliedLineup, setSavedGames],
  );

  // L.3c: the planner modal renders at page level (ClubModalsHost), so it
  // reaches the live match through these provider-registered hooks. Cleared
  // on unmount - from Home the planner operates on storage alone.
  //
  // Latest-handler refs + a register-once effect: registering the handlers
  // DIRECTLY would loop - their useCallback identities churn with game
  // state, and each re-registration is itself a provider state change that
  // re-renders this hook.
  const plannerFlushRef = useRef(handleFlushLiveGame);
  const plannerLinkedRef = useRef(handleLinkedGamesUpdated);
  useEffect(() => {
    plannerFlushRef.current = handleFlushLiveGame;
    plannerLinkedRef.current = handleLinkedGamesUpdated;
  });
  useEffect(() => {
    setPlannerLiveGameHooks({
      onFlushLiveGame: () => plannerFlushRef.current(),
      onLinkedGamesUpdated: (gameIds) => plannerLinkedRef.current(gameIds),
    });
    return () => setPlannerLiveGameHooks(null);
  }, [setPlannerLiveGameHooks]);

  // The re-apply action is offered only for a saved game that was created from a plan
  // and hasn't been played yet (never clobber a game that has events/score).
  const canReapplyPlan =
    !!currentGamePlanLink &&
    gameSessionState.gameStatus === 'notStarted' &&
    (gameSessionState.gameEvents?.length ?? 0) === 0;

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
  const handleOpenGameSettingsModal = useCallback(() => {
    setIsGameSettingsModalOpen(true);
  }, [setIsGameSettingsModalOpen]);

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
  const handleSetShootoutKicks = sessionCoordination.handlers.setShootoutKicks;
  const handleSetShowPositionLabels = sessionCoordination.handlers.setShowPositionLabels;
  const handleSetGamePersonnel = sessionCoordination.handlers.setGamePersonnel;

  // --- AGGREGATE EXPORT HANDLERS ---

  // Excel export wrappers shared with the host-level club-stats surface
  // (L.4): one implementation in utils/exportGames, two call sites.
  const handleExportAggregateExcel = useCallback(
    (gameIds: string[], aggregateStats: import('@/types').PlayerStatRow[]) =>
      exportAggregateStatsExcel(
        { savedGames, seasons: gameDataManagement.seasons, tournaments: gameDataManagement.tournaments, showToast, t, userId },
        gameIds,
        aggregateStats,
      ),
    [savedGames, gameDataManagement.seasons, gameDataManagement.tournaments, showToast, t, userId],
  );

  const handleExportPlayerExcel = useCallback(
    (playerId: string, playerData: import('@/types').PlayerStatRow, gameIds: string[]) =>
      exportPlayerStatsExcel(
        { savedGames, seasons: gameDataManagement.seasons, tournaments: gameDataManagement.tournaments, showToast, t, userId },
        playerId,
        playerData,
        gameIds,
      ),
    [savedGames, gameDataManagement.seasons, gameDataManagement.tournaments, showToast, t, userId],
  );

  // --- END AGGREGATE EXPORT HANDLERS ---

  // handleStartNewGameWithSetup + handleCancelNewGameSetup LIFTED to
  // useNewGameSetupController (L.3b). Confirming the setup persists the game
  // as current and the page freshly mounts the match view (enterMatch), so
  // the old in-place session apply (field clearing, LOAD_GAME_SESSION_STATE,
  // setCurrentGameId race dance, post-create roster-button highlight) is
  // retired with the render.

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
  }, [currentGameId, availablePlayers, t, openNewGameViaReducer, gameSessionState.selectedPlayerIds, setPlayerIdsForNewGame]);

  // Handler for "No Players" confirmation
  const handleNoPlayersConfirmed = useCallback(() => {
    setShowNoPlayersConfirm(false);
    openRosterViaReducer();
  }, [openRosterViaReducer]);

  // Handler for "Save Before New" confirmation - user chooses to save
  const handleSaveBeforeNewConfirmed = useCallback(async () => {
    // Ignore re-entrant taps while a save is already in flight (mobile double-tap).
    if (saveBeforeNewInFlightRef.current) {
      return;
    }
    saveBeforeNewInFlightRef.current = true;
    try {
      const saved = await persistence.handleQuickSaveGame(); // Await save to ensure it completes
      // If the save did NOT succeed, keep the confirmation open (the error toast is
      // already shown by handleQuickSaveGame) so the user can retry or cancel. Do NOT
      // proceed to new-game setup, which would discard the just-played (unsaved) game.
      if (!saved) {
        return;
      }
      setPlayerIdsForNewGame(gameSessionState.selectedPlayerIds); // Use the current selection
      setShowSaveBeforeNewConfirm(false);
      openNewGameViaReducer(); // Open setup modal after save completes
    } finally {
      // Release the guard either way so a failed save can be retried.
      saveBeforeNewInFlightRef.current = false;
    }
  }, [persistence, gameSessionState.selectedPlayerIds, openNewGameViaReducer, setPlayerIdsForNewGame]);

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
  }, [openNewGameViaReducer, gameSessionState.selectedPlayerIds, setPlayerIdsForNewGame]);

  if (debug.enabled('home')) {
    logger.log('[Home Render] highlightRosterButton:', highlightRosterButton);
    logger.log('[page.tsx] About to render PlayerBar, gameEvents for PlayerBar:', JSON.stringify(gameSessionState.gameEvents));
  }

  // handleOpenPlayerStats LIFTED to ClubModalsHost (L.2) - it sets the
  // shared selectedPlayerForStats deep-link in ModalProvider.


  const handleGameLogClick = useCallback((gameId: string) => {
    setCurrentGameId(gameId);
    // handleClosePlayerStats(); // This function no longer exists
    setIsGameStatsModalOpen(prev => !prev); // handleToggleGameStatsModal moved to useModalOrchestration
  }, [setIsGameStatsModalOpen]);

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
    plannedSubsRefreshKey,
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
    onWentToOvertimeChange: handleSetWentToOvertime,
    onShootoutKicksChange: handleSetShootoutKicks,
    onWentToPenaltiesChange: handleSetWentToPenalties,
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
    // Two-level restructure PR 0.2: "Team stats" lands on the aggregate side
    // (season tab) instead of the current game.
    // L.4: "Team stats" opens the HOST-level aggregate surface (works over
    // the match too - the match modal keeps only the current-game side).
    onOpenTeamStats: () => openClubStatsToTab('season'),
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

  const isBootstrapping = !initialLoadComplete;

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
    // Planner live-game hooks (flush/refresh) now reach the host-level
    // planner via ModalProvider registration (L.3c), not through props.
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
      canReapplyPlan,
      playerAssessments,
      availableTeams,
      orphanedGameInfo,
      gameIdentifierForSave,
      isPlayed,
      setIsPlayed,
      updateGameDetailsMutation,
      isTeamReassignModalOpen,
      setIsTeamReassignModalOpen,
      showSaveBeforeNewConfirm,
      showNoPlayersConfirm,
      setShowNoPlayersConfirm,
      showStartNewConfirm,
      setShowStartNewConfirm,
    },
    handlers: {
      handleUpdateGameEvent,
      handleExportOneExcel,
      handleExportAggregateExcel,
      handleExportPlayerExcel,
      handleGameLogClick,
      handleExportOneJson,
      handleTeamNameChange,
      handleOpponentNameChange,
      handleGameDateChange,
      handleGameLocationChange,
      handleGameTimeChange,
      handleGameNotesChange,
      handlePlayerPositionsChange,
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
      handleSetShootoutKicks,
      handleSetHomeOrAway,
      handleUpdateSelectedPlayers,
      handleReapplyPlan,
      handleSetGamePersonnel,
      handleSavePlayerAssessment,
      handleDeletePlayerAssessment,
      handleTeamReassignment,
      handleNoPlayersConfirmed,
      handleSaveBeforeNewConfirmed,
      handleSaveBeforeNewCancelled,
      handleStartNewConfirmed,
    },
  });

  // Get modalManagerProps from useModalOrchestration hook
  // (isPersonnelManagerOpen lifted to ModalProvider in L.1; isTeamManagerOpen in L.2)
  const { modalManagerProps } = modalOrchestration;

  return {
    gameContainerProps,
    modalManagerProps,
    isBootstrapping,
  };
}
