'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiChevronDown } from 'react-icons/hi';
import type { TranslationKey } from '@/i18n-types';
import type { Player } from '@/types';
import type { GameType } from '@/types/game';
import { labelStyle, segmentTrackStyle, segmentStyle, segmentSelectedStyle } from '@/styles/modalStyles';
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

// Colour by pitch line, on the app's chip base (quiet outline idle
// / filled colour selected) so the chips read as GameSettings buttons but still
// carry a line identity via colour. `sel`/`idle` slot into the shared button
// classes below; `pill` is the small collapsed-summary tag.
const CAT_STYLE: Record<PositionCategory, { sel: string; idle: string; pill: string }> = {
  // Muted tints, not bright fills: the line is an identity cue, not an action.
  // The keeper is a neutral white tint - the same "inverse" identity the keeper
  // disc has on the pitch - so it never reads as the app's amber (the one primary
  // action) and brings back no purple.
  gk:  { sel: 'bg-white/20 text-white',            idle: 'bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]',      pill: 'bg-white/15 text-slate-100' },
  def: { sel: 'bg-sky-400/25 text-sky-100',        idle: 'bg-white/[0.04] text-sky-300/90 hover:bg-white/[0.08]',     pill: 'bg-sky-400/20 text-sky-200' },
  mid: { sel: 'bg-teal-400/25 text-teal-100',      idle: 'bg-white/[0.04] text-teal-300/90 hover:bg-white/[0.08]',    pill: 'bg-teal-400/20 text-teal-200' },
  att: { sel: 'bg-rose-400/25 text-rose-100',      idle: 'bg-white/[0.04] text-rose-300/90 hover:bg-white/[0.08]',    pill: 'bg-rose-400/20 text-rose-200' },
};

// Shared button chrome matching GameSettings segmented controls.
const CHIP_BASE = 'min-h-9 px-3 rounded-full text-[13px] font-semibold transition-colors shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-carbon';

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
      <p className="font-ui text-sm text-ink-3">
        {t('gameSettingsModal.lineupNoPlayers', 'Select players for this game to assign positions.')}
      </p>
    );
  }

  return (
    <div className="space-y-3 font-ui">
      {/* Format selector - scopes the palette; `All` is the manual override. */}
      <div>
        <label className={labelStyle}>{t('gameSettingsModal.lineupFormat', 'Format')}</label>
        <div className={segmentTrackStyle}>
          {formatOptions.map(f => (
            <button
              key={f}
              type="button"
              aria-pressed={format === f}
              onClick={() => setFormat(f)}
              className={format === f ? segmentSelectedStyle : segmentStyle}
            >
              {formatButtonLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {/* One hairline grouped list: the rows sit on the surrounding card,
          split by inset hairlines - no box per player. */}
      <div data-testid="player-positions-list">
        {players.map(player => {
          const assigned = value[player.id] ?? [];
          const isOpen = expanded.has(player.id);
          const chipIds = orderPositionIds([...new Set([...formatIds, ...assigned])]);
          const name = player.nickname?.trim() || player.name;
          return (
            <div
              key={player.id}
              className="relative before:absolute before:top-0 before:left-0 before:right-0 before:h-px before:bg-hairline first:before:hidden"
            >
              <button
                type="button"
                onClick={() => toggleExpand(player.id)}
                aria-expanded={isOpen}
                className="w-full min-h-12 flex items-center justify-between gap-2 px-1 py-2 text-left rounded-[14px] transition-colors hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
              >
                <span className="text-[15px] font-medium text-ink truncate shrink-0">{name}</span>
                <span className="flex items-center gap-2 min-w-0">
                  {assigned.length === 0 ? (
                    <span className="text-[13px] text-ink-3">{t('gameSettingsModal.lineupAddPositions', 'Add positions')}</span>
                  ) : (
                    <span className="flex flex-wrap gap-1 justify-end">
                      {orderPositionIds(assigned).map(id => (
                        <span key={id} className={`px-1.5 py-0.5 rounded-md text-xs font-semibold ${catStyle(id).pill}`}>
                          {abbrev(id)}
                        </span>
                      ))}
                    </span>
                  )}
                  <HiChevronDown className={`shrink-0 text-ink-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>

              {isOpen && (
                <div className="px-1 pb-3 flex flex-wrap gap-1.5" role="group">
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
                        className={`${CHIP_BASE} ${sel ? s.sel : s.idle}`}
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
