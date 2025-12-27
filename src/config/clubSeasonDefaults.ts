/**
 * Default Club Season Constants
 *
 * Single source of truth for default club season date boundaries.
 * These values are used as fallbacks throughout the application when
 * user-configured values are not available.
 *
 * The year (2000) in these dates is a template - only month and day are significant.
 *
 * Default season: November 15 - October 20 (next year)
 */

/**
 * Default club season start date (November 15th - year is template)
 * Single source of truth - import this constant instead of hardcoding
 */
export const DEFAULT_CLUB_SEASON_START_DATE = '2000-11-15';

/**
 * Default club season end date (October 20th - year is template)
 * Single source of truth - import this constant instead of hardcoding
 */
export const DEFAULT_CLUB_SEASON_END_DATE = '2000-10-20';
