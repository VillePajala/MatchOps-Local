/**
 * Playing-Time Planner Phase 2 — planned sub schedules for real games.
 *
 * When a game is created by prefilling from a plan (PR 2.2), the plan's sub
 * schedule for that game is copied here, keyed by the real game's id. The timer
 * (PR 2.3) reads it to surface "sub now" prompts.
 *
 * This is a DELIBERATE local-only store, kept separate from the game blob: it
 * never touches the DataStore/cloud transforms (the risky area), and it survives a
 * cloud pull that replaces the game blob. The planned XI itself rides the game's
 * existing `playersOnField`/`selectedPlayerIds` — only the reminder schedule lives
 * here. Cloud sync of these reminders is deferred (see the Phase 2 plan doc).
 */

import { getDataStore } from '@/datastore/factory';
import { occupantsByPosition } from './plannedChains';
import type { Player, Point } from '@/types';

/** One planned substitution copied onto a real game. */
export interface PlannedGameSub {
  id: string;
  /** Seconds from kickoff when the swap is planned. */
  timeSeconds: number;
  /** The formation slot the swap targets. */
  slotId: string;
  /** Who comes on. */
  inPlayerId: string;
  /** Who comes off (best-effort from the plan; null if unknown). Reality wins. */
  outPlayerId: string | null;
  /**
   * The position this sub enters, as a label ("RM", "CDM").
   *
   * Resolved at PREFILL time and carried here on purpose: a live game persists
   * only `formationSnapPoints` - coordinates, no slot ids - so `slotId` cannot
   * be turned back into a position once the game exists. Without this the field
   * knows a sub is planned but not where, which is exactly what it could not
   * show.
   *
   * Optional: subs stored before this existed simply have no position, and
   * every consumer treats that as "unknown" rather than guessing.
   */
  positionLabel?: string;
}

/** Stored shape: map of real game id -> its planned subs. */
export type GameSubsCollection = Record<string, PlannedGameSub[]>;

/** Planned subs for one game ([] if none). */
export const getGameSubs = async (gameId: string): Promise<PlannedGameSub[]> =>
  (await getDataStore()).getPlaytimeGameSubs(gameId);

/**
 * Store the planned subs for a game (overwrites). An empty array clears the entry
 * so the store doesn't accumulate empty keys. Returns true on success.
 */
export const setGameSubs = async (gameId: string, subs: PlannedGameSub[]): Promise<boolean> =>
  (await getDataStore()).setPlaytimeGameSubs(gameId, subs);

/** Remove a game's planned subs (e.g. when the game is deleted). Returns true on success. */
export const deleteGameSubs = async (gameId: string): Promise<boolean> =>
  (await getDataStore()).deletePlaytimeGameSubs(gameId);

/** When a field change happens, as far as the plan is concerned. */
export interface FieldChangeMoment {
  /** The match clock. Only changes still ahead of it are re-pointed. */
  elapsedSeconds: number;
  /** True until kick-off (clock at 0, game not started). */
  beforeKickoff: boolean;
}

/**
 * The plan follows the PLAYERS when the coach moves them on the match field
 * (owner decision A). Pure: the planned schedule after the field went from
 * `before` to `after`; the same array back when nothing changes.
 *
 * - Two field players trade places (or one moves to an empty position): each
 *   position's planned changes still ahead of the clock go with the player who
 *   stood there. "On Sampo, off Jim at 10'" planned at LM happens at RM once
 *   Jim stands at RM. Only positions change - who comes on and off, the
 *   minutes and every planned total stay as they were. A position left behind
 *   takes the changes of the one moved into (an empty position's changes move
 *   to the place its new occupant came from), so every change keeps a home
 *   and nobody is planned in two places.
 * - Before kick-off, a bench player put in a field player's place (the field
 *   player goes to the bench) swaps roles with them in the plan: the newcomer
 *   takes over the field player's planned changes and the field player takes
 *   over the newcomer's (e.g. coming on at 10'). Planned minutes swap between
 *   the two; nobody is double-booked. After kick-off the same move is a real
 *   substitution (often the planned one, made early) and the plan is left
 *   alone - the timer keeps naming the planned change.
 *
 * Undo is the same rule run backwards: undoing a move is a move back, which
 * re-points the changes back.
 *
 * Positions are read the way the chain view reads them (`occupantsByPosition`);
 * a position whose label repeats in the formation is ambiguous and left alone.
 */
