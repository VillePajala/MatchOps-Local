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
/**
 * The values, and the type derived from them - not the other way round. A
 * separate runtime list is a second source of truth that drifts silently, and
 * anything reading these off a database row needs to CHECK rather than cast.
 */
export const ASSESSMENT_RATING_STYLES = ['words', 'num5', 'num10'] as const;
export type AssessmentRatingStyle = (typeof ASSESSMENT_RATING_STYLES)[number];

/** Curated metric template for assessments (see assessmentMetrics.ts). */
export const ASSESSMENT_TEMPLATES = ['balanced', 'light6', 'creative'] as const;
export type AssessmentTemplate = (typeof ASSESSMENT_TEMPLATES)[number];

export interface AppSettings {
  currentGameId: string | null;
  lastHomeTeamName?: string;
  language?: string;
  hasSeenAppGuide?: boolean;
  useDemandCorrection?: boolean;
  isDrawingModeEnabled?: boolean;
  /**
   * Whether the player-assessment (rating) feature is shown at all. Off by
   * default since 2026-09-09: rating children after every match is the wrong
   * form for youth football, and nobody kept it up. Ratings already recorded
   * are kept and reappear the moment this is switched on.
   */
  assessmentsEnabled?: boolean;
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
  /** Home screen presentation: 'simple' = launcher (default), 'dashboard' = the
      info-rich Pelit tab. Toggled from the gear sheet. */
  homeView?: 'simple' | 'dashboard';
  /**
   * Where the team sets off from, for the departure time on the next-match
   * card. Set explicitly rather than derived: "where you play home games" and
   * "where you leave from" are different places, and a guessed one is invisible
   * and uncorrectable. Undefined until the coach sets it, which simply means no
   * departure time is shown.
   */
  startingPoint?: {
    name: string;
    /** The pinned address, as the lookup gave it. */
    address?: string;
    /** Only a pinned point can be measured from; a typed name cannot. */
    latitude?: number;
    longitude?: number;
  };
  /**
   * Minutes to be AT the ground before kick-off - warm-up, lineup, changing.
   * A default, not a constant: usually 30, an hour for some tournaments, so a
   * match can override it. See `travelPlan`.
   */
  arrivalBufferMinutes?: number;
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
  assessmentsEnabled: false,
  assessmentRatingStyle: 'words',
  assessmentTemplate: 'balanced',
  hasConfiguredSeasonDates: false,
  clubSeasonStartDate: DEFAULT_CLUB_SEASON_START_DATE,
  clubSeasonEndDate: DEFAULT_CLUB_SEASON_END_DATE,
  // homeView intentionally omitted from defaults: an unset value reads as
  // 'simple' everywhere, so the default costs nothing and adding it here would
  // ripple through every exact-shape settings test.
};
