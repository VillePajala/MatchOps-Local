/**
 * Club Season Utilities
 *
 * Provides helper functions for calculating and managing club season periods.
 * Club seasons typically span calendar years (e.g., October 2024 - May 2025).
 */

/**
 * Parses a 2-digit year string to a full 4-digit year
 *
 * Assumes 00-99 maps to 2000-2099 (current century).
 * For 4-digit years (100+), returns as-is.
 *
 * @param shortYear - 2-digit year string (e.g., "24" for 2024)
 * @returns Full 4-digit year
 *
 * @remarks
 * TODO: After 2099, implement smart century detection based on current year
 * or make century configurable. Current implementation is sufficient through 2099.
 *
 * @example
 * parseSeasonYear("24") // Returns 2024
 * parseSeasonYear("99") // Returns 2099
 * parseSeasonYear("2024") // Returns 2024 (already 4-digit)
 */
function parseSeasonYear(shortYear: string): number {
  const year = parseInt(shortYear, 10);
  // Handle 2-digit years: 00-99 → 2000-2099
  // For years 100+, return as-is (already 4-digit)
  return year < 100 ? 2000 + year : year;
}

/**
 * Determines the club season label for a given date.
 *
 * Examples (with startDate="2000-10-01", endDate="2000-05-01"):
 * - Nov 15, 2024 → "24/25" (in first half of season)
 * - Feb 20, 2025 → "24/25" (in second half of season)
 * - Jul 10, 2024 → "off-season" (outside season period)
 *
 * @param dateStr - ISO date string (YYYY-MM-DD) of the game date
 * @param startDate - Season start date (ISO format, year is template)
 * @param endDate - Season end date (ISO format, year is template)
 * @returns Season label (e.g., "24/25") or "off-season"
 */
export function getClubSeasonForDate(
  dateStr: string,
  startDate: string = '2000-10-01',
  endDate: string = '2000-05-01'
): string {
  // Force UTC interpretation to avoid timezone issues
  const date = new Date(dateStr + 'T00:00:00Z');
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // Convert 0-based to 1-based
  const day = date.getUTCDate();

  // Extract month and day from season dates (year is template, so we ignore it)
  const startMonth = parseInt(startDate.split('-')[1], 10);
  const startDay = parseInt(startDate.split('-')[2], 10);
  const endMonth = parseInt(endDate.split('-')[1], 10);
  const endDay = parseInt(endDate.split('-')[2], 10);

  // Helper to compare dates within a year (ignoring year)
  const isAfterOrEqual = (m1: number, d1: number, m2: number, d2: number): boolean => {
    return m1 > m2 || (m1 === m2 && d1 >= d2);
  };
  const isBeforeOrEqual = (m1: number, d1: number, m2: number, d2: number): boolean => {
    return m1 < m2 || (m1 === m2 && d1 <= d2);
  };

  if (startMonth < endMonth || (startMonth === endMonth && startDay <= endDay)) {
    // Season within same calendar year (e.g., Jan-Dec or Mar 15 - Nov 20)
    if (isAfterOrEqual(month, day, startMonth, startDay) && isBeforeOrEqual(month, day, endMonth, endDay)) {
      // Within season
      return `${year}`;
    }
    // Outside season
    return 'off-season';
  } else {
    // Season spans calendar years (e.g., Oct 1 - May 1 or Dec 15 - Feb 10)
    if (isAfterOrEqual(month, day, startMonth, startDay)) {
      // In first half of season (Oct-Dec 2024 → "24/25")
      const nextYear = year + 1;
      return `${year.toString().slice(2)}/${nextYear.toString().slice(2)}`;
    } else if (isBeforeOrEqual(month, day, endMonth, endDay)) {
      // In second half of season (Jan-May 2025 → "24/25")
      const prevYear = year - 1;
      return `${prevYear.toString().slice(2)}/${year.toString().slice(2)}`;
    }
    // Outside season (e.g., June-September for Oct-May season)
    return 'off-season';
  }
}

