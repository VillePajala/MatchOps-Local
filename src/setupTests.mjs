import '@testing-library/jest-dom';
import 'jest-canvas-mock';

// Initialize i18n for tests with English language
import i18n from './i18n.ts';
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

// Track unhandled promise rejections to prevent silent failures
const unhandledRejections = new Set();

// Import enhanced error detection
const { shouldFailTest, reportError, createTestFailureError } = require('../tests/utils/error-detection.js');

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

// Mock URL API if needed by tests
if (typeof global !== 'undefined' && global.URL) {
  global.URL.createObjectURL = jest.fn(() => 'blob:mockedurl/123');
  global.URL.revokeObjectURL = jest.fn();
}

// Restore all mocks after each test
afterEach(() => {
  jest.restoreAllMocks();
  localStorageMock.clear();

  // Clear unhandled rejection tracking for next test
  unhandledRejections.clear();
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
});