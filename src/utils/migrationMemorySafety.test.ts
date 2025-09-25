/**
 * Tests for Migration Memory Safety System
 *
 * Validates production-ready memory protection mechanisms
 */

import {
  checkMigrationMemorySafety,
  waitForMemoryRecovery,
  getSafeBatchSize,
  createMemorySafeBatches,
  validateMemoryForMigration,
  emergencyMemoryCheck
} from './migrationMemorySafety';
import { memoryManager, MemoryPressureLevel } from './memoryManager';
// Migration config constants are used implicitly by the tested functions

// Mock dependencies
jest.mock('./memoryManager', () => ({
  memoryManager: {
    getMemoryInfo: jest.fn(),
    getMemoryPressureLevel: jest.fn(),
    forceGarbageCollection: jest.fn(),
    getRecommendedChunkSize: jest.fn()
  },
  MemoryPressureLevel: {
    LOW: 'low',
    MODERATE: 'moderate',
    HIGH: 'high',
    CRITICAL: 'critical',
    EMERGENCY: 'emergency'
  }
}));

jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const mockMemoryManager = memoryManager as jest.Mocked<typeof memoryManager>;

// Helper function to create complete MemoryInfo mock objects
const createMockMemoryInfo = (overrides: Record<string, unknown> = {}): ReturnType<typeof memoryManager.getMemoryInfo> => ({
  usedJSHeapSize: 50 * 1024 * 1024,
  totalJSHeapSize: 60 * 1024 * 1024,
  jsHeapSizeLimit: 100 * 1024 * 1024,
  usagePercentage: 50,
  isMemoryConstrained: false,
  availableMemory: 50 * 1024 * 1024,
  availableBytes: 50 * 1024 * 1024,
  ...overrides
} as unknown as ReturnType<typeof memoryManager.getMemoryInfo>);

