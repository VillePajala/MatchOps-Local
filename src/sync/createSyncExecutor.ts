/**
 * Sync Executor Factory
 *
 * Creates a SyncOperationExecutor that syncs operations to a cloud DataStore.
 * Used by the factory to connect SyncedDataStore to SupabaseDataStore.
 *
 * Includes timestamp-based conflict resolution:
 * - When a sync fails with a conflict error (unique constraint violation),
 *   fetches the cloud version and compares timestamps
 * - Newer version wins (last-write-wins)
 * - If cloud wins, updates local store with cloud data
 * - If local wins, pushes local data to cloud
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import type { DataStore } from '@/interfaces/DataStore';
import type { SyncCheckedTable, SyncWriteOptions } from '@/datastore/SupabaseDataStore';
import type { SyncOperation, SyncEntityType } from './types';
import type { SyncOperationExecutor } from './SyncEngine';
import type {
  Player,
  Team,
  TeamPlayer,
  Season,
  Tournament,
  PlayerStatAdjustment,
} from '@/types';
import type { AppState } from '@/types/game';
import type { Personnel } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { PlanLink } from '@/utils/playtimePlanner/planLinks';
import type { PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import { normalizeGameThemes } from '@/pelitapa/gameThemeTypes';
import type { AppSettings } from '@/types/settings';
import { SyncError, SyncErrorCode } from './types';
import {
  ConflictResolver,
  isAutoResolvableConflict,
  type CloudRecord,
  type CloudRecordFetcher,
  type CloudRecordWriter,
  type CloudRecordDeleter,
  type LocalRecordWriter,
} from './conflictResolution';
import logger from '@/utils/logger';
import { ConflictError } from '@/interfaces/DataStoreErrors';

import { CLOUD_COPY_ADOPTED_EVENT, GAME_REPLACED_BY_CLOUD_EVENT, markGameReplacedByCloud } from './syncEvents';
import * as Sentry from '@sentry/nextjs';

/** Optional hooks into the queue that owns the executor. */
export interface SyncExecutorHooks {
  /**
   * A refused save adopted the cloud copy (review 3.7): every other queued change to
   * this entity was made on the same outdated copy and must not be pushed.
   */
  discardQueuedChanges?: (entityType: SyncEntityType, entityId: string) => Promise<{ deleteQueued: boolean }>;
  /**
   * Whether the queued op was superseded by a newer change to the same entity while
   * in flight (review 3.6b) - read live from the queue, as the executor's copy of the
   * op predates the mark.
   */
  isOperationSuperseded?: (opId: string) => Promise<boolean>;
}

/**
 * Non-game entities whose queued writes the cloud checks before applying (review
 * 3.13b, migration 059): the newer edit wins, and a record deleted on another device
 * stays deleted. Rosters (replaced as a whole), games (base versions, 3.7) and the
 * playtime planner (own LWW RPC, 038) are handled elsewhere.
 */
const SYNC_CHECKED_TABLES: Partial<Record<SyncEntityType, SyncCheckedTable>> = {
  player: 'players',
  team: 'teams',
  season: 'seasons',
  tournament: 'tournaments',
  personnel: 'personnel',
  settings: 'user_settings',
  playerAdjustment: 'player_adjustments',
  warmupPlan: 'warmup_plans',
};

/** The cloud write methods that accept the checked edit time. */
const SYNC_WRITE_METHODS = new Set([
  'upsertPlayer', 'upsertTeam', 'upsertSeason', 'upsertTournament',
  'upsertPersonnelMember', 'saveSettings', 'upsertPlayerAdjustment', 'saveWarmupPlan',
]);

interface SyncWriteAwareStore {
  checkSyncWrite(
    table: SyncCheckedTable,
    rowId: string,
    editAgeMs: number,
  ): Promise<{ verdict: 'apply' | 'stale' | 'deleted'; editedAt: string } | null>;
}
const isSyncWriteAware = (store: unknown): store is SyncWriteAwareStore =>
  typeof (store as Partial<SyncWriteAwareStore>)?.checkSyncWrite === 'function';

/**
 * The cloud store, with the checked edit time added to its write methods - so the
 * per-entity sync functions stay unchanged.
 */
function withSyncWriteOptions(store: DataStore, options: SyncWriteOptions): DataStore {
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      if (typeof prop === 'string' && SYNC_WRITE_METHODS.has(prop)) {
        return (arg: unknown) => (value as (a: unknown, o: SyncWriteOptions) => unknown).call(target, arg, options);
      }
      return (value as (...args: unknown[]) => unknown).bind(target);
    },
  });
}

/** The SupabaseDataStore methods used for game version checks (review 3.7). */
interface VersionAwareGameStore {
  saveGame(id: string, game: AppState, options?: { useRecordedBase?: boolean }): Promise<AppState>;
  fetchCloudGameWithVersion(gameId: string): Promise<{ game: AppState; version: number } | null>;
  recordGameBaseVersion(gameId: string, version: number): Promise<void>;
}
let warnedNotVersionAware = false;
const isVersionAware = (store: unknown): store is VersionAwareGameStore =>
  typeof (store as Partial<VersionAwareGameStore>)?.fetchCloudGameWithVersion === 'function'
  && typeof (store as Partial<VersionAwareGameStore>)?.recordGameBaseVersion === 'function';


