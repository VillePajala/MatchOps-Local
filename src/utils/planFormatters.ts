// Shared M:SS time + per-game duration helpers for planner components.

import type { AppState } from '@/types/game';

/** "M:SS" — no leading zero on minutes. Negative inputs clamp to 0. */
export const formatMMSS = (totalSec: number): string => {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
};

/**
 * Per-game total duration in seconds, with the legacy defaults the
 * editor uses elsewhere (2 periods × 10 min) when a saved game omits
 * those fields. Negative or zero results clamp to 0.
 */
export const gameDurationSec = (game: AppState): number => {
  const periods = game.numberOfPeriods ?? 2;
  const minutes = game.periodDurationMinutes ?? 10;
  // Guard NaN/Infinity from corrupt cloud rows: a non-finite product
  // would poison every downstream aggregate (planMinutesAggregate
  // accumulates totalFieldSeconds, then fairShareSeconds → every
  // shareRatio becomes NaN). Clamp to 0 so corruption is visible as
  // empty, not silently broken.
  const total = periods * minutes * 60;
  return Number.isFinite(total) ? Math.max(0, total) : 0;
};
