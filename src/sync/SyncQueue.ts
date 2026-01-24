/**
 * SyncQueue - Persistent Queue for Sync Operations
 *
 * Stores pending sync operations in IndexedDB. Operations survive app restarts
 * and are processed by the SyncEngine when online.
 *
 * Features:
 * - Persistent storage in dedicated IndexedDB database
 * - Deduplication: updating same entity replaces existing pending operation
 * - Status tracking: pending → syncing → completed/failed
 * - Retry support with exponential backoff timing
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import logger from '@/utils/logger';
import {
  SyncOperation,
  SyncOperationInput,
  SyncOperationType,
  SyncOperationStatus,
  SyncQueueStats,
  SyncError,
  SyncErrorCode,
  DEFAULT_SYNC_CONFIG,
} from './types';

/** Database name for sync queue (separate from main app data) */
const SYNC_DB_NAME = 'matchops_sync_queue';

/** Database version */
const SYNC_DB_VERSION = 1;

/** Object store name */
const SYNC_STORE_NAME = 'operations';

/** Index names */
const INDEX_STATUS = 'by_status';
const INDEX_ENTITY = 'by_entity';
const INDEX_TIMESTAMP = 'by_timestamp';

/**
 * Generate a UUID v4
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * SyncQueue manages persistent storage of sync operations.
 *
 * Usage:
 * ```typescript
 * const queue = new SyncQueue();
 * await queue.initialize();
 *
 * // Add operation
 * const id = await queue.enqueue({
 *   entityType: 'game',
 *   entityId: 'game_123',
 *   operation: 'update',
 *   data: gameData,
 *   timestamp: Date.now(),
 * });
 *
 * // Get pending operations
 * const pending = await queue.getPending(10);
 *
 * // Mark as completed
 * await queue.markCompleted(id);
 * ```
 */
export class SyncQueue {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private maxRetries: number;
  private backoffBaseMs: number;
  private backoffMaxMs: number;

  constructor(config?: Partial<typeof DEFAULT_SYNC_CONFIG>) {
    this.maxRetries = config?.maxRetries ?? DEFAULT_SYNC_CONFIG.maxRetries;
    this.backoffBaseMs = config?.backoffBaseMs ?? DEFAULT_SYNC_CONFIG.backoffBaseMs;
    this.backoffMaxMs = config?.backoffMaxMs ?? DEFAULT_SYNC_CONFIG.backoffMaxMs;
  }

