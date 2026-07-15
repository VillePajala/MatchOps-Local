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
 * Repaints on container resize (DPR-aware). In test environments without a
 * canvas 2D context or ResizeObserver it renders an inert element.
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

    const paint = () => {
      const rect = parent.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return; // jsdom: no 2D context - leave the element inert
      ctx.scale(dpr, dpr);
      const config = getFieldConfig('soccer');
      drawFieldBackground(ctx, rect.width, rect.height, config);
      drawFieldMarkings(ctx, rect.width, rect.height, config);
    };

    paint();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
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
