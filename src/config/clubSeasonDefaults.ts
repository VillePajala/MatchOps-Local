/**
 * Default Club Season Constants
 *
 * Single source of truth for default club season date boundaries.
 * These values are used as fallbacks throughout the application when
 * user-configured values are not available.
 *
 * The year (2000) in these dates is a template - only month and day are significant.
 *
 * Default season: starts 15 November and runs to 14 November the next year.
 *
 * ONE BOUNDARY, NOT TWO. The end used to be 20 October - twenty-six days before
 * the start - which left every match between 21 October and 14 November in
 * 'off-season', belonging to no club season and dropping out of the record.
 * The end is now always the day before the start, so every date belongs to
 * exactly one season and nothing can fall down the gap.
 */

/**
 * Default club season start date (November 15th - year is template)
 * Single source of truth - import this constant instead of hardcoding
 */
export const DEFAULT_CLUB_SEASON_START_DATE = '2000-11-15';

/**
 * The day before the default start.
 *
 * @deprecated The end of a club season is always the day before the next one
 * begins - see `clubSeasonEndFromStart`. This constant remains only for callers
 * that have not been updated; nothing should store or configure an end date.
 */
export const DEFAULT_CLUB_SEASON_END_DATE = '2000-11-14';
