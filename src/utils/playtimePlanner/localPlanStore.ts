/**
 * Playing-Time Planner — the LOCAL (IndexedDB) backend for plans, plan links
 * and planned game subs.
 *
 * This is the raw key-locked storage layer that used to live inside
 * storage.ts / planLinks.ts / gameSubs.ts. Those modules are now thin shims
 * over the mode-aware DataStore (cloud sync PR 3); THIS module is imported by
 * exactly one runtime consumer - LocalDataStore - which is what keeps the
 * import graph acyclic (shims -> factory -> LocalDataStore -> here).
 */

import { getStorageJSON, setStorageJSON } from '@/utils/storage';
import { withKeyLock } from '@/utils/storageKeyLock';
import {
  PLAYTIME_PLANS_KEY,
  PLAYTIME_PLAN_LINKS_KEY,
  PLAYTIME_GAME_SUBS_KEY,
} from '@/config/storageKeys';
import logger from '@/utils/logger';
import {
  PLAYTIME_PLAN_SCHEMA_VERSION,
  isPlaytimePlan,
  type PlaytimePlan,
  type PlaytimePlanCollection,
} from './types';
import type { PlanLink, PlanLinksCollection } from './planLinks';
import type { PlannedGameSub, GameSubsCollection } from './gameSubs';

// ── Plans ───────────────────────────────────────────────────────────────────

/**
 * Read the full plan collection from storage. Validates **per entry** and keeps
 * the valid plans, dropping only a malformed/incompatible one - so a single bad
 * entry can never wipe out every other plan in the collection.
 */
export const getPlans = async (): Promise<PlaytimePlanCollection> => {
  try {
    const raw = await getStorageJSON<Record<string, unknown>>(PLAYTIME_PLANS_KEY, {
      defaultValue: {},
    });
    if (!raw || typeof raw !== 'object') return {};
    const valid: PlaytimePlanCollection = {};
    for (const [id, plan] of Object.entries(raw)) {
      if (isPlaytimePlan(plan)) valid[id] = plan;
      else logger.warn(`[playtimePlanner] Dropping invalid stored plan "${id}"`);
    }
    return valid;
  } catch (error) {
    logger.error('[playtimePlanner] Failed to read plans:', error);
    return {};
  }
};

/**
 * Upsert a plan. Stamps `updatedAt` and the current schema version, then writes
 * the whole collection back. Returns the saved plan, or null on failure.
 */
export const savePlan = async (plan: PlaytimePlan): Promise<PlaytimePlan | null> => {
  try {
    // Serialize the read-modify-write so concurrent autosaves (e.g. fast typing)
    // can't clobber each other or drop a sibling plan from the collection.
    return await withKeyLock(PLAYTIME_PLANS_KEY, async () => {
      const plans = await getPlans();
      const stamped: PlaytimePlan = {
        ...plan,
        version: PLAYTIME_PLAN_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
      };
      plans[plan.id] = stamped;
      await setStorageJSON(PLAYTIME_PLANS_KEY, plans);
      return stamped;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to save plan:', error);
    return null;
  }
};

/** Delete a plan by id. Returns true if the write succeeded. */
export const deletePlan = async (id: string): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_PLANS_KEY, async () => {
      const plans = await getPlans();
      if (!(id in plans)) return true;
      delete plans[id];
      await setStorageJSON(PLAYTIME_PLANS_KEY, plans);
      return true;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to delete plan:', error);
    return false;
  }
};

// ── Plan links (real game -> plan/planned-game) ────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isPlanLink = (v: unknown): v is PlanLink =>
  isRecord(v) && typeof v.planId === 'string' && typeof v.planGameId === 'string';

/**
 * Read the full collection, validating per entry (a corrupt entry is dropped,
 * not the whole map) - same tolerance as the plan + sub stores.
 */
const readLinksCollection = async (): Promise<PlanLinksCollection> => {
  try {
    const raw = await getStorageJSON<Record<string, unknown>>(PLAYTIME_PLAN_LINKS_KEY, {
      defaultValue: {},
    });
    if (!raw || typeof raw !== 'object') return {};
    const valid: PlanLinksCollection = {};
    for (const [gameId, link] of Object.entries(raw)) {
      if (isPlanLink(link)) valid[gameId] = link;
      else logger.warn(`[playtimePlanner] Dropping invalid plan link for game "${gameId}"`);
    }
    return valid;
  } catch (error) {
    logger.error('[playtimePlanner] Failed to read plan links:', error);
    return {};
  }
};

/** All plan links (drives the planner's linked-game counts + bulk re-apply). */
export const getAllPlanLinks = async (): Promise<PlanLinksCollection> => readLinksCollection();

/** The plan link for one game, or null if the game wasn't created from a plan. */
export const getPlanLink = async (gameId: string): Promise<PlanLink | null> => {
  const all = await readLinksCollection();
  return all[gameId] ?? null;
};

/** Store the plan link for a game (overwrites). Returns true on success. */
export const setPlanLink = async (gameId: string, link: PlanLink): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_PLAN_LINKS_KEY, async () => {
      const all = await readLinksCollection();
      all[gameId] = link;
      await setStorageJSON(PLAYTIME_PLAN_LINKS_KEY, all);
      return true;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to save plan link:', error);
    return false;
  }
};

/** Remove a game's plan link (e.g. when the game is deleted). Returns true on success. */
export const deletePlanLink = async (gameId: string): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_PLAN_LINKS_KEY, async () => {
      const all = await readLinksCollection();
      if (!(gameId in all)) return true;
      delete all[gameId];
      await setStorageJSON(PLAYTIME_PLAN_LINKS_KEY, all);
      return true;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to delete plan link:', error);
    return false;
  }
};

/**
 * Remove every link pointing at a plan (when the plan is deleted). Without this,
 * dangling links would keep the "Re-apply plan" affordance alive for games whose
 * source plan no longer exists. Returns true on success.
 */
export const deletePlanLinksForPlan = async (planId: string): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_PLAN_LINKS_KEY, async () => {
      const all = await readLinksCollection();
      const remaining: PlanLinksCollection = {};
      let removed = 0;
      for (const [gameId, link] of Object.entries(all)) {
        if (link.planId === planId) removed += 1;
        else remaining[gameId] = link;
      }
      if (removed === 0) return true;
      await setStorageJSON(PLAYTIME_PLAN_LINKS_KEY, remaining);
      return true;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to delete plan links for plan:', error);
    return false;
  }
};

// ── Planned subs attached to REAL games ─────────────────────────────────────

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
 * Read the full collection, validating per entry (a corrupt entry is dropped,
 * not the whole map) - same tolerance as the plan store.
 */
const readSubsCollection = async (): Promise<GameSubsCollection> => {
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
  const all = await readSubsCollection();
  return all[gameId] ?? [];
};

/**
 * Store the planned subs for a game (overwrites). An empty array clears the entry
 * so the store doesn't accumulate empty keys. Returns true on success.
 */
export const setGameSubs = async (gameId: string, subs: PlannedGameSub[]): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_GAME_SUBS_KEY, async () => {
      const all = await readSubsCollection();
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
      const all = await readSubsCollection();
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
