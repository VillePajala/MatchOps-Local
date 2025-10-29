import {
  getClubSeasonForDate,
  getClubSeasonDisplayLabel,
  extractClubSeasonsFromGames,
  filterGamesByClubSeason,
  getClubSeasonDateRange,
  validateSeasonDates,
} from './clubSeason';
import logger from '@/utils/logger';

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('clubSeason utilities', () => {
  describe('getClubSeasonForDate', () => {
    describe('cross-year seasons (Oct-May)', () => {
      const startDate = '2000-10-01'; // October 1
      const endDate = '2000-05-01';    // May 1

      it('should return correct season for first half (Oct-Dec)', () => {
        expect(getClubSeasonForDate('2024-10-01', startDate, endDate)).toBe('24/25');
        expect(getClubSeasonForDate('2024-11-15', startDate, endDate)).toBe('24/25');
        expect(getClubSeasonForDate('2024-12-31', startDate, endDate)).toBe('24/25');
      });

      it('should return correct season for second half (Jan-May)', () => {
        expect(getClubSeasonForDate('2025-01-01', startDate, endDate)).toBe('24/25');
        expect(getClubSeasonForDate('2025-02-20', startDate, endDate)).toBe('24/25');
        expect(getClubSeasonForDate('2025-05-01', startDate, endDate)).toBe('24/25');
      });

      it('should return off-season for summer months (Jun-Sep)', () => {
        expect(getClubSeasonForDate('2024-06-01', startDate, endDate)).toBe('off-season');
        expect(getClubSeasonForDate('2024-07-15', startDate, endDate)).toBe('off-season');
        expect(getClubSeasonForDate('2024-08-20', startDate, endDate)).toBe('off-season');
        expect(getClubSeasonForDate('2024-09-30', startDate, endDate)).toBe('off-season');
      });

      it('should handle different years correctly', () => {
        expect(getClubSeasonForDate('2023-11-01', startDate, endDate)).toBe('23/24');
        expect(getClubSeasonForDate('2024-03-15', startDate, endDate)).toBe('23/24');
        expect(getClubSeasonForDate('2025-10-01', startDate, endDate)).toBe('25/26');
      });
    });

    describe('same-year seasons (Jan-Dec)', () => {
      const startDate = '2000-01-01';  // January 1
      const endDate = '2000-12-31';   // December 31

      it('should return year for dates within season', () => {
        expect(getClubSeasonForDate('2024-01-01', startDate, endDate)).toBe('2024');
        expect(getClubSeasonForDate('2024-06-15', startDate, endDate)).toBe('2024');
        expect(getClubSeasonForDate('2024-12-31', startDate, endDate)).toBe('2024');
      });

      it('should never return off-season for full-year season', () => {
        expect(getClubSeasonForDate('2024-02-29', startDate, endDate)).toBe('2024');
        expect(getClubSeasonForDate('2024-07-04', startDate, endDate)).toBe('2024');
      });
    });

    describe('partial same-year seasons (Mar-Nov)', () => {
      const startDate = '2000-03-01';  // March 1
      const endDate = '2000-11-30';   // November 30

      it('should return year for dates within season', () => {
        expect(getClubSeasonForDate('2024-03-01', startDate, endDate)).toBe('2024');
        expect(getClubSeasonForDate('2024-07-15', startDate, endDate)).toBe('2024');
        expect(getClubSeasonForDate('2024-11-30', startDate, endDate)).toBe('2024');
      });

      it('should return off-season for dates outside season', () => {
        expect(getClubSeasonForDate('2024-01-15', startDate, endDate)).toBe('off-season');
        expect(getClubSeasonForDate('2024-02-28', startDate, endDate)).toBe('off-season');
        expect(getClubSeasonForDate('2024-12-01', startDate, endDate)).toBe('off-season');
      });
    });

    it('should use default values when not provided', () => {
      // Default is Oct-May
      expect(getClubSeasonForDate('2024-11-01')).toBe('24/25');
      expect(getClubSeasonForDate('2024-07-01')).toBe('off-season');
    });
  });

  describe('getClubSeasonDisplayLabel', () => {
    it('should format cross-year season labels', () => {
      expect(getClubSeasonDisplayLabel('24/25', '2000-10-01', '2000-05-01')).toBe('Oct 1, 2024 - May 1, 2025');
      expect(getClubSeasonDisplayLabel('23/24', '2000-10-01', '2000-05-01')).toBe('Oct 1, 2023 - May 1, 2024');
    });

    it('should format same-year season labels', () => {
      expect(getClubSeasonDisplayLabel('2024', '2000-01-01', '2000-12-31')).toBe('Jan 1 - Dec 31, 2024');
      expect(getClubSeasonDisplayLabel('2023', '2000-03-01', '2000-11-30')).toBe('Mar 1 - Nov 30, 2023');
    });

    it('should handle off-season label', () => {
      expect(getClubSeasonDisplayLabel('off-season', '2000-10-01', '2000-05-01')).toBe('Off-Season');
    });

    it('should use default date values', () => {
      expect(getClubSeasonDisplayLabel('24/25')).toBe('Oct 1, 2024 - May 1, 2025');
    });
  });

  describe('extractClubSeasonsFromGames', () => {
    const games = [
      { gameDate: '2024-11-15' }, // 24/25
      { gameDate: '2025-02-20' }, // 24/25
      { gameDate: '2023-12-10' }, // 23/24
      { gameDate: '2024-01-05' }, // 23/24
      { gameDate: '2024-07-01' }, // off-season (excluded from results)
      { gameDate: undefined },     // no date
    ];

    it('should extract unique seasons from games (excluding off-season)', () => {
      const seasons = extractClubSeasonsFromGames(games, '2000-10-01', '2000-05-01');
      expect(seasons).toContain('24/25');
      expect(seasons).toContain('23/24');
      expect(seasons).not.toContain('off-season');
      expect(seasons.length).toBe(2);
    });

    it('should sort seasons newest first', () => {
      const seasons = extractClubSeasonsFromGames(games, '2000-10-01', '2000-05-01');
      expect(seasons[0]).toBe('24/25');
      expect(seasons[1]).toBe('23/24');
      expect(seasons.length).toBe(2);
    });

    it('should handle empty games array', () => {
      const seasons = extractClubSeasonsFromGames([], '2000-10-01', '2000-05-01');
      expect(seasons).toEqual([]);
    });

    it('should handle games with no dates', () => {
      const gamesNoDate = [
        { gameDate: undefined },
        { gameDate: undefined },
      ];
      const seasons = extractClubSeasonsFromGames(gamesNoDate, '2000-10-01', '2000-05-01');
      expect(seasons).toEqual([]);
    });

    it('should use default date values', () => {
      const seasons = extractClubSeasonsFromGames(games);
      expect(seasons).toContain('24/25');
    });
  });

  describe('filterGamesByClubSeason', () => {
    const games = [
      { id: '1', gameDate: '2024-11-15' }, // 24/25
      { id: '2', gameDate: '2025-02-20' }, // 24/25
      { id: '3', gameDate: '2023-12-10' }, // 23/24
      { id: '4', gameDate: '2024-01-05' }, // 23/24
      { id: '5', gameDate: '2024-07-01' }, // off-season
      { id: '6', gameDate: undefined },     // no date
    ];

    it('should filter games by specific season', () => {
      const filtered = filterGamesByClubSeason(games, '24/25', '2000-10-01', '2000-05-01');
      expect(filtered).toHaveLength(2);
      expect(filtered.map(g => g.id)).toEqual(['1', '2']);
    });

    it('should filter games for different season', () => {
      const filtered = filterGamesByClubSeason(games, '23/24', '2000-10-01', '2000-05-01');
      expect(filtered).toHaveLength(2);
      expect(filtered.map(g => g.id)).toEqual(['3', '4']);
    });

    it('should filter off-season games', () => {
      const filtered = filterGamesByClubSeason(games, 'off-season', '2000-10-01', '2000-05-01');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('5');
    });

    it('should return all games when seasonLabel is "all"', () => {
      const filtered = filterGamesByClubSeason(games, 'all', '2000-10-01', '2000-05-01');
      expect(filtered).toHaveLength(6);
    });

    it('should exclude games with no date', () => {
      const filtered = filterGamesByClubSeason(games, '24/25', '2000-10-01', '2000-05-01');
      expect(filtered.find(g => g.id === '6')).toBeUndefined();
    });

    it('should use default date values', () => {
      const filtered = filterGamesByClubSeason(games, '24/25');
      expect(filtered).toHaveLength(2);
    });

    it('should preserve game object properties', () => {
      const gamesWithProps = [
        { id: '1', gameDate: '2024-11-15', score: 3, opponent: 'Team A' },
      ];
      const filtered = filterGamesByClubSeason(gamesWithProps, '24/25', '2000-10-01', '2000-05-01');
      expect(filtered[0].score).toBe(3);
      expect(filtered[0].opponent).toBe('Team A');
    });
  });

  describe('getClubSeasonDateRange', () => {
    it('should return date range for cross-year season', () => {
      const range = getClubSeasonDateRange('24/25', '2000-10-01', '2000-05-01');
      expect(range).not.toBeNull();
      expect(range?.startDate).toBe('2024-10-01');
      expect(range?.endDate).toBe('2025-05-01');
    });

    it('should return date range for same-year season', () => {
      const range = getClubSeasonDateRange('2024', '2000-03-01', '2000-11-30');
      expect(range).not.toBeNull();
      expect(range?.startDate).toBe('2024-03-01');
      expect(range?.endDate).toBe('2024-11-30');
    });

    it('should return null for off-season', () => {
      const range = getClubSeasonDateRange('off-season', '2000-10-01', '2000-05-01');
      expect(range).toBeNull();
    });

    it('should return null for "all" label', () => {
      const range = getClubSeasonDateRange('all', '2000-10-01', '2000-05-01');
      expect(range).toBeNull();
    });

    it('should handle leap year correctly', () => {
      const range = getClubSeasonDateRange('2024', '2000-02-01', '2000-02-29'); // February only
      expect(range?.endDate).toBe('2024-02-29'); // 2024 is leap year
    });

    it('should handle non-leap year correctly', () => {
      const range = getClubSeasonDateRange('2023', '2000-02-01', '2000-02-28'); // February only
      expect(range?.endDate).toBe('2023-02-28'); // 2023 is not leap year
    });

    it('should use default date values', () => {
      const range = getClubSeasonDateRange('24/25');
      expect(range?.startDate).toBe('2024-10-01');
      expect(range?.endDate).toBe('2025-05-01');
    });
  });

  describe('edge cases', () => {
    it('should handle year 2000 boundary', () => {
      expect(getClubSeasonForDate('1999-11-01', '2000-10-01', '2000-05-01')).toBe('99/00');
      expect(getClubSeasonForDate('2000-03-01', '2000-10-01', '2000-05-01')).toBe('99/00');
    });

    it('should handle single-month season', () => {
      expect(getClubSeasonForDate('2024-06-15', '2000-06-01', '2000-06-30')).toBe('2024');
      expect(getClubSeasonForDate('2024-05-15', '2000-06-01', '2000-06-30')).toBe('off-season');
    });

    it('should handle reversed months (cross-year season)', () => {
      // Oct-May is a cross-year season
      // March is in the second half of the season (Jan-May)
      const result = getClubSeasonForDate('2024-03-15', '2000-10-01', '2000-05-01');
      expect(result).toBe('23/24'); // March is in second half of Oct-May season
    });
  });

  describe('invalid date format handling', () => {
    const mockLoggerWarn = logger.warn as jest.MockedFunction<typeof logger.warn>;

    beforeEach(() => {
      mockLoggerWarn.mockClear();
    });

    /**
     * Tests graceful handling of invalid date formats
     * @edge-case
     *
     * Protects against IndexedDB corruption or malformed data.
     * Returns "off-season" instead of throwing to maintain app stability.
     *
     * Note: This validates format (YYYY-MM-DD pattern), not value correctness.
     * Dates like '2024-13-01' pass format validation (JavaScript Date handles rollover).
     */
    it('should return "off-season" for invalid date formats', () => {
      const invalidFormats = [
        '2024/10/15',     // Wrong separator
        '10-15-2024',     // Wrong order (MM-DD-YYYY)
        '2024-10',        // Missing day
        '24-10-15',       // 2-digit year
        'invalid',        // Non-date string
        '',               // Empty string
        '2024-1-15',      // Non-zero-padded month
        '2024-10-1',      // Non-zero-padded day
      ];

      invalidFormats.forEach(invalidDate => {
        expect(getClubSeasonForDate(invalidDate, '2000-10-01', '2000-05-01')).toBe('off-season');
        expect(mockLoggerWarn).toHaveBeenCalledWith(
          '[getClubSeasonForDate] Invalid date format (expected YYYY-MM-DD):',
          invalidDate
        );
        mockLoggerWarn.mockClear();
      });
    });

    it('should handle dates with invalid month/day values (JavaScript Invalid Date)', () => {
      // These pass format validation but have invalid calendar values
      // JavaScript Date constructor returns Invalid Date (NaN for all fields)
      // e.g., new Date('2024-13-01T00:00:00Z') → Invalid Date
      const result1 = getClubSeasonForDate('2024-13-01', '2000-10-01', '2000-05-01');
      const result2 = getClubSeasonForDate('2024-10-32', '2000-10-01', '2000-05-01');

      // Should NOT log warnings (format is valid, regex check passes)
      expect(mockLoggerWarn).not.toHaveBeenCalled();

      // Invalid Date causes NaN comparisons, falls through to 'off-season'
      expect(result1).toBe('off-season');
      expect(result2).toBe('off-season');
    });

    it('should accept valid ISO date formats', () => {
      // Verify validation doesn't reject valid dates
      expect(getClubSeasonForDate('2024-10-15', '2000-10-01', '2000-05-01')).toBe('24/25');
      expect(getClubSeasonForDate('2024-01-01', '2000-10-01', '2000-05-01')).toBe('23/24');
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });

  describe('validateSeasonDates', () => {
    it('should reject zero-length seasons (start equals end)', () => {
      expect(validateSeasonDates('2000-10-01', '2000-10-01')).toBe(false);
      expect(validateSeasonDates('2000-05-15', '2000-05-15')).toBe(false);
      expect(validateSeasonDates('2000-12-31', '2000-12-31')).toBe(false);
    });

    it('should allow seasons that differ by one day', () => {
      expect(validateSeasonDates('2000-10-01', '2000-10-02')).toBe(true);
      expect(validateSeasonDates('2000-05-15', '2000-05-16')).toBe(true);
    });

    it('should accept valid cross-year seasons', () => {
      expect(validateSeasonDates('2000-10-01', '2000-05-01')).toBe(true);
      expect(validateSeasonDates('2000-12-15', '2000-02-10')).toBe(true);
    });

    it('should accept valid same-year seasons', () => {
      expect(validateSeasonDates('2000-01-01', '2000-12-31')).toBe(true);
      expect(validateSeasonDates('2000-03-01', '2000-11-30')).toBe(true);
    });

    it('should reject invalid date formats', () => {
      expect(validateSeasonDates('invalid', '2000-05-01')).toBe(false);
      expect(validateSeasonDates('2000-10-01', 'invalid')).toBe(false);
      expect(validateSeasonDates('10-01', '05-01')).toBe(false);
    });

    it('should reject invalid calendar dates', () => {
      expect(validateSeasonDates('2000-13-01', '2000-05-01')).toBe(false); // Invalid month
      expect(validateSeasonDates('2000-02-30', '2000-05-01')).toBe(false); // Invalid day
      expect(validateSeasonDates('2000-10-01', '2000-02-31')).toBe(false); // Invalid day
    });
  });
});
