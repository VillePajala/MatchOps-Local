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
  });

  Object.defineProperty(window, 'sessionStorage', {
    value: localStorageMock,
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
  // Restore original window.location if it was modified
  if (typeof window !== 'undefined' && originalLocation) {
    try {
      Object.defineProperty(window, 'location', { 
        value: originalLocation,
        configurable: true,
        writable: true
      });
    } catch {
      // Location property might not be redefinable in some environments
      // This is not critical for test functionality
    }
  }
}); 