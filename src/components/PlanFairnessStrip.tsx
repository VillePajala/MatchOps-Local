'use client';

/**
 * Playing-Time Planner — always-visible fairness strip.
 *
 * A compact row of every plan player, sorted worst-off first, each cell filled
 * with their ramp colour (red→green) and printing their total planned minutes.
 * Lives on the SAME screen as the lineup (the standalone planner's biggest
 * structural win: fairness is never a separate view). Tapping a cell toggles a
 * cross-surface highlight of that player - their discs and chips ring amber
 * while everything else dims - so "where is Onni in the other games?" is one
 * tap while flipping through the set.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { fairnessCell } from '@/utils/playtimePlanner/colors';

export interface FairnessStripRow {
  id: string;
  name: string;
  minutes: number;
  ratio: number | null;
}

interface PlanFairnessStripProps {
  /** Pre-sorted rows (worst-off first). */
  rows: FairnessStripRow[];
  highlightPlayerIds?: readonly string[];
  onToggleHighlight: (playerId: string) => void;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || '?';

const PlanFairnessStrip: React.FC<PlanFairnessStripProps> = ({
  rows,
  highlightPlayerIds = [],
  onToggleHighlight,
}) => {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('playtimePlanner.lineup.fairnessStrip', 'Playing-time totals')}
      className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1"
    >
      {rows.map((row) => {
        const anyHighlight = highlightPlayerIds.length > 0;
        const highlighted = highlightPlayerIds.includes(row.id);
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onToggleHighlight(row.id)}
            aria-pressed={highlighted}
            title={row.name}
            className={[
              'shrink-0 min-w-[3.4rem] px-1.5 py-1 rounded-md text-center leading-tight',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
              highlighted ? 'ring-2 ring-amber-300' : '',
              anyHighlight && !highlighted ? 'opacity-45' : '',
            ].join(' ')}
            style={{ backgroundColor: fairnessCell(row.ratio) }}
          >
            <span
              className="block text-[11px] font-bold text-white truncate max-w-[4.5rem]"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
            >
              {firstName(row.name)}
            </span>
            <span
              className="block text-[10px] font-semibold text-white/90 tabular-nums"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
            >
              {row.minutes}&#39;
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default PlanFairnessStrip;
