/**
 * Settings Test Fixtures
 *
 * Centralized application settings data for testing configuration functionality.
 */

import { TestIdGenerator } from './base';

/**
 * Application settings interface for testing
 */
interface AppSettings {
  language: 'en' | 'fi';
  currentGameId?: string;
  theme?: 'light' | 'dark' | 'auto';
  notifications?: boolean;
  analytics?: boolean;
}

/**
 * Creates default user preferences
 */
export function userPreferences(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    language: 'en',
    theme: 'light',
    notifications: true,
    analytics: true,
    ...overrides,
  };
}

/**
 * Creates Finnish user preferences
 */
export function finnishUser(overrides: Partial<AppSettings> = {}): AppSettings {
  return userPreferences({
    language: 'fi',
    ...overrides,
  });
}

/**
 * Creates privacy-focused user preferences
 */
export function privacyFocused(overrides: Partial<AppSettings> = {}): AppSettings {
  return userPreferences({
    analytics: false,
    notifications: false,
    ...overrides,
  });
}

/**
 * LocalStorage mock data
 */
export function localStorageData(gameId?: string) {
  return {
    soccerAppSettings: JSON.stringify(userPreferences({
      currentGameId: gameId || TestIdGenerator.generate('game'),
    })),
    soccerSavedGames: JSON.stringify({}),
    soccerMasterRoster: JSON.stringify([]),
  };
}
