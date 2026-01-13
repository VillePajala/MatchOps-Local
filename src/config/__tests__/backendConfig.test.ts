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
} from '../backendConfig';

describe('backendConfig', () => {
  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_BACKEND_MODE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Reset localStorage mock
    localStorageMock.clear();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    jest.clearAllMocks();
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
    it('sets localStorage to local', () => {
      disableCloudMode();
      expect(localStorageMock.setItem).toHaveBeenCalledWith('matchops_backend_mode', 'local');
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

    it('disableCloudMode does not throw when localStorage throws', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });

      // Should not throw
      expect(() => disableCloudMode()).not.toThrow();
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
});
