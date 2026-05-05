// Bundle import/export — `formatVersion: 2`. Wraps the existing
// single-snapshot plan format in a `versions` map keyed by name so a
// coach can ship every named variant of a tournament plan in one
// file. The single-snapshot format (v1) keeps working for legacy
// imports and the standalone's basic export.

import {
  PLAN_EXPORT_KIND,
  PLAN_FORMAT_VERSION,
  parsePlanExport,
  serializePlanExport,
  type ImportedPlan,
  type PlanImportError,
} from './planExport';

export const PLAN_BUNDLE_FORMAT_VERSION = 2 as const;

// Soft caps mirror parsePlanExport's anti-DoS limits scaled per-version.
// 50 versions × 2 MB chars/version = 100 MB worst case, which the
// outer envelope cap (5 MB on the bundle reader) clamps further.
export const PARSE_BUNDLE_MAX_VERSIONS = 50;
export const PARSE_BUNDLE_MAX_CHARS = 5 * 1024 * 1024; // 5 MB UTF-16 code units

export interface ImportedPlanBundle {
  formatVersion: typeof PLAN_BUNDLE_FORMAT_VERSION;
  kind: typeof PLAN_EXPORT_KIND;
  savedAt?: string;
  /**
   * Name of the version that should be treated as "current" on
   * import — typically the active child session at export time.
   * `null` is allowed and means "no preference, use first".
   */
  currentVersionName: string | null;
  /**
   * Named versions, keyed by display name. Each value is a complete
   * single-snapshot ImportedPlan; the bundle is just the outer
   * envelope. Empty object is valid and means "no plans" — the
   * parser still accepts it so a coach can save an empty bundle.
   */
  versions: Record<string, ImportedPlan>;
}

export type BundleImportResult =
  | { ok: true; kind: 'single'; plan: ImportedPlan }
  | { ok: true; kind: 'bundle'; bundle: ImportedPlanBundle }
  | { ok: false; error: PlanImportError };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const fail = (message: string, path?: string): BundleImportResult => ({
  ok: false,
  error: { message, ...(path !== undefined ? { path } : {}) },
});

/**
 * Parse either a single-snapshot envelope (formatVersion 1) or a
 * bundle envelope (formatVersion 2). The caller decides what to do
 * with each shape — e.g. PlanningModal opens the picker for a single
 * snapshot and (post-PR-C-2) creates a parent + named-version
 * children for a bundle.
 */
