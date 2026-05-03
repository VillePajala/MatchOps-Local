// Aggregate minutes across all games in a plan + fair-share calc.
// Pure; no React, no i18n.

import type { AppState } from '@/types/game';
import type { PlanDraft, PlayerId } from './planSwapEngine';
import { computePlayerSeconds } from './planFairness';
import { gameDurationSec } from './planFormatters';

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
  /**
   * Players who actually accumulate non-zero seconds across the plan,
   * ordered by player id for deterministic equality assertions.
   * `perPlayer` is in the same order; sort by minutes in the consumer
   * before display.
   */
  referencedPlayerIds: PlayerId[];
}

/**
 * Aggregates per-player minutes across every game in the plan and
 * computes the fair-share target.
 *
 * Two call shapes via overload:
 * 1. `(draft, gameIds, savedGames)` — single PlanDraft applies to
 *    every game (legacy); per-player seconds scale with each game's
 *    duration.
 * 2. `(drafts, gameIds, savedGames)` — per-game Record<gameId, PlanDraft>;
 *    each game uses its own draft (rebuild path).
 *
 * The fair-share denominator counts only players who actually take
 * the field for some non-zero time across the plan — matches the
 * post-apply behavior of `applyDraftToGame`, which drops unreachable
 * subs (e.g. sub time beyond game duration). Without this, a
 * legacy/imported draft with stale subs could inflate the
 * denominator and make every active player look over their share.
 *
 * Returns { perPlayer: [], referencedPlayerIds: [], ... } for empty
 * input rather than throwing.
 */
export function aggregatePlanMinutes(
  draft: PlanDraft,
  gameIds: string[],
  savedGames: Record<string, AppState | undefined>,
): PlanMinutesAggregate;
export function aggregatePlanMinutes(
  drafts: Record<string, PlanDraft>,
  gameIds: string[],
  savedGames: Record<string, AppState | undefined>,
): PlanMinutesAggregate;
export function aggregatePlanMinutes(
  draftOrDrafts: PlanDraft | Record<string, PlanDraft>,
  gameIds: string[],
  savedGames: Record<string, AppState | undefined>,
): PlanMinutesAggregate {
  // Discriminator: a single PlanDraft has `startingXI`, `bench`,
  // `scheduledSubs` keys at the top level; a per-game Record has
  // gameId keys. The two can't collide because PlanDraft properties
  // would be invalid gameIds (saved-game ids are timestamp-rand
  // patterns, never lowercase property names like `startingXI`).
  const isSingleDraft =
    typeof (draftOrDrafts as PlanDraft).startingXI === 'object' &&
    (draftOrDrafts as PlanDraft).startingXI !== null;
  const draftFor = (gid: string): PlanDraft | undefined =>
    isSingleDraft
      ? (draftOrDrafts as PlanDraft)
      : (draftOrDrafts as Record<string, PlanDraft>)[gid];

  // Empty inputs short-circuit.
  if (gameIds.length === 0) {
    return {
      perPlayer: [],
      fairShareSeconds: 0,
      totalFieldSeconds: 0,
      referencedPlayerIds: [],
    };
  }
  if (
    isSingleDraft &&
    Object.keys((draftOrDrafts as PlanDraft).startingXI).length === 0
  ) {
    return {
      perPlayer: [],
      fairShareSeconds: 0,
      totalFieldSeconds: 0,
      referencedPlayerIds: [],
    };
  }

  const totals = new Map<PlayerId, number>();
  let totalFieldSeconds = 0;
  for (const gid of gameIds) {
    const game = savedGames[gid];
    if (!game) continue;
    const dur = gameDurationSec(game);
    if (dur === 0) continue;
    const draft = draftFor(gid);
    if (!draft) continue;
    const startingXISize = Object.keys(draft.startingXI).length;
    if (startingXISize === 0) continue;
    totalFieldSeconds += dur * startingXISize;
    // computePlayerSeconds clamps subs to [0, dur] internally and
    // only inserts a player when they accumulate positive time, so a
    // sub past the end never lands in the map. Matches the apply path.
    const perPlayer = computePlayerSeconds(draft, dur);
    for (const [pid, secs] of perPlayer) {
      totals.set(pid, (totals.get(pid) ?? 0) + secs);
    }
  }
  // Referenced = players who actually played for > 0s across the
  // plan. Pure-bench squad members and inPlayers of unreachable subs
  // are excluded, so the denominator reflects who's on the field.
  // Sorted so the contract is deterministic — Map insertion order
  // depends on which game's computePlayerSeconds inserted each id
  // first, which leaks gameIds order into the return value.
  const referencedPlayerIds = [...totals.keys()].sort();
  const fairShareSeconds =
    referencedPlayerIds.length > 0
      ? totalFieldSeconds / referencedPlayerIds.length
      : 0;
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
}

/**
 * Maps a fair-share ratio to a discrete band. Color mapping is the
 * component's responsibility (see PlanningMinutesDashboard); this
 * util stays display-agnostic. Cutoffs match the standalone's
 * intuition: ±10% of fair share is "fair".
 *
 * The bounds use mixed `<` / `<=` so each integer ratio falls into
 * exactly one band: 0.7 → low, 0.9 → fair, 1.1 → fair (still in
 * the ±10% window), 1.3 → over. Ratios are rounded to 4 decimal
 * places before classification so a divide producing 1.10000000000000009
 * doesn't land in 'over' due to IEEE-754 drift.
 */
export type FairShareBand = 'under' | 'low' | 'fair' | 'over' | 'heavy-over';

export const fairShareBand = (ratio: number): FairShareBand => {
  const r = Math.round(ratio * 10000) / 10000;
  if (r < 0.7) return 'under';
  if (r < 0.9) return 'low';
  if (r <= 1.1) return 'fair';
  if (r <= 1.3) return 'over';
  return 'heavy-over';
};
