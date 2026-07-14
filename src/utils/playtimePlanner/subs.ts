/**
 * Playing-Time Planner — substitution helpers (Phase 1, PR 1.4).
 *
 * A game's `subs` schedule who comes on and when. Each sub, at `timeSeconds`,
 * hands its `slotId` to `inPlayerId` (whoever held it comes off) - the exact
 * shape the minutes engine (`minutes.ts`) walks. These helpers are pure so the
 * UI and tests agree on the default swap time and on who is eligible to come on.
 */

import type { PlanGame, PlanSub, PlanSlotAssignment } from './types';

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

/**
 * Roster players eligible to come on: those not in the starting XI and not
 * already scheduled to come on in another sub (so nobody is subbed on twice).
 * Pass `excludeSubId` to ignore the sub currently being edited.
 *
 * Phase-1 limitation (intentional): this models a single swap window per player,
 * so a starter who is subbed off cannot be brought back on, and a bench player
 * can only come on once. Multi-rotation patterns (e.g. rolling 5-a-side subs) are
 * out of scope for Phase 1; the minutes engine itself supports arbitrary subs, so
 * this is purely a UI eligibility simplification, not an engine constraint.
 */
export function availableSubInIds(
  rosterIds: string[],
  startingSlots: PlanSlotAssignment[],
  subs: PlanSub[],
  excludeSubId?: string,
): string[] {
  const starters = new Set(
    startingSlots.map((s) => s.playerId).filter((id): id is string => id !== null),
  );
  const incoming = new Set(
    subs
      .filter((s) => s.id !== excludeSubId)
      .map((s) => s.inPlayerId)
      .filter((id): id is string => id !== null),
  );
  return rosterIds.filter((id) => !starters.has(id) && !incoming.has(id));
}

/**
 * Drop any scheduled subs that bring on `playerId`. Used when that player is
 * placed into the starting lineup: `availableSubInIds` blocks scheduling a
 * starter as an incoming sub, but the reverse order (schedule first, then place
 * as starter) used to slip through - leaving the player both starting and
 * "coming on", which double-counted their minutes and skewed the fairness view.
 * Placing them as a starter supersedes the planned entry.
 */
export function removeSubsBringingOn(subs: PlanSub[], playerId: string | null): PlanSub[] {
  if (!playerId) return subs;
  const filtered = subs.filter((s) => s.inPlayerId !== playerId);
  return filtered.length === subs.length ? subs : filtered;
}
