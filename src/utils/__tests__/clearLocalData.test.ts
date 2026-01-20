/**
 * Tests for clearLocalData.ts
 *
 * Tests the safe clearing of IndexedDB data without affecting localStorage settings.
 * Part of PR #9: Infrastructure & Migration UI
 */

import { clearLocalIndexedDBData, hasLocalDataToClear } from '../clearLocalData';
import { clearStorage } from '../storage';
import { hasLocalDataToMigrate } from '@/services/migrationService';

// Mock the storage module
jest.mock('../storage', () => ({
  clearStorage: jest.fn(),
}));

// Mock the migration service
jest.mock('@/services/migrationService', () => ({
  hasLocalDataToMigrate: jest.fn(),
}));

// Mock logger
jest.mock('../logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('clearLocalData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('clearLocalIndexedDBData', () => {
    it('calls clearStorage to clear IndexedDB', async () => {
      (clearStorage as jest.Mock).mockResolvedValue(undefined);

      await clearLocalIndexedDBData();

      expect(clearStorage).toHaveBeenCalledTimes(1);
    });

    it('throws error when clearStorage fails', async () => {
      const error = new Error('IndexedDB clear failed');
      (clearStorage as jest.Mock).mockRejectedValue(error);

      await expect(clearLocalIndexedDBData()).rejects.toThrow('IndexedDB clear failed');
    });
  });

  describe('hasLocalDataToClear', () => {
    it('returns true when there is local data', async () => {
      (hasLocalDataToMigrate as jest.Mock).mockResolvedValue(true);

      const result = await hasLocalDataToClear();

      expect(result).toBe(true);
    });

    it('returns false when there is no local data', async () => {
      (hasLocalDataToMigrate as jest.Mock).mockResolvedValue(false);

      const result = await hasLocalDataToClear();

      expect(result).toBe(false);
    });

    it('returns true when check fails (safe default)', async () => {
      // Mock to simulate a failure during the check
      (hasLocalDataToMigrate as jest.Mock).mockImplementation(() => {
        throw new Error('Check failed');
      });

      const result = await hasLocalDataToClear();

      expect(result).toBe(true);
    });
  });
});
