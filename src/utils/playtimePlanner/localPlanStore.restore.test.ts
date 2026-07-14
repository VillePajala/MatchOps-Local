/**
 * Direct tests for the cloud-hydration merge paths of the local plan store:
 * restorePlans (schema gate + per-plan LWW, timestamps PRESERVED) and
 * restorePlanLinks / restoreGameSubs (fill locally-absent entries only).
 * These run during sign-in hydration and reverse migration - real merge
 * logic that previously shipped with no dedicated coverage.
 * @critical a bad merge here silently loses or resurrects user plans
 */

import { createLocalPlanStore, type LocalPlanStore } from './localPlanStore';
import { PLAYTIME_PLAN_SCHEMA_VERSION, type PlaytimePlan } from './types';
import {
  PLAYTIME_PLANS_KEY,
  PLAYTIME_PLAN_LINKS_KEY,
  PLAYTIME_GAME_SUBS_KEY,
} from '@/config/storageKeys';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// In-memory backing store, JSON round-tripped like the real adapter.
let store: Record<string, string> = {};
const io = {
  getJSON: async <T,>(key: string, defaultValue: T): Promise<T> => {
    const raw = store[key];
    return raw === undefined ? defaultValue : (JSON.parse(raw) as T);
  },
  setJSON: async (key: string, value: unknown): Promise<void> => {
    store[key] = JSON.stringify(value);
  },
};

let planStore: LocalPlanStore;

beforeEach(() => {
  store = {};
  planStore = createLocalPlanStore(io);
});

const plan = (over: Partial<PlaytimePlan> = {}): PlaytimePlan => ({
  id: 'ptp_1',
  name: 'Cup',
  version: PLAYTIME_PLAN_SCHEMA_VERSION,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  archived: false,
  players: [{ id: 'p1', name: 'Alex' }],
  games: [
    {
      id: 'ptg_1',
      label: 'Game 1',
      formationId: '5v5-2-2',
      numberOfPeriods: 2,
      periodMinutes: 12,
      included: true,
      startingSlots: [],
      subs: [],
    },
  ],
  ...over,
});

const storedPlans = (): Record<string, PlaytimePlan> =>
  JSON.parse(store[PLAYTIME_PLANS_KEY] ?? '{}');

describe('restorePlans', () => {
  it('applies a cloud plan absent locally, PRESERVING its cloud timestamp', async () => {
    const cloud = plan({ updatedAt: '2026-02-01T00:00:00.000Z' });
    await expect(planStore.restorePlans({ [cloud.id]: cloud })).resolves.toBe(1);
    // Timestamp must NOT be re-stamped to "now" - that would make every
    // hydrated copy look like the newest edit and defeat per-plan LWW.
    expect(storedPlans()[cloud.id].updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('the newer copy wins per plan, in both directions', async () => {
    const localNewer = plan({ id: 'a', name: 'Local newer', updatedAt: '2026-03-01T00:00:00.000Z' });
    const localOlder = plan({ id: 'b', name: 'Local older', updatedAt: '2026-01-01T00:00:00.000Z' });
    store[PLAYTIME_PLANS_KEY] = JSON.stringify({ a: localNewer, b: localOlder });

    const cloudOlder = plan({ id: 'a', name: 'Cloud older', updatedAt: '2026-02-01T00:00:00.000Z' });
    const cloudNewer = plan({ id: 'b', name: 'Cloud newer', updatedAt: '2026-02-01T00:00:00.000Z' });
    await expect(planStore.restorePlans({ a: cloudOlder, b: cloudNewer })).resolves.toBe(1);

    expect(storedPlans().a.name).toBe('Local newer'); // local won
    expect(storedPlans().b.name).toBe('Cloud newer'); // cloud won
  });

  it('skips (never edits, never drops) a plan from a NEWER app schema', async () => {
    const future = plan({ id: 'f', version: PLAYTIME_PLAN_SCHEMA_VERSION + 1 });
    await expect(planStore.restorePlans({ f: future })).resolves.toBe(0);
    expect(storedPlans().f).toBeUndefined(); // not written locally
  });
});

describe('restorePlanLinks / restoreGameSubs', () => {
  it('fills only locally-absent links - a local link always wins', async () => {
    store[PLAYTIME_PLAN_LINKS_KEY] = JSON.stringify({
      game_1: { planId: 'local-plan', planGameId: 'ptg_local' },
    });
    const n = await planStore.restorePlanLinks({
      game_1: { planId: 'cloud-plan', planGameId: 'ptg_cloud' },
      game_2: { planId: 'cloud-plan', planGameId: 'ptg_cloud2' },
    });
    expect(n).toBe(1);
    const links = JSON.parse(store[PLAYTIME_PLAN_LINKS_KEY]);
    expect(links.game_1.planId).toBe('local-plan'); // untouched
    expect(links.game_2.planId).toBe('cloud-plan'); // filled in
  });

  it('fills only locally-absent, non-empty sub schedules', async () => {
    const localSubs = [{ id: 'l1', slotId: 'gk', inPlayerId: 'p1', outPlayerId: null, timeSeconds: 600 }];
    store[PLAYTIME_GAME_SUBS_KEY] = JSON.stringify({ game_1: localSubs });
    const cloudSubs = [{ id: 'c1', slotId: 's0', inPlayerId: 'p2', outPlayerId: null, timeSeconds: 720 }];
    const n = await planStore.restoreGameSubs({
      game_1: cloudSubs, // local exists - must win
      game_2: cloudSubs, // absent - filled
      game_3: [], // empty - not worth a key
    });
    expect(n).toBe(1);
    const subs = JSON.parse(store[PLAYTIME_GAME_SUBS_KEY]);
    expect(subs.game_1[0].id).toBe('l1');
    expect(subs.game_2[0].id).toBe('c1');
    expect(subs.game_3).toBeUndefined();
  });
});

describe('corrupt planned-sub validation (read path)', () => {
  it('drops a game entry carrying non-finite or negative timeSeconds (reminder-timing poison)', async () => {
    // One corrupt sub drops that GAME's entry (documented per-entry tolerance),
    // never the sibling games. 1e999 parses to Infinity - non-finite.
    store[PLAYTIME_GAME_SUBS_KEY] =
      '{"game_ok":[{"id":"ok","slotId":"gk","inPlayerId":"p1","outPlayerId":null,"timeSeconds":600}],' +
      '"game_inf":[{"id":"inf","slotId":"gk","inPlayerId":"p1","outPlayerId":null,"timeSeconds":1e999}],' +
      '"game_neg":[{"id":"neg","slotId":"gk","inPlayerId":"p1","outPlayerId":null,"timeSeconds":-5}]}';
    await expect(planStore.getGameSubs('game_ok')).resolves.toHaveLength(1);
    await expect(planStore.getGameSubs('game_inf')).resolves.toEqual([]);
    await expect(planStore.getGameSubs('game_neg')).resolves.toEqual([]);
  });
});
