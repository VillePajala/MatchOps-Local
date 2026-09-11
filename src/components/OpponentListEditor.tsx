'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark, HiOutlinePlus } from 'react-icons/hi2';
import { addOpponentToList, findExistingSpelling } from '@/utils/opponentNames';

interface OpponentListEditorProps {
  /** The competition's own list. */
  value: string[];
  onChange: (next: string[]) => void;
  /**
   * Every opponent name this coach has used anywhere - other competitions and
   * past games. Not stored; derived by the caller. Used ONLY to offer a
   * spelling already in use, never to restrict what can be typed.
   */
  suggestions?: string[];
  /** Rendered under the heading; the caller says what "this competition" is. */
  hint?: string;
}

/**
 * The teams a competition is played against.
 *
 * Shared by leagues and (slice 2) tournament series, which is why it takes a
 * plain value/onChange rather than reaching for a season.
 *
 * These are STRING LABELS, not entities - no ids, no team data. The reasoning
 * is in utils/opponentNames.ts, and it is load-bearing: "IPS Punainen" is one
 * stable string across competitions while the squad behind it is not.
 *
 * Prevention over cleanup: adding "Ips" when "IPS" is already known offers the
 * spelling in use instead, which is most of the value of the whole feature.
 * The sweep tool exists for what got in before this did.
 */
const OpponentListEditor: React.FC<OpponentListEditorProps> = ({
  value,
  onChange,
  suggestions = [],
  hint,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const trimmed = draft.trim();

  // Already on this competition's list, under any spelling.
  const alreadyListed = useMemo(
    () => (trimmed ? findExistingSpelling(trimmed, value) : null),
    [trimmed, value],
  );

  // Known from elsewhere with a DIFFERENT spelling - the prevention case. An
  // exact match needs no prompt; the coach has already typed the right thing.
  const knownElsewhere = useMemo(() => {
    if (!trimmed || alreadyListed) return null;
    const existing = findExistingSpelling(trimmed, suggestions);
    return existing && existing !== trimmed ? existing : null;
  }, [trimmed, alreadyListed, suggestions]);

  const commit = (name: string) => {
    const next = addOpponentToList(value, name);
    // addOpponentToList returns the same reference when nothing was added.
    if (next !== value) onChange(next);
    setDraft('');
  };

  const remove = (name: string) => {
    onChange(value.filter((item) => item !== name));
  };

  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-slate-400">{hint}</p>}

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Never let Enter reach the surrounding form and save the whole
              // competition while the coach is still listing teams.
              e.preventDefault();
              if (trimmed && !alreadyListed) commit(trimmed);
            }
          }}
          data-testid="opponent-input"
          aria-label={t('opponentList.addLabel', 'Add a team')}
          placeholder={t('opponentList.placeholder', 'e.g. IPS Punainen')}
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => trimmed && !alreadyListed && commit(trimmed)}
          disabled={!trimmed || !!alreadyListed}
          data-testid="opponent-add"
          className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <HiOutlinePlus className="w-4 h-4" aria-hidden="true" />
          <span className="sr-only">{t('opponentList.addLabel', 'Add a team')}</span>
        </button>
      </div>

      {alreadyListed && (
        <p className="text-xs text-amber-400" data-testid="opponent-duplicate">
          {t('opponentList.alreadyListed', '{{name}} is already on the list.', { name: alreadyListed })}
        </p>
      )}

      {/* Prevention: the same name is already spelled another way elsewhere.
          Offered, never forced - a coach may genuinely want both spellings,
          and the app has no way to know which is official. */}
      {knownElsewhere && (
        <div className="text-xs text-slate-300 flex flex-wrap items-center gap-2" data-testid="opponent-known-elsewhere">
          <span>{t('opponentList.knownElsewhere', 'You already write this as {{name}}.', { name: knownElsewhere })}</span>
          <button
            type="button"
            onClick={() => commit(knownElsewhere)}
            data-testid="opponent-use-existing"
            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white font-semibold"
          >
            {t('opponentList.useExisting', 'Use {{name}}', { name: knownElsewhere })}
          </button>
        </div>
      )}

      {value.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="opponent-empty">
          {t('opponentList.empty', 'No teams listed yet. You can always type an opponent by hand when creating a game.')}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2" data-testid="opponent-list">
          {value.map((name) => (
            <li
              key={name}
              className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-slate-700/80 border border-slate-600/60 text-sm text-slate-100"
            >
              <span>{name}</span>
              <button
                type="button"
                onClick={() => remove(name)}
                aria-label={t('opponentList.remove', 'Remove {{name}}', { name })}
                className="p-0.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-600"
              >
                <HiOutlineXMark className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default OpponentListEditor;
