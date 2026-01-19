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
import type { SupabaseClient, AuthChangeEvent, Session as SupabaseSession } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import logger from '@/utils/logger';

/**
 * Password complexity requirements.
 * Enforced client-side before calling Supabase Auth.
 */
const PASSWORD_MIN_LENGTH = 12;

/**
 * Map Supabase auth events to our AuthState type.
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
    default:
      return 'signed_in';
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
  // Default to 1 hour from now if expires_at is missing
  const expiresAtSeconds = supabaseSession.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
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
 */
function isNetworkError(error: unknown): boolean {
  let message: string | undefined;

  if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = (error as { message: string }).message;
  }

  if (!message) return false;

  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('offline') ||
    lowerMessage.includes('connection')
  );
}

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

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.client = getSupabaseClient();

    // Get initial session
    const { data: { session }, error } = await this.client.auth.getSession();

    if (error) {
      logger.error('[SupabaseAuthService] Failed to get initial session:', error.message);
      // Don't throw - app should still work, just not authenticated
    }

    if (session) {
      this.currentSession = transformSession(session);
      this.currentUser = this.currentSession.user;
      logger.info('[SupabaseAuthService] Initialized with existing session');
    } else {
      logger.info('[SupabaseAuthService] Initialized without session');
    }

    this.initialized = true;
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
      // User not found or invalid token - not an error, just not authenticated
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

    const user = transformUser(data.user);

    // Check if email confirmation is required
    if (!data.session) {
      // Email confirmation required
      return {
        user,
        session: null,
        confirmationRequired: true,
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

    // Basic validation only (no password complexity check on sign in)
    validateEmail(email);

    const { data, error } = await this.client!.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.warn('[SupabaseAuthService] Sign in failed:', error.message);

      if (isNetworkError(error)) {
        throw new NetworkError('Sign in failed: network error');
      }

      // Map Supabase errors to user-friendly messages
      if (error.message.includes('Invalid login credentials')) {
        throw new AuthError('Invalid email or password');
      }
      if (error.message.includes('Email not confirmed')) {
        throw new AuthError('Please confirm your email before signing in');
      }

      throw new AuthError(error.message);
    }

    if (!data.user || !data.session) {
      throw new AuthError('Sign in failed: invalid response');
    }

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
      logger.warn('[SupabaseAuthService] Sign out error:', error.message);
      // Don't throw - user is signed out locally
    }

    logger.info('[SupabaseAuthService] Signed out');
  }

  async resetPassword(email: string): Promise<void> {
    this.ensureInitialized();

    validateEmail(email);

    const { error } = await this.client!.auth.resetPasswordForEmail(email, {
      // Redirect URL after password reset (if applicable)
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,
    });

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
      // Session error - just return null
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
