/**
 * Sync Module
 *
 * Local-first sync system for cloud mode.
 * Operations are queued locally and synced to cloud in background.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

// Types
export type {
  SyncEntityType,
  SyncOperationType,
  SyncOperationStatus,
  SyncOperation,
  SyncOperationInput,
  SyncStatusState,
  SyncStatusInfo,
  SyncQueueStats,
  ConflictResolution,
  SyncEngineEvents,
  SyncEngineConfig,
} from './types';

export {
  DEFAULT_SYNC_CONFIG,
  SyncErrorCode,
  SyncError,
} from './types';

// SyncQueue
export { SyncQueue, syncQueue } from './SyncQueue';

// SyncEngine
export {
  SyncEngine,
  getSyncEngine,
  resetSyncEngine,
  type SyncOperationExecutor,
} from './SyncEngine';

// Conflict Resolution
export {
  ConflictResolver,
  isConflictError,
  isNotFoundError,
  type CloudRecord,
  type CloudRecordFetcher,
  type CloudRecordWriter,
  type CloudRecordDeleter,
  type LocalRecordWriter,
  type LocalRecordDeleter,
  type ConflictResolverOptions,
  type ResolutionResult,
} from './conflictResolution';
