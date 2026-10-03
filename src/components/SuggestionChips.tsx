'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeOpponentName } from '@/utils/opponentNames';

/**
 * How many suggestion chips to show before the coach types, and while they are
 * typing. Small at rest so the form below stays reachable; a little more while
 * searching, where the chips are the thing being looked at.
 */
const RESTING_CHIP_LIMIT = 6;
const SEARCHING_CHIP_LIMIT = 12;

export interface SuggestionChipsProps {
  /** The field's current text: filters the chips and marks the chosen one. */
  value: string;
  /** Names to offer, most likely first. A possibility, never a gate. */
  options?: string[];
  onPick: (name: string) => void;
  disabled?: boolean;
  /** Test ids: `${testId}` for the chip row, `${testId}-more` for the hint. */
  testId?: string;
}

/**
 * Tap-to-fill name chips under a free-text field. One component for every
 * name box that offers earlier spellings (the game form's opponent, the added
 * game's opponent and team), so filtering, capping and the "more" hint cannot
 * drift between them.
 *
 * Chips narrow as the coach types - that IS the autocomplete. The datalist
 * that used to do it was removed because <input list> re-roles the field to
 * combobox, so the filtering lives here instead.
 *
 * TEXT IN THE FIELD ALWAYS FILTERS, including text that exactly matches an
 * option. There used to be an exception for that case - the whole list came
 * back, so tapping a chip did not strand the coach with only the chip they
 * had just tapped. Once the list was capped at six it became a visibly broken
 * search: typing "Ips" with "IPS" among 69 known teams showed the first six
 * of those 69, none of them IPS. Filtering on an exact match is also the more
 * useful answer: Finnish clubs name teams club + colour, so "Ips" matching
 * IPS, IPS/Sininen and IPS/Punainen shows exactly the set to tell apart.
 *
 * CAPPED, because a real coach's pool is not small. Rendering thirty-odd
 * teams before a key is pressed pushed every other field off the bottom of
 * the phone. The caller puts the most likely names first, typing searches the
 * whole pool, and the hint says the list is partial - a truncated list that
 * looks complete would have a coach type the name fresh, which is how a
 * second spelling gets created, the exact thing the chips exist to prevent.
 */
const SuggestionChips: React.FC<SuggestionChipsProps> = ({ value, options, onPick, disabled, testId = 'opponent-options' }) => {
  const { t } = useTranslation();
  const allOptions = (options ?? []).filter((name) => name.trim() !== '');
  const typed = normalizeOpponentName(value);
  const searching = !!typed;
  const matches = searching
    ? allOptions.filter((name) => normalizeOpponentName(name).includes(typed))
    : allOptions;
  const shown = matches.slice(0, searching ? SEARCHING_CHIP_LIMIT : RESTING_CHIP_LIMIT);
  const hiddenCount = matches.length - shown.length;
  if (shown.length === 0) return null;
  return (
    <>
      {/* Chips rather than a datalist: one tap, visible without opening
          anything, and the field keeps its textbox role. */}
      <div className="mt-2 flex flex-wrap gap-1.5" data-testid={testId}>
        {shown.map((name) => {
          const chosen = name === value;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onPick(name)}
              disabled={disabled}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                chosen
                  ? 'bg-indigo-600 border-indigo-400/40 text-white'
                  : 'bg-slate-700/70 border-slate-600/60 text-slate-200 hover:bg-slate-600/70'
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <p className="mt-1.5 text-xs text-slate-400" data-testid={`${testId}-more`}>
          {t('common.moreOpponents', '+{{count}} more. Type to search them all.', {
            count: hiddenCount,
          })}
        </p>
      )}
    </>
  );
};

export default SuggestionChips;
