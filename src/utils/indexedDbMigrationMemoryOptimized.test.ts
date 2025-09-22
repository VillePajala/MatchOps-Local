/**
 * Tests for Memory-Optimized IndexedDB Migration
 */

import {
  IndexedDbMigrationOrchestratorMemoryOptimized,
  MemoryOptimizedMigrationConfig
} from './indexedDbMigrationMemoryOptimized';
import { MemoryManager, MemoryPressureLevel } from './memoryManager';
import * as localStorage from './localStorage';

// Mock dependencies
jest.mock('./logger');
jest.mock('./localStorage');
jest.mock('./indexedDbMigrationEnhanced');
jest.mock('./memoryManager');

const MockMemoryManager = MemoryManager as jest.MockedClass<typeof MemoryManager>;

describe('IndexedDbMigrationOrchestratorMemoryOptimized', () => {
  let orchestrator: IndexedDbMigrationOrchestratorMemoryOptimized;
  let mockMemoryManager: jest.Mocked<MemoryManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock MemoryManager
    mockMemoryManager = {
      getMemoryInfo: jest.fn(),
      getMemoryPressureLevel: jest.fn(),
      getRecommendedChunkSize: jest.fn(),
      shouldForceGarbageCollection: jest.fn(),
      forceGarbageCollection: jest.fn(),
      getSuggestedActions: jest.fn(),
      onMemoryPressure: jest.fn(),
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
      cleanup: jest.fn()
    } as unknown as jest.Mocked<MemoryManager>;

    MockMemoryManager.mockImplementation(() => mockMemoryManager);

    // Default mock returns
    mockMemoryManager.getMemoryInfo.mockReturnValue({
      usedJSHeapSize: 50 * 1024 * 1024,    // 50MB
      totalJSHeapSize: 60 * 1024 * 1024,   // 60MB
      jsHeapSizeLimit: 200 * 1024 * 1024,  // 200MB
      usagePercentage: 25,
      isMemoryConstrained: false,
      availableMemory: 150 * 1024 * 1024   // 150MB
    });

    mockMemoryManager.getMemoryPressureLevel.mockReturnValue(MemoryPressureLevel.LOW);
    mockMemoryManager.getRecommendedChunkSize.mockReturnValue(1000);
    mockMemoryManager.shouldForceGarbageCollection.mockReturnValue(false);
    mockMemoryManager.forceGarbageCollection.mockResolvedValue(true);
    mockMemoryManager.getSuggestedActions.mockReturnValue([]);
    mockMemoryManager.getConfig.mockReturnValue({
      moderatePressureThreshold: 0.5,
      highPressureThreshold: 0.7,
      criticalPressureThreshold: 0.85,
      minChunkSize: 10,
      maxChunkSize: 1000,
      defaultChunkSize: 100,
      monitoringInterval: 5000,
      enableForcedGC: true
    });

    // Mock localStorage
    (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key: string) => {
      const mockData: Record<string, string> = {
        'savedSoccerGames': JSON.stringify([{ id: 1, data: 'game1' }]),
        'soccerMasterRoster': JSON.stringify([{ id: 1, name: 'Player 1' }]),
        'soccerSeasons': JSON.stringify([{ id: 1, name: 'Season 1' }])
      };
      return mockData[key] || null;
    });
  });

  afterEach(() => {
    if (orchestrator) {
      // Ensure proper cleanup to prevent hanging tests
      if (orchestrator['stopMemoryMonitoring']) {
        orchestrator['stopMemoryMonitoring']();
      }
      if (orchestrator['cleanupTimeouts']) {
        orchestrator['cleanupTimeouts']();
      }
    }
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default memory optimization settings', () => {
      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();

      expect(orchestrator['memoryConfig'].enableMemoryOptimization).toBe(true);
      expect(orchestrator['memoryConfig'].memoryOptimizationThreshold).toBe(0.7);
      expect(orchestrator['memoryConfig'].enableProgressiveLoading).toBe(true);
      expect(orchestrator['memoryConfig'].progressiveLoadingThreshold).toBe(100 * 1024 * 1024);
      expect(orchestrator['memoryConfig'].enableForcedGC).toBe(true);
      expect(orchestrator['memoryConfig'].memoryMonitoringInterval).toBe(2000);
    });

    it('should allow custom memory optimization configuration', () => {
      const customConfig: MemoryOptimizedMigrationConfig = {
        enableMemoryOptimization: false,
        memoryOptimizationThreshold: 0.8,
        progressiveLoadingThreshold: 50 * 1024 * 1024,
        memoryMonitoringInterval: 1000
      };

      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized(customConfig);

      expect(orchestrator['memoryConfig'].enableMemoryOptimization).toBe(false);
      expect(orchestrator['memoryConfig'].memoryOptimizationThreshold).toBe(0.8);
      expect(orchestrator['memoryConfig'].progressiveLoadingThreshold).toBe(50 * 1024 * 1024);
      expect(orchestrator['memoryConfig'].memoryMonitoringInterval).toBe(1000);
    });

    it('should initialize memory manager with correct configuration', () => {
      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized({
        memoryOptimizationThreshold: 0.8,
        enableForcedGC: false
      });

      expect(MockMemoryManager).toHaveBeenCalledWith({
        moderatePressureThreshold: 0.5,
        highPressureThreshold: 0.8,
        criticalPressureThreshold: 0.85,
        enableForcedGC: false
      });
    });

    it('should set initial chunk size from memory manager recommendation', () => {
      mockMemoryManager.getRecommendedChunkSize.mockReturnValue(500);

      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();

      expect(orchestrator['currentChunkSize']).toBe(500);
    });
  });

  describe('memory monitoring', () => {
    beforeEach(() => {
      // Enable memory monitoring for these tests
      process.env.FORCE_MEMORY_MONITORING = 'true';
      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();
    });

    afterEach(() => {
      // Clean up environment variable
      delete process.env.FORCE_MEMORY_MONITORING;
    });

    it('should start memory monitoring when enabled', () => {
      orchestrator['startMemoryMonitoring']();

      expect(mockMemoryManager.onMemoryPressure).toHaveBeenCalled();
      expect(mockMemoryManager.startMonitoring).toHaveBeenCalled();
    });

    it('should not start monitoring when memory optimization is disabled', () => {
      const orchestratorDisabled = new IndexedDbMigrationOrchestratorMemoryOptimized({
        enableMemoryOptimization: false
      });

      orchestratorDisabled['startMemoryMonitoring']();

      expect(mockMemoryManager.onMemoryPressure).not.toHaveBeenCalled();
      expect(mockMemoryManager.startMonitoring).not.toHaveBeenCalled();
    });

    it('should stop memory monitoring and cleanup', () => {
      orchestrator['startMemoryMonitoring']();
      orchestrator['stopMemoryMonitoring']();

      expect(mockMemoryManager.stopMonitoring).toHaveBeenCalled();
      // cleanup is called in the main cleanup method, not stopMemoryMonitoring
    });

    it('should handle memory pressure events and adjust chunk size', () => {
      orchestrator['startMemoryMonitoring']();

      // Get the callback that was registered
      const memoryPressureCallback = mockMemoryManager.onMemoryPressure.mock.calls[0][0];

      const pressureEvent = {
        level: MemoryPressureLevel.HIGH,
        memoryInfo: {
          usedJSHeapSize: 150 * 1024 * 1024,
          totalJSHeapSize: 150 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024,
          usagePercentage: 75,
          isMemoryConstrained: false,
          availableMemory: 50 * 1024 * 1024
        },
        timestamp: Date.now(),
        recommendedChunkSize: 300,
        shouldForceGC: true,
        suggestedActions: ['Reduce batch size', 'Force garbage collection']
      };

      // Simulate memory pressure event
      memoryPressureCallback(pressureEvent);

      expect(orchestrator['currentChunkSize']).toBe(300);
      expect(orchestrator['memoryOptimizationActions']).toContain(
        'Chunk size adjusted: 1000 → 300 (high pressure)'
      );
    });

    it('should force garbage collection when recommended', async () => {
      orchestrator['startMemoryMonitoring']();

      const memoryPressureCallback = mockMemoryManager.onMemoryPressure.mock.calls[0][0];

      const pressureEvent = {
        level: MemoryPressureLevel.CRITICAL,
        memoryInfo: {
          usedJSHeapSize: 180 * 1024 * 1024,
          totalJSHeapSize: 180 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024,
          usagePercentage: 90,
          isMemoryConstrained: false,
          availableMemory: 20 * 1024 * 1024
        },
        timestamp: Date.now(),
        recommendedChunkSize: 10,
        shouldForceGC: true,
        suggestedActions: ['Use minimum batch size']
      };

      // Simulate critical pressure event
      memoryPressureCallback(pressureEvent);

      // Wait for async GC to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockMemoryManager.forceGarbageCollection).toHaveBeenCalled();
      expect(orchestrator['gcTriggeredRecently']).toBe(true);
    });

    it('should throttle garbage collection calls', async () => {
      orchestrator['startMemoryMonitoring']();

      const memoryPressureCallback = mockMemoryManager.onMemoryPressure.mock.calls[0][0];

      const pressureEvent = {
        level: MemoryPressureLevel.CRITICAL,
        memoryInfo: {
          usedJSHeapSize: 180 * 1024 * 1024,
          totalJSHeapSize: 180 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024,
          usagePercentage: 90,
          isMemoryConstrained: false,
          availableMemory: 20 * 1024 * 1024
        },
        timestamp: Date.now(),
        recommendedChunkSize: 10,
        shouldForceGC: true,
        suggestedActions: []
      };

      // First event should trigger GC
      memoryPressureCallback(pressureEvent);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockMemoryManager.forceGarbageCollection).toHaveBeenCalledTimes(1);

      // Second event immediately after should not trigger GC
      memoryPressureCallback(pressureEvent);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockMemoryManager.forceGarbageCollection).toHaveBeenCalledTimes(1);
    });
  });

  describe('progressive loading detection', () => {
    beforeEach(() => {
      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();
    });

    it('should enable progressive loading for large datasets', async () => {
      // Mock Blob constructor to return large size without creating actual large data
      const originalBlob = global.Blob;
      global.Blob = jest.fn().mockImplementation(() => ({
        size: 150 * 1024 * 1024 // 150MB mock size
      })) as unknown as typeof Blob;

      (localStorage.getLocalStorageItem as jest.Mock).mockReturnValue('small-test-data');

      const shouldUse = await orchestrator['shouldUseProgressiveLoading']();

      expect(shouldUse).toBe(true);

      // Restore original Blob
      global.Blob = originalBlob;
    });

    it('should not enable progressive loading for small datasets', async () => {
      // Default mock returns small data
      const shouldUse = await orchestrator['shouldUseProgressiveLoading']();

      expect(shouldUse).toBe(false);
    });

    it('should respect progressive loading configuration', async () => {
      const orchestratorDisabled = new IndexedDbMigrationOrchestratorMemoryOptimized({
        enableProgressiveLoading: false
      });

      const shouldUse = await orchestratorDisabled['shouldUseProgressiveLoading']();

      expect(shouldUse).toBe(false);
    });

    it('should default to progressive loading when size estimation fails', async () => {
      // Mock estimateTotalDataSize to throw error
      jest.spyOn(orchestrator as unknown as { estimateTotalDataSize: () => Promise<number> }, 'estimateTotalDataSize').mockRejectedValue(new Error('Storage error'));

      const shouldUse = await orchestrator['shouldUseProgressiveLoading']();

      expect(shouldUse).toBe(true);
    });
  });

  describe('data size estimation', () => {
    beforeEach(() => {
      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();
    });

    it('should estimate total data size correctly', async () => {
      const mockData = {
        'savedSoccerGames': 'x'.repeat(10 * 1024), // 10KB
        'soccerMasterRoster': 'y'.repeat(5 * 1024), // 5KB
        'soccerSeasons': 'z'.repeat(2 * 1024) // 2KB
      };

      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key: string) => {
        return mockData[key as keyof typeof mockData] || null;
      });

      const totalSize = await orchestrator['estimateTotalDataSize']();

      // Should be approximately 17KB (10 + 5 + 2)
      expect(totalSize).toBeGreaterThan(16 * 1024);
      expect(totalSize).toBeLessThan(18 * 1024);
    });

    it('should handle missing or null values gracefully', async () => {
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key: string) => {
        if (key === 'savedSoccerGames') return 'x'.repeat(1024);
        return null; // Other keys return null
      });

      const totalSize = await orchestrator['estimateTotalDataSize']();

      expect(totalSize).toBeGreaterThan(1000);
      expect(totalSize).toBeLessThan(1100);
    });

    it('should handle storage errors gracefully', async () => {
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const totalSize = await orchestrator['estimateTotalDataSize']();

      expect(totalSize).toBe(0);
    });
  });

  describe('emergency optimization', () => {
    beforeEach(() => {
      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();
    });

    it('should perform emergency optimization for critical memory usage', () => {
      const initialChunkSize = orchestrator['currentChunkSize'];

      // Mock critical memory usage
      mockMemoryManager.getMemoryInfo.mockReturnValue({
        usedJSHeapSize: 190 * 1024 * 1024,
        totalJSHeapSize: 190 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 95, // > 90% threshold
        isMemoryConstrained: false,
        availableMemory: 10 * 1024 * 1024
      });

      orchestrator['performMemoryCheck']();

      expect(orchestrator['currentChunkSize']).toBe(10); // minChunkSize
      expect(orchestrator['memoryOptimizationActions']).toContain(
        `Emergency optimization: chunk size ${initialChunkSize} → 10, forced GC`
      );
    });

    it('should not trigger emergency optimization for normal memory usage', () => {
      const initialChunkSize = orchestrator['currentChunkSize'];

      orchestrator['performMemoryCheck']();

      expect(orchestrator['currentChunkSize']).toBe(initialChunkSize); // Unchanged
    });
  });

  describe('memory optimization status', () => {
    beforeEach(() => {
      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();
    });

    it('should return current memory optimization status', () => {
      orchestrator['currentChunkSize'] = 500;
      orchestrator['gcTriggeredRecently'] = true;
      orchestrator['memoryOptimizationActions'] = ['Test action'];

      const status = orchestrator.getMemoryOptimizationStatus();

      expect(status.memoryUsage).toBe(25); // From mock
      expect(status.memoryPressure).toBe(MemoryPressureLevel.LOW);
      expect(status.currentChunkSize).toBe(500);
      expect(status.gcTriggered).toBe(true);
      expect(status.availableMemoryMB).toBe(150); // 150MB from mock
      expect(status.optimizationActions).toEqual(['Test action']);
    });

    it('should handle missing memory info gracefully', () => {
      mockMemoryManager.getMemoryInfo.mockReturnValue(null);

      const status = orchestrator.getMemoryOptimizationStatus();

      expect(status.memoryUsage).toBe(0);
      expect(status.availableMemoryMB).toBe(0);
      expect(status.memoryPressure).toBe(MemoryPressureLevel.LOW); // From mock
    });
  });

  describe('enhanced estimation', () => {
    beforeEach(() => {
      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();
    });

    it('should handle memory optimization disabled mode', () => {
      const orchestratorDisabled = new IndexedDbMigrationOrchestratorMemoryOptimized({
        enableMemoryOptimization: false
      });

      expect(orchestratorDisabled['memoryConfig'].enableMemoryOptimization).toBe(false);
    });

    it('should provide memory optimization status when enabled', () => {
      const status = orchestrator.getMemoryOptimizationStatus();

      expect(status.memoryUsage).toBeDefined();
      expect(status.memoryPressure).toBeDefined();
      expect(status.currentChunkSize).toBeDefined();
      expect(status.availableMemoryMB).toBeDefined();
      expect(status.optimizationActions).toBeDefined();
    });
  });

  describe('chunk size optimization', () => {
    beforeEach(() => {
      orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();
    });

    it('should use dynamic chunk size from memory manager', () => {
      orchestrator['currentChunkSize'] = 750;

      const batchSize = orchestrator['getOptimalBatchSize']();

      expect(batchSize).toBe(750);
    });

    it('should update chunk size as memory pressure changes', () => {
      orchestrator['currentChunkSize'] = 1000;

      // Simulate memory pressure change
      orchestrator['currentChunkSize'] = 200;

      const batchSize = orchestrator['getOptimalBatchSize']();

      expect(batchSize).toBe(200);
    });
  });

  describe('migration with memory optimization disabled', () => {
    it('should handle disabled optimization configuration', () => {
      const orchestratorDisabled = new IndexedDbMigrationOrchestratorMemoryOptimized({
        enableMemoryOptimization: false
      });

      expect(orchestratorDisabled['memoryConfig'].enableMemoryOptimization).toBe(false);
    });
  });
});