export function followPlayersOnField(
  subs: PlannedGameSub[],
  before: readonly Player[],
  after: readonly Player[],
  formationSnapPoints: readonly Point[],
  moment: FieldChangeMoment,
): PlannedGameSub[] {
  if (subs.length === 0) return subs;
  const ahead = (s: PlannedGameSub) => moment.beforeKickoff || s.timeSeconds > moment.elapsedSeconds;

  const read = (players: readonly Player[]) => {
    const occupants = occupantsByPosition(formationSnapPoints, players);
    const count = new Map<string, number>();
    occupants.forEach((o) => count.set(o.positionLabel, (count.get(o.positionLabel) ?? 0) + 1));
    const playerAt = new Map<string, string | null>();
    const labelOf = new Map<string, string>();
    for (const o of occupants) {
      if (count.get(o.positionLabel)! > 1) continue;
      playerAt.set(o.positionLabel, o.player?.id ?? null);
      if (o.player) labelOf.set(o.player.id, o.positionLabel);
    }
    return { playerAt, labelOf };
  };
  const was = read(before);
  const now = read(after);

  // 1. Positions: a player standing somewhere else takes their position's changes along.
  const dest = new Map<string, string>();
  for (const [id, from] of was.labelOf) {
    const to = now.labelOf.get(id);
    if (to && to !== from) dest.set(from, to);
  }
  const targets = new Set(dest.values());
  // A position moved INTO whose own changes have nowhere to go yet takes the
  // place left behind (in formation order, so the pairing is deterministic).
  const homeless = [...was.playerAt.keys()].filter((l) => targets.has(l) && !dest.has(l));
  const vacated = [...was.playerAt.keys()].filter((l) => dest.has(l) && !targets.has(l));
  homeless.forEach((l, i) => {
    if (vacated[i]) dest.set(l, vacated[i]);
  });

  // 2. Before kick-off: a bench player in a field player's place swaps roles with them.
  const roleSwaps = new Map<string, string>();
  if (moment.beforeKickoff) {
    const sourceOf = new Map([...dest].map(([from, to]) => [to, from] as const));
    for (const [label, incoming] of now.playerAt) {
      if (!incoming || was.labelOf.has(incoming)) continue; // not new to the field
      const outgoing = was.playerAt.get(sourceOf.get(label) ?? label);
      if (!outgoing || now.labelOf.has(outgoing) || roleSwaps.has(outgoing)) continue; // still on
      roleSwaps.set(outgoing, incoming);
      roleSwaps.set(incoming, outgoing);
    }
  }

  if (dest.size === 0 && roleSwaps.size === 0) return subs;
  const slotIdOf = new Map<string, string>();
  for (const s of subs) if (s.positionLabel && !slotIdOf.has(s.positionLabel)) slotIdOf.set(s.positionLabel, s.slotId);
  const swapRole = (id: string) => roleSwaps.get(id) ?? id;

  let changed = false;
  const next = subs.map((s) => {
    if (!ahead(s)) return s;
    const to = s.positionLabel ? dest.get(s.positionLabel) : undefined;
    const inPlayerId = swapRole(s.inPlayerId);
    const outPlayerId = s.outPlayerId === null ? null : swapRole(s.outPlayerId);
    if (!to && inPlayerId === s.inPlayerId && outPlayerId === s.outPlayerId) return s;
    changed = true;
    return {
      ...s,
      inPlayerId,
      outPlayerId,
      ...(to ? { positionLabel: to, slotId: slotIdOf.get(to) ?? s.slotId } : {}),
    };
  });
  return changed ? next : subs;
}