/**
 * Validate that data is a non-null object before type assertion.
 * This is the boundary between local and cloud data - we must validate
 * to prevent corrupting cloud data with invalid data.
 *
 * Note: This function validates basic structure (non-null object) but not
 * the object's shape (required fields, field types). This is acceptable because:
 * - Data flows from SyncedDataStore which wraps LocalDataStore
 * - LocalDataStore validates entities on write (createPlayer, updateTeam, etc.)
 * - By the time data reaches the sync queue, it has already passed validation
 *
 * The `data as T` casts after validation are safe given this data flow.
 * If data corruption becomes a concern, consider adding Zod schema validation.
 *
 * @throws SyncError if data is not a valid object
 */
function validateObjectData(
  data: unknown,
  entityType: string,
  operation: string,
  entityId?: string
): void {
  const idContext = entityId ? ` (id: ${entityId})` : '';
  if (data === null || data === undefined) {
    throw new SyncError(
      SyncErrorCode.INVALID_DATA,
      `Cannot ${operation} ${entityType}${idContext}: data is ${data === null ? 'null' : 'undefined'}`
    );
  }
  if (typeof data !== 'object') {
    throw new SyncError(
      SyncErrorCode.INVALID_DATA,
      `Cannot ${operation} ${entityType}${idContext}: data must be an object, got ${typeof data}`
    );
  }
  // Arrays are objects in JS but not valid entity data (except for teamRoster which uses validateArrayData)
  if (Array.isArray(data)) {
    throw new SyncError(
      SyncErrorCode.INVALID_DATA,
      `Cannot ${operation} ${entityType}${idContext}: data must be an object, not an array`
    );
  }

  // Validate id field exists and matches entityId (catches schema drift or data corruption)
  const dataObj = data as Record<string, unknown>;
  if (entityId && dataObj.id !== undefined && dataObj.id !== entityId) {
    throw new SyncError(
      SyncErrorCode.INVALID_DATA,
      `Cannot ${operation} ${entityType}${idContext}: data.id "${dataObj.id}" does not match entityId "${entityId}"`
    );
  }
}

/**
 * Validate that data is an array before type assertion.
 *
 * @throws SyncError if data is not a valid array
 */
function validateArrayData(
  data: unknown,
  entityType: string,
  operation: string,
  entityId?: string
): void {
  const idContext = entityId ? ` (id: ${entityId})` : '';
  if (!Array.isArray(data)) {
    throw new SyncError(
      SyncErrorCode.INVALID_DATA,
      `Cannot ${operation} ${entityType}${idContext}: data must be an array, got ${typeof data}`
    );
  }
}

/**
 * Create a sync executor that syncs operations to the given cloud store.
 *
 * The executor maps each SyncOperation to the appropriate DataStore method:
 * - create/update → upsert methods (handles both cases)
 * - delete → delete methods
 *
 * Includes timestamp-based conflict resolution:
 * - When a sync fails with a conflict error, compares timestamps
 * - Newer version wins (last-write-wins strategy)
 * - If cloud wins, updates local store
 * - If local wins, retries push to cloud
 *
 * @param cloudStore - The cloud DataStore to sync to (e.g., SupabaseDataStore)
 * @param localStore - Optional local DataStore for conflict resolution (required for cloud-wins scenarios)
 * @returns SyncOperationExecutor function
 */
