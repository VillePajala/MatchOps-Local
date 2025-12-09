/**
 * @fileoverview Tests for Finnish youth league utilities
 * TDD: These tests are written BEFORE the implementation
 */

import { FINNISH_YOUTH_LEAGUES, CUSTOM_LEAGUE_ID, getLeagueById, getLeagueName } from '../leagues';

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
});
