/**
 * Playing-Time Planner — fair-share lineup generator (Batch 4).
 *
 * One tap builds a complete rotation for every INCLUDED game, ported from the
 * standalone planner's greedy `suggestFairShareLineup`: walk the games in order
 * with a running minutes accumulator, give each game's start to the players with
 * the least accumulated time, and bring the remaining bench players on as subs:
 * one round at half time when the bench fits, otherwise several sub moments so
 * every attending player gets time. The goalkeeper is never subbed mid-game
 * (standalone's GK protection); GK duty itself rotates because the accumulator
 * naturally pushes last game's full-time keeper down the pecking order.
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


/**
 * Times of the sub moments when the bench needs `k` rounds (k >= 2).
 *
 * The even split comes first: k + 1 equal parts, and in a two-period game half
 * time is always one of the moments (even k would straddle it, so k + 2 parts
 * and the first k are kept). Those exact times (12:30, 37:30 ...) are awkward
 * to coach by, so they are then rounded to times a coach can read off the
 * clock:
 *
 *  1. A moment that falls exactly on a period break (half time, the breaks of
 *     a three-period game) stays there.
 *  2. The other moments go to the 5-minute grid point closest to their even
 *     time - but only when every moment lands within a quarter of the even
 *     spacing (otherwise the grid would skew the windows, e.g. 2 x 8 min).
 *     Equal distance goes AWAY from the middle of the game, so 2 x 25 with
 *     k = 3 is the symmetric 10:00 / 25:00 / 40:00.
 *  3. Otherwise whole minutes, closest to the even time (same tie rule):
 *     2 x 15, k = 3 -> 7:00 / 15:00 / 23:00.
 *  4. Only a game too short for k distinct whole minutes keeps the exact
 *     seconds (2 x 1 min -> 0:30, 1:00).
 *
 * The moments are always strictly increasing and inside the game. The rounding
 * can make a window a minute or two longer or shorter than the even split; the
 * minutes accumulator in `suggestFairShareLineup` sees the real windows, so the
 * balancing across games still evens it out.
 *
 * Examples: 2 x 20 k = 3 -> 10:00, 20:00, 30:00; 2 x 25 k = 2 -> 10:00, 25:00;
 * 1 x 25 k = 2 -> 10:00, 15:00.
 *
 * Returns null only when the game is shorter than k + 2 seconds (a 0-minute
 * game). The caller then keeps the one-round path; such a game has no minutes
 * to share.
 */
function subWindowTimes(game: PlanGame, k: number): number[] | null {
  const total = gameTotalSeconds(game);
  const parts = game.numberOfPeriods === 2 && k % 2 === 0 ? k + 2 : k + 1;
  const ideal = Array.from({ length: k }, (_, j) => (total * (j + 1)) / parts);

  const periodSec = Math.max(0, game.periodMinutes) * 60;
  const isBreak = (t: number) =>
    game.numberOfPeriods > 1 && periodSec > 0 && Number.isInteger(t / periodSec) && t > 0 && t < total;
  const pinned = ideal.map((t) => (isBreak(t) ? t : null));
  const mid = total / 2;
  const spacing = total / parts;

  const fiveMin = snapToGrid(ideal, pinned, total, mid, 300);
  if (fiveMin && fiveMin.every((t, j) => Math.abs(t - ideal[j]) <= spacing / 4)) return fiveMin;
  const minutes = snapToGrid(ideal, pinned, total, mid, 60);
  if (minutes) return minutes;

  const times = ideal.map((t) => Math.round(t));
  const distinct = times.every((t, i) => t > 0 && t < total && (i === 0 || t > times[i - 1]));
  return distinct ? times : null;
}

/**
 * Pick k strictly increasing times, each a multiple of `grid` seconds inside
 * the game (pinned moments stay where they are), minimising the total distance
 * to the ideal times; equal distance prefers the point farther from `mid`.
 * Small DP over (moment, grid point) - k and the grid are tiny. Null when k
 * distinct points do not fit.
 */
