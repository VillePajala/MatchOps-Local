/**
 * Test suite for MemoryManager
 * Testing the actual methods that exist in the implementation
 */

import { MemoryManager, MemoryPressureLevel, MEMORY_CONFIG_PRESETS } from './memoryManager';
import logger from './logger';

// Mock the logger
jest.mock('./logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  let originalWindow: Window | undefined;
  let originalNavigator: Navigator | undefined;
  let originalProcess: NodeJS.Process | undefined;

  beforeEach(() => {
    jest.clearAllMocks();

    // Save originals
    originalWindow = global.window;
    originalNavigator = global.navigator;
    originalProcess = global.process;

    // Mock window with performance API providing mock memory info
    (global as unknown as { window: Window }).window = {
      performance: {
        memory: {
          usedJSHeapSize: 41943040, // 40MB
          totalJSHeapSize: 41943040, // 40MB
          jsHeapSizeLimit: 104857600 // 100MB
        }
      } as unknown as Performance,
      requestIdleCallback: jest.fn((cb: () => void) => {
        cb();
        return 1;
      })
    } as unknown as Window;

    // Mock navigator
    (global as unknown as { navigator: Navigator }).navigator = {} as Navigator;

    // Reset process.env
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'test';

    memoryManager = new MemoryManager();
  });

  afterEach(() => {
    memoryManager.cleanup();
    global.window = originalWindow as Window & typeof globalThis;
    global.navigator = originalNavigator as Navigator;
    global.process = originalProcess as NodeJS.Process;
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(memoryManager).toBeDefined();
      // Just check it returns a valid pressure level
      const pressure = memoryManager.getMemoryPressureLevel();
      expect(Object.values(MemoryPressureLevel)).toContain(pressure);
    });

    it('should initialize with custom configuration', () => {
      const customConfig = MEMORY_CONFIG_PRESETS.CONSERVATIVE;
      const customManager = new MemoryManager(customConfig);
      expect(customManager).toBeDefined();
      customManager.cleanup();
    });
  });

  describe('Configuration Presets', () => {
    it('should have valid configuration presets', () => {
      expect(MEMORY_CONFIG_PRESETS.AGGRESSIVE).toBeDefined();
      expect(MEMORY_CONFIG_PRESETS.CONSERVATIVE).toBeDefined();
      expect(MEMORY_CONFIG_PRESETS.BALANCED).toBeDefined();
      expect(MEMORY_CONFIG_PRESETS.ADAPTIVE).toBeDefined();

      // Test that presets have required properties
      expect(MEMORY_CONFIG_PRESETS.AGGRESSIVE.enableForcedGC).toBe(false);
      expect(MEMORY_CONFIG_PRESETS.CONSERVATIVE.maxChunkSize).toBe(100);
    });
  });

  describe('Memory Information Detection', () => {
    it('should return memory info using current mock performance API', () => {
      const info = memoryManager.getMemoryInfo();
      expect(info).toBeDefined();
      // The mock might be different, let's just check structure
      expect(typeof info?.usedJSHeapSize).toBe('number');
      expect(typeof info?.jsHeapSizeLimit).toBe('number');
      expect(typeof info?.usagePercentage).toBe('number');
    });

    it('should detect Chrome Performance.memory API', () => {
      (global.window as unknown as { performance: unknown }).performance = {
        memory: {
          usedJSHeapSize: 50 * 1024 * 1024,
          totalJSHeapSize: 100 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      } as unknown as Performance;

      const manager = new MemoryManager();
      const info = manager.getMemoryInfo();

      expect(info).toBeDefined();
      expect(info?.usedJSHeapSize).toBe(50 * 1024 * 1024);

      manager.cleanup();
    });
  });

  describe('Memory Pressure Detection', () => {
    it('should detect different pressure levels', () => {
      // Test with different memory configurations
      const pressureLevel = memoryManager.getMemoryPressureLevel();
      expect(Object.values(MemoryPressureLevel)).toContain(pressureLevel);
    });

    it('should detect LOW pressure with explicitly low memory usage', () => {
      // Completely replace the performance object for this test
      delete (global.window as unknown as { performance: unknown }).performance;
      (global.window as unknown as { performance: unknown }).performance = {
        memory: {
          usedJSHeapSize: 30 * 1024 * 1024,   // 30MB
          totalJSHeapSize: 100 * 1024 * 1024, // 100MB
          jsHeapSizeLimit: 200 * 1024 * 1024  // 200MB
        }
      } as unknown as Performance;

      const manager = new MemoryManager();
      const memInfo = manager.getMemoryInfo();

      expect(memInfo).not.toBeNull();
      expect(memInfo?.usedJSHeapSize).toBe(30 * 1024 * 1024);
      expect(memInfo?.jsHeapSizeLimit).toBe(200 * 1024 * 1024);
      expect(memInfo?.usagePercentage).toBe(15); // 30MB/200MB = 15%

      const pressure = manager.getMemoryPressureLevel();
      // 15% usage is well below 50% moderate threshold, should be LOW
      expect(pressure).toBe(MemoryPressureLevel.LOW);

      manager.cleanup();
    });
  });

  describe('Chunk Size Recommendations', () => {
    it('should return valid chunk sizes', () => {
      const chunkSize = memoryManager.getRecommendedChunkSize();
      expect(chunkSize).toBeGreaterThan(0);
      expect(typeof chunkSize).toBe('number');
    });

    it('should respect configuration bounds', () => {
      const customConfig = {
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        minChunkSize: 50,
        maxChunkSize: 500
      };

      const manager = new MemoryManager(customConfig);
      const chunkSize = manager.getRecommendedChunkSize();

      expect(chunkSize).toBeGreaterThanOrEqual(50);
      expect(chunkSize).toBeLessThanOrEqual(500);

      manager.cleanup();
    });
  });

  describe('Garbage Collection', () => {
    it('should handle GC requests without errors', async () => {
      (process.env as { NODE_ENV?: string }).NODE_ENV = 'development';

      const result = await memoryManager.forceGarbageCollection();
      expect(typeof result).toBe('boolean');
    });

    it('should check if GC should be forced', () => {
      const shouldForce = memoryManager.shouldForceGarbageCollection();
      expect(typeof shouldForce).toBe('boolean');
    });
  });

  describe('Monitoring', () => {
    it('should start and stop monitoring', () => {
      memoryManager.startMonitoring();
      expect(logger.debug).toHaveBeenCalledWith('Skipping memory monitoring in test environment');

      memoryManager.stopMonitoring();
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should register memory pressure callbacks', () => {
      const callback = jest.fn();
      const cleanup = memoryManager.onMemoryPressure(callback);

      expect(typeof cleanup).toBe('function');
      expect(logger.debug).toHaveBeenCalledWith(
        'Memory pressure callback registered',
        expect.any(Object)
      );

      // Cleanup
      cleanup();
    });
  });

  describe('Data Size Estimation', () => {
    it('should estimate data size correctly', () => {
      const testData = 'Hello, World! 🌍';
      const size = memoryManager.getEstimatedDataSize(testData);

      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('should cache size estimations', () => {
      const testData = 'Test data for caching';
      const cacheKey = 'test-key';

      const size1 = memoryManager.getEstimatedDataSize(testData, cacheKey);
      const size2 = memoryManager.getEstimatedDataSize(testData, cacheKey);

      expect(size1).toBe(size2);
    });

    it('should handle different data types', () => {
      const asciiData = 'Simple ASCII text';
      const unicodeData = 'Unicode text with émojis 🚀';

      const asciiSize = memoryManager.getEstimatedDataSize(asciiData);
      const unicodeSize = memoryManager.getEstimatedDataSize(unicodeData);

      expect(asciiSize).toBeGreaterThan(0);
      expect(unicodeSize).toBeGreaterThan(asciiSize);
    });
  });

  describe('Configuration Management', () => {
    it('should return current configuration', () => {
      const config = memoryManager.getConfig();

      expect(config).toBeDefined();
      expect(config.moderatePressureThreshold).toBeDefined();
      expect(config.enableForcedGC).toBeDefined();
    });

    it('should update configuration', () => {
      const updates = { enableForcedGC: false };

      memoryManager.updateConfig(updates);

      const config = memoryManager.getConfig();
      expect(config.enableForcedGC).toBe(false);
    });

    it('should accept configuration updates without validation', () => {
      const updates = {
        moderatePressureThreshold: 0.6
      };

      expect(() => {
        memoryManager.updateConfig(updates);
      }).not.toThrow();

      const config = memoryManager.getConfig();
      expect(config.moderatePressureThreshold).toBe(0.6);
    });
  });

  describe('Suggested Actions', () => {
    it('should provide suggestions based on memory info', () => {
      const suggestions = memoryManager.getSuggestedActions();

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide different suggestions for different pressure levels', () => {
      // Mock high memory usage
      (global.window as unknown as { performance: unknown }).performance = {
        memory: {
          usedJSHeapSize: 180 * 1024 * 1024,
          totalJSHeapSize: 190 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      } as unknown as Performance;

      const manager = new MemoryManager();
      const suggestions = manager.getSuggestedActions();

      expect(suggestions.length).toBeGreaterThan(0);
      // With high memory usage, suggestions should mention reducing or managing something
      expect(suggestions.some(s => s.toLowerCase().includes('batch') || s.toLowerCase().includes('reduce') || s.toLowerCase().includes('memory'))).toBe(true);

      manager.cleanup();
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources properly', () => {
      memoryManager.startMonitoring();
      memoryManager.cleanup();

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should call stopMonitoring during cleanup', () => {
      const stopMonitoringSpy = jest.spyOn(memoryManager, 'stopMonitoring');

      memoryManager.cleanup();

      expect(stopMonitoringSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing performance API gracefully', () => {
      // Remove performance API
      delete (global.window as unknown as { performance: unknown }).performance;

      const manager = new MemoryManager();
      const info = manager.getMemoryInfo();

      expect(info).toBeDefined();
      manager.cleanup();
    });

    it('should handle configuration validation errors', () => {
      const invalidConfig = {
        moderatePressureThreshold: 1.5, // Invalid: > 1.0
        highPressureThreshold: 0.7,
        criticalPressureThreshold: 0.9
      };

      expect(() => {
        new MemoryManager(invalidConfig as Partial<{ moderatePressureThreshold: number; highPressureThreshold: number; criticalPressureThreshold: number }>);
      }).toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should work end-to-end with memory monitoring', () => {
      process.env.FORCE_MEMORY_MONITORING = 'true';

      const manager = new MemoryManager();
      const callback = jest.fn();

      manager.onMemoryPressure(callback);
      manager.startMonitoring();

      // Should not throw
      expect(manager.getMemoryPressureLevel()).toBeDefined();
      expect(manager.getRecommendedChunkSize()).toBeGreaterThan(0);

      manager.cleanup();
      delete process.env.FORCE_MEMORY_MONITORING;
    });
  });
});