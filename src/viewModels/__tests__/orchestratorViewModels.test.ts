import {
  buildControlBarProps,
  buildFieldInteractions,
  buildFieldContainerProps,
  type BuildControlBarPropsInput,
  type BuildFieldInteractionsInput,
  type BuildFieldContainerPropsInput,
} from '../orchestratorViewModels';
import { DEFAULT_GAME_ID } from '@/config/constants';
import type { UseFieldCoordinationReturn } from '@/components/HomePage/hooks/useFieldCoordination';
import type { UseTimerManagementReturn } from '@/components/HomePage/hooks/useTimerManagement';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import type { ReducerDrivenModals } from '@/types';

/**
 * Tests for View-Model Builders (orchestratorViewModels.ts)
 *
 * These pure functions transform hook data into props for presentation components.
 * Tests focus on critical edge cases and prop mapping correctness.
 */

describe('orchestratorViewModels', () => {
  describe('buildControlBarProps', () => {
    // Helper to create minimal valid input
    const createControlBarInput = (overrides: Partial<BuildControlBarPropsInput> = {}): BuildControlBarPropsInput => ({
      timerManagement: {
        timeElapsedInSeconds: 0,
        isTimerRunning: false,
        timerInteractions: {
          onTimerStart: jest.fn(),
          onTimerPause: jest.fn(),
          onTimerStop: jest.fn(),
          onTimerReset: jest.fn(),
        },
        subAlertLevel: 'none',
        lastSubConfirmationTimeSeconds: 0,
        showLargeTimerOverlay: false,
      } as unknown as UseTimerManagementReturn,
      fieldCoordination: {
        canUndoField: false,
        canRedoField: false,
        isTacticsBoardView: false,
        isDrawingEnabled: false,
        handleTacticalUndo: jest.fn(),
        handleTacticalRedo: jest.fn(),
        handleResetFieldClick: jest.fn(),
        handleClearDrawingsForView: jest.fn(),
        handleAddOpponent: jest.fn(),
        handlePlaceAllPlayers: jest.fn(),
        handleToggleTacticsBoard: jest.fn(),
        handleAddTacticalDisc: jest.fn(),
        handleToggleDrawingMode: jest.fn(),
      } as unknown as UseFieldCoordinationReturn,
      tacticalHistory: { canUndo: false, canRedo: false },
      currentGameId: null,
      handleToggleLargeTimerOverlay: jest.fn(),
      handleUndo: jest.fn(),
      handleRedo: jest.fn(),
      handleToggleTrainingResources: jest.fn(),
      setIsGameStatsModalOpen: jest.fn(),
      setIsLoadGameModalOpen: jest.fn(),
      handleStartNewGame: jest.fn(),
      openRosterModal: jest.fn(),
      quickSave: jest.fn(),
      setIsGameSettingsModalOpen: jest.fn(),
      setIsSeasonTournamentModalOpen: jest.fn(),
      setIsInstructionsModalOpen: jest.fn(),
      setIsSettingsModalOpen: jest.fn(),
      openPlayerAssessmentModal: jest.fn(),
      setIsTeamManagerOpen: jest.fn(),
      setIsPersonnelManagerOpen: jest.fn(),
      ...overrides,
    });

    it('should correctly identify unsaved game (DEFAULT_GAME_ID)', () => {
      const input = createControlBarInput({
        currentGameId: DEFAULT_GAME_ID, // 'unsaved_game'
      });

      const result = buildControlBarProps(input);

      expect(result.isGameLoaded).toBe(false);
    });

    it('should correctly identify loaded game (non-default ID)', () => {
      const input = createControlBarInput({
        currentGameId: 'game-abc123',
      });

      const result = buildControlBarProps(input);

      expect(result.isGameLoaded).toBe(true);
    });

    it('should treat null gameId as not loaded', () => {
      const input = createControlBarInput({
        currentGameId: null,
      });

      const result = buildControlBarProps(input);

      expect(result.isGameLoaded).toBe(false);
    });

    it('should provide all timer-related props', () => {
      const input = createControlBarInput({
        timerManagement: {
          timeElapsedInSeconds: 300,
          isTimerRunning: true,
        } as UseTimerManagementReturn,
      });

      const result = buildControlBarProps(input);

      expect(result.timeElapsedInSeconds).toBe(300);
      expect(result.isTimerRunning).toBe(true);
      expect(result.onToggleLargeTimerOverlay).toBeDefined();
      expect(typeof result.onToggleLargeTimerOverlay).toBe('function');
    });

    it('should provide all undo/redo props', () => {
      const input = createControlBarInput({
        fieldCoordination: {
          canUndoField: true,
          canRedoField: true,
          handleTacticalUndo: jest.fn(),
          handleTacticalRedo: jest.fn(),
        } as unknown as UseFieldCoordinationReturn,
        tacticalHistory: { canUndo: true, canRedo: true },
      });

      const result = buildControlBarProps(input);

      expect(result.canUndo).toBe(true);
      expect(result.canRedo).toBe(true);
      expect(result.canTacticalUndo).toBe(true);
      expect(result.canTacticalRedo).toBe(true);
      expect(typeof result.onUndo).toBe('function');
      expect(typeof result.onRedo).toBe('function');
      expect(typeof result.onTacticalUndo).toBe('function');
      expect(typeof result.onTacticalRedo).toBe('function');
    });

    it('should provide all modal opener props', () => {
      const input = createControlBarInput();

      const result = buildControlBarProps(input);

      expect(typeof result.onToggleGameStatsModal).toBe('function');
      expect(typeof result.onOpenLoadGameModal).toBe('function');
      expect(typeof result.onStartNewGame).toBe('function');
      expect(typeof result.onOpenRosterModal).toBe('function');
      expect(typeof result.onQuickSave).toBe('function');
      expect(typeof result.onOpenGameSettingsModal).toBe('function');
      expect(typeof result.onOpenSeasonTournamentModal).toBe('function');
      expect(typeof result.onToggleInstructionsModal).toBe('function');
      expect(typeof result.onOpenSettingsModal).toBe('function');
      expect(typeof result.onOpenPlayerAssessmentModal).toBe('function');
    });

    it('should provide all field action props', () => {
      const input = createControlBarInput();

      const result = buildControlBarProps(input);

      expect(typeof result.onResetField).toBe('function');
      expect(typeof result.onClearDrawings).toBe('function');
      expect(typeof result.onAddOpponent).toBe('function');
      expect(typeof result.onPlaceAllPlayers).toBe('function');
      expect(typeof result.onToggleTacticsBoard).toBe('function');
      expect(typeof result.onAddHomeDisc).toBe('function');
      expect(typeof result.onAddOpponentDisc).toBe('function');
      expect(typeof result.onToggleDrawingMode).toBe('function');
      expect(typeof result.onToggleTrainingResources).toBe('function');
    });
  });

  describe('buildFieldInteractions', () => {
    const createFieldCoordination = (): UseFieldCoordinationReturn => ({
      handlePlayerMove: jest.fn(),
      handlePlayerMoveEnd: jest.fn(),
      handlePlayerRemove: jest.fn(),
      handleDropOnField: jest.fn(),
      handleOpponentMove: jest.fn(),
      handleOpponentMoveEnd: jest.fn(),
      handleOpponentRemove: jest.fn(),
      handleDrawingStart: jest.fn(),
      handleDrawingAddPoint: jest.fn(),
      handleDrawingEnd: jest.fn(),
      handleTacticalDrawingStart: jest.fn(),
      handleTacticalDrawingAddPoint: jest.fn(),
      handleTacticalDrawingEnd: jest.fn(),
      handleTacticalDiscMove: jest.fn(),
      handleTacticalDiscRemove: jest.fn(),
      handleToggleTacticalDiscType: jest.fn(),
      handleTacticalBallMove: jest.fn(),
      handlePlayerDropViaTouch: jest.fn(),
      handlePlayerDragCancelViaTouch: jest.fn(),
    } as unknown as UseFieldCoordinationReturn);

    it('should provide all player interaction handlers', () => {
      const input: BuildFieldInteractionsInput = {
        fieldCoordination: createFieldCoordination(),
      };

      const result = buildFieldInteractions(input);

      expect(result.players).toBeDefined();
      expect(typeof result.players.move).toBe('function');
      expect(typeof result.players.moveEnd).toBe('function');
      expect(typeof result.players.remove).toBe('function');
      expect(typeof result.players.drop).toBe('function');
    });

    it('should provide all opponent interaction handlers', () => {
      const input: BuildFieldInteractionsInput = {
        fieldCoordination: createFieldCoordination(),
      };

      const result = buildFieldInteractions(input);

      expect(result.opponents).toBeDefined();
      expect(typeof result.opponents.move).toBe('function');
      expect(typeof result.opponents.moveEnd).toBe('function');
      expect(typeof result.opponents.remove).toBe('function');
    });

    it('should provide all drawing interaction handlers', () => {
      const input: BuildFieldInteractionsInput = {
        fieldCoordination: createFieldCoordination(),
      };

      const result = buildFieldInteractions(input);

      expect(result.drawing).toBeDefined();
      expect(typeof result.drawing.start).toBe('function');
      expect(typeof result.drawing.addPoint).toBe('function');
      expect(typeof result.drawing.end).toBe('function');
    });

    it('should provide all tactical interaction handlers', () => {
      const input: BuildFieldInteractionsInput = {
        fieldCoordination: createFieldCoordination(),
      };

      const result = buildFieldInteractions(input);

      expect(result.tactical).toBeDefined();
      expect(typeof result.tactical.drawingStart).toBe('function');
      expect(typeof result.tactical.drawingAddPoint).toBe('function');
      expect(typeof result.tactical.drawingEnd).toBe('function');
      expect(typeof result.tactical.discMove).toBe('function');
      expect(typeof result.tactical.discRemove).toBe('function');
      expect(typeof result.tactical.discToggleType).toBe('function');
      expect(typeof result.tactical.ballMove).toBe('function');
    });

    it('should provide touch interaction handlers', () => {
      const input: BuildFieldInteractionsInput = {
        fieldCoordination: createFieldCoordination(),
      };

      const result = buildFieldInteractions(input);

      expect(result.touch).toBeDefined();
      expect(typeof result.touch.playerDrop).toBe('function');
      expect(typeof result.touch.playerDragCancel).toBe('function');
    });
  });

  describe('buildFieldContainerProps', () => {
    const createFieldContainerInput = (overrides: Partial<BuildFieldContainerPropsInput> = {}): BuildFieldContainerPropsInput => ({
      gameSessionState: {
        teamName: 'Test Team',
        opponentName: 'Test Opponent',
        homeScore: 0,
        awayScore: 0,
        currentPeriod: 1,
        gameStatus: 'notStarted',
      } as GameSessionState,
      fieldCoordination: {
        playersOnField: [],
        opponents: [],
        drawings: [],
        isTacticsBoardView: false,
        tacticalDrawings: [],
        tacticalDiscs: [],
        tacticalBallPosition: { relX: 0.5, relY: 0.5 },
        draggingPlayerFromBarInfo: null,
        isDrawingEnabled: false,
      } as unknown as UseFieldCoordinationReturn,
      timerManagement: {
        timeElapsedInSeconds: 0,
        isTimerRunning: false,
        subAlertLevel: 'none',
        lastSubConfirmationTimeSeconds: 0,
        showLargeTimerOverlay: false,
        timerInteractions: {
          onTimerStart: jest.fn(),
          onTimerPause: jest.fn(),
          onTimerStop: jest.fn(),
          onTimerReset: jest.fn(),
        },
      } as unknown as UseTimerManagementReturn,
      currentGameId: null,
      availablePlayers: [],
      teams: [],
      seasons: [],
      tournaments: [],
      showFirstGameGuide: false,
      hasCheckedFirstGameGuide: false,
      firstGameGuideStep: 0,
      orphanedGameInfo: null,
      initialLoadComplete: true,
      reducerDrivenModals: {
        newGameSetup: { isOpen: false, open: jest.fn() },
        roster: { isOpen: false, open: jest.fn() },
        seasonTournament: { isOpen: false, open: jest.fn() },
      } as unknown as ReducerDrivenModals,
      setIsTeamManagerOpen: jest.fn(),
      setFirstGameGuideStep: jest.fn(),
      handleFirstGameGuideClose: jest.fn(),
      setIsTeamReassignModalOpen: jest.fn(),
      handleTeamNameChange: jest.fn(),
      setOpponentName: jest.fn(),
      fieldInteractions: {
        players: { move: jest.fn(), moveEnd: jest.fn(), remove: jest.fn(), drop: jest.fn() },
        opponents: { move: jest.fn(), moveEnd: jest.fn(), remove: jest.fn() },
        drawing: { start: jest.fn(), addPoint: jest.fn(), end: jest.fn() },
        tactical: {
          drawingStart: jest.fn(),
          drawingAddPoint: jest.fn(),
          drawingEnd: jest.fn(),
          discMove: jest.fn(),
          discRemove: jest.fn(),
          discToggleType: jest.fn(),
          ballMove: jest.fn(),
        },
        touch: { playerDrop: jest.fn(), playerDragCancel: jest.fn() },
      },
      ...overrides,
    });

    it('should map gameSessionState correctly', () => {
      const gameSessionState = {
        teamName: 'Custom Team',
        opponentName: 'Custom Opponent',
        homeScore: 3,
        awayScore: 2,
        currentPeriod: 2,
        gameStatus: 'active' as const,
      } as unknown as GameSessionState;

      const input = createFieldContainerInput({ gameSessionState });

      const result = buildFieldContainerProps(input);

      expect(result.gameSessionState).toEqual(gameSessionState);
      expect(result.gameSessionState.teamName).toBe('Custom Team');
      expect(result.gameSessionState.homeScore).toBe(3);
    });

    it('should map field state (fieldVM) correctly', () => {
      const input = createFieldContainerInput({
        fieldCoordination: {
          playersOnField: [{ id: '1', name: 'Player 1' }],
          opponents: [{ id: 'opp1', name: 'Opponent 1' }],
          drawings: [],
          isTacticsBoardView: true,
          tacticalDrawings: [],
          tacticalDiscs: [],
          tacticalBallPosition: { relX: 0.3, relY: 0.7 },
          draggingPlayerFromBarInfo: null,
          isDrawingEnabled: true,
        } as unknown as UseFieldCoordinationReturn,
      });

      const result = buildFieldContainerProps(input);

      expect(result.fieldVM).toBeDefined();
      expect(result.fieldVM.playersOnField).toHaveLength(1);
      expect(result.fieldVM.opponents).toHaveLength(1);
      expect(result.fieldVM.isTacticsBoardView).toBe(true);
      expect(result.fieldVM.isDrawingEnabled).toBe(true);
      expect(result.fieldVM.tacticalBallPosition).toEqual({ relX: 0.3, relY: 0.7 });
    });

    it('should map timer state (timerVM) correctly', () => {
      const input = createFieldContainerInput({
        timerManagement: {
          timeElapsedInSeconds: 600,
          isTimerRunning: true,
          subAlertLevel: 'warning',
          lastSubConfirmationTimeSeconds: 300,
          showLargeTimerOverlay: true,
        } as UseTimerManagementReturn,
        initialLoadComplete: false,
      });

      const result = buildFieldContainerProps(input);

      expect(result.timerVM).toBeDefined();
      expect(result.timerVM.timeElapsedInSeconds).toBe(600);
      expect(result.timerVM.isTimerRunning).toBe(true);
      expect(result.timerVM.subAlertLevel).toBe('warning');
      expect(result.timerVM.showLargeTimerOverlay).toBe(true);
      expect(result.timerVM.initialLoadComplete).toBe(false);
    });

    it('should map player and game data correctly', () => {
      const players = [
        { id: '1', name: 'Player 1', jerseyNumber: '10', isGoalie: false },
        { id: '2', name: 'Player 2', jerseyNumber: '7', isGoalie: false },
      ];
      const teams = [{ id: 't1', name: 'Team 1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      const seasons = [{ id: 's1', name: 'Season 2025', year: '2025', startDate: '', endDate: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      const tournaments = [{ id: 'tour1', name: 'Cup 2025', seasonId: '', startDate: '', endDate: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];

      const input = createFieldContainerInput({
        currentGameId: 'game-123',
        availablePlayers: players,
        teams,
        seasons,
        tournaments,
      });

      const result = buildFieldContainerProps(input);

      expect(result.currentGameId).toBe('game-123');
      expect(result.availablePlayers).toHaveLength(2);
      expect(result.teams).toHaveLength(1);
      expect(result.seasons).toHaveLength(1);
      expect(result.tournaments).toHaveLength(1);
    });

    it('should map all handler props correctly', () => {
      const input = createFieldContainerInput();

      const result = buildFieldContainerProps(input);

      expect(typeof result.onOpenNewGameSetup).toBe('function');
      expect(typeof result.onOpenRosterModal).toBe('function');
      expect(typeof result.onOpenSeasonTournamentModal).toBe('function');
      expect(typeof result.onOpenTeamManagerModal).toBe('function');
      expect(typeof result.onGuideStepChange).toBe('function');
      expect(typeof result.onGuideClose).toBe('function');
      expect(typeof result.onOpenTeamReassignModal).toBe('function');
      expect(typeof result.onTeamNameChange).toBe('function');
      expect(typeof result.onOpponentNameChange).toBe('function');
    });

    it('should map interactions and timerInteractions', () => {
      const fieldInteractions = {
        players: { move: jest.fn(), moveEnd: jest.fn(), remove: jest.fn(), drop: jest.fn() },
        opponents: { move: jest.fn(), moveEnd: jest.fn(), remove: jest.fn() },
        drawing: { start: jest.fn(), addPoint: jest.fn(), end: jest.fn() },
        tactical: {
          drawingStart: jest.fn(),
          drawingAddPoint: jest.fn(),
          drawingEnd: jest.fn(),
          discMove: jest.fn(),
          discRemove: jest.fn(),
          discToggleType: jest.fn(),
          ballMove: jest.fn(),
        },
        touch: { playerDrop: jest.fn(), playerDragCancel: jest.fn() },
      };

      const timerInteractions = {
        onTimerStart: jest.fn(),
        onTimerPause: jest.fn(),
        onTimerStop: jest.fn(),
        onTimerReset: jest.fn(),
      };

      const input = createFieldContainerInput({
        fieldInteractions,
        timerManagement: {
          timerInteractions,
        } as unknown as UseTimerManagementReturn,
      });

      const result = buildFieldContainerProps(input);

      expect(result.interactions).toBe(fieldInteractions);
      expect(result.timerInteractions).toBe(timerInteractions);
    });
  });
});