  /**
   * Initialize the sync queue database.
   * Must be called before any other operations.
   */
  async initialize(): Promise<void> {
    // Return existing promise if initialization is in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Already initialized
    if (this.db) {
      return;
    }

    this.initPromise = this.openDatabase();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Check if the queue is initialized.
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Open/create the IndexedDB database.
   */
  private async openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          'IndexedDB not available'
        ));
        return;
      }

      logger.debug('[SyncQueue] Opening database...');

      const request = window.indexedDB.open(SYNC_DB_NAME, SYNC_DB_VERSION);

      request.onerror = () => {
        logger.error('[SyncQueue] Failed to open database:', request.error);
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to open sync queue database: ${request.error?.message || 'Unknown error'}`,
          request.error ?? undefined
        ));
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.info('[SyncQueue] Database opened successfully');

        // Handle unexpected close
        this.db.onclose = () => {
          logger.warn('[SyncQueue] Database connection closed unexpectedly');
          this.db = null;
        };

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        logger.info('[SyncQueue] Upgrading database schema...');

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
          const store = db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'id' });

          // Index by status (for getting pending/failed operations)
          store.createIndex(INDEX_STATUS, 'status', { unique: false });

          // Index by entity (for deduplication)
          store.createIndex(INDEX_ENTITY, ['entityType', 'entityId'], { unique: false });

          // Index by timestamp (for ordering)
          store.createIndex(INDEX_TIMESTAMP, 'timestamp', { unique: false });

          logger.info('[SyncQueue] Created object store and indexes');
        }
      };

      request.onblocked = () => {
        logger.warn('[SyncQueue] Database upgrade blocked - close other tabs');
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          'Database upgrade blocked. Please close other tabs using this app.'
        ));
      };
    });
  }

  /**
   * Ensure database is initialized before operations.
   */
  private ensureInitialized(): IDBDatabase {
    if (!this.db) {
      throw new SyncError(
        SyncErrorCode.QUEUE_ERROR,
        'SyncQueue not initialized. Call initialize() first.'
      );
    }
    return this.db;
  }

  /**
   * Add an operation to the sync queue.
   *
   * Deduplication: If an operation for the same entity+entityId exists with
   * status 'pending', it will be replaced with the new operation.
   *
   * @param input - Operation data (id, status, etc. are set automatically)
   * @returns Promise resolving to the operation ID
   */
  async enqueue(input: SyncOperationInput): Promise<string> {
    const db = this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);
      const entityIndex = store.index(INDEX_ENTITY);

      // Check for existing pending operation for this entity
      const entityKey = IDBKeyRange.only([input.entityType, input.entityId]);
      const cursorRequest = entityIndex.openCursor(entityKey);

      let existingOp: SyncOperation | null = null;
      let resultId: string | null = null;
      const entityInfo = `${input.entityType}/${input.entityId}`;

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;

        if (cursor) {
          const existing = cursor.value as SyncOperation;

          // Only deduplicate pending operations
          if (existing.status === 'pending') {
            existingOp = existing;
            logger.debug('[SyncQueue] Found existing pending operation', {
              entityType: input.entityType,
              entityId: input.entityId,
              existingId: existing.id,
              existingOperation: existing.operation,
              newOperation: input.operation,
            });
          }
          cursor.continue();
        } else {
          // Cursor exhausted - perform write in SAME transaction (atomic)
          resultId = this.performWriteInTransaction(store, input, existingOp);
        }
      };

      cursorRequest.onerror = () => {
        logger.error(`[SyncQueue] Cursor error for ${entityInfo}:`, cursorRequest.error);
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to check existing operations for ${entityInfo}: ${cursorRequest.error?.message || 'Unknown error'}`,
          cursorRequest.error ?? undefined
        ));
      };

      transaction.oncomplete = () => {
        if (resultId !== null) {
          resolve(resultId);
        }
        // If resultId is null, error handler will have rejected
      };

      transaction.onerror = () => {
        const error = transaction.error;

        // Check for quota exceeded error
        if (error?.name === 'QuotaExceededError') {
          logger.error(`[SyncQueue] Quota exceeded while enqueuing ${entityInfo}:`, error);
          reject(new SyncError(
            SyncErrorCode.QUOTA_EXCEEDED,
            `Storage quota exceeded while saving ${entityInfo}. Please free up space.`,
            error
          ));
          return;
        }

        logger.error(`[SyncQueue] Transaction error for ${entityInfo}:`, error);
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to enqueue ${input.operation} for ${entityInfo}: ${error?.message || 'Unknown error'}`,
          error ?? undefined
        ));
      };
    });
  }

  /**
   * Perform the write operation within an existing transaction.
   * Must be called while transaction is still active (not after oncomplete).
   *
   * @returns The operation ID, or null if CREATE+DELETE cancelled both
   */
  private performWriteInTransaction(
    store: IDBObjectStore,
    input: SyncOperationInput,
    existingOp: SyncOperation | null
  ): string {
    const now = Date.now();
    const entityInfo = `${input.entityType}/${input.entityId}`;

    // Determine merged operation type if replacing
    let finalOperation = input.operation;
    if (existingOp) {
      const merged = this.getMergedOperation(existingOp.operation, input.operation);

      if (merged === null) {
        // CREATE + DELETE = remove existing, don't add new
        store.delete(existingOp.id);
        logger.debug('[SyncQueue] CREATE + DELETE merged: both removed', {
          entityType: input.entityType,
          entityId: input.entityId,
          existingId: existingOp.id,
        });
        // Return the existing ID (operation is gone, but ID is valid for reference)
        return existingOp.id;
      }

      finalOperation = merged;
    }

    const id = existingOp?.id || generateId();

    const operation: SyncOperation = {
      ...input,
      id,
      operation: finalOperation,
      status: 'pending',
      retryCount: 0,
      maxRetries: this.maxRetries,
      createdAt: existingOp?.createdAt ?? now,
    };

    // If replacing, delete the old one first
    if (existingOp) {
      store.delete(existingOp.id);
    }

    store.put(operation);

    logger.debug('[SyncQueue] Operation enqueued', {
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: finalOperation,
      originalOperation: input.operation,
      merged: existingOp ? `${existingOp.operation} + ${input.operation} → ${finalOperation}` : null,
    });

    return id;
  }

  /**
   * Determine the merged operation type when combining existing + new operations.
   *
   * Merge rules:
   * - CREATE + UPDATE → CREATE (with new data) - entity doesn't exist on server yet
   * - CREATE + DELETE → null (remove both - entity never existed on server)
   * - UPDATE + UPDATE → UPDATE (with new data)
   * - UPDATE + DELETE → DELETE
   * - DELETE + any → new operation (rare edge case, just use new)
   */
  private getMergedOperation(
    existingOp: SyncOperationType,
    newOp: SyncOperationType
  ): SyncOperationType | null {
    if (existingOp === 'create') {
      if (newOp === 'delete') {
        // CREATE + DELETE = nothing (entity never existed on server)
        return null;
      }
      // CREATE + UPDATE = CREATE (keep create, use new data)
      return 'create';
    }

    if (existingOp === 'update') {
      if (newOp === 'delete') {
        // UPDATE + DELETE = DELETE
        return 'delete';
      }
      // UPDATE + UPDATE = UPDATE
      return 'update';
    }

    // DELETE + any = use new operation (edge case)
    return newOp;
  }

  /**
   * Get pending operations ready for sync.
   *
   * Respects retry backoff timing - operations that failed recently
   * won't be returned until their backoff period has elapsed.
   *
   * @param limit - Maximum number of operations to return
   * @returns Operations ready for sync, oldest first
   */
  async getPending(limit: number = 10): Promise<SyncOperation[]> {
    const db = this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readonly');
      const store = transaction.objectStore(SYNC_STORE_NAME);
      const index = store.index(INDEX_TIMESTAMP);

      const results: SyncOperation[] = [];
      const now = Date.now();

      const request = index.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;

        if (cursor && results.length < limit) {
          const op = cursor.value as SyncOperation;

          // Only return pending operations that are ready for retry
          if (op.status === 'pending' && this.isReadyForRetry(op, now)) {
            results.push(op);
          }

          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        logger.debug('[SyncQueue] Got pending operations', { count: results.length });
        resolve(results);
      };

      transaction.onerror = () => {
        logger.error('[SyncQueue] getPending error:', transaction.error);
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to get pending operations: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }

  /**
   * Check if an operation is ready for retry based on exponential backoff.
   */
  private isReadyForRetry(op: SyncOperation, now: number): boolean {
    // Never tried yet - ready
    if (!op.lastAttempt || op.retryCount === 0) {
      return true;
    }

    // Calculate backoff delay
    const backoffDelay = Math.min(
      this.backoffBaseMs * Math.pow(2, op.retryCount - 1),
      this.backoffMaxMs
    );

    const readyAt = op.lastAttempt + backoffDelay;
    return now >= readyAt;
  }

  /**
   * Mark an operation as currently syncing.
   */
  async markSyncing(id: string): Promise<void> {
    await this.updateStatus(id, 'syncing');
  }

  /**
   * Mark an operation as failed.
   * Increments retry count and records the error.
   *
   * @param id - Operation ID
   * @param error - Error message
   */
  async markFailed(id: string, error: string): Promise<void> {
    const db = this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);

      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const op = getRequest.result as SyncOperation | undefined;

        if (!op) {
          logger.warn('[SyncQueue] Operation not found for markFailed:', id);
          resolve();
          return;
        }

        const newRetryCount = op.retryCount + 1;
        const newStatus: SyncOperationStatus =
          newRetryCount >= op.maxRetries ? 'failed' : 'pending';

        const updated: SyncOperation = {
          ...op,
          status: newStatus,
          retryCount: newRetryCount,
          lastError: error,
          lastAttempt: Date.now(),
        };

        store.put(updated);

        logger.debug('[SyncQueue] Operation marked failed', {
          id,
          retryCount: newRetryCount,
          maxRetries: op.maxRetries,
          finalFailed: newStatus === 'failed',
        });
      };

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        logger.error('[SyncQueue] markFailed error:', transaction.error);
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to mark operation as failed: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }

  /**
   * Mark an operation as completed and remove it from the queue.
   */
  async markCompleted(id: string): Promise<void> {
    const db = this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);

      const request = store.delete(id);

      request.onsuccess = () => {
        logger.debug('[SyncQueue] Operation completed and removed', { id });
      };

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        logger.error('[SyncQueue] markCompleted error:', transaction.error);
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to mark operation as completed: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }

  /**
   * Get an operation by ID.
   */
  async getById(id: string): Promise<SyncOperation | null> {
    const db = this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readonly');
      const store = transaction.objectStore(SYNC_STORE_NAME);

      const request = store.get(id);

      request.onsuccess = () => {
        // IndexedDB returns undefined for missing keys, normalize to null
        resolve((request.result as SyncOperation) ?? null);
      };

      transaction.onerror = () => {
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to get operation: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }

  /**
   * Get queue statistics.
   */
  async getStats(): Promise<SyncQueueStats> {
    const db = this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readonly');
      const store = transaction.objectStore(SYNC_STORE_NAME);

      const stats: SyncQueueStats = {
        pending: 0,
        syncing: 0,
        failed: 0,
        total: 0,
        oldestTimestamp: null,
      };

      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;

        if (cursor) {
          const op = cursor.value as SyncOperation;
          stats.total++;

          switch (op.status) {
            case 'pending':
              stats.pending++;
              break;
            case 'syncing':
              stats.syncing++;
              break;
            case 'failed':
              stats.failed++;
              break;
          }

          if (stats.oldestTimestamp === null || op.timestamp < stats.oldestTimestamp) {
            stats.oldestTimestamp = op.timestamp;
          }

          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        logger.debug('[SyncQueue] Stats:', stats);
        resolve(stats);
      };

      transaction.onerror = () => {
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to get stats: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }

  /**
   * Get all failed operations.
   */
  async getFailed(): Promise<SyncOperation[]> {
    const db = this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readonly');
      const store = transaction.objectStore(SYNC_STORE_NAME);
      const index = store.index(INDEX_STATUS);

      const request = index.getAll(IDBKeyRange.only('failed'));

      request.onsuccess = () => {
        resolve(request.result as SyncOperation[]);
      };

      transaction.onerror = () => {
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to get failed operations: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }

  /**
   * Retry all failed operations by resetting their status to pending.
   */
  async retryFailed(): Promise<number> {
    const failed = await this.getFailed();
    const db = this.ensureInitialized();

    if (failed.length === 0) {
      return 0;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);

      for (const op of failed) {
        const updated: SyncOperation = {
          ...op,
          status: 'pending',
          retryCount: 0,
          lastError: undefined,
          lastAttempt: undefined,
        };
        store.put(updated);
      }

      transaction.oncomplete = () => {
        logger.info('[SyncQueue] Reset failed operations for retry', { count: failed.length });
        resolve(failed.length);
      };

      transaction.onerror = () => {
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to retry operations: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }

  /**
   * Discard all failed operations.
   */
  async discardFailed(): Promise<number> {
    const failed = await this.getFailed();
    const db = this.ensureInitialized();

    if (failed.length === 0) {
      return 0;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);

      for (const op of failed) {
        store.delete(op.id);
      }

      transaction.oncomplete = () => {
        logger.info('[SyncQueue] Discarded failed operations', { count: failed.length });
        resolve(failed.length);
      };

      transaction.onerror = () => {
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to discard operations: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }

  /**
   * Clear all operations from the queue.
   */
  async clear(): Promise<void> {
    const db = this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);

      const request = store.clear();

      request.onsuccess = () => {
        logger.info('[SyncQueue] Queue cleared');
      };

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to clear queue: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.debug('[SyncQueue] Database connection closed');
    }
  }

  /**
   * Update operation status.
   */
  private async updateStatus(id: string, status: SyncOperationStatus): Promise<void> {
    const db = this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);

      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const op = getRequest.result as SyncOperation | undefined;

        if (!op) {
          logger.warn('[SyncQueue] Operation not found for status update:', id);
          resolve();
          return;
        }

        const updated: SyncOperation = {
          ...op,
          status,
          lastAttempt: status === 'syncing' ? Date.now() : op.lastAttempt,
        };

        store.put(updated);
      };

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(new SyncError(
          SyncErrorCode.QUEUE_ERROR,
          `Failed to update status: ${transaction.error?.message || 'Unknown error'}`,
          transaction.error ?? undefined
        ));
      };
    });
  }
}

/**
 * Default SyncQueue instance.
 * Initialize before use: `await syncQueue.initialize()`
 */
export const syncQueue = new SyncQueue();
