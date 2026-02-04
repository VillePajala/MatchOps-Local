/**
 * SupabaseAuthService
 *
 * Authentication service for cloud mode using Supabase Auth.
 * Implements the AuthService interface with full email/password authentication.
 *
 * Part of Phase 4 Supabase implementation (PR #5).
 *
 * @see AuthService interface in src/interfaces/AuthService.ts
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 6
 */

import type { AuthService } from '@/interfaces/AuthService';
import type {
  User,
  Session,
  AuthResult,
  AuthState,
  AuthStateCallback,
} from '@/interfaces/AuthTypes';
import { AuthError, NetworkError, NotInitializedError } from '@/interfaces/DataStoreErrors';
import { getSupabaseClient } from '@/datastore/supabase/client';
import { withRetry, throwIfTransient, TransientSupabaseError } from '@/datastore/supabase/retry';
import type { SupabaseClient, AuthChangeEvent, Session as SupabaseSession } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';

/**
 * Password complexity requirements.
 * Enforced client-side for immediate user feedback.
 *
 * SERVER-SIDE ENFORCEMENT:
 * Supabase Auth enforces password rules server-side via project settings.
 * Direct API calls that bypass the UI will still be validated by Supabase.
 * Client validation is UX optimization, not security - server is the authority.
 *
 * DEPLOYMENT CHECKLIST (Supabase Dashboard > Authentication > Policies):
 * - [ ] Minimum password length: 12
 * - [ ] Required character types: 3 of 4 (upper, lower, digit, special)
 *
 * If server and client rules diverge, users may see confusing error messages
 * (client passes, server rejects). Keep them in sync.
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 6
 */
const PASSWORD_MIN_LENGTH = 12;

/**
 * Map Supabase auth events to our AuthState type.
 *
 * IMPORTANT: Handle ALL Supabase events explicitly to prevent unexpected sign-outs.
 * Unknown events should NOT default to signed_out - this causes login loops when
 * Supabase adds new events or fires events we don't expect.
 *
 * Supabase AuthChangeEvent types (as of v2):
 * - INITIAL_SESSION: First session load (from localStorage)
 * - SIGNED_IN: User signed in
 * - SIGNED_OUT: User signed out
 * - PASSWORD_RECOVERY: User clicked password reset link
 * - TOKEN_REFRESHED: Access token was refreshed
 * - USER_UPDATED: User profile was updated
 * - MFA_CHALLENGE_VERIFIED: MFA challenge completed
 */
function mapAuthEvent(event: AuthChangeEvent): AuthState {
  switch (event) {
    case 'SIGNED_IN':
    case 'INITIAL_SESSION':
      return 'signed_in';
    case 'SIGNED_OUT':
      return 'signed_out';
    case 'TOKEN_REFRESHED':
      return 'token_refreshed';
    case 'USER_UPDATED':
      return 'user_updated';
    // Handle additional Supabase events that shouldn't trigger sign-out
    case 'PASSWORD_RECOVERY':
      // Password recovery link clicked - user is going through reset flow
      // Don't sign them out, let the reset flow complete
      logger.info('[SupabaseAuthService] Password recovery event received');
      return 'signed_in'; // Treat as signed in to prevent logout during reset
    case 'MFA_CHALLENGE_VERIFIED':
      // MFA challenge completed successfully - user is authenticated
      logger.info('[SupabaseAuthService] MFA challenge verified');
      return 'signed_in';
    default:
      // Log unknown events but DON'T default to signed_out
      // Defaulting to signed_out causes login loops when Supabase adds new events
      // Instead, preserve current auth state (don't change anything)
      logger.warn(`[SupabaseAuthService] Unknown auth event "${event}" - preserving current auth state`);
      // Track in Sentry for debugging (PWA can't access console)
      try {
        Sentry.addBreadcrumb({
          category: 'auth',
          message: `Unknown Supabase auth event: ${event}`,
          level: 'warning',
        });
      } catch {
        // Sentry failure acceptable
      }
      // Return 'user_updated' as a neutral state that won't trigger sign-out
      // The session from the event will determine actual auth state
      return 'user_updated';
  }
}

/**
 * Transform Supabase user to our User type.
 */
