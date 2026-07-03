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

import { getStorageJSON, setStorageJSON } from '@/utils/storage';
import { withKeyLock } from '@/utils/storageKeyLock';
import { PLAYTIME_GAME_SUBS_KEY } from '@/config/storageKeys';
import logger from '@/utils/logger';

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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isPlannedGameSub = (v: unknown): v is PlannedGameSub =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  typeof v.timeSeconds === 'number' &&
  typeof v.slotId === 'string' &&
  typeof v.inPlayerId === 'string' &&
  (v.outPlayerId === null || typeof v.outPlayerId === 'string');

const isGameSubsEntry = (v: unknown): v is PlannedGameSub[] =>
  Array.isArray(v) && v.every(isPlannedGameSub);

/**
 * Read the full collection, validating per entry (a corrupt entry is dropped, not
 * the whole map) — same tolerance as the plan store.
 */
const readCollection = async (): Promise<GameSubsCollection> => {
  try {
    const raw = await getStorageJSON<Record<string, unknown>>(PLAYTIME_GAME_SUBS_KEY, {
      defaultValue: {},
    });
    if (!raw || typeof raw !== 'object') return {};
    const valid: GameSubsCollection = {};
    for (const [gameId, subs] of Object.entries(raw)) {
      if (isGameSubsEntry(subs)) valid[gameId] = subs;
      else logger.warn(`[playtimePlanner] Dropping invalid planned subs for game "${gameId}"`);
    }
    return valid;
  } catch (error) {
    logger.error('[playtimePlanner] Failed to read planned game subs:', error);
    return {};
  }
};

/** Planned subs for one game ([] if none). */
export const getGameSubs = async (gameId: string): Promise<PlannedGameSub[]> => {
  const all = await readCollection();
  return all[gameId] ?? [];
};

/**
 * Store the planned subs for a game (overwrites). An empty array clears the entry
 * so the store doesn't accumulate empty keys. Returns true on success.
 */
export const setGameSubs = async (gameId: string, subs: PlannedGameSub[]): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_GAME_SUBS_KEY, async () => {
      const all = await readCollection();
      if (subs.length === 0) delete all[gameId];
      else all[gameId] = subs;
      await setStorageJSON(PLAYTIME_GAME_SUBS_KEY, all);
      return true;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to save planned game subs:', error);
    return false;
  }
};

/** Remove a game's planned subs (e.g. when the game is deleted). Returns true on success. */
export const deleteGameSubs = async (gameId: string): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_GAME_SUBS_KEY, async () => {
      const all = await readCollection();
      if (!(gameId in all)) return true;
      delete all[gameId];
      await setStorageJSON(PLAYTIME_GAME_SUBS_KEY, all);
      return true;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to delete planned game subs:', error);
    return false;
  }
};
