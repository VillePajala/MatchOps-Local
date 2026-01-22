/**
 * Premium Limits Configuration Tests
 * @critical - Verifies freemium tier limits are correctly defined
 * Tests limit values, helper functions, and pricing constants
 */

import {
  FREE_LIMITS,
  getLimit,
  getResourceName,
  PREMIUM_PRODUCT_ID,
  PREMIUM_PRICE,
  PREMIUM_PRICE_AMOUNT,
  ResourceType,
} from '../premiumLimits';

describe('premiumLimits', () => {
  describe('FREE_LIMITS', () => {
    it('should have expected limit values', () => {
      expect(FREE_LIMITS.maxTeams).toBe(1);
      expect(FREE_LIMITS.maxGamesPerSeason).toBe(10);
      expect(FREE_LIMITS.maxGamesPerTournament).toBe(10);
      expect(FREE_LIMITS.maxPlayers).toBe(18);
      expect(FREE_LIMITS.maxSeasons).toBe(1);
      expect(FREE_LIMITS.maxTournaments).toBe(1);
    });

    it('should be readonly', () => {
      // TypeScript enforces this at compile time with `as const`
      // This test documents the expected behavior
      expect(Object.isFrozen(FREE_LIMITS)).toBe(false); // as const doesn't freeze at runtime
      expect(FREE_LIMITS).toMatchObject({
        maxTeams: expect.any(Number),
        maxGamesPerSeason: expect.any(Number),
      });
    });
  });

  describe('getLimit', () => {
    it('should return team limit', () => {
      expect(getLimit('team')).toBe(FREE_LIMITS.maxTeams);
    });

    it('should return game limit (per season)', () => {
      expect(getLimit('game')).toBe(FREE_LIMITS.maxGamesPerSeason);
    });

    it('should return player limit', () => {
      expect(getLimit('player')).toBe(FREE_LIMITS.maxPlayers);
    });

    it('should return season limit', () => {
      expect(getLimit('season')).toBe(FREE_LIMITS.maxSeasons);
    });

    it('should return tournament limit', () => {
      expect(getLimit('tournament')).toBe(FREE_LIMITS.maxTournaments);
    });

    it('should return 0 for unknown resource type', () => {
      expect(getLimit('unknown' as ResourceType)).toBe(0);
    });
  });

  describe('getResourceName', () => {
    it('should return singular form for count 1', () => {
      expect(getResourceName('team', 1)).toBe('team');
      expect(getResourceName('game', 1)).toBe('game');
      expect(getResourceName('player', 1)).toBe('player');
      expect(getResourceName('season', 1)).toBe('season');
      expect(getResourceName('tournament', 1)).toBe('tournament');
    });

    it('should return plural form for count > 1', () => {
      expect(getResourceName('team', 2)).toBe('teams');
      expect(getResourceName('game', 5)).toBe('games');
      expect(getResourceName('player', 18)).toBe('players');
      expect(getResourceName('season', 3)).toBe('seasons');
      expect(getResourceName('tournament', 10)).toBe('tournaments');
    });

    it('should return plural form for count 0', () => {
      expect(getResourceName('team', 0)).toBe('teams');
    });

    it('should default to singular when count not provided', () => {
      expect(getResourceName('team')).toBe('team');
    });
  });

  describe('constants', () => {
    it('should have correct product ID', () => {
      expect(PREMIUM_PRODUCT_ID).toBe('matchops_premium');
    });

    it('should have correct price string', () => {
      expect(PREMIUM_PRICE).toBe('€4.99/month');
    });

    it('should have correct price amount', () => {
      expect(PREMIUM_PRICE_AMOUNT).toBe(4.99);
    });
  });
});