/**
 * Gets the full display label for a club season
 *
 * @param seasonLabel - Season label (e.g., "24/25" or "2024")
 * @param startDate - Season start date (ISO format, year is template)
 * @param endDate - Season end date (ISO format, year is template)
 * @returns Display label with date range (English month names)
 *
 * @remarks
 * **i18n Limitation**: This function returns English month names and "Off-Season".
 * For internationalized display in production UI, handle i18n at the component level:
 * - Display seasonLabel directly (e.g., "24/25") without translation
 * - For off-season, use `t('playerStats.offSeason')` in the UI
 * - For month names in UI, use `t('months.january')`, `t('months.february')`, etc.
 *
 * This utility is primarily for testing, logging, or English-only contexts.
 * It is currently not used in production code.
 *
 * @example
 * getClubSeasonDisplayLabel("24/25", "2000-10-01", "2000-05-01") // "Oct 1, 2024 - May 1, 2025"
 * getClubSeasonDisplayLabel("2024", "2000-01-01", "2000-12-31") // "Jan 1 - Dec 31, 2024"
 * getClubSeasonDisplayLabel("off-season") // "Off-Season"
 */
export function getClubSeasonDisplayLabel(
  seasonLabel: string,
  startDate: string = '2000-10-01',
  endDate: string = '2000-05-01'
): string {
  if (seasonLabel === 'off-season') {
    return 'Off-Season';
  }

  // Convert month numbers to short names
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  // Extract month and day from dates
  const startMonth = parseInt(startDate.split('-')[1], 10);
  const startDay = parseInt(startDate.split('-')[2], 10);
  const endMonth = parseInt(endDate.split('-')[1], 10);
  const endDay = parseInt(endDate.split('-')[2], 10);

  const startMonthName = monthNames[startMonth - 1];
  const endMonthName = monthNames[endMonth - 1];

  if (seasonLabel.includes('/')) {
    // Cross-year season (e.g., "24/25")
    const [startYear, endYear] = seasonLabel.split('/');
    return `${startMonthName} ${startDay}, ${parseSeasonYear(startYear)} - ${endMonthName} ${endDay}, ${parseSeasonYear(endYear)}`;
  } else {
    // Same-year season (e.g., "2024")
    return `${startMonthName} ${startDay} - ${endMonthName} ${endDay}, ${seasonLabel}`;
  }
}

/**
 * Extracts unique club seasons from a collection of games
 *
 * @param games - Collection of games with gameDate property
 * @param startDate - Season start date (ISO format, year is template)
 * @param endDate - Season end date (ISO format, year is template)
 * @returns Array of unique season labels, sorted newest first
 */
export function extractClubSeasonsFromGames(
  games: { gameDate?: string }[],
  startDate: string = '2000-10-01',
  endDate: string = '2000-05-01'
): string[] {
  const seasons = new Set<string>();

  games.forEach(game => {
    if (game.gameDate) {
      const season = getClubSeasonForDate(game.gameDate, startDate, endDate);
      seasons.add(season);
    }
  });

  // Sort seasons newest first (off-season goes to end)
  return Array.from(seasons).sort((a, b) => {
    if (a === 'off-season') return 1;
    if (b === 'off-season') return -1;
    return b.localeCompare(a); // Reverse alphabetical for year labels
  });
}

/**
 * Filters games by club season
 *
 * @param games - Array of games to filter
 * @param seasonLabel - Season label to filter by, or 'all' for no filtering
 * @param startDate - Season start date (ISO format, year is template)
 * @param endDate - Season end date (ISO format, year is template)
 * @returns Filtered array of games
 *
 * @remarks
 * This is a utility function that provides reusable filtering logic for arrays of games.
 * Currently not used in production code (PlayerStatsView uses inline filtering for performance),
 * but available for future features or external consumption.
 *
 * Well-tested with 7 comprehensive test cases covering various scenarios.
 *
 * @example
 * const games = [
 *   { id: '1', gameDate: '2024-11-15' }, // 24/25 season
 *   { id: '2', gameDate: '2024-07-01' }, // off-season
 * ];
 * const filtered = filterGamesByClubSeason(games, '24/25', '2000-10-01', '2000-05-01');
 * // Returns: [{ id: '1', gameDate: '2024-11-15' }]
 */
