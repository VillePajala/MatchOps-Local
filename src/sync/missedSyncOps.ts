/**
 * Changes that were saved locally but could not be added to the sync queue (review 3.9).
 *
 * If the queue's database is unusable (the browser closed it and reopening failed, or
 * the store was closing), the local write succeeds but the change never reaches the
 * cloud: the device's copy looks newer than the cloud's, so the startup pull skips it,
 * and it stays local until the coach happens to edit that item again.
 *
 * Instead, the latest snapshot of each such change is kept here - in memory and in the
 * account's own key-value storage (a different database from the queue) - and replayed
 * into the queue as soon as the queue works again, including after a restart.
 * Never throws.
 */
import logger from '@/utils/logger';
import type { SyncOperationInput } from './types';

const KEY = 'matchops_missed_sync_ops';
/** In memory, per account: latest op per entity. */
const memory = new Map<string, Map<string, SyncOperationInput>>();

const entityKey = (op: Pick<SyncOperationInput, 'entityType' | 'entityId'>) => `${op.entityType}\u0000${op.entityId}`;

async function adapterFor(userId: string) {
  const { getUserStorageAdapter } = await import('@/utils/storage');
  return getUserStorageAdapter(userId);
}

async function persist(userId: string): Promise<void> {
  const ops = [...(memory.get(userId)?.values() ?? [])];
  const adapter = await adapterFor(userId);
  if (ops.length === 0) await adapter.removeItem(KEY);
  else await adapter.setItem(KEY, JSON.stringify(ops));
}

/** Remember a change that could not be queued (the latest one per entity wins). */
export async function recordMissedSyncOp(userId: string, op: SyncOperationInput): Promise<void> {
  const forUser = memory.get(userId) ?? new Map<string, SyncOperationInput>();
  forUser.set(entityKey(op), op);
  memory.set(userId, forUser);
  try {
    await persist(userId);
  } catch (error) {
    logger.warn('[missedSyncOps] Could not store a missed change - kept in memory only, so it is lost if the app closes before the queue works again', { error });
  }
}

/** Load changes missed in an earlier session into memory. */
export async function loadMissedSyncOps(userId: string): Promise<void> {
  try {
    const raw = await (await adapterFor(userId)).getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    const forUser = memory.get(userId) ?? new Map<string, SyncOperationInput>();
    for (const op of parsed as SyncOperationInput[]) {
      if (op && typeof op.entityType === 'string' && typeof op.entityId === 'string'
        && typeof op.operation === 'string' && typeof op.timestamp === 'number' && Number.isFinite(op.timestamp)
        && !forUser.has(entityKey(op))) {
        forUser.set(entityKey(op), op);
      }
    }
    memory.set(userId, forUser);
  } catch (error) {
    logger.warn('[missedSyncOps] Could not read missed changes', { error });
  }
}

/**
 * A newer change to this entity was queued: an older missed snapshot must never be
 * replayed over it (it would replace the newer op, or undo a delete).
 */
export async function discardMissedSyncOp(userId: string, entityType: string, entityId: string): Promise<void> {
  const forUser = memory.get(userId);
  if (!forUser?.delete(entityKey({ entityType: entityType as SyncOperationInput['entityType'], entityId }))) return;
  try {
    await persist(userId);
  } catch (error) {
    logger.warn('[missedSyncOps] Could not update stored missed changes', { error });
  }
}

export function hasMissedSyncOps(userId: string): boolean {
  return (memory.get(userId)?.size ?? 0) > 0;
}

/**
 * Hand the missed changes to `enqueue`, oldest first. Each one that is queued is
 * forgotten; one that still cannot be queued stays for the next attempt.
 */
export async function replayMissedSyncOps(
  userId: string,
  enqueue: (op: SyncOperationInput) => Promise<unknown>,
): Promise<number> {
  const forUser = memory.get(userId);
  if (!forUser || forUser.size === 0) return 0;
  const ops = [...forUser.values()].sort((a, b) => a.timestamp - b.timestamp);
  let replayed = 0;
  for (const op of ops) {
    try {
      await enqueue(op); // original timestamp: it is older than anything queued since
      forUser.delete(entityKey(op));
      replayed++;
    } catch (error) {
      logger.warn('[missedSyncOps] Still cannot queue a missed change; will retry', { entityType: op.entityType, error });
      break;
    }
  }
  try {
    await persist(userId);
  } catch (error) {
    logger.warn('[missedSyncOps] Could not update stored missed changes', { error });
  }
  if (replayed > 0) logger.info(`[missedSyncOps] Queued ${replayed} change(s) that had missed the sync queue`);
  return replayed;
}

/** Forget everything (the account's data was cleared). */
export async function clearMissedSyncOps(userId: string): Promise<void> {
  memory.delete(userId);
  try {
    await (await adapterFor(userId)).removeItem(KEY);
  } catch {
    // the account store is being cleared anyway
  }
}
