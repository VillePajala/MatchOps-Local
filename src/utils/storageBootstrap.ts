/**
 * Storage Bootstrap Utilities
 *
 * Provides low-level IndexedDB access for breaking circular dependencies.
 * This module is specifically designed to be imported by storageConfigManager
 * without depending on the full storage factory infrastructure.
 *
 * **Purpose:** Break circular dependency chain:
 * - storageConfigManager needs to read/write config
 * - storage.ts depends on storageFactory
 * - storageFactory depends on storageConfigManager
 *
 * **Solution:** Direct IndexedDB access without factory dependencies
 *
 * @author Claude Code
 */

import { openDB, IDBPDatabase } from 'idb';
import { createLogger } from './logger';

const logger = createLogger('StorageBootstrap');

/**
 * Bootstrap database configuration
 * Uses same settings as IndexedDBKvAdapter for compatibility
 */
const BOOTSTRAP_DB_NAME = 'MatchOpsLocal';
const BOOTSTRAP_DB_VERSION = 1;
const BOOTSTRAP_STORE_NAME = 'keyValueStore';

/**
 * Singleton database connection for bootstrap operations
 */
let bootstrapDb: IDBPDatabase | null = null;
let bootstrapInitPromise: Promise<IDBPDatabase> | null = null;

/**
 * Initialize bootstrap IndexedDB connection
 * Matches IndexedDBKvAdapter structure for compatibility
 */
async function initializeBootstrapDB(): Promise<IDBPDatabase> {
  // Check if running in browser environment
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB not available in this environment (likely Node.js test environment)');
  }

  if (bootstrapDb) {
    return bootstrapDb;
  }

  if (bootstrapInitPromise) {
    return bootstrapInitPromise;
  }

  bootstrapInitPromise = openDB(BOOTSTRAP_DB_NAME, BOOTSTRAP_DB_VERSION, {
    upgrade: (db) => {
      // Create the key-value object store if it doesn't exist
      if (!db.objectStoreNames.contains(BOOTSTRAP_STORE_NAME)) {
        const store = db.createObjectStore(BOOTSTRAP_STORE_NAME, {
          keyPath: 'key'
        });
        // Add index for efficient key enumeration
        store.createIndex('keyIndex', 'key', { unique: true });
        logger.debug('Created bootstrap object store');
      }
    }
  }).then(db => {
    bootstrapDb = db;
    bootstrapInitPromise = null;
    logger.debug('Bootstrap database initialized');
    return db;
  }).catch(error => {
    bootstrapInitPromise = null;
    logger.error('Failed to initialize bootstrap database', { error });
    throw error;
  });

  return bootstrapInitPromise;
}

/**
 * Get item from IndexedDB (bootstrap version)
 *
 * @param key - Storage key
 * @returns Value as string or null if not found
 */
export async function bootstrapGetItem(key: string): Promise<string | null> {
  try {
    const db = await initializeBootstrapDB();
    const tx = db.transaction(BOOTSTRAP_STORE_NAME, 'readonly');
    const store = tx.objectStore(BOOTSTRAP_STORE_NAME);

    const record = await store.get(key);
    await tx.done;

    if (record && typeof record.value === 'string') {
      return record.value;
    }

    return null;
  } catch (error) {
    logger.error('Bootstrap getItem failed', { key, error });
    // In bootstrap phase, fail gracefully
    return null;
  }
}

/**
 * Set item in IndexedDB (bootstrap version)
 *
 * @param key - Storage key
 * @param value - Value to store (must be string)
 */
export async function bootstrapSetItem(key: string, value: string): Promise<void> {
  try {
    const db = await initializeBootstrapDB();
    const tx = db.transaction(BOOTSTRAP_STORE_NAME, 'readwrite');
    const store = tx.objectStore(BOOTSTRAP_STORE_NAME);

    await store.put({ key, value });
    await tx.done;

    logger.debug('Bootstrap setItem succeeded', { key });
  } catch (error) {
    logger.error('Bootstrap setItem failed', { key, error });
    throw error;
  }
}

/**
 * Get JSON value from IndexedDB (bootstrap version)
 *
 * @param key - Storage key
 * @returns Parsed JSON value or null
 */
export async function bootstrapGetJSON<T>(key: string): Promise<T | null> {
  try {
    const value = await bootstrapGetItem(key);

    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  } catch (error) {
    logger.error('Bootstrap getJSON failed', { key, error });
    return null;
  }
}

/**
 * Set JSON value in IndexedDB (bootstrap version)
 *
 * @param key - Storage key
 * @param value - Value to serialize and store
 */
export async function bootstrapSetJSON<T>(key: string, value: T): Promise<void> {
  try {
    const serialized = JSON.stringify(value);
    await bootstrapSetItem(key, serialized);
  } catch (error) {
    logger.error('Bootstrap setJSON failed', { key, error });
    throw error;
  }
}

/**
 * Close bootstrap database connection (for cleanup)
 * Should only be called during application shutdown
 */
export async function closeBootstrapDB(): Promise<void> {
  if (bootstrapDb) {
    bootstrapDb.close();
    bootstrapDb = null;
    bootstrapInitPromise = null;
    logger.debug('Bootstrap database closed');
  }
}