'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark, HiOutlinePlus } from 'react-icons/hi2';
import { inputBaseStyle, secondaryButtonStyle, fieldErrorStyle, chipStyle, subtextStyle } from '@/styles/modalStyles';
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
    <div className="space-y-3">
      {hint && <p className={subtextStyle}>{hint}</p>}

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
          className={`${inputBaseStyle} flex-1 min-w-0`}
        />
        <button
          type="button"
          onClick={() => trimmed && !alreadyListed && commit(trimmed)}
          disabled={!trimmed || !!alreadyListed}
          data-testid="opponent-add"
          className={`${secondaryButtonStyle} min-h-[52px] min-w-[52px] px-0 shrink-0`}
        >
          <HiOutlinePlus className="w-5 h-5" aria-hidden="true" />
          <span className="sr-only">{t('opponentList.addLabel', 'Add a team')}</span>
        </button>
      </div>

      {alreadyListed && (
        <p className={fieldErrorStyle} data-testid="opponent-duplicate">
          {t('opponentList.alreadyListed', '{{name}} is already on the list.', { name: alreadyListed })}
        </p>
      )}

      {/* Prevention: the same name is already spelled another way elsewhere.
          Offered, never forced - a coach may genuinely want both spellings,
          and the app has no way to know which is official. */}
      {knownElsewhere && (
        <div className="font-ui text-sm text-ink-2 flex flex-wrap items-center gap-2" data-testid="opponent-known-elsewhere">
          <span>{t('opponentList.knownElsewhere', 'You already write this as {{name}}.', { name: knownElsewhere })}</span>
          <button
            type="button"
            onClick={() => commit(knownElsewhere)}
            data-testid="opponent-use-existing"
            className={chipStyle}
          >
            {t('opponentList.useExisting', 'Use {{name}}', { name: knownElsewhere })}
          </button>
        </div>
      )}

      {value.length === 0 ? (
        <p className={subtextStyle} data-testid="opponent-empty">
          {t('opponentList.empty', 'No teams listed yet. You can always type an opponent by hand when creating a game.')}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2" data-testid="opponent-list">
          {value.map((name) => (
            <li
              key={name}
              className="flex items-center gap-1 pl-3.5 pr-1 min-h-11 rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)] font-ui text-sm font-medium text-ink"
            >
              <span>{name}</span>
              <button
                type="button"
                onClick={() => remove(name)}
                aria-label={t('opponentList.remove', 'Remove {{name}}', { name })}
                className="inline-flex items-center justify-center min-h-9 min-w-9 rounded-full text-ink-3 hover:text-ink hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                <HiOutlineXMark className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default OpponentListEditor;
