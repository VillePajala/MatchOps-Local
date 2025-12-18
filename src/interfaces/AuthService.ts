/**
 * AuthService Interface
 *
 * Backend-agnostic interface for authentication operations.
 * Part of Phase 2 backend abstraction (PR #5).
 *
 * @remarks
 * This interface defines the contract for authentication services.
 * - LocalAuthService: No-op implementation for local-only mode (always "authenticated")
 * - SupabaseAuthService: Full implementation for cloud mode (future Phase 4)
 *
 * For the local-first PWA, authentication is optional. The app works fully
 * without any authentication in local mode.
 *
 * @see docs/03-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md
 */

import type { User, Session, AuthResult, AuthStateCallback } from './AuthTypes';

/**
 * Authentication service interface.
 *
 * Implementations:
 * - LocalAuthService: No-op for local mode (Phase 3)
 * - SupabaseAuthService: Full auth for cloud mode (Phase 4, optional)
 */
export interface AuthService {
  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Initialize the auth service.
   * Must be called before any other operations.
   */
  initialize(): Promise<void>;

  /**
   * Get the current authentication mode.
   * @returns 'local' for offline-only, 'cloud' for Supabase-backed
   */
  getMode(): 'local' | 'cloud';

  // ==========================================================================
  // USER STATE
  // ==========================================================================

  /**
   * Get the current authenticated user.
   * In local mode, returns a pseudo-user representing the local device.
   * @returns User object or null if not authenticated
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Check if a user is currently authenticated.
   * In local mode, always returns true (local user is always "authenticated").
   *
   * @returns true if authenticated
   *
   * @remarks
   * This is a synchronous check against cached state. In cloud mode,
   * the result may be stale if called before initialize() completes.
   */
  isAuthenticated(): boolean;

  // ==========================================================================
  // AUTHENTICATION (Cloud mode only)
  // These methods throw errors from DataStoreErrors module:
  // - NotSupportedError: when called in local mode
  // - AuthError: for authentication failures in cloud mode
  // - NetworkError: for connection issues
  // ==========================================================================

  /**
   * Sign up a new user with email and password.
   * @param email - User's email address
   * @param password - User's password (requirements defined by auth backend)
   * @returns Authentication result with user and session
   * @throws NotSupportedError in local mode
   * @throws ValidationError if email/password don't meet backend requirements
   */
  signUp(email: string, password: string): Promise<AuthResult>;

  /**
   * Sign in an existing user with email and password.
   * @param email - User's email address
   * @param password - User's password
   * @returns Authentication result with user and session
   * @throws NotSupportedError in local mode
   */
  signIn(email: string, password: string): Promise<AuthResult>;

  /**
   * Sign out the current user.
   * In local mode, this is a no-op.
   */
  signOut(): Promise<void>;

  /**
   * Send a password reset email.
   * @param email - User's email address
   * @throws NotSupportedError in local mode
   */
  resetPassword(email: string): Promise<void>;

  // ==========================================================================
  // SESSION MANAGEMENT (Cloud mode only)
  // ==========================================================================

  /**
   * Get the current session.
   * @returns Session object or null if not authenticated
   */
  getSession(): Promise<Session | null>;

  /**
   * Refresh the current session.
   * @returns New session, or null if no valid session exists to refresh
   * @throws NotSupportedError in local mode
   *
   * @remarks
   * Returns null (rather than throwing) when refresh fails due to expired/invalid
   * refresh token. This allows callers to handle re-authentication gracefully.
   * Throws NetworkError only for connection failures.
   */
  refreshSession(): Promise<Session | null>;

  /**
   * Subscribe to authentication state changes.
   *
   * @param callback - Function called when auth state changes
   * @returns Unsubscribe function - call on component unmount to prevent memory leaks
   *
   * @remarks
   * - Callbacks are invoked asynchronously
   * - Call the returned unsubscribe function when the subscriber is no longer needed
   * - In React, typically call unsubscribe in useEffect cleanup
   */
  onAuthStateChange(callback: AuthStateCallback): () => void;
}
