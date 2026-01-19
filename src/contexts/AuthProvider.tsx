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
import type { User, Session, AuthState } from '@/interfaces/AuthTypes';
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

  // Actions
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; confirmationRequired?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
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
      setUser(result.user);
      setSession(result.session);
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
        setUser(result.user);
        setSession(result.session);
      }
      return { confirmationRequired: result.confirmationRequired };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign up failed' };
    }
  }, [authService]);

  const signOut = useCallback(async () => {
    if (!authService) return;

    try {
      await authService.signOut();
    } catch (error) {
      // Log but don't throw - user should be signed out locally regardless
      logger.warn('[AuthProvider] Sign out error:', error);
    }
    // Always clear local state, even if API call failed
    setUser(null);
    setSession(null);
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

  // Memoize the context value to prevent unnecessary re-renders
  const value: AuthContextValue = useMemo(() => ({
    user,
    session,
    // Local mode is always "authenticated", cloud mode checks session
    isAuthenticated: mode === 'local' ? true : !!session,
    isLoading,
    mode,
    signIn,
    signUp,
    signOut,
    resetPassword,
  }), [user, session, mode, isLoading, signIn, signUp, signOut, resetPassword]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
