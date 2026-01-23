/**
 * AuthProvider - Authentication context for the app.
 *
 * Provides authentication state and actions to all components.
 *
 * @remarks
 * - In local mode: No-op, always "authenticated" as local user
 * - In cloud mode: Manages Supabase auth state
 * - Wraps the app (inside layout.tsx) to provide auth context before data fetching
 *
 * Part of Phase 4 Supabase implementation (PR #5).
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 6.3
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getAuthService, getDataStore, isDataStoreInitialized } from '@/datastore/factory';
import { getBackendMode } from '@/config/backendConfig';
import { POLICY_VERSION } from '@/config/constants';
import { NetworkError } from '@/interfaces/DataStoreErrors';
import type { User, Session, AuthState } from '@/interfaces/AuthTypes';
import { clearSubscriptionCache } from '@/contexts/SubscriptionContext';
import * as Sentry from '@sentry/nextjs';
import type { AuthService } from '@/interfaces/AuthService';
import logger from '@/utils/logger';

/**
 * Auth context value interface.
 */
interface AuthContextValue {
  // State
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mode: 'local' | 'cloud';
  /** True when user has consented to an old policy version and needs to re-consent */
  needsReConsent: boolean;

  // Actions
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; confirmationRequired?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  recordConsent: () => Promise<{ error?: string }>;
  /** Accept the new Terms/Privacy Policy and record consent */
  acceptReConsent: () => Promise<{ error?: string }>;
  /** Permanently delete the user's account (cloud mode only) */
  deleteAccount: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hook to access authentication context.
 *
 * @throws Error if used outside of AuthProvider
 * @returns Authentication context value
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isAuthenticated, signOut } = useAuth();
 *
 *   if (!isAuthenticated) {
 *     return <LoginScreen />;
 *   }
 *
 *   return <div>Welcome, {user?.email}</div>;
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

