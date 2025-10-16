# AuthService Interface Specification

**Status**: Proposed Design
**Last Updated**: 2025-10-11
**Purpose**: Unified authentication interface for both local (no-auth) and cloud (Supabase) backends
**Related**: [Dual-Backend Architecture](./dual-backend-architecture.md) | [DataStore Interface](./datastore-interface.md) | [Supabase Schema](../database/supabase-schema.md)

## Overview

The `AuthService` interface provides a **unified authentication API** that abstracts authentication details for both local (single-user, no authentication) and cloud (Supabase Auth, multi-user) backends. This allows the application to support both modes without changing business logic.

**Key Design Principles**:
1. **Mode-Agnostic**: Same interface for local and cloud implementations
2. **Type-Safe**: Full TypeScript support
3. **Session Management**: Handle tokens, expiration, refresh
4. **Offline Support**: Cached credentials for offline access
5. **Privacy-First**: Minimal data collection, no tracking

## Interface Definition

```typescript
/**
 * Unified authentication interface for both local (no-auth) and cloud (Supabase) backends.
 *
 * Implementations:
 * - LocalAuthService: No-op auth for single-user local mode
 * - SupabaseAuthService: Supabase Auth with email/password + OAuth
 */
export interface AuthService {
  // ==================== LIFECYCLE ====================

  /**
   * Initialize the auth service (restore session, validate tokens, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Get the current authentication mode
   */
  getMode(): 'local' | 'cloud';

  /**
   * Check if authentication is required for this mode
   */
  requiresAuth(): boolean;

  // ==================== SESSION ====================

  /**
   * Get the current authenticated user
   * @returns User object or null if not authenticated
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Get the current session
   * @returns Session object or null if no active session
   */
  getSession(): Promise<Session | null>;

  /**
   * Refresh the current session (extend expiration)
   */
  refreshSession(): Promise<Session>;

  // ==================== AUTHENTICATION ====================

  /**
   * Sign up a new user
   * @param email - User email
   * @param password - User password
   * @returns Created user and session
   */
  signUp(email: string, password: string): Promise<AuthResponse>;

  /**
   * Sign in with email and password
   * @param email - User email
   * @param password - User password
   * @returns User and session
   */
  signIn(email: string, password: string): Promise<AuthResponse>;

  /**
   * Sign in with OAuth provider (Google, Apple, etc.)
   * @param provider - OAuth provider name
   */
  signInWithOAuth(provider: OAuthProvider): Promise<void>;

  /**
   * Sign out current user
   */
  signOut(): Promise<void>;

  // ==================== PASSWORD MANAGEMENT ====================

  /**
   * Send password reset email
   * @param email - User email
   */
  resetPassword(email: string): Promise<void>;

  /**
   * Update user password (requires current session)
   * @param newPassword - New password
   */
  updatePassword(newPassword: string): Promise<void>;

  // ==================== USER MANAGEMENT ====================

  /**
   * Update user profile
   * @param updates - Partial user data to update
   */
  updateProfile(updates: UserProfileUpdate): Promise<User>;

  /**
   * Delete user account (with all data)
   */
  deleteAccount(): Promise<void>;

  // ==================== EVENT LISTENERS ====================

  /**
   * Listen for auth state changes
   * @param callback - Called when auth state changes
   * @returns Unsubscribe function
   */
  onAuthStateChange(callback: AuthStateChangeCallback): UnsubscribeFn;

  // ==================== BACKEND ACCESS ====================

  /**
   * Get Supabase client (for SupabaseDataStore)
   * @returns Supabase client or throws if not in cloud mode
   */
  getSupabaseClient(): Promise<SupabaseClient>;

  /**
   * Get access token for API calls (if needed)
   */
  getAccessToken(): Promise<string | null>;
}
```

## Supporting Types

### User Types

```typescript
/**
 * Authenticated user
 */
export interface User {
  id: string;                    // UUID
  email: string;                 // user@example.com
  emailVerified?: boolean;       // Email verification status
  displayName?: string;          // Optional display name
  createdAt: string;             // ISO timestamp
}

/**
 * Authentication session
 */
export interface Session {
  user: User;                    // Current user
  accessToken: string;           // JWT access token
  refreshToken: string;          // JWT refresh token
  expiresAt: number;             // Unix timestamp (ms)
}

/**
 * Auth operation response
 */
export interface AuthResponse {
  user: User;
  session: Session;
}

/**
 * User profile updates
 */
export interface UserProfileUpdate {
  displayName?: string;
  email?: string;
}
```

### OAuth Types

```typescript
/**
 * Supported OAuth providers
 */
export type OAuthProvider =
  | 'google'
  | 'apple'
  | 'facebook'
  | 'github';

/**
 * OAuth configuration
 */
export interface OAuthConfig {
  redirectTo?: string;           // Post-auth redirect URL
  scopes?: string[];             // OAuth scopes
}
```