export function createSyncExecutor(
  cloudStore: DataStore,
  localStore?: DataStore,
  hooks: SyncExecutorHooks = {},
): SyncOperationExecutor {
  // Create conflict resolver if we have both stores
  const cloudFetcher = createCloudFetcher(cloudStore);
  const localWriter = localStore ? createLocalWriter(localStore) : null;
  let conflictResolver: ConflictResolver | null = null;
  if (localStore) {
    conflictResolver = new ConflictResolver({
      fetchFromCloud: cloudFetcher,
      writeToCloud: createCloudWriter(cloudStore),
      deleteFromCloud: createCloudDeleter(cloudStore),
      writeToLocal: localWriter!,
      isSuperseded: hooks.isOperationSuperseded
        ? (op) => hooks.isOperationSuperseded!(op.id)
        : undefined,
    });
  }

  const isSuperseded = async (op: SyncOperation): Promise<boolean> => {
    if (!hooks.isOperationSuperseded) return false;
    try {
      return await hooks.isOperationSuperseded(op.id);
    } catch (error) {
      logger.warn('[SyncExecutor] Supersede check failed; treating the op as current', {
        entityType: op.entityType,
        entityId: op.entityId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  /**
   * The cloud refused a queued write (review 3.13b): the cloud copy wins.
   * - stale: another device made a newer edit - store the cloud copy on this device;
   * - deleted: another device deleted the record - remove it here too, unless this
   *   device still uses it (a season/tournament/team its games point at): then it is
   *   pushed back as an ordinary write, since removing it would orphan those games.
   * A newer local change to the same record (superseded op) is left alone - it is
   * checked on its own. The op completes either way: no retry loop.
   */
  const handleRefusedSyncWrite = async (verdict: 'stale' | 'deleted', op: SyncOperation): Promise<void> => {
    const { entityType, entityId } = op;
    logger.info('[SyncExecutor] Cloud refused a queued write; the cloud copy wins', { entityType, entityId, verdict });
    if (!localStore) return;
    if (await isSuperseded(op)) return;
    await adoptCloudOutcome(verdict, op);
    // Open screens and caches still hold the older copy - re-read.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CLOUD_COPY_ADOPTED_EVENT, { detail: { entityType, entityId } }));
    }
  };

  const adoptCloudOutcome = async (verdict: 'stale' | 'deleted', op: SyncOperation): Promise<void> => {
    if (!localStore) return;
    const { entityType, entityId, data } = op;

    if (verdict === 'stale') {
      const cloudRecord = await cloudFetcher(entityType, entityId, data);
      if (cloudRecord) {
        let record = cloudRecord;
        if (entityType === 'settings') {
          // Which game this device has open is per device (review 3.13b, #7).
          const local = await localStore.getSettings();
          record = { ...cloudRecord, currentGameId: local.currentGameId } as typeof cloudRecord;
        }
        await localWriter!(entityType, entityId, record);
        return;
      }
      // Gone from the cloud since the check: treat as deleted.
    }

    switch (entityType) {
      case 'player':
        await localStore.deletePlayer(entityId);
        return;
      case 'personnel':
        await localStore.removePersonnelMember(entityId);
        return;
      case 'playerAdjustment': {
        const playerId = (data as { playerId?: string } | null)?.playerId;
        if (playerId) await localStore.deletePlayerAdjustment(playerId, entityId);
        return;
      }
      case 'warmupPlan':
        await localStore.deleteWarmupPlan();
        return;
      case 'season':
      case 'tournament':
      case 'team': {
        const refs = entityType === 'season'
          ? await localStore.getSeasonReferences(entityId)
          : entityType === 'tournament'
            ? await localStore.getTournamentReferences(entityId)
            : await localStore.getTeamReferences(entityId);
        if (refs.canDelete) {
          if (entityType === 'season') await localStore.deleteSeason(entityId);
          else if (entityType === 'tournament') await localStore.deleteTournament(entityId);
          else await localStore.deleteTeam(entityId);
          return;
        }
        logger.info('[SyncExecutor] Deleted elsewhere but still used here - pushing it back', { entityType, entityId });
        await executeSyncOperation(cloudStore, op, localStore, () => isSuperseded(op));
        if (entityType === 'team') {
          // The cloud delete cascaded the team's roster rows: push this device's back.
          await cloudStore.setTeamRoster(entityId, await localStore.getTeamRoster(entityId));
        }
        return;
      }
      default:
        return; // settings: a single row, never deleted
    }
  };

  return async (op: SyncOperation): Promise<void> => {
    const { entityType, entityId, operation } = op;

    logger.debug('[SyncExecutor] Executing sync operation', {
      entityType,
      entityId,
      operation,
    });

    try {
      // Review 3.13b: a queued write of a checked entity asks the cloud first. The
      // edit's age is measured on this device's clock only; the server compares it on
      // its own clock. Only 'apply' writes, carrying the server's edit time.
      let writeStore: DataStore = cloudStore;
      const checkedTable = SYNC_CHECKED_TABLES[entityType];
      if (checkedTable && operation !== 'delete' && isSyncWriteAware(cloudStore)) {
        // null: the database has no check yet (migration 059 not applied) - write unchecked.
        const check = await cloudStore.checkSyncWrite(checkedTable, entityId, Date.now() - op.timestamp);
        if (check && check.verdict !== 'apply') {
          await handleRefusedSyncWrite(check.verdict, op);
          return;
        }
        if (check) writeStore = withSyncWriteOptions(cloudStore, { editedAt: check.editedAt });
      }

      await executeSyncOperation(writeStore, op, localStore, () => isSuperseded(op));

      logger.debug('[SyncExecutor] Sync operation completed', {
        entityType,
        entityId,
        operation,
      });
    } catch (error) {
      // A game save refused because this device's copy is outdated (optimistic locking,
      // review 3.7). Decision: the cloud version wins - it was saved by a device that had
      // the newer game (typically the match itself). Retrying used to re-fetch the
      // cloud's version and overwrite the match; instead adopt the cloud copy locally,
      // drop the other changes queued on the same outdated copy, and tell the UI. (The
      // refused copy's conflict_backup_<id> is cleared by the next successful save; no
      // screen offers it, so the outdated edit is not recoverable in the app.)
      if (error instanceof ConflictError && entityType === 'game' && localStore && isVersionAware(cloudStore)) {
        // Only another device's save reaches here: this device's own earlier save
        // (reply lost) is recognised and retried inside saveGame (last_write_id).
        const cloud = await cloudStore.fetchCloudGameWithVersion(entityId);
        if (cloud) {
          const notify = () => {
            try {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(GAME_REPLACED_BY_CLOUD_EVENT, { detail: { gameId: entityId } }));
              }
            } catch {
              // best effort
            }
          };
          // Block the outdated copy still in memory (an open match) FIRST: it must not
          // write over the cloud copy stored below, and once the base version is
          // updated its pushes would pass the check. Never lifted: the page remounts
          // the match on the current copy (a lifted block left a match that loaded in
          // between wrongly blocked). The block is per tab (single-tab model).
          markGameReplacedByCloud(entityId);
          let deleteQueued = false;
          try {
            // Edits queued on the outdated copy go; a queued DELETE stays - it is the
            // coach's explicit intent, and the cloud copy is then not stored locally
            // (it would bring the deleted game back).
            deleteQueued = (await hooks.discardQueuedChanges?.(entityType, entityId))?.deleteQueued ?? false;
            if (!deleteQueued) {
              await localStore.saveGame(entityId, cloud.game);
            }
            // Last: if anything above fails, the old base stays, a retry is refused
            // again, and the resolution simply repeats.
            await cloudStore.recordGameBaseVersion(entityId, cloud.version);
          } catch (resolveError) {
            notify(); // reload the match on whatever the device now holds; still guarded
            throw resolveError;
          }
          logger.warn('[SyncExecutor] Save refused (another device saved first): kept the cloud version of the game', { entityId, deleteQueued });
          // No "showing the latest version" notice for a game the coach is deleting.
          if (!deleteQueued) notify();
          return;
        }
      }

      // AbortError is expected during page navigation, hot reload, or user-initiated cancellation
      // Don't log as error or report to Sentry - just rethrow for normal retry handling
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      if (isAbortError) {
        logger.debug('[SyncExecutor] Sync aborted (expected during navigation/reload)', {
          entityType,
          entityId,
          operation,
        });
        throw error;
      }

      // Check if this is an auto-resolvable conflict (unique constraint violation)
      if (isAutoResolvableConflict(error) && conflictResolver) {
        logger.info('[SyncExecutor] Conflict detected, attempting resolution', {
          entityType,
          entityId,
          operation,
        });

        try {
          const result = await conflictResolver.resolve(op);
          logger.info('[SyncExecutor] Conflict resolved', {
            entityType,
            entityId,
            winner: result.resolution.winner,
            actionTaken: result.actionTaken,
          });

          // Report conflict resolution to Sentry for monitoring
          try {
            Sentry.captureMessage('Sync conflict resolved', {
              tags: {
                component: 'SyncExecutor',
                entityType,
                operation,
                winner: result.resolution.winner,
              },
              level: 'info',
            });
          } catch {
            // Sentry failure is acceptable
          }

          return; // Conflict resolved successfully
        } catch (resolveError) {
          // Conflict resolution failed - log and fall through to error handling
          logger.error('[SyncExecutor] Conflict resolution failed', {
            entityType,
            entityId,
            error: resolveError instanceof Error ? resolveError.message : String(resolveError),
          });

          // Report resolution failure to Sentry
          try {
            Sentry.captureException(resolveError, {
              tags: {
                component: 'SyncExecutor',
                entityType,
                operation,
                action: 'conflictResolution',
              },
              level: 'error',
            });
          } catch {
            // Sentry failure is acceptable
          }

          // Re-throw the original error for normal retry handling
          throw error;
        }
      }

      // DIAGNOSTIC: Capture full error details to diagnose "one item stuck" issue
      const errorDetails = {
        entityType,
        entityId,
        operation,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
        // Supabase errors often have additional details
        errorCode: (error as { code?: string })?.code,
        errorDetails: (error as { details?: string })?.details,
        errorHint: (error as { hint?: string })?.hint,
      };
      logger.error('[SyncExecutor] Sync operation failed - FULL DETAILS', errorDetails);

      // Report to Sentry with full context
      try {
        Sentry.captureException(error, {
          tags: {
            component: 'SyncExecutor',
            entityType,
            operation,
          },
          extra: errorDetails,
          level: 'error',
        });
      } catch {
        // Sentry failure is acceptable
      }

      throw error;
    }
  };
}

/**
 * Execute a sync operation against the cloud store.
 * Separated from the main executor to allow reuse after conflict resolution.
 */
async function executeSyncOperation(
  cloudStore: DataStore,
  op: SyncOperation,
  localStore?: DataStore,
  isSuperseded?: () => Promise<boolean>,
): Promise<void> {
  const { entityType, entityId, operation, data } = op;

  switch (entityType) {
    case 'player':
      await syncPlayer(cloudStore, operation, entityId, data);
      break;

    case 'team':
      await syncTeam(cloudStore, operation, entityId, data);
      break;

    case 'teamRoster':
      await syncTeamRoster(cloudStore, operation, entityId, data);
      break;

    case 'season':
      await syncSeason(cloudStore, operation, entityId, data);
      break;

    case 'tournament':
      await syncTournament(cloudStore, operation, entityId, data);
      break;

    case 'personnel':
      await syncPersonnel(cloudStore, operation, entityId, data);
      break;

    case 'game':
      await syncGame(cloudStore, operation, entityId, data);
      break;

    case 'settings':
      await syncSettings(cloudStore, operation, data);
      break;

    case 'playerAdjustment':
      await syncPlayerAdjustment(cloudStore, operation, entityId, data);
      break;

    case 'warmupPlan':
      await syncWarmupPlan(cloudStore, operation, data);
      break;

    case 'playtimePlan':
      await syncPlaytimePlan(cloudStore, operation, entityId, data, localStore, isSuperseded);
      break;

    case 'playtimePlanLink':
      await syncPlaytimePlanLink(cloudStore, operation, entityId, data);
      break;

    case 'playtimeGameSubs':
      await syncPlaytimeGameSubs(cloudStore, operation, entityId, data);
      break;

    case 'gameThemes':
      await syncGameThemes(cloudStore, operation, entityId, data);
      break;

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = entityType;
      throw new SyncError(
        SyncErrorCode.INVALID_DATA,
        `Unknown entity type: ${_exhaustive}`
      );
    }
  }
}

