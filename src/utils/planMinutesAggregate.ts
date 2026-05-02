// Aggregate minutes across all games in a plan + fair-share calc.
// Pure; no React, no i18n.

import type { AppState } from '@/types/game';
import type { PlanDraft, PlayerId } from './planSwapEngine';
import { computePlayerSeconds } from './planFairness';

export interface PlanMinutesEntry {
  playerId: PlayerId;
  /** Aggregate on-field seconds across every game in the plan. */
  totalSeconds: number;
  /** Ratio of totalSeconds to fair-share target. 1.0 = exactly fair. */
  shareRatio: number;
}

export interface PlanMinutesAggregate {
  perPlayer: PlanMinutesEntry[];
  /** Fair-share target seconds per referenced player. */
  fairShareSeconds: number;
  /** Sum of game capacities across the plan (gameDuration * startingXI count). */
  totalFieldSeconds: number;
  /** Players who appear in any startingXI or as a sub.inPlayer. */
  referencedPlayerIds: PlayerId[];
}

const gameDurationSec = (game: AppState): number => {
  const periods = game.numberOfPeriods ?? 2;
  const minutes = game.periodDurationMinutes ?? 10;
  return Math.max(0, periods * minutes * 60);
};

// "Referenced" matches standalone semantics: a player counts toward
// fair-share only if the plan actually puts them on the field at some
// point. Pure-bench squad members are excluded so a 14-player squad
// with a 5-player rotation doesn't inflate the denominator.
const collectReferenced = (draft: PlanDraft): Set<PlayerId> => {
  const ref = new Set<PlayerId>(Object.values(draft.startingXI));
  for (const s of draft.scheduledSubs) ref.add(s.inPlayer);
  return ref;
};

/**
 * Aggregates per-player minutes across every game in the plan and
 * computes the fair-share target. The same draft applies to every
 * game, so per-player seconds scale with each game's duration.
 *
 * Returns { perPlayer: [], referencedPlayerIds: [], ... } for empty
 * input rather than throwing — callers can render the dashboard
 * empty-state without checking.
 */
export const aggregatePlanMinutes = (
  draft: PlanDraft,
  gameIds: string[],
  savedGames: Record<string, AppState | undefined>,
): PlanMinutesAggregate => {
  const referencedPlayerIds = [...collectReferenced(draft)];
  if (referencedPlayerIds.length === 0 || gameIds.length === 0) {
    return {
      perPlayer: [],
      fairShareSeconds: 0,
      totalFieldSeconds: 0,
      referencedPlayerIds,
    };
  }
  const startingXISize = Object.keys(draft.startingXI).length;
  const totals = new Map<PlayerId, number>();
  let totalFieldSeconds = 0;
  for (const gid of gameIds) {
    const game = savedGames[gid];
    if (!game) continue;
    const dur = gameDurationSec(game);
    if (dur === 0) continue;
    totalFieldSeconds += dur * startingXISize;
    const perPlayer = computePlayerSeconds(draft, dur);
    for (const [pid, secs] of perPlayer) {
      totals.set(pid, (totals.get(pid) ?? 0) + secs);
    }
  }
  const fairShareSeconds =
    referencedPlayerIds.length > 0
      ? totalFieldSeconds / referencedPlayerIds.length
      : 0;
  // referencedPlayerIds drives row order so a player who gets 0 secs
  // (e.g. only listed as sub.inPlayer for an unreachable role) still
  // shows up — otherwise the dashboard would silently hide them.
  const perPlayer: PlanMinutesEntry[] = referencedPlayerIds.map((pid) => {
    const totalSeconds = totals.get(pid) ?? 0;
    const shareRatio =
      fairShareSeconds > 0 ? totalSeconds / fairShareSeconds : 0;
    return { playerId: pid, totalSeconds, shareRatio };
  });
  return {
    perPlayer,
    fairShareSeconds,
    totalFieldSeconds,
    referencedPlayerIds,
  };
};

/**
 * Maps a fair-share ratio to a Tailwind background color band.
 * Bands chosen to match the standalone's red/yellow/green gradient
 * intuition: under 70% red, 70-90% amber, 90-110% emerald (fair),
 * 110-130% lime (mild over), >130% indigo (heavy over).
 */
export type FairShareBand = 'under' | 'low' | 'fair' | 'over' | 'heavy-over';

export const fairShareBand = (ratio: number): FairShareBand => {
  if (ratio < 0.7) return 'under';
  if (ratio < 0.9) return 'low';
  if (ratio <= 1.1) return 'fair';
  if (ratio <= 1.3) return 'over';
  return 'heavy-over';
};
