/**
 * Tests for useModalOrchestration hook
 *
 * @critical - Modal state management for 13 modals + 5 confirmation dialogs
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useModalOrchestration } from '../useModalOrchestration';
import type { UseModalOrchestrationProps } from '../useModalOrchestration';
import { ModalProvider } from '@/contexts/ModalProvider';
import React from 'react';
import type { UseGameDataManagementReturn } from '../useGameDataManagement';
import type { UseFieldCoordinationReturn } from '../useFieldCoordination';
import type { UseGamePersistenceReturn } from '../useGamePersistence';
import type { UseTimerManagementReturn } from '../useTimerManagement';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import type { Team, Season, Tournament, Player, Personnel, AppState } from '@/types';
import type { UseMutationResult } from '@tanstack/react-query';

// Wrapper component that provides ModalContext
const createWrapper = () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(ModalProvider, null, children);
  return Wrapper;
};

// Simple mock data factories
const createMockTeam = (overrides?: Partial<Team>): Team => ({
  id: 'team-1',
  name: 'Test Team',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ...overrides,
});

const createMockSeason = (overrides?: Partial<Season>): Season => ({
  id: 'season-1',
  name: '2024 Season',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  ...overrides,
});

const createMockTournament = (overrides?: Partial<Tournament>): Tournament => ({
  id: 'tournament-1',
  name: 'Test Tournament',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  ...overrides,
});

const createMockPlayer = (overrides?: Partial<Player>): Player => ({
  id: 'player-1',
  name: 'Test Player',
  jerseyNumber: '10',
  notes: '',
  nickname: '',
  ...overrides,
});

const createMockPersonnel = (overrides?: Partial<Personnel>): Personnel => ({
  id: 'personnel-1',
  name: 'Test Coach',
  role: 'head_coach',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ...overrides,
});

// Create comprehensive mock props following the pattern from other hook tests
const createMockProps = (overrides?: Partial<UseModalOrchestrationProps>): UseModalOrchestrationProps => {
  const mockGameDataManagement: UseGameDataManagementReturn = {
    teams: [createMockTeam()],
    seasons: [createMockSeason()],
    tournaments: [createMockTournament()],
    masterRoster: [createMockPlayer()],
    personnel: [createMockPersonnel()],
    savedGames: {},
    currentGameIdSetting: null,
    isLoading: false,
    error: null,
    personnelManager: {
      addPersonnel: jest.fn(),
      updatePersonnel: jest.fn(),
      removePersonnel: jest.fn(),
      isLoading: false,
      personnel: [],
      error: null,
    },
    mutationResults: {
      addSeason: { mutate: jest.fn() } as unknown as UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>,
      addTournament: { mutate: jest.fn() } as unknown as UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>,
      updateSeason: { mutate: jest.fn() } as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
      deleteSeason: { mutate: jest.fn() } as unknown as UseMutationResult<boolean, Error, string, unknown>,
      updateTournament: { mutate: jest.fn() } as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
      deleteTournament: { mutate: jest.fn() } as unknown as UseMutationResult<boolean, Error, string, unknown>,
    },
  };

  const mockFieldCoordination = {
    playersOnField: [],
    opponents: [],
    drawings: [],
    draggingPlayerFromBarInfo: null,
    isDrawingEnabled: false,
    isTacticsBoardView: false,
    tacticalDiscs: [],
    tacticalDrawings: [],
    tacticalBallPosition: null,
    showResetFieldConfirm: false,
    setShowResetFieldConfirm: jest.fn(),
    handlePlayerMove: jest.fn(),
    handlePlayerMoveEnd: jest.fn(),
    handlePlayerRemove: jest.fn(),
    handleDropOnField: jest.fn(),
    handlePlayerDragStartFromBar: jest.fn(),
    handlePlayerTapInBar: jest.fn(),
    handleAddOpponent: jest.fn(),
    handleOpponentRemove: jest.fn(),
    handleOpponentMove: jest.fn(),
    handleOpponentMoveEnd: jest.fn(),
    handleDrawingStart: jest.fn(),
    handleDrawingEnd: jest.fn(),
    handleToggleDrawingMode: jest.fn(),
    handleResetFieldClick: jest.fn(),
    handleAddTacticalDisc: jest.fn(),
    handleToggleTacticsBoard: jest.fn(),
  } as unknown as UseFieldCoordinationReturn;

  const mockPersistence: UseGamePersistenceReturn = {
    handleLoadGame: jest.fn(),
    handleDeleteGame: jest.fn(),
    handleDeleteGameEvent: jest.fn(),
    handleQuickSaveGame: jest.fn(),
    isGameLoading: false,
    gameLoadError: null,
    isGameDeleting: false,
    gameDeleteError: null,
    processingGameId: null,
  };

  const mockTimerManagement: UseTimerManagementReturn = {
    timeElapsedInSeconds: 0,
    isTimerRunning: false,
    subAlertLevel: 'none' as const,
    lastSubConfirmationTimeSeconds: 0,
    showLargeTimerOverlay: false,
    handleStartPauseTimer: jest.fn(),
    handleResetTimer: jest.fn(),
    handleSubstitutionMade: jest.fn(),
    handleSetSubInterval: jest.fn(),
    handleToggleLargeTimerOverlay: jest.fn(),
    handleToggleGoalLogModal: jest.fn(),
    handleAddGoalEvent: jest.fn(),
    handleLogOpponentGoal: jest.fn(),
    timerInteractions: {
      toggleLargeOverlay: jest.fn(),
      toggleGoalLogModal: jest.fn(),
      logOpponentGoal: jest.fn(),
      substitutionMade: jest.fn(),
      setSubInterval: jest.fn(),
      startPauseTimer: jest.fn(),
      resetTimer: jest.fn(),
    },
  };

  const mockGameSessionState: GameSessionState = {
    teamName: 'Test Team',
    opponentName: 'Opponent',
    gameDate: '2024-01-01',
    homeScore: 0,
    awayScore: 0,
    gameNotes: '',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 45,
    currentPeriod: 1,
    gameStatus: 'notStarted',
    selectedPlayerIds: [],
    gamePersonnel: [],
    seasonId: '',
    tournamentId: '',
    demandFactor: 5,
    gameEvents: [],
    timeElapsedInSeconds: 0,
    startTimestamp: null,
    isTimerRunning: false,
    subIntervalMinutes: 15,
    nextSubDueTimeSeconds: 900,
    subAlertLevel: 'none',
    lastSubConfirmationTimeSeconds: 0,
    showPlayerNames: true,
  };

  return {
    gameDataManagement: mockGameDataManagement,
    fieldCoordination: mockFieldCoordination,
    persistence: mockPersistence,
    timerManagement: mockTimerManagement,
    gameSessionState: mockGameSessionState,
    dispatchGameSession: jest.fn(),
    availablePlayers: [createMockPlayer()],
    playersForCurrentGame: [],
    savedGames: {},
    currentGameId: null,
    playerAssessments: {},
    selectedPlayerForStats: null,
    setSelectedPlayerForStats: jest.fn(),
    playerIdsForNewGame: null,
    newGameDemandFactor: 5,
    setNewGameDemandFactor: jest.fn(),
    availableTeams: [createMockTeam()],
    orphanedGameInfo: null,
    appLanguage: 'en',
    setAppLanguage: jest.fn(),
    defaultTeamNameSetting: 'Test Team',
    setDefaultTeamNameSetting: jest.fn(),
    gameIdentifierForSave: 'game-123',
    isPlayed: false,
    setIsPlayed: jest.fn(),
    isRosterUpdating: false,
    rosterError: null,
    isLoadingGamesList: false,
    loadGamesListError: null,
    updateGameDetailsMutation: { mutate: jest.fn() } as unknown as UseMutationResult<AppState | null, Error, unknown, unknown>,
    isTeamReassignModalOpen: false,
    setIsTeamReassignModalOpen: jest.fn(),
    setSelectedTeamForRoster: jest.fn(),
    showSaveBeforeNewConfirm: false,
    handleUpdateGameEvent: jest.fn(),
    handleExportOneExcel: jest.fn(),
    handleExportAggregateExcel: jest.fn(),
    handleExportPlayerExcel: jest.fn(),
    handleGameLogClick: jest.fn(),
    handleExportOneJson: jest.fn(),
    handleStartNewGameWithSetup: jest.fn(),
    handleCancelNewGameSetup: jest.fn(),
    // closeRosterModal: removed - defined locally in useModalOrchestration
    // closePlayerAssessmentModal: removed - defined locally in useModalOrchestration
    handleUpdatePlayerForModal: jest.fn(),
    handleRenamePlayerForModal: jest.fn(),
    handleSetJerseyNumberForModal: jest.fn(),
    handleSetPlayerNotesForModal: jest.fn(),
    handleRemovePlayerForModal: jest.fn(),
    handleAddPlayerForModal: jest.fn(),
    handleOpenPlayerStats: jest.fn(),
    // handleCloseSeasonTournamentModal: removed - defined locally in useModalOrchestration
    // handleCloseGameSettingsModal: removed - defined locally in useModalOrchestration
    handleTeamNameChange: jest.fn(),
    handleOpponentNameChange: jest.fn(),
    handleGameDateChange: jest.fn(),
    handleGameLocationChange: jest.fn(),
    handleGameTimeChange: jest.fn(),
    handleGameNotesChange: jest.fn(),
    handleAgeGroupChange: jest.fn(),
    handleTournamentLevelChange: jest.fn(),
    handleAwardFairPlayCard: jest.fn(),
    handleSetNumberOfPeriods: jest.fn(),
    handleSetPeriodDuration: jest.fn(),
    handleSetDemandFactor: jest.fn(),
    handleSetSeasonId: jest.fn(),
    handleSetTournamentId: jest.fn(),
    handleSetHomeOrAway: jest.fn(),
    handleUpdateSelectedPlayers: jest.fn(),
    handleSetGamePersonnel: jest.fn(),
    // handleCloseSettingsModal: removed - defined locally in useModalOrchestration
    handleShowAppGuide: jest.fn(),
    handleHardResetApp: jest.fn(),
    // handleOpenSettingsModal: removed - defined locally in useModalOrchestration
    handleSavePlayerAssessment: jest.fn(),
    handleDeletePlayerAssessment: jest.fn(),
    handleTeamReassignment: jest.fn(),
    handleCreateBackup: jest.fn(),
    onDataImportSuccess: jest.fn(),
    handleManageTeamRosterFromNewGame: jest.fn(),
    handleNoPlayersConfirmed: jest.fn(),
    handleHardResetConfirmed: jest.fn(),
    handleSaveBeforeNewConfirmed: jest.fn(),
    handleSaveBeforeNewCancelled: jest.fn(),
    handleStartNewConfirmed: jest.fn(),
    ...overrides,
  };
};

describe('useModalOrchestration', () => {
  describe('Hook Interface', () => {
    /**
     * Verify the hook returns all required properties
     * @critical
     */
    it('should return all required properties', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      expect(result.current).toHaveProperty('modalManagerProps');
      expect(result.current).toHaveProperty('isInstructionsModalOpen');
      expect(result.current).toHaveProperty('setIsInstructionsModalOpen');
      expect(result.current).toHaveProperty('isPersonnelManagerOpen');
      expect(result.current).toHaveProperty('setIsPersonnelManagerOpen');
      expect(result.current).toHaveProperty('isTeamManagerOpen');
      expect(result.current).toHaveProperty('setIsTeamManagerOpen');
    });

    /**
     * Verify modalManagerProps contains all required sections
     * @critical
     */
    it('should return modalManagerProps with state, data, and handlers', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { modalManagerProps } = result.current;

      expect(modalManagerProps).toHaveProperty('state');
      expect(modalManagerProps).toHaveProperty('data');
      expect(modalManagerProps).toHaveProperty('handlers');
    });

    /**
     * Verify state section contains all modal flags
     * @critical
     */
    it('should include all modal state flags in modalManagerProps.state', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { state } = result.current.modalManagerProps;

      // 13 modals
      expect(state).toHaveProperty('isTrainingResourcesOpen');
      expect(state).toHaveProperty('isInstructionsModalOpen');
      expect(state).toHaveProperty('isPersonnelManagerOpen');
      expect(state).toHaveProperty('isTeamManagerOpen');
      expect(state).toHaveProperty('isGoalLogModalOpen');
      expect(state).toHaveProperty('isGameStatsModalOpen');
      expect(state).toHaveProperty('isLoadGameModalOpen');
      expect(state).toHaveProperty('isNewGameSetupModalOpen');
      expect(state).toHaveProperty('isRosterModalOpen');
      expect(state).toHaveProperty('isSeasonTournamentModalOpen');
      expect(state).toHaveProperty('isGameSettingsModalOpen');
      expect(state).toHaveProperty('isSettingsModalOpen');
      expect(state).toHaveProperty('isPlayerAssessmentModalOpen');
      expect(state).toHaveProperty('isTeamReassignModalOpen');

      // 5 confirmation dialogs
      expect(state).toHaveProperty('showNoPlayersConfirm');
      expect(state).toHaveProperty('showHardResetConfirm');
      expect(state).toHaveProperty('showSaveBeforeNewConfirm');
      expect(state).toHaveProperty('showStartNewConfirm');
      expect(state).toHaveProperty('showResetFieldConfirm');
    });
  });

  describe('Modal State Initialization', () => {
    /**
     * Verify all modals start closed
     * @critical
     */
    it('should initialize all local modal states as false', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      expect(result.current.isInstructionsModalOpen).toBe(false);
      expect(result.current.isPersonnelManagerOpen).toBe(false);
      expect(result.current.isTeamManagerOpen).toBe(false);
    });

    /**
     * Verify context modal states are properly integrated
     * @integration
     */
    it('should integrate modal states from ModalContext', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { state } = result.current.modalManagerProps;

      // These come from ModalProvider context
      expect(state.isGameSettingsModalOpen).toBe(false);
      expect(state.isLoadGameModalOpen).toBe(false);
      expect(state.isRosterModalOpen).toBe(false);
      expect(state.isSeasonTournamentModalOpen).toBe(false);
      expect(state.isTrainingResourcesOpen).toBe(false);
      expect(state.isGoalLogModalOpen).toBe(false);
      expect(state.isGameStatsModalOpen).toBe(false);
      expect(state.isNewGameSetupModalOpen).toBe(false);
      expect(state.isSettingsModalOpen).toBe(false);
      expect(state.isPlayerAssessmentModalOpen).toBe(false);
    });

    /**
     * Verify confirmation dialog states initialize correctly
     * @critical
     */
    it('should initialize all confirmation dialog states as false', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { state } = result.current.modalManagerProps;

      expect(state.showNoPlayersConfirm).toBe(false);
      expect(state.showHardResetConfirm).toBe(false);
      expect(state.showSaveBeforeNewConfirm).toBe(false);
      expect(state.showStartNewConfirm).toBe(false);
      expect(state.showResetFieldConfirm).toBe(false);
    });
  });

  describe('Modal Handlers', () => {
    /**
     * Test instructions modal toggle functionality
     * @critical
     */
    it('should toggle instructions modal open/closed', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      expect(result.current.isInstructionsModalOpen).toBe(false);

      // Open modal
      act(() => {
        result.current.setIsInstructionsModalOpen(true);
      });

      expect(result.current.isInstructionsModalOpen).toBe(true);

      // Close modal
      act(() => {
        result.current.setIsInstructionsModalOpen(false);
      });

      expect(result.current.isInstructionsModalOpen).toBe(false);
    });

    /**
     * Test personnel manager modal toggle
     * @critical
     */
    it('should toggle personnel manager open/closed', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPersonnelManagerOpen).toBe(false);

      act(() => {
        result.current.setIsPersonnelManagerOpen(true);
      });

      expect(result.current.isPersonnelManagerOpen).toBe(true);

      act(() => {
        result.current.setIsPersonnelManagerOpen(false);
      });

      expect(result.current.isPersonnelManagerOpen).toBe(false);
    });

    /**
     * Test team manager modal toggle
     * @critical
     */
    it('should toggle team manager open/closed', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      expect(result.current.isTeamManagerOpen).toBe(false);

      act(() => {
        result.current.setIsTeamManagerOpen(true);
      });

      expect(result.current.isTeamManagerOpen).toBe(true);

      act(() => {
        result.current.setIsTeamManagerOpen(false);
      });

      expect(result.current.isTeamManagerOpen).toBe(false);
    });

    /**
     * Test that modal handler functions are stable (memoized)
     * @performance
     */
    it('should maintain stable handler references across renders', () => {
      const props = createMockProps();
      const { result, rerender } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const firstHandlers = result.current.modalManagerProps.handlers;

      // Trigger re-render
      rerender();

      const secondHandlers = result.current.modalManagerProps.handlers;

      // Handler functions should be the same reference (memoized)
      expect(firstHandlers.toggleTrainingResources).toBe(secondHandlers.toggleTrainingResources);
      expect(firstHandlers.toggleInstructionsModal).toBe(secondHandlers.toggleInstructionsModal);
      expect(firstHandlers.closeTeamManagerModal).toBe(secondHandlers.closeTeamManagerModal);
    });
  });

  describe('Props Aggregation', () => {
    /**
     * Verify data is properly aggregated from all source hooks
     * @integration
     */
    it('should aggregate data from gameDataManagement', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { data } = result.current.modalManagerProps;

      expect(data.teams).toEqual(props.gameDataManagement.teams);
      expect(data.seasons).toEqual(props.gameDataManagement.seasons);
      expect(data.tournaments).toEqual(props.gameDataManagement.tournaments);
      expect(data.masterRoster).toEqual(props.gameDataManagement.masterRoster);
      expect(data.personnel).toEqual(props.gameDataManagement.personnel);
    });

    /**
     * Verify field coordination data is included
     * @integration
     */
    it('should include field coordination state', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { state } = result.current.modalManagerProps;

      expect(state.showResetFieldConfirm).toBe(props.fieldCoordination.showResetFieldConfirm);
    });

    /**
     * Verify persistence state is included
     * @integration
     */
    it('should include persistence loading states', () => {
      const mockProps = createMockProps({
        persistence: {
          handleLoadGame: jest.fn(),
          handleDeleteGame: jest.fn(),
          handleDeleteGameEvent: jest.fn(),
          handleQuickSaveGame: jest.fn(),
          isGameLoading: true,
          gameLoadError: 'Load error',
          isGameDeleting: false,
          gameDeleteError: null,
          processingGameId: 'game-123',
        },
      });

      const { result } = renderHook(() => useModalOrchestration(mockProps), {
        wrapper: createWrapper(),
      });

      const { data } = result.current.modalManagerProps;

      expect(data.loadGameState.isGameLoading).toBe(true);
      expect(data.loadGameState.gameLoadError).toBe('Load error');
      expect(data.loadGameState.processingGameId).toBe('game-123');
    });

    /**
     * Verify game session state is passed through
     * @integration
     */
    it('should pass through gameSessionState unchanged', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { data } = result.current.modalManagerProps;

      expect(data.gameSessionState).toBe(props.gameSessionState);
    });

    /**
     * Verify all handler props are passed through
     * @integration
     */
    it('should pass through all handler functions from props', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { handlers } = result.current.modalManagerProps;

      // Verify key handlers are present (spot check, not exhaustive)
      expect(handlers.updateGameEvent).toBe(props.handleUpdateGameEvent);
      expect(handlers.exportOneExcel).toBe(props.handleExportOneExcel);
      expect(handlers.loadGame).toBe(props.persistence.handleLoadGame);
      expect(handlers.deleteGame).toBe(props.persistence.handleDeleteGame);
      expect(handlers.startNewGameWithSetup).toBe(props.handleStartNewGameWithSetup);
    });
  });

  describe('Confirmation Dialog Handlers', () => {
    /**
     * Verify confirmation handlers are properly integrated
     * @critical
     */
    it('should include all confirmation handlers in modalManagerProps', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { handlers } = result.current.modalManagerProps;

      expect(handlers.confirmNoPlayers).toBe(props.handleNoPlayersConfirmed);
      expect(handlers.confirmHardReset).toBe(props.handleHardResetConfirmed);
      expect(handlers.saveBeforeNewConfirmed).toBe(props.handleSaveBeforeNewConfirmed);
      expect(handlers.saveBeforeNewCancelled).toBe(props.handleSaveBeforeNewCancelled);
      expect(handlers.startNewConfirmed).toBe(props.handleStartNewConfirmed);
    });

    /**
     * Verify confirmation state setters are included
     * @critical
     */
    it('should include confirmation state setters', () => {
      const props = createMockProps();
      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { handlers } = result.current.modalManagerProps;

      expect(typeof handlers.setShowNoPlayersConfirm).toBe('function');
      expect(typeof handlers.setShowHardResetConfirm).toBe('function');
      expect(typeof handlers.setShowStartNewConfirm).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    /**
     * Verify hook handles null/undefined props gracefully
     * @edge-case
     */
    it('should handle null optional data gracefully', () => {
      const props = createMockProps({
        currentGameId: null,
        selectedPlayerForStats: null,
        playerIdsForNewGame: null,
        orphanedGameInfo: null,
      });

      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { data } = result.current.modalManagerProps;

      expect(data.currentGameId).toBeNull();
      expect(data.selectedPlayerForStats).toBeNull();
      expect(data.playerIdsForNewGame).toBeNull();
      expect(data.orphanedGameInfo).toBeNull();
    });

    /**
     * Verify empty data collections don't cause errors
     * @edge-case
     */
    it('should handle empty data collections', () => {
      const emptyGameDataManagement: UseGameDataManagementReturn = {
        teams: [],
        seasons: [],
        tournaments: [],
        masterRoster: [],
        personnel: [],
        savedGames: {},
        currentGameIdSetting: null,
        isLoading: false,
        error: null,
        personnelManager: {
          addPersonnel: jest.fn(),
          updatePersonnel: jest.fn(),
          removePersonnel: jest.fn(),
          isLoading: false,
          personnel: [],
          error: null,
        },
        mutationResults: {
          addSeason: { mutate: jest.fn() } as unknown as UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>,
          addTournament: { mutate: jest.fn() } as unknown as UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>,
          updateSeason: { mutate: jest.fn() } as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
          deleteSeason: { mutate: jest.fn() } as unknown as UseMutationResult<boolean, Error, string, unknown>,
          updateTournament: { mutate: jest.fn() } as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
          deleteTournament: { mutate: jest.fn() } as unknown as UseMutationResult<boolean, Error, string, unknown>,
        },
      };

      const props = createMockProps({
        gameDataManagement: emptyGameDataManagement,
        availablePlayers: [],
        playersForCurrentGame: [],
        savedGames: {},
      });

      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { data } = result.current.modalManagerProps;

      expect(data.teams).toEqual([]);
      expect(data.seasons).toEqual([]);
      expect(data.tournaments).toEqual([]);
      expect(data.masterRoster).toEqual([]);
      expect(data.personnel).toEqual([]);
      expect(data.availablePlayers).toEqual([]);
      expect(data.playersForCurrentGame).toEqual([]);
      expect(data.savedGames).toEqual({});
    });

    /**
     * Verify hook doesn't recreate modalManagerProps unnecessarily
     * Note: Without useMemo, object is recreated each render (expected behavior)
     * @performance
     */
    it('should create new modalManagerProps object on each render', () => {
      const props = createMockProps();
      const { result, rerender } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const firstProps = result.current.modalManagerProps;

      // Trigger re-render
      rerender();

      const secondProps = result.current.modalManagerProps;

      // Without useMemo, object reference changes (this is expected and acceptable)
      expect(firstProps).not.toBe(secondProps);

      // But data should still be equal
      expect(firstProps.state).toEqual(secondProps.state);
      expect(firstProps.data).toEqual(secondProps.data);
    });
  });

  describe('Timer Management Integration', () => {
    /**
     * Verify timer management handlers are properly wired
     * @integration
     */
    it('should include timer management handlers in modalManagerProps', () => {
      const mockTimerManagement: UseTimerManagementReturn = {
        timeElapsedInSeconds: 0,
        isTimerRunning: false,
        subAlertLevel: 'none' as const,
        lastSubConfirmationTimeSeconds: 0,
        showLargeTimerOverlay: false,
        handleStartPauseTimer: jest.fn(),
        handleResetTimer: jest.fn(),
        handleSubstitutionMade: jest.fn(),
        handleSetSubInterval: jest.fn(),
        handleToggleLargeTimerOverlay: jest.fn(),
        handleToggleGoalLogModal: jest.fn(),
        handleAddGoalEvent: jest.fn(),
        handleLogOpponentGoal: jest.fn(),
        timerInteractions: {
          toggleLargeOverlay: jest.fn(),
          toggleGoalLogModal: jest.fn(),
          logOpponentGoal: jest.fn(),
          substitutionMade: jest.fn(),
          setSubInterval: jest.fn(),
          startPauseTimer: jest.fn(),
          resetTimer: jest.fn(),
        },
      };

      const props = createMockProps({
        timerManagement: mockTimerManagement,
      });

      const { result } = renderHook(() => useModalOrchestration(props), {
        wrapper: createWrapper(),
      });

      const { handlers } = result.current.modalManagerProps;

      expect(handlers.toggleGoalLogModal).toBe(mockTimerManagement.handleToggleGoalLogModal);
      expect(handlers.addGoalEvent).toBe(mockTimerManagement.handleAddGoalEvent);
      expect(handlers.logOpponentGoal).toBe(mockTimerManagement.handleLogOpponentGoal);
    });
  });
});
