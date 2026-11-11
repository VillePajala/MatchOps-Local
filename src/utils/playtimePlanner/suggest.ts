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
 * Times of the sub moments when the bench needs `k` rounds (k >= 2). Evenly
 * spread, and a two-period game always keeps half time as one of them:
 * 2 x 25 gives 12:30 + 25:00 for k = 2 and 12:30, 25:00, 37:30 for k = 3.
 * Returns null only when the game is shorter than k + 2 seconds (a 0-minute
 * game - real games are whole minutes, so k distinct seconds always fit). The
 * caller then keeps the one-round path; such a game has no minutes to share.
 */
function subWindowTimes(game: PlanGame, k: number): number[] | null {
  const total = gameTotalSeconds(game);
  // Odd k: k + 1 equal parts, so the middle moment lands on half time. Even k
  // would straddle it, so use k + 2 parts and keep the first k - the
  // (k/2 + 1)-th of those is half time.
  const parts = game.numberOfPeriods === 2 && k % 2 === 0 ? k + 2 : k + 1;
  const times = Array.from({ length: k }, (_, j) => Math.round((total * (j + 1)) / parts));
  const distinct = times.every((t, i) => t > 0 && t < total && (i === 0 || t > times[i - 1]));
  return distinct ? times : null;
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
      // closest together (16 in 8v8, 2 x 25: one sub at 12:30, seven at half
      // time, every outfield player 12:30-25:00). Each sub replaces whoever has
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
