// Per-player × per-game minutes matrix for the planning totals table.
// Pure / deterministic. The minutes dashboard (planMinutesAggregate)
// answers "who plays how much across the plan?"; this util answers
// "how does each player's time break down per game?" — a different
// surface so a few numbers ride along.

import type { AppState } from '@/types/game';
import type { PlanDraft, PlayerId, RoleName } from './planSwapEngine';
import { computePlayerSeconds } from './planFairness';
import { gameDurationSec } from './planFormatters';

/**
 * Per-game GK presence flag. Aligns with the standalone planner's
 * h1/h2/full classification but adapted to the more general
 * scheduledSubs model:
 *
 * - 'full'    — same player started AND ended at the GK role
 * - 'partial' — player was at GK at some point but got subbed in/out
 * - null      — never at GK in this game
 *
 * The "full" path is the only one drawn as a positive GK badge in the
 * UI today (matches the standalone). Partial GK rotation is a planner
 * anti-pattern at youth level so the visual doesn't reward it; the
 * badge is suppressed.
 */
export type GkPresence = 'full' | 'partial' | null;

/** Conventional role name for goalkeeper across all formations. */
export const GOALKEEPER_ROLE: RoleName = 'GK';

export interface PlayerGameCell {
  /** On-field seconds in this game (0 = never on the pitch). */
  seconds: number;
  /** GK presence flag for the badge column. */
  gk: GkPresence;
}

export interface PlayerTotalsRow {
  playerId: PlayerId;
  /**
   * One cell per `gameIds` entry in the same order. A gameId with no
   * draft entry produces `{ seconds: 0, gk: null }` — matches the
   * dashboard's "no draft = no contribution" semantic.
   */
  perGame: PlayerGameCell[];
  /** Sum of `perGame[i].seconds` over INCLUDED games only. */
  totalSeconds: number;
}

export interface PlanTotalsMatrix {
  /** One row per referenced player, sorted by playerId. Stable order. */
  rows: PlayerTotalsRow[];
  /**
   * Fair-share target seconds across the included games — used by
   * the table cells' color rules.
   *
   * Formula parity with `planMinutesAggregate.fairShareSeconds`:
   *   numerator   = Σ over included games (gameDurationSec × startingXI size)
   *   denominator = count of players who accumulated positive seconds
   *                 across the same set
   * Both utils compute this the same way, so the dashboard pill colour
   * and the table total colour agree for any plan. The dashboard's
   * caller pre-filters `gameIds` to the included subset, which is the
   * same effective input we use here when `includedGameIds` is set.
   */
  fairShareSeconds: number;
}

/**
 * Compute a per-player × per-game seconds matrix for the totals table.
 *
 * `drafts[gameId]` is the per-game draft (PR-A's foundational model).
 * `includedGameIds === undefined` means "all included" (NULL semantic);
 * a non-undefined array means only those gameIds count toward the
 * totalSeconds and the fair-share denominator.
 */
export function computePlanTotals(
  drafts: Record<string, PlanDraft>,
  gameIds: string[],
  savedGames: Record<string, AppState | undefined>,
  includedGameIds?: string[],
): PlanTotalsMatrix {
  const includedSet =
    includedGameIds === undefined ? null : new Set(includedGameIds);
  const isIncluded = (gid: string) =>
    includedSet === null ? true : includedSet.has(gid);

  // Per-game pre-computation: secondsByPlayer[gid] + gk[gid][playerId].
  // Keyed by gameId so the row loop below can splice into the matrix
  // by iterating `gameIds` in order.
  const perGameSeconds = new Map<string, Map<PlayerId, number>>();
  const perGameGk = new Map<string, Map<PlayerId, GkPresence>>();
  let totalFieldSeconds = 0;
  const referenced = new Set<PlayerId>();

  for (const gid of gameIds) {
    const game = savedGames[gid];
    const draft = drafts[gid];
    if (!game || !draft) {
      perGameSeconds.set(gid, new Map());
      perGameGk.set(gid, new Map());
      continue;
    }
    const dur = gameDurationSec(game);
    const startingXISize = Object.keys(draft.startingXI).length;
    if (dur === 0 || startingXISize === 0) {
      perGameSeconds.set(gid, new Map());
      perGameGk.set(gid, new Map());
      continue;
    }
    const secs = computePlayerSeconds(draft, dur);
    perGameSeconds.set(gid, secs);

    if (isIncluded(gid)) {
      totalFieldSeconds += dur * startingXISize;
    }

    // GK presence: starting GK + last GK (after walking subs in time
    // order). 'full' iff both equal AND the GK role had no firing
    // sub during the game; otherwise 'partial' if the player ever
    // occupied the GK role; else null.
    const gkRoleSubs = draft.scheduledSubs
      .filter((s) => s.positionRole === GOALKEEPER_ROLE)
      .slice()
      .sort((a, b) => a.timeSeconds - b.timeSeconds);
    const gkStart = draft.startingXI[GOALKEEPER_ROLE];
    const gkOccupants = new Set<PlayerId>();
    if (gkStart) gkOccupants.add(gkStart);
    for (const sub of gkRoleSubs) {
      // Only count subs that fire within the game window — beyond
      // dur they're unreachable.
      if (sub.timeSeconds < dur) {
        gkOccupants.add(sub.inPlayer);
      }
    }
    const gkMap = new Map<PlayerId, GkPresence>();
    if (gkStart) {
      // 'full' iff no firing GK sub: the starting GK was at the role
      // the entire game. Any firing sub means rotation, so every GK
      // occupant becomes 'partial'.
      const fullGame =
        gkRoleSubs.filter((s) => s.timeSeconds < dur).length === 0;
      for (const pid of gkOccupants) {
        gkMap.set(pid, fullGame && pid === gkStart ? 'full' : 'partial');
      }
    }
    perGameGk.set(gid, gkMap);

    if (isIncluded(gid)) {
      for (const pid of secs.keys()) referenced.add(pid);
      // Pure-bench / sub-only players still register from secs.keys()
      // (computePlayerSeconds inserts only positive-time players).
    }
  }

  // Roster matrix: one row per referenced player, even if a particular
  // game has zero seconds for them (zero is meaningful — "didn't play
  // this game"). Sort by playerId for deterministic equality assertions.
  const referencedSorted = [...referenced].sort();

  const rows: PlayerTotalsRow[] = referencedSorted.map((pid) => {
    let totalSeconds = 0;
    const perGame: PlayerGameCell[] = gameIds.map((gid) => {
      const secs = perGameSeconds.get(gid)?.get(pid) ?? 0;
      const gk = perGameGk.get(gid)?.get(pid) ?? null;
      if (isIncluded(gid)) totalSeconds += secs;
      return { seconds: secs, gk };
    });
    return { playerId: pid, perGame, totalSeconds };
  });

  const fairShareSeconds =
    referencedSorted.length > 0
      ? totalFieldSeconds / referencedSorted.length
      : 0;

  return { rows, fairShareSeconds };
}

/**
 * Color band for a per-player TOTAL cell. Mirrors the standalone's
 * 60-min priority green / 50-min below-half orange thresholds, but
 * normalised against the dynamic fair-share target so it works for
 * any plan size:
 *
 * - 'priority'  — totalSeconds ≥ fairShareSeconds (≥ 100% of fair share)
 * - 'below-half' — totalSeconds < 0.5 × fairShareSeconds (under-played)
 * - null        — between the two thresholds (on track)
 *
 * Zero-fairShare (no included games / empty plan) returns null for
 * every player so the table renders cleanly without spurious red.
 */
export type TotalBand = 'priority' | 'below-half' | null;
export function totalBand(
  totalSeconds: number,
  fairShareSeconds: number,
): TotalBand {
  if (fairShareSeconds <= 0) return null;
  if (totalSeconds >= fairShareSeconds) return 'priority';
  if (totalSeconds < 0.5 * fairShareSeconds) return 'below-half';
  return null;
}
