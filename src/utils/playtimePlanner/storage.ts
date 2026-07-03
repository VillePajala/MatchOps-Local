/**
 * Playing-Time Planner — local persistence (Phase 1, PR 1.2).
 *
 * Plans are stored as a single local blob (a map of id -> plan) under
 * `PLAYTIME_PLANS_KEY`, using the low-level `getStorageJSON`/`setStorageJSON`
 * helpers directly. This is intentional: plans are **local-first** and are not
 * routed through the DataStore/cloud sync layer (that is deferred to Phase 2).
 * IndexedDB is the same storage the rest of the app uses, so plans persist and
 * survive reloads without any cloud dependency.
 */

import { getStorageJSON, setStorageJSON } from '@/utils/storage';
import { withKeyLock } from '@/utils/storageKeyLock';
import { PLAYTIME_PLANS_KEY } from '@/config/storageKeys';
import logger from '@/utils/logger';
import {
  PLAYTIME_PLAN_SCHEMA_VERSION,
  isPlaytimePlan,
  type PlaytimePlan,
  type PlaytimePlanCollection,
  type PlanGame,
  type PlanPlayer,
} from './types';

/** Generate a unique id for a plan or game. */
const generateId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

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

/** Read a single plan by id (null if missing). */
export const getPlan = async (id: string): Promise<PlaytimePlan | null> => {
  const plans = await getPlans();
  return plans[id] ?? null;
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

/** Options for building a fresh plan. */
export interface CreatePlanOptions {
  name: string;
  players: PlanPlayer[];
  gameCount: number;
  formationId: string;
  numberOfPeriods: number;
  periodMinutes: number;
  /** Label each game; defaults to "Game N" when omitted. */
  gameLabel?: (index: number) => string;
}

/**
 * Build a new plan in memory (does not save). Each game starts with the chosen
 * formation, empty starting slots, and no subs - the lineup is filled in later
 * PRs. `gameCount` is clamped to at least 1.
 */
export const createPlan = (opts: CreatePlanOptions): PlaytimePlan => {
  const now = new Date().toISOString();
  const count = Math.max(1, Math.floor(opts.gameCount));

  const games: PlanGame[] = Array.from({ length: count }, (_, i) => ({
    id: generateId('ptg'),
    label: opts.gameLabel ? opts.gameLabel(i) : `Game ${i + 1}`,
    formationId: opts.formationId,
    numberOfPeriods: opts.numberOfPeriods,
    periodMinutes: opts.periodMinutes,
    included: true,
    startingSlots: [],
    subs: [],
  }));

  return {
    id: generateId('ptp'),
    name: opts.name,
    version: PLAYTIME_PLAN_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    players: opts.players,
    games,
  };
};
