/**
 * The whole plan for one game, read position by position.
 *
 * THE THIRD VIEW. The field's plan toggle steps through how much of the plan a
 * coach wants on screen: the lineup alone (for showing the team), the lineup
 * plus ghost markers, and then this - every position with its full
 * substitution chain and the minute each change happens.
 *
 * This view stands alone rather than layering on the others. No ghosts, no
 * sideline discs, no opponents: eight positions and nothing else, which is the
 * only way the chains have room to be read. That emptiness is the feature, not
 * a shortcut.
 *
 * It deliberately borrows the planner's own idiom - a divided pill per
 * position, starter on top, each incoming player tagged with their minute - so
 * a coach reads one convention in both places instead of learning a second.
 *
 * Pure and presentational. Nothing here reads or writes storage, and nothing
 * follows the match clock: this is the plan as written, not the game as played.
 *
 * @module plannedChains
 * @category Utils
 */

import { isFieldPosition } from '@/utils/formations';
import { getPositionLabelForFormationPosition } from '@/utils/positionLabels';
import type { PlannedGameSub } from './gameSubs';
import type { Player, Point } from '@/types';

/** One planned change at a position: when, and who comes on. */
export interface PlannedChainEntry {
  /** Stable key - the planned sub it came from. */
  id: string;
  /** Whole minutes from kickoff, which is how a coach says it ("10'"). */
  minute: number;
  name: string;
}

/** One position's whole story: who starts it, and who follows. */
export interface PlannedChain {
  /** GK, LB, CDM ... - doubles as the pill's header tag. */
  positionLabel: string;
  relX: number;
  relY: number;
  /** Null when the plan leaves this position empty at kickoff. */
  starterName: string | null;
  /** Planned changes here, earliest first. Empty for a position nobody leaves. */
  entries: PlannedChainEntry[];
}

/**
 * How close a disc must be to a formation point to count as standing on it.
 * Discs are dragged by hand, so exact equality would fail the moment a coach
 * nudges someone a few pixels.
 */
const STARTER_TOLERANCE = 0.06;

/**
 * Build one chain per field position.
 *
 * Positions come from the game's own `formationSnapPoints`, so the view shows
 * the shape actually being played. Sideline slots are excluded - a waiting sub
 * is not a position, and this view hides the sideline entirely.
 *
 * A position with no planned changes still gets a chain: "nobody leaves this
 * spot" is information, and an eleven with holes in it would read as a bug.
 *
 * @param plannedSubs        the game's planned schedule (order irrelevant; sorted here)
 * @param formationSnapPoints the formation's field points, as stored on the game
 * @param players            everyone on the field, for starter names
 */
export function buildPlannedChains(
  plannedSubs: readonly PlannedGameSub[],
  formationSnapPoints: readonly Point[],
  players: readonly Player[],
): PlannedChain[] {
  if (formationSnapPoints.length === 0) return [];

  const displayName = (p: Player): string => p.nickname?.trim() || p.name;

  // Planned changes grouped by the position they happen at, earliest first.
  const byPosition = new Map<string, PlannedChainEntry[]>();
  const nameById = new Map(players.map((p) => [p.id, displayName(p)]));
  for (const sub of [...plannedSubs].sort((a, b) => a.timeSeconds - b.timeSeconds)) {
    if (!sub.positionLabel) continue;
    const name = nameById.get(sub.inPlayerId);
    if (!name) continue;
    const list = byPosition.get(sub.positionLabel) ?? [];
    list.push({ id: sub.id, minute: Math.round(sub.timeSeconds / 60), name });
    byPosition.set(sub.positionLabel, list);
  }

  const chains: PlannedChain[] = [];
  for (const point of formationSnapPoints) {
    if (!isFieldPosition(point)) continue;
    const positionLabel = getPositionLabelForFormationPosition(point.relX, point.relY).label;

    // Whoever is standing closest to this point, within a nudge's tolerance.
    // Nearest wins rather than first-match, so two points in the same row can
    // never claim the same disc.
    let starter: Player | null = null;
    let best = STARTER_TOLERANCE;
    for (const p of players) {
      if (typeof p.relX !== 'number' || typeof p.relY !== 'number') continue;
      const d = Math.hypot(p.relX - point.relX, p.relY - point.relY);
      if (d < best) {
        best = d;
        starter = p;
      }
    }

    chains.push({
      positionLabel,
      relX: point.relX,
      relY: point.relY,
      starterName: starter ? displayName(starter) : null,
      entries: byPosition.get(positionLabel) ?? [],
    });
  }

  return chains;
}