### Event Types

```typescript
/**
 * Auth state change events
 */
export type AuthStateChangeEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED';

/**
 * Auth state change callback
 */
export type AuthStateChangeCallback = (
  event: AuthStateChangeEvent,
  session: Session | null
) => void;

/**
 * Unsubscribe function
 */
export type UnsubscribeFn = () => void;
```

### Error Handling

```typescript
/**
 * Auth-specific errors
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public code: AuthErrorCode,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export enum AuthErrorCode {
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
```

## Implementation: LocalAuthService

**No-op authentication for single-user local mode**:

```typescript
/**
 * Local-first implementation with no authentication required.
 * Simulates a single anonymous user for consistency with cloud mode.
 */
export class LocalAuthService implements AuthService {
  private anonymousUser: User = {
    id: 'local-user', // Fixed ID for single-user mode
    email: 'local@matchops.local',
    emailVerified: true,
    displayName: 'Local User',
    createdAt: new Date().toISOString(),
  };

  async initialize(): Promise<void> {
    // No initialization needed for local mode
  }

  getMode(): 'local' | 'cloud' {
    return 'local';
  }

  requiresAuth(): boolean {
    return false; // No auth required
  }

  async getCurrentUser(): Promise<User | null> {
    return this.anonymousUser; // Always return anonymous user
  }

  async isAuthenticated(): Promise<boolean> {
    return true; // Always authenticated in local mode
  }

  async getSession(): Promise<Session | null> {
    // Return mock session for consistency
    return {
      user: this.anonymousUser,
      accessToken: 'local-token',
      refreshToken: 'local-refresh',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    };
  }

  async refreshSession(): Promise<Session> {
    return this.getSession() as Promise<Session>;
  }

  async signUp(email: string, password: string): Promise<AuthResponse> {
    throw new AuthError(
      'Sign up not available in local mode',
      AuthErrorCode.PERMISSION_DENIED
    );
  }

  async signIn(email: string, password: string): Promise<AuthResponse> {
    throw new AuthError(
      'Sign in not available in local mode',
      AuthErrorCode.PERMISSION_DENIED
    );
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
    throw new AuthError(
      'OAuth not available in local mode',
      AuthErrorCode.PERMISSION_DENIED
    );
  }

  async signOut(): Promise<void> {
    // No-op: can't sign out in local mode
  }

  async resetPassword(email: string): Promise<void> {
    throw new AuthError(
      'Password reset not available in local mode',
      AuthErrorCode.PERMISSION_DENIED
    );
  }

  async updatePassword(newPassword: string): Promise<void> {
    throw new AuthError(
      'Password update not available in local mode',
      AuthErrorCode.PERMISSION_DENIED
    );
  }

  async updateProfile(updates: UserProfileUpdate): Promise<User> {
    // No-op: profile updates not needed in local mode
    return this.anonymousUser;
  }

  async deleteAccount(): Promise<void> {
    // This would trigger full app reset (clearAllData)
    throw new AuthError(
      'Use app reset instead of account deletion in local mode',
      AuthErrorCode.PERMISSION_DENIED
    );
  }

  onAuthStateChange(callback: AuthStateChangeCallback): UnsubscribeFn {
    // No-op: auth state never changes in local mode
    return () => {};
  }

  async getSupabaseClient(): Promise<SupabaseClient> {
    throw new AuthError(
      'Supabase not available in local mode',
      AuthErrorCode.PERMISSION_DENIED
    );
  }

  async getAccessToken(): Promise<string | null> {
    return 'local-token'; // Mock token
  }
}
```

**Key Pattern**: LocalAuthService provides no-op implementations that maintain interface compatibility while disabling cloud-only features.

## Implementation: SupabaseAuthService

**Full authentication using Supabase Auth**:

