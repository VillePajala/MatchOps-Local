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
