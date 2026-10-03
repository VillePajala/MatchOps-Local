'use client';

import React from 'react';
import SuggestionChips from './SuggestionChips';

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
        {/* The chips are shared with the added-game form (SuggestionChips),
            so the two name boxes in the app suggest the same way. */}
        <SuggestionChips value={opponentName} options={opponentOptions} onPick={onOpponentNameChange} disabled={disabled} />
        {opponentFooter}
        {opponentError && <p className="mt-1 text-sm text-red-400">{opponentError}</p>}
      </div>
    </>
  );
};

export default TeamOpponentInputs;