/**
 * Authentication provider component.
 *
 * Wraps the app to provide authentication context.
 * In local mode, the user is always considered "authenticated".
 * In cloud mode, manages Supabase authentication state.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'local' | 'cloud'>('local');
  const [needsReConsent, setNeedsReConsent] = useState(false);

  // Initialize auth service
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    async function initAuth() {
      try {
        const currentMode = getBackendMode();
        const service = await getAuthService();

        if (!mounted) return;

        setMode(currentMode);
        setAuthService(service);

        // Note: service.initialize() already called by factory

        if (!mounted) return;

        // Get initial state
        const currentUser = await service.getCurrentUser();
        const currentSession = await service.getSession();

        if (!mounted) return;

        setUser(currentUser);
        setSession(currentSession);

        // Subscribe to auth changes (cloud mode fires events, local mode is no-op)
        unsubscribe = service.onAuthStateChange(async (state: AuthState, newSession: Session | null) => {
          logger.debug('[AuthProvider] Auth state changed:', state);
          setSession(newSession);
          setUser(newSession?.user ?? null);

          // Re-verify consent on token refresh to catch policy version updates
          // Without this, users with auto-refreshing tokens could avoid re-consent indefinitely
          if (state === 'token_refreshed' && newSession && currentMode === 'cloud') {
            try {
              const latestConsent = await service.getLatestConsent();
              if (latestConsent && latestConsent.policyVersion !== POLICY_VERSION) {
                logger.info('[AuthProvider] Policy version changed during session, requiring re-consent');
                setNeedsReConsent(true);
              }
            } catch (consentError) {
              // Non-critical: don't break token refresh, consent will be checked on next sign-in
              logger.warn('[AuthProvider] Failed to check consent on token refresh:', consentError);
            }
          }

          // Clear DataStore caches when user changes (prevents User B seeing User A's cached data)
          // Note: On initial load (INITIAL_SESSION), DataStore may not be initialized yet.
          // This is fine - fresh sessions have no stale cache. Cache clearing only matters
          // for subsequent auth changes (sign out → sign in as different user).
          try {
            if (isDataStoreInitialized()) {
              const dataStore = await getDataStore();
              dataStore.clearUserCaches?.();
            }
          } catch (error) {
            // Non-critical: cache clearing failure shouldn't break auth flow
            logger.warn('[AuthProvider] Failed to clear caches on auth change:', error);
          }
        });

        logger.info('[AuthProvider] Initialized', { mode: currentMode, authenticated: !!currentSession });
      } catch (error) {
        logger.error('[AuthProvider] Init failed:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    // Safety timeout: if init hangs for 10 seconds, stop loading to prevent blank screen
    timeoutId = setTimeout(() => {
      if (mounted) {
        logger.warn('[AuthProvider] Init timeout - forcing loading to complete');
        setIsLoading(false);
      }
    }, 10000);

    initAuth();

    return () => {
      mounted = false;
      unsubscribe?.();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      const result = await authService.signIn(email, password);

      // Check consent BEFORE setting user/session to prevent race condition
      // where user briefly appears logged in before re-consent modal shows
      let requiresReConsent = false;
      if (mode === 'cloud') {
        try {
          const latestConsent = await authService.getLatestConsent();

          if (!latestConsent) {
            // User has no consent record - they just confirmed email after sign-up
            // Auto-record consent (they checked the checkbox during sign-up)
            const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
            await authService.recordConsent(POLICY_VERSION, { userAgent });
            logger.info('[AuthProvider] Consent recorded on sign-in for version:', POLICY_VERSION);
          } else if (latestConsent.policyVersion !== POLICY_VERSION) {
            // User has consented to an older version - needs to re-consent
            logger.info('[AuthProvider] User needs to re-consent:', {
              oldVersion: latestConsent.policyVersion,
              currentVersion: POLICY_VERSION,
            });
            requiresReConsent = true;
          }
        } catch (consentError) {
          // Network errors are transient - don't block sign-in, consent will be checked next time
          if (consentError instanceof NetworkError) {
            logger.warn('[AuthProvider] Network error checking consent on sign-in (non-blocking):', consentError);
          } else {
            // Non-network errors (data corruption, auth issues) - log as error but still allow sign-in
            // Track in Sentry for production monitoring
            logger.error('[AuthProvider] Failed to verify consent on sign-in:', consentError);
            Sentry.captureException(consentError, {
              tags: { flow: 'sign-in-consent' },
              level: 'warning',
            });
          }
        }
      }

      // Set state atomically: user/session and re-consent flag together
      // This prevents flash of "logged in" state before modal appears
      setNeedsReConsent(requiresReConsent);
      setUser(result.user);
      setSession(result.session);

      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed' };
    }
  }, [authService, mode]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      const result = await authService.signUp(email, password);
      if (!result.confirmationRequired) {
        // Record consent BEFORE setting user/session to ensure consent is captured
        // before user gains access to the app (GDPR compliance)
        if (mode === 'cloud') {
          try {
            const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
            await authService.recordConsent(POLICY_VERSION, { userAgent });
            logger.info('[AuthProvider] Consent recorded during sign-up for version:', POLICY_VERSION);
          } catch (consentError) {
            // Network errors are transient - allow sign-up to proceed
            // Consent will be recorded on next sign-in (see signIn handler, lines ~188-193)
            // This covers both email-confirmation flow and network-failure-during-signup
            if (consentError instanceof NetworkError) {
              logger.warn('[AuthProvider] Network error recording consent during sign-up (allowing sign-up):', consentError);
            } else {
              // Non-network error - still allow sign-up since checkbox was checked client-side
              // Track in Sentry for production monitoring (e.g., RPC failures, data issues)
              logger.error('[AuthProvider] Failed to record consent during sign-up:', consentError);
              Sentry.captureException(consentError, {
                tags: { flow: 'sign-up-consent' },
                level: 'warning',
              });
            }
          }
          // Note: Subscription is NOT granted on signup. Account creation is free.
          // User can subscribe later via Play Billing (Android) or web payment (future).
          // This separates account (free) from subscription (paid sync feature).
        }

        // Set user/session after consent attempt
        setUser(result.user);
        setSession(result.session);
      }
      return { confirmationRequired: result.confirmationRequired };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign up failed' };
    }
  }, [authService, mode]);

  const signOut = useCallback(async () => {
    if (!authService) return;

    try {
      await authService.signOut();
    } catch (error) {
      // Log but don't throw - user should be signed out locally regardless
      logger.warn('[AuthProvider] Sign out error:', error);
    }

    // Clear subscription cache to prevent data leakage to next user (privacy)
    try {
      await clearSubscriptionCache();
    } catch (error) {
      // Non-critical: cache will expire naturally, log but don't block sign-out
      logger.warn('[AuthProvider] Failed to clear subscription cache:', error);
    }

    // Always clear local state, even if API call failed
    setUser(null);
    setSession(null);
    setNeedsReConsent(false);  // Clear re-consent flag so modal doesn't persist
  }, [authService]);

  const resetPassword = useCallback(async (email: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      await authService.resetPassword(email);
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Reset failed' };
    }
  }, [authService]);

  /**
   * Record user consent for Terms/Privacy Policy.
   * Records consent with current POLICY_VERSION.
   * Safe to call multiple times - will log but not fail if consent already exists.
   */
  const recordConsent = useCallback(async () => {
    if (!authService) return { error: 'Auth not initialized' };
    if (mode === 'local') return {}; // No consent needed for local mode

    try {
      // Get browser info for audit trail
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;

      await authService.recordConsent(POLICY_VERSION, { userAgent });
      logger.info('[AuthProvider] Consent recorded for version:', POLICY_VERSION);
      return {};
    } catch (error) {
      // Log but don't fail sign-up/sign-in if consent recording fails
      // The consent checkbox was checked client-side, this is just the audit trail
      logger.error('[AuthProvider] Failed to record consent:', error);
      return { error: error instanceof Error ? error.message : 'Failed to record consent' };
    }
  }, [authService, mode]);

  /**
   * Accept the new Terms/Privacy Policy (re-consent flow).
   * Called when user accepts updated policies after policy version change.
   */
  const acceptReConsent = useCallback(async () => {
    if (!authService) return { error: 'Auth not initialized' };
    if (mode === 'local') return {}; // No consent needed for local mode

    try {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
      await authService.recordConsent(POLICY_VERSION, { userAgent });
      setNeedsReConsent(false);
      logger.info('[AuthProvider] Re-consent recorded for version:', POLICY_VERSION);
      return {};
    } catch (error) {
      logger.error('[AuthProvider] Failed to record re-consent:', error);
      return { error: error instanceof Error ? error.message : 'Failed to record consent' };
    }
  }, [authService, mode]);

  /**
   * Permanently delete the user's account.
   * Only available in cloud mode. Deletes all data and the auth user.
   */
  const deleteAccount = useCallback(async () => {
    if (!authService) return { error: 'Auth not initialized' };
    if (mode === 'local') return { error: 'Account deletion not available in local mode' };

    try {
      await authService.deleteAccount();

      // Clear local state after successful deletion
      setUser(null);
      setSession(null);
      setNeedsReConsent(false);

      logger.info('[AuthProvider] Account deleted successfully');
      return {};
    } catch (error) {
      logger.error('[AuthProvider] Account deletion failed:', error);
      return { error: error instanceof Error ? error.message : 'Failed to delete account' };
    }
  }, [authService, mode]);

  // Memoize the context value to prevent unnecessary re-renders
  const value: AuthContextValue = useMemo(() => ({
    user,
    session,
    // Local mode is always "authenticated", cloud mode checks session
    isAuthenticated: mode === 'local' ? true : !!session,
    isLoading,
    mode,
    needsReConsent,
    signIn,
    signUp,
    signOut,
    resetPassword,
    recordConsent,
    acceptReConsent,
    deleteAccount,
  }), [user, session, mode, isLoading, needsReConsent, signIn, signUp, signOut, resetPassword, recordConsent, acceptReConsent, deleteAccount]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
