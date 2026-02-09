import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import logger from '@/utils/logger';
import { debug } from '@/utils/debug';
import type { Point, TacticalDisc, AppState } from '@/types';

interface UseTacticalBoardArgs {
  initialDiscs?: TacticalDisc[];
  initialDrawings?: Point[][];
  initialBallPosition?: Point | null;
  saveStateToHistory: (partial: Partial<AppState>) => void;
}

/**
 * TECHNICAL DEBT: Ref-based State Management
 *
 * This hook uses refs to avoid stale closures in callbacks, particularly for
 * handleTacticalDrawingEnd which needs the latest state.
 *
 * - Risk: Potential state/UI desync if component unmounts during ref updates
 * - Mitigation: Cleanup useEffect resets refs on unmount
 * - Future: Consider migrating to useReducer pattern for better React integration
 */

export const useTacticalBoard = ({
  initialDiscs = [],
  initialDrawings = [],
  initialBallPosition = { relX: 0.5, relY: 0.5 },
  saveStateToHistory,
}: UseTacticalBoardArgs) => {
  const [isTacticsBoardView, setIsTacticsBoardView] = useState(false);
  const [tacticalDiscs, setTacticalDiscs] = useState<TacticalDisc[]>(initialDiscs);
  const [tacticalDrawings, setTacticalDrawings] = useState<Point[][]>(initialDrawings);
  const [tacticalBallPosition, setTacticalBallPosition] = useState<Point | null>(initialBallPosition);

  // Keep refs in sync with current state to avoid stale closures
  const tacticalDrawingsRef = useRef(tacticalDrawings);
  const tacticalDiscsRef = useRef(tacticalDiscs);
  const tacticalBallPositionRef = useRef(tacticalBallPosition);

  useEffect(() => {
    tacticalDrawingsRef.current = tacticalDrawings;
  }, [tacticalDrawings]);

  useEffect(() => {
    tacticalDiscsRef.current = tacticalDiscs;
  }, [tacticalDiscs]);

  useEffect(() => {
    tacticalBallPositionRef.current = tacticalBallPosition;
  }, [tacticalBallPosition]);

  // Stroke lifecycle ref to ensure exactly one save per stroke
  const isStrokeActiveRef = useRef(false);

  // P2 FIX: Reset stroke flag on unmount to prevent race conditions
  useEffect(() => {
    return () => {
      isStrokeActiveRef.current = false;
    };
  }, []);

  const handleToggleTacticsBoard = useCallback(() => {
    setIsTacticsBoardView((prev) => !prev);
  }, []);

  const handleAddTacticalDisc = useCallback(
    (type: 'home' | 'opponent') => {
      const newDisc: TacticalDisc = {
        id: `tactical-${type}-${Date.now()}`,
        relX: 0.5,
        relY: 0.5,
        type,
      };
      const newDiscs = [...tacticalDiscsRef.current, newDisc];
      setTacticalDiscs(newDiscs);
      saveStateToHistory({ tacticalDiscs: newDiscs });
    },
    [saveStateToHistory]
  );

  const handleTacticalDiscMove = useCallback(
    (discId: string, relX: number, relY: number) => {
      // Only update position during drag - save happens on drag end to avoid
      // flooding history with per-pixel saves (which can trigger timing bugs)
      const newDiscs = tacticalDiscsRef.current.map((d) => (d.id === discId ? { ...d, relX, relY } : d));
      setTacticalDiscs(newDiscs);
    },
    []
  );

  const handleTacticalDiscMoveEnd = useCallback(() => {
    // Save final position when drag ends
    saveStateToHistory({ tacticalDiscs: tacticalDiscsRef.current });
  }, [saveStateToHistory]);

  const handleTacticalDiscRemove = useCallback(
    (discId: string) => {
      const newDiscs = tacticalDiscsRef.current.filter((d) => d.id !== discId);
      setTacticalDiscs(newDiscs);
      saveStateToHistory({ tacticalDiscs: newDiscs });
    },
    [saveStateToHistory]
  );

  const handleToggleTacticalDiscType = useCallback(
    (discId: string) => {
      const newDiscs = tacticalDiscsRef.current.map((d) => {
        if (d.id === discId) {
          const nextType =
            d.type === 'home' ? 'opponent' : d.type === 'opponent' ? 'goalie' : 'home';
          return { ...d, type: nextType as typeof d.type };
        }
        return d;
      });
      setTacticalDiscs(newDiscs);
      saveStateToHistory({ tacticalDiscs: newDiscs });
    },
    [saveStateToHistory]
  );

  const handleTacticalBallMove = useCallback(
    (position: Point) => {
      // Only update position during drag - save happens on drag end to avoid
      // flooding history with per-pixel saves (which can trigger timing bugs)
      setTacticalBallPosition(position);
    },
    []
  );

  const handleTacticalBallMoveEnd = useCallback(() => {
    // Save final position when drag ends
    saveStateToHistory({ tacticalBallPosition: tacticalBallPositionRef.current });
  }, [saveStateToHistory]);

  const handleTacticalDrawingStart = useCallback((point: Point) => {
    // If a previous stroke didn't finalize for any reason, finalize it now without saving
    if (isStrokeActiveRef.current) {
      isStrokeActiveRef.current = false;
    }
    isStrokeActiveRef.current = true;
    setTacticalDrawings((prev) => {
      const next = [...prev, [point]];
      // Keep the ref in sync synchronously so end handler always sees the latest value
      tacticalDrawingsRef.current = next;
      // P3: Gate logging behind DEBUG flag
      if (debug.enabled('tactical')) {
        try { logger.log('[TacticalDrawing] start', { prevLen: prev.length }); } catch {}
      }
      return next;
    });
  }, []);

  const handleTacticalDrawingAddPoint = useCallback((point: Point) => {
    setTacticalDrawings((prev) => {
      const drawings = [...prev];
      if (drawings.length > 0) {
        // Spread to create a new inner array (avoids mutating prev's inner array)
        drawings[drawings.length - 1] = [...drawings[drawings.length - 1], point];
      }
      // Sync ref eagerly to avoid race between effect update and end handler
      tacticalDrawingsRef.current = drawings;
      return drawings;
    });
  }, []);

  const handleTacticalDrawingEnd = useCallback(() => {
    // Only save once per stroke end
    const lines = tacticalDrawingsRef.current.length;
    // P3: Gate logging behind DEBUG flag
    if (debug.enabled('tactical')) {
      try { logger.log('[TacticalDrawing] end', { lines }); } catch {}
    }
    if (!isStrokeActiveRef.current) {
      return; // duplicate end — ignore
    }
    isStrokeActiveRef.current = false;
    // Persist the exact snapshot we just drew.
    // Duplicate touchend/mouseup calls are filtered by isStrokeActiveRef above.
    saveStateToHistory({ tacticalDrawings: tacticalDrawingsRef.current });
  }, [saveStateToHistory]);

  const clearTacticalElements = useCallback(() => {
    setTacticalDiscs([]);
    setTacticalDrawings([]);
    const resetBall = { relX: 0.5, relY: 0.5 };
    setTacticalBallPosition(resetBall);
    saveStateToHistory({ tacticalDiscs: [], tacticalDrawings: [], tacticalBallPosition: resetBall });
  }, [saveStateToHistory]);

  return useMemo(() => ({
    isTacticsBoardView,
    setIsTacticsBoardView,
    tacticalDiscs,
    tacticalDrawings,
    tacticalBallPosition,
    handleToggleTacticsBoard,
    handleAddTacticalDisc,
    handleTacticalDiscMove,
    handleTacticalDiscMoveEnd,
    handleTacticalDiscRemove,
    handleToggleTacticalDiscType,
    handleTacticalBallMove,
    handleTacticalBallMoveEnd,
    handleTacticalDrawingStart,
    handleTacticalDrawingAddPoint,
    handleTacticalDrawingEnd,
    clearTacticalElements,
    setTacticalDiscs,
    setTacticalDrawings,
    setTacticalBallPosition,
  }), [
    isTacticsBoardView, tacticalDiscs, tacticalDrawings, tacticalBallPosition,
    handleToggleTacticsBoard, handleAddTacticalDisc, handleTacticalDiscMove,
    handleTacticalDiscMoveEnd, handleTacticalDiscRemove, handleToggleTacticalDiscType,
    handleTacticalBallMove, handleTacticalBallMoveEnd, handleTacticalDrawingStart,
    handleTacticalDrawingAddPoint, handleTacticalDrawingEnd, clearTacticalElements,
  ]);
};
