/**
 * The cloud version each game's LOCAL copy is based on, per account (review 3.7).
 *
 * Saving a game sends the version its copy was based on, so the server can refuse a
 * save made on an outdated copy (optimistic locking). Before this record existed the
 * save sent whatever version the cloud had just before saving - so the check could
 * never fail on a stale copy, and a device holding a pre-match copy overwrote the
 * finished match.
 *
 * Updated when this device learns the cloud's version for its copy: after a successful
 * save (the new version), when the startup pull writes the cloud copy locally, and when
 * a refused save adopts the cloud copy. Missing for games this device has not synced
 * since the record was introduced: callers then fall back to the old behaviour.
 *
 * Stored in the account's own on-device storage, mirrored in memory for this tab.
 * Versions only ever increase, so a record never moves backwards (a pull that fetched
 * before this device's own save landed must not lower it). Never throws: a failed read
 * means "unknown" (fall back); a failed write drops the stored entry so it reads as
 * unknown next session rather than as an outdated version.
 */
import logger from '@/utils/logger';

const KEY = 'matchops_game_cloud_versions';

// This tab's latest known version per account+game (survives a failed storage write).
const known = new Map<string, number>();
const keyOf = (userId: string, gameId: string) => `${userId}\u0000${gameId}`;

// Serialises read-modify-write updates (saves and the pull can overlap).
let chain: Promise<unknown> = Promise.resolve();
function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function adapterFor(userId: string) {
  const { getUserStorageAdapter } = await import('@/utils/storage');
  return getUserStorageAdapter(userId);
}

async function readAll(userId: string): Promise<Record<string, number>> {
  const raw = await (await adapterFor(userId)).getItem(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'number'),
      ) as Record<string, number>;
    }
  } catch {
    // damaged record: treated as empty (versions are re-learned on the next sync)
  }
  return {};
}

/**
 * The cloud version this device's copy of the game is based on, or undefined if unknown.
 * This tab's in-memory value wins when present (it is always the latest this tab set,
 * and survives a failed storage write); otherwise the stored one.
 */
export async function getGameBaseVersion(userId: string, gameId: string): Promise<number | undefined> {
  const inMemory = known.get(keyOf(userId, gameId));
  if (inMemory !== undefined) return inMemory;
  try {
    return (await readAll(userId))[gameId];
  } catch (error) {
    logger.warn('[gameBaseVersions] Could not read', { error });
    return undefined;
  }
}

/**
 * Record the cloud version this device's copy of the game is now based on.
 * `exact`: this device just wrote or adopted exactly this version, so it is the truth
 * even if lower (a game deleted and re-created in the cloud restarts at 1). Without it
 * (the startup pull, which fetched earlier) a record never moves backwards.
 */
export function setGameBaseVersion(
  userId: string,
  gameId: string,
  version: number,
  options: { exact?: boolean } = {},
): Promise<void> {
  const k = keyOf(userId, gameId);
  if (options.exact || (known.get(k) ?? -Infinity) < version) known.set(k, version);
  return serialised(async () => {
    try {
      const all = await readAll(userId);
      if (all[gameId] === version) return;
      if (!options.exact && (all[gameId] ?? -Infinity) > version) return; // never move backwards
      all[gameId] = version;
      await (await adapterFor(userId)).setItem(KEY, JSON.stringify(all));
    } catch (error) {
      logger.warn('[gameBaseVersions] Could not record - dropping the stored entry', { gameId, error });
      try {
        const all = await readAll(userId);
        if (gameId in all) {
          delete all[gameId];
          await (await adapterFor(userId)).setItem(KEY, JSON.stringify(all));
        }
      } catch {
        // storage unusable; the in-memory value still guards this tab
      }
    }
  });
}

/** Forget the record (the game was deleted). */
export function clearGameBaseVersion(userId: string, gameId: string): Promise<void> {
  known.delete(keyOf(userId, gameId));
  return serialised(async () => {
    try {
      const all = await readAll(userId);
      if (!(gameId in all)) return;
      delete all[gameId];
      await (await adapterFor(userId)).setItem(KEY, JSON.stringify(all));
    } catch (error) {
      logger.warn('[gameBaseVersions] Could not clear', { gameId, error });
    }
  });
}

// ---------------------------------------------------------------------------
// Unconfirmed saves (review 3.7)
// ---------------------------------------------------------------------------
// Every save carries a random write id, and the cloud row keeps the id of the save that
// last wrote it (games.last_write_id, migration 055). A save whose reply was lost is
// still listed here, so when the next save is refused the device can tell "the cloud
// holds MY earlier save" (not a conflict) from "another device saved" (a real one).
// Stored, so a reply lost just before the app was closed is still recognised.

const PENDING_KEY = 'matchops_game_pending_writes';
const MAX_PENDING_PER_GAME = 20;
// This tab's copy: a pending id is recognised even if storing it failed.
const pendingInMemory = new Map<string, Set<string>>();

async function readPending(userId: string): Promise<Record<string, string[]>> {
  const raw = await (await adapterFor(userId)).getItem(PENDING_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>)
          .filter(([, v]) => Array.isArray(v))
          .map(([k, v]) => [k, (v as unknown[]).filter((x): x is string => typeof x === 'string')]),
      );
    }
  } catch {
    // damaged: treated as empty
  }
  return {};
}

/** Remember a save about to be sent (before sending it). Never throws. */
export function addPendingWrite(userId: string, gameId: string, writeId: string): Promise<void> {
  const k = keyOf(userId, gameId);
  const mem = pendingInMemory.get(k) ?? new Set<string>();
  mem.add(writeId);
  pendingInMemory.set(k, mem);
  return serialised(async () => {
    try {
      const all = await readPending(userId);
      const list = [...(all[gameId] ?? []), writeId].slice(-MAX_PENDING_PER_GAME);
      all[gameId] = list;
      await (await adapterFor(userId)).setItem(PENDING_KEY, JSON.stringify(all));
    } catch (error) {
      logger.warn('[gameBaseVersions] Could not record a pending save', { gameId, error });
    }
  });
}

/** Whether this write id is one of this device's unconfirmed saves of the game. */
export async function isPendingWrite(userId: string, gameId: string, writeId: string): Promise<boolean> {
  if (pendingInMemory.get(keyOf(userId, gameId))?.has(writeId)) return true;
  try {
    return (await readPending(userId))[gameId]?.includes(writeId) ?? false;
  } catch {
    return false;
  }
}

/** The game's saves are confirmed up to the current version: forget the list. */
export function clearPendingWrites(userId: string, gameId: string): Promise<void> {
  pendingInMemory.delete(keyOf(userId, gameId));
  return serialised(async () => {
    try {
      const all = await readPending(userId);
      if (!(gameId in all)) return;
      delete all[gameId];
      await (await adapterFor(userId)).setItem(PENDING_KEY, JSON.stringify(all));
    } catch (error) {
      logger.warn('[gameBaseVersions] Could not clear pending saves', { gameId, error });
    }
  });
}
