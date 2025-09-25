/**
 * Comprehensive test suite for MemoryManager
 * Testing all aspects of memory pressure detection and management
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

    // Mock window with basic properties
    (global as unknown as { window: Window }).window = {
      performance: {},
      requestIdleCallback: jest.fn((cb: () => void) => {
        cb();
        return 1;
      }),
      gc: undefined
    } as Window;

    // Mock navigator
    (global as unknown as { navigator: Navigator }).navigator = {} as Navigator;

    // Reset process.env
    process.env.NODE_ENV = 'test';

    memoryManager = new MemoryManager();
  });

  afterEach(() => {
    memoryManager.cleanup();
    global.window = originalWindow;
    global.navigator = originalNavigator;
    global.process = originalProcess;
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(memoryManager).toBeDefined();
      expect(memoryManager.getCurrentPressureLevel()).toBe(MemoryPressureLevel.LOW);
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        ...MEMORY_CONFIG_PRESETS.CONSERVATIVE,
        minChunkSize: 2
      };

      const customManager = new MemoryManager(customConfig);
      expect(customManager).toBeDefined();
      customManager.cleanup();
    });

    it('should validate configuration on initialization', () => {
      const invalidConfig = {
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        moderatePressureThreshold: 0.9,
        highPressureThreshold: 0.7,  // Invalid: lower than moderate
        criticalPressureThreshold: 0.85
      };

      expect(() => new MemoryManager(invalidConfig)).toThrow('Invalid threshold configuration');
    });
  });

  describe('Configuration Presets', () => {
    it('should have valid AGGRESSIVE preset', () => {
      const manager = new MemoryManager(MEMORY_CONFIG_PRESETS.AGGRESSIVE);
      expect(manager).toBeDefined();
      expect(MEMORY_CONFIG_PRESETS.AGGRESSIVE.enableForcedGC).toBe(false);
      expect(MEMORY_CONFIG_PRESETS.AGGRESSIVE.maxChunkSize).toBe(5000);
      manager.cleanup();
    });

    it('should have valid CONSERVATIVE preset', () => {
      const manager = new MemoryManager(MEMORY_CONFIG_PRESETS.CONSERVATIVE);
      expect(manager).toBeDefined();
      expect(MEMORY_CONFIG_PRESETS.CONSERVATIVE.maxChunkSize).toBe(100);
      expect(MEMORY_CONFIG_PRESETS.CONSERVATIVE.monitoringInterval).toBe(2000);
      manager.cleanup();
    });

    it('should have valid BALANCED preset', () => {
      const manager = new MemoryManager(MEMORY_CONFIG_PRESETS.BALANCED);
      expect(manager).toBeDefined();
      expect(MEMORY_CONFIG_PRESETS.BALANCED.maxChunkSize).toBe(1000);
      manager.cleanup();
    });

    it('should have valid ADAPTIVE preset', () => {
      const manager = new MemoryManager(MEMORY_CONFIG_PRESETS.ADAPTIVE);
      expect(manager).toBeDefined();
      expect(MEMORY_CONFIG_PRESETS.ADAPTIVE.monitoringInterval).toBe(8000);
      manager.cleanup();
    });
  });

  describe('Memory Information Detection', () => {
    it('should detect Chrome Performance.memory API', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 50 * 1024 * 1024,
          totalJSHeapSize: 100 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      const info = manager.getMemoryInfo();

      expect(info).toBeDefined();
      expect(info?.usedMemory).toBe(50 * 1024 * 1024);
      expect(info?.totalMemory).toBe(200 * 1024 * 1024);
      expect(info?.deviceMemory).toBeUndefined();

      manager.cleanup();
    });

    it('should detect navigator.deviceMemory API', () => {
      (global.navigator as Navigator & { deviceMemory?: number }).deviceMemory = 4; // 4GB

      const manager = new MemoryManager();
      const info = manager.getMemoryInfo();

      expect(info).toBeDefined();
      expect(info?.deviceMemory).toBe(4 * 1024 * 1024 * 1024);

      manager.cleanup();
    });

    it('should provide fallback estimates when no APIs available', () => {
      const manager = new MemoryManager();
      const info = manager.getMemoryInfo();

      expect(info).toBeDefined();
      // Should use conservative estimates
      expect(info?.usedMemory).toBeGreaterThan(0);
      expect(info?.totalMemory).toBeGreaterThan(0);

      manager.cleanup();
    });

    it('should identify memory-constrained devices', () => {
      (global.navigator as Navigator & { deviceMemory?: number }).deviceMemory = 2; // 2GB - constrained device

      const manager = new MemoryManager();
      const isConstrained = manager.isMemoryConstrainedDevice();

      expect(isConstrained).toBe(true);

      manager.cleanup();
    });

    it('should handle partial API availability', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 50 * 1024 * 1024,
          totalJSHeapSize: null, // Missing property
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      const info = manager.getMemoryInfo();

      // Should fall back gracefully
      expect(info).toBeDefined();

      manager.cleanup();
    });
  });

  describe('Memory Pressure Detection', () => {
    it('should detect LOW pressure level', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 30 * 1024 * 1024,  // 30MB used
          totalJSHeapSize: 100 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024  // 200MB limit
        }
      };

      const manager = new MemoryManager();
      const pressure = manager.getCurrentPressureLevel();

      expect(pressure).toBe(MemoryPressureLevel.LOW);

      manager.cleanup();
    });

    it('should detect MODERATE pressure level', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 110 * 1024 * 1024,  // 110MB used (55% of 200MB)
          totalJSHeapSize: 150 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024  // 200MB limit
        }
      };

      const manager = new MemoryManager();
      const pressure = manager.getCurrentPressureLevel();

      expect(pressure).toBe(MemoryPressureLevel.MODERATE);

      manager.cleanup();
    });

    it('should detect HIGH pressure level', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 150 * 1024 * 1024,  // 150MB used (75% of 200MB)
          totalJSHeapSize: 180 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024  // 200MB limit
        }
      };

      const manager = new MemoryManager();
      const pressure = manager.getCurrentPressureLevel();

      expect(pressure).toBe(MemoryPressureLevel.HIGH);

      manager.cleanup();
    });

    it('should detect CRITICAL pressure level', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 180 * 1024 * 1024,  // 180MB used (90% of 200MB)
          totalJSHeapSize: 190 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024  // 200MB limit
        }
      };

      const manager = new MemoryManager();
      const pressure = manager.getCurrentPressureLevel();

      expect(pressure).toBe(MemoryPressureLevel.CRITICAL);

      manager.cleanup();
    });
  });

  describe('Chunk Size Optimization', () => {
    it('should return maximum chunk size under LOW pressure', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 30 * 1024 * 1024,
          totalJSHeapSize: 100 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      const chunkSize = manager.getOptimalChunkSize();

      expect(chunkSize).toBe(1000); // max chunk size

      manager.cleanup();
    });

    it('should reduce chunk size under MODERATE pressure', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 110 * 1024 * 1024,
          totalJSHeapSize: 150 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      const chunkSize = manager.getOptimalChunkSize();

      expect(chunkSize).toBeLessThan(1000);
      expect(chunkSize).toBeGreaterThan(100);

      manager.cleanup();
    });

    it('should use minimum chunk size under CRITICAL pressure', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 180 * 1024 * 1024,
          totalJSHeapSize: 190 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      const chunkSize = manager.getOptimalChunkSize();

      expect(chunkSize).toBe(10); // min chunk size

      manager.cleanup();
    });

    it('should respect configuration bounds', () => {
      const customConfig = {
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        minChunkSize: 50,
        maxChunkSize: 500
      };

      const manager = new MemoryManager(customConfig);
      const chunkSize = manager.getOptimalChunkSize();

      expect(chunkSize).toBeGreaterThanOrEqual(50);
      expect(chunkSize).toBeLessThanOrEqual(500);

      manager.cleanup();
    });

    it('should use default chunk size when memory info unavailable', () => {
      // No memory APIs available
      const manager = new MemoryManager();
      const chunkSize = manager.getOptimalChunkSize();

      expect(chunkSize).toBe(100); // default chunk size

      manager.cleanup();
    });
  });

  describe('Garbage Collection', () => {
    it('should skip GC in production environment', async () => {
      process.env.NODE_ENV = 'production';
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).gc = jest.fn();

      const manager = new MemoryManager();
      const result = await manager.forceGarbageCollection();

      expect(result).toBe(false);
      expect(global.window.gc).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skipping window.gc() in production')
      );

      manager.cleanup();
    });

    it('should execute GC in development environment', async () => {
      process.env.NODE_ENV = 'development';
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).gc = jest.fn();

      const manager = new MemoryManager();
      await manager.forceGarbageCollection();

      expect(global.window.gc).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Forced garbage collection executed');

      manager.cleanup();
    });

    it('should handle CSP-blocked GC gracefully', async () => {
      process.env.NODE_ENV = 'development';
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).gc = jest.fn(() => {
        throw new Error('CSP violation');
      });

      const manager = new MemoryManager();
      const result = await manager.forceGarbageCollection();

      expect(result).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('window.gc() blocked by CSP'),
        expect.any(Object)
      );

      manager.cleanup();
    });

    it('should throttle GC attempts', async () => {
      const manager = new MemoryManager({
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        gcThrottleMs: 1000
      });

      await manager.forceGarbageCollection();
      const result2 = await manager.forceGarbageCollection();

      // Second attempt should be throttled
      expect(result2).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Garbage collection throttled')
      );

      manager.cleanup();
    });

    it('should respect enableForcedGC configuration', async () => {
      const manager = new MemoryManager({
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        enableForcedGC: false
      });

      await manager.forceGarbageCollection();

      expect(logger.debug).toHaveBeenCalledWith('Forced GC is disabled in configuration');

      manager.cleanup();
    });

    it('should use memory pressure fallback when gc unavailable', async () => {
      const manager = new MemoryManager();
      await manager.forceGarbageCollection();

      expect(logger.debug).toHaveBeenCalledWith(
        'Encouraged garbage collection through memory pressure'
      );

      manager.cleanup();
    });
  });

  describe('Memory Monitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start memory monitoring', () => {
      const manager = new MemoryManager();
      manager.startMonitoring();

      expect(logger.info).toHaveBeenCalledWith('Starting memory monitoring', expect.any(Object));

      manager.cleanup();
    });

    it('should stop memory monitoring', () => {
      const manager = new MemoryManager();
      manager.startMonitoring();
      manager.stopMonitoring();

      expect(logger.info).toHaveBeenCalledWith('Stopping memory monitoring');

      manager.cleanup();
    });

    it('should emit pressure change events', () => {
      const onPressureChange = jest.fn();
      const manager = new MemoryManager();

      manager.onPressureChange(onPressureChange);

      // Simulate pressure change
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 30 * 1024 * 1024,
          totalJSHeapSize: 100 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      manager.startMonitoring();

      // Change to HIGH pressure
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance.memory.usedJSHeapSize = 150 * 1024 * 1024;

      jest.advanceTimersByTime(5000);

      // Event listener should be called with pressure change
      expect(onPressureChange).toHaveBeenCalled();

      manager.cleanup();
    });

    it('should handle monitoring errors gracefully', () => {
      const manager = new MemoryManager();

      // Mock performance to throw error
      Object.defineProperty(global.window, 'performance', {
        get: () => {
          throw new Error('Performance API error');
        }
      });

      manager.startMonitoring();
      jest.advanceTimersByTime(5000);

      // Should not crash
      expect(logger.warn).toHaveBeenCalled();

      manager.cleanup();
    });

    it('should not start monitoring twice', () => {
      const manager = new MemoryManager();

      manager.startMonitoring();
      manager.startMonitoring();

      expect(logger.debug).toHaveBeenCalledWith('Memory monitoring already active');

      manager.cleanup();
    });
  });

  describe('Data Size Estimation', () => {
    it('should estimate size using TextEncoder (primary method)', () => {
      const manager = new MemoryManager();
      const testData = 'Hello, World! 🌍';

      const size = manager.getEstimatedDataSize(testData);

      // TextEncoder should properly encode UTF-8 including emoji
      expect(size).toBeGreaterThan(testData.length);
      expect(size).toBeGreaterThan(0);

      manager.cleanup();
    });

    it('should cache size estimations', () => {
      const manager = new MemoryManager();
      const testData = 'Test data for caching';
      const cacheKey = 'test-key';

      const size1 = manager.getEstimatedDataSize(testData, cacheKey);
      const size2 = manager.getEstimatedDataSize(testData, cacheKey);

      expect(size1).toBe(size2);

      manager.cleanup();
    });

    it('should handle TextEncoder errors with Blob fallback', () => {
      // Mock TextEncoder to fail
      const originalTextEncoder = global.TextEncoder;
      (global as unknown as Record<string, unknown>).TextEncoder = class {
        encode() {
          throw new Error('TextEncoder failed');
        }
      };

      const manager = new MemoryManager();
      const size = manager.getEstimatedDataSize('Test data');

      expect(size).toBeGreaterThan(0);

      global.TextEncoder = originalTextEncoder;
      manager.cleanup();
    });

    it('should handle all estimation methods failing', () => {
      // Mock all methods to fail
      const originalTextEncoder = global.TextEncoder;
      const originalBlob = global.Blob;
      const originalJSON = JSON.stringify;

      (global as unknown as Record<string, unknown>).TextEncoder = class {
        encode() {
          throw new Error('TextEncoder failed');
        }
      };
      (global as unknown as Record<string, unknown>).Blob = class {
        constructor() {
          throw new Error('Blob failed');
        }
      };
      JSON.stringify = () => {
        throw new Error('JSON.stringify failed');
      };

      const manager = new MemoryManager();
      const size = manager.getEstimatedDataSize('Test data');

      // Should fall back to conservative estimate
      expect(size).toBe('Test data'.length * 3 * 1.2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Using conservative size estimation',
        expect.any(Object)
      );

      global.TextEncoder = originalTextEncoder;
      global.Blob = originalBlob;
      JSON.stringify = originalJSON;
      manager.cleanup();
    });

    it('should apply safety multiplier', () => {
      const manager = new MemoryManager();
      const testData = 'Simple ASCII text';

      // Mock TextEncoder to return exact byte count
      const originalTextEncoder = global.TextEncoder;
      (global as unknown as Record<string, unknown>).TextEncoder = class {
        encode() {
          return { byteLength: testData.length };
        }
      };

      const size = manager.getEstimatedDataSize(testData);

      // Should apply 1.2x safety multiplier
      expect(size).toBe(Math.round(testData.length * 1.2));

      global.TextEncoder = originalTextEncoder;
      manager.cleanup();
    });
  });

  describe('Emergency Optimization', () => {
    it('should trigger emergency optimization under CRITICAL pressure', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 180 * 1024 * 1024,
          totalJSHeapSize: 190 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      const shouldOptimize = manager.shouldPerformEmergencyOptimization();

      expect(shouldOptimize).toBe(true);

      manager.cleanup();
    });

    it('should not trigger emergency optimization under normal pressure', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 50 * 1024 * 1024,
          totalJSHeapSize: 100 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      const shouldOptimize = manager.shouldPerformEmergencyOptimization();

      expect(shouldOptimize).toBe(false);

      manager.cleanup();
    });

    it('should perform emergency optimization actions', async () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 180 * 1024 * 1024,
          totalJSHeapSize: 190 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      await manager.performEmergencyOptimization();

      expect(logger.warn).toHaveBeenCalledWith(
        'Performing emergency memory optimization',
        expect.any(Object)
      );

      const chunkSize = manager.getOptimalChunkSize();
      expect(chunkSize).toBe(10); // Should be minimum

      manager.cleanup();
    });

    it('should handle emergency optimization errors', async () => {
      const manager = new MemoryManager();

      // Mock forceGarbageCollection to throw
      manager.forceGarbageCollection = jest.fn().mockRejectedValue(new Error('GC failed'));

      await manager.performEmergencyOptimization();

      // Should not crash
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to perform emergency optimization',
        expect.any(Object)
      );

      manager.cleanup();
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources properly', () => {
      const manager = new MemoryManager();

      manager.startMonitoring();
      manager.cleanup();

      expect(logger.info).toHaveBeenCalledWith('Stopping memory monitoring');
      expect(logger.debug).toHaveBeenCalledWith('Memory manager cleaned up');
    });

    it('should handle cleanup errors gracefully', () => {
      const manager = new MemoryManager();

      // Mock stopMonitoring to throw
      manager.stopMonitoring = jest.fn(() => {
        throw new Error('Stop monitoring failed');
      });

      manager.cleanup();

      expect(logger.error).toHaveBeenCalledWith(
        'Error during memory manager cleanup',
        expect.any(Object)
      );
    });

    it('should clear all caches on cleanup', () => {
      const manager = new MemoryManager();

      // Add some cached data
      manager.getEstimatedDataSize('test', 'key1');
      manager.getEstimatedDataSize('test2', 'key2');

      manager.cleanup();

      // Cache should be cleared
      const size = manager.getEstimatedDataSize('test', 'key1');
      expect(size).toBeGreaterThan(0); // Should recalculate, not use cache
    });
  });

  describe('Configuration Validation', () => {
    it('should reject invalid threshold order', () => {
      const invalidConfig = {
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        moderatePressureThreshold: 0.8,
        highPressureThreshold: 0.7,
        criticalPressureThreshold: 0.9
      };

      expect(() => new MemoryManager(invalidConfig)).toThrow('Invalid threshold configuration');
    });

    it('should reject thresholds outside valid range', () => {
      const invalidConfig = {
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        moderatePressureThreshold: 1.5, // > 1.0
        highPressureThreshold: 0.7,
        criticalPressureThreshold: 0.9
      };

      expect(() => new MemoryManager(invalidConfig)).toThrow('Thresholds must be between 0 and 1');
    });

    it('should reject invalid chunk sizes', () => {
      const invalidConfig = {
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        minChunkSize: -10
      };

      expect(() => new MemoryManager(invalidConfig)).toThrow('Chunk sizes must be positive');
    });

    it('should reject min > max chunk size', () => {
      const invalidConfig = {
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        minChunkSize: 1000,
        maxChunkSize: 100
      };

      expect(() => new MemoryManager(invalidConfig)).toThrow(
        'minChunkSize cannot be greater than maxChunkSize'
      );
    });

    it('should reject invalid monitoring interval', () => {
      const invalidConfig = {
        ...MEMORY_CONFIG_PRESETS.BALANCED,
        monitoringInterval: 0
      };

      expect(() => new MemoryManager(invalidConfig)).toThrow(
        'Monitoring interval must be positive'
      );
    });
  });

  describe('Memory Status Reporting', () => {
    it('should provide comprehensive memory status', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 100 * 1024 * 1024,
          totalJSHeapSize: 150 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      const status = manager.getMemoryStatus();

      expect(status).toEqual({
        currentPressure: MemoryPressureLevel.MODERATE,
        usedMemory: 100 * 1024 * 1024,
        totalMemory: 200 * 1024 * 1024,
        usagePercentage: 50,
        recommendedChunkSize: expect.any(Number),
        isMemoryConstrained: false,
        canPerformOperation: true
      });

      manager.cleanup();
    });

    it('should indicate when memory constrained', () => {
      (global.navigator as Navigator & { deviceMemory?: number }).deviceMemory = 2; // 2GB

      const manager = new MemoryManager();
      const status = manager.getMemoryStatus();

      expect(status.isMemoryConstrained).toBe(true);

      manager.cleanup();
    });

    it('should prevent operations under critical pressure', () => {
      (global.window as Window & { performance?: { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }; gc?: () => void }).performance = {
        memory: {
          usedJSHeapSize: 190 * 1024 * 1024,
          totalJSHeapSize: 195 * 1024 * 1024,
          jsHeapSizeLimit: 200 * 1024 * 1024
        }
      };

      const manager = new MemoryManager();
      const canPerform = manager.canPerformMemoryIntensiveOperation();

      expect(canPerform).toBe(false);

      manager.cleanup();
    });
  });
});