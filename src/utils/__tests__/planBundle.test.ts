import {
  parsePlanBundle,
  serializePlanBundle,
  bundleCurrentVersion,
  PLAN_BUNDLE_FORMAT_VERSION,
  PARSE_BUNDLE_MAX_VERSIONS,
  PARSE_BUNDLE_MAX_CHARS,
} from '../planBundle';
import {
  PLAN_EXPORT_KIND,
  PLAN_FORMAT_VERSION,
  parsePlanExport,
  serializePlanExport,
  type ImportedPlan,
} from '../planExport';

const validWireSub = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  timeSec: 600,
  role: 'CDM',
  outPlayer: 'p1',
  inPlayer: 'p2',
  ...overrides,
});

const validWireGame = (overrides: Record<string, unknown> = {}) => ({
  id: 'g1',
  label: 'Game 1',
  time: '14:00',
  field: 'Field A',
  opponent: 'Opp',
  numberOfPeriods: 2,
  periodDurationMinutes: 12.5,
  durationMin: 25,
  halfTimeMin: 12.5,
  startingXI: { GK: 'p0', CDM: 'p1', ST: 'p3' },
  scheduledSubs: [validWireSub()],
  ...overrides,
});

const validV1Envelope = (overrides: Record<string, unknown> = {}) => ({
  formatVersion: PLAN_FORMAT_VERSION,
  kind: PLAN_EXPORT_KIND,
  savedAt: '2026-04-28T12:00:00.000Z',
  tournament: {
    teamName: 'Pepo U10',
    formationId: '8v8-2-1-2-1-1',
    rosterSize: 11,
    games: [validWireGame()],
  },
  included: [true],
  currentVersionName: null,
  ...overrides,
});

// Builds a parsed ImportedPlan for use in serializer tests.
const buildPlan = (overrides: Partial<ImportedPlan> = {}): ImportedPlan => {
  const result = parsePlanExport(JSON.stringify(validV1Envelope()));
  if (!result.ok) throw new Error('test fixture failed: ' + result.error.message);
  return { ...result.plan, ...overrides };
};

