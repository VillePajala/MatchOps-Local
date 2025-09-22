/**
 * Tests for Memory Manager
 */

import {
  MemoryManager,
  MemoryPressureLevel,
  getCurrentMemoryInfo,
  getCurrentMemoryPressure,
  getRecommendedChunkSize,
  forceGarbageCollection,
  memoryManager
} from './memoryManager';

// Mock logger
jest.mock('./logger');

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const config = manager.getConfig();

      expect(config.moderatePressureThreshold).toBe(0.5);
      expect(config.highPressureThreshold).toBe(0.7);
      expect(config.criticalPressureThreshold).toBe(0.85);
      expect(config.minChunkSize).toBe(10);
      expect(config.maxChunkSize).toBe(1000);
      expect(config.defaultChunkSize).toBe(100);
      expect(config.monitoringInterval).toBe(5000);
      expect(config.enableForcedGC).toBe(true);
    });

    it('should allow custom configuration', () => {
      const customManager = new MemoryManager({
        moderatePressureThreshold: 0.6,
        maxChunkSize: 500,
        enableForcedGC: false
      });

      const config = customManager.getConfig();
      expect(config.moderatePressureThreshold).toBe(0.6);
      expect(config.maxChunkSize).toBe(500);
      expect(config.enableForcedGC).toBe(false);
      // Should keep defaults for unspecified values
      expect(config.minChunkSize).toBe(10);

      customManager.cleanup();
    });
  });

  describe('memory info detection', () => {
    it('should detect Chrome performance.memory API', () => {
      // Mock Chrome performance.memory
      const mockMemory = {
        usedJSHeapSize: 50 * 1024 * 1024,    // 50MB
        totalJSHeapSize: 60 * 1024 * 1024,   // 60MB
        jsHeapSizeLimit: 200 * 1024 * 1024   // 200MB
      };

      Object.defineProperty(performance, 'memory', {
        value: mockMemory,
        configurable: true
      });

      const memoryInfo = manager.getMemoryInfo();

      expect(memoryInfo).not.toBeNull();
      expect(memoryInfo!.usedJSHeapSize).toBe(50 * 1024 * 1024);
      expect(memoryInfo!.totalJSHeapSize).toBe(60 * 1024 * 1024);
      expect(memoryInfo!.jsHeapSizeLimit).toBe(200 * 1024 * 1024);
      expect(memoryInfo!.usagePercentage).toBe(25); // 50MB/200MB = 25%
      expect(memoryInfo!.availableMemory).toBe(150 * 1024 * 1024); // 200MB - 50MB
      expect(memoryInfo!.isMemoryConstrained).toBe(false); // 200MB > 100MB
    });

    it('should handle memory constrained devices', () => {
      // Mock low-memory device
      const mockMemory = {
        usedJSHeapSize: 40 * 1024 * 1024,    // 40MB
        totalJSHeapSize: 45 * 1024 * 1024,   // 45MB
        jsHeapSizeLimit: 80 * 1024 * 1024    // 80MB (< 100MB threshold)
      };

      Object.defineProperty(performance, 'memory', {
        value: mockMemory,
        configurable: true
      });

      const memoryInfo = manager.getMemoryInfo();

      expect(memoryInfo).not.toBeNull();
      expect(memoryInfo!.isMemoryConstrained).toBe(true);
      expect(memoryInfo!.usagePercentage).toBe(50); // 40MB/80MB = 50%
    });

    it('should estimate memory for non-Chrome browsers with deviceMemory', () => {
      // Remove performance.memory
      delete (performance as unknown as { memory?: unknown }).memory;

      // Mock navigator.deviceMemory
      Object.defineProperty(navigator, 'deviceMemory', {
        value: 8, // 8GB RAM
        configurable: true
      });

      const memoryInfo = manager.getMemoryInfo();

      expect(memoryInfo).not.toBeNull();
      expect(memoryInfo!.usagePercentage).toBe(30);
      expect(memoryInfo!.isMemoryConstrained).toBe(false); // 8GB >= 4GB
      expect(memoryInfo!.jsHeapSizeLimit).toBeGreaterThan(0);
    });

    it('should handle low-RAM devices with deviceMemory', () => {
      // Remove performance.memory
      delete (performance as unknown as { memory?: unknown }).memory;

      // Mock low-RAM device
      Object.defineProperty(navigator, 'deviceMemory', {
        value: 2, // 2GB RAM
        configurable: true
      });

      const memoryInfo = manager.getMemoryInfo();

      expect(memoryInfo).not.toBeNull();
      expect(memoryInfo!.isMemoryConstrained).toBe(true); // 2GB < 4GB
    });

    it('should fall back to conservative estimates when APIs unavailable', () => {
      // Remove all memory APIs
      delete (performance as unknown as { memory?: unknown }).memory;
      delete (navigator as unknown as { deviceMemory?: unknown }).deviceMemory;

      const memoryInfo = manager.getMemoryInfo();

      expect(memoryInfo).not.toBeNull();
      expect(memoryInfo!.isMemoryConstrained).toBe(true);
      expect(memoryInfo!.usagePercentage).toBe(50);
      expect(memoryInfo!.jsHeapSizeLimit).toBe(100 * 1024 * 1024); // 100MB
    });

    it('should return null when memory detection fails', () => {
      // Mock API to throw error
      Object.defineProperty(performance, 'memory', {
        get: () => {
          throw new Error('Memory API unavailable');
        },
        configurable: true
      });

      delete (navigator as unknown as { deviceMemory?: unknown }).deviceMemory;

      const memoryInfo = manager.getMemoryInfo();

      expect(memoryInfo).toBeNull();
    });
  });

  describe('memory pressure levels', () => {
    it('should correctly classify LOW pressure', () => {
      const lowMemoryInfo = {
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 20, // 20% < 50% threshold
        isMemoryConstrained: false,
        availableMemory: 160 * 1024 * 1024
      };

      const level = manager.getMemoryPressureLevel(lowMemoryInfo);
      expect(level).toBe(MemoryPressureLevel.LOW);
    });

    it('should correctly classify MODERATE pressure', () => {
      const moderateMemoryInfo = {
        usedJSHeapSize: 120 * 1024 * 1024,
        totalJSHeapSize: 120 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 60, // 50% <= 60% < 70%
        isMemoryConstrained: false,
        availableMemory: 80 * 1024 * 1024
      };

      const level = manager.getMemoryPressureLevel(moderateMemoryInfo);
      expect(level).toBe(MemoryPressureLevel.MODERATE);
    });

    it('should correctly classify HIGH pressure', () => {
      const highMemoryInfo = {
        usedJSHeapSize: 150 * 1024 * 1024,
        totalJSHeapSize: 150 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 75, // 70% <= 75% < 85%
        isMemoryConstrained: false,
        availableMemory: 50 * 1024 * 1024
      };

      const level = manager.getMemoryPressureLevel(highMemoryInfo);
      expect(level).toBe(MemoryPressureLevel.HIGH);
    });

    it('should correctly classify CRITICAL pressure', () => {
      const criticalMemoryInfo = {
        usedJSHeapSize: 180 * 1024 * 1024,
        totalJSHeapSize: 180 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 90, // 90% >= 85%
        isMemoryConstrained: false,
        availableMemory: 20 * 1024 * 1024
      };

      const level = manager.getMemoryPressureLevel(criticalMemoryInfo);
      expect(level).toBe(MemoryPressureLevel.CRITICAL);
    });

    it('should default to MODERATE when memory info unavailable', () => {
      jest.spyOn(manager, 'getMemoryInfo').mockReturnValue(null);

      const level = manager.getMemoryPressureLevel();
      expect(level).toBe(MemoryPressureLevel.MODERATE);
    });
  });

  describe('chunk size recommendations', () => {
    it('should recommend maximum chunk size for LOW pressure', () => {
      const lowMemoryInfo = {
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 20,
        isMemoryConstrained: false,
        availableMemory: 160 * 1024 * 1024
      };

      const chunkSize = manager.getRecommendedChunkSize(lowMemoryInfo);
      expect(chunkSize).toBe(1000); // maxChunkSize
    });

    it('should recommend medium chunk size for MODERATE pressure', () => {
      const moderateMemoryInfo = {
        usedJSHeapSize: 120 * 1024 * 1024,
        totalJSHeapSize: 120 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 60,
        isMemoryConstrained: false,
        availableMemory: 80 * 1024 * 1024
      };

      const chunkSize = manager.getRecommendedChunkSize(moderateMemoryInfo);
      expect(chunkSize).toBe(600); // 60% of maxChunkSize
    });

    it('should recommend small chunk size for HIGH pressure', () => {
      const highMemoryInfo = {
        usedJSHeapSize: 150 * 1024 * 1024,
        totalJSHeapSize: 150 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 75,
        isMemoryConstrained: false,
        availableMemory: 50 * 1024 * 1024
      };

      const chunkSize = manager.getRecommendedChunkSize(highMemoryInfo);
      expect(chunkSize).toBe(300); // 30% of maxChunkSize
    });

    it('should recommend minimum chunk size for CRITICAL pressure', () => {
      const criticalMemoryInfo = {
        usedJSHeapSize: 180 * 1024 * 1024,
        totalJSHeapSize: 180 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 90,
        isMemoryConstrained: false,
        availableMemory: 20 * 1024 * 1024
      };

      const chunkSize = manager.getRecommendedChunkSize(criticalMemoryInfo);
      expect(chunkSize).toBe(10); // minChunkSize
    });

    it('should halve chunk size for memory constrained devices', () => {
      const constrainedMemoryInfo = {
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 80 * 1024 * 1024, // < 100MB = constrained
        usagePercentage: 50,
        isMemoryConstrained: true,
        availableMemory: 40 * 1024 * 1024
      };

      const chunkSize = manager.getRecommendedChunkSize(constrainedMemoryInfo);
      expect(chunkSize).toBe(300); // (60% of 1000) / 2 = 300
    });

    it('should enforce minimum chunk size bounds', () => {
      const manager = new MemoryManager({
        maxChunkSize: 50,
        minChunkSize: 20
      });

      const constrainedMemoryInfo = {
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 80 * 1024 * 1024,
        usagePercentage: 95, // Critical pressure
        isMemoryConstrained: true,
        availableMemory: 4 * 1024 * 1024
      };

      const chunkSize = manager.getRecommendedChunkSize(constrainedMemoryInfo);
      expect(chunkSize).toBe(20); // Should not go below minChunkSize

      manager.cleanup();
    });
  });

  describe('garbage collection', () => {
    it('should recommend GC for HIGH pressure', () => {
      const highMemoryInfo = {
        usedJSHeapSize: 150 * 1024 * 1024,
        totalJSHeapSize: 150 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 75,
        isMemoryConstrained: false,
        availableMemory: 50 * 1024 * 1024
      };

      const shouldForceGC = manager.shouldForceGarbageCollection(highMemoryInfo);
      expect(shouldForceGC).toBe(true);
    });

    it('should recommend GC for CRITICAL pressure', () => {
      const criticalMemoryInfo = {
        usedJSHeapSize: 180 * 1024 * 1024,
        totalJSHeapSize: 180 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 90,
        isMemoryConstrained: false,
        availableMemory: 20 * 1024 * 1024
      };

      const shouldForceGC = manager.shouldForceGarbageCollection(criticalMemoryInfo);
      expect(shouldForceGC).toBe(true);
    });

    it('should not recommend GC for LOW/MODERATE pressure', () => {
      const lowMemoryInfo = {
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 20,
        isMemoryConstrained: false,
        availableMemory: 160 * 1024 * 1024
      };

      const shouldForceGC = manager.shouldForceGarbageCollection(lowMemoryInfo);
      expect(shouldForceGC).toBe(false);
    });

    it('should respect enableForcedGC configuration', () => {
      const managerWithoutGC = new MemoryManager({
        enableForcedGC: false
      });

      const criticalMemoryInfo = {
        usedJSHeapSize: 180 * 1024 * 1024,
        totalJSHeapSize: 180 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 90,
        isMemoryConstrained: false,
        availableMemory: 20 * 1024 * 1024
      };

      const shouldForceGC = managerWithoutGC.shouldForceGarbageCollection(criticalMemoryInfo);
      expect(shouldForceGC).toBe(false);

      managerWithoutGC.cleanup();
    });

    it('should attempt to force garbage collection when window.gc available', async () => {
      // Mock window.gc
      const mockGC = jest.fn();
      Object.defineProperty(window, 'gc', {
        value: mockGC,
        configurable: true
      });

      const result = await manager.forceGarbageCollection();

      expect(result).toBe(true);
      expect(mockGC).toHaveBeenCalled();
    });

    it('should fall back to memory pressure technique when window.gc unavailable', async () => {
      // Ensure window.gc doesn't exist
      delete (window as unknown as { gc?: unknown }).gc;

      // Mock requestIdleCallback
      const mockRequestIdleCallback = jest.fn((callback: IdleRequestCallback) => {
        setTimeout(callback, 0);
        return 1;
      });

      Object.defineProperty(window, 'requestIdleCallback', {
        value: mockRequestIdleCallback,
        configurable: true
      });

      const result = await manager.forceGarbageCollection();

      expect(result).toBe(true);
      expect(mockRequestIdleCallback).toHaveBeenCalled();
    });

    it('should handle garbage collection failure gracefully', async () => {
      // Remove both gc and requestIdleCallback
      delete (window as unknown as { gc?: unknown }).gc;
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;

      const result = await manager.forceGarbageCollection();

      expect(result).toBe(false);
    });
  });

  describe('suggested actions', () => {
    it('should provide performance-focused actions for LOW pressure', () => {
      const lowMemoryInfo = {
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 20,
        isMemoryConstrained: false,
        availableMemory: 160 * 1024 * 1024
      };

      const actions = manager.getSuggestedActions(lowMemoryInfo);

      expect(actions).toContain('Use larger batch sizes for optimal performance');
    });

    it('should provide conservative actions for CRITICAL pressure', () => {
      const criticalMemoryInfo = {
        usedJSHeapSize: 180 * 1024 * 1024,
        totalJSHeapSize: 180 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 90,
        isMemoryConstrained: false,
        availableMemory: 20 * 1024 * 1024
      };

      const actions = manager.getSuggestedActions(criticalMemoryInfo);

      expect(actions).toContain('Use minimum batch size');
      expect(actions).toContain('Force garbage collection after each batch');
      expect(actions).toContain('Consider pausing migration temporarily');
      expect(actions).toContain('Clear all unnecessary references');
    });

    it('should include constrained device warning when applicable', () => {
      const constrainedMemoryInfo = {
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 80 * 1024 * 1024,
        usagePercentage: 50,
        isMemoryConstrained: true,
        availableMemory: 40 * 1024 * 1024
      };

      const actions = manager.getSuggestedActions(constrainedMemoryInfo);

      expect(actions).toContain('Device appears memory-constrained - use conservative settings');
    });
  });

  describe('monitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start and stop monitoring correctly', () => {
      expect(manager['isMonitoring']).toBe(false);

      manager.startMonitoring();
      expect(manager['isMonitoring']).toBe(true);

      manager.stopMonitoring();
      expect(manager['isMonitoring']).toBe(false);
    });

    it('should not start monitoring if already active', () => {
      manager.startMonitoring();
      const firstInterval = manager['monitoringInterval'];

      manager.startMonitoring(); // Second call
      const secondInterval = manager['monitoringInterval'];

      expect(firstInterval).toBe(secondInterval);
      expect(manager['isMonitoring']).toBe(true);
    });

    it('should call callbacks during monitoring', () => {
      const callback = jest.fn();
      manager.onMemoryPressure(callback);

      // Mock memory info
      jest.spyOn(manager, 'getMemoryInfo').mockReturnValue({
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 20,
        isMemoryConstrained: false,
        availableMemory: 160 * 1024 * 1024
      });

      manager.startMonitoring();

      // Initial check
      expect(callback).toHaveBeenCalledTimes(1);

      // Advance timer
      jest.advanceTimersByTime(5000);
      expect(callback).toHaveBeenCalledTimes(2);

      // Check callback received correct data
      const lastCall = callback.mock.calls[callback.mock.calls.length - 1][0];
      expect(lastCall.level).toBe(MemoryPressureLevel.LOW);
      expect(lastCall.recommendedChunkSize).toBe(1000);
      expect(lastCall.shouldForceGC).toBe(false);
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const goodCallback = jest.fn();

      manager.onMemoryPressure(errorCallback);
      manager.onMemoryPressure(goodCallback);

      // Mock memory info
      jest.spyOn(manager, 'getMemoryInfo').mockReturnValue({
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 20,
        isMemoryConstrained: false,
        availableMemory: 160 * 1024 * 1024
      });

      manager.startMonitoring();

      // Both callbacks should be called despite error in first one
      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
    });

    it('should allow unsubscribing from callbacks', () => {
      const callback = jest.fn();
      const unsubscribe = manager.onMemoryPressure(callback);

      // Mock memory info
      jest.spyOn(manager, 'getMemoryInfo').mockReturnValue({
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 40 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usagePercentage: 20,
        isMemoryConstrained: false,
        availableMemory: 160 * 1024 * 1024
      });

      manager.startMonitoring();
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Advance timer
      jest.advanceTimersByTime(5000);
      expect(callback).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });

  describe('configuration updates', () => {
    it('should allow updating configuration', () => {
      const initialConfig = manager.getConfig();
      expect(initialConfig.maxChunkSize).toBe(1000);

      manager.updateConfig({
        maxChunkSize: 500,
        enableForcedGC: false
      });

      const updatedConfig = manager.getConfig();
      expect(updatedConfig.maxChunkSize).toBe(500);
      expect(updatedConfig.enableForcedGC).toBe(false);
      // Should preserve other values
      expect(updatedConfig.minChunkSize).toBe(10);
    });
  });

  describe('cleanup', () => {
    it('should clean up all resources', () => {
      const callback = jest.fn();
      manager.onMemoryPressure(callback);
      manager.startMonitoring();

      expect(manager['callbacks'].size).toBe(1);
      expect(manager['isMonitoring']).toBe(true);

      manager.cleanup();

      expect(manager['callbacks'].size).toBe(0);
      expect(manager['isMonitoring']).toBe(false);
      expect(manager['monitoringInterval']).toBeNull();
      expect(manager['lastMemoryInfo']).toBeNull();
    });
  });

  describe('convenience functions', () => {
    it('should provide global convenience functions', () => {
      // These should use the global memory manager instance
      expect(typeof getCurrentMemoryInfo).toBe('function');
      expect(typeof getCurrentMemoryPressure).toBe('function');
      expect(typeof getRecommendedChunkSize).toBe('function');
      expect(typeof forceGarbageCollection).toBe('function');
    });

    it('should delegate to global memory manager', () => {
      const mockGetMemoryInfo = jest.spyOn(memoryManager, 'getMemoryInfo');
      const mockGetMemoryPressureLevel = jest.spyOn(memoryManager, 'getMemoryPressureLevel');
      const mockGetRecommendedChunkSize = jest.spyOn(memoryManager, 'getRecommendedChunkSize');
      const mockForceGarbageCollection = jest.spyOn(memoryManager, 'forceGarbageCollection');

      getCurrentMemoryInfo();
      getCurrentMemoryPressure();
      getRecommendedChunkSize();
      forceGarbageCollection();

      expect(mockGetMemoryInfo).toHaveBeenCalled();
      expect(mockGetMemoryPressureLevel).toHaveBeenCalled();
      expect(mockGetRecommendedChunkSize).toHaveBeenCalled();
      expect(mockForceGarbageCollection).toHaveBeenCalled();
    });
  });
});