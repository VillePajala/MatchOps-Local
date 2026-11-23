'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { HiOutlinePlay, HiOutlinePencilSquare, HiPlus } from 'react-icons/hi2';
import PlaybookLibrary from './PlaybookLibrary';
import PlaybookPresentation from './PlaybookPresentation';
import { usePlaybooks } from './usePlaybooks';
import { availableConcepts, resolveGameThemes, type ResolvedGameTheme } from './resolveGameThemes';
import type { GameTheme } from './gameThemeTypes';
import type { Concept } from './types';

/**
 * A game's Playbook themes: what is picked, "show" (the presentation, stepping
 * through several in pick order) and "choose" (the library in selection mode).
 *
 * A section in the new-game and game-settings forms: the picked themes
 * listed, "Näytä" and "Valitse" / "Muokkaa". (The match view's menu plays them
 * through GameThemesLauncher.)
 *
 * Only rendered for accounts with the playbook flag, from a lazily loaded
 * chunk. The picker and the presentation go to document.body, above whatever
 * modal the control sits in.
 */

export interface GameThemesControlProps {
  themes: GameTheme[];
  onChange: (themes: GameTheme[]) => void | Promise<unknown>;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action';

/**
 * Plays the concepts one after another; the last one ends as a normal
 * presentation. Back from a concept's first step reopens the previous one at
 * its end.
 */
export function GameThemePresentation({ concepts, onClose }: { concepts: Concept[]; onClose: () => void }) {
  const [at, setAt] = useState<{ index: number; focus?: boolean; atEnd?: boolean }>({ index: 0 });
  const concept = concepts[Math.min(at.index, concepts.length - 1)];
  const onNext = useCallback(
    ({ focus }: { focus: boolean }) => setAt((s) => ({ index: Math.min(s.index + 1, concepts.length - 1), focus })),
    [concepts.length],
  );
  const onPrev = useCallback(
    ({ focus }: { focus: boolean }) => setAt((s) => ({ index: Math.max(s.index - 1, 0), focus, atEnd: true })),
    [],
  );
  if (!concept) return null;
  return (
    <PlaybookPresentation
      // A fresh presentation per theme (its own step, names and wake lock).
      key={`${at.index}:${concept.id}`}
      isOpen
      onClose={onClose}
      concept={concept}
      initialFocus={at.focus}
      startAtEnd={at.atEnd}
      sequence={concepts.length > 1 ? { index: at.index, total: concepts.length, onNext, onPrev } : undefined}
    />
  );
}

function themeTitle(r: ResolvedGameTheme, pending: boolean, t: TFunction): string {
  if (r.concept) return r.concept.title;
  return pending ? '…' : t('playbook.themes.unavailable', 'Not available');
}

export default function GameThemesControl({ themes, onChange }: GameThemesControlProps) {
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
            {picking && <PlaybookLibrary isOpen onClose={closePicker} selection={{ initial: themes, onDone: done }} />}
            {presenting && canShow && <GameThemePresentation concepts={concepts} onClose={closePresentation} />}
          </>,
          document.body,
        );

  return (
    <div data-testid="game-theme-field">
      {themes.length === 0 ? (
        <p className="px-1 text-[15px] text-ink-3">{t('playbook.themes.formEmpty', 'Pick concepts to go through with the players.')}</p>
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
            {concepts.length > 1 ? t('playbook.themes.showMany', 'Show themes') : t('playbook.themes.showOne', 'Show theme')}
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
              {t('playbook.themes.chooseMany', 'Choose themes')}
            </>
          ) : (
            <>
              <HiOutlinePencilSquare className="h-5 w-5" aria-hidden="true" />
              {t('playbook.themes.edit', 'Change themes')}
            </>
          )}
        </button>
      </div>
      {overlays}
    </div>
  );
}
