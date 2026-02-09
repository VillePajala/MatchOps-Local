/**
 * Tests for authHelpers utility module.
 *
 * Covers:
 * - translateAuthError: exact match lookup, rate-limit pattern, network error fallback, unknown fallback
 * - isNetworkErrorMessage: positive and negative keyword checks
 * - normalizeEmail: trimming and lowercasing
 *
 * @critical - Auth error translation directly affects user-facing error messages
 */

import {
  translateAuthError,
  isNetworkErrorMessage,
  normalizeEmail,
} from '../authHelpers';

// Simple mock for i18next TFunction: returns the fallback/defaultValue
const t = jest.fn(
  (key: string, fallbackOrOptions?: string | Record<string, unknown>) => {
    if (typeof fallbackOrOptions === 'string') return fallbackOrOptions;
    if (
      fallbackOrOptions &&
      typeof fallbackOrOptions === 'object' &&
      'defaultValue' in fallbackOrOptions
    ) {
      return fallbackOrOptions.defaultValue as string;
    }
    return key;
  }
);

describe('authHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // translateAuthError
  // ---------------------------------------------------------------
  describe('translateAuthError', () => {
    describe('exact match entries from AUTH_ERROR_MAP', () => {
      const exactMatchCases: Array<{ message: string; expectedKey: string }> = [
        // Password validation
        { message: 'Password must be at least 12 characters', expectedKey: 'auth.errors.passwordTooShort' },
        { message: 'Password must contain at least 3 of: uppercase, lowercase, number, special character', expectedKey: 'auth.errors.passwordTooWeak' },
        // Email validation
        { message: 'Invalid email format', expectedKey: 'auth.errors.invalidEmail' },
        { message: 'Email address is too long', expectedKey: 'auth.errors.emailTooLong' },
        // Concurrent request guard
        { message: 'Authentication already in progress. Please wait.', expectedKey: 'auth.errors.authInProgress' },
        // Sign up errors
        { message: 'This email is already registered', expectedKey: 'auth.errors.emailAlreadyRegistered' },
        { message: 'Sign up failed. Please try again.', expectedKey: 'auth.errors.signUpFailed' },
        { message: 'Sign up failed: network error', expectedKey: 'auth.errors.networkError' },
        // Sign in errors
        { message: 'Invalid email or password. If you recently signed up, please check your email for confirmation.', expectedKey: 'auth.errors.invalidCredentials' },
        { message: 'Sign in failed. Please try again.', expectedKey: 'auth.errors.signInFailed' },
        { message: 'Sign in failed: network error', expectedKey: 'auth.errors.networkError' },
        { message: 'Sign in failed: invalid response', expectedKey: 'auth.errors.signInFailed' },
        // Password reset errors
        { message: 'Password reset failed. Please try again.', expectedKey: 'auth.errors.resetFailed' },
        { message: 'Password reset failed: network error', expectedKey: 'auth.errors.networkError' },
        // OTP verification errors
        { message: 'Verification code is invalid or has expired. Please request a new one.', expectedKey: 'auth.errors.otpInvalid' },
        { message: 'Verification failed. Please try again.', expectedKey: 'auth.errors.verificationFailed' },
        { message: 'Verification failed: network error', expectedKey: 'auth.errors.networkError' },
        { message: 'Verification failed: no session returned', expectedKey: 'auth.errors.verificationFailed' },
        // Resend confirmation errors
        { message: 'Please wait before requesting another code.', expectedKey: 'auth.errors.resendRateLimited' },
        { message: 'Failed to resend confirmation email. Please try again.', expectedKey: 'auth.errors.resendFailed' },
        { message: 'Resend failed: network error', expectedKey: 'auth.errors.networkError' },
        // Supabase rate limiting (429)
        { message: 'Too many requests. Please wait a few minutes and try again.', expectedKey: 'auth.errors.supabaseRateLimited' },
        // AuthProvider fallbacks
        { message: 'Auth not initialized', expectedKey: 'auth.errors.notInitialized' },
        { message: 'Sign in failed', expectedKey: 'auth.errors.signInFailed' },
        { message: 'Sign up failed', expectedKey: 'auth.errors.signUpFailed' },
        { message: 'Reset failed', expectedKey: 'auth.errors.resetFailed' },
        { message: 'Verification failed', expectedKey: 'auth.errors.verificationFailed' },
        { message: 'Failed to resend', expectedKey: 'auth.errors.resendFailed' },
      ];

      it.each(exactMatchCases)(
        'translates "$message" using key "$expectedKey"',
        ({ message, expectedKey }) => {
          translateAuthError(message, t as any);

          expect(t).toHaveBeenCalledWith(expectedKey, message);
        }
      );
    });

    describe('rate-limit pattern matching', () => {
      it('matches "Too many failed attempts. Please wait 30 seconds before trying again."', () => {
        const message = 'Too many failed attempts. Please wait 30 seconds before trying again.';
        translateAuthError(message, t as any);

        expect(t).toHaveBeenCalledWith('auth.errors.rateLimited', {
          seconds: '30',
          defaultValue: message,
        });
      });

      it('matches "Please wait 120 seconds before trying again"', () => {
        const message = 'Please wait 120 seconds before trying again';
        translateAuthError(message, t as any);

        expect(t).toHaveBeenCalledWith('auth.errors.rateLimited', {
          seconds: '120',
          defaultValue: message,
        });
      });

      it('extracts the seconds value correctly', () => {
        const message = 'Wait 5 seconds please';
        translateAuthError(message, t as any);

        expect(t).toHaveBeenCalledWith(
          'auth.errors.rateLimited',
          expect.objectContaining({ seconds: '5' })
        );
      });
    });

    describe('generic network error fallback', () => {
      it('matches a message containing "network error" (case insensitive)', () => {
        const message = 'Something went wrong: Network Error occurred';
        translateAuthError(message, t as any);

        expect(t).toHaveBeenCalledWith('auth.errors.networkError', message);
      });

      it('matches lowercase "network error"', () => {
        const message = 'network error while connecting';
        translateAuthError(message, t as any);

        expect(t).toHaveBeenCalledWith('auth.errors.networkError', message);
      });
    });

    describe('unknown error fallback', () => {
      it('returns the original message when no match is found', () => {
        const message = 'Something completely unexpected happened';
        const result = translateAuthError(message, t as any);

        expect(result).toBe(message);
        // t should NOT have been called since there was no match
        expect(t).not.toHaveBeenCalled();
      });

      it('returns empty string when given an empty string', () => {
        const result = translateAuthError('', t as any);

        expect(result).toBe('');
      });
    });

    describe('precedence: exact match wins over pattern match', () => {
      it('exact match takes precedence over network error pattern', () => {
        // "Sign in failed: network error" is in the exact map AND contains "network error"
        const message = 'Sign in failed: network error';
        translateAuthError(message, t as any);

        // Should use exact match key, not the generic network error fallback
        expect(t).toHaveBeenCalledTimes(1);
        expect(t).toHaveBeenCalledWith('auth.errors.networkError', message);
      });
    });
  });

  // ---------------------------------------------------------------
  // isNetworkErrorMessage
  // ---------------------------------------------------------------
  describe('isNetworkErrorMessage', () => {
    describe('returns true for network-related strings', () => {
      const networkMessages = [
        'Network error occurred',
        'You are offline',
        'Connection refused',
        'Failed to fetch',
        'Request timeout',
        'NETWORK failure',
        'Lost connection to server',
        'fetch failed: ECONNRESET',
        'The operation timed out (timeout)',
      ];

      it.each(networkMessages)('returns true for "%s"', (message) => {
        expect(isNetworkErrorMessage(message)).toBe(true);
      });
    });

    describe('returns false for non-network strings', () => {
      const nonNetworkMessages = [
        'Invalid email format',
        'Password too short',
        'User not found',
        'Rate limited',
        'Internal server error',
        'Something went wrong',
        '',
      ];

      it.each(nonNetworkMessages)('returns false for "%s"', (message) => {
        expect(isNetworkErrorMessage(message)).toBe(false);
      });
    });

    it('is case insensitive', () => {
      expect(isNetworkErrorMessage('NETWORK ERROR')).toBe(true);
      expect(isNetworkErrorMessage('Offline Mode')).toBe(true);
      expect(isNetworkErrorMessage('CONNECTION lost')).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // normalizeEmail
  // ---------------------------------------------------------------
  describe('normalizeEmail', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
    });

    it('converts to lowercase', () => {
      expect(normalizeEmail('User@EXAMPLE.COM')).toBe('user@example.com');
    });

    it('trims and lowercases combined', () => {
      expect(normalizeEmail('  Alice@Mail.Org  ')).toBe('alice@mail.org');
    });

    it('handles already normalized email', () => {
      expect(normalizeEmail('bob@test.com')).toBe('bob@test.com');
    });

    it('handles empty string', () => {
      expect(normalizeEmail('')).toBe('');
    });

    it('handles whitespace-only string', () => {
      expect(normalizeEmail('   ')).toBe('');
    });
  });
});
