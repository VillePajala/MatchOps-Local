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
  /** When the user was created */
  createdAt?: string;
  /** When the user was last updated */
  updatedAt?: string;
}

/**
 * Authentication session.
 */
export interface Session {
  /** Access token for API requests */
  accessToken: string;
  /** Refresh token for obtaining new access tokens */
  refreshToken: string;
  /** When the access token expires (ISO timestamp) */
  expiresAt: string;
  /** Token type (usually 'bearer') */
  tokenType: string;
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
 * Authentication error information (from auth provider responses).
 *
 * Note: This is a data structure for error information, not a throwable Error.
 * Auth methods throw errors from DataStoreErrors (e.g., NotSupportedError, AuthError).
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
 * @reserved Phase 4 - for extended sign-up options
 */
export interface SignUpOptions {
  /** Additional user metadata */
  metadata?: Record<string, unknown>;
  /** Redirect URL after email confirmation */
  redirectTo?: string;
}

/**
 * Options for sign-in.
 * @reserved Phase 4 - for extended sign-in options
 */
export interface SignInOptions {
  /** Remember the user (persist session) */
  rememberMe?: boolean;
}

/**
 * Local user constant for local-only mode.
 * This pseudo-user represents the local device owner.
 */
export const LOCAL_USER: User = {
  id: 'local',
  email: null,
  isAnonymous: true,
  displayName: 'Local User',
};
