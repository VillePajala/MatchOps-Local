/**
 * Tests for the Phase-3 plan-link store (local-only, keyed by game id).
 * @critical the plan link must round-trip and tolerate corrupt storage - it lives
 * here precisely because the game blob (autosave/cloud rebuilds) kept dropping it.
 */

import {
  getAllPlanLinks,
  getPlanLink,
  setPlanLink,
  deletePlanLink,
  deletePlanLinksForPlan,
} from './planLinks';
import { PLAYTIME_PLAN_LINKS_KEY } from '@/config/storageKeys';

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
});
