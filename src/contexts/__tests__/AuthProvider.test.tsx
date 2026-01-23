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
    it('should always be authenticated in local mode', async () => {
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
