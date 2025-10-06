/**
 * Club Season Utilities
 *
 * Provides helper functions for calculating and managing club season periods.
 * Club seasons typically span calendar years (e.g., October 2024 - May 2025).
 */

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
 * @returns Display label with date range
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
    // Note: Assumes years 2000-2099. Update prefix for later centuries.
    const [startYear, endYear] = seasonLabel.split('/');
    return `${startMonthName} 20${startYear} - ${endMonthName} 20${endYear}`;
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
    // Note: Assumes years 2000-2099. Update prefix for later centuries.
    const [startYear, endYear] = seasonLabel.split('/');
    const fullStartYear = parseInt(`20${startYear}`, 10);
    const fullEndYear = parseInt(`20${endYear}`, 10);

    // Use UTC to avoid timezone issues
    const startDate = new Date(Date.UTC(fullStartYear, startMonth - 1, 1));
    const endDate = new Date(Date.UTC(fullEndYear, endMonth, 0)); // Last day of endMonth

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  } else {
    // Same-year season (e.g., "2024")
    const year = parseInt(seasonLabel, 10);
    // Use UTC to avoid timezone issues
    const startDate = new Date(Date.UTC(year, startMonth - 1, 1));
    const endDate = new Date(Date.UTC(year, endMonth, 0)); // Last day of endMonth

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }
}
