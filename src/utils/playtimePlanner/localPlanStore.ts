/**
 * Playing-Time Planner — the LOCAL (IndexedDB) backend for plans, plan links
 * and planned game subs.
 *
 * Cloud-sync review fix (plan doc §11 addendum): this store is a FACTORY over
 * injected JSON IO so it always writes the SAME database as every other
 * entity - the per-user database (matchops_user_{id}) for a signed-in
 * session, the legacy MatchOpsLocal DB for anonymous local mode. The earlier
 * module-global version wrote the legacy DB unconditionally, which leaked
 * plans across accounts on a shared device and escaped clearAllUserData's
 * per-user wipe. LocalDataStore is the only runtime consumer; the import
 * graph stays acyclic (shims -> factory -> LocalDataStore -> here).
 */

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

/** JSON IO bound to a concrete storage adapter (per-user or legacy). */
export interface PlanStoreIO {
  getJSON<T>(key: string, defaultValue: T): Promise<T>;
  setJSON(key: string, value: unknown): Promise<void>;
}

export interface LocalPlanStore {
  getPlans(): Promise<PlaytimePlanCollection>;
  savePlan(plan: PlaytimePlan): Promise<PlaytimePlan | null>;
  deletePlan(id: string): Promise<boolean>;
  getAllPlanLinks(): Promise<PlanLinksCollection>;
  getPlanLink(gameId: string): Promise<PlanLink | null>;
  setPlanLink(gameId: string, link: PlanLink): Promise<boolean>;
  deletePlanLink(gameId: string): Promise<boolean>;
  deletePlanLinksForPlan(planId: string): Promise<boolean>;
  getGameSubs(gameId: string): Promise<PlannedGameSub[]>;
  getAllGameSubs(): Promise<GameSubsCollection>;
  setGameSubs(gameId: string, subs: PlannedGameSub[]): Promise<boolean>;
  deleteGameSubs(gameId: string): Promise<boolean>;
  restorePlans(incoming: PlaytimePlanCollection): Promise<number>;
  restorePlanLinks(incoming: PlanLinksCollection): Promise<number>;
  restoreGameSubs(incoming: GameSubsCollection): Promise<number>;
}

