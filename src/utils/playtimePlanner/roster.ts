/**
 * Playing-Time Planner — plan roster editing (Phase 4).
 *
 * The plan's roster is a frozen copy taken at creation; these pure helpers let
 * the coach change it mid-tournament without redoing the plan:
 *  - add: a late call-up joins every game's bench (harmless).
 *  - replace: the injury flow - the newcomer inherits every starting slot and
 *    every planned sub of the player they replace, across all games, losslessly.
 *  - remove: a player who left with no substitute - their slots empty and their
 *    planned subs are deleted (destructive; the UI confirms with the impact).
 *
 * Plan-level ONLY: none of this touches real games. Games change when the coach
 * explicitly re-applies (per-game or bulk), and played games are never touched.
 */

import type { PlaytimePlan, PlanPlayer } from './types';

/** What removing (or replacing) a player would affect - drives the confirm copy. */
export interface PlayerPlanImpact {
  /** Starting slots the player holds across all games. */
  startingCount: number;
  /** Planned subs bringing the player on across all games. */
  subCount: number;
}

/** Count where a player appears in the plan (all games, included or not). */
export function playerPlanImpact(plan: PlaytimePlan, playerId: string): PlayerPlanImpact {
  let startingCount = 0;
  let subCount = 0;
  for (const game of plan.games) {
    for (const slot of game.startingSlots) if (slot.playerId === playerId) startingCount += 1;
    for (const sub of game.subs) if (sub.inPlayerId === playerId) subCount += 1;
  }
  return { startingCount, subCount };
}

/**
 * Repair a plan's absence data (self-healing for plans saved by older builds
 * or merged across copies): an absentIds entry is only valid for a CURRENT
 * roster member who is NOT placed or subbed in in that game. Returns the same
 * reference when nothing needed fixing, so callers can treat it as a no-op.
 */
export function normalizePlanAbsences(plan: PlaytimePlan): PlaytimePlan {
  const rosterIds = new Set(plan.players.map((p) => p.id));
  let changed = false;
  const games = plan.games.map((g) => {
    if (!g.absentIds || g.absentIds.length === 0) return g;
    const involved = new Set<string>();
    for (const s of g.startingSlots) if (s.playerId) involved.add(s.playerId);
    for (const sub of g.subs) if (sub.inPlayerId) involved.add(sub.inPlayerId);
    const cleaned = g.absentIds.filter((id) => rosterIds.has(id) && !involved.has(id));
    if (cleaned.length === g.absentIds.length) return g;
    changed = true;
    return { ...g, absentIds: cleaned };
  });
  return changed ? { ...plan, games } : plan;
}

/** Add a player to the plan roster (no-op if already in the plan). */
export function addPlayerToPlan(plan: PlaytimePlan, player: PlanPlayer): PlaytimePlan {
  if (plan.players.some((p) => p.id === player.id)) return plan;
  return { ...plan, players: [...plan.players, player] };
}

/**
 * Replace `oldId` with `replacement` everywhere: roster entry (keeping its
 * position), every starting slot and every planned sub in every game. No-op if
 * `oldId` isn't in the plan or the replacement already is (they would end up
 * holding two slots at once - the UI only offers non-members as candidates).
 */
export function replacePlayerInPlan(
  plan: PlaytimePlan,
  oldId: string,
  replacement: PlanPlayer,
): PlaytimePlan {
  if (!plan.players.some((p) => p.id === oldId)) return plan;
  if (plan.players.some((p) => p.id === replacement.id)) return plan;
  return {
    ...plan,
    players: plan.players.map((p) => (p.id === oldId ? replacement : p)),
    games: plan.games.map((g) => ({
      ...g,
      startingSlots: g.startingSlots.map((s) =>
        s.playerId === oldId ? { ...s, playerId: replacement.id } : s,
      ),
      subs: g.subs.map((s) => (s.inPlayerId === oldId ? { ...s, inPlayerId: replacement.id } : s)),
      // Absence is about the PERSON, so it does not transfer to the
      // replacement - but the leaver's id must not linger (a stale id shows a
      // phantom red count and silently re-absents them if they ever rejoin).
      ...(g.absentIds?.includes(oldId)
        ? { absentIds: g.absentIds.filter((id) => id !== oldId) }
        : {}),
    })),
  };
}

/**
 * Remove a player from the plan: roster entry dropped, their starting slots
 * become empty, and planned subs bringing them on are deleted. Destructive by
 * nature - callers confirm with `playerPlanImpact` first.
 */
export function removePlayerFromPlan(plan: PlaytimePlan, playerId: string): PlaytimePlan {
  if (!plan.players.some((p) => p.id === playerId)) return plan;
  return {
    ...plan,
    players: plan.players.filter((p) => p.id !== playerId),
    games: plan.games.map((g) => ({
      ...g,
      startingSlots: g.startingSlots.map((s) =>
        s.playerId === playerId ? { ...s, playerId: null } : s,
      ),
      subs: g.subs.filter((s) => s.inPlayerId !== playerId),
      ...(g.absentIds?.includes(playerId)
        ? { absentIds: g.absentIds.filter((id) => id !== playerId) }
        : {}),
    })),
  };
}
