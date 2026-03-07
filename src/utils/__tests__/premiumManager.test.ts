/**
 * @jest-environment jsdom
 */

/**
 * Premium Manager Tests
 * @critical - Core monetization logic for freemium model
 *
 * Business Model (2026-03):
 * - Free tier: 3 seasons + 3 tournaments, unlimited everything else
 * - Full Version: one-time purchase for unlimited seasons/tournaments
 * - Cloud sync: FREE for all users
 * - PREMIUM_ENFORCEMENT_ENABLED currently false (returns unlimited for all)
 *
 * Tests license storage, premium status management, and resource limits.
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
    // PREMIUM_ENFORCEMENT_ENABLED is currently false, so all return true
    // When enabled: free users limited to 3 seasons + 3 tournaments

    it('should always return true when enforcement is disabled', () => {
      // Premium users - unlimited
      expect(canCreateResource('season', 50, true)).toBe(true);
      expect(canCreateResource('tournament', 50, true)).toBe(true);

      // Non-premium users - also unlimited (enforcement disabled)
      expect(canCreateResource('season', 50, false)).toBe(true);
      expect(canCreateResource('tournament', 100, false)).toBe(true);
    });
  });

  describe('getRemainingCount', () => {
    // PREMIUM_ENFORCEMENT_ENABLED is currently false, so all return Infinity

    it('should always return Infinity when enforcement is disabled', () => {
      // Premium users
      expect(getRemainingCount('season', 10, true)).toBe(Infinity);
      expect(getRemainingCount('tournament', 10, true)).toBe(Infinity);

      // Non-premium users - also Infinity (enforcement disabled)
      expect(getRemainingCount('season', 50, false)).toBe(Infinity);
      expect(getRemainingCount('tournament', 50, false)).toBe(Infinity);
    });
  });

  describe('getResourceLimit', () => {
    it('should return correct limits', () => {
      expect(getResourceLimit('season')).toBe(FREE_LIMITS.maxSeasons);
      expect(getResourceLimit('tournament')).toBe(FREE_LIMITS.maxTournaments);
    });
  });

  describe('isOverFreeLimit', () => {
    // PREMIUM_ENFORCEMENT_ENABLED is currently false, so always returns false

    it('should always return false when enforcement is disabled', () => {
      const baseCounts: ResourceCounts = {
        seasons: 0,
        tournaments: 0,
      };

      // Zero counts
      expect(isOverFreeLimit(baseCounts)).toBe(false);

      // Large counts - still no limits (enforcement disabled)
      expect(isOverFreeLimit({ seasons: 50, tournaments: 30 })).toBe(false);
    });
  });

  describe('getOverLimitSummary', () => {
    // PREMIUM_ENFORCEMENT_ENABLED is currently false, so always returns empty

    it('should always return empty array when enforcement is disabled', () => {
      expect(getOverLimitSummary({ seasons: 0, tournaments: 0 })).toEqual([]);
      expect(getOverLimitSummary({ seasons: 50, tournaments: 30 })).toEqual([]);
    });
  });
});
