/**
 * Automatic local restore points (Data Safety - Layer 1).
 *
 * Keeps a small, rotating set of full-backup snapshots in a DEDICATED IndexedDB
 * database (`matchops_backups_{userId}` / `MatchOpsLocal_Backups` for anonymous),
 * separate from the live data database. The isolation is deliberate:
 * - Corruption of the live games blob does NOT take the restore points with it.
 * - A normal "clear all data" / restore-from-backup does NOT delete restore points
 *   (that is the whole point of having them).
 * - Only true account deletion removes them (see deleteBackupsDatabase + GDPR erasure).
 *
 * Snapshots reuse the existing, well-tested `generateFullBackupJson` /
 * `importFullBackup` round-trip - this module only manages WHEN snapshots are taken
 * and where they are stored.
 *
 * See docs/03-active-plans/data-safety-and-backup.md.
 */

import logger from '@/utils/logger';
import { validateUserId } from '@/datastore/userDatabase';
import { generateFullBackupJson } from '@/utils/fullBackup';

/** Object store holding the snapshot records. */
const SNAPSHOT_STORE = 'snapshots';
/** Backups DB name for anonymous/local-only mode (mirrors LEGACY_DATABASE_NAME). */
const LEGACY_BACKUPS_DB_NAME = 'MatchOpsLocal_Backups';
/** Prefix for user-scoped backups databases. */
const USER_BACKUPS_DB_PREFIX = 'matchops_backups_';

/** Keep at most this many restore points; the oldest is rotated out. */
export const MAX_SNAPSHOTS = 5;
/** Auto-snapshot on app open only if the newest is older than this. */
export const AUTO_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Why a snapshot was taken (for display + debugging). */
export type SnapshotReason = 'auto' | 'pre-restore' | 'pre-clear' | 'manual';

/** A one-line content summary, shown in the restore-point list. */
export interface SnapshotSummary {
  games: number;
  players: number;
  seasons: number;
  tournaments: number;
}

/** Metadata for a stored snapshot (everything except the heavy JSON payload). */
export interface SnapshotMeta {
  id: string;
  createdAt: string; // ISO timestamp
  reason: SnapshotReason;
  summary: SnapshotSummary;
  sizeBytes: number;
}

/** A full stored snapshot record (metadata + the backup JSON string). */
interface SnapshotRecord extends SnapshotMeta {
  json: string;
}

/**
 * Resolve the backups database name for a user (or anonymous/local mode).
 * Exported so account deletion can target the same DB.
 */
