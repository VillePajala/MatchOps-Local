import {
  getClubSeasonForDate,
  getClubSeasonDisplayLabel,
  extractClubSeasonsFromGames,
  filterGamesByClubSeason,
  getClubSeasonDateRange,
  validateSeasonDates,
} from './clubSeason';

describe('clubSeason utilities', () => {
  describe('getClubSeasonForDate', () => {
    describe('cross-year seasons (Oct 1 - May 1)', () => {
      const startDate = '2000-10-01'; // October 1st
      const endDate = '2000-05-01';   // May 1st

      it('should return correct season for first half (Oct-Dec)', () => {
        expect(getClubSeasonForDate('2024-10-01', startDate, endDate)).toBe('24/25');
        expect(getClubSeasonForDate('2024-11-15', startDate, endDate)).toBe('24/25');
        expect(getClubSeasonForDate('2024-12-31', startDate, endDate)).toBe('24/25');
      });

      it('should return correct season for second half (Jan-May 1)', () => {
        expect(getClubSeasonForDate('2025-01-01', startDate, endDate)).toBe('24/25');
        expect(getClubSeasonForDate('2025-02-20', startDate, endDate)).toBe('24/25');
        expect(getClubSeasonForDate('2025-05-01', startDate, endDate)).toBe('24/25');
      });

      it('should return off-season for summer months (May 2 - Sep 30)', () => {
        expect(getClubSeasonForDate('2024-05-02', startDate, endDate)).toBe('off-season');
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

    describe('same-year seasons (Jan 1 - Dec 31)', () => {
      const startDate = '2000-01-01';  // January 1st
      const endDate = '2000-12-31';    // December 31st

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

    describe('partial same-year seasons (Mar 1 - Nov 30)', () => {
      const startDate = '2000-03-01';  // March 1st
      const endDate = '2000-11-30';    // November 30th

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
      // Default is Oct 1 - May 1
      expect(getClubSeasonForDate('2024-11-01')).toBe('24/25');
      expect(getClubSeasonForDate('2024-07-01')).toBe('off-season');
    });
  });

  describe('getClubSeasonDisplayLabel', () => {
    it('should return "Off-Season" for off-season label', () => {
      expect(getClubSeasonDisplayLabel('off-season')).toBe('Off-Season');
    });

    it('should format cross-year season with dates', () => {
      const result = getClubSeasonDisplayLabel('24/25', '2000-10-01', '2000-05-01');
      expect(result).toBe('Oct 1, 2024 - May 1, 2025');
    });

    it('should format same-year season with dates', () => {
      const result = getClubSeasonDisplayLabel('2024', '2000-01-01', '2000-12-31');
      expect(result).toBe('Jan 1 - Dec 31, 2024');
    });

    it('should handle different day values', () => {
      const result = getClubSeasonDisplayLabel('24/25', '2000-10-15', '2000-05-20');
      expect(result).toBe('Oct 15, 2024 - May 20, 2025');
    });

    it('should use default dates when not provided', () => {
      const result = getClubSeasonDisplayLabel('24/25');
      expect(result).toBe('Oct 1, 2024 - May 1, 2025');
    });
  });

  describe('extractClubSeasonsFromGames', () => {
    it('should extract unique seasons from games', () => {
      const games = [
        { gameDate: '2024-10-01' },  // 24/25
        { gameDate: '2024-11-15' },  // 24/25
        { gameDate: '2025-02-20' },  // 24/25
        { gameDate: '2023-10-15' },  // 23/24
        { gameDate: '2024-07-01' },  // off-season
      ];

      const seasons = extractClubSeasonsFromGames(games, '2000-10-01', '2000-05-01');

      expect(seasons).toEqual(['24/25', '23/24', 'off-season']);
    });

    it('should handle games without dates', () => {
      const games = [
        { gameDate: '2024-10-01' },
        { id: 'no-date' }, // Missing gameDate
        { gameDate: '2024-11-15' },
      ];

      const seasons = extractClubSeasonsFromGames(games, '2000-10-01', '2000-05-01');

      expect(seasons).toEqual(['24/25']);
    });

    it('should return empty array for empty games', () => {
      expect(extractClubSeasonsFromGames([], '2000-10-01', '2000-05-01')).toEqual([]);
    });
  });

  describe('filterGamesByClubSeason', () => {
    const games = [
      { id: '1', gameDate: '2024-10-01' },  // 24/25
      { id: '2', gameDate: '2024-11-15' },  // 24/25
      { id: '3', gameDate: '2025-02-20' },  // 24/25
      { id: '4', gameDate: '2023-10-15' },  // 23/24
      { id: '5', gameDate: '2024-07-01' },  // off-season
      { id: '6' },                          // no date
    ];

    it('should filter games by specific season', () => {
      const filtered = filterGamesByClubSeason(games, '24/25', '2000-10-01', '2000-05-01');
      expect(filtered).toHaveLength(3);
      expect(filtered.map(g => g.id)).toEqual(['1', '2', '3']);
    });

    it('should filter off-season games', () => {
      const filtered = filterGamesByClubSeason(games, 'off-season', '2000-10-01', '2000-05-01');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('5');
    });

    it('should return all games for "all" season', () => {
      const filtered = filterGamesByClubSeason(games, 'all', '2000-10-01', '2000-05-01');
      expect(filtered).toHaveLength(6);
    });

    it('should exclude games without dates', () => {
      const filtered = filterGamesByClubSeason(games, '24/25', '2000-10-01', '2000-05-01');
      expect(filtered.every(g => g.gameDate)).toBe(true);
    });

    it('should return empty array when no games match', () => {
      const filtered = filterGamesByClubSeason(games, '25/26', '2000-10-01', '2000-05-01');
      expect(filtered).toEqual([]);
    });
  });

  describe('getClubSeasonDateRange', () => {
    it('should return null for off-season', () => {
      expect(getClubSeasonDateRange('off-season', '2000-10-01', '2000-05-01')).toBeNull();
    });

    it('should return null for "all" season', () => {
      expect(getClubSeasonDateRange('all', '2000-10-01', '2000-05-01')).toBeNull();
    });

    it('should return correct range for cross-year season', () => {
      const range = getClubSeasonDateRange('24/25', '2000-10-01', '2000-05-01');
      expect(range).toEqual({
        startDate: '2024-10-01',
        endDate: '2025-05-01'
      });
    });

    it('should return correct range for same-year season', () => {
      const range = getClubSeasonDateRange('2024', '2000-01-01', '2000-12-31');
      expect(range).toEqual({
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      });
    });

    it('should handle different day values', () => {
      const range = getClubSeasonDateRange('24/25', '2000-10-15', '2000-05-20');
      expect(range).toEqual({
        startDate: '2024-10-15',
        endDate: '2025-05-20'
      });
    });
  });

  describe('validateSeasonDates', () => {
    it('should validate correct ISO dates', () => {
      expect(validateSeasonDates('2000-10-01', '2000-05-01')).toBe(true);
      expect(validateSeasonDates('2000-01-01', '2000-12-31')).toBe(true);
      expect(validateSeasonDates('2000-06-15', '2000-09-30')).toBe(true);
    });

    it('should reject invalid month', () => {
      expect(validateSeasonDates('2000-13-01', '2000-05-01')).toBe(false);
      expect(validateSeasonDates('2000-10-01', '2000-00-01')).toBe(false);
    });

    it('should reject invalid day', () => {
      expect(validateSeasonDates('2000-10-32', '2000-05-01')).toBe(false);
      expect(validateSeasonDates('2000-02-30', '2000-05-01')).toBe(false);
    });

    it('should reject invalid format', () => {
      expect(validateSeasonDates('invalid', '2000-05-01')).toBe(false);
      expect(validateSeasonDates('2000-10-01', 'invalid')).toBe(false);
      expect(validateSeasonDates('10-01-2000', '05-01-2000')).toBe(false);
    });

    it('should reject non-ISO formats', () => {
      expect(validateSeasonDates('2000/10/01', '2000/05/01')).toBe(false);
      expect(validateSeasonDates('01-10-2000', '01-05-2000')).toBe(false);
    });

    it('should reject zero-length seasons (start equals end)', () => {
      expect(validateSeasonDates('2000-10-01', '2000-10-01')).toBe(false);
      expect(validateSeasonDates('2000-05-15', '2000-05-15')).toBe(false);
      expect(validateSeasonDates('2000-12-31', '2000-12-31')).toBe(false);
    });

    it('should allow seasons that differ by one day', () => {
      expect(validateSeasonDates('2000-10-01', '2000-10-02')).toBe(true);
      expect(validateSeasonDates('2000-05-15', '2000-05-16')).toBe(true);
    });
  });
});
