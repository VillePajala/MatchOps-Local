/**
 * Tests for src/auth/cachedSession.ts
 *
 * Tests the three exported functions that parse Supabase's internal
 * localStorage session format for grace period and AbortError recovery.
 */

import { readCachedSupabaseSession, getCachedUserIdentity, getCachedFullSession } from '../cachedSession';

// Mock Sentry
jest.mock('@sentry/nextjs', () => ({
  addBreadcrumb: jest.fn(),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const SUPABASE_URL = 'https://testproject.supabase.co';
const STORAGE_KEY = 'sb-testproject-auth-token';

const validSession = {
  access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  refresh_token: 'refresh_abc123',
  expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  user: {
    id: 'user-123-abc',
    email: 'test@example.com',
  },
};

describe('cachedSession', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv;
  });

  // =========================================================================
  // readCachedSupabaseSession
  // =========================================================================

  describe('readCachedSupabaseSession', () => {
    it('returns null when NEXT_PUBLIC_SUPABASE_URL is not set', () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));
      expect(readCachedSupabaseSession()).toBeNull();
    });

    it('returns null when localStorage has no session data', () => {
      expect(readCachedSupabaseSession()).toBeNull();
    });

    it('returns null when localStorage contains invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{not valid json!!!');
      expect(readCachedSupabaseSession()).toBeNull();
    });

    it('parses direct session format', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));
      const result = readCachedSupabaseSession();
      expect(result).not.toBeNull();
      expect(result?.access_token).toBe(validSession.access_token);
      expect(result?.user?.id).toBe('user-123-abc');
    });

    it('parses wrapped currentSession format (legacy Supabase v1)', () => {
      const wrapped = { currentSession: validSession };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wrapped));
      const result = readCachedSupabaseSession();
      expect(result).not.toBeNull();
      expect(result?.access_token).toBe(validSession.access_token);
      expect(result?.user?.id).toBe('user-123-abc');
    });

    it('returns parsed data even with minimal fields', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: 'tok' }));
      const result = readCachedSupabaseSession();
      expect(result).not.toBeNull();
      expect(result?.access_token).toBe('tok');
      expect(result?.user).toBeUndefined();
    });
  });

  // =========================================================================
  // getCachedUserIdentity
  // =========================================================================

  describe('getCachedUserIdentity', () => {
    it('returns userId and email for valid non-expired session', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));
      const result = getCachedUserIdentity();
      expect(result).toEqual({
        userId: 'user-123-abc',
        email: 'test@example.com',
      });
    });

    it('returns null when no session is cached', () => {
      expect(getCachedUserIdentity()).toBeNull();
    });

    it('returns null when token is expired', () => {
      const expired = {
        ...validSession,
        expires_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expired));
      expect(getCachedUserIdentity()).toBeNull();
    });

    it('returns null when expires_at is in milliseconds (plausibility check)', () => {
      const msTimestamp = {
        ...validSession,
        expires_at: Date.now() + 3600000, // milliseconds, not seconds
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msTimestamp));
      expect(getCachedUserIdentity()).toBeNull();
    });

    it('returns null when expires_at is negative', () => {
      const negative = {
        ...validSession,
        expires_at: -1,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(negative));
      expect(getCachedUserIdentity()).toBeNull();
    });

    it('proceeds when expires_at is missing (non-numeric)', () => {
      const noExpiry = {
        user: { id: 'user-456', email: 'no-expiry@test.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(noExpiry));
      const result = getCachedUserIdentity();
      expect(result).toEqual({
        userId: 'user-456',
        email: 'no-expiry@test.com',
      });
    });

    it('proceeds when expires_at is a string (non-numeric)', () => {
      const stringExpiry = {
        ...validSession,
        expires_at: 'not-a-number',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stringExpiry));
      // String expires_at skips the numeric check — treated as missing
      const result = getCachedUserIdentity();
      expect(result).toEqual({
        userId: 'user-123-abc',
        email: 'test@example.com',
      });
    });

    it('returns null when userId is missing', () => {
      const noUserId = {
        ...validSession,
        user: { email: 'noid@test.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(noUserId));
      expect(getCachedUserIdentity()).toBeNull();
    });

    it('returns null when userId is empty string', () => {
      const emptyId = {
        ...validSession,
        user: { id: '', email: 'empty@test.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyId));
      expect(getCachedUserIdentity()).toBeNull();
    });

    it('returns empty string email when email is not a string', () => {
      const noEmail = {
        ...validSession,
        user: { id: 'user-789' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(noEmail));
      const result = getCachedUserIdentity();
      expect(result).toEqual({
        userId: 'user-789',
        email: '',
      });
    });
  });

  // =========================================================================
  // getCachedFullSession
  // =========================================================================

  describe('getCachedFullSession', () => {
    it('returns session when access_token, refresh_token, and user are present', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));
      const result = getCachedFullSession();
      expect(result).not.toBeNull();
      expect(result?.access_token).toBe(validSession.access_token);
      expect(result?.refresh_token).toBe(validSession.refresh_token);
      expect(result?.user?.id).toBe('user-123-abc');
    });

    it('returns null when no session is cached', () => {
      expect(getCachedFullSession()).toBeNull();
    });

    it('returns null when access_token is missing', () => {
      const noToken = {
        refresh_token: 'refresh_tok',
        user: { id: 'user-123' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(noToken));
      expect(getCachedFullSession()).toBeNull();
    });

    it('returns null when refresh_token is missing', () => {
      const noRefresh = {
        access_token: 'access_tok',
        user: { id: 'user-123' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(noRefresh));
      expect(getCachedFullSession()).toBeNull();
    });

    it('returns null when user is missing', () => {
      const noUser = {
        access_token: 'access_tok',
        refresh_token: 'refresh_tok',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(noUser));
      expect(getCachedFullSession()).toBeNull();
    });

    it('does not check expiry (by design — Supabase client handles refresh)', () => {
      const expired = {
        ...validSession,
        expires_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expired));
      // Should still return the session — expiry is the Supabase client's responsibility
      const result = getCachedFullSession();
      expect(result).not.toBeNull();
      expect(result?.access_token).toBe(validSession.access_token);
    });
  });
});
