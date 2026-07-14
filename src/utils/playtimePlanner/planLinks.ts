/**
 * Playing-Time Planner Phase 3 — plan links for games created from a plan.
 *
 * When a game is created by prefilling from a plan, this store remembers which
 * plan + planned game it came from (keyed by the real game's id), so an edited
 * plan can later be re-applied to the game (per-game or in bulk).
 *
 * Cloud sync PR 3: the CRUD is now a thin shim over the mode-aware DataStore
 * (local mode = the key-locked store in localPlanStore.ts; cloud = Supabase).
 * The original rationale below still explains WHY this is a keyed store rather
 * than fields on the game blob.
 *
 * This began as a DELIBERATE local-only store, like the planned-sub store: the link
 * was originally written onto the game blob (`sourcePlanId`/`sourcePlanGameId`
 * on AppState) but that proved fragile — the autosave snapshot rebuilds the blob
 * from session state and dropped the fields, and a cloud pull replaces the blob
 * wholesale. Nothing rewrites this keyed store, so the link survives both. The
 * plan itself is local-only anyway, so the link is only meaningful on the device
 * that owns the plan.
 */

import { getDataStore } from '@/datastore/factory';

/** Where a real game came from: the plan and the planned game within it. */
export interface PlanLink {
  planId: string;
  planGameId: string;
}

/** Stored shape: map of real game id -> its plan link. */
export type PlanLinksCollection = Record<string, PlanLink>;

/** All plan links (drives the planner's linked-game counts + bulk re-apply). */
export const getAllPlanLinks = async (): Promise<PlanLinksCollection> =>
  (await getDataStore()).getPlaytimePlanLinks();

/** The plan link for one game, or null if the game wasn't created from a plan. */
export const getPlanLink = async (gameId: string): Promise<PlanLink | null> => {
  const all = await getAllPlanLinks();
  return all[gameId] ?? null;
};

/** Store the plan link for a game (overwrites). Returns true on success. */
export const setPlanLink = async (gameId: string, link: PlanLink): Promise<boolean> =>
  (await getDataStore()).setPlaytimePlanLink(gameId, link);

/** Remove a game's plan link (e.g. when the game is deleted). Returns true on success. */
export const deletePlanLink = async (gameId: string): Promise<boolean> =>
  (await getDataStore()).deletePlaytimePlanLink(gameId);

/**
 * Remove every link pointing at a plan (when the plan is deleted). Without this,
 * dangling links would keep the "Re-apply plan" affordance alive for games whose
 * source plan no longer exists. Returns true on success.
 */
export const deletePlanLinksForPlan = async (planId: string): Promise<boolean> =>
  (await getDataStore()).deletePlaytimePlanLinksForPlan(planId);
