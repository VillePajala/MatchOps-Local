import {
  CLUB_SEASON_OFF_SEASON,
  extractYearFromDate,
  getSeasonDisplayName,
  getTournamentDisplayName,
} from './entityDisplayNames';

describe('entityDisplayNames', () => {
  describe('CLUB_SEASON_OFF_SEASON constant', () => {
    it('should be defined as "off-season"', () => {
      expect(CLUB_SEASON_OFF_SEASON).toBe('off-season');
    });

    it('should be a string type', () => {
      expect(typeof CLUB_SEASON_OFF_SEASON).toBe('string');
    });
  });

  describe('extractYearFromDate', () => {
    describe('valid dates', () => {
      it('should extract year from valid ISO date', () => {
        expect(extractYearFromDate('2024-10-15')).toBe('2024');
        expect(extractYearFromDate('2023-01-01')).toBe('2023');
        expect(extractYearFromDate('2025-12-31')).toBe('2025');
      });

      it('should extract year from dates at year boundaries', () => {
        expect(extractYearFromDate('2000-01-01')).toBe('2000');
        expect(extractYearFromDate('1999-12-31')).toBe('1999');
        expect(extractYearFromDate('2099-06-15')).toBe('2099');
      });

      it('should handle leap year dates', () => {
        expect(extractYearFromDate('2024-02-29')).toBe('2024');
        expect(extractYearFromDate('2020-02-29')).toBe('2020');
      });
    });

    describe('invalid inputs', () => {
      it('should return null for undefined', () => {
        expect(extractYearFromDate(undefined)).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(extractYearFromDate('')).toBeNull();
      });

      it('should return null for non-string types', () => {
        // @ts-expect-error - testing runtime behavior with wrong types
        expect(extractYearFromDate(null)).toBeNull();
        // @ts-expect-error - testing runtime behavior with wrong types
        expect(extractYearFromDate(2024)).toBeNull();
        // @ts-expect-error - testing runtime behavior with wrong types
        expect(extractYearFromDate({ year: 2024 })).toBeNull();
      });

      it('should return null for invalid date formats without leading year', () => {
        expect(extractYearFromDate('24-10-15')).toBeNull(); // 2-digit year
        expect(extractYearFromDate('10-15-2024')).toBeNull(); // MM-DD-YYYY (year not at start)
        expect(extractYearFromDate('invalid')).toBeNull(); // non-date string
      });

      it('should extract year from various formats with leading year (lenient)', () => {
        // The function is lenient - extracts year from any string starting with 4 digits
        // This supports backward compatibility with various date formats
        expect(extractYearFromDate('2024/10/15')).toBe('2024'); // slash separator
        expect(extractYearFromDate('2024')).toBe('2024'); // year only
        expect(extractYearFromDate('2024-10')).toBe('2024'); // partial date
      });
    });

    describe('year range validation', () => {
      it('should return null for years before 1900', () => {
        expect(extractYearFromDate('1899-12-31')).toBeNull();
        expect(extractYearFromDate('1800-06-15')).toBeNull();
        expect(extractYearFromDate('0001-01-01')).toBeNull();
      });

      it('should return null for years after 2100', () => {
        expect(extractYearFromDate('2101-01-01')).toBeNull();
        expect(extractYearFromDate('2200-06-15')).toBeNull();
        expect(extractYearFromDate('3000-12-31')).toBeNull();
      });

      it('should accept years at range boundaries', () => {
        expect(extractYearFromDate('1900-01-01')).toBe('1900');
        expect(extractYearFromDate('2100-12-31')).toBe('2100');
      });
    });
  });

  describe('getSeasonDisplayName', () => {
    describe('with valid clubSeason', () => {
      it('should append clubSeason to name', () => {
        const season = { name: 'EKK Kortteli', clubSeason: '24/25', startDate: '2024-10-01' };
        expect(getSeasonDisplayName(season)).toBe('EKK Kortteli 24/25');
      });

      it('should handle different clubSeason formats', () => {
        expect(getSeasonDisplayName({ name: 'Test', clubSeason: '23/24' })).toBe('Test 23/24');
        expect(getSeasonDisplayName({ name: 'Test', clubSeason: '2024' })).toBe('Test 2024');
        expect(getSeasonDisplayName({ name: 'Test', clubSeason: '99/00' })).toBe('Test 99/00');
      });
    });

    describe('with off-season clubSeason', () => {
      it('should fallback to year from startDate', () => {
        const season = { name: 'Summer Camp', clubSeason: 'off-season', startDate: '2024-06-15' };
        expect(getSeasonDisplayName(season)).toBe('Summer Camp (2024)');
      });

      it('should use custom yearFormat option', () => {
        const season = { name: 'Summer Camp', clubSeason: 'off-season', startDate: '2024-06-15' };
        expect(getSeasonDisplayName(season, { yearFormat: '[{year}]' })).toBe('Summer Camp [2024]');
        expect(getSeasonDisplayName(season, { yearFormat: '{year}' })).toBe('Summer Camp 2024');
      });

      it('should return name only if startDate is invalid', () => {
        const season = { name: 'Summer Camp', clubSeason: 'off-season', startDate: 'invalid' };
        expect(getSeasonDisplayName(season)).toBe('Summer Camp');
      });

      it('should return name only if startDate is missing', () => {
        const season = { name: 'Summer Camp', clubSeason: 'off-season' };
        expect(getSeasonDisplayName(season)).toBe('Summer Camp');
      });
    });

    describe('without clubSeason', () => {
      it('should fallback to year from startDate when clubSeason is undefined', () => {
        const season = { name: 'EKK Kortteli', startDate: '2024-10-01' };
        expect(getSeasonDisplayName(season)).toBe('EKK Kortteli (2024)');
      });

      it('should fallback to year from startDate when clubSeason is empty string', () => {
        const season = { name: 'EKK Kortteli', clubSeason: '', startDate: '2024-10-01' };
        expect(getSeasonDisplayName(season)).toBe('EKK Kortteli (2024)');
      });

      it('should return name only when no clubSeason and no startDate', () => {
        const season = { name: 'EKK Kortteli' };
        expect(getSeasonDisplayName(season)).toBe('EKK Kortteli');
      });

      it('should return name only when startDate is invalid', () => {
        const season = { name: 'EKK Kortteli', startDate: 'not-a-date' };
        expect(getSeasonDisplayName(season)).toBe('EKK Kortteli');
      });
    });

    describe('edge cases', () => {
      it('should handle empty name', () => {
        const season = { name: '', clubSeason: '24/25' };
        expect(getSeasonDisplayName(season)).toBe(' 24/25');
      });

      it('should handle name with special characters', () => {
        const season = { name: 'EKK / Kortteli (Test)', clubSeason: '24/25' };
        expect(getSeasonDisplayName(season)).toBe('EKK / Kortteli (Test) 24/25');
      });

      it('should handle name with unicode characters', () => {
        const season = { name: 'Pääsarjä', clubSeason: '24/25' };
        expect(getSeasonDisplayName(season)).toBe('Pääsarjä 24/25');
      });
    });
  });

  describe('getTournamentDisplayName', () => {
    describe('with valid clubSeason', () => {
      it('should append clubSeason to name', () => {
        const tournament = { name: 'Helsinki Cup', clubSeason: '24/25', startDate: '2024-11-01' };
        expect(getTournamentDisplayName(tournament)).toBe('Helsinki Cup 24/25');
      });

      it('should handle different clubSeason formats', () => {
        expect(getTournamentDisplayName({ name: 'Cup', clubSeason: '23/24' })).toBe('Cup 23/24');
        expect(getTournamentDisplayName({ name: 'Cup', clubSeason: '2024' })).toBe('Cup 2024');
      });
    });

    describe('with off-season clubSeason', () => {
      it('should fallback to year from startDate', () => {
        const tournament = { name: 'Summer Tournament', clubSeason: 'off-season', startDate: '2024-07-01' };
        expect(getTournamentDisplayName(tournament)).toBe('Summer Tournament (2024)');
      });

      it('should use custom yearFormat option', () => {
        const tournament = { name: 'Summer Cup', clubSeason: 'off-season', startDate: '2024-07-01' };
        expect(getTournamentDisplayName(tournament, { yearFormat: '- {year}' })).toBe('Summer Cup - 2024');
      });
    });

    describe('without clubSeason', () => {
      it('should fallback to year from startDate', () => {
        const tournament = { name: 'Helsinki Cup', startDate: '2024-11-01' };
        expect(getTournamentDisplayName(tournament)).toBe('Helsinki Cup (2024)');
      });

      it('should return name only when no clubSeason and no startDate', () => {
        const tournament = { name: 'Helsinki Cup' };
        expect(getTournamentDisplayName(tournament)).toBe('Helsinki Cup');
      });
    });

    describe('consistency with getSeasonDisplayName', () => {
      it('should behave identically for same inputs', () => {
        const entity1 = { name: 'Test', clubSeason: '24/25' };
        const entity2 = { name: 'Test', clubSeason: 'off-season', startDate: '2024-06-01' };
        const entity3 = { name: 'Test', startDate: '2024-06-01' };
        const entity4 = { name: 'Test' };

        expect(getTournamentDisplayName(entity1)).toBe(getSeasonDisplayName(entity1));
        expect(getTournamentDisplayName(entity2)).toBe(getSeasonDisplayName(entity2));
        expect(getTournamentDisplayName(entity3)).toBe(getSeasonDisplayName(entity3));
        expect(getTournamentDisplayName(entity4)).toBe(getSeasonDisplayName(entity4));
      });
    });
  });

  describe('real-world scenarios', () => {
    /**
     * @integration
     * Tests display names as they would appear in dropdowns and lists
     */
    describe('dropdown display values', () => {
      it('should show distinguishable names for same-name seasons in different years', () => {
        const season2024 = { name: 'EKK Kortteli', clubSeason: '24/25', startDate: '2024-10-01' };
        const season2023 = { name: 'EKK Kortteli', clubSeason: '23/24', startDate: '2023-10-01' };

        const display2024 = getSeasonDisplayName(season2024);
        const display2023 = getSeasonDisplayName(season2023);

        expect(display2024).not.toBe(display2023);
        expect(display2024).toBe('EKK Kortteli 24/25');
        expect(display2023).toBe('EKK Kortteli 23/24');
      });

      it('should show distinguishable names for off-season entities in different years', () => {
        const summer2024 = { name: 'Summer Camp', clubSeason: 'off-season', startDate: '2024-06-15' };
        const summer2023 = { name: 'Summer Camp', clubSeason: 'off-season', startDate: '2023-06-15' };

        const display2024 = getSeasonDisplayName(summer2024);
        const display2023 = getSeasonDisplayName(summer2023);

        expect(display2024).not.toBe(display2023);
        expect(display2024).toBe('Summer Camp (2024)');
        expect(display2023).toBe('Summer Camp (2023)');
      });

      it('should handle legacy data without clubSeason', () => {
        const legacySeason = { name: 'Old Season', startDate: '2022-09-01' };
        expect(getSeasonDisplayName(legacySeason)).toBe('Old Season (2022)');
      });

      it('should handle very old data without any dates', () => {
        const veryOldSeason = { name: 'Ancient Season' };
        expect(getSeasonDisplayName(veryOldSeason)).toBe('Ancient Season');
      });
    });

    /**
     * @edge-case
     * Tests backward compatibility with corrupted or missing data
     */
    describe('corrupted data handling', () => {
      it('should gracefully handle corrupted startDate', () => {
        const corrupted = { name: 'Test', clubSeason: 'off-season', startDate: 'corrupted-value' };
        expect(getSeasonDisplayName(corrupted)).toBe('Test');
      });

      it('should extract year from partial date string (lenient)', () => {
        const partial = { name: 'Test', startDate: '2024' };
        // extractYearFromDate is lenient - extracts year from any string starting with 4 digits
        expect(getSeasonDisplayName(partial)).toBe('Test (2024)');
      });

      it('should prioritize clubSeason over startDate when valid', () => {
        const entity = { name: 'Test', clubSeason: '24/25', startDate: 'corrupted' };
        expect(getSeasonDisplayName(entity)).toBe('Test 24/25');
      });
    });
  });
});
