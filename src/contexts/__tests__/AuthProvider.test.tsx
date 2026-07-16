/**
 * Tests for AuthProvider
 *
 * Tests auth context functionality including state management
 * and cache clearing on user change.
 * Part of PR #5: SupabaseAuthService + Auth UI
 */

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthProvider';
import type { AuthService } from '@/interfaces/AuthService';
import type { AuthState, Session } from '@/interfaces/AuthTypes';
import { POLICY_VERSION } from '@/config/constants';

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
  verifyPasswordResetOtp: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
  updatePassword: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
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
  getMarketingConsentStatus: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
  setMarketingConsent: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
  verifySignUpOtp: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
  resendSignUpConfirmation: jest.fn().mockRejectedValue(new Error('Not supported in local mode')),
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
  verifyPasswordResetOtp: jest.fn().mockResolvedValue(undefined),
  updatePassword: jest.fn().mockResolvedValue(undefined),
  refreshSession: jest.fn().mockResolvedValue(mockSession),
  onAuthStateChange: jest.fn((callback) => {
    authCallbacks.push(callback);
    return () => {
      authCallbacks = authCallbacks.filter(cb => cb !== callback);
    };
  }),
  recordConsent: jest.fn().mockResolvedValue(undefined),
  hasConsentedToVersion: jest.fn().mockResolvedValue(true),
  getLatestConsent: jest.fn().mockResolvedValue({ policyVersion: POLICY_VERSION, consentedAt: new Date().toISOString() }),
  getMarketingConsentStatus: jest.fn().mockResolvedValue(null),
  setMarketingConsent: jest.fn().mockResolvedValue(undefined),
  verifySignUpOtp: jest.fn().mockResolvedValue({ user: mockCloudUser, session: mockSession }),
  resendSignUpConfirmation: jest.fn().mockResolvedValue(undefined),
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
  closeDataStore: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/datastore/userDatabase', () => ({
  deleteUserLocalDatabases: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/config/backendConfig', () => ({
  getBackendMode: jest.fn(() => 'local'),
  // Issue #336: isCloudAvailable determines auth behavior, not mode
  isCloudAvailable: jest.fn(() => true),
  clearMigrationCompleted: jest.fn(),
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

