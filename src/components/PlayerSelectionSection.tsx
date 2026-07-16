'use client';

import React, { useState } from 'react';
import { Player } from '@/types';

export interface PlayerSelectionSectionProps {
  availablePlayers: Player[];
  selectedPlayerIds: string[];
  onSelectedPlayersChange: (ids: string[]) => void;
  title: string;
  playersSelectedText: string; // like 'selected'
  selectAllText: string;
  noPlayersText: string;
  disabled?: boolean;
  /**
   * Enable flexible height to fill parent container.
   *
   * When true:
   * - Component wrapper gets `h-full` class
   * - Player list uses `flex-1 min-h-0` instead of `max-h-60`
   * - Component stretches to fill available vertical space
   *
   * When false (default):
   * - Component uses natural height
   * - Player list has fixed `max-h-60` (240px) with internal scrolling
   *
   * Use Cases:
   * - Set to `true` when component is in a fixed-height container (e.g., UnifiedTeamModal roster edit)
   * - Leave `false` for modals with dynamic height (e.g., NewGameSetupModal, GameSettingsModal)
   *
   * @default false
   */
  useFlexHeight?: boolean;
  /**
   * Roster bridge (two-level restructure 3.2): inline "add to club roster".
   * When provided, the picker renders an add row - the handler writes the
   * CLUB roster and (at the call site) selects the new player in the game.
   * The ONLY club-write from match scope. Resolve `true` on success (clears
   * + closes the row) or a ready-to-display error message (duplicate name,
   * failed write) shown inline under the row.
   */
  onAddPlayer?: (name: string) => Promise<true | string>;
  /** Label for the inline-add affordance (e.g. "Lisää seuran listaan"). */
  addPlayerLabel?: string;
  /** Placeholder for the inline-add name input. */
  addPlayerPlaceholder?: string;

  /**
   * Additional CSS classes to apply to the wrapper div.
   *
   * Useful for:
   * - Custom spacing or padding adjustments
   * - Additional styling that doesn't conflict with base styles
   *
   * Note: Base styles (flexbox, background gradient, padding, border radius) are always applied.
   *
   * @default ''
   */
  className?: string;
}

const PlayerSelectionSection: React.FC<PlayerSelectionSectionProps> = ({
  availablePlayers,
  selectedPlayerIds,
  onSelectedPlayersChange,
  title,
  playersSelectedText,
  selectAllText,
  noPlayersText,
  disabled,
  useFlexHeight = false,
  className = '',
  onAddPlayer,
  addPlayerLabel,
  addPlayerPlaceholder,
}) => {
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const submitAddPlayer = async () => {
    const name = newPlayerName.trim();
    // `disabled` gate: the whole section serializes against the modal's
    // in-flight mutations (isProcessing) - the add-write must too.
    if (!name || !onAddPlayer || isSubmittingAdd || disabled) return;
    setIsSubmittingAdd(true);
    setAddError(null);
    try {
      const result = await onAddPlayer(name);
      if (result === true) {
        setNewPlayerName('');
        setIsAddingOpen(false);
      } else {
        // Keep the input open for retry AND say why nothing happened
        // (duplicate name / failed write - the caller words it).
        setAddError(result);
      }
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  return (
    <div className={`flex flex-col bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-4 rounded-lg shadow-inner transition-all ${useFlexHeight ? 'h-full' : ''} ${className}`}>
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
        <div className="text-sm text-slate-400">
          <span className="text-yellow-400 font-semibold">{selectedPlayerIds.length}</span>{' / '}
          <span className="text-yellow-400 font-semibold">{availablePlayers.length}</span>{' '}
          {playersSelectedText}
        </div>
      </div>
      {availablePlayers.length > 0 ? (
        <>
          <div className="flex items-center py-2 px-1 border-b border-slate-700/50 mb-4 flex-shrink-0">
            <label className="flex items-center text-sm text-slate-300 hover:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                disabled={disabled}
                checked={availablePlayers.length === selectedPlayerIds.length}
                onChange={() => {
                  if (selectedPlayerIds.length === availablePlayers.length) {
                    onSelectedPlayersChange([]);
                  } else {
                    onSelectedPlayersChange(availablePlayers.map((p) => p.id));
                  }
                }}
                className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-700 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
              />
              <span className="ml-2">{selectAllText}</span>
            </label>
          </div>
          <div
            className={`space-y-1 overflow-y-auto pl-1 pr-1 pb-2 ${useFlexHeight ? 'flex-1 min-h-0' : 'max-h-60'}`}
          >
            {availablePlayers.map((player) => (
              <div key={player.id} className="flex items-center py-1.5 px-1 rounded hover:bg-slate-800/40 transition-colors">
                <label className="flex items-center flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selectedPlayerIds.includes(player.id)}
                    onChange={() => {
                      if (selectedPlayerIds.includes(player.id)) {
                        onSelectedPlayersChange(selectedPlayerIds.filter((id) => id !== player.id));
                      } else {
                        onSelectedPlayersChange([...selectedPlayerIds, player.id]);
                      }
                    }}
                    className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-700 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
                  />
                  <span className="ml-2 text-slate-200">
                    {player.name}
                    {player.nickname && <span className="text-slate-400 ml-1">({player.nickname})</span>}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-4 text-slate-400">{noPlayersText}</div>
      )}
      {onAddPlayer && (
        <div className="mt-3 flex-shrink-0">
          {isAddingOpen ? (
            <>
            <form
              onSubmit={(e) => { e.preventDefault(); void submitAddPlayer(); }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => { setNewPlayerName(e.target.value); setAddError(null); }}
                placeholder={addPlayerPlaceholder}
                aria-label={addPlayerPlaceholder}
                autoFocus
                disabled={disabled || isSubmittingAdd}
                className="flex-1 min-w-0 px-3 py-2 rounded-md bg-slate-700 border border-slate-500 text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={disabled || !newPlayerName.trim() || isSubmittingAdd}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  !disabled && newPlayerName.trim() && !isSubmittingAdd
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                {addPlayerLabel}
              </button>
              <button
                type="button"
                onClick={() => { setIsAddingOpen(false); setNewPlayerName(''); setAddError(null); }}
                disabled={disabled || isSubmittingAdd}
                className="p-2 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors disabled:opacity-50"
                aria-label={`${addPlayerLabel} - cancel`}
              >
                ✕
              </button>
            </form>
            {addError && (
              <p role="alert" className="mt-2 text-sm text-red-400">{addError}</p>
            )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingOpen(true)}
              disabled={disabled}
              className="w-full px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold transition-colors"
            >
              + {addPlayerLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PlayerSelectionSection;
