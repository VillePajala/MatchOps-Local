'use client';

/**
 * Playing-Time Planner — fair-minutes balance (Phase 1, PR 1.5).
 *
 * The payoff view: every player's planned minutes across the whole plan, sorted
 * worst-off first and coloured red -> green by how they sit against an equal
 * share of the available field time. A per-game strip and "not playing" warnings
 * make imbalance obvious so the coach can swap a green kid for a red one and see
 * the numbers recolour instantly. All math comes from the pure minutes engine.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computePlanMinutes, type FairnessBand } from '@/utils/playtimePlanner/minutes';
import { toEnginePlan } from '@/utils/playtimePlanner/adapter';
import { gameTotalSeconds, type PlaytimePlan } from '@/utils/playtimePlanner/types';
import { labelStyle, subtextStyle } from '@/styles/modalStyles';

interface PlanBalanceViewProps {
  plan: PlaytimePlan;
}

const bandFill: Record<FairnessBand, string> = {
  under: 'bg-red-500',
  fair: 'bg-green-500',
  over: 'bg-blue-500',
  none: 'bg-slate-600',
};

const toMin = (sec: number): number => Math.round(sec / 60);

// A player exactly at their fair share (ratio 1.0) fills ~2/3 of the bar, which
// leaves visible headroom so an over-played player (ratio up to ~1.5) still reads
// as "past fair" before the bar saturates at 100%.
const FAIR_SHARE_BAR_PCT = 66;

const PlanBalanceView: React.FC<PlanBalanceViewProps> = ({ plan }) => {
  const { t } = useTranslation();

  const { minutes, gameTotals, nameById } = useMemo(() => {
    const m = computePlanMinutes(toEnginePlan(plan));
    return {
      minutes: m,
      gameTotals: plan.games.map((g) => gameTotalSeconds(g)),
      nameById: new Map(plan.players.map((p) => [p.id, p.name])),
    };
  }, [plan]);

  // Worst-off first (lowest planned minutes), then by name for stability.
  const rows = useMemo(
    () =>
      [...minutes.players].sort((a, b) => {
        if (a.totalSeconds !== b.totalSeconds) return a.totalSeconds - b.totalSeconds;
        return (nameById.get(a.playerId) ?? '').localeCompare(nameById.get(b.playerId) ?? '');
      }),
    [minutes.players, nameById],
  );

  const fairMin = minutes.fairShareSeconds !== null ? toMin(minutes.fairShareSeconds) : null;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h3 className={labelStyle}>{t('playtimePlanner.balance.title', 'Playing-time balance')}</h3>
        <p className={subtextStyle}>
          {fairMin === null
            ? t('playtimePlanner.balance.noGames', 'No games counted yet. Mark games as included.')
            : `${t('playtimePlanner.balance.fairShare', "Fair share {{minutes}}' each", {
                minutes: fairMin,
              })} · ${t('playtimePlanner.balance.gamesCounted', '{{count}} games counted', {
                count: minutes.includedGameCount,
              })}`}
        </p>
      </div>

      <ul className="space-y-3">
        {rows.map((p) => {
          const name = nameById.get(p.playerId) ?? p.playerId;
          const pct = p.ratio !== null ? Math.round(p.ratio * 100) : null;
          const fillW = p.ratio !== null ? Math.min(100, Math.round(p.ratio * FAIR_SHARE_BAR_PCT)) : 0;
          // Included games this player never appears in.
          const notPlaying = plan.games
            .map((g, i) => ({ g, i }))
            .filter(({ g, i }) => g.included && p.perGameSeconds[i] === 0)
            .map(({ g }) => g.label);
          return (
            <li key={p.playerId}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-100 font-medium">{name}</span>
                <span className="text-slate-300 tabular-nums">
                  {toMin(p.totalSeconds)}&#39;
                  {pct !== null && (
                    <span className="text-slate-500 ml-2">
                      {t('playtimePlanner.balance.ofFairShare', '{{pct}}% of fair share', { pct })}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-700/60 overflow-hidden">
                <div className={`h-full ${bandFill[p.band]}`} style={{ width: `${fillW}%` }} />
              </div>
              {/* Per-game strip */}
              <div className="mt-1 flex flex-wrap gap-1">
                {plan.games.map((g, i) => {
                  const sec = p.perGameSeconds[i] ?? 0;
                  const ratio = gameTotals[i] > 0 ? sec / gameTotals[i] : 0;
                  const tone = !g.included
                    ? 'text-slate-600'
                    : ratio >= 0.95
                      ? 'text-green-400'
                      : ratio >= 0.05
                        ? 'text-amber-400'
                        : 'text-red-400';
                  return (
                    <span key={g.id} className={`text-[10px] tabular-nums ${tone}`} title={g.label}>
                      G{i + 1}&nbsp;{toMin(sec)}&#39;
                    </span>
                  );
                })}
              </div>
              {notPlaying.length > 0 && (
                <p className="mt-0.5 text-[11px] text-red-400/90">
                  {t('playtimePlanner.balance.notPlaying', 'Not playing: {{games}}', {
                    games: notPlaying.join(', '),
                  })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PlanBalanceView;
