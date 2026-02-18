/**
 * AuthProvider - Authentication context for the app.
 *
 * Provides authentication state and actions to all components.
 *
 * @remarks
 * Issue #336: Authentication is independent of data storage mode.
 * - When cloud is available: Manages Supabase auth state (regardless of local/cloud mode)
 * - When cloud is unavailable: No-op, always "authenticated" as local user
 *
 * This means users can sign in while in local mode (auth ≠ sync).
 * Cloud sync is a separate, subscriber-only toggle.
 *
 * - Wraps the app (inside layout.tsx) to provide auth context before data fetching
 *
 * Part of Phase 4 Supabase implementation (PR #5).
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 6.3
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getAuthService, getDataStore, isDataStoreInitialized } from '@/datastore/factory';
import { getBackendMode, isCloudAvailable } from '@/config/backendConfig';
import { POLICY_VERSION } from '@/config/constants';
import { NetworkError } from '@/interfaces/DataStoreErrors';
import type { User, Session, AuthState } from '@/interfaces/AuthTypes';
import { clearSubscriptionCache } from '@/contexts/SubscriptionContext';
import * as Sentry from '@sentry/nextjs';
import type { AuthService } from '@/interfaces/AuthService';
import logger from '@/utils/logger';
import { getCachedUserIdentity } from '@/auth/cachedSession';

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
  /** True when auth initialization timed out (user may need to retry sign-in) */
  initTimedOut: boolean;
  /** True when sign-out is in progress (prevents UI interaction during logout) */
  isSigningOut: boolean;
  /** True when auth init failed but a cached session exists — user can access data offline */
  isAuthGracePeriod: boolean;
  /** Marketing consent status: 'granted', 'withdrawn', or null (never set) */
  marketingConsent: 'granted' | 'withdrawn' | null;
  /** True when existing cloud user has never been asked about marketing consent */
  showMarketingPrompt: boolean;

  // Actions
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; confirmationRequired?: boolean; existingUser?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  recordConsent: () => Promise<{ error?: string }>;
  /** Accept the new Terms/Privacy Policy and record consent */
  acceptReConsent: () => Promise<{ error?: string }>;
  /** Permanently delete the user's account (cloud mode only) */
  deleteAccount: () => Promise<{ error?: string }>;
  /** Retry auth initialization after a timeout (resets initTimedOut state) */
  retryAuthInit: () => void;
  /** Set marketing consent (true = grant, false = withdraw) */
  setMarketingConsent: (granted: boolean) => Promise<{ error?: string }>;
  /** Dismiss the marketing consent prompt without making a choice */
  dismissMarketingPrompt: () => void;
  /** Verify a sign-up OTP code to confirm email and log in */
  verifySignUpOtp: (email: string, token: string) => Promise<{ error?: string; confirmationRequired?: boolean; existingUser?: boolean }>;
  /** Resend sign-up confirmation email with a new OTP code */
  resendSignUpConfirmation: (email: string) => Promise<{ error?: string }>;
  /** Verify a password reset OTP code to establish a recovery session */
  verifyPasswordResetOtp: (email: string, token: string) => Promise<{ error?: string }>;
  /** Update password after verifying reset OTP */
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
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
 * Issue #336: Auth is independent of data storage mode:
 * - Cloud available: Manages Supabase auth (user can sign in even in local mode)
 * - Cloud unavailable: Always "authenticated" as local user (no-op)
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'local' | 'cloud'>('local');
  const [needsReConsent, setNeedsReConsent] = useState(false);
  const [initTimedOut, setInitTimedOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isAuthGracePeriod, setIsAuthGracePeriod] = useState(false);
  const [marketingConsent, setMarketingConsentState] = useState<'granted' | 'withdrawn' | null>(null);
  const [hasSeenMarketingPrompt, setHasSeenMarketingPrompt] = useState(false);
  // Trigger for re-running auth initialization (increments to force useEffect re-run)
  const [initRetryTrigger, setInitRetryTrigger] = useState(0);

  // Sync hasSeenMarketingPrompt from user-scoped localStorage when user changes.
  // The key is scoped per user ID so different accounts get independent prompt state.
  useEffect(() => {
    if (!user?.id) {
      setHasSeenMarketingPrompt(false);
      return;
    }
    try {
      // eslint-disable-next-line no-restricted-globals -- Marketing prompt dismissal flag (not app data)
      const seen = localStorage.getItem(`matchops_marketing_prompt_seen_${user.id}`) === 'true';
      setHasSeenMarketingPrompt(seen);
    } catch {
      setHasSeenMarketingPrompt(false);
    }
  }, [user?.id]);

  // Track if user has explicitly signed in during this session
  // This prevents auth state flickering from clearing the session after successful login
  // Only explicit signOut() resets this flag
  const hasSignedInThisSessionRef = useRef(false);

  // Track intentional sign-out to prevent grace period trigger 3 from re-entering
  // grace period when the user explicitly signs out while offline.
  // Set true BEFORE authService.signOut() so the onAuthStateChange handler sees it.
  const isIntentionalSignOutRef = useRef(false);

  // Track if password reset flow is in progress (OTP verified, waiting for new password).
  // When true, onAuthStateChange ignores the recovery session — prevents the app from
  // treating the recovery session as a real sign-in and navigating away from the
  // "Set New Password" form.
  const isPasswordResetFlowRef = useRef(false);
  const passwordResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up password reset timeout on unmount
  useEffect(() => {
    return () => {
      if (passwordResetTimeoutRef.current) {
        clearTimeout(passwordResetTimeoutRef.current);
      }
    };
  }, []);

  // Initialize auth service
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    async function initAuth() {
      // CRITICAL: Set mode FIRST, before any async operations that might fail.
      // If getAuthService() fails (e.g., AbortError), mode must still be set correctly
      // so the UI shows LoginScreen (cloud) instead of StartScreen (local).
      // NOTE: currentMode is captured once per initAuth() call. On retryAuthInit (online event),
      // a new initAuth() re-captures it via getBackendMode(). In Play Store context, mode is
      // always 'cloud' (enforced by getBackendMode), so this is stable across retries.
      const currentMode = getBackendMode();
      if (mounted) {
        setMode(currentMode);
      }

      try {
        const service = await getAuthService();

        if (!mounted) return;

        setAuthService(service);

        // Note: service.initialize() already called by factory

        if (!mounted) return;

        // Get initial state
        const currentUser = await service.getCurrentUser();
        const currentSession = await service.getSession();

        if (!mounted) return;

        // Grace period trigger 1: Init completed but no session + cached session exists.
        // The user's data is in IndexedDB — let them access it while connectivity is down.
        // We do NOT check navigator.onLine here — it only indicates NIC carrier, not true
        // internet reachability (captive portals, ISP outages, DNS failures all have onLine === true).
        // A successful init returning no session when a cached token exists is already a strong
        // enough signal of connectivity issues. Trigger 2 (timeout) covers hung requests.
        // Trigger 3 (mid-session) is in onAuthStateChange below — covers token expiry while offline.
        //
        // Compute grace period identity BEFORE calling setUser to avoid queuing two user state
        // updates (setUser(null) then setUser(cached)) — call setUser once with the resolved value.
        let resolvedUser = currentUser;
        if (!currentSession && currentMode === 'cloud' && isCloudAvailable()) {
          const cached = getCachedUserIdentity();
          if (cached) {
            logger.info('[AuthProvider] Grace period: offline with cached session for', cached.email);
            setIsAuthGracePeriod(true);
            // Satisfies User interface: id (string), email (string|null), isAnonymous (boolean).
            // Optional fields (displayName, avatarUrl) omitted — not needed for grace period.
            resolvedUser = { id: cached.userId, email: cached.email, isAnonymous: false };
            // initTimedOut remains false — init completed, just no session
          }
        }

        setUser(resolvedUser);
        setSession(currentSession);

        // Exit grace period if init succeeded with a real session.
        // Always call setIsAuthGracePeriod(false) when we have a session — safe even if not in grace period.
        if (currentSession) {
          setIsAuthGracePeriod(false);
        }

        // Fetch marketing consent status if authenticated (non-blocking)
        if (currentSession && isCloudAvailable()) {
          try {
            const mcStatus = await service.getMarketingConsentStatus();
            if (mounted) setMarketingConsentState(mcStatus);
          } catch (mcError) {
            logger.warn('[AuthProvider] Failed to fetch marketing consent status on init:', mcError);
          }
        }

        // Subscribe to auth changes (cloud mode fires events, local mode is no-op)
        unsubscribe = service.onAuthStateChange(async (state: AuthState, newSession: Session | null) => {
          logger.debug('[AuthProvider] Auth state changed:', state, { hasSession: !!newSession });

          // During password reset flow, verifyOtp({type:'recovery'}) creates a recovery
          // session that fires auth events. We must NOT treat this as a real sign-in,
          // otherwise the app navigates away before the user sets their new password.
          if (isPasswordResetFlowRef.current) {
            logger.debug('[AuthProvider] Ignoring auth state change during password reset flow:', state);
            return;
          }

          // DEFENSIVE: Only clear session on explicit signed_out event
          // This prevents login loops caused by:
          // 1. Unexpected events with null session (e.g., AbortError during token refresh)
          // 2. New Supabase events we don't recognize
          // 3. Race conditions during sign-in flow
          //
          // Additional protection: If user has successfully signed in this session,
          // NEVER clear the session unless explicit signOut() is called.
          // This prevents flickering even if Supabase fires a signed_out event unexpectedly.
          if (!newSession && state !== 'signed_out') {
            logger.warn('[AuthProvider] Received null session for non-signout event:', state, '- preserving current session');
            // Track in Sentry for debugging (PWA can't access console)
            try {
              Sentry.addBreadcrumb({
                category: 'auth',
                message: `Preserved session on ${state} event with null session`,
                level: 'warning',
              });
            } catch {
              // Sentry failure acceptable
            }
            // Don't clear the session - let the current auth state persist
            // If there's a real auth issue, the next API call will fail and we'll handle it then
            return;
          }

          // EXTRA PROTECTION: If user signed in this session but we get signed_out event,
          // this might be a false positive. Only clear if signed_out event has no session.
          // Legitimate sign-out will come from our signOut() function which sets the ref to false.
          if (state === 'signed_out' && hasSignedInThisSessionRef.current) {
            logger.warn('[AuthProvider] Ignoring signed_out event - user signed in this session and has not called signOut()');
            try {
              Sentry.addBreadcrumb({
                category: 'auth',
                message: 'Ignored spurious signed_out event (user still signed in)',
                level: 'warning',
              });
            } catch {
              // Sentry failure acceptable
            }
            return;
          }

          if (!mounted) return;

          // Grace period trigger 3: Mid-session token expiry while offline.
          // If we're about to clear the session (signed_out with null session) but the
          // device is offline and we have a valid cached token, enter grace period instead
          // of logging the user out. Their data is in IndexedDB — let them keep working.
          // Skip this for intentional sign-out (user clicked "Sign Out") — they want to leave.
          // NOTE: Unlike trigger 1 (cold-start), trigger 3 checks navigator.onLine because
          // mid-session signed_out events also fire for legitimate server-side revocations.
          // Captive portal scenario (onLine === true, Supabase unreachable): not covered here —
          // the user is logged out but trigger 1 catches it on next app launch.
          if (!newSession && state === 'signed_out' && !isIntentionalSignOutRef.current
            && currentMode === 'cloud' && isCloudAvailable()) {
            const cached = getCachedUserIdentity();
            if (cached && typeof navigator !== 'undefined' && !navigator.onLine) {
              logger.info('[AuthProvider] Grace period: mid-session offline signout with cached session for', cached.email);
              setIsAuthGracePeriod(true);
              setUser({ id: cached.userId, email: cached.email, isAnonymous: false });
              // Don't clear the session — preserve grace period state
              return;
            }
          }

          setSession(newSession);
          setUser(newSession?.user ?? null);

          // Re-verify consent on token refresh to catch policy version updates
          // Without this, users with auto-refreshing tokens could avoid re-consent indefinitely
          // Issue #336: Check consent when cloud is available, regardless of data storage mode
          if (state === 'token_refreshed' && newSession && isCloudAvailable()) {
            try {
              const latestConsent = await service.getLatestConsent();
              if (latestConsent && latestConsent.policyVersion !== POLICY_VERSION) {
                logger.info('[AuthProvider] Policy version changed during session, requiring re-consent');
                setNeedsReConsent(true);
              }
            } catch (consentError) {
              // Non-critical: don't break token refresh, consent will be checked on next sign-in
              logger.warn('[AuthProvider] Failed to check consent on token refresh:', consentError);
              // Track non-network errors in Sentry - could indicate RPC or database issues
              // Wrap in try/catch - Sentry failure must not break auth flow
              if (!(consentError instanceof NetworkError)) {
                try {
                  Sentry.captureException(consentError, {
                    tags: { flow: 'token-refresh-consent-check' },
                    level: 'warning',
                  });
                } catch {
                  // Sentry failure is acceptable
                }
              }
            }
          }

          // Clear DataStore caches when user changes (prevents User B seeing User A's cached data)
          // Note: On initial load (INITIAL_SESSION), DataStore may not be initialized yet.
          // This is fine - fresh sessions have no stale cache. Cache clearing only matters
          // for subsequent auth changes (sign out → sign in as different user).
          try {
            const userId = newSession?.user?.id;
            if (isDataStoreInitialized() && userId) {
              const dataStore = await getDataStore(userId);
              dataStore.clearUserCaches?.();
            }
          } catch (error) {
            // Non-critical: cache clearing failure shouldn't break auth flow
            logger.warn('[AuthProvider] Failed to clear caches on auth change:', error);
            // Track in Sentry - frequent failures indicate a real problem
            // Wrap in try/catch - Sentry failure must not break auth flow
            try {
              Sentry.captureException(error, {
                tags: { flow: 'auth-cache-clear' },
                level: 'warning',
              });
            } catch {
              // Sentry failure is acceptable
            }
          }
        });

        logger.info('[AuthProvider] Initialized', { mode: currentMode, authenticated: !!currentSession });
      } catch (error) {
        logger.error('[AuthProvider] Init failed:', error);
        // Track in Sentry - auth init failures could leave app in broken state
        // Wrap in try/catch - Sentry failure must not break error handling
        try {
          Sentry.captureException(error, {
            tags: { flow: 'auth-init' },
            level: 'error',
            extra: {
              cloudAvailable: isCloudAvailable(),
              mode: getBackendMode(),
            },
          });
        } catch {
          // Sentry failure is acceptable
        }
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
    // This prevents users from seeing a blank screen indefinitely
    timeoutId = setTimeout(() => {
      if (mounted) {
        // Log detailed context for debugging init hangs
        const context = {
          cloudAvailable: isCloudAvailable(),
          mode: getBackendMode(),
          online: typeof navigator !== 'undefined' ? navigator.onLine : 'unknown',
        };
        logger.error('[AuthProvider] Init timeout after 10s - auth may be in incomplete state', context);

        // Grace period trigger 2: Init timed out + cached session exists in cloud mode.
        // Unlike trigger 1, we do NOT check navigator.onLine here. The timeout itself is evidence
        // of network issues (covers flaky connections where navigator.onLine === true but
        // Supabase is unreachable). Trigger 1 checks onLine because init succeeded — only
        // confirmed offline state justifies fallback.
        if (getBackendMode() === 'cloud' && isCloudAvailable()) {
          const cached = getCachedUserIdentity();
          if (cached) {
            logger.info('[AuthProvider] Grace period: init timeout with cached session for', cached.email);
            setIsAuthGracePeriod(true);
            // Satisfies User interface: id (string), email (string|null), isAnonymous (boolean).
            // Optional fields (displayName, avatarUrl) omitted — not needed for grace period.
            setUser({ id: cached.userId, email: cached.email, isAnonymous: false });
            setIsLoading(false);
            // Do NOT set initTimedOut — grace period supersedes the timeout screen
            return; // Skip the normal timeout handling below
          }
        }

        // CRITICAL: Update state FIRST to ensure UI recovery
        // If Sentry call fails, user must not be stuck in loading state
        setIsLoading(false);
        // Set flag so UI can inform user and offer retry option
        setInitTimedOut(true);

        // Track in Sentry AFTER state updates (so failure doesn't block UI recovery)
        // Use 'error' level because timeout leaves app in incomplete/broken state
        try {
          Sentry.captureMessage('AuthProvider init timeout', {
            level: 'error',
            tags: { flow: 'auth-init-timeout' },
            extra: context,
          });
        } catch (sentryErr) {
          // Sentry failure must not impact user experience
          logger.warn('[AuthProvider] Failed to report timeout to Sentry', sentryErr);
        }
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
  }, [initRetryTrigger]); // Re-run when retry is triggered

  // Online re-validation: when device comes back online during grace period,
  // clear the grace period and retry auth initialization to get a real session.
  useEffect(() => {
    if (!isAuthGracePeriod) return;

    const handleOnline = () => {
      logger.info('[AuthProvider] Grace period: device came online, retrying auth init');
      setIsAuthGracePeriod(false);
      setIsLoading(true);
      setInitTimedOut(false);
      setInitRetryTrigger(prev => prev + 1);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isAuthGracePeriod]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      const result = await authService.signIn(email, password);

      // Check consent BEFORE setting user/session to prevent race condition
      // where user briefly appears logged in before re-consent modal shows
      // Issue #336: Check consent when cloud is available, regardless of data storage mode
      let requiresReConsent = false;
      if (isCloudAvailable()) {
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
            // Wrap in try/catch - Sentry failure must not break sign-in
            try {
              Sentry.captureException(consentError, {
                tags: { flow: 'sign-in-consent' },
                level: 'warning',
              });
            } catch {
              // Sentry failure is acceptable
            }
          }
        }
      }

      // Set state in correct order: needsReConsent BEFORE user/session
      // React 18+ batches these updates, so they appear atomic to renders.
      // Order matters: if needsReConsent is true, it must be set before user
      // to prevent brief "logged in but no consent modal" state.
      setNeedsReConsent(requiresReConsent);
      setUser(result.user);
      setSession(result.session);

      // Mark that user has signed in this session - prevents spurious sign-out events
      // from clearing the session (login loop protection)
      hasSignedInThisSessionRef.current = true;
      isPasswordResetFlowRef.current = false; // Clear in case user abandoned reset flow
      logger.info('[AuthProvider] Sign-in successful, session locked');

      // Fetch marketing consent status (non-blocking, don't fail sign-in)
      if (isCloudAvailable()) {
        try {
          const status = await authService.getMarketingConsentStatus();
          setMarketingConsentState(status);
        } catch (mcError) {
          logger.warn('[AuthProvider] Failed to fetch marketing consent status on sign-in:', mcError);
        }
      }

      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed' };
    }
  }, [authService]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      const result = await authService.signUp(email, password);
      if (!result.confirmationRequired) {
        // Record consent BEFORE setting user/session to ensure consent is captured
        // before user gains access to the app (GDPR compliance)
        // Issue #336: Record consent when cloud is available, regardless of data storage mode
        if (isCloudAvailable()) {
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
              // Wrap in try/catch - Sentry failure must not break sign-up
              try {
                Sentry.captureException(consentError, {
                  tags: { flow: 'sign-up-consent' },
                  level: 'warning',
                });
              } catch {
                // Sentry failure is acceptable
              }
            }
          }
          // Note: Subscription is NOT granted on signup. Account creation is free.
          // User can subscribe later via Play Billing (Android) or web payment (future).
          // This separates account (free) from subscription (paid sync feature).
        }

        // Set user/session after consent attempt
        setUser(result.user);
        setSession(result.session);

        // Mark that user has signed in this session - prevents spurious sign-out events
        hasSignedInThisSessionRef.current = true;
        logger.info('[AuthProvider] Sign-up successful (no confirmation needed), session locked');
      }
      return { confirmationRequired: result.confirmationRequired, existingUser: result.existingUser };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign up failed' };
    }
  }, [authService]);

  const signOut = useCallback(async () => {
    if (!authService) {
      // This shouldn't happen in normal flow - log for debugging
      logger.warn('[AuthProvider] signOut called but authService is null');
      return;
    }

    // Show loading state during sign-out to prevent UI interaction
    setIsSigningOut(true);
    // Clear grace period immediately so the amber banner disappears during sign-out
    setIsAuthGracePeriod(false);

    // Mark intentional sign-out BEFORE calling authService.signOut() so the
    // onAuthStateChange handler (trigger 3) won't re-enter grace period.
    isIntentionalSignOutRef.current = true;

    try {
      await authService.signOut();
    } catch (error) {
      // Log but don't throw - user should be signed out locally regardless
      logger.warn('[AuthProvider] Sign out error:', error);
      // Track in Sentry - sign-out failures could leave orphaned sessions (security concern)
      // Wrap in try/catch - Sentry failure must not break sign-out
      try {
        Sentry.captureException(error, {
          tags: { flow: 'sign-out' },
          level: 'warning',
        });
      } catch {
        // Sentry failure is acceptable
      }
    }

    // Clear subscription cache to prevent data leakage to next user (privacy)
    // Note: user is still available here (setUser(null) hasn't been called yet)
    if (user) {
      try {
        await clearSubscriptionCache(user.id);
      } catch (error) {
        // Non-critical: cache will expire naturally, log but don't block sign-out
        logger.warn('[AuthProvider] Failed to clear subscription cache:', error);
        // Track in Sentry - frequent failures could indicate IndexedDB issues
        // Wrap in try/catch - Sentry failure must not break sign-out
        try {
          Sentry.captureException(error, {
            tags: { flow: 'sign-out-cache-clear' },
            level: 'warning',
          });
        } catch {
          // Sentry failure is acceptable
        }
      }
    }

    // Reset session locks BEFORE clearing state - allows onAuthStateChange to process signed_out
    hasSignedInThisSessionRef.current = false;
    isPasswordResetFlowRef.current = false;
    isIntentionalSignOutRef.current = false; // Reset for next session
    logger.info('[AuthProvider] Sign-out initiated, session lock released');

    // Always clear local state, even if API call failed
    setUser(null);
    setSession(null);
    setNeedsReConsent(false);  // Clear re-consent flag so modal doesn't persist
    setMarketingConsentState(null);  // Clear marketing consent state
    setIsSigningOut(false);  // Clear signing out state
    setIsAuthGracePeriod(false);  // Clear grace period on sign-out
  }, [authService, user]);

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
    // Issue #336: Consent is based on cloud availability, not data storage mode
    if (!isCloudAvailable()) return {}; // No consent needed without cloud

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
      // Track in Sentry - consent recording failures need production visibility
      // Wrap in try/catch - Sentry failure must not break consent recording
      try {
        Sentry.captureException(error, {
          tags: { flow: 'record-consent' },
          level: 'warning',
        });
      } catch {
        // Sentry failure is acceptable
      }
      return { error: error instanceof Error ? error.message : 'Failed to record consent' };
    }
  }, [authService]);

  /**
   * Accept the new Terms/Privacy Policy (re-consent flow).
   * Called when user accepts updated policies after policy version change.
   */
  const acceptReConsent = useCallback(async () => {
    if (!authService) return { error: 'Auth not initialized' };
    // Issue #336: Consent is based on cloud availability, not data storage mode
    if (!isCloudAvailable()) return {}; // No consent needed without cloud

    try {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
      await authService.recordConsent(POLICY_VERSION, { userAgent });
      setNeedsReConsent(false);
      logger.info('[AuthProvider] Re-consent recorded for version:', POLICY_VERSION);
      return {};
    } catch (error) {
      logger.error('[AuthProvider] Failed to record re-consent:', error);
      // Track in Sentry - re-consent failures need production visibility
      // Wrap in try/catch - Sentry failure must not break re-consent
      try {
        Sentry.captureException(error, {
          tags: { flow: 'accept-re-consent' },
          level: 'warning',
        });
      } catch {
        // Sentry failure is acceptable
      }
      return { error: error instanceof Error ? error.message : 'Failed to record consent' };
    }
  }, [authService]);

  /**
   * Permanently delete the user's account.
   * Available when cloud is configured. Deletes all data and the auth user.
   * Issue #336: Works regardless of data storage mode (user can delete account while in local mode).
   */
  const deleteAccount = useCallback(async () => {
    if (!authService) return { error: 'Auth not initialized' };
    // Issue #336: Account deletion is based on cloud availability, not data storage mode
    // Users can delete their account while in local mode if they have one
    if (!isCloudAvailable()) return { error: 'Account deletion requires cloud configuration' };

    try {
      // Capture user ID before deletion clears it
      const deletedUserId = user?.id;

      await authService.deleteAccount();

      // Reset session locks BEFORE clearing state
      hasSignedInThisSessionRef.current = false;
      isPasswordResetFlowRef.current = false;

      // Clear subscription cache to prevent data leakage (same as signOut)
      if (deletedUserId) {
        try {
          await clearSubscriptionCache(deletedUserId);
        } catch (error) {
          logger.warn('[AuthProvider] Failed to clear subscription cache on deletion:', error);
        }
      }

      // Clear local state after successful deletion
      setUser(null);
      setSession(null);
      setNeedsReConsent(false);
      setMarketingConsentState(null);

      // Clean up user-scoped localStorage flags
      if (deletedUserId) {
        try {
          // eslint-disable-next-line no-restricted-globals -- Cleanup on account deletion
          localStorage.removeItem(`matchops_marketing_prompt_seen_${deletedUserId}`);
        } catch {
          // non-critical
        }
      }

      logger.info('[AuthProvider] Account deleted successfully');
      return {};
    } catch (error) {
      logger.error('[AuthProvider] Account deletion failed:', error);
      return { error: error instanceof Error ? error.message : 'Failed to delete account' };
    }
  }, [authService, user?.id]);

  /**
   * Retry auth initialization after a timeout.
   * Resets state and triggers a fresh initialization attempt.
   */
  const retryAuthInit = useCallback(() => {
    logger.info('[AuthProvider] Retrying auth initialization');
    setIsLoading(true);
    setInitTimedOut(false);
    setInitRetryTrigger(prev => prev + 1);
  }, []);

  /**
   * Set marketing consent (grant or withdraw).
   * Updates both the server and local state.
   */
  const setMarketingConsent = useCallback(async (granted: boolean) => {
    if (!authService) return { error: 'Auth not initialized' };
    if (!isCloudAvailable()) return { error: 'Marketing consent requires cloud mode' };

    try {
      await authService.setMarketingConsent(granted);
      setMarketingConsentState(granted ? 'granted' : 'withdrawn');
      logger.info('[AuthProvider] Marketing consent updated:', granted ? 'granted' : 'withdrawn');
      return {};
    } catch (error) {
      logger.error('[AuthProvider] Failed to set marketing consent:', error);
      return { error: error instanceof Error ? error.message : 'Failed to update marketing consent' };
    }
  }, [authService]);

  /**
   * Dismiss the marketing consent prompt without making a choice.
   * Sets a user-scoped localStorage flag so the prompt is not shown again for this user.
   */
  const dismissMarketingPrompt = useCallback(() => {
    setHasSeenMarketingPrompt(true);
    if (user?.id) {
      try {
        // eslint-disable-next-line no-restricted-globals -- Marketing prompt dismissal flag (not app data)
        localStorage.setItem(`matchops_marketing_prompt_seen_${user.id}`, 'true');
      } catch {
        // localStorage failure is non-critical
      }
    }
    logger.info('[AuthProvider] Marketing consent prompt dismissed');
  }, [user?.id]);

  /**
   * Verify sign-up OTP code and establish session.
   * Called from AuthForm after user enters the 6-digit code from their email.
   */
  const verifySignUpOtp = useCallback(async (email: string, token: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      const result = await authService.verifySignUpOtp(email, token);

      // Record consent (user already checked the checkbox during sign-up)
      if (isCloudAvailable()) {
        try {
          const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
          await authService.recordConsent(POLICY_VERSION, { userAgent });
          logger.info('[AuthProvider] Consent recorded after OTP verification for version:', POLICY_VERSION);
        } catch (consentError) {
          if (consentError instanceof NetworkError) {
            logger.warn('[AuthProvider] Network error recording consent after OTP verification (non-blocking):', consentError);
          } else {
            logger.error('[AuthProvider] Failed to record consent after OTP verification:', consentError);
            try {
              Sentry.captureException(consentError, {
                tags: { flow: 'otp-verification-consent' },
                level: 'warning',
              });
            } catch {
              // Sentry failure is acceptable
            }
          }
        }
      }

      setUser(result.user);
      setSession(result.session);
      hasSignedInThisSessionRef.current = true;
      logger.info('[AuthProvider] OTP verification successful, session locked');

      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Verification failed' };
    }
  }, [authService]);

  /**
   * Resend sign-up confirmation email with a new OTP code.
   */
  const resendSignUpConfirmation = useCallback(async (email: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      await authService.resendSignUpConfirmation(email);
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to resend' };
    }
  }, [authService]);

  /**
   * Verify a password reset OTP code to establish a recovery session.
   * Called from AuthForm after user enters the 8-digit code from the reset email.
   *
   * Sets isPasswordResetFlowRef to block onAuthStateChange from treating
   * the recovery session as a real sign-in (which would navigate away from
   * the "Set New Password" form).
   */
  const verifyPasswordResetOtp = useCallback(async (email: string, token: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    // Set BEFORE the call — verifyOtp fires onAuthStateChange synchronously
    isPasswordResetFlowRef.current = true;

    try {
      await authService.verifyPasswordResetOtp(email, token);
      return {};
    } catch (error) {
      // Clear on failure — no recovery session was created
      isPasswordResetFlowRef.current = false;
      return { error: error instanceof Error ? error.message : 'Verification failed' };
    }
  }, [authService]);

  /**
   * Update the user's password after verifying the reset OTP.
   * The recovery session from verifyPasswordResetOtp() must be active.
   * After success, signs out the recovery session — user must sign in with new password.
   */
  const updatePassword = useCallback(async (newPassword: string) => {
    if (!authService) return { error: 'Auth not initialized' };

    try {
      await authService.updatePassword(newPassword);

      // Clear the password reset flow flag BEFORE sign-out so the sign-out
      // event is processed normally by onAuthStateChange
      isPasswordResetFlowRef.current = false;

      // Sign out the recovery session — user must sign in with their new password.
      // Uses authService.signOut() directly (not AuthProvider's signOut) because this
      // is ending a recovery session, not a full user sign-out flow.
      try {
        await authService.signOut();
      } catch {
        // Non-critical: recovery session will expire naturally
      }
      // Explicit state clear required — onAuthStateChange may ignore the signed_out
      // event if hasSignedInThisSessionRef is true from a previous sign-in.
      setUser(null);
      setSession(null);

      return {};
    } catch (error) {
      // Keep flag set on failure — user can retry setting password.
      // Safety timeout: auto-clear the flag after 10 minutes to prevent
      // permanently blocking auth events if the user abandons the reset flow.
      // Clear previous timeout to prevent accumulation on repeated failures.
      if (passwordResetTimeoutRef.current) {
        clearTimeout(passwordResetTimeoutRef.current);
      }
      passwordResetTimeoutRef.current = setTimeout(() => {
        if (isPasswordResetFlowRef.current) {
          isPasswordResetFlowRef.current = false;
          logger.warn('[AuthProvider] Password reset flow flag auto-cleared after timeout');
        }
        passwordResetTimeoutRef.current = null;
      }, 10 * 60 * 1000);
      return { error: error instanceof Error ? error.message : 'Password update failed' };
    }
  }, [authService]);

  // Memoize the context value to prevent unnecessary re-renders
  // Compute whether to show the marketing prompt:
  // - Cloud must be available
  // - User must be authenticated
  // - Marketing consent must be null (never asked)
  // - User must not have dismissed the prompt already
  // - Not during loading or sign-out
  const showMarketingPrompt = isCloudAvailable() && !!session && marketingConsent === null && !hasSeenMarketingPrompt && !isLoading && !isSigningOut;

  const value: AuthContextValue = useMemo(() => ({
    user,
    session,
    // Issue #336: isAuthenticated reflects actual auth state when cloud is available,
    // regardless of data storage mode. Only fallback to "always authenticated" when
    // cloud is not configured (no Supabase URL/key). This allows users to sign in
    // while in local mode.
    // Note: isAuthGracePeriod is only set when isCloudAvailable() — safe to OR here.
    isAuthenticated: !isCloudAvailable() ? true : (!!session || isAuthGracePeriod),
    isLoading,
    mode,
    needsReConsent,
    initTimedOut,
    isSigningOut,
    isAuthGracePeriod,
    marketingConsent,
    showMarketingPrompt,
    signIn,
    signUp,
    signOut,
    resetPassword,
    recordConsent,
    acceptReConsent,
    deleteAccount,
    retryAuthInit,
    setMarketingConsent,
    dismissMarketingPrompt,
    verifySignUpOtp,
    resendSignUpConfirmation,
    verifyPasswordResetOtp,
    updatePassword,
  }), [user, session, mode, isLoading, needsReConsent, initTimedOut, isSigningOut, isAuthGracePeriod, marketingConsent, showMarketingPrompt, signIn, signUp, signOut, resetPassword, recordConsent, acceptReConsent, deleteAccount, retryAuthInit, setMarketingConsent, dismissMarketingPrompt, verifySignUpOtp, resendSignUpConfirmation, verifyPasswordResetOtp, updatePassword]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
