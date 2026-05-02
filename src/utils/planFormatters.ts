// Shared formatters for planner components. Keeps the M:SS time and
// per-game duration math in one place so 5a/5b/future slices don't
// drift. PlanningTimeline uses an MM:SS variant by design and is not
// shared here.

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
  return Math.max(0, periods * minutes * 60);
};
