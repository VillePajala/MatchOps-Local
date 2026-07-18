/**
 * Playing-Time Planner — position (zone) distribution across a plan.
 *
 * The planner already stores everything needed to know WHICH positions a player
 * plays; it just never aggregated it. Each formation slot has field coordinates
 * (`getGameSlots`), those map to a zone (GK/DEF/MID/ATT) via `positionLabels`,
 * and the minutes engine already resolves who holds each slot for how long
 * (subs included) as slot segments. Joining the two gives position-time per
 * player with NO new stored data — the sibling of `minutes.ts`.
 */

import { computeSlotSegments, type PlannedGame } from './minutes';
import { toEngineGame } from './adapter';
import { getGameSlots } from './lineup';
import { getPositionLabel } from '@/utils/positionLabels';
import type { PlaytimePlan } from './types';

/** On-field zones time is distributed across (formation slots are never subs). */
export type PlanZone = 'gk' | 'def' | 'mid' | 'att';
export const PLAN_ZONES: readonly PlanZone[] = ['gk', 'def', 'mid', 'att'] as const;

export interface PlayerPositions {
  playerId: string;
  /** Seconds spent in each zone across all INCLUDED games. */
  byZone: Record<PlanZone, number>;
  /** Sum across zones (a player's total on-field seconds). */
  totalSeconds: number;
  /** How many distinct zones the player appears in (position variety). */
  zoneCount: number;
}

export interface PlanPositions {
  players: PlayerPositions[];
  includedGameCount: number;
}

const emptyZones = (): Record<PlanZone, number> => ({ gk: 0, def: 0, mid: 0, att: 0 });

/** Map one formation slot to a plan zone (GK is fixed; the rest by coordinates). */
export function slotZone(relX: number, relY: number, isGoalie: boolean): PlanZone {
  if (isGoalie) return 'gk';
  const zone = getPositionLabel(relX, relY).zone;
  // A formation slot is on the field, never a sideline sub; fold any unexpected
  // 'sub' classification into midfield so no time is silently dropped.
  return zone === 'gk' || zone === 'def' || zone === 'att' ? zone : 'mid';
}

/**
 * Aggregate on-field seconds per player per zone across a plan's INCLUDED games
 * (matching the minutes fairness read, which also counts only included games).
 */
export function computePlanPositions(plan: PlaytimePlan): PlanPositions {
  const byPlayer = new Map<string, Record<PlanZone, number>>();
  for (const p of plan.players) byPlayer.set(p.id, emptyZones());

  let includedGameCount = 0;
  for (const game of plan.games) {
    if (!game.included) continue;
    includedGameCount += 1;

    const zoneBySlot = new Map<string, PlanZone>(
      getGameSlots(game.formationId).map((s) => [s.slotId, slotZone(s.relX, s.relY, s.isGoalie)]),
    );
    const engineGame: PlannedGame = toEngineGame(game);

    for (const [slotId, zone] of zoneBySlot) {
      for (const seg of computeSlotSegments(engineGame, slotId)) {
        if (!seg.playerId) continue;
        const rec = byPlayer.get(seg.playerId);
        if (!rec) continue; // segment player not in the plan's roster snapshot
        rec[zone] += seg.endSeconds - seg.startSeconds;
      }
    }
  }

  const players: PlayerPositions[] = plan.players.map((p) => {
    const byZone = byPlayer.get(p.id) ?? emptyZones();
    const totalSeconds = PLAN_ZONES.reduce((sum, z) => sum + byZone[z], 0);
    const zoneCount = PLAN_ZONES.filter((z) => byZone[z] > 0).length;
    return { playerId: p.id, byZone, totalSeconds, zoneCount };
  });

  return { players, includedGameCount };
}
