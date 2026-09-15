'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeOpponentName } from '@/utils/opponentNames';

export interface TeamOpponentInputsProps {
  teamName: string;
  opponentName: string;
  onTeamNameChange: (value: string) => void;
  onOpponentNameChange: (value: string) => void;
  teamLabel: string;
  teamPlaceholder: string;
  opponentLabel: string;
  opponentPlaceholder: string;
  teamInputRef?: React.Ref<HTMLInputElement>;
  opponentInputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  disabled?: boolean;
  teamError?: string | null;
  opponentError?: string | null;
  /**
   * The teams listed on the competition, offered as tap-to-fill chips and a
   * native datalist. A POSSIBILITY, never a gate: the field stays free text so
   * a friendly, a cup tie or a team that joined mid-season can always be typed.
   */
  opponentOptions?: string[];
  /** Rendered under the opponent field - used for "add this to the league". */
  opponentFooter?: React.ReactNode;
  /**
   * Fired when the opponent field loses focus. The host uses it to settle the
   * text on the spelling already in use, where one exists - visibly, while the
   * coach is still looking at the field.
   */
  onOpponentBlur?: () => void;
}

/**
 * How many suggestion chips to show before the coach types, and while they are
 * typing. Small at rest so the form below stays reachable; a little more while
 * searching, where the chips are the thing being looked at.
 */
const RESTING_CHIP_LIMIT = 6;
const SEARCHING_CHIP_LIMIT = 12;

const TeamOpponentInputs: React.FC<TeamOpponentInputsProps> = ({
  teamName,
  opponentName,
  onTeamNameChange,
  onOpponentNameChange,
  teamLabel,
  teamPlaceholder,
  opponentLabel,
  opponentPlaceholder,
  teamInputRef,
  opponentInputRef,
  onKeyDown,
  disabled,
  teamError,
  opponentError,
  opponentOptions,
  onOpponentBlur,
  opponentFooter,
}) => {
  // Labels arrive as props because each consumer modal has its own key
  // namespace; this one string is the component's own, describing capping that
  // only it knows about.
  const { t } = useTranslation();
  const allOptions = (opponentOptions ?? []).filter((name) => name.trim() !== '');

  /**
   * Chips narrow as the coach types - that IS the autocomplete. The datalist
   * that used to do it was removed because <input list> re-roles the field to
   * combobox, so the filtering has to live here instead.
   *
   * Once the text matches an option exactly the full list comes back, so
   * having picked one team does not strand the coach with a single chip when
   * they meant to pick another.
   */
  /*
   * CAPPED, because a real coach's pool is not small. After a season or two
   * this list is thirty-odd teams, and rendering all of them before a single
   * key is pressed pushed every other field in the form - team, date, season,
   * the create button - off the bottom of the phone. A suggestion list that
   * buries the form it belongs to is worse than no suggestion list.
   *
   * The cap applies to the RESTING state hardest. What it truncates is
   * meaningful rather than arbitrary: the caller puts the competition's own
   * teams first and the rest in order of use, so the few shown are the few
   * most likely. Typing searches the WHOLE pool, so nothing is unreachable -
   * and the hint below says so, because a truncated list that looks complete
   * would have a coach believe a team is missing.
   */
  const typed = normalizeOpponentName(opponentName);
  const exactlyChosen = allOptions.some((name) => normalizeOpponentName(name) === typed);
  const searching = !!typed && !exactlyChosen;
  const matches = searching
    ? allOptions.filter((name) => normalizeOpponentName(name).includes(typed))
    : allOptions;
  const options = matches.slice(0, searching ? SEARCHING_CHIP_LIMIT : RESTING_CHIP_LIMIT);
  const hiddenCount = matches.length - options.length;
  return (
    <>
      <div className="mb-4">
        <label htmlFor="teamNameInput" className="block text-sm font-medium text-slate-300 mb-1">
          {teamLabel}
        </label>
        <input
          type="text"
          id="teamNameInput"
          name="teamName"
          ref={teamInputRef}
          value={teamName}
          onChange={(e) => onTeamNameChange(e.target.value)}
          placeholder={teamPlaceholder}
          className={`w-full px-3 py-2 bg-slate-700 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm ${teamError ? 'border-red-500' : 'border-slate-600'}`}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck="true"
        />
        {teamError && <p className="mt-1 text-sm text-red-400">{teamError}</p>}
      </div>
      <div className="mb-4">
        <label htmlFor="opponentNameInput" className="block text-sm font-medium text-slate-300 mb-1">
          {opponentLabel}
        </label>
        <input
          type="text"
          id="opponentNameInput"
          name="opponentName"
          ref={opponentInputRef}
          value={opponentName}
          onChange={(e) => onOpponentNameChange(e.target.value)}
          onBlur={onOpponentBlur}
          placeholder={opponentPlaceholder}
          className={`w-full px-3 py-2 bg-slate-700 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm ${opponentError ? 'border-red-500' : 'border-slate-600'}`}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck="true"
        />
        {/* Chips rather than a datalist. An <input list=...> takes the implicit
            ARIA role COMBOBOX instead of textbox, which silently re-roles this
            field for assistive tech and for anything querying it by role - it
            broke existing tests the moment a competition had teams listed.
            Chips are also the better phone affordance: one tap, and visible
            without opening anything. */}
        {options.length > 0 && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5" data-testid="opponent-options">
              {options.map((name) => {
                const chosen = name === opponentName;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onOpponentNameChange(name)}
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
            {/* Says the list is partial. Without it a coach whose team is not
                among the six believes the app has forgotten it, and types the
                name fresh - which is how a second spelling gets created, the
                exact thing the suggestions exist to prevent. */}
            {hiddenCount > 0 && (
              <p className="mt-1.5 text-xs text-slate-400" data-testid="opponent-options-more">
                {t('common.moreOpponents', '+{{count}} more. Type to search them all.', {
                  count: hiddenCount,
                })}
              </p>
            )}
          </>
        )}
        {opponentFooter}
        {opponentError && <p className="mt-1 text-sm text-red-400">{opponentError}</p>}
      </div>
    </>
  );
};

export default TeamOpponentInputs;
