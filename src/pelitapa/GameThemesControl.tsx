'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { HiOutlinePlay, HiOutlinePencilSquare, HiPlus, HiChevronRight } from 'react-icons/hi2';
import PelitapaLibrary from './PelitapaLibrary';
import PelitapaPresentation from './PelitapaPresentation';
import { usePlaybooks } from './usePlaybooks';
import { availableConcepts, resolveGameThemes, type ResolvedGameTheme } from './resolveGameThemes';
import type { GameTheme } from './gameThemeTypes';
import type { Concept } from './types';

/**
 * A game's Pelitapa themes: what is picked, "show" (the presentation, stepping
 * through several in pick order) and "choose" (the library in selection mode).
 *
 * Two looks:
 * - 'card': one row on the next-match card - "Teema: <title>" / "Teemat: n"
 *   opens the presentation, the pencil opens the picker; "Valitse teema" when
 *   none is picked.
 * - 'form': a section in the new-game and game-settings forms - the picked
 *   themes listed, "Näytä" and "Valitse" / "Muokkaa".
 *
 * Only rendered for accounts with the 'pelitapa' flag, from a lazily loaded
 * chunk. The picker and the presentation go to document.body, above whatever
 * modal the control sits in.
 */

export interface GameThemesControlProps {
  themes: GameTheme[];
  onChange: (themes: GameTheme[]) => void | Promise<unknown>;
  variant: 'card' | 'form';
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action';

/** Plays the concepts one after another; the last one ends as a normal presentation. */
export function GameThemePresentation({ concepts, onClose }: { concepts: Concept[]; onClose: () => void }) {
  const [at, setAt] = useState<{ index: number; focus?: boolean }>({ index: 0 });
  const concept = concepts[Math.min(at.index, concepts.length - 1)];
  const onNext = useCallback(
    ({ focus }: { focus: boolean }) => setAt((s) => ({ index: Math.min(s.index + 1, concepts.length - 1), focus })),
    [concepts.length],
  );
  if (!concept) return null;
  return (
    <PelitapaPresentation
      // A fresh presentation per theme (its own step, names and wake lock).
      key={`${at.index}:${concept.id}`}
      isOpen
      onClose={onClose}
      concept={concept}
      initialFocus={at.focus}
      sequence={concepts.length > 1 ? { index: at.index, total: concepts.length, onNext } : undefined}
    />
  );
}

function themeTitle(r: ResolvedGameTheme, pending: boolean, t: TFunction): string {
  if (r.concept) return r.concept.title;
  return pending ? '…' : t('pelitapa.themes.unavailable', 'Not available');
}

export default function GameThemesControl({ themes, onChange, variant }: GameThemesControlProps) {
  const { t } = useTranslation();
  const { playbooks, status } = usePlaybooks();
  const [picking, setPicking] = useState(false);
  const [presenting, setPresenting] = useState(false);

  const resolved = useMemo(() => resolveGameThemes(themes, playbooks), [themes, playbooks]);
  const concepts = useMemo(() => availableConcepts(resolved), [resolved]);
  const pending = status === 'loading';
  const canShow = concepts.length > 0;

  const closePicker = useCallback(() => setPicking(false), []);
  const closePresentation = useCallback(() => setPresenting(false), []);
  const done = useCallback(
    (next: GameTheme[]) => {
      setPicking(false);
      void onChange(next);
    },
    [onChange],
  );

  const overlays =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <>
            {picking && <PelitapaLibrary isOpen onClose={closePicker} selection={{ initial: themes, onDone: done }} />}
            {presenting && canShow && <GameThemePresentation concepts={concepts} onClose={closePresentation} />}
          </>,
          document.body,
        );

