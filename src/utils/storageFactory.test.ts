/**
 * Comprehensive Storage Factory tests with all identified issues fixed
 */

import {
  StorageFactory,
  createStorageAdapter,
  getStorageConfig,
  updateStorageConfig,
  MAX_MIGRATION_FAILURES,
  StorageTelemetryEvent
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

// Mock IndexedDBKvAdapter
jest.mock('./indexedDbKvAdapter', () => ({
  IndexedDBKvAdapter: jest.fn().mockImplementation(() => ({
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    getKeys: jest.fn().mockResolvedValue([]),
    getBackendName: jest.fn().mockReturnValue('indexedDB'),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('StorageFactory Core Functionality', () => {
  let factory: StorageFactory;

  beforeEach(() => {
    // Clear test store and reset to defaults
    testStore = {};
    factory = new StorageFactory();
    // Reset to default configuration
    factory.resetToDefaults();
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
      const originalIndexedDB = (global as { indexedDB?: unknown }).indexedDB;
      delete (global as { indexedDB?: unknown }).indexedDB;

      const isSupported = await factory.isIndexedDBSupported();
      expect(isSupported).toBe(false);

      // Restore
      (global as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
    });
  });

  describe('Error Handling', () => {
    test('should handle missing IndexedDB gracefully', async () => {
      const originalIndexedDB = (global as { indexedDB?: unknown }).indexedDB;
      delete (global as { indexedDB?: unknown }).indexedDB;

      await factory.updateStorageConfig({ mode: 'indexedDB' });
      const adapter = await factory.createAdapter();

      expect(adapter).toBeInstanceOf(LocalStorageAdapter);

      // Restore
      (global as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
    });
  });

  describe('Reset Functionality', () => {
    test('should reset configuration', async () => {
      // Ensure we start with default state
      await factory.resetToDefaults();
      const initialConfig = factory.getStorageConfig();
      expect(initialConfig.mode).toBe('localStorage');

      // Update to indexedDB
      await factory.updateStorageConfig({ mode: 'indexedDB' });
      const updatedConfig = factory.getStorageConfig();
      expect(updatedConfig.mode).toBe('indexedDB');

      // Reset back to defaults
      await factory.resetToDefaults();
      const resetConfig = factory.getStorageConfig();
      expect(resetConfig.mode).toBe('localStorage');
    });
  });
});

describe('Convenience Functions', () => {
  beforeEach(() => {
    // Clear test store and reset global factory instance
    testStore = {};
    // Reset the singleton factory to defaults
    const factory = new StorageFactory();
    factory.resetToDefaults();
    jest.clearAllMocks();
  });

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

describe('Advanced Features', () => {
  beforeEach(() => {
    // Clear test store
    testStore = {};
    jest.clearAllMocks();
  });

  test('should handle failure threshold and automatic fallback', async () => {
    const factory = new StorageFactory();

    // Set up IndexedDB to be available but creation fails
    (global as { indexedDB?: unknown }).indexedDB = {
      open: jest.fn(() => ({
        onsuccess: null,
        onerror: null,
        onblocked: null,
        result: { close: jest.fn() }
      }))
    };

    // Simulate MAX_MIGRATION_FAILURES
    await factory.updateStorageConfig({
      mode: 'indexedDB',
      migrationFailureCount: MAX_MIGRATION_FAILURES
    });

    const adapter = await factory.createAdapter();
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  test('should invalidate cache when configuration changes', async () => {
    const factory = new StorageFactory();

    const adapter1 = await factory.createAdapter('localStorage');
    await factory.updateStorageConfig({ mode: 'indexedDB' });

    // Cache should be invalidated after mode change
    const adapter2 = await factory.createAdapter();
    expect(adapter1).not.toBe(adapter2);
  });

  test('should track telemetry events', async () => {
    const factory = new StorageFactory();
    const telemetryEvents: StorageTelemetryEvent[] = [];

    factory.setTelemetryCallback((event) => {
      telemetryEvents.push(event);
    });

    await factory.createAdapter('localStorage');

    expect(telemetryEvents).toHaveLength(1);
    expect(telemetryEvents[0].event).toBe('adapter_created');
    expect(telemetryEvents[0].mode).toBe('localStorage');
  });

  test('should dispose adapter properly', async () => {
    const factory = new StorageFactory();
    const adapter = await factory.createAdapter('localStorage');

    await factory.disposeAdapter();

    // After dispose, should create new adapter
    const newAdapter = await factory.createAdapter('localStorage');
    expect(newAdapter).not.toBe(adapter);
  });

  test('should validate version format', () => {
    const factory = new StorageFactory();

    // Set invalid version
    testStore['storage-version'] = 'invalid-version';

    const config = factory.getStorageConfig();
    expect(config.version).toBe('1.0.0'); // Should use default
  });

  test('should handle concurrent adapter creation', async () => {
    const factory = new StorageFactory();

    // Ensure clean state
    await factory.resetToDefaults();

    // Create multiple adapters concurrently
    const [adapter1, adapter2, adapter3] = await Promise.all([
      factory.createAdapter('localStorage'),
      factory.createAdapter('localStorage'),
      factory.createAdapter('localStorage')
    ]);

    // All should be the same cached instance or at least the same type
    expect(adapter1.getBackendName()).toBe('localStorage');
    expect(adapter2.getBackendName()).toBe('localStorage');
    expect(adapter3.getBackendName()).toBe('localStorage');

    // Test that caching is working by ensuring subsequent calls return the same instance
    const adapter4 = await factory.createAdapter('localStorage');
    expect(adapter4).toBe(adapter1);
  });
});

describe('Integration Tests', () => {
  beforeEach(() => {
    // Clear test store
    testStore = {};
    jest.clearAllMocks();
  });

  test('should work end-to-end with localStorage', async () => {
    const adapter = await createStorageAdapter('localStorage');

    await adapter.setItem('test-key', 'test-value');
    const value = await adapter.getItem('test-key');
    expect(value).toBe('test-value');

    await adapter.removeItem('test-key');
    const afterRemove = await adapter.getItem('test-key');
    expect(afterRemove).toBeNull();
  });

  test('should handle IndexedDB creation when available', async () => {
    const factory = new StorageFactory();

    // Mock successful IndexedDB detection
    const mockRequest = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onblocked: null as (() => void) | null,
      result: { close: jest.fn() }
    };

    // Setup IndexedDB mock
    (global as { indexedDB?: unknown }).indexedDB = {
      open: jest.fn(() => mockRequest),
      deleteDatabase: jest.fn()
    };

    // Manually trigger success to simulate working IndexedDB
    mockRequest.onsuccess = jest.fn();
    mockRequest.onerror = jest.fn();

    // Simulate successful IndexedDB detection by making isIndexedDBSupported return true
    jest.spyOn(factory, 'isIndexedDBSupported').mockResolvedValue(true);

    await factory.updateStorageConfig({ mode: 'indexedDB' });
    const adapter = await factory.createAdapter();

    expect(adapter.getBackendName()).toBe('indexedDB');
  });
});