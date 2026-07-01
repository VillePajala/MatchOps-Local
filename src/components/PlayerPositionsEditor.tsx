'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '@/i18n-types';
import type { Player } from '@/types';
import type { GameType } from '@/types/game';
import {
  positionsForSport,
  orderPositionIds,
  POSITION_ABBREV_FALLBACK,
  POSITION_LABEL_FALLBACK,
} from '@/config/positions';

interface PlayerPositionsEditorProps {
  /** The match-day squad - one row per player. */
  players: Player[];
  /** Current assignments, keyed by player id. */
  value: Record<string, string[]>;
  /** Receives the full updated map on every toggle. */
  onChange: (next: Record<string, string[]>) => void;
  /** Legacy games without a type are treated as soccer. */
  gameType?: GameType;
}

/**
 * Post-game line-up editor: one row per squad player with tappable position
 * chips (multi-select for the rare multi-position case). Any position can be
 * assigned to any player; blank = not recorded. Chip styling matches the
 * assessment selector for consistency.
 */
const PlayerPositionsEditor: React.FC<PlayerPositionsEditorProps> = ({ players, value, onChange, gameType }) => {
  const { t } = useTranslation();
  const positions = positionsForSport(gameType);

  const toggle = (playerId: string, positionId: string) => {
    const current = value[playerId] ?? [];
    const next = current.includes(positionId)
      ? current.filter(id => id !== positionId)
      : orderPositionIds([...current, positionId]);
    const nextMap = { ...value };
    if (next.length) nextMap[playerId] = next;
    else delete nextMap[playerId];
    onChange(nextMap);
  };

  if (players.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        {t('gameSettingsModal.lineupNoPlayers', 'Select players for this game to assign positions.')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {players.map(player => {
        const assigned = value[player.id] ?? [];
        return (
          <div key={player.id} className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">{player.nickname?.trim() || player.name}</span>
            <div className="flex flex-wrap gap-1" role="group">
              {positions.map(pos => {
                const selected = assigned.includes(pos.id);
                const abbrev = t(`playingPositions.${pos.id}.abbrev` as TranslationKey, POSITION_ABBREV_FALLBACK[pos.id] ?? pos.id.toUpperCase());
                const label = t(`playingPositions.${pos.id}.label` as TranslationKey, POSITION_LABEL_FALLBACK[pos.id] ?? pos.id);
                return (
                  <button
                    key={pos.id}
                    type="button"
                    aria-pressed={selected}
                    title={label}
                    aria-label={label}
                    onClick={() => toggle(player.id, pos.id)}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800/40 text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    {abbrev}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PlayerPositionsEditor;
