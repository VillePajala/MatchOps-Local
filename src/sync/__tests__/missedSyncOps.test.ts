import { recordMissedSyncOp, loadMissedSyncOps, hasMissedSyncOps, replayMissedSyncOps, clearMissedSyncOps } from '../missedSyncOps';
import type { SyncOperationInput } from '../types';

const store: Record<string, string> = {};
jest.mock('@/utils/storage', () => ({
  getUserStorageAdapter: jest.fn(async () => ({
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete store[k]; }),
  })),
}));

const op = (id: string, n: number): SyncOperationInput => ({
  entityType: 'game', entityId: id, operation: 'update', data: { id, n }, timestamp: n,
});

/**
 * Review 3.9: a change saved locally that could not be queued is kept and queued once
 * the queue works again, including after a restart.
 * @critical
 */
describe('missedSyncOps', () => {
  let n = 0;
  let u = 'user-0';
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    u = `user-${++n}`;
  });

  it('keeps the latest change per item and replays them oldest first', async () => {
    await recordMissedSyncOp(u, op('g1', 1));
    await recordMissedSyncOp(u, op('g2', 2));
    await recordMissedSyncOp(u, op('g1', 3)); // newer edit of g1 replaces the first
    const queued: SyncOperationInput[] = [];
    expect(await replayMissedSyncOps(u, async (o) => { queued.push(o); })).toBe(2);
    expect(queued.map((o) => [o.entityId, (o.data as { n: number }).n])).toEqual([['g2', 2], ['g1', 3]]);
    expect(hasMissedSyncOps(u)).toBe(false);
    expect(store.matchops_missed_sync_ops).toBeUndefined();
  });

  it('survives a restart (stored) and keeps what still cannot be queued', async () => {
    await recordMissedSyncOp(u, op('g1', 1));
    // a fresh session: load from storage under another in-memory slate
    const restored = JSON.parse(store.matchops_missed_sync_ops);
    expect(restored).toHaveLength(1);
    await loadMissedSyncOps(u);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await replayMissedSyncOps(u, async () => { throw new Error('queue still closed'); })).toBe(0);
    warn.mockRestore();
    expect(hasMissedSyncOps(u)).toBe(true);
  });

  it('is cleared with the account data', async () => {
    await recordMissedSyncOp(u, op('g1', 1));
    await clearMissedSyncOps(u);
    expect(hasMissedSyncOps(u)).toBe(false);
    expect(store.matchops_missed_sync_ops).toBeUndefined();
  });
});