// Test component that can trigger account deletion
function DeleteAccountTester() {
  const { isLoading, deleteAccount } = useAuth();
  return (
    <div>
      <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
      <button onClick={() => { void deleteAccount(); }}>delete-account</button>
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

    it('signOut clears the migration-completed flag for EVERY caller (3.1b review fix)', async () => {
      // The flag gates the one-time post-login cloud-hydration check; a
      // sign-out that leaves it set means silently stale local data on the
      // next sign-in. Centralized in AuthProvider.signOut so the gear-sheet
      // button, Settings -> Account, and future callers all get it.
      function SignOutTester() {
        const { isLoading, signOut } = useAuth();
        return (
          <div>
            <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
            <button data-testid="sign-out-btn" onClick={() => { void signOut(); }}>Sign Out</button>
          </div>
        );
      }
      render(
        <AuthProvider>
          <SignOutTester />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      const backendConfig = jest.requireMock('@/config/backendConfig');
      await act(async () => {
        fireEvent.click(screen.getByTestId('sign-out-btn'));
      });
      await waitFor(() => {
        expect(backendConfig.clearMigrationCompleted).toHaveBeenCalledWith('cloud-user-123');
      });
    });

    it('closes the DataStore BEFORE deleting local databases on account deletion (erasure not blocked)', async () => {
      // Regression (review H1): account deletion must release the open IndexedDB
      // connections (data mirror + sync queue) before indexedDB.deleteDatabase(),
      // otherwise the delete is blocked and the local copy silently survives.
      const { closeDataStore } = require('@/datastore/factory');
      const { deleteUserLocalDatabases } = require('@/datastore/userDatabase');

      render(
        <AuthProvider>
          <DeleteAccountTester />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      await act(async () => {
        fireEvent.click(screen.getByText('delete-account'));
      });

      await waitFor(() => {
        expect(deleteUserLocalDatabases).toHaveBeenCalledWith('cloud-user-123');
      });
      expect(closeDataStore).toHaveBeenCalledWith({ force: true });
      // Ordering is the whole point: close must run before the delete.
      expect(closeDataStore.mock.invocationCallOrder[0])
        .toBeLessThan(deleteUserLocalDatabases.mock.invocationCallOrder[0]);
    });

    it('still attempts the local DB delete (best-effort) if closing the DataStore fails', async () => {
      // The close is the fix, but the delete must remain best-effort: a close
      // failure must not skip the erasure attempt entirely.
      const { closeDataStore } = require('@/datastore/factory');
      const { deleteUserLocalDatabases } = require('@/datastore/userDatabase');
      closeDataStore.mockRejectedValueOnce(new Error('close failed'));

      render(
        <AuthProvider>
          <DeleteAccountTester />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      await act(async () => {
        fireEvent.click(screen.getByText('delete-account'));
      });

      await waitFor(() => {
        expect(deleteUserLocalDatabases).toHaveBeenCalledWith('cloud-user-123');
      });
    });

    it('registers exactly one auth listener and unsubscribes it on unmount (no leak)', async () => {
      const { unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Exactly one active listener after init (registered before the consent await,
      // so it can't be missed or double-registered).
      expect(authCallbacks).toHaveLength(1);

      unmount();

      // The effect cleanup must unsubscribe it — no orphaned listener left behind.
      expect(authCallbacks).toHaveLength(0);
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

    it('should NOT clear caches on sign-out (no userId available)', async () => {
      // With user-scoped storage, we can't access DataStore without a userId.
      // On sign-out, session is null → userId is undefined → cache clearing is skipped.
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Clear any calls from initialization
      mockDataStore.clearUserCaches.mockClear();

      // Simulate sign out (null session = no userId)
      await act(async () => {
        authCallbacks.forEach(cb => cb('signed_out', null));
      });

      // Wait a tick to ensure any async operations complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Cache clearing should NOT be called (no userId available)
      expect(mockDataStore.clearUserCaches).not.toHaveBeenCalled();
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

    it('does not show the app logged-in via the SIGNED_IN event before re-consent is resolved (race fix)', async () => {
      // Start with no session so the user begins unauthenticated.
      mockAuthService = createMockCloudAuthService(false);
      const backendConfig = require('@/config/backendConfig');
      backendConfig.getBackendMode.mockReturnValue('cloud');

      // Control when the consent check resolves, and fire a SIGNED_IN event mid-check
      // (this is the event that previously set user/session before needsReConsent).
      let resolveConsent: (v: { policyVersion: string; consentedAt: string }) => void;
      const consentGate = new Promise<{ policyVersion: string; consentedAt: string }>((r) => { resolveConsent = r; });
      mockAuthService.signIn = jest.fn().mockResolvedValue({ user: mockCloudUser, session: mockSession });
      mockAuthService.getLatestConsent = jest.fn().mockImplementation(async () => {
        // Simulate the SIGNED_IN auth event arriving during the consent await.
        authCallbacks.forEach((cb) => cb('signed_in' as AuthState, mockSession));
        return consentGate;
      });

      function ConsentRaceComponent() {
        const { needsReConsent, isLoading, isAuthenticated, signIn } = useAuth();
        return (
          <div>
            <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
            <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
            <span data-testid="needs-reconsent">{needsReConsent ? 'yes' : 'no'}</span>
            <button onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
          </div>
        );
      }

      render(<AuthProvider><ConsentRaceComponent /></AuthProvider>);
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
      expect(screen.getByTestId('authenticated')).toHaveTextContent('no');

      // Start sign-in; it parks on the consent gate after firing the SIGNED_IN event.
      await act(async () => { screen.getByText('Sign In').click(); });

      // The event fired during the consent await must NOT have logged the user in —
      // signIn() owns state-setting and sets needsReConsent first.
      expect(screen.getByTestId('authenticated')).toHaveTextContent('no');

      // Resolve consent with an OLD policy version → re-consent required.
      await act(async () => {
        resolveConsent({ policyVersion: '2024-01', consentedAt: new Date().toISOString() });
      });

      await waitFor(() => expect(screen.getByTestId('needs-reconsent')).toHaveTextContent('yes'));
      // signIn() itself then sets the authoritative state — the user IS logged in
      // (the guard defers to signIn, it doesn't swallow the state-set).
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
    });

    it('should not set needsReConsent when user has current policy version', async () => {
      // Mock current policy version
      mockAuthService.getLatestConsent = jest.fn().mockResolvedValue({
        policyVersion: POLICY_VERSION, // Current version
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
          POLICY_VERSION,
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
          POLICY_VERSION,
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
    it('should set initTimedOut to true after 20 second timeout', async () => {
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
        jest.advanceTimersByTime(20001);
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

      // First call hangs, second call succeeds but with small delay
      let resolveSecondInit: (value: typeof mockAuthService) => void;
      factory.getAuthService.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise(() => {}); // Hang forever
        }
        // Second call - return promise that we control
        return new Promise((resolve) => {
          resolveSecondInit = resolve;
        });
      });

      render(
        <AuthProvider>
          <TimeoutTestComponent />
        </AuthProvider>
      );

      // Wait for timeout
      await act(async () => {
        jest.advanceTimersByTime(20001);
      });

      await waitFor(() => {
        expect(screen.getByTestId('timed-out')).toHaveTextContent('yes');
      });

      // Click retry - this triggers second initialization
      await act(async () => {
        screen.getByTestId('retry-btn').click();
      });

      // Should be loading again with initTimedOut reset
      // Use waitFor since state updates may be batched
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loading');
        expect(screen.getByTestId('timed-out')).toHaveTextContent('no');
      });

      // Now resolve the second initialization
      await act(async () => {
        resolveSecondInit!(mockAuthService);
      });

      // Let effects settle
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
  // AUTH GRACE PERIOD
  // ==========================================================================

  describe('auth grace period', () => {
    const SUPABASE_TEST_URL = 'https://testproject.supabase.co';
    const STORAGE_KEY = 'sb-testproject-auth-token';

    /**
     * Test component that exposes grace period state
     */
    function GracePeriodTestComponent() {
      const { isLoading, isAuthenticated, isAuthGracePeriod, initTimedOut, user, session, signOut } = useAuth();
      return (
        <div>
          <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
          <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
          <span data-testid="grace-period">{isAuthGracePeriod ? 'yes' : 'no'}</span>
          <span data-testid="timed-out">{initTimedOut ? 'yes' : 'no'}</span>
          <span data-testid="user-id">{user?.id ?? 'none'}</span>
          <span data-testid="has-session">{session ? 'yes' : 'no'}</span>
          <button data-testid="sign-out-btn" onClick={signOut}>Sign Out</button>
        </div>
      );
    }

    // localStorage mock store — jest.clearAllMocks() from parent beforeEach resets
    // the localStorage mock implementations, so we must re-establish them here.
    let mockLocalStore: Record<string, string> = {};

    beforeEach(() => {
      jest.useFakeTimers();

      // Set up cloud mode with no session (unauthenticated)
      mockAuthService = createMockCloudAuthService(false);
      const backendConfig = require('@/config/backendConfig');
      backendConfig.getBackendMode.mockReturnValue('cloud');
      backendConfig.isCloudAvailable.mockReturnValue(true);

      // Re-establish factory mock — jest.restoreAllMocks() in setupTests afterEach
      // may reset the initial jest.fn(impl), so we must set it explicitly.
      const factory = require('@/datastore/factory');
      factory.getAuthService.mockImplementation(() => Promise.resolve(mockAuthService));

      // Re-establish localStorage mock implementations (cleared by jest.clearAllMocks)
      mockLocalStore = {};
      (localStorage.getItem as jest.Mock).mockImplementation((key: string) => mockLocalStore[key] ?? null);
      (localStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => { mockLocalStore[key] = String(value); });
      (localStorage.removeItem as jest.Mock).mockImplementation((key: string) => { delete mockLocalStore[key]; });

      // Set Supabase URL so getCachedUserIdentity() can compute the storage key
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_TEST_URL;
    });

    afterEach(() => {
      jest.useRealTimers();
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    });

    /**
     * Expired cached token should NOT trigger grace period.
     * getCachedUserIdentity() checks expires_at and rejects expired tokens.
     * @edge-case
     */
    it('should not enter grace period when cached token is expired', async () => {
      // Store an expired Supabase session in localStorage
      const expiredSession = {
        expires_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        user: { id: 'cached-user-123', email: 'cached@example.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expiredSession));

      // Mock offline
      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        render(
          <AuthProvider>
            <GracePeriodTestComponent />
          </AuthProvider>
        );

        // Flush async initAuth effects (resolved promise chain inside useEffect)
        await act(async () => {
          jest.advanceTimersByTime(100);
        });

        await waitFor(() => {
          expect(screen.getByTestId('loading')).toHaveTextContent('ready');
        });

        // Grace period should NOT be active — token is expired
        expect(screen.getByTestId('grace-period')).toHaveTextContent('no');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
        expect(screen.getByTestId('user-id')).toHaveTextContent('none');
      } finally {
        // Restore navigator.onLine
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
    });

    /**
     * Valid (non-expired) cached token should trigger grace period (trigger 1).
     * When init completes with no session in cloud mode and a cached token exists,
     * grace period activates regardless of navigator.onLine (captive portal resilience).
     * @edge-case
     */
    it('should enter grace period when cached token is valid (trigger 1)', async () => {
      // Store a valid (non-expired) Supabase session in localStorage
      const validSession = {
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        user: { id: 'cached-user-456', email: 'valid@example.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));

      // Note: navigator.onLine is NOT mocked (defaults to true in jsdom).
      // Trigger 1 intentionally does NOT check onLine — captive portals and ISP
      // outages have onLine === true but no real connectivity. The combination of
      // "no session + cached token" is sufficient signal.

      render(
        <AuthProvider>
          <GracePeriodTestComponent />
        </AuthProvider>
      );

      // Flush async initAuth effects (resolved promise chain inside useEffect)
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Grace period SHOULD be active — valid token, init returned no session
      expect(screen.getByTestId('grace-period')).toHaveTextContent('yes');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('user-id')).toHaveTextContent('cached-user-456');
      // Grace-period invariant: no live session (user is kept from cache).
      expect(screen.getByTestId('has-session')).toHaveTextContent('no');
    });

    /**
     * Trigger 3 (mid-session): a signed_out event while offline must enter grace
     * period AND clear the now-invalid session — without logging the user out
     * (isAuthenticated falls back to isAuthGracePeriod). Previously the stale
     * session was left in state, violating the invariant.
     */
    it('clears the stale session when entering grace period mid-session (trigger 3)', async () => {
      // Start signed in: init provides a live session (not an interactive signIn,
      // so the signed_out event isn't ignored by the "signed in this session" guard).
      mockAuthService = createMockCloudAuthService(true);
      const factory = require('@/datastore/factory');
      factory.getAuthService.mockImplementation(() => Promise.resolve(mockAuthService));
      const validSession = {
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'cloud-user-123', email: 'cloud@example.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));

      render(<AuthProvider><GracePeriodTestComponent /></AuthProvider>);
      await act(async () => { jest.advanceTimersByTime(100); });
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

      // Live session after init.
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-session')).toHaveTextContent('yes');

      // Go offline and receive a mid-session signed_out (token expiry while offline).
      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      try {
        await act(async () => {
          authCallbacks.forEach((cb) => cb('signed_out' as AuthState, null));
        });

        expect(screen.getByTestId('grace-period')).toHaveTextContent('yes');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('yes'); // not logged out
        expect(screen.getByTestId('has-session')).toHaveTextContent('no');    // stale session cleared
      } finally {
        if (originalOnLine) Object.defineProperty(navigator, 'onLine', originalOnLine);
      }
    });

    /**
     * CR-M5 #4: if a password reset was in progress when the app reloaded, the
     * persisted recovery session must be cleared on init — NOT treated as a normal
     * sign-in (which would log the user in without ever changing the password).
     */
    it('clears the lingering recovery session on reload when a reset was in progress (#4)', async () => {
      // A recovery session exists, and the persisted reset-in-progress flag is set.
      mockAuthService = createMockCloudAuthService(true);
      const signOutSpy = jest.spyOn(mockAuthService, 'signOut').mockImplementation(async () => {
        // Real signOut clears the session — reflect that in the mock.
        mockAuthService.getSession = jest.fn().mockResolvedValue(null);
        mockAuthService.getCurrentUser = jest.fn().mockResolvedValue(null);
      });
      const factory = require('@/datastore/factory');
      factory.getAuthService.mockImplementation(() => Promise.resolve(mockAuthService));
      localStorage.setItem('matchops-password-reset-in-progress', '1');

      render(<AuthProvider><GracePeriodTestComponent /></AuthProvider>);
      await act(async () => { jest.advanceTimersByTime(100); });
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

      // The recovery session was signed out — the reload did NOT auto-sign-in.
      expect(signOutSpy).toHaveBeenCalled();
      expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
      expect(screen.getByTestId('has-session')).toHaveTextContent('no');
      // Flag self-cleared so it can't affect a future normal session.
      expect(localStorage.getItem('matchops-password-reset-in-progress')).toBeNull();
    });

    it('does not surface the recovery session (and keeps the flag) if signOut fails on reload (#4)', async () => {
      // signOut fails during the init guard — the recovery session is still in storage.
      mockAuthService = createMockCloudAuthService(true);
      jest.spyOn(mockAuthService, 'signOut').mockRejectedValue(new Error('signOut failed'));
      const factory = require('@/datastore/factory');
      factory.getAuthService.mockImplementation(() => Promise.resolve(mockAuthService));
      localStorage.setItem('matchops-password-reset-in-progress', '1');

      render(<AuthProvider><GracePeriodTestComponent /></AuthProvider>);
      await act(async () => { jest.advanceTimersByTime(100); });
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

      // Even though signOut failed, the recovery session must NOT be surfaced as a
      // sign-in, and we must not fall into grace period either — user lands on login.
      expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
      expect(screen.getByTestId('grace-period')).toHaveTextContent('no');
      expect(screen.getByTestId('has-session')).toHaveTextContent('no');
      // Flag kept so the next reload retries clearing the recovery session.
      expect(localStorage.getItem('matchops-password-reset-in-progress')).toBe('1');
    });

    /**
     * CR-H3: offline cold start where init THROWS (e.g. NetworkError from getCurrentUser).
     * The init catch must enter grace period (trigger 4) so the user isn't hard-locked
     * at the LoginScreen — the "locked out at the field" case.
     * @critical
     */
    it('should enter grace period when init throws with a cached token (CR-H3, trigger 4)', async () => {
      const cachedSession = {
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'refresh_xyz',
        user: { id: 'cached-user-789', email: 'offline@example.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSession));

      // Simulate offline cold start: getCurrentUser rejects → lands in the init catch.
      mockAuthService.getCurrentUser = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

      render(
        <AuthProvider>
          <GracePeriodTestComponent />
        </AuthProvider>
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      expect(screen.getByTestId('grace-period')).toHaveTextContent('yes');
      expect(screen.getByTestId('user-id')).toHaveTextContent('cached-user-789');
      // Grace-period invariant: no live session on the init-error path either.
      expect(screen.getByTestId('has-session')).toHaveTextContent('no');
    });

    /**
     * CR-H4: init throws with NO cached session (e.g. chunk-load failure post-deploy,
     * or a fresh user offline). The user would otherwise be stranded — authService
     * unset, signIn() returns "Auth not initialized" forever. The retry screen must
     * surface (initTimedOut) so retryAuthInit() can re-run init.
     * @critical
     */
    it('surfaces the retry screen when init throws with no cached session (CR-H4)', async () => {
      // No cached session in localStorage.
      mockAuthService.getCurrentUser = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

      render(
        <AuthProvider>
          <GracePeriodTestComponent />
        </AuthProvider>
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      expect(screen.getByTestId('grace-period')).toHaveTextContent('no');
      expect(screen.getByTestId('timed-out')).toHaveTextContent('yes');
    });

    /**
     * CR-H4: if the 20s safety timeout fires (initTimedOut=true) but init then
     * resolves late, the timeout/retry screen must clear so the user isn't stuck on
     * "Connection Timeout" while actually signed in.
     * @critical
     */
    it('clears the retry screen when init succeeds after the safety timeout fired (CR-H4)', async () => {
      // getCurrentUser hangs until we resolve it, so the 20s timeout fires first.
      let resolveGetUser: (v: unknown) => void = () => {};
      mockAuthService.getCurrentUser = jest.fn().mockReturnValue(
        new Promise((res) => { resolveGetUser = res; })
      );
      mockAuthService.getSession = jest.fn().mockResolvedValue(null);

      render(
        <AuthProvider>
          <GracePeriodTestComponent />
        </AuthProvider>
      );

      // Advance past the 20s safety timeout → retry screen shows (no cached session).
      await act(async () => {
        jest.advanceTimersByTime(20001);
      });
      expect(screen.getByTestId('timed-out')).toHaveTextContent('yes');

      // Init resolves late → success path must clear the timeout flag.
      await act(async () => {
        resolveGetUser(null);
      });
      await waitFor(() => {
        expect(screen.getByTestId('timed-out')).toHaveTextContent('no');
      });
    });

    /**
     * Supabase may store session in wrapped { currentSession: ... } format.
     * getCachedUserIdentity() must handle both direct and wrapped formats.
     * @edge-case
     */
    it('should enter grace period when cached token uses currentSession wrapper format', async () => {
      // Store session in the legacy wrapped format
      const wrappedSession = {
        currentSession: {
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          access_token: 'mock_token',
          user: { id: 'wrapped-user-101', email: 'wrapped@example.com' },
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wrappedSession));

      // Note: navigator.onLine not mocked — trigger 1 doesn't check it (see valid token test)

      render(
        <AuthProvider>
          <GracePeriodTestComponent />
        </AuthProvider>
      );

      // Flush async initAuth effects (resolved promise chain inside useEffect)
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Grace period SHOULD be active — valid wrapped token, init returned no session
      expect(screen.getByTestId('grace-period')).toHaveTextContent('yes');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('user-id')).toHaveTextContent('wrapped-user-101');
    });

    /**
     * Grace period → online → re-init failure should not loop or leave inconsistent state.
     * When the device comes online and re-init fails again (timeout), the app should
     * re-enter grace period (if cached token still valid) — not loop or crash.
     * @edge-case
     */
    it('should re-enter grace period after failed re-init without looping', async () => {
      // Note: jest.useFakeTimers() already set up by describe-level beforeEach

      // Store a valid cached session
      const validSession = {
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'cached-user-789', email: 'retry@example.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));

      const factory = require('@/datastore/factory');
      let initCallCount = 0;

      // First call: returns service with null session (triggers grace period via cached token)
      // Second call (after online): hangs (triggers timeout → re-enters grace period)
      factory.getAuthService.mockImplementation(() => {
        initCallCount++;
        if (initCallCount === 1) {
          return Promise.resolve(mockAuthService);
        }
        // Second and subsequent calls: hang forever (simulates failed re-init)
        return new Promise(() => {});
      });

      // Mock offline for initial load
      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        render(
          <AuthProvider>
            <GracePeriodTestComponent />
          </AuthProvider>
        );

        // Let initial auth init complete
        await act(async () => {
          jest.advanceTimersByTime(100);
        });

        await waitFor(() => {
          expect(screen.getByTestId('loading')).toHaveTextContent('ready');
        });

        // Should be in grace period (offline + valid cached token + no session)
        expect(screen.getByTestId('grace-period')).toHaveTextContent('yes');
        expect(screen.getByTestId('user-id')).toHaveTextContent('cached-user-789');

        // Simulate device coming online
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        await act(async () => {
          window.dispatchEvent(new Event('online'));
        });

        // Grace period should be cleared, loading should restart
        await waitFor(() => {
          expect(screen.getByTestId('grace-period')).toHaveTextContent('no');
          expect(screen.getByTestId('loading')).toHaveTextContent('loading');
        });

        // Re-init hangs — advance past 10s timeout
        // The timeout handler finds the valid cached token and re-enters grace period
        await act(async () => {
          jest.advanceTimersByTime(20001);
        });

        await waitFor(() => {
          expect(screen.getByTestId('loading')).toHaveTextContent('ready');
          // Should re-enter grace period (timeout + valid cached token)
          expect(screen.getByTestId('grace-period')).toHaveTextContent('yes');
          expect(screen.getByTestId('timed-out')).toHaveTextContent('no'); // Grace period supersedes timeout
          expect(screen.getByTestId('user-id')).toHaveTextContent('cached-user-789');
          // Grace-period invariant: no live session on the timeout path either.
          expect(screen.getByTestId('has-session')).toHaveTextContent('no');
        });

        // Verify no infinite loop: initCallCount should be exactly 2 (initial + one retry)
        expect(initCallCount).toBe(2);
      } finally {
        // Note: jest.useRealTimers() handled by describe-level afterEach
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
    });

    /**
     * Mid-session token expiry while offline should enter grace period (trigger 3).
     * When onAuthStateChange fires signed_out with null session while offline and
     * a valid cached token exists, the user should keep access via grace period.
     * @edge-case
     */
    it('should enter grace period on mid-session signout while offline with cached token', async () => {
      // Start authenticated (session exists)
      mockAuthService = createMockCloudAuthService(true);
      const factory = require('@/datastore/factory');
      factory.getAuthService.mockImplementation(() => Promise.resolve(mockAuthService));

      // Store a valid cached session (for grace period fallback)
      const validSession = {
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'cloud-user-123', email: 'test@example.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));

      render(
        <AuthProvider>
          <GracePeriodTestComponent />
        </AuthProvider>
      );

      // Let auth init complete (authenticated)
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Should be authenticated, NOT in grace period
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('grace-period')).toHaveTextContent('no');

      // Now go offline
      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        // Simulate token expiry → Supabase fires signed_out with null session
        await act(async () => {
          authCallbacks.forEach(cb => cb('signed_out', null));
        });

        await waitFor(() => {
          // Should enter grace period instead of logging out
          expect(screen.getByTestId('grace-period')).toHaveTextContent('yes');
          expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
          expect(screen.getByTestId('user-id')).toHaveTextContent('cloud-user-123');
        });
      } finally {
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
    });

    /**
     * Intentional sign-out while offline should NOT enter grace period.
     * The user explicitly clicked "Sign Out" — don't re-enter grace period
     * even if there's a valid cached token and the device is offline.
     * @critical
     */
    it('should NOT enter grace period on intentional sign-out while offline', async () => {
      // Start authenticated (session exists)
      mockAuthService = createMockCloudAuthService(true);
      const factory = require('@/datastore/factory');
      factory.getAuthService.mockImplementation(() => Promise.resolve(mockAuthService));

      // Store a valid cached session
      const validSession = {
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'cloud-user-123', email: 'test@example.com' },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));

      render(
        <AuthProvider>
          <GracePeriodTestComponent />
        </AuthProvider>
      );

      // Let auth init complete (authenticated)
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('grace-period')).toHaveTextContent('no');

      // Go offline
      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        // User clicks Sign Out (intentional)
        await act(async () => {
          screen.getByTestId('sign-out-btn').click();
        });

        // Allow signOut async to complete
        await act(async () => {
          jest.advanceTimersByTime(100);
        });

        await waitFor(() => {
          // Should be logged out — NOT in grace period
          expect(screen.getByTestId('grace-period')).toHaveTextContent('no');
          expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
          expect(screen.getByTestId('user-id')).toHaveTextContent('none');
        });
      } finally {
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
    });

    /**
     * M4: A signed_out event fired within the brief post-sign-in race window is
     * spurious (Supabase session juggling) and must be ignored — the session stays.
     * @edge-case
     */
    it('ignores a spurious signed_out within the post-sign-in race window', async () => {
      // NOTE: jest.useFakeTimers() is set by the describe-level beforeEach, so
      // advanceTimersByTime also drives Date.now() (used for the race-window math).
      function SignInComponent() {
        const { isAuthenticated, user, signIn } = useAuth();
        return (
          <div>
            <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
            <span data-testid="user-id">{user?.id ?? 'none'}</span>
            <button data-testid="sign-in-btn" onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
          </div>
        );
      }

      render(<AuthProvider><SignInComponent /></AuthProvider>);

      await act(async () => { jest.advanceTimersByTime(100); });
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('no'));

      // Interactive sign-in stamps the sign-in time and locks the session.
      await act(async () => { screen.getByTestId('sign-in-btn').click(); });
      await act(async () => { jest.advanceTimersByTime(100); });
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('yes'));

      // A signed_out fired immediately afterwards is a spurious post-sign-in race.
      await act(async () => {
        authCallbacks.forEach(cb => cb('signed_out' as AuthState, null));
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      expect(screen.getByTestId('user-id')).toHaveTextContent('cloud-user-123');
    });

    /**
     * M4: A signed_out event that arrives AFTER the race window is a genuine
     * server-side revocation (password changed elsewhere, token revoked, account
     * disabled). While online it must log the user out — not be swallowed.
     * @critical
     */
    it('honors a signed_out after the race window (server revocation) and logs out when online', async () => {
      // NOTE: jest.useFakeTimers() is set by the describe-level beforeEach, so the
      // advanceTimersByTime(5000) below pushes Date.now() past SIGN_IN_RACE_WINDOW_MS.
      function SignInComponent() {
        const { isAuthenticated, user, signIn } = useAuth();
        return (
          <div>
            <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
            <span data-testid="user-id">{user?.id ?? 'none'}</span>
            <button data-testid="sign-in-btn" onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
          </div>
        );
      }

      render(<AuthProvider><SignInComponent /></AuthProvider>);

      await act(async () => { jest.advanceTimersByTime(100); });
      await act(async () => { screen.getByTestId('sign-in-btn').click(); });
      await act(async () => { jest.advanceTimersByTime(100); });
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('yes'));

      // Advance well past the race window, then a genuine revocation arrives.
      // navigator.onLine defaults to true in jsdom, so there's no grace period.
      await act(async () => { jest.advanceTimersByTime(5000); });
      await act(async () => {
        authCallbacks.forEach(cb => cb('signed_out' as AuthState, null));
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
        expect(screen.getByTestId('user-id')).toHaveTextContent('none');
      });
    });

    /**
     * M4: A post-window revocation while OFFLINE must NOT hard-log-out — it falls
     * through to the grace-period path (cached identity kept visible) so the coach
     * can keep working with local data. Pins guard ordering against regressions.
     * @critical
     */
    it('enters grace period (not hard logout) on a post-window revocation while offline', async () => {
      // NOTE: jest.useFakeTimers() is set by the describe-level beforeEach, so the
      // advanceTimersByTime(5000) below pushes Date.now() past SIGN_IN_RACE_WINDOW_MS.
      function SignInGraceComponent() {
        const { isAuthenticated, isAuthGracePeriod, user, signIn } = useAuth();
        return (
          <div>
            <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
            <span data-testid="grace-period">{isAuthGracePeriod ? 'yes' : 'no'}</span>
            <span data-testid="user-id">{user?.id ?? 'none'}</span>
            <button data-testid="sign-in-btn" onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
          </div>
        );
      }

      // Cache a valid session so getCachedUserIdentity() can back the grace period.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'cloud-user-123', email: 'test@example.com' },
      }));

      render(<AuthProvider><SignInGraceComponent /></AuthProvider>);

      await act(async () => { jest.advanceTimersByTime(100); });
      await act(async () => { screen.getByTestId('sign-in-btn').click(); });
      await act(async () => { jest.advanceTimersByTime(100); });
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('yes'));

      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      try {
        // Past the race window, offline, genuine revocation → grace period.
        await act(async () => { jest.advanceTimersByTime(5000); });
        await act(async () => {
          authCallbacks.forEach(cb => cb('signed_out' as AuthState, null));
        });

        await waitFor(() => {
          expect(screen.getByTestId('grace-period')).toHaveTextContent('yes');
          expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
          expect(screen.getByTestId('user-id')).toHaveTextContent('cloud-user-123');
        });
      } finally {
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
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
