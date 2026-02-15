# 07. Auth & Providers — Authentication Flow, Context, Provider Nesting

> **Audience**: AI agent building the new app
> **Purpose**: How to implement dual-mode authentication (local no-op + Supabase cloud) and wire context providers

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                AuthProvider                  │
│  Determines mode → creates AuthService      │
│  Exposes: user, session, signIn, signOut...  │
│                                              │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │ LocalAuthService  │  │ SupabaseAuth...  │ │
│  │ Always authed     │  │ Email/password   │ │
│  │ No-op methods     │  │ Supabase SDK     │ │
│  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────┘
```

**Key insight**: Auth is **independent** of data storage mode. A user can be signed in (auth = Supabase) while using local mode (data = IndexedDB). Auth != sync.

---

## 1. AuthService Interface

```typescript
// src/interfaces/AuthService.ts

export interface AuthService {
  initialize(): Promise<void>;
  getMode(): 'local' | 'cloud';

  getCurrentUser(): Promise<User | null>;
  isAuthenticated(): boolean;

  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;

  getSession(): Promise<Session | null>;
  refreshSession(): Promise<Session | null>;
  onAuthStateChange(callback: AuthStateCallback): () => void;

  deleteAccount(): Promise<void>;
}
```

### Production Extensions

A complete cloud auth flow requires additional methods beyond the core interface above. These are present in the actual MatchOps-Local `AuthService` interface:

| Method | Purpose |
|--------|---------|
| `verifySignUpOtp(email, token)` | Confirm email after sign-up via 6-digit OTP code |
| `resendSignUpConfirmation(email)` | Resend the sign-up confirmation email |
| `verifyPasswordResetOtp(email, token)` | Verify password reset OTP to establish recovery session |
| `updatePassword(newPassword)` | Set new password after verifying reset OTP |
| `deleteAccount()` | Permanently delete user account (GDPR compliance) |
| `recordConsent(policyVersion, metadata?)` | Record ToS/Privacy Policy consent for GDPR audit trail |
| `hasConsentedToVersion(policyVersion)` | Check if user has consented to current policy version |
| `getLatestConsent()` | Get most recent consent record (for re-consent detection) |
| `getMarketingConsentStatus()` | Get current marketing consent status |
| `setMarketingConsent(granted)` | Grant or withdraw marketing consent |

---

## 2. LocalAuthService — The No-Op

```typescript
// src/auth/LocalAuthService.ts

import { LOCAL_USER } from '@/interfaces/AuthTypes';
import { NotSupportedError } from '@/interfaces/DataStoreErrors';

export class LocalAuthService implements AuthService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  getMode(): 'local' | 'cloud' { return 'local'; }

  async getCurrentUser(): Promise<User | null> {
    return LOCAL_USER;  // Frozen constant — no allocation
  }

  isAuthenticated(): boolean { return true; }  // Always authed in local

  // All auth actions throw NotSupportedError
  async signUp(): Promise<AuthResult> { throw new NotSupportedError('signUp', 'local'); }
  async signIn(): Promise<AuthResult> { throw new NotSupportedError('signIn', 'local'); }
  async signOut(): Promise<void> { /* no-op */ }
  async resetPassword(): Promise<void> { throw new NotSupportedError('resetPassword', 'local'); }

  onAuthStateChange(): () => void { return () => {}; }  // No events in local
}
```

**LOCAL_USER constant**:
```typescript
export const LOCAL_USER: Readonly<User> = Object.freeze({
  id: 'local',
  email: null,
  isAnonymous: true,
  displayName: 'Local User',
});
```

---

## 3. SupabaseAuthService — Key Patterns

### Auth Event Mapping

```typescript
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
    case 'PASSWORD_RECOVERY':
      return 'signed_in';  // Don't sign out during recovery!
    default:
      // CRITICAL: Unknown events must NOT default to 'signed_out'
      // New Supabase versions may add events — treating them as sign-out
      // causes login loops. Log and ignore instead.
      // Neutral state — won't trigger sign-in side effects or sign-out
      logger.warn(`Unknown auth event: ${event}`);
      return 'user_updated';
  }
}
```

### Password Validation (Client-Side UX)

```typescript
const PASSWORD_MIN_LENGTH = 12;

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  let complexity = 0;
  if (/[a-z]/.test(password)) complexity++;
  if (/[A-Z]/.test(password)) complexity++;
  if (/[0-9]/.test(password)) complexity++;
  if (/[^a-zA-Z0-9]/.test(password)) complexity++;

  if (complexity < 3) {
    return 'Password must contain at least 3 of: lowercase, uppercase, number, special character';
  }

  return null;  // Valid
}
```

**Key trap**: Client validation is UX only. Supabase Auth enforces server-side rules. Keep them in sync or users see confusing errors.

### Network Retry for Auth Operations

```typescript
async signUp(email: string, password: string): Promise<AuthResult> {
  // Wrap with retry for transient network errors
  return withRetry(async () => {
    const { data, error } = await this.supabase.auth.signUp({ email, password });
    if (error) throw this.classifyAuthError(error);
    return this.mapAuthResult(data);
  });
}
```

---

## 4. AuthProvider Context

```typescript
// src/contexts/AuthProvider.tsx

