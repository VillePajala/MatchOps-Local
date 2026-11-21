'use client';

import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiMagnifyingGlass, HiXMark, HiOutlineSignalSlash } from 'react-icons/hi2';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import PelitapaPitch, { PITCH_ASPECT } from './PelitapaPitch';
import PelitapaPresentation from './PelitapaPresentation';
import { resolveStep } from './resolveStep';
import { filterConcepts, formatsIn, groupByPhase, knownPhase, phasesIn, samePhase } from './library';
import { usePlaybooks, type Playbook } from './usePlaybooks';
import type { Concept, ConceptFormat } from './types';

/**
 * Pelitapa library (portrait): the account's playbooks as a grid of concept
 * cards - a still picture of the first step, the title and the step count -
 * filtered by format, phase of play and a search over the texts. A card opens
 * the presentation view on top; closing it comes back here with the filters
 * as they were.
 *
 * Lazily loaded from the home screen and only for accounts with the
 * 'pelitapa' flag (lazyModal with warm: false): nobody else downloads it.
 */

interface PelitapaLibraryProps {
  isOpen: boolean;
  onClose: () => void;
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
      <PelitapaPitch width={width} height={Math.floor(width / PITCH_ASPECT)} players={concept.players} resolved={resolved} labels={{}} still />
    </div>
  );
});

function ConceptCard({ concept, onOpen }: { concept: Concept; onOpen: (c: Concept) => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onOpen(concept)}
      data-testid="pelitapa-card"
      className="s1-raised group flex min-w-0 flex-col gap-2.5 rounded-[20px] p-2.5 text-left transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action sm:p-3"
    >
      <ConceptThumb concept={concept} />
      <span className="px-1 pb-1">
        <span className="block font-display text-[19px] font-extrabold leading-[1.1] text-ink sm:text-[21px]">
          {/* "2-1-3-1" stays on one line. */}
          {concept.title.replace(/(\d)-(?=\d)/g, '$1\u2011')}
        </span>
        <span className="mt-1 block text-[13px] text-ink-3">
          {t('pelitapa.library.steps', '{{count}} steps', { count: concept.steps.length })}
          {concept.question?.trim() ? ` · ${t('pelitapa.toQuestion', 'Think about it')}` : ''}
        </span>
      </span>
    </button>
  );
}

function Grid({ concepts, onOpen }: { concepts: Concept[]; onOpen: (c: Concept) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 md:gap-3.5">
      {concepts.map((c) => (
        <ConceptCard key={c.id} concept={c} onOpen={onOpen} />
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

export default function PelitapaLibrary({ isOpen, onClose }: PelitapaLibraryProps) {
  const { t } = useTranslation();
  const { playbooks, status } = usePlaybooks();

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
      return key ? t(`pelitapa.library.phase.${key}`, p) : p;
    },
    [t],
  );
  const playbookName = (p: Playbook) => (p.builtIn ? t('pelitapa.library.builtInName', 'MatchOps examples') : p.name);

  const closePresentation = useCallback(() => setOpen(null), []);
  useEscapeToClose(isOpen && !open, onClose);
  useModalHardwareBack(isOpen, onClose);

  if (!isOpen) return null;

  const loadingClub = status === 'loading' && playbooks.every((p) => p.builtIn);
  const filtered = !!query.trim() || !!activePhase;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pelitapa-library-title"
        data-testid="pelitapa-library"
        className="s1-canvas fixed inset-0 z-[60] overflow-y-auto font-ui text-ink antialiased"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        aria-hidden={open ? true : undefined}
      >
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4 px-4 sm:px-7">
          {/* Header: playbook name + title, formats. Back = the phone's back button, as everywhere in the app. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3" data-testid="pelitapa-playbook-name">
                {playbook ? playbookName(playbook) : ''}
              </p>
              <h2 id="pelitapa-library-title" className="font-display text-[clamp(32px,6vw,40px)] font-extrabold leading-none">
                {t('pelitapa.library.title', 'Playing style')}
              </h2>
            </div>
            {/* Own row on a phone, beside the title from sm up. */}
            <div role="group" aria-label={t('pelitapa.library.formats', 'Format')} className="flex basis-full gap-2 sm:basis-auto">
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
              aria-label={t('pelitapa.library.playbooks', 'Playbook')}
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

          {/* Search. */}
          <label className="relative block">
            <span className="sr-only">{t('pelitapa.library.searchLabel', 'Search situations')}</span>
            <HiMagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('pelitapa.library.searchPlaceholder', 'Search situations…')}
              className="h-12 w-full rounded-[14px] border border-white/[0.08] bg-[#0b1222] pl-11 pr-12 text-[16px] text-ink placeholder:text-ink-3 focus:border-action/60 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              data-testid="pelitapa-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('pelitapa.library.clearSearch', 'Clear search')}
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
              aria-label={t('pelitapa.library.phases', 'Phase of play')}
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            >
              <button type="button" className={chip(!activePhase)} aria-pressed={!activePhase} onClick={() => setPhase(null)}>
                {t('pelitapa.library.all', 'All')}
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

          {/* Status. */}
          {status === 'offline' && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-[14px] text-ink-2" data-testid="pelitapa-offline">
              <HiOutlineSignalSlash className="h-5 w-5 flex-shrink-0 text-ink-3" aria-hidden="true" />
              {t('pelitapa.library.offline', "No connection. Showing what's saved on this device.")}
            </p>
          )}
          {loadingClub && (
            <p role="status" className="text-[14px] text-ink-3" data-testid="pelitapa-loading">
              {t('pelitapa.library.loading', "Loading your club's playbooks…")}
            </p>
          )}

          {/* Concepts. */}
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center" data-testid="pelitapa-empty">
              <p className="text-[16px] text-ink-2">{t('pelitapa.library.noResults', 'No situations match.')}</p>
              {filtered && (
                <button
                  type="button"
                  className="s1-ghost h-11 rounded-full px-5 text-[15px] font-semibold"
                  onClick={() => {
                    setQuery('');
                    setPhase(null);
                  }}
                >
                  {t('pelitapa.library.showAll', 'Show all')}
                </button>
              )}
            </div>
          ) : groups ? (
            groups.map((g) => (
              <section key={g.phase} aria-label={phaseLabel(g.phase)}>
                <SectionHead>{phaseLabel(g.phase)}</SectionHead>
                <Grid concepts={g.concepts} onOpen={setOpen} />
              </section>
            ))
          ) : (
            <Grid concepts={shown} onOpen={setOpen} />
          )}
        </div>
      </div>

      {open && <PelitapaPresentation isOpen concept={open} onClose={closePresentation} />}
    </>
  );
}
