import {
  getGameBaseVersion, setGameBaseVersion, clearGameBaseVersion,
  addPendingWrite, isPendingWrite, clearPendingWrites,
} from '../gameBaseVersions';

const store: Record<string, string> = {};
let failWrites = 0; // number of upcoming writes that fail
jest.mock('@/utils/storage', () => ({
  getUserStorageAdapter: jest.fn(async () => ({
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      if (failWrites > 0) { failWrites--; throw new Error('quota'); }
      store[k] = v;
    }),
  })),
}));

/** Review 3.7: the cloud version each local game copy is based on, per account. */
describe('gameBaseVersions', () => {
  // The module also remembers versions in memory for the tab: each test uses its own
  // account id so those do not carry over.
  let n = 0;
  let u = 'user-0';
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    failWrites = 0;
    u = `user-${++n}`;
  });

  it('is unknown until recorded, then remembers per game', async () => {
    expect(await getGameBaseVersion(u, 'g1')).toBeUndefined();
    await setGameBaseVersion(u, 'g1', 4);
    await setGameBaseVersion(u, 'g2', 7);
    expect(await getGameBaseVersion(u, 'g1')).toBe(4);
    expect(await getGameBaseVersion(u, 'g2')).toBe(7);
  });

  it('keeps every update when several are made at once', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((n) => setGameBaseVersion(u, `g${n}`, n)));
    for (const n of [1, 2, 3, 4, 5]) expect(await getGameBaseVersion(u, `g${n}`)).toBe(n);
  });

  it('never moves backwards (a pull that fetched before this device\'s own save landed)', async () => {
    await setGameBaseVersion(u, 'g1', 6);
    await setGameBaseVersion(u, 'g1', 5);
    expect(await getGameBaseVersion(u, 'g1')).toBe(6);
    // ...and in storage, which is what the next session reads.
    expect(JSON.parse(store.matchops_game_cloud_versions).g1).toBe(6);
  });

  it('a failed write leaves this tab knowing the version, and storage reading unknown', async () => {
    await setGameBaseVersion(u, 'g9', 3);
    failWrites = 1; // the write of 4 fails (transient); dropping the stale 3 then works
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await setGameBaseVersion(u, 'g9', 4);
    expect(warn).toHaveBeenCalled(); // the failure is reported, not hidden
    warn.mockRestore();
    expect(await getGameBaseVersion(u, 'g9')).toBe(4); // this tab: in memory
    expect(JSON.parse(store.matchops_game_cloud_versions).g9).toBeUndefined(); // storage: dropped, not stale
  });

  it('an exact record may go down (the cloud row was re-created and restarted at 1)', async () => {
    await setGameBaseVersion(u, 'g1', 7);
    await setGameBaseVersion(u, 'g1', 1, { exact: true });
    expect(await getGameBaseVersion(u, 'g1')).toBe(1);
    expect(JSON.parse(store.matchops_game_cloud_versions).g1).toBe(1);
  });

  it('an unconfirmed save is recognised even if storing it failed', async () => {
    failWrites = 1;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await addPendingWrite(u, 'g1', 'w1');
    warn.mockRestore();
    expect(await isPendingWrite(u, 'g1', 'w1')).toBe(true);
  });

  it('remembers unconfirmed saves per game until confirmed', async () => {
    await addPendingWrite(u, 'g1', 'w1');
    await addPendingWrite(u, 'g1', 'w2');
    expect(await isPendingWrite(u, 'g1', 'w1')).toBe(true);
    expect(await isPendingWrite(u, 'g1', 'other')).toBe(false);
    expect(await isPendingWrite(u, 'g2', 'w1')).toBe(false);
    await clearPendingWrites(u, 'g1');
    expect(await isPendingWrite(u, 'g1', 'w2')).toBe(false);
  });

  it('forgets a deleted game', async () => {
    await setGameBaseVersion(u, 'g1', 4);
    await clearGameBaseVersion(u, 'g1');
    expect(await getGameBaseVersion(u, 'g1')).toBeUndefined();
  });

  it('a damaged record reads as unknown, and is replaced on the next write', async () => {
    store.matchops_game_cloud_versions = '{not json';
    expect(await getGameBaseVersion(u, 'g1')).toBeUndefined();
    await setGameBaseVersion(u, 'g1', 2);
    expect(await getGameBaseVersion(u, 'g1')).toBe(2);
  });
});
