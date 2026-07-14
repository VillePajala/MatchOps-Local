'use client';

/**
 * Playing-Time Planner — always-visible fairness strip.
 *
 * A compact panel of every plan player, sorted worst-off first, each cell
 * filled with their ramp colour (red→green) and printing their total planned
 * minutes. Lives on the SAME screen as the lineup (the standalone planner's
 * biggest structural win: fairness is never a separate view). Tapping a cell
 * toggles a cross-surface highlight of that player.
 *
 * Cells WRAP so the whole squad is visible at once (no horizontal scroll - a
 * scrolling strip both hid players and its swipe gesture fought the lineup's
 * game-flip swipe). Large squads can fold the section away with the header
 * toggle. Touch events never propagate out, so interacting with the strip can
 * never flip the game underneath.
 */

import React, { useState } from 'react';
import { HiChevronDown } from 'react-icons/hi2';
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
  /** Controlled fold state (lifted so it survives tab/layout unmounts). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || '?';

const PlanFairnessStrip: React.FC<PlanFairnessStripProps> = ({
  rows,
  highlightPlayerIds = [],
  onToggleHighlight,
  collapsed: collapsedProp,
  onToggleCollapsed,
}) => {
  const { t } = useTranslation();
  const [collapsedLocal, setCollapsedLocal] = useState(false);
  const collapsed = collapsedProp ?? collapsedLocal;
  const toggleCollapsed = onToggleCollapsed ?? (() => setCollapsedLocal((c) => !c));
  if (rows.length === 0) return null;
  const anyHighlight = highlightPlayerIds.length > 0;
  return (
    <div
      // The strip is its own interactive surface: a touch that starts here must
      // never bubble into the lineup's swipe-to-switch-game handler.
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 py-1.5 -my-1"
      >
        <HiChevronDown
          aria-hidden="true"
          className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
        {t('playtimePlanner.lineup.fairnessStrip', 'Playing-time totals')}
      </button>
      {!collapsed && (
        <div
          role="group"
          aria-label={t('playtimePlanner.lineup.fairnessStrip', 'Playing-time totals')}
          className="grid grid-cols-[repeat(auto-fit,minmax(3.4rem,1fr))] gap-1 mt-1"
        >
          {rows.map((row) => {
            const highlighted = highlightPlayerIds.includes(row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onToggleHighlight(row.id)}
                aria-pressed={highlighted}
                title={row.name}
                className={[
                  'w-full px-1.5 py-1 rounded-md text-center leading-tight',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                  highlighted ? 'ring-2 ring-amber-300' : '',
                  anyHighlight && !highlighted ? 'opacity-40' : '',
                ].join(' ')}
                style={{ backgroundColor: fairnessCell(row.ratio) }}
              >
                <span
                  className="block text-[11px] font-bold text-white truncate"
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
      )}
    </div>
  );
};

export default PlanFairnessStrip;
