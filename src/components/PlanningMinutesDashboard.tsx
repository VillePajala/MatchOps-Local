'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { SavedGamesCollection } from '@/types/game';
import type { PlanDraft } from '@/utils/planSwapEngine';
import {
  aggregatePlanMinutes,
  fairShareBand,
  type FairShareBand,
} from '@/utils/planMinutesAggregate';

export interface PlanningMinutesDashboardProps {
  draft: PlanDraft;
  gameIds: string[];
  savedGames: SavedGamesCollection;
  roster: Player[];
}

const formatMMSS = (totalSec: number): string => {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Tailwind classes per band — matched to the existing emerald (success)
// / amber (info) / rose (warn) palette used elsewhere in the planner so
// the dashboard reads consistently with PlanningApplyPreview / Banner.
const bandClass: Record<FairShareBand, string> = {
  under: 'bg-rose-900/30 border-rose-700/50 text-rose-100',
  low: 'bg-amber-900/30 border-amber-700/50 text-amber-100',
  fair: 'bg-emerald-900/30 border-emerald-700/50 text-emerald-100',
  over: 'bg-amber-900/30 border-amber-700/50 text-amber-100',
  'heavy-over': 'bg-rose-900/30 border-rose-700/50 text-rose-100',
};

const PlanningMinutesDashboard: React.FC<PlanningMinutesDashboardProps> = ({
  draft,
  gameIds,
  savedGames,
  roster,
}) => {
  const { t } = useTranslation();

  const playerLabel = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of roster) map.set(p.id, p);
    return (id: string): string => {
      const p = map.get(id);
      return p?.nickname || p?.name || id;
    };
  }, [roster]);

  const aggregate = useMemo(
    () => aggregatePlanMinutes(draft, gameIds, savedGames),
    [draft, gameIds, savedGames],
  );

  // Sort by total seconds desc so over-played players cluster at the
  // top, under-played at the bottom — answers "who's getting too
  // much/little time?" at a glance. Memoised on aggregate so a
  // parent re-render doesn't re-sort.
  const sorted = useMemo(
    () =>
      [...aggregate.perPlayer].sort(
        (a, b) => b.totalSeconds - a.totalSeconds,
      ),
    [aggregate],
  );

  if (aggregate.perPlayer.length === 0) {
    return (
      <div
        className="rounded-md border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400"
        data-testid="planning-minutes-dashboard-empty"
      >
        {t(
          'planningMinutesDashboard.empty',
          'Pick at least one game and assign players to a starting XI to see the minutes breakdown.',
        )}
      </div>
    );
  }

  return (
    <section
      className="space-y-2 rounded-md border border-slate-700 bg-slate-900/40 p-3"
      data-testid="planning-minutes-dashboard"
      aria-labelledby="planning-minutes-dashboard-heading"
    >
      <header className="flex items-baseline justify-between">
        <h3
          id="planning-minutes-dashboard-heading"
          className="text-xs uppercase tracking-wider text-slate-400"
        >
          {t('planningMinutesDashboard.title', 'Plan minutes')}
        </h3>
        <span className="text-[10px] text-slate-500">
          {t(
            'planningMinutesDashboard.fairShare',
            'Fair share: {{mmss}}',
            { mmss: formatMMSS(aggregate.fairShareSeconds) },
          )}
        </span>
      </header>
      <ul
        className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3"
        data-testid="planning-minutes-dashboard-grid"
      >
        {sorted.map((entry) => {
          const band = fairShareBand(entry.shareRatio);
          const pct = Math.round(entry.shareRatio * 100);
          // Single string used for both `title` (sighted hover) and
          // `aria-label` (AT announcement) so the two never drift.
          const ariaLabel = t(
            'planningMinutesDashboard.entryAria',
            '{{player}}: {{mmss}}, {{pct}} percent of fair share',
            {
              player: playerLabel(entry.playerId),
              mmss: formatMMSS(entry.totalSeconds),
              pct,
            },
          );
          return (
            <li
              key={entry.playerId}
              data-testid={`planning-minutes-dashboard-entry-${entry.playerId}`}
              data-band={band}
              aria-label={ariaLabel}
              title={ariaLabel}
              className={`flex items-center justify-between rounded-md border px-2 py-1 ${bandClass[band]}`}
            >
              <span className="truncate">{playerLabel(entry.playerId)}</span>
              <span className="font-mono text-[11px] tabular-nums">
                {formatMMSS(entry.totalSeconds)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default PlanningMinutesDashboard;
