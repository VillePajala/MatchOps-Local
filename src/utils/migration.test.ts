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
  MASTER_ROSTER_KEY,
  SAVED_GAMES_KEY
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
  getStorageConfig: jest.fn(async () => ({
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
  updateStorageConfig: jest.fn().mockResolvedValue(undefined)
}));

// Mock storageBootstrap (sentinel reads/writes for the IndexedDB migration guards)
const mockBootstrapGetItem = jest.fn().mockResolvedValue(null);
const mockBootstrapSetItem = jest.fn().mockResolvedValue(undefined);
jest.mock('./storageBootstrap', () => ({
  bootstrapGetItem: (...args: unknown[]) => mockBootstrapGetItem(...args),
  bootstrapSetItem: (...args: unknown[]) => mockBootstrapSetItem(...args),
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
      (storageFactory.getStorageConfig as jest.Mock).mockResolvedValue({
        mode: 'localStorage',
        version: 1,
        forceMode: null
      });

      expect(await isIndexedDbMigrationNeeded()).toBe(true);
    });

    it('should return false when already using IndexedDB', async () => {
      const storageFactory = await import('./storageFactory');
      (storageFactory.getStorageConfig as jest.Mock).mockResolvedValue({
        mode: 'indexedDB',
        version: INDEXEDDB_STORAGE_VERSION,
        forceMode: null
      });

      expect(await isIndexedDbMigrationNeeded()).toBe(false);
    });
  });

  describe('runMigration', () => {
    it('should skip migration when not needed', async () => {
      mockGetLocalStorageItem.mockReturnValue(CURRENT_DATA_VERSION.toString());

      const storageFactory = await import('./storageFactory');
      (storageFactory.getStorageConfig as jest.Mock).mockResolvedValue({
        mode: 'indexedDB',
        version: INDEXEDDB_STORAGE_VERSION,
        forceMode: null
      });

      await runMigration();

      // Should not call any migration functions
      const teams = await import('./teams');
      expect(teams.addTeam).not.toHaveBeenCalled();
    });

    it('should perform app data migration when needed', async () => {
      mockGetLocalStorageItem.mockReturnValue('1'); // Old version

      const storageFactory = await import('./storageFactory');
      (storageFactory.getStorageConfig as jest.Mock).mockResolvedValue({
        mode: 'indexedDB',
        version: INDEXEDDB_STORAGE_VERSION,
        forceMode: null
      });

      await runMigration();

      const teams = await import('./teams');
      expect(teams.addTeam).toHaveBeenCalled();
      expect(teams.setTeamRoster).toHaveBeenCalled();
      expect(mockSetLocalStorageItem).toHaveBeenCalledWith(APP_DATA_VERSION_KEY, CURRENT_DATA_VERSION.toString());
    });
  });

  describe('IndexedDB migration guards (stale-snapshot protection)', () => {
    const indexedDbMigrationConfig = {
      mode: 'localStorage',
      version: 1,
      forceMode: null,
      migrationState: 'not-started'
    };

    /** Fresh adapter mock per test so getItem/setItem call counts are isolated */
    const installAdapter = async (existing: Record<string, string> = {}) => {
      const adapter = {
        getItem: jest.fn(async (key: string) => existing[key] ?? null),
        setItem: jest.fn().mockResolvedValue(undefined),
        getAllKeys: jest.fn().mockResolvedValue([]),
      };
      const storageFactory = await import('./storageFactory');
      (storageFactory.createStorageAdapter as jest.Mock).mockResolvedValue(adapter);
      (storageFactory.getStorageConfig as jest.Mock).mockResolvedValue(indexedDbMigrationConfig);
      return adapter;
    };

    beforeEach(() => {
      // App-data migration not needed; only the IndexedDB path runs
      mockGetLocalStorageItem.mockReturnValue(CURRENT_DATA_VERSION.toString());
    });

    /**
     * A present sentinel proves the migration already ran: never copy again,
     * only repair the (defaulted) config.
     * @critical
     */
    it('skips the copy and repairs config when the sentinel is present', async () => {
      const adapter = await installAdapter();
      mockBootstrapGetItem.mockResolvedValue('2026-01-01T00:00:00.000Z');

      await runMigration();

      expect(adapter.setItem).not.toHaveBeenCalled();
      const storageFactory = await import('./storageFactory');
      expect(storageFactory.updateStorageConfig).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'indexedDB', migrationState: 'completed' })
      );
    });

    /**
     * Live app data in IndexedDB must never be overwritten by the stale
     * localStorage snapshot, even when sentinel and config are both missing.
     * @critical
     */
    it('skips the copy when IndexedDB already holds app data', async () => {
      const adapter = await installAdapter({ [SAVED_GAMES_KEY]: '{"game_1":{}}' });
      mockBootstrapGetItem.mockResolvedValue(null);

      await runMigration();

      expect(adapter.setItem).not.toHaveBeenCalled();
      // Sentinel written so future boots short-circuit at guard 1
      expect(mockBootstrapSetItem).toHaveBeenCalledWith(
        'migration_indexeddb_completed',
        expect.any(String)
      );
      const storageFactory = await import('./storageFactory');
      expect(storageFactory.updateStorageConfig).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'indexedDB', migrationState: 'completed' })
      );
    });

    /**
     * If the sentinel cannot be read (storage infrastructure failing), the
     * migration must abort: completion cannot be ruled out, and copying could
     * overwrite live data.
     * @critical
     */
    it('aborts without copying when the sentinel read fails', async () => {
      const adapter = await installAdapter();
      mockBootstrapGetItem.mockRejectedValue(new Error('Transient IndexedDB failure'));

      await runMigration(); // must not throw - app continues

      expect(adapter.setItem).not.toHaveBeenCalled();
      const storageFactory = await import('./storageFactory');
      // The failure handler may record migrationState 'failed', but completion
      // must never be recorded when the sentinel could not be read
      expect(storageFactory.updateStorageConfig).not.toHaveBeenCalledWith(
        expect.objectContaining({ migrationState: 'completed' })
      );
      expect(mockBootstrapSetItem).not.toHaveBeenCalled();
    });

    it('writes the sentinel after a successful first migration', async () => {
      const adapter = await installAdapter(); // empty target
      mockBootstrapGetItem.mockResolvedValue(null);
      mockLocalStorage.getItem.mockReturnValue('legacy-value'); // every key copies

      await runMigration();

      expect(adapter.setItem).toHaveBeenCalled();
      expect(mockBootstrapSetItem).toHaveBeenCalledWith(
        'migration_indexeddb_completed',
        expect.any(String)
      );
      const storageFactory = await import('./storageFactory');
      expect(storageFactory.updateStorageConfig).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'indexedDB', migrationState: 'completed' })
      );
    });
  });

  describe('getMigrationStatus', () => {
    it('should return correct status information', async () => {
      mockGetLocalStorageItem.mockReturnValue('1');

      // Set up the mock for this specific test
      const storageFactory = await import('./storageFactory');
      (storageFactory.getStorageConfig as jest.Mock).mockResolvedValue({
        mode: 'localStorage',
        version: 1,
        forceMode: null,
        migrationState: 'not-started'
      });

      const status = await getMigrationStatus();

      expect(status).toMatchObject({
        currentVersion: 1,
        targetVersion: CURRENT_DATA_VERSION,
        migrationNeeded: true,
        storageMode: 'localStorage'
      });
    });
  });
});