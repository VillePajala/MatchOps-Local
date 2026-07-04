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
  /**
   * Planned incoming subs parked on the right sideline, lined up next to the slot
   * they will enter, so the coach can see who is waiting and where. The game merges
   * these into `playersOnField` (a sideline player, relX≈0.96, reads as a waiting
   * sub - desaturated with a target-position label - not an active field player).
   */
  sidelinePlayers: Player[];
  /** The plan's squad, limited to players that still exist in the game roster. */
  selectedPlayerIds: string[];
  /** Planned subs, each carrying the starter it replaces (outPlayerId). */
  plannedSubs: PlannedGameSub[];
  /** Planned player ids that aren't in the roster (so the UI can warn). */
  missingPlayerIds: string[];
}

/** Right-sideline X for a waiting sub (matches generateSubSlots' 0.96 in formations.ts). */
const SIDELINE_X = 0.96;
/** First (lowest) sideline disc, near the own-goal end; subsequent subs stack upward. */
const SIDELINE_START_Y = 0.88;
/** Vertical gap between sideline discs - wide enough that discs never overlap. */
const SIDELINE_GAP = 0.11;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

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
  // Track who currently occupies each slot, starting from the roster-valid starters.
  // Walking the subs in time order lets a second sub on the same slot correctly name
  // the *previous* incoming player (not the original starter) as its out-player.
  const occupantBySlot = new Map(
    starting
      .filter((a) => a.playerId && byId.has(a.playerId))
      .map((a) => [a.slotId, a.playerId as string]),
  );
  const plannedSubs: PlannedGameSub[] = planGame.subs
    // Skip subs with no incoming player, or an incoming player not in the roster -
    // there is no one to actually bring on. (Reported via missingPlayerIds below.)
    .filter(
      (sub): sub is typeof sub & { inPlayerId: string } =>
        sub.inPlayerId !== null && byId.has(sub.inPlayerId),
    )
    .sort((a, b) => a.timeSeconds - b.timeSeconds)
    .map((sub) => {
      const outPlayerId = occupantBySlot.get(sub.slotId) ?? null;
      occupantBySlot.set(sub.slotId, sub.inPlayerId); // incoming player now holds the slot
      return {
        id: sub.id,
        timeSeconds: sub.timeSeconds,
        slotId: sub.slotId,
        inPlayerId: sub.inPlayerId,
        outPlayerId,
      };
    });

  // Park each incoming sub as its own disc down the right sideline (relX 0.96 so it
  // reads as a sideline sub), so planned changes are visible from kickoff, not just
  // when the timer prompt fires. Each player waits once (their first sub); discs are
  // ordered by the slot they enter - own-goal end low, attack high - then spaced
  // evenly so they never overlap or stack. Starters are already on the field.
  const onFieldIds = new Set(playersOnField.map((p) => p.id));
  const seenSub = new Set<string>();
  const parked: { player: Player; targetRelY: number }[] = [];
  for (const sub of [...planGame.subs].sort((a, b) => a.timeSeconds - b.timeSeconds)) {
    if (!sub.inPlayerId) continue;
    const player = byId.get(sub.inPlayerId);
    if (!player) continue; // ghost incoming - surfaced via missingPlayerIds below
    if (onFieldIds.has(sub.inPlayerId) || seenSub.has(sub.inPlayerId)) continue;
    const slot = slotById.get(sub.slotId);
    if (!slot) continue;
    seenSub.add(sub.inPlayerId);
    parked.push({ player, targetRelY: slot.relY });
  }
  // Own-goal end (higher relY) first, so the sideline column mirrors the field.
  parked.sort((a, b) => b.targetRelY - a.targetRelY);
  const sidelinePlayers: Player[] = parked.map(({ player }, i) => ({
    ...player,
    relX: SIDELINE_X,
    relY: clamp(SIDELINE_START_Y - i * SIDELINE_GAP, 0.06, 0.94),
    isGoalie: false,
  }));

  // Every planned player the current roster can't resolve - squad members, starters,
  // and incoming subs alike - so the UI can warn about anyone silently dropped.
  const referenced = new Set<string>();
  for (const p of plan.players) referenced.add(p.id);
  for (const a of starting) if (a.playerId) referenced.add(a.playerId);
  for (const sub of planGame.subs) if (sub.inPlayerId) referenced.add(sub.inPlayerId);
  const missingPlayerIds = [...referenced].filter((id) => !byId.has(id));

  // Squad = the plan's players (roster-valid), unioned with everyone actually placed on
  // the field. Guarantees the app-wide invariant playersOnField ⊆ selectedPlayerIds
  // (CLAUDE.md Rule 3) even if a plan drifted (a slot starter dropped from plan.players).
  const selectedPlayerIds = [
    ...new Set([
      ...plan.players.map((p) => p.id).filter((id) => byId.has(id)),
      ...playersOnField.map((p) => p.id),
      ...sidelinePlayers.map((p) => p.id),
    ]),
  ];

  return { playersOnField, sidelinePlayers, selectedPlayerIds, plannedSubs, missingPlayerIds };
}