```typescript
/**
 * Cloud implementation using Supabase Auth
 */
export class SupabaseAuthService implements AuthService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseAnonKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  async initialize(): Promise<void> {
    // Restore session from storage
    const { data, error } = await this.supabase.auth.getSession();
    if (error) {
      logger.warn('[SupabaseAuthService] Failed to restore session:', error);
    }

    // Set up auto-refresh
    this.supabase.auth.onAuthStateChange((event, session) => {
      logger.log('[SupabaseAuthService] Auth state changed:', event);
    });
  }

  getMode(): 'local' | 'cloud' {
    return 'cloud';
  }

  requiresAuth(): boolean {
    return true;
  }

  async getCurrentUser(): Promise<User | null> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email!,
      emailVerified: data.user.email_confirmed_at !== null,
      displayName: data.user.user_metadata?.displayName,
      createdAt: data.user.created_at,
    };
  }

  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error || !data.session) {
      return null;
    }

    return {
      user: {
        id: data.session.user.id,
        email: data.session.user.email!,
        emailVerified: data.session.user.email_confirmed_at !== null,
        displayName: data.session.user.user_metadata?.displayName,
        createdAt: data.session.user.created_at,
      },
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at! * 1000, // Convert to ms
    };
  }

  async refreshSession(): Promise<Session> {
    const { data, error } = await this.supabase.auth.refreshSession();
    if (error || !data.session) {
      throw new AuthError(
        'Failed to refresh session',
        AuthErrorCode.SESSION_EXPIRED,
        { error }
      );
    }

    return {
      user: {
        id: data.session.user.id,
        email: data.session.user.email!,
        emailVerified: data.session.user.email_confirmed_at !== null,
        displayName: data.session.user.user_metadata?.displayName,
        createdAt: data.session.user.created_at,
      },
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at! * 1000,
    };
  }

  async signUp(email: string, password: string): Promise<AuthResponse> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw new AuthError(
        'Sign up failed',
        this.mapSupabaseError(error.message),
        { error }
      );
    }

    if (!data.user || !data.session) {
      throw new AuthError(
        'Sign up succeeded but no session returned',
        AuthErrorCode.UNKNOWN_ERROR
      );
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email!,
        emailVerified: false, // Email verification required
        createdAt: data.user.created_at,
      },
      session: {
        user: {
          id: data.user.id,
          email: data.user.email!,
          emailVerified: false,
          createdAt: data.user.created_at,
        },
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at! * 1000,
      },
    };
  }

  async signIn(email: string, password: string): Promise<AuthResponse> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new AuthError(
        'Sign in failed',
        this.mapSupabaseError(error.message),
        { error }
      );
    }

    if (!data.user || !data.session) {
      throw new AuthError(
        'Sign in succeeded but no session returned',
        AuthErrorCode.UNKNOWN_ERROR
      );
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email!,
        emailVerified: data.user.email_confirmed_at !== null,
        displayName: data.user.user_metadata?.displayName,
        createdAt: data.user.created_at,
      },
      session: {
        user: {
          id: data.user.id,
          email: data.user.email!,
          emailVerified: data.user.email_confirmed_at !== null,
          displayName: data.user.user_metadata?.displayName,
          createdAt: data.user.created_at,
        },
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at! * 1000,
      },
    };
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      throw new AuthError(
        'OAuth sign in failed',
        AuthErrorCode.UNKNOWN_ERROR,
        { error }
      );
    }

    // OAuth flow redirects to provider, then back to callback URL
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) {
      throw new AuthError(
        'Sign out failed',
        AuthErrorCode.UNKNOWN_ERROR,
        { error }
      );
    }
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      throw new AuthError(
        'Password reset failed',
        AuthErrorCode.UNKNOWN_ERROR,
        { error }
      );
    }
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      throw new AuthError(
        'Password update failed',
        this.mapSupabaseError(error.message),
        { error }
      );
    }
  }

  async updateProfile(updates: UserProfileUpdate): Promise<User> {
    const { data, error } = await this.supabase.auth.updateUser({
      email: updates.email,
      data: {
        displayName: updates.displayName,
      },
    });

    if (error || !data.user) {
      throw new AuthError(
        'Profile update failed',
        AuthErrorCode.UNKNOWN_ERROR,
        { error }
      );
    }

    return {
      id: data.user.id,
      email: data.user.email!,
      emailVerified: data.user.email_confirmed_at !== null,
      displayName: data.user.user_metadata?.displayName,
      createdAt: data.user.created_at,
    };
  }

  async deleteAccount(): Promise<void> {
    // Supabase Admin API required for account deletion
    // OR use database trigger: ON DELETE CASCADE from auth.users
    throw new AuthError(
      'Account deletion not yet implemented',
      AuthErrorCode.PERMISSION_DENIED
    );
  }

  onAuthStateChange(callback: AuthStateChangeCallback): UnsubscribeFn {
    const { data: subscription } = this.supabase.auth.onAuthStateChange(
      (event, session) => {
        const mappedEvent = this.mapSupabaseEvent(event);
        callback(mappedEvent, session ? this.mapSession(session) : null);
      }
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
  }

  async getSupabaseClient(): Promise<SupabaseClient> {
    return this.supabase;
  }

  async getAccessToken(): Promise<string | null> {
    const session = await this.getSession();
    return session?.accessToken ?? null;
  }

  private mapSupabaseError(message: string): AuthErrorCode {
    if (message.includes('Invalid login credentials')) {
      return AuthErrorCode.INVALID_CREDENTIALS;
    }
    if (message.includes('User not found')) {
      return AuthErrorCode.USER_NOT_FOUND;
    }
    if (message.includes('already registered')) {
      return AuthErrorCode.EMAIL_ALREADY_EXISTS;
    }
    if (message.includes('Password should be')) {
      return AuthErrorCode.WEAK_PASSWORD;
    }
    return AuthErrorCode.UNKNOWN_ERROR;
  }

  private mapSupabaseEvent(event: string): AuthStateChangeEvent {
    switch (event) {
      case 'SIGNED_IN':
        return 'SIGNED_IN';
      case 'SIGNED_OUT':
        return 'SIGNED_OUT';
      case 'TOKEN_REFRESHED':
        return 'TOKEN_REFRESHED';
      case 'USER_UPDATED':
        return 'USER_UPDATED';
      default:
        return 'SIGNED_OUT';
    }
  }

  private mapSession(session: any): Session {
    return {
      user: {
        id: session.user.id,
        email: session.user.email!,
        emailVerified: session.user.email_confirmed_at !== null,
        displayName: session.user.user_metadata?.displayName,
        createdAt: session.user.created_at,
      },
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at! * 1000,
    };
  }
}
```