'use client';

interface AuthContextValue {
  // State
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mode: 'local' | 'cloud';
  needsReConsent: boolean;
  // Timeout recovery and sign-out state tracking:
  initTimedOut: boolean;       // True when auth init timed out (user may retry)
  isSigningOut: boolean;       // True during sign-out (prevents UI interaction)
  retryAuthInit: () => void;   // Retry auth initialization after timeout

  // Actions
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; confirmationRequired?: boolean; existingUser?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  deleteAccount: () => Promise<{ error?: string }>;
  recordConsent: () => Promise<{ error?: string }>;
  acceptReConsent: () => Promise<{ error?: string }>;
  verifySignUpOtp: (email: string, token: string) => Promise<{ error?: string; confirmationRequired?: boolean; existingUser?: boolean }>;
  resendSignUpConfirmation: (email: string) => Promise<{ error?: string }>;
  verifyPasswordResetOtp: (email: string, token: string) => Promise<{ error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth service on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const service = isCloudAvailable()
        ? new SupabaseAuthService()
        : new LocalAuthService();

      await service.initialize();

      if (cancelled) return;

      setAuthService(service);
      const currentUser = await service.getCurrentUser();
      setUser(currentUser);
      setIsLoading(false);

      // Subscribe to auth state changes (cloud only)
      service.onAuthStateChange((state, sess) => {
        if (state === 'signed_out') {
          setUser(null);
          setSession(null);
        } else if (sess?.user) {
          setUser(sess.user);
          setSession(sess);
        }
      });
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Expose actions that return { error?: string } for UI consumption
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await authService!.signIn(email, password);
      setUser(result.user);
      setSession(result.session);
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed' };
    }
  }, [authService]);

  // ... signUp, signOut, resetPassword follow same pattern

  const value = useMemo(() => ({
    user,
    session,
    isAuthenticated: !!user,
    isLoading,
    mode: authService?.getMode() ?? 'local',
    signIn,
    signUp,
    signOut: signOutFn,
    resetPassword: resetPasswordFn,
    deleteAccount: deleteAccountFn,
  }), [user, session, isLoading, authService, signIn, signUp, signOutFn, resetPasswordFn, deleteAccountFn]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
```

**Key patterns**:
1. **Auth service determined by `isCloudAvailable()`** — checks env vars, not runtime state
2. **Actions return `{ error?: string }`** — UI never catches exceptions directly
3. **`useMemo` on context value** — prevents all consumers from re-rendering on every provider render
4. **Auth state change subscription** — Supabase fires events for token refresh, sign out, etc.

---

## 5. Auth Hook

```typescript
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

---

## 6. Provider Nesting Order

```tsx
// src/app/layout.tsx — the EXACT nesting order

<I18nInitializer>                {/* 1. Translations (used by everything) */}
  <ServiceWorkerRegistration />  {/* 2. PWA lifecycle (no context dependency) */}
  <InstallPrompt />              {/* 3. PWA install (no context dependency) */}
  <QueryProvider>                {/* 4. React Query (must wrap auth) */}
    <AuthProvider>               {/* 5. Auth (may use React Query) */}
      <SubscriptionProvider>     {/* 6. Subscription (needs auth) */}
        <ClientWrapper>          {/* 7. Wraps client-only providers: */}
          {/* └─ ToastProvider   */}{/* 7a. Toast notifications */}
          {/*   └─ PremiumProvider */}{/* 7b. Premium feature gates */}
          {/*     └─ UpgradePromptManager */}{/* 7c. Upgrade prompts */}
          {children}
        </ClientWrapper>
        <ReConsentModal />       {/* 8. Re-consent (sibling, needs auth) */}
        <MarketingConsentPrompt />{/* 9. Marketing consent (sibling, needs auth) */}
      </SubscriptionProvider>
    </AuthProvider>
  </QueryProvider>
</I18nInitializer>
```

**Why this order**:
- `I18nInitializer` outermost: auth error messages need translations
- `QueryProvider` before `AuthProvider`: auth init may trigger queries
- `AuthProvider` before `SubscriptionProvider`: subscription checks need user
- `ClientWrapper` contains `ToastProvider` > `PremiumProvider` > `UpgradePromptManager` (not directly in layout.tsx)
- `ReConsentModal` and `MarketingConsentPrompt` are siblings of `ClientWrapper`, inside `SubscriptionProvider`

---

## 7. Auth-Gated Routes

For pages that require authentication:

```typescript
// src/components/AuthGuard.tsx

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mode } = useAuth();

  // Local mode: always pass through
  if (mode === 'local') return <>{children}</>;

  // Cloud mode: wait for auth to initialize
  if (isLoading) return <LoadingSpinner />;

  // Not authenticated: show login
  if (!isAuthenticated) return <LoginScreen />;

  return <>{children}</>;
}
```

---

## 8. Factory Pattern for Auth + DataStore

```typescript
// src/datastore/factory.ts

let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = isCloudAvailable()
      ? new SupabaseAuthService()
      : new LocalAuthService();
  }
  return authServiceInstance;
}

export async function getDataStore(userId?: string): Promise<DataStore> {
  // Mode determines which DataStore implementation to use
  const mode = getBackendMode();
  // userId determines which database to use (user-scoped vs legacy)
  // ...
}
```

**Key insight**: Auth service is chosen by `isCloudAvailable()` (env vars exist?). DataStore is chosen by `getBackendMode()` (which mode is active?). These are independent decisions.

---

## Traps

1. **Unknown auth events must NOT default to `signed_out`**: New Supabase versions add events. Treating unknowns as sign-out causes login loops. Default to `user_updated` (neutral — won't trigger sign-in side effects or sign-out) and log a warning.

2. **Auth is independent of data mode**: User can be authenticated (Supabase auth) while using local storage. Don't couple them.

3. **`useMemo` the context value**: Without memoization, every consumer re-renders on every provider render. With 10+ components consuming auth, this creates noticeable performance issues.

4. **Init timeout**: Add a timeout to auth initialization. If Supabase is unreachable, don't block the app forever:
   ```typescript
   const INIT_TIMEOUT_MS = 15_000;
   const initPromise = service.initialize();
   const timeoutPromise = new Promise((_, reject) =>
     setTimeout(() => reject(new Error('Auth init timeout')), INIT_TIMEOUT_MS)
   );
   await Promise.race([initPromise, timeoutPromise]);
   ```

5. **Error messages must be user-safe**: Never expose "Supabase", "PostgreSQL", or implementation details in error messages shown to users.
