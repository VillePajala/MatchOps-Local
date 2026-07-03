/**
 * Playing-Time Planner Phase 2 — build a game prefill from a plan (PR 2.2).
 *
 * Pure translation from a planned game (formation slots + starting XI + subs) into
 * the shapes a real game needs: `playersOnField` positioned at the formation slots,
 * the `selectedPlayerIds` squad, and a `PlannedGameSub[]` schedule for the local
 * planned-sub store. No side effects — the wiring (modal + game creation) consumes
 * this, so what a coach sees on the field is exactly what these tests assert.
 */

import { getGameSlots, ensureStartingSlots } from './lineup';
import type { PlaytimePlan, PlanGame } from './types';
import type { PlannedGameSub } from './gameSubs';
import type { Player } from '@/types';

export interface PrefillResult {
  /** Planned starters placed at their formation slot coordinates (relX/relY 0..1). */
  playersOnField: Player[];
  /** The plan's squad, limited to players that still exist in the game roster. */
  selectedPlayerIds: string[];
  /** Planned subs, each carrying the starter it replaces (outPlayerId). */
  plannedSubs: PlannedGameSub[];
  /** Planned player ids that aren't in the roster (so the UI can warn). */
  missingPlayerIds: string[];
}

/**
 * Translate a planned game into a real game's initial lineup + sub schedule.
 * Players are matched to the roster by id (the planner stores master-roster ids).
 */
export function buildPrefillFromPlan(
  plan: PlaytimePlan,
  planGame: PlanGame,
  roster: Player[],
): PrefillResult {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const slotById = new Map(getGameSlots(planGame.formationId).map((s) => [s.slotId, s]));
  const starting = ensureStartingSlots(planGame);

  const playersOnField: Player[] = [];
  for (const assignment of starting) {
    if (!assignment.playerId) continue;
    const player = byId.get(assignment.playerId);
    if (!player) continue; // ghost starter skipped; surfaced via missingPlayerIds below
    const slot = slotById.get(assignment.slotId);
    if (!slot) continue;
    playersOnField.push({ ...player, relX: slot.relX, relY: slot.relY, isGoalie: slot.isGoalie });
  }

  // Out-player for a slot = its starter, but only if that starter is actually on the
  // field. A starter missing from the roster leaves the slot with no one to sub off.
  const starterBySlot = new Map(
    starting
      .filter((a) => a.playerId && byId.has(a.playerId))
      .map((a) => [a.slotId, a.playerId as string]),
  );
  const plannedSubs: PlannedGameSub[] = planGame.subs
    // Skip incomplete subs (no incoming player chosen) - nothing to prompt.
    .filter((sub): sub is typeof sub & { inPlayerId: string } => sub.inPlayerId !== null)
    .map((sub) => ({
      id: sub.id,
      timeSeconds: sub.timeSeconds,
      slotId: sub.slotId,
      inPlayerId: sub.inPlayerId,
      outPlayerId: starterBySlot.get(sub.slotId) ?? null,
    }));

  // Every planned player the current roster can't resolve - squad members, starters,
  // and incoming subs alike - so the UI can warn about anyone silently dropped.
  const referenced = new Set<string>();
  for (const p of plan.players) referenced.add(p.id);
  for (const a of starting) if (a.playerId) referenced.add(a.playerId);
  for (const sub of planGame.subs) if (sub.inPlayerId) referenced.add(sub.inPlayerId);
  const missingPlayerIds = [...referenced].filter((id) => !byId.has(id));

  const selectedPlayerIds = plan.players.map((p) => p.id).filter((id) => byId.has(id));

  return { playersOnField, selectedPlayerIds, plannedSubs, missingPlayerIds };
}