function snapToGrid(
  ideal: number[],
  pinned: (number | null)[],
  total: number,
  mid: number,
  grid: number,
): number[] | null {
  const gridPoints: number[] = [];
  for (let t = grid; t < total; t += grid) gridPoints.push(t);
  type Cost = { dev: number; inward: number };
  const better = (a: Cost, b: Cost) => a.dev < b.dev - 1e-9 || (Math.abs(a.dev - b.dev) <= 1e-9 && a.inward < b.inward);
  const candidatesOf = (j: number): number[] => (pinned[j] !== null ? [pinned[j] as number] : gridPoints);
  const costOf = (j: number, t: number): Cost => {
    const dev = Math.abs(t - ideal[j]);
    // "Inward" = this point is closer to the middle of the game than the ideal.
    const inward = Math.abs(t - mid) < Math.abs(ideal[j] - mid) ? 1 : 0;
    return { dev, inward };
  };

  // best[j]: map candidate time -> { cost, prev } for sequences ending at moment j.
  let prevLayer = new Map<number, { cost: Cost; path: number[] }>();
  for (const t of candidatesOf(0)) prevLayer.set(t, { cost: costOf(0, t), path: [t] });
  for (let j = 1; j < ideal.length; j++) {
    const layer = new Map<number, { cost: Cost; path: number[] }>();
    for (const t of candidatesOf(j)) {
      let best: { cost: Cost; path: number[] } | null = null;
      for (const [pt, entry] of prevLayer) {
        if (pt >= t) continue;
        const c = costOf(j, t);
        const cost = { dev: entry.cost.dev + c.dev, inward: entry.cost.inward + c.inward };
        if (!best || better(cost, best.cost)) best = { cost, path: [...entry.path, t] };
      }
      if (best) layer.set(t, best);
    }
    prevLayer = layer;
  }
  let result: { cost: Cost; path: number[] } | null = null;
  for (const entry of prevLayer.values()) {
    if (!result || better(entry.cost, result.cost)) result = entry;
  }
  return result ? result.path : null;
}

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
    let startingSlots: PlanSlotAssignment[] = [];
    let cursor = 0;
    if (gkSlot) startingSlots.push({ slotId: gkSlot.slotId, playerId: xi[cursor++] ?? null });
    for (const { slot } of outfieldSlots) {
      startingSlots.push({ slotId: slot.slotId, playerId: xi[cursor++] ?? null });
    }

    // Sub targets: the filled outfield slots, HIGHEST-running positions first
    // (wingers/striker before midfield before defence) - fresh legs go where
    // the running is. In the one-round case this also hands over the
    // best-served starters first (they were placed into those slots above).
    // GK is never a sub target.
    const filledBySlotId = new Map(startingSlots.map((a) => [a.slotId, a.playerId]));
    const subs: PlanSub[] = [];
    const subTargets = [...outfieldSlots]
      .reverse()
      .filter(({ slot }) => filledBySlotId.get(slot.slotId) !== null && filledBySlotId.get(slot.slotId) !== undefined);
    const windowTimes =
      bench.length > subTargets.length && subTargets.length > 0
        ? subWindowTimes(game, Math.ceil(bench.length / subTargets.length))
        : null;

    if (!windowTimes) {
      // The bench fits into one round: every bench player comes on at half time.
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
    } else {
      // The bench is bigger than one round: spread it over several sub moments
      // so every attending player gets time. The later moments each take a full
      // round and the remainder comes on at the first one - that keeps minutes
      // closest together (16 in 8v8, 2 x 25: one sub at 10:00, seven at half
      // time, every outfield player 10:00-25:00). Each sub replaces whoever has
      // played most in this game so far, higher-running positions first on a
      // tie; the GK is never a target.
      //
      // Here starting is not automatically the best deal (a half-time sub can
      // outplay a starter), so the schedule is built from ROLES first and the
      // roles with the most minutes then go to the least-played players - the
      // GK's full game to the most under-played, as above.
      const k = windowTimes.length;
      const sizes = windowTimes.map((_, j) =>
        j === 0 ? bench.length - (k - 1) * subTargets.length : subTargets.length,
      );
      const roleSeconds = new Map<string, number>();
      const credit = (role: string, secs: number) => roleSeconds.set(role, (roleSeconds.get(role) ?? 0) + secs);
      const startRole = (slotId: string) => `start:${slotId}`;
      const onPitch = new Map(subTargets.map(({ slot }) => [slot.slotId, { role: startRole(slot.slotId), since: 0 }]));
      const subRoles: { role: string; slotId: string; timeSeconds: number }[] = [];
      windowTimes.forEach((t, j) => {
        const ranked = subTargets
          .map(({ slot }, rank) => {
            const occ = onPitch.get(slot.slotId)!;
            return { slotId: slot.slotId, rank, occ, soFar: (roleSeconds.get(occ.role) ?? 0) + (t - occ.since) };
          })
          .sort((x, y) => y.soFar - x.soFar || x.rank - y.rank);
        for (const { slotId, occ } of ranked.slice(0, sizes[j])) {
          const role = `sub:${subRoles.length}`;
          credit(occ.role, t - occ.since);
          onPitch.set(slotId, { role, since: t });
          subRoles.push({ role, slotId, timeSeconds: t });
        }
      });
      for (const occ of onPitch.values()) credit(occ.role, total - occ.since);
      // Starters outside the rotation (the GK) play the whole game.
      for (const a of startingSlots) {
        if (!roleSeconds.has(startRole(a.slotId))) credit(startRole(a.slotId), total);
      }

      // Most minutes first; ties keep role order (GK, then starters, then subs).
      const roles = [...startingSlots.map((a) => startRole(a.slotId)), ...subRoles.map((r) => r.role)];
      const byMinutes = roles
        .map((role, i) => ({ role, i }))
        .sort((x, y) => (roleSeconds.get(y.role) ?? 0) - (roleSeconds.get(x.role) ?? 0) || x.i - y.i);
      // `ordered` is every attending player, least-played first, and there is
      // exactly one role per attending player (the XI is full, the bench all comes on).
      const playerOf = new Map(byMinutes.map(({ role }, i) => [role, ordered[i]]));

      startingSlots = startingSlots.map((a) => ({ slotId: a.slotId, playerId: playerOf.get(startRole(a.slotId)) ?? null }));
      for (const r of subRoles) subs.push(makeSub(r.slotId, playerOf.get(r.role)!, r.timeSeconds));
      for (const role of roles) {
        const id = playerOf.get(role);
        if (id) acc.set(id, (acc.get(id) ?? 0) + (roleSeconds.get(role) ?? 0));
      }
    }

    return { ...game, startingSlots, subs };
  });

  return { ...plan, games };
}
