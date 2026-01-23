/**
 * @jest-environment jsdom
 */

/**
 * Premium Manager Tests
 * @critical - Core monetization logic for cloud subscription model
 *
 * Business Model (2026-01):
 * - Local mode: FREE, unlimited
 * - Cloud mode: Subscription required for sync only, no resource limits
 *
 * Tests license storage and premium status management.
 * Resource limit functions always return "no limits" (true/Infinity/empty).
 */

import {
  getPremiumLicense,
  savePremiumLicense,
  grantPremium,
  revokePremium,
  isPremiumUser,
  canCreateResource,
  getRemainingCount,
  isOverFreeLimit,
  getOverLimitSummary,
  getResourceLimit,
  type PremiumLicense,
  type ResourceCounts,
} from '../premiumManager';
import { FREE_LIMITS, PREMIUM_PRODUCT_ID } from '@/config/premiumLimits';
import * as storage from '../storage';

// Mock the storage module
jest.mock('../storage', () => ({
  getStorageItem: jest.fn(),
  setStorageItem: jest.fn(),
}));

const mockGetStorageItem = storage.getStorageItem as jest.MockedFunction<typeof storage.getStorageItem>;
const mockSetStorageItem = storage.setStorageItem as jest.MockedFunction<typeof storage.setStorageItem>;

