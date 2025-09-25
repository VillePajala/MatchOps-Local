/**
 * Migration Memory Safety System
 *
 * Provides production-ready memory protection for migration operations.
 * Prevents browser crashes and ensures stable migration experience.
 */

import { memoryManager, MemoryPressureLevel } from './memoryManager';
import logger from './logger';
import {
  MIGRATION_MEMORY_EMERGENCY_THRESHOLD,
  MIGRATION_MEMORY_CRITICAL_THRESHOLD,
  MIGRATION_MEMORY_HIGH_THRESHOLD,
  MIGRATION_MEMORY_RECOVERY_WAIT_MS,
  MIGRATION_MIN_AVAILABLE_MEMORY
} from '@/config/migrationConfig';

export interface MemoryCheckResult {
  safe: boolean;
  level: MemoryPressureLevel;
  action: 'continue' | 'reduce_batch' | 'pause' | 'halt';
  message: string;
  availableBytes?: number;
  usagePercentage?: number;
}

export interface MemoryRecoveryResult {
  recovered: boolean;
  finalLevel: MemoryPressureLevel;
  waitedMs: number;
  attemptsCount: number;
}

/**
 * Check if migration operation can safely proceed
 */
export async function checkMigrationMemorySafety(): Promise<MemoryCheckResult> {
  const memory = memoryManager.getMemoryInfo();
  const level = memoryManager.getMemoryPressureLevel(memory);

  const result: MemoryCheckResult = {
    safe: false,
    level,
    action: 'continue',
    message: '',
    availableBytes: memory?.availableBytes,
    usagePercentage: memory?.usagePercentage
  };

  switch (level) {
    case MemoryPressureLevel.LOW:
    case MemoryPressureLevel.MODERATE:
      result.safe = true;
      result.action = 'continue';
      result.message = `Memory usage is ${level.toUpperCase()} - safe to continue migration`;
      break;

    case MemoryPressureLevel.HIGH:
      result.safe = true;
      result.action = 'reduce_batch';
      result.message = `Memory usage is HIGH (${memory?.usagePercentage?.toFixed(1)}%) - reducing batch size`;
      break;

    case MemoryPressureLevel.CRITICAL:
      result.safe = false;
      result.action = 'pause';
      result.message = `Memory usage is CRITICAL (${memory?.usagePercentage?.toFixed(1)}%) - pausing migration`;
      break;

    case MemoryPressureLevel.EMERGENCY:
      result.safe = false;
      result.action = 'halt';
      result.message = `Memory usage is EMERGENCY (${memory?.usagePercentage?.toFixed(1)}%) - halting migration immediately`;
      break;

    default:
      result.safe = false;
      result.action = 'pause';
      result.message = 'Unknown memory state - pausing for safety';
  }

  // Additional safety check for available memory
  if (memory?.availableBytes && memory.availableBytes < MIGRATION_MIN_AVAILABLE_MEMORY) {
    result.safe = false;
    result.action = 'halt';
    result.message = `Available memory (${formatBytes(memory.availableBytes)}) below minimum required (${formatBytes(MIGRATION_MIN_AVAILABLE_MEMORY)})`;
  }

  logger.log(`Migration memory check: ${result.message}`, {
    level: level,
    action: result.action,
    safe: result.safe,
    usagePercentage: result.usagePercentage,
    availableBytes: result.availableBytes
  });

  return result;
}

/**
 * Wait for memory to recover to a safe level
 */
export async function waitForMemoryRecovery(
  maxAttempts: number = 5,
  waitMs: number = MIGRATION_MEMORY_RECOVERY_WAIT_MS
): Promise<MemoryRecoveryResult> {
  const startTime = Date.now();
  let attempts = 0;
  let currentLevel = memoryManager.getMemoryPressureLevel();

  logger.log('Starting memory recovery wait', {
    initialLevel: currentLevel,
    maxAttempts,
    waitMs
  });

  while (attempts < maxAttempts &&
         (currentLevel === MemoryPressureLevel.CRITICAL || currentLevel === MemoryPressureLevel.EMERGENCY)) {

    attempts++;

    // Force garbage collection to help recovery
    const gcResult = await memoryManager.forceGarbageCollection();
    logger.log(`Memory recovery attempt ${attempts}: GC ${gcResult ? 'successful' : 'failed'}`);

    // Wait for specified time
    await new Promise(resolve => setTimeout(resolve, waitMs));

    // Check memory again
    currentLevel = memoryManager.getMemoryPressureLevel();

    logger.log(`Memory recovery attempt ${attempts} result`, {
      level: currentLevel,
      elapsedMs: Date.now() - startTime
    });

    // If we've recovered to HIGH or better, we can continue
    if (currentLevel === MemoryPressureLevel.HIGH ||
        currentLevel === MemoryPressureLevel.MODERATE ||
        currentLevel === MemoryPressureLevel.LOW) {
      break;
    }
  }

  const recovered = currentLevel !== MemoryPressureLevel.CRITICAL &&
                   currentLevel !== MemoryPressureLevel.EMERGENCY;

  const result: MemoryRecoveryResult = {
    recovered,
    finalLevel: currentLevel,
    waitedMs: Date.now() - startTime,
    attemptsCount: attempts
  };

  logger.log('Memory recovery completed', result);

  return result;
}

