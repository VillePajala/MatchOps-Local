'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useModalCloseVisible } from '@/styles/modalStyles';
import { liftedSurfaceCount } from '@/hooks/useModalHardwareBack';
import type { TourSignals, TourStep, TourTarget } from './tourTypes';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ResolvedTarget {
  /** Null when the target exists in the CURRENT view but is scrolled
   *  off-viewport - guidance continues (hint, no ring), never "go back". */
  rect: Rect | null;
  target: TourTarget;
}

interface GuidedTourOverlayProps {
  step: TourStep;
  /** Latest merged app-state signals (for live progress like "3 / 8 added"). */
  signals: TourSignals;
  /** Merge a chip's `apply` into the signals (the step's one-tap choices). */
  onApplyChoice: (partial: Partial<TourSignals>) => void;
  stepIndex: number;
  stepCount: number;
  isFinal: boolean;
  onNext: () => void;
  onSkip: () => void;
}

/** Extra px of breathing room around a spotlighted control. */
const SPOTLIGHT_PADDING = 6;

/**
 * How a DOM-present target relates to what the user can see:
 * - 'visible'   - on-viewport and topmost at its center: spotlight it.
 * - 'offscreen' - on the current view but its center is scrolled out of the
 *   viewport (owner-reported: the game-setup team select after scrolling down
 *   to the create button). The control is REACHABLE - guidance continues with
 *   its hint; it must never be treated as "behind another surface".
 * - 'covered'   - an unrelated element sits on top at its center (a modal or
 *   sheet over a Start Screen control): skip it in the chain; if nothing
 *   resolves, the card offers the go-back escape.
 *
 * A null elementFromPoint result (or jsdom's missing implementation) counts as
 * visible - it is not evidence of occlusion. Our own overlay never counts as
 * cover: all its decoration is pointer-events-none (which elementFromPoint
 * skips), and hitting the interactive card would otherwise create a
 * self-fulfilling occlusion loop (the card parks where it then "covers").
 */
function classifyVisibility(el: Element, r: DOMRect): 'visible' | 'offscreen' | 'covered' {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return 'offscreen';
  if (typeof document.elementFromPoint !== 'function') return 'visible';
  const hit = document.elementFromPoint(cx, cy);
  if (!hit) return 'visible';
  if (hit.closest('[data-testid="guided-tour-overlay"]')) return 'visible';
  return el === hit || el.contains(hit) || hit.contains(el) ? 'visible' : 'covered';
}

interface ResolveResult {
  resolved: ResolvedTarget | null;
  /**
   * True when at least one chain target exists on the page but is COVERED by
   * another surface (an open modal/sheet). Nothing to spotlight, but the way
   * forward is known: close the covering view - the card says exactly that
   * instead of describing controls the coach cannot currently see.
   */
  anyOccluded: boolean;
}

/**
 * Resolve a step's tap chain: the first target (most specific first) whose
 * element is present, laid out, AND actually visible wins. A zero-size box
 * means the control is collapsed (or jsdom); a covered center means a modal or
 * sheet sits on top. Either way the chain falls through - ultimately to the
 * step body (or, when covered, a "close this view" hint).
 */
