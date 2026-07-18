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

/**
 * The zone each specific position label (from `getPositionLabel`) belongs to.
 * Lets the UI colour a Detailed-view segment by its zone family while labelling
 * it by the exact role - RM and CDM are both mid, but distinct roles. Any label
 * not listed (should never happen for a formation slot) is treated as mid.
 */
export const POSITION_ZONE: Record<string, PlanZone> = {
  GK: 'gk',
  LB: 'def', CB: 'def', RB: 'def',
  LDM: 'mid', CDM: 'mid', RDM: 'mid',
  LM: 'mid', CM: 'mid', RM: 'mid',
  LAM: 'mid', CAM: 'mid', RAM: 'mid',
  LW: 'att', ST: 'att', RW: 'att',
};

export const zoneOfLabel = (label: string): PlanZone => POSITION_ZONE[label] ?? 'mid';

export interface PlayerPositions {
  playerId: string;
  /** Seconds spent in each zone across all INCLUDED games. */
  byZone: Record<PlanZone, number>;
  /** Seconds spent in each specific position (CB, RM, ST, …). */
  byLabel: Record<string, number>;
  /** Sum across zones (a player's total on-field seconds). */
  totalSeconds: number;
  /** How many distinct zones the player appears in (coarse variety). */
  zoneCount: number;
  /** How many distinct specific roles the player plays (role-switching load:
   *  RM vs CDM count separately even though both are the mid zone). */
  positionCount: number;
}

export interface PlanPositions {
  players: PlayerPositions[];
  includedGameCount: number;
}

const emptyZones = (): Record<PlanZone, number> => ({ gk: 0, def: 0, mid: 0, att: 0 });

/** One formation slot's zone AND specific label (GK fixed; the rest by coords). */
export function slotPosition(relX: number, relY: number, isGoalie: boolean): { zone: PlanZone; label: string } {
  if (isGoalie) return { zone: 'gk', label: 'GK' };
  const { label, zone } = getPositionLabel(relX, relY);
  // A formation slot is on the field, never a sideline sub; fold any unexpected
  // 'sub' classification into midfield so no time is silently dropped.
  const planZone: PlanZone = zone === 'gk' || zone === 'def' || zone === 'att' ? zone : 'mid';
  return { zone: planZone, label };
}

/** Map one formation slot to a plan zone (GK is fixed; the rest by coordinates). */
export function slotZone(relX: number, relY: number, isGoalie: boolean): PlanZone {
  return slotPosition(relX, relY, isGoalie).zone;
}

/**
 * Aggregate on-field seconds per player per zone AND per specific position
 * across a plan's INCLUDED games (matching the minutes fairness read, which
 * also counts only included games).
 */
export function computePlanPositions(plan: PlaytimePlan): PlanPositions {
  const zoneByPlayer = new Map<string, Record<PlanZone, number>>();
  const labelByPlayer = new Map<string, Record<string, number>>();
  for (const p of plan.players) {
    zoneByPlayer.set(p.id, emptyZones());
    labelByPlayer.set(p.id, {});
  }

  let includedGameCount = 0;
  for (const game of plan.games) {
    if (!game.included) continue;
    includedGameCount += 1;

    const posBySlot = new Map<string, { zone: PlanZone; label: string }>(
      getGameSlots(game.formationId).map((s) => [s.slotId, slotPosition(s.relX, s.relY, s.isGoalie)]),
    );
    const engineGame: PlannedGame = toEngineGame(game);

    for (const [slotId, pos] of posBySlot) {
      for (const seg of computeSlotSegments(engineGame, slotId)) {
        if (!seg.playerId) continue;
        const zoneRec = zoneByPlayer.get(seg.playerId);
        const labelRec = labelByPlayer.get(seg.playerId);
        if (!zoneRec || !labelRec) continue; // player not in the roster snapshot
        const secs = seg.endSeconds - seg.startSeconds;
        zoneRec[pos.zone] += secs;
        labelRec[pos.label] = (labelRec[pos.label] ?? 0) + secs;
      }
    }
  }

  const players: PlayerPositions[] = plan.players.map((p) => {
    const byZone = zoneByPlayer.get(p.id) ?? emptyZones();
    const byLabel = labelByPlayer.get(p.id) ?? {};
    const totalSeconds = PLAN_ZONES.reduce((sum, z) => sum + byZone[z], 0);
    const zoneCount = PLAN_ZONES.filter((z) => byZone[z] > 0).length;
    const positionCount = Object.values(byLabel).filter((s) => s > 0).length;
    return { playerId: p.id, byZone, byLabel, totalSeconds, zoneCount, positionCount };
  });

  return { players, includedGameCount };
}
