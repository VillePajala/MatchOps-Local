/**
 * Simplified Migration Tests
 *
 * Tests for the simplified migration system
 */

import {
  isMigrationNeeded,
  getAppDataVersion,
  setAppDataVersion,
  runMigration,
  isIndexedDbMigrationNeeded,
  getMigrationStatus
} from './migration';
import {
  CURRENT_DATA_VERSION,
  INDEXEDDB_STORAGE_VERSION
} from '@/config/migrationConfig';
import {
  APP_DATA_VERSION_KEY,
  MASTER_ROSTER_KEY
} from '@/config/storageKeys';

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });

// Mock all external dependencies
jest.mock('./localStorage', () => ({
  getLocalStorageItem: jest.fn(),
  setLocalStorageItem: jest.fn()
}));

jest.mock('./masterRosterManager', () => ({
  getMasterRoster: jest.fn().mockResolvedValue([])
}));

jest.mock('./appSettings', () => ({
  getLastHomeTeamName: jest.fn().mockResolvedValue('Test Team')
}));

jest.mock('./teams', () => ({
  addTeam: jest.fn().mockResolvedValue({ id: 'test-team-id', name: 'Test Team' }),
  setTeamRoster: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('./storageFactory', () => ({
  getStorageConfig: jest.fn(() => ({
    mode: 'localStorage',
    version: 1,
    forceMode: null,
    migrationState: 'not-started'
  })),
  createStorageAdapter: jest.fn().mockResolvedValue({
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([])
  }),
  updateStorageConfig: jest.fn()
}));

jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

import { getLocalStorageItem, setLocalStorageItem } from './localStorage';

const mockGetLocalStorageItem = getLocalStorageItem as jest.MockedFunction<typeof getLocalStorageItem>;
const mockSetLocalStorageItem = setLocalStorageItem as jest.MockedFunction<typeof setLocalStorageItem>;

describe('Simplified Migration System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('getAppDataVersion', () => {
    it('should return stored version if it exists', () => {
      mockGetLocalStorageItem.mockReturnValue('2');
      expect(getAppDataVersion()).toBe(2);
    });

    it('should return current version for fresh install with no data', () => {
      mockGetLocalStorageItem.mockReturnValue(null);
      const version = getAppDataVersion();
      expect(version).toBe(CURRENT_DATA_VERSION);
      expect(mockSetLocalStorageItem).toHaveBeenCalledWith(APP_DATA_VERSION_KEY, CURRENT_DATA_VERSION.toString());
    });

    it('should return 1 for existing installation without version', () => {
      mockGetLocalStorageItem.mockImplementation((key) => {
        if (key === APP_DATA_VERSION_KEY) return null;
        if (key === MASTER_ROSTER_KEY) return '[]'; // Has data
        return null;
      });
      expect(getAppDataVersion()).toBe(1);
    });
  });

  describe('setAppDataVersion', () => {
    it('should set the version in localStorage', () => {
      setAppDataVersion(3);
      expect(mockSetLocalStorageItem).toHaveBeenCalledWith(APP_DATA_VERSION_KEY, '3');
    });
  });

  describe('isMigrationNeeded', () => {
    it('should return true if current version is less than target', () => {
      mockGetLocalStorageItem.mockReturnValue('1');
      expect(isMigrationNeeded()).toBe(true);
    });

    it('should return false if current version equals target', () => {
      mockGetLocalStorageItem.mockReturnValue(CURRENT_DATA_VERSION.toString());
      expect(isMigrationNeeded()).toBe(false);
    });
  });

  describe('isIndexedDbMigrationNeeded', () => {
    it('should return true when conditions are met', async () => {
      const storageFactory = await import('./storageFactory');
      (storageFactory.getStorageConfig as jest.MockedFunction<typeof storageFactory.getStorageConfig>).mockReturnValue({
        mode: 'localStorage',
        version: '1',
        migrationState: 'not-started',
        forceMode: undefined
      });

      expect(isIndexedDbMigrationNeeded()).toBe(true);
    });

    it('should return false when already using IndexedDB', async () => {
      const storageFactory = await import('./storageFactory');
      (storageFactory.getStorageConfig as jest.MockedFunction<typeof storageFactory.getStorageConfig>).mockReturnValue({
        mode: 'indexedDB',
        version: INDEXEDDB_STORAGE_VERSION.toString(),
        migrationState: 'completed',
        forceMode: undefined
      });

      expect(isIndexedDbMigrationNeeded()).toBe(false);
    });
  });

  describe('runMigration', () => {
    it('should skip migration when not needed', async () => {
      mockGetLocalStorageItem.mockReturnValue(CURRENT_DATA_VERSION.toString());

      const storageFactory = await import('./storageFactory');
      (storageFactory.getStorageConfig as jest.MockedFunction<typeof storageFactory.getStorageConfig>).mockReturnValue({
        mode: 'indexedDB',
        version: INDEXEDDB_STORAGE_VERSION.toString(),
        migrationState: 'completed',
        forceMode: undefined
      });

      await runMigration();

      // Should not call any migration functions
      const teams = await import('./teams');
      expect(teams.addTeam).not.toHaveBeenCalled();
    });

    it('should perform app data migration when needed', async () => {
      mockGetLocalStorageItem.mockReturnValue('1'); // Old version

      const storageFactory = await import('./storageFactory');
      (storageFactory.getStorageConfig as jest.MockedFunction<typeof storageFactory.getStorageConfig>).mockReturnValue({
        mode: 'indexedDB',
        version: INDEXEDDB_STORAGE_VERSION.toString(),
        migrationState: 'completed',
        forceMode: undefined
      });

      await runMigration();

      const teams = await import('./teams');
      expect(teams.addTeam).toHaveBeenCalled();
      expect(teams.setTeamRoster).toHaveBeenCalled();
      expect(mockSetLocalStorageItem).toHaveBeenCalledWith(APP_DATA_VERSION_KEY, CURRENT_DATA_VERSION.toString());
    });
  });

  describe('getMigrationStatus', () => {
    it('should return correct status information', async () => {
      mockGetLocalStorageItem.mockReturnValue('1');

      // Set up the mock for this specific test
      const storageFactory = await import('./storageFactory');
      (storageFactory.getStorageConfig as jest.MockedFunction<typeof storageFactory.getStorageConfig>).mockReturnValue({
        mode: 'localStorage',
        version: '1',
        migrationState: 'not-started',
        forceMode: undefined
      });

      const status = getMigrationStatus();

      expect(status).toMatchObject({
        currentVersion: 1,
        targetVersion: CURRENT_DATA_VERSION,
        migrationNeeded: true,
        storageMode: 'localStorage'
      });
    });
  });
});