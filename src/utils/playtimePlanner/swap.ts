/**
 * Playing-Time Planner — whole-game player swap.
 *
 * "Swap Timo and Tapio" trades the two players' ENTIRE timelines within one
 * game: every kickoff slot and every substitution row that names either player
 * swaps to the other. Nothing else about the schedule (slots, minutes, order)
 * moves. This is the one-action fix for re-casting roles that previously took
 * hand-editing the lineup and each sub row separately:
 *
 *   Timo starts #7, Sauli subs in at 25'; Tapio plays AM all game.
 *   swap(Timo, Tapio)  -> Tapio starts #7 (out at 25'), Timo plays AM all game.
 *   swap(Sauli, Tapio) -> Tapio subs in at 25', Sauli plays AM all game.
 *
 * Swapping with a player who appears nowhere in the game degrades to
 * "replace A with B everywhere" (A ends up unplaced) - intentionally useful.
 * The operation is a permutation of ids, so it can never create a duplicate
 * starting assignment.
 */

import type { PlanGame } from './types';
import { ensureStartingSlots } from './lineup';

/** Swap every appearance of two players within one game (pure). */
export function swapPlayersInGame(game: PlanGame, aId: string, bId: string): PlanGame {
  if (aId === bId) return game;
  const swap = (id: string | null): string | null =>
    id === aId ? bId : id === bId ? aId : id;
  return {
    ...game,
    startingSlots: ensureStartingSlots(game).map((s) => ({ ...s, playerId: swap(s.playerId) })),
    subs: game.subs.map((s) => ({ ...s, inPlayerId: swap(s.inPlayerId) })),
  };
}

/** A player's stint in one slot's timeline (kickoff starter has fromSeconds 0). */
export interface SlotTimelineEntry {
  playerId: string;
  fromSeconds: number;
}

/**
 * The players who hold `slotId` over the game, in time order: the kickoff
 * starter (if any) followed by each sub's incoming player. Drives the swap
 * sheet's "which player of this position?" picker - a slot with a planned
 * rotation contains several identities, and the swap must know WHICH one the
 * coach means (e.g. the starter Timo vs the 25' incomer Sauli).
 */
export function slotTimelinePlayers(game: PlanGame, slotId: string): SlotTimelineEntry[] {
  const entries: SlotTimelineEntry[] = [];
  // One entry per IDENTITY, not per stint: an A-B-A-B rotation holds each
  // player several times, but the swap picker needs each name once (first
  // appearance wins for the minute tag).
  const seen = new Set<string>();
  const push = (playerId: string, fromSeconds: number) => {
    if (seen.has(playerId)) return;
    seen.add(playerId);
    entries.push({ playerId, fromSeconds });
  };
  const starter = ensureStartingSlots(game).find((s) => s.slotId === slotId)?.playerId ?? null;
  if (starter) push(starter, 0);
  [...game.subs]
    .filter((s) => s.slotId === slotId && s.inPlayerId !== null)
    .sort((a, b) => a.timeSeconds - b.timeSeconds)
    .forEach((s) => push(s.inPlayerId as string, s.timeSeconds));
  return entries;
}
