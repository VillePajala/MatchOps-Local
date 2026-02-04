import {
  LAST_HOME_TEAM_NAME_KEY,
  INSTALL_PROMPT_DISMISSED_KEY,
} from '@/config/storageKeys';
import type { AppSettings } from './appSettings';
import type { DataStore } from '@/interfaces/DataStore';
import { ValidationError } from '@/interfaces/DataStoreErrors';

// Default settings matching the implementation
const DEFAULT_APP_SETTINGS: AppSettings = {
  currentGameId: null,
  lastHomeTeamName: '',
  language: 'fi',
  hasSeenAppGuide: false,
  useDemandCorrection: false,
  hasConfiguredSeasonDates: false,
  clubSeasonStartDate: '2000-11-15',
  clubSeasonEndDate: '2000-10-20',
};

// Create mock store for settings
let mockSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };

// Create mock store for key-based storage (install prompt, first game guide, etc.)
const mockKeyStore: Record<string, string> = {};

// Helper to clear mock stores
const clearMockStore = () => {
  mockSettings = { ...DEFAULT_APP_SETTINGS };
  Object.keys(mockKeyStore).forEach(key => delete mockKeyStore[key]);
};

// Create mock DataStore
const mockDataStore: jest.Mocked<Pick<DataStore, 'getSettings' | 'saveSettings' | 'updateSettings'>> = {
  getSettings: jest.fn(async () => ({ ...mockSettings })),
  saveSettings: jest.fn(async (settings: AppSettings) => { mockSettings = { ...settings }; }),
  updateSettings: jest.fn(async (updates: Partial<AppSettings>) => {
    // Match real LocalDataStore behavior: throw for empty updates
    if (Object.keys(updates).length === 0) {
      throw new ValidationError('Cannot update with empty object', 'updates', updates);
    }
    mockSettings = { ...mockSettings, ...updates };
    return mockSettings;
  }),
};

// Create mock functions for storage (still used by install prompt, first game guide, etc.)
const mockGetStorageItem = jest.fn(async (key: string) => mockKeyStore[key] || null);
const mockSetStorageItem = jest.fn(async (key: string, value: string) => { mockKeyStore[key] = value; });
const mockRemoveStorageItem = jest.fn(async (key: string) => { delete mockKeyStore[key]; });
const mockClearStorage = jest.fn(async () => { Object.keys(mockKeyStore).forEach(key => delete mockKeyStore[key]); });
const mockClearLocalStorage = jest.fn();

// Mock getDataStore - controllable for error injection tests
const mockGetDataStore = jest.fn(() => Promise.resolve(mockDataStore));

// Reset module cache and set up mocks BEFORE loading appSettings
jest.resetModules();

jest.doMock('@/datastore', () => ({
  __esModule: true,
  getDataStore: mockGetDataStore,
}));

jest.doMock('./storage', () => ({
  __esModule: true,
  getStorageItem: mockGetStorageItem,
  setStorageItem: mockSetStorageItem,
  removeStorageItem: mockRemoveStorageItem,
  clearStorage: mockClearStorage,
  getStorageJSON: jest.fn(async (key: string) => {
    const value = mockKeyStore[key];
    return value ? JSON.parse(value) : null;
  }),
  setStorageJSON: jest.fn(async (key: string, value: unknown) => {
    mockKeyStore[key] = JSON.stringify(value);
  }),
  getStorageAdapter: jest.fn(async () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getKeys: jest.fn(async () => Object.keys(mockKeyStore)),
    getBackendName: jest.fn(() => 'mock')
  })),
  clearAdapterCache: jest.fn(),
  clearAdapterCacheWithCleanup: jest.fn(async () => {}),
  performMemoryCleanup: jest.fn(async () => ({ itemsRemoved: 0, keysScanned: 0 })),
}));

jest.doMock('./storageConfigManager', () => ({
  __esModule: true,
  storageConfigManager: {
    getStorageConfig: jest.fn(async () => ({
      mode: 'localStorage',
      version: '1.0.0',
      migrationState: 'not-started',
      migrationFailureCount: 0
    })),
    resetToDefaults: jest.fn(async () => {}),
  },
}));

jest.doMock('./localStorage', () => ({
  __esModule: true,
  clearLocalStorage: mockClearLocalStorage,
}));

