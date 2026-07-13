/**
 * SupabaseDataStore — Playing-Time Planner methods (cloud sync PR 2).
 *
 * The plan travels as an opaque jsonb blob (no field transforms), so these
 * tests pin the parts that CAN go wrong: table/column mapping, the composite
 * onConflict targets, per-entry validation on read, and the version/updatedAt
 * stamping that must match the local store byte-for-byte in shape.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { SupabaseDataStore } from '../SupabaseDataStore';
import { PLAYTIME_PLAN_SCHEMA_VERSION, type PlaytimePlan } from '@/utils/playtimePlanner/types';

interface MockQueryBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  upsert: jest.Mock;
  eq: jest.Mock;
  maybeSingle: jest.Mock;
  order: jest.Mock;
}

const createMockQueryBuilder = (): MockQueryBuilder => {
  const builder: MockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    order: jest.fn().mockReturnThis(),
  };
  return builder;
};

let mockQueryBuilder = createMockQueryBuilder();

const mockUser = { id: 'user_123_abc', email: 'test@example.com' };

const mockRpc = jest.fn().mockResolvedValue({ data: true, error: null });

const mockSupabaseClient = {
  from: jest.fn(() => mockQueryBuilder),
  rpc: (...args: unknown[]) => mockRpc(...args),
  auth: {
    getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    getSession: jest.fn().mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    }),
  },
} as unknown as SupabaseClient<Database>;

jest.mock('@/datastore/supabase', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}));

jest.mock('@/utils/logger', () => {
  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: mockLogger, createLogger: () => mockLogger };
});

// Cut the transitive IndexedDB bootstrap chain (same as the main suite).
jest.mock('@/utils/storage', () => ({
  setStorageItem: jest.fn().mockResolvedValue(undefined),
  getStorageItem: jest.fn().mockResolvedValue(null),
  removeStorageItem: jest.fn().mockResolvedValue(undefined),
  getAllStorageData: jest.fn().mockResolvedValue({}),
  getStorageJSON: jest.fn().mockResolvedValue(null),
  setStorageJSON: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/datastore/supabase/retry', () => {
  const actual = jest.requireActual('@/datastore/supabase/retry');
  return {
    ...actual,
    withRetry: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    throwIfTransient: jest.fn((result: unknown) => result),
  };
});

const validPlan: PlaytimePlan = {
  id: 'ptp_1',
  name: 'Saved Cup',
  version: PLAYTIME_PLAN_SCHEMA_VERSION,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
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
};

const originalNavigator = global.navigator;

describe('SupabaseDataStore — playtime planner', () => {
  let dataStore: SupabaseDataStore;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQueryBuilder = createMockQueryBuilder();
    (mockSupabaseClient.from as jest.Mock).mockReturnValue(mockQueryBuilder);
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });
    dataStore = new SupabaseDataStore();
    await dataStore.initialize();
  });

  afterEach(async () => {
    await dataStore.close();
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('savePlaytimePlan uses the conditional-LWW RPC, PRESERVING the edit-time stamp', async () => {
    const saved = await dataStore.savePlaytimePlan(validPlan);

    // Migration 038: the write is a CONDITIONAL upsert (applies only when the
    // incoming stamp >= the stored row's) - a late offline push cannot regress
    // a newer cloud row. The blob preserves the edit-time stamp.
    expect(mockRpc).toHaveBeenCalledWith('save_playtime_plan', {
      p_id: 'ptp_1',
      p_name: 'Saved Cup',
      p_archived: false,
      p_data: expect.objectContaining({
        id: 'ptp_1',
        version: PLAYTIME_PLAN_SCHEMA_VERSION,
        updatedAt: validPlan.updatedAt,
      }),
      p_updated_at: validPlan.updatedAt,
    });
    expect(saved?.updatedAt).toBe(validPlan.updatedAt);
  });

  it('savePlaytimePlan returns null when the LWW RPC refuses the write (cloud row newer)', async () => {
    // Migration 038's RPC returns false when the stored row's stamp is newer.
    // That refusal must surface as null (interface: "null on failure/not
    // applied") so the sync layer reconciles instead of celebrating.
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(dataStore.savePlaytimePlan(validPlan)).resolves.toBeNull();
  });

  it('getPlaytimePlans returns valid blobs and DROPS a malformed row without failing', async () => {
    mockQueryBuilder.eq.mockResolvedValueOnce({
      data: [
        { id: 'ptp_1', data: validPlan },
        { id: 'ptp_bad', data: { hello: 'not a plan' } },
      ],
      error: null,
    });

    const plans = await dataStore.getPlaytimePlans();
    expect(Object.keys(plans)).toEqual(['ptp_1']);
    expect(plans.ptp_1.name).toBe('Saved Cup');
  });

  it('deletePlaytimePlan deletes by user AND id', async () => {
    // delete().eq(user).eq(id): the second eq terminates the chain.
    mockQueryBuilder.eq
      .mockReturnValueOnce(mockQueryBuilder)
      .mockResolvedValueOnce({ error: null });

    await expect(dataStore.deletePlaytimePlan('ptp_1')).resolves.toBe(true);
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('playtime_plans');
    expect(mockQueryBuilder.delete).toHaveBeenCalled();
    expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(1, 'user_id', mockUser.id);
    expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(2, 'id', 'ptp_1');
  });

  it('getPlaytimePlanLinks maps rows into the gameId-keyed collection', async () => {
    mockQueryBuilder.eq.mockResolvedValueOnce({
      data: [{ game_id: 'game_1', plan_id: 'ptp_1', plan_game_id: 'ptg_1' }],
      error: null,
    });

    const links = await dataStore.getPlaytimePlanLinks();
    expect(links).toEqual({ game_1: { planId: 'ptp_1', planGameId: 'ptg_1' } });
  });

  it('setPlaytimeGameSubs upserts per real game with the composite conflict target', async () => {
    const subs = [{ id: 'x1', slotId: 'gk', inPlayerId: 'p2', outPlayerId: null, timeSeconds: 720 }];
    await expect(dataStore.setPlaytimeGameSubs('game_1', subs)).resolves.toBe(true);

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('playtime_game_subs');
    const [row, opts] = mockQueryBuilder.upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: 'user_id,game_id' });
    expect(row.game_id).toBe('game_1');
    expect(row.subs).toEqual(subs);
  });

  it('getPlaytimeGameSubs returns [] for a missing row and the array when present', async () => {
    // maybeSingle default resolves { data: null } -> []
    await expect(dataStore.getPlaytimeGameSubs('game_1')).resolves.toEqual([]);

    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { subs: [{ id: 'x1', slotId: 'gk', inPlayerId: 'p2', outPlayerId: null, timeSeconds: 720 }] },
      error: null,
    });
    await expect(dataStore.getPlaytimeGameSubs('game_1')).resolves.toEqual([
      { id: 'x1', slotId: 'gk', inPlayerId: 'p2', outPlayerId: null, timeSeconds: 720 },
    ]);
  });

  it('deleteGame also cascades the planner tables (plan link + game subs) app-side', async () => {
    // No game_id FK exists (deliberate - sync ordering), so cloud deleteGame
    // must clean these rows itself or a lost companion op orphans them forever.
    // eq sequence: games (id -> user_id resolves w/ count), then per table
    // (user_id -> game_id resolves).
    mockQueryBuilder.eq
      .mockReturnValueOnce(mockQueryBuilder)
      .mockResolvedValueOnce({ error: null, count: 1 })
      .mockReturnValueOnce(mockQueryBuilder)
      .mockResolvedValueOnce({ error: null })
      .mockReturnValueOnce(mockQueryBuilder)
      .mockResolvedValueOnce({ error: null });

    await expect(dataStore.deleteGame('game_1')).resolves.toBe(true);

    const tables = (mockSupabaseClient.from as jest.Mock).mock.calls.map((c) => c[0]);
    expect(tables).toEqual(expect.arrayContaining(['games', 'playtime_plan_links', 'playtime_game_subs']));
  });

  it('deletePlaytimePlanLinksForPlan deletes by user AND plan id', async () => {
    mockQueryBuilder.eq
      .mockReturnValueOnce(mockQueryBuilder)
      .mockResolvedValueOnce({ error: null });

    await expect(dataStore.deletePlaytimePlanLinksForPlan('ptp_1')).resolves.toBe(true);
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('playtime_plan_links');
    expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(2, 'plan_id', 'ptp_1');
  });
});
