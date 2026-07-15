'use client';

/**
 * Playing-Time Planner — the REAL pitch as the planner field's backdrop.
 *
 * Paints the exact same grass and markings as the live game's SoccerField by
 * reusing its extracted canvas painters (drawFieldBackground +
 * drawFieldMarkings from fieldDrawing.ts): noise-textured grass, mowing
 * stripes, lighting, penalty boxes, arcs, spots. The planner's interactive
 * discs/pills stay plain DOM and render ON TOP of this canvas - only the
 * scenery is canvas, so nothing about tap targets or accessibility changes.
 *
 * Repaints on container resize (DPR-aware), coalesced through
 * requestAnimationFrame and skipped when the size hasn't actually changed -
 * the painters regenerate noise patterns, so uncoalesced observer bursts
 * (orientation change, drag-resize) would burn work for identical frames.
 * In test environments without a canvas 2D context or ResizeObserver it
 * renders an inert element.
 */
import React, { useEffect, useRef } from 'react';
import { getFieldConfig } from '@/config/fieldConfigs';
import { drawFieldBackground, drawFieldMarkings } from '@/utils/fieldDrawing';

const PlanFieldBackdrop: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    let lastW = 0;
    let lastH = 0;
    let frameId: number | null = null;

    const paint = () => {
      frameId = null;
      const rect = parent.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      // Same size as the last paint: the frame would be identical - skip
      // (the painters regenerate noise patterns; this is the expensive part).
      if (w === lastW && h === lastH) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return; // jsdom: no 2D context - leave the element inert
      lastW = w;
      lastH = h;
      canvas.width = w;
      canvas.height = h;
      ctx.scale(dpr, dpr);
      // The planner has no futsal concept (PlanGame carries no gameType), so
      // the soccer pitch is THE pitch here - revisit if plans ever go indoor.
      const config = getFieldConfig('soccer');
      drawFieldBackground(ctx, rect.width, rect.height, config);
      drawFieldMarkings(ctx, rect.width, rect.height, config);
    };

    // Coalesce observer bursts into one paint per frame.
    const schedulePaint = () => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(paint);
    };

    paint();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(schedulePaint);
    observer.observe(parent);
    return () => {
      observer.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="plan-field-backdrop"
      className="absolute inset-0 w-full h-full"
    />
  );
};

export default PlanFieldBackdrop;
