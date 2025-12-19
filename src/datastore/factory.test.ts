/**
 * DataStore & AuthService Factory Tests
 */

import {
  getDataStore,
  getAuthService,
  resetFactory,
  isDataStoreInitialized,
  isAuthServiceInitialized,
} from './factory';
import { LocalDataStore } from './LocalDataStore';
import { LocalAuthService } from '@/auth/LocalAuthService';

// Mock storage layer
jest.mock('@/utils/storage', () => ({
  getStorageItem: jest.fn(),
  setStorageItem: jest.fn(),
  removeStorageItem: jest.fn(),
  getStorageJSON: jest.fn(),
  setStorageJSON: jest.fn(),
  isIndexedDBAvailable: jest.fn(() => true),
  clearAdapterCacheWithCleanup: jest.fn(),
}));

// Mock lock managers
jest.mock('@/utils/storageKeyLock', () => ({
  withKeyLock: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock('@/utils/lockManager', () => ({
  withRosterLock: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('Factory', () => {
  afterEach(async () => {
    await resetFactory();
  });

  // ==========================================================================
  // DATASTORE FACTORY TESTS
  // ==========================================================================
  describe('getDataStore', () => {
    it('should return a LocalDataStore instance', async () => {
      const dataStore = await getDataStore();
      expect(dataStore).toBeInstanceOf(LocalDataStore);
    });

    it('should return the same instance on subsequent calls (singleton)', async () => {
      const dataStore1 = await getDataStore();
      const dataStore2 = await getDataStore();
      expect(dataStore1).toBe(dataStore2);
    });

    it('should initialize the DataStore', async () => {
      const dataStore = await getDataStore();
      expect(dataStore.getBackendName()).toBe('local');
    });

    it('should report initialized state correctly', async () => {
      expect(isDataStoreInitialized()).toBe(false);
      await getDataStore();
      expect(isDataStoreInitialized()).toBe(true);
    });
  });

  // ==========================================================================
  // AUTHSERVICE FACTORY TESTS
  // ==========================================================================
  describe('getAuthService', () => {
    it('should return a LocalAuthService instance', async () => {
      const authService = await getAuthService();
      expect(authService).toBeInstanceOf(LocalAuthService);
    });

    it('should return the same instance on subsequent calls (singleton)', async () => {
      const authService1 = await getAuthService();
      const authService2 = await getAuthService();
      expect(authService1).toBe(authService2);
    });

    it('should initialize the AuthService', async () => {
      const authService = await getAuthService();
      expect(authService.getMode()).toBe('local');
    });

    it('should report initialized state correctly', async () => {
      expect(isAuthServiceInitialized()).toBe(false);
      await getAuthService();
      expect(isAuthServiceInitialized()).toBe(true);
    });
  });

  // ==========================================================================
  // RESET FACTORY TESTS
  // ==========================================================================
  describe('resetFactory', () => {
    it('should reset DataStore instance', async () => {
      const dataStore1 = await getDataStore();
      await resetFactory();
      const dataStore2 = await getDataStore();
      expect(dataStore1).not.toBe(dataStore2);
    });

    it('should reset AuthService instance', async () => {
      const authService1 = await getAuthService();
      await resetFactory();
      const authService2 = await getAuthService();
      expect(authService1).not.toBe(authService2);
    });

    it('should reset initialized state', async () => {
      await getDataStore();
      await getAuthService();
      expect(isDataStoreInitialized()).toBe(true);
      expect(isAuthServiceInitialized()).toBe(true);

      await resetFactory();

      expect(isDataStoreInitialized()).toBe(false);
      expect(isAuthServiceInitialized()).toBe(false);
    });

    it('should not throw when called without initialization', async () => {
      await expect(resetFactory()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // CONCURRENT ACCESS TESTS
  // ==========================================================================
  describe('Concurrent Access', () => {
    it('should handle concurrent getDataStore calls', async () => {
      const [ds1, ds2, ds3] = await Promise.all([
        getDataStore(),
        getDataStore(),
        getDataStore(),
      ]);

      expect(ds1).toBe(ds2);
      expect(ds2).toBe(ds3);
    });

    it('should handle concurrent getAuthService calls', async () => {
      const [as1, as2, as3] = await Promise.all([
        getAuthService(),
        getAuthService(),
        getAuthService(),
      ]);

      expect(as1).toBe(as2);
      expect(as2).toBe(as3);
    });
  });
});
