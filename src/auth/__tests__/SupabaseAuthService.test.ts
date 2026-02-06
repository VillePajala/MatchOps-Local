/**
 * Tests for SupabaseAuthService
 *
 * Tests for email/password authentication via Supabase Auth.
 * Part of PR #5: SupabaseAuthService + Auth UI
 */

import type { SupabaseClient, AuthChangeEvent, Session as SupabaseSession } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { SupabaseAuthService } from '../SupabaseAuthService';
import {
  AuthError,
  NetworkError,
  NotInitializedError,
} from '@/interfaces/DataStoreErrors';

// Mock user and session
const mockUser = {
  id: 'user_123_abc',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
};

const mockSession = {
  access_token: 'mock_access_token',
  refresh_token: 'mock_refresh_token',
  expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  expires_in: 3600,
  token_type: 'bearer',
  user: mockUser,
} as SupabaseSession;

// Track auth state change callbacks
let authStateCallbacks: ((event: AuthChangeEvent, session: SupabaseSession | null) => void)[] = [];

// Mock Supabase auth
const mockAuth = {
  getSession: jest.fn(),
  getUser: jest.fn(),
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  refreshSession: jest.fn(),
  onAuthStateChange: jest.fn((callback) => {
    authStateCallbacks.push(callback);
    return {
      data: {
        subscription: {
          unsubscribe: jest.fn(() => {
            authStateCallbacks = authStateCallbacks.filter(cb => cb !== callback);
          }),
        },
      },
    };
  }),
};

// Mock RPC function
const mockRpc = jest.fn();

// Mock Supabase client
const mockSupabaseClient = {
  auth: mockAuth,
  rpc: mockRpc,
} as unknown as SupabaseClient<Database>;