## Usage in Application

### Initialization

```typescript
// src/utils/authService.ts

let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (authServiceInstance) {
    return authServiceInstance;
  }

  // Check user preference or environment variable
  const mode = localStorage.getItem('auth-mode') ?? 'local';

  if (mode === 'local') {
    authServiceInstance = new LocalAuthService();
  } else {
    authServiceInstance = new SupabaseAuthService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return authServiceInstance;
}

// Initialize on app load
export async function initializeAuth(): Promise<void> {
  const authService = getAuthService();
  await authService.initialize();
}
```

### React Integration

```typescript
// src/hooks/useAuth.ts

export function useAuth() {
  const authService = getAuthService();

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: () => authService.getCurrentUser(),
  });

  const signInMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authService.signIn(email, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => authService.signOut(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    requiresAuth: authService.requiresAuth(),
    signIn: signInMutation.mutate,
    signOut: signOutMutation.mutate,
  };
}
```

### Protected Routes

```typescript
// src/components/ProtectedRoute.tsx

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, requiresAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && requiresAuth && !user) {
      router.push('/auth/sign-in');
    }
  }, [user, isLoading, requiresAuth, router]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (requiresAuth && !user) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
```

## Offline Support

### Cached Session

**Local Mode**: Always authenticated (no network dependency)

**Cloud Mode**: Session cached in browser storage
```typescript
// Supabase handles persistence automatically
const supabase = createClient(url, key, {
  auth: {
    persistSession: true, // Store in localStorage
    autoRefreshToken: true, // Auto-refresh before expiration
  },
});
```

**Offline Behavior**:
- Cached session works offline (up to expiration)
- Operations fail gracefully with network error
- DataStore queues operations for sync when online (future enhancement)

## Migration Considerations

### Local → Cloud Migration

**User Flow**:
1. User creates account in cloud mode
2. Export local data (`DataStore.exportAllData()`)
3. Sign in to cloud account
4. Import data to cloud (`DataStore.importData()`)
5. Verify migration successful
6. Switch to cloud mode permanently

**Account Linking** (Future):
- User already has local data
- Signs up for cloud account
- One-click "Upload Local Data" button
- Automatic migration + verification

### Cloud → Local Downgrade

**User Flow** (Edge Case):
1. User wants to go back to local-only
2. Export cloud data
3. Sign out
4. Switch to local mode
5. Import data to local storage

**Limitations**:
- Loses multi-device sync
- Loses cloud backup
- No undo (one-way operation)

## Security Considerations

### Local Mode

**No Authentication**: Single-user device access
**Security Model**:
- Browser sandboxing (same as current)
- Device encryption (OS-level)
- No network transmission

### Cloud Mode

**Authentication Required**: Email/password + OAuth
**Security Features**:
- JWT tokens with expiration
- Automatic token refresh
- Supabase RLS (database-level access control)
- HTTPS for all network traffic
- Password hashing (bcrypt, managed by Supabase)

**Privacy Commitment**:
- User data encrypted in transit (TLS)
- User data isolated via RLS (database-level)
- No analytics or tracking (only license validation)
- Game data never used for non-user purposes

## Performance Considerations

### Local Mode

**Zero Overhead**: No auth checks, no network calls

### Cloud Mode

**Minimal Overhead**:
- Session check: ~10ms (cached)
- Token refresh: ~200ms (once per hour)
- Auth state change listeners: <1ms

**Optimizations**:
- Cache user in React Query (avoid repeated checks)
- Use Supabase's auto-refresh (background)
- Lazy load auth UI (reduce bundle size)

---

**Next Steps**:
- Review [DataStore Interface](./datastore-interface.md) for data access layer
- See [Dual-Backend Architecture](./dual-backend-architecture.md) for complete system design
- Check [Phased Implementation Roadmap](../../03-active-plans/backend-evolution/phased-implementation-roadmap.md) for rollout plan
