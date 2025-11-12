/**
 * Integration tests for undo/redo functionality
 *
 * These tests verify that the circular loop bug is fixed:
 * - Undo should move back in history without creating new entries
 * - Redo should move forward in history
 * - Multiple undo/redo operations should work correctly
 *
 * @integration
 */

import { renderHook, act } from '@testing-library/react';
import { useUndoRedo } from '@/hooks/useUndoRedo';

describe('Undo/Redo Integration', () => {
  /**
   * Tests the core undo/redo hook to ensure it functions correctly
   * @critical
   */
  it('should handle undo without creating circular loop', () => {
    const { result } = renderHook(() => useUndoRedo<number>(0));

    // Add some history
    act(() => {
      result.current.set(1);
      result.current.set(2);
      result.current.set(3);
    });

    expect(result.current.state).toBe(3);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Undo once
    let undoneState: number | undefined;
    act(() => {
      undoneState = result.current.undo();
    });

    expect(undoneState).toBe(2);
    expect(result.current.state).toBe(2);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    // Undo again
    act(() => {
      undoneState = result.current.undo();
    });

    expect(undoneState).toBe(1);
    expect(result.current.state).toBe(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
  });

  /**
   * Tests multiple undo/redo operations to ensure history navigation works
   * @critical
   */
  it('should handle multiple undo and redo operations', () => {
    const { result } = renderHook(() => useUndoRedo<string>('initial'));

    // Build history
    act(() => {
      result.current.set('state1');
      result.current.set('state2');
      result.current.set('state3');
      result.current.set('state4');
    });

    // Undo twice
    act(() => {
      result.current.undo(); // back to state3
      result.current.undo(); // back to state2
    });

    expect(result.current.state).toBe('state2');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    // Redo once
    act(() => {
      result.current.redo(); // forward to state3
    });

    expect(result.current.state).toBe('state3');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    // Undo three times to reach initial
    act(() => {
      result.current.undo(); // back to state2
      result.current.undo(); // back to state1
      result.current.undo(); // back to initial
    });

    expect(result.current.state).toBe('initial');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  /**
   * Tests that undo at the beginning of history doesn't break
   */
  it('should handle undo at beginning of history gracefully', () => {
    const { result } = renderHook(() => useUndoRedo<number>(0));

    expect(result.current.canUndo).toBe(false);

    let undoneState: number | null | undefined;
    act(() => {
      undoneState = result.current.undo();
    });

    expect(undoneState).toBeNull();
    expect(result.current.state).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });

  /**
   * Tests that redo at the end of history doesn't break
   */
  it('should handle redo at end of history gracefully', () => {
    const { result } = renderHook(() => useUndoRedo<number>(0));

    act(() => {
      result.current.set(1);
    });

    expect(result.current.canRedo).toBe(false);

    let redoneState: number | null | undefined;
    act(() => {
      redoneState = result.current.redo();
    });

    expect(redoneState).toBeNull();
    expect(result.current.state).toBe(1);
    expect(result.current.canRedo).toBe(false);
  });

  /**
   * Tests that adding new state after undo discards redo history
   * This is expected behavior to prevent confusing history states
   */
  it('should discard redo history when adding new state after undo', () => {
    const { result } = renderHook(() => useUndoRedo<number>(0));

    // Build history
    act(() => {
      result.current.set(1);
      result.current.set(2);
      result.current.set(3);
    });

    // Undo twice
    act(() => {
      result.current.undo(); // back to 2
      result.current.undo(); // back to 1
    });

    expect(result.current.state).toBe(1);
    expect(result.current.canRedo).toBe(true);

    // Add new state - this should discard redo history
    act(() => {
      result.current.set(99);
    });

    expect(result.current.state).toBe(99);
    expect(result.current.canRedo).toBe(false);

    // Undo should go back to 1, not to 2 or 3
    act(() => {
      result.current.undo();
    });

    expect(result.current.state).toBe(1);
  });
});
