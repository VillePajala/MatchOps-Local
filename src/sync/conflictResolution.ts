/**
 * Conflict Resolution
 *
 * Handles conflicts when local and cloud data have diverged.
 * Uses last-write-wins strategy based on timestamps.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import logger from '@/utils/logger';
import { ConflictError } from '@/interfaces/DataStoreErrors';
import type {
  SyncOperation,
  SyncEntityType,
  ConflictResolution,
} from './types';

/**
 * Record with timestamp information from cloud storage.
 * All synced entities should have these fields.
 */
export interface CloudRecord {
  id: string;
  updatedAt: string; // ISO timestamp
  [key: string]: unknown;
}

/**
 * Fetcher function type for retrieving cloud records.
 * Provided by the cloud store implementation.
 *
 * @param entityType - The type of entity to fetch
 * @param entityId - The unique identifier of the entity
 * @param context - Optional context data (e.g., the full entity data for efficient lookups)
 */
export type CloudRecordFetcher = (
  entityType: SyncEntityType,
  entityId: string,
  context?: unknown
) => Promise<CloudRecord | null>;

/**
 * Writer function type for pushing records to cloud.
 * Provided by the cloud store implementation.
 */
export type CloudRecordWriter = (
  entityType: SyncEntityType,
  entityId: string,
  data: unknown
) => Promise<void>;

/**
 * Deleter function type for removing records from cloud.
 * Provided by the cloud store implementation.
 *
 * @param entityType - The type of entity to delete
 * @param entityId - The ID of the entity to delete
 * @param context - Optional context data (e.g., playerId for playerAdjustment)
 */
export type CloudRecordDeleter = (
  entityType: SyncEntityType,
  entityId: string,
  context?: unknown
) => Promise<void>;

/**
 * Local store writer function type for updating local records.
 * Used when cloud wins the conflict.
 */
export type LocalRecordWriter = (
  entityType: SyncEntityType,
  entityId: string,
  data: unknown
) => Promise<void>;

/**
 * Options for the conflict resolver.
 *
 * Note: No `deleteFromLocal` - per sync semantics, local updates always
 * win over cloud deletions (resurrection). If cloud deletes and local
 * has an update, the update is pushed to cloud, resurrecting the record.
 */
export interface ConflictResolverOptions {
  /** Fetch a record from cloud storage */
  fetchFromCloud: CloudRecordFetcher;
  /** Write a record to cloud storage */
  writeToCloud: CloudRecordWriter;
  /** Delete a record from cloud storage */
  deleteFromCloud: CloudRecordDeleter;
  /** Write a record to local storage (used when cloud wins) */
  writeToLocal: LocalRecordWriter;
}

/**
 * Result of conflict resolution.
 */
export interface ResolutionResult {
  /** The resolution that was applied */
  resolution: ConflictResolution;
  /** Whether any action was taken (false if no conflict existed) */
  actionTaken: boolean;
}

/**
 * ConflictResolver - Resolves conflicts between local and cloud data.
 *
 * Strategy: Last-Write-Wins
 * - Compares timestamps of local operation and cloud record
 * - Newer timestamp wins
 * - Special handling for deletions
 *
 * Edge Cases:
 * - Record deleted in cloud: Local operation wins (resurrection)
 * - Record deleted locally: Push delete to cloud if local is newer
 * - Both deleted: No conflict (both agree on deletion)
 * - Same timestamp: Local wins (user's most recent action takes priority)
 *
 * ## Concurrency Note (Multi-Device Sync)
 *
 * There is a race window between fetch and write/delete where another device
 * could update cloud. This is handled via last-write-wins semantics:
 *
 * - Single device: No race conditions (typical case)
 * - Multi-device with coordination: Users typically don't edit same data
 *   simultaneously on multiple devices
 * - Multi-device conflict: Last write wins based on timestamp; data is not
 *   lost (exists on the device that "lost"), just not synced
 *
 * For truly concurrent multi-device editing of the same entity, consider:
 * - PostgreSQL row-level locking via RPC (performance cost)
 * - Optimistic locking with version fields (complexity cost)
 * - Operational Transform / CRDTs (significant complexity)
 *
 * Current approach is appropriate for coaching app where users rarely edit
 * the same player/game simultaneously on multiple devices.
 */
export class ConflictResolver {
  private fetchFromCloud: CloudRecordFetcher;
  private writeToCloud: CloudRecordWriter;
  private deleteFromCloud: CloudRecordDeleter;
  private writeToLocal: LocalRecordWriter;

  constructor(options: ConflictResolverOptions) {
    this.fetchFromCloud = options.fetchFromCloud;
    this.writeToCloud = options.writeToCloud;
    this.deleteFromCloud = options.deleteFromCloud;
    this.writeToLocal = options.writeToLocal;
  }

  /**
   * Resolve a conflict for a sync operation.
   *
   * @param op - The sync operation that encountered a conflict
   * @returns Resolution result with winner and action taken
   * @throws Error if operation has invalid timestamp or entityId
   */
  async resolve(op: SyncOperation): Promise<ResolutionResult> {
    const { entityType, entityId, operation, data, timestamp } = op;

    // Validate inputs
    if (!entityId || entityId.trim() === '') {
      throw new Error('[ConflictResolver] Invalid operation: entityId is required');
    }
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < 0) {
      throw new Error('[ConflictResolver] Invalid operation: timestamp must be a positive number');
    }

    logger.debug('[ConflictResolver] Resolving conflict', {
      entityType,
      entityId,
      operation,
      localTimestamp: timestamp,
    });

    // Fetch current cloud version (pass data as context for efficient lookups)
    const cloudRecord = await this.fetchFromCloud(entityType, entityId, data);

    // Handle based on cloud state
    if (!cloudRecord) {
      // Record doesn't exist in cloud
      return this.handleMissingCloudRecord(op);
    }

    // Compare timestamps - validate cloud timestamp format
    const cloudTimestamp = new Date(cloudRecord.updatedAt).getTime();
    if (!Number.isFinite(cloudTimestamp)) {
      throw new Error(
        `[ConflictResolver] Invalid cloud record for ${entityType}/${entityId}: updatedAt "${cloudRecord.updatedAt}" is not a valid date`
      );
    }

    if (operation === 'delete') {
      // Local wants to delete, cloud has the record
      return this.handleLocalDelete(op, cloudRecord, cloudTimestamp);
    }

    // Local wants to create/update, cloud has record
    return this.handleLocalWrite(op, cloudRecord, cloudTimestamp);
  }

  /**
   * Handle case where cloud record doesn't exist.
   */
  private async handleMissingCloudRecord(
    op: SyncOperation
  ): Promise<ResolutionResult> {
    const { entityType, entityId, operation, data, timestamp } = op;

    if (operation === 'delete') {
      // Both agree on deletion (cloud already deleted or never existed)
      logger.debug('[ConflictResolver] No conflict - record already absent from cloud', {
        entityType,
        entityId,
      });

      return {
        resolution: {
          winner: 'local',
          entityType,
          entityId,
          localTimestamp: timestamp,
          cloudTimestamp: 0,
        },
        actionTaken: false, // No action needed - already in desired state
      };
    }

    // Local has create/update, cloud doesn't have record
    // Local wins - push to cloud
    logger.info('[ConflictResolver] Local wins - cloud record missing', {
      entityType,
      entityId,
    });

    await this.writeToCloud(entityType, entityId, data);

    return {
      resolution: {
        winner: 'local',
        entityType,
        entityId,
        localTimestamp: timestamp,
        cloudTimestamp: 0,
      },
      actionTaken: true,
    };
  }

  /**
   * Handle local delete operation when cloud has the record.
   */
  private async handleLocalDelete(
    op: SyncOperation,
    cloudRecord: CloudRecord,
    cloudTimestamp: number
  ): Promise<ResolutionResult> {
    const { entityType, entityId, timestamp } = op;

    // Local delete is newer or same time - delete from cloud
    if (timestamp >= cloudTimestamp) {
      logger.info('[ConflictResolver] Local delete wins', {
        entityType,
        entityId,
        localTimestamp: timestamp,
        cloudTimestamp,
      });

      // Pass op.data as context for entity types that need it (e.g., playerAdjustment needs playerId)
      await this.deleteFromCloud(entityType, entityId, op.data);

      return {
        resolution: {
          winner: 'local',
          entityType,
          entityId,
          localTimestamp: timestamp,
          cloudTimestamp,
        },
        actionTaken: true,
      };
    }

    // Cloud update is newer - resurrect locally
    logger.info('[ConflictResolver] Cloud wins - resurrecting locally', {
      entityType,
      entityId,
      localTimestamp: timestamp,
      cloudTimestamp,
    });

    await this.writeToLocal(entityType, entityId, cloudRecord);

    return {
      resolution: {
        winner: 'cloud',
        entityType,
        entityId,
        localTimestamp: timestamp,
        cloudTimestamp,
      },
      actionTaken: true,
    };
  }

  /**
   * Handle local create/update operation when cloud has record.
   */
  private async handleLocalWrite(
    op: SyncOperation,
    cloudRecord: CloudRecord,
    cloudTimestamp: number
  ): Promise<ResolutionResult> {
    const { entityType, entityId, data, timestamp } = op;

    // Local is newer or same time - push to cloud (local wins ties)
    if (timestamp >= cloudTimestamp) {
      logger.info('[ConflictResolver] Local write wins', {
        entityType,
        entityId,
        localTimestamp: timestamp,
        cloudTimestamp,
      });

      await this.writeToCloud(entityType, entityId, data);

      return {
        resolution: {
          winner: 'local',
          entityType,
          entityId,
          localTimestamp: timestamp,
          cloudTimestamp,
        },
        actionTaken: true,
      };
    }

    // Cloud is newer - pull to local
    logger.info('[ConflictResolver] Cloud wins - updating local', {
      entityType,
      entityId,
      localTimestamp: timestamp,
      cloudTimestamp,
    });

    await this.writeToLocal(entityType, entityId, cloudRecord);

    return {
      resolution: {
        winner: 'cloud',
        entityType,
        entityId,
        localTimestamp: timestamp,
        cloudTimestamp,
      },
      actionTaken: true,
    };
  }
}

/**
 * Detect if an error indicates a conflict that can be auto-resolved.
 * Used by SyncEngine to determine when to invoke timestamp-based conflict resolution.
 *
 * NOTE: ConflictError from optimistic locking (Issue #330) is explicitly EXCLUDED.
 * Those errors indicate concurrent modification and require user intervention
 * (refresh to see latest changes), not automatic timestamp-based resolution.
 *
 * @returns true if error is a unique constraint violation (auto-resolvable via last-write-wins)
 * @returns false if error is ConflictError (requires user refresh) or any other error type
 */
export function isAutoResolvableConflict(error: unknown): boolean {
  // Optimistic locking conflicts should propagate to UI, not auto-resolve
  // These require user to refresh and see the latest version
  if (error instanceof ConflictError) {
    return false;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Common conflict indicators from Supabase/PostgreSQL (unique constraint violations)
    // These CAN be auto-resolved via timestamp-based last-write-wins
    return (
      message.includes('already exists') ||
      message.includes('duplicate key') ||
      message.includes('unique constraint') ||
      message.includes('23505') // PostgreSQL unique violation code
    );
  }
  return false;
}

/**
 * @deprecated Use isAutoResolvableConflict instead. This alias exists for backwards compatibility.
 */
export const isConflictError = isAutoResolvableConflict;

/**
 * Detect if an error indicates the record was not found.
 * Used to distinguish between conflict and missing record scenarios.
 */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('no rows') ||
      message.includes('404')
    );
  }
  return false;
}
