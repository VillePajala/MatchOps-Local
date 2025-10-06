import {
  getAppSettings,
  saveAppSettings,
  updateAppSettings,
  getCurrentGameIdSetting,
  saveCurrentGameIdSetting,
  getLastHomeTeamName,
  saveLastHomeTeamName,
  resetAppSettings,
  AppSettings
} from './appSettings';
import { APP_SETTINGS_KEY, LAST_HOME_TEAM_NAME_KEY } from '@/config/storageKeys';
import { clearMockStore } from './__mocks__/storage';
import { getStorageItem, setStorageItem, removeStorageItem, clearStorage } from './storage';

// Auto-mock the storage module
jest.mock('./storage');

// Type the mocked functions
const mockGetStorageItem = getStorageItem as jest.MockedFunction<typeof getStorageItem>;
const mockSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;
const mockRemoveStorageItem = removeStorageItem as jest.MockedFunction<typeof removeStorageItem>;
const mockClearStorage = clearStorage as jest.MockedFunction<typeof clearStorage>;

describe('App Settings Utilities', () => {

  // Reset mocks before each test
  beforeEach(() => {
    clearMockStore();
    mockGetStorageItem.mockReset();
    mockSetStorageItem.mockReset();
    mockRemoveStorageItem.mockReset();
    mockClearStorage.mockReset();

    // Reset to default behavior - successful operations
    mockSetStorageItem.mockImplementation(async () => {});
    mockGetStorageItem.mockResolvedValue(null);
    mockClearStorage.mockImplementation(async () => {});
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
        clubSeasonStartMonth: 10,
        clubSeasonEndMonth: 5
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
        clubSeasonStartMonth: 10,
        clubSeasonEndMonth: 5
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
        clubSeasonStartMonth: 10,
        clubSeasonEndMonth: 5
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
        clubSeasonStartMonth: 10,
        clubSeasonEndMonth: 5
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
        clubSeasonStartMonth: 10,
        clubSeasonEndMonth: 5
      });

      expect(mockSetStorageItem).toHaveBeenCalledWith(
        APP_SETTINGS_KEY,
        JSON.stringify({
          currentGameId: 'game456',
          lastHomeTeamName: 'Team A',
          language: 'fi',
          hasSeenAppGuide: false,
          useDemandCorrection: false,
          clubSeasonStartMonth: 10,
          clubSeasonEndMonth: 5
        })
      );
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
        clubSeasonStartMonth: 10,
        clubSeasonEndMonth: 5
      });
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        APP_SETTINGS_KEY,
        JSON.stringify({
          ...currentSettings,
          language: 'fi',
          useDemandCorrection: false,
          clubSeasonStartMonth: 10,
          clubSeasonEndMonth: 5
        })
      );
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
      
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        APP_SETTINGS_KEY,
        JSON.stringify({
          currentGameId: 'newGameId',
          lastHomeTeamName: 'Team B',
          language: 'fi',
          hasSeenAppGuide: false,
          useDemandCorrection: false,
          clubSeasonStartMonth: 10,
          clubSeasonEndMonth: 5
        })
      );
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
        expect(savedSettings).toEqual({
          ...currentSettings, // Ensure other settings are preserved
          lastHomeTeamName: 'New Team Name', // The updated value
          useDemandCorrection: false,
          clubSeasonStartMonth: 10,
          clubSeasonEndMonth: 5
        });
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
    it('should clear all storage and return true', async () => {
      // Mock clearStorage to simulate successful clear
      mockClearStorage.mockImplementation(async () => {});

      const result = await resetAppSettings();

      // Should call removeStorageItem for all known keys
      expect(mockRemoveStorageItem).toHaveBeenCalled();

      // Should call clearStorage to ensure everything is cleared
      expect(mockClearStorage).toHaveBeenCalled();

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
}); 
