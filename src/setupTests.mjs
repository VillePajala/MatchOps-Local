import '@testing-library/jest-dom';
import 'jest-canvas-mock';

// Mock Sentry to avoid import errors in tests
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  withScope: jest.fn((callback) => callback({ setTag: jest.fn(), setContext: jest.fn() })),
}));

// Initialize i18n for tests with English language
import i18n from './i18n.ts';
// Immediately change to English synchronously if possible, or queue it
if (i18n.isInitialized) {
  i18n.changeLanguage('en');
} else {
  i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    debug: false,
    interpolation: { escapeValue: false },
  });
}

// Track unhandled promise rejections to prevent silent failures (per test)
let unhandledRejections = new Set();

// Enhanced error detection logic (inlined for ES module compatibility)
const criticalErrorTypes = new Set([
  'SecurityError', 'TypeError', 'ReferenceError', 'SyntaxError',
  'NetworkError', 'AuthenticationError', 'AuthorizationError'
]);

const securityKeywords = [
  'xss', 'csrf', 'cors', 'csp', 'security', 'authentication',
  'authorization', 'permission', 'origin', 'protocol'
];

const performanceKeywords = [
  'memory leak', 'performance', 'timeout', 'slow', 'bundle size', 'memory pressure'
];

const shouldFailTest = (error) => {
  const errorMessage = typeof error === 'string' ? error : error?.message || '';
  const errorType = error?.constructor?.name || '';
  const errorStack = error?.stack || '';

  // Always fail on critical error types
  if (criticalErrorTypes.has(errorType)) return true;

  // Always fail on security-related errors
  if (securityKeywords.some(keyword =>
    errorMessage.toLowerCase().includes(keyword) ||
    errorStack.toLowerCase().includes(keyword)
  )) return true;

  // Always fail on performance issues in tests
  if (performanceKeywords.some(keyword =>
    errorMessage.toLowerCase().includes(keyword)
  )) return true;

  // Fail on network errors that aren't explicitly mocked
  if (errorMessage.includes('fetch') && errorMessage.includes('failed') && !errorMessage.includes('mock')) {
    return true;
  }

  // Allow known test environment limitations
  const allowedErrors = [
    'ResizeObserver loop limit exceeded', 'Not implemented: HTMLCanvasElement',
    'Not implemented: navigation', 'Warning: An update to', 'act(...) warning'
  ];

  return !allowedErrors.some(allowed => errorMessage.includes(allowed));
};

const reportError = (error, context = 'error') => {
  const errorInfo = {
    type: error?.constructor?.name || 'Unknown',
    message: error?.message || error,
    stack: error?.stack,
    context,
    testFile: expect.getState()?.testPath,
    testName: expect.getState()?.currentTestName,
    timestamp: new Date().toISOString()
  };

  console.error(`🚨 ${context.toUpperCase()}:`, errorInfo);
  return errorInfo;
};

const createTestFailureError = (originalError, context) => {
  const testState = expect.getState();
  const testName = testState?.currentTestName || 'unknown test';
  const message = `${context} in test "${testName}": ${originalError?.message || originalError}`;
  const enhancedError = new Error(message);
  enhancedError.stack = originalError?.stack || enhancedError.stack;
  enhancedError.originalError = originalError;
  enhancedError.context = context;
  return enhancedError;
};

// Enhanced unhandled promise rejection handler
const handleUnhandledRejection = (event) => {
  const error = event.reason || event;
  const errorKey = `${error?.message || 'Unknown error'}_${error?.stack?.split('\n')[0] || ''}`;

  // Avoid duplicate reporting
  if (unhandledRejections.has(errorKey)) {
    return;
  }
  unhandledRejections.add(errorKey);

  // Always report the error with enhanced context
  const errorInfo = reportError(error, 'unhandled promise rejection');

  // Use enhanced error detection to determine if test should fail
  if (shouldFailTest(error)) {
    // Create a test-failing error with proper context
    const testError = createTestFailureError(error, 'Unhandled promise rejection');

    // This will cause the test to fail
    setTimeout(() => {
      throw testError;
    }, 0);
  } else {
    // Log but don't fail for expected/allowed errors
    console.warn('⚠️  Allowed unhandled rejection (not failing test):', errorInfo.message);
  }
};

// Set up global error handlers for tests
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  // Also handle errors that might slip through
  const originalError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    console.error('🚨 UNCAUGHT ERROR in test:', { message, source, lineno, colno, error });
    if (originalError) {
      return originalError(message, source, lineno, colno, error);
    }
    return false;
  };
}

if (typeof process !== 'undefined') {
  process.on('unhandledRejection', handleUnhandledRejection);

  // Handle uncaught exceptions too
  const originalUncaughtException = process.listeners('uncaughtException');
  process.on('uncaughtException', (error, origin) => {
    console.error('🚨 UNCAUGHT EXCEPTION in test:', { error: error.message, stack: error.stack, origin });

    // Call original handlers
    originalUncaughtException.forEach(handler => {
      if (typeof handler === 'function') {
        handler(error, origin);
      }
    });
  });
}

