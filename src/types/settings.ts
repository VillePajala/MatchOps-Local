/**
 * Application settings interface.
 * Extracted to dedicated file to avoid circular dependencies between
 * appSettings.ts utilities and DataStore implementations.
 */

import {
  DEFAULT_CLUB_SEASON_START_DATE,
  DEFAULT_CLUB_SEASON_END_DATE,
} from '@/config/clubSeasonDefaults';

/**
 * How per-metric assessment ratings are presented and captured:
 *   'words'  - 5-level developmental words (Working on it ... A strength)
 *   'num5'   - numbers 1-5
 *   'num10'  - numbers 1-10
 * Storage is always canonical (1-10); this only affects display/input.
 */
export type AssessmentRatingStyle = 'words' | 'num5' | 'num10';

/** Curated metric template for assessments (see assessmentMetrics.ts). */
export type AssessmentTemplate = 'balanced' | 'light6' | 'creative';

export interface AppSettings {
  currentGameId: string | null;
  lastHomeTeamName?: string;
  language?: string;
  hasSeenAppGuide?: boolean;
  useDemandCorrection?: boolean;
  isDrawingModeEnabled?: boolean;
  /** Presentation/capture style for assessment ratings (default 'words'). */
  assessmentRatingStyle?: AssessmentRatingStyle;
  /** Which metric template the assessment card presents (default 'balanced'). */
  assessmentTemplate?: AssessmentTemplate;
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
  assessmentRatingStyle: 'words',
  assessmentTemplate: 'balanced',
  hasConfiguredSeasonDates: false,
  clubSeasonStartDate: DEFAULT_CLUB_SEASON_START_DATE,
  clubSeasonEndDate: DEFAULT_CLUB_SEASON_END_DATE,
};
