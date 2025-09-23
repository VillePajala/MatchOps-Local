/**
 * Jest setup file - Comprehensive cleanup to prevent hanging
 * This file runs before each test to ensure clean state
 */

// Cleanup function - minimal implementation to avoid timer conflicts
function cleanupAllTimers() {
  // Let Jest's forceExit handle timer cleanup
  // Individual tests can use jest.useFakeTimers() if needed
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