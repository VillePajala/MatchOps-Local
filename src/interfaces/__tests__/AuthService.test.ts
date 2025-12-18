/**
 * AuthService Interface Smoke Tests
 *
 * Verifies exports and type checking for the AuthService abstraction layer.
 * Part of Phase 2 backend abstraction (PR #5).
 */

import type {
  AuthService,
  User,
  Session,
  AuthResult,
  AuthErrorInfo,
  AuthErrorCode,
  AuthState,
  AuthStateCallback,
  SignUpOptions,
  SignInOptions,
} from '@/interfaces';
import { LOCAL_USER } from '@/interfaces';

describe('AuthService Interface Exports', () => {
  describe('type exports', () => {
    it('should export AuthService interface', () => {
      // Type-only test - verifies types compile
      const _typeCheck: AuthService = {} as AuthService;
      expect(_typeCheck).toBeDefined();
    });

    it('should export User interface', () => {
      const _user: User = {
        id: 'test',
        email: 'test@example.com',
        isAnonymous: false,
      };
      expect(_user).toBeDefined();
    });

    it('should export Session interface', () => {
      const _session: Session = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: '2025-01-01T00:00:00Z',
        tokenType: 'bearer',
        user: { id: 'test', email: null, isAnonymous: true },
      };
      expect(_session).toBeDefined();
    });

    it('should export AuthResult interface', () => {
      const _result: AuthResult = {
        user: { id: 'test', email: null, isAnonymous: true },
        session: null,
      };
      expect(_result).toBeDefined();
    });

    it('should export AuthErrorInfo interface', () => {
      const _error: AuthErrorInfo = {
        code: 'invalid_credentials',
        message: 'Invalid credentials',
      };
      expect(_error).toBeDefined();
    });

    it('should export AuthErrorCode type', () => {
      const _code: AuthErrorCode = 'session_expired';
      expect(_code).toBe('session_expired');
    });

    it('should export AuthState type', () => {
      const _state: AuthState = 'signed_in';
      expect(_state).toBe('signed_in');
    });

    it('should export AuthStateCallback type', () => {
      const _callback: AuthStateCallback = (_state, _session) => {
        // Callback implementation
      };
      expect(_callback).toBeDefined();
    });

    it('should export SignUpOptions interface', () => {
      const _options: SignUpOptions = {
        metadata: { role: 'coach' },
        redirectTo: '/dashboard',
      };
      expect(_options).toBeDefined();
    });

    it('should export SignInOptions interface', () => {
      const _options: SignInOptions = {
        rememberMe: true,
      };
      expect(_options).toBeDefined();
    });
  });

  describe('type validation', () => {
    it('should accept a valid AuthService implementation', () => {
      const localUser: User = { ...LOCAL_USER };
      const mockAuth: AuthService = {
        initialize: async () => {},
        getMode: () => 'local',
        getCurrentUser: async () => localUser,
        isAuthenticated: () => true,
        signUp: async () => ({ user: localUser, session: null }),
        signIn: async () => ({ user: localUser, session: null }),
        signOut: async () => {},
        resetPassword: async () => {},
        getSession: async () => null,
        refreshSession: async () => null,
        onAuthStateChange: () => () => {},
      };

      expect(mockAuth).toBeDefined();
    });

    it('should document all AuthErrorCode values', () => {
      const authErrorCodeMap: Record<AuthErrorCode, true> = {
        invalid_credentials: true,
        user_not_found: true,
        email_taken: true,
        weak_password: true,
        invalid_email: true,
        email_not_confirmed: true,
        session_expired: true,
        network_error: true,
        rate_limited: true,
        not_supported: true,
        unknown: true,
      };

      expect(authErrorCodeMap.unknown).toBe(true);
    });

    it('should restrict Session.tokenType to bearer', () => {
      const tokenType: Session['tokenType'] = 'bearer';
      expect(tokenType).toBe('bearer');

      // @ts-expect-error - tokenType should only allow 'bearer' unless extended
      const _invalidTokenType: Session['tokenType'] = 'mac';
      expect(_invalidTokenType).toBeDefined();
    });
  });

  describe('LOCAL_USER constant', () => {
    it('should export LOCAL_USER with correct values', () => {
      expect(LOCAL_USER).toEqual({
        id: 'local',
        email: null,
        isAnonymous: true,
        displayName: 'Local User',
      });
    });

    it('should be frozen to prevent mutation', () => {
      expect(Object.isFrozen(LOCAL_USER)).toBe(true);
    });

    it('should not allow property modification', () => {
      const original = LOCAL_USER.id;

      // TypeScript prevents this at compile time (Readonly<User>)
      // This test verifies runtime protection via Object.freeze.
      // In non-strict mode, assigning to a frozen object fails silently
      // instead of throwing, so assert value remains unchanged.
      try {
        // @ts-expect-error - Testing runtime immutability
        LOCAL_USER.id = 'modified';
      } catch {
        // In strict mode, this throws a TypeError.
      }

      expect(LOCAL_USER.id).toBe(original);
    });
  });
});
