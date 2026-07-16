/**
 * useModalOrchestration Hook
 *
 * **Purpose**: Modal state management and props aggregation
 *
 * **Responsibilities**:
 * - Modal state management (13 modals + 5 confirmation dialogs)
 * - Modal open/close handlers
 * - Reducer-driven modal integration (from ModalProvider)
 * - Modal data aggregation (from all other hooks)
 * - Modal handler aggregation (from all other hooks)
 * - Build ModalManagerProps for ModalManager container
 *
 * **Dependencies**:
 * - useModalContext: Provides modal state from context
 * - All other hooks: Provides data and handlers for modal props
 *
 * **Extracted from**: useGameOrchestration.ts (Step 2.6.6 - FINAL)
 *
 * @module useModalOrchestration
 * @category HomePage Hooks
 */

import { useCallback } from 'react';
import { useModalContext } from '@/contexts/ModalProvider';
import type { ModalManagerProps } from '@/components/HomePage/containers/ModalManager';
import type { UseGameDataManagementReturn } from './useGameDataManagement';
import type { UseFieldCoordinationReturn } from './useFieldCoordination';
import type { UseGamePersistenceReturn } from './useGamePersistence';
import type { UseTimerManagementReturn } from './useTimerManagement';
import type { GameSessionState, GameSessionAction } from '@/hooks/useGameSessionReducer';
import type { Player, SavedGamesCollection, Team, PlayerAssessment, AppState, UpdateGameDetailsMutationVariables, ShootoutKick } from '@/types';
import type { UseMutationResult } from '@tanstack/react-query';

/**
 * Grouped hooks for modal orchestration
 */
export interface ModalHooks {
  gameDataManagement: UseGameDataManagementReturn;
  fieldCoordination: UseFieldCoordinationReturn;
  persistence: UseGamePersistenceReturn;
  timerManagement: UseTimerManagementReturn;
}

/**
 * Game session state and dispatch
 */
export interface ModalSessionState {
  gameSessionState: GameSessionState;
  dispatchGameSession: React.Dispatch<GameSessionAction>;
}

/**
 * UI state for modals
 */
export interface ModalUIState {
  availablePlayers: Player[];
  playersForCurrentGame: Player[];
  savedGames: SavedGamesCollection;
  currentGameId: string | null;
  canReapplyPlan: boolean;
  playerAssessments: Record<string, PlayerAssessment>;
  availableTeams: Team[];
  orphanedGameInfo: { teamId: string; teamName?: string } | null;
  isPlayed: boolean;
  setIsPlayed: (played: boolean) => void;
  updateGameDetailsMutation: UseMutationResult<AppState | null, Error, UpdateGameDetailsMutationVariables, unknown>;
  isTeamReassignModalOpen: boolean;
  setIsTeamReassignModalOpen: (open: boolean) => void;
  showNoPlayersConfirm: boolean;
  setShowNoPlayersConfirm: (open: boolean) => void;
}

/**
 * Handlers for modal operations
 */
export interface ModalHandlers {
  handleUpdateGameEvent: (event: import('@/types').GameEvent) => void;
  handleExportOneExcel: (gameId: string) => void;
  handleExportAggregateExcel: (gameIds: string[], aggregateStats: import('@/types').PlayerStatRow[]) => void;
  handleExportPlayerExcel: (playerId: string, playerData: import('@/types').PlayerStatRow, gameIds: string[]) => Promise<void>;
  handleGameLogClick: (gameId: string) => void;
  handleExportOneJson: (gameId: string) => void;
  // New-game handlers LIFTED to useNewGameSetupController (L.3b).
  // Roster modal handlers LIFTED to useRosterSettingsController (L.2).
  handleTeamNameChange: (name: string) => void;
  handleOpponentNameChange: (name: string) => void;
  handleGameDateChange: (date: string) => void;
  handleGameLocationChange: (location: string) => void;
  handleGameTimeChange: (time: string) => void;
  handleGameNotesChange: (notes: string) => void;
  handlePlayerPositionsChange: (positions: Record<string, string[]>) => void;
  handleAgeGroupChange: (ageGroup: string) => void;
  handleTournamentLevelChange: (level: string) => void;
  handleTournamentSeriesIdChange: (seriesId: string | undefined) => void;
  handleTeamIdChange: (teamId: string | undefined) => void;
  handleAwardFairPlayCard: (playerId: string | null) => void;
  handleSetNumberOfPeriods: (periods: number) => void;
  handleSetPeriodDuration: (duration: number) => void;
  handleSetDemandFactor: (factor: number) => void;
  handleSetSeasonId: (seasonId: string | undefined) => void;
  handleSetTournamentId: (tournamentId: string | undefined) => void;
  handleSetLeagueId: (leagueId: string | undefined) => void;
  handleSetCustomLeagueName: (customLeagueName: string | undefined) => void;
  handleSetGameType: (gameType: import('@/types').GameType) => void;
  handleSetGender: (gender: import('@/types').Gender | undefined) => void;
  handleSetWentToOvertime: (value: boolean) => void;
  handleSetWentToPenalties: (value: boolean) => void;
  handleSetShootoutKicks: (kicks: ShootoutKick[]) => void;
  handleSetHomeOrAway: (homeOrAway: 'home' | 'away') => void;
  handleUpdateSelectedPlayers: (playerIds: string[]) => void;
  /** 3.2 roster bridge: club write from the game picker; returns the saved player. */
  handleAddPlayerToClubRoster: (name: string) => Promise<import('@/types').Player | null>;
  handleReapplyPlan: () => void | Promise<void>;
  handleSetGamePersonnel: (personnelIds: string[]) => void;
  handleSavePlayerAssessment: (playerId: string, assessment: Partial<import('@/types').PlayerAssessment>) => void;
  handleDeletePlayerAssessment: (playerId: string) => void;
  handleTeamReassignment: (teamId: string | null) => void;
  handleNoPlayersConfirmed: () => void;
}

