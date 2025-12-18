/**
 * DataStore Error Classes
 *
 * Custom error types for DataStore operations.
 * Part of Phase 2 backend abstraction (PR #4).
 *
 * @see DataStore.ts for main interface
 * @see docs/03-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md
 */

/**
 * Error codes for DataStore operations.
 */
export type DataStoreErrorCode =
  | 'NOT_INITIALIZED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'VALIDATION_ERROR'
  | 'STORAGE_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'NOT_SUPPORTED'
  | 'CONFLICT'
  | 'UNKNOWN';

/**
 * Base error class for all DataStore errors.
 *
 * @example
 * ```typescript
 * try {
 *   await dataStore.getGameById('invalid-id');
 * } catch (error) {
 *   if (error instanceof DataStoreError) {
 *     if (error.code === 'NOT_FOUND') {
 *       // Handle not found
 *     }
 *   }
 * }
 * ```
 */
export class DataStoreError extends Error {
  public readonly code: DataStoreErrorCode;
  public readonly cause?: Error;

  constructor(message: string, code: DataStoreErrorCode, cause?: Error) {
    super(message);
    this.name = 'DataStoreError';
    this.code = code;
    this.cause = cause;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DataStoreError);
    }
  }
}

/**
 * Error thrown when DataStore is used before initialization.
 */
export class NotInitializedError extends DataStoreError {
  constructor(message = 'DataStore not initialized. Call initialize() first.') {
    super(message, 'NOT_INITIALIZED');
    this.name = 'NotInitializedError';
  }
}

/**
 * Error thrown when a requested resource is not found.
 */
export class NotFoundError extends DataStoreError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, 'NOT_FOUND');
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Error thrown when attempting to create a resource that already exists.
 */
export class AlreadyExistsError extends DataStoreError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} already exists: ${resourceId}`, 'ALREADY_EXISTS');
    this.name = 'AlreadyExistsError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Error thrown when data validation fails.
 */
export class ValidationError extends DataStoreError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Error thrown when underlying storage operation fails.
 */
export class StorageError extends DataStoreError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_ERROR', cause);
    this.name = 'StorageError';
  }
}

/**
 * Error thrown when network operation fails (for cloud backends).
 */
export class NetworkError extends DataStoreError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, cause?: Error) {
    super(message, 'NETWORK_ERROR', cause);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
  }
}

/**
 * Error thrown for authentication/authorization failures.
 */
export class AuthError extends DataStoreError {
  constructor(message: string, cause?: Error) {
    super(message, 'AUTH_ERROR', cause);
    this.name = 'AuthError';
  }
}

/**
 * Error thrown when operation is not supported by the backend.
 */
export class NotSupportedError extends DataStoreError {
  public readonly operation: string;
  public readonly backend: string;

  constructor(operation: string, backend: string) {
    super(`Operation '${operation}' not supported by ${backend} backend`, 'NOT_SUPPORTED');
    this.name = 'NotSupportedError';
    this.operation = operation;
    this.backend = backend;
  }
}

/**
 * Error thrown when a conflict is detected (for optimistic locking).
 */
export class ConflictError extends DataStoreError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string, message?: string) {
    super(message || `Conflict detected for ${resourceType}: ${resourceId}`, 'CONFLICT');
    this.name = 'ConflictError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}