// Console monitoring to catch warnings and errors in tests
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Console monitoring - fails tests on unexpected warnings/errors
// List of allowed console warnings/errors (test environment noise and expected test outputs)
const allowedConsolePatterns = [
  'ResizeObserver loop',
  'Not implemented: HTMLCanvasElement',
  'Not implemented: navigation',
  'Warning: ReactDOM.render',
  'Warning: useLayoutEffect',
  'Warning: An update to',
  'act(...) is not supported',
  'was not wrapped in act(...)',  // React state update warnings - will fix with act() wrappers
  // React 19 warnings that are expected
  'Warning: React does not recognize',
  'Warning: Invalid DOM property',
  // Next.js Image component prop warnings (priority is valid for next/image but triggers warning in test mocks)
  'Received `%s` for a non-boolean attribute',
  // Test-specific expected console output (from error handling tests)
  // Game-related errors
  'Error saving game',
  'Error loading game',
  'Error getting game',
  'Error deleting game',
  'Error creating new game',
  'Error adding game event',
  'Error removing game event',
  'Error updating game',
  'Error getting saved games',
  'Error filtering games',
  'Import games error',
  // Settings-related errors
  'Error saving app settings',
  'Error getting app settings',
  'Error saving last home team name',
  'Error getting last home team name',
  '[resetAppSettings] Error',
  // Player assessment errors
  'Error saving player assessment',
  'Error getting player assessment',
  'Error deleting player assessment',
  'Game with ID',  // Warning: Game not found
  'Assessment for player',  // Warning: Assessment not found
  // Validation warnings (expected in error-handling tests)
  'gameId is null or empty',
  'out of bounds',
  'Import completed with',
  'Failed to parse import',
  'Skipping IndexedDB test',
  'Failed to',
  'Migration failed',
  'Storage operation failed',
  'Storage adapter creation still in backoff period',
  // Storage bootstrap errors in test environment (IndexedDB not available in jsdom)
  '[StorageBootstrap]',
  '[StorageFactory]',
  '[StorageConfigManager]',
  '[MutexManager]',
  '[StorageRecovery]',
  'IndexedDB read failed',
  'IndexedDB write failed',
  'IDBRequest is not defined',
  // Canvas/DOM warnings in test environment
  'Canvas has invalid dimensions',
  'Wake Lock request failed',
  // Club season validation warnings (expected in validation tests)
  '[getClubSeasonForDate] Invalid date format',
  // Backend config warnings (expected in backendConfig tests)
  '[backendConfig]',
  '[factory]',
];

const shouldFailOnConsoleMessage = (message) => {
  const messageStr = typeof message === 'string' ? message : String(message);
  return !allowedConsolePatterns.some(pattern => messageStr.includes(pattern));
};

console.warn = (...args) => {
  originalConsoleWarn.apply(console, args);
  const message = args[0];
  if (shouldFailOnConsoleMessage(message)) {
    const testState = expect.getState();
    const testName = testState?.currentTestName || 'unknown test';
    const error = new Error(`Unexpected console.warn in test "${testName}": ${message}`);
    error.consoleArgs = args;
    throw error;
  }
};

console.error = (...args) => {
  originalConsoleError.apply(console, args);
  const message = args[0];
  if (typeof message === 'string' && message.startsWith('🚨')) {
    return;
  }
  if (shouldFailOnConsoleMessage(message)) {
    const testState = expect.getState();
    const testName = testState?.currentTestName || 'unknown test';
    const error = new Error(`Unexpected console.error in test "${testName}": ${message}`);
    error.consoleArgs = args;
    throw error;
  }
};

// Mock window.location if needed by tests
const originalLocation = typeof window !== 'undefined' ? window.location : undefined;

// Mock localStorage and sessionStorage
const localStorageMock = (() => {
  let store = {
    // Initialize with English language for tests
    'soccerAppSettings': JSON.stringify({ language: 'en' })
  };
  return {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {
        // Restore English language setting after clear
        'soccerAppSettings': JSON.stringify({ language: 'en' })
      };
    }),
    getAll: () => store,
  };
})();

// Mock window APIs safely
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(window, 'sessionStorage', {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });

  // Mock alert/confirm/prompt
  window.alert = jest.fn();
  window.confirm = jest.fn();
  window.prompt = jest.fn();
}

// Retries disabled - tests should pass reliably without retries
// If tests are flaky, fix the root cause instead of masking with retries

// Mock URL API if needed by tests
if (typeof global !== 'undefined' && global.URL) {
  global.URL.createObjectURL = jest.fn(() => 'blob:mockedurl/123');
  global.URL.revokeObjectURL = jest.fn();
}

// Restore all mocks after each test
afterEach(() => {
  jest.restoreAllMocks();
  localStorageMock.clear();

  // Clear unhandled rejection tracking for next test and recreate Set to prevent references
  unhandledRejections.clear();
  unhandledRejections = new Set();
});

// Clean up after all tests complete
afterAll(() => {
  // Restore original window.location if it was modified and restoration is safe.
  if (typeof window !== 'undefined' && originalLocation) {
    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'location');
      // Only attempt to redefine if the property is configurable (i.e., was overridden in tests)
      if (desc && desc.configurable) {
        Object.defineProperty(window, 'location', { value: originalLocation, configurable: false });
      }
      // If not configurable, leave as-is to avoid TypeError
    } catch {
      // Ignore restoration failures to avoid breaking the test run
    }
  }

  // Remove our error handlers
  if (typeof window !== 'undefined') {
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }

  if (typeof process !== 'undefined') {
    process.removeListener('unhandledRejection', handleUnhandledRejection);
  }

  // Restore original console methods
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;

  // Final cleanup of the Set
  unhandledRejections.clear();
  unhandledRejections = null;
});
