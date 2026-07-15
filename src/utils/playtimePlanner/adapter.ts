/**
 * Playing-Time Planner — plan → engine adapter (Phase 1, PR 1.5).
 *
 * Bridges the UI plan model (`PlaytimePlan`, minutes-based, formation slots) to
 * the pure minutes engine's input (`PlannedPlan`, seconds-based). Keeping this a
 * single pure function means the fairness view and its tests feed the engine the
 * exact same shape, with no drift between "what's shown" and "what's computed."
 */

import { gameTotalSeconds, type PlaytimePlan, type PlanGame } from './types';
import { ensureStartingSlots } from './lineup';
import type { PlannedPlan, PlannedGame } from './minutes';

/** Convert one stored game into the engine shape (shared with conflicts.ts). */
export function toEngineGame(g: PlanGame): PlannedGame {
  return {
    id: g.id,
    totalSeconds: gameTotalSeconds(g),
    // Normalize to the formation's slots so slot count (and thus available time)
    // is correct even if some slots are still empty.
    slots: ensureStartingSlots(g).map((s) => ({ slotId: s.slotId, startPlayerId: s.playerId })),
    subs: g.subs.map((s) => ({ slotId: s.slotId, timeSeconds: s.timeSeconds, inPlayerId: s.inPlayerId })),
    included: g.included,
    absentIds: g.absentIds,
  };
}

/** Convert a stored plan into the minutes engine's input. */
export function toEnginePlan(plan: PlaytimePlan): PlannedPlan {
  return { games: plan.games.map(toEngineGame), playerIds: plan.players.map((p) => p.id) };
}
