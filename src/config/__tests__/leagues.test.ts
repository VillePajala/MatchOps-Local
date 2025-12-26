/**
 * @fileoverview Tests for Finnish youth league utilities
 * TDD: These tests are written BEFORE the implementation
 */

import {
  FINNISH_YOUTH_LEAGUES,
  CUSTOM_LEAGUE_ID,
  LEAGUE_AREA_FILTERS,
  LEAGUE_LEVEL_FILTERS,
  getLeagueById,
  getLeagueName,
  isValidLeagueId,
} from '../leagues';

describe('Finnish Youth Leagues Configuration', () => {
  describe('FINNISH_YOUTH_LEAGUES constant', () => {
    it('should contain 34 leagues', () => {
      expect(FINNISH_YOUTH_LEAGUES).toHaveLength(34);
    });

    it('should have unique IDs for all leagues', () => {
      const ids = FINNISH_YOUTH_LEAGUES.map(l => l.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have CUSTOM_LEAGUE_ID as the last entry with isCustom flag', () => {
      const lastLeague = FINNISH_YOUTH_LEAGUES[FINNISH_YOUTH_LEAGUES.length - 1];
      expect(lastLeague.id).toBe(CUSTOM_LEAGUE_ID);
      expect(lastLeague.isCustom).toBe(true);
    });

    it('should have CUSTOM_LEAGUE_ID equal to "muu"', () => {
      expect(CUSTOM_LEAGUE_ID).toBe('muu');
    });

    it('should include national leagues (Valtakunnallinen)', () => {
      const nationalLeagues = FINNISH_YOUTH_LEAGUES.filter(l => l.name.includes('Valtakunnallinen'));
      expect(nationalLeagues.length).toBeGreaterThanOrEqual(5);
    });

    it('should include regional leagues (Aluesarja) for all 4 regions', () => {
      const regions = ['Etelä', 'Länsi', 'Itä', 'Pohjoinen'];
      regions.forEach(region => {
        const regionLeagues = FINNISH_YOUTH_LEAGUES.filter(l =>
          l.name.includes('Aluesarja') && l.name.includes(region)
        );
        expect(regionLeagues.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('should include local leagues (Paikallissarja) for all 4 regions', () => {
      const regions = ['Etelä', 'Länsi', 'Itä', 'Pohjoinen'];
      regions.forEach(region => {
        const regionLeagues = FINNISH_YOUTH_LEAGUES.filter(l =>
          l.name.includes('Paikallissarja') && l.name.includes(region)
        );
        expect(regionLeagues.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('getLeagueById', () => {
    it('should return league for valid ID', () => {
      const league = getLeagueById('sm-sarja');
      expect(league).toBeDefined();
      expect(league?.name).toBe('Valtakunnallinen SM-sarja');
    });

    it('should return undefined for unknown ID', () => {
      const league = getLeagueById('nonexistent-league');
      expect(league).toBeUndefined();
    });

    it('should return the custom league for CUSTOM_LEAGUE_ID', () => {
      const league = getLeagueById(CUSTOM_LEAGUE_ID);
      expect(league).toBeDefined();
      expect(league?.isCustom).toBe(true);
    });
  });

  describe('getLeagueName', () => {
    it('should return league name for valid ID', () => {
      const name = getLeagueName('sm-sarja');
      expect(name).toBe('Valtakunnallinen SM-sarja');
    });

    it('should return empty string for undefined ID', () => {
      const name = getLeagueName(undefined);
      expect(name).toBe('');
    });

    it('should return the ID as fallback for unknown ID', () => {
      const name = getLeagueName('unknown-league-id');
      expect(name).toBe('unknown-league-id');
    });

    it('should return empty string for empty string ID', () => {
      const name = getLeagueName('');
      expect(name).toBe('');
    });
  });

  describe('isValidLeagueId', () => {
    it('should return true for valid league ID', () => {
      expect(isValidLeagueId('sm-sarja')).toBe(true);
      expect(isValidLeagueId('harrastesarja')).toBe(true);
      expect(isValidLeagueId(CUSTOM_LEAGUE_ID)).toBe(true);
    });

    it('should return false for invalid league ID', () => {
      expect(isValidLeagueId('invalid-league')).toBe(false);
      expect(isValidLeagueId('typo-sm-sarja')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidLeagueId(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidLeagueId('')).toBe(false);
    });
  });

  describe('League metadata (area/level)', () => {
    it('should have level set on all leagues except custom', () => {
      const nonCustomLeagues = FINNISH_YOUTH_LEAGUES.filter(l => !l.isCustom);
      nonCustomLeagues.forEach(league => {
        expect(league.level).toBeDefined();
        expect(['national', 'regional', 'local', 'other']).toContain(league.level);
      });
    });

    it('should have 5 national leagues', () => {
      const nationalLeagues = FINNISH_YOUTH_LEAGUES.filter(l => l.level === 'national');
      expect(nationalLeagues).toHaveLength(5);
    });

    it('should have 12 regional leagues (4 areas × 3 levels)', () => {
      const regionalLeagues = FINNISH_YOUTH_LEAGUES.filter(l => l.level === 'regional');
      expect(regionalLeagues).toHaveLength(12);
      // Each should have an area
      regionalLeagues.forEach(league => {
        expect(league.area).toBeDefined();
        expect(['etela', 'lansi', 'ita', 'pohjoinen']).toContain(league.area);
      });
    });

    it('should have 12 local leagues (4 areas × 3 levels)', () => {
      const localLeagues = FINNISH_YOUTH_LEAGUES.filter(l => l.level === 'local');
      expect(localLeagues).toHaveLength(12);
      // Each should have an area
      localLeagues.forEach(league => {
        expect(league.area).toBeDefined();
        expect(['etela', 'lansi', 'ita', 'pohjoinen']).toContain(league.area);
      });
    });

    it('should have 4 other leagues', () => {
      const otherLeagues = FINNISH_YOUTH_LEAGUES.filter(l => l.level === 'other');
      expect(otherLeagues).toHaveLength(4);
    });

    it('should have 3 regional leagues per area', () => {
      const areas = ['etela', 'lansi', 'ita', 'pohjoinen'] as const;
      areas.forEach(area => {
        const areaLeagues = FINNISH_YOUTH_LEAGUES.filter(
          l => l.level === 'regional' && l.area === area
        );
        expect(areaLeagues).toHaveLength(3);
      });
    });

    it('should have 3 local leagues per area', () => {
      const areas = ['etela', 'lansi', 'ita', 'pohjoinen'] as const;
      areas.forEach(area => {
        const areaLeagues = FINNISH_YOUTH_LEAGUES.filter(
          l => l.level === 'local' && l.area === area
        );
        expect(areaLeagues).toHaveLength(3);
      });
    });
  });

  describe('LEAGUE_AREA_FILTERS', () => {
    it('should have 5 filter options including "all"', () => {
      expect(LEAGUE_AREA_FILTERS).toHaveLength(5);
    });

    it('should have "all" as the first option', () => {
      expect(LEAGUE_AREA_FILTERS[0].id).toBe('all');
    });

    it('should have translation keys for all options', () => {
      LEAGUE_AREA_FILTERS.forEach(filter => {
        expect(filter.labelKey).toMatch(/^leagues\.areas\./);
      });
    });
  });

  describe('LEAGUE_LEVEL_FILTERS', () => {
    it('should have 5 filter options including "all"', () => {
      expect(LEAGUE_LEVEL_FILTERS).toHaveLength(5);
    });

    it('should have "all" as the first option', () => {
      expect(LEAGUE_LEVEL_FILTERS[0].id).toBe('all');
    });

    it('should have translation keys for all options', () => {
      LEAGUE_LEVEL_FILTERS.forEach(filter => {
        expect(filter.labelKey).toMatch(/^leagues\.levels\./);
      });
    });
  });
});