export function filterGamesByClubSeason<T extends { gameDate?: string }>(
  games: T[],
  seasonLabel: string,
  startDate: string = '2000-10-01',
  endDate: string = '2000-05-01'
): T[] {
  if (seasonLabel === 'all') {
    return games;
  }

  return games.filter(game => {
    if (!game.gameDate) return false;
    const gameSeason = getClubSeasonForDate(game.gameDate, startDate, endDate);
    return gameSeason === seasonLabel;
  });
}

/**
 * Gets the date range for a given club season label
 *
 * @param seasonLabel - Season label (e.g., "24/25")
 * @param startDate - Season start date template (ISO format, year is template)
 * @param endDate - Season end date template (ISO format, year is template)
 * @returns Object with startDate and endDate ISO strings, or null for invalid/off-season
 */
export function getClubSeasonDateRange(
  seasonLabel: string,
  startDate: string = '2000-10-01',
  endDate: string = '2000-05-01'
): { startDate: string; endDate: string } | null {
  if (seasonLabel === 'off-season' || seasonLabel === 'all') {
    return null;
  }

  // Extract month and day from template dates
  const startMonth = parseInt(startDate.split('-')[1], 10);
  const startDay = parseInt(startDate.split('-')[2], 10);
  const endMonth = parseInt(endDate.split('-')[1], 10);
  const endDay = parseInt(endDate.split('-')[2], 10);

  if (seasonLabel.includes('/')) {
    // Cross-year season (e.g., "24/25")
    const [startYear, endYear] = seasonLabel.split('/');
    const fullStartYear = parseSeasonYear(startYear);
    const fullEndYear = parseSeasonYear(endYear);

    // Use UTC to avoid timezone issues
    const seasonStart = new Date(Date.UTC(fullStartYear, startMonth - 1, startDay));
    const seasonEnd = new Date(Date.UTC(fullEndYear, endMonth - 1, endDay));

    return {
      startDate: seasonStart.toISOString().split('T')[0],
      endDate: seasonEnd.toISOString().split('T')[0]
    };
  } else {
    // Same-year season (e.g., "2024")
    const year = parseInt(seasonLabel, 10);
    // Use UTC to avoid timezone issues
    const seasonStart = new Date(Date.UTC(year, startMonth - 1, startDay));
    const seasonEnd = new Date(Date.UTC(year, endMonth - 1, endDay));

    return {
      startDate: seasonStart.toISOString().split('T')[0],
      endDate: seasonEnd.toISOString().split('T')[0]
    };
  }
}

/**
 * Validates that season date strings are valid ISO dates
 *
 * @param startDate - Season start date (ISO format YYYY-MM-DD)
 * @param endDate - Season end date (ISO format YYYY-MM-DD)
 * @returns true if both dates are valid ISO dates, false otherwise
 *
 * @remarks
 * Use this validation before saving season settings to prevent invalid configurations.
 * Protects against user input errors or data corruption.
 *
 * @example
 * validateSeasonDates('2000-10-01', '2000-05-01') // true (Oct 1 - May 1, valid)
 * validateSeasonDates('2000-01-01', '2000-12-31') // true (Jan 1 - Dec 31, valid)
 * validateSeasonDates('2000-13-01', '2000-05-01') // false (invalid month)
 * validateSeasonDates('invalid', '2000-05-01') // false (invalid format)
 * validateSeasonDates('2000-02-30', '2000-05-01') // false (invalid day)
 */
export function validateSeasonDates(
  startDate: string,
  endDate: string
): boolean {
  // Check ISO format (YYYY-MM-DD)
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(startDate) || !isoDateRegex.test(endDate)) {
    return false;
  }

  // Check if dates are valid by parsing them
  const startParsed = new Date(startDate + 'T00:00:00Z');
  const endParsed = new Date(endDate + 'T00:00:00Z');

  // Check for invalid dates (NaN timestamp)
  if (isNaN(startParsed.getTime()) || isNaN(endParsed.getTime())) {
    return false;
  }

  // Check that parsed dates match input (catches invalid dates like Feb 30)
  if (
    startParsed.toISOString().split('T')[0] !== startDate ||
    endParsed.toISOString().split('T')[0] !== endDate
  ) {
    return false;
  }

  return true;
}
