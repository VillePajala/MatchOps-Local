import {
  APP_SETTINGS_KEY,
  LAST_HOME_TEAM_NAME_KEY,
  MASTER_ROSTER_KEY,
  SAVED_GAMES_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  PLAYER_ADJUSTMENTS_KEY,
  TIMER_STATE_KEY,
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY,
  APP_DATA_VERSION_KEY,
} from '@/config/storageKeys';
import {
  getStorageItem,
  setStorageItem,
} from './storage';
import logger from '@/utils/logger';
/**
 * Interface for application settings
 */
export interface AppSettings {
  currentGameId: string | null;
  lastHomeTeamName?: string;
  language?: string;
  hasSeenAppGuide?: boolean;
  useDemandCorrection?: boolean;
  // Add other settings as needed
}

/**
 * Default application settings
 */
const DEFAULT_APP_SETTINGS: AppSettings = {
  currentGameId: null,
  lastHomeTeamName: '',
  language: 'fi',
  hasSeenAppGuide: false,
  useDemandCorrection: false,
};

/**
 * Gets the application settings from localStorage
 * @returns A promise that resolves to the application settings
 */
export const getAppSettings = async (): Promise<AppSettings> => {
  try {
    const settingsJson = await getStorageItem(APP_SETTINGS_KEY);
    if (!settingsJson) {
      return DEFAULT_APP_SETTINGS;
    }

    const settings = JSON.parse(settingsJson);
    return { ...DEFAULT_APP_SETTINGS, ...settings };
  } catch (error) {
    logger.error('Error getting app settings from storage:', error);
    return DEFAULT_APP_SETTINGS; // Fallback to default on error
  }
};

/**
 * Saves the application settings to localStorage
 * @param settings - The settings to save
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const saveAppSettings = async (settings: AppSettings): Promise<boolean> => {
  try {
    await setStorageItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    logger.error('Error saving app settings to storage:', error);
    return false;
  }
};

/**
 * Updates specific application settings while preserving others
 * @param settingsUpdate - Partial settings to update
 * @returns A promise that resolves to the updated settings
 */
export const updateAppSettings = async (settingsUpdate: Partial<AppSettings>): Promise<AppSettings> => {
  // Get current settings. If this fails, the error will propagate.
  const currentSettings = await getAppSettings();
  const updatedSettings = { ...currentSettings, ...settingsUpdate };

  // Try to save the updated settings.
  const saveSuccess = await saveAppSettings(updatedSettings);

  if (!saveSuccess) {
    // saveAppSettings already logs the specific localStorage error.
    // We throw a new error here to indicate that the update operation itself failed.
    // This error will be caught by the calling functions (e.g., saveCurrentGameIdSetting).
    throw new Error('Failed to save updated settings via saveAppSettings within updateAppSettings.');
  }
  // If save was successful, return the updated settings.
  return updatedSettings;
};

/**
 * Gets the current game ID
 * @returns A promise that resolves to the current game ID, or null if not set
 */
export const getCurrentGameIdSetting = async (): Promise<string | null> => {
  // Wait for getAppSettings to resolve
  const settings = await getAppSettings();
  return settings.currentGameId;
};

/**
 * Saves the current game ID setting
 * @param gameId - The game ID to save
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const saveCurrentGameIdSetting = async (gameId: string | null): Promise<boolean> => {
  try {
    // Wait for updateAppSettings to resolve
    await updateAppSettings({ currentGameId: gameId });
    return true;
  } catch (error) {
    // updateAppSettings already logs errors. We indicate failure here.
    logger.warn('Failed to save current game ID setting', { gameId, error });
    return false;
  }
};

/**
 * Gets the last used home team name
 * @returns A promise that resolves to the last home team name, or empty string if not set
 */
export const getLastHomeTeamName = async (): Promise<string> => {
  try {
    // Try the modern approach first (using appSettings)
    // Wait for getAppSettings to resolve
    const settings = await getAppSettings();
    if (settings.lastHomeTeamName) {
      return Promise.resolve(settings.lastHomeTeamName);
    }
    
    // Fall back to legacy approach (using dedicated key)
    const legacyValue = await getStorageItem(LAST_HOME_TEAM_NAME_KEY).catch(() => null);
    return legacyValue || '';
  } catch (error) {
    logger.error('Error getting last home team name:', error);
    return '';
  }
};

/**
 * Saves the last used home team name
 * @param teamName - The team name to save
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const saveLastHomeTeamName = async (teamName: string): Promise<boolean> => {
  try {
    // Save in both the modern way and legacy way for backwards compatibility
    // Wait for updateAppSettings to resolve
    await updateAppSettings({ lastHomeTeamName: teamName });
    try {
      await setStorageItem(LAST_HOME_TEAM_NAME_KEY, teamName); // Legacy async save
    } catch (error) {
      // Silent fail - legacy save is not critical
      logger.debug('Failed to save legacy lastHomeTeamName key (non-critical)', { teamName, error });
    }
    return true;
  } catch (error) {
    logger.error('Error saving last home team name:', error);
    return false;
  }
};

/**
 * Gets whether the user has seen the app guide
 * @returns A promise that resolves to true if seen, false otherwise
 */
export const getHasSeenAppGuide = async (): Promise<boolean> => {
  const settings = await getAppSettings();
  return settings.hasSeenAppGuide ?? false;
};

/**
 * Saves the hasSeenAppGuide flag
 * @param value - Whether the guide has been viewed
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const saveHasSeenAppGuide = async (value: boolean): Promise<boolean> => {
  try {
    await updateAppSettings({ hasSeenAppGuide: value });
    return true;
  } catch (error) {
    logger.warn('Failed to save hasSeenAppGuide setting', { value, error });
    return false;
  }
};

/**
 * Clears all application settings, resetting to defaults
 * Uses clearStorage() to completely wipe IndexedDB for a clean reset
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const resetAppSettings = async (): Promise<boolean> => {
  try {
    // Import storage utilities
    const { clearStorage, removeStorageItem } = await import('./storage');

    // First, explicitly clear all known app data keys (for safety)
    logger.log('[resetAppSettings] Clearing all known data keys...');
    await Promise.allSettled([
      removeStorageItem(APP_SETTINGS_KEY),
      removeStorageItem(SAVED_GAMES_KEY),
      removeStorageItem(MASTER_ROSTER_KEY),
      removeStorageItem(SEASONS_LIST_KEY),
      removeStorageItem(TOURNAMENTS_LIST_KEY),
      removeStorageItem(PLAYER_ADJUSTMENTS_KEY),
      removeStorageItem(TIMER_STATE_KEY),
      removeStorageItem(TEAMS_INDEX_KEY),
      removeStorageItem(TEAM_ROSTERS_KEY),
      removeStorageItem(APP_DATA_VERSION_KEY),
      removeStorageItem(LAST_HOME_TEAM_NAME_KEY),
      removeStorageItem('hasSeenFirstGameGuide'),
      removeStorageItem('storage-mode'),
      removeStorageItem('storage-version'),
    ]);

    // Then use clearStorage to ensure everything is gone
    logger.log('[resetAppSettings] Performing full storage clear...');
    await clearStorage();

    logger.log('[resetAppSettings] All storage cleared successfully');
    return true;
  } catch (error) {
    logger.error('[resetAppSettings] Error resetting app:', error);
    return false;
  }
};
