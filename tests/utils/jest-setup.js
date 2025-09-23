/**
 * Jest setup file - Comprehensive cleanup to prevent hanging
 * This file runs before each test to ensure clean state
 */

// Track all timers and intervals for cleanup
const activeTimers = new Set();
const activeIntervals = new Set();
const activeTimeouts = new Set();

// Override setTimeout to track timers
const originalSetTimeout = global.setTimeout;
global.setTimeout = function(callback, delay, ...args) {
  const id = originalSetTimeout(callback, delay, ...args);
  activeTimeouts.add(id);
  return id;
};

// Override setInterval to track intervals
const originalSetInterval = global.setInterval;
global.setInterval = function(callback, delay, ...args) {
  const id = originalSetInterval(callback, delay, ...args);
  activeIntervals.add(id);
  return id;
};

// Override clearTimeout to untrack
const originalClearTimeout = global.clearTimeout;
global.clearTimeout = function(id) {
  activeTimeouts.delete(id);
  return originalClearTimeout(id);
};

// Override clearInterval to untrack
const originalClearInterval = global.clearInterval;
global.clearInterval = function(id) {
  activeIntervals.delete(id);
  return originalClearInterval(id);
};

// Cleanup function
function cleanupAllTimers() {
  // Clear all tracked timeouts
  activeTimeouts.forEach(id => {
    try {
      originalClearTimeout(id);
    } catch (e) {
      // Ignore errors - timer might already be cleared
    }
  });
  activeTimeouts.clear();

  // Clear all tracked intervals
  activeIntervals.forEach(id => {
    try {
      originalClearInterval(id);
    } catch (e) {
      // Ignore errors - interval might already be cleared
    }
  });
  activeIntervals.clear();
}

// Mock ResizeObserver to prevent browser-specific errors
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock localStorage if not available
if (typeof global.localStorage === 'undefined') {
  const localStorageMock = {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn(() => null),
  };
  global.localStorage = localStorageMock;
}

// Mock sessionStorage
if (typeof global.sessionStorage === 'undefined') {
  const sessionStorageMock = {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn(() => null),
  };
  global.sessionStorage = sessionStorageMock;
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Setup cleanup hooks
beforeEach(() => {
  // Clear all timers before each test
  cleanupAllTimers();

  // Reset localStorage mock
  if (global.localStorage && typeof global.localStorage.clear === 'function') {
    global.localStorage.clear();
  }

  // Reset sessionStorage mock
  if (global.sessionStorage && typeof global.sessionStorage.clear === 'function') {
    global.sessionStorage.clear();
  }

  // Clear all console spies
  jest.clearAllMocks();
});

afterEach(() => {
  // Aggressive cleanup after each test
  cleanupAllTimers();

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Clear any remaining jest timers
  if (jest.getTimerCount && jest.getTimerCount() > 0) {
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
  }
});

// Global error handler to prevent uncaught promise rejections
process.on('unhandledRejection', (reason, promise) => {
  // In test environment, log but don't fail the process
  console.warn('Unhandled Promise Rejection:', reason);
});

// Suppress console.error for expected test errors
const originalConsoleError = console.error;
console.error = (...args) => {
  // Filter out common test noise
  const message = args[0];
  if (typeof message === 'string') {
    // Suppress ResizeObserver errors
    if (message.includes('ResizeObserver') ||
        message.includes('Not implemented') ||
        message.includes('JSDOM does not implement')) {
      return;
    }
  }
  originalConsoleError.apply(console, args);
};

// Export cleanup function for manual use
global.cleanupAllTimers = cleanupAllTimers;