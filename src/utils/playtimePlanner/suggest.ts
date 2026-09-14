/**
 * Playing-Time Planner — fair-share lineup generator (Batch 4).
 *
 * One tap builds a complete rotation for every INCLUDED game, ported from the
 * standalone planner's greedy `suggestFairShareLineup`: walk the games in order
 * with a running minutes accumulator, give each game's start to the players with
 * the least accumulated time, and pair the remaining bench players with outfield
 * slots as half-time subs. The goalkeeper is never subbed mid-game (standalone's
 * GK protection); GK duty itself rotates because the accumulator naturally
 * pushes last game's full-time keeper down the pecking order.
 *
 * Pure and deterministic: same plan in, same plan out. Excluded games are left
 * untouched. The result intentionally overwrites included games' lineups and
 * subs - callers confirm first, and the planner's undo restores the previous
 * state in one tap.
 */

import type { PlaytimePlan, PlanGame, PlanSlotAssignment, PlanSub } from './types';
import { getGameSlots } from './lineup';
import { defaultSubTimeSeconds, makeSub } from './subs';
import { gameTotalSeconds } from './types';
import { getPositionLabelForFormationPosition, getRunningIntensity } from '@/utils/positionLabels';

/**
 * Generate fair lineups + half-time subs for all included games.
 * Returns a NEW plan; the input is never mutated.
 */
/**
 * Which positions get relieved first at half time.
 *
 * Owner's order, from coaching a season of it: RIGHT MID, then LEFT MID, then
 * STRIKER. The wide midfielders cover the most ground repeatedly - up and back
 * for ninety minutes - where a striker's work is harder but intermittent, so
 * the wings are where fresh legs buy the most.
 *
 * This is NOT the same question as `getRunningIntensity`, which ranks the
 * striker top and is right to: the striker does run hardest. "Who runs most"
 * and "who should be relieved first" are different judgements, so this is its
 * own ordering rather than a fudge of that table - which is also used to place
 * the starting XI and should not be bent to serve rotation.
 *
 * Anything not named here falls back to running load, which was the previous
 * behaviour for every position.
 */
const SUB_FIRST: readonly string[] = ['RM', 'LM', 'ST'];

/**
 * Higher = subbed earlier. Named positions sit above every other slot; the
 * rest keep their running-load order beneath them.
 */
const subRankOf = (label: string): number => {
  const i = SUB_FIRST.indexOf(label);
  // 100 clears the 0-5 running-load band with room to spare, and reversing the
  // index keeps SUB_FIRST readable in the order a coach would say it.
  return i === -1 ? getRunningIntensity(label) : 100 + (SUB_FIRST.length - i);
};


export function suggestFairShareLineup(plan: PlaytimePlan): PlaytimePlan {
  // Nothing to generate: return the SAME reference so callers (history, the
  // debounced autosave) treat it as a no-op rather than a phantom edit.
  if (!plan.games.some((g) => g.included) || plan.players.length === 0) return plan;
  // Accumulated planned seconds per player across the generated schedule.
  const acc = new Map<string, number>(plan.players.map((p) => [p.id, 0]));
  // Stable pecking order for ties: roster order (coach-entered), not names.
  const rosterIndex = new Map<string, number>(plan.players.map((p, i) => [p.id, i]));
  const byLeastPlayed = (a: string, b: string): number => {
    const d = (acc.get(a) ?? 0) - (acc.get(b) ?? 0);
    if (d !== 0) return d;
    return (rosterIndex.get(a) ?? 0) - (rosterIndex.get(b) ?? 0);
  };

  const games = plan.games.map((game): PlanGame => {
    if (!game.included) return game;

    const slots = getGameSlots(game.formationId);
    if (slots.length === 0 || plan.players.length === 0) return game;

    const total = gameTotalSeconds(game);
    const half = defaultSubTimeSeconds(game);
    const secondHalf = Math.max(0, total - half);

    // XI = the least-played ATTENDING players; absentees sit this game out.
    const absent = new Set(game.absentIds ?? []);
    const ordered = plan.players
      .map((p) => p.id)
      .filter((id) => !absent.has(id))
      .sort(byLeastPlayed);
    const xi = ordered.slice(0, Math.min(slots.length, ordered.length));
    const bench = ordered.slice(xi.length);

    // The MOST under-played starter takes goal: the GK is the one guaranteed
    // full game (never subbed), so the biggest deficit gets the biggest slice -
    // and next game the accumulator hands the gloves to someone else.
    const gkSlot = slots.find((s) => s.isGoalie);
    // Outfield slots ordered LAST-TO-BE-SUBBED first. Reversed below for the
    // half-time targets, so this one ordering drives both halves of the
    // decision and they cannot drift apart. Ties keep preset order for
    // determinism.
    const outfieldSlots = slots
      .filter((s) => !s.isGoalie)
      .map((slot, presetIndex) => {
        const label = getPositionLabelForFormationPosition(slot.relX, slot.relY).label;
        return { slot, presetIndex, label, subRank: subRankOf(label) };
      })
      .sort((a, b) => a.subRank - b.subRank || a.presetIndex - b.presetIndex);
    // Least-played starters take the LOW-running slots (they stay the whole
    // game); the best-served of the XI take the high-running roles, which are
    // exactly the slots the half-time rotation targets below - so the legs
    // that tire first are also the ones that get relieved.
    const startingSlots: PlanSlotAssignment[] = [];
    let cursor = 0;
    if (gkSlot) startingSlots.push({ slotId: gkSlot.slotId, playerId: xi[cursor++] ?? null });
    for (const { slot } of outfieldSlots) {
      startingSlots.push({ slotId: slot.slotId, playerId: xi[cursor++] ?? null });
    }

    // Half-time subs: each bench player comes on for one outfield slot,
    // HIGHEST-running positions first (wingers/striker before midfield before
    // defence) - fresh legs go where the running is. This also hands over the
    // best-served starters first (they were placed into those slots above),
    // spreading minutes hardest against the current imbalance. GK is never a
    // sub target.
    const filledBySlotId = new Map(startingSlots.map((a) => [a.slotId, a.playerId]));
    const subs: PlanSub[] = [];
    const subTargets = [...outfieldSlots]
      .reverse()
      .filter(({ slot }) => filledBySlotId.get(slot.slotId) !== null && filledBySlotId.get(slot.slotId) !== undefined);
    bench.slice(0, subTargets.length).forEach((playerId, i) => {
      subs.push(makeSub(subTargets[i].slot.slotId, playerId, half));
    });

    // Update the accumulator with this game's outcome.
    const subbedSlotIds = new Set(subs.map((s) => s.slotId));
    for (const a of startingSlots) {
      if (!a.playerId) continue;
      acc.set(a.playerId, (acc.get(a.playerId) ?? 0) + (subbedSlotIds.has(a.slotId) ? half : total));
    }
    for (const sub of subs) {
      if (sub.inPlayerId) acc.set(sub.inPlayerId, (acc.get(sub.inPlayerId) ?? 0) + secondHalf);
    }

    return { ...game, startingSlots, subs };
  });

  return { ...plan, games };
}
