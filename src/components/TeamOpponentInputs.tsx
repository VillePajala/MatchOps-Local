'use client';

import React from 'react';

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
}

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
  opponentFooter,
}) => {
  const options = (opponentOptions ?? []).filter((name) => name.trim() !== '');
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
          </>
        )}
        {opponentFooter}
        {opponentError && <p className="mt-1 text-sm text-red-400">{opponentError}</p>}
      </div>
    </>
  );
};

export default TeamOpponentInputs;
