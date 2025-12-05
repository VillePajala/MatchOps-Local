import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, Point, TacticalDisc } from '@/types';
import logger from '@/utils/logger';
import { debug } from '@/utils/debug';

export type TacticalState = Pick<AppState, 'tacticalDrawings' | 'tacticalDiscs' | 'tacticalBallPosition'>;

/**
 * TECHNICAL DEBT: Ref-based State Management
 *
 * This hook uses refs to bypass React's state batching, which allows precise control
 * over when saves occur but introduces potential risks:
 *
 * - Risk: State/UI desync if component unmounts during microtask execution
 * - Risk: Harder to debug state changes (bypasses React DevTools)
 * - Mitigation: Cleanup useEffect resets guard flags on unmount
 * - Future: Consider migrating to useReducer pattern for better React integration
 *
 * @see https://react.dev/learn/you-might-not-need-an-effect#chains-of-computations
 */

function cloneTactical(state: TacticalState): TacticalState {
  return {
    tacticalDrawings: (state.tacticalDrawings || []).map(poly => poly.map(p => ({ ...p } as Point))),
    tacticalDiscs: (state.tacticalDiscs || []).map(d => ({ ...d } as TacticalDisc)),
    tacticalBallPosition: state.tacticalBallPosition ? { ...state.tacticalBallPosition } : null,
  };
}

interface HistoryState {
  state: TacticalState;
  canUndo: boolean;
  canRedo: boolean;
}

export function useTacticalHistory(initial: TacticalState) {
  // Use useState for values needed during render (React 19 compliant)
  const [historyState, setHistoryState] = useState<HistoryState>(() => {
    const snap = cloneTactical(initial);
    return {
      state: snap,
      canUndo: false,
      canRedo: false,
    };
  });

  // Refs for mutable data that callbacks need but shouldn't trigger re-renders
  const historyStackRef = useRef<TacticalState[]>([]);
  const indexRef = useRef(0);
  const isApplyingRef = useRef(false);

  // Initialize refs once
  useEffect(() => {
    const snap = cloneTactical(initial);
    historyStackRef.current = [snap];
    indexRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // P2 FIX: Reset guard flag on unmount to prevent race conditions
  useEffect(() => {
    return () => {
      isApplyingRef.current = false;
    };
  }, []);

  // Helper to update state (only call in event handlers/effects)
  const updateState = useCallback(() => {
    const history = historyStackRef.current;
    const idx = indexRef.current;
    const current = history[idx];
    if (current) {
      setHistoryState({
        state: current,
        canUndo: idx > 0,
        canRedo: idx < history.length - 1,
      });
    }
  }, []);

  const applySnapshot = useCallback((next: TacticalState) => {
    // Replace current top-of-stack with provided snapshot and advance index
    const cloned = cloneTactical(next);
    isApplyingRef.current = true;
    const cutAt = indexRef.current + 1;
    const base = historyStackRef.current.slice(0, cutAt);
    base.push(cloned);
    historyStackRef.current = base;
    indexRef.current = base.length - 1;
    updateState();
    queueMicrotask(() => { isApplyingRef.current = false; });
  }, [updateState]);

  const save = useCallback((partial: Partial<TacticalState>) => {
    if (isApplyingRef.current) return; // never save while applying undo/redo
    const baseState = historyStackRef.current[indexRef.current] || historyState.state;
    const merged: TacticalState = {
      tacticalDrawings: partial.tacticalDrawings !== undefined ? partial.tacticalDrawings : (baseState.tacticalDrawings || []),
      tacticalDiscs: partial.tacticalDiscs !== undefined ? partial.tacticalDiscs : (baseState.tacticalDiscs || []),
      tacticalBallPosition: partial.tacticalBallPosition !== undefined ? partial.tacticalBallPosition : (baseState.tacticalBallPosition || null),
    } as TacticalState;

    const snapshot = cloneTactical(merged);
    const prev = historyStackRef.current[indexRef.current];
    // P3: Gate logging behind DEBUG flag
    if (debug.enabled('tactical')) {
      try { logger.log('[TacticalHistory] push', { prevLen: (prev?.tacticalDrawings || []).length, nextLen: (snapshot.tacticalDrawings || []).length }); } catch {}
    }
    const cutAt = indexRef.current + 1; // drop any redo states
    const nextHistory = historyStackRef.current.slice(0, cutAt);
    nextHistory.push(snapshot);
    historyStackRef.current = nextHistory;
    indexRef.current = nextHistory.length - 1;
    updateState();
  }, [historyState.state, updateState]);

  const safeUndo = useCallback(() => {
    if (indexRef.current === 0) return null;
    // Set guard flag to block saves during undo application
    isApplyingRef.current = true;
    indexRef.current = indexRef.current - 1;
    const prev = historyStackRef.current[indexRef.current];
    // P3: Gate logging behind DEBUG flag
    if (debug.enabled('tactical')) {
      try { logger.log('[TacticalHistory] undo -> state', { drawingsLen: prev?.tacticalDrawings?.length || 0 }); } catch {}
    }
    updateState();
    // Clear guard flag after microtasks complete (after React processes state updates)
    queueMicrotask(() => { isApplyingRef.current = false; });
    return prev;
  }, [updateState]);

  const safeRedo = useCallback(() => {
    if (indexRef.current >= historyStackRef.current.length - 1) return null;
    // Set guard flag to block saves during redo application
    isApplyingRef.current = true;
    indexRef.current = indexRef.current + 1;
    const next = historyStackRef.current[indexRef.current];
    // P3: Gate logging behind DEBUG flag
    if (debug.enabled('tactical')) {
      try { logger.log('[TacticalHistory] redo -> state', { drawingsLen: next?.tacticalDrawings?.length || 0 }); } catch {}
    }
    updateState();
    // Clear guard flag after microtasks complete (after React processes state updates)
    queueMicrotask(() => { isApplyingRef.current = false; });
    return next;
  }, [updateState]);

  const reset = useCallback((next: TacticalState) => {
    const snap = cloneTactical(next);
    historyStackRef.current = [snap];
    indexRef.current = 0;
    updateState();
  }, [updateState]);

  return {
    state: historyState.state,
    save,
    undo: safeUndo,
    redo: safeRedo,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    applySnapshot,
    reset,
  };
}

export default useTacticalHistory;
