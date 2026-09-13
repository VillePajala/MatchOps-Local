/**
 * Planned subs the field cannot otherwise show.
 *
 * THE PROBLEM. When a game is prefilled from a plan, each incoming sub is
 * parked on the sideline slot for the position they enter - which is why a
 * coach opening the field sees who is waiting and where. But a player waits
 * ONCE, at their first planned entry. A sub who comes on at RM, goes off, and
 * is planned to return at LM is parked at RM, and the LM entry appears nowhere
 * on the field. In junior football, where a coach shuffles positions freely,
 * that is most of the plan.
 *
 * THE ANSWER, and it is deliberately not a tracker. These are "ghosts": faint,
 * non-interactive markers at the sideline slot of every planned entry that no
 * real disc already represents. They say "this player also belongs here" and
 * nothing else - no minutes, no state, no reacting to what the coach actually
 * does. The app does not follow the match; it just stops forgetting the plan.
 *
 * Pure and presentational. Nothing here reads or writes storage.
 *
 * @module ghostSubs
 * @category Utils
 */

import type { SubSlot } from '@/utils/formations';
import type { PlannedGameSub } from './gameSubs';
import type { Player } from '@/types';

/** One faint marker: where it sits, and whose name it carries. */
export interface PlannedGhost {
  /** Stable key - the planned sub it came from. */
  id: string;
  relX: number;
  relY: number;
  /** Display name of the player planned to enter here. */
  name: string;
  /**
   * Where this player's REAL disc currently sits, when they have one.
   *
   * The same name appears twice on the field - solid where the player is
   * waiting, ghosted where the plan sends them next - and nothing tied the
   * two together. The field draws a thread between them; these are its far
   * end. Absent when the player is on neither the field nor the sideline
   * (nothing to draw a thread from).
   */
  fromRelX?: number;
  fromRelY?: number;
}

/**
 * Ghosts for planned entries with nobody standing at them.
 *
 * Skipped, and each for its own reason:
 * - a sub with no `positionLabel` (stored before that was carried), because
 *   guessing a position is worse than showing none;
 * - a sub whose player is unknown to the roster, because an unnamed ghost
 *   tells a coach nothing;
 * - a slot where a REAL disc already sits, because the disc says it better;
 * - a repeat of the same player at the same position, because one marker per
 *   place is the whole point.
 *
 * @param plannedSubs the game's planned schedule (order irrelevant; sorted here)
 * @param subSlots    the sideline slots the field already draws
 * @param players     every player on the field or sideline, for occupancy + names
 */
export function buildPlannedGhosts(
  plannedSubs: readonly PlannedGameSub[],
  subSlots: readonly SubSlot[],
  players: readonly Player[],
): PlannedGhost[] {
  if (plannedSubs.length === 0 || subSlots.length === 0) return [];

  const nameById = new Map(players.map((p) => [p.id, p.nickname?.trim() || p.name]));
  // Where each player's real disc is, for the thread back to it. Only placed
  // players have one; a player in the squad but not on the field or sideline
  // has no disc to connect to.
  const placedById = new Map(
    players
      .filter((p) => typeof p.relX === 'number' && typeof p.relY === 'number')
      .map((p) => [p.id, { relX: p.relX as number, relY: p.relY as number }]),
  );

  // A slot counts as occupied when a real disc is within half a slot's spacing
  // of it - discs are dragged by hand, so exact coordinate equality would fail
  // the moment a coach nudges someone.
  const spacing = subSlots.length > 1 ? Math.abs(subSlots[1].relY - subSlots[0].relY) : 0.1;
  const tolerance = Math.max(spacing / 2, 0.03);
  const isOccupied = (slot: SubSlot): boolean =>
    players.some(
      (p) =>
        typeof p.relX === 'number' &&
        typeof p.relY === 'number' &&
        Math.abs(p.relX - slot.relX) < tolerance &&
        Math.abs(p.relY - slot.relY) < tolerance,
    );

  const ghosts: PlannedGhost[] = [];
  const placed = new Set<string>();

  for (const sub of [...plannedSubs].sort((a, b) => a.timeSeconds - b.timeSeconds)) {
    if (!sub.positionLabel) continue;
    const name = nameById.get(sub.inPlayerId);
    if (!name) continue;

    const key = `${sub.inPlayerId}@${sub.positionLabel}`;
    if (placed.has(key)) continue;

    const slot = subSlots.find((ss) => ss.positionLabel === sub.positionLabel);
    if (!slot || isOccupied(slot)) continue;

    placed.add(key);
    const from = placedById.get(sub.inPlayerId);
    ghosts.push({
      id: sub.id,
      relX: slot.relX,
      relY: slot.relY,
      name,
      ...(from ? { fromRelX: from.relX, fromRelY: from.relY } : {}),
    });
  }

  return ghosts;
}
