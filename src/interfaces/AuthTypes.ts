/**
 * AuthService Supporting Types
 *
 * Types used by AuthService interface and implementations.
 * Part of Phase 2 backend abstraction (PR #5).
 *
 * @see AuthService.ts for main interface
 * @see docs/03-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md
 */

/**
 * User information.
 */
export interface User {
  /** Unique user identifier */
  id: string;
  /** User's email address (null for local/anonymous users) */
  email: string | null;
  /** Whether this is an anonymous/local user */
  isAnonymous: boolean;
  /** User's display name (optional) */
  displayName?: string;
  /** User's avatar URL (optional) */
  avatarUrl?: string;
  /** When the user was created (ISO 8601 timestamp) */
  createdAt?: string;
  /** When the user was last updated (ISO 8601 timestamp) */
  updatedAt?: string;
}

/**
 * Authentication session.
 *
 * @security Token Storage Requirements (Phase 3/4 Implementation)
 *
 * NEVER store tokens in localStorage or sessionStorage (XSS vulnerable).
 *
 * Recommended storage strategies for cloud mode:
 * 1. **httpOnly cookies** (preferred) - Tokens set by server, inaccessible to JS
 * 2. **Secure memory only** - Store in JS variables, cleared on page refresh
 * 3. **Supabase default** - Supabase JS client handles token storage securely
 *
 * For this PWA:
 * - Local mode: No tokens needed (LocalAuthService returns null session)
 * - Cloud mode: Supabase client manages tokens; avoid manual token handling
 *
 * If manual token handling is required:
 * - Use short-lived access tokens (15 min)
 * - Refresh tokens via httpOnly cookies only
 * - Clear tokens on sign-out and browser close
 * - Never log or expose tokens in error messages
 */
export interface Session {
  /** Access token for API requests - see @security notes above */
  accessToken: string;
  /** Refresh token for obtaining new access tokens - see @security notes above */
  refreshToken: string;
  /** When the access token expires (ISO 8601 timestamp) */
  expiresAt: string;
  /**
   * Token type per OAuth 2.0 RFC 6750.
   * Supabase uses 'bearer'. Extend union if other providers needed (e.g., 'mac', 'dpop').
   */
  tokenType: 'bearer';
  /** Associated user */
  user: User;
}

/**
 * Result of authentication operations (signUp, signIn).
 */
export interface AuthResult {
  /** The authenticated user */
  user: User;
  /** The session (null if email confirmation required) */
  session: Session | null;
  /** Whether email confirmation is required before sign-in */
  confirmationRequired?: boolean;
}

/**
 * Authentication error information parsed from auth provider responses.
 *
 * DATA STRUCTURE only - NOT a throwable Error class.
 * Auth methods throw error classes from DataStoreErrors (NotSupportedError, AuthError, NetworkError).
 *
 * @reserved Phase 4 - Used for parsing Supabase auth error responses
 *
 * @remarks
 * Phase 4 may extend AuthError to accept AuthErrorInfo for structured error handling:
 * ```typescript
 * // Current: AuthError(message, cause?)
 * // Phase 4: AuthError(message, cause?, errorInfo?)
 * ```
 *
 * @example
 * ```typescript
 * // Phase 4: Parse Supabase error and throw with structured info
 * const errorInfo: AuthErrorInfo = parseSupabaseError(supabaseError);
 * throw new AuthError(errorInfo.message, undefined, errorInfo);
 * // Callers can then access: error.authErrorCode, error.status
 * ```
 */
export interface AuthErrorInfo {
  /** Error code for programmatic handling */
  code: AuthErrorCode;
  /** Human-readable error message */
  message: string;
  /** HTTP status code (if applicable) */
  status?: number;
}

/**
 * Authentication error codes.
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'user_not_found'
  | 'email_taken'
  | 'weak_password'
  | 'invalid_email'
  | 'email_not_confirmed'
  | 'session_expired'
  | 'network_error'
  | 'rate_limited'
  | 'not_supported'
  | 'unknown';

/**
 * Authentication state for state change callbacks.
 */
export type AuthState = 'signed_in' | 'signed_out' | 'token_refreshed' | 'user_updated';

/**
 * Callback function for auth state changes.
 */
export type AuthStateCallback = (state: AuthState, session: Session | null) => void;

/**
 * Options for sign-up.
 * @reserved Phase 4 - Not used in current AuthService interface.
 * Will be added to signUp() signature when Supabase integration is implemented.
 */
export interface SignUpOptions {
  /** Additional user metadata */
  metadata?: Record<string, unknown>;
  /** Redirect URL after email confirmation */
  redirectTo?: string;
}

/**
 * Options for sign-in.
 * @reserved Phase 4 - Not used in current AuthService interface.
 * Will be added to signIn() signature when Supabase integration is implemented.
 */
export interface SignInOptions {
  /** Remember the user (persist session) */
  rememberMe?: boolean;
}

/**
 * Local user constant for local-only mode.
 * This pseudo-user represents the local device owner.
 * Frozen to prevent accidental mutation.
 */
export const LOCAL_USER: Readonly<User> = Object.freeze({
  id: 'local',
  email: null,
  isAnonymous: true,
  displayName: 'Local User',
});
