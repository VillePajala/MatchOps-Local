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

/**
 * The two layouts (Onboarding v3, D21): 'basic' = Perusnäkymä (a short Home
 * with the next game, no tab bar), 'full' = Koko näkymä (the whole app). There
 * are no module switches - this one value is the whole choice.
 */
export const APP_LAYOUTS = ['basic', 'full'] as const;
export type AppLayout = (typeof APP_LAYOUTS)[number];

/**
 * First-time onboarding milestones (D17), stored as ISO timestamps in the
 * coach's own settings row. Measurement, plus one decision: `wizardDone` /
 * `wizardSkipped` mean the setup wizard has been seen on this ACCOUNT (R9).
 */
export const ONBOARDING_MILESTONES = [
  /** The account was created (the auth record's creation time). */
  'signedUp',
  /** The setup wizard's "Valmis" created the team and players. */
  'wizardDone',
  /**
   * The coach skipped the setup wizard (review R9). With `wizardDone`, this is
   * how the account - not just this device - remembers the wizard was seen, so
   * it never opens again on a new phone.
   */
  'wizardSkipped',
  /** The first plan screen opened. */
  'firstPlanSeen',
  /** The first game reached full time. */
  'firstGameFinished',
  /** A second game reached full time. */
  'secondGameFinished',
] as const;
export type OnboardingMilestone = (typeof ONBOARDING_MILESTONES)[number];
export type OnboardingMilestones = Partial<Record<OnboardingMilestone, string>>;

/** A venue the coach has used, with its pin when one was ever set. */
export interface KnownVenue {
  /** The most recent spelling the coach used. */
  name: string;
  latitude?: number;
  longitude?: number;
  /** The pinned street address, when the pin came from a lookup. */
  address?: string;
  timesUsed: number;
  /** ISO date of the most recent match here, for ordering. */
  lastUsed: string;
}

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
  /**
   * Every venue the coach has ever pinned or typed, learned from matches and
   * KEPT when the matches go. The book used to be rebuilt from saved games
   * alone, so deleting the only match at a ground forgot the ground - the
   * owner hit exactly that. Name-keyed, newest spelling wins; see venueBook.
   */
  knownVenues?: KnownVenue[];
  /**
   * Which layout this account uses. UNSET MEANS 'full': every account that
   * existed before layouts keeps the app it knows. Only an account whose setup
   * wizard ran is written 'basic'; after that only the coach changes it.
   * Read it through `resolveAppLayout`, never directly.
   */
  appLayout?: AppLayout;
  /** First-time onboarding milestones (see ONBOARDING_MILESTONES). */
  onboardingMilestones?: OnboardingMilestones;
  /**
   * Settings -> Data "Error reporting and usage statistics". UNSET MEANS ON
   * (the default). false turns off Sentry for this account and stops the
   * onboarding milestones being written. Read it through
   * `diagnosticsEnabledFromSettings`, never directly.
   */
  diagnosticsEnabled?: boolean;
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
  // 'dashboard' everywhere (page.tsx and the cloud reader), so the default costs
  // nothing and adding it here would ripple through every exact-shape settings test.
};
