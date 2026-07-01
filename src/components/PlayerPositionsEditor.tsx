'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiChevronDown } from 'react-icons/hi';
import type { TranslationKey } from '@/i18n-types';
import type { Player } from '@/types';
import type { GameType } from '@/types/game';
import {
  orderPositionIds,
  inferFormat,
  POSITION_FORMATS,
  POSITION_CATEGORY,
  SOCCER_FORMATS,
  POSITION_ABBREV_FALLBACK,
  POSITION_LABEL_FALLBACK,
  type PositionFormat,
  type PositionCategory,
} from '@/config/positions';

interface PlayerPositionsEditorProps {
  players: Player[];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  gameType?: GameType;
}

// Colour by pitch line so the palette reads at a glance: selected = filled
// line colour, idle = tinted outline (never the same flat grey as the panel).
const CAT_STYLE: Record<PositionCategory, { sel: string; idle: string; pill: string }> = {
  gk:  { sel: 'bg-amber-500 text-slate-900 ring-2 ring-amber-300/60 shadow-sm',    idle: 'border border-amber-500/40 text-amber-200 hover:bg-amber-500/15',     pill: 'bg-amber-500/20 text-amber-200 border border-amber-500/40' },
  def: { sel: 'bg-sky-500 text-slate-900 ring-2 ring-sky-300/60 shadow-sm',        idle: 'border border-sky-500/40 text-sky-200 hover:bg-sky-500/15',           pill: 'bg-sky-500/20 text-sky-200 border border-sky-500/40' },
  mid: { sel: 'bg-emerald-500 text-slate-900 ring-2 ring-emerald-300/60 shadow-sm', idle: 'border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/15', pill: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' },
  att: { sel: 'bg-rose-500 text-white ring-2 ring-rose-300/60 shadow-sm',          idle: 'border border-rose-500/40 text-rose-200 hover:bg-rose-500/15',        pill: 'bg-rose-500/20 text-rose-200 border border-rose-500/40' },
};

const catStyle = (id: string) => CAT_STYLE[(POSITION_CATEGORY[id] ?? 'mid') as PositionCategory];

/**
 * Post-game line-up editor. Each squad player is a collapsible row (tap the name
 * to open); positions are colour-coded chips grouped by the pitch line. The
 * palette is scoped to the match format, and the coach can widen it with the
 * format selector (11v11 = the full set) - assigned positions always stay
 * visible even if the current format would hide them.
 */
const PlayerPositionsEditor: React.FC<PlayerPositionsEditorProps> = ({ players, value, onChange, gameType }) => {
  const { t } = useTranslation();
  const isFutsal = gameType === 'futsal';
  const [format, setFormat] = useState<PositionFormat>(() => inferFormat(gameType, players.length));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const formatIds = POSITION_FORMATS[format];
  // Options end with `all` (every position) so no automatic scoping can lock the
  // coach out of a position they want.
  const formatOptions: PositionFormat[] = isFutsal ? ['futsal', 'all'] : [...SOCCER_FORMATS, 'all'];
  const formatButtonLabel = (f: PositionFormat) =>
    f === 'all' ? t('gameSettingsModal.lineupFormatAll', 'All')
    : f === 'futsal' ? 'Futsal'
    : f;

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

  const toggleExpand = (playerId: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(playerId)) n.delete(playerId); else n.add(playerId);
    return n;
  });

  const abbrev = (id: string) => t(`playingPositions.${id}.abbrev` as TranslationKey, POSITION_ABBREV_FALLBACK[id] ?? id.toUpperCase());

  if (players.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        {t('gameSettingsModal.lineupNoPlayers', 'Select players for this game to assign positions.')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Format selector - scopes the palette; `All` is the manual override. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-slate-400">{t('gameSettingsModal.lineupFormat', 'Format')}</span>
        <div className="flex gap-1 flex-wrap">
          {formatOptions.map(f => (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  format === f ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {formatButtonLabel(f)}
              </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {players.map(player => {
          const assigned = value[player.id] ?? [];
          const isOpen = expanded.has(player.id);
          const chipIds = orderPositionIds([...new Set([...formatIds, ...assigned])]);
          const name = player.nickname?.trim() || player.name;
          return (
            <div key={player.id} className="rounded-lg bg-slate-900/50 border border-slate-700/60 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpand(player.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-800/40 transition-colors"
              >
                <span className="text-sm font-medium text-slate-100 truncate shrink-0">{name}</span>
                <span className="flex items-center gap-2 min-w-0">
                  {assigned.length === 0 ? (
                    <span className="text-xs text-slate-500">{t('gameSettingsModal.lineupAddPositions', 'Add positions')}</span>
                  ) : (
                    <span className="flex flex-wrap gap-1 justify-end">
                      {orderPositionIds(assigned).map(id => (
                        <span key={id} className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${catStyle(id).pill}`}>
                          {abbrev(id)}
                        </span>
                      ))}
                    </span>
                  )}
                  <HiChevronDown className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 flex flex-wrap gap-1.5" role="group">
                  {chipIds.map(id => {
                    const sel = assigned.includes(id);
                    const s = catStyle(id);
                    const label = t(`playingPositions.${id}.label` as TranslationKey, POSITION_LABEL_FALLBACK[id] ?? id);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={sel}
                        title={label}
                        onClick={() => toggle(player.id, id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${sel ? s.sel : `bg-slate-900/40 ${s.idle}`}`}
                      >
                        {abbrev(id)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlayerPositionsEditor;
