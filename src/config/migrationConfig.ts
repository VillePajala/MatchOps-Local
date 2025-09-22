/**
 * Migration Configuration Constants
 *
 * Centralized configuration for migration system to avoid magic numbers
 * and provide easy maintenance of migration parameters
 */

// Application Data Versioning
export const CURRENT_DATA_VERSION = 2;
export const INDEXEDDB_STORAGE_VERSION = '2.0.0';

// Migration Timeouts (in milliseconds)
export const MIGRATION_OPERATION_TIMEOUT = 30000; // 30 seconds
export const MIGRATION_BATCH_TIMEOUT = 5000; // 5 seconds per batch
export const MIGRATION_TOTAL_TIMEOUT = 300000; // 5 minutes total
export const MIGRATION_RETRY_DELAY = 1000; // 1 second between retries

// Migration Performance Settings
export const MIGRATION_BATCH_SIZE = 50; // Items per batch
export const MIGRATION_MAX_CONCURRENCY = 3; // Max parallel operations
export const MIGRATION_PROGRESS_THROTTLE = 500; // MS between progress updates
export const MIGRATION_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for backup

// Storage Quota Thresholds
export const STORAGE_QUOTA_WARNING_THRESHOLD = 0.8; // 80% usage warning
export const STORAGE_QUOTA_CRITICAL_THRESHOLD = 0.95; // 95% usage critical
export const STORAGE_OVERHEAD_FACTOR = 0.1; // 10% overhead for metadata
export const STORAGE_BUFFER_FACTOR = 0.2; // 20% buffer for migration

// Retry Configuration
export const MIGRATION_MAX_RETRIES = 3;
export const MIGRATION_RETRY_BACKOFF_FACTOR = 2; // Exponential backoff
export const MIGRATION_INITIAL_RETRY_DELAY = 1000; // 1 second

// Memory Management
export const MIGRATION_MEMORY_CHECK_INTERVAL = 1000; // MS between memory checks
export const MIGRATION_MEMORY_WARNING_THRESHOLD = 100 * 1024 * 1024; // 100MB
export const MIGRATION_GC_SUGGESTION_THRESHOLD = 50 * 1024 * 1024; // 50MB

// UI Update Intervals
export const MIGRATION_UI_UPDATE_THROTTLE = 100; // MS between UI updates
export const MIGRATION_PROGRESS_DECIMALS = 1; // Decimal places for progress
export const MIGRATION_SUBSCRIBER_CLEANUP_DELAY = 1000; // MS delay for cleanup

// Browser Compatibility
export const MIGRATION_REQUIRED_APIS = [
  'indexedDB',
  'crypto',
  'Promise'
] as const;

// Fallback Values
export const MIGRATION_TEAM_NAME_FALLBACK = 'My Team';
export const MIGRATION_DEFAULT_TIMEOUT = 120000; // 2 minutes default

// Data Size Limits
export const MIGRATION_LARGE_DATASET_THRESHOLD = 100 * 1024 * 1024; // 100MB
export const MIGRATION_MAX_ITEM_SIZE = 10 * 1024 * 1024; // 10MB per item
export const MIGRATION_MAX_KEY_LENGTH = 500; // Max localStorage key length

// Validation Constants
export const MIGRATION_CHECKSUM_ALGORITHM = 'SHA-256';
export const MIGRATION_DATA_VERSION_REGEX = /^\d+\.\d+\.\d+$/;
export const MIGRATION_CORRELATION_ID_LENGTH = 12;

// Storage Keys (duplicated from storageKeys for migration independence)
export const MIGRATION_STORAGE_KEYS = {
  APP_DATA_VERSION: 'appDataVersion',
  MASTER_ROSTER: 'masterRoster',
  SAVED_GAMES: 'savedGames',
  SEASONS_LIST: 'seasonsList',
  TOURNAMENTS_LIST: 'tournamentsList',
  INDEXEDDB_VERSION: 'indexedDbVersion',
  MIGRATION_LOCK: 'migrationLock',
  MIGRATION_BACKUP_PREFIX: 'migration_backup_'
} as const;

// Error Messages
export const MIGRATION_ERROR_MESSAGES = {
  QUOTA_INSUFFICIENT: 'Insufficient storage space for migration',
  BROWSER_INCOMPATIBLE: 'Browser does not support required features',
  MIGRATION_IN_PROGRESS: 'Migration already in progress',
  BACKUP_FAILED: 'Failed to create backup before migration',
  VERIFICATION_FAILED: 'Data verification failed after migration',
  ROLLBACK_FAILED: 'Failed to rollback migration',
  TIMEOUT_EXCEEDED: 'Migration timeout exceeded',
  CORRUPTION_DETECTED: 'Data corruption detected during migration'
} as const;

// Success Messages
export const MIGRATION_SUCCESS_MESSAGES = {
  MIGRATION_COMPLETE: 'Storage upgrade completed successfully',
  BACKUP_CREATED: 'Backup created successfully',
  DATA_VERIFIED: 'Data integrity verified',
  CLEANUP_COMPLETE: 'Migration cleanup completed'
} as const;

// Migration Control Features (Phase 2.1)
export const MIGRATION_CONTROL_FEATURES = {
  // User control capabilities
  ALLOW_PAUSE: true,
  ALLOW_CANCEL: true,
  ALLOW_RESUME: true,

  // Pre-migration estimation
  ENABLE_SIZE_ESTIMATION: true,
  ENABLE_TIME_ESTIMATION: true,
  ESTIMATION_SAMPLE_SIZE: 10, // Sample first N items for speed estimation

  // Migration preview
  ENABLE_DRY_RUN: true,
  DRY_RUN_SAMPLE_SIZE: 5, // Items to test in dry run

  // Progress persistence
  SAVE_PROGRESS_INTERVAL: 5000, // Save progress every 5 seconds
  PROGRESS_STORAGE_KEY: 'matchops_migration_progress',

  // Resume configuration
  MAX_RESUME_ATTEMPTS: 3,
  RESUME_FROM_CHECKPOINT: true,
  CHECKPOINT_INTERVAL: 50, // Create checkpoint every N items
} as const;

/**
 * Get migration timeout based on data size
 */
export function getMigrationTimeout(dataSize: number): number {
  // Base timeout + additional time based on data size
  const baseTimeout = MIGRATION_TOTAL_TIMEOUT;
  const additionalTime = Math.max(0, (dataSize / (1024 * 1024)) * 1000); // 1 second per MB

  return Math.min(baseTimeout + additionalTime, 600000); // Max 10 minutes
}

/**
 * Get batch size based on available memory
 */
export function getBatchSize(availableMemory?: number): number {
  if (!availableMemory) return MIGRATION_BATCH_SIZE;

  // Reduce batch size if memory is limited
  if (availableMemory < 50 * 1024 * 1024) { // Less than 50MB
    return Math.max(10, MIGRATION_BATCH_SIZE / 2);
  }

  return MIGRATION_BATCH_SIZE;
}

/**
 * Get concurrency level based on system capabilities
 */
export function getConcurrencyLevel(): number {
  // Base on navigator.hardwareConcurrency if available
  if (typeof navigator !== 'undefined' && 'hardwareConcurrency' in navigator) {
    return Math.max(1, Math.min(MIGRATION_MAX_CONCURRENCY, navigator.hardwareConcurrency || 1));
  }

  return MIGRATION_MAX_CONCURRENCY;
}