describe('premiumManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPremiumLicense', () => {
    it('should return default license when storage is empty', async () => {
      mockGetStorageItem.mockResolvedValue(null);

      const license = await getPremiumLicense();

      expect(license).toEqual({ isPremium: false });
    });

    it('should return stored license', async () => {
      const storedLicense: PremiumLicense = {
        isPremium: true,
        purchaseToken: 'token123',
        purchaseDate: '2025-01-01T00:00:00.000Z',
      };
      mockGetStorageItem.mockResolvedValue(JSON.stringify(storedLicense));

      const license = await getPremiumLicense();

      expect(license).toEqual(storedLicense);
    });

    it('should return default license on parse error', async () => {
      mockGetStorageItem.mockResolvedValue('invalid json');

      const license = await getPremiumLicense();

      expect(license).toEqual({ isPremium: false });
    });
  });

  describe('savePremiumLicense', () => {
    it('should save license to storage', async () => {
      const license: PremiumLicense = {
        isPremium: true,
        purchaseToken: 'token123',
      };

      await savePremiumLicense(license);

      expect(mockSetStorageItem).toHaveBeenCalledWith(
        'soccerPremiumLicense',
        JSON.stringify(license)
      );
    });
  });

  describe('grantPremium', () => {
    it('should grant premium with purchase token', async () => {
      await grantPremium('token123');

      expect(mockSetStorageItem).toHaveBeenCalled();
      const savedData = JSON.parse(mockSetStorageItem.mock.calls[0][1] as string);
      expect(savedData.isPremium).toBe(true);
      expect(savedData.purchaseToken).toBe('token123');
      expect(savedData.productId).toBe(PREMIUM_PRODUCT_ID);
      expect(savedData.purchaseDate).toBeDefined();
      expect(savedData.lastVerified).toBeDefined();
    });

    it('should grant premium without purchase token', async () => {
      await grantPremium();

      const savedData = JSON.parse(mockSetStorageItem.mock.calls[0][1] as string);
      expect(savedData.isPremium).toBe(true);
      expect(savedData.purchaseToken).toBeUndefined();
    });
  });

  describe('revokePremium', () => {
    it('should reset to default license', async () => {
      await revokePremium();

      expect(mockSetStorageItem).toHaveBeenCalledWith(
        'soccerPremiumLicense',
        JSON.stringify({ isPremium: false })
      );
    });
  });

  describe('isPremiumUser', () => {
    it('should return true when premium', async () => {
      mockGetStorageItem.mockResolvedValue(JSON.stringify({ isPremium: true }));

      const result = await isPremiumUser();

      expect(result).toBe(true);
    });

    it('should return false when not premium', async () => {
      mockGetStorageItem.mockResolvedValue(JSON.stringify({ isPremium: false }));

      const result = await isPremiumUser();

      expect(result).toBe(false);
    });
  });

  describe('canCreateResource', () => {
    // Business model: No resource limits - all users have unlimited access
    // Cloud sync is gated separately via useCloudUpgradeGate

    it('should always return true regardless of premium status', () => {
      // Premium users - unlimited
      expect(canCreateResource('team', 100, true)).toBe(true);
      expect(canCreateResource('player', 1000, true)).toBe(true);
      expect(canCreateResource('season', 50, true)).toBe(true);

      // Non-premium users - also unlimited (no resource limits)
      expect(canCreateResource('team', 100, false)).toBe(true);
      expect(canCreateResource('player', 1000, false)).toBe(true);
      expect(canCreateResource('season', 50, false)).toBe(true);
      expect(canCreateResource('tournament', 100, false)).toBe(true);
      expect(canCreateResource('game', 500, false)).toBe(true);
    });
  });

  describe('getRemainingCount', () => {
    // Business model: No resource limits - always returns Infinity

    it('should always return Infinity regardless of premium status', () => {
      // Premium users
      expect(getRemainingCount('team', 100, true)).toBe(Infinity);
      expect(getRemainingCount('player', 1000, true)).toBe(Infinity);

      // Non-premium users - also unlimited
      expect(getRemainingCount('team', 100, false)).toBe(Infinity);
      expect(getRemainingCount('player', 1000, false)).toBe(Infinity);
      expect(getRemainingCount('season', 50, false)).toBe(Infinity);
    });
  });

  describe('getResourceLimit', () => {
    it('should return correct limits', () => {
      expect(getResourceLimit('team')).toBe(FREE_LIMITS.maxTeams);
      expect(getResourceLimit('player')).toBe(FREE_LIMITS.maxPlayers);
      expect(getResourceLimit('season')).toBe(FREE_LIMITS.maxSeasons);
      expect(getResourceLimit('tournament')).toBe(FREE_LIMITS.maxTournaments);
      expect(getResourceLimit('game')).toBe(FREE_LIMITS.maxGamesPerSeason);
    });
  });

  describe('isOverFreeLimit', () => {
    // Business model: No resource limits - always returns false

    it('should always return false regardless of counts', () => {
      const baseCounts: ResourceCounts = {
        teams: 0,
        gamesInSeason: 0,
        gamesInTournament: 0,
        players: 0,
        seasons: 0,
        tournaments: 0,
      };

      // Zero counts
      expect(isOverFreeLimit(baseCounts)).toBe(false);

      // Large counts - still no limits
      expect(isOverFreeLimit({ ...baseCounts, teams: 100 })).toBe(false);
      expect(isOverFreeLimit({ ...baseCounts, players: 500 })).toBe(false);
      expect(isOverFreeLimit({ ...baseCounts, seasons: 50 })).toBe(false);
      expect(isOverFreeLimit({ ...baseCounts, gamesInSeason: 200 })).toBe(false);
    });
  });

  describe('getOverLimitSummary', () => {
    // Business model: No resource limits - always returns empty array

    it('should always return empty array regardless of counts', () => {
      const lowCounts: ResourceCounts = {
        teams: 0,
        gamesInSeason: 0,
        gamesInTournament: 0,
        players: 0,
        seasons: 0,
        tournaments: 0,
      };
      expect(getOverLimitSummary(lowCounts)).toEqual([]);

      const highCounts: ResourceCounts = {
        teams: 100,
        gamesInSeason: 500,
        gamesInTournament: 200,
        players: 1000,
        seasons: 50,
        tournaments: 30,
      };
      expect(getOverLimitSummary(highCounts)).toEqual([]);
    });
  });
});