function resolveTarget(targets: TourTarget[] | undefined, seen: Set<string>): ResolveResult {
  if (!targets || typeof document === 'undefined') return { resolved: null, anyOccluded: false };
  // A higher-priority stage that is PRESENT but covered must not be skipped in
  // favour of a visible later stage of the same chain: the team form's sticky
  // Create bar covered the (scrolled-under) Edit Roster button, and the chain
  // fell through to "Tap Create" before the roster was ever picked. When a
  // later stage IS visible, we surface the blocked earlier stage's hint
  // (rect-less, no ring) instead. The go-back escape still triggers only when
  // NOTHING in the chain is visible (a foreign surface covering everything).
  let firstBlocked: TourTarget | null = null;
  const seenCheck = (selector: string) => seen.has(selector);
  for (const target of targets) {
    // Stage-order gate for coexisting form controls ("name still empty",
    // "roster picker not visited yet") - skipped stages don't count as occluded.
    if (target.when && !target.when(seenCheck)) continue;
    const el = document.querySelector(target.selector);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const visibility = classifyVisibility(el, r);
    if (visibility === 'covered') {
      if (!firstBlocked) firstBlocked = target;
      continue;
    }
    if (visibility === 'offscreen') {
      // The step's own control lives in the current (scrollable) view - STOP
      // the chain here with a rect-less resolution: hint without a ring, and
      // never the go-back escape (going back would undo the coach's progress).
      // A covered higher-priority stage still wins here too - same skip-ahead
      // class as the visible case below (review #722).
      if (firstBlocked) {
        return { resolved: { rect: null, target: firstBlocked }, anyOccluded: false };
      }
      seen.add(target.selector);
      return { resolved: { rect: null, target }, anyOccluded: false };
    }
    // Visible - but an earlier, higher-priority stage is present and merely
    // covered within this view: guide to THAT one (hint only) instead.
    if (firstBlocked) {
      return { resolved: { rect: null, target: firstBlocked }, anyOccluded: false };
    }
    // Step-scoped memory: once a stage has been spotlighted, later `when`
    // gates can sequence past it (e.g. "Edit Roster" only until the roster
    // editor's Done has been shown).
    seen.add(target.selector);
    return {
      resolved: { rect: { top: r.top, left: r.left, width: r.width, height: r.height }, target },
      anyOccluded: false,
    };
  }
  return { resolved: null, anyOccluded: firstBlocked !== null };
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
  signals,
  onApplyChoice,
  stepIndex,
  stepCount,
  isFinal,
  onNext,
  onSkip,
}) => {
  const { t } = useTranslation();
  const primaryRef = useRef<HTMLButtonElement>(null);
  // Step-scoped stage memory (the overlay remounts per step, resetting it):
  // records which stages have been spotlighted so `when` gates can sequence.
  // A memo (not a ref) so the useState initializer below may read it in render.
  const seen = useMemo(() => new Set<string>(), []);
  const [result, setResult] = useState<ResolveResult>(() => resolveTarget(step.targets, seen));
  const resolved = result.resolved;
  // Same signal the modals use to decide whether their X is shown: on phones
  // the X is hidden and "close" is the DEVICE BACK BUTTON - the occluded hint
  // must name the gesture that actually exists on this device.
  const modalCloseVisible = useModalCloseVisible();

  // NOTE deliberately NOT registered with useModalHardwareBack: a guidance
  // layer must never own the back button. It used to (back = skip), but the
  // overlay remounts per step, so advancing while a modal was open re-pushed
  // the tour ABOVE that modal in the back stack - back then killed the tour
  // instead of closing the modal, and the re-registration churn could desync
  // the sentinel into exiting the app (owner-reported on device). Back now
  // always operates on the app itself; the tour is skipped via its button.

  // Keep the resolved target current while this step is mounted: the chain's
  // most-specific control may appear/disappear as modals open and close, and
  // rects move on resize/scroll. The initial value comes from the useState
  // initializer (the overlay is remounted per step via `key`), so this effect
  // only wires listeners - it never sets state synchronously.
  useEffect(() => {
    if (!step.targets || step.targets.length === 0) return;
    const recompute = () =>
      setResult((prev) => {
        const next = resolveTarget(step.targets, seen);
        // Identity-stable when nothing changed: our own portal DOM also lives in
        // document.body, so the MutationObserver sees our renders - without this
        // guard each render would schedule another, churning forever.
        const p = prev.resolved;
        const n = next.resolved;
        const sameRect =
          p !== null &&
          n !== null &&
          ((p.rect === null && n.rect === null) ||
            (p.rect !== null &&
              n.rect !== null &&
              p.rect.top === n.rect.top &&
              p.rect.left === n.rect.left &&
              p.rect.width === n.rect.width &&
              p.rect.height === n.rect.height));
        if (
          prev.anyOccluded === next.anyOccluded &&
          ((p === null && n === null) ||
            (p !== null && n !== null && p.target.selector === n.target.selector && sameRect))
        ) {
          return prev;
        }
        return next;
      });
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    // Typing changes input VALUES (a property, not an attribute), which the
    // MutationObserver cannot see - but `when` gates like "the name is still
    // empty" depend on it. Capture-phase input events cover every field.
    document.addEventListener('input', recompute, true);
    const observer = new MutationObserver(recompute);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
      document.removeEventListener('input', recompute, true);
      observer.disconnect();
    };
  }, [step.targets, seen]);

  // Move focus to the primary action when a BOOKEND step appears (keyboard
  // users can Enter through welcome/done). Action steps deliberately do NOT
  // autofocus: their only button is Skip, and focusing it would make an
  // accidental Enter abandon the whole tour. The card is the only interactive
  // part of the overlay, so focus here also makes Escape-to-skip work without
  // a document-level listener (which would hijack a modal's own Escape).
  const hasPrimary = !step.advanceWhen;
  useEffect(() => {
    if (hasPrimary) primaryRef.current?.focus();
  }, [hasPrimary]);

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
  // Message priority: the resolved stage's hint; else, when the way forward is
  // merely COVERED by an open view, say to close it (the literal next tap);
  // else the step body (the route description).
  // Occluded stage escape hatch: when the way forward is behind an open view
  // AND a MODAL is registered above the screen's baseline, the card offers a
  // Continue button that performs the back navigation itself (guaranteed by the
  // back contract to close only the topmost view - it cannot navigate the page
  // away). The modals keep their own design untouched. Baseline matters: the
  // match screen holds one page-level registration (back-to-Home), so there a
  // count of 1 means NO modal is open - Continue would exit the live match
  // (review #709 catch). Without a modal above baseline, fall back to naming
  // the platform's own close gesture.
  const backBaseline = signals.screen === 'home' ? 1 : 0;
  const showContinueBack = !resolved && result.anyOccluded && liftedSurfaceCount() > backBaseline;

  const message = resolved
    ? t(resolved.target.hintKey, resolved.target.hint)
    : result.anyOccluded
      ? showContinueBack
        ? t('guidedTour.hints.tapContinue', 'All done here - tap Continue.')
        : modalCloseVisible
          ? t('guidedTour.hints.closeThisView', 'Close this view (X) to continue.')
          : t('guidedTour.hints.goBack', "Press your device's back button to continue.")
      : t(step.bodyKey, step.body);
  const nextLabel = isFinal
    ? t('guidedTour.buttons.finish', 'Done')
    : t('guidedTour.buttons.next', 'Next');
  const skipLabel = t('guidedTour.buttons.skip', 'Skip');

  // Pill text keeps live progress visible even mid-form (terse done/target).
  let pillText = message;
  if (step.progress) {
    const { done, target } = step.progress.compute(signals);
    pillText = `${message} · ${done}/${target}`;
  }

  // Action steps (advanceWhen) progress by DOING the highlighted thing - they
  // auto-advance when the real action completes. Showing a big "Next" there
  // created a second competing call-to-action ("tap the tab, or tap Next?")
  // and let the coach jump steps without doing them, landing the tour in a
  // mismatched state. So: action steps get ONLY a quiet Skip; the app's own
  // highlighted control is the primary. Bookend steps keep Next/Done.
  const isActionStep = !!step.advanceWhen;
  // Purpose-labeled early advance on goal steps ("That's enough - continue").
  const showManualAdvance =
    isActionStep && !!step.manualAdvance && (!step.manualAdvance.when || step.manualAdvance.when(signals));

  const card = (
    <div
      data-testid="guided-tour-card"
      className="pointer-events-auto mx-auto w-full max-w-sm rounded-2xl border border-amber-400/40 bg-slate-800 p-4 text-white shadow-2xl"
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
      {step.choices && (
        <div className="mb-3 flex items-center justify-center gap-2">
          {step.choicesLabelKey && (
            <span className="text-xs text-slate-400">
              {t(step.choicesLabelKey, step.choicesLabel ?? '')}
            </span>
          )}
          {step.choices.map((choice) => {
            const selected = (Object.keys(choice.apply) as Array<keyof TourSignals>).every(
              (k) => signals[k] === choice.apply[k],
            );
            return (
              <button
                key={choice.id}
                type="button"
                data-testid={`guided-tour-choice-${choice.id}`}
                onClick={() => onApplyChoice(choice.apply)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  selected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      )}
      {step.progress && (
        <p data-testid="guided-tour-progress" className="mb-3 text-center text-sm font-semibold text-indigo-300">
          {(() => {
            const { done, target } = step.progress.compute(signals);
            return t(step.progress.key, { done, target, defaultValue: step.progress.fallback });
          })()}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="guided-tour-skip"
          onClick={onSkip}
          className={`rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600 ${isActionStep && !showContinueBack && !showManualAdvance ? 'w-full' : 'flex-1'}`}
        >
          {skipLabel}
        </button>
        {showManualAdvance && step.manualAdvance && (
          <button
            type="button"
            data-testid="guided-tour-manual-advance"
            onClick={onNext}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            {t(step.manualAdvance.labelKey, step.manualAdvance.label)}
          </button>
        )}
        {showContinueBack && (
          <button
            type="button"
            data-testid="guided-tour-continue"
            onClick={() => window.history.back()}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            {t('guidedTour.buttons.continue', 'Continue')}
          </button>
        )}
        {/* Never two primaries: Continue (occluded escape) supersedes Next. */}
        {!isActionStep && !showContinueBack && (
          <button
            ref={primaryRef}
            type="button"
            data-testid="guided-tour-next"
            onClick={onNext}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            {nextLabel}
          </button>
        )}
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

  // Present but scrolled off-viewport: the control is in the current view, just
  // out of sight - keep guiding with its hint, nothing to ring, and NEVER the
  // go-back escape. Compact stages keep the non-blocking pill (pinned top,
  // since off-viewport usually means the coach scrolled down); other stages
  // keep the card (with Skip) at the bottom.
  if (resolved.rect === null) {
    return createPortal(
      <div data-testid="guided-tour-overlay" className="pointer-events-none fixed inset-0 z-[80]">
        {resolved.target.compact ? (
          <div className="absolute inset-x-0 top-6 px-4">
            <div
              data-testid="guided-tour-pill"
              className="pointer-events-none mx-auto flex w-fit max-w-sm items-center gap-2 rounded-full border-2 border-amber-400/80 bg-slate-900/95 px-4 py-2 text-center text-sm font-medium text-slate-100 shadow-[0_0_14px_rgba(251,191,36,0.3)]"
            >
              <span>{pillText}</span>
              {/* The ONLY interactive pixel of a pill: dismiss the guide (e.g. the
                  log-goal step in a goalless game would otherwise sit on screen for
                  the whole match). */}
              <button
                type="button"
                data-testid="guided-tour-pill-skip"
                onClick={onSkip}
                aria-label={skipLabel}
                className="pointer-events-auto -mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 p-4 pb-6">{card}</div>
        )}
      </div>,
      document.body,
    );
  }

  // Spotlight geometry, shared by both spotlight modes.
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

  // Compact (in-form) stage: ring + a slim text-only pill, NOTHING else - no
  // dimming (the form must stay fully readable) and no interactive card (on a
  // phone a full card inevitably covers form fields; the pill is entirely
  // pointer-events-none so it cannot block typing or taps).
  if (resolved.target.compact) {
    return createPortal(
      <div data-testid="guided-tour-overlay" className="pointer-events-none fixed inset-0 z-[80]">
        <div
          data-testid="guided-tour-ring"
          className="pointer-events-none absolute rounded-lg border-[3px] border-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.25),0_0_18px_rgba(251,191,36,0.45)] animate-pulse motion-reduce:animate-none"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
        {/* Pills NEVER pin to the bottom - the phone keyboard swallows them
            there (owner feedback). Top of screen, or just below a target that
            sits at the very top. */}
        <div
          className={`absolute inset-x-0 px-4 ${hole.top > 150 ? 'top-6' : ''}`}
          style={hole.top > 150 ? undefined : { top: holeBottom + 12 }}
        >
          <div
            data-testid="guided-tour-pill"
            className="pointer-events-none mx-auto flex w-fit max-w-sm items-center gap-2 rounded-full border-2 border-amber-400/80 bg-slate-900/95 px-4 py-2 text-center text-sm font-medium text-slate-100 shadow-[0_0_14px_rgba(251,191,36,0.3)]"
          >
            <span>{pillText}</span>
            {/* The ONLY interactive pixel of a pill: dismiss the guide (e.g. the
                log-goal step in a goalless game would otherwise sit on screen for
                the whole match). */}
            <button
              type="button"
              data-testid="guided-tour-pill-skip"
              onClick={onSkip}
              aria-label={skipLabel}
              className="pointer-events-auto -mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // Full spotlight: dim panels around the control (all decoration - pointer
  // events pass through everywhere) + a highlight ring. The card pins to
  // whichever vertical half the control is NOT in, so it never covers the target.
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
        className="pointer-events-none absolute rounded-lg border-[3px] border-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.25),0_0_18px_rgba(251,191,36,0.45)] animate-pulse motion-reduce:animate-none"
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