function transformUser(supabaseUser: { id: string; email?: string | null; created_at?: string; updated_at?: string }): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? null,
    isAnonymous: false,
    createdAt: supabaseUser.created_at,
    updatedAt: supabaseUser.updated_at,
  };
}

/**
 * Transform Supabase session to our Session type.
 */
function transformSession(supabaseSession: SupabaseSession): Session {
  // expires_at should always be present in valid Supabase sessions, but we provide
  // a fallback for edge cases (e.g., malformed responses, testing). The 1-hour default
  // matches Supabase's typical JWT expiry. Auto-refresh will correct this quickly.
  let expiresAtSeconds = supabaseSession.expires_at;
  if (!expiresAtSeconds) {
    expiresAtSeconds = Math.floor(Date.now() / 1000) + 3600;
    logger.warn('[SupabaseAuthService] Session missing expires_at, using 1-hour fallback');
    // Track this edge case to detect potential Supabase SDK issues
    try {
      Sentry.captureMessage('Supabase session missing expires_at', 'warning');
    } catch {
      // Sentry failure must not break session transformation
    }
  }

  return {
    accessToken: supabaseSession.access_token,
    refreshToken: supabaseSession.refresh_token,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    tokenType: 'bearer',
    user: transformUser(supabaseSession.user),
  };
}

/**
 * Validate password complexity.
 * @throws AuthError if password doesn't meet requirements
 */
function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AuthError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  // Check for at least 3 of 4 character types
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  const typeCount = [hasUppercase, hasLowercase, hasDigit, hasSpecial].filter(Boolean).length;

  if (typeCount < 3) {
    throw new AuthError(
      'Password must contain at least 3 of: uppercase, lowercase, number, special character'
    );
  }
}

/**
 * Validate email format.
 * @throws AuthError if email is invalid
 */
function validateEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AuthError('Invalid email format');
  }
}

/**
 * Check if error is a network error.
 * Handles both Error instances and Supabase error objects.
 *
 * Detection strategy (in order):
 * 1. Check for Supabase AuthApiError status codes (0 or 5xx typically indicate network issues)
 * 2. Check for standard fetch/network error names
 * 3. Fall back to message content matching (least reliable)
 */
function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  // Check for Supabase AuthApiError with status code
  // Status 0 or 5xx typically indicate network/server issues
  if ('status' in error) {
    const status = (error as { status: number }).status;
    if (status === 0 || (status >= 500 && status < 600)) {
      return true;
    }
  }

  // Check for standard error names
  if ('name' in error) {
    const name = (error as { name: string }).name;
    if (name === 'TypeError' || name === 'NetworkError' || name === 'AbortError') {
      return true;
    }
  }

  // Fall back to message content matching
  let message: string | undefined;
  if (error instanceof Error) {
    message = error.message;
  } else if ('message' in error) {
    message = (error as { message: string }).message;
  }

  if (!message) return false;

  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('offline') ||
    lowerMessage.includes('connection') ||
    lowerMessage.includes('failed to fetch')
  );
}

/**
 * Rate limiting configuration for sign-in attempts.
 * Prevents brute force attacks by enforcing exponential backoff.
 */
const RATE_LIMIT = {
  /** Maximum attempts before requiring a wait period */
  MAX_ATTEMPTS: 5,
  /** Base delay in milliseconds (doubles with each attempt) */
  BASE_DELAY_MS: 1000,
  /** Maximum delay cap in milliseconds (60 seconds) */
  MAX_DELAY_MS: 60000,
  /** Reset failed attempts after this many ms of no failures (5 minutes) */
  RESET_AFTER_MS: 5 * 60 * 1000,
};

/**
 * Supabase authentication service.
 *
 * Provides full authentication for cloud mode.
 * Manages sign up, sign in, sign out, password reset, and session management.
 */
export class SupabaseAuthService implements AuthService {
  private client: SupabaseClient<Database> | null = null;
  private initialized = false;
  private currentSession: Session | null = null;
  private currentUser: User | null = null;
  // Promise deduplication for initialize() to prevent race conditions
  private initPromise: Promise<void> | null = null;

