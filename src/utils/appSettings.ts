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
  INSTALL_PROMPT_DISMISSED_KEY,
  HAS_SEEN_FIRST_GAME_GUIDE_KEY,
} from '@/config/storageKeys';
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from './storage';
import logger from '@/utils/logger';
import { storageConfigManager } from './storageConfigManager';
import { getDataStore } from '@/datastore';
// ValidationError check uses code property (not instanceof) to avoid module boundary issues
import type { AppSettings } from '@/types/settings';

// Re-export for backwards compatibility
export type { AppSettings } from '@/types/settings';

// Import club season defaults for use in this file
import {
  DEFAULT_CLUB_SEASON_START_DATE,
  DEFAULT_CLUB_SEASON_END_DATE
} from '@/config/clubSeasonDefaults';

// Re-export club season defaults for backwards compatibility
// Import from @/config/clubSeasonDefaults for new code
export { DEFAULT_CLUB_SEASON_START_DATE, DEFAULT_CLUB_SEASON_END_DATE };

/**
 * Default application settings
 */
const DEFAULT_APP_SETTINGS: AppSettings = {
  currentGameId: null,
  lastHomeTeamName: '',
  language: 'fi',
  hasSeenAppGuide: false,
  useDemandCorrection: false,
  hasConfiguredSeasonDates: false,
  clubSeasonStartDate: DEFAULT_CLUB_SEASON_START_DATE,
  clubSeasonEndDate: DEFAULT_CLUB_SEASON_END_DATE,
};

/**
 * Gets the application settings.
 * DataStore handles legacy migration from month-based to date-based format.
 *
 * @returns A promise that resolves to the application settings
 */
export const getAppSettings = async (): Promise<AppSettings> => {
  try {
    const dataStore = await getDataStore();
    return await dataStore.getSettings();
  } catch (error) {
    logger.error('Error getting app settings:', error);
    return DEFAULT_APP_SETTINGS;
  }
};

/**
 * Saves the application settings.
 * DataStore handles locking and persistence.
 * @param settings - The settings to save
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const saveAppSettings = async (settings: AppSettings): Promise<boolean> => {
  try {
    const dataStore = await getDataStore();
    await dataStore.saveSettings(settings);
    return true;
  } catch (error) {
    logger.error('Error saving app settings:', error);
    return false;
  }
};

/**
 * Updates specific application settings while preserving others.
 * DataStore.updateSettings handles atomic read-modify-write internally.
 *
 * Error handling:
 * - Throws ValidationError for empty updates (programming error - fix your code)
 * - Returns current settings on storage failures (graceful degradation)
 *
 * @param settingsUpdate - Partial settings to update (must not be empty)
 * @returns A promise that resolves to the updated settings (or current settings on storage error)
 * @throws {ValidationError} If settingsUpdate is an empty object
 */