describe('Migration Memory Safety System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMemoryManager.getRecommendedChunkSize.mockReturnValue(10);
    mockMemoryManager.forceGarbageCollection.mockResolvedValue(true);
  });

  describe('checkMigrationMemorySafety', () => {
    it('should allow continuation for LOW memory usage', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 40,
        availableBytes: 100 * 1024 * 1024
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.LOW);

      const result = await checkMigrationMemorySafety();

      expect(result.safe).toBe(true);
      expect(result.action).toBe('continue');
      expect(result.level).toBe(MemoryPressureLevel.LOW);
      expect(result.message).toContain('LOW');
    });

    it('should reduce batch size for HIGH memory usage', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 80,
        availableBytes: 50 * 1024 * 1024
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.HIGH);

      const result = await checkMigrationMemorySafety();

      expect(result.safe).toBe(true);
      expect(result.action).toBe('reduce_batch');
      expect(result.level).toBe(MemoryPressureLevel.HIGH);
      expect(result.usagePercentage).toBe(80);
    });

    it('should pause migration for CRITICAL memory usage', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 92,
        availableBytes: 30 * 1024 * 1024
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.CRITICAL);

      const result = await checkMigrationMemorySafety();

      expect(result.safe).toBe(false);
      expect(result.action).toBe('pause');
      expect(result.level).toBe(MemoryPressureLevel.CRITICAL);
    });

    it('should halt migration for EMERGENCY memory usage', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 96,
        availableBytes: 30 * 1024 * 1024 // Above minimum to test EMERGENCY level specifically
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.EMERGENCY);

      const result = await checkMigrationMemorySafety();

      expect(result.safe).toBe(false);
      expect(result.action).toBe('halt');
      expect(result.level).toBe(MemoryPressureLevel.EMERGENCY);
      expect(result.message).toContain('EMERGENCY');
    });

    it('should halt when available memory is below minimum', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 70,
        availableBytes: 10 * 1024 * 1024 // Below MIGRATION_MIN_AVAILABLE_MEMORY (20MB)
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.MODERATE);

      const result = await checkMigrationMemorySafety();

      expect(result.safe).toBe(false);
      expect(result.action).toBe('halt');
      expect(result.message).toContain('minimum required');
    });
  });

  describe('waitForMemoryRecovery', () => {
    it('should succeed when memory recovers quickly', async () => {
      mockMemoryManager.getMemoryPressureLevel
        .mockReturnValueOnce(MemoryPressureLevel.CRITICAL)
        .mockReturnValueOnce(MemoryPressureLevel.HIGH);

      const result = await waitForMemoryRecovery(2, 100);

      expect(result.recovered).toBe(true);
      expect(result.finalLevel).toBe(MemoryPressureLevel.HIGH);
      expect(result.attemptsCount).toBe(1);
      expect(mockMemoryManager.forceGarbageCollection).toHaveBeenCalledTimes(1);
    });

    it('should fail when memory does not recover', async () => {
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.CRITICAL);

      const result = await waitForMemoryRecovery(2, 100);

      expect(result.recovered).toBe(false);
      expect(result.finalLevel).toBe(MemoryPressureLevel.CRITICAL);
      expect(result.attemptsCount).toBe(2);
      expect(mockMemoryManager.forceGarbageCollection).toHaveBeenCalledTimes(2);
    });

    it('should succeed when emergency level recovers to critical', async () => {
      mockMemoryManager.getMemoryPressureLevel
        .mockReturnValueOnce(MemoryPressureLevel.EMERGENCY)
        .mockReturnValueOnce(MemoryPressureLevel.HIGH);

      const result = await waitForMemoryRecovery(1, 100);

      expect(result.recovered).toBe(true);
      expect(result.finalLevel).toBe(MemoryPressureLevel.HIGH);
    });
  });

  describe('getSafeBatchSize', () => {
    const originalBatchSize = 50;

    it('should return larger batch size for LOW memory', () => {
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.LOW);
      mockMemoryManager.getRecommendedChunkSize.mockReturnValue(75);

      const result = getSafeBatchSize(originalBatchSize);

      expect(result).toBe(75); // Max of original and recommended
    });

    it('should return reduced batch size for HIGH memory', () => {
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.HIGH);
      mockMemoryManager.getRecommendedChunkSize.mockReturnValue(30);

      const result = getSafeBatchSize(originalBatchSize);

      expect(result).toBe(25); // 50 * 0.5 = 25, min with recommended 30
    });

    it('should return minimum batch size for CRITICAL memory', () => {
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.CRITICAL);
      mockMemoryManager.getRecommendedChunkSize.mockReturnValue(10);

      const result = getSafeBatchSize(originalBatchSize);

      expect(result).toBe(5); // Min of 5 and recommended 10
    });

    it('should return single item for EMERGENCY memory', () => {
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.EMERGENCY);

      const result = getSafeBatchSize(originalBatchSize);

      expect(result).toBe(1); // Always 1 for emergency
    });
  });

  describe('createMemorySafeBatches', () => {
    const testItems = Array.from({ length: 20 }, (_, i) => `item-${i}`);

    it('should process all items with good memory conditions', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 40,
        availableBytes: 100 * 1024 * 1024
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.LOW);

      const batches = [];
      const iterator = createMemorySafeBatches(testItems, 10);

      for await (const batchInfo of iterator) {
        batches.push(batchInfo);
      }

      expect(batches).toHaveLength(2); // 20 items in batches of 10
      expect(batches[0].batch).toHaveLength(10);
      expect(batches[1].batch).toHaveLength(10);
      expect(batches[1].isLastBatch).toBe(true);
    });

    it('should throw error for emergency memory conditions', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 96,
        availableBytes: 10 * 1024 * 1024
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.EMERGENCY);

      const iterator = createMemorySafeBatches(testItems, 10);

      await expect(iterator.next()).rejects.toThrow('Migration halted due to memory pressure');
    });

    it('should wait for recovery during critical memory conditions', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 92,
        availableBytes: 30 * 1024 * 1024
      }));

      // First call returns critical, second call also critical for pause, third call returns high (recovered)
      mockMemoryManager.getMemoryPressureLevel
        .mockReturnValueOnce(MemoryPressureLevel.CRITICAL) // First memory check - triggers pause
        .mockReturnValueOnce(MemoryPressureLevel.CRITICAL) // During recovery check - still critical
        .mockReturnValue(MemoryPressureLevel.HIGH); // After recovery - high level, safe to continue

      // Mock getSafeBatchSize behavior
      mockMemoryManager.getRecommendedChunkSize.mockReturnValue(3);

      const batches = [];
      const iterator = createMemorySafeBatches(testItems.slice(0, 6), 3); // 6 items, batch size 3

      for await (const batchInfo of iterator) {
        batches.push(batchInfo);
      }

      expect(batches.length).toBeGreaterThanOrEqual(1); // Should complete at least one batch after recovery
      expect(mockMemoryManager.forceGarbageCollection).toHaveBeenCalled();
    });
  });

  describe('validateMemoryForMigration', () => {
    it('should allow migration with good memory conditions', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 50,
        availableBytes: 200 * 1024 * 1024
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.MODERATE);

      const result = await validateMemoryForMigration(50 * 1024 * 1024); // 50MB data

      expect(result.canProceed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block migration in emergency memory state', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 96,
        availableBytes: 10 * 1024 * 1024
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.EMERGENCY);

      const result = await validateMemoryForMigration(10 * 1024 * 1024);

      expect(result.canProceed).toBe(false);
      expect(result.reason).toContain('emergency state');
      expect(result.recommendation).toContain('restart');
    });

    it('should block migration when data size exceeds available memory', async () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(createMockMemoryInfo({
        usagePercentage: 60,
        availableBytes: 50 * 1024 * 1024
      }));
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.MODERATE);

      // Request 30MB migration but only 25MB available (50MB * 0.5)
      const result = await validateMemoryForMigration(30 * 1024 * 1024);

      expect(result.canProceed).toBe(false);
      expect(result.reason).toContain('exceeds safe memory limits');
    });
  });

  describe('emergencyMemoryCheck', () => {
    it('should allow continuation for non-emergency levels', async () => {
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.CRITICAL);

      const result = await emergencyMemoryCheck();

      expect(result).toBe(true);
    });

    it('should force cleanup and block for emergency level', async () => {
      mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.EMERGENCY);

      const result = await emergencyMemoryCheck();

      expect(result).toBe(false);
      expect(mockMemoryManager.forceGarbageCollection).toHaveBeenCalledWith(5);
    });
  });
});