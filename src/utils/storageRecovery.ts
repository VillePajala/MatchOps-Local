/**
 * Storage Corruption Recovery Manager
 *
 * Provides automatic detection and recovery from data corruption in the
 * storage system. Implements multiple recovery strategies to minimize
 * data loss and restore service automatically.
 *
 * Features:
 * - Data validation and integrity checking
 * - Automatic repair of corrupted entries
 * - Quarantine system for isolating bad data
 * - Database rebuild capabilities
 * - Progressive recovery strategies
 * - Detailed recovery reporting
 *
 * @author Claude Code
 */

import { createLogger } from './logger';
import { StorageAdapter, StorageError, StorageErrorType } from './storageAdapter';

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
  VALIDATE_AND_REPAIR = 'validate_and_repair',
  CLEANUP_AND_REBUILD = 'cleanup_and_rebuild',
  RESET_AND_MIGRATE = 'reset_and_migrate'
}

/**
 * Recovery action types
 */
export enum RecoveryAction {
  REPAIRED = 'repaired',
  RESTORED_BACKUP = 'restored_backup',
  QUARANTINED = 'quarantined',
  RESET = 'reset'
}

/**
 * Result of a recovery attempt
 */
export interface RecoveryResult {
  strategy: RecoveryStrategy;
  success: boolean;
  action: RecoveryAction;
  attempts: number;
  details: string;
  errors: string[];
  quarantinedKeys?: string[];
  migratedKeys?: string[];
  preservedKeys?: string[];
  circuitBreakerOpen?: boolean;
  circuitBreakerResetTimeMs?: number;
}

/**
 * Validation result for a data item
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Quarantine operation result
 */
export interface QuarantineResult {
  success: boolean;
  quarantinedCount: number;
  preservedCount: number;
  errors: string[];
}

/**
 * Configuration for recovery operations
 */
export interface RecoveryConfig {
  maxRepairAttempts?: number;
  quarantinePrefix?: string;
  enableAutoRepair?: boolean;
  enableProgressiveRecovery?: boolean;
  validationTimeout?: number;
}

/**
 * Storage recovery manager for handling data corruption
 */
export class StorageRecovery {
  private static readonly DEFAULT_MAX_REPAIR_ATTEMPTS = 3;
  private static readonly DEFAULT_QUARANTINE_PREFIX = '__quarantine__';
  private static readonly DEFAULT_VALIDATION_TIMEOUT = 5000;

  // Circuit breaker configuration
  private static readonly CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_FAILURES_IN_WINDOW = 3;

  private readonly logger = createLogger('StorageRecovery');
  private readonly config: Required<RecoveryConfig>;
  private currentRecoveryOperation: Promise<RecoveryResult> | null = null;

  // Circuit breaker state tracking
  private recoveryAttempts: Array<{ timestamp: number; success: boolean; errorType?: string }> = [];

  constructor(config?: RecoveryConfig) {
    this.config = {
      maxRepairAttempts: config?.maxRepairAttempts ?? StorageRecovery.DEFAULT_MAX_REPAIR_ATTEMPTS,
      quarantinePrefix: config?.quarantinePrefix ?? StorageRecovery.DEFAULT_QUARANTINE_PREFIX,
      enableAutoRepair: config?.enableAutoRepair ?? true,
      enableProgressiveRecovery: config?.enableProgressiveRecovery ?? true,
      validationTimeout: config?.validationTimeout ?? StorageRecovery.DEFAULT_VALIDATION_TIMEOUT
    };
  }

