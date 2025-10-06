import {
  getClubSeasonForDate,
  getClubSeasonDisplayLabel,
  extractClubSeasonsFromGames,
  filterGamesByClubSeason,
  getClubSeasonDateRange,
  validateSeasonMonths,
} from './clubSeason';

describe('clubSeason utilities', () => {
  describe('getClubSeasonForDate', () => {
    describe('cross-year seasons (Oct-May)', () => {
      const startMonth = 10; // October
      const endMonth = 5;    // May

      it('should return correct season for first half (Oct-Dec)', () => {
        expect(getClubSeasonForDate('2024-10-01', startMonth, endMonth)).toBe('24/25');
        expect(getClubSeasonForDate('2024-11-15', startMonth, endMonth)).toBe('24/25');
        expect(getClubSeasonForDate('2024-12-31', startMonth, endMonth)).toBe('24/25');
      });

      it('should return correct season for second half (Jan-May)', () => {
        expect(getClubSeasonForDate('2025-01-01', startMonth, endMonth)).toBe('24/25');
        expect(getClubSeasonForDate('2025-02-20', startMonth, endMonth)).toBe('24/25');
        expect(getClubSeasonForDate('2025-05-31', startMonth, endMonth)).toBe('24/25');
      });

      it('should return off-season for summer months (Jun-Sep)', () => {
        expect(getClubSeasonForDate('2024-06-01', startMonth, endMonth)).toBe('off-season');
        expect(getClubSeasonForDate('2024-07-15', startMonth, endMonth)).toBe('off-season');
        expect(getClubSeasonForDate('2024-08-20', startMonth, endMonth)).toBe('off-season');
        expect(getClubSeasonForDate('2024-09-30', startMonth, endMonth)).toBe('off-season');
      });

      it('should handle different years correctly', () => {
        expect(getClubSeasonForDate('2023-11-01', startMonth, endMonth)).toBe('23/24');
        expect(getClubSeasonForDate('2024-03-15', startMonth, endMonth)).toBe('23/24');
        expect(getClubSeasonForDate('2025-10-01', startMonth, endMonth)).toBe('25/26');
      });
    });

    describe('same-year seasons (Jan-Dec)', () => {
      const startMonth = 1;  // January
      const endMonth = 12;   // December

      it('should return year for dates within season', () => {
        expect(getClubSeasonForDate('2024-01-01', startMonth, endMonth)).toBe('2024');
        expect(getClubSeasonForDate('2024-06-15', startMonth, endMonth)).toBe('2024');
        expect(getClubSeasonForDate('2024-12-31', startMonth, endMonth)).toBe('2024');
      });

      it('should never return off-season for full-year season', () => {
        expect(getClubSeasonForDate('2024-02-29', startMonth, endMonth)).toBe('2024');
        expect(getClubSeasonForDate('2024-07-04', startMonth, endMonth)).toBe('2024');
      });
    });

    describe('partial same-year seasons (Mar-Nov)', () => {
      const startMonth = 3;  // March
      const endMonth = 11;   // November

      it('should return year for dates within season', () => {
        expect(getClubSeasonForDate('2024-03-01', startMonth, endMonth)).toBe('2024');
        expect(getClubSeasonForDate('2024-07-15', startMonth, endMonth)).toBe('2024');
        expect(getClubSeasonForDate('2024-11-30', startMonth, endMonth)).toBe('2024');
      });

      it('should return off-season for dates outside season', () => {
        expect(getClubSeasonForDate('2024-01-15', startMonth, endMonth)).toBe('off-season');
        expect(getClubSeasonForDate('2024-02-28', startMonth, endMonth)).toBe('off-season');
        expect(getClubSeasonForDate('2024-12-01', startMonth, endMonth)).toBe('off-season');
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
      expect(getClubSeasonDisplayLabel('24/25', 10, 5)).toBe('Oct 2024 - May 2025');
      expect(getClubSeasonDisplayLabel('23/24', 10, 5)).toBe('Oct 2023 - May 2024');
    });

    it('should format same-year season labels', () => {
      expect(getClubSeasonDisplayLabel('2024', 1, 12)).toBe('Jan - Dec 2024');
      expect(getClubSeasonDisplayLabel('2023', 3, 11)).toBe('Mar - Nov 2023');
    });

    it('should handle off-season label', () => {
      expect(getClubSeasonDisplayLabel('off-season', 10, 5)).toBe('Off-Season');
    });

    it('should use default month values', () => {
      expect(getClubSeasonDisplayLabel('24/25')).toBe('Oct 2024 - May 2025');
    });
  });

  describe('extractClubSeasonsFromGames', () => {
    const games = [
      { gameDate: '2024-11-15' }, // 24/25
      { gameDate: '2025-02-20' }, // 24/25
      { gameDate: '2023-12-10' }, // 23/24
      { gameDate: '2024-01-05' }, // 23/24
      { gameDate: '2024-07-01' }, // off-season
      { gameDate: undefined },     // no date
    ];

    it('should extract unique seasons from games', () => {
      const seasons = extractClubSeasonsFromGames(games, 10, 5);
      expect(seasons).toContain('24/25');
      expect(seasons).toContain('23/24');
      expect(seasons).toContain('off-season');
      expect(seasons.length).toBe(3);
    });

    it('should sort seasons newest first', () => {
      const seasons = extractClubSeasonsFromGames(games, 10, 5);
      expect(seasons[0]).toBe('24/25');
      expect(seasons[1]).toBe('23/24');
      // off-season should be last
      expect(seasons[seasons.length - 1]).toBe('off-season');
    });

    it('should handle empty games array', () => {
      const seasons = extractClubSeasonsFromGames([], 10, 5);
      expect(seasons).toEqual([]);
    });

    it('should handle games with no dates', () => {
      const gamesNoDate = [
        { gameDate: undefined },
        { gameDate: undefined },
      ];
      const seasons = extractClubSeasonsFromGames(gamesNoDate, 10, 5);
      expect(seasons).toEqual([]);
    });

    it('should use default month values', () => {
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
      const filtered = filterGamesByClubSeason(games, '24/25', 10, 5);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(g => g.id)).toEqual(['1', '2']);
    });

    it('should filter games for different season', () => {
      const filtered = filterGamesByClubSeason(games, '23/24', 10, 5);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(g => g.id)).toEqual(['3', '4']);
    });

    it('should filter off-season games', () => {
      const filtered = filterGamesByClubSeason(games, 'off-season', 10, 5);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('5');
    });

    it('should return all games when seasonLabel is "all"', () => {
      const filtered = filterGamesByClubSeason(games, 'all', 10, 5);
      expect(filtered).toHaveLength(6);
    });

    it('should exclude games with no date', () => {
      const filtered = filterGamesByClubSeason(games, '24/25', 10, 5);
      expect(filtered.find(g => g.id === '6')).toBeUndefined();
    });

    it('should use default month values', () => {
      const filtered = filterGamesByClubSeason(games, '24/25');
      expect(filtered).toHaveLength(2);
    });

    it('should preserve game object properties', () => {
      const gamesWithProps = [
        { id: '1', gameDate: '2024-11-15', score: 3, opponent: 'Team A' },
      ];
      const filtered = filterGamesByClubSeason(gamesWithProps, '24/25', 10, 5);
      expect(filtered[0].score).toBe(3);
      expect(filtered[0].opponent).toBe('Team A');
    });
  });

  describe('getClubSeasonDateRange', () => {
    it('should return date range for cross-year season', () => {
      const range = getClubSeasonDateRange('24/25', 10, 5);
      expect(range).not.toBeNull();
      expect(range?.startDate).toBe('2024-10-01');
      expect(range?.endDate).toBe('2025-05-31');
    });

    it('should return date range for same-year season', () => {
      const range = getClubSeasonDateRange('2024', 3, 11);
      expect(range).not.toBeNull();
      expect(range?.startDate).toBe('2024-03-01');
      expect(range?.endDate).toBe('2024-11-30');
    });

    it('should return null for off-season', () => {
      const range = getClubSeasonDateRange('off-season', 10, 5);
      expect(range).toBeNull();
    });

    it('should return null for "all" label', () => {
      const range = getClubSeasonDateRange('all', 10, 5);
      expect(range).toBeNull();
    });

    it('should handle leap year correctly', () => {
      const range = getClubSeasonDateRange('2024', 2, 2); // February only
      expect(range?.endDate).toBe('2024-02-29'); // 2024 is leap year
    });

    it('should handle non-leap year correctly', () => {
      const range = getClubSeasonDateRange('2023', 2, 2); // February only
      expect(range?.endDate).toBe('2023-02-28'); // 2023 is not leap year
    });

    it('should use default month values', () => {
      const range = getClubSeasonDateRange('24/25');
      expect(range?.startDate).toBe('2024-10-01');
      expect(range?.endDate).toBe('2025-05-31');
    });
  });

  describe('edge cases', () => {
    it('should handle year 2000 boundary', () => {
      expect(getClubSeasonForDate('1999-11-01', 10, 5)).toBe('99/00');
      expect(getClubSeasonForDate('2000-03-01', 10, 5)).toBe('99/00');
    });

    it('should handle single-month season', () => {
      expect(getClubSeasonForDate('2024-06-15', 6, 6)).toBe('2024');
      expect(getClubSeasonForDate('2024-05-15', 6, 6)).toBe('off-season');
    });

    it('should handle reversed months (invalid config)', () => {
      // This tests behavior when start > end but within same year logic
      // Should treat as cross-year season
      const result = getClubSeasonForDate('2024-03-15', 10, 5);
      expect(result).toBe('23/24'); // March is in second half of Oct-May season
    });
  });

  describe('validateSeasonMonths', () => {
    it('should return true for valid months', () => {
      expect(validateSeasonMonths(1, 12)).toBe(true);
      expect(validateSeasonMonths(10, 5)).toBe(true);
      expect(validateSeasonMonths(6, 6)).toBe(true);
      expect(validateSeasonMonths(1, 1)).toBe(true);
      expect(validateSeasonMonths(12, 12)).toBe(true);
    });

    it('should return false for invalid start month (< 1)', () => {
      expect(validateSeasonMonths(0, 5)).toBe(false);
      expect(validateSeasonMonths(-1, 5)).toBe(false);
      expect(validateSeasonMonths(-10, 5)).toBe(false);
    });

    it('should return false for invalid start month (> 12)', () => {
      expect(validateSeasonMonths(13, 5)).toBe(false);
      expect(validateSeasonMonths(20, 5)).toBe(false);
    });

    it('should return false for invalid end month (< 1)', () => {
      expect(validateSeasonMonths(10, 0)).toBe(false);
      expect(validateSeasonMonths(10, -1)).toBe(false);
      expect(validateSeasonMonths(10, -5)).toBe(false);
    });

    it('should return false for invalid end month (> 12)', () => {
      expect(validateSeasonMonths(10, 13)).toBe(false);
      expect(validateSeasonMonths(10, 20)).toBe(false);
    });

    it('should return false for both months invalid', () => {
      expect(validateSeasonMonths(0, 0)).toBe(false);
      expect(validateSeasonMonths(13, 13)).toBe(false);
      expect(validateSeasonMonths(-1, 20)).toBe(false);
    });
  });
});
