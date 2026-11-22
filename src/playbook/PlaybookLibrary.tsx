'use client';

import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiMagnifyingGlass, HiXMark, HiOutlineSignalSlash, HiCheck, HiOutlineEye, HiOutlineExclamationTriangle, HiOutlineKey } from 'react-icons/hi2';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import PlaybookPitch, { PITCH_ASPECT } from './PlaybookPitch';
import PlaybookPresentation from './PlaybookPresentation';
import PlaybookCodeSheet from './PlaybookCodeSheet';
import { resolveStep } from './resolveStep';
import { filterConcepts, formatsIn, groupByPhase, knownPhase, phasesIn, samePhase } from './library';
import { usePlaybooks, type Playbook } from './usePlaybooks';
import type { Concept, ConceptFormat } from './types';
import { gameThemeKey, sameGameTheme, MAX_GAME_THEMES, type GameTheme } from './gameThemeTypes';
import { resolveGameThemes } from './resolveGameThemes';

/**
 * Playbook library (portrait): the account's playbooks as a grid of concept
 * cards - a still picture of the first step, the title and the step count -
 * filtered by format, phase of play and a search over the texts. A card opens
 * the presentation view on top; closing it comes back here with the filters
 * as they were.
 *
 * Selection mode (`selection`, a game's themes): the same view, but a card
 * tap picks or unpicks the concept (numbered in pick order), the eye on a card
 * previews it, and "Done" hands the picked list back. Picked concepts the
 * account can no longer read (a withdrawn grant) are listed as unavailable at
 * the top, removable, never a crash. Back / the close button cancel.
 *
 * "Enter a club code" (browsing, cloud accounts) opens a small sheet; a code
 * that works unlocks the club's playbook and the view switches to it.
 *
 * Lazily loaded from the home screen and only for accounts with the
 * playbook flag (lazyModal with warm: false): nobody else downloads it.
 */

export interface LibrarySelection {
  /** The game's current themes (the starting selection). */
  initial: GameTheme[];
  onDone: (themes: GameTheme[]) => void;
}

interface PlaybookLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  selection?: LibrarySelection;
}

/** Thumbnail width before the first measurement (and in tests). */
const FALLBACK_THUMB_W = 160;

const chip = (on: boolean) =>
  `h-11 flex-shrink-0 rounded-full px-[18px] text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-35 ${
    on ? 's1-primary' : 'border border-white/10 bg-surface-2 text-ink-2 hover:text-ink'
  }`;

/** A still first step, sized to the card. */
const ConceptThumb = memo(function ConceptThumb({ concept }: { concept: Concept }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const width = Math.floor(w > 0 ? w : FALLBACK_THUMB_W);
  const resolved = useMemo(() => resolveStep(concept, 0), [concept]);
  return (
    <div ref={ref} className="w-full overflow-hidden rounded-[10px]" style={{ aspectRatio: `${PITCH_ASPECT}` }} aria-hidden="true">
      <PlaybookPitch width={width} height={Math.floor(width / PITCH_ASPECT)} players={concept.players} resolved={resolved} labels={{}} still />
    </div>
  );
});

/** In selection mode: this card's place in the pick order (1-based), or 0 when not picked. */
interface CardPick {
  order: number;
  onPreview: (c: Concept) => void;
}

