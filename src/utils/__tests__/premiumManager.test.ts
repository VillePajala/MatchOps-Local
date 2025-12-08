/**
 * @jest-environment jsdom
 */

/**
 * Premium Manager Tests
 * @critical - Core monetization logic for freemium model
 * Tests license storage, limit checking, and premium status management
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
    it('should always return true for premium users', () => {
      expect(canCreateResource('team', 100, true)).toBe(true);
      expect(canCreateResource('player', 1000, true)).toBe(true);
      expect(canCreateResource('season', 50, true)).toBe(true);
    });

    it('should check team limit for free users', () => {
      expect(canCreateResource('team', 0, false)).toBe(true);
      expect(canCreateResource('team', FREE_LIMITS.maxTeams - 1, false)).toBe(true);
      expect(canCreateResource('team', FREE_LIMITS.maxTeams, false)).toBe(false);
    });

    it('should check player limit for free users', () => {
      expect(canCreateResource('player', 0, false)).toBe(true);
      expect(canCreateResource('player', FREE_LIMITS.maxPlayers - 1, false)).toBe(true);
      expect(canCreateResource('player', FREE_LIMITS.maxPlayers, false)).toBe(false);
    });

    it('should check season limit for free users', () => {
      expect(canCreateResource('season', 0, false)).toBe(true);
      expect(canCreateResource('season', FREE_LIMITS.maxSeasons, false)).toBe(false);
    });

    it('should check tournament limit for free users', () => {
      expect(canCreateResource('tournament', 0, false)).toBe(true);
      expect(canCreateResource('tournament', FREE_LIMITS.maxTournaments, false)).toBe(false);
    });

    it('should check game limit for free users', () => {
      expect(canCreateResource('game', 0, false)).toBe(true);
      expect(canCreateResource('game', FREE_LIMITS.maxGamesPerSeason - 1, false)).toBe(true);
      expect(canCreateResource('game', FREE_LIMITS.maxGamesPerSeason, false)).toBe(false);
    });
  });

  describe('getRemainingCount', () => {
    it('should return Infinity for premium users', () => {
      expect(getRemainingCount('team', 100, true)).toBe(Infinity);
    });

    it('should calculate remaining for free users', () => {
      expect(getRemainingCount('team', 0, false)).toBe(FREE_LIMITS.maxTeams);
      expect(getRemainingCount('player', 10, false)).toBe(FREE_LIMITS.maxPlayers - 10);
    });

    it('should return 0 when at or over limit', () => {
      expect(getRemainingCount('team', FREE_LIMITS.maxTeams, false)).toBe(0);
      expect(getRemainingCount('team', FREE_LIMITS.maxTeams + 5, false)).toBe(0);
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
    const baseCounts: ResourceCounts = {
      teams: 0,
      gamesInSeason: 0,
      gamesInTournament: 0,
      players: 0,
      seasons: 0,
      tournaments: 0,
    };

    it('should return false when under all limits', () => {
      expect(isOverFreeLimit(baseCounts)).toBe(false);
    });

    it('should return true when teams exceed limit', () => {
      expect(isOverFreeLimit({ ...baseCounts, teams: FREE_LIMITS.maxTeams + 1 })).toBe(true);
    });

    it('should return true when players exceed limit', () => {
      expect(isOverFreeLimit({ ...baseCounts, players: FREE_LIMITS.maxPlayers + 1 })).toBe(true);
    });

    it('should return true when seasons exceed limit', () => {
      expect(isOverFreeLimit({ ...baseCounts, seasons: FREE_LIMITS.maxSeasons + 1 })).toBe(true);
    });

    it('should return true when games in season exceed limit', () => {
      expect(isOverFreeLimit({ ...baseCounts, gamesInSeason: FREE_LIMITS.maxGamesPerSeason + 1 })).toBe(true);
    });
  });

  describe('getOverLimitSummary', () => {
    it('should return empty array when under limits', () => {
      const counts: ResourceCounts = {
        teams: 0,
        gamesInSeason: 0,
        gamesInTournament: 0,
        players: 0,
        seasons: 0,
        tournaments: 0,
      };

      expect(getOverLimitSummary(counts)).toEqual([]);
    });

    it('should list resources over limit', () => {
      const counts: ResourceCounts = {
        teams: 5,
        gamesInSeason: 0,
        gamesInTournament: 0,
        players: 25,
        seasons: 0,
        tournaments: 0,
      };

      const summary = getOverLimitSummary(counts);

      expect(summary).toContain(`5/${FREE_LIMITS.maxTeams} teams`);
      expect(summary).toContain(`25/${FREE_LIMITS.maxPlayers} players`);
      expect(summary.length).toBe(2);
    });
  });
});
