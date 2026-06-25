/**
 * Tests for automatic local restore points (Data Safety - Layer 1).
 * @critical - this is a data-recovery safety net; its correctness protects user data.
 *
 * Uses real IndexedDB via fake-indexeddb. Time is controlled by mocking Date.now()
 * only (the module derives createdAt from Date.now()), so fake timers are not needed
 * and don't interfere with fake-indexeddb's async scheduling.
 */

// Polyfill structuredClone for older Node
if (typeof structuredClone === 'undefined') {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Control the data captured by snapshots.
const mockGenerate = jest.fn();
jest.mock('@/utils/fullBackup', () => ({
  generateFullBackupJson: (...args: unknown[]) => mockGenerate(...args),
}));

import {
  createSnapshot,
  maybeCreateAutoSnapshot,
  listSnapshots,
  getSnapshotJson,
  getNewestSnapshotTime,
  deleteBackupsDatabase,
  getBackupsDatabaseName,
  requestPersistentStorage,
  MAX_SNAPSHOTS,
  AUTO_SNAPSHOT_INTERVAL_MS,
} from './backupSnapshots';

const buildBackupJson = (overrides?: {
  games?: Record<string, unknown>;
  players?: unknown[];
  seasons?: unknown[];
  tournaments?: unknown[];
}) =>
  JSON.stringify({
    meta: { schema: 1, exportedAt: '2026-06-25T00:00:00.000Z' },
    localStorage: {
      savedSoccerGames: overrides?.games ?? { g1: {}, g2: {} },
      soccerMasterRoster: overrides?.players ?? [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      soccerSeasons: overrides?.seasons ?? [{ id: 's1' }],
      soccerTournaments: overrides?.tournaments ?? [],
    },
  });

describe('backupSnapshots (Layer 1 restore points)', () => {
  let nowMs: number;

  beforeEach(() => {
    // Fresh IndexedDB per test for isolation.
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
    nowMs = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    mockGenerate.mockReset();
    mockGenerate.mockImplementation(() => Promise.resolve(buildBackupJson()));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getBackupsDatabaseName', () => {
    it('uses a user-scoped name when a userId is given', () => {
      expect(getBackupsDatabaseName('abc-123')).toBe('matchops_backups_abc-123');
    });

    it('uses the legacy name for anonymous mode', () => {
      expect(getBackupsDatabaseName()).toBe('MatchOpsLocal_Backups');
    });

    it('falls back to the legacy name for an invalid userId instead of throwing', () => {
      expect(getBackupsDatabaseName('../evil')).toBe('MatchOpsLocal_Backups');
    });
  });

  it('creates a snapshot and lists it with a correct content summary', async () => {
    const meta = await createSnapshot('user1', 'manual');

    expect(meta).not.toBeNull();
    expect(meta!.reason).toBe('manual');
    expect(meta!.summary).toEqual({ games: 2, players: 3, seasons: 1, tournaments: 0 });

    const list = await listSnapshots('user1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(meta!.id);
    // Listing must not leak the heavy json payload.
    expect((list[0] as unknown as { json?: string }).json).toBeUndefined();
  });

  it('round-trips the backup JSON via getSnapshotJson', async () => {
    const json = buildBackupJson({ games: { only: {} } });
    mockGenerate.mockResolvedValueOnce(json);

    const meta = await createSnapshot('user1', 'auto');
    const stored = await getSnapshotJson('user1', meta!.id);

    expect(stored).toBe(json);
  });

  it('returns null from getSnapshotJson for an unknown id', async () => {
    await createSnapshot('user1');
    expect(await getSnapshotJson('user1', 'nope')).toBeNull();
  });

  it('keeps only the newest MAX_SNAPSHOTS, rotating out the oldest', async () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) {
      await createSnapshot('user1', 'auto');
      nowMs += 1000; // advance so createdAt is strictly increasing
    }

    const list = await listSnapshots('user1');
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    // Newest first, and strictly descending by createdAt (oldest were dropped).
    const times = list.map((s) => new Date(s.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('isolates snapshots per user (separate databases)', async () => {
    await createSnapshot('userA');
    expect(await listSnapshots('userA')).toHaveLength(1);
    expect(await listSnapshots('userB')).toHaveLength(0);
  });

  describe('maybeCreateAutoSnapshot', () => {
    it('creates one when there are no snapshots yet', async () => {
      const meta = await maybeCreateAutoSnapshot('user1');
      expect(meta).not.toBeNull();
      expect(meta!.reason).toBe('auto');
    });

    it('does NOT create one when a fresh snapshot already exists', async () => {
      await createSnapshot('user1', 'auto');
      nowMs += AUTO_SNAPSHOT_INTERVAL_MS - 1000; // still within the window
      const meta = await maybeCreateAutoSnapshot('user1');
      expect(meta).toBeNull();
      expect(await listSnapshots('user1')).toHaveLength(1);
    });

    it('creates one when the newest snapshot is older than the interval', async () => {
      await createSnapshot('user1', 'auto');
      nowMs += AUTO_SNAPSHOT_INTERVAL_MS + 1000; // past the window
      const meta = await maybeCreateAutoSnapshot('user1');
      expect(meta).not.toBeNull();
      expect(await listSnapshots('user1')).toHaveLength(2);
    });
  });

  it('reports the newest snapshot time', async () => {
    expect(await getNewestSnapshotTime('user1')).toBeNull();
    await createSnapshot('user1');
    expect(await getNewestSnapshotTime('user1')).toBe(nowMs);
  });

  it('does not throw and returns null when backup generation fails', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('boom'));
    const meta = await createSnapshot('user1', 'auto');
    expect(meta).toBeNull();
    expect(await listSnapshots('user1')).toHaveLength(0);
  });

  it('does not store a snapshot whose generated payload is malformed', async () => {
    mockGenerate.mockResolvedValueOnce('not json{');
    const meta = await createSnapshot('user1', 'auto');
    expect(meta).toBeNull();
    expect(await listSnapshots('user1')).toHaveLength(0);
  });

  it('deletes the backups database (account deletion / GDPR erasure)', async () => {
    await createSnapshot('user1');
    expect(await listSnapshots('user1')).toHaveLength(1);

    await deleteBackupsDatabase('user1');
    expect(await listSnapshots('user1')).toHaveLength(0);
  });

  describe('requestPersistentStorage', () => {
    it('returns false when the Storage API is unavailable', async () => {
      const original = Object.getOwnPropertyDescriptor(global, 'navigator');
      Object.defineProperty(global, 'navigator', { value: {}, configurable: true });
      try {
        expect(await requestPersistentStorage()).toBe(false);
      } finally {
        if (original) Object.defineProperty(global, 'navigator', original);
        else delete (global as { navigator?: unknown }).navigator;
      }
    });

    it('requests persistence and returns the grant result', async () => {
      const persist = jest.fn().mockResolvedValue(true);
      const persisted = jest.fn().mockResolvedValue(false);
      const original = Object.getOwnPropertyDescriptor(global, 'navigator');
      Object.defineProperty(global, 'navigator', {
        value: { storage: { persist, persisted } },
        configurable: true,
      });
      try {
        expect(await requestPersistentStorage()).toBe(true);
        expect(persist).toHaveBeenCalled();
      } finally {
        if (original) Object.defineProperty(global, 'navigator', original);
        else delete (global as { navigator?: unknown }).navigator;
      }
    });
  });
});
