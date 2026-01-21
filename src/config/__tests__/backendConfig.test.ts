/**
 * Tests for backendConfig.ts
 *
 * Tests backend mode detection and switching logic.
 * Part of PR #1: Foundation & Configuration
 */

// Store original env values
const originalEnv = { ...process.env };

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

// Import the module under test
// Logger uses defensive coding (logger?.info?.()) so no mock needed
import {
  getBackendMode,
  getBackendConfig,
  isCloudAvailable,
  enableCloudMode,
  disableCloudMode,
  clearModeOverride,
  hasModeOverride,
  getSupabaseUrl,
  getSupabaseAnonKey,
  hasMigrationCompleted,
  setMigrationCompleted,
  clearMigrationCompleted,
} from '../backendConfig';

describe('backendConfig', () => {
  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_BACKEND_MODE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Reset localStorage mock - restore default implementations
    localStorageMock.clear();
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
    localStorageMock.removeItem.mockReset();
    // Restore default behavior
    localStorageMock.getItem.mockImplementation((_key: string) => null);
    localStorageMock.setItem.mockImplementation(() => undefined);
    localStorageMock.removeItem.mockImplementation(() => undefined);

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  afterAll(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('isCloudAvailable', () => {
    it('returns false when no Supabase env vars are set', () => {
      expect(isCloudAvailable()).toBe(false);
    });

    it('returns false when only URL is set', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      expect(isCloudAvailable()).toBe(false);
    });

    it('returns false when only anon key is set', () => {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      expect(isCloudAvailable()).toBe(false);
    });

    it('returns true when both URL and anon key are set', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      expect(isCloudAvailable()).toBe(true);
    });
  });

  describe('getSupabaseUrl', () => {
    it('returns null when not set', () => {
      expect(getSupabaseUrl()).toBeNull();
    });

    it('returns URL when set', () => {
      const url = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      expect(getSupabaseUrl()).toBe(url);
    });
  });

  describe('getSupabaseAnonKey', () => {
    it('returns null when not set', () => {
      expect(getSupabaseAnonKey()).toBeNull();
    });

    it('returns key when set', () => {
      const key = 'test-anon-key-12345';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
      expect(getSupabaseAnonKey()).toBe(key);
    });
  });

  describe('getBackendMode', () => {
    it('returns local by default when nothing is configured', () => {
      expect(getBackendMode()).toBe('local');
    });

    it('returns local when env is set to local', () => {
      process.env.NEXT_PUBLIC_BACKEND_MODE = 'local';
      expect(getBackendMode()).toBe('local');
    });

    it('returns local when env is cloud but Supabase not configured', () => {
      process.env.NEXT_PUBLIC_BACKEND_MODE = 'cloud';
      expect(getBackendMode()).toBe('local');
    });

    it('falls back to local when env is invalid value', () => {
      process.env.NEXT_PUBLIC_BACKEND_MODE = 'invalid';
      expect(getBackendMode()).toBe('local');
    });

    it('returns cloud when env is cloud and Supabase is configured', () => {
      process.env.NEXT_PUBLIC_BACKEND_MODE = 'cloud';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      expect(getBackendMode()).toBe('cloud');
    });

    it('respects localStorage override for local mode', () => {
      process.env.NEXT_PUBLIC_BACKEND_MODE = 'cloud';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      localStorageMock.getItem.mockReturnValue('local');

      expect(getBackendMode()).toBe('local');
    });

    it('respects localStorage override for cloud mode when available', () => {
      process.env.NEXT_PUBLIC_BACKEND_MODE = 'local';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      localStorageMock.getItem.mockReturnValue('cloud');

      expect(getBackendMode()).toBe('cloud');
    });

    it('falls back to local when localStorage says cloud but Supabase not configured', () => {
      localStorageMock.getItem.mockReturnValue('cloud');
      // Supabase not configured
      expect(getBackendMode()).toBe('local');
    });

    it('respects priority: localStorage > env > default', () => {
      // Configure Supabase so cloud mode is available
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.NEXT_PUBLIC_BACKEND_MODE = 'cloud';

      // Step 1: localStorage wins over env
      localStorageMock.getItem.mockReturnValue('local');
      expect(getBackendMode()).toBe('local');

      // Step 2: env wins when no localStorage override
      localStorageMock.getItem.mockReturnValue(null);
      expect(getBackendMode()).toBe('cloud');

      // Step 3: default wins when no env
      delete process.env.NEXT_PUBLIC_BACKEND_MODE;
      expect(getBackendMode()).toBe('local');
    });
  });

  describe('enableCloudMode', () => {
    it('returns false when Supabase is not available', () => {
      const result = enableCloudMode();
      expect(result).toBe(false);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('returns true and sets localStorage when Supabase is available', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      const result = enableCloudMode();
      expect(result).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('matchops_backend_mode', 'cloud');
    });
  });

  describe('disableCloudMode', () => {
    it('sets localStorage to local and returns success', () => {
      const result = disableCloudMode();
      expect(localStorageMock.setItem).toHaveBeenCalledWith('matchops_backend_mode', 'local');
      expect(result.success).toBe(true);
    });

    it('returns failure with reason when localStorage write fails', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });
      const result = disableCloudMode();
      expect(result.success).toBe(false);
      expect(result.reason).toBe('storage_write_failed');
      expect(result.message).toContain('Failed to save mode preference');
    });
  });

  describe('clearModeOverride', () => {
    it('removes localStorage key', () => {
      clearModeOverride();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('matchops_backend_mode');
    });
  });

  describe('hasModeOverride', () => {
    it('returns false when no override is set', () => {
      localStorageMock.getItem.mockReturnValue(null);
      expect(hasModeOverride()).toBe(false);
    });

    it('returns true when local override is set', () => {
      localStorageMock.getItem.mockReturnValue('local');
      expect(hasModeOverride()).toBe(true);
    });

    it('returns true when cloud override is set', () => {
      localStorageMock.getItem.mockReturnValue('cloud');
      expect(hasModeOverride()).toBe(true);
    });

    it('returns false for invalid override value', () => {
      localStorageMock.getItem.mockReturnValue('invalid');
      expect(hasModeOverride()).toBe(false);
    });
  });

  describe('Storage Access Error Handling', () => {
    it('getBackendMode falls back to env/default when localStorage throws SecurityError', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });
      process.env.NEXT_PUBLIC_BACKEND_MODE = 'local';

      // Should not throw, should fall back to env/default
      expect(getBackendMode()).toBe('local');
    });

    it('enableCloudMode returns false when localStorage throws', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      localStorageMock.setItem.mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });

      expect(enableCloudMode()).toBe(false);
    });

    it('disableCloudMode returns failure result when localStorage throws', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });

      // Should not throw, should return failure result
      const result = disableCloudMode();
      expect(result.success).toBe(false);
      expect(result.reason).toBe('storage_write_failed');
    });

    it('clearModeOverride does not throw when localStorage throws', () => {
      localStorageMock.removeItem.mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });

      // Should not throw
      expect(() => clearModeOverride()).not.toThrow();
    });

    it('hasModeOverride returns false when localStorage throws', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });

      expect(hasModeOverride()).toBe(false);
    });
  });

  describe('getBackendConfig', () => {
    it('returns complete config object', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.NEXT_PUBLIC_BACKEND_MODE = 'cloud';

      const config = getBackendConfig();

      expect(config).toEqual({
        mode: 'cloud',
        isCloudAvailable: true,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-anon-key',
      });
    });

    it('returns local config when cloud not available', () => {
      const config = getBackendConfig();

      expect(config).toEqual({
        mode: 'local',
        isCloudAvailable: false,
        supabaseUrl: null,
        supabaseAnonKey: null,
      });
    });
  });

  describe('Migration Completed Flag', () => {
    const testUserId = 'test-user-12345';

    describe('hasMigrationCompleted', () => {
      it('returns false when no flag is set', () => {
        localStorageMock.getItem.mockReturnValue(null);
        expect(hasMigrationCompleted(testUserId)).toBe(false);
      });

      it('returns false for empty userId', () => {
        expect(hasMigrationCompleted('')).toBe(false);
      });

      it('returns true when flag is set to "true"', () => {
        localStorageMock.getItem.mockReturnValue('true');
        expect(hasMigrationCompleted(testUserId)).toBe(true);
        expect(localStorageMock.getItem).toHaveBeenCalledWith(
          `matchops_cloud_migration_completed_${testUserId}`
        );
      });

      it('returns false for any value other than "true"', () => {
        localStorageMock.getItem.mockReturnValue('false');
        expect(hasMigrationCompleted(testUserId)).toBe(false);

        localStorageMock.getItem.mockReturnValue('yes');
        expect(hasMigrationCompleted(testUserId)).toBe(false);
      });
    });

    describe('setMigrationCompleted', () => {
      it('sets the flag in localStorage', () => {
        const result = setMigrationCompleted(testUserId);

        expect(result).toBe(true);
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          `matchops_cloud_migration_completed_${testUserId}`,
          'true'
        );
      });

      it('returns false for empty userId', () => {
        expect(setMigrationCompleted('')).toBe(false);
        expect(localStorageMock.setItem).not.toHaveBeenCalled();
      });

      it('returns false when localStorage throws', () => {
        localStorageMock.setItem.mockImplementation(() => {
          throw new DOMException('Storage access denied', 'SecurityError');
        });

        expect(setMigrationCompleted(testUserId)).toBe(false);
      });
    });

    describe('clearMigrationCompleted', () => {
      it('removes the flag from localStorage', () => {
        clearMigrationCompleted(testUserId);

        expect(localStorageMock.removeItem).toHaveBeenCalledWith(
          `matchops_cloud_migration_completed_${testUserId}`
        );
      });

      it('does nothing for empty userId', () => {
        clearMigrationCompleted('');
        expect(localStorageMock.removeItem).not.toHaveBeenCalled();
      });

      it('does not throw when localStorage throws', () => {
        localStorageMock.removeItem.mockImplementation(() => {
          throw new DOMException('Storage access denied', 'SecurityError');
        });

        expect(() => clearMigrationCompleted(testUserId)).not.toThrow();
      });
    });

    describe('per-user isolation', () => {
      it('keeps flags separate for different users', () => {
        const user1 = 'user-1';
        const user2 = 'user-2';

        // Set migration completed for user1
        setMigrationCompleted(user1);
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          `matchops_cloud_migration_completed_${user1}`,
          'true'
        );

        // Check for user2 (should be false since not set)
        localStorageMock.getItem.mockReturnValue(null);
        expect(hasMigrationCompleted(user2)).toBe(false);
        expect(localStorageMock.getItem).toHaveBeenCalledWith(
          `matchops_cloud_migration_completed_${user2}`
        );
      });
    });
  });
});
