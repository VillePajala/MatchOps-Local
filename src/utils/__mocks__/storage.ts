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

export const getStorageJSON = jest.fn(async <T>(key: string): Promise<T | null> => {
  const value = mockStore[key];
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
});

export const setStorageJSON = jest.fn(async <T>(key: string, value: T): Promise<void> => {
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

// Helper to clear the mock store AND reset all Jest mocks (useful for beforeEach)
export const clearMockStore = () => {
  // Clear the in-memory store
  Object.keys(mockStore).forEach(key => delete mockStore[key]);

  // Reset all mock implementations and call history
  (getStorageItem as jest.MockedFunction<typeof getStorageItem>).mockReset().mockImplementation(async (key: string) => mockStore[key] || null);
  (setStorageItem as jest.MockedFunction<typeof setStorageItem>).mockReset().mockImplementation(async (key: string, value: string) => { mockStore[key] = value; });
  (removeStorageItem as jest.MockedFunction<typeof removeStorageItem>).mockReset().mockImplementation(async (key: string) => { delete mockStore[key]; });
  (getStorageJSON as jest.MockedFunction<typeof getStorageJSON>).mockReset().mockImplementation(async <T>(key: string) => {
    const value = mockStore[key];
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  });
  (setStorageJSON as jest.MockedFunction<typeof setStorageJSON>).mockReset().mockImplementation(async <T>(key: string, value: T) => { mockStore[key] = JSON.stringify(value); });

  // Also reset other mocks
  (removeStorageJSON as jest.MockedFunction<typeof removeStorageJSON>).mockReset().mockImplementation(async (key: string) => { delete mockStore[key]; });
  (getStorageItems as jest.MockedFunction<typeof getStorageItems>).mockReset().mockImplementation(async (keys: string[]) => {
    const result: Record<string, string | null> = {};
    for (const key of keys) {
      result[key] = mockStore[key] || null;
    }
    return result;
  });
  (setStorageItems as jest.MockedFunction<typeof setStorageItems>).mockReset().mockImplementation(async (items: Record<string, string>) => {
    Object.assign(mockStore, items);
  });
};

// Export the mock store for test inspection if needed
export const getMockStore = () => ({ ...mockStore });