export const updateAppSettings = async (settingsUpdate: Partial<AppSettings>): Promise<AppSettings> => {
  try {
    const dataStore = await getDataStore();
    // Defensive null check - shouldn't happen but can during page reload edge cases
    if (!dataStore) {
      logger.warn('updateAppSettings: dataStore is null, returning defaults');
      return DEFAULT_APP_SETTINGS;
    }
    return await dataStore.updateSettings(settingsUpdate);
  } catch (error) {
    // Re-throw ValidationError - it's a programming error, caller should fix their code
    // Check by code property to avoid instanceof issues across module boundaries
    if (error && typeof error === 'object' && 'code' in error && error.code === 'VALIDATION_ERROR') {
      throw error;
    }
    // AuthError is expected during sign out - don't log as error (prevents Sentry noise)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'AUTH_ERROR') {
      logger.info('Settings update skipped - user signed out:', error);
      return DEFAULT_APP_SETTINGS;
    }
    // Graceful degradation for unexpected errors (storage failures, etc.)
    logger.error('Error updating app settings:', error);
    try {
      return await getAppSettings();
    } catch (fallbackError) {
      logger.error('Fallback getAppSettings also failed:', fallbackError);
      return DEFAULT_APP_SETTINGS;
    }
  }
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
    const updatedSettings = await updateAppSettings({ currentGameId: gameId });
    // Defensive null check - updateAppSettings should always return settings
    if (!updatedSettings) {
      logger.warn('updateAppSettings returned no data', { gameId });
      return false;
    }
    // Note: gameId can be null (clearing game), so strict equality check is correct
    if (updatedSettings.currentGameId !== gameId) {
      logger.warn('Failed to save current game ID setting', { gameId, actual: updatedSettings.currentGameId });
      return false;
    }
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
      return settings.lastHomeTeamName;
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
 * Saves the last used home team name.
 *
 * @param teamName - The team name to save
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const saveLastHomeTeamName = async (teamName: string): Promise<boolean> => {
  try {
    const updatedSettings = await updateAppSettings({ lastHomeTeamName: teamName });
    // Defensive null check - updateAppSettings should always return settings
    if (!updatedSettings) {
      logger.warn('updateAppSettings returned no data', { teamName });
      return false;
    }
    if (updatedSettings.lastHomeTeamName !== teamName) {
      logger.warn('Failed to save last home team name', { teamName, actual: updatedSettings.lastHomeTeamName });
      return false;
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
 * Gets the drawing mode enabled preference
 * @returns A promise that resolves to whether drawing mode should be enabled (default: false)
 */
export const getDrawingModeEnabled = async (): Promise<boolean> => {
  const settings = await getAppSettings();
  return settings.isDrawingModeEnabled ?? false;
};

/**
 * Saves the drawing mode enabled preference
 * @param value - Whether drawing mode should be enabled
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const saveDrawingModeEnabled = async (value: boolean): Promise<boolean> => {
  try {
    await updateAppSettings({ isDrawingModeEnabled: value });
    return true;
  } catch (error) {
    logger.warn('Failed to save drawing mode setting', { value, error });
    return false;
  }
};

// ============================================
// Install Prompt Utilities
// ============================================
// These manage the PWA install prompt dismissal tracking
// Key: INSTALL_PROMPT_DISMISSED_KEY (stored as timestamp string)

/**
 * Gets the timestamp when the install prompt was last dismissed
 * @returns A promise that resolves to the timestamp (ms since epoch), or null if never dismissed
 */
export const getInstallPromptDismissedTime = async (): Promise<number | null> => {
  try {
    const value = await getStorageItem(INSTALL_PROMPT_DISMISSED_KEY);
    if (!value) return null;
    const timestamp = Number(value);
    return isNaN(timestamp) ? null : timestamp;
  } catch (error) {
    logger.debug('Failed to get install prompt dismissed time (non-critical)', { error });
    return null;
  }
};

/**
 * Sets the install prompt as dismissed (stores current timestamp)
 * @returns A promise that resolves when complete
 */
export const setInstallPromptDismissed = async (): Promise<void> => {
  try {
    await setStorageItem(INSTALL_PROMPT_DISMISSED_KEY, Date.now().toString());
  } catch (error) {
    // Silent fail - dismissal tracking is not critical
    logger.debug('Failed to set install prompt dismissed (non-critical)', { error });
  }
};

// ============================================
// First Game Guide Utilities
// ============================================
// These manage the first-time user game guide display
// Key: HAS_SEEN_FIRST_GAME_GUIDE_KEY (stored as 'true' string)

/**
 * Gets whether the user has seen the first game guide
 * @returns A promise that resolves to true if seen, false otherwise
 */
export const getHasSeenFirstGameGuide = async (): Promise<boolean> => {
  try {
    const value = await getStorageItem(HAS_SEEN_FIRST_GAME_GUIDE_KEY);
    return value === 'true';
  } catch (error) {
    logger.debug('Failed to get first game guide status (non-critical)', { error });
    return false;
  }
};

/**
 * Sets the first game guide as seen
 * @param value - Whether the guide has been seen
 * @returns A promise that resolves when complete
 */
export const setHasSeenFirstGameGuide = async (value: boolean): Promise<void> => {
  try {
    if (value) {
      await setStorageItem(HAS_SEEN_FIRST_GAME_GUIDE_KEY, 'true');
    } else {
      await removeStorageItem(HAS_SEEN_FIRST_GAME_GUIDE_KEY);
    }
  } catch (error) {
    logger.debug('Failed to set first game guide status (non-critical)', { error });
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
      removeStorageItem(HAS_SEEN_FIRST_GAME_GUIDE_KEY),
      removeStorageItem(INSTALL_PROMPT_DISMISSED_KEY),
      removeStorageItem('storage-mode'),
      removeStorageItem('storage-version'),
    ]);

    // Then use clearStorage to ensure everything is gone from IndexedDB
    logger.log('[resetAppSettings] Performing full IndexedDB storage clear...');
    await clearStorage();

    // CRITICAL: Also clear localStorage to prevent migration from restoring old data
    // The migration reads from localStorage, so if we don't clear it, the old data
    // will be re-migrated to IndexedDB on the next page load
    logger.log('[resetAppSettings] Clearing localStorage backup data...');
    const { clearLocalStorage } = await import('./localStorage');
    clearLocalStorage();

    // Reset storage configuration to defaults
    logger.log('[resetAppSettings] Resetting storage configuration...');
    await storageConfigManager.resetToDefaults();

    logger.log('[resetAppSettings] All storage cleared successfully');
    return true;
  } catch (error) {
    logger.error('[resetAppSettings] Error resetting app:', error);
    return false;
  }
};