export function getBackupsDatabaseName(userId?: string): string {
  if (!userId) {
    return LEGACY_BACKUPS_DB_NAME;
  }
  const result = validateUserId(userId);
  if (!result.valid) {
    // Fall back to the legacy DB rather than throwing - a bad id must never
    // crash the (best-effort) backup path.
    logger.warn('[backupSnapshots] Invalid userId for backups DB name; using legacy DB', { error: result.error });
    return LEGACY_BACKUPS_DB_NAME;
  }
  return `${USER_BACKUPS_DB_PREFIX}${result.trimmedId}`;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(userId?: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(getBackupsDatabaseName(userId), 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
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

/**
 * Ask the browser for persistent storage so IndexedDB (live data AND these
 * restore points) is far less likely to be evicted under storage pressure.
 * Best-effort and idempotent; returns whether storage is now persisted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return false;
    }
    if (navigator.storage.persisted) {
      const already = await navigator.storage.persisted();
      if (already) return true;
    }
    const granted = await navigator.storage.persist();
    logger.log('[backupSnapshots] navigator.storage.persist() ->', granted);
    return granted;
  } catch (error) {
    logger.warn('[backupSnapshots] requestPersistentStorage failed (non-fatal):', error);
    return false;
  }
}

function summarize(json: string): SnapshotSummary {
  const parsed = JSON.parse(json) as {
    localStorage?: Record<string, unknown>;
  };
  const ls = parsed.localStorage ?? {};
  const games = ls['savedSoccerGames'];
  const players = ls['soccerMasterRoster'];
  const seasons = ls['soccerSeasons'];
  const tournaments = ls['soccerTournaments'];
  return {
    games: games && typeof games === 'object' ? Object.keys(games).length : 0,
    players: Array.isArray(players) ? players.length : 0,
    seasons: Array.isArray(seasons) ? seasons.length : 0,
    tournaments: Array.isArray(tournaments) ? tournaments.length : 0,
  };
}

/** Delete snapshots beyond MAX_SNAPSHOTS, oldest first. */
async function rotate(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
  const store = tx.objectStore(SNAPSHOT_STORE);
  const all = (await promisifyRequest(store.getAll())) as SnapshotRecord[];
  if (all.length <= MAX_SNAPSHOTS) return;
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // oldest first
  const excess = all.length - MAX_SNAPSHOTS;
  for (let i = 0; i < excess; i++) {
    store.delete(all[i].id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Capture a full snapshot of the user's data and store it as a restore point.
 * Best-effort: returns the new snapshot's metadata, or null on any failure
 * (never throws - a backup failure must not break the calling flow).
 */
export async function createSnapshot(userId?: string, reason: SnapshotReason = 'manual'): Promise<SnapshotMeta | null> {
  if (!hasIndexedDb()) return null;
  let db: IDBDatabase | null = null;
  try {
    const json = await generateFullBackupJson(userId);

    // Light sanity check - never store an obviously broken snapshot. (The heavy
    // structural validation lives in importFullBackup, on the untrusted-import path;
    // our own freshly-generated export is trusted, so a parse + shape check suffices.)
    const parsed = JSON.parse(json) as { meta?: unknown; localStorage?: unknown };
    if (!parsed || typeof parsed !== 'object' || !parsed.localStorage) {
      logger.warn('[backupSnapshots] Generated snapshot failed sanity check; not stored');
      return null;
    }

    // Derive id + createdAt from a single timestamp so behavior is deterministic
    // under a mocked Date.now() (and the id sorts in creation order).
    const now = Date.now();
    const meta: SnapshotMeta = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(now).toISOString(),
      reason,
      summary: summarize(json),
      sizeBytes: json.length,
    };
    const record: SnapshotRecord = { ...meta, json };

    db = await openDb(userId);
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
    tx.objectStore(SNAPSHOT_STORE).put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    await rotate(db);
    logger.log('[backupSnapshots] Stored restore point', { reason, summary: meta.summary });
    return meta;
  } catch (error) {
    logger.warn('[backupSnapshots] createSnapshot failed (non-fatal):', error);
    return null;
  } finally {
    db?.close();
  }
}

/** Newest snapshot creation time in ms, or null if there are none. */
export async function getNewestSnapshotTime(userId?: string): Promise<number | null> {
  if (!hasIndexedDb()) return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb(userId);
    const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
    const all = (await promisifyRequest(tx.objectStore(SNAPSHOT_STORE).getAll())) as SnapshotRecord[];
    if (all.length === 0) return null;
    return all.reduce((max, r) => Math.max(max, new Date(r.createdAt).getTime()), 0);
  } catch (error) {
    logger.warn('[backupSnapshots] getNewestSnapshotTime failed (non-fatal):', error);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Take an automatic snapshot if the newest one is older than the auto interval
 * (or there are none). Call on app open. Best-effort; returns the new snapshot
 * metadata, or null if none was taken / on failure.
 */
export async function maybeCreateAutoSnapshot(userId?: string): Promise<SnapshotMeta | null> {
  const newest = await getNewestSnapshotTime(userId);
  if (newest !== null && Date.now() - newest < AUTO_SNAPSHOT_INTERVAL_MS) {
    return null; // fresh enough
  }
  return createSnapshot(userId, 'auto');
}

/** List snapshot metadata, newest first (without the heavy JSON payloads). */
export async function listSnapshots(userId?: string): Promise<SnapshotMeta[]> {
  if (!hasIndexedDb()) return [];
  let db: IDBDatabase | null = null;
  try {
    db = await openDb(userId);
    const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
    const all = (await promisifyRequest(tx.objectStore(SNAPSHOT_STORE).getAll())) as SnapshotRecord[];
    return all
      .map(({ json, ...meta }) => { void json; return meta; })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    logger.warn('[backupSnapshots] listSnapshots failed (non-fatal):', error);
    return [];
  } finally {
    db?.close();
  }
}

/** Get the backup JSON string for a snapshot id, or null if not found. */
export async function getSnapshotJson(userId: string | undefined, id: string): Promise<string | null> {
  if (!hasIndexedDb()) return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb(userId);
    const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
    const record = (await promisifyRequest(tx.objectStore(SNAPSHOT_STORE).get(id))) as SnapshotRecord | undefined;
    return record?.json ?? null;
  } catch (error) {
    logger.warn('[backupSnapshots] getSnapshotJson failed (non-fatal):', error);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Delete the entire backups database for a user. Used ONLY on true account
 * deletion (GDPR erasure) - never on a normal data clear or restore.
 * Best-effort; never rejects.
 */
export function deleteBackupsDatabase(userId?: string): Promise<void> {
  if (!hasIndexedDb()) return Promise.resolve();
  const name = getBackupsDatabaseName(userId);
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => {
        logger.info('[backupSnapshots] Deleted backups database', { name });
        done();
      };
      request.onerror = () => {
        logger.warn('[backupSnapshots] Failed to delete backups database', { name });
        done();
      };
      request.onblocked = done;
    } catch {
      done();
    }
    // Never hang a deletion flow.
    setTimeout(done, 3000);
  });
}
