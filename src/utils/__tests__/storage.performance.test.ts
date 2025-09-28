/**
 * Performance tests for storage system
 * Tests adapter creation time, batch operations, and memory usage
 */

import {
  getStorageAdapter,
  getStorageItem,
  setStorageItem,
  getStorageItems,
  setStorageItems,
  clearAdapterCache,
  getStorageMemoryStats,
  performMemoryCleanup
} from '../storage';

// Mock the logger to reduce test noise
jest.mock('../logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })
}));

describe('Storage Performance Tests', () => {
  beforeEach(() => {
    clearAdapterCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearAdapterCache();
  });

  /**
   * Performance test for adapter creation time
   * @performance
   */
  it('should create adapter within reasonable time', async () => {
    const startTime = performance.now();
    await getStorageAdapter();
    const endTime = performance.now();

    const duration = endTime - startTime;

    // Adapter creation should complete within 2 seconds
    expect(duration).toBeLessThan(2000);

    console.log(`Adapter creation time: ${duration.toFixed(2)}ms`);
  });

  /**
   * Performance test for concurrent adapter creation
   * @performance
   */
  it('should handle concurrent adapter creation efficiently', async () => {
    const concurrentRequests = 20;
    const startTime = performance.now();

    const promises = Array(concurrentRequests).fill(null).map(() => getStorageAdapter());
    await Promise.all(promises);

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Concurrent requests should not take significantly longer than single request
    expect(duration).toBeLessThan(3000);

    console.log(`Concurrent adapter creation (${concurrentRequests} requests): ${duration.toFixed(2)}ms`);
  });

  /**
   * Performance test for batch operations
   * @performance
   */
  it('should handle batch operations efficiently', async () => {
    const batchSize = 100;
    const testData: Record<string, string> = {};

    // Generate test data
    for (let i = 0; i < batchSize; i++) {
      testData[`key_${i}`] = `value_${i}_${'x'.repeat(100)}`; // ~100 chars per value
    }

    // Test batch write performance
    const writeStart = performance.now();
    await setStorageItems(testData, { batchSize: 20 });
    const writeEnd = performance.now();
    const writeDuration = writeEnd - writeStart;

    // Test batch read performance
    const readStart = performance.now();
    const readData = await getStorageItems(Object.keys(testData), { batchSize: 20 });
    const readEnd = performance.now();
    const readDuration = readEnd - readStart;

    // Verify data integrity
    expect(Object.keys(readData)).toHaveLength(batchSize);
    expect(readData['key_0']).toBe(testData['key_0']);

    // Performance assertions (reasonable limits for 100 items)
    expect(writeDuration).toBeLessThan(5000); // 5 seconds for batch write
    expect(readDuration).toBeLessThan(3000);  // 3 seconds for batch read

    console.log(`Batch write (${batchSize} items): ${writeDuration.toFixed(2)}ms`);
    console.log(`Batch read (${batchSize} items): ${readDuration.toFixed(2)}ms`);
  });

  /**
   * Performance test for large value handling
   * @performance
   */
  it('should handle large values efficiently', async () => {
    const largeValue = 'x'.repeat(1024 * 1024); // 1MB value
    const key = 'large_value_test';

    // Test write performance
    const writeStart = performance.now();
    await setStorageItem(key, largeValue);
    const writeEnd = performance.now();
    const writeDuration = writeEnd - writeStart;

    // Test read performance
    const readStart = performance.now();
    const readValue = await getStorageItem(key);
    const readEnd = performance.now();
    const readDuration = readEnd - readStart;

    // Verify data integrity
    expect(readValue).toBe(largeValue);

    // Performance assertions for 1MB value
    expect(writeDuration).toBeLessThan(2000); // 2 seconds for 1MB write
    expect(readDuration).toBeLessThan(1000);  // 1 second for 1MB read

    console.log(`Large value write (1MB): ${writeDuration.toFixed(2)}ms`);
    console.log(`Large value read (1MB): ${readDuration.toFixed(2)}ms`);
  });

  /**
   * Memory usage monitoring test
   * @performance
   */
  it('should monitor memory usage effectively', async () => {
    // Initial memory stats
    const initialStats = await getStorageMemoryStats();
    expect(initialStats.hasAdapter).toBe(false);

    // Create adapter and check stats
    await getStorageAdapter();
    const afterCreationStats = await getStorageMemoryStats();
    expect(afterCreationStats.hasAdapter).toBe(true);
    expect(afterCreationStats.adapterAge).toBeGreaterThan(0);

    // Perform cleanup and check stats
    performMemoryCleanup();
    const afterCleanupStats = await getStorageMemoryStats();

    // Verify stats are tracked correctly
    expect(typeof afterCleanupStats.retryCount).toBe('number');
    expect(typeof afterCleanupStats.queueLength).toBe('number');

    console.log('Memory stats after creation:', afterCreationStats);
    console.log('Memory stats after cleanup:', afterCleanupStats);
  });

  /**
   * Stress test for rapid sequential operations
   * @performance
   */
  it('should handle rapid sequential operations', async () => {
    const operationCount = 50;
    const startTime = performance.now();

    // Rapid sequential operations
    for (let i = 0; i < operationCount; i++) {
      await setStorageItem(`sequential_${i}`, `value_${i}`);
      const retrieved = await getStorageItem(`sequential_${i}`);
      expect(retrieved).toBe(`value_${i}`);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (operationCount * 2) / (duration / 1000); // 2 ops per iteration

    // Should maintain reasonable throughput
    expect(opsPerSecond).toBeGreaterThan(10); // At least 10 ops/second
    expect(duration).toBeLessThan(10000); // Complete within 10 seconds

    console.log(`Sequential operations (${operationCount * 2} ops): ${duration.toFixed(2)}ms`);
    console.log(`Throughput: ${opsPerSecond.toFixed(2)} ops/second`);
  });

  /**
   * Test memory cleanup efficiency
   * @performance
   */
  it('should perform memory cleanup efficiently', async () => {
    // Create and use adapter multiple times to accumulate state
    for (let i = 0; i < 5; i++) {
      await getStorageAdapter();
      clearAdapterCache();
    }

    // Measure cleanup performance
    const cleanupStart = performance.now();
    performMemoryCleanup();
    const cleanupEnd = performance.now();
    const cleanupDuration = cleanupEnd - cleanupStart;

    // Cleanup should be very fast
    expect(cleanupDuration).toBeLessThan(50); // Less than 50ms

    console.log(`Memory cleanup duration: ${cleanupDuration.toFixed(2)}ms`);
  });

  /**
   * Test adapter reuse efficiency
   * @performance
   */
  it('should reuse cached adapter efficiently', async () => {
    // First call - creates adapter
    const firstCallStart = performance.now();
    await getStorageAdapter();
    const firstCallEnd = performance.now();
    const firstCallDuration = firstCallEnd - firstCallStart;

    // Second call - should reuse cached adapter
    const secondCallStart = performance.now();
    await getStorageAdapter();
    const secondCallEnd = performance.now();
    const secondCallDuration = secondCallEnd - secondCallStart;

    // Cached call should be much faster
    expect(secondCallDuration).toBeLessThan(firstCallDuration / 2);
    expect(secondCallDuration).toBeLessThan(100); // Should be very fast

    console.log(`First adapter call: ${firstCallDuration.toFixed(2)}ms`);
    console.log(`Cached adapter call: ${secondCallDuration.toFixed(2)}ms`);
    console.log(`Speedup: ${(firstCallDuration / secondCallDuration).toFixed(1)}x`);
  });
});