// =============================================================================
// Entity-specific sync handlers
// =============================================================================

async function syncPlayer(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.deletePlayer(entityId);
  } else {
    // create/update both use upsert
    validateObjectData(data, 'player', operation, entityId);
    await store.upsertPlayer(data as Player);
  }
}

async function syncTeam(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.deleteTeam(entityId);
  } else {
    validateObjectData(data, 'team', operation, entityId);
    await store.upsertTeam(data as Team);
  }
}

/**
 * Sync team roster operations.
 *
 * Delete semantics: Clears the roster (sets empty array) rather than deleting
 * the roster entity itself. Rosters are always associated with teams, so
 * "delete roster" means "remove all players from roster".
 */
async function syncTeamRoster(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string, // This is the teamId
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.setTeamRoster(entityId, []);
  } else {
    validateArrayData(data, 'teamRoster', operation, entityId);
    await store.setTeamRoster(entityId, data as TeamPlayer[]);
  }
}

async function syncSeason(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.deleteSeason(entityId);
  } else {
    validateObjectData(data, 'season', operation, entityId);
    await store.upsertSeason(data as Season);
  }
}

async function syncTournament(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.deleteTournament(entityId);
  } else {
    validateObjectData(data, 'tournament', operation, entityId);
    await store.upsertTournament(data as Tournament);
  }
}

