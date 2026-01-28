/**
 * Tests for AuthProvider
 *
 * Tests auth context functionality including state management
 * and cache clearing on user change.
 * Part of PR #5: SupabaseAuthService + Auth UI
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthProvider';
import type { AuthService } from '@/interfaces/AuthService';
import type { AuthState, Session } from '@/interfaces/AuthTypes';

// Track auth callbacks for testing
let authCallbacks: ((state: AuthState, session: Session | null) => void)[] = [];

// Mock local user
const mockLocalUser = {
  id: 'local-user',
  email: null,
  isAnonymous: true,
  createdAt: undefined,
  updatedAt: undefined,
};

// Mock cloud user
const mockCloudUser = {
  id: 'cloud-user-123',
  email: 'test@example.com',
  isAnonymous: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const mockSession: Session = {
  accessToken: 'mock_access_token',
  refreshToken: 'mock_refresh_token',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  tokenType: 'bearer',
  user: mockCloudUser,
};

// Mock auth services
const createMockLocalAuthService = (): AuthService => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  getMode: jest.fn().mockReturnValue('local'),
  getCurrentUser: jest.fn().mockResolvedValue(mockLocalUser),
  isAuthenticated: jest.fn().mockReturnValue(true),
  getSession: jest.fn().mockResolvedValue(null),
  signIn: jest.fn().mockResolvedValue({ user: mockLocalUser, session: null }),
  signUp: jest.fn().mockResolvedValue({ user: mockLocalUser, session: null, confirmationRequired: false }),
  signOut: jest.fn().mockResolvedValue(undefined),
  resetPassword: jest.fn().mockResolvedValue(undefined),
  refreshSession: jest.fn().mockResolvedValue(null),
  onAuthStateChange: jest.fn((callback) => {
    authCallbacks.push(callback);
    return () => {
      authCallbacks = authCallbacks.filter(cb => cb !== callback);
    };
  }),
  recordConsent: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
  hasConsentedToVersion: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
  getLatestConsent: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
  deleteAccount: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
});

const createMockCloudAuthService = (authenticated = true): AuthService => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  getMode: jest.fn().mockReturnValue('cloud'),
  getCurrentUser: jest.fn().mockResolvedValue(authenticated ? mockCloudUser : null),
  isAuthenticated: jest.fn().mockReturnValue(authenticated),
  getSession: jest.fn().mockResolvedValue(authenticated ? mockSession : null),
  signIn: jest.fn().mockResolvedValue({ user: mockCloudUser, session: mockSession }),
  signUp: jest.fn().mockResolvedValue({ user: mockCloudUser, session: mockSession, confirmationRequired: false }),
  signOut: jest.fn().mockResolvedValue(undefined),
  resetPassword: jest.fn().mockResolvedValue(undefined),
  refreshSession: jest.fn().mockResolvedValue(mockSession),
  onAuthStateChange: jest.fn((callback) => {
    authCallbacks.push(callback);
    return () => {
      authCallbacks = authCallbacks.filter(cb => cb !== callback);
    };
  }),
  recordConsent: jest.fn().mockResolvedValue(undefined),
  hasConsentedToVersion: jest.fn().mockResolvedValue(true),
  getLatestConsent: jest.fn().mockResolvedValue({ policyVersion: '2025-01', consentedAt: new Date().toISOString() }),
  deleteAccount: jest.fn().mockResolvedValue(undefined),
});

// Mock factory
let mockAuthService: AuthService = createMockLocalAuthService();
let mockDataStore = {
  clearUserCaches: jest.fn(),
};

jest.mock('@/datastore/factory', () => ({
  getAuthService: jest.fn(() => Promise.resolve(mockAuthService)),
  getDataStore: jest.fn(() => Promise.resolve(mockDataStore)),
  isDataStoreInitialized: jest.fn(() => true),
}));

jest.mock('@/config/backendConfig', () => ({
  getBackendMode: jest.fn(() => 'local'),
  // Issue #336: isCloudAvailable determines auth behavior, not mode
  isCloudAvailable: jest.fn(() => true),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/contexts/SubscriptionContext', () => ({
  clearSubscriptionCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// Note: Platform detection and Play Billing mocks removed.
// Subscription is no longer granted on signup - it's a separate flow.
// Account creation is free; subscription only gates sync features.

// Test component to access auth context
function TestComponent() {
  const { isAuthenticated, isLoading, mode, user } = useAuth();
  return (
    <div>
      <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
      <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="mode">{mode}</span>
      <span data-testid="user-id">{user?.id ?? 'none'}</span>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authCallbacks = [];
    mockAuthService = createMockLocalAuthService();
    mockDataStore = {
      clearUserCaches: jest.fn(),
    };
    // Issue #336: Reset backend config mocks to defaults between tests for isolation
    const backendConfig = require('@/config/backendConfig');
    backendConfig.isCloudAvailable.mockReturnValue(true);
    backendConfig.getBackendMode.mockReturnValue('local');
  });

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  describe('initialization', () => {
    it('should show loading state initially', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    });

    it('should initialize and become ready', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });
    });
  });

  // ==========================================================================
  // LOCAL MODE
  // ==========================================================================

  describe('local mode', () => {
    /**
     * Issue #336: In local mode without cloud configured, users are always authenticated.
     * This is the "no account required" mode for users who don't have Supabase configured.
     */
    it('should always be authenticated in local mode when cloud is not available', async () => {
      const backendConfig = require('@/config/backendConfig');
      backendConfig.isCloudAvailable.mockReturnValue(false);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('mode')).toHaveTextContent('local');
    });

    /**
     * Issue #336: In local mode with cloud available, authentication depends on session.
     * This allows users to sign in while staying in local mode (auth ≠ sync).
     */
    it('should check session for authentication in local mode when cloud is available', async () => {
      const backendConfig = require('@/config/backendConfig');
      backendConfig.isCloudAvailable.mockReturnValue(true);
      // Local auth service returns null session
      mockAuthService.getSession = jest.fn().mockResolvedValue(null);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Not authenticated since no session
      expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
      expect(screen.getByTestId('mode')).toHaveTextContent('local');
    });

    /**
     * Issue #336: Core use case - user signs in while in local mode (auth ≠ sync).
     * User should be authenticated AND in local data storage mode.
     */
    it('should be authenticated in local mode when cloud is available AND session exists', async () => {
      const backendConfig = require('@/config/backendConfig');
      backendConfig.isCloudAvailable.mockReturnValue(true);
      backendConfig.getBackendMode.mockReturnValue('local');

      // Use cloud auth service (cloud available) with session (authenticated)
      mockAuthService = createMockCloudAuthService(true);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Should be authenticated because session exists
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      // But mode is still local (auth ≠ sync)
      expect(screen.getByTestId('mode')).toHaveTextContent('local');
      // User should be set from session
      expect(screen.getByTestId('user-id')).toHaveTextContent('cloud-user-123');
    });
  });

  // ==========================================================================
  // CLOUD MODE
  // ==========================================================================

  describe('cloud mode', () => {
    beforeEach(() => {
      mockAuthService = createMockCloudAuthService(true);
      const backendConfig = require('@/config/backendConfig');
      backendConfig.getBackendMode.mockReturnValue('cloud');
    });

    it('should show authenticated when session exists', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('mode')).toHaveTextContent('cloud');
      expect(screen.getByTestId('user-id')).toHaveTextContent('cloud-user-123');
    });

    it('should show not authenticated when no session', async () => {
      mockAuthService = createMockCloudAuthService(false);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
    });
  });

  // ==========================================================================
  // MODE CHANGE PERSISTENCE (Issue #336)
  // ==========================================================================

  describe('mode change persistence', () => {
    /**
     * Issue #336: User should remain authenticated when the backend mode changes.
     * AuthProvider captures mode at initialization, so a rerender won't change the
     * displayed mode. What matters is that the authentication state (user, session)
     * persists - the AuthService singleton is NOT reset on mode changes.
     *
     * Note: In real usage, mode changes happen via setBackendMode() which triggers
     * a page reload or re-initialization. These tests verify that the AuthService
     * itself doesn't lose user state when mode config changes.
     * @critical
     */
    it('should maintain authentication state across renders (mode changes do not affect auth)', async () => {
      const backendConfig = require('@/config/backendConfig');
      backendConfig.isCloudAvailable.mockReturnValue(true);
      backendConfig.getBackendMode.mockReturnValue('local');

      // Use cloud auth service (cloud available) with session (authenticated)
      mockAuthService = createMockCloudAuthService(true);

      const { rerender } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Verify initial state: authenticated
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('user-id')).toHaveTextContent('cloud-user-123');

      // Simulate mode change in config (user enables cloud sync)
      // Note: AuthProvider doesn't react to mode changes - mode is captured at init
      backendConfig.getBackendMode.mockReturnValue('cloud');

      // Force re-render
      rerender(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        // Auth state should persist - user is still authenticated
        // This is the critical Issue #336 requirement
        expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
        expect(screen.getByTestId('user-id')).toHaveTextContent('cloud-user-123');
      });
    });

    /**
     * Issue #336: Verify authenticated state persists with multiple rerenders.
     * This simulates user toggling settings without losing auth state.
     * @critical
     */
    it('should maintain authentication state across multiple rerenders', async () => {
      const backendConfig = require('@/config/backendConfig');
      backendConfig.isCloudAvailable.mockReturnValue(true);
      backendConfig.getBackendMode.mockReturnValue('local');

      mockAuthService = createMockCloudAuthService(true);

      const { rerender } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Verify initial authenticated state
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('user-id')).toHaveTextContent('cloud-user-123');

      // Multiple rerenders should not affect auth state
      for (let i = 0; i < 3; i++) {
        rerender(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        );

        await waitFor(() => {
          expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
          expect(screen.getByTestId('user-id')).toHaveTextContent('cloud-user-123');
        });
      }
    });
  });

  // ==========================================================================
  // CACHE CLEARING
  // ==========================================================================

  describe('cache clearing on auth change', () => {
    beforeEach(() => {
      mockAuthService = createMockCloudAuthService(true);
      const backendConfig = require('@/config/backendConfig');
      backendConfig.getBackendMode.mockReturnValue('cloud');
    });

    it('should clear caches when auth state changes', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Simulate auth state change (e.g., sign out)
      await act(async () => {
        authCallbacks.forEach(cb => cb('signed_out', null));
      });

      await waitFor(() => {
        expect(mockDataStore.clearUserCaches).toHaveBeenCalled();
      });
    });

    it('should clear caches when user signs in', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Simulate sign in
      await act(async () => {
        authCallbacks.forEach(cb => cb('signed_in', mockSession));
      });

      await waitFor(() => {
        expect(mockDataStore.clearUserCaches).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // CONSENT FLOW
  // ==========================================================================

  describe('consent flow', () => {
    beforeEach(() => {
      mockAuthService = createMockCloudAuthService(true);
      const backendConfig = require('@/config/backendConfig');
      backendConfig.getBackendMode.mockReturnValue('cloud');
    });

    it('should set needsReConsent when user has old policy version', async () => {
      // Mock old policy version
      mockAuthService.getLatestConsent = jest.fn().mockResolvedValue({
        policyVersion: '2024-01', // Old version
        consentedAt: new Date().toISOString(),
      });

      // Create a component that shows needsReConsent state
      function ConsentTestComponent() {
        const { needsReConsent, isLoading, signIn } = useAuth();
        return (
          <div>
            <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
            <span data-testid="needs-reconsent">{needsReConsent ? 'yes' : 'no'}</span>
            <button onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
          </div>
        );
      }

      render(
        <AuthProvider>
          <ConsentTestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Trigger sign-in
      await act(async () => {
        screen.getByText('Sign In').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('needs-reconsent')).toHaveTextContent('yes');
      });
    });

    it('should not set needsReConsent when user has current policy version', async () => {
      // Mock current policy version
      mockAuthService.getLatestConsent = jest.fn().mockResolvedValue({
        policyVersion: '2025-01', // Current version (matches POLICY_VERSION)
        consentedAt: new Date().toISOString(),
      });

      function ConsentTestComponent() {
        const { needsReConsent, isLoading, signIn } = useAuth();
        return (
          <div>
            <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
            <span data-testid="needs-reconsent">{needsReConsent ? 'yes' : 'no'}</span>
            <button onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
          </div>
        );
      }

      render(
        <AuthProvider>
          <ConsentTestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Trigger sign-in
      await act(async () => {
        screen.getByText('Sign In').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('needs-reconsent')).toHaveTextContent('no');
      });
    });

    it('should record consent on sign-up when no confirmation required', async () => {
      mockAuthService.signUp = jest.fn().mockResolvedValue({
        user: mockCloudUser,
        session: mockSession,
        confirmationRequired: false,
      });

      function SignUpTestComponent() {
        const { isLoading, signUp } = useAuth();
        return (
          <div>
            <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
            <button onClick={() => signUp('test@example.com', 'password')}>Sign Up</button>
          </div>
        );
      }

      render(
        <AuthProvider>
          <SignUpTestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Trigger sign-up
      await act(async () => {
        screen.getByText('Sign Up').click();
      });

      await waitFor(() => {
        expect(mockAuthService.recordConsent).toHaveBeenCalledWith(
          '2025-01',
          expect.objectContaining({})
        );
      });
    });

    it('should auto-record consent on sign-in for users with no consent record', async () => {
      // Mock no existing consent
      mockAuthService.getLatestConsent = jest.fn().mockResolvedValue(null);

      function ConsentTestComponent() {
        const { isLoading, signIn } = useAuth();
        return (
          <div>
            <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
            <button onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
          </div>
        );
      }

      render(
        <AuthProvider>
          <ConsentTestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Trigger sign-in
      await act(async () => {
        screen.getByText('Sign In').click();
      });

      await waitFor(() => {
        expect(mockAuthService.recordConsent).toHaveBeenCalledWith(
          '2025-01',
          expect.objectContaining({})
        );
      });
    });

    it('should clear needsReConsent on sign out', async () => {
      // Set up with old policy version to trigger needsReConsent
      mockAuthService.getLatestConsent = jest.fn().mockResolvedValue({
        policyVersion: '2024-01',
        consentedAt: new Date().toISOString(),
      });

      function ConsentTestComponent() {
        const { needsReConsent, isLoading, signIn, signOut } = useAuth();
        return (
          <div>
            <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
            <span data-testid="needs-reconsent">{needsReConsent ? 'yes' : 'no'}</span>
            <button onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
            <button onClick={() => signOut()}>Sign Out</button>
          </div>
        );
      }

      render(
        <AuthProvider>
          <ConsentTestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Sign in to trigger needsReConsent
      await act(async () => {
        screen.getByText('Sign In').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('needs-reconsent')).toHaveTextContent('yes');
      });

      // Sign out should clear needsReConsent
      await act(async () => {
        screen.getByText('Sign Out').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('needs-reconsent')).toHaveTextContent('no');
      });
    });
  });

  // ==========================================================================
  // INITIALIZATION TIMEOUT AND RETRY
  // ==========================================================================

  describe('initialization timeout and retry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockAuthService = createMockCloudAuthService(true);
      const backendConfig = require('@/config/backendConfig');
      backendConfig.getBackendMode.mockReturnValue('cloud');
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * Test component that exposes initTimedOut and retryAuthInit
     */
    function TimeoutTestComponent() {
      const { isLoading, initTimedOut, retryAuthInit, isAuthenticated } = useAuth();
      return (
        <div>
          <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
          <span data-testid="timed-out">{initTimedOut ? 'yes' : 'no'}</span>
          <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
          <button data-testid="retry-btn" onClick={retryAuthInit}>Retry</button>
        </div>
      );
    }

    /**
     * Issue #330: When auth initialization hangs, users should see initTimedOut=true
     * and have the option to retry.
     */
    it('should set initTimedOut to true after 10 second timeout', async () => {
      // Make getAuthService hang indefinitely
      const factory = require('@/datastore/factory');
      factory.getAuthService.mockImplementation(() => new Promise(() => {}));

      render(
        <AuthProvider>
          <TimeoutTestComponent />
        </AuthProvider>
      );

      // Initially loading
      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
      expect(screen.getByTestId('timed-out')).toHaveTextContent('no');

      // Advance past the 10 second timeout
      await act(async () => {
        jest.advanceTimersByTime(10001);
      });

      // Should show timed out state
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
        expect(screen.getByTestId('timed-out')).toHaveTextContent('yes');
      });
    });

    /**
     * Issue #330: Calling retryAuthInit should reset initTimedOut and re-attempt initialization.
     */
    it('should reset state and retry when retryAuthInit is called', async () => {
      const factory = require('@/datastore/factory');
      let callCount = 0;

      // First call hangs, second call succeeds
      factory.getAuthService.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise(() => {}); // Hang
        }
        return Promise.resolve(mockAuthService); // Succeed
      });

      render(
        <AuthProvider>
          <TimeoutTestComponent />
        </AuthProvider>
      );

      // Wait for timeout
      await act(async () => {
        jest.advanceTimersByTime(10001);
      });

      await waitFor(() => {
        expect(screen.getByTestId('timed-out')).toHaveTextContent('yes');
      });

      // Click retry
      await act(async () => {
        screen.getByTestId('retry-btn').click();
      });

      // Should be loading again with initTimedOut reset
      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
      expect(screen.getByTestId('timed-out')).toHaveTextContent('no');

      // Let the second initialization complete
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
        expect(screen.getByTestId('timed-out')).toHaveTextContent('no');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      });
    });

    /**
     * Issue #330: Normal initialization should not set initTimedOut.
     */
    it('should not set initTimedOut when initialization completes normally', async () => {
      const factory = require('@/datastore/factory');
      factory.getAuthService.mockResolvedValue(mockAuthService);

      render(
        <AuthProvider>
          <TimeoutTestComponent />
        </AuthProvider>
      );

      // Let initialization complete
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
        expect(screen.getByTestId('timed-out')).toHaveTextContent('no');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      });
    });
  });

  // ==========================================================================
  // HOOK ERROR
  // ==========================================================================

  describe('useAuth hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within AuthProvider');

      consoleSpy.mockRestore();
    });
  });
});
