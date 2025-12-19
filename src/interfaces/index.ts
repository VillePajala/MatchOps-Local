/**
 * Backend Abstraction Interfaces
 *
 * Public exports for the DataStore and AuthService abstraction layers.
 * Part of Phase 2 backend abstraction (PRs #4-5).
 *
 * @example
 * ```typescript
 * import type { DataStore, AuthService } from '@/interfaces';
 * import { DataStoreError, NotFoundError, LOCAL_USER } from '@/interfaces';
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

// ==========================================================================
// AUTH SERVICE (PR #5)
// ==========================================================================

// Auth interface
export type { AuthService } from './AuthService';

// Auth types
export type {
  User,
  Session,
  AuthResult,
  AuthErrorInfo,
  AuthErrorCode,
  AuthState,
  AuthStateCallback,
  SignUpOptions,
  SignInOptions,
} from './AuthTypes';

// Auth constants
export { LOCAL_USER } from './AuthTypes';