async function syncPersonnel(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.removePersonnelMember(entityId);
  } else {
    validateObjectData(data, 'personnel', operation, entityId);
    await store.upsertPersonnelMember(data as Personnel);
  }
}

async function syncGame(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.deleteGame(entityId);
  } else {
    // create/update both use saveGame with the full game data. Sync pushes check the
    // version this device's copy is based on (review 3.7).
    validateObjectData(data, 'game', operation, entityId);
    if (isVersionAware(store)) {
      await store.saveGame(entityId, data as AppState, { useRecordedBase: true });
    } else {
      if (!warnedNotVersionAware) {
        warnedNotVersionAware = true;
        logger.warn('[SyncExecutor] Cloud store has no version-checked game save; outdated copies are not refused');
      }
      await store.saveGame(entityId, data as AppState);
    }
  }
}

/**
 * Sync settings operations.
 *
 * Delete semantics: Not supported - settings must always exist. Attempting
 * to delete settings throws an error. Use update to reset to defaults.
 */
async function syncSettings(
  store: DataStore,
  operation: SyncOperation['operation'],
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    throw new SyncError(
      SyncErrorCode.INVALID_DATA,
      'Cannot delete settings: delete operation is not supported for settings entity'
    );
  }
  validateObjectData(data, 'settings', operation);
  await store.saveSettings(data as AppSettings);
}

async function syncPlayerAdjustment(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string, // This is the adjustmentId
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    // Need playerId to delete - extract from data
    // For delete operations, data should contain { playerId, adjustmentId }
    const deleteData = data as { playerId?: string } | null;
    const playerId = deleteData?.playerId;
    if (!playerId) {
      logger.error('[SyncExecutor] playerAdjustment delete failed: missing playerId', {
        entityId,
        operation,
        hasData: data !== null && data !== undefined,
      });
      throw new SyncError(
        SyncErrorCode.INVALID_DATA,
        `Cannot delete player adjustment ${entityId}: playerId not provided in operation data`
      );
    }
    await store.deletePlayerAdjustment(playerId, entityId);
  } else {
    validateObjectData(data, 'playerAdjustment', operation, entityId);
    await store.upsertPlayerAdjustment(data as PlayerStatAdjustment);
  }
}

async function syncWarmupPlan(
  store: DataStore,
  operation: SyncOperation['operation'],
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.deleteWarmupPlan();
  } else {
    validateObjectData(data, 'warmupPlan', operation);
    await store.saveWarmupPlan(data as WarmupPlan);
  }
}

async function syncPlaytimePlan(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown,
  localStore?: DataStore,
  isSuperseded?: () => Promise<boolean>,
): Promise<void> {
  if (operation === 'delete') {
    await store.deletePlaytimePlan(entityId);
    return;
  }
  validateObjectData(data, 'playtimePlan', operation, entityId);
  const applied = await store.savePlaytimePlan(data as PlaytimePlan);
  if (applied !== null) return;

  // The conditional-LWW RPC (migration 038) refused the write: a NEWER cloud
  // row exists. That's a resolved conflict, not a failure - the op dequeues,
  // but this device must converge NOW by pulling the winning copy down, not
  // at some future full hydration.
  logger.info(
    `[SyncExecutor] playtimePlan ${entityId}: cloud copy is newer, pulling it down (LWW)`
  );
  if (!localStore) return; // one-way executor (no local store wired): nothing to reconcile
  // A newer local edit to this plan is queued (review 3.6b): it is the user's latest
  // version and will be pushed by its own op - the cloud copy must not overwrite it.
  if (isSuperseded && (await isSuperseded())) {
    logger.info(`[SyncExecutor] playtimePlan ${entityId}: newer local edit queued, keeping it`);
    return;
  }
  const cloudPlans = await store.getPlaytimePlans();
  const winner = cloudPlans[entityId];
  if (!winner) return; // row vanished between the RPC and the fetch (deleted elsewhere)
  // Prefer the stamp-preserving restore helper (LocalDataStore): a plain
  // savePlaytimePlan would re-stamp updatedAt to NOW and make the local copy
  // claim to be newer than the cloud row it was copied from.
  const restore = (
    localStore as { restorePlaytimePlans?: (c: Record<string, PlaytimePlan>) => Promise<number> }
  ).restorePlaytimePlans;
  if (typeof restore === 'function') {
    await restore.call(localStore, { [winner.id]: winner });
  } else {
    await localStore.savePlaytimePlan(winner);
  }
}

