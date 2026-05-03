/**
 * Plan export / import — JSON envelope bridge for the standalone matchops-planner.
 *
 * Wire format owned jointly with the standalone (`formatVersion: 1`); changing
 * field shapes here requires a version bump on both sides.
 */

import type { ScheduledSub, ScheduledSubStatus } from '@/types/game';

export const PLAN_FORMAT_VERSION = 1 as const;
export const PLAN_EXPORT_KIND = 'matchops-planner-export' as const;

/**
 * Per-game draft as it arrives from the standalone planner.
 *
 * Field-name translation already applied by the reader:
 *   standalone `timeSec`  → `timeSeconds`
 *   standalone `role`     → `positionRole`
 *   standalone (no status) → `status: 'pending'`
 */
export interface ImportedPlanGame {
  /** Stable id from the standalone (e.g. `g1`). */
  id: string;
  /** Display label from the standalone (e.g. `Game 1`). */
  label: string;
  time: string;
  field: string;
  opponent: string;
  numberOfPeriods: 1 | 2;
  periodDurationMinutes: number;
  durationMin: number;
  halfTimeMin: number;
  /** Role name → player id (raw — formation roles validated tightly in PR 5). */
  startingXI: Record<string, string>;
  /** Scheduled subs translated into MatchOps-Local's shape, all `status: 'pending'`. */
  scheduledSubs: ScheduledSub[];
}

export interface ImportedPlan {
  formatVersion: typeof PLAN_FORMAT_VERSION;
  kind: typeof PLAN_EXPORT_KIND;
  savedAt?: string;
  teamName: string;
  formationId: string;
  rosterSize: number;
  games: ImportedPlanGame[];
  /** Per-game inclusion flag from the standalone (matches `games[]` length). */
  included: boolean[];
  currentVersionName: string | null;
}

export interface PlanImportError {
  /** Human-readable message suitable to surface in the import modal. */
  message: string;
  /** Optional dotted-path hint pointing at the offending field. */
  path?: string;
}

export type PlanImportResult =
  | { ok: true; plan: ImportedPlan }
  | { ok: false; error: PlanImportError };

/* ───────────────────────── Reader ───────────────────────── */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '';

const fail = (message: string, path?: string): PlanImportResult => ({
  ok: false,
  error: { message, path },
});

/**
 * Parse + validate a JSON string representing a planner export envelope.
 *
 * The validator is intentionally strict — wrong `formatVersion`, missing
 * required fields, bad shape on a single sub all return a structured error
 * with a path so the modal can point at the offending field. The validator
 * does NOT enforce role names against the formation registry; that lands in
 * PR 5 alongside the `FormationPreset.roles?` map. For PR 4 the only role
 * check is "non-empty string."
 */
/**
 * Self-defense size cap. The PlanningModal file picker already gates at
 * 1 MB, but parsePlanExport is a public utility — a future caller (QR,
 * paste, drag-drop) could bypass that guard. 2 MB leaves headroom over
 * the 1 MB UI cap while still bounding memory before JSON.parse runs.
 */
const PARSE_PLAN_EXPORT_MAX_BYTES = 2 * 1024 * 1024;

