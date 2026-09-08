/**
 * Kirjuri audio clip store - real IndexedDB via fake-indexeddb.
 * @critical - raw audio must stay device-local, per-game addressable, and expire.
 */
import 'fake-indexeddb/auto';
import v8 from 'v8';

// jsdom's environment has no structuredClone; fake-indexeddb needs one that
// survives ArrayBuffers (the JSON polyfill in backupSnapshots.test would not).
if (typeof structuredClone === 'undefined') {
  global.structuredClone = <T,>(value: T): T => v8.deserialize(v8.serialize(value)) as T;
}
import {
  AudioQuotaError,
  MAX_CLIP_AGE_MS,
  countClips,
  deleteAllClips,
  deleteAudioDatabase,
  deleteClip,
  deleteClipsForGame,
  getAudioDatabaseName,
  getClipBlob,
  listClips,
  rotateOldClips,
  saveClip,
} from '../audioClipStore';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const bytes = (text: string): ArrayBuffer => Uint8Array.from(text, (c) => c.charCodeAt(0)).buffer as ArrayBuffer;

const clip = (overrides: Partial<Parameters<typeof saveClip>[0]> = {}) => ({
  id: `clip-${Math.random().toString(36).slice(2)}`,
  gameId: 'g1',
  time: 100,
  period: 1,
  createdAt: new Date().toISOString(),
  durationMs: 1200,
  mimeType: 'audio/webm',
  sizeBytes: 3,
  data: bytes('abc'),
  ...overrides,
});

afterEach(async () => {
  await deleteAudioDatabase();
});

describe('audioClipStore', () => {
  it('saves, lists per game in clock order, and counts', async () => {
    await saveClip(clip({ id: 'b', time: 300 }));
    await saveClip(clip({ id: 'a', time: 120 }));
    await saveClip(clip({ id: 'other', gameId: 'g2' }));

    const clips = await listClips('g1');
    expect(clips.map((c) => c.id)).toEqual(['a', 'b']);
    expect(clips[0]).not.toHaveProperty('data'); // metadata only
    expect(await countClips('g1')).toBe(2);
    expect(await countClips('g2')).toBe(1);
  });

  it('rebuilds a Blob with the stored bytes and type', async () => {
    await saveClip(clip({ id: 'x', mimeType: 'audio/webm', data: bytes('hello') }));
    const blob = await getClipBlob('x');
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('audio/webm');
    expect(blob!.size).toBe(5);
    expect(await getClipBlob('missing')).toBeNull();
  });

  it('deletes one clip and all clips of a game', async () => {
    await saveClip(clip({ id: 'a' }));
    await saveClip(clip({ id: 'b' }));
    await saveClip(clip({ id: 'c', gameId: 'g2' }));

    await deleteClip('a');
    expect(await countClips('g1')).toBe(1);
    expect(await deleteClipsForGame('g1')).toBe(1);
    expect(await countClips('g1')).toBe(0);
    expect(await countClips('g2')).toBe(1);
    await deleteAllClips();
    expect(await countClips('g2')).toBe(0);
  });

  /** @critical - the 30-day hard cap is a privacy promise. */
  it('rotates clips older than the retention cap and keeps the rest', async () => {
    const now = Date.parse('2026-09-04T10:00:00Z');
    await saveClip(clip({ id: 'old', createdAt: new Date(now - MAX_CLIP_AGE_MS - 1000).toISOString() }));
    await saveClip(clip({ id: 'fresh', createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString() }));

    expect(await rotateOldClips(now)).toBe(1);
    expect((await listClips('g1')).map((c) => c.id)).toEqual(['fresh']);
  });

  it('refuses a write that would exceed the storage quota', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: jest.fn().mockResolvedValue({ usage: 100, quota: 100 }) },
    });
    try {
      await expect(saveClip(clip())).rejects.toBeInstanceOf(AudioQuotaError);
    } finally {
      if (original) Object.defineProperty(navigator, 'storage', original);
      else delete (navigator as unknown as { storage?: unknown }).storage;
    }
  });

  it('rotation and per-game cleanup never create a database for a user who has not recorded', async () => {
    const fresh = '22222222-2222-4222-8222-222222222222';
    expect(await rotateOldClips(Date.now(), fresh)).toBe(0);
    expect(await deleteClipsForGame('g1', fresh)).toBe(0);
    const names = (await indexedDB.databases()).map((db) => db.name);
    expect(names).not.toContain(getAudioDatabaseName(fresh));
  });

  it('names the database per user, legacy when anonymous', () => {
    expect(getAudioDatabaseName()).toBe('MatchOpsLocal_Audio');
    expect(getAudioDatabaseName('11111111-1111-4111-8111-111111111111')).toBe(
      'matchops_audio_11111111-1111-4111-8111-111111111111',
    );
  });
});
