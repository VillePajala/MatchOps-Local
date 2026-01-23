/**
 * LocalAuthService
 *
 * No-op authentication service for local-only mode.
 * In local mode, the user is always "authenticated" as the local device owner.
 *
 * Part of Phase 3 backend abstraction (PR #8).
 *
 * @see AuthService interface in src/interfaces/AuthService.ts
 * @see docs/03-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md
 */

import type { AuthService } from '@/interfaces/AuthService';
import type { User, Session, AuthResult, AuthStateCallback } from '@/interfaces/AuthTypes';
import { LOCAL_USER } from '@/interfaces/AuthTypes';
import { NotSupportedError } from '@/interfaces/DataStoreErrors';

/**
 * Local authentication service.
 *
 * Provides no-op authentication for local-only mode.
 * All auth methods (signUp, signIn, etc.) throw NotSupportedError.
 * The user is always considered "authenticated" as the local device owner.
 */
export class LocalAuthService implements AuthService {
  private initialized = false;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  getMode(): 'local' | 'cloud' {
    return 'local';
  }

  // ==========================================================================
  // USER STATE
  // ==========================================================================

  async getCurrentUser(): Promise<User | null> {
    // Return the frozen LOCAL_USER constant (no new object allocation)
    return LOCAL_USER;
  }

  isAuthenticated(): boolean {
    // Local mode is always "authenticated"
    return true;
  }

  // ==========================================================================
  // AUTHENTICATION (Not supported in local mode)
  // ==========================================================================

  async signUp(_email: string, _password: string): Promise<AuthResult> {
    throw new NotSupportedError('signUp', 'local');
  }

  async signIn(_email: string, _password: string): Promise<AuthResult> {
    throw new NotSupportedError('signIn', 'local');
  }

  async signOut(): Promise<void> {
    // No-op in local mode - user is always "signed in"
  }

  async resetPassword(_email: string): Promise<void> {
    throw new NotSupportedError('resetPassword', 'local');
  }

  // ==========================================================================
  // SESSION MANAGEMENT (Not applicable in local mode)
  // ==========================================================================

  async getSession(): Promise<Session | null> {
    // Local mode has no sessions
    return null;
  }

  async refreshSession(): Promise<Session | null> {
    throw new NotSupportedError('refreshSession', 'local');
  }

  onAuthStateChange(_callback: AuthStateCallback): () => void {
    // No-op: local mode never fires state changes
    // Return empty unsubscribe function
    return () => {};
  }

  // ==========================================================================
  // CONSENT MANAGEMENT (Not applicable in local mode)
  // Local mode stores data only on user's device - no GDPR consent needed
  // ==========================================================================

  async recordConsent(
    _policyVersion: string,
    _metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    throw new NotSupportedError('recordConsent', 'local');
  }

  async hasConsentedToVersion(_policyVersion: string): Promise<boolean> {
    throw new NotSupportedError('hasConsentedToVersion', 'local');
  }

  async getLatestConsent(): Promise<{ policyVersion: string; consentedAt: string } | null> {
    throw new NotSupportedError('getLatestConsent', 'local');
  }

  // ==========================================================================
  // INTERNAL
  // ==========================================================================

  /**
   * Check if service is initialized.
   * Used internally for validation.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
