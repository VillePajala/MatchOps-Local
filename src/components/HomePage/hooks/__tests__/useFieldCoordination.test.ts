/**
 * Unit Tests for useFieldCoordination Hook
 *
 * Tests the field coordination logic including player management,
 * tactical board interactions, and field state management.
 *
 * @critical - Core gameplay coordination
 */

// Mock ALL dependencies BEFORE any imports to prevent side effects
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/utils/formations', () => ({
  __esModule: true,
  calculateFormationPositions: jest.fn(() => []),
}));

jest.mock('@/utils/appSettings', () => ({
  __esModule: true,
  getDrawingModeEnabled: jest.fn().mockResolvedValue(false),
  setDrawingModeEnabled: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/hooks/useFieldInteractions', () => ({
  __esModule: true,
  useFieldInteractions: jest.fn(() => ({
    isDrawingEnabled: false,
    isPersisting: false,
    toggleDrawingMode: jest.fn(),
    enableDrawingMode: jest.fn(),
    disableDrawingMode: jest.fn(),
  })),
}));

jest.mock('@/hooks/useGameState', () => ({
  __esModule: true,
  useGameState: jest.fn(() => ({
    playersOnField: [],
    opponents: [],
    drawings: [],
    availablePlayers: [],
    setPlayersOnField: jest.fn(),
    setOpponents: jest.fn(),
    setDrawings: jest.fn(),
    setAvailablePlayers: jest.fn(),
    handlePlayerDrop: jest.fn(),
    handleDrawingStart: jest.fn(),
    handleDrawingAddPoint: jest.fn(),
    handleDrawingEnd: jest.fn(),
    handleClearDrawings: jest.fn(),
    handleAddOpponent: jest.fn(),
    handleOpponentMove: jest.fn(),
    handleOpponentMoveEnd: jest.fn(),
    handleOpponentRemove: jest.fn(),
    handleRenamePlayer: jest.fn(),
    handleToggleGoalie: jest.fn(),
  })),
}));

jest.mock('@/hooks/useTacticalBoard', () => ({
  __esModule: true,
  useTacticalBoard: jest.fn(() => ({
    isTacticsBoardView: false,
    setIsTacticsBoardView: jest.fn(),
    tacticalDiscs: [],
    setTacticalDiscs: jest.fn(),
    tacticalDrawings: [],
    setTacticalDrawings: jest.fn(),
    tacticalBallPosition: null,
    setTacticalBallPosition: jest.fn(),
    handleToggleTacticsBoard: jest.fn(),
    handleAddTacticalDisc: jest.fn(),
    handleTacticalDiscMove: jest.fn(),
    handleTacticalDiscRemove: jest.fn(),
    handleToggleTacticalDiscType: jest.fn(),
    handleTacticalBallMove: jest.fn(),
    handleTacticalDrawingStart: jest.fn(),
    handleTacticalDrawingAddPoint: jest.fn(),
    handleTacticalDrawingEnd: jest.fn(),
    clearTacticalElements: jest.fn(),
  })),
}));

jest.mock('@/hooks/useTouchInteractions', () => ({
  __esModule: true,
  useTouchInteractions: jest.fn(() => ({
    selectedPlayer: null,
    isDragging: false,
    handleDragStart: jest.fn(),
    handleTap: jest.fn(),
    handleDrop: jest.fn(),
    handleCancel: jest.fn(),
    handleDeselect: jest.fn(),
  })),
}));

import { renderHook, act } from '@testing-library/react';
import { useFieldCoordination } from '../useFieldCoordination';
import type { UseFieldCoordinationParams } from '../useFieldCoordination';
import type { AppState, Player } from '@/types';
import type { TacticalState } from '@/hooks/useTacticalHistory';
import { TestFixtures } from '../../../../../tests/fixtures';
import { useFieldInteractions } from '@/hooks/useFieldInteractions';
import { useGameState } from '@/hooks/useGameState';
import { useTacticalBoard } from '@/hooks/useTacticalBoard';
import { useTouchInteractions } from '@/hooks/useTouchInteractions';
import { calculateFormationPositions } from '@/utils/formations';

const mockUseFieldInteractions = useFieldInteractions as jest.MockedFunction<typeof useFieldInteractions>;
const mockUseGameState = useGameState as jest.MockedFunction<typeof useGameState>;
const mockUseTacticalBoard = useTacticalBoard as jest.MockedFunction<typeof useTacticalBoard>;
const mockUseTouchInteractions = useTouchInteractions as jest.MockedFunction<typeof useTouchInteractions>;
const mockCalculateFormationPositions = calculateFormationPositions as jest.MockedFunction<typeof calculateFormationPositions>;