// Require appSettings AFTER doMock setup (not import, to avoid hoisting)
const appSettingsModule = require('./appSettings');
const {
  getAppSettings,
  saveAppSettings,
  updateAppSettings,
  getCurrentGameIdSetting,
  saveCurrentGameIdSetting,
  getLastHomeTeamName,
  saveLastHomeTeamName,
  resetAppSettings,
  getInstallPromptDismissedTime,
  setInstallPromptDismissed,
} = appSettingsModule;

// Setup mock implementations - refresh after each test
const setupMockImplementations = () => {
  mockDataStore.getSettings.mockImplementation(async () => ({ ...mockSettings }));
  mockDataStore.saveSettings.mockImplementation(async (settings: AppSettings) => { mockSettings = { ...settings }; });
  mockDataStore.updateSettings.mockImplementation(async (updates: Partial<AppSettings>) => {
    // Match real LocalDataStore behavior: throw for empty updates
    if (Object.keys(updates).length === 0) {
      throw new ValidationError('Cannot update with empty object', 'updates', updates);
    }
    mockSettings = { ...mockSettings, ...updates };
    return mockSettings;
  });
  mockGetStorageItem.mockImplementation(async (key: string) => mockKeyStore[key] || null);
  mockSetStorageItem.mockImplementation(async (key: string, value: string) => { mockKeyStore[key] = value; });
  mockRemoveStorageItem.mockImplementation(async (key: string) => { delete mockKeyStore[key]; });
  mockClearStorage.mockImplementation(async () => { Object.keys(mockKeyStore).forEach(key => delete mockKeyStore[key]); });
};

