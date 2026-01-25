/**
 * Sync Executor Factory
 *
 * Creates a SyncOperationExecutor that syncs operations to a cloud DataStore.
 * Used by the factory to connect SyncedDataStore to SupabaseDataStore.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import type { DataStore } from '@/interfaces/DataStore';
import type { SyncOperation, SyncOperationExecutor } from './types';
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
    await store.upsertTeam(data as Team);
  }
}

async function syncTeamRoster(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string, // This is the teamId
  data: unknown
): Promise<void> {
  // Team roster is always an update (replace the roster)
  // Delete not supported - to clear, set empty array
  if (operation === 'delete') {
    await store.setTeamRoster(entityId, []);
  } else {
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
    await store.saveGame(entityId, data as AppState);
  }
}

async function syncSettings(
  store: DataStore,
  operation: SyncOperation['operation'],
  data: unknown
): Promise<void> {
  // Settings is always an update (replace the settings)
  // Delete not supported for settings
  if (operation === 'delete') {
    logger.warn('[SyncExecutor] Delete operation not supported for settings - ignoring');
    return;
  }
  await store.saveSettings(data as AppSettings);
}

async function syncPlayerAdjustment(
  store: DataStore,
  operation: SyncOperation['operation'],
  entityId: string, // This is the adjustmentId
  data: unknown
): Promise<void> {
  if (operation === 'delete') {
    // Need playerId to delete - extract from data or query
    // For delete operations, data should contain { playerId, adjustmentId }
    const deleteData = data as { playerId?: string } | null;
    const playerId = deleteData?.playerId;
    if (!playerId) {
      throw new SyncError(
        SyncErrorCode.INVALID_DATA,
        'Cannot delete player adjustment: playerId not provided in operation data'
      );
    }
    await store.deletePlayerAdjustment(playerId, entityId);
  } else {
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
    await store.saveWarmupPlan(data as WarmupPlan);
  }
}
