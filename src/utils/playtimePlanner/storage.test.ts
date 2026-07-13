/**
 * Tests for Playing-Time Planner local persistence.
 * @critical user plan data must round-trip and tolerate corrupt storage
 */

import {
  getPlans,
  getPlan,
  savePlan,
  deletePlan,
  createPlan,
  serializePlan,
  parsePlanExport,
  duplicatePlan,
  importPlan,
} from './storage';
import { PLAYTIME_PLANS_KEY } from '@/config/storageKeys';

// Cloud sync PR 3: the public module is a shim over getDataStore(). Back it
// with the LOCAL raw store so these tests keep exercising the full round trip
// against the in-memory storage mock above.
jest.mock('@/datastore/factory', () => ({
  getDataStore: async () => {
    const { createLocalPlanStore } = jest.requireActual('./localPlanStore');
    // Bind the factory store to THIS suite's in-memory '@/utils/storage' mock,
    // preserving the full shim -> store -> raw round trip under test.
    const storage = jest.requireMock('@/utils/storage') as {
      getStorageJSON: <T>(key: string, opts: { defaultValue?: T }) => Promise<T>;
      setStorageJSON: (key: string, value: unknown) => Promise<void>;
    };
    const local = createLocalPlanStore({
      getJSON: <T,>(key: string, defaultValue: T) =>
        storage.getStorageJSON<T>(key, { defaultValue }),
      setJSON: (key: string, value: unknown) => storage.setStorageJSON(key, value),
    });
    return {
      getPlaytimePlans: local.getPlans,
      savePlaytimePlan: local.savePlan,
      deletePlaytimePlan: local.deletePlan,
      getPlaytimePlanLinks: local.getAllPlanLinks,
      setPlaytimePlanLink: local.setPlanLink,
      deletePlaytimePlanLink: local.deletePlanLink,
      deletePlaytimePlanLinksForPlan: local.deletePlanLinksForPlan,
      getPlaytimeGameSubs: local.getGameSubs,
      getAllPlaytimeGameSubs: local.getAllGameSubs,
      setPlaytimeGameSubs: local.setGameSubs,
      deletePlaytimeGameSubs: local.deleteGameSubs,
    };
  },
}));

import { isPlaytimePlanCollection, type PlaytimePlan } from './types';

// In-memory storage mock that mirrors the real getStorageJSON/setStorageJSON
// semantics: JSON round-trip + validator falling back to defaultValue.
let store: Record<string, string> = {};

