/**
 * Playing-Time Planner — per-game lineup helpers (Phase 1, PR 1.3).
 *
 * Turns a game's formation into concrete on-field slots and manages the starting
 * assignment of roster players to those slots. Pure and UI-agnostic so the field
 * view and its tests share exactly one source of truth for slot geometry and the
 * "a player can only hold one slot" rule.
 *
 * Slot ids are stable within a game: `gk` for the goalkeeper, `s0..sN-1` for the
 * formation's field positions in preset order. These are the same ids the minutes
 * engine (`minutes.ts`) reads via `startingSlots`/`subs`.
 */

import { getPresetById } from '@/config/formationPresets';
import type { PlanGame, PlanSlotAssignment } from './types';

/** Goalkeeper placement on the field (near own goal), relX/relY in [0,1]. */
export const GK_SLOT = { relX: 0.5, relY: 0.92 } as const;

/** A concrete on-field slot: an id plus where its disc sits on the pitch. */
export interface FieldSlot {
  slotId: string;
  relX: number;
  relY: number;
  isGoalie: boolean;
}

/**
 * The on-field slots for a game's formation: goalkeeper first, then the
 * formation preset's field positions. An unknown/empty formation yields just
 * the goalkeeper slot.
 */
export function getGameSlots(formationId: string): FieldSlot[] {
  const slots: FieldSlot[] = [
    { slotId: 'gk', relX: GK_SLOT.relX, relY: GK_SLOT.relY, isGoalie: true },
  ];
  const preset = getPresetById(formationId);
  if (preset) {
    preset.positions.forEach((pos, i) => {
      slots.push({ slotId: `s${i}`, relX: pos.relX, relY: pos.relY, isGoalie: false });
    });
  }
  return slots;
}

/**
 * Align a game's stored `startingSlots` to its formation's slots: one entry per
 * slot, preserving existing assignments by slotId and filling the rest with null.
 * Drops stale entries whose slot no longer exists (e.g. after a formation change).
 */
export function ensureStartingSlots(game: PlanGame): PlanSlotAssignment[] {
  const byId = new Map(game.startingSlots.map((s) => [s.slotId, s.playerId]));
  return getGameSlots(game.formationId).map((slot) => ({
    slotId: slot.slotId,
    playerId: byId.get(slot.slotId) ?? null,
  }));
}

/**
 * Assign a player to a slot (or clear it with `null`). A player can only hold one
 * slot per game, so assigning them somewhere new vacates any slot they held.
 */
export function assignPlayerToSlot(
  slots: PlanSlotAssignment[],
  slotId: string,
  playerId: string | null,
): PlanSlotAssignment[] {
  return slots.map((s) => {
    if (s.slotId === slotId) return { ...s, playerId };
    if (playerId !== null && s.playerId === playerId) return { ...s, playerId: null };
    return s;
  });
}

/**
 * Empty ONE position completely: its kickoff starter AND every sub scheduled
 * into it ("empty a field" - the per-slot Clear).
 */
export function clearSlotSchedule(
  game: PlanGame,
  slotId: string,
): Pick<PlanGame, 'startingSlots' | 'subs'> {
  return {
    startingSlots: ensureStartingSlots(game).map((s) =>
      s.slotId === slotId ? { ...s, playerId: null } : s,
    ),
    subs: game.subs.filter((s) => s.slotId !== slotId),
  };
}

/** Empty EVERY position: all starters and the whole sub schedule. */
export function clearAllPlacements(game: PlanGame): Pick<PlanGame, 'startingSlots' | 'subs'> {
  return {
    startingSlots: ensureStartingSlots(game).map((s) => ({ ...s, playerId: null })),
    subs: [],
  };
}

/** Player ids from the roster not currently holding a slot in this lineup. */
export function benchPlayerIds(
  rosterIds: string[],
  slots: PlanSlotAssignment[],
): string[] {
  const assigned = new Set(
    slots.map((s) => s.playerId).filter((id): id is string => id !== null),
  );
  return rosterIds.filter((id) => !assigned.has(id));
}
