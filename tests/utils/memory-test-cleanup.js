/**
 * Memory-specific test cleanup utilities
 * Specialized cleanup for memory management and migration tests
 */

/**
 * Clean up memory manager instances and related resources
 */
function cleanupMemoryManagers() {
  // Clean up global memory manager if accessible
  if (typeof window !== 'undefined' && window.__MEMORY_MANAGER_INSTANCE__) {
    try {
      window.__MEMORY_MANAGER_INSTANCE__.cleanup();
      delete window.__MEMORY_MANAGER_INSTANCE__;
    } catch (error) {
      console.warn('Memory manager cleanup warning:', error.message);
    }
  }

  // Clean up any global migration orchestrators
  if (typeof global !== 'undefined' && global.__MIGRATION_ORCHESTRATOR__) {
    try {
      if (global.__MIGRATION_ORCHESTRATOR__.stopMemoryMonitoring) {
        global.__MIGRATION_ORCHESTRATOR__.stopMemoryMonitoring();
      }
      delete global.__MIGRATION_ORCHESTRATOR__;
    } catch (error) {
      console.warn('Migration orchestrator cleanup warning:', error.message);
    }
  }
}

/**
 * Clean up memory monitoring environment variables
 */
function cleanupMemoryEnvironment() {
  delete process.env.FORCE_MEMORY_MONITORING;
  delete process.env.MEMORY_OPTIMIZATION_ENABLED;
  delete process.env.MEMORY_MONITORING_INTERVAL;
}

/**
 * Clean up timer-related operations that might hang tests
 */
function cleanupMemoryTimers() {
  // Clear Jest timers
  if (typeof jest !== 'undefined') {
    jest.clearAllTimers();
  }

  // Clear requestIdleCallback if mocked
  if (typeof window !== 'undefined' && window.requestIdleCallback) {
    // Reset requestIdleCallback to original if it was mocked
    if (window.requestIdleCallback.mockRestore) {
      window.requestIdleCallback.mockRestore();
    }
  }

  // Clear any window.gc mocks
  if (typeof window !== 'undefined' && window.gc && window.gc.mockRestore) {
    window.gc.mockRestore();
  }
}

/**
 * Clean up IndexedDB and storage mocks
 */
function cleanupStorageMocks() {
  // Reset IndexedDB mocks if they exist
  if (typeof global !== 'undefined' && global.indexedDB && global.indexedDB.mockClear) {
    global.indexedDB.mockClear();
  }

  // Clear localStorage mocks
  if (typeof window !== 'undefined' && window.localStorage) {
    if (window.localStorage.mockClear) {
      window.localStorage.mockClear();
    } else {
      window.localStorage.clear();
    }
  }
}

/**
 * Comprehensive memory test cleanup
 */
function cleanupMemoryTests() {
  try {
    cleanupMemoryManagers();
    cleanupMemoryEnvironment();
    cleanupMemoryTimers();
    cleanupStorageMocks();
  } catch (error) {
    // Don't let cleanup errors break tests
    console.warn('Memory test cleanup error (non-fatal):', error.message);
  }
}

module.exports = {
  cleanupMemoryTests,
  cleanupMemoryManagers,
  cleanupMemoryEnvironment,
  cleanupMemoryTimers,
  cleanupStorageMocks
};

// Auto-cleanup for memory tests if this file is loaded
if (typeof jest !== 'undefined') {
  afterEach(() => {
    cleanupMemoryTests();
  });
}