async function syncPlaytimePlanLink(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    // Delete-for-plan carries the plan id in the payload (SyncedDataStore
    // enqueues it with a namespaced entityId); a plain delete targets one game.
    const planId = (data as { planId?: string } | null)?.planId;
    if (planId) {
      await store.deletePlaytimePlanLinksForPlan(planId);
    } else {
      await store.deletePlaytimePlanLink(entityId);
    }
  } else {
    validateObjectData(data, 'playtimePlanLink', operation, entityId);
    await store.setPlaytimePlanLink(entityId, data as PlanLink);
  }
}

async function syncPlaytimeGameSubs(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.deletePlaytimeGameSubs(entityId);
  } else {
    validateArrayData(data, 'playtimeGameSubs', operation, entityId);
    await store.setPlaytimeGameSubs(entityId, data as PlannedGameSub[]);
  }
}

async function syncGameThemes(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string,
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    await store.deleteGameThemes(entityId);
  } else {
    validateArrayData(data, 'gameThemes', operation, entityId);
    await store.setGameThemes(entityId, normalizeGameThemes(data as unknown[]));
  }
}

// =============================================================================
// Conflict Resolution Helpers
// =============================================================================

/**
 * Create a cloud record fetcher for the ConflictResolver.
 * Maps entity types to the appropriate get methods.
 */
