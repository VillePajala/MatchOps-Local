/**
 * Playing-Time Planner Phase 3 — plan links for games created from a plan.
 *
 * When a game is created by prefilling from a plan, this store remembers which
 * plan + planned game it came from (keyed by the real game's id), so an edited
 * plan can later be re-applied to the game (per-game or in bulk).
 *
 * This is a DELIBERATE local-only store, like the planned-sub store: the link
 * was originally written onto the game blob (`sourcePlanId`/`sourcePlanGameId`
 * on AppState) but that proved fragile — the autosave snapshot rebuilds the blob
 * from session state and dropped the fields, and a cloud pull replaces the blob
 * wholesale. Nothing rewrites this keyed store, so the link survives both. The
 * plan itself is local-only anyway, so the link is only meaningful on the device
 * that owns the plan.
 */

import { getStorageJSON, setStorageJSON } from '@/utils/storage';
import { withKeyLock } from '@/utils/storageKeyLock';
import { PLAYTIME_PLAN_LINKS_KEY } from '@/config/storageKeys';
import logger from '@/utils/logger';

/** Where a real game came from: the plan and the planned game within it. */
export interface PlanLink {
  planId: string;
  planGameId: string;
}

/** Stored shape: map of real game id -> its plan link. */
export type PlanLinksCollection = Record<string, PlanLink>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isPlanLink = (v: unknown): v is PlanLink =>
  isRecord(v) && typeof v.planId === 'string' && typeof v.planGameId === 'string';

/**
 * Read the full collection, validating per entry (a corrupt entry is dropped, not
 * the whole map) — same tolerance as the plan + sub stores.
 */
const readCollection = async (): Promise<PlanLinksCollection> => {
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
export const getAllPlanLinks = async (): Promise<PlanLinksCollection> => readCollection();

/** The plan link for one game, or null if the game wasn't created from a plan. */
export const getPlanLink = async (gameId: string): Promise<PlanLink | null> => {
  const all = await readCollection();
  return all[gameId] ?? null;
};

/** Store the plan link for a game (overwrites). Returns true on success. */
export const setPlanLink = async (gameId: string, link: PlanLink): Promise<boolean> => {
  try {
    return await withKeyLock(PLAYTIME_PLAN_LINKS_KEY, async () => {
      const all = await readCollection();
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
      const all = await readCollection();
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
      const all = await readCollection();
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
