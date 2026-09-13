/**
 * Tests for the Phase-3 plan-link store (local-only, keyed by game id).
 * @critical the plan link must round-trip and tolerate corrupt storage - it lives
 * here precisely because the game blob (autosave/cloud rebuilds) kept dropping it.
 */

import {
  getGamesForPlanGame,
  getAllPlanLinks,
  getPlanLink,
  setPlanLink,
  deletePlanLink,
  deletePlanLinksForPlan,
} from './planLinks';
import { PLAYTIME_PLAN_LINKS_KEY } from '@/config/storageKeys';

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

describe('planLinks store', () => {
  it('round-trips a link and returns null for unknown games', async () => {
    await setPlanLink('game-1', { planId: 'p1', planGameId: 'g1' });
    expect(await getPlanLink('game-1')).toEqual({ planId: 'p1', planGameId: 'g1' });
    expect(await getPlanLink('game-2')).toBeNull();
  });

  it('overwrites an existing link', async () => {
    await setPlanLink('game-1', { planId: 'p1', planGameId: 'g1' });
    await setPlanLink('game-1', { planId: 'p2', planGameId: 'g9' });
    expect(await getPlanLink('game-1')).toEqual({ planId: 'p2', planGameId: 'g9' });
  });

  it('deletes a link (and tolerates deleting a missing one)', async () => {
    await setPlanLink('game-1', { planId: 'p1', planGameId: 'g1' });
    expect(await deletePlanLink('game-1')).toBe(true);
    expect(await getPlanLink('game-1')).toBeNull();
    expect(await deletePlanLink('game-1')).toBe(true); // idempotent
  });

  it('getAllPlanLinks returns the whole map', async () => {
    await setPlanLink('a', { planId: 'p1', planGameId: 'g1' });
    await setPlanLink('b', { planId: 'p1', planGameId: 'g2' });
    expect(await getAllPlanLinks()).toEqual({
      a: { planId: 'p1', planGameId: 'g1' },
      b: { planId: 'p1', planGameId: 'g2' },
    });
  });

  it('purges every link pointing at a deleted plan, keeping the rest', async () => {
    await setPlanLink('a', { planId: 'p1', planGameId: 'g1' });
    await setPlanLink('b', { planId: 'p1', planGameId: 'g2' });
    await setPlanLink('c', { planId: 'p2', planGameId: 'g1' });

    expect(await deletePlanLinksForPlan('p1')).toBe(true);

    expect(await getAllPlanLinks()).toEqual({ c: { planId: 'p2', planGameId: 'g1' } });
    // No-op when nothing points at the plan.
    expect(await deletePlanLinksForPlan('p1')).toBe(true);
  });

  it('drops corrupt entries but keeps valid ones', async () => {
    store[PLAYTIME_PLAN_LINKS_KEY] = JSON.stringify({
      good: { planId: 'p1', planGameId: 'g1' },
      bad: { planId: 42 }, // wrong types
      worse: 'not-an-object',
    });
    expect(await getAllPlanLinks()).toEqual({ good: { planId: 'p1', planGameId: 'g1' } });
  });

  it('returns an empty map when the whole blob is unreadable', async () => {
    store[PLAYTIME_PLAN_LINKS_KEY] = '{corrupt json';
    expect(await getAllPlanLinks()).toEqual({});
  });

  /**
   * The reverse lookup that lets a PLAN open its match. The store is keyed by
   * real game id, so this has to scan - and the thing worth testing is that it
   * scans on BOTH halves of the key. Matching planGameId alone would jump to a
   * game belonging to a different plan that happens to share a game id.
   */
  describe('getGamesForPlanGame', () => {
    it('finds every game created from one planned game', async () => {
      await setPlanLink('game-a', { planId: 'p1', planGameId: 'g1' });
      await setPlanLink('game-b', { planId: 'p1', planGameId: 'g1' });
      await setPlanLink('game-c', { planId: 'p1', planGameId: 'g2' });
      expect((await getGamesForPlanGame('p1', 'g1')).sort()).toEqual(['game-a', 'game-b']);
    });

    it('does not cross plans that share a planned-game id', async () => {
      await setPlanLink('mine', { planId: 'p1', planGameId: 'g1' });
      await setPlanLink('theirs', { planId: 'p2', planGameId: 'g1' });
      expect(await getGamesForPlanGame('p1', 'g1')).toEqual(['mine']);
      expect(await getGamesForPlanGame('p2', 'g1')).toEqual(['theirs']);
    });

    it('returns nothing for a planned game no match came from', async () => {
      await setPlanLink('game-a', { planId: 'p1', planGameId: 'g1' });
      expect(await getGamesForPlanGame('p1', 'g-none')).toEqual([]);
      expect(await getGamesForPlanGame('p-none', 'g1')).toEqual([]);
    });
  });

});
