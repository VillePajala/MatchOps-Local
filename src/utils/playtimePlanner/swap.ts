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
import { assignPlayerToSlot, ensureStartingSlots } from './lineup';
import { toEngineGame } from './adapter';
import { computeSlotSegments } from './minutes';
import { generateSubId } from './subs';

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

/**
 * Put a player into a position at kickoff (tap a position, then a player) so
 * that NO player is ever in two slots at once (review R13, live repro: tap the
 * starter Otso, then the bench player Aatos who comes on at 15' -> Aatos was
 * left both starting in #1 and coming on in #5).
 *
 * - A position someone holds: the two players swap their whole games
 *   (swapPlayersInGame), so the placed player's planned changes go with the
 *   player they replace and nothing overlaps.
 * - An empty position: the player starts there. Any planned change that would
 *   bring them on elsewhere while they are still on the pitch here is dropped
 *   (whoever was there stays on); a later return after they come off is kept.
 * - `null` clears the position.
 */
export function placePlayerInSlot(game: PlanGame, slotId: string, playerId: string | null): PlanGame {
  const slots = ensureStartingSlots(game);
  const occupant = slots.find((s) => s.slotId === slotId)?.playerId ?? null;
  if (playerId === null) return { ...game, startingSlots: assignPlayerToSlot(slots, slotId, null) };
  if (occupant === playerId) return game;
  if (occupant) return swapPlayersInGame(game, occupant, playerId);
  return withoutOverlaps({ ...game, startingSlots: assignPlayerToSlot(slots, slotId, playerId) }, playerId);
}

/** Drop the planned changes that would put `playerId` on in two slots at once. */
function withoutOverlaps(game: PlanGame, playerId: string): PlanGame {
  let current = game;
  // Each pass removes one sub row, so this ends within subs.length passes.
  for (let pass = 0; pass <= game.subs.length; pass++) {
    const engine = toEngineGame(current);
    const own = engine.slots
      .flatMap((slot) => computeSlotSegments(engine, slot.slotId))
      .filter((seg) => seg.playerId === playerId)
      .sort((a, b) => a.startSeconds - b.startSeconds);
    const clash = own.find((seg, i) => i > 0 && own.slice(0, i).some((prev) => seg.startSeconds < prev.endSeconds));
    if (!clash) return current;
    const row = current.subs.find(
      (s) => s.slotId === clash.slotId && s.inPlayerId === playerId && s.timeSeconds === clash.startSeconds,
    );
    if (!row) return current; // not something a sub row did - leave it to the conflict banner
    current = { ...current, subs: current.subs.filter((s) => s.id !== row.id) };
  }
  return current;
}

/**
 * Give one planned stint (a sub row: "at T, `playerId` comes into this slot")
 * to ANY player - a true bench player, or someone already in this game (a
 * starter re-entering after coming off, or a player moving position). Unlike
 * swapPlayersInGame nothing else about either player's game changes.
 *
 * A player cannot be in two slots at once, so when the new player is still ON
 * in another position at T, they MOVE: their stint there ends at T. Whoever
 * the stint used to bring on takes the vacated position at T instead (the
 * planned incomer still comes on, just one position over - the team keeps its
 * numbers and nobody's planned minutes silently vanish). A stint that brought
 * nobody on leaves the vacated position open ("?") for the coach to fill.
 *
 * A clash that starts LATER (the player is due on elsewhere while still here)
 * is not a move at T; it is left to the conflict banner (conflicts.ts).
 */
export function giveStintToPlayer(game: PlanGame, subId: string, playerId: string): PlanGame {
  const stint = game.subs.find((s) => s.id === subId);
  if (!stint || stint.inPlayerId === playerId) return game;
  const at = stint.timeSeconds;
  const next: PlanGame = {
    ...game,
    subs: game.subs.map((s) => (s.id === subId ? { ...s, inPlayerId: playerId } : s)),
  };
  const engine = toEngineGame(next);
  const onElsewhere = engine.slots
    .filter((slot) => slot.slotId !== stint.slotId)
    .flatMap((slot) => computeSlotSegments(engine, slot.slotId))
    .find((seg) => seg.playerId === playerId && seg.startSeconds < at && at < seg.endSeconds);
  if (!onElsewhere) return next;
  return {
    ...next,
    subs: [
      ...next.subs,
      { id: generateSubId(), slotId: onElsewhere.slotId, timeSeconds: at, inPlayerId: stint.inPlayerId },
    ],
  };
}
