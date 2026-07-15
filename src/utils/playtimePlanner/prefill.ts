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
import { normalizePlanAbsences } from './roster';
import { generateSubSlots, isFieldPosition } from '@/utils/formations';
import { getPositionLabelForFormationPosition } from '@/utils/positionLabels';
import type { PlaytimePlan, PlanGame } from './types';
import type { PlannedGameSub } from './gameSubs';
import type { Player, Point } from '@/types';

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
  /**
   * The formation's field positions, stored on the game so it regenerates the
   * dotted sub-slot circles and the on-field position labels (the app rebuilds
   * both from `formationSnapPoints` on load - without these a prefilled game has
   * neither). Matches what a manually-placed game persists.
   */
  formationSnapPoints: Point[];
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
  // Self-heal stale absences the same way the planner modal does on load
  // ("placement wins"): a legacy/imported plan listing a player as both
  // starting and absent must not prefill contradictory state. This engine is
  // also called from NewGameSetupModal and reapply, which have no other
  // normalization step. No-op (same refs) when the plan is already clean.
  const normalized = normalizePlanAbsences(plan);
  const normalizedGame = normalized.games.find((g) => g.id === planGame.id) ?? planGame;
  plan = normalized;
  planGame = normalizedGame;

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
  // Rotations are first-class: a player may enter MANY times (A-B-A-B trading
  // a slot, a starter re-entering after coming off), so every sub row carries
  // to the real game. The only row dropped is a same-slot self-sub (bringing a
  // player in for themselves - a no-op the planner UI also prevents). A player
  // simultaneously in two slots is a planner-flagged conflict; prefill
  // translates the schedule faithfully rather than silently editing it.
  const plannedSubs: PlannedGameSub[] = [];
  for (const sub of [...planGame.subs].sort((a, b) => a.timeSeconds - b.timeSeconds)) {
    // Skip subs with no incoming player, or an incoming player not in the roster -
    // there is no one to actually bring on. (Reported via missingPlayerIds below.)
    if (sub.inPlayerId === null || !byId.has(sub.inPlayerId)) continue;
    if (occupantBySlot.get(sub.slotId) === sub.inPlayerId) continue;
    const outPlayerId = occupantBySlot.get(sub.slotId) ?? null;
    occupantBySlot.set(sub.slotId, sub.inPlayerId); // incoming player now holds the slot
    plannedSubs.push({
      id: sub.id,
      timeSeconds: sub.timeSeconds,
      slotId: sub.slotId,
      inPlayerId: sub.inPlayerId,
      outPlayerId,
    });
  }

  // Formation field positions the created game stores, so it rebuilds the dotted
  // sub-slot circles + on-field position labels on load (same as a placed game).
  const formationSnapPoints: Point[] = getGameSlots(planGame.formationId).map((s) => ({
    relX: s.relX,
    relY: s.relY,
  }));
  // Shared load-time filter (drop GK and sideline) before building the sub
  // slots, so the coordinates we park subs onto line up exactly with the ones
  // the game will regenerate.
  const fieldPositions = formationSnapPoints.filter(isFieldPosition);
  const subSlots = generateSubSlots(fieldPositions);

  // Park each incoming sub in the labelled sub-slot for the position they enter, so
  // they land in the correct dotted circle. Same-position subs take the next free
  // matching slot; anything unmatched falls back to an evenly-spaced sideline column.
  // Each player waits once (their first sub); starters are already on the field.
  const onFieldIds = new Set(playersOnField.map((p) => p.id));
  const seenSub = new Set<string>();
  const usedSlots = new Set<number>();
  const sidelinePlayers: Player[] = [];
  let fallbackIdx = 0;
  for (const sub of [...planGame.subs].sort((a, b) => a.timeSeconds - b.timeSeconds)) {
    if (!sub.inPlayerId) continue;
    const player = byId.get(sub.inPlayerId);
    if (!player) continue; // ghost incoming - surfaced via missingPlayerIds below
    if (onFieldIds.has(sub.inPlayerId) || seenSub.has(sub.inPlayerId)) continue;
    const slot = slotById.get(sub.slotId);
    if (!slot) continue;
    seenSub.add(sub.inPlayerId);

    const targetLabel = getPositionLabelForFormationPosition(slot.relX, slot.relY).label;
    let idx = subSlots.findIndex((ss, i) => !usedSlots.has(i) && ss.positionLabel === targetLabel);
    if (idx < 0) idx = subSlots.findIndex((_ss, i) => !usedSlots.has(i));
    if (idx >= 0) {
      usedSlots.add(idx);
      sidelinePlayers.push({ ...player, relX: subSlots[idx].relX, relY: subSlots[idx].relY, isGoalie: false });
    } else {
      sidelinePlayers.push({
        ...player,
        relX: SIDELINE_X,
        relY: clamp(SIDELINE_START_Y - fallbackIdx * SIDELINE_GAP, 0.06, 0.94),
        isGoalie: false,
      });
      fallbackIdx += 1;
    }
  }

  // Every planned player the current roster can't resolve - squad members, starters,
  // and incoming subs alike - so the UI can warn about anyone silently dropped.
  const referenced = new Set<string>();
  for (const p of plan.players) referenced.add(p.id);
  for (const a of starting) if (a.playerId) referenced.add(a.playerId);
  for (const sub of planGame.subs) if (sub.inPlayerId) referenced.add(sub.inPlayerId);
  const missingPlayerIds = [...referenced].filter((id) => !byId.has(id));

  // Squad = the plan's players (roster-valid), MINUS anyone marked absent for
  // this game (they are not coming - selecting them would lie to game day),
  // unioned with everyone actually placed on the field. Guarantees the
  // app-wide invariant playersOnField ⊆ selectedPlayerIds (CLAUDE.md Rule 3)
  // even if a plan drifted (a slot starter dropped from plan.players).
  const absent = new Set(planGame.absentIds ?? []);
  const selectedPlayerIds = [
    ...new Set([
      ...plan.players.map((p) => p.id).filter((id) => byId.has(id) && !absent.has(id)),
      ...playersOnField.map((p) => p.id),
      ...sidelinePlayers.map((p) => p.id),
    ]),
  ];

  return {
    playersOnField,
    sidelinePlayers,
    selectedPlayerIds,
    plannedSubs,
    formationSnapPoints,
    missingPlayerIds,
  };
}
