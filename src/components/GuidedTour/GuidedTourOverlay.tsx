'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useModalHardwareBack from '@/hooks/useModalHardwareBack';
import type { TourStep, TourTarget } from './tourTypes';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ResolvedTarget {
  rect: Rect;
  target: TourTarget;
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

/**
 * Resolve a step's tap chain: the first target (most specific first) whose
 * element is present AND laid out wins. A zero-size box means the control is
 * not actually visible (collapsed, or jsdom) - skip it so the chain falls
 * through to the control that opens it.
 */
function resolveTarget(targets: TourTarget[] | undefined): ResolvedTarget | null {
  if (!targets || typeof document === 'undefined') return null;
  for (const target of targets) {
    const el = document.querySelector(target.selector);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    return { rect: { top: r.top, left: r.left, width: r.width, height: r.height }, target };
  }
  return null;
}

/**
 * The tour's visual layer - a GUIDANCE overlay, never a gate. The root and the
 * dim/spotlight decorations are all pointer-events-none, so the app underneath
 * stays fully interactive (the coach must be able to tap the highlighted
 * control - and anything else). Only the tour card itself takes pointer events.
 *
 * Each step declares a tap chain; the first on-screen control is spotlighted
 * and its stage hint shown, so the card always tells the coach the literal
 * next tap ("Open the Club tab" -> "Tap Players" -> ...). With no on-screen
 * target the card shows the step body, pinned to the bottom, with no dimming.
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
  const [resolved, setResolved] = useState<ResolvedTarget | null>(() => resolveTarget(step.targets));

  // Hardware / browser back = skip the tour (single-sentinel hook, no inert).
  useModalHardwareBack(true, () => {
    onSkip();
  });

  // Keep the resolved target current while this step is mounted: the chain's
  // most-specific control may appear/disappear as modals open and close, and
  // rects move on resize/scroll. The initial value comes from the useState
  // initializer (the overlay is remounted per step via `key`), so this effect
  // only wires listeners - it never sets state synchronously.
  useEffect(() => {
    if (!step.targets || step.targets.length === 0) return;
    const recompute = () =>
      setResolved((prev) => {
        const next = resolveTarget(step.targets);
        // Identity-stable when nothing changed: our own portal DOM also lives in
        // document.body, so the MutationObserver sees our renders - without this
        // guard each render would schedule another, churning forever.
        if (
          prev !== null &&
          next !== null &&
          prev.target.selector === next.target.selector &&
          prev.rect.top === next.rect.top &&
          prev.rect.left === next.rect.left &&
          prev.rect.width === next.rect.width &&
          prev.rect.height === next.rect.height
        ) {
          return prev;
        }
        if (prev === null && next === null) return prev;
        return next;
      });
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    const observer = new MutationObserver(recompute);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
      observer.disconnect();
    };
  }, [step.targets]);

  // Move focus to the primary action when the step appears (keyboard users).
  // The card is the only interactive part of the overlay, so this also makes
  // Escape-to-skip work without a document-level listener (which would hijack
  // Escape presses meant for the app's own modals).
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
  const message = resolved
    ? t(resolved.target.hintKey, resolved.target.hint)
    : t(step.bodyKey, step.body);
  const nextLabel = isFinal
    ? t('guidedTour.buttons.finish', 'Done')
    : t('guidedTour.buttons.next', 'Next');
  const skipLabel = t('guidedTour.buttons.skip', 'Skip');

  const card = (
    <div
      data-testid="guided-tour-card"
      className="pointer-events-auto mx-auto w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-800 p-4 text-white shadow-2xl"
      role="dialog"
      aria-label={title}
      onKeyDown={handleKeyDown}
    >
      <h2 data-testid="guided-tour-title" className="mb-1 text-base font-bold tracking-tight">
        {title}
      </h2>
      <p data-testid="guided-tour-body" className="mb-3 text-sm text-slate-300">
        {message}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="guided-tour-skip"
          onClick={onSkip}
          className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
        >
          {skipLabel}
        </button>
        <button
          ref={primaryRef}
          type="button"
          data-testid="guided-tour-next"
          onClick={onNext}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          {nextLabel}
        </button>
      </div>
      {stepCount > 1 && (
        <div className="mt-2 text-center text-xs text-slate-500">
          {stepIndex + 1} / {stepCount}
        </div>
      )}
    </div>
  );

  // No on-screen target: bottom-pinned card, no dimming - the coach may need to
  // see and use the whole screen to get where the step points.
  if (resolved === null) {
    return createPortal(
      <div data-testid="guided-tour-overlay" className="pointer-events-none fixed inset-0 z-[80]">
        <div className="absolute inset-x-0 bottom-0 p-4 pb-6">{card}</div>
      </div>,
      document.body,
    );
  }

  // Spotlight: dim panels around the control (all decoration - pointer-events
  // pass through everywhere) + a highlight ring. The card pins to whichever
  // vertical half the control is NOT in, so it never covers the target.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = {
    top: resolved.rect.top - SPOTLIGHT_PADDING,
    left: resolved.rect.left - SPOTLIGHT_PADDING,
    width: resolved.rect.width + SPOTLIGHT_PADDING * 2,
    height: resolved.rect.height + SPOTLIGHT_PADDING * 2,
  };
  const holeBottom = hole.top + hole.height;
  const holeRight = hole.left + hole.width;
  const targetInTopHalf = hole.top + hole.height / 2 < vh / 2;
  const panelClass = 'absolute bg-black/60 pointer-events-none';

  return createPortal(
    <div data-testid="guided-tour-overlay" className="pointer-events-none fixed inset-0 z-[80]">
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
      <div
        data-testid="guided-tour-ring"
        className="pointer-events-none absolute rounded-lg border-2 border-indigo-400"
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
      />
      <div className={`absolute inset-x-0 p-4 ${targetInTopHalf ? 'bottom-0 pb-6' : 'top-0 pt-6'}`}>
        {card}
      </div>
    </div>,
    document.body,
  );
};

export default GuidedTourOverlay;
