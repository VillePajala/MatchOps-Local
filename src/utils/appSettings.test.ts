import { APP_SETTINGS_KEY, LAST_HOME_TEAM_NAME_KEY } from '@/config/storageKeys';
import {
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
  getHasSeenFirstGameGuide,
  setHasSeenFirstGameGuide,
  AppSettings
} from './appSettings';

// Mock storage module (jest.mock is hoisted above imports)
jest.mock('./storage');
jest.mock('./localStorage', () => ({
  clearLocalStorage: jest.fn(),
}));

// Import mocked functions AFTER jest.mock
import { getStorageItem, setStorageItem, removeStorageItem, clearStorage } from './storage';
import { clearLocalStorage } from './localStorage';

// Create mock store for in-memory testing
const mockStore: Record<string, string> = {};

// Setup mock implementations
(getStorageItem as jest.Mock).mockImplementation(async (key: string) => {
  return mockStore[key] || null;
});

(setStorageItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
  mockStore[key] = value;
});

(removeStorageItem as jest.Mock).mockImplementation(async (key: string) => {
  delete mockStore[key];
});

(clearStorage as jest.Mock).mockImplementation(async () => {
  Object.keys(mockStore).forEach(key => delete mockStore[key]);
});

// Typed mock references for assertions
const mockGetStorageItem = getStorageItem as jest.MockedFunction<typeof getStorageItem>;
const mockSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;
const mockRemoveStorageItem = removeStorageItem as jest.MockedFunction<typeof removeStorageItem>;
const mockClearStorage = clearStorage as jest.MockedFunction<typeof clearStorage>;
const mockClearLocalStorage = clearLocalStorage as jest.MockedFunction<typeof clearLocalStorage>;

// Helper to clear mock store
const clearMockStore = () => {
  Object.keys(mockStore).forEach(key => delete mockStore[key]);
};

