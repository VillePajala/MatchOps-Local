// formatVersion: 2 — wraps multiple named versions; v1 still parses standalone.

import {
  PLAN_EXPORT_KIND,
  PLAN_FORMAT_VERSION,
  parsePlanExport,
  serializePlanExport,
  type ImportedPlan,
  type PlanImportError,
} from './planExport';

export const PLAN_BUNDLE_FORMAT_VERSION = 2 as const;

// Anti-DoS caps. Bundle-level only: the outer envelope is capped at
// PARSE_BUNDLE_MAX_CHARS (UTF-16 code units), and the version count
// at PARSE_BUNDLE_MAX_VERSIONS. Each inner version is then re-parsed
// through parsePlanExport, which applies its own per-version caps
// (PARSE_PLAN_EXPORT_MAX_CHARS = 2 MB, plus structural depth limits).
// So the worst case for a fully-loaded valid bundle is bounded by
// `min(PARSE_BUNDLE_MAX_CHARS, N × PARSE_PLAN_EXPORT_MAX_CHARS)`.
export const PARSE_BUNDLE_MAX_VERSIONS = 50;
export const PARSE_BUNDLE_MAX_CHARS = 5 * 1024 * 1024; // 5 MB

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

// Parse either a single-snapshot envelope (v1) or a bundle envelope (v2).
export function parsePlanBundle(raw: string): BundleImportResult {
  if (raw.length > PARSE_BUNDLE_MAX_CHARS) {
    return fail(
      `Envelope is too large (over ${PARSE_BUNDLE_MAX_CHARS / 1024 / 1024} MB)`,
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
    // Object.entries always yields string keys; only the empty-name check matters here.
    if (name === '') {
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

  // currentVersionName missing from parsed JSON → null ("no preferred
  // version, consumer picks first"). Distinct from explicit null
  // (still "no preference") which we let through unchanged below.
  let currentVersionName: string | null = null;
  if (parsed.currentVersionName !== undefined) {
    if (parsed.currentVersionName === null) {
      currentVersionName = null;
    } else if (
      typeof parsed.currentVersionName === 'string' &&
      parsed.currentVersionName !== ''
    ) {
      // Object.hasOwn (not `in`) so prototype-chain keys like
      // '__proto__' / 'constructor' don't sneak past the version-
      // existence check — the `in` operator returns true for those
      // on any plain object because Object.prototype exposes them.
      if (!Object.hasOwn(out, parsed.currentVersionName)) {
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
      // savedAt must be a string AND parse to a real timestamp —
      // hand-crafted bundles with `savedAt: "not-a-date"` would
      // otherwise produce `Invalid Date` in the UI's display + ISO
      // sort comparisons.
      ...(typeof parsed.savedAt === 'string' &&
      !Number.isNaN(new Date(parsed.savedAt).getTime())
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
  // Object.hasOwn — see parsePlanBundle for the `in` vs hasOwn rationale.
  if (
    bundle.currentVersionName !== null &&
    Object.hasOwn(bundle.versions, bundle.currentVersionName)
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

// Each inner version round-trips through serializePlanExport so a
// v1-only consumer can extract any one verbatim.
export function serializePlanBundle(
  bundle: Omit<ImportedPlanBundle, 'formatVersion' | 'kind'>,
  options: { savedAt?: string } = {},
): string {
  const wireVersions: Record<string, unknown> = {};
  for (const [name, plan] of Object.entries(bundle.versions)) {
    // Symmetric defensive check on the write side: parsePlanBundle
    // rejects empty/reserved names on read; refuse to emit a wire
    // shape that would then fail re-parse. Cheaper to throw at the
    // serialise call site than to debug an unloadable bundle later.
    if (name === '') {
      throw new Error(
        'serializePlanBundle: bundle version name must be a non-empty string',
      );
    }
    if (
      name === '__proto__' ||
      name === 'constructor' ||
      name === 'prototype'
    ) {
      throw new Error(
        `serializePlanBundle: bundle version uses reserved name "${name}"`,
      );
    }
    // Serialise + parse so the wire shape is a nested object, not a string-encoded payload.
    wireVersions[name] = JSON.parse(serializePlanExport(plan));
  }
  // Precedence: caller-set `bundle.savedAt` wins (round-trip
  // determinism), then `options.savedAt` (explicit override at
  // serialise time), then now() as fallback.
  const envelope = {
    formatVersion: PLAN_BUNDLE_FORMAT_VERSION,
    kind: PLAN_EXPORT_KIND,
    savedAt: bundle.savedAt ?? options.savedAt ?? new Date().toISOString(),
    currentVersionName: bundle.currentVersionName,
    versions: wireVersions,
  };
  return JSON.stringify(envelope, null, 2);
}
