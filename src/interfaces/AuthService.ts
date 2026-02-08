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
   * @throws NetworkError if connection fails (cloud mode only)
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
   * @param password - User's password
   *
   * @security Password Requirements (Phase 4 Implementation)
   * Minimum requirements for cloud mode:
   * - Length: 12+ characters (Supabase default of 6 is too weak)
   * - Complexity: at least 3 of 4 character types (upper, lower, digit, special)
   * - Validation: check against common password lists (for example, Have I Been Pwned)
   * - Strength meter: provide real-time feedback to users
   *
   * Local mode: no password validation (no authentication needed)
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
   *
   * @security Password Validation
   * Password complexity is enforced at sign-up; sign-in should not add extra
   * validation to avoid locking out existing accounts with legacy passwords.
   * @returns Authentication result with user and session
   * @throws NotSupportedError in local mode
   * @throws AuthError if credentials invalid or user not found
   * @throws NetworkError if connection fails
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
   * @returns Session object, or null if no valid session exists
   * @throws NotInitializedError if called before initialize()
   * @throws NetworkError if connection fails (cloud mode only)
   */
  getSession(): Promise<Session | null>;

  /**
   * Refresh the current session.
   * @returns New session, or null if refresh fails (expired/invalid token)
   * @throws NotSupportedError in local mode
   * @throws NotInitializedError if called before initialize()
   * @throws NetworkError if connection fails
   *
   * @remarks
   * Returns null (rather than throwing) when refresh fails due to expired/invalid
   * refresh token. This allows callers to handle re-authentication gracefully.
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
   * - CRITICAL: Always call the returned unsubscribe function to prevent memory leaks
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

  // ==========================================================================
  // CONSENT MANAGEMENT (GDPR Compliance)
  // ==========================================================================

  /**
   * Record user consent for Terms of Service and Privacy Policy.
   *
   * @param policyVersion - The version of the policy being consented to (e.g., '2025-01')
   * @param metadata - Optional metadata for audit trail (IP address, user agent)
   * @returns Promise that resolves when consent is recorded
   * @throws NotSupportedError in local mode (consent not needed for local-only usage)
   * @throws AuthError if user is not authenticated
   * @throws NetworkError if connection fails
   *
   * @remarks
   * - Consent is stored server-side with timestamp for GDPR compliance
   * - Should be called after successful sign-up
   * - Consent records are retained even after account deletion (legal requirement)
   * - Use POLICY_VERSION from src/config/constants.ts
   */
  recordConsent(
    policyVersion: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void>;

  /**
   * Check if user has consented to the current policy version.
   *
   * @param policyVersion - The policy version to check consent for
   * @returns Promise that resolves to true if user has consented to this version
   * @throws NotSupportedError in local mode
   * @throws AuthError if user is not authenticated
   * @throws NetworkError if connection fails
   *
   * @remarks
   * - Use this on login to check if re-consent is needed
   * - Returns false if no consent record exists or if consented to older version
   */
  hasConsentedToVersion(policyVersion: string): Promise<boolean>;

  /**
   * Get the latest consent record for the user.
   *
   * @returns Promise that resolves to the latest consent record, or null if none exists
   * @throws NotSupportedError in local mode
   * @throws AuthError if user is not authenticated
   * @throws NetworkError if connection fails
   *
   * @remarks
   * - Used to determine if user needs re-consent (has old version) vs first consent
   * - Returns null if user has never consented
   * - Returns the most recent consent record if user has consented
   */
  getLatestConsent(): Promise<{ policyVersion: string; consentedAt: string } | null>;

  // ==========================================================================
  // MARKETING CONSENT
  // ==========================================================================

  /**
   * Get the current marketing consent status for the authenticated user.
   *
   * @returns 'granted' if user has opted in, 'withdrawn' if opted out, null if never set
   * @throws NotSupportedError in local mode (no marketing consent needed)
   * @throws AuthError if user is not authenticated
   * @throws NetworkError if connection fails
   */
  getMarketingConsentStatus(): Promise<'granted' | 'withdrawn' | null>;

  /**
   * Set marketing consent for the authenticated user.
   *
   * @param granted - true to grant consent, false to withdraw
   * @throws NotSupportedError in local mode
   * @throws AuthError if user is not authenticated
   * @throws NetworkError if connection fails
   *
   * @remarks
   * - Creates an audit trail entry (granted or withdrawn) in user_consents
   * - Previous entries are retained for GDPR compliance
   * - Uses POLICY_VERSION from src/config/constants.ts
   */
  setMarketingConsent(granted: boolean): Promise<void>;

  // ==========================================================================
  // ACCOUNT MANAGEMENT
  // ==========================================================================

  /**
   * Permanently delete the user's account.
   *
   * This action:
   * 1. Deletes all user data from the database
   * 2. Deletes the user from Supabase Auth
   * 3. Signs out the user locally
   *
   * @throws NotSupportedError in local mode (use hard reset instead)
   * @throws AuthError if user is not authenticated or deletion fails
   * @throws NetworkError if connection fails
   *
   * @remarks
   * - This action is IRREVERSIBLE
   * - User will need to create a new account to use cloud features again
   * - Consent records are retained for GDPR compliance (legal requirement)
   * - In local mode, users should use "Hard Reset" to clear local data
   */
  deleteAccount(): Promise<void>;
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
//    - RECOMMENDED: Option A - No-op implementation (simplest, zero overhead)
//      ```typescript
//      onAuthStateChange(_callback: AuthStateCallback): () => void {
//        return () => {}; // No-op: local mode never fires state changes
//      }
//      ```
//    - NOT RECOMMENDED for LocalAuthService: Option B (subscriber tracking)
//      Reserve subscriber management for SupabaseAuthService in Phase 4.
//    - AVOID: Growing array of callbacks that are never cleaned up
//
// 3. isAuthenticated() MUST BE SYNCHRONOUS
//    - Return cached boolean, no async operations
//    - In local mode, always return true
//
// 4. SINGLETON PATTERN
//    - LocalAuthService should be a singleton (like LocalDataStore)
//    - See factory.ts pattern from PR #8
//    - Example:
//      ```typescript
//      let authServiceInstance: AuthService | null = null;
//      export function getAuthService(): AuthService {
//        if (!authServiceInstance) {
//          authServiceInstance = new LocalAuthService();
//        }
//        return authServiceInstance;
//      }
//      ```
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
//
// 6. AUTHERROR EXTENSION
//    - AuthError accepts AuthErrorInfo for richer auth failure metadata
//    - When implementing SupabaseAuthService, pass errorInfo to AuthError
//    - See src/interfaces/AuthTypes.ts AuthErrorInfo for reserved fields
//    - Example:
//      ```typescript
//      class AuthError extends DataStoreError {
//        public readonly authErrorCode?: AuthErrorCode;
//
//        constructor(message: string, cause?: Error, errorInfo?: AuthErrorInfo) {
//          super(message, 'AUTH_ERROR', cause);
//          this.authErrorCode = errorInfo?.code;
//          // ... attach other AuthErrorInfo fields as needed
//        }
//      }
//      ```
// =============================================================================