function ConceptCard({ concept, onOpen, pick }: { concept: Concept; onOpen: (c: Concept) => void; pick?: CardPick }) {
  const { t } = useTranslation();
  const picked = !!pick && pick.order > 0;
  const card = (
    <button
      type="button"
      onClick={() => onOpen(concept)}
      data-testid="playbook-card"
      aria-pressed={pick ? picked : undefined}
      className={`s1-raised group flex w-full min-w-0 flex-col gap-2.5 rounded-[20px] p-2.5 text-left transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action sm:p-3 ${
        picked ? 'ring-2 ring-action' : ''
      }`}
    >
      <ConceptThumb concept={concept} />
      <span className="px-1 pb-1">
        <span className="block font-display text-[19px] font-extrabold leading-[1.1] text-ink sm:text-[21px]">
          {/* "2-1-3-1" stays on one line. */}
          {concept.title.replace(/(\d)-(?=\d)/g, '$1\u2011')}
        </span>
        <span className="mt-1 block text-[13px] text-ink-3">
          {t('playbook.library.steps', '{{count}} steps', { count: concept.steps.length })}
          {concept.question?.trim() ? ` · ${t('playbook.toQuestion', 'Think about it')}` : ''}
        </span>
      </span>
    </button>
  );
  if (!pick) return card;
  // Selection mode: the pick mark (order number) and a preview button over the picture.
  return (
    <div className="relative min-w-0">
      {card}
      <span
        aria-hidden="true"
        data-testid="playbook-pick-mark"
        className={`pointer-events-none absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-extrabold tabular-nums shadow-[0_2px_8px_rgb(0_0_0/0.35)] ${
          picked ? 'bg-action text-on-action' : 'border-2 border-white/70 bg-[rgb(15_23_42/0.45)]'
        }`}
      >
        {picked ? pick.order : ''}
      </span>
      <button
        type="button"
        onClick={() => pick.onPreview(concept)}
        aria-label={t('playbook.themes.preview', 'Preview: {{title}}', { title: concept.title })}
        data-testid="playbook-preview"
        className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(15_23_42/0.62)] text-ink backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
      >
        <HiOutlineEye className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

function Grid({ concepts, onOpen, pickOf }: { concepts: Concept[]; onOpen: (c: Concept) => void; pickOf?: (c: Concept) => CardPick }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 md:gap-3.5">
      {concepts.map((c) => (
        <ConceptCard key={c.id} concept={c} onOpen={onOpen} pick={pickOf?.(c)} />
      ))}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 mt-1 flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3 before:h-0.5 before:w-4 before:bg-current before:content-['']">
      {children}
    </h3>
  );
}

