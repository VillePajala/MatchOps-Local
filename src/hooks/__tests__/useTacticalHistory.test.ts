/**
 * Tests for useTacticalHistory hook
 *
 * Critical undo/redo functionality with subtle race conditions:
 * - save() creates new history entries
 * - undo/redo navigation works correctly
 * - save during apply is blocked (isApplyingRef guard)
 * - deep cloning prevents reference aliasing
 * - duplicate stroke end calls are ignored
 *
 * @critical
 */

import { renderHook, act } from '@testing-library/react';
import { useTacticalHistory, TacticalState } from '../useTacticalHistory';
import type { Point, TacticalDisc } from '@/types';

describe('useTacticalHistory', () => {
  const createInitialState = (): TacticalState => ({
    tacticalDrawings: [],
    tacticalDiscs: [],
    tacticalBallPosition: null,
  });

  const createPoint = (x: number, y: number): Point => ({ relX: x, relY: y });

  const createDisc = (id: string, x: number, y: number): TacticalDisc => ({
    id,
    relX: x,
    relY: y,
    type: 'home',
  });

  describe('initialization', () => {
    it('should initialize with provided state', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      expect(result.current.state).toEqual(initial);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('save()', () => {
    it('should create new history entry when saving', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.5, 0.5)]] });
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(1);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it('should merge partial state with current state', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
      });

      act(() => {
        result.current.save({ tacticalDiscs: [createDisc('disc1', 0.2, 0.2)] });
      });

      // Both should be present (merge, not replace)
      expect(result.current.state.tacticalDrawings).toHaveLength(1);
      expect(result.current.state.tacticalDiscs).toHaveLength(1);
    });

    it('should truncate redo history when saving after undo', async () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      // Create history: [initial, state1, state2]
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
      });
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.2, 0.2)]] });
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);

      // Undo twice: back to initial
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);

      // Wait for undo guard to clear
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      // Save new state - should truncate redo history
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.3, 0.3)]] });
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false); // Redo history cleared
    });

    it('should deep clone state to prevent reference aliasing', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      const drawing = [createPoint(0.5, 0.5)];
      act(() => {
        result.current.save({ tacticalDrawings: [drawing] });
      });

      // Mutate original array
      drawing.push(createPoint(0.6, 0.6));

      // History should NOT be affected
      expect(result.current.state.tacticalDrawings?.[0]).toHaveLength(1);
    });
  });

  describe('undo()', () => {
    it('should navigate backward in history', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      // Create history: [initial, state1, state2]
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
      });
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.2, 0.2)], [createPoint(0.3, 0.3)]] });
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(2);

      // Undo once: back to state1
      let prevState: TacticalState | null = null;
      act(() => {
        prevState = result.current.undo();
      });

      expect(prevState).not.toBeNull();
      expect(result.current.state.tacticalDrawings).toHaveLength(1);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);

      // Undo again: back to initial
      act(() => {
        prevState = result.current.undo();
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it('should return null when at beginning of history', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      let prevState: TacticalState | null = null;
      act(() => {
        prevState = result.current.undo();
      });

      expect(prevState).toBeNull();
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('redo()', () => {
    it('should navigate forward in history', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      // Create history
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
      });
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.2, 0.2)], [createPoint(0.3, 0.3)]] });
      });

      // Undo twice
      act(() => {
        result.current.undo();
        result.current.undo();
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(0);

      // Redo once
      let nextState: TacticalState | null = null;
      act(() => {
        nextState = result.current.redo();
      });

      expect(nextState).not.toBeNull();
      expect(result.current.state.tacticalDrawings).toHaveLength(1);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);

      // Redo again
      act(() => {
        nextState = result.current.redo();
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(2);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it('should return null when at end of history', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      let nextState: TacticalState | null = null;
      act(() => {
        nextState = result.current.redo();
      });

      expect(nextState).toBeNull();
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('save during apply guard (isApplyingRef)', () => {
    it('should block save during undo application', async () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      // Create history
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
      });
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.2, 0.2)], [createPoint(0.3, 0.3)]] });
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(2);

      // Undo and immediately try to save (should be blocked)
      act(() => {
        result.current.undo();
        // This save should be blocked by isApplyingRef
        result.current.save({ tacticalDrawings: [[createPoint(0.9, 0.9)]] });
      });

      // State should be from undo, not the blocked save
      expect(result.current.state.tacticalDrawings).toHaveLength(1);
      expect(result.current.state.tacticalDrawings?.[0][0].relX).toBe(0.1);
    });

    it('should block save during redo application', async () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      // Create history
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
      });
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.2, 0.2)]] });
      });

      // Undo to create redo opportunity
      act(() => {
        result.current.undo();
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(1);

      // Redo and immediately try to save (should be blocked)
      act(() => {
        result.current.redo();
        // This save should be blocked by isApplyingRef
        result.current.save({ tacticalDrawings: [[createPoint(0.9, 0.9)]] });
      });

      // State should be from redo, not the blocked save
      expect(result.current.state.tacticalDrawings).toHaveLength(1);
      expect(result.current.state.tacticalDrawings?.[0][0].relX).toBe(0.2);
    });

    it('should allow save after guard clears', async () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      // Create history
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
      });

      // Undo
      act(() => {
        result.current.undo();
      });

      // Wait for microtask to clear guard
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      // Now save should work
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.9, 0.9)]] });
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(1);
      expect(result.current.state.tacticalDrawings?.[0][0].relX).toBe(0.9);
    });
  });

  describe('applySnapshot()', () => {
    it('should replace current state and advance history', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      // Create some history
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
      });

      // Apply snapshot
      const newSnapshot: TacticalState = {
        tacticalDrawings: [[createPoint(0.5, 0.5)], [createPoint(0.6, 0.6)]],
        tacticalDiscs: [createDisc('disc1', 0.7, 0.7)],
        tacticalBallPosition: createPoint(0.8, 0.8),
      };

      act(() => {
        result.current.applySnapshot(newSnapshot);
      });

      expect(result.current.state).toEqual(newSnapshot);
      expect(result.current.canUndo).toBe(true);
    });
  });

  describe('reset()', () => {
    it('should clear history and reset to new state', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      // Create history
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
      });
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.2, 0.2)]] });
      });

      expect(result.current.canUndo).toBe(true);

      // Reset
      const newState = createInitialState();
      newState.tacticalDiscs = [createDisc('disc1', 0.5, 0.5)];

      act(() => {
        result.current.reset(newState);
      });

      expect(result.current.state).toEqual(newState);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('reference aliasing prevention', () => {
    it('should prevent aliasing in tacticalDrawings', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      const drawing1 = [createPoint(0.1, 0.1)];
      const drawing2 = [createPoint(0.2, 0.2)];

      act(() => {
        result.current.save({ tacticalDrawings: [drawing1] });
      });

      act(() => {
        result.current.save({ tacticalDrawings: [drawing2] });
      });

      // Mutate original arrays
      drawing1.push(createPoint(0.9, 0.9));
      drawing2.push(createPoint(0.8, 0.8));

      // Undo to first state
      act(() => {
        result.current.undo();
      });

      // Should have original length, unaffected by mutation
      expect(result.current.state.tacticalDrawings?.[0]).toHaveLength(1);
      expect(result.current.state.tacticalDrawings?.[0][0].relX).toBe(0.1);
    });

    it('should prevent aliasing in tacticalDiscs', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      const disc = createDisc('disc1', 0.5, 0.5);

      act(() => {
        result.current.save({ tacticalDiscs: [disc] });
      });

      // Mutate original disc
      disc.relX = 0.9;
      disc.relY = 0.9;

      // History should not be affected
      expect(result.current.state.tacticalDiscs?.[0].relX).toBe(0.5);
      expect(result.current.state.tacticalDiscs?.[0].relY).toBe(0.5);
    });
  });

  describe('edge cases', () => {
    it('should handle empty arrays correctly', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      act(() => {
        result.current.save({ tacticalDrawings: [] });
      });

      expect(result.current.state.tacticalDrawings).toEqual([]);
    });

    it('should handle null ball position', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      act(() => {
        result.current.save({ tacticalBallPosition: null });
      });

      expect(result.current.state.tacticalBallPosition).toBeNull();
    });

    it('should handle rapid successive saves', () => {
      const initial = createInitialState();
      const { result } = renderHook(() => useTacticalHistory(initial));

      // Rapid saves (simulating fast drawing)
      act(() => {
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)]] });
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)], [createPoint(0.2, 0.2)]] });
        result.current.save({ tacticalDrawings: [[createPoint(0.1, 0.1)], [createPoint(0.2, 0.2)], [createPoint(0.3, 0.3)]] });
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(3);
      expect(result.current.canUndo).toBe(true);

      // Should be able to undo to initial
      act(() => {
        result.current.undo();
        result.current.undo();
        result.current.undo();
      });

      expect(result.current.state.tacticalDrawings).toHaveLength(0);
    });
  });
});