/**
 * Get safe batch size based on current memory pressure
 */
export function getSafeBatchSize(originalBatchSize: number): number {
  const level = memoryManager.getMemoryPressureLevel();
  const recommendedSize = memoryManager.getRecommendedChunkSize();

  switch (level) {
    case MemoryPressureLevel.LOW:
      return Math.max(originalBatchSize, recommendedSize);

    case MemoryPressureLevel.MODERATE:
      return Math.min(originalBatchSize, recommendedSize);

    case MemoryPressureLevel.HIGH:
      return Math.min(originalBatchSize * 0.5, recommendedSize);

    case MemoryPressureLevel.CRITICAL:
      return Math.min(5, recommendedSize); // Absolute minimum

    case MemoryPressureLevel.EMERGENCY:
      return 1; // Single item at a time

    default:
      return Math.min(originalBatchSize * 0.5, recommendedSize);
  }
}

/**
 * Create a memory-safe migration iterator that yields batches based on memory pressure
 */
export async function* createMemorySafeBatches<T>(
  items: T[],
  baseBatchSize: number
): AsyncGenerator<{ batch: T[], batchIndex: number, isLastBatch: boolean }, void, unknown> {
  let processedCount = 0;
  let batchIndex = 0;

  while (processedCount < items.length) {
    // Check memory safety before each batch
    const memoryCheck = await checkMigrationMemorySafety();

    if (memoryCheck.action === 'halt') {
      throw new Error(`Migration halted due to memory pressure: ${memoryCheck.message}`);
    }

    if (memoryCheck.action === 'pause') {
      logger.log('Pausing for memory recovery...');
      const recovery = await waitForMemoryRecovery();

      if (!recovery.recovered) {
        throw new Error(`Unable to recover memory after ${recovery.waitedMs}ms. Migration cannot continue safely.`);
      }

      logger.log(`Memory recovered to ${recovery.finalLevel} after ${recovery.waitedMs}ms`);
    }

    // Get safe batch size for current memory conditions
    const safeBatchSize = getSafeBatchSize(baseBatchSize);
    const remainingItems = items.length - processedCount;
    const actualBatchSize = Math.min(safeBatchSize, remainingItems);

    const batch = items.slice(processedCount, processedCount + actualBatchSize);
    const isLastBatch = processedCount + actualBatchSize >= items.length;

    logger.log(`Processing batch ${batchIndex + 1}`, {
      batchSize: actualBatchSize,
      memoryLevel: memoryCheck.level,
      isLastBatch
    });

    yield { batch, batchIndex, isLastBatch };

    processedCount += actualBatchSize;
    batchIndex++;

    // Small delay between batches to allow for memory cleanup
    if (!isLastBatch) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

/**
 * Pre-migration memory validation
 */
export async function validateMemoryForMigration(estimatedDataSize: number): Promise<{
  canProceed: boolean;
  reason?: string;
  recommendation?: string;
}> {
  const memory = memoryManager.getMemoryInfo();
  const level = memoryManager.getMemoryPressureLevel(memory);

  // Don't start migration if already in critical/emergency state
  if (level === MemoryPressureLevel.EMERGENCY) {
    return {
      canProceed: false,
      reason: `Current memory usage (${memory?.usagePercentage?.toFixed(1)}%) is in emergency state`,
      recommendation: 'Close other browser tabs and restart the application'
    };
  }

  if (level === MemoryPressureLevel.CRITICAL) {
    return {
      canProceed: false,
      reason: `Current memory usage (${memory?.usagePercentage?.toFixed(1)}%) is too high to safely start migration`,
      recommendation: 'Close other browser tabs or restart the browser'
    };
  }

  // Check if estimated data size would fit in available memory
  if (memory?.availableBytes && estimatedDataSize > memory.availableBytes * 0.5) {
    return {
      canProceed: false,
      reason: `Estimated migration data (${formatBytes(estimatedDataSize)}) exceeds safe memory limits`,
      recommendation: 'Consider clearing browser data or using a device with more memory'
    };
  }

  return { canProceed: true };
}

/**
 * Format bytes for human-readable display
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Emergency memory protection - call this in critical paths
 */
export async function emergencyMemoryCheck(): Promise<boolean> {
  const level = memoryManager.getMemoryPressureLevel();

  if (level === MemoryPressureLevel.EMERGENCY) {
    logger.error('EMERGENCY: Memory usage critical, forcing immediate cleanup');

    // Force aggressive garbage collection
    await memoryManager.forceGarbageCollection(5); // 5 retries

    // Clear any cached data that can be safely cleared
    // Note: This would need to be implemented based on your specific cache implementation

    return false; // Operation should not continue
  }

  return true; // Safe to continue
}