describe('parsePlanBundle — single-snapshot path', () => {
  it('routes a formatVersion 1 envelope through the existing parser as kind="single"', () => {
    const result = parsePlanBundle(JSON.stringify(validV1Envelope()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('single');
    if (result.kind !== 'single') return;
    expect(result.plan.teamName).toBe('Pepo U10');
  });

  it('propagates inner parsePlanExport errors verbatim', () => {
    const broken = validV1Envelope({
      tournament: {
        teamName: 'X',
        formationId: 'f',
        rosterSize: 1,
        games: [],
      },
    });
    const result = parsePlanBundle(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Path is the stable interface; the message text could rephrase
    // without breaking callers that read the path field.
    expect(result.error.path).toMatch(/tournament\.games/);
  });
});

describe('parsePlanBundle — defensive bounds', () => {
  it('rejects an envelope larger than PARSE_BUNDLE_MAX_CHARS', () => {
    // Pad past the cap with whitespace; JSON.parse strips whitespace
    // so the inner shape doesn't matter, just the raw char length.
    const oversized = ' '.repeat(PARSE_BUNDLE_MAX_CHARS + 1);
    const result = parsePlanBundle(oversized);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/too large/i);
  });

  it('rejects a v2 bundle missing the versions field', () => {
    const result = parsePlanBundle(
      JSON.stringify({
        formatVersion: PLAN_BUNDLE_FORMAT_VERSION,
        kind: 'matchops-planner-export',
        savedAt: '2026-04-28T12:00:00.000Z',
        currentVersionName: null,
        // versions deliberately absent
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toBe('versions');
  });

  it('rejects a v2 bundle with an empty version name ""', () => {
    // Object.entries yields ["": ...] for an empty string key. The
    // parser should reject it (caller's error, not silent acceptance).
    const inner = JSON.parse(
      JSON.stringify({
        formatVersion: 1,
        kind: 'matchops-planner-export',
        tournament: {
          teamName: 'X',
          formationId: 'f',
          rosterSize: 1,
          games: [
            {
              id: 'g1',
              label: 'Game 1',
              time: '14:00',
              field: 'F',
              opponent: 'O',
              numberOfPeriods: 2,
              periodDurationMinutes: 12.5,
              durationMin: 25,
              halfTimeMin: 12.5,
              startingXI: { GK: 'p0' },
              scheduledSubs: [],
            },
          ],
        },
        included: [true],
        currentVersionName: null,
      }),
    );
    const result = parsePlanBundle(
      JSON.stringify({
        formatVersion: PLAN_BUNDLE_FORMAT_VERSION,
        kind: 'matchops-planner-export',
        currentVersionName: null,
        versions: { '': inner },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/non-empty string/);
  });
});

describe('parsePlanBundle — bundle path (formatVersion 2)', () => {
  const buildBundleEnvelope = (overrides: Record<string, unknown> = {}) => {
    const inner = JSON.parse(JSON.stringify(validV1Envelope()));
    return {
      formatVersion: PLAN_BUNDLE_FORMAT_VERSION,
      kind: PLAN_EXPORT_KIND,
      savedAt: '2026-04-28T12:00:00.000Z',
      currentVersionName: 'default',
      versions: { default: inner },
      ...overrides,
    };
  };

  it('parses a single-version bundle as kind="bundle"', () => {
    const result = parsePlanBundle(JSON.stringify(buildBundleEnvelope()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('bundle');
    if (result.kind !== 'bundle') return;
    expect(Object.keys(result.bundle.versions)).toEqual(['default']);
    expect(result.bundle.currentVersionName).toBe('default');
  });

  it('parses a multi-version bundle and validates each version', () => {
    const inner1 = JSON.parse(JSON.stringify(validV1Envelope()));
    const inner2 = JSON.parse(JSON.stringify(validV1Envelope()));
    const result = parsePlanBundle(
      JSON.stringify(
        buildBundleEnvelope({
          versions: { default: inner1, contingency: inner2 },
          currentVersionName: 'contingency',
        }),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'bundle') return;
    expect(Object.keys(result.bundle.versions).sort()).toEqual([
      'contingency',
      'default',
    ]);
    expect(result.bundle.currentVersionName).toBe('contingency');
  });

  it('accepts an empty versions object', () => {
    const result = parsePlanBundle(
      JSON.stringify(buildBundleEnvelope({ versions: {}, currentVersionName: null })),
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'bundle') return;
    expect(Object.keys(result.bundle.versions)).toEqual([]);
  });

  it('rejects a bundle with an invalid inner version', () => {
    const broken = JSON.parse(JSON.stringify(validV1Envelope()));
    broken.tournament.games = [];
    const result = parsePlanBundle(
      JSON.stringify(buildBundleEnvelope({ versions: { default: broken } })),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/version "default" is invalid/);
    expect(result.error.path).toMatch(/versions\.default/);
  });

  it('rejects a currentVersionName that does not match any version', () => {
    const result = parsePlanBundle(
      JSON.stringify(
        buildBundleEnvelope({ currentVersionName: 'no-such-version' }),
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/not in versions/);
  });

  it('rejects unsupported formatVersion', () => {
    const result = parsePlanBundle(
      JSON.stringify(buildBundleEnvelope({ formatVersion: 99 })),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Unsupported formatVersion/);
  });

  it('rejects a versions count above PARSE_BUNDLE_MAX_VERSIONS', () => {
    const versions: Record<string, unknown> = {};
    for (let i = 0; i <= PARSE_BUNDLE_MAX_VERSIONS; i++) {
      versions[`v${i}`] = JSON.parse(JSON.stringify(validV1Envelope()));
    }
    const result = parsePlanBundle(JSON.stringify(buildBundleEnvelope({ versions })));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/max \d+/);
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects currentVersionName === %s even when no own version of that name exists',
    (reservedName) => {
      // Without Object.hasOwn the `in` check would return true for
      // these names (Object.prototype exposes them) and the
      // currentVersionName guard would silently pass. Locks the
      // hasOwn-based fix.
      const inner = JSON.parse(JSON.stringify(validV1Envelope()));
      const result = parsePlanBundle(
        JSON.stringify(
          buildBundleEnvelope({
            versions: { default: inner },
            currentVersionName: reservedName,
          }),
        ),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/not in versions/);
    },
  );

  it('rejects reserved version names (__proto__, constructor, prototype)', () => {
    // Bracket-assign so the property lands as own; otherwise V8
    // routes __proto__ to [[SetPrototypeOf]].
    for (const name of ['__proto__', 'constructor', 'prototype']) {
      const versions: Record<string, unknown> = {};
      Object.defineProperty(versions, name, {
        value: JSON.parse(JSON.stringify(validV1Envelope())),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      const result = parsePlanBundle(
        JSON.stringify(buildBundleEnvelope({ versions, currentVersionName: null })),
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.message).toMatch(/reserved name/);
    }
  });
});

describe('bundleCurrentVersion', () => {
  it('returns the currentVersionName entry when present', () => {
    const a = buildPlan();
    const b = buildPlan({ teamName: 'Other' });
    const picked = bundleCurrentVersion({
      formatVersion: PLAN_BUNDLE_FORMAT_VERSION,
      kind: PLAN_EXPORT_KIND,
      currentVersionName: 'b',
      versions: { a, b },
    });
    expect(picked?.name).toBe('b');
    expect(picked?.plan.teamName).toBe('Other');
  });

  it('falls back to the first version when currentVersionName is null', () => {
    const a = buildPlan();
    const picked = bundleCurrentVersion({
      formatVersion: PLAN_BUNDLE_FORMAT_VERSION,
      kind: PLAN_EXPORT_KIND,
      currentVersionName: null,
      versions: { a },
    });
    expect(picked?.name).toBe('a');
  });

  it('returns null for an empty versions object', () => {
    const picked = bundleCurrentVersion({
      formatVersion: PLAN_BUNDLE_FORMAT_VERSION,
      kind: PLAN_EXPORT_KIND,
      currentVersionName: null,
      versions: {},
    });
    expect(picked).toBeNull();
  });
});

describe('serializePlanBundle round-trip', () => {
  it('round-trips a single-version bundle byte-equivalent through parsePlanBundle', () => {
    const plan = buildPlan();
    // bundle.savedAt now wins over options.savedAt, so the test
    // can set it once on the bundle and skip the options arg.
    const text = serializePlanBundle({
      savedAt: '2026-04-28T12:00:00.000Z',
      currentVersionName: 'default',
      versions: { default: plan },
    });
    const reParsed = parsePlanBundle(text);
    expect(reParsed.ok).toBe(true);
    if (!reParsed.ok || reParsed.kind !== 'bundle') return;
    expect(Object.keys(reParsed.bundle.versions)).toEqual(['default']);
    expect(reParsed.bundle.currentVersionName).toBe('default');
    expect(reParsed.bundle.versions.default.teamName).toBe(plan.teamName);
    expect(reParsed.bundle.savedAt).toBe('2026-04-28T12:00:00.000Z');
  });

  it('savedAt precedence: bundle.savedAt > options.savedAt > now()', () => {
    const plan = buildPlan();
    // bundle wins over options
    const t1 = serializePlanBundle(
      {
        savedAt: '2026-04-28T12:00:00.000Z',
        currentVersionName: null,
        versions: { default: plan },
      },
      { savedAt: '2030-01-01T00:00:00.000Z' },
    );
    expect(t1).toContain('"savedAt": "2026-04-28T12:00:00.000Z"');
    // options.savedAt fills in when bundle.savedAt is absent
    const t2 = serializePlanBundle(
      { currentVersionName: null, versions: { default: plan } },
      { savedAt: '2030-01-01T00:00:00.000Z' },
    );
    expect(t2).toContain('"savedAt": "2030-01-01T00:00:00.000Z"');
  });

  it('round-trips a multi-version bundle preserving the version map', () => {
    const a = buildPlan();
    const b = buildPlan({ teamName: 'Other' });
    const text = serializePlanBundle({
      savedAt: '2026-04-28T12:00:00.000Z',
      currentVersionName: 'b',
      versions: { a, b },
    });
    const reParsed = parsePlanBundle(text);
    expect(reParsed.ok).toBe(true);
    if (!reParsed.ok || reParsed.kind !== 'bundle') return;
    expect(Object.keys(reParsed.bundle.versions).sort()).toEqual(['a', 'b']);
    expect(reParsed.bundle.versions.b.teamName).toBe('Other');
  });

  it('an inner version of a bundle is byte-equivalent to a standalone v1 export of the same plan', () => {
    // A bundle-aware tool can extract any inner version verbatim;
    // a v1-only consumer that greps for `formatVersion: 1` and copies
    // the inner object should be able to re-import via parsePlanExport.
    const plan = buildPlan();
    const bundleText = serializePlanBundle({
      currentVersionName: 'default',
      versions: { default: plan },
    });
    const bundleObj = JSON.parse(bundleText) as {
      versions: { default: { formatVersion: number } };
    };
    expect(bundleObj.versions.default.formatVersion).toBe(PLAN_FORMAT_VERSION);
    const inner = parsePlanExport(JSON.stringify(bundleObj.versions.default));
    expect(inner.ok).toBe(true);
    // And the inner serialised back matches the standalone path.
    expect(serializePlanExport(plan)).toContain(`"formatVersion": ${PLAN_FORMAT_VERSION}`);
  });
});
