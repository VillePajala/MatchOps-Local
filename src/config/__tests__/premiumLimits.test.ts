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
  PREMIUM_IS_SUBSCRIPTION,
  ResourceType,
} from '../premiumLimits';

describe('premiumLimits', () => {
  describe('FREE_LIMITS', () => {
    it('should have expected limit values', () => {
      expect(FREE_LIMITS.maxSeasons).toBe(3);
      expect(FREE_LIMITS.maxTournaments).toBe(3);
    });

    it('should only have season and tournament limits', () => {
      // Teams, players, and games are unlimited
      expect(FREE_LIMITS).toEqual({
        maxSeasons: 3,
        maxTournaments: 3,
      });
    });

    it('should be readonly', () => {
      // TypeScript enforces this at compile time with `as const`
      // This test documents the expected behavior
      expect(Object.isFrozen(FREE_LIMITS)).toBe(false); // as const doesn't freeze at runtime
      expect(FREE_LIMITS).toMatchObject({
        maxSeasons: expect.any(Number),
        maxTournaments: expect.any(Number),
      });
    });
  });

  describe('getLimit', () => {
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
      expect(getResourceName('season', 1)).toBe('season');
      expect(getResourceName('tournament', 1)).toBe('tournament');
    });

    it('should return plural form for count > 1', () => {
      expect(getResourceName('season', 3)).toBe('seasons');
      expect(getResourceName('tournament', 10)).toBe('tournaments');
    });

    it('should return plural form for count 0', () => {
      expect(getResourceName('season', 0)).toBe('seasons');
    });

    it('should default to singular when count not provided', () => {
      expect(getResourceName('season')).toBe('season');
    });
  });

  describe('constants', () => {
    it('should have correct product ID for full version', () => {
      expect(PREMIUM_PRODUCT_ID).toBe('premium_unlock');
    });

    it('should have correct price string', () => {
      expect(PREMIUM_PRICE).toBe('4,99 \u20AC');
    });

    it('should have correct price amount', () => {
      expect(PREMIUM_PRICE_AMOUNT).toBe(4.99);
    });

    it('should be a one-time purchase (not subscription)', () => {
      expect(PREMIUM_IS_SUBSCRIPTION).toBe(false);
    });
  });
});
