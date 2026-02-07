/**
 * Application settings interface.
 * Extracted to dedicated file to avoid circular dependencies between
 * appSettings.ts utilities and DataStore implementations.
 */

import {
  DEFAULT_CLUB_SEASON_START_DATE,
  DEFAULT_CLUB_SEASON_END_DATE,
} from '@/config/clubSeasonDefaults';

export interface AppSettings {
  currentGameId: string | null;
  lastHomeTeamName?: string;
  language?: string;
  hasSeenAppGuide?: boolean;
  useDemandCorrection?: boolean;
  isDrawingModeEnabled?: boolean;
  /** Club season start date (ISO format YYYY-MM-DD, default: "2000-11-15" = November 15th) */
  clubSeasonStartDate?: string;
  /** Club season end date (ISO format YYYY-MM-DD, default: "2000-10-20" = October 20th) */
  clubSeasonEndDate?: string;
  /** Tracks whether user has explicitly configured season dates (enables season filtering UI) */
  hasConfiguredSeasonDates?: boolean;
  /** ISO timestamp of last update - used for conflict resolution in cloud sync */
  updatedAt?: string;
  // Add other settings as needed
}

/**
 * Default application settings.
 * Single source of truth — imported by LocalDataStore, SupabaseDataStore, and appSettings.ts.
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  currentGameId: null,
  lastHomeTeamName: '',
  language: 'fi',
  hasSeenAppGuide: false,
  useDemandCorrection: false,
  hasConfiguredSeasonDates: false,
  clubSeasonStartDate: DEFAULT_CLUB_SEASON_START_DATE,
  clubSeasonEndDate: DEFAULT_CLUB_SEASON_END_DATE,
};
