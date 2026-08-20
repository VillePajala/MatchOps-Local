'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useModalHardwareBack from '@/hooks/useModalHardwareBack';
import type { TourStep } from './tourTypes';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface GuidedTourOverlayProps {
  step: TourStep;
  stepIndex: number;
  stepCount: number;
  isFinal: boolean;
  onNext: () => void;
  onSkip: () => void;
}

/** Extra px of breathing room around a spotlighted control. */
const SPOTLIGHT_PADDING = 6;
const CARD_WIDTH = 320;

function readRect(selector: string | undefined): Rect | null {
  if (!selector || typeof document === 'undefined') return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // jsdom and not-yet-laid-out elements report a zero box - treat as "not found"
  // so the step falls back to a centered card instead of a broken spotlight.
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The tour's visual layer: dims the app and either spotlights one control (a
 * cutout the user can still click through) or shows a centered card. Rendered
 * via a portal to document.body so it floats above every app surface. It never
 * makes the app inert (unlike modal focus traps) - the whole point is that the
 * user can interact with the highlighted control to advance.
 */
const GuidedTourOverlay: React.FC<GuidedTourOverlayProps> = ({
  step,
  stepIndex,
  stepCount,
  isFinal,
  onNext,
  onSkip,
}) => {
  const { t } = useTranslation();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<Rect | null>(() => readRect(step.targetSelector));

  // Hardware / browser back = skip the tour (no inert, no history desync issues:
  // useModalHardwareBack owns a single sentinel entry).
  useModalHardwareBack(true, () => {
    onSkip();
  });

  // While a target is set, keep the spotlight rect current: on resize/scroll and
  // DOM mutations - the target's modal may open only after the step becomes
  // active, so we watch for it appearing. The initial rect comes from the
  // useState initializer (the overlay is remounted per step via a `key`), so the
  // effect only wires up listeners and never sets state synchronously.
  useEffect(() => {
    if (!step.targetSelector) return;
    const recompute = () => setRect(readRect(step.targetSelector));
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    const observer = new MutationObserver(recompute);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
      observer.disconnect();
    };
  }, [step.targetSelector]);

  // Move focus to the primary action when the step appears (keyboard users).
  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    },
    [onSkip],
  );

  if (typeof document === 'undefined') return null;

  const title = t(step.titleKey, step.title);
  const body = t(step.bodyKey, step.body);
  const nextLabel = isFinal
    ? t('guidedTour.buttons.finish', 'Done')
    : t('guidedTour.buttons.next', 'Next');
  const skipLabel = t('guidedTour.buttons.skip', 'Skip');

  const card = (
    <div
      data-testid="guided-tour-card"
      className="pointer-events-auto w-full rounded-2xl border border-slate-600 bg-slate-800 p-5 text-white shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <h2 data-testid="guided-tour-title" className="mb-2 text-lg font-bold tracking-tight">
        {title}
      </h2>
      <p data-testid="guided-tour-body" className="mb-4 text-sm text-slate-300">
        {body}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button
          ref={primaryRef}
          type="button"
          data-testid="guided-tour-next"
          onClick={onNext}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-indigo-500 sm:w-auto"
        >
          {nextLabel}
        </button>
        <button
          type="button"
          data-testid="guided-tour-skip"
          onClick={onSkip}
          className="w-full rounded-lg bg-slate-700 px-4 py-2.5 font-medium text-slate-200 transition-colors hover:bg-slate-600 sm:w-auto"
        >
          {skipLabel}
        </button>
      </div>
      {stepCount > 1 && (
        <div className="mt-3 text-center text-xs text-slate-500">
          {stepIndex + 1} / {stepCount}
        </div>
      )}
    </div>
  );

  // Centered card: no target (or target not found) - dim the whole screen.
  if (rect === null) {
    return createPortal(
      <div
        data-testid="guided-tour-overlay"
        className="fixed inset-0 z-[80]"
        onKeyDown={handleKeyDown}
      >
        <div className="absolute inset-0 bg-black/70" />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-sm">{card}</div>
        </div>
      </div>,
      document.body,
    );
  }

  // Spotlight: four dim panels around the target leave a click-through hole, plus
  // a highlight ring and the card placed just above or below the control.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
  const holeBottom = hole.top + hole.height;
  const holeRight = hole.left + hole.width;
  const placeBelow = holeBottom + 180 < vh;
  const cardLeft = clamp(hole.left, 8, Math.max(8, vw - CARD_WIDTH - 8));
  const panelClass = 'absolute bg-black/70 pointer-events-auto';

  return createPortal(
    <div data-testid="guided-tour-overlay" className="fixed inset-0 z-[80]" onKeyDown={handleKeyDown}>
      <div className={panelClass} style={{ top: 0, left: 0, width: '100%', height: Math.max(0, hole.top) }} />
      <div
        className={panelClass}
        style={{ top: holeBottom, left: 0, width: '100%', height: Math.max(0, vh - holeBottom) }}
      />
      <div
        className={panelClass}
        style={{ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }}
      />
      <div
        className={panelClass}
        style={{ top: hole.top, left: holeRight, width: Math.max(0, vw - holeRight), height: hole.height }}
      />
      {/* Highlight ring - never blocks the control underneath. */}
      <div
        data-testid="guided-tour-ring"
        className="pointer-events-none absolute rounded-lg border-2 border-indigo-400"
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
      />
      <div
        className="absolute"
        style={
          placeBelow
            ? { top: holeBottom + 12, left: cardLeft, width: CARD_WIDTH }
            : { bottom: vh - hole.top + 12, left: cardLeft, width: CARD_WIDTH }
        }
      >
        {card}
      </div>
    </div>,
    document.body,
  );
};

export default GuidedTourOverlay;