  if (variant === 'card') {
    if (themes.length === 0) {
      return (
        <>
          <button
            type="button"
            onClick={() => setPicking(true)}
            data-testid="game-theme-choose"
            className={`mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-white/25 px-4 text-[15px] font-semibold text-ink-2 transition-colors hover:text-ink ${FOCUS}`}
          >
            <HiPlus className="h-[18px] w-[18px]" aria-hidden="true" />
            {t('pelitapa.themes.choose', 'Choose a theme')}
          </button>
          {overlays}
        </>
      );
    }
    const label =
      themes.length === 1
        ? t('pelitapa.themes.themeOne', 'Theme')
        : t('pelitapa.themes.themesMany', 'Themes: {{n}}', { n: themes.length });
    const summary = themes.length === 1 ? themeTitle(resolved[0], pending, t) : resolved.map((r) => themeTitle(r, pending, t)).join(' · ');
    return (
      <>
        <div className="mt-2.5 flex items-stretch gap-2" data-testid="game-theme-row">
          <button
            type="button"
            onClick={() => (canShow ? setPresenting(true) : setPicking(true))}
            className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white/[0.06] py-2 pl-3 pr-2 text-left ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.09] ${FOCUS}`}
            data-testid="game-theme-show"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-action/15 text-action" aria-hidden="true">
              <HiOutlinePlay className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                {label}
              </span>
              {/* Several: every title, up to two lines (the order is the order they are shown in). */}
              <span
                className={`block text-[16px] font-semibold leading-snug text-ink ${themes.length === 1 ? 'truncate' : 'line-clamp-2'}`}
                data-testid="game-theme-summary"
              >
                {summary}
              </span>
            </span>
            <HiChevronRight className="h-5 w-5 flex-shrink-0 text-ink-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={t('pelitapa.themes.edit', 'Change themes')}
            data-testid="game-theme-edit"
            className={`flex w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-ink-2 ring-1 ring-inset ring-white/10 transition-colors hover:text-ink ${FOCUS}`}
          >
            <HiOutlinePencilSquare className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {overlays}
      </>
    );
  }

  // 'form'
  return (
    <div data-testid="game-theme-field">
      {themes.length === 0 ? (
        <p className="px-1 text-[15px] text-ink-3">{t('pelitapa.themes.formEmpty', 'Pick concepts to go through with the players.')}</p>
      ) : (
        <ol className="flex flex-col gap-1" data-testid="game-theme-list">
          {resolved.map((r, i) => (
            <li key={r.key} className="flex min-h-11 items-center gap-3 px-1">
              <span className="w-5 flex-shrink-0 text-right text-[14px] font-bold tabular-nums text-ink-3">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[16px] font-semibold ${r.concept ? 'text-ink' : 'text-ink-3'}`}>
                  {themeTitle(r, pending, t)}
                </span>
                {r.concept && (
                  <span className="block truncate text-[13px] text-ink-3">
                    {r.concept.phase} · {r.concept.format}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 flex flex-wrap gap-2.5">
        {canShow && (
          <button
            type="button"
            onClick={() => setPresenting(true)}
            data-testid="game-theme-show"
            className={`s1-primary flex h-12 flex-auto items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold ${FOCUS}`}
          >
            <HiOutlinePlay className="h-5 w-5" aria-hidden="true" />
            {concepts.length > 1 ? t('pelitapa.themes.showMany', 'Show themes') : t('pelitapa.themes.showOne', 'Show theme')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPicking(true)}
          data-testid={themes.length === 0 ? 'game-theme-choose' : 'game-theme-edit'}
          className={`s1-ghost flex h-12 flex-auto items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold ${FOCUS}`}
        >
          {themes.length === 0 ? (
            <>
              <HiPlus className="h-5 w-5" aria-hidden="true" />
              {t('pelitapa.themes.chooseMany', 'Choose themes')}
            </>
          ) : (
            <>
              <HiOutlinePencilSquare className="h-5 w-5" aria-hidden="true" />
              {t('pelitapa.themes.edit', 'Change themes')}
            </>
          )}
        </button>
      </div>
      {overlays}
    </div>
  );
}