export const parsePlanExport = (raw: string): PlanImportResult => {
  if (raw.length > PARSE_PLAN_EXPORT_MAX_BYTES) {
    return fail(
      `Envelope is too large (over ${PARSE_PLAN_EXPORT_MAX_BYTES / 1024 / 1024} MB)`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return fail(
      `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!isObject(parsed)) return fail('Envelope must be a JSON object');

  if (parsed.formatVersion !== PLAN_FORMAT_VERSION) {
    return fail(
      `Unsupported formatVersion: expected ${PLAN_FORMAT_VERSION}, got ${String(parsed.formatVersion)}`,
      'formatVersion',
    );
  }
  if (parsed.kind !== PLAN_EXPORT_KIND) {
    return fail(
      `Unsupported kind: expected "${PLAN_EXPORT_KIND}", got "${String(parsed.kind)}"`,
      'kind',
    );
  }

  const tournament = parsed.tournament;
  if (!isObject(tournament)) {
    return fail('Missing or invalid `tournament` object', 'tournament');
  }

  if (!isNonEmptyString(tournament.teamName)) {
    return fail('`tournament.teamName` must be a non-empty string', 'tournament.teamName');
  }
  if (!isNonEmptyString(tournament.formationId)) {
    return fail(
      '`tournament.formationId` must be a non-empty string',
      'tournament.formationId',
    );
  }
  if (typeof tournament.rosterSize !== 'number' || !Number.isInteger(tournament.rosterSize) || tournament.rosterSize < 1) {
    return fail(
      '`tournament.rosterSize` must be a positive integer',
      'tournament.rosterSize',
    );
  }

  if (!Array.isArray(tournament.games) || tournament.games.length === 0) {
    return fail(
      '`tournament.games` must be a non-empty array',
      'tournament.games',
    );
  }

  const games: ImportedPlanGame[] = [];
  for (let i = 0; i < tournament.games.length; i++) {
    const g = tournament.games[i] as unknown;
    const at = `tournament.games[${i}]`;
    if (!isObject(g)) return fail(`${at} must be an object`, at);

    if (!isNonEmptyString(g.id)) return fail(`${at}.id must be a non-empty string`, `${at}.id`);
    if (!isObject(g.startingXI)) {
      return fail(`${at}.startingXI must be an object`, `${at}.startingXI`);
    }
    for (const role of Object.keys(g.startingXI)) {
      const v = (g.startingXI as Record<string, unknown>)[role];
      if (!isNonEmptyString(role)) {
        return fail(`${at}.startingXI has an empty role key`, `${at}.startingXI`);
      }
      if (!isNonEmptyString(v)) {
        return fail(
          `${at}.startingXI.${role} must be a non-empty string player id`,
          `${at}.startingXI.${role}`,
        );
      }
    }

    if (!Array.isArray(g.scheduledSubs)) {
      return fail(
        `${at}.scheduledSubs must be an array`,
        `${at}.scheduledSubs`,
      );
    }

    const subs: ScheduledSub[] = [];
    const seenSubIds = new Set<string>();
    for (let j = 0; j < g.scheduledSubs.length; j++) {
      const s = (g.scheduledSubs as unknown[])[j];
      const subAt = `${at}.scheduledSubs[${j}]`;
      if (!isObject(s)) return fail(`${subAt} must be an object`, subAt);
      if (!isNonEmptyString(s.id)) {
        return fail(`${subAt}.id must be a non-empty string`, `${subAt}.id`);
      }
      if (seenSubIds.has(s.id)) {
        return fail(
          `${subAt}.id "${s.id}" is duplicated within the same game`,
          `${subAt}.id`,
        );
      }
      seenSubIds.add(s.id);
      if (
        typeof s.timeSec !== 'number' ||
        !Number.isInteger(s.timeSec) ||
        s.timeSec < 0
      ) {
        return fail(
          `${subAt}.timeSec must be a non-negative integer`,
          `${subAt}.timeSec`,
        );
      }
      if (!isNonEmptyString(s.role)) {
        return fail(
          `${subAt}.role must be a non-empty role name`,
          `${subAt}.role`,
        );
      }
      if (!isNonEmptyString(s.outPlayer)) {
        return fail(
          `${subAt}.outPlayer must be a non-empty player id`,
          `${subAt}.outPlayer`,
        );
      }
      if (!isNonEmptyString(s.inPlayer)) {
        return fail(
          `${subAt}.inPlayer must be a non-empty player id`,
          `${subAt}.inPlayer`,
        );
      }
      if (s.outPlayer === s.inPlayer) {
        return fail(
          `${subAt}: outPlayer and inPlayer must differ`,
          `${subAt}.inPlayer`,
        );
      }
      subs.push({
        id: s.id,
        timeSeconds: s.timeSec,
        positionRole: s.role,
        outPlayer: s.outPlayer,
        inPlayer: s.inPlayer,
        status: 'pending' satisfies ScheduledSubStatus,
      });
    }

    // Structural fields fail hard — a 0-minute game would silently break the
    // downstream UI. Optional display fields (label/time/field) keep their
    // soft defaults below.
    if (g.numberOfPeriods !== 1 && g.numberOfPeriods !== 2) {
      return fail(
        `${at}.numberOfPeriods must be 1 or 2`,
        `${at}.numberOfPeriods`,
      );
    }
    if (
      typeof g.periodDurationMinutes !== 'number' ||
      !Number.isFinite(g.periodDurationMinutes) ||
      g.periodDurationMinutes <= 0
    ) {
      return fail(
        `${at}.periodDurationMinutes must be a positive number`,
        `${at}.periodDurationMinutes`,
      );
    }
    if (
      typeof g.durationMin !== 'number' ||
      !Number.isFinite(g.durationMin) ||
      g.durationMin <= 0
    ) {
      return fail(
        `${at}.durationMin must be a positive number`,
        `${at}.durationMin`,
      );
    }
    if (
      typeof g.halfTimeMin !== 'number' ||
      !Number.isFinite(g.halfTimeMin) ||
      g.halfTimeMin <= 0
    ) {
      return fail(
        `${at}.halfTimeMin must be a positive number`,
        `${at}.halfTimeMin`,
      );
    }
    if (!isNonEmptyString(g.opponent)) {
      return fail(`${at}.opponent must be a non-empty string`, `${at}.opponent`);
    }

    games.push({
      id: g.id,
      label: typeof g.label === 'string' ? g.label : `Game ${i + 1}`,
      time: typeof g.time === 'string' ? g.time : '',
      field: typeof g.field === 'string' ? g.field : '',
      opponent: g.opponent,
      numberOfPeriods: g.numberOfPeriods,
      periodDurationMinutes: g.periodDurationMinutes,
      durationMin: g.durationMin,
      halfTimeMin: g.halfTimeMin,
      startingXI: g.startingXI as Record<string, string>,
      scheduledSubs: subs,
    });
  }

  // included[] should match games.length; tolerate missing/short by padding.
  const includedRaw = Array.isArray(parsed.included) ? parsed.included : [];
  const included: boolean[] = games.map((_, i) =>
    typeof includedRaw[i] === 'boolean' ? (includedRaw[i] as boolean) : true,
  );

  const currentVersionName =
    typeof parsed.currentVersionName === 'string' ? parsed.currentVersionName : null;

  return {
    ok: true,
    plan: {
      formatVersion: PLAN_FORMAT_VERSION,
      kind: PLAN_EXPORT_KIND,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : undefined,
      teamName: tournament.teamName,
      formationId: tournament.formationId,
      rosterSize: tournament.rosterSize,
      games,
      included,
      currentVersionName,
    },
  };
};

/* ───────────────────────── Writer ───────────────────────── */

/**
 * Serialise an `ImportedPlan` back into the standalone's wire format.
 *
 * Mirrors the standalone's `exportJson` so a round-trip (export → import →
 * export) is byte-equivalent modulo whitespace. Does NOT include `versions`
 * (the standalone's history map) — Phase 5's full import will handle that.
 */
export const serializePlanExport = (
  plan: ImportedPlan,
  options: { savedAt?: string } = {},
): string => {
  const wireGames = plan.games.map((g) => ({
    id: g.id,
    label: g.label,
    time: g.time,
    field: g.field,
    opponent: g.opponent,
    numberOfPeriods: g.numberOfPeriods,
    periodDurationMinutes: g.periodDurationMinutes,
    durationMin: g.durationMin,
    halfTimeMin: g.halfTimeMin,
    startingXI: g.startingXI,
    scheduledSubs: g.scheduledSubs.map((s) => ({
      id: s.id,
      timeSec: s.timeSeconds,
      role: s.positionRole,
      outPlayer: s.outPlayer,
      inPlayer: s.inPlayer,
    })),
  }));

  const envelope = {
    formatVersion: PLAN_FORMAT_VERSION,
    kind: PLAN_EXPORT_KIND,
    savedAt: options.savedAt ?? new Date().toISOString(),
    tournament: {
      teamName: plan.teamName,
      formationId: plan.formationId,
      rosterSize: plan.rosterSize,
      games: wireGames,
    },
    included: plan.included,
    currentVersionName: plan.currentVersionName,
  };

  return JSON.stringify(envelope, null, 2);
};
