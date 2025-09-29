/**
 * Mock implementation of storage module for tests
 * Provides an in-memory storage implementation to avoid IndexedDB issues in tests
 */

// In-memory store for test data
const mockStore: Record<string, string> = {};

export const getStorageItem = jest.fn(async (key: string): Promise<string | null> => {
  return mockStore[key] || null;
});

export const setStorageItem = jest.fn(async (key: string, value: string): Promise<void> => {
  mockStore[key] = value;
});

export const removeStorageItem = jest.fn(async (key: string): Promise<void> => {
  delete mockStore[key];
});

export const getStorageJSON = jest.fn(async <T>(key: string, options?: any): Promise<T | null> => {
  const value = mockStore[key];
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
});

export const setStorageJSON = jest.fn(async (key: string, value: any): Promise<void> => {
  mockStore[key] = JSON.stringify(value);
});

export const removeStorageJSON = jest.fn(async (key: string): Promise<void> => {
  delete mockStore[key];
});

export const getStorageItems = jest.fn(async (keys: string[]): Promise<Record<string, string | null>> => {
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    result[key] = mockStore[key] || null;
  }
  return result;
});

export const setStorageItems = jest.fn(async (items: Record<string, string>): Promise<void> => {
  Object.assign(mockStore, items);
});

export const clearAdapterCache = jest.fn(() => {
  // No-op for tests
});

export const clearAdapterCacheWithCleanup = jest.fn(async () => {
  // No-op for tests
});

export const getStorageAdapter = jest.fn(async () => ({
  getItem: getStorageItem,
  setItem: setStorageItem,
  removeItem: removeStorageItem,
  clear: jest.fn(async () => {
    Object.keys(mockStore).forEach(key => delete mockStore[key]);
  }),
  getKeys: jest.fn(async () => Object.keys(mockStore)),
  getBackendName: jest.fn(() => 'mock')
}));

export const performMemoryCleanup = jest.fn(async () => {
  // No-op for tests
  return { itemsRemoved: 0, keysScanned: Object.keys(mockStore).length };
});

// Helper to clear the mock store (useful for beforeEach)
export const clearMockStore = () => {
  Object.keys(mockStore).forEach(key => delete mockStore[key]);
};

// Export the mock store for test inspection if needed
export const getMockStore = () => ({ ...mockStore });