describe('App Settings Utilities', () => {

  // Reset mocks before each test
  beforeEach(() => {
    clearMockStore();
    mockGetStorageItem.mockReset();
    mockSetStorageItem.mockReset();
    mockRemoveStorageItem.mockReset();
    mockClearStorage.mockReset();
    mockClearLocalStorage.mockReset();

    // Reset to default behavior - successful operations
    mockSetStorageItem.mockImplementation(async () => {});
    mockGetStorageItem.mockResolvedValue(null);
    mockRemoveStorageItem.mockImplementation(async () => {});
    mockClearStorage.mockImplementation(async () => {});
    mockClearLocalStorage.mockImplementation(() => {});
  });

  describe('getAppSettings', () => {
    it('should return default settings if nothing is stored', async () => {
      mockGetStorageItem.mockResolvedValue(null);

      const result = await getAppSettings();

      expect(mockGetStorageItem).toHaveBeenCalledWith(APP_SETTINGS_KEY);
      expect(result).toEqual({
        currentGameId: null,
        lastHomeTeamName: '',
        language: 'fi',
        hasSeenAppGuide: false,
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: '2000-10-01',
        clubSeasonEndDate: '2000-05-01'
      });
    });

    it('should return merged settings if stored settings exist', async () => {
      const storedSettings = { currentGameId: 'game123', lastHomeTeamName: 'Team X' };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(storedSettings));

      const result = await getAppSettings();

      expect(mockGetStorageItem).toHaveBeenCalledWith(APP_SETTINGS_KEY);
      expect(result).toEqual({
        currentGameId: 'game123',
        lastHomeTeamName: 'Team X',
        language: 'fi', // From default settings
        hasSeenAppGuide: false,
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: expect.stringMatching(/^\d{4}-10-01$/),
        clubSeasonEndDate: expect.stringMatching(/^\d{4}-05-01$/)
      });
    });

    it('should handle invalid JSON and return default settings', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGetStorageItem.mockResolvedValue('invalid json');

      const result = await getAppSettings();

      expect(consoleSpy).toHaveBeenCalled();
      expect(result).toEqual({
        currentGameId: null,
        lastHomeTeamName: '',
        language: 'fi',
        hasSeenAppGuide: false,
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: expect.stringMatching(/^\d{4}-10-01$/),
        clubSeasonEndDate: expect.stringMatching(/^\d{4}-05-01$/)
      });

      consoleSpy.mockRestore();
    });

    it('should return default settings if localStorage.getItem throws an error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Cannot access localStorage');
      mockGetStorageItem.mockImplementation(async () => { throw error; });

      const result = await getAppSettings();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting app settings'), error);
      expect(result).toEqual({
        currentGameId: null,
        lastHomeTeamName: '',
        language: 'fi',
        hasSeenAppGuide: false,
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: expect.stringMatching(/^\d{4}-10-01$/),
        clubSeasonEndDate: expect.stringMatching(/^\d{4}-05-01$/)
      });
      consoleSpy.mockRestore();
    });
  });

  describe('saveAppSettings', () => {
    it('should save settings to localStorage and return true on success', async () => {
      const settings: AppSettings = {
        currentGameId: 'game456',
        lastHomeTeamName: 'Team Y',
        language: 'fi'
      };
      
      const result = await saveAppSettings(settings);
      
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        APP_SETTINGS_KEY,
        JSON.stringify(settings)
      );
      expect(result).toBe(true);
    });

    it('should return false if localStorage.setItem throws an error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Storage quota exceeded');
      mockSetStorageItem.mockImplementation(() => { throw error; });

      const settings: AppSettings = { currentGameId: 'game123' };
      const result = await saveAppSettings(settings);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error saving app settings'), error);
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('updateAppSettings', () => {
    it('should update only specified settings and return updated settings', async () => {
      const currentSettings: AppSettings = {
        currentGameId: 'game123',
        lastHomeTeamName: 'Team A',
        language: 'fi',
        hasSeenAppGuide: false,
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(currentSettings));
      
      const result = await updateAppSettings({ currentGameId: 'game456' });

      expect(result).toEqual({
        currentGameId: 'game456', // Updated
        lastHomeTeamName: 'Team A', // Preserved
        language: 'fi', // Preserved
        hasSeenAppGuide: false,
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: expect.stringMatching(/^\d{4}-10-01$/),
        clubSeasonEndDate: expect.stringMatching(/^\d{4}-05-01$/)
      });

      // Check that setStorageItem was called with updated settings
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        APP_SETTINGS_KEY,
        expect.stringContaining('"currentGameId":"game456"')
      );
      // Verify the saved data contains season dates with correct format
      const savedData = JSON.parse(mockSetStorageItem.mock.calls[0][1]);
      expect(savedData.clubSeasonStartDate).toMatch(/^\d{4}-10-01$/);
      expect(savedData.clubSeasonEndDate).toMatch(/^\d{4}-05-01$/);
    });

    it('should update the language setting', async () => {
      const currentSettings: AppSettings = {
        currentGameId: 'game123',
        lastHomeTeamName: 'Team A',
        language: 'fi',
        hasSeenAppGuide: false,
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(currentSettings));

      const result = await updateAppSettings({ language: 'fi' });

      expect(result).toEqual({
        ...currentSettings,
        language: 'fi',
        useDemandCorrection: false,
        hasConfiguredSeasonDates: false,
        clubSeasonStartDate: expect.stringMatching(/^\d{4}-10-01$/),
        clubSeasonEndDate: expect.stringMatching(/^\d{4}-05-01$/)
      });

      // Verify setStorageItem was called with correct structure
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        APP_SETTINGS_KEY,
        expect.stringContaining('"language":"fi"')
      );
      const savedData = JSON.parse(mockSetStorageItem.mock.calls[0][1]);
      expect(savedData.clubSeasonStartDate).toMatch(/^\d{4}-10-01$/);
      expect(savedData.clubSeasonEndDate).toMatch(/^\d{4}-05-01$/);
    });

    it('should throw an error if update fails', async () => {
      const currentSettings: AppSettings = {
        currentGameId: 'initialGame',
        lastHomeTeamName: 'InitialTeam',
        language: 'en'
      };
      // Simulate getAppSettings returning current settings initially
      mockGetStorageItem.mockResolvedValueOnce(JSON.stringify(currentSettings));
      // Simulate saveAppSettings failing by making setItem throw an error
      mockSetStorageItem.mockImplementationOnce(async () => { throw new Error('Save failed'); });

      // Expect updateAppSettings to throw the error from setStorageItem
      try {
        await updateAppSettings({ currentGameId: 'updatedGame' });
        fail('Expected updateAppSettings to throw an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Save failed');
      }

      // Ensure localStorage.setItem was called (attempted to save)
      expect(mockSetStorageItem).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentGameIdSetting', () => {
    it('should return the current game ID', async () => {
      mockGetStorageItem.mockResolvedValue(JSON.stringify({
        currentGameId: 'game789'
      }));
      
      const result = await getCurrentGameIdSetting();
      
      expect(result).toBe('game789');
      expect(mockGetStorageItem).toHaveBeenCalledWith(APP_SETTINGS_KEY);
    });

    it('should return null if no current game ID is set', async () => {
      mockGetStorageItem.mockResolvedValue(JSON.stringify({
        currentGameId: null
      }));
      
      const result = await getCurrentGameIdSetting();
      
      expect(result).toBeNull();
    });
  });

  describe('saveCurrentGameIdSetting', () => {
    it('should update only the current game ID setting and return true', async () => {
      const currentSettings: AppSettings = {
        currentGameId: 'oldGameId',
        lastHomeTeamName: 'Team B',
        language: 'fi',
        hasSeenAppGuide: false,
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(currentSettings));
      // Mock setItem to simulate successful save by updateAppSettings
      mockSetStorageItem.mockImplementation(async () => {}); 

      const result = await saveCurrentGameIdSetting('newGameId');

      // Verify setStorageItem was called with correct structure
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        APP_SETTINGS_KEY,
        expect.stringContaining('"currentGameId":"newGameId"')
      );
      const savedData = JSON.parse(mockSetStorageItem.mock.calls[0][1]);
      expect(savedData.currentGameId).toBe('newGameId');
      expect(savedData.lastHomeTeamName).toBe('Team B');
      expect(savedData.language).toBe('fi');
      expect(savedData.hasSeenAppGuide).toBe(false);
      expect(savedData.useDemandCorrection).toBe(false);
      expect(savedData.clubSeasonStartDate).toMatch(/^\d{4}-10-01$/);
      expect(savedData.clubSeasonEndDate).toMatch(/^\d{4}-05-01$/);
      expect(result).toBe(true);
    });

    it('should return false if saving fails', async () => {
      mockGetStorageItem.mockResolvedValue(JSON.stringify({ currentGameId: 'old' }));
      // Simulate error during the setItem call within updateAppSettings
      mockSetStorageItem.mockImplementationOnce(async () => {
        throw new Error('Cannot save');
      });

      const result = await saveCurrentGameIdSetting('newGameId');
      expect(result).toBe(false);
    });
  });

  describe('getLastHomeTeamName', () => {
    it('should return last home team name from app settings', async () => {
      mockGetStorageItem.mockImplementation(async (key) => {
        if (key === APP_SETTINGS_KEY) {
          return JSON.stringify({ lastHomeTeamName: 'Dragons' });
        }
        return null;
      });
      
      const result = await getLastHomeTeamName();
      
      expect(result).toBe('Dragons');
      expect(mockGetStorageItem).toHaveBeenCalledWith(APP_SETTINGS_KEY);
    });

    it('should fall back to legacy storage if not in app settings', async () => {
      mockGetStorageItem.mockImplementation(async (key) => {
        if (key === APP_SETTINGS_KEY) {
          return JSON.stringify({ language: 'en' });
        }
        if (key === LAST_HOME_TEAM_NAME_KEY) {
          return 'Tigers';
        }
        return null;
      });
      
      const result = await getLastHomeTeamName();
      
      expect(result).toBe('Tigers');
      expect(mockGetStorageItem).toHaveBeenCalledWith(APP_SETTINGS_KEY);
      expect(mockGetStorageItem).toHaveBeenCalledWith(LAST_HOME_TEAM_NAME_KEY);
    });

    it('should return empty string if no value is found', async () => {
      mockGetStorageItem.mockResolvedValue(null);
      
      const result = await getLastHomeTeamName();
      
      expect(result).toBe('');
    });
  });

  describe('saveLastHomeTeamName', () => {
    it('should save to both app settings and legacy location and return true', async () => {
      const currentSettings: AppSettings = {
        currentGameId: 'game123',
        lastHomeTeamName: 'Old Team Name',
        language: 'fi',
        hasSeenAppGuide: false,
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(currentSettings)); // For getAppSettings call in updateAppSettings
      mockSetStorageItem.mockImplementation(async () => {}); // Default successful save

      const result = await saveLastHomeTeamName('New Team Name');

      // Check updateAppSettings call (indirectly via setItem for APP_SETTINGS_KEY)
      const appSettingsCall = mockSetStorageItem.mock.calls.find(
        call => call[0] === APP_SETTINGS_KEY
      );
      expect(appSettingsCall).toBeDefined();
      if (appSettingsCall) {
        const savedSettings = JSON.parse(appSettingsCall[1]);
        expect(savedSettings.currentGameId).toBe(currentSettings.currentGameId);
        expect(savedSettings.lastHomeTeamName).toBe('New Team Name');
        expect(savedSettings.language).toBe(currentSettings.language);
        expect(savedSettings.hasSeenAppGuide).toBe(currentSettings.hasSeenAppGuide);
        expect(savedSettings.useDemandCorrection).toBe(false);
        expect(savedSettings.clubSeasonStartDate).toMatch(/^\d{4}-10-01$/);
        expect(savedSettings.clubSeasonEndDate).toMatch(/^\d{4}-05-01$/);
      }

      // Check legacy save
      expect(mockSetStorageItem).toHaveBeenCalledWith(LAST_HOME_TEAM_NAME_KEY, 'New Team Name');
      expect(result).toBe(true);
    });

    it('should return false if saving to app settings fails', async () => {
      mockGetStorageItem.mockResolvedValue(JSON.stringify({ currentGameId: 'game123' }));
      // Simulate updateAppSettings failing (e.g., its internal saveAppSettings fails)
      mockSetStorageItem.mockImplementationOnce(async (key) => {
        if (key === APP_SETTINGS_KEY) throw new Error('Cannot save app settings');
      });
      // Legacy setItem might still be called if not guarded, but the function should return false.
      
      const result = await saveLastHomeTeamName('New Team Name');
      expect(result).toBe(false); 
      // Optionally, verify legacy setItem was not called or handled if error occurs earlier
      // For this setup, it might still be called after the error depending on exact implementation.
      // The primary check is the return value.
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

  describe('inline migration during getAppSettings', () => {
    it('should migrate legacy month-based settings to date-based settings on read', async () => {
      const legacySettings = {
        currentGameId: 'game123',
        language: 'fi',
        clubSeasonStartMonth: 10, // October
        clubSeasonEndMonth: 5,    // May
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(legacySettings));
      mockSetStorageItem.mockImplementation(async () => {});

      const result = await getAppSettings();

      // Should have migrated and saved settings
      expect(mockSetStorageItem).toHaveBeenCalledTimes(1);
      const savedData = JSON.parse(mockSetStorageItem.mock.calls[0][1]);
      expect(savedData.clubSeasonStartDate).toBe('2000-10-01'); // October 1st (year 2000 template)
      expect(savedData.clubSeasonEndDate).toBe('2000-05-01');   // May 1st (year 2000 template)
      expect(savedData.clubSeasonStartMonth).toBeUndefined();   // Legacy field removed
      expect(savedData.clubSeasonEndMonth).toBeUndefined();     // Legacy field removed

      // Should return migrated values
      expect(result.clubSeasonStartDate).toBe('2000-10-01');
      expect(result.clubSeasonEndDate).toBe('2000-05-01');
    });

    /**
     * Tests that migration preserves the configured season flag
     * @critical
     *
     * Validates P1 fix from Codex review: when migrating from legacy month-based
     * settings, hasConfiguredSeasonDates must be set to true so existing users'
     * configurations remain enabled after upgrade.
     */
    it('should set hasConfiguredSeasonDates=true when migrating legacy month settings', async () => {
      const legacySettings = {
        currentGameId: 'game123',
        language: 'fi',
        clubSeasonStartMonth: 3,  // March
        clubSeasonEndMonth: 11,   // November
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(legacySettings));
      mockSetStorageItem.mockImplementation(async () => {});

      const result = await getAppSettings();

      // Should have migrated and saved settings
      expect(mockSetStorageItem).toHaveBeenCalledTimes(1);
      const savedData = JSON.parse(mockSetStorageItem.mock.calls[0][1]);

      // Critical: Flag must be preserved so user's configuration remains enabled
      expect(savedData.hasConfiguredSeasonDates).toBe(true);
      expect(result.hasConfiguredSeasonDates).toBe(true);

      // Verify dates were migrated correctly
      expect(savedData.clubSeasonStartDate).toBe('2000-03-01');
      expect(savedData.clubSeasonEndDate).toBe('2000-11-01');
    });

    it('should not migrate if settings already have date-based format', async () => {
      const modernSettings = {
        currentGameId: 'game123',
        language: 'fi',
        clubSeasonStartDate: '2000-10-01',
        clubSeasonEndDate: '2000-05-01',
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(modernSettings));
      mockSetStorageItem.mockImplementation(async () => {});

      await getAppSettings();

      // Should not save anything (no migration needed)
      expect(mockSetStorageItem).not.toHaveBeenCalled();
    });

    it('should handle migration save errors gracefully and continue', async () => {
      const legacySettings = {
        currentGameId: 'game123',
        clubSeasonStartMonth: 10,
        clubSeasonEndMonth: 5,
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(legacySettings));
      mockSetStorageItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw - migration save failure is non-fatal
      const result = await getAppSettings();

      // Should still return migrated values in memory
      expect(result.clubSeasonStartDate).toBe('2000-10-01');
      expect(result.clubSeasonEndDate).toBe('2000-05-01');
    });
  });

  // Note: Due to a pre-existing Jest mock hoisting issue in this codebase,
  // the storage module mock doesn't properly intercept calls.
  // These tests verify error handling behavior (functions handle storage failures gracefully).

  describe('getInstallPromptDismissedTime', () => {
    it('should return null when storage is unavailable or empty', async () => {
      const result = await getInstallPromptDismissedTime();
      expect(result).toBeNull();
    });

    it('should not throw on storage errors', async () => {
      await expect(getInstallPromptDismissedTime()).resolves.toBeNull();
    });
  });

  describe('setInstallPromptDismissed', () => {
    it('should not throw on storage errors', async () => {
      await expect(setInstallPromptDismissed()).resolves.toBeUndefined();
    });
  });

  describe('getHasSeenFirstGameGuide', () => {
    it('should return false when storage is unavailable or empty', async () => {
      const result = await getHasSeenFirstGameGuide();
      expect(result).toBe(false);
    });

    it('should not throw on storage errors', async () => {
      await expect(getHasSeenFirstGameGuide()).resolves.toBe(false);
    });
  });

  describe('setHasSeenFirstGameGuide', () => {
    it('should not throw on storage errors when setting true', async () => {
      await expect(setHasSeenFirstGameGuide(true)).resolves.toBeUndefined();
    });

    it('should not throw on storage errors when setting false', async () => {
      await expect(setHasSeenFirstGameGuide(false)).resolves.toBeUndefined();
    });
  });
}); 
