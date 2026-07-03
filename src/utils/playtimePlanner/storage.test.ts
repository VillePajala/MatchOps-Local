/**
 * Tests for Playing-Time Planner local persistence.
 * @critical user plan data must round-trip and tolerate corrupt storage
 */

import { getPlans, getPlan, savePlan, deletePlan, createPlan } from './storage';
import { PLAYTIME_PLANS_KEY } from '@/config/storageKeys';
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
