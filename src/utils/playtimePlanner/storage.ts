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
  /** Optional source team (Phase 2); stamped on the plan when set. */
  teamId?: string;
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
    // Only stamp teamId when set, so freehand plans stay clean (no teamId key).
    ...(opts.teamId ? { teamId: opts.teamId } : {}),
  };
};

// ── Versions & JSON export/import (PR 1.6) ──

/** Envelope wrapping an exported plan (so importers can sniff the format). */
const EXPORT_FORMAT = 'matchops-playtime-plan';

interface PlanExportEnvelope {
  format: string;
  version: number;
  plan: PlaytimePlan;
}

/** Serialize a plan to a shareable JSON string (pretty-printed, with an envelope). */
export const serializePlan = (plan: PlaytimePlan): string =>
  JSON.stringify(
    { format: EXPORT_FORMAT, version: PLAYTIME_PLAN_SCHEMA_VERSION, plan } satisfies PlanExportEnvelope,
    null,
    2,
  );

/**
 * Parse an exported plan JSON. Accepts either the enveloped form or a bare plan
 * object. For an envelope, the `format` must match ours and the `version` must not
 * be newer than the schema we understand (a future file could carry fields we'd
 * silently drop). Returns the validated plan, or null on bad/unrecognized input.
 */
export const parsePlanExport = (json: string): PlaytimePlan | null => {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  let candidate: unknown = data;
  if (data && typeof data === 'object' && 'plan' in (data as Record<string, unknown>)) {
    const env = data as Partial<PlanExportEnvelope>;
    // Reject envelopes from a different tool or a newer envelope schema.
    if (env.format !== undefined && env.format !== EXPORT_FORMAT) return null;
    if (typeof env.version === 'number' && env.version > PLAYTIME_PLAN_SCHEMA_VERSION) return null;
    candidate = env.plan;
  }
  if (!isPlaytimePlan(candidate)) return null;
  // Gate the plan's own version too, so a bare (unenveloped) future-schema plan is
  // rejected rather than imported with fields this build would silently drop.
  if (candidate.version > PLAYTIME_PLAN_SCHEMA_VERSION) return null;
  return candidate;
};

/** Copy a plan under a fresh identity (does not save). Nested game ids are
 * regenerated too, so a plan and its copy never share a game id. */
export const duplicatePlan = (plan: PlaytimePlan, copySuffix = ' (copy)'): PlaytimePlan => {
  const now = new Date().toISOString();
  return {
    ...plan,
    id: generateId('ptp'),
    name: `${plan.name}${copySuffix}`,
    createdAt: now,
    updatedAt: now,
    games: plan.games.map((g) => ({ ...g, id: generateId('ptg') })),
  };
};

/**
 * Import a plan from exported JSON: validate, give it a fresh id (so it never
 * overwrites an existing plan), and save it. Returns the saved plan or null.
 */
export const importPlan = async (json: string): Promise<PlaytimePlan | null> => {
  const parsed = parsePlanExport(json);
  if (!parsed) return null;
  const now = new Date().toISOString();
  // Fresh ids for the plan and its games, so importing the same file twice yields
  // two fully independent plans (matches duplicatePlan).
  return savePlan({
    ...parsed,
    id: generateId('ptp'),
    createdAt: now,
    updatedAt: now,
    games: parsed.games.map((g) => ({ ...g, id: generateId('ptg') })),
  });
};