export function parsePlanBundle(raw: string): BundleImportResult {
  if (raw.length > PARSE_BUNDLE_MAX_CHARS) {
    return fail(
      `Envelope is too large (over ${PARSE_BUNDLE_MAX_CHARS} characters, approx. ${
        PARSE_BUNDLE_MAX_CHARS / 1024 / 1024
      } MB)`,
    );
  }
  // Peek at formatVersion before delegating so we can short-circuit
  // bundle vs single without parsing twice.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return fail(
      `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!isObject(parsed)) return fail('Envelope must be a JSON object');

  if (parsed.formatVersion === PLAN_FORMAT_VERSION) {
    const inner = parsePlanExport(raw);
    if (!inner.ok) return { ok: false, error: inner.error };
    return { ok: true, kind: 'single', plan: inner.plan };
  }
  if (parsed.formatVersion !== PLAN_BUNDLE_FORMAT_VERSION) {
    return fail(
      `Unsupported formatVersion: expected ${PLAN_FORMAT_VERSION} or ${PLAN_BUNDLE_FORMAT_VERSION}, got ${String(parsed.formatVersion)}`,
      'formatVersion',
    );
  }
  if (parsed.kind !== PLAN_EXPORT_KIND) {
    return fail(
      `Unsupported kind: expected "${PLAN_EXPORT_KIND}", got "${String(parsed.kind)}"`,
      'kind',
    );
  }

  const versions = parsed.versions;
  if (!isObject(versions)) {
    return fail('Bundle "versions" must be an object', 'versions');
  }
  const versionEntries = Object.entries(versions);
  if (versionEntries.length > PARSE_BUNDLE_MAX_VERSIONS) {
    return fail(
      `Bundle has ${versionEntries.length} versions (max ${PARSE_BUNDLE_MAX_VERSIONS})`,
      'versions',
    );
  }

  // Validate each version against the existing single-snapshot
  // parser. Re-serialise → re-parse so the inner shape gets the
  // same DoS caps + structural validation as a standalone import.
  const out: Record<string, ImportedPlan> = {};
  for (const [name, value] of versionEntries) {
    if (typeof name !== 'string' || name === '') {
      return fail('Bundle version name must be a non-empty string', 'versions');
    }
    if (
      name === '__proto__' ||
      name === 'constructor' ||
      name === 'prototype'
    ) {
      return fail(
        `Bundle version uses reserved name "${name}"`,
        'versions',
      );
    }
    const inner = parsePlanExport(JSON.stringify(value));
    if (!inner.ok) {
      return fail(
        `Bundle version "${name}" is invalid: ${inner.error.message}`,
        `versions.${name}${inner.error.path ? `.${inner.error.path}` : ''}`,
      );
    }
    out[name] = inner.plan;
  }

  let currentVersionName: string | null = null;
  if (parsed.currentVersionName !== undefined) {
    if (parsed.currentVersionName === null) {
      currentVersionName = null;
    } else if (
      typeof parsed.currentVersionName === 'string' &&
      parsed.currentVersionName !== ''
    ) {
      if (!(parsed.currentVersionName in out)) {
        return fail(
          `currentVersionName "${parsed.currentVersionName}" is not in versions`,
          'currentVersionName',
        );
      }
      currentVersionName = parsed.currentVersionName;
    } else {
      return fail(
        'currentVersionName must be a non-empty string or null',
        'currentVersionName',
      );
    }
  }

  return {
    ok: true,
    kind: 'bundle',
    bundle: {
      formatVersion: PLAN_BUNDLE_FORMAT_VERSION,
      kind: PLAN_EXPORT_KIND,
      ...(typeof parsed.savedAt === 'string'
        ? { savedAt: parsed.savedAt }
        : {}),
      currentVersionName,
      versions: out,
    },
  };
}

// Pick the version a single-snapshot consumer should treat as
// "current" — currentVersionName if present + valid, else the first
// entry in iteration order, else null.
export function bundleCurrentVersion(
  bundle: ImportedPlanBundle,
): { name: string; plan: ImportedPlan } | null {
  if (
    bundle.currentVersionName !== null &&
    bundle.currentVersionName in bundle.versions
  ) {
    return {
      name: bundle.currentVersionName,
      plan: bundle.versions[bundle.currentVersionName],
    };
  }
  const first = Object.entries(bundle.versions)[0];
  if (!first) return null;
  return { name: first[0], plan: first[1] };
}

/**
 * Serialise a bundle. Each version is serialised via the existing
 * single-snapshot serializer so a v1 consumer can extract any single
 * version and read it independently — bundle-aware tools see the
 * map, legacy tools can grep for the inner envelope.
 */
export function serializePlanBundle(
  bundle: Omit<ImportedPlanBundle, 'formatVersion' | 'kind'>,
  options: { savedAt?: string } = {},
): string {
  const wireVersions: Record<string, unknown> = {};
  for (const [name, plan] of Object.entries(bundle.versions)) {
    // Serialise then parse back into an object so JSON.stringify
    // emits a nested object (not a string-encoded payload).
    wireVersions[name] = JSON.parse(serializePlanExport(plan));
  }
  const envelope = {
    formatVersion: PLAN_BUNDLE_FORMAT_VERSION,
    kind: PLAN_EXPORT_KIND,
    savedAt: options.savedAt ?? new Date().toISOString(),
    currentVersionName: bundle.currentVersionName,
    versions: wireVersions,
  };
  return JSON.stringify(envelope, null, 2);
}