export default function PlaybookLibrary({ isOpen, onClose, selection }: PlaybookLibraryProps) {
  const { t } = useTranslation();
  const { playbooks, status, redeemCode } = usePlaybooks();
  const [codeOpen, setCodeOpen] = useState(false);
  const closeCode = useCallback(() => setCodeOpen(false), []);
  const selecting = !!selection;
  const [picked, setPicked] = useState<GameTheme[]>(() => selection?.initial ?? []);

  const [playbookId, setPlaybookId] = useState<string | null>(null);
  const [format, setFormat] = useState<ConceptFormat | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Concept | null>(null);

  // The chosen playbook, else the first (club playbooks come before our examples).
  const playbook: Playbook | undefined = playbooks.find((p) => p.id === playbookId) ?? playbooks[0];
  const all = useMemo(() => playbook?.concepts ?? [], [playbook]);
  const formats = useMemo(() => formatsIn(all), [all]);
  // The chosen format if this playbook has it, else its first.
  const activeFormat = format && formats.includes(format) ? format : (formats[0] ?? null);
  const inFormat = useMemo(() => filterConcepts(all, { format: activeFormat }), [all, activeFormat]);
  const phases = useMemo(() => phasesIn(inFormat), [inFormat]);
  const activePhase = phase && phases.some((p) => samePhase(p, phase)) ? phase : null;
  const shown = useMemo(
    () => filterConcepts(inFormat, { phase: activePhase, query }),
    [inFormat, activePhase, query],
  );
  const groups = useMemo(() => (activePhase ? null : groupByPhase(shown)), [activePhase, shown]);

  const phaseLabel = useCallback(
    (p: string) => {
      const key = knownPhase(p);
      return key ? t(`playbook.library.phase.${key}`, p) : p;
    },
    [t],
  );
  const playbookName = (p: Playbook) => (p.builtIn ? t('playbook.library.builtInName', 'MatchOps examples') : p.name);

  const closePresentation = useCallback(() => setOpen(null), []);
  // A code just unlocked a playbook: show it, unfiltered.
  const showUnlocked = useCallback((id: string) => {
    setPlaybookId(id);
    setQuery('');
    setPhase(null);
  }, []);

  // --- Selection mode.
  const pickOrder = useMemo(() => new Map(picked.map((p, i) => [gameThemeKey(p), i + 1])), [picked]);
  const togglePick = useCallback(
    (c: Concept) => {
      if (!playbook) return;
      const theme: GameTheme = { playbookId: playbook.id, conceptId: c.id };
      setPicked((list) =>
        list.some((p) => sameGameTheme(p, theme))
          ? list.filter((p) => !sameGameTheme(p, theme))
          : list.length >= MAX_GAME_THEMES
            ? list
            : [...list, theme],
      );
    },
    [playbook],
  );
  const pickOf = useCallback(
    (c: Concept): CardPick => ({
      order: playbook ? (pickOrder.get(gameThemeKey({ playbookId: playbook.id, conceptId: c.id })) ?? 0) : 0,
      onPreview: setOpen,
    }),
    [playbook, pickOrder],
  );
  // Picked concepts this account cannot read (any more). Not decided while the
  // club playbooks are still loading for the first time.
  const unavailable = useMemo(
    () =>
      selecting && status !== 'loading'
        ? resolveGameThemes(picked, playbooks).filter((r) => !r.concept)
        : [],
    [selecting, status, picked, playbooks],
  );
  useEscapeToClose(isOpen && !open && !codeOpen, onClose);
  useModalHardwareBack(isOpen, onClose);

  if (!isOpen) return null;

  const loadingClub = status === 'loading' && playbooks.every((p) => p.builtIn);
  const filtered = !!query.trim() || !!activePhase;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="playbook-library-title"
        data-testid="playbook-library"
        className="s1-canvas fixed inset-0 z-[60] overflow-y-auto font-ui text-ink antialiased"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        aria-hidden={open || codeOpen ? true : undefined}
      >
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4 px-4 sm:px-7">
          {/* Header: playbook name + title, formats. Back = the phone's back button, as everywhere in the app. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3" data-testid="playbook-playbook-name">
                {playbook ? playbookName(playbook) : ''}
              </p>
              <h2 id="playbook-library-title" className="font-display text-[clamp(32px,6vw,40px)] font-extrabold leading-none">
                {selecting ? t('playbook.themes.pickTitle', 'Choose themes') : t('playbook.library.title', 'Playbook')}
              </h2>
            </div>
            {selecting && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.cancel', 'Cancel')}
                data-testid="playbook-pick-cancel"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-surface-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action sm:order-last"
              >
                <HiXMark className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            {/* Own row on a phone, beside the title from sm up. */}
            <div role="group" aria-label={t('playbook.library.formats', 'Format')} className="flex basis-full gap-2 sm:basis-auto">
              {(['5v5', '8v8', '11v11'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={chip(f === activeFormat)}
                  aria-pressed={f === activeFormat}
                  disabled={!formats.includes(f)}
                  onClick={() => setFormat(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Playbooks, when there is more than one. */}
          {playbooks.length > 1 && (
            <div
              role="group"
              aria-label={t('playbook.library.playbooks', 'Collection')}
              className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
            >
              <div className="flex gap-1 rounded-full bg-surface p-1">
                {playbooks.map((p) => {
                  const on = p.id === playbook?.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPlaybookId(p.id)}
                      className={`h-9 flex-shrink-0 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action ${
                        on ? 's1-seg-on text-ink' : 'text-ink-3 hover:text-ink-2'
                      }`}
                    >
                      {playbookName(p)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unlock a club's playbook with the code the club gave. */}
          {redeemCode && !selecting && (
            <button
              type="button"
              onClick={() => setCodeOpen(true)}
              className="-mt-1 flex h-11 items-center gap-2 self-start rounded-full px-1 text-[15px] font-semibold text-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
              data-testid="playbook-code-open"
            >
              <HiOutlineKey className="h-5 w-5" aria-hidden="true" />
              {t('playbook.code.open', 'Enter a club code')}
            </button>
          )}

          {/* Search. */}
          <label className="relative block">
            <span className="sr-only">{t('playbook.library.searchLabel', 'Search situations')}</span>
            <HiMagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('playbook.library.searchPlaceholder', 'Search situations…')}
              className="h-12 w-full rounded-[14px] border border-white/[0.08] bg-[#0b1222] pl-11 pr-12 text-[16px] text-ink placeholder:text-ink-3 focus:border-action/60 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              data-testid="playbook-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('playbook.library.clearSearch', 'Clear search')}
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                <HiXMark className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </label>

          {/* Phases present in this format. */}
          {phases.length > 1 && (
            <div
              role="group"
              aria-label={t('playbook.library.phases', 'Phase of play')}
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            >
              <button type="button" className={chip(!activePhase)} aria-pressed={!activePhase} onClick={() => setPhase(null)}>
                {t('playbook.library.all', 'All')}
              </button>
              {phases.map((p) => {
                const on = !!activePhase && samePhase(p, activePhase);
                return (
                  <button key={p} type="button" className={chip(on)} aria-pressed={on} onClick={() => setPhase(p)}>
                    {phaseLabel(p)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Selection: picked concepts that can no longer be shown. */}
          {unavailable.length > 0 && (
            <div role="status" className="rounded-2xl bg-surface px-4 py-3" data-testid="playbook-unavailable">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-ink-2">
                <HiOutlineExclamationTriangle className="h-5 w-5 flex-shrink-0 text-ink-3" aria-hidden="true" />
                {t('playbook.themes.unavailableTitle', 'No longer available')}
              </p>
              <p className="mt-1 text-[13px] text-ink-3">
                {t('playbook.themes.unavailableHint', 'This account can no longer open these. Remove them, or keep them in case access returns.')}
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {unavailable.map((r) => (
                  <li key={r.key} className="flex min-h-11 items-center gap-2">
                    {/* Its title is not readable any more: name it by its place in the pick order. */}
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2">
                      {t('playbook.themes.unavailableItem', 'Theme {{n}}', { n: (pickOrder.get(r.key) ?? 0) })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPicked((list) => list.filter((p) => !sameGameTheme(p, r.theme)))}
                      className="s1-ghost h-10 flex-shrink-0 rounded-full px-4 text-[14px] font-semibold"
                    >
                      {t('playbook.themes.remove', 'Remove')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Status. */}
          {status === 'offline' && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-[14px] text-ink-2" data-testid="playbook-offline">
              <HiOutlineSignalSlash className="h-5 w-5 flex-shrink-0 text-ink-3" aria-hidden="true" />
              {t('playbook.library.offline', "No connection. Showing what's saved on this device.")}
            </p>
          )}
          {loadingClub && (
            <p role="status" className="text-[14px] text-ink-3" data-testid="playbook-loading">
              {t('playbook.library.loading', "Loading your club's collections…")}
            </p>
          )}

          {/* Concepts. */}
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center" data-testid="playbook-empty">
              <p className="text-[16px] text-ink-2">{t('playbook.library.noResults', 'No situations match.')}</p>
              {filtered && (
                <button
                  type="button"
                  className="s1-ghost h-11 rounded-full px-5 text-[15px] font-semibold"
                  onClick={() => {
                    setQuery('');
                    setPhase(null);
                  }}
                >
                  {t('playbook.library.showAll', 'Show all')}
                </button>
              )}
            </div>
          ) : groups ? (
            groups.map((g) => (
              <section key={g.phase} aria-label={phaseLabel(g.phase)}>
                <SectionHead>{phaseLabel(g.phase)}</SectionHead>
                <Grid concepts={g.concepts} onOpen={selecting ? togglePick : setOpen} pickOf={selecting ? pickOf : undefined} />
              </section>
            ))
          ) : (
            <Grid concepts={shown} onOpen={selecting ? togglePick : setOpen} pickOf={selecting ? pickOf : undefined} />
          )}
          {/* Room for the Done bar. */}
          {selecting && <div aria-hidden="true" className="h-20" />}
        </div>
      </div>

      {selection && !open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/[0.06] bg-[rgb(2_6_23/0.92)] backdrop-blur-sm"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex w-full max-w-[1040px] items-center gap-3 px-4 pt-3 sm:px-7">
            <p className="min-w-0 flex-1 truncate text-[15px] text-ink-2" aria-live="polite" data-testid="playbook-pick-count">
              {picked.length === 0
                ? t('playbook.themes.noneChosen', 'No theme chosen')
                : t('playbook.themes.chosenCount', '{{n}} chosen', { n: picked.length })}
            </p>
            <button
              type="button"
              onClick={() => selection.onDone(picked)}
              className="s1-primary flex h-12 min-w-[132px] items-center justify-center gap-2 rounded-full px-6 text-[16px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              data-testid="playbook-pick-done"
            >
              <HiCheck className="h-5 w-5" aria-hidden="true" />
              {t('playbook.themes.done', 'Done')}
            </button>
          </div>
        </div>
      )}

      {open && <PlaybookPresentation isOpen concept={open} onClose={closePresentation} />}
      {codeOpen && redeemCode && (
        <PlaybookCodeSheet onClose={closeCode} onRedeem={redeemCode} onUnlocked={showUnlocked} />
      )}
    </>
  );
}
