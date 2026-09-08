/**
 * Kirjuri voice clips - device-local audio storage.
 *
 * Raw recordings live in a DEDICATED IndexedDB database
 * (`matchops_audio_{userId}` / `MatchOpsLocal_Audio` for anonymous), never in
 * the app's string-only KV store and never in a game object. The isolation is
 * deliberate:
 * - Audio is bulky; the live games blob shares one 10 MB key.
 * - Audio must NEVER sync, export, or back up (the full-backup allowlist and
 *   the sync entity registry do not know this DB, so exclusion is structural).
 * - Only account deletion removes it (deleteAudioDatabase, GDPR erasure).
 *
 * Retention: a clip is deleted when its note is accepted (PR 3) and, whatever
 * happens, after MAX_CLIP_AGE_MS (rotateOldClips runs when a session arms).
 * See docs/03-active-plans/kirjuri-ai-plan.md.
 */

import logger from '@/utils/logger';
import { validateUserId } from '@/datastore/userDatabase';

const CLIP_STORE = 'clips';
const LEGACY_AUDIO_DB_NAME = 'MatchOpsLocal_Audio';
const USER_AUDIO_DB_PREFIX = 'matchops_audio_';

/** Hard retention cap for raw audio, accepted or not. */
export const MAX_CLIP_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Refuse a write that would push usage past this share of the quota. */
const QUOTA_HEADROOM = 0.95;

export interface AudioClipMeta {
  id: string;
  gameId: string;
  /** Match clock (seconds) when the coach pressed the button. */
  time: number;
  /** Period the clock was in when the clip started. */
  period: number;
  createdAt: string;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  /**
   * What the provider wrote out for this clip, once the coach has paid to have
   * it transcribed. Kept with the clip rather than in component state so that
   * closing the review screen does not throw the words away and make the coach
   * pay a second time for the same audio.
   */
  transcript?: string;
}

/** Stored form: raw bytes (structured-clone safe in every engine); Blob is rebuilt on read. */
export interface AudioClipRecord extends AudioClipMeta {
  data: ArrayBuffer;
}

export class AudioQuotaError extends Error {
  constructor(message = 'Not enough storage for voice notes') {
    super(message);
    this.name = 'AudioQuotaError';
  }
}

/** Exported so account deletion can target the same DB. */
export function getAudioDatabaseName(userId?: string): string {
  if (!userId) return LEGACY_AUDIO_DB_NAME;
  const result = validateUserId(userId);
  if (!result.valid) {
    logger.warn('[audioClipStore] Invalid userId for audio DB name; using legacy DB', { error: result.error });
    return LEGACY_AUDIO_DB_NAME;
  }
  return `${USER_AUDIO_DB_PREFIX}${result.trimmedId}`;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * True when this user's audio database already exists. The read-mostly paths
 * (rotation on inbox open, per-game cleanup on delete) check this first so they
 * never create an empty database for a coach who has never dictated. Browsers
 * without `indexedDB.databases()` report true and open as before.
 */
async function audioDbExists(userId?: string): Promise<boolean> {
  const list = (indexedDB as { databases?: () => Promise<Array<{ name?: string }>> }).databases;
  if (typeof list !== 'function') return true;
  try {
    const name = getAudioDatabaseName(userId);
    return (await list.call(indexedDB)).some((db) => db.name === name);
  } catch {
    return true;
  }
}

function openDb(userId?: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(getAudioDatabaseName(userId), 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CLIP_STORE)) {
        const store = db.createObjectStore(CLIP_STORE, { keyPath: 'id' });
        store.createIndex('gameId', 'gameId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  userId: string | undefined,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb(userId);
  try {
    const tx = db.transaction(CLIP_STORE, mode);
    // Handlers first: the transaction auto-commits as soon as its last request
    // settles, so attaching oncomplete after `run` could miss the event.
    const completed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    const result = await run(tx.objectStore(CLIP_STORE));
    await completed;
    return result;
  } finally {
    db.close();
  }
}

function toMeta(record: AudioClipRecord): AudioClipMeta {
  const { data: _data, ...meta } = record;
  return meta;
}

/**
 * True when `bytes` more would still leave the quota headroom. Unknown quota
 * (no estimate API) counts as OK - the write itself surfaces a real failure.
 */
export async function hasRoomFor(bytes: number): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return true;
    const { usage, quota } = await navigator.storage.estimate();
    if (!quota) return true;
    return (usage ?? 0) + bytes <= quota * QUOTA_HEADROOM;
  } catch {
    return true;
  }
}

