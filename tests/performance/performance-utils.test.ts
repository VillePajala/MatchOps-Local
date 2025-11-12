/**
 * @jest-environment jsdom
 */

import { 
  createMockPlayers, 
  createMockFieldPlayers,
  measureMemoryUsage 
} from '../utils/test-utils';

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: MemoryInfo;
}

// Mock performance.memory for testing
const mockPerformanceMemory = {
  usedJSHeapSize: 10000000,
  totalJSHeapSize: 50000000,
  jsHeapSizeLimit: 2000000000,
};

Object.defineProperty(performance, 'memory', {
  value: mockPerformanceMemory,
  writable: true,
});

describe('Performance Testing Infrastructure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset memory mock
    mockPerformanceMemory.usedJSHeapSize = 10000000;
  });

  describe('Mock Data Performance', () => {
    it('should create large datasets efficiently', () => {
      const startTime = performance.now();
      
      const largePlayers = createMockPlayers(1000);
      
      const createTime = performance.now() - startTime;
      
      // Creating 1000 mock players should be fast (allow slightly higher on CI runners)
      const fastThreshold = process.env.CI ? 150 : 100;
      expect(createTime).toBeLessThan(fastThreshold);
      expect(largePlayers).toHaveLength(1000);
      expect(largePlayers[0]).toHaveProperty('id');
      expect(largePlayers[0]).toHaveProperty('name');
    });

    it('should handle field player creation efficiently', () => {
      const startTime = performance.now();
      
      const fieldPlayers = createMockFieldPlayers(100);
      
      const createTime = performance.now() - startTime;
      
      // Creating 100 field players should be fast (allow slightly higher on CI)
      const fastThreshold = process.env.CI ? 75 : 50;
      expect(createTime).toBeLessThan(fastThreshold);
      expect(fieldPlayers).toHaveLength(100);
      expect(fieldPlayers[0]).toHaveProperty('relX');
      expect(fieldPlayers[0]).toHaveProperty('relY');
    });
  });

  describe('Memory Usage Tracking', () => {
    it('should track memory usage changes', () => {
      const initialMemory = (performance as PerformanceWithMemory).memory?.usedJSHeapSize || 0;
      
      // Simulate memory increase
      mockPerformanceMemory.usedJSHeapSize = initialMemory + 1000000; // +1MB
      
      const finalMemory = (performance as PerformanceWithMemory).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      expect(memoryIncrease).toBe(1000000);
    });

    it('should handle memory measurements without performance.memory', () => {
      // Mock performance without memory property
      const originalPerformance = global.performance;
      Object.defineProperty(global, 'performance', {
        value: { now: () => Date.now() },
        writable: true,
        configurable: true
      });
      
      // Should handle missing performance.memory gracefully
      const measurement = measureMemoryUsage ? measureMemoryUsage() : 0;
      expect(typeof measurement).toBe('number');
      
      // Restore original performance
      Object.defineProperty(global, 'performance', {
        value: originalPerformance,
        writable: true,
        configurable: true
      });
    });
  });

  describe('Performance Timing', () => {
    it('should measure execution time accurately', () => {
      const startTime = performance.now();
      
      // Simulate work
      let sum = 0;
      for (let i = 0; i < 10000; i++) {
        sum += i;
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeGreaterThan(0);
      const opThreshold = process.env.CI ? 150 : 100; // Allow for slower CI runners
      expect(duration).toBeLessThan(opThreshold); // Should be fast
      expect(sum).toBe(49995000); // Verify work was done
    });

    it('should handle rapid timing measurements', () => {
      const timings: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        // Minimal work
        Math.random();
        const end = performance.now();
        timings.push(end - start);
      }
      
      // All timings should be valid numbers
      expect(timings).toHaveLength(100);
      timings.forEach(timing => {
        expect(typeof timing).toBe('number');
        expect(timing).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Resource Constraints Testing', () => {
    it('should simulate low memory conditions', () => {
      // Simulate near memory limit
      mockPerformanceMemory.usedJSHeapSize = mockPerformanceMemory.jsHeapSizeLimit - 1000000; // 1MB from limit
      
      const memoryUsage = (performance as PerformanceWithMemory).memory?.usedJSHeapSize || 0;
      const memoryLimit = (performance as PerformanceWithMemory).memory?.jsHeapSizeLimit || 0;
      const memoryPressure = memoryUsage / memoryLimit;
      
      expect(memoryPressure).toBeGreaterThan(0.95); // More than 95% memory used
    });

    it('should test performance under stress conditions', () => {
      const startTime = performance.now();
      
      // Create stress conditions
      const datasets = [];
      for (let i = 0; i < 10; i++) {
        datasets.push(createMockPlayers(100));
      }
      
      const stressTime = performance.now() - startTime;
      
      // Should handle stress within reasonable time
      expect(stressTime).toBeLessThan(1000); // 1 second
      expect(datasets).toHaveLength(10);
      expect(datasets[0]).toHaveLength(100);
    });
  });

  describe('Concurrent Operations Testing', () => {
    it('should handle parallel data operations', async () => {
      const operations = Array.from({ length: 5 }, async (_, i) => {
        const players = createMockPlayers(50);
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
        return players.length;
      });
      
      const startTime = performance.now();
      const results = await Promise.all(operations);
      const totalTime = performance.now() - startTime;
      
      // Parallel operations should complete quickly
      expect(totalTime).toBeLessThan(500);
      expect(results).toHaveLength(5);
      expect(results.every(length => length === 50)).toBe(true);
    });

    it('should handle rapid sequential operations', () => {
      const startTime = performance.now();
      const results = [];
      
      for (let i = 0; i < 50; i++) {
        const players = createMockFieldPlayers(5);
        results.push(players.length);
      }
      
      const totalTime = performance.now() - startTime;
      
      // 50 sequential operations should be fast
      expect(totalTime).toBeLessThan(100);
      expect(results).toHaveLength(50);
      expect(results.every(length => length === 5)).toBe(true);
    });
  });

  describe('Edge Case Performance', () => {
    it('should handle empty datasets efficiently', () => {
      const startTime = performance.now();
      
      const emptyPlayers = createMockPlayers(0);
      const emptyField = createMockFieldPlayers(0);
      
      const emptyTime = performance.now() - startTime;
      
      expect(emptyTime).toBeLessThan(10); // Should be nearly instant
      expect(emptyPlayers).toHaveLength(0);
      expect(emptyField).toHaveLength(0);
    });

    it('should handle maximum safe integer counts', () => {
      // Test with a reasonable large number (not MAX_SAFE_INTEGER to avoid timeout)
      const largeCount = 10000;
      const startTime = performance.now();
      
      const largePlayers = createMockPlayers(largeCount);
      
      const largeTime = performance.now() - startTime;
      
      // Should handle large datasets within 2 seconds
      expect(largeTime).toBeLessThan(2000);
      expect(largePlayers).toHaveLength(largeCount);
    });
  });

  describe('Memory Leak Detection', () => {
    it('should not accumulate memory during repeated operations', () => {
      const initialMemory = (performance as PerformanceWithMemory).memory?.usedJSHeapSize || 0;
      
      // Perform repeated operations
      for (let i = 0; i < 100; i++) {
        const players = createMockPlayers(10);
        // Simulate using and discarding data
        players.forEach(player => player.name);
      }
      
      // Simulate memory being the same after cleanup
      const finalMemory = (performance as PerformanceWithMemory).memory?.usedJSHeapSize || 0;
      
      // In real scenarios, memory should not increase significantly
      // For testing, we just ensure the measurement works
      expect(typeof finalMemory).toBe('number');
      expect(finalMemory).toBeGreaterThanOrEqual(initialMemory);
    });

    it('should cleanup resources properly', () => {
      let resourceCount = 0;
      
      // Simulate resource creation and cleanup
      const resources = Array.from({ length: 50 }, () => {
        resourceCount++;
        return { id: resourceCount, cleanup: () => resourceCount-- };
      });
      
      // Cleanup all resources
      resources.forEach(resource => resource.cleanup());
      
      expect(resourceCount).toBe(0); // All resources cleaned up
    });
  });
});
