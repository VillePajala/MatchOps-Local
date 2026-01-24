/**
 * Sync Queue Type Definitions
 *
 * Types for the local-first sync system. Operations are queued in IndexedDB
 * and processed by the SyncEngine when online.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

/**
 * Entity types that can be synced to cloud.
 * Maps to DataStore method categories.
 */
export type SyncEntityType =
  | 'player'
  | 'team'
  | 'game'
  | 'season'
  | 'tournament'
  | 'personnel'
  | 'settings'
  | 'teamRoster'
  | 'playerAdjustment'
  | 'warmupPlan';

/**
 * Types of sync operations.
 */
export type SyncOperationType = 'create' | 'update' | 'delete';

/**
 * Status of a sync operation in the queue.
 */
export type SyncOperationStatus = 'pending' | 'syncing' | 'failed';

/**
 * A single sync operation stored in the queue.
 *
 * Operations are persisted in IndexedDB and survive app restarts.
 * The SyncEngine processes them in order when online.
 */
export interface SyncOperation {
  /** Unique identifier for this operation (UUID) */
  id: string;

  /** Type of entity being synced */
  entityType: SyncEntityType;

  /** ID of the entity being synced */
  entityId: string;

  /** Type of operation (create/update/delete) */
  operation: SyncOperationType;

  /** Full entity data for create/update operations */
  data: unknown;

  /** Timestamp when the operation was created (ms since epoch) */
  timestamp: number;

  /** Current status of the operation */
  status: SyncOperationStatus;

  /** Number of sync attempts made */
  retryCount: number;

  /** Maximum retry attempts before giving up */
  maxRetries: number;

  /** Error message from last failed attempt */
  lastError?: string;

  /** Timestamp of last sync attempt (ms since epoch) */
  lastAttempt?: number;

  /** Timestamp when operation was created (ms since epoch) */
  createdAt: number;
}

/**
 * Input for creating a new sync operation.
 * ID, status, retryCount, and createdAt are set automatically.
 */
export type SyncOperationInput = Omit<
  SyncOperation,
  'id' | 'status' | 'retryCount' | 'maxRetries' | 'createdAt'
>;

/**
 * Sync status states for UI display.
 */
export type SyncStatusState =
  | 'synced'    // All operations synced successfully
  | 'syncing'   // Currently processing queue
  | 'pending'   // Has operations waiting (offline or between syncs)
  | 'error'     // Has failed operations that need attention
  | 'offline';  // No network connection

/**
 * Sync status information for UI components.
 */
export interface SyncStatusInfo {
  /** Current sync state */
  state: SyncStatusState;

  /** Number of pending operations */
  pendingCount: number;

  /** Number of failed operations */
  failedCount: number;

  /** Timestamp of last successful sync (ms since epoch), null if never synced */
  lastSyncedAt: number | null;

  /** Whether the device is currently online */
  isOnline: boolean;
}

/**
 * Queue statistics for monitoring.
 */
export interface SyncQueueStats {
  /** Number of pending operations */
  pending: number;

  /** Number of operations currently syncing */
  syncing: number;

  /** Number of failed operations */
  failed: number;

  /** Total operations in queue */
  total: number;

  /** Oldest operation timestamp (ms since epoch), null if queue empty */
  oldestTimestamp: number | null;
}

/**
 * Result of a conflict resolution.
 */
export interface ConflictResolution {
  /** Which version won (local or cloud) */
  winner: 'local' | 'cloud';

  /** Entity type involved */
  entityType: SyncEntityType;

  /** Entity ID involved */
  entityId: string;

  /** Local timestamp */
  localTimestamp: number;

  /** Cloud timestamp */
  cloudTimestamp: number;
}

/**
 * Events emitted by the SyncEngine.
 */
export interface SyncEngineEvents {
  /** Emitted when sync status changes */
  statusChange: (status: SyncStatusState) => void;

  /** Emitted when a conflict is resolved */
  conflictResolved: (resolution: ConflictResolution) => void;

  /** Emitted when an operation fails after max retries */
  operationFailed: (operation: SyncOperation) => void;

  /** Emitted when an operation succeeds */
  operationSuccess: (operation: SyncOperation) => void;

  /** Emitted when online status changes */
  onlineChange: (isOnline: boolean) => void;
}

/**
 * Configuration for the SyncEngine.
 */
export interface SyncEngineConfig {
  /** Interval between automatic sync attempts (ms). Default: 30000 (30s) */
  syncIntervalMs: number;

  /** Maximum retry attempts per operation. Default: 10 */
  maxRetries: number;

  /** Base delay for exponential backoff (ms). Default: 1000 (1s) */
  backoffBaseMs: number;

  /** Maximum backoff delay (ms). Default: 300000 (5 min) */
  backoffMaxMs: number;

  /** Batch size for processing queue. Default: 10 */
  batchSize: number;
}

/**
 * Default SyncEngine configuration.
 */
export const DEFAULT_SYNC_CONFIG: SyncEngineConfig = {
  syncIntervalMs: 30000,      // 30 seconds
  maxRetries: 10,
  backoffBaseMs: 1000,        // 1 second
  backoffMaxMs: 300000,       // 5 minutes
  batchSize: 10,
};

/**
 * Error codes specific to sync operations.
 */
export enum SyncErrorCode {
  /** Network unavailable */
  OFFLINE = 'SYNC_OFFLINE',

  /** Server returned error */
  SERVER_ERROR = 'SYNC_SERVER_ERROR',

  /** Conflict detected during sync */
  CONFLICT = 'SYNC_CONFLICT',

  /** Operation data invalid */
  INVALID_DATA = 'SYNC_INVALID_DATA',

  /** Authentication required */
  AUTH_REQUIRED = 'SYNC_AUTH_REQUIRED',

  /** Queue storage error */
  QUEUE_ERROR = 'SYNC_QUEUE_ERROR',

  /** Max retries exceeded */
  MAX_RETRIES = 'SYNC_MAX_RETRIES',

  /** IndexedDB quota exceeded */
  QUOTA_EXCEEDED = 'SYNC_QUOTA_EXCEEDED',
}

/**
 * Custom error class for sync-related errors.
 */
export class SyncError extends Error {
  constructor(
    public readonly code: SyncErrorCode,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SyncError';

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SyncError);
    }
  }
}
