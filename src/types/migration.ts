/**
 * Migration Types
 *
 * Centralized type definitions for migration system interfaces
 */

/**
 * Base migration progress information
 */
export interface MigrationProgress {
  state: MigrationState;
  currentStep: string;
  totalKeys: number;
  processedKeys: number;
  currentKey?: string;
  percentage: number;
  startTime?: number;
  endTime?: number;
}

/**
 * Migration states
 */
export enum MigrationState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  PROCESSING = 'processing',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  state: MigrationState;
  errors: string[];
  migratedKeys: string[];
  startTime?: number;
  endTime?: number;
  totalDuration?: number;
}

/**
 * Migration callbacks
 */
export interface MigrationCallbacks {
  onProgress?: (progress: MigrationProgress) => void;
  onComplete?: (result: MigrationResult) => void;
  onError?: (error: string) => void;
  onStateChange?: (state: MigrationState) => void;
}

/**
 * Migration options
 */
export interface MigrationOptions {
  skipValidation?: boolean;
  enableBackup?: boolean;
  batchSize?: number;
  timeout?: number;
}

/**
 * Storage adapter interface for migration operations
 */
export interface StorageAdapter {
  /** Get an item from storage */
  getItem(key: string): Promise<unknown>;
  /** Set an item in storage */
  setItem(key: string, value: unknown): Promise<void>;
  /** Remove an item from storage */
  removeItem?(key: string): Promise<void>;
  /** Get all keys from storage (optional for fallback support) */
  getAllKeys?(): Promise<string[]>;
  /** Clear all items from storage (optional) */
  clear?(): Promise<void>;
}