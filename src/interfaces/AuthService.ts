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
   *
   * @remarks
   * This is a high-level mode indicator (only 2 values).
   * Compare with DataStore.getBackendName() which returns a specific
   * backend identifier string (e.g., 'local', 'supabase', 'firebase').
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
   * @param email - User's email address (must be valid email format)
   * @param password - User's password (cloud mode: min 6 chars, specific rules TBD by Supabase in Phase 4)
   * @returns Authentication result with user and session
   * @throws NotSupportedError in local mode
   * @throws ValidationError if email format invalid or password too weak
   * @throws AuthError if email already registered or other auth backend errors
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
   * - CRITICAL: Failure to call unsubscribe will cause memory leaks
   *
   * @example
   * ```typescript
   * useEffect(() => {
   *   const unsubscribe = authService.onAuthStateChange((state, session) => {
   *     // handle auth state change
   *   });
   *   return unsubscribe; // cleanup on unmount
   * }, []);
   * ```
   */
  onAuthStateChange(callback: AuthStateCallback): () => void;
}

// =============================================================================
// PHASE 3 IMPLEMENTATION NOTES (LocalAuthService)
// =============================================================================
//
// Memory & Performance:
// ---------------------
// 1. getCurrentUser() CACHING
//    - Return the frozen LOCAL_USER constant from AuthTypes.ts
//    - Do NOT create a new object on each call
//    - Example: return LOCAL_USER; // not { id: 'local', ... }
//
// 2. onAuthStateChange() MEMORY LEAK PREVENTION
//    - LocalAuthService never fires auth state changes (no cloud events)
//    - Option A: Store no subscribers, return no-op unsubscribe
//      ```typescript
//      onAuthStateChange(_callback: AuthStateCallback): () => void {
//        return () => {}; // No-op: local mode never fires state changes
//      }
//      ```
//    - Option B: If storing subscribers (for future flexibility), ensure:
//      - Subscribers are stored in a Set (fast add/remove)
//      - Unsubscribe function removes from Set
//      - Set is cleared on service disposal
//    - AVOID: Growing array of callbacks that are never cleaned up
//
// 3. isAuthenticated() MUST BE SYNCHRONOUS
//    - Return cached boolean, no async operations
//    - In local mode, always return true
//
// =============================================================================

// =============================================================================
// PHASE 4 IMPLEMENTATION NOTES (SupabaseAuthService)
// =============================================================================
//
// Security Requirements:
// ----------------------
// 1. TOKEN LOGGING PREVENTION
//    - Never log accessToken or refreshToken values
//    - Add ESLint rule or token scrubber to catch accidental logging
//    - Mask tokens in error messages (show only last 4 chars if needed)
//
// 2. TOKEN ROTATION
//    - Implement automatic token rotation on refreshSession()
//    - Supabase handles this by default; verify rotation occurs
//    - Consider shorter access token lifetimes (15 min recommended)
//
// 3. MULTI-DEVICE SIGN OUT
//    - signOut() currently signs out current session only
//    - Consider adding signOutAll() for all devices (requires Supabase admin API)
//    - Useful for "sign out everywhere" security feature
//
// 4. RATE LIMITING
//    - Implement rate limiting for signIn, signUp, resetPassword
//    - Prevents brute force and credential stuffing attacks
//    - Supabase has built-in rate limits; verify they're sufficient
//    - Consider client-side exponential backoff on repeated failures
//
// 5. SESSION VALIDATION
//    - Validate session on app resume/visibility change
//    - Handle session revocation gracefully (server-side logout)
//    - Clear local state when session becomes invalid
// =============================================================================