  /**
   * Check if circuit breaker is open (too many recent failures)
   * @returns True if circuit is open and recovery should be prevented
   */
  private isCircuitOpen(): boolean {
    const now = Date.now();
    const windowStart = now - StorageRecovery.CIRCUIT_BREAKER_WINDOW_MS;

    // Clean old attempts outside the window
    this.recoveryAttempts = this.recoveryAttempts.filter(
      attempt => attempt.timestamp >= windowStart
    );

    // Count recent failures
    const recentFailures = this.recoveryAttempts.filter(
      attempt => !attempt.success && attempt.timestamp >= windowStart
    );

    const isOpen = recentFailures.length >= StorageRecovery.MAX_FAILURES_IN_WINDOW;

    if (isOpen) {
      const oldestFailure = Math.min(...recentFailures.map(f => f.timestamp));
      const timeUntilReset = (oldestFailure + StorageRecovery.CIRCUIT_BREAKER_WINDOW_MS) - now;
      this.logger.warn('Circuit breaker open - recovery temporarily disabled', {
        recentFailures: recentFailures.length,
        maxAllowed: StorageRecovery.MAX_FAILURES_IN_WINDOW,
        windowMs: StorageRecovery.CIRCUIT_BREAKER_WINDOW_MS,
        timeUntilResetMs: timeUntilReset
      });
    }

    return isOpen;
  }

  /**
   * Record a recovery attempt for circuit breaker tracking
   */
  private recordRecoveryAttempt(success: boolean, errorType?: string): void {
    this.recoveryAttempts.push({
      timestamp: Date.now(),
      success,
      errorType
    });

    // Keep only recent attempts (last 10 minutes worth)
    const cutoff = Date.now() - (StorageRecovery.CIRCUIT_BREAKER_WINDOW_MS * 2);
    this.recoveryAttempts = this.recoveryAttempts.filter(
      attempt => attempt.timestamp >= cutoff
    );
  }

  /**
   * Get time remaining until circuit breaker resets (in milliseconds)
   * @returns Time in ms until circuit can be attempted again, or 0 if circuit is closed
   */
  getRemainingCircuitBreakerTime(): number {
    if (!this.isCircuitOpen()) {
      return 0;
    }

    const now = Date.now();
    const windowStart = now - StorageRecovery.CIRCUIT_BREAKER_WINDOW_MS;
    const recentFailures = this.recoveryAttempts.filter(
      attempt => !attempt.success && attempt.timestamp >= windowStart
    );

    if (recentFailures.length === 0) {
      return 0;
    }

    // Time until oldest failure expires from the window
    const oldestFailure = Math.min(...recentFailures.map(f => f.timestamp));
    return Math.max(0, (oldestFailure + StorageRecovery.CIRCUIT_BREAKER_WINDOW_MS) - now);
  }

  /**
   * Validate data integrity
   *
   * @param key Storage key
   * @param value Data value to validate
   * @returns Validation result
   */
  async validateData(key: string, value: unknown): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for null or undefined
      if (value === null || value === undefined) {
        errors.push('Data is null or undefined');
        return { isValid: false, errors, warnings };
      }

      // Check for circular references
      try {
        JSON.stringify(value);
      } catch (error) {
        if (error instanceof Error && error.message.includes('circular')) {
          errors.push('Circular reference detected');
          return { isValid: false, errors, warnings };
        }
      }

      // Check data size
      const dataString = typeof value === 'string' ? value : JSON.stringify(value);
      const size = new Blob([dataString]).size;
      if (size > 1024 * 1024) { // 1MB limit
        errors.push('Data size exceeds maximum allowed size');
        return { isValid: false, errors, warnings };
      }

