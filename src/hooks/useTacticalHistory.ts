import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function useTacticalHistory(initial: TacticalState) {
  // Maintain our own snapshot stack to avoid React state batching pitfalls.
  const initialSnapshot = useRef<TacticalState>(cloneTactical(initial));
  const historyRef = useRef<TacticalState[]>([initialSnapshot.current]);
  const indexRef = useRef(0);
  const [version, setVersion] = useState(0); // trigger re-renders
  const isApplyingRef = useRef(false);
  const currentRef = useRef<TacticalState>(initialSnapshot.current);

  const getState = () => historyRef.current[indexRef.current];

  // Keep a ref to the latest state for merges
  useEffect(() => {
    currentRef.current = getState();
  }, [version]);

  // P2 FIX: Reset guard flag on unmount to prevent race conditions
  useEffect(() => {
    return () => {
      isApplyingRef.current = false;
    };
  }, []);

  const applySnapshot = useCallback((next: TacticalState) => {
    // Replace current top-of-stack with provided snapshot and advance index
    const cloned = cloneTactical(next);
    isApplyingRef.current = true;
    const cutAt = indexRef.current + 1;
    const base = historyRef.current.slice(0, cutAt);
    base.push(cloned);
    historyRef.current = base;
    indexRef.current = base.length - 1;
    currentRef.current = cloned;
    setVersion(v => v + 1);
    queueMicrotask(() => { isApplyingRef.current = false; });
  }, []);

  const save = useCallback((partial: Partial<TacticalState>) => {
    if (isApplyingRef.current) return; // never save while applying undo/redo
    const baseState = currentRef.current || initialSnapshot.current;
    const merged: TacticalState = {
      tacticalDrawings: partial.tacticalDrawings !== undefined ? partial.tacticalDrawings : (baseState.tacticalDrawings || []),
      tacticalDiscs: partial.tacticalDiscs !== undefined ? partial.tacticalDiscs : (baseState.tacticalDiscs || []),
      tacticalBallPosition: partial.tacticalBallPosition !== undefined ? partial.tacticalBallPosition : (baseState.tacticalBallPosition || null),
    } as TacticalState;

    const snapshot = cloneTactical(merged);
    const prev = getState();
    // P3: Gate logging behind DEBUG flag
    if (debug.enabled('tactical')) {
      try { logger.log('[TacticalHistory] push', { prevLen: (prev.tacticalDrawings || []).length, nextLen: (snapshot.tacticalDrawings || []).length }); } catch {}
    }
    const cutAt = indexRef.current + 1; // drop any redo states
    const nextHistory = historyRef.current.slice(0, cutAt);
    nextHistory.push(snapshot);
    historyRef.current = nextHistory;
    indexRef.current = nextHistory.length - 1;
    currentRef.current = snapshot;
    setVersion(v => v + 1);
  }, []);

  const safeUndo = useCallback(() => {
    if (indexRef.current === 0) return null;
    // Set guard flag to block saves during undo application
    isApplyingRef.current = true;
    indexRef.current = indexRef.current - 1;
    const prev = getState();
    // P3: Gate logging behind DEBUG flag
    if (debug.enabled('tactical')) {
      try { logger.log('[TacticalHistory] undo -> state', { drawingsLen: prev.tacticalDrawings?.length || 0 }); } catch {}
    }
    currentRef.current = prev;
    setVersion(v => v + 1);
    // Clear guard flag after microtasks complete (after React processes state updates)
    queueMicrotask(() => { isApplyingRef.current = false; });
    return prev;
  }, []);

  const safeRedo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return null;
    // Set guard flag to block saves during redo application
    isApplyingRef.current = true;
    indexRef.current = indexRef.current + 1;
    const next = getState();
    // P3: Gate logging behind DEBUG flag
    if (debug.enabled('tactical')) {
      try { logger.log('[TacticalHistory] redo -> state', { drawingsLen: next.tacticalDrawings?.length || 0 }); } catch {}
    }
    currentRef.current = next;
    setVersion(v => v + 1);
    // Clear guard flag after microtasks complete (after React processes state updates)
    queueMicrotask(() => { isApplyingRef.current = false; });
    return next;
  }, []);

  const reset = useCallback((next: TacticalState) => {
    const snap = cloneTactical(next);
    historyRef.current = [snap];
    indexRef.current = 0;
    currentRef.current = snap;
    setVersion(v => v + 1);
  }, []);

  const state = getState();
  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < historyRef.current.length - 1;

  return useMemo(() => ({
    state,
    save,
    undo: safeUndo,
    redo: safeRedo,
    canUndo,
    canRedo,
    applySnapshot,
    reset,
  }), [state, save, safeUndo, safeRedo, canUndo, canRedo, applySnapshot, reset]);
}

export default useTacticalHistory;