// Helper to get default mock game state return value
const getDefaultMockGameState = () => ({
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [],
  setPlayersOnField: jest.fn() as React.Dispatch<React.SetStateAction<Player[]>>,
  setOpponents: jest.fn() as React.Dispatch<React.SetStateAction<Array<{ id: string; relX: number; relY: number }>>>,
  setDrawings: jest.fn() as React.Dispatch<React.SetStateAction<Array<Array<{ relX: number; relY: number }>>>>,
  setAvailablePlayers: jest.fn() as React.Dispatch<React.SetStateAction<Player[]>>,
  handlePlayerDrop: jest.fn(),
  handleDrawingStart: jest.fn(),
  handleDrawingAddPoint: jest.fn(),
  handleDrawingEnd: jest.fn(),
  handleClearDrawings: jest.fn(),
  handleAddOpponent: jest.fn(),
  handleOpponentMove: jest.fn(),
  handleOpponentMoveEnd: jest.fn(),
  handleOpponentRemove: jest.fn(),
  handleRenamePlayer: jest.fn(),
  handleToggleGoalie: jest.fn(),
});

// Helper to get default mock tactical board return value
const getDefaultMockTacticalBoard = () => ({
  isTacticsBoardView: false,
  setIsTacticsBoardView: jest.fn() as React.Dispatch<React.SetStateAction<boolean>>,
  tacticalDiscs: [],
  setTacticalDiscs: jest.fn() as React.Dispatch<React.SetStateAction<Array<{ id: string; type: 'home' | 'opponent' | 'goalie'; relX: number; relY: number }>>>,
  tacticalDrawings: [],
  setTacticalDrawings: jest.fn() as React.Dispatch<React.SetStateAction<Array<Array<{ relX: number; relY: number }>>>>,
  tacticalBallPosition: null,
  setTacticalBallPosition: jest.fn() as React.Dispatch<React.SetStateAction<{ relX: number; relY: number } | null>>,
  handleToggleTacticsBoard: jest.fn(),
  handleAddTacticalDisc: jest.fn(),
  handleTacticalDiscMove: jest.fn(),
  handleTacticalDiscRemove: jest.fn(),
  handleToggleTacticalDiscType: jest.fn(),
  handleTacticalBallMove: jest.fn(),
  handleTacticalDrawingStart: jest.fn(),
  handleTacticalDrawingAddPoint: jest.fn(),
  handleTacticalDrawingEnd: jest.fn(),
  clearTacticalElements: jest.fn(),
});