export function createLocalPlanStore(io: PlanStoreIO): LocalPlanStore {
// ── Plans ───────────────────────────────────────────────────────────────────

/**
 * STRICT read used inside write paths: an IO failure THROWS so the caller's
 * write aborts - a failed read must never masquerade as an empty collection
 * (the subsequent write would wipe every sibling plan). Per-entry validation
 * stays tolerant: one malformed blob only drops itself.
 */
const readPlansOrThrow = async (): Promise<PlaytimePlanCollection> => {
  const raw = await io.getJSON<Record<string, unknown>>(PLAYTIME_PLANS_KEY, {});
  if (!raw || typeof raw !== 'object') return {};
  const valid: PlaytimePlanCollection = {};
  for (const [id, plan] of Object.entries(raw)) {
    if (isPlaytimePlan(plan)) valid[id] = plan;
    else logger.warn(`[playtimePlanner] Dropping invalid stored plan "${id}"`);
  }
  return valid;
};

/** Tolerant read for QUERY paths: an IO failure degrades to "no plans". */
const getPlans = async (): Promise<PlaytimePlanCollection> => {
  try {
    return await readPlansOrThrow();
  } catch (error) {
    logger.error('[playtimePlanner] Failed to read plans:', error);
    return {};
  }
};

/**
 * Upsert a plan. Stamps `updatedAt` and the current schema version, then writes
 * the whole collection back. Returns the saved plan, or null on failure.
 */
const savePlan = async (plan: PlaytimePlan): Promise<PlaytimePlan | null> => {
  try {
    // Serialize the read-modify-write so concurrent autosaves (e.g. fast typing)
    // can't clobber each other or drop a sibling plan from the collection.
    return await withKeyLock(PLAYTIME_PLANS_KEY, async () => {
      const plans = await readPlansOrThrow();
      const stamped: PlaytimePlan = {
        ...plan,
        // Never DOWN-stamp: a blob written by a newer app keeps its version,
        // so future migration gates on other devices still fire correctly.
        version: Math.max(plan.version ?? 0, PLAYTIME_PLAN_SCHEMA_VERSION),
        updatedAt: new Date().toISOString(),
      };
      plans[plan.id] = stamped;
      await io.setJSON(PLAYTIME_PLANS_KEY, plans);
      return stamped;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to save plan:', error);
    return null;
  }
};

/** Delete a plan by id. Returns true if the write succeeded. */
const deletePlan = async (id: string): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_PLANS_KEY, async () => {
      const plans = await readPlansOrThrow();
      if (!(id in plans)) return true;
      delete plans[id];
      await io.setJSON(PLAYTIME_PLANS_KEY, plans);
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
const readLinksOrThrow = async (): Promise<PlanLinksCollection> => {
  const raw = await io.getJSON<Record<string, unknown>>(PLAYTIME_PLAN_LINKS_KEY, {});
  if (!raw || typeof raw !== 'object') return {};
  const valid: PlanLinksCollection = {};
  for (const [gameId, link] of Object.entries(raw)) {
    if (isPlanLink(link)) valid[gameId] = link;
    else logger.warn(`[playtimePlanner] Dropping invalid plan link for game "${gameId}"`);
  }
  return valid;
};

const readLinksCollection = async (): Promise<PlanLinksCollection> => {
  try {
    return await readLinksOrThrow();
  } catch (error) {
    logger.error('[playtimePlanner] Failed to read plan links:', error);
    return {};
  }
};

/** All plan links (drives the planner's linked-game counts + bulk re-apply). */
const getAllPlanLinks = async (): Promise<PlanLinksCollection> => readLinksCollection();

/** The plan link for one game, or null if the game wasn't created from a plan. */
const getPlanLink = async (gameId: string): Promise<PlanLink | null> => {
  const all = await readLinksCollection();
  return all[gameId] ?? null;
};

/** Store the plan link for a game (overwrites). Returns true on success. */
const setPlanLink = async (gameId: string, link: PlanLink): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_PLAN_LINKS_KEY, async () => {
      const all = await readLinksOrThrow();
      all[gameId] = link;
      await io.setJSON(PLAYTIME_PLAN_LINKS_KEY, all);
      return true;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to save plan link:', error);
    return false;
  }
};

/** Remove a game's plan link (e.g. when the game is deleted). Returns true on success. */
const deletePlanLink = async (gameId: string): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_PLAN_LINKS_KEY, async () => {
      const all = await readLinksOrThrow();
      if (!(gameId in all)) return true;
      delete all[gameId];
      await io.setJSON(PLAYTIME_PLAN_LINKS_KEY, all);
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
const deletePlanLinksForPlan = async (planId: string): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_PLAN_LINKS_KEY, async () => {
      const all = await readLinksOrThrow();
      const remaining: PlanLinksCollection = {};
      let removed = 0;
      for (const [gameId, link] of Object.entries(all)) {
        if (link.planId === planId) removed += 1;
        else remaining[gameId] = link;
      }
      if (removed === 0) return true;
      await io.setJSON(PLAYTIME_PLAN_LINKS_KEY, remaining);
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
  // Finite + non-negative, matching types.ts's isSub: timeSeconds drives the
  // live "sub now" reminder, and a crafted NaN would make it never fire while
  // a negative value would make it fire immediately and forever.
  typeof v.timeSeconds === 'number' &&
  Number.isFinite(v.timeSeconds) &&
  v.timeSeconds >= 0 &&
  typeof v.slotId === 'string' &&
  typeof v.inPlayerId === 'string' &&
  (v.outPlayerId === null || typeof v.outPlayerId === 'string');

const isGameSubsEntry = (v: unknown): v is PlannedGameSub[] =>
  Array.isArray(v) && v.every(isPlannedGameSub);

/**
 * Read the full collection, validating per entry (a corrupt entry is dropped,
 * not the whole map) - same tolerance as the plan store.
 */
const readSubsOrThrow = async (): Promise<GameSubsCollection> => {
  const raw = await io.getJSON<Record<string, unknown>>(PLAYTIME_GAME_SUBS_KEY, {});
  if (!raw || typeof raw !== 'object') return {};
  const valid: GameSubsCollection = {};
  for (const [gameId, subs] of Object.entries(raw)) {
    if (isGameSubsEntry(subs)) valid[gameId] = subs;
    else logger.warn(`[playtimePlanner] Dropping invalid planned subs for game "${gameId}"`);
  }
  return valid;
};

const readSubsCollection = async (): Promise<GameSubsCollection> => {
  try {
    return await readSubsOrThrow();
  } catch (error) {
    logger.error('[playtimePlanner] Failed to read planned game subs:', error);
    return {};
  }
};

/** Planned subs for one game ([] if none). */
const getGameSubs = async (gameId: string): Promise<PlannedGameSub[]> => {
  const all = await readSubsCollection();
  return all[gameId] ?? [];
};

/**
 * Store the planned subs for a game (overwrites). An empty array clears the entry
 * so the store doesn't accumulate empty keys. Returns true on success.
 */
const setGameSubs = async (gameId: string, subs: PlannedGameSub[]): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_GAME_SUBS_KEY, async () => {
      const all = await readSubsOrThrow();
      if (subs.length === 0) delete all[gameId];
      else all[gameId] = subs;
      await io.setJSON(PLAYTIME_GAME_SUBS_KEY, all);
      return true;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to save planned game subs:', error);
    return false;
  }
};

/** Remove a game's planned subs (e.g. when the game is deleted). Returns true on success. */
const deleteGameSubs = async (gameId: string): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_GAME_SUBS_KEY, async () => {
      const all = await readSubsOrThrow();
      if (!(gameId in all)) return true;
      delete all[gameId];
      await io.setJSON(PLAYTIME_GAME_SUBS_KEY, all);
      return true;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to delete planned game subs:', error);
    return false;
  }
};

// ── Hydration (cloud -> local seed) ─────────────────────────────────────────
// Restore helpers used ONLY by the background cloud hydration: they merge
// cloud entries into the local store WITHOUT re-stamping updatedAt (savePlan
// stamps "now", which would make every hydrated copy look like the newest
// edit and defeat per-plan last-write-wins on the next device).

/** Merge cloud plans in; a local plan wins when its updatedAt is newer. */
const restorePlans = async (incoming: PlaytimePlanCollection): Promise<number> => {
  try {
    return await withKeyLock(PLAYTIME_PLANS_KEY, async () => {
      const current = await readPlansOrThrow();
      let written = 0;
      for (const [id, plan] of Object.entries(incoming)) {
        // A blob from a NEWER app schema is skipped (not dropped): editing it
        // here would corrupt fields this build doesn't understand, and the
        // next push would spread the damage back.
        if (plan.version > PLAYTIME_PLAN_SCHEMA_VERSION) {
          logger.warn(`[playtimePlanner] Skipping hydration of newer-schema plan "${id}" (v${plan.version})`);
          continue;
        }
        const local = current[id];
        if (!local || plan.updatedAt > local.updatedAt) {
          current[id] = plan;
          written += 1;
        }
      }
      if (written > 0) await io.setJSON(PLAYTIME_PLANS_KEY, current);
      return written;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to restore plans:', error);
    return 0;
  }
};

/** Fill in cloud links for games with no local link (local edits win). */
const restorePlanLinks = async (incoming: PlanLinksCollection): Promise<number> => {
  try {
    return await withKeyLock(PLAYTIME_PLAN_LINKS_KEY, async () => {
      const current = await readLinksOrThrow();
      let written = 0;
      for (const [gameId, link] of Object.entries(incoming)) {
        if (!(gameId in current)) {
          current[gameId] = link;
          written += 1;
        }
      }
      if (written > 0) await io.setJSON(PLAYTIME_PLAN_LINKS_KEY, current);
      return written;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to restore plan links:', error);
    return 0;
  }
};

/** Fill in cloud planned subs for games with no local entry (local edits win). */
const restoreGameSubs = async (incoming: GameSubsCollection): Promise<number> => {
  try {
    return await withKeyLock(PLAYTIME_GAME_SUBS_KEY, async () => {
      const current = await readSubsOrThrow();
      let written = 0;
      for (const [gameId, subs] of Object.entries(incoming)) {
        if (!(gameId in current) && Array.isArray(subs) && subs.length > 0) {
          current[gameId] = subs;
          written += 1;
        }
      }
      if (written > 0) await io.setJSON(PLAYTIME_GAME_SUBS_KEY, current);
      return written;
    });
  } catch (error) {
    logger.error('[playtimePlanner] Failed to restore planned game subs:', error);
    return 0;
  }
};

  /** Whole planned-subs collection (bulk paths must not miss unlinked games). */
  const getAllGameSubs = async (): Promise<GameSubsCollection> => readSubsCollection();

  return {
    getPlans,
    savePlan,
    deletePlan,
    getAllPlanLinks,
    getPlanLink,
    setPlanLink,
    deletePlanLink,
    deletePlanLinksForPlan,
    getGameSubs,
    getAllGameSubs,
    setGameSubs,
    deleteGameSubs,
    restorePlans,
    restorePlanLinks,
    restoreGameSubs,
  };
}
