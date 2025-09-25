/**
 * Comprehensive test suite for IndexedDbMigrationOrchestratorMemoryOptimized
 * Tests memory optimization features during migration
 */

import { IndexedDbMigrationOrchestratorMemoryOptimized } from './indexedDbMigrationMemoryOptimized';
import { MemoryManager, MemoryPressureLevel, MEMORY_CONFIG_PRESETS } from './memoryManager';
import { StorageAdapter } from './storageAdapter';
import logger from './logger';

// Mock dependencies
jest.mock('./logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('./memoryManager');

// Mock parent class methods
const mockGetVersion = jest.fn().mockResolvedValue(1);
const mockGetData = jest.fn().mockResolvedValue({});

// Create mock storage adapters
const createMockAdapter = (): jest.Mocked<StorageAdapter> => ({
  isAvailable: jest.fn().mockResolvedValue(true),
  initialize: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
  getKeys: jest.fn().mockResolvedValue([]),
  close: jest.fn().mockResolvedValue(undefined),
  getSize: jest.fn().mockResolvedValue(0)
});

describe('IndexedDbMigrationOrchestratorMemoryOptimized', () => {
  let orchestrator: IndexedDbMigrationOrchestratorMemoryOptimized;
  let sourceAdapter: jest.Mocked<StorageAdapter>;
  let targetAdapter: jest.Mocked<StorageAdapter>;
  let mockMemoryManager: jest.Mocked<MemoryManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset memory manager mock
    mockMemoryManager = {
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
      cleanup: jest.fn(),
      getCurrentPressureLevel: jest.fn().mockReturnValue(MemoryPressureLevel.LOW),
      getOptimalChunkSize: jest.fn().mockReturnValue(100),
      getEstimatedDataSize: jest.fn().mockReturnValue(1000),
      shouldPerformEmergencyOptimization: jest.fn().mockReturnValue(false),
      performEmergencyOptimization: jest.fn().mockResolvedValue(undefined),
      forceGarbageCollection: jest.fn().mockResolvedValue(false),
      onPressureChange: jest.fn(),
      getMemoryInfo: jest.fn().mockReturnValue({
        usedMemory: 100 * 1024 * 1024,
        totalMemory: 500 * 1024 * 1024
      }),
      getMemoryStatus: jest.fn().mockReturnValue({
        currentPressure: MemoryPressureLevel.LOW,
        usedMemory: 100 * 1024 * 1024,
        totalMemory: 500 * 1024 * 1024,
        usagePercentage: 20,
        recommendedChunkSize: 100,
        isMemoryConstrained: false,
        canPerformOperation: true
      }),
      canPerformMemoryIntensiveOperation: jest.fn().mockReturnValue(true),
      isMemoryConstrainedDevice: jest.fn().mockReturnValue(false)
    } as jest.Mocked<MemoryManager>;

    (MemoryManager as jest.Mock).mockImplementation(() => mockMemoryManager);

    sourceAdapter = createMockAdapter();
    targetAdapter = createMockAdapter();

    orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized(
      sourceAdapter,
      targetAdapter
    );

    // Mock parent class methods
    orchestrator.getVersion = mockGetVersion;
    orchestrator.getData = mockGetData;
  });

  afterEach(() => {
    if (orchestrator) {
      orchestrator.cleanup().catch(() => {});
    }
  });

  describe('Initialization', () => {
    it('should initialize with default memory optimization settings', () => {
      expect(orchestrator).toBeDefined();
      expect(MemoryManager).toHaveBeenCalledWith(undefined);
    });

    it('should initialize with custom memory optimization configuration', () => {
      const customConfig = {
        memoryOptimization: {
          enabled: true,
          monitoringInterval: 3000,
          config: MEMORY_CONFIG_PRESETS.CONSERVATIVE
        }
      };

      const customOrchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized(
        sourceAdapter,
        targetAdapter,
        customConfig
      );

      expect(MemoryManager).toHaveBeenCalledWith(MEMORY_CONFIG_PRESETS.CONSERVATIVE);
      customOrchestrator.cleanup().catch(() => {});
    });

    it('should handle disabled memory optimization', () => {
      const config = {
        memoryOptimization: {
          enabled: false
        }
      };

      const customOrchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized(
        sourceAdapter,
        targetAdapter,
        config
      );

      expect(customOrchestrator).toBeDefined();
      customOrchestrator.cleanup().catch(() => {});
    });

    it('should validate configuration on initialization', () => {
      const invalidConfig = {
        memoryOptimization: {
          enabled: true,
          thresholds: {
            criticalMemory: 0.5,  // Invalid: less than high
            highMemory: 0.7
          }
        }
      };

      expect(() => {
        new IndexedDbMigrationOrchestratorMemoryOptimized(
          sourceAdapter,
          targetAdapter,
          invalidConfig
        );
      }).toThrow('Invalid memory optimization configuration');
    });
  });

  describe('Memory Monitoring', () => {
    it('should start memory monitoring when enabled', async () => {
      orchestrator.startMemoryMonitoring();

      expect(mockMemoryManager.startMonitoring).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Starting memory monitoring for migration',
        expect.any(Object)
      );
    });

    it('should not start monitoring when disabled', async () => {
      const config = {
        memoryOptimization: { enabled: false }
      };

      const customOrchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized(
        sourceAdapter,
        targetAdapter,
        config
      );

      customOrchestrator.startMemoryMonitoring();

      expect(mockMemoryManager.startMonitoring).not.toHaveBeenCalled();
      customOrchestrator.cleanup().catch(() => {});
    });

    it('should stop memory monitoring and cleanup', async () => {
      orchestrator.startMemoryMonitoring();
      await orchestrator.cleanupMemoryOptimization();

      expect(mockMemoryManager.stopMonitoring).toHaveBeenCalled();
      expect(mockMemoryManager.cleanup).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Memory optimization cleaned up');
    });

    it('should handle memory pressure events', () => {
      orchestrator.startMemoryMonitoring();

      // Verify pressure change callback was registered
      expect(mockMemoryManager.onPressureChange).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('Progressive Loading Detection', () => {
    it('should enable progressive loading for large datasets', async () => {
      sourceAdapter.getKeys.mockResolvedValue(
        Array.from({ length: 10000 }, (_, i) => `key-${i}`)
      );
      sourceAdapter.getItem.mockResolvedValue(JSON.stringify({ data: 'x'.repeat(10000) }));

      const shouldUseProgressive = await orchestrator.shouldUseProgressiveLoading(sourceAdapter);

      expect(shouldUseProgressive).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        'Progressive loading enabled for large dataset',
        expect.any(Object)
      );
    });

    it('should not enable progressive loading for small datasets', async () => {
      sourceAdapter.getKeys.mockResolvedValue(['key1', 'key2', 'key3']);
      sourceAdapter.getItem.mockResolvedValue(JSON.stringify({ data: 'small' }));

      const shouldUseProgressive = await orchestrator.shouldUseProgressiveLoading(sourceAdapter);

      expect(shouldUseProgressive).toBe(false);
    });

    it('should respect progressive loading configuration', async () => {
      const config = {
        memoryOptimization: {
          enabled: true,
          progressiveLoading: {
            enabled: false
          }
        }
      };

      const customOrchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized(
        sourceAdapter,
        targetAdapter,
        config
      );

      sourceAdapter.getKeys.mockResolvedValue(
        Array.from({ length: 10000 }, (_, i) => `key-${i}`)
      );

      const shouldUseProgressive = await customOrchestrator.shouldUseProgressiveLoading(sourceAdapter);

      expect(shouldUseProgressive).toBe(false);
      customOrchestrator.cleanup().catch(() => {});
    });

    it('should default to progressive loading when size estimation fails', async () => {
      sourceAdapter.getKeys.mockRejectedValue(new Error('Failed to get keys'));

      const shouldUseProgressive = await orchestrator.shouldUseProgressiveLoading(sourceAdapter);

      expect(shouldUseProgressive).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to estimate data size, defaulting to progressive loading',
        expect.any(Object)
      );
    });
  });

  describe('Data Size Estimation', () => {
    it('should estimate total data size correctly', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const data = { test: 'data', value: 123 };

      sourceAdapter.getKeys.mockResolvedValue(keys);
      sourceAdapter.getItem.mockResolvedValue(JSON.stringify(data));
      mockMemoryManager.getEstimatedDataSize.mockReturnValue(100);

      const size = await orchestrator.estimateTotalDataSize(sourceAdapter);

      // Should sample subset and extrapolate
      expect(size).toBeGreaterThan(0);
      expect(sourceAdapter.getItem).toHaveBeenCalledTimes(3); // Sample size
    });

    it('should handle missing or null values gracefully', async () => {
      sourceAdapter.getKeys.mockResolvedValue(['key1', 'key2']);
      sourceAdapter.getItem.mockResolvedValueOnce(null);
      sourceAdapter.getItem.mockResolvedValueOnce(JSON.stringify({ data: 'test' }));
      mockMemoryManager.getEstimatedDataSize.mockReturnValue(50);

      const size = await orchestrator.estimateTotalDataSize(sourceAdapter);

      expect(size).toBeGreaterThan(0);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skipping null/undefined value'),
        expect.any(Object)
      );
    });

    it('should handle storage errors gracefully', async () => {
      sourceAdapter.getKeys.mockRejectedValue(new Error('Storage error'));

      const size = await orchestrator.estimateTotalDataSize(sourceAdapter);

      expect(size).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to estimate total data size',
        expect.any(Object)
      );
    });

    it('should use sampling for large key sets', async () => {
      const keys = Array.from({ length: 10000 }, (_, i) => `key-${i}`);
      sourceAdapter.getKeys.mockResolvedValue(keys);
      sourceAdapter.getItem.mockResolvedValue(JSON.stringify({ data: 'test' }));
      mockMemoryManager.getEstimatedDataSize.mockReturnValue(100);

      const size = await orchestrator.estimateTotalDataSize(sourceAdapter);

      // Should only sample a subset, not all 10000 keys
      expect(sourceAdapter.getItem).toHaveBeenCalledTimes(100); // Max sample size
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('Memory Pressure Handling', () => {
    it('should adjust chunk size based on memory pressure', async () => {
      // Start with LOW pressure
      mockMemoryManager.getCurrentPressureLevel.mockReturnValue(MemoryPressureLevel.LOW);
      mockMemoryManager.getOptimalChunkSize.mockReturnValue(1000);

      let chunkSize = orchestrator.getCurrentChunkSize();
      expect(chunkSize).toBe(1000);

      // Change to HIGH pressure
      mockMemoryManager.getCurrentPressureLevel.mockReturnValue(MemoryPressureLevel.HIGH);
      mockMemoryManager.getOptimalChunkSize.mockReturnValue(50);

      await orchestrator.handleMemoryPressureChange(
        MemoryPressureLevel.LOW,
        MemoryPressureLevel.HIGH
      );

      chunkSize = orchestrator.getCurrentChunkSize();
      expect(chunkSize).toBe(50);

      expect(logger.warn).toHaveBeenCalledWith(
        'Memory pressure changed during migration',
        expect.any(Object)
      );
    });

    it('should force garbage collection under high pressure', async () => {
      mockMemoryManager.getCurrentPressureLevel.mockReturnValue(MemoryPressureLevel.HIGH);
      mockMemoryManager.forceGarbageCollection.mockResolvedValue(true);

      await orchestrator.handleMemoryPressureChange(
        MemoryPressureLevel.MODERATE,
        MemoryPressureLevel.HIGH
      );

      expect(mockMemoryManager.forceGarbageCollection).toHaveBeenCalled();
    });

    it('should throttle garbage collection calls', async () => {
      mockMemoryManager.getCurrentPressureLevel.mockReturnValue(MemoryPressureLevel.HIGH);

      // Call multiple times in quick succession
      await orchestrator.handleMemoryPressureChange(
        MemoryPressureLevel.MODERATE,
        MemoryPressureLevel.HIGH
      );
      await orchestrator.handleMemoryPressureChange(
        MemoryPressureLevel.MODERATE,
        MemoryPressureLevel.HIGH
      );

      // Should only call GC once due to throttling
      expect(mockMemoryManager.forceGarbageCollection).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith('Garbage collection throttled');
    });
  });

  describe('Emergency Optimization', () => {
    it('should perform emergency optimization for critical memory usage', async () => {
      mockMemoryManager.getCurrentPressureLevel.mockReturnValue(MemoryPressureLevel.CRITICAL);
      mockMemoryManager.shouldPerformEmergencyOptimization.mockReturnValue(true);

      await orchestrator.checkAndHandleMemoryPressure();

      expect(mockMemoryManager.performEmergencyOptimization).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Performing emergency memory optimization during migration'
      );
    });

    it('should not trigger emergency optimization for normal memory usage', async () => {
      mockMemoryManager.getCurrentPressureLevel.mockReturnValue(MemoryPressureLevel.LOW);
      mockMemoryManager.shouldPerformEmergencyOptimization.mockReturnValue(false);

      await orchestrator.checkAndHandleMemoryPressure();

      expect(mockMemoryManager.performEmergencyOptimization).not.toHaveBeenCalled();
    });

    it('should handle emergency optimization failures', async () => {
      mockMemoryManager.shouldPerformEmergencyOptimization.mockReturnValue(true);
      mockMemoryManager.performEmergencyOptimization.mockRejectedValue(
        new Error('Emergency optimization failed')
      );

      await orchestrator.checkAndHandleMemoryPressure();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to perform emergency memory optimization',
        expect.any(Object)
      );
    });
  });

  describe('Migration Process with Memory Optimization', () => {
    beforeEach(() => {
      sourceAdapter.getKeys.mockResolvedValue(['key1', 'key2', 'key3']);
      sourceAdapter.getItem.mockImplementation((key) =>
        Promise.resolve(JSON.stringify({ id: key, data: 'test' }))
      );
    });

    it('should process migration with memory optimization', async () => {
      const progress = await orchestrator.migrate(1, 2);

      expect(progress).toEqual({
        status: 'completed',
        fromVersion: 1,
        toVersion: 2,
        totalItems: 3,
        processedItems: 3,
        errors: []
      });

      expect(mockMemoryManager.startMonitoring).toHaveBeenCalled();
      expect(targetAdapter.setItem).toHaveBeenCalledTimes(3);
    });

    it('should pause migration when memory pressure is critical', async () => {
      mockMemoryManager.canPerformMemoryIntensiveOperation.mockReturnValue(false);
      sourceAdapter.getKeys.mockResolvedValue(
        Array.from({ length: 100 }, (_, i) => `key-${i}`)
      );

      await orchestrator.processChunkedMigration(
        sourceAdapter,
        targetAdapter,
        10
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Pausing migration due to memory pressure')
      );
    });

    it('should adapt chunk size during migration', async () => {
      let callCount = 0;
      mockMemoryManager.getOptimalChunkSize.mockImplementation(() => {
        // Start with large chunks, then reduce
        callCount++;
        return callCount <= 2 ? 100 : 10;
      });

      sourceAdapter.getKeys.mockResolvedValue(
        Array.from({ length: 200 }, (_, i) => `key-${i}`)
      );

      await orchestrator.processChunkedMigration(
        sourceAdapter,
        targetAdapter
      );

      // Should have adapted chunk size during migration
      expect(mockMemoryManager.getOptimalChunkSize).toHaveBeenCalled();
    });

    it('should handle migration errors gracefully', async () => {
      sourceAdapter.getItem.mockRejectedValueOnce(new Error('Read error'));

      const progress = await orchestrator.migrate(1, 2);

      expect(progress.errors).toHaveLength(1);
      expect(progress.errors[0]).toContain('Read error');
      // Should continue with other items
      expect(progress.processedItems).toBe(2);
    });
  });

  describe('Memory Optimization Status', () => {
    it('should return current memory optimization status', () => {
      mockMemoryManager.getMemoryStatus.mockReturnValue({
        currentPressure: MemoryPressureLevel.MODERATE,
        usedMemory: 200 * 1024 * 1024,
        totalMemory: 500 * 1024 * 1024,
        usagePercentage: 40,
        recommendedChunkSize: 500,
        isMemoryConstrained: false,
        canPerformOperation: true
      });

      const status = orchestrator.getMemoryOptimizationStatus();

      expect(status).toEqual({
        enabled: true,
        currentPressure: MemoryPressureLevel.MODERATE,
        memoryUsage: {
          used: 200 * 1024 * 1024,
          total: 500 * 1024 * 1024,
          percentage: 40
        },
        currentChunkSize: expect.any(Number),
        isProgressiveLoadingActive: false,
        gcExecutions: 0,
        isMemoryConstrained: false
      });
    });

    it('should handle missing memory info gracefully', () => {
      mockMemoryManager.getMemoryStatus.mockReturnValue(null);
      mockMemoryManager.getMemoryInfo.mockReturnValue(null);

      const status = orchestrator.getMemoryOptimizationStatus();

      expect(status.memoryUsage).toEqual({
        used: 0,
        total: 0,
        percentage: 0
      });
    });

    it('should return disabled status when optimization is off', () => {
      const config = {
        memoryOptimization: { enabled: false }
      };

      const customOrchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized(
        sourceAdapter,
        targetAdapter,
        config
      );

      const status = customOrchestrator.getMemoryOptimizationStatus();

      expect(status.enabled).toBe(false);
      expect(status.currentPressure).toBe(MemoryPressureLevel.LOW);
      customOrchestrator.cleanup().catch(() => {});
    });
  });

  describe('Enhanced Progress Reporting', () => {
    it('should include memory metrics in progress reports', async () => {
      const enhancedProgress = orchestrator.getEnhancedProgress({
        status: 'in_progress',
        fromVersion: 1,
        toVersion: 2,
        totalItems: 1000,
        processedItems: 500,
        errors: []
      });

      expect(enhancedProgress).toEqual({
        status: 'in_progress',
        fromVersion: 1,
        toVersion: 2,
        totalItems: 1000,
        processedItems: 500,
        errors: [],
        memoryMetrics: expect.objectContaining({
          currentPressure: expect.any(String),
          memoryUsagePercentage: expect.any(Number),
          currentChunkSize: expect.any(Number),
          isProgressiveLoadingActive: expect.any(Boolean)
        }),
        estimatedTimeRemaining: expect.any(Number)
      });
    });

    it('should estimate time remaining based on progress', () => {
      orchestrator.migrationStartTime = Date.now() - 10000; // Started 10 seconds ago

      const enhancedProgress = orchestrator.getEnhancedProgress({
        status: 'in_progress',
        fromVersion: 1,
        toVersion: 2,
        totalItems: 1000,
        processedItems: 250,  // 25% done in 10 seconds
        errors: []
      });

      // Should estimate ~30 more seconds (75% remaining at same rate)
      expect(enhancedProgress.estimatedTimeRemaining).toBeCloseTo(30, -1);
    });
  });

  describe('Cleanup and Error Handling', () => {
    it('should cleanup resources properly', async () => {
      orchestrator.startMemoryMonitoring();
      await orchestrator.cleanup();

      expect(mockMemoryManager.stopMonitoring).toHaveBeenCalled();
      expect(mockMemoryManager.cleanup).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Memory optimization cleaned up');
    });

    it('should re-throw critical cleanup errors', async () => {
      // Mock cleanup to fail
      mockMemoryManager.cleanup.mockImplementation(() => {
        throw new Error('Critical cleanup error');
      });

      await expect(orchestrator.cleanup()).rejects.toThrow('Critical cleanup error');

      expect(logger.error).toHaveBeenCalledWith(
        'Critical error during memory optimization cleanup',
        expect.any(Object)
      );
    });

    it('should handle combined cleanup failures', async () => {
      // Mock both cleanups to fail
      mockMemoryManager.cleanup.mockImplementation(() => {
        throw new Error('Memory cleanup error');
      });

      // Mock super.cleanup to also fail
      const superCleanup = jest.fn().mockRejectedValue(new Error('Parent cleanup error'));
      Object.setPrototypeOf(orchestrator, {
        cleanup: superCleanup
      });

      await expect(orchestrator.cleanup()).rejects.toThrow(
        'Multiple cleanup failures'
      );
    });

    it('should always attempt parent cleanup even if memory cleanup fails', async () => {
      mockMemoryManager.cleanup.mockImplementation(() => {
        throw new Error('Memory cleanup error');
      });

      const superCleanup = jest.fn().mockResolvedValue(undefined);
      Object.setPrototypeOf(orchestrator, {
        cleanup: superCleanup
      });

      await expect(orchestrator.cleanup()).rejects.toThrow('Memory cleanup error');

      // Parent cleanup should have been attempted
      expect(superCleanup).toHaveBeenCalled();
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle partial configuration', () => {
      const config = {
        memoryOptimization: {
          enabled: true,
          monitoringInterval: 2000
          // Missing other properties
        }
      };

      const customOrchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized(
        sourceAdapter,
        targetAdapter,
        config
      );

      expect(customOrchestrator).toBeDefined();
      customOrchestrator.cleanup().catch(() => {});
    });

    it('should use presets correctly', () => {
      const config = {
        memoryOptimization: {
          enabled: true,
          config: MEMORY_CONFIG_PRESETS.AGGRESSIVE
        }
      };

      const customOrchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized(
        sourceAdapter,
        targetAdapter,
        config
      );

      expect(MemoryManager).toHaveBeenCalledWith(MEMORY_CONFIG_PRESETS.AGGRESSIVE);
      customOrchestrator.cleanup().catch(() => {});
    });

    it('should validate threshold configurations', () => {
      const config = {
        memoryOptimization: {
          enabled: true,
          thresholds: {
            progressiveLoadingThreshold: -1  // Invalid
          }
        }
      };

      expect(() => {
        new IndexedDbMigrationOrchestratorMemoryOptimized(
          sourceAdapter,
          targetAdapter,
          config
        );
      }).toThrow();
    });
  });
});