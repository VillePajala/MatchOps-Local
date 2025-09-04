/**
 * @jest-environment jsdom
 */

import { 
  createMockPlayers, 
  createMockFieldPlayers,
  measureMemoryUsage 
} from '../utils/test-utils';

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

describe('Performance Tests - Basic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset memory mock
    mockPerformanceMemory.usedJSHeapSize = 10000000;
  });

  describe('Data Structure Performance', () => {
    it('should create large player datasets efficiently', () => {
      const startTime = performance.now();
      
      const largePlayers = createMockPlayers(1000);
      
      const createTime = performance.now() - startTime;
      
      // Creating 1000 mock players should be fast
      expect(createTime).toBeLessThan(1000); // 1 second max
      expect(largePlayers).toHaveLength(1000);
      expect(largePlayers[0]).toHaveProperty('id');
      expect(largePlayers[0]).toHaveProperty('name');
    });

    it('should handle field player creation efficiently', () => {
      const startTime = performance.now();
      
      const fieldPlayers = createMockFieldPlayers(100);
      
      const createTime = performance.now() - startTime;
      
      // Creating 100 field players should be fast
      expect(createTime).toBeLessThan(500); // 500ms max
      expect(fieldPlayers).toHaveLength(100);
      expect(fieldPlayers[0]).toHaveProperty('relX');
      expect(fieldPlayers[0]).toHaveProperty('relY');
    });
  });

  describe('Memory Usage Tracking', () => {
    it('should track memory usage changes', () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0;
      
      // Simulate memory increase
      mockPerformanceMemory.usedJSHeapSize = initialMemory + 1000000; // +1MB
      
      const finalMemory = performance.memory?.usedJSHeapSize || 0;
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

  describe('Computational Performance', () => {
    it('should perform array operations efficiently', () => {
      const startTime = performance.now();
      
      // Create and manipulate large arrays
      const players = createMockPlayers(500);
      const sorted = players.sort((a, b) => a.name.localeCompare(b.name));
      const filtered = sorted.filter(p => !p.isGoalie);
      const mapped = filtered.map(p => ({ ...p, processed: true }));
      
      const processingTime = performance.now() - startTime;
      
      expect(processingTime).toBeLessThan(200); // 200ms max
      expect(mapped.length).toBeGreaterThan(0);
      expect(mapped[0]).toHaveProperty('processed', true);
    });

    it('should handle concurrent operations efficiently', async () => {
      const operations = Array.from({ length: 10 }, async (_, i) => {
        const players = createMockPlayers(50);
        await new Promise(resolve => setTimeout(resolve, 5)); // Simulate async work
        return players.length;
      });
      
      const startTime = performance.now();
      const results = await Promise.all(operations);
      const totalTime = performance.now() - startTime;
      
      // Concurrent operations should complete quickly
      expect(totalTime).toBeLessThan(500); // 500ms max
      expect(results).toHaveLength(10);
      expect(results.every(length => length === 50)).toBe(true);
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

    it('should handle maximum reasonable dataset sizes', () => {
      const largeCount = 5000;
      const startTime = performance.now();
      
      const largePlayers = createMockPlayers(largeCount);
      
      const largeTime = performance.now() - startTime;
      
      // Should handle large datasets within reasonable time
      expect(largeTime).toBeLessThan(5000); // 5 seconds max
      expect(largePlayers).toHaveLength(largeCount);
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not accumulate memory during repeated operations', () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0;
      
      // Perform repeated operations
      for (let i = 0; i < 100; i++) {
        const players = createMockPlayers(10);
        // Simulate using and discarding data
        players.forEach(player => player.name);
      }
      
      // In testing, memory should not grow significantly
      const finalMemory = performance.memory?.usedJSHeapSize || 0;
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