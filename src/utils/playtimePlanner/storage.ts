/**
 * Playing-Time Planner — plan persistence facade (cloud sync PR 3).
 *
 * The CRUD here is a thin shim over the mode-aware DataStore: local mode hits
 * the key-locked IndexedDB store (localPlanStore.ts via LocalDataStore), cloud
 * mode hits Supabase (one row per plan). The pure helpers (create/duplicate/
 * serialize/parse) are mode-agnostic and live here unchanged.
 */

import { getDataStore } from '@/datastore/factory';
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

/** Full plan collection (id -> plan) from the active backend. */
export const getPlans = async (): Promise<PlaytimePlanCollection> =>
  (await getDataStore()).getPlaytimePlans();

/** Read a single plan by id (null if missing). */
export const getPlan = async (id: string): Promise<PlaytimePlan | null> => {
  const plans = await getPlans();
  return plans[id] ?? null;
};

/**
 * Upsert a plan (the backend stamps `updatedAt` + schema version). Returns the
 * saved plan, or null on failure.
 */
export const savePlan = async (plan: PlaytimePlan): Promise<PlaytimePlan | null> =>
  (await getDataStore()).savePlaytimePlan(plan);

/** Delete a plan by id. Returns true if the delete succeeded. */
export const deletePlan = async (id: string): Promise<boolean> =>
  (await getDataStore()).deletePlaytimePlan(id);

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
  // A plan with no games renders a blank Games tab - the app can never produce
  // one (createPlan clamps to >=1, removal stops at 1), so reject crafted JSON.
  if (candidate.games.length === 0) return null;
  // NOTE: the old single-swap-window import check (a player brought on at most
  // once, never while starting) is gone - rotation schedules are now a
  // first-class feature. Impossible same-minutes overlaps are surfaced by the
  // conflict banner (conflicts.ts) rather than rejected at import.
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
