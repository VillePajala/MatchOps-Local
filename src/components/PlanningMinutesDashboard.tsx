'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
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

  // Stable savedGames signature — Object.keys/values order is
  // implementation-defined for non-numeric keys, but JS engines have
  // historically respected insertion order. Casting to a record for
  // the calculator keeps the type contract narrow.
  const savedGamesMap = savedGames as Record<string, AppState | undefined>;

  const aggregate = useMemo(
    () => aggregatePlanMinutes(draft, gameIds, savedGamesMap),
    [draft, gameIds, savedGamesMap],
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

  // Sort by totalSeconds descending so the over/under players are
  // visually grouped at the top/bottom rather than interleaved by
  // referenced-set insertion order.
  const sorted = [...aggregate.perPlayer].sort(
    (a, b) => b.totalSeconds - a.totalSeconds,
  );

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
          // Title attribute carries the precise mm:ss + percent for
          // non-AT users; AT users get an aria-label that bundles the
          // same data into a single announceable string.
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
