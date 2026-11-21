'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiChevronLeft, HiArrowPath, HiArrowsPointingOut } from 'react-icons/hi2';
import type { Player } from '@/types';
import { useDataStore } from '@/hooks/useDataStore';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { useModalHardwareBack, useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';
import { getCurrentGameIdSetting } from '@/utils/appSettings';
import logger from '@/utils/logger';
import { DEMO_CONCEPT } from './demoConcept';
import { validateConcept } from './validateConcept';
import { crossesCut, resolveStep } from './resolveStep';
import { planMotion } from './motion';
import { assignPlayers, discName } from './assignNames';
import PelitapaPitch, { PITCH_ASPECT, type DiscLabel } from './PelitapaPitch';
import type { Concept } from './types';

/**
 * Pelitapa presentation view (portrait): a concept played step by step on a
 * big pitch for showing to the kids - from a tablet held up in the dressing
 * room, or a phone. The team's own players are on the discs; a tap on a disc
 * swaps the name for this session. Steps move with next/previous, the dots,
 * a swipe on the pitch or the arrow keys; after the last step comes the
 * "Pohdittavaksi" question. The screen stays awake while it is open.
 *
 * Focus mode ("Fokustila", the full-screen button in the header): only the
 * pitch, edge to edge (discs keep their size relative to the pitch, so they
 * grow with it); the step title in a strip at the bottom and a small step
 * counter. A tap on the right half of the pitch goes
 * forward, the left half back (a disc tap still picks the name), a swipe
 * works too; the question fills the screen. The phone's back button and
 * Escape return to the normal view on the same step. The mode is remembered
 * per device (see FOCUS_PREF_KEY).
 *
 * Lazily loaded (lazyModal): nothing here is in the start-up or match bundles.
 */

interface PelitapaPresentationProps {
  isOpen: boolean;
  onClose: () => void;
  concept?: Concept;
}

type Stage = number | 'question';

/** Fallback board size before the first measurement (and in tests). */
const FALLBACK_W = 358;

/**
 * The header and the text panel have a fixed width and height, independent of
 * the pitch and of the step's text, so the pitch is the same size on every
 * step: the largest the screen allows.
 */
const PANEL_MAX_W = 760;
/** Step title (up to 2 lines) + body (up to 4 lines) at the panel's type sizes. */
const TEXT_PANEL_HEIGHT =
  'calc(2 * 1.15 * clamp(22px, 3.6vw, 30px) + 4px + 4 * 1.45 * clamp(16px, 2.6vw, 21px))';

/**
 * Whether the coach was in focus mode when they last LEFT a concept on this
 * device; the next concept opens in that mode. Written once, on leaving.
 * Back from focus mode goes through the normal view to the library (back,
 * back): that way out counts as leaving in focus mode.
 */
const FOCUS_PREF_KEY = 'matchops_pelitapa_focus_mode';

function readFocusPreference(): boolean {
  try {
    // eslint-disable-next-line no-restricted-globals -- a per-device view preference, not app data
    return localStorage.getItem(FOCUS_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFocusPreference(on: boolean): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- a per-device view preference, not app data
    if (on) localStorage.setItem(FOCUS_PREF_KEY, '1');
    // eslint-disable-next-line no-restricted-globals -- a per-device view preference, not app data
    else localStorage.removeItem(FOCUS_PREF_KEY);
  } catch {
    // Storage blocked: the mode just is not remembered.
  }
}

/** Focus mode's title strip: one line of the title + padding + the phone's gesture bar. */
const FOCUS_STRIP_HEIGHT = 'calc(1.2 * clamp(20px, 3.6vw, 32px) + 22px + env(safe-area-inset-bottom))';

const MOTION_CSS = `
.pt-draw { stroke-dasharray: 1 1; stroke-dashoffset: 1; animation: pt-draw var(--pt-draw, 650ms) cubic-bezier(.3,0,.2,1) var(--pt-delay, 0ms) forwards; }
.pt-head { opacity: 0; animation: pt-fade 180ms ease-out calc(var(--pt-delay, 0ms) + var(--pt-draw, 650ms) - 120ms) forwards; }
.pt-zone { opacity: 0; animation: pt-fade 450ms ease-out var(--pt-delay, 0ms) forwards; }
.pt-ring { animation: pt-fade 300ms ease-out; }
.pt-text { animation: pt-rise 320ms ease-out; }
@keyframes pt-draw { to { stroke-dashoffset: 0; } }
@keyframes pt-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pt-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .pt-draw { animation: none; stroke-dashoffset: 0; }
  .pt-head, .pt-zone, .pt-ring, .pt-text { animation: none; opacity: 1; }
}
`;

export default function PelitapaPresentation({ isOpen, onClose, concept = DEMO_CONCEPT }: PelitapaPresentationProps) {
  const { t } = useTranslation();
  const { userId, getStore } = useDataStore();
  const validation = useMemo(() => validateConcept(concept), [concept]);
  useEffect(() => {
    if (!validation.ok) logger.warn('[Pelitapa] Invalid concept', validation.errors);
  }, [validation]);

  // The step on screen and the one it came from (a move over a `cut` step jumps).
  const [nav, setNav] = useState<{ stage: Stage; from: Stage }>({ stage: 0, from: 0 });
  const stage = nav.stage;
  const setStage = useCallback((update: Stage | ((s: Stage) => Stage)) => {
    setNav((n) => ({ stage: typeof update === 'function' ? update(n.stage) : update, from: n.stage }));
  }, []);
  const [roster, setRoster] = useState<Player[]>([]);
  const [fieldPlayers, setFieldPlayers] = useState<Player[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [focus, setFocus] = useState(readFocusPreference);
  /** Out of focus mode, and nothing done in the normal view yet: still "in focus mode" for leaving. */
  const passingThrough = useRef(false);
  const enterFocus = useCallback(() => setFocus(true), []);
  const exitFocus = useCallback(() => {
    setFocus(false);
    passingThrough.current = true;
  }, []);
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);
  // Any step change in the normal view means the coach is using it.
  useEffect(() => {
    if (!focusRef.current) passingThrough.current = false;
  }, [nav]);
  // Leaving the concept (closed or unmounted): remember the mode it was left in.
  useEffect(() => {
    if (!isOpen) return;
    return () => writeFocusPreference(focusRef.current || passingThrough.current);
  }, [isOpen]);

  // --- The team: roster + the current game's formation (best effort, never blocks).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const store = await getStore();
        const players = await store.getPlayers();
        if (cancelled) return;
        setRoster(players);
        const gameId = await getCurrentGameIdSetting(userId);
        const game = gameId ? await store.getGameById(gameId) : null;
        if (!cancelled && game?.playersOnField?.length) setFieldPlayers(game.playersOnField);
      } catch (error) {
        logger.warn('[Pelitapa] Could not read the team for the discs', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, getStore, userId]);

  // --- Wake lock while open.
  const { syncWakeLock } = useWakeLock();
  useEffect(() => {
    if (!isOpen) return;
    void syncWakeLock(true);
    return () => {
      void syncWakeLock(false);
    };
  }, [isOpen, syncWakeLock]);

  // --- Board size: the pitch fills the space between header and controls.
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, focus]);
  // The pitch keeps its true aspect in both views (a stretched pitch would
  // distort the distances and angles the animations teach): the largest that
  // fits the space - in focus mode the whole screen above the title strip.
  const boardW = Math.floor(
    area.w > 0 && area.h > 0 ? Math.min(area.w, area.h * PITCH_ASPECT) : FALLBACK_W,
  );
  const boardH = Math.floor(boardW / PITCH_ASPECT);

  // --- Navigation.
  const steps = validation.ok ? validation.concept.steps : [];
  const last = Math.max(0, steps.length - 1);
  const hasQuestion = validation.ok && !!validation.concept.question?.trim();
  const index = stage === 'question' ? last : stage;

  const next = useCallback(() => {
    setStage((s) => {
      if (s === 'question') return 0;
      if (s < last) return s + 1;
      return hasQuestion ? 'question' : 0;
    });
  }, [last, hasQuestion, setStage]);
  const prev = useCallback(() => {
    setStage((s) => (s === 'question' ? last : Math.max(0, s - 1)));
  }, [last, setStage]);
  const restart = useCallback(() => setStage(0), [setStage]);

  const closePicker = useCallback(() => setPicking(null), []);
  useEscapeToClose(isOpen && !picking && !focus, onClose);
  useEscapeToClose(isOpen && !picking && focus, exitFocus);
  useEscapeToClose(!!picking, closePicker);
  // Order matters: the focus guard sits above the modal's, the picker's above both.
  useModalHardwareBack(isOpen, onClose);
  useHardwareBackSubLevel(isOpen && focus, exitFocus);
  useHardwareBackSubLevel(!!picking, closePicker);

  useEffect(() => {
    if (!isOpen || picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, picking, next, prev]);

  // Swipe on the pitch: a clearly horizontal drag.
  const swipeStart = useRef<{ x: number; y: number; id: number } | null>(null);
  /** A swipe just changed the step: the click the browser may still send is not a tap. */
  const swiped = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    swiped.current = false;
    if (e.pointerType === 'mouse') return;
    swipeStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped.current = true;
    if (dx < 0) next();
    else prev();
  };

  // Focus mode: a tap on the right half goes forward, the left half back. A
  // disc's own tap (the name picker) comes first.
  const onFocusTap = (e: React.MouseEvent<HTMLElement>) => {
    if (picking || swiped.current) return;
    const target = e.target as Element;
    if (target.closest('[data-player][role="button"]') || target.closest('[data-pt-picker]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left >= rect.width / 2) next();
    else prev();
  };

  // --- Names on the discs.
  const rosterById = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const assignment = useMemo(() => {
    if (!validation.ok) return {};
    const auto = assignPlayers(validation.concept, roster, fieldPlayers);
    const merged: Record<string, string | undefined> = { ...auto };
    for (const [cid, pid] of Object.entries(overrides)) merged[cid] = pid ?? undefined;
    return merged;
  }, [validation, roster, fieldPlayers, overrides]);
  const labels = useMemo(() => {
    const out: Record<string, DiscLabel> = {};
    if (!validation.ok) return out;
    for (const p of validation.concept.players) {
      if (p.side !== 'us') continue;
      const player = assignment[p.id] ? rosterById.get(assignment[p.id] as string) : undefined;
      const name = player ? discName(player) : '';
      out[p.id] = {
        name,
        ariaLabel: name
          ? t('pelitapa.changePlayerNamed', 'Change player: {{name}}', { name })
          : t('pelitapa.changePlayer', 'Choose a player'),
      };
    }
    return out;
  }, [validation, assignment, rosterById, t]);

  const choose = (playerId: string | null) => {
    if (!picking) return;
    setOverrides((o) => {
      const nextO = { ...o, [picking]: playerId };
      // The chosen player leaves the disc they were on: swap the two.
      if (playerId) {
        const from = Object.entries(assignment).find(([cid, pid]) => pid === playerId && cid !== picking)?.[0];
        if (from) nextO[from] = assignment[picking] ?? null;
      }
      return nextO;
    });
    setPicking(null);
  };

  // How the players get to the step on screen.
  const fromIndex = nav.from === 'question' ? last : nav.from;
  const instant = validation.ok && crossesCut(validation.concept, fromIndex, index);
  const motion = useMemo(
    () => (validation.ok && !instant ? planMotion(validation.concept, fromIndex, index) : null),
    [validation, instant, fromIndex, index],
  );

  if (!isOpen) return null;

  if (!validation.ok) {
    return (
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-carbon px-6 text-center text-ink">
        <p className="text-lg">{t('pelitapa.invalidConcept', 'This concept cannot be shown.')}</p>
        <button type="button" onClick={onClose} className="s1-ghost h-12 rounded-full px-6 font-semibold">
          {t('common.close', 'Close')}
        </button>
      </div>
    );
  }

  const c = validation.concept;
  const resolved = resolveStep(c, index);
  const inQuestion = stage === 'question';
  const primaryLabel = inQuestion
    ? t('pelitapa.restart', 'Start over')
    : index < last
      ? t('pelitapa.next', 'Next')
      : hasQuestion
        ? t('pelitapa.toQuestion', 'Think about it')
        : t('pelitapa.restart', 'Start over');
  const pickingPlayer = picking ? assignment[picking] : undefined;
  const pickable = roster.filter((p) => !p.archived);

  const pitch = (
    <PelitapaPitch
      width={boardW}
      height={boardH}
      players={c.players}
      resolved={resolved}
      labels={labels}
      onDiscTap={pickable.length > 0 ? setPicking : undefined}
      instant={instant}
      motion={motion}
      focus={focus}
    />
  );
  const pitchLabel = t('pelitapa.pitchLabel', 'Pitch, step {{current}} of {{total}}', { current: index + 1, total: steps.length });

  const picker = picking && (
    <div data-pt-picker className="fixed inset-0 z-[61] flex items-end justify-center bg-[rgb(2_6_23/0.6)] sm:items-center" onClick={closePicker}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pelitapa-pick-title"
        className="s1-sheet max-h-[75vh] w-full max-w-md overflow-y-auto rounded-t-[28px] px-4 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="pelitapa-pick-title" className="px-1 pb-3 font-display text-[24px] font-extrabold">
          {t('pelitapa.changePlayer', 'Choose a player')}
        </h3>
        <ul className="flex flex-col gap-1">
          {pickable.map((p) => {
            const current = p.id === pickingPlayer;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  aria-pressed={current}
                  className={`flex h-12 w-full items-center justify-between rounded-2xl px-4 text-left text-[16px] font-semibold ${
                    current ? 'bg-action/15 text-action' : 'text-ink hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  {p.jerseyNumber && <span className="text-ink-3 tabular-nums">#{p.jerseyNumber}</span>}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => choose(null)}
              className="flex h-12 w-full items-center rounded-2xl px-4 text-left text-[16px] text-ink-3 hover:bg-white/5"
            >
              {t('pelitapa.noName', 'No name')}
            </button>
          </li>
        </ul>
        <button type="button" onClick={closePicker} className="s1-ghost mt-3 h-12 w-full rounded-full font-semibold">
          {t('common.cancel', 'Cancel')}
        </button>
      </div>
    </div>
  );

  if (focus) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${c.title} - ${t('pelitapa.focusMode', 'Focus mode')}`}
        data-testid="pelitapa-focus"
        className="fixed inset-0 z-[60] select-none overflow-hidden bg-carbon font-ui text-ink antialiased"
      >
        <style>{MOTION_CSS}</style>
        <div
          ref={areaRef}
          role="group"
          aria-label={pitchLabel}
          className="absolute inset-x-0 top-0"
          // The strip has its own row under the pitch: over the pitch it would hide our keeper.
          style={{ touchAction: 'pan-y', bottom: FOCUS_STRIP_HEIGHT }}
          onClick={onFocusTap}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipeStart.current = null)}
          data-testid="pelitapa-focus-pitch"
        >
          <div className="flex h-full w-full items-center justify-center">{pitch}</div>

          {inQuestion ? (
            <div
              key="q"
              className="pt-text fixed inset-0 flex flex-col justify-center bg-carbon/95 px-[8vw]"
              style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
              aria-live="polite"
            >
              <p className="text-[clamp(14px,2.4vw,20px)] font-bold uppercase tracking-[0.18em] text-action">
                {t('pelitapa.toQuestion', 'Think about it')}
              </p>
              <p
                className="mt-3 font-display text-[clamp(34px,7.2vw,72px)] font-extrabold leading-[1.08] text-balance"
                data-testid="pelitapa-focus-question"
              >
                {c.question}
              </p>
            </div>
          ) : (
            <>
              <span
                className="pointer-events-none absolute right-3 rounded-full bg-[rgb(15_23_42/0.62)] px-2.5 py-1 text-[clamp(13px,1.9vw,17px)] font-bold tabular-nums text-ink backdrop-blur-sm"
                style={{ top: 'max(10px, env(safe-area-inset-top))' }}
                data-testid="pelitapa-focus-counter"
              >
                {index + 1}/{steps.length}
              </span>
              <div
                className="pointer-events-none fixed inset-x-0 bottom-0 flex items-center bg-[rgb(15_23_42/0.72)] px-5 backdrop-blur-sm"
                style={{ height: FOCUS_STRIP_HEIGHT, paddingBottom: 'env(safe-area-inset-bottom)' }}
                aria-live="polite"
              >
                <p
                  key={index}
                  className="pt-text min-w-0 flex-1 truncate font-display text-[clamp(20px,3.6vw,32px)] font-extrabold leading-[1.2]"
                  data-testid="pelitapa-focus-title"
                >
                  {resolved.step.title}
                </p>
              </div>
            </>
          )}
        </div>
        {picker}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pelitapa-title"
      data-testid="pelitapa-presentation"
      className="fixed inset-0 z-[60] flex flex-col items-center bg-carbon font-ui text-ink antialiased"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
    >
      <style>{MOTION_CSS}</style>

      {/* Header */}
      <div className="flex w-full flex-shrink-0 items-center gap-3 px-4 pb-3 sm:px-7" style={{ maxWidth: PANEL_MAX_W }}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            {c.phase} · {c.format}
          </p>
          <h2 id="pelitapa-title" className="truncate font-display text-[clamp(24px,4vw,32px)] font-extrabold leading-[1.05]">
            {c.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={enterFocus}
          aria-label={t('pelitapa.focusMode', 'Focus mode')}
          title={t('pelitapa.focusMode', 'Focus mode')}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-surface-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          data-testid="pelitapa-focus-enter"
        >
          <HiArrowsPointingOut className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Pitch: fills what the header and controls leave. */}
      <div ref={areaRef} className="flex min-h-0 w-full flex-1 items-start justify-center px-4 sm:px-7">
        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipeStart.current = null)}
          style={{ touchAction: 'pan-y' }}
          aria-label={pitchLabel}
          role="group"
        >
          {pitch}
        </div>
      </div>

      {/* Controls */}
      <div className="flex w-full flex-shrink-0 flex-col gap-3 px-4 pt-4 sm:px-7" style={{ maxWidth: PANEL_MAX_W }}>
        <div className="flex gap-1.5">
          {steps.map((_, i) => {
            const on = !inQuestion && i === index;
            const done = inQuestion || i < index;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setStage(i)}
                aria-label={t('pelitapa.stepN', 'Step {{n}}', { n: i + 1 })}
                aria-current={on ? 'step' : undefined}
                className="group flex h-6 flex-1 items-center focus-visible:outline-none"
              >
                <span
                  className={`block h-1.5 w-full rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-action ${
                    on ? 'bg-action' : done ? 'bg-action/45' : 'bg-white/15'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div key={inQuestion ? 'q' : index} className="pt-text overflow-y-auto overscroll-contain"
          // FIXED height (not min-height): the pitch takes whatever the header and
          // this panel leave, so a step with long text must not take more room -
          // otherwise the pitch shrank step by step (owner, 2026-11-21). Long text
          // scrolls inside this box instead.
          style={{ height: TEXT_PANEL_HEIGHT }}
          aria-live="polite"
        >
          {inQuestion ? (
            <>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-action">
                {t('pelitapa.toQuestion', 'Think about it')}
              </p>
              <p className="mt-1 font-display text-[clamp(26px,4.6vw,40px)] font-extrabold leading-[1.12]" data-testid="pelitapa-question">
                {c.question}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2.5">
                <span className="whitespace-nowrap text-[clamp(13px,1.9vw,16px)] font-bold tabular-nums text-action" data-testid="pelitapa-counter">
                  {index + 1} / {steps.length}
                </span>
                <h3 className="font-display text-[clamp(22px,3.6vw,30px)] font-extrabold leading-[1.15]" data-testid="pelitapa-step-title">
                  {resolved.step.title}
                </h3>
              </div>
              <p className="mt-1 text-[clamp(16px,2.6vw,21px)] leading-[1.45] text-ink-2">{resolved.step.text}</p>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={prev}
            disabled={stage === 0}
            aria-label={t('pelitapa.previous', 'Previous step')}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-surface-2 text-ink transition-opacity disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <HiChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={next}
            className="s1-primary h-14 min-w-[150px] rounded-full px-7 text-[16px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            data-testid="pelitapa-next"
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            onClick={restart}
            aria-label={t('pelitapa.restart', 'Start over')}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-surface-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <HiArrowPath className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Player picker for one disc. */}
      {picker}
    </div>
  );
}