// Mock getSupabaseClient
jest.mock('@/datastore/supabase/client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
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

describe('SupabaseAuthService', () => {
  let authService: SupabaseAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authStateCallbacks = [];

    // Default: no existing session
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    authService = new SupabaseAuthService();
  });

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  describe('initialize', () => {
    it('should initialize without existing session', async () => {
      await authService.initialize();
      expect(authService.isInitialized()).toBe(true);
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should initialize with existing session', async () => {
      mockAuth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      // Session validation calls getUser() to verify session is valid on server
      mockAuth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      await authService.initialize();

      expect(authService.isInitialized()).toBe(true);
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should clear stale session if validation fails', async () => {
      mockAuth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      // Session exists locally but getUser fails (stale/revoked session)
      mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Session expired' } });
      mockAuth.signOut.mockResolvedValue({ error: null });

      await authService.initialize();

      expect(authService.isInitialized()).toBe(true);
      expect(authService.isAuthenticated()).toBe(false);
      // Should have attempted to clear the stale session
      expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('should handle initialization error gracefully', async () => {
      mockAuth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session error' },
      });

      // Should not throw - app should still work
      await authService.initialize();

      expect(authService.isInitialized()).toBe(true);
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should only initialize once', async () => {
      await authService.initialize();
      await authService.initialize();

      expect(mockAuth.getSession).toHaveBeenCalledTimes(1);
    });

    /**
     * @critical AbortError recovery: Supabase's internal lock mechanism can throw
     * AbortError on PWA resume or rapid sign-in/sign-out. The auth service must
     * handle this gracefully and attempt localStorage fallback.
     */
    describe('AbortError recovery', () => {
      it('should recover session from localStorage when getSession throws AbortError', async () => {
        // Mock getSession throwing AbortError (Supabase lock timeout)
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        mockAuth.getSession.mockRejectedValue(abortError);

        // Set up localStorage with a stored Supabase session
        const projectRef = 'testproject';
        process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
        const storageKey = `sb-${projectRef}-auth-token`;

        const storedSession = {
          access_token: 'recovered_token',
          refresh_token: 'recovered_refresh',
          user: mockUser,
        };
        localStorage.setItem(storageKey, JSON.stringify(storedSession));

        // Mock getUser to succeed (validates recovered session)
        mockAuth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });

        await authService.initialize();

        expect(authService.isInitialized()).toBe(true);
        expect(authService.isAuthenticated()).toBe(true);

        // Cleanup
        localStorage.removeItem(storageKey);
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      });

      it('should initialize without session when AbortError occurs and no localStorage fallback', async () => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        mockAuth.getSession.mockRejectedValue(abortError);

        // No localStorage data and no SUPABASE_URL
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;

        await authService.initialize();

        expect(authService.isInitialized()).toBe(true);
        expect(authService.isAuthenticated()).toBe(false);
      });

      it('should re-throw non-AbortError exceptions from getSession', async () => {
        const randomError = new Error('Something unexpected');
        randomError.name = 'TypeError';
        mockAuth.getSession.mockRejectedValue(randomError);

        await expect(authService.initialize()).rejects.toThrow('Something unexpected');
      });

      it('should handle AbortError with corrupted localStorage data gracefully', async () => {
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        mockAuth.getSession.mockRejectedValue(abortError);

        const projectRef = 'testproject';
        process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
        const storageKey = `sb-${projectRef}-auth-token`;
        localStorage.setItem(storageKey, 'not-valid-json{{{');

        await authService.initialize();

        // Should still initialize even if localStorage parse fails
        expect(authService.isInitialized()).toBe(true);
        expect(authService.isAuthenticated()).toBe(false);

        // Cleanup
        localStorage.removeItem(storageKey);
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      });
    });
  });

  describe('getMode', () => {
    it('should return cloud', async () => {
      await authService.initialize();
      expect(authService.getMode()).toBe('cloud');
    });
  });

  // ==========================================================================
  // SIGN UP
  // ==========================================================================

  describe('signUp', () => {
    beforeEach(async () => {
      await authService.initialize();
    });

    it('should sign up successfully with auto-confirm', async () => {
      mockAuth.signUp.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      const result = await authService.signUp('test@example.com', 'Password123!@#');

      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.confirmationRequired).toBe(false);
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should sign up with email confirmation required', async () => {
      mockAuth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      const result = await authService.signUp('test@example.com', 'Password123!@#');

      expect(result.user).toBeDefined();
      expect(result.session).toBeNull();
      expect(result.confirmationRequired).toBe(true);
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should validate password length', async () => {
      await expect(
        authService.signUp('test@example.com', 'Short1!')
      ).rejects.toThrow(AuthError);
    });

    it('should validate password complexity', async () => {
      // Only lowercase - missing uppercase, number, special
      await expect(
        authService.signUp('test@example.com', 'passwordonly1234')
      ).rejects.toThrow(AuthError);
    });

    it('should validate email format', async () => {
      await expect(
        authService.signUp('invalid-email', 'Password123!@#')
      ).rejects.toThrow(AuthError);
    });

    it('should throw AuthError for already registered email', async () => {
      mockAuth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });

      await expect(
        authService.signUp('existing@example.com', 'Password123!@#')
      ).rejects.toThrow('This email is already registered');
    });

    it('should throw NotInitializedError if not initialized', async () => {
      const uninitializedService = new SupabaseAuthService();
      await expect(
        uninitializedService.signUp('test@example.com', 'Password123!@#')
      ).rejects.toThrow(NotInitializedError);
    });
  });

  // ==========================================================================
  // SIGN IN
  // ==========================================================================

  describe('signIn', () => {
    beforeEach(async () => {
      await authService.initialize();
    });

    it('should sign in successfully', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      const result = await authService.signIn('test@example.com', 'Password123!@#');

      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should validate email format', async () => {
      await expect(
        authService.signIn('invalid-email', 'password')
      ).rejects.toThrow(AuthError);
    });

    it('should throw AuthError for invalid credentials (unified message prevents enumeration)', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      await expect(
        authService.signIn('test@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw same AuthError for unconfirmed email (prevents user enumeration)', async () => {
      // Security: Same error message as invalid credentials to prevent attackers
      // from determining if an email is registered but unconfirmed
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Email not confirmed' },
      });

      await expect(
        authService.signIn('test@example.com', 'Password123!@#')
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw NetworkError on network failure', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'network error: fetch failed' },
      });

      await expect(
        authService.signIn('test@example.com', 'Password123!@#')
      ).rejects.toThrow(NetworkError);
    });

    it('should enforce rate limiting after multiple failed attempts', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      // Fail 5 times to trigger rate limiting
      for (let i = 0; i < 5; i++) {
        await expect(
          authService.signIn('test@example.com', 'wrongpassword')
        ).rejects.toThrow(AuthError);
      }

      // 6th attempt should be rate limited
      await expect(
        authService.signIn('test@example.com', 'wrongpassword')
      ).rejects.toThrow('Too many failed attempts');
    });

    it('should reset rate limiting after successful sign in', async () => {
      // Fail a few times
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      for (let i = 0; i < 3; i++) {
        await expect(
          authService.signIn('test@example.com', 'wrongpassword')
        ).rejects.toThrow(AuthError);
      }

      // Successful sign in should reset the counter
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      await authService.signIn('test@example.com', 'Password123!@#');

      // Fail 5 more times (starting fresh)
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      for (let i = 0; i < 5; i++) {
        await expect(
          authService.signIn('test@example.com', 'wrongpassword')
        ).rejects.toThrow(AuthError);
      }

      // This should trigger rate limiting (5 failures after reset)
      await expect(
        authService.signIn('test@example.com', 'wrongpassword')
      ).rejects.toThrow('Too many failed attempts');
    });
  });

  // ==========================================================================
  // SIGN OUT
  // ==========================================================================

  describe('signOut', () => {
    beforeEach(async () => {
      mockAuth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      // Session validation calls getUser() to verify session is valid on server
      mockAuth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      await authService.initialize();
    });

    it('should sign out successfully', async () => {
      mockAuth.signOut.mockResolvedValue({ error: null });

      expect(authService.isAuthenticated()).toBe(true);

      await authService.signOut();

      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should clear local state even if API fails', async () => {
      mockAuth.signOut.mockResolvedValue({ error: { message: 'Network error' } });

      await authService.signOut();

      // Should still be logged out locally
      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  // ==========================================================================
  // PASSWORD RESET
  // ==========================================================================

  describe('resetPassword', () => {
    beforeEach(async () => {
      await authService.initialize();
    });

    it('should send reset email successfully', async () => {
      mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });

      await expect(
        authService.resetPassword('test@example.com')
      ).resolves.not.toThrow();
    });

    it('should validate email format', async () => {
      await expect(
        authService.resetPassword('invalid-email')
      ).rejects.toThrow(AuthError);
    });

    it('should throw NetworkError on network failure', async () => {
      mockAuth.resetPasswordForEmail.mockResolvedValue({
        error: { message: 'network error: offline' },
      });

      await expect(
        authService.resetPassword('test@example.com')
      ).rejects.toThrow(NetworkError);
    });
  });

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  describe('getSession', () => {
    beforeEach(async () => {
      await authService.initialize();
    });

    it('should return cached session if available', async () => {
      // Sign in first to populate cache
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });
      await authService.signIn('test@example.com', 'Password123!@#');

      const session = await authService.getSession();

      expect(session).toBeDefined();
      expect(session?.accessToken).toBe('mock_access_token');
    });

    it('should fetch session from API if not cached', async () => {
      mockAuth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const session = await authService.getSession();

      expect(session).toBeDefined();
    });
  });

  describe('refreshSession', () => {
    beforeEach(async () => {
      mockAuth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      await authService.initialize();
    });

    it('should refresh session successfully', async () => {
      const newSession = { ...mockSession, access_token: 'new_token' };
      mockAuth.refreshSession.mockResolvedValue({
        data: { session: newSession },
        error: null,
      });

      const session = await authService.refreshSession();

      expect(session).toBeDefined();
      expect(session?.accessToken).toBe('new_token');
    });

    it('should return null if refresh fails', async () => {
      mockAuth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token expired' },
      });

      const session = await authService.refreshSession();

      expect(session).toBeNull();
      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  // ==========================================================================
  // AUTH STATE CHANGE
  // ==========================================================================

  describe('onAuthStateChange', () => {
    beforeEach(async () => {
      await authService.initialize();
    });

    it('should subscribe to auth changes', async () => {
      const callback = jest.fn();
      authService.onAuthStateChange(callback);

      // Simulate auth change event
      authStateCallbacks.forEach(cb => cb('SIGNED_IN', mockSession));

      expect(callback).toHaveBeenCalledWith('signed_in', expect.any(Object));
    });

    it('should map auth events correctly', async () => {
      const callback = jest.fn();
      authService.onAuthStateChange(callback);

      // Test different event types
      authStateCallbacks.forEach(cb => cb('SIGNED_OUT', null));
      expect(callback).toHaveBeenCalledWith('signed_out', null);

      authStateCallbacks.forEach(cb => cb('TOKEN_REFRESHED', mockSession));
      expect(callback).toHaveBeenCalledWith('token_refreshed', expect.any(Object));

      authStateCallbacks.forEach(cb => cb('USER_UPDATED', mockSession));
      expect(callback).toHaveBeenCalledWith('user_updated', expect.any(Object));
    });

    it('should return unsubscribe function', async () => {
      const callback = jest.fn();
      const unsubscribe = authService.onAuthStateChange(callback);

      unsubscribe();

      // Verify callback was removed
      authStateCallbacks.forEach(cb => cb('SIGNED_IN', mockSession));
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // CURRENT USER
  // ==========================================================================

  describe('getCurrentUser', () => {
    beforeEach(async () => {
      await authService.initialize();
    });

    it('should return cached user if available', async () => {
      // Sign in first to populate cache
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });
      await authService.signIn('test@example.com', 'Password123!@#');

      const user = await authService.getCurrentUser();

      expect(user).toBeDefined();
      expect(user?.id).toBe('user_123_abc');
      expect(user?.email).toBe('test@example.com');
    });

    it('should fetch user from API if not cached', async () => {
      mockAuth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const user = await authService.getCurrentUser();

      expect(user).toBeDefined();
    });

    it('should return null if no user', async () => {
      mockAuth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const user = await authService.getCurrentUser();

      expect(user).toBeNull();
    });

    it('should throw NetworkError on network failure', async () => {
      mockAuth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'network error: connection refused' },
      });

      await expect(authService.getCurrentUser()).rejects.toThrow(NetworkError);
    });
  });

  // ==========================================================================
  // CONSENT MANAGEMENT (GDPR)
  // ==========================================================================

  describe('consent management', () => {
    beforeEach(async () => {
      // Sign in to have a current user
      mockAuth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });
      await authService.initialize();
      await authService.signIn('test@example.com', 'Password123!@#');
    });

    describe('recordConsent', () => {
      it('should call RPC with correct parameters', async () => {
        mockRpc.mockResolvedValue({
          data: {
            id: 'consent_123',
            user_id: mockUser.id,
            consent_type: 'terms_and_privacy',
            policy_version: '2025-01',
            consented_at: new Date().toISOString(),
          },
          error: null,
        });

        await authService.recordConsent('2025-01', {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        });

        expect(mockRpc).toHaveBeenCalledWith('record_user_consent', {
          p_consent_type: 'terms_and_privacy',
          p_policy_version: '2025-01',
          p_ip_address: '192.168.1.1',
          p_user_agent: 'Mozilla/5.0',
        });
      });

      it('should pass undefined for optional parameters', async () => {
        mockRpc.mockResolvedValue({ data: {}, error: null });

        await authService.recordConsent('2025-01');

        // After type regeneration, optional params use undefined (not null)
        // Supabase RPC treats both as "not provided"
        expect(mockRpc).toHaveBeenCalledWith('record_user_consent', {
          p_consent_type: 'terms_and_privacy',
          p_policy_version: '2025-01',
          p_ip_address: undefined,
          p_user_agent: undefined,
        });
      });

      it('should throw AuthError on RPC failure', async () => {
        mockRpc.mockResolvedValue({
          data: null,
          error: { message: 'RPC error' },
        });

        await expect(authService.recordConsent('2025-01')).rejects.toThrow(AuthError);
      });

      it('should throw AuthError if not authenticated', async () => {
        // Reset to unauthenticated state
        authService = new SupabaseAuthService();
        mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
        await authService.initialize();

        await expect(authService.recordConsent('2025-01')).rejects.toThrow(AuthError);
      });
    });

    describe('hasConsentedToVersion', () => {
      it('should return true when user has consented to specified version', async () => {
        mockRpc.mockResolvedValue({
          data: {
            policy_version: '2025-01',
            consented_at: new Date().toISOString(),
          },
          error: null,
        });

        const result = await authService.hasConsentedToVersion('2025-01');

        expect(result).toBe(true);
        expect(mockRpc).toHaveBeenCalledWith('get_user_consent', {
          p_consent_type: 'terms_and_privacy',
        });
      });

      it('should return false when user has consented to different version', async () => {
        mockRpc.mockResolvedValue({
          data: {
            policy_version: '2024-01', // Different version
            consented_at: new Date().toISOString(),
          },
          error: null,
        });

        const result = await authService.hasConsentedToVersion('2025-01');

        expect(result).toBe(false);
      });

      it('should return false when no consent record exists', async () => {
        mockRpc.mockResolvedValue({
          data: null,
          error: null,
        });

        const result = await authService.hasConsentedToVersion('2025-01');

        expect(result).toBe(false);
      });

      it('should throw AuthError if not authenticated', async () => {
        authService = new SupabaseAuthService();
        mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
        await authService.initialize();

        await expect(authService.hasConsentedToVersion('2025-01')).rejects.toThrow(AuthError);
      });
    });

    describe('getLatestConsent', () => {
      it('should return consent record when exists', async () => {
        const consentedAt = new Date().toISOString();
        mockRpc.mockResolvedValue({
          data: {
            id: 'consent_123',
            policy_version: '2025-01',
            consented_at: consentedAt,
          },
          error: null,
        });

        const result = await authService.getLatestConsent();

        expect(result).toEqual({
          policyVersion: '2025-01',
          consentedAt: consentedAt,
        });
      });

      it('should return null when no consent record exists', async () => {
        mockRpc.mockResolvedValue({
          data: null,
          error: null,
        });

        const result = await authService.getLatestConsent();

        expect(result).toBeNull();
      });

      it('should throw AuthError on RPC failure', async () => {
        mockRpc.mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        });

        await expect(authService.getLatestConsent()).rejects.toThrow(AuthError);
      });

      it('should throw AuthError if not authenticated', async () => {
        authService = new SupabaseAuthService();
        mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
        await authService.initialize();

        await expect(authService.getLatestConsent()).rejects.toThrow(AuthError);
      });
    });
  });

  // ==========================================================================
  // ACCOUNT DELETION
  // ==========================================================================

  describe('deleteAccount', () => {
    // Mock functions.invoke
    let mockFunctionsInvoke: jest.Mock;

    beforeEach(async () => {
      // Sign in to have a current user
      mockAuth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockAuth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      await authService.initialize();

      // deleteAccount() refreshes session before calling edge function
      mockAuth.refreshSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      // Setup mock for functions.invoke
      mockFunctionsInvoke = jest.fn();
      (mockSupabaseClient as unknown as { functions: { invoke: jest.Mock } }).functions = {
        invoke: mockFunctionsInvoke,
      };
    });

    it('should delete account successfully', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: true },
        error: null,
      });
      mockAuth.signOut.mockResolvedValue({ error: null });

      await authService.deleteAccount();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('delete-account', {
        method: 'POST',
      });
      // After deletion, user should be signed out
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should throw AuthError when not authenticated', async () => {
      // Reset to unauthenticated state
      authService = new SupabaseAuthService();
      mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
      await authService.initialize();

      await expect(authService.deleteAccount()).rejects.toThrow(AuthError);
      await expect(authService.deleteAccount()).rejects.toThrow('Must be authenticated to delete account');
    });

    it('should throw NotInitializedError when not initialized', async () => {
      const uninitializedService = new SupabaseAuthService();

      await expect(uninitializedService.deleteAccount()).rejects.toThrow(NotInitializedError);
    });

    it('should throw NetworkError on network failure', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: { message: 'network error: fetch failed' },
      });

      await expect(authService.deleteAccount()).rejects.toThrow(NetworkError);
    });

    it('should throw AuthError on Edge Function error', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Edge function error' },
      });

      await expect(authService.deleteAccount()).rejects.toThrow(AuthError);
    });

    it('should throw AuthError when Edge Function returns success=false', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: false, error: 'User not found' },
        error: null,
      });

      await expect(authService.deleteAccount()).rejects.toThrow(AuthError);
    });
  });
});
