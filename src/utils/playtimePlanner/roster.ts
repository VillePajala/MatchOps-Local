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
    })),
  };
}
