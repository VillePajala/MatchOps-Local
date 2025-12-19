/**
 * LocalAuthService Tests
 *
 * Tests for the local-only authentication service.
 */

import { LocalAuthService } from './LocalAuthService';
import { LOCAL_USER } from '@/interfaces/AuthTypes';
import { NotSupportedError } from '@/interfaces/DataStoreErrors';

describe('LocalAuthService', () => {
  let authService: LocalAuthService;

  beforeEach(() => {
    authService = new LocalAuthService();
  });

  // ==========================================================================
  // LIFECYCLE TESTS
  // ==========================================================================
  describe('Lifecycle', () => {
    it('should initialize successfully', async () => {
      await expect(authService.initialize()).resolves.not.toThrow();
      expect(authService.isInitialized()).toBe(true);
    });

    it('should return local mode', () => {
      expect(authService.getMode()).toBe('local');
    });

    it('should not be initialized before initialize() is called', () => {
      expect(authService.isInitialized()).toBe(false);
    });
  });

  // ==========================================================================
  // USER STATE TESTS
  // ==========================================================================
  describe('User State', () => {
    it('should return LOCAL_USER constant', async () => {
      const user = await authService.getCurrentUser();
      expect(user).toBe(LOCAL_USER);
      expect(user?.id).toBe('local');
      expect(user?.email).toBeNull();
      expect(user?.isAnonymous).toBe(true);
    });

    it('should always be authenticated in local mode', () => {
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should return same LOCAL_USER object (no allocation)', async () => {
      const user1 = await authService.getCurrentUser();
      const user2 = await authService.getCurrentUser();
      expect(user1).toBe(user2);
    });
  });

  // ==========================================================================
  // AUTHENTICATION TESTS (Not supported)
  // ==========================================================================
  describe('Authentication (Not Supported)', () => {
    it('should throw NotSupportedError on signUp', async () => {
      await expect(authService.signUp('test@example.com', 'password'))
        .rejects.toThrow(NotSupportedError);
    });

    it('should throw NotSupportedError with correct details on signUp', async () => {
      try {
        await authService.signUp('test@example.com', 'password');
        fail('Expected NotSupportedError');
      } catch (error) {
        expect(error).toBeInstanceOf(NotSupportedError);
        expect((error as NotSupportedError).operation).toBe('signUp');
        expect((error as NotSupportedError).backend).toBe('local');
      }
    });

    it('should throw NotSupportedError on signIn', async () => {
      await expect(authService.signIn('test@example.com', 'password'))
        .rejects.toThrow(NotSupportedError);
    });

    it('should not throw on signOut (no-op)', async () => {
      await expect(authService.signOut()).resolves.not.toThrow();
    });

    it('should throw NotSupportedError on resetPassword', async () => {
      await expect(authService.resetPassword('test@example.com'))
        .rejects.toThrow(NotSupportedError);
    });
  });

  // ==========================================================================
  // SESSION MANAGEMENT TESTS
  // ==========================================================================
  describe('Session Management', () => {
    it('should return null session in local mode', async () => {
      const session = await authService.getSession();
      expect(session).toBeNull();
    });

    it('should throw NotSupportedError on refreshSession', async () => {
      await expect(authService.refreshSession())
        .rejects.toThrow(NotSupportedError);
    });

    it('should return no-op unsubscribe function from onAuthStateChange', () => {
      const callback = jest.fn();
      const unsubscribe = authService.onAuthStateChange(callback);

      expect(typeof unsubscribe).toBe('function');
      expect(callback).not.toHaveBeenCalled();

      // Calling unsubscribe should not throw
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  // ==========================================================================
  // INTERFACE CONTRACT TESTS
  // ==========================================================================
  describe('Interface Contract', () => {
    /**
     * Verify LocalAuthService implements all AuthService methods.
     * This catches missing methods at runtime.
     */
    it('should implement all AuthService methods', () => {
      const methods = [
        'initialize',
        'getMode',
        'getCurrentUser',
        'isAuthenticated',
        'signUp',
        'signIn',
        'signOut',
        'resetPassword',
        'getSession',
        'refreshSession',
        'onAuthStateChange',
      ];

      for (const method of methods) {
        expect(typeof (authService as unknown as Record<string, unknown>)[method]).toBe('function');
      }
    });
  });
});