  // Rate limiting state for sign-in attempts
  private failedSignInAttempts = 0;
  private lastFailedSignInTime = 0;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async initialize(): Promise<void> {
    // Promise deduplication FIRST: if initialization is already in progress, wait for it
    // This check must come before the initialized check to prevent race conditions
    // where two calls both pass the initialized check before either sets initPromise
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return immediately if already initialized
    if (this.initialized) {
      return;
    }

    // Create and cache the initialization promise
    this.initPromise = (async () => {
      try {
        this.client = getSupabaseClient();

        // Get initial session from localStorage
        // IMPORTANT: getSession() can throw AbortError due to Supabase's internal lock mechanism
        // (especially on app restart, PWA resume, or rapid sign-in/sign-out cycles).
        // We catch this specifically to allow initialization to succeed without a session,
        // enabling fresh sign-in to work.
        let session = null;
        let error = null;
        try {
          const result = await this.client.auth.getSession();
          session = result.data?.session;
          error = result.error;
        } catch (getSessionError) {
          // Check if this is an AbortError (from Supabase locks)
          const isAbort = getSessionError instanceof Error &&
            (getSessionError.name === 'AbortError' || getSessionError.message?.includes('aborted'));
          if (isAbort) {
            logger.warn('[SupabaseAuthService] AbortError during getSession - attempting localStorage fallback');

            // FALLBACK: Try to read session directly from localStorage
            // Supabase stores sessions with key: sb-<project-ref>-auth-token
            // This bypasses the failing lock mechanism while still recovering the session
            try {
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
              // eslint-disable-next-line no-restricted-globals -- Supabase stores auth tokens in localStorage, not IndexedDB
              if (supabaseUrl && typeof localStorage !== 'undefined') {
                // Extract project ref from URL (e.g., "abc123" from "https://abc123.supabase.co")
                const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
                const storageKey = `sb-${projectRef}-auth-token`;
                // eslint-disable-next-line no-restricted-globals -- Reading Supabase's auth token storage
                const storedData = localStorage.getItem(storageKey);

                if (storedData) {
                  const parsed = JSON.parse(storedData);
                  // Supabase stores session in different formats depending on version
                  // Check for both direct session and nested currentSession
                  const recoveredSession = parsed.currentSession || parsed;

                  if (recoveredSession?.access_token && recoveredSession?.user) {
                    session = recoveredSession;
                    logger.info('[SupabaseAuthService] Successfully recovered session from localStorage fallback');
                  }
                }
              }
            } catch (fallbackError) {
              // Fallback failed - log but continue without session
              logger.warn('[SupabaseAuthService] localStorage fallback failed:', fallbackError);
            }

            // If we still don't have a session, track the original error
            if (!session) {
              try {
                Sentry.captureException(getSessionError, {
                  tags: { flow: 'auth-init-getSession-abort' },
                  level: 'warning',
                  extra: { recoverable: true, fallbackAttempted: true },
                });
              } catch {
                // Sentry failure acceptable
              }
            }
          } else {
            // Re-throw non-AbortErrors
            throw getSessionError;
          }
        }

        if (error) {
          // Distinguish between network errors and other session errors
          if (isNetworkError(error)) {
            logger.warn('[SupabaseAuthService] Network error during init - session may not be loaded:', error.message);
          } else {
            // Non-network error suggests corrupted state, expired token, or SDK issue
            logger.error('[SupabaseAuthService] Failed to get initial session (non-network):', error.message);
          }
          // Don't throw - app should still work, user will need to sign in again
        }

        if (session) {
          // CRITICAL: Validate the session by making an API call to getUser()
          // getSession() only reads from localStorage and doesn't validate with the server.
          // This prevents using stale/revoked sessions that were stored before sign-out failed
          // or from a previous user who deleted their account.
          //
          // TIMEOUT: Use 5s timeout to prevent blocking auth init on slow mobile networks.
          // If validation times out, trust the cached session (better UX than blocking).
          const VALIDATION_TIMEOUT_MS = 5000;
          try {
            const validationPromise = this.client.auth.getUser();
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Session validation timeout')), VALIDATION_TIMEOUT_MS);
            });

            const { data: { user: validatedUser }, error: userError } = await Promise.race([
              validationPromise,
              timeoutPromise,
            ]);

            if (userError || !validatedUser) {
              // Session is invalid on server - clear it locally
              logger.warn('[SupabaseAuthService] Session validation failed, clearing stale session:', userError?.message || 'no user returned');
              try {
                await this.client.auth.signOut({ scope: 'local' });
              } catch (signOutError) {
                logger.warn('[SupabaseAuthService] Failed to clear stale session:', signOutError);
              }
              this.currentSession = null;
              this.currentUser = null;
              logger.info('[SupabaseAuthService] Initialized without session (stale session cleared)');
            } else {
              // Session is valid - use it
              this.currentSession = transformSession(session);
              this.currentUser = transformUser(validatedUser);
              logger.info('[SupabaseAuthService] Initialized with validated session');
            }
          } catch (validationError) {
            // Network error or timeout during validation - trust the cached session
            // (user might be offline or on slow network, session could still be valid)
            const isTimeout = validationError instanceof Error && validationError.message === 'Session validation timeout';
            if (isNetworkError(validationError) || isTimeout) {
              const reason = isTimeout ? 'timeout' : 'network error';
              logger.warn(`[SupabaseAuthService] ${reason} validating session, trusting cached session`);
              this.currentSession = transformSession(session);
              this.currentUser = this.currentSession.user;
            } else {
              // Non-network error - treat as invalid session
              logger.error('[SupabaseAuthService] Session validation error:', validationError);
              // Track in Sentry - non-network validation failures need investigation
              try {
                Sentry.captureException(validationError, {
                  tags: { flow: 'auth-init-session-validation' },
                  level: 'warning',
                });
              } catch {
                // Sentry failure must not break auth initialization
              }
              this.currentSession = null;
              this.currentUser = null;
            }
          }
        } else if (!error) {
          // Only log "without session" if there was no error (legitimate no-session state)
          logger.info('[SupabaseAuthService] Initialized without session');
        } else {
          // Had an error and no session - user's session was lost
          logger.warn('[SupabaseAuthService] Initialized without session due to error - user may need to sign in again');
        }

        this.initialized = true;
      } catch (error) {
        // Log initialization failures for debugging before re-throwing
        logger.error('[SupabaseAuthService] Initialization failed:', error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        // Clear the promise when done (success or failure)
        // This allows retry on next call if initialization failed
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  getMode(): 'local' | 'cloud' {
    return 'cloud';
  }

  // ==========================================================================
  // USER STATE
  // ==========================================================================

  async getCurrentUser(): Promise<User | null> {
    this.ensureInitialized();

    if (this.currentUser) {
      return this.currentUser;
    }

    const { data: { user }, error } = await this.client!.auth.getUser();

    if (error) {
      if (isNetworkError(error)) {
        throw new NetworkError('Failed to get current user: network error');
      }
      // Non-network error (invalid token, user deleted, etc.) - log for debugging
      logger.info('[SupabaseAuthService] getUser returned non-network error (user may be signed out):', error.message);
      return null;
    }

    if (user) {
      this.currentUser = transformUser(user);
      return this.currentUser;
    }

    return null;
  }

  isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  // ==========================================================================
  // AUTHENTICATION
  // ==========================================================================

  async signUp(email: string, password: string): Promise<AuthResult> {
    this.ensureInitialized();

    // Client-side validation (stronger than Supabase defaults)
    validateEmail(email);
    validatePassword(password);

    const { data, error } = await this.client!.auth.signUp({
      email,
      password,
    });

    if (error) {
      logger.warn('[SupabaseAuthService] Sign up failed:', error.message);

      if (isNetworkError(error)) {
        throw new NetworkError('Sign up failed: network error');
      }

      // Map Supabase errors to user-friendly messages
      if (error.message.includes('already registered')) {
        throw new AuthError('This email is already registered');
      }

      throw new AuthError(error.message);
    }

    if (!data.user) {
      throw new AuthError('Sign up failed: no user returned');
    }

    // Detect existing user: Supabase returns a "fake" user with empty identities
    // for security (prevents email enumeration), but doesn't send confirmation email.
    // We should tell the user the email might already be registered.
    const isExistingUser = data.user.identities?.length === 0;

    const user = transformUser(data.user);

    // Check if email confirmation is required
    if (!data.session) {
      // Email confirmation required (or user already exists)
      return {
        user,
        session: null,
        confirmationRequired: true,
        // Signal to UI that this might be an existing user
        existingUser: isExistingUser,
      };
    }

    // Auto-confirmed (development mode or disabled confirmation)
    const session = transformSession(data.session);
    this.currentSession = session;
    this.currentUser = user;

    logger.info('[SupabaseAuthService] Sign up successful');

    return {
      user,
      session,
      confirmationRequired: false,
    };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    this.ensureInitialized();

    // Rate limiting: Check if we need to wait before allowing another attempt
    const now = Date.now();
    const timeSinceLastFailure = now - this.lastFailedSignInTime;

    // Reset counter if enough time has passed since last failure
    if (timeSinceLastFailure > RATE_LIMIT.RESET_AFTER_MS) {
      this.failedSignInAttempts = 0;
    }

    // Enforce rate limit if too many recent failures
    if (this.failedSignInAttempts >= RATE_LIMIT.MAX_ATTEMPTS) {
      const delayMs = Math.min(
        RATE_LIMIT.BASE_DELAY_MS * Math.pow(2, this.failedSignInAttempts - RATE_LIMIT.MAX_ATTEMPTS),
        RATE_LIMIT.MAX_DELAY_MS
      );
      const remainingMs = delayMs - timeSinceLastFailure;

      if (remainingMs > 0) {
        const remainingSec = Math.ceil(remainingMs / 1000);
        logger.warn(`[SupabaseAuthService] Rate limited: ${this.failedSignInAttempts} failed attempts, wait ${remainingSec}s`);
        throw new AuthError(`Too many failed attempts. Please wait ${remainingSec} seconds before trying again.`);
      }
    }

    // Basic validation only (no password complexity check on sign in)
    validateEmail(email);

    const { data, error } = await this.client!.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Track failed attempt for rate limiting
      this.failedSignInAttempts++;
      this.lastFailedSignInTime = Date.now();

      logger.warn('[SupabaseAuthService] Sign in failed:', error.message);

      if (isNetworkError(error)) {
        throw new NetworkError('Sign in failed: network error');
      }

      // Map Supabase errors to user-friendly messages
      // Use unified message to prevent user enumeration attacks
      if (error.message.includes('Invalid login credentials') ||
          error.message.includes('Email not confirmed')) {
        throw new AuthError('Invalid email or password. If you recently signed up, please check your email for confirmation.');
      }

      throw new AuthError(error.message);
    }

    if (!data.user || !data.session) {
      throw new AuthError('Sign in failed: invalid response');
    }

    // Success: reset rate limiting
    this.failedSignInAttempts = 0;
    this.lastFailedSignInTime = 0;

    const user = transformUser(data.user);
    const session = transformSession(data.session);

    this.currentSession = session;
    this.currentUser = user;

    logger.info('[SupabaseAuthService] Sign in successful');

    return { user, session };
  }

  async signOut(): Promise<void> {
    this.ensureInitialized();

    const { error } = await this.client!.auth.signOut();

    // Clear local state regardless of error
    this.currentSession = null;
    this.currentUser = null;

    if (error) {
      logger.warn('[SupabaseAuthService] Sign out API error:', error.message);
      // API call failed (network error), but we still need to clear local session.
      // Supabase client should clear local storage on signOut(), but to be safe,
      // explicitly try local-scope signout which doesn't require network.
      try {
        await this.client!.auth.signOut({ scope: 'local' });
        logger.info('[SupabaseAuthService] Local session cleared after API failure');
      } catch (localError) {
        // Both API and local signout failed - this is unusual and should be tracked
        // Session state is cleared in memory, but localStorage may still have stale data
        logger.error('[SupabaseAuthService] Both API and local signout failed - auth state may be inconsistent:', localError);
      }
    }

    logger.info('[SupabaseAuthService] Signed out');
  }

  async resetPassword(email: string): Promise<void> {
    this.ensureInitialized();

    validateEmail(email);

    // Note: Not specifying redirectTo lets Supabase use its default flow.
    // A custom /reset-password page can be added in PR #8 if needed.
    const { error } = await this.client!.auth.resetPasswordForEmail(email);

    if (error) {
      logger.warn('[SupabaseAuthService] Password reset failed:', error.message);

      if (isNetworkError(error)) {
        throw new NetworkError('Password reset failed: network error');
      }

      throw new AuthError(error.message);
    }

    logger.info('[SupabaseAuthService] Password reset email sent');
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  async getSession(): Promise<Session | null> {
    this.ensureInitialized();

    if (this.currentSession) {
      return this.currentSession;
    }

    const { data: { session }, error } = await this.client!.auth.getSession();

    if (error) {
      if (isNetworkError(error)) {
        throw new NetworkError('Failed to get session: network error');
      }
      // Non-network session error (corrupted token, expired, etc.) - log for debugging
      logger.info('[SupabaseAuthService] getSession returned non-network error:', error.message);
      return null;
    }

    if (session) {
      this.currentSession = transformSession(session);
      this.currentUser = this.currentSession.user;
      return this.currentSession;
    }

    return null;
  }

  async refreshSession(): Promise<Session | null> {
    this.ensureInitialized();

    const { data: { session }, error } = await this.client!.auth.refreshSession();

    if (error) {
      logger.warn('[SupabaseAuthService] Session refresh failed:', error.message);

      if (isNetworkError(error)) {
        throw new NetworkError('Session refresh failed: network error');
      }

      // Refresh failed (expired/invalid) - return null per interface contract
      // Track in Sentry - non-network refresh failures help diagnose auth issues
      try {
        Sentry.captureMessage('Session refresh failed (non-network)', {
          tags: { flow: 'session-refresh' },
          level: 'warning',
          extra: { errorMessage: error.message },
        });
      } catch {
        // Sentry failure must not affect auth state handling
      }
      this.currentSession = null;
      this.currentUser = null;
      return null;
    }

    if (session) {
      this.currentSession = transformSession(session);
      this.currentUser = this.currentSession.user;
      return this.currentSession;
    }

    return null;
  }

  onAuthStateChange(callback: AuthStateCallback): () => void {
    this.ensureInitialized();

    const { data: { subscription } } = this.client!.auth.onAuthStateChange(
      (event, session) => {
        const authState = mapAuthEvent(event);

        // Track auth events in Sentry (PWA can't access console)
        try {
          Sentry.addBreadcrumb({
            category: 'auth',
            message: `Auth event: ${event} → ${authState}`,
            level: 'info',
            data: { hasSession: !!session, userId: session?.user?.id?.slice(0, 8) },
          });
        } catch {
          // Sentry failure acceptable
        }

        // Update internal state
        if (session) {
          this.currentSession = transformSession(session);
          this.currentUser = this.currentSession.user;
        } else {
          this.currentSession = null;
          this.currentUser = null;
        }

        // Call the callback
        callback(authState, this.currentSession);
      }
    );

    // Return unsubscribe function
    return () => {
      subscription.unsubscribe();
    };
  }

  // ==========================================================================
  // CONSENT MANAGEMENT (GDPR Compliance)
  // ==========================================================================

  async recordConsent(
    policyVersion: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    this.ensureInitialized();

    // Must be authenticated to record consent
    if (!this.currentUser) {
      throw new AuthError('Must be authenticated to record consent');
    }

    // Retry transient errors for consent recording (critical operation)
    try {
      const { error } = await withRetry(async () => {
        const result = await this.client!.rpc('record_user_consent', {
          p_consent_type: 'terms_and_privacy',
          p_policy_version: policyVersion,
          p_ip_address: metadata?.ipAddress,
          p_user_agent: metadata?.userAgent,
        });
        return throwIfTransient(result as { data: unknown; error: { message: string } | null });
      }, { operationName: 'recordConsent' });

      if (error) {
        logger.error('[SupabaseAuthService] Failed to record consent:', error.message);
        throw new AuthError(`Failed to record consent: ${error.message}`);
      }
    } catch (error) {
      if (error instanceof TransientSupabaseError) {
        throw new NetworkError('Failed to record consent: network error after retries');
      }
      throw error;
    }

    logger.info('[SupabaseAuthService] Consent recorded for version:', policyVersion);
  }

  async hasConsentedToVersion(policyVersion: string): Promise<boolean> {
    this.ensureInitialized();

    // Must be authenticated to check consent
    if (!this.currentUser) {
      throw new AuthError('Must be authenticated to check consent');
    }

    // Retry transient errors for consent check
    try {
      const { data, error } = await withRetry(async () => {
        const result = await this.client!.rpc('get_user_consent', {
          p_consent_type: 'terms_and_privacy',
        });
        return throwIfTransient(result as { data: unknown; error: { message: string } | null });
      }, { operationName: 'hasConsentedToVersion' });

      if (error) {
        logger.error('[SupabaseAuthService] Failed to get consent:', error.message);
        throw new AuthError(`Failed to get consent: ${error.message}`);
      }

      // No consent record exists
      if (!data) {
        return false;
      }

      // Check if the consented version matches the required version
      const consentedVersion = (data as { policy_version?: string })?.policy_version;
      return consentedVersion === policyVersion;
    } catch (error) {
      if (error instanceof TransientSupabaseError) {
        throw new NetworkError('Failed to get consent: network error after retries');
      }
      throw error;
    }
  }

  async getLatestConsent(): Promise<{ policyVersion: string; consentedAt: string } | null> {
    this.ensureInitialized();

    // Must be authenticated to check consent
    if (!this.currentUser) {
      throw new AuthError('Must be authenticated to get consent');
    }

    // Retry transient errors for consent check
    try {
      const { data, error } = await withRetry(async () => {
        const result = await this.client!.rpc('get_user_consent', {
          p_consent_type: 'terms_and_privacy',
        });
        return throwIfTransient(result as { data: unknown; error: { message: string } | null });
      }, { operationName: 'getLatestConsent' });

      if (error) {
        logger.error('[SupabaseAuthService] Failed to get consent:', error.message);
        throw new AuthError(`Failed to get consent: ${error.message}`);
      }

      // No consent record exists
      if (!data) {
        return null;
      }

      // Return the consent record
      const record = data as { policy_version?: string; consented_at?: string };
      return {
        policyVersion: record.policy_version ?? '',
        consentedAt: record.consented_at ?? '',
      };
    } catch (error) {
      if (error instanceof TransientSupabaseError) {
        throw new NetworkError('Failed to get consent: network error after retries');
      }
      throw error;
    }
  }

  // ==========================================================================
  // ACCOUNT MANAGEMENT
  // ==========================================================================

  async deleteAccount(): Promise<void> {
    this.ensureInitialized();

    // Must be authenticated to delete account
    if (!this.currentUser || !this.currentSession) {
      throw new AuthError('Must be authenticated to delete account');
    }

    logger.info('[SupabaseAuthService] Initiating account deletion');

    try {
      // Call the Edge Function to delete the account
      // The Edge Function uses the service role key to delete from auth.users
      const { data, error } = await this.client!.functions.invoke('delete-account', {
        method: 'POST',
      });

      if (error) {
        logger.error('[SupabaseAuthService] Account deletion failed:', error.message);

        if (isNetworkError(error)) {
          throw new NetworkError('Account deletion failed: network error');
        }

        throw new AuthError(`Account deletion failed: ${error.message}`);
      }

      // Check if the response indicates success
      if (!data?.success) {
        const errorMessage = data?.error || 'Unknown error';
        logger.error('[SupabaseAuthService] Account deletion failed:', errorMessage);
        throw new AuthError(`Account deletion failed: ${errorMessage}`);
      }

      logger.info('[SupabaseAuthService] Account deleted successfully');

      // Clear local state
      this.currentSession = null;
      this.currentUser = null;

    } catch (error) {
      // Re-throw AuthError and NetworkError as-is
      if (error instanceof AuthError || error instanceof NetworkError) {
        throw error;
      }

      // Wrap unexpected errors
      logger.error('[SupabaseAuthService] Unexpected error during account deletion:', error);
      throw new AuthError(
        error instanceof Error ? error.message : 'Account deletion failed unexpectedly'
      );
    }
  }

  // ==========================================================================
  // INTERNAL
  // ==========================================================================

  /**
   * Ensure the service is initialized.
   * @throws NotInitializedError if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new NotInitializedError('SupabaseAuthService');
    }
  }

  /**
   * Check if service is initialized.
   * Used for testing.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
