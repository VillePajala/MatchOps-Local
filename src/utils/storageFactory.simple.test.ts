/**
 * Simplified Storage Factory tests focusing on core functionality
 */

import {
  StorageFactory,
  createStorageAdapter,
  getStorageConfig,
  updateStorageConfig,
  DEFAULT_STORAGE_CONFIG,
  STORAGE_CONFIG_KEYS
} from './storageFactory';
import { LocalStorageAdapter } from './localStorageAdapter';

// Create fresh store for each test
let testStore: { [key: string]: string } = {};

// Mock localStorage utilities
jest.mock('./localStorage', () => ({
  getLocalStorageItem: jest.fn((key: string) => testStore[key] || null),
  setLocalStorageItem: jest.fn((key: string, value: string) => {
    testStore[key] = value;
  }),
  removeLocalStorageItem: jest.fn((key: string) => {
    delete testStore[key];
  }),
  clearLocalStorage: jest.fn(() => {
    testStore = {};
  }),
  getStorage: jest.fn(() => ({
    getItem: (key: string) => testStore[key] || null,
    setItem: (key: string, value: string) => { testStore[key] = value; },
    removeItem: (key: string) => { delete testStore[key]; },
    clear: () => { testStore = {}; },
    length: Object.keys(testStore).length,
    key: (index: number) => Object.keys(testStore)[index] || null
  }))
}));

// Mock logger
jest.mock('./logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

describe('StorageFactory Core Functionality', () => {
  let factory: StorageFactory;

  beforeEach(() => {
    // Clear test store
    testStore = {};
    factory = new StorageFactory();
    jest.clearAllMocks();
  });

  describe('Configuration Management', () => {
    test('should return default configuration', () => {
      const config = factory.getStorageConfig();

      expect(config.mode).toBe('localStorage');
      expect(config.version).toBe('1.0.0');
      expect(config.migrationState).toBe('not-started');
      expect(config.migrationFailureCount).toBe(0);
    });

    test('should update configuration', async () => {
      await factory.updateStorageConfig({
        mode: 'indexedDB',
        version: '2.0.0'
      });

      const config = factory.getStorageConfig();
      expect(config.mode).toBe('indexedDB');
      expect(config.version).toBe('2.0.0');
    });
  });

  describe('Adapter Creation', () => {
    test('should create localStorage adapter by default', async () => {
      const adapter = await factory.createAdapter('localStorage');

      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
      expect(adapter.getBackendName()).toBe('localStorage');
    });

    test('should detect IndexedDB support', async () => {
      // Mock IndexedDB as not available
      const originalIndexedDB = (global as any).indexedDB;
      delete (global as any).indexedDB;

      const isSupported = await factory.isIndexedDBSupported();
      expect(isSupported).toBe(false);

      // Restore
      (global as any).indexedDB = originalIndexedDB;
    });
  });

  describe('Error Handling', () => {
    test('should handle missing IndexedDB gracefully', async () => {
      const originalIndexedDB = (global as any).indexedDB;
      delete (global as any).indexedDB;

      await factory.updateStorageConfig({ mode: 'indexedDB' });
      const adapter = await factory.createAdapter();

      expect(adapter).toBeInstanceOf(LocalStorageAdapter);

      // Restore
      (global as any).indexedDB = originalIndexedDB;
    });
  });

  describe('Reset Functionality', () => {
    test('should reset configuration', async () => {
      await factory.updateStorageConfig({ mode: 'indexedDB' });
      await factory.resetToDefaults();

      const config = factory.getStorageConfig();
      expect(config.mode).toBe('localStorage');
    });
  });
});

describe('Convenience Functions', () => {
  test('should work with convenience functions', async () => {
    const adapter = await createStorageAdapter('localStorage');
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);

    const config = getStorageConfig();
    expect(config.mode).toBe('localStorage');

    await updateStorageConfig({ version: '2.0.0' });
    const updatedConfig = getStorageConfig();
    expect(updatedConfig.version).toBe('2.0.0');
  });
});

describe('Integration Tests', () => {
  test('should work end-to-end with localStorage', async () => {
    const adapter = await createStorageAdapter('localStorage');

    await adapter.setItem('test-key', 'test-value');
    const value = await adapter.getItem('test-key');
    expect(value).toBe('test-value');

    await adapter.removeItem('test-key');
    const afterRemove = await adapter.getItem('test-key');
    expect(afterRemove).toBeNull();
  });
});