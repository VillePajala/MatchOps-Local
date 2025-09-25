/**
 * Test cleanup utilities to ensure proper test isolation
 * This file is run after each test to clean up state
 */

// Clean up DOM state (but not during active tests)
function cleanupDOM() {
  // Let React Testing Library handle DOM cleanup completely
  // Manual DOM manipulation can cause memory leaks
  // React Testing Library's cleanup() is sufficient
}

// Clean up timers and intervals
function cleanupTimers() {
  // Clear all timers (this works with Jest fake timers too)
  if (typeof jest !== 'undefined') {
    jest.clearAllTimers();
    jest.clearAllMocks();
  }

  // Don't attempt to clear real timers - this creates memory leaks
  // Jest fake timers should handle all test timers properly
}

// Clean up global state
function cleanupGlobals() {
  // Clean up any global variables that might leak between tests
  if (typeof global !== 'undefined') {
    // Reset common globals that tests might modify
    delete global.__MATCH_OPS_TEST_STATE__;
    delete global.__REACT_QUERY_STATE__;
  }
  
  // Clean up window/document globals in browser environment
  if (typeof window !== 'undefined') {
    // Clear localStorage
    if (window.localStorage) {
      window.localStorage.clear();
    }
    
    // Clear sessionStorage
    if (window.sessionStorage) {
      window.sessionStorage.clear();
    }
    
    // Reset any custom properties
    delete window.__MATCH_OPS_TEST_DATA__;
  }
}

// Clean up React state and effects
function cleanupReact() {
  // This helps prevent React state leaks between tests
  if (typeof global !== 'undefined' && global.gc) {
    // Force garbage collection if available (in Node.js with --expose-gc)
    global.gc();
  }
}

// Clean up performance measurements
function cleanupPerformance() {
  if (typeof performance !== 'undefined' && performance.clearMarks) {
    performance.clearMarks();
  }
  if (typeof performance !== 'undefined' && performance.clearMeasures) {
    performance.clearMeasures();
  }
}

// Main cleanup function
function cleanupAfterTest() {
  try {
    cleanupTimers();
    // Skip DOM cleanup - let React Testing Library handle it
    cleanupGlobals();
    cleanupReact();
    cleanupPerformance();
  } catch (error) {
    // Don't let cleanup errors break tests, but log them
    console.warn('Test cleanup error (non-fatal):', error.message);
  }
}

// Export for use in Jest setup
module.exports = {
  cleanupAfterTest,
  cleanupDOM,
  cleanupTimers,
  cleanupGlobals,
  cleanupReact,
  cleanupPerformance
};

// Auto-cleanup if this file is loaded in a test environment
if (typeof jest !== 'undefined') {
  // Run cleanup after each test
  afterEach(() => {
    cleanupAfterTest();
  });
}