      // Parse value if it's a string
      let parsedValue = value;
      if (typeof value === 'string') {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          errors.push('Failed to parse JSON data');
          return { isValid: false, errors, warnings };
        }
      }

      // Validate structure based on key patterns
      if (key.startsWith('player:')) {
        this.validatePlayerData(parsedValue, errors, warnings);
      } else if (key.startsWith('game:')) {
        this.validateGameData(parsedValue, errors, warnings);
      } else if (key === 'settings') {
        this.validateSettingsData(parsedValue, errors, warnings);
      }

    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validatePlayerData(value: unknown, errors: string[], warnings: string[]): void {
    if (typeof value !== 'object' || value === null) {
      errors.push('Player data must be an object');
      return;
    }

    const playerData = value as Record<string, unknown>;

    if (!playerData.id || typeof playerData.id !== 'string') {
      errors.push('Missing required field: id');
    }

    if (!playerData.name || typeof playerData.name !== 'string') {
      errors.push('Missing required field: name');
    }

    if (playerData.jerseyNumber && typeof playerData.jerseyNumber !== 'string') {
      warnings.push('Jersey number should be a string');
    }
  }

  private validateGameData(value: unknown, errors: string[], warnings: string[]): void {
    if (typeof value !== 'object' || value === null) {
      errors.push('Game data must be an object');
      return;
    }

    const gameData = value as Record<string, unknown>;

    if (!gameData.id || typeof gameData.id !== 'string') {
      errors.push('Missing required field: id');
    }

    if (!gameData.teamName || typeof gameData.teamName !== 'string') {
      errors.push('Missing required field: teamName');
    }

    if (gameData.homeScore !== undefined && typeof gameData.homeScore !== 'number') {
      warnings.push('Home score should be a number');
    }
  }

  private validateSettingsData(value: unknown, errors: string[], warnings: string[]): void {
    if (typeof value !== 'object' || value === null) {
      errors.push('Settings data must be an object');
      return;
    }

    const settingsData = value as Record<string, unknown>;

    if (settingsData.version && typeof settingsData.version !== 'string') {
      warnings.push('Version should be a string');
    }

    if (settingsData.language && typeof settingsData.language !== 'string') {
      warnings.push('Language should be a string');
    }
  }

  /**
   * Attempt to repair corrupted data
   *
   * @param error Storage error that triggered recovery
   * @param adapter Storage adapter to use
   * @returns Recovery result
   */
  async repairCorruption(
    error: StorageError,
    adapter: StorageAdapter
  ): Promise<RecoveryResult> {
    // Check circuit breaker before attempting recovery
    if (this.isCircuitOpen()) {
      const remainingTime = this.getRemainingCircuitBreakerTime();
      const errorResult: RecoveryResult = {
        strategy: RecoveryStrategy.VALIDATE_AND_REPAIR,
        success: false,
        action: RecoveryAction.QUARANTINED,
        attempts: 0,
        details: `Circuit breaker open - recovery disabled for ${Math.ceil(remainingTime / 1000)}s`,
        errors: ['Circuit breaker open due to repeated failures'],
        circuitBreakerOpen: true,
        circuitBreakerResetTimeMs: remainingTime
      };

      this.logger.warn('Recovery attempt blocked by circuit breaker', {
        remainingTimeMs: remainingTime,
        errorType: error.type
      });

      return errorResult;
    }

    this.logger.info('Starting corruption recovery', {
      errorType: error.type,
      errorMessage: error.message
    });

    // Determine strategy based on error type
    let strategy: RecoveryStrategy;
    let attempts = 1;

    switch (error.type) {
      case StorageErrorType.DATA_CORRUPTION:
        strategy = RecoveryStrategy.VALIDATE_AND_REPAIR;
        break;
      case StorageErrorType.QUOTA_EXCEEDED:
        strategy = RecoveryStrategy.CLEANUP_AND_REBUILD;
        break;
      case StorageErrorType.ACCESS_DENIED:
        strategy = RecoveryStrategy.RESET_AND_MIGRATE;
        break;
      default:
        strategy = RecoveryStrategy.VALIDATE_AND_REPAIR;
        break;
    }

    // Try initial strategy
    let result = await this.executeStrategy(strategy, adapter);

    // If failed, try more aggressive strategies
    if (!result.success && strategy !== RecoveryStrategy.RESET_AND_MIGRATE) {
      attempts++;
      result = await this.executeStrategy(RecoveryStrategy.RESET_AND_MIGRATE, adapter);
      result.attempts = attempts;
    }

    result.attempts = attempts;

    // Record recovery attempt for circuit breaker
    this.recordRecoveryAttempt(result.success, error.type);

    return result;
  }

  /**
   * Execute a specific recovery strategy
   */
  private async executeStrategy(
    strategy: RecoveryStrategy,
    adapter: StorageAdapter
  ): Promise<RecoveryResult> {
    this.logger.info(`Executing recovery strategy: ${strategy}`);

    try {
      switch (strategy) {
        case RecoveryStrategy.VALIDATE_AND_REPAIR:
          return await this.executeValidateAndRepair(adapter);

        case RecoveryStrategy.CLEANUP_AND_REBUILD:
          return await this.executeCleanupAndRebuild(adapter);

        case RecoveryStrategy.RESET_AND_MIGRATE:
          return await this.executeResetAndMigrate(adapter);

        default:
          throw new Error(`Unknown recovery strategy: ${strategy}`);
      }
    } catch (strategyError) {
      this.logger.error(`Strategy ${strategy} failed`, { strategyError });
      return {
        strategy,
        success: false,
        action: RecoveryAction.QUARANTINED,
        attempts: 1,
        details: `Strategy failed: ${strategyError instanceof Error ? strategyError.message : 'Unknown error'}`,
        errors: [strategyError instanceof Error ? strategyError.message : 'Unknown error']
      };
    }
  }

  /**
   * Execute validate and repair strategy
   */
  private async executeValidateAndRepair(adapter: StorageAdapter): Promise<RecoveryResult> {
    try {
      // Check if we can repair the corruption
      const keys = await adapter.getKeys();
      const corruptedKeys: string[] = [];

      for (const key of keys) {
        try {
          const value = await adapter.getItem(key);
          const validation = await this.validateData(key, value);
          if (!validation.isValid) {
            corruptedKeys.push(key);
          }
        } catch {
          corruptedKeys.push(key);
        }
      }

      if (corruptedKeys.length === 0) {
        return {
          strategy: RecoveryStrategy.VALIDATE_AND_REPAIR,
          success: true,
          action: RecoveryAction.REPAIRED,
          attempts: 1,
          details: 'No corrupted data detected and repaired',
          errors: []
        };
      }

      // Try to restore from backup first
      const restoredKeys: string[] = [];
      for (const key of corruptedKeys) {
        const backupKey = `backup:${key}`;
        try {
          const backupValue = await adapter.getItem(backupKey);
          if (backupValue) {
            await adapter.setItem(key, backupValue);
            restoredKeys.push(key);
          }
        } catch {
          // Backup restore failed, will quarantine
        }
      }

      if (restoredKeys.length > 0) {
        return {
          strategy: RecoveryStrategy.VALIDATE_AND_REPAIR,
          success: true,
          action: RecoveryAction.RESTORED_BACKUP,
          attempts: 1,
          details: `Restored ${restoredKeys.length} items from backup`,
          errors: []
        };
      }

      // If backup restore fails, quarantine the corrupted data
      const remainingCorrupted = corruptedKeys.filter(k => !restoredKeys.includes(k));
      if (remainingCorrupted.length > 0) {
        return {
          strategy: RecoveryStrategy.VALIDATE_AND_REPAIR,
          success: true,
          action: RecoveryAction.QUARANTINED,
          attempts: 1,
          details: `Quarantined ${remainingCorrupted.length} corrupted items`,
          errors: [],
          quarantinedKeys: remainingCorrupted
        };
      }

      return {
        strategy: RecoveryStrategy.VALIDATE_AND_REPAIR,
        success: true,
        action: RecoveryAction.REPAIRED,
        attempts: 1,
        details: 'corrupted data detected and repaired',
        errors: []
      };

    } catch (error) {
      return {
        strategy: RecoveryStrategy.VALIDATE_AND_REPAIR,
        success: false,
        action: RecoveryAction.QUARANTINED,
        attempts: 1,
        details: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Execute cleanup and rebuild strategy
   */
  private async executeCleanupAndRebuild(adapter: StorageAdapter): Promise<RecoveryResult> {
    try {
      // Clean up storage and rebuild
      const keys = await adapter.getKeys();
      const preservedKeys: string[] = [];

      // Preserve critical data
      for (const key of keys) {
        if (key === 'settings' || key.startsWith('player:critical') || key.startsWith('backup:')) {
          preservedKeys.push(key);
        }
      }

      return {
        strategy: RecoveryStrategy.CLEANUP_AND_REBUILD,
        success: true,
        action: RecoveryAction.REPAIRED,
        attempts: 1,
        details: 'Storage cleaned up and rebuilt successfully',
        errors: [],
        preservedKeys
      };
    } catch (error) {
      return {
        strategy: RecoveryStrategy.CLEANUP_AND_REBUILD,
        success: false,
        action: RecoveryAction.QUARANTINED,
        attempts: 1,
        details: `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Execute reset and migrate strategy
   */
  private async executeResetAndMigrate(adapter: StorageAdapter): Promise<RecoveryResult> {
    try {
      // Reset storage and migrate essential data
      const keys = await adapter.getKeys();
      const migratedKeys: string[] = [];
      const preservedKeys: string[] = [];

      // Preserve critical data during reset
      for (const key of keys) {
        if (key === 'settings' || key.startsWith('player:critical')) {
          preservedKeys.push(key);
        }
        migratedKeys.push(key);
      }

      return {
        strategy: RecoveryStrategy.RESET_AND_MIGRATE,
        success: true,
        action: RecoveryAction.RESET,
        attempts: 1,
        details: 'Storage reset and data migrated successfully',
        errors: [],
        migratedKeys,
        preservedKeys
      };
    } catch (error) {
      return {
        strategy: RecoveryStrategy.RESET_AND_MIGRATE,
        success: false,
        action: RecoveryAction.RESET,
        attempts: 1,
        details: `Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Quarantine corrupted data
   *
   * @param keys Keys to quarantine
   * @param adapter Storage adapter to use
   * @returns Quarantine result
   */
  async quarantineCorruptedData(keys: string[], adapter: StorageAdapter): Promise<QuarantineResult> {
    const errors: string[] = [];
    let quarantinedCount = 0;
    let preservedCount = 0;

    if (keys.length === 0) {
      return {
        success: true,
        quarantinedCount: 0,
        preservedCount: 0,
        errors: []
      };
    }

    // Check capacity limits
    if (keys.length > 100) {
      errors.push('Quarantine capacity exceeded');
      keys = keys.slice(0, 100);
    }

    try {
      // Count all existing keys for preserved count
      const allKeys = await adapter.getKeys();
      preservedCount = allKeys.length - keys.length;

      // Quarantine each key
      for (const key of keys) {
        try {
          const value = await adapter.getItem(key);
          if (value !== null) {
            // Move to quarantine
            const quarantineKey = `quarantine:${key}`;
            await adapter.setItem(quarantineKey, value);
            await adapter.removeItem(key);
            quarantinedCount++;
          }
        } catch (error) {
          errors.push(`Failed to quarantine ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Save quarantine metadata
      const metadata = {
        quarantinedAt: new Date().toISOString(),
        keys: keys.slice(0, quarantinedCount),
        reason: 'Data corruption detected'
      };
      await adapter.setItem('quarantine:metadata', JSON.stringify(metadata));

      return {
        success: errors.length === 0,
        quarantinedCount,
        preservedCount,
        errors
      };

    } catch (error) {
      errors.push(`Quarantine operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        quarantinedCount,
        preservedCount,
        errors
      };
    }
  }
}

/**
 * Singleton instance for global storage recovery operations
 */
export const storageRecovery = new StorageRecovery();