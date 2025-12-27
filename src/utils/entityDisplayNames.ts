/**
 * Entity Display Name Utilities
 *
 * Provides helper functions for generating display names for seasons and tournaments
 * with club season labels. Centralizes the display logic to ensure consistency
 * across the application and avoid DRY violations.
 *
 * @module entityDisplayNames
 */

import type { Season, Tournament } from '@/types';

/**
 * Constant for the off-season label returned by getClubSeasonForDate().
 * Used to filter out off-season from club season displays.
 */
export const CLUB_SEASON_OFF_SEASON = 'off-season';

/**
 * Safely extracts the 4-digit year from an ISO date string.
 *
 * @param dateStr - ISO date string (YYYY-MM-DD format expected)
 * @returns The 4-digit year string, or null if invalid
 *
 * @example
 * extractYearFromDate('2024-10-15') // '2024'
 * extractYearFromDate('invalid') // null
 * extractYearFromDate('') // null
 * extractYearFromDate(undefined) // null
 */
export function extractYearFromDate(dateStr: string | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  // Validate ISO format (YYYY-MM-DD) - at minimum need 4-digit year at start
  const yearMatch = dateStr.match(/^(\d{4})/);
  if (!yearMatch) {
    return null;
  }

  const year = yearMatch[1];

  // Sanity check: year should be reasonable (1900-2100)
  const yearNum = parseInt(year, 10);
  if (yearNum < 1900 || yearNum > 2100) {
    return null;
  }

  return year;
}

/**
 * Options for display name generation.
 */
export interface DisplayNameOptions {
  /**
   * Format string for off-season year display.
   * Use {year} as placeholder for the year.
   * @default '({year})'
   */
  yearFormat?: string;
}

const DEFAULT_OPTIONS: Required<DisplayNameOptions> = {
  yearFormat: '({year})',
};

/**
 * Generates a display name for a season including club season label.
 *
 * Display logic:
 * 1. If clubSeason exists and is not 'off-season': "Season Name 24/25"
 * 2. If startDate exists (off-season or no clubSeason): "Season Name (2024)"
 * 3. Otherwise: "Season Name"
 *
 * @param season - The season entity
 * @param options - Optional display options
 * @returns Formatted display name
 *
 * @example
 * // With club season
 * getSeasonDisplayName({ name: 'EKK Kortteli', clubSeason: '24/25' })
 * // Returns: 'EKK Kortteli 24/25'
 *
 * @example
 * // Off-season with startDate
 * getSeasonDisplayName({ name: 'Summer Camp', clubSeason: 'off-season', startDate: '2024-06-15' })
 * // Returns: 'Summer Camp (2024)'
 *
 * @example
 * // No date information
 * getSeasonDisplayName({ name: 'My Season' })
 * // Returns: 'My Season'
 */
export function getSeasonDisplayName(
  season: Pick<Season, 'name' | 'clubSeason' | 'startDate'>,
  options?: DisplayNameOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Case 1: Valid club season (not off-season)
  if (season.clubSeason && season.clubSeason !== CLUB_SEASON_OFF_SEASON) {
    return `${season.name} ${season.clubSeason}`;
  }

  // Case 2: Off-season or no clubSeason, but has startDate - show year
  const year = extractYearFromDate(season.startDate);
  if (year) {
    const yearDisplay = opts.yearFormat.replace('{year}', year);
    return `${season.name} ${yearDisplay}`;
  }

  // Case 3: No date information - just the name
  return season.name;
}

/**
 * Generates a display name for a tournament including club season label.
 *
 * Display logic:
 * 1. If clubSeason exists and is not 'off-season': "Tournament Name 24/25"
 * 2. If startDate exists (off-season or no clubSeason): "Tournament Name (2024)"
 * 3. Otherwise: "Tournament Name"
 *
 * @param tournament - The tournament entity
 * @param options - Optional display options
 * @returns Formatted display name
 *
 * @example
 * // With club season
 * getTournamentDisplayName({ name: 'Helsinki Cup', clubSeason: '24/25' })
 * // Returns: 'Helsinki Cup 24/25'
 *
 * @example
 * // Off-season with startDate
 * getTournamentDisplayName({ name: 'Summer Cup', clubSeason: 'off-season', startDate: '2024-07-10' })
 * // Returns: 'Summer Cup (2024)'
 */
export function getTournamentDisplayName(
  tournament: Pick<Tournament, 'name' | 'clubSeason' | 'startDate'>,
  options?: DisplayNameOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Case 1: Valid club season (not off-season)
  if (tournament.clubSeason && tournament.clubSeason !== CLUB_SEASON_OFF_SEASON) {
    return `${tournament.name} ${tournament.clubSeason}`;
  }

  // Case 2: Off-season or no clubSeason, but has startDate - show year
  const year = extractYearFromDate(tournament.startDate);
  if (year) {
    const yearDisplay = opts.yearFormat.replace('{year}', year);
    return `${tournament.name} ${yearDisplay}`;
  }

  // Case 3: No date information - just the name
  return tournament.name;
}