describe('App Settings Utilities', () => {

  // Reset mocks before each test
  beforeEach(() => {
    // Clear the mock store data
    clearMockStore();

    // Clear call history but keep implementations (mockClear, not mockReset!)
    mockDataStore.getSettings.mockClear();
    mockDataStore.saveSettings.mockClear();
    mockDataStore.updateSettings.mockClear();
    mockGetDataStore.mockClear();
    mockGetStorageItem.mockClear();
    mockSetStorageItem.mockClear();
    mockRemoveStorageItem.mockClear();
    mockClearStorage.mockClear();
    mockClearLocalStorage.mockClear();

    // Re-establish mock implementations for this test
    setupMockImplementations();
    mockGetDataStore.mockImplementation(() => Promise.resolve(mockDataStore));
    mockClearLocalStorage.mockImplementation(() => {});
  });

  describe('getAppSettings', () => {
    it('should return default settings if DataStore returns defaults', async () => {
      // mockSettings is already set to defaults by clearMockStore()

      const result = await getAppSettings();

      expect(mockDataStore.getSettings).toHaveBeenCalled();
      expect(result).toEqual({
        currentGameId: null,
        lastHomeTeamName: '',
        language: 'fi',
        hasSeenAppGuide: false,
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: '2000-11-15',
        clubSeasonEndDate: '2000-10-20'
      });
    });

    it('should return settings from DataStore when they exist', async () => {
      mockSettings = {
        ...DEFAULT_APP_SETTINGS,
        currentGameId: 'game123',
        lastHomeTeamName: 'Team X',
      };

      const result = await getAppSettings();

      expect(mockDataStore.getSettings).toHaveBeenCalled();
      expect(result).toEqual({
        currentGameId: 'game123',
        lastHomeTeamName: 'Team X',
        language: 'fi',
        hasSeenAppGuide: false,
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: '2000-11-15',
        clubSeasonEndDate: '2000-10-20'
      });
    });

    it('should return default settings if DataStore throws an error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('DataStore error');
      mockDataStore.getSettings.mockRejectedValueOnce(error);

      const result = await getAppSettings();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting app settings'), error);
      expect(result).toEqual({
        currentGameId: null,
        lastHomeTeamName: '',
        language: 'fi',
        hasSeenAppGuide: false,
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: '2000-11-15',
        clubSeasonEndDate: '2000-10-20'
      });
      consoleSpy.mockRestore();
    });
  });

  describe('saveAppSettings', () => {
    it('should save settings via DataStore and return true on success', async () => {
      const settings: AppSettings = {
        currentGameId: 'game456',
        lastHomeTeamName: 'Team Y',
        language: 'fi'
      };

      const result = await saveAppSettings(settings);

      expect(mockDataStore.saveSettings).toHaveBeenCalledWith(settings);
      expect(result).toBe(true);
    });

    it('should return false if DataStore throws an error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Storage quota exceeded');
      mockDataStore.saveSettings.mockRejectedValueOnce(error);

      const settings: AppSettings = { currentGameId: 'game123' };
      const result = await saveAppSettings(settings);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error saving app settings'), error);
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('updateAppSettings', () => {
    it('should update only specified settings and return updated settings', async () => {
      mockSettings = {
        ...DEFAULT_APP_SETTINGS,
        currentGameId: 'game123',
        lastHomeTeamName: 'Team A',
        hasSeenAppGuide: false,
      };

      const result = await updateAppSettings({ currentGameId: 'game456' });

      expect(result).toEqual({
        currentGameId: 'game456', // Updated
        lastHomeTeamName: 'Team A', // Preserved
        language: 'fi', // Preserved
        hasSeenAppGuide: false,
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: '2000-11-15',
        clubSeasonEndDate: '2000-10-20'
      });

      // Check that updateSettings was called with the partial update
      expect(mockDataStore.updateSettings).toHaveBeenCalledWith({ currentGameId: 'game456' });
    });

    it('should update the language setting', async () => {
      mockSettings = {
        ...DEFAULT_APP_SETTINGS,
        currentGameId: 'game123',
        lastHomeTeamName: 'Team A',
        hasSeenAppGuide: false,
      };

      const result = await updateAppSettings({ language: 'en' });

      expect(result).toEqual({
        ...mockSettings,
        language: 'en',
      });

      // Verify updateSettings was called with the partial update
      expect(mockDataStore.updateSettings).toHaveBeenCalledWith({ language: 'en' });
    });

    it('should return current settings on error (graceful degradation)', async () => {
      // Suppress expected console.error from logger
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockSettings = {
        ...DEFAULT_APP_SETTINGS,
        currentGameId: 'initialGame',
        lastHomeTeamName: 'InitialTeam',
        language: 'en'
      };
      // Simulate updateSettings failing
      mockDataStore.updateSettings.mockRejectedValueOnce(new Error('Save failed'));

      // Should return current settings instead of throwing (no-op on error)
      const result = await updateAppSettings({ currentGameId: 'updatedGame' });

      // Should return the current (unchanged) settings
      expect(result.currentGameId).toBe('initialGame');
      expect(result.lastHomeTeamName).toBe('InitialTeam');

      // Ensure updateSettings was called (attempted to update)
      expect(mockDataStore.updateSettings).toHaveBeenCalledTimes(1);

      // Error should be logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error updating app settings'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle concurrent updates correctly', async () => {
      // Start with clean settings
      mockSettings = { ...DEFAULT_APP_SETTINGS };

      // Simulate atomic behavior: each update reads current state and merges
      // The mock already does this correctly via the implementation in setupMockImplementations
      const [_result1, _result2] = await Promise.all([
        updateAppSettings({ currentGameId: 'game1' }),
        updateAppSettings({ lastHomeTeamName: 'Team A' })
      ]);

      // Both updates should have been called
      expect(mockDataStore.updateSettings).toHaveBeenCalledTimes(2);
      expect(mockDataStore.updateSettings).toHaveBeenCalledWith({ currentGameId: 'game1' });
      expect(mockDataStore.updateSettings).toHaveBeenCalledWith({ lastHomeTeamName: 'Team A' });

      // Final state should contain both updates (lock serializes them)
      const final = await getAppSettings();
      expect(final.currentGameId).toBe('game1');
      expect(final.lastHomeTeamName).toBe('Team A');
    });

    it('should throw ValidationError when called with empty object', async () => {
      mockSettings = {
        ...DEFAULT_APP_SETTINGS,
        currentGameId: 'existingGame',
        lastHomeTeamName: 'Existing Team',
      };

      // Empty updates should throw ValidationError (fail-fast for programming errors)
      await expect(updateAppSettings({})).rejects.toThrow(ValidationError);
      await expect(updateAppSettings({})).rejects.toThrow('Cannot update with empty object');
    });
  });

  describe('getCurrentGameIdSetting', () => {
    it('should return the current game ID', async () => {
      mockSettings = { ...DEFAULT_APP_SETTINGS, currentGameId: 'game789' };

      const result = await getCurrentGameIdSetting();

      expect(result).toBe('game789');
      expect(mockDataStore.getSettings).toHaveBeenCalled();
    });

    it('should return null if no current game ID is set', async () => {
      mockSettings = { ...DEFAULT_APP_SETTINGS, currentGameId: null };

      const result = await getCurrentGameIdSetting();

      expect(result).toBeNull();
    });
  });

  describe('saveCurrentGameIdSetting', () => {
    it('should update only the current game ID setting and return true', async () => {
      mockSettings = {
        ...DEFAULT_APP_SETTINGS,
        currentGameId: 'oldGameId',
        lastHomeTeamName: 'Team B',
        hasSeenAppGuide: false,
      };

      const result = await saveCurrentGameIdSetting('newGameId');

      // Verify updateSettings was called with the game ID update
      expect(mockDataStore.updateSettings).toHaveBeenCalledWith({ currentGameId: 'newGameId' });
      expect(result).toBe(true);
    });

    it('should return false if saving fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockSettings = { ...DEFAULT_APP_SETTINGS, currentGameId: 'old' };
      // Simulate error during updateSettings call
      mockDataStore.updateSettings.mockRejectedValueOnce(new Error('Cannot save'));

      const result = await saveCurrentGameIdSetting('newGameId');
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('getLastHomeTeamName', () => {
    it('should return last home team name from app settings', async () => {
      mockSettings = { ...DEFAULT_APP_SETTINGS, lastHomeTeamName: 'Dragons' };

      const result = await getLastHomeTeamName();

      expect(result).toBe('Dragons');
      expect(mockDataStore.getSettings).toHaveBeenCalled();
    });

    it('should fall back to legacy storage if not in app settings', async () => {
      mockSettings = { ...DEFAULT_APP_SETTINGS, lastHomeTeamName: '' };
      mockKeyStore[LAST_HOME_TEAM_NAME_KEY] = 'Tigers';

      const result = await getLastHomeTeamName();

      expect(result).toBe('Tigers');
      expect(mockDataStore.getSettings).toHaveBeenCalled();
      expect(mockGetStorageItem).toHaveBeenCalledWith(LAST_HOME_TEAM_NAME_KEY);
    });

    it('should return empty string if no value is found', async () => {
      mockSettings = { ...DEFAULT_APP_SETTINGS, lastHomeTeamName: '' };
      // mockKeyStore is empty by default

      const result = await getLastHomeTeamName();

      expect(result).toBe('');
    });
  });

  describe('saveLastHomeTeamName', () => {
    it('should save to app settings and return true', async () => {
      mockSettings = {
        ...DEFAULT_APP_SETTINGS,
        currentGameId: 'game123',
        lastHomeTeamName: 'Old Team Name',
        hasSeenAppGuide: false,
      };

      const result = await saveLastHomeTeamName('New Team Name');

      // Check updateSettings was called with the team name update
      expect(mockDataStore.updateSettings).toHaveBeenCalledWith({ lastHomeTeamName: 'New Team Name' });
      expect(result).toBe(true);
    });

    it('should return false if saving to app settings fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockSettings = { ...DEFAULT_APP_SETTINGS, currentGameId: 'game123' };
      // Simulate updateSettings failing
      mockDataStore.updateSettings.mockRejectedValueOnce(new Error('Cannot save app settings'));

      const result = await saveLastHomeTeamName('New Team Name');
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('resetAppSettings', () => {
    it('should clear all storage including localStorage and return true', async () => {
      // Mock clearStorage to simulate successful clear
      mockClearStorage.mockImplementation(async () => {});

      const result = await resetAppSettings();

      // Should call removeStorageItem for all known keys
      expect(mockRemoveStorageItem).toHaveBeenCalled();

      // Should call clearStorage to ensure IndexedDB is cleared
      expect(mockClearStorage).toHaveBeenCalled();

      // CRITICAL: Should call clearLocalStorage to prevent migration from restoring old data
      expect(mockClearLocalStorage).toHaveBeenCalled();

      expect(result).toBe(true);
    });

    it('should return false if clearing storage fails', async () => {
      mockClearStorage.mockImplementation(() => {
        throw new Error('Cannot clear storage');
      });

      const result = await resetAppSettings();
      expect(result).toBe(false);
    });
  });

  // Note: Legacy month-to-date migration tests removed - now tested in LocalDataStore.test.ts

  describe('getInstallPromptDismissedTime', () => {
    it('should return null when nothing is stored', async () => {
      mockGetStorageItem.mockResolvedValue(null);

      const result = await getInstallPromptDismissedTime();

      expect(mockGetStorageItem).toHaveBeenCalledWith(INSTALL_PROMPT_DISMISSED_KEY);
      expect(result).toBeNull();
    });

    it('should return timestamp when install prompt was dismissed', async () => {
      const timestamp = 1702900000000;
      mockGetStorageItem.mockResolvedValue(timestamp.toString());

      const result = await getInstallPromptDismissedTime();

      expect(result).toBe(timestamp);
    });

    it('should return null for invalid stored value', async () => {
      mockGetStorageItem.mockResolvedValue('not-a-number');

      const result = await getInstallPromptDismissedTime();

      expect(result).toBeNull();
    });

    it('should return null on storage errors', async () => {
      mockGetStorageItem.mockRejectedValue(new Error('Storage error'));

      const result = await getInstallPromptDismissedTime();

      expect(result).toBeNull();
    });
  });

  describe('setInstallPromptDismissed', () => {
    it('should save current timestamp to storage', async () => {
      const beforeTime = Date.now();

      await setInstallPromptDismissed();

      expect(mockSetStorageItem).toHaveBeenCalledWith(
        INSTALL_PROMPT_DISMISSED_KEY,
        expect.any(String)
      );

      const savedTimestamp = parseInt(mockSetStorageItem.mock.calls[0][1], 10);
      expect(savedTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(savedTimestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should not throw on storage errors', async () => {
      mockSetStorageItem.mockRejectedValue(new Error('Storage error'));

      await expect(setInstallPromptDismissed()).resolves.toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    describe('DataStore initialization failure', () => {
      it('should return default settings when getDataStore throws', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockGetDataStore.mockRejectedValueOnce(new Error('DataStore initialization failed'));

        const result = await getAppSettings();

        expect(result).toEqual(DEFAULT_APP_SETTINGS);
        consoleSpy.mockRestore();
      });

      it('should return false when saveAppSettings cannot get DataStore', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockGetDataStore.mockRejectedValueOnce(new Error('DataStore unavailable'));

        const result = await saveAppSettings({ currentGameId: 'test' });

        expect(result).toBe(false);
        consoleSpy.mockRestore();
      });

      it('should return default settings when updateAppSettings cannot get DataStore', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockGetDataStore.mockRejectedValueOnce(new Error('DataStore unavailable'));

        const result = await updateAppSettings({ currentGameId: 'test' });

        // Falls back to getAppSettings which also fails, returning defaults
        expect(result).toEqual(DEFAULT_APP_SETTINGS);
        consoleSpy.mockRestore();
      });

      it('should return false when saveCurrentGameIdSetting cannot get DataStore', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockGetDataStore.mockRejectedValueOnce(new Error('DataStore unavailable'));

        const result = await saveCurrentGameIdSetting('game123');

        expect(result).toBe(false);
        warnSpy.mockRestore();
        consoleSpy.mockRestore();
      });
    });

    describe('Malformed settings data', () => {
      it('should handle empty settings object from DataStore', async () => {
        mockDataStore.getSettings.mockResolvedValueOnce({} as AppSettings);

        const result = await getAppSettings();

        // Should return whatever DataStore returns (DataStore handles defaults)
        expect(result).toEqual({});
      });

      it('should handle null values in settings gracefully', async () => {
        mockSettings = {
          ...DEFAULT_APP_SETTINGS,
          currentGameId: null,
          lastHomeTeamName: undefined as unknown as string,
        };

        const result = await getAppSettings();

        expect(result.currentGameId).toBeNull();
        expect(result.lastHomeTeamName).toBeUndefined();
      });

      it('should preserve partial updates even with unusual values', async () => {
        mockSettings = { ...DEFAULT_APP_SETTINGS };

        // Update with empty string (valid but edge case)
        await updateAppSettings({ lastHomeTeamName: '' });

        expect(mockDataStore.updateSettings).toHaveBeenCalledWith({ lastHomeTeamName: '' });
        expect(mockSettings.lastHomeTeamName).toBe('');
      });
    });
  });
}); 
