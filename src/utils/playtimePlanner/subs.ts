/**
 * Playing-Time Planner — substitution helpers (Phase 1, PR 1.4).
 *
 * A game's `subs` schedule who comes on and when. Each sub, at `timeSeconds`,
 * hands its `slotId` to `inPlayerId` (whoever held it comes off) - the exact
 * shape the minutes engine (`minutes.ts`) walks. These helpers are pure so the
 * UI and tests agree on the default swap time and on who is eligible to come on.
 */

import type { PlanGame, PlanSub } from './types';

/**
 * Default time for a swap: the start of the second half for a two-period game,
 * otherwise the midpoint of a single-period game. In seconds from kickoff.
 */
export function defaultSubTimeSeconds(game: PlanGame): number {
  const periodSec = Math.max(0, game.periodMinutes) * 60;
  const periods = Math.max(0, game.numberOfPeriods);
  if (periods === 2) return periodSec;
  return Math.floor((periods * periodSec) / 2);
}

let subCounter = 0;
/** Generate a unique-enough id for a sub (unique within a session/render burst). */
export function generateSubId(): string {
  subCounter += 1;
  return `sub_${Date.now()}_${subCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Build a substitution entry. */
export function makeSub(slotId: string, inPlayerId: string, timeSeconds: number): PlanSub {
  return { id: generateSubId(), slotId, timeSeconds, inPlayerId };
}

/** Append a sub. */
export function addSub(subs: PlanSub[], sub: PlanSub): PlanSub[] {
  return [...subs, sub];
}

/** Remove a sub by id. */
export function removeSub(subs: PlanSub[], id: string): PlanSub[] {
  return subs.filter((s) => s.id !== id);
}

/*
 * The Phase-1 eligibility guards (availableSubInIds, removeSubsBringingOn)
 * are GONE by design: any player may now be scheduled into any sub, so
 * rotation patterns (two players trading a slot every 10 minutes, a starter
 * re-entering after coming off) are expressible. The one real-world rule -
 * a player cannot hold two slots during the same minutes - is validated
 * after the fact by `conflicts.ts` and FLAGGED in the UI, not blocked.
 */
