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
