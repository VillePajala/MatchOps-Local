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
 * Gets the last day of a given month in UTC
 *
 * @param year - Full year (e.g., 2024)
 * @param month - Month number (1-12)
 * @returns Date object set to last day of month at 23:59:59.999 UTC
 *
 * @remarks
 * Uses the date arithmetic trick: Day 0 of month N+1 = last day of month N
 *
 * @example
 * getLastDayOfMonth(2024, 2) // Feb 29, 2024 23:59:59.999 (leap year)
 * getLastDayOfMonth(2025, 2) // Feb 28, 2025 23:59:59.999
 * getLastDayOfMonth(2024, 4) // Apr 30, 2024 23:59:59.999
 */
function getLastDayOfMonth(year: number, month: number): Date {
  // Day 0 of next month = last day of current month
  // Set time to 23:59:59.999 to include the entire last day
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

/**
 * Determines the club season label for a given date.
 *
 * Examples (with startMonth=10, endMonth=5):
 * - Nov 15, 2024 → "24/25" (in first half of season)
 * - Feb 20, 2025 → "24/25" (in second half of season)
 * - Jul 10, 2024 → "off-season" (outside season period)
 *
 * @param dateStr - ISO date string (YYYY-MM-DD)
 * @param startMonth - Season start month (1-12)
 * @param endMonth - Season end month (1-12)
 * @returns Season label (e.g., "24/25") or "off-season"
 */
export function getClubSeasonForDate(
  dateStr: string,
  startMonth: number = 10,
  endMonth: number = 5
): string {
  // Force UTC interpretation to avoid timezone issues
  const date = new Date(dateStr + 'T00:00:00Z');
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // Convert 0-based to 1-based

  if (startMonth <= endMonth) {
    // Season within same calendar year (e.g., Jan-Dec)
    if (month >= startMonth && month <= endMonth) {
      // Within season
      return `${year}`;
    }
    // Outside season
    return 'off-season';
  } else {
    // Season spans calendar years (e.g., Oct-May)
    if (month >= startMonth) {
      // In first half of season (Oct-Dec 2024 → "24/25")
      const nextYear = year + 1;
      return `${year.toString().slice(2)}/${nextYear.toString().slice(2)}`;
    } else if (month <= endMonth) {
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
 * @param startMonth - Season start month (1-12)
 * @param endMonth - Season end month (1-12)
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
 * getClubSeasonDisplayLabel("24/25", 10, 5) // "Oct 2024 - May 2025"
 * getClubSeasonDisplayLabel("2024", 1, 12) // "Jan - Dec 2024"
 * getClubSeasonDisplayLabel("off-season") // "Off-Season"
 */
export function getClubSeasonDisplayLabel(
  seasonLabel: string,
  startMonth: number = 10,
  endMonth: number = 5
): string {
  if (seasonLabel === 'off-season') {
    return 'Off-Season';
  }

  // Convert month numbers to short names
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const startMonthName = monthNames[startMonth - 1];
  const endMonthName = monthNames[endMonth - 1];

  if (seasonLabel.includes('/')) {
    // Cross-year season (e.g., "24/25")
    const [startYear, endYear] = seasonLabel.split('/');
    return `${startMonthName} ${parseSeasonYear(startYear)} - ${endMonthName} ${parseSeasonYear(endYear)}`;
  } else {
    // Same-year season (e.g., "2024")
    return `${startMonthName} - ${endMonthName} ${seasonLabel}`;
  }
}

/**
 * Extracts unique club seasons from a collection of games
 *
 * @param games - Collection of games with gameDate property
 * @param startMonth - Season start month (1-12)
 * @param endMonth - Season end month (1-12)
 * @returns Array of unique season labels, sorted newest first
 */
export function extractClubSeasonsFromGames(
  games: { gameDate?: string }[],
  startMonth: number = 10,
  endMonth: number = 5
): string[] {
  const seasons = new Set<string>();

  games.forEach(game => {
    if (game.gameDate) {
      const season = getClubSeasonForDate(game.gameDate, startMonth, endMonth);
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
 * @param startMonth - Season start month (1-12)
 * @param endMonth - Season end month (1-12)
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
 * const filtered = filterGamesByClubSeason(games, '24/25', 10, 5);
 * // Returns: [{ id: '1', gameDate: '2024-11-15' }]
 */
export function filterGamesByClubSeason<T extends { gameDate?: string }>(
  games: T[],
  seasonLabel: string,
  startMonth: number = 10,
  endMonth: number = 5
): T[] {
  if (seasonLabel === 'all') {
    return games;
  }

  return games.filter(game => {
    if (!game.gameDate) return false;
    const gameSeason = getClubSeasonForDate(game.gameDate, startMonth, endMonth);
    return gameSeason === seasonLabel;
  });
}

/**
 * Gets the date range for a given club season label
 *
 * @param seasonLabel - Season label (e.g., "24/25")
 * @param startMonth - Season start month (1-12)
 * @param endMonth - Season end month (1-12)
 * @returns Object with startDate and endDate ISO strings, or null for invalid/off-season
 */
export function getClubSeasonDateRange(
  seasonLabel: string,
  startMonth: number = 10,
  endMonth: number = 5
): { startDate: string; endDate: string } | null {
  if (seasonLabel === 'off-season' || seasonLabel === 'all') {
    return null;
  }

  if (seasonLabel.includes('/')) {
    // Cross-year season (e.g., "24/25")
    const [startYear, endYear] = seasonLabel.split('/');
    const fullStartYear = parseSeasonYear(startYear);
    const fullEndYear = parseSeasonYear(endYear);

    // Use UTC to avoid timezone issues
    const startDate = new Date(Date.UTC(fullStartYear, startMonth - 1, 1));
    const endDate = getLastDayOfMonth(fullEndYear, endMonth);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  } else {
    // Same-year season (e.g., "2024")
    const year = parseInt(seasonLabel, 10);
    // Use UTC to avoid timezone issues
    const startDate = new Date(Date.UTC(year, startMonth - 1, 1));
    const endDate = getLastDayOfMonth(year, endMonth);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }
}

/**
 * Validates that season month values are in valid range (1-12)
 *
 * @param startMonth - Season start month
 * @param endMonth - Season end month
 * @returns true if both months are valid (1-12), false otherwise
 *
 * @remarks
 * Use this validation before saving season settings to prevent invalid configurations.
 * Protects against user input errors or data corruption.
 *
 * @example
 * validateSeasonMonths(10, 5) // true (Oct-May, valid cross-year season)
 * validateSeasonMonths(1, 12) // true (Jan-Dec, valid same-year season)
 * validateSeasonMonths(0, 5) // false (invalid start month)
 * validateSeasonMonths(10, 13) // false (invalid end month)
 * validateSeasonMonths(-1, 5) // false (negative month)
 */
export function validateSeasonMonths(
  startMonth: number,
  endMonth: number
): boolean {
  return (
    startMonth >= 1 && startMonth <= 12 &&
    endMonth >= 1 && endMonth <= 12
  );
}
