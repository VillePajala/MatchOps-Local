/**
 * Sync Executor Factory
 *
 * Creates a SyncOperationExecutor that syncs operations to a cloud DataStore.
 * Used by the factory to connect SyncedDataStore to SupabaseDataStore.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import type { DataStore } from '@/interfaces/DataStore';
import type { SyncOperation } from './types';
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
import type { AppSettings } from '@/types/settings';
import { SyncError, SyncErrorCode } from './types';
import logger from '@/utils/logger';

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
  operation: string
): void {
  if (data === null || data === undefined) {
    throw new SyncError(
      SyncErrorCode.INVALID_DATA,
      `Cannot ${operation} ${entityType}: data is ${data === null ? 'null' : 'undefined'}`
    );
  }
  if (typeof data !== 'object') {
    throw new SyncError(
      SyncErrorCode.INVALID_DATA,
      `Cannot ${operation} ${entityType}: data must be an object, got ${typeof data}`
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
  operation: string
): void {
  if (!Array.isArray(data)) {
    throw new SyncError(
      SyncErrorCode.INVALID_DATA,
      `Cannot ${operation} ${entityType}: data must be an array, got ${typeof data}`
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
 * @param cloudStore - The cloud DataStore to sync to (e.g., SupabaseDataStore)
 * @returns SyncOperationExecutor function
 */
export function createSyncExecutor(cloudStore: DataStore): SyncOperationExecutor {
  return async (op: SyncOperation): Promise<void> => {
    const { entityType, entityId, operation, data } = op;

    logger.debug('[SyncExecutor] Executing sync operation', {
      entityType,
      entityId,
      operation,
    });

    try {
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

        default: {
          // TypeScript exhaustiveness check
          const _exhaustive: never = entityType;
          throw new SyncError(
            SyncErrorCode.INVALID_DATA,
            `Unknown entity type: ${_exhaustive}`
          );
        }
      }

      logger.debug('[SyncExecutor] Sync operation completed', {
        entityType,
        entityId,
        operation,
      });
    } catch (error) {
      logger.error('[SyncExecutor] Sync operation failed', {
        entityType,
        entityId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
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
    validateObjectData(data, 'player', operation);
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
    validateObjectData(data, 'team', operation);
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
    validateArrayData(data, 'teamRoster', operation);
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
    validateObjectData(data, 'season', operation);
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
    validateObjectData(data, 'tournament', operation);
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
    validateObjectData(data, 'personnel', operation);
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
    // create/update both use saveGame with the full game data
    validateObjectData(data, 'game', operation);
    await store.saveGame(entityId, data as AppState);
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
    validateObjectData(data, 'playerAdjustment', operation);
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