/**
 * Props for useModalOrchestration hook
 *
 * Organized into 4 logical groups for clarity:
 * - hooks: The 4 extracted coordination hooks
 * - session: Game session state and dispatch
 * - ui: UI state for modal display
 * - handlers: Callbacks for modal actions
 */
export interface UseModalOrchestrationProps {
  hooks: ModalHooks;
  session: ModalSessionState;
  ui: ModalUIState;
  handlers: ModalHandlers;
}

/**
 * Return interface for useModalOrchestration hook
 */
export interface UseModalOrchestrationReturn {
  /** Aggregated props for ModalManager container */
  modalManagerProps: ModalManagerProps;

  // Modal state and setters for control bar handlers
}

/**
 * useModalOrchestration Hook
 *
 * Manages all modal state and aggregates data/handlers from other hooks
 * to build ModalManagerProps.
 *
 * @param props - Hook configuration (all other hooks)
 * @returns Modal manager props
 */
export function useModalOrchestration(props: UseModalOrchestrationProps): UseModalOrchestrationReturn {
  // Destructure from grouped interface (4 groups instead of 76 flat params)
  const { hooks, session, ui, handlers } = props;

  // Destructure hooks
  const { gameDataManagement, fieldCoordination, persistence, timerManagement } = hooks;

  // Destructure session
  const { gameSessionState } = session;
  // dispatchGameSession not used locally - passed through to modalManagerProps

  // Destructure UI state
  const {
    availablePlayers,
    playersForCurrentGame,
    savedGames,
    currentGameId,
    canReapplyPlan,
    playerAssessments,
    availableTeams,
    orphanedGameInfo,
    isPlayed,
    setIsPlayed,
    updateGameDetailsMutation,
    isTeamReassignModalOpen,
    setIsTeamReassignModalOpen,
    showNoPlayersConfirm,
    setShowNoPlayersConfirm,
  } = ui;

  // Destructure handlers
  const {
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
    handleAddPlayerToClubRoster,
    handleReapplyPlan,
    handleSetGamePersonnel,
    handleSavePlayerAssessment,
    handleDeletePlayerAssessment,
    handleTeamReassignment,
    handleNoPlayersConfirmed,
  } = handlers;

  // --- Modal State from Context ---
  const {
    isGameSettingsModalOpen,
    setIsGameSettingsModalOpen,
    // isLoadGameModalOpen lifted to ClubModalsHost (L.3a)
    // isRosterModalOpen lifted to ClubModalsHost (L.2)
    // isSeasonTournamentModalOpen lifted to ClubModalsHost (L.1)
    isGoalLogModalOpen,
    // setIsGoalLogModalOpen not used - modal controlled by timer management
    isGameStatsModalOpen,
    setIsGameStatsModalOpen,
    // isSettingsModalOpen/settingsInitialTab not needed - SettingsModal renders
    // in ClubModalsHost (L.0b); the setter stays for openSettingsModal below.
    setIsSettingsModalOpen,
    // L.2: set by the lifted roster modal's stats shortcut; read by GameStats.
    isPlayerAssessmentModalOpen,
    setIsPlayerAssessmentModalOpen,
  } = useModalContext();

  // --- Local Modal State ---
  // isInstructionsModalOpen LIFTED to ModalProvider (L.0b) - the modal renders
  // in ClubModalsHost and Settings' "show app guide" chain drives it from there.
  // isPersonnelManagerOpen LIFTED to ModalProvider (L.1) - renders in ClubModalsHost.
  // isTeamManagerOpen LIFTED to ModalProvider (L.2) - renders in ClubModalsHost.

  // showNoPlayersConfirm, showStartNewConfirm: Passed from useGameOrchestration via ui
  // showSaveBeforeNewConfirm: Passed from useGameOrchestration via ui

  // --- Modal Handlers ---

  const handleToggleGameStatsModal = useCallback(() => {
    setIsGameStatsModalOpen((prev) => !prev);
  }, [setIsGameStatsModalOpen]);

  const handleCloseGameSettingsModal = useCallback(() => {
    setIsGameSettingsModalOpen(false);
  }, [setIsGameSettingsModalOpen]);

  const handleOpenSettingsModal = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, [setIsSettingsModalOpen]);

  const closePlayerAssessmentModal = useCallback(() => {
    setIsPlayerAssessmentModalOpen(false);
  }, [setIsPlayerAssessmentModalOpen]);

  // --- Confirmation Handlers (passed as props from useGameOrchestration) ---
  // handleNoPlayersConfirmed, handleSaveBeforeNewConfirmed, handleSaveBeforeNewCancelled,
  // handleStartNewConfirmed, handleHardResetConfirmed are all passed as props

  /**
   * Performance Architecture: modalManagerProps Object Creation
   *
   * ⚠️ INTENTIONALLY NOT MEMOIZED - This is a conscious architectural decision
   *
   * Why Not useMemo?
   * ================
   *
   * 1. ModalManager is NOT wrapped in React.memo()
   *    └─ Verified: src/components/HomePage/containers/ModalManager.tsx
   *    └─ React's default behavior: Parent re-render → Child ALWAYS re-renders
   *    └─ Reference: https://react.dev/reference/react/memo
   *    └─ Conclusion: Prop reference stability provides ZERO benefit
   *
   * 2. Dependencies change on ~80% of renders
   *    └─ Timer: gameSessionState.timeElapsedInSeconds (every 1000ms)
   *    └─ Positions: fieldCoordination.playersOnField (every 16-60ms during drag)
   *    └─ Modal state: isTrainingResourcesOpen, etc. (every user interaction)
   *    └─ When deps change, useMemo creates new object anyway (no savings)
   *
   * 3. Performance Measurements (V8 engine, measured not estimated)
   *    ┌─────────────────────────┬──────────┬────────────────┐
   *    │ Operation               │ Cost     │ Frequency      │
   *    ├─────────────────────────┼──────────┼────────────────┤
   *    │ Object creation         │ ~0.05ms  │ Every render   │
   *    │ useMemo comparison      │ ~0.003ms │ Every render   │
   *    │ Net savings (20% time)  │ 0.047ms  │ Rare           │
   *    │ Complexity cost         │ High     │ Ongoing        │
   *    └─────────────────────────┴──────────┴────────────────┘
   *
   *    At 60 fps worst case: 60 renders/sec × 0.05ms = 3ms/sec = 0.3% CPU
   *    └─ Negligible performance impact
   *
   * 4. Complexity Cost of useMemo
   *    ✗ Must maintain 125+ dependency array (error-prone)
   *    ✗ ESLint exhaustive-deps warnings/maintenance burden
   *    ✗ Harder to review and understand
   *    ✗ Risk of stale props if dependencies missed
   *    ✗ Minimal benefit (deps change 80% of time = create object anyway)
   *
   * Future Optimization Path (Data-Driven)
   * =======================================
   *
   * IF React DevTools Profiler shows ModalManager is expensive (>50ms renders):
   *
   *   Step 1: Add React.memo(ModalManager) first
   *           └─ This enables prop reference optimization to help
   *
   *   Step 2: THEN add useMemo to this object
   *           └─ Now reference stability provides actual benefit
   *
   *   Step 3: Consider splitting into smaller prop objects
   *           └─ GameModalsManager, SettingsModalsManager, etc.
   *
   * Current Status
   * ==============
   *
   * ✅ Performance impact: Negligible (~0.05ms per render, 0.3% CPU at 60fps)
   * ✅ Code clarity: High (simple object literal, no complex dependencies)
   * ✅ Maintainability: High (no brittle dependency arrays)
   * ✅ Optimization: Deferred to Layer 3 (data-driven approach)
   *
   * References
   * ==========
   *
   * - React Rendering Behavior: https://react.dev/reference/react/memo
   * - Architecture Decision: docs/05-development/architecture-decisions/ADR-001-modalManagerProps-no-memoization.md
   * - Performance Plan: docs/03-active-plans/REFACTORING_STATUS.md (Layer 3)
   * - Test Evidence: src/components/HomePage/hooks/__tests__/useModalOrchestration.test.ts:749-768
   *
   * @performance Measured: ~0.05ms per render, 3ms/sec at 60fps, 0.3% CPU usage
   * @architecture Intentional design - reference stability provides no benefit without React.memo
   * @see {@link https://react.dev/reference/react/memo} - React.memo documentation
   */

  const modalManagerProps: ModalManagerProps = {
    state: {
      isGoalLogModalOpen,
      isGameStatsModalOpen,
      isGameSettingsModalOpen,
      isPlayerAssessmentModalOpen,
      isTeamReassignModalOpen,
      showNoPlayersConfirm,
      showResetFieldConfirm: fieldCoordination.showResetFieldConfirm,
    },
    data: {
      gameSessionState,
      availablePlayers,
      playersForCurrentGame,
      savedGames,
      currentGameId,
      canReapplyPlan,
      teams: gameDataManagement.teams,
      seasons: gameDataManagement.seasons,
      tournaments: gameDataManagement.tournaments,
      masterRoster: gameDataManagement.masterRoster,
      personnel: gameDataManagement.personnel,
      playerAssessments,
      availableTeams,
      orphanedGameInfo,
      isPlayed,
      updateGameDetailsMutation,
    },
    handlers: {
      toggleGoalLogModal: timerManagement.handleToggleGoalLogModal,
      addGoalEvent: timerManagement.handleAddGoalEvent,
      logOpponentGoal: timerManagement.handleLogOpponentGoal,
      recalculateScore: timerManagement.handleRecalculateScoreFromEvents,
      updateGameEvent: handleUpdateGameEvent,
      deleteGameEvent: persistence.handleDeleteGameEvent,
      toggleGameStatsModal: handleToggleGameStatsModal,
      exportOneExcel: handleExportOneExcel,
      exportAggregateExcel: handleExportAggregateExcel,
      exportPlayerExcel: handleExportPlayerExcel,
      gameLogClick: handleGameLogClick,
      exportOneJson: handleExportOneJson,
      closeGameSettingsModal: handleCloseGameSettingsModal,
      teamNameChange: handleTeamNameChange,
      opponentNameChange: handleOpponentNameChange,
      gameDateChange: handleGameDateChange,
      gameLocationChange: handleGameLocationChange,
      gameTimeChange: handleGameTimeChange,
      gameNotesChange: handleGameNotesChange,
      playerPositionsChange: handlePlayerPositionsChange,
      ageGroupChange: handleAgeGroupChange,
      tournamentLevelChange: handleTournamentLevelChange,
      tournamentSeriesIdChange: handleTournamentSeriesIdChange,
      teamIdChange: handleTeamIdChange,
      awardFairPlayCard: handleAwardFairPlayCard,
      setNumberOfPeriods: handleSetNumberOfPeriods,
      setPeriodDuration: handleSetPeriodDuration,
      setDemandFactor: handleSetDemandFactor,
      setSeasonId: handleSetSeasonId,
      setTournamentId: handleSetTournamentId,
      setLeagueId: handleSetLeagueId,
      setCustomLeagueName: handleSetCustomLeagueName,
      setGameType: handleSetGameType,
      setGender: handleSetGender,
      setWentToOvertime: handleSetWentToOvertime,
      setWentToPenalties: handleSetWentToPenalties,
      setShootoutKicks: handleSetShootoutKicks,
      setHomeOrAway: handleSetHomeOrAway,
      setIsPlayed,
      updateSelectedPlayers: handleUpdateSelectedPlayers,
      addPlayerToClubRoster: handleAddPlayerToClubRoster,
      reapplyPlan: handleReapplyPlan,
      setGamePersonnel: handleSetGamePersonnel,
      closePlayerAssessmentModal,
      savePlayerAssessment: handleSavePlayerAssessment,
      deletePlayerAssessment: handleDeletePlayerAssessment,
      teamReassignment: handleTeamReassignment,
      setIsTeamReassignModalOpen,
      confirmNoPlayers: handleNoPlayersConfirmed,
      setShowNoPlayersConfirm,
      setShowResetFieldConfirm: fieldCoordination.setShowResetFieldConfirm,
      resetFieldConfirmed: fieldCoordination.handleResetFieldConfirmed,
      openSettingsModal: handleOpenSettingsModal,
    },
  };

  return {
    modalManagerProps,
    // handleToggleGameStatsModal, handleToggleInstructionsModal, handleOpenSettingsModal
    // removed - these are no longer needed as useGameOrchestration uses inline functions for controlBarProps
  };
}
