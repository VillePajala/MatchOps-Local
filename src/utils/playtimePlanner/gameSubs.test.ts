/**
 * Tests for the Phase-2 planned-sub store (local-only, keyed by game id).
 * @critical prefilled sub reminders must round-trip and tolerate corrupt storage
 */

import { getGameSubs, setGameSubs, deleteGameSubs, type PlannedGameSub } from './gameSubs';
import { PLAYTIME_GAME_SUBS_KEY } from '@/config/storageKeys';

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


// In-memory mirror of getStorageJSON/setStorageJSON (JSON round-trip).
let store: Record<string, string> = {};

jest.mock('@/utils/storage', () => ({
  getStorageJSON: jest.fn(async (key: string, opts: { defaultValue?: unknown } = {}) => {
    const raw = store[key];
    if (raw === undefined) return opts.defaultValue ?? null;
    try {
      return JSON.parse(raw);
    } catch {
      return opts.defaultValue ?? null;
    }
  }),
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

const sub = (over: Partial<PlannedGameSub> = {}): PlannedGameSub => ({
  id: 's1',
  timeSeconds: 720,
  slotId: 'gk',
  inPlayerId: 'p2',
  outPlayerId: 'p1',
  ...over,
});

describe('planned game subs store', () => {
  it('returns [] for a game with no planned subs', async () => {
    expect(await getGameSubs('game-x')).toEqual([]);
  });

  it('saves and reads a game\'s planned subs back', async () => {
    const subs = [sub(), sub({ id: 's2', timeSeconds: 900, inPlayerId: 'p3', outPlayerId: null })];
    expect(await setGameSubs('g1', subs)).toBe(true);
    expect(await getGameSubs('g1')).toEqual(subs);
  });

  it('keeps games side by side and overwrites in place', async () => {
    await setGameSubs('g1', [sub()]);
    await setGameSubs('g2', [sub({ id: 'x' })]);
    await setGameSubs('g1', [sub({ id: 's1b', timeSeconds: 600 })]); // overwrite g1
    expect(await getGameSubs('g1')).toEqual([sub({ id: 's1b', timeSeconds: 600 })]);
    expect(await getGameSubs('g2')).toEqual([sub({ id: 'x' })]);
  });

  it('clears the entry when saved with an empty array (no empty keys linger)', async () => {
    await setGameSubs('g1', [sub()]);
    await setGameSubs('g1', []);
    expect(await getGameSubs('g1')).toEqual([]);
    expect(JSON.parse(store[PLAYTIME_GAME_SUBS_KEY])).toEqual({});
  });

  it('deletes a game\'s planned subs', async () => {
    await setGameSubs('g1', [sub()]);
    expect(await deleteGameSubs('g1')).toBe(true);
    expect(await getGameSubs('g1')).toEqual([]);
  });

  it('delete of a missing game is a no-op success', async () => {
    expect(await deleteGameSubs('nope')).toBe(true);
  });

  it('drops only a corrupt entry, keeping valid games', async () => {
    store[PLAYTIME_GAME_SUBS_KEY] = JSON.stringify({
      good: [sub()],
      bad: [{ id: 's', timeSeconds: 'not-a-number', slotId: 'gk', inPlayerId: 'p2', outPlayerId: null }],
    });
    expect(await getGameSubs('good')).toEqual([sub()]);
    expect(await getGameSubs('bad')).toEqual([]);
  });

  it('tolerates unparseable JSON (returns empty)', async () => {
    store[PLAYTIME_GAME_SUBS_KEY] = '{ not json';
    expect(await getGameSubs('g1')).toEqual([]);
  });

  it('serializes concurrent saves so no sibling game is dropped (withKeyLock)', async () => {
    await Promise.all([
      setGameSubs('a', [sub({ id: 'a1' })]),
      setGameSubs('b', [sub({ id: 'b1' })]),
      setGameSubs('a', [sub({ id: 'a2' })]),
    ]);
    expect(await getGameSubs('a')).toEqual([sub({ id: 'a2' })]); // last write for a wins
    expect(await getGameSubs('b')).toEqual([sub({ id: 'b1' })]); // b not clobbered
  });
});
