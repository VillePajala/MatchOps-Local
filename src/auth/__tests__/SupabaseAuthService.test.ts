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

// Mock Supabase client
const mockSupabaseClient = {
  auth: mockAuth,
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

      await authService.initialize();

      expect(authService.isInitialized()).toBe(true);
      expect(authService.isAuthenticated()).toBe(true);
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
  });

  // ==========================================================================
  // SIGN OUT
  // ==========================================================================

  describe('signOut', () => {
    beforeEach(async () => {
      mockAuth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null });
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
});