function createCloudFetcher(cloudStore: DataStore): CloudRecordFetcher {
  // Epoch timestamp for entities without updatedAt (treated as oldest)
  const EPOCH_TIMESTAMP = new Date(0).toISOString();

  return async (entityType: SyncEntityType, entityId: string, context?: unknown): Promise<CloudRecord | null> => {
    try {
      switch (entityType) {
        case 'player': {
          const players = await cloudStore.getPlayers();
          const player = players.find(p => p.id === entityId);
          if (!player) return null;
          return {
            ...player,
            id: player.id,
            updatedAt: player.updatedAt ?? EPOCH_TIMESTAMP,
          };
        }

        case 'team': {
          const team = await cloudStore.getTeamById(entityId);
          if (!team) return null;
          return {
            ...team,
            id: team.id,
            updatedAt: team.updatedAt,
          };
        }

        case 'teamRoster': {
          // Team rosters don't have timestamps - use team's timestamp
          const team = await cloudStore.getTeamById(entityId);
          if (!team) return null;
          const roster = await cloudStore.getTeamRoster(entityId);
          return {
            id: entityId,
            updatedAt: team.updatedAt,
            roster,
          };
        }

        case 'season': {
          const seasons = await cloudStore.getSeasons(true);
          const season = seasons.find(s => s.id === entityId);
          if (!season) return null;
          return {
            ...season,
            id: season.id,
            updatedAt: season.updatedAt ?? EPOCH_TIMESTAMP,
          };
        }

        case 'tournament': {
          const tournaments = await cloudStore.getTournaments(true);
          const tournament = tournaments.find(t => t.id === entityId);
          if (!tournament) return null;
          return {
            ...tournament,
            id: tournament.id,
            updatedAt: tournament.updatedAt ?? EPOCH_TIMESTAMP,
          };
        }

        case 'personnel': {
          const personnel = await cloudStore.getPersonnelById(entityId);
          if (!personnel) return null;
          return {
            ...personnel,
            id: personnel.id,
            updatedAt: personnel.updatedAt,
          };
        }

        case 'game': {
          const game = await cloudStore.getGameById(entityId);
          if (!game) return null;
          return {
            ...game,
            id: entityId,
            updatedAt: game.updatedAt ?? EPOCH_TIMESTAMP,
          };
        }

        case 'settings': {
          const settings = await cloudStore.getSettings();
          return {
            ...settings,
            id: 'app',
            updatedAt: settings.updatedAt ?? EPOCH_TIMESTAMP,
          };
        }

        case 'playerAdjustment': {
          // Optimization: Use playerId from context for O(1) lookup instead of O(n*m) scan
          const contextData = context as { playerId?: string } | undefined;
          if (contextData?.playerId) {
            // Direct lookup using playerId from context
            const adjustments = await cloudStore.getPlayerAdjustments(contextData.playerId);
            const adj = adjustments.find(a => a.id === entityId);
            if (adj) {
              return {
                ...adj,
                id: adj.id,
                updatedAt: adj.appliedAt, // appliedAt is the timestamp
              };
            }
            return null;
          }

          // Fallback: scan all adjustments (expensive O(n*m) - log for diagnostics)
          logger.warn('[SyncExecutor] PlayerAdjustment fetch: missing playerId context, using slow scan', {
            entityId,
            hasContext: context !== null && context !== undefined,
          });
          const allAdjustments = await cloudStore.getAllPlayerAdjustments();
          for (const [_playerId, adjustments] of allAdjustments) {
            const adj = adjustments.find(a => a.id === entityId);
            if (adj) {
              return {
                ...adj,
                id: adj.id,
                updatedAt: adj.appliedAt, // appliedAt is the timestamp
              };
            }
          }
          return null;
        }

        case 'warmupPlan': {
          const plan = await cloudStore.getWarmupPlan();
          if (!plan) return null;
          return {
            ...plan,
            id: 'default',
            // WarmupPlan timestamp transition:
            // - Legacy: lastModified (still populated for backwards compatibility)
            // - New: updatedAt (added for consistency with other entities)
            // Both are set to same value by normalizeWarmupPlanForSave()
            // Prefer updatedAt if present, fall back to lastModified
            updatedAt: plan.updatedAt ?? plan.lastModified ?? EPOCH_TIMESTAMP,
          };
        }

        case 'playtimePlan': {
          const plans = await cloudStore.getPlaytimePlans();
          const plan = plans[entityId];
          if (!plan) return null;
          return { ...plan, id: plan.id, updatedAt: plan.updatedAt };
        }

        case 'playtimePlanLink': {
          // Links carry no client-side timestamp - treat cloud as oldest so a
          // queued local write always wins (pure upserts can't conflict anyway).
          const links = await cloudStore.getPlaytimePlanLinks();
          const link = links[entityId];
          if (!link) return null;
          return { ...link, id: entityId, updatedAt: EPOCH_TIMESTAMP };
        }

        case 'playtimeGameSubs': {
          // DELIBERATE LWW exemption (unlike playtime_plans / migration 038):
          // a game's planned-sub schedule carries no per-collection timestamp,
          // so cloud is treated as oldest and processing order wins. Accepted
          // scope decision - the schedule is regenerable from the plan itself
          // (re-apply), so a rare cross-device race self-heals; see
          // "Scope decisions" in docs/03-active-plans/
          // playing-time-fairness-and-planner.md §11.
          const subs = await cloudStore.getPlaytimeGameSubs(entityId);
          if (subs.length === 0) return null;
          return { id: entityId, subs, updatedAt: EPOCH_TIMESTAMP };
        }

        case 'gameThemes': {
          // Same deliberate LWW exemption as playtimeGameSubs: a game's theme
          // selection carries no edit timestamp, so the cloud copy counts as
          // oldest and the queued local selection wins (a whole-list replace,
          // re-picked in seconds if a rare cross-device race loses one).
          const themes = await cloudStore.getGameThemes(entityId);
          if (themes.length === 0) return null;
          return { id: entityId, themes, updatedAt: EPOCH_TIMESTAMP };
        }

        default: {
          const _exhaustive: never = entityType;
          throw new Error(`Unknown entity type for cloud fetch: ${_exhaustive}`);
        }
      }
    } catch (error) {
      logger.error('[SyncExecutor] Error fetching cloud record', {
        entityType,
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

/**
 * Create a cloud record writer for the ConflictResolver.
 * Maps entity types to the appropriate upsert methods.
 */
function createCloudWriter(cloudStore: DataStore): CloudRecordWriter {
  return async (entityType: SyncEntityType, entityId: string, data: unknown): Promise<void> => {
    switch (entityType) {
      case 'player':
        validateObjectData(data, 'player', 'upsert', entityId);
        await cloudStore.upsertPlayer(data as Player);
        break;

      case 'team':
        validateObjectData(data, 'team', 'upsert', entityId);
        await cloudStore.upsertTeam(data as Team);
        break;

      case 'teamRoster':
        validateArrayData(data, 'teamRoster', 'upsert', entityId);
        await cloudStore.setTeamRoster(entityId, data as TeamPlayer[]);
        break;

      case 'season':
        validateObjectData(data, 'season', 'upsert', entityId);
        await cloudStore.upsertSeason(data as Season);
        break;

      case 'tournament':
        validateObjectData(data, 'tournament', 'upsert', entityId);
        await cloudStore.upsertTournament(data as Tournament);
        break;

      case 'personnel':
        validateObjectData(data, 'personnel', 'upsert', entityId);
        await cloudStore.upsertPersonnelMember(data as Personnel);
        break;

      case 'game':
        validateObjectData(data, 'game', 'upsert', entityId);
        await cloudStore.saveGame(entityId, data as AppState);
        break;

      case 'settings':
        validateObjectData(data, 'settings', 'upsert');
        await cloudStore.saveSettings(data as AppSettings);
        break;

      case 'playerAdjustment':
        validateObjectData(data, 'playerAdjustment', 'upsert', entityId);
        await cloudStore.upsertPlayerAdjustment(data as PlayerStatAdjustment);
        break;

      case 'warmupPlan':
        validateObjectData(data, 'warmupPlan', 'upsert');
        await cloudStore.saveWarmupPlan(data as WarmupPlan);
        break;

      case 'playtimePlan':
        validateObjectData(data, 'playtimePlan', 'upsert', entityId);
        await cloudStore.savePlaytimePlan(data as PlaytimePlan);
        break;

      case 'playtimePlanLink':
        validateObjectData(data, 'playtimePlanLink', 'upsert', entityId);
        await cloudStore.setPlaytimePlanLink(entityId, data as PlanLink);
        break;

      case 'playtimeGameSubs':
        validateArrayData(data, 'playtimeGameSubs', 'upsert', entityId);
        await cloudStore.setPlaytimeGameSubs(entityId, data as PlannedGameSub[]);
        break;

      case 'gameThemes':
        validateArrayData(data, 'gameThemes', 'upsert', entityId);
        await cloudStore.setGameThemes(entityId, normalizeGameThemes(data as unknown[]));
        break;

      default: {
        const _exhaustive: never = entityType;
        throw new Error(`Unknown entity type for cloud write: ${_exhaustive}`);
      }
    }
  };
}

/**
 * Create a cloud record deleter for the ConflictResolver.
 * Maps entity types to the appropriate delete methods.
 *
 * @param cloudStore - The cloud DataStore implementation
 * @returns A deleter function that accepts entityType, entityId, and optional context
 */
function createCloudDeleter(cloudStore: DataStore): CloudRecordDeleter {
  return async (entityType: SyncEntityType, entityId: string, context?: unknown): Promise<void> => {
    switch (entityType) {
      case 'player':
        await cloudStore.deletePlayer(entityId);
        break;

      case 'team':
        await cloudStore.deleteTeam(entityId);
        break;

      case 'teamRoster':
        await cloudStore.setTeamRoster(entityId, []);
        break;

      case 'season':
        await cloudStore.deleteSeason(entityId);
        break;

      case 'tournament':
        await cloudStore.deleteTournament(entityId);
        break;

      case 'personnel':
        await cloudStore.removePersonnelMember(entityId);
        break;

      case 'game':
        await cloudStore.deleteGame(entityId);
        break;

      case 'settings':
        throw new SyncError(
          SyncErrorCode.INVALID_DATA,
          'Cannot delete settings: delete operation is not supported for settings entity'
        );

      case 'playerAdjustment': {
        // Extract playerId from context (passed from op.data)
        const contextData = context as { playerId?: string } | null | undefined;
        const playerId = contextData?.playerId;
        if (!playerId) {
          logger.error('[SyncExecutor] playerAdjustment delete failed: missing playerId in context', {
            entityId,
            hasContext: context !== null && context !== undefined,
          });
          throw new SyncError(
            SyncErrorCode.INVALID_DATA,
            `Cannot delete player adjustment ${entityId}: playerId not provided in context`
          );
        }
        await cloudStore.deletePlayerAdjustment(playerId, entityId);
        break;
      }

      case 'warmupPlan':
        await cloudStore.deleteWarmupPlan();
        break;

      case 'playtimePlan':
        await cloudStore.deletePlaytimePlan(entityId);
        break;

      case 'playtimePlanLink': {
        // Parity with syncPlaytimePlanLink: a delete-for-plan op carries the
        // plan id in context/data and uses a namespaced entityId that is NOT
        // a real game key.
        const planId = (context as { planId?: string } | undefined)?.planId;
        if (planId) {
          await cloudStore.deletePlaytimePlanLinksForPlan(planId);
        } else {
          await cloudStore.deletePlaytimePlanLink(entityId);
        }
        break;
      }

      case 'playtimeGameSubs':
        await cloudStore.deletePlaytimeGameSubs(entityId);
        break;

      case 'gameThemes':
        await cloudStore.deleteGameThemes(entityId);
        break;

      default: {
        const _exhaustive: never = entityType;
        throw new Error(`Unknown entity type for cloud delete: ${_exhaustive}`);
      }
    }
  };
}

/**
 * Create a local record writer for the ConflictResolver.
 * Used when cloud wins the conflict - updates local store with cloud data.
 */
function createLocalWriter(localStore: DataStore): LocalRecordWriter {
  return async (entityType: SyncEntityType, entityId: string, data: unknown): Promise<void> => {
    logger.info('[SyncExecutor] Cloud wins - updating local store', {
      entityType,
      entityId,
    });

    switch (entityType) {
      case 'player':
        validateObjectData(data, 'player', 'upsert', entityId);
        await localStore.upsertPlayer(data as Player);
        break;

      case 'team':
        validateObjectData(data, 'team', 'upsert', entityId);
        await localStore.upsertTeam(data as Team);
        break;

      case 'teamRoster': {
        // Extract roster from CloudRecord
        const record = data as CloudRecord & { roster?: TeamPlayer[] };
        const roster = record.roster ?? [];
        await localStore.setTeamRoster(entityId, roster);
        break;
      }

      case 'season':
        validateObjectData(data, 'season', 'upsert', entityId);
        await localStore.upsertSeason(data as Season);
        break;

      case 'tournament':
        validateObjectData(data, 'tournament', 'upsert', entityId);
        await localStore.upsertTournament(data as Tournament);
        break;

      case 'personnel':
        validateObjectData(data, 'personnel', 'upsert', entityId);
        await localStore.upsertPersonnelMember(data as Personnel);
        break;

      case 'game':
        validateObjectData(data, 'game', 'upsert', entityId);
        await localStore.saveGame(entityId, data as AppState);
        break;

      case 'settings':
        validateObjectData(data, 'settings', 'upsert');
        await localStore.saveSettings(data as AppSettings);
        break;

      case 'playerAdjustment':
        validateObjectData(data, 'playerAdjustment', 'upsert', entityId);
        await localStore.upsertPlayerAdjustment(data as PlayerStatAdjustment);
        break;

      case 'warmupPlan':
        validateObjectData(data, 'warmupPlan', 'upsert');
        await localStore.saveWarmupPlan(data as WarmupPlan);
        break;

      case 'playtimePlan':
        validateObjectData(data, 'playtimePlan', 'upsert', entityId);
        await localStore.savePlaytimePlan(data as PlaytimePlan);
        break;

      case 'playtimePlanLink':
        validateObjectData(data, 'playtimePlanLink', 'upsert', entityId);
        await localStore.setPlaytimePlanLink(entityId, data as PlanLink);
        break;

      case 'playtimeGameSubs':
        validateArrayData(data, 'playtimeGameSubs', 'upsert', entityId);
        await localStore.setPlaytimeGameSubs(entityId, data as PlannedGameSub[]);
        break;

      case 'gameThemes': {
        // Cloud wins: the CloudRecord built by the fetcher carries the list in `themes`.
        const record = data as { themes?: unknown } | null;
        const list = Array.isArray(record?.themes) ? record.themes : Array.isArray(data) ? data : [];
        await localStore.setGameThemes(entityId, normalizeGameThemes(list));
        break;
      }

      default: {
        const _exhaustive: never = entityType;
        throw new Error(`Unknown entity type for local write: ${_exhaustive}`);
      }
    }
  };
}
