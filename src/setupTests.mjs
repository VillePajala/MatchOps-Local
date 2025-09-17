import '@testing-library/jest-dom';
import 'jest-canvas-mock';

// Mock window.location if needed by tests
const originalLocation = typeof window !== 'undefined' ? window.location : undefined;

// Mock localStorage and sessionStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
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
}); 
