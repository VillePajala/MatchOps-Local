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
import * as Sentry from '@sentry/nextjs';

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
  localStore?: DataStore
): SyncOperationExecutor {
  // Create conflict resolver if we have both stores
  let conflictResolver: ConflictResolver | null = null;
  if (localStore) {
    conflictResolver = new ConflictResolver({
      fetchFromCloud: createCloudFetcher(cloudStore),
      writeToCloud: createCloudWriter(cloudStore),
      deleteFromCloud: createCloudDeleter(cloudStore),
      writeToLocal: createLocalWriter(localStore),
    });
  }

  return async (op: SyncOperation): Promise<void> => {
    const { entityType, entityId, operation } = op;

    logger.debug('[SyncExecutor] Executing sync operation', {
      entityType,
      entityId,
      operation,
    });

    try {
      await executeSyncOperation(cloudStore, op);

      logger.debug('[SyncExecutor] Sync operation completed', {
        entityType,
        entityId,
        operation,
      });
    } catch (error) {
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
  op: SyncOperation
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
    // create/update both use saveGame with the full game data
    validateObjectData(data, 'game', operation, entityId);
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

          // Fallback: scan all adjustments (expensive but rare)
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
            // WarmupPlan uses lastModified instead of updatedAt
            updatedAt: plan.lastModified ?? EPOCH_TIMESTAMP,
          };
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
        // Settings cannot be deleted - this is a no-op
        logger.warn('[SyncExecutor] Cannot delete settings - no-op');
        break;

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
            SyncErrorCode.INVALID_OPERATION,
            `Cannot delete player adjustment ${entityId}: playerId not provided in context`
          );
        }
        await cloudStore.deletePlayerAdjustment(playerId, entityId);
        break;
      }

      case 'warmupPlan':
        await cloudStore.deleteWarmupPlan();
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

      default: {
        const _exhaustive: never = entityType;
        throw new Error(`Unknown entity type for local write: ${_exhaustive}`);
      }
    }
  };
}