jest.mock('@/utils/storage', () => ({
  getStorageJSON: jest.fn(
    async (
      key: string,
      opts: { validator?: (d: unknown) => boolean; defaultValue?: unknown } = {},
    ) => {
      const raw = store[key];
      if (raw === undefined) return opts.defaultValue ?? null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return opts.defaultValue ?? null;
      }
      if (opts.validator && !opts.validator(parsed)) return opts.defaultValue ?? null;
      return parsed;
    },
  ),
  setStorageJSON: jest.fn(async (key: string, value: unknown) => {
    store[key] = JSON.stringify(value);
  }),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

beforeEach(() => {
  store = {};
  jest.clearAllMocks();
});

const baseOpts = {
  name: 'Sunday Cup',
  players: [
    { id: 'p1', name: 'Alex' },
    { id: 'p2', name: 'Sam' },
  ],
  gameCount: 3,
  formationId: '8v8-2-1-2-1-1',
  numberOfPeriods: 2,
  periodMinutes: 12,
};

describe('createPlan', () => {
  it('builds a plan with one game per requested count, all included', () => {
    const plan = createPlan(baseOpts);
    expect(plan.games).toHaveLength(3);
    expect(plan.name).toBe('Sunday Cup');
    expect(plan.players).toHaveLength(2);
    for (const g of plan.games) {
      expect(g.formationId).toBe('8v8-2-1-2-1-1');
      expect(g.numberOfPeriods).toBe(2);
      expect(g.periodMinutes).toBe(12);
      expect(g.included).toBe(true);
      expect(g.startingSlots).toEqual([]);
      expect(g.subs).toEqual([]);
    }
  });

  it('defaults labels to "Game N"', () => {
    const plan = createPlan(baseOpts);
    expect(plan.games.map((g) => g.label)).toEqual(['Game 1', 'Game 2', 'Game 3']);
  });

  it('honours a custom label function', () => {
    const plan = createPlan({ ...baseOpts, gameCount: 2, gameLabel: (i) => `Match ${i + 1}` });
    expect(plan.games.map((g) => g.label)).toEqual(['Match 1', 'Match 2']);
  });

  it('clamps game count to at least 1', () => {
    expect(createPlan({ ...baseOpts, gameCount: 0 }).games).toHaveLength(1);
    expect(createPlan({ ...baseOpts, gameCount: -5 }).games).toHaveLength(1);
  });

  it('gives the plan and each game a distinct id', () => {
    const plan = createPlan(baseOpts);
    const ids = new Set([plan.id, ...plan.games.map((g) => g.id)]);
    expect(ids.size).toBe(1 + plan.games.length);
  });

  it('stamps teamId only when provided (freehand plans have no teamId)', () => {
    expect(createPlan({ ...baseOpts, teamId: 'team-1' }).teamId).toBe('team-1');
    expect('teamId' in createPlan(baseOpts)).toBe(false);
  });
});

describe('save / get / delete round-trip', () => {
  it('saves a plan and reads it back', async () => {
    const plan = createPlan(baseOpts);
    const saved = await savePlan(plan);
    expect(saved).not.toBeNull();

    const read = await getPlan(plan.id);
    expect(read?.id).toBe(plan.id);
    expect(read?.name).toBe('Sunday Cup');
    expect(read?.games).toHaveLength(3);
  });

  it('stamps updatedAt on save', async () => {
    const plan = createPlan(baseOpts);
    const original = plan.updatedAt;
    // Force a distinct timestamp region by mutating then saving.
    const saved = await savePlan({ ...plan, updatedAt: '2000-01-01T00:00:00.000Z' });
    expect(saved?.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(typeof saved?.updatedAt).toBe('string');
    expect(original).toBeTruthy();
  });

  it('keeps multiple plans side by side', async () => {
    const a = await savePlan(createPlan({ ...baseOpts, name: 'A' }));
    const b = await savePlan(createPlan({ ...baseOpts, name: 'B' }));
    const plans = await getPlans();
    expect(Object.keys(plans)).toHaveLength(2);
    expect(plans[a!.id].name).toBe('A');
    expect(plans[b!.id].name).toBe('B');
  });

  it('upserts (updates in place) when saving an existing id', async () => {
    const plan = await savePlan(createPlan(baseOpts));
    await savePlan({ ...plan!, name: 'Renamed' });
    const plans = await getPlans();
    expect(Object.keys(plans)).toHaveLength(1);
    expect(plans[plan!.id].name).toBe('Renamed');
  });

  it('persists teamId through save/read (validator accepts the optional field)', async () => {
    const plan = await savePlan(createPlan({ ...baseOpts, teamId: 'team-9' }));
    const read = await getPlan(plan!.id);
    expect(read?.teamId).toBe('team-9');
  });

  it('deletes a plan', async () => {
    const plan = await savePlan(createPlan(baseOpts));
    expect(await deletePlan(plan!.id)).toBe(true);
    expect(await getPlan(plan!.id)).toBeNull();
  });

  it('delete of a missing id is a no-op success', async () => {
    expect(await deletePlan('nope')).toBe(true);
  });

  it('serializes concurrent saves so no sibling plan is dropped (withKeyLock)', async () => {
    const a = createPlan({ ...baseOpts, name: 'A' });
    const b = createPlan({ ...baseOpts, name: 'B' });
    // Three overlapping read-modify-writes to the same collection key.
    await Promise.all([savePlan(a), savePlan(b), savePlan({ ...a, name: 'A2' })]);
    const plans = await getPlans();
    expect(Object.keys(plans).sort()).toEqual([a.id, b.id].sort());
    expect(plans[a.id].name).toBe('A2'); // last write for A wins
    expect(plans[b.id].name).toBe('B'); // B not clobbered by A's writes
  });
});

describe('corruption tolerance', () => {
  it('returns an empty collection when stored data is not a valid plan map', async () => {
    store[PLAYTIME_PLANS_KEY] = JSON.stringify({ bad: { not: 'a plan' } });
    expect(await getPlans()).toEqual({});
  });

  it('returns an empty collection on unparseable JSON', async () => {
    store[PLAYTIME_PLANS_KEY] = '{ not json';
    expect(await getPlans()).toEqual({});
  });

  it('keeps valid plans and drops only the malformed entry', async () => {
    const good = createPlan({ ...baseOpts, name: 'Good' });
    store[PLAYTIME_PLANS_KEY] = JSON.stringify({
      [good.id]: good,
      broken: { not: 'a plan' },
    });
    const plans = await getPlans();
    expect(Object.keys(plans)).toEqual([good.id]);
    expect(plans[good.id].name).toBe('Good');
  });

  it('does not let one bad entry wipe the collection on the next save', async () => {
    const good = createPlan({ ...baseOpts, name: 'Good' });
    store[PLAYTIME_PLANS_KEY] = JSON.stringify({
      [good.id]: good,
      broken: { not: 'a plan' },
    });
    // Save a second plan while a corrupt entry is present.
    const other = await savePlan(createPlan({ ...baseOpts, name: 'Other' }));
    const plans = await getPlans();
    expect(Object.keys(plans).sort()).toEqual([good.id, other!.id].sort());
  });

  it('a well-formed saved plan passes the collection validator', async () => {
    const plan = await savePlan(createPlan(baseOpts));
    const raw = JSON.parse(store[PLAYTIME_PLANS_KEY]);
    expect(isPlaytimePlanCollection(raw)).toBe(true);
    expect((raw as Record<string, PlaytimePlan>)[plan!.id].name).toBe('Sunday Cup');
  });
});

describe('versions & JSON (PR 1.6)', () => {
  it('serializes and parses a plan round-trip (enveloped)', () => {
    const plan = createPlan(baseOpts);
    expect(parsePlanExport(serializePlan(plan))).toEqual(plan);
  });

  it('parses a bare plan object (no envelope)', () => {
    const plan = createPlan(baseOpts);
    expect(parsePlanExport(JSON.stringify(plan))).toEqual(plan);
  });

  it('returns null for unparseable or non-plan JSON', () => {
    expect(parsePlanExport('not json')).toBeNull();
    expect(parsePlanExport(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(parsePlanExport(JSON.stringify({ plan: { bad: true } }))).toBeNull();
  });

  it('duplicates a plan under a fresh id and a copy suffix', () => {
    const plan = createPlan(baseOpts);
    const dup = duplicatePlan(plan);
    expect(dup.id).not.toBe(plan.id);
    expect(dup.name).toBe('Sunday Cup (copy)');
    expect(dup.games).toHaveLength(plan.games.length);
  });

  it('regenerates nested game ids on duplicate (no shared ids with the original)', () => {
    const plan = createPlan(baseOpts);
    const dup = duplicatePlan(plan);
    const origIds = new Set(plan.games.map((g) => g.id));
    expect(dup.games.every((g) => !origIds.has(g.id))).toBe(true);
  });

  it('rejects an envelope from a different tool or a newer schema version', () => {
    const plan = createPlan(baseOpts);
    expect(parsePlanExport(JSON.stringify({ format: 'some-other-app', version: 1, plan }))).toBeNull();
    expect(parsePlanExport(JSON.stringify({ format: 'matchops-playtime-plan', version: 999, plan }))).toBeNull();
  });

  it('rejects a bare plan whose own version is newer than this build', () => {
    const plan = { ...createPlan(baseOpts), version: 999 };
    expect(parsePlanExport(JSON.stringify(plan))).toBeNull();
  });

  it('regenerates nested game ids on import (same file imported twice is independent)', async () => {
    const plan = createPlan(baseOpts);
    const imported = await importPlan(serializePlan(plan));
    const origIds = new Set(plan.games.map((g) => g.id));
    expect(imported!.games.every((g) => !origIds.has(g.id))).toBe(true);
  });

  it('imports a plan under a fresh id and saves it', async () => {
    const plan = createPlan(baseOpts);
    const imported = await importPlan(serializePlan(plan));
    expect(imported).not.toBeNull();
    expect(imported!.id).not.toBe(plan.id);
    const stored = await getPlans();
    expect(stored[imported!.id].name).toBe('Sunday Cup');
  });

  it('import returns null for bad json (and stores nothing)', async () => {
    expect(await importPlan('garbage')).toBeNull();
    expect(await getPlans()).toEqual({});
  });

  // Value-level validation: `typeof x === 'number'` alone let NaN/negative
  // durations through, which poisoned every minutes calculation downstream.
  it('rejects a plan whose game durations are NaN or negative', async () => {
    const nanPlan = createPlan(baseOpts);
    nanPlan.games[0].periodMinutes = NaN;
    expect(await importPlan(serializePlan(nanPlan))).toBeNull();

    const negativePlan = createPlan(baseOpts);
    negativePlan.games[0].numberOfPeriods = -1;
    expect(await importPlan(serializePlan(negativePlan))).toBeNull();
  });

  it('rejects a plan where one player starts in two slots (would double-count minutes)', async () => {
    const plan = createPlan(baseOpts);
    plan.games[0].startingSlots = [
      { slotId: 'gk', playerId: 'p1' },
      { slotId: 's0', playerId: 'p1' },
    ];
    expect(await importPlan(serializePlan(plan))).toBeNull();
  });

  it('rejects a plan with duplicate roster ids', async () => {
    const plan = createPlan(baseOpts);
    plan.players = [
      { id: 'p1', name: 'Alex' },
      { id: 'p1', name: 'Impostor' },
    ];
    expect(await importPlan(serializePlan(plan))).toBeNull();
  });
});

describe('write paths abort on read failure (sibling-wipe protection)', () => {
  it('savePlan returns null and PRESERVES siblings when the pre-write read fails', async () => {
    // Seed two plans.
    const a = createPlan({ name: 'A', players: [], gameCount: 1, formationId: '5v5-2-2', numberOfPeriods: 2, periodMinutes: 12 });
    const b = createPlan({ name: 'B', players: [], gameCount: 1, formationId: '5v5-2-2', numberOfPeriods: 2, periodMinutes: 12 });
    expect(await savePlan(a)).not.toBeNull();
    expect(await savePlan(b)).not.toBeNull();

    // The NEXT read (inside savePlan's lock) fails transiently. Before the
    // strict-read fix this masqueraded as an empty collection and the write
    // erased every sibling.
    const storage = jest.requireMock('@/utils/storage') as { getStorageJSON: jest.Mock };
    storage.getStorageJSON.mockRejectedValueOnce(new Error('IndexedDB flake'));

    const result = await savePlan({ ...a, name: 'A2' });
    expect(result).toBeNull(); // write aborted, surfaced to the caller

    const plans = await getPlans();
    expect(Object.keys(plans).sort()).toEqual([a.id, b.id].sort()); // nothing wiped
  });

  it('parsePlanExport rejects a plan with zero games (blank Games tab guard)', () => {
    const a = createPlan({ name: 'A', players: [], gameCount: 1, formationId: '5v5-2-2', numberOfPeriods: 2, periodMinutes: 12 });
    expect(parsePlanExport(JSON.stringify({ ...a, games: [] }))).toBeNull();
  });

  it('parsePlanExport rejects a game bringing the same player on twice, or an already-starting player', () => {
    // The UI can't produce either (availableSubInIds), so they only arrive via
    // crafted JSON - where they would double-count that player's minutes.
    const base = createPlan({ name: 'A', players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }], gameCount: 1, formationId: '5v5-2-2', numberOfPeriods: 2, periodMinutes: 12 });
    const game = base.games[0];
    const twiceIn = {
      ...base,
      games: [{
        ...game,
        subs: [
          { id: 's1', slotId: 'slot-1', timeSeconds: 300, inPlayerId: 'p2' },
          { id: 's2', slotId: 'slot-2', timeSeconds: 600, inPlayerId: 'p2' },
        ],
      }],
    };
    expect(parsePlanExport(JSON.stringify(twiceIn))).toBeNull();

    const starterIn = {
      ...base,
      games: [{
        ...game,
        startingSlots: [{ slotId: 'slot-1', playerId: 'p1' }],
        subs: [{ id: 's1', slotId: 'slot-2', timeSeconds: 300, inPlayerId: 'p1' }],
      }],
    };
    expect(parsePlanExport(JSON.stringify(starterIn))).toBeNull();

    // Sanity: a single, legal incoming sub still parses.
    const legal = {
      ...base,
      games: [{
        ...game,
        startingSlots: [{ slotId: 'slot-1', playerId: 'p1' }],
        subs: [{ id: 's1', slotId: 'slot-1', timeSeconds: 300, inPlayerId: 'p2' }],
      }],
    };
    expect(parsePlanExport(JSON.stringify(legal))).not.toBeNull();
  });

  it('parsePlanExport rejects a malformed absentIds shape but tolerates null/valid arrays', () => {
    // Every consumer does `new Set(g.absentIds ?? [])` - a non-array truthy
    // value would crash the Minutes view/prefill/Suggest on first touch.
    const base = createPlan({ name: 'A', players: [{ id: 'p1', name: 'Alex' }], gameCount: 1, formationId: '5v5-2-2', numberOfPeriods: 2, periodMinutes: 12 });
    const game = base.games[0];
    expect(parsePlanExport(JSON.stringify({ ...base, games: [{ ...game, absentIds: 5 }] }))).toBeNull();
    expect(parsePlanExport(JSON.stringify({ ...base, games: [{ ...game, absentIds: [1, 2] }] }))).toBeNull();
    expect(parsePlanExport(JSON.stringify({ ...base, games: [{ ...game, absentIds: null }] }))).not.toBeNull();
    expect(parsePlanExport(JSON.stringify({ ...base, games: [{ ...game, absentIds: ['p1'] }] }))).not.toBeNull();
  });
});
