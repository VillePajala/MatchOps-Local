/**
 * Unit tests for useFieldCoordination hook
 *
 * Tests the field coordination hook's responsibilities:
 * - Player placement and formation logic
 * - Touch/drag interactions
 * - History state restoration
 * - Tactical board operations
 */

import { renderHook, act } from '@testing-library/react';
import { useFieldCoordination } from '../useFieldCoordination';
import type { UseFieldCoordinationParams } from '../useFieldCoordination';
import type { AppState, Player, TacticalDisc, Point } from '@/types';
import type { TacticalState } from '@/hooks/useTacticalHistory';
import { TestFixtures } from '../../../../../tests/fixtures';

// Mock dependencies
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
  calculateFormationPositions: jest.fn((playerCount: number) => {
    // Simple mock: return positions in a line
    return Array.from({ length: playerCount }, (_, i) => ({
      relX: 0.1 + (i * 0.1),
      relY: 0.5,
    }));
  }),
}));

describe('useFieldCoordination', () => {
  const mockT = jest.fn((key: string, fallback?: string) => fallback ?? key);
  const mockShowToast = jest.fn();
  const mockSaveStateToHistory = jest.fn();
  const mockSaveTacticalStateToHistory = jest.fn();
  const mockUndoHistory = jest.fn();
  const mockRedoHistory = jest.fn();
  const mockTacticalHistoryUndo = jest.fn();
  const mockTacticalHistoryRedo = jest.fn();

  const createDefaultParams = (overrides?: Partial<UseFieldCoordinationParams>): UseFieldCoordinationParams => ({
    initialState: {
      playersOnField: [],
      opponents: [],
      drawings: [],
      tacticalDiscs: [],
      tacticalDrawings: [],
      tacticalBallPosition: null,
      availablePlayers: [],
      selectedPlayerIds: [],
      showPlayerNames: true,
      gameEvents: [],
      seasonId: '',
      tournamentId: '',
      gameLocation: '',
      gameTime: '',
    } as AppState,
    saveStateToHistory: mockSaveStateToHistory,
    saveTacticalStateToHistory: mockSaveTacticalStateToHistory,
    availablePlayers: [],
    selectedPlayerIds: [],
    canUndo: false,
    canRedo: false,
    tacticalHistory: {
      undo: mockTacticalHistoryUndo,
      redo: mockTacticalHistoryRedo,
      canUndo: false,
      canRedo: false,
    },
    showToast: mockShowToast,
    t: mockT,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handlePlaceAllPlayers', () => {
    it('places goalkeeper at (0.5, 0.95)', () => {
      const goalkeeper = TestFixtures.players.goalkeeper({ id: 'gk1' });
      const fieldPlayer = TestFixtures.players.fieldPlayer({ id: 'fp1' });

      const params = createDefaultParams({
        availablePlayers: [goalkeeper, fieldPlayer],
        selectedPlayerIds: ['gk1', 'fp1'],
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      expect(result.current.playersOnField).toContainEqual(
        expect.objectContaining({
          id: 'gk1',
          relX: 0.5,
          relY: 0.95,
        })
      );
    });

    it('places field players in formation', () => {
      const players = [
        TestFixtures.players.fieldPlayer({ id: 'fp1' }),
        TestFixtures.players.fieldPlayer({ id: 'fp2' }),
        TestFixtures.players.fieldPlayer({ id: 'fp3' }),
      ];

      const params = createDefaultParams({
        availablePlayers: players,
        selectedPlayerIds: ['fp1', 'fp2', 'fp3'],
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      expect(result.current.playersOnField).toHaveLength(3);
      // Mock formation returns positions at 0.1, 0.2, 0.3 (use toBeCloseTo for floating point)
      expect(result.current.playersOnField[0].relX).toBeCloseTo(0.1);
      expect(result.current.playersOnField[1].relX).toBeCloseTo(0.2);
      expect(result.current.playersOnField[2].relX).toBeCloseTo(0.3);
    });

    it('skips players already on field', () => {
      const player1 = TestFixtures.players.fieldPlayer({ id: 'fp1' });
      const player2 = TestFixtures.players.fieldPlayer({ id: 'fp2' });

      const params = createDefaultParams({
        initialState: {
          playersOnField: [{ ...player1, relX: 0.5, relY: 0.5 }],
        } as AppState,
        availablePlayers: [player1, player2],
        selectedPlayerIds: ['fp1', 'fp2'],
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      // Only player2 should be added (player1 already on field)
      expect(result.current.playersOnField).toHaveLength(2);
      expect(result.current.playersOnField.find(p => p.id === 'fp1')?.relX).toBe(0.5); // Original position
      expect(result.current.playersOnField.find(p => p.id === 'fp2')?.relX).toBe(0.1); // New position
    });

    it('does nothing when all selected players already on field', () => {
      const player1 = TestFixtures.players.fieldPlayer({ id: 'fp1' });

      const params = createDefaultParams({
        initialState: {
          playersOnField: [{ ...player1, relX: 0.5, relY: 0.5 }],
        } as AppState,
        availablePlayers: [player1],
        selectedPlayerIds: ['fp1'],
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      expect(result.current.playersOnField).toHaveLength(1);
      expect(mockSaveStateToHistory).not.toHaveBeenCalled();
    });

    it('returns early when no players selected', () => {
      const params = createDefaultParams({
        availablePlayers: [],
        selectedPlayerIds: [],
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      const initialPlayers = result.current.playersOnField.length;

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      // Should not add any players
      expect(result.current.playersOnField).toHaveLength(initialPlayers);
      expect(mockSaveStateToHistory).not.toHaveBeenCalled();
    });

    it('saves state to history after placing players', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1' });

      const params = createDefaultParams({
        availablePlayers: [player],
        selectedPlayerIds: ['fp1'],
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlaceAllPlayers();
      });

      expect(mockSaveStateToHistory).toHaveBeenCalledWith({
        playersOnField: expect.any(Array),
      });
    });
  });

  describe('touch/drag interactions', () => {
    it('drag-start sets dragging player info', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1' });
      const params = createDefaultParams();

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlayerDragStartFromBar(player);
      });

      expect(result.current.draggingPlayerFromBarInfo).toEqual(player);
    });

    it('tap-select sets dragging player', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1' });
      const params = createDefaultParams();

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlayerTapInBar(player);
      });

      expect(result.current.draggingPlayerFromBarInfo).toEqual(player);
    });

    it('tap-deselect clears dragging player when tapping same player', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1' });
      const params = createDefaultParams();

      const { result } = renderHook(() => useFieldCoordination(params));

      // First tap selects
      act(() => {
        result.current.handlePlayerTapInBar(player);
      });

      expect(result.current.draggingPlayerFromBarInfo).toEqual(player);

      // Second tap deselects
      act(() => {
        result.current.handlePlayerTapInBar(player);
      });

      expect(result.current.draggingPlayerFromBarInfo).toBeNull();
    });

    it('drag cancel clears dragging player', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1' });
      const params = createDefaultParams();

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlayerDragStartFromBar(player);
      });

      expect(result.current.draggingPlayerFromBarInfo).toEqual(player);

      act(() => {
        result.current.handlePlayerDragCancelViaTouch();
      });

      expect(result.current.draggingPlayerFromBarInfo).toBeNull();
    });

    it('deselect clears dragging player', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1' });
      const params = createDefaultParams();

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlayerDragStartFromBar(player);
      });

      expect(result.current.draggingPlayerFromBarInfo).toEqual(player);

      act(() => {
        result.current.handleDeselectPlayer();
      });

      expect(result.current.draggingPlayerFromBarInfo).toBeNull();
    });

    it('player drop via touch places player and clears dragging state', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1' });
      const params = createDefaultParams({
        availablePlayers: [player],
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      // Start drag
      act(() => {
        result.current.handlePlayerDragStartFromBar(player);
      });

      // Drop on field
      act(() => {
        result.current.handlePlayerDropViaTouch(0.3, 0.4);
      });

      expect(result.current.playersOnField).toContainEqual(
        expect.objectContaining({
          id: 'fp1',
          relX: 0.3,
          relY: 0.4,
        })
      );
      expect(result.current.draggingPlayerFromBarInfo).toBeNull();
    });

    it('player drop via touch handles missing player gracefully', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1' });
      const params = createDefaultParams({
        availablePlayers: [], // Player not in available list - logs error but doesn't throw
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlayerDragStartFromBar(player);
      });

      // This should handle gracefully (logs error, doesn't throw)
      act(() => {
        result.current.handlePlayerDropViaTouch(0.3, 0.4);
      });

      // Dragging state should still be cleared
      expect(result.current.draggingPlayerFromBarInfo).toBeNull();
      // Player not added since it wasn't in availablePlayers
      expect(result.current.playersOnField).toHaveLength(0);
    });
  });

  describe('field history restoration', () => {
    it('applyFieldHistoryState restores all field state', () => {
      const player1 = TestFixtures.players.fieldPlayer({ id: 'fp1', relX: 0.2, relY: 0.3 });
      const opponent1 = { id: 'opp1', relX: 0.7, relY: 0.8 };
      const drawing1 = [{ relX: 0.1, relY: 0.1 }, { relX: 0.9, relY: 0.9 }];
      const tacticalDisc1: TacticalDisc = { id: 'td1', relX: 0.5, relY: 0.5, type: 'home' };
      const tacticalDrawing1: Point[] = [{ relX: 0.2, relY: 0.2 }];
      const tacticalBall: Point = { relX: 0.6, relY: 0.6 };

      const historyState: AppState = {
        playersOnField: [player1],
        opponents: [opponent1],
        drawings: [drawing1],
        tacticalDiscs: [tacticalDisc1],
        tacticalDrawings: [tacticalDrawing1],
        tacticalBallPosition: tacticalBall,
      } as AppState;

      const params = createDefaultParams();
      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.applyFieldHistoryState(historyState);
      });

      expect(result.current.playersOnField).toEqual([player1]);
      expect(result.current.opponents).toEqual([opponent1]);
      expect(result.current.drawings).toEqual([drawing1]);
      expect(result.current.tacticalDiscs).toEqual([tacticalDisc1]);
      expect(result.current.tacticalDrawings).toEqual([tacticalDrawing1]);
      expect(result.current.tacticalBallPosition).toEqual(tacticalBall);
    });

    it('applyFieldHistoryState handles missing tactical state', () => {
      const historyState: AppState = {
        playersOnField: [],
        opponents: [],
        drawings: [],
        // No tactical state
      } as AppState;

      const params = createDefaultParams();
      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.applyFieldHistoryState(historyState);
      });

      expect(result.current.tacticalDiscs).toEqual([]);
      expect(result.current.tacticalDrawings).toEqual([]);
      expect(result.current.tacticalBallPosition).toBeNull();
    });
  });

  describe('tactical history operations', () => {
    it('handleTacticalUndo calls tactical history undo', () => {
      const tacticalState: TacticalState = {
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
      };
      mockTacticalHistoryUndo.mockReturnValue(tacticalState);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handleTacticalUndo();
      });

      expect(mockTacticalHistoryUndo).toHaveBeenCalledTimes(1);
    });

    it('handleTacticalRedo calls tactical history redo', () => {
      const tacticalState: TacticalState = {
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
      };
      mockTacticalHistoryRedo.mockReturnValue(tacticalState);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handleTacticalRedo();
      });

      expect(mockTacticalHistoryRedo).toHaveBeenCalledTimes(1);
    });

    it('tactical undo restores tactical state', () => {
      const tacticalDisc: TacticalDisc = { id: 'td1', relX: 0.5, relY: 0.5, type: 'home' };
      const tacticalState: TacticalState = {
        tacticalDiscs: [tacticalDisc],
        tacticalDrawings: [],
        tacticalBallPosition: { relX: 0.3, relY: 0.3 },
      };
      mockTacticalHistoryUndo.mockReturnValue(tacticalState);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handleTacticalUndo();
      });

      expect(result.current.tacticalDiscs).toEqual([tacticalDisc]);
      expect(result.current.tacticalBallPosition).toEqual({ relX: 0.3, relY: 0.3 });
    });

    it('tactical undo does nothing when no history', () => {
      mockTacticalHistoryUndo.mockReturnValue(null);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFieldCoordination(params));

      const initialDiscs = result.current.tacticalDiscs;

      act(() => {
        result.current.handleTacticalUndo();
      });

      expect(result.current.tacticalDiscs).toBe(initialDiscs);
    });
  });

  describe('player interactions', () => {
    it('handlePlayerMove updates player position', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1', relX: 0.2, relY: 0.3 });
      const params = createDefaultParams({
        initialState: {
          playersOnField: [player],
        } as AppState,
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlayerMove('fp1', 0.5, 0.6);
      });

      const movedPlayer = result.current.playersOnField.find(p => p.id === 'fp1');
      expect(movedPlayer).toEqual(expect.objectContaining({
        id: 'fp1',
        relX: 0.5,
        relY: 0.6,
      }));
    });

    it('handlePlayerMoveEnd saves state to history', () => {
      const player = TestFixtures.players.fieldPlayer({ id: 'fp1', relX: 0.2, relY: 0.3 });
      const params = createDefaultParams({
        initialState: {
          playersOnField: [player],
        } as AppState,
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlayerMoveEnd();
      });

      expect(mockSaveStateToHistory).toHaveBeenCalledWith({
        playersOnField: expect.any(Array),
      });
    });

    it('handlePlayerRemove removes player and saves history', () => {
      const player1 = TestFixtures.players.fieldPlayer({ id: 'fp1' });
      const player2 = TestFixtures.players.fieldPlayer({ id: 'fp2' });
      const params = createDefaultParams({
        initialState: {
          playersOnField: [player1, player2],
        } as AppState,
      });

      const { result } = renderHook(() => useFieldCoordination(params));

      act(() => {
        result.current.handlePlayerRemove('fp1');
      });

      expect(result.current.playersOnField).toHaveLength(1);
      expect(result.current.playersOnField[0].id).toBe('fp2');
      expect(mockSaveStateToHistory).toHaveBeenCalledWith({
        playersOnField: expect.arrayContaining([
          expect.objectContaining({ id: 'fp2' }),
        ]),
      });
    });
  });

  describe('canUndo/canRedo flags', () => {
    it('exposes canUndo flag from params', () => {
      const params = createDefaultParams({ canUndo: true });
      const { result } = renderHook(() => useFieldCoordination(params));

      expect(result.current.canUndoField).toBe(true);
    });

    it('exposes canRedo flag from params', () => {
      const params = createDefaultParams({ canRedo: true });
      const { result } = renderHook(() => useFieldCoordination(params));

      expect(result.current.canRedoField).toBe(true);
    });
  });
});