export async function saveClip(record: AudioClipRecord, userId?: string): Promise<void> {
  if (!hasIndexedDb()) throw new Error('IndexedDB unavailable');
  if (!(await hasRoomFor(record.sizeBytes))) {
    throw new AudioQuotaError();
  }
  await withStore('readwrite', userId, (store) => promisifyRequest(store.put(record)).then(() => undefined));
}

/** Clip metadata for a game, oldest clock time first (no blobs). */
export async function listClips(gameId: string, userId?: string): Promise<AudioClipMeta[]> {
  if (!hasIndexedDb()) return [];
  const records = await withStore('readonly', userId, (store) =>
    promisifyRequest(store.index('gameId').getAll(gameId) as IDBRequest<AudioClipRecord[]>),
  );
  return records.map(toMeta).sort((a, b) => a.time - b.time);
}

export async function countClips(gameId: string, userId?: string): Promise<number> {
  if (!hasIndexedDb()) return 0;
  return withStore('readonly', userId, (store) => promisifyRequest(store.index('gameId').count(gameId)));
}

export async function getClipBlob(id: string, userId?: string): Promise<Blob | null> {
  if (!hasIndexedDb()) return null;
  const record = await withStore('readonly', userId, (store) =>
    promisifyRequest(store.get(id) as IDBRequest<AudioClipRecord | undefined>),
  );
  return record ? new Blob([record.data], { type: record.mimeType }) : null;
}

export async function deleteClip(id: string, userId?: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await withStore('readwrite', userId, (store) => promisifyRequest(store.delete(id)).then(() => undefined));
}

export async function deleteClipsForGame(gameId: string, userId?: string): Promise<number> {
  if (!hasIndexedDb() || !(await audioDbExists(userId))) return 0;
  return withStore('readwrite', userId, async (store) => {
    const keys = await promisifyRequest(store.index('gameId').getAllKeys(gameId));
    for (const key of keys) {
      await promisifyRequest(store.delete(key));
    }
    return keys.length;
  });
}

/**
 * Remember what a clip says. Best effort: a failed write costs a re-transcribe,
 * never the coach's text, which is already on screen.
 */
export async function setClipTranscript(id: string, transcript: string, userId?: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await withStore('readwrite', userId, async (store) => {
    const existing = (await promisifyRequest(store.get(id))) as AudioClipRecord | undefined;
    if (!existing) return;
    await promisifyRequest(store.put({ ...existing, transcript }));
  });
}

/** Delete every clip older than MAX_CLIP_AGE_MS. Returns how many were removed. */
export async function rotateOldClips(now: number = Date.now(), userId?: string): Promise<number> {
  if (!hasIndexedDb() || !(await audioDbExists(userId))) return 0;
  const cutoff = new Date(now - MAX_CLIP_AGE_MS).toISOString();
  return withStore('readwrite', userId, async (store) => {
    const keys = await promisifyRequest(store.index('createdAt').getAllKeys(IDBKeyRange.upperBound(cutoff, true)));
    for (const key of keys) {
      await promisifyRequest(store.delete(key));
    }
    if (keys.length > 0) {
      logger.info('[audioClipStore] Rotated expired voice clips', { count: keys.length });
    }
    return keys.length;
  });
}

/** Remove all clips (Settings "delete all recordings" and pre-erasure). */
export async function deleteAllClips(userId?: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await withStore('readwrite', userId, (store) => promisifyRequest(store.clear()).then(() => undefined));
}

/** Drop the whole database - account deletion only. Resolves on blocked too (best effort). */
export function deleteAudioDatabase(userId?: string): Promise<void> {
  if (!hasIndexedDb()) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    try {
      const request = indexedDB.deleteDatabase(getAudioDatabaseName(userId));
      request.onsuccess = done;
      request.onerror = () => {
        logger.warn('[audioClipStore] deleteDatabase failed', { error: request.error });
        done();
      };
      request.onblocked = done;
    } catch (error) {
      logger.warn('[audioClipStore] deleteDatabase threw', error);
      done();
    }
  });
}
