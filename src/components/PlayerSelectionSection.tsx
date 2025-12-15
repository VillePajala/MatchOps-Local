'use client';

import React from 'react';
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
}) => {
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
    </div>
  );
};

export default PlayerSelectionSection;