describe('useFieldCoordination', () => {
  let mockParams: UseFieldCoordinationParams;
  let mockInitialState: AppState;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock initial state
    mockInitialState = TestFixtures.games.newGame({
      playersOnField: [],
      opponents: [],
      drawings: [],
      tacticalDiscs: [],
      tacticalDrawings: [],
      tacticalBallPosition: null,
    });

    // Create mock params
    mockParams = {
      initialState: mockInitialState,
      saveStateToHistory: jest.fn(),
      saveTacticalStateToHistory: jest.fn(),
      availablePlayers: TestFixtures.players.fullTeam({ count: 5 }),
      selectedPlayerIds: [],
      canUndo: false,
      canRedo: false,
      tacticalHistory: {
        undo: jest.fn(() => null),
        redo: jest.fn(() => null),
        canUndo: false,
        canRedo: false,
      },
      showToast: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t: jest.fn((key) => key) as any, // Type assertion to bypass TFunction brand
    };

    // Reset all mock implementations to defaults
    mockUseFieldInteractions.mockReturnValue({
      isDrawingEnabled: false,
      isPersisting: false,
      toggleDrawingMode: jest.fn(),
      enableDrawingMode: jest.fn(),
      disableDrawingMode: jest.fn(),
    });

    mockUseGameState.mockReturnValue({
      playersOnField: [],
      opponents: [],
      drawings: [],
      availablePlayers: [],
      setPlayersOnField: jest.fn((updater) => {
        if (typeof updater === 'function') {
          updater([]);
        }
      }) as React.Dispatch<React.SetStateAction<Player[]>>,
      setOpponents: jest.fn((updater) => {
        if (typeof updater === 'function') {
          updater([]);
        }
      }) as React.Dispatch<React.SetStateAction<Array<{ id: string; relX: number; relY: number }>>>,
      setDrawings: jest.fn((updater) => {
        if (typeof updater === 'function') {
          updater([]);
        }
      }) as React.Dispatch<React.SetStateAction<Array<Array<{ relX: number; relY: number }>>>>,
      setAvailablePlayers: jest.fn() as React.Dispatch<React.SetStateAction<Player[]>>,
      handlePlayerDrop: jest.fn(),
      handleDrawingStart: jest.fn(),
      handleDrawingAddPoint: jest.fn(),
      handleDrawingEnd: jest.fn(),
      handleClearDrawings: jest.fn(),
      handleAddOpponent: jest.fn(),
      handleOpponentMove: jest.fn(),
      handleOpponentMoveEnd: jest.fn(),
      handleOpponentRemove: jest.fn(),
      handleRenamePlayer: jest.fn(),
      handleToggleGoalie: jest.fn(),
    });

    mockUseTacticalBoard.mockReturnValue({
      isTacticsBoardView: false,
      setIsTacticsBoardView: jest.fn() as React.Dispatch<React.SetStateAction<boolean>>,
      tacticalDiscs: [],
      setTacticalDiscs: jest.fn() as React.Dispatch<React.SetStateAction<Array<{ id: string; type: 'home' | 'opponent' | 'goalie'; relX: number; relY: number }>>>,
      tacticalDrawings: [],
      setTacticalDrawings: jest.fn() as React.Dispatch<React.SetStateAction<Array<Array<{ relX: number; relY: number }>>>>,
      tacticalBallPosition: null,
      setTacticalBallPosition: jest.fn() as React.Dispatch<React.SetStateAction<{ relX: number; relY: number } | null>>,
      handleToggleTacticsBoard: jest.fn(),
      handleAddTacticalDisc: jest.fn(),
      handleTacticalDiscMove: jest.fn(),
      handleTacticalDiscRemove: jest.fn(),
      handleToggleTacticalDiscType: jest.fn(),
      handleTacticalBallMove: jest.fn(),
      handleTacticalDrawingStart: jest.fn(),
      handleTacticalDrawingAddPoint: jest.fn(),
      handleTacticalDrawingEnd: jest.fn(),
      clearTacticalElements: jest.fn(),
    });
  });

  describe('Player Drag and Drop', () => {
    /**
     * Tests player drop from player bar onto field
     * @critical - Core player placement
     */
    it('should handle player drop from bar to field', () => {
      const mockHandlePlayerDrop = jest.fn();
      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        handlePlayerDrop: mockHandlePlayerDrop,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      const player = mockParams.availablePlayers[0];
      act(() => {
        result.current.handleDropOnField(player.id, 0.5, 0.5);
      });

      expect(mockHandlePlayerDrop).toHaveBeenCalledWith(
        expect.objectContaining({ id: player.id }),
        { relX: 0.5, relY: 0.5 }
      );
    });

    /**
     * Tests player movement on field (dragging)
     * @critical - Core player positioning
     */
    it('should handle player movement on field', () => {
      const mockSetPlayersOnField = jest.fn();
      const existingPlayer = TestFixtures.players.goalkeeper({
        relX: 0.5,
        relY: 0.9,
      });

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        playersOnField: [existingPlayer],
        setPlayersOnField: mockSetPlayersOnField,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlayerMove(existingPlayer.id, 0.6, 0.7);
      });

      expect(mockSetPlayersOnField).toHaveBeenCalled();
      const updaterFn = mockSetPlayersOnField.mock.calls[0][0];
      const updatedPlayers = updaterFn([existingPlayer]);

      expect(updatedPlayers).toHaveLength(1);
      expect(updatedPlayers[0]).toEqual(
        expect.objectContaining({
          id: existingPlayer.id,
          relX: 0.6,
          relY: 0.7,
        })
      );
    });

    /**
     * Tests player movement end (saves to history)
     * @critical - History tracking
     */
    it('should save to history when player movement ends', async () => {
      const mockSetPlayersOnField = jest.fn((updater) => {
        // Simulate React's setState behavior by calling the updater
        if (typeof updater === 'function') {
          updater(existingPlayers);
        }
      });
      const existingPlayers = [TestFixtures.players.goalkeeper()];

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        playersOnField: existingPlayers,
        setPlayersOnField: mockSetPlayersOnField,
      });

      const { result, rerender } = renderHook(() => useFieldCoordination(mockParams));

      await act(async () => {
        result.current.handlePlayerMoveEnd();
        // Trigger re-render to run the effect
        rerender();
      });

      expect(mockSetPlayersOnField).toHaveBeenCalled();
      expect(mockParams.saveStateToHistory).toHaveBeenCalledWith({
        playersOnField: existingPlayers,
      });
    });

    /**
     * Tests player removal from field
     * @critical - Core player management
     */
    it('should handle player removal from field', () => {
      const mockSetPlayersOnField = jest.fn();
      const player1 = TestFixtures.players.goalkeeper({ id: 'player-1' });
      const player2 = TestFixtures.players.fieldPlayer({ id: 'player-2' });

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        playersOnField: [player1, player2],
        setPlayersOnField: mockSetPlayersOnField,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlayerRemove('player-1');
      });

      expect(mockSetPlayersOnField).toHaveBeenCalled();
      const updaterFn = mockSetPlayersOnField.mock.calls[0][0];
      const updatedPlayers = updaterFn([player1, player2]);

      expect(updatedPlayers).toHaveLength(1);
      expect(updatedPlayers[0].id).toBe('player-2');
      expect(mockParams.saveStateToHistory).toHaveBeenCalledWith({
        playersOnField: expect.any(Array),
      });
    });

    /**
     * Tests error handling when dropping non-existent player
     * @edge-case
     */
    it('should handle drop of non-existent player gracefully', () => {
      const mockHandlePlayerDrop = jest.fn();
      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        handlePlayerDrop: mockHandlePlayerDrop,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleDropOnField('non-existent-id', 0.5, 0.5);
      });

      // Should not call handlePlayerDrop for non-existent player
      expect(mockHandlePlayerDrop).not.toHaveBeenCalled();
    });
  });

  describe('Touch/Mobile Interactions', () => {
    /**
     * Tests player drag start delegation to useTouchInteractions
     * @integration - Delegation pattern
     */
    it('should handle player drag start from bar', () => {
      const mockHandleDragStart = jest.fn();
      const mockSelectedPlayer = mockParams.availablePlayers[0];

      mockUseTouchInteractions.mockReturnValue({
        selectedPlayer: mockSelectedPlayer,
        isDragging: true,
        handleDragStart: mockHandleDragStart,
        handleTap: jest.fn(),
        handleDrop: jest.fn(),
        handleCancel: jest.fn(),
        handleDeselect: jest.fn(),
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      const player = mockParams.availablePlayers[0];

      act(() => {
        result.current.handlePlayerDragStartFromBar(player);
      });

      expect(mockHandleDragStart).toHaveBeenCalledWith(player);
      expect(result.current.draggingPlayerFromBarInfo).toEqual(mockSelectedPlayer);
    });

    /**
     * Tests player tap delegation to useTouchInteractions
     * @integration - Delegation pattern
     */
    it('should toggle player selection on tap', () => {
      const mockHandleTap = jest.fn();

      mockUseTouchInteractions.mockReturnValue({
        selectedPlayer: null,
        isDragging: false,
        handleDragStart: jest.fn(),
        handleTap: mockHandleTap,
        handleDrop: jest.fn(),
        handleCancel: jest.fn(),
        handleDeselect: jest.fn(),
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      const player = mockParams.availablePlayers[0];

      act(() => {
        result.current.handlePlayerTapInBar(player);
      });

      expect(mockHandleTap).toHaveBeenCalledWith(player);
    });

    /**
     * Tests player drop via touch delegation to useTouchInteractions
     * @integration - Delegation pattern
     */
    it('should handle player drop via touch', () => {
      const mockHandleDrop = jest.fn();

      mockUseTouchInteractions.mockReturnValue({
        selectedPlayer: null,
        isDragging: false,
        handleDragStart: jest.fn(),
        handleTap: jest.fn(),
        handleDrop: mockHandleDrop,
        handleCancel: jest.fn(),
        handleDeselect: jest.fn(),
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlayerDropViaTouch(0.7, 0.3);
      });

      expect(mockHandleDrop).toHaveBeenCalledWith(0.7, 0.3);
    });

    /**
     * Tests drag cancel via touch delegation to useTouchInteractions
     * @integration - Delegation pattern
     */
    it('should handle drag cancel via touch', () => {
      const mockHandleCancel = jest.fn();

      mockUseTouchInteractions.mockReturnValue({
        selectedPlayer: null,
        isDragging: false,
        handleDragStart: jest.fn(),
        handleTap: jest.fn(),
        handleDrop: jest.fn(),
        handleCancel: mockHandleCancel,
        handleDeselect: jest.fn(),
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlayerDragCancelViaTouch();
      });

      expect(mockHandleCancel).toHaveBeenCalled();
    });

    /**
     * Tests deselect player delegation to useTouchInteractions
     * @integration - Delegation pattern
     */
    it('should deselect player when clicking bar background', () => {
      const mockHandleDeselect = jest.fn();

      mockUseTouchInteractions.mockReturnValue({
        selectedPlayer: null,
        isDragging: false,
        handleDragStart: jest.fn(),
        handleTap: jest.fn(),
        handleDrop: jest.fn(),
        handleCancel: jest.fn(),
        handleDeselect: mockHandleDeselect,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleDeselectPlayer();
      });

      expect(mockHandleDeselect).toHaveBeenCalled();
    });

    /**
     * Tests that touch interactions are properly delegated to useTouchInteractions hook
     * NOTE: Error handling during drop is now tested in useTouchInteractions.test.ts
     * @integration - Delegation verification
     */
    it('should show error toast when touch drop fails', () => {
      // This test verifies that useTouchInteractions is called with correct params
      // The actual error handling is tested in useTouchInteractions.test.ts
      const mockHandleDrop = jest.fn();

      mockUseTouchInteractions.mockReturnValue({
        selectedPlayer: null,
        isDragging: false,
        handleDragStart: jest.fn(),
        handleTap: jest.fn(),
        handleDrop: mockHandleDrop,
        handleCancel: jest.fn(),
        handleDeselect: jest.fn(),
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlayerDropViaTouch(0.5, 0.5);
      });

      // Verify delegation occurred
      expect(mockHandleDrop).toHaveBeenCalledWith(0.5, 0.5);
    });
  });

  describe('Field Reset Logic', () => {
    /**
     * Tests reset field click (show confirmation)
     * @critical - Data safety
     */
    it('should show confirmation dialog on reset click', () => {
      const { result } = renderHook(() => useFieldCoordination(mockParams));

      expect(result.current.showResetFieldConfirm).toBe(false);

      act(() => {
        result.current.handleResetFieldClick();
      });

      expect(result.current.showResetFieldConfirm).toBe(true);
    });

    /**
     * Tests field reset in normal mode
     * @critical - Data safety
     */
    it('should reset field when confirmed in normal mode', () => {
      const mockSetPlayersOnField = jest.fn();
      const mockSetOpponents = jest.fn();
      const mockSetDrawings = jest.fn();

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        setPlayersOnField: mockSetPlayersOnField,
        setOpponents: mockSetOpponents,
        setDrawings: mockSetDrawings,
      });

      mockUseTacticalBoard.mockReturnValue({
        ...getDefaultMockTacticalBoard(),
        isTacticsBoardView: false,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleResetFieldClick();
      });

      act(() => {
        result.current.handleResetFieldConfirmed();
      });

      expect(mockSetPlayersOnField).toHaveBeenCalledWith([]);
      expect(mockSetOpponents).toHaveBeenCalledWith([]);
      expect(mockSetDrawings).toHaveBeenCalledWith([]);
      expect(mockParams.saveStateToHistory).toHaveBeenCalledWith({
        playersOnField: [],
        opponents: [],
        drawings: [],
      });
      expect(result.current.showResetFieldConfirm).toBe(false);
    });

    /**
     * Tests field reset in tactical board mode
     * @critical - Tactical board functionality
     */
    it('should clear tactical elements when confirmed in tactical mode', () => {
      const mockClearTacticalElements = jest.fn();

      mockUseTacticalBoard.mockReturnValue({
        ...getDefaultMockTacticalBoard(),
        isTacticsBoardView: true,
        clearTacticalElements: mockClearTacticalElements,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleResetFieldClick();
      });

      act(() => {
        result.current.handleResetFieldConfirmed();
      });

      expect(mockClearTacticalElements).toHaveBeenCalled();
      expect(result.current.showResetFieldConfirm).toBe(false);
    });
  });

  describe('Tactical Board View', () => {
    /**
     * Tests clear drawings in field view
     * @critical - Drawing management
     */
    it('should clear field drawings when in field view', () => {
      const mockHandleClearDrawings = jest.fn();

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        handleClearDrawings: mockHandleClearDrawings,
      });

      mockUseTacticalBoard.mockReturnValue({
        ...getDefaultMockTacticalBoard(),
        isTacticsBoardView: false,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleClearDrawingsForView();
      });

      expect(mockHandleClearDrawings).toHaveBeenCalled();
    });

    /**
     * Tests clear drawings in tactical board view
     * @critical - Tactical board functionality
     */
    it('should clear tactical drawings when in tactical view', () => {
      const mockSetTacticalDrawings = jest.fn();

      mockUseTacticalBoard.mockReturnValue({
        ...getDefaultMockTacticalBoard(),
        isTacticsBoardView: true,
        setTacticalDrawings: mockSetTacticalDrawings,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleClearDrawingsForView();
      });

      expect(mockSetTacticalDrawings).toHaveBeenCalledWith([]);
      expect(mockParams.saveTacticalStateToHistory).toHaveBeenCalledWith({
        tacticalDrawings: [],
      });
    });
  });

  describe('History State Restoration', () => {
    /**
     * Tests field history state restoration
     * @critical - Undo/redo functionality
     */
    it('should apply field history state correctly', () => {
      const mockSetPlayersOnField = jest.fn();
      const mockSetOpponents = jest.fn();
      const mockSetDrawings = jest.fn();
      const mockSetTacticalDiscs = jest.fn();
      const mockSetTacticalDrawings = jest.fn();
      const mockSetTacticalBallPosition = jest.fn();

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        setPlayersOnField: mockSetPlayersOnField,
        setOpponents: mockSetOpponents,
        setDrawings: mockSetDrawings,
      });

      mockUseTacticalBoard.mockReturnValue({
        ...getDefaultMockTacticalBoard(),
        setTacticalDiscs: mockSetTacticalDiscs,
        setTacticalDrawings: mockSetTacticalDrawings,
        setTacticalBallPosition: mockSetTacticalBallPosition,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      const historyState: AppState = {
        ...mockInitialState,
        playersOnField: [TestFixtures.players.goalkeeper()],
        opponents: [{ id: 'opp-1', relX: 0.5, relY: 0.3 }],
        drawings: [[{ relX: 0.1, relY: 0.1 }, { relX: 0.2, relY: 0.2 }]],
        tacticalDiscs: [{ id: 'disc-1', type: 'home', relX: 0.5, relY: 0.5 }],
        tacticalDrawings: [[{ relX: 0.3, relY: 0.3 }]],
        tacticalBallPosition: { relX: 0.4, relY: 0.4 },
      };

      act(() => {
        result.current.applyFieldHistoryState(historyState);
      });

      expect(mockSetPlayersOnField).toHaveBeenCalledWith(historyState.playersOnField);
      expect(mockSetOpponents).toHaveBeenCalledWith(historyState.opponents);
      expect(mockSetDrawings).toHaveBeenCalledWith(historyState.drawings);
      expect(mockSetTacticalDiscs).toHaveBeenCalledWith(historyState.tacticalDiscs);
      expect(mockSetTacticalDrawings).toHaveBeenCalledWith(historyState.tacticalDrawings);
      expect(mockSetTacticalBallPosition).toHaveBeenCalledWith(historyState.tacticalBallPosition);
    });

    /**
     * Tests tactical undo
     * @critical - Tactical board undo
     */
    it('should handle tactical undo correctly', () => {
      const mockSetTacticalDiscs = jest.fn();
      const mockSetTacticalDrawings = jest.fn();
      const mockSetTacticalBallPosition = jest.fn();

      const previousState: TacticalState = {
        tacticalDiscs: [{ id: 'disc-1', type: 'home', relX: 0.5, relY: 0.5 }],
        tacticalDrawings: [[{ relX: 0.1, relY: 0.1 }]],
        tacticalBallPosition: { relX: 0.5, relY: 0.5 },
      };

      mockParams.tacticalHistory.undo = jest.fn(() => previousState);

      mockUseTacticalBoard.mockReturnValue({
        ...getDefaultMockTacticalBoard(),
        setTacticalDiscs: mockSetTacticalDiscs,
        setTacticalDrawings: mockSetTacticalDrawings,
        setTacticalBallPosition: mockSetTacticalBallPosition,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleTacticalUndo();
      });

      expect(mockParams.tacticalHistory.undo).toHaveBeenCalled();
      expect(mockSetTacticalDiscs).toHaveBeenCalledWith(previousState.tacticalDiscs);
      expect(mockSetTacticalDrawings).toHaveBeenCalledWith(previousState.tacticalDrawings);
      expect(mockSetTacticalBallPosition).toHaveBeenCalledWith(previousState.tacticalBallPosition);
    });

    /**
     * Tests tactical redo
     * @critical - Tactical board redo
     */
    it('should handle tactical redo correctly', () => {
      const mockSetTacticalDiscs = jest.fn();
      const mockSetTacticalDrawings = jest.fn();
      const mockSetTacticalBallPosition = jest.fn();

      const nextState: TacticalState = {
        tacticalDiscs: [{ id: 'disc-2', type: 'opponent', relX: 0.6, relY: 0.6 }],
        tacticalDrawings: [[{ relX: 0.2, relY: 0.2 }]],
        tacticalBallPosition: { relX: 0.7, relY: 0.7 },
      };

      mockParams.tacticalHistory.redo = jest.fn(() => nextState);

      mockUseTacticalBoard.mockReturnValue({
        ...getDefaultMockTacticalBoard(),
        setTacticalDiscs: mockSetTacticalDiscs,
        setTacticalDrawings: mockSetTacticalDrawings,
        setTacticalBallPosition: mockSetTacticalBallPosition,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleTacticalRedo();
      });

      expect(mockParams.tacticalHistory.redo).toHaveBeenCalled();
      expect(mockSetTacticalDiscs).toHaveBeenCalledWith(nextState.tacticalDiscs);
      expect(mockSetTacticalDrawings).toHaveBeenCalledWith(nextState.tacticalDrawings);
      expect(mockSetTacticalBallPosition).toHaveBeenCalledWith(nextState.tacticalBallPosition);
    });

    /**
     * Tests tactical undo when at beginning of history
     * @edge-case
     */
    it('should handle tactical undo at beginning of history', () => {
      mockParams.tacticalHistory.undo = jest.fn(() => null);

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleTacticalUndo();
      });

      expect(mockParams.tacticalHistory.undo).toHaveBeenCalled();
      // Should not crash - just log
    });

    /**
     * Tests tactical redo when at end of history
     * @edge-case
     */
    it('should handle tactical redo at end of history', () => {
      mockParams.tacticalHistory.redo = jest.fn(() => null);

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handleTacticalRedo();
      });

      expect(mockParams.tacticalHistory.redo).toHaveBeenCalled();
      // Should not crash - just log
    });
  });

  describe('Formation Logic (Place All Players)', () => {
    /**
     * Tests placing ALL available players in formation (not just selected ones)
     * @critical - Formation placement
     */
    it('should place ALL available players in formation', () => {
      const mockSetPlayersOnField = jest.fn();
      const players = TestFixtures.players.fullTeam({ count: 6 });
      const selectedIds = players.slice(0, 5).map(p => p.id);

      mockParams.availablePlayers = players;
      mockParams.selectedPlayerIds = selectedIds;

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        playersOnField: [],
        setPlayersOnField: mockSetPlayersOnField,
      });

      // Mock formation positions (4 field players after goalie)
      mockCalculateFormationPositions.mockReturnValue([
        { relX: 0.25, relY: 0.6 },
        { relX: 0.75, relY: 0.6 },
        { relX: 0.35, relY: 0.35 },
        { relX: 0.65, relY: 0.35 },
      ]);

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      expect(mockSetPlayersOnField).toHaveBeenCalled();
      expect(mockParams.saveStateToHistory).toHaveBeenCalled();

      // Verify goalie is placed first at goalie position
      const placedPlayers = mockSetPlayersOnField.mock.calls[0][0];
      const goalie = placedPlayers.find((p: Player) => p.isGoalie);
      expect(goalie).toBeDefined();
      expect(goalie?.relY).toBe(0.95);
      expect(goalie?.relX).toBe(0.5);
    });

    /**
     * Tests that already-placed players are not duplicated
     * @critical - Formation placement
     */
    it('should not place players already on field', () => {
      const mockSetPlayersOnField = jest.fn();
      const players = TestFixtures.players.fullTeam({ count: 3 });
      const alreadyOnField = [{ ...players[0], relX: 0.5, relY: 0.9 }];

      mockParams.availablePlayers = players;
      mockParams.selectedPlayerIds = players.map(p => p.id);

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        playersOnField: alreadyOnField,
        setPlayersOnField: mockSetPlayersOnField,
      });

      mockCalculateFormationPositions.mockReturnValue([
        { relX: 0.5, relY: 0.5 },
        { relX: 0.3, relY: 0.4 },
      ]);

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      // Should only place the 2 players not already on field
      const placedPlayers = mockSetPlayersOnField.mock.calls[0][0];
      expect(placedPlayers).toHaveLength(3); // 1 already placed + 2 new
    });

    /**
     * Tests handling when all available players are already on field
     * @edge-case
     */
    it('should do nothing when all available players already on field', () => {
      const mockSetPlayersOnField = jest.fn();
      const players = TestFixtures.players.fullTeam({ count: 2 });
      const playersOnField = players.map(p => ({ ...p, relX: 0.5, relY: 0.5 }));

      mockParams.availablePlayers = players;
      mockParams.selectedPlayerIds = players.map(p => p.id);

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        playersOnField: playersOnField,
        setPlayersOnField: mockSetPlayersOnField,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      expect(mockSetPlayersOnField).not.toHaveBeenCalled();
      expect(mockParams.saveStateToHistory).not.toHaveBeenCalled();
    });

    /**
     * Tests that ALL players are placed regardless of selection status
     * @critical - Ensures "Place All Players" actually places ALL players
     */
    it('should place players regardless of selection status', () => {
      const mockSetPlayersOnField = jest.fn();
      const players = TestFixtures.players.fullTeam({ count: 5 });

      // Only 2 players are "selected", but ALL 5 should be placed
      const selectedIds = players.slice(0, 2).map(p => p.id);

      mockParams.availablePlayers = players;
      mockParams.selectedPlayerIds = selectedIds;

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        playersOnField: [],
        setPlayersOnField: mockSetPlayersOnField,
      });

      mockCalculateFormationPositions.mockReturnValue([
        { relX: 0.25, relY: 0.6 },
        { relX: 0.75, relY: 0.6 },
        { relX: 0.35, relY: 0.35 },
        { relX: 0.65, relY: 0.35 },
      ]);

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      // Should place ALL 5 players (not just the 2 selected ones)
      const placedPlayers = mockSetPlayersOnField.mock.calls[0][0];
      expect(placedPlayers).toHaveLength(5);
      expect(mockParams.saveStateToHistory).toHaveBeenCalled();
    });

    /**
     * Tests formation placement without goalkeeper
     * @edge-case
     */
    it('should place players without goalkeeper correctly', () => {
      const mockSetPlayersOnField = jest.fn();
      const players = [
        TestFixtures.players.fieldPlayer({ id: 'p1', isGoalie: false }),
        TestFixtures.players.fieldPlayer({ id: 'p2', isGoalie: false }),
        TestFixtures.players.fieldPlayer({ id: 'p3', isGoalie: false }),
      ];

      mockParams.availablePlayers = players;
      mockParams.selectedPlayerIds = players.map(p => p.id);

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        playersOnField: [],
        setPlayersOnField: mockSetPlayersOnField,
      });

      mockCalculateFormationPositions.mockReturnValue([
        { relX: 0.25, relY: 0.5 },
        { relX: 0.5, relY: 0.4 },
        { relX: 0.75, relY: 0.5 },
      ]);

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      const placedPlayers = mockSetPlayersOnField.mock.calls[0][0];
      expect(placedPlayers).toHaveLength(3);
      expect(placedPlayers.every((p: Player) => !p.isGoalie)).toBe(true);
    });

    /**
     * Tests formation calculation is called with correct count
     * @integration
     */
    it('should calculate formation with correct player count', () => {
      const players = TestFixtures.players.fullTeam({ count: 7 });
      const selectedIds = players.map(p => p.id);

      mockParams.availablePlayers = players;
      mockParams.selectedPlayerIds = selectedIds;

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        playersOnField: [],
        setPlayersOnField: jest.fn(),
      });

      mockCalculateFormationPositions.mockReturnValue([
        { relX: 0.15, relY: 0.75 },
        { relX: 0.5, relY: 0.75 },
        { relX: 0.85, relY: 0.75 },
        { relX: 0.25, relY: 0.5 },
        { relX: 0.75, relY: 0.5 },
        { relX: 0.35, relY: 0.25 },
      ]);

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      // Should call with 6 (7 players - 1 goalie)
      expect(mockCalculateFormationPositions).toHaveBeenCalledWith(6);
    });
  });

  describe('State Setters Exposure', () => {
    /**
     * Tests that state setters are exposed for parent orchestrator
     * @integration
     */
    it('should expose all required state setters', () => {
      const { result } = renderHook(() => useFieldCoordination(mockParams));

      expect(typeof result.current.setPlayersOnField).toBe('function');
      expect(typeof result.current.setOpponents).toBe('function');
      expect(typeof result.current.setDrawings).toBe('function');
      expect(typeof result.current.setTacticalDiscs).toBe('function');
      expect(typeof result.current.setTacticalDrawings).toBe('function');
      expect(typeof result.current.setTacticalBallPosition).toBe('function');
    });
  });

  describe('Handler Delegation', () => {
    /**
     * Tests that opponent handlers are properly delegated to useGameState
     * @integration
     */
    it('should delegate opponent handlers to useGameState', () => {
      const mockHandleAddOpponent = jest.fn();
      const mockHandleOpponentMove = jest.fn();
      const mockHandleOpponentMoveEnd = jest.fn();
      const mockHandleOpponentRemove = jest.fn();

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        handleAddOpponent: mockHandleAddOpponent,
        handleOpponentMove: mockHandleOpponentMove,
        handleOpponentMoveEnd: mockHandleOpponentMoveEnd,
        handleOpponentRemove: mockHandleOpponentRemove,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      expect(result.current.handleAddOpponent).toBe(mockHandleAddOpponent);
      expect(result.current.handleOpponentMove).toBe(mockHandleOpponentMove);
      expect(result.current.handleOpponentMoveEnd).toBe(mockHandleOpponentMoveEnd);
      expect(result.current.handleOpponentRemove).toBe(mockHandleOpponentRemove);
    });

    /**
     * Tests that drawing handlers are properly delegated
     * @integration
     */
    it('should delegate drawing handlers to useGameState', () => {
      const mockHandleDrawingStart = jest.fn();
      const mockHandleDrawingAddPoint = jest.fn();
      const mockHandleDrawingEnd = jest.fn();

      mockUseGameState.mockReturnValue({
        ...getDefaultMockGameState(),
        handleDrawingStart: mockHandleDrawingStart,
        handleDrawingAddPoint: mockHandleDrawingAddPoint,
        handleDrawingEnd: mockHandleDrawingEnd,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      expect(result.current.handleDrawingStart).toBe(mockHandleDrawingStart);
      expect(result.current.handleDrawingAddPoint).toBe(mockHandleDrawingAddPoint);
      expect(result.current.handleDrawingEnd).toBe(mockHandleDrawingEnd);
    });

    /**
     * Tests that tactical board handlers are properly delegated
     * @integration
     */
    it('should delegate tactical board handlers to useTacticalBoard', () => {
      const mockHandleToggleTacticsBoard = jest.fn();
      const mockHandleAddTacticalDisc = jest.fn();
      const mockHandleTacticalDiscMove = jest.fn();

      mockUseTacticalBoard.mockReturnValue({
        ...getDefaultMockTacticalBoard(),
        handleToggleTacticsBoard: mockHandleToggleTacticsBoard,
        handleAddTacticalDisc: mockHandleAddTacticalDisc,
        handleTacticalDiscMove: mockHandleTacticalDiscMove,
      });

      const { result } = renderHook(() => useFieldCoordination(mockParams));

      expect(result.current.handleToggleTacticsBoard).toBe(mockHandleToggleTacticsBoard);
      expect(result.current.handleAddTacticalDisc).toBe(mockHandleAddTacticalDisc);
      expect(result.current.handleTacticalDiscMove).toBe(mockHandleTacticalDiscMove);
    });
  });
});
