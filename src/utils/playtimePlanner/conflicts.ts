/**
 * Playing-Time Planner — simultaneity conflict detection.
 *
 * The planner allows a player to hold MANY positions across a game (rotations:
 * A and B trading one slot every 10 minutes, a starter re-entering elsewhere
 * after coming off). The one thing that can never be true on a real pitch is
 * the same player holding TWO slots during the same minutes. Instead of
 * blocking edits up front (the old bench-only picker), the planner now accepts
 * any schedule and FLAGS the impossible overlaps so the coach can fix the
 * minute or the player.
 *
 * Built on the same segment walk as the minutes engine, so "where is the
 * player at minute M" always agrees with the fairness math.
 */

import type { PlanGame } from './types';
import { gameTotalSeconds } from './types';
import { ensureStartingSlots } from './lineup';
import { computeSlotSegments, type PlannedGame, type SlotSegment } from './minutes';

/** One impossible overlap: `playerId` holds both slots during the window. */
export interface SimultaneityConflict {
  playerId: string;
  slotIdA: string;
  slotIdB: string;
  /** Overlapping window, seconds from kickoff. */
  overlapStartSeconds: number;
  overlapEndSeconds: number;
}

/** Adapt one UI game to the engine shape (mirrors adapter.toEnginePlan). */
const toEngineGame = (game: PlanGame): PlannedGame => ({
  id: game.id,
  totalSeconds: gameTotalSeconds(game),
  slots: ensureStartingSlots(game).map((s) => ({ slotId: s.slotId, startPlayerId: s.playerId })),
  subs: game.subs.map((s) => ({ slotId: s.slotId, timeSeconds: s.timeSeconds, inPlayerId: s.inPlayerId })),
  included: game.included,
  absentIds: game.absentIds,
});

/**
 * Find every window where a player is scheduled in two slots at once.
 * Pure and cheap (segments per slot are tiny), safe to run on every edit.
 */
export function findSimultaneityConflicts(game: PlanGame): SimultaneityConflict[] {
  const engineGame = toEngineGame(game);
  // Collect each player's occupancy segments across ALL slots.
  const byPlayer = new Map<string, SlotSegment[]>();
  for (const slot of engineGame.slots) {
    for (const seg of computeSlotSegments(engineGame, slot.slotId)) {
      if (seg.playerId === null) continue;
      const arr = byPlayer.get(seg.playerId) ?? [];
      arr.push(seg);
      byPlayer.set(seg.playerId, arr);
    }
  }

  const conflicts: SimultaneityConflict[] = [];
  for (const [playerId, segments] of byPlayer) {
    // Pairwise overlap across DIFFERENT slots (same-slot segments never overlap
    // by construction of the segment walk).
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const a = segments[i];
        const b = segments[j];
        if (a.slotId === b.slotId) continue;
        const start = Math.max(a.startSeconds, b.startSeconds);
        const end = Math.min(a.endSeconds, b.endSeconds);
        if (end > start) {
          conflicts.push({
            playerId,
            slotIdA: a.slotId,
            slotIdB: b.slotId,
            overlapStartSeconds: start,
            overlapEndSeconds: end,
          });
        }
      }
    }
  }
  return conflicts;
}

/** Ids of players with at least one simultaneity conflict in this game. */
export function conflictedPlayerIds(conflicts: SimultaneityConflict[]): Set<string> {
  return new Set(conflicts.map((c) => c.playerId));
}

/** Slot ids implicated in at least one conflict (for flagging discs/rows). */
export function conflictedSlotIds(conflicts: SimultaneityConflict[]): Set<string> {
  const ids = new Set<string>();
  conflicts.forEach((c) => {
    ids.add(c.slotIdA);
    ids.add(c.slotIdB);
  });
  return ids;
}
