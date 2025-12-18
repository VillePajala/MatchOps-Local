/**
 * DataStore Interfaces
 *
 * Public exports for the DataStore abstraction layer.
 * Part of Phase 2 backend abstraction (PR #4).
 *
 * @example
 * ```typescript
 * import type { DataStore } from '@/interfaces';
 * import { DataStoreError, NotFoundError } from '@/interfaces';
 * ```
 *
 * @see docs/03-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md
 */

// Main interface
export type { DataStore } from './DataStore';

// Supporting types
export type {
  DataStoreMode,
  DataStoreConfig,
  BulkOperationResult,
  FilterOptions,
  GameFilterOptions,
  SyncStatus,
  ConflictResolution,
  ConnectionStatus,
} from './DataStoreTypes';

// Error types
export type { DataStoreErrorCode } from './DataStoreErrors';
export {
  DataStoreError,
  NotInitializedError,
  NotFoundError,
  AlreadyExistsError,
  ValidationError,
  StorageError,
  NetworkError,
  AuthError,
  NotSupportedError,
  ConflictError,
} from './DataStoreErrors';
