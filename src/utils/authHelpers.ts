/**
 * Auth Helper Utilities
 *
 * Shared utilities for authentication components.
 * Used by AuthModal, LoginScreen, and other auth-related components.
 */

import type { TFunction } from 'i18next';

/**
 * Check if an error message indicates a network problem.
 * Used to provide more helpful feedback to users when network issues occur.
 *
 * @param message - The error message to check
 * @returns true if the message indicates a network-related error
 */
export function isNetworkErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('offline') ||
    lower.includes('connection') ||
    lower.includes('fetch') ||
    lower.includes('timeout')
  );
}

/**
 * Normalize email for consistent handling.
 * Trims whitespace and converts to lowercase.
 *
 * @param email - The email to normalize
 * @returns Normalized email string
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Map of known English auth error messages to i18n translation keys.
 * These messages originate from SupabaseAuthService and AuthProvider.
 */
const AUTH_ERROR_MAP: Record<string, string> = {
  // Password validation (SupabaseAuthService.validatePassword)
  'Password must be at least 12 characters': 'auth.errors.passwordTooShort',
  'Password must contain at least 3 of: uppercase, lowercase, number, special character': 'auth.errors.passwordTooWeak',
  // Email validation (SupabaseAuthService.validateEmail)
  'Invalid email format': 'auth.errors.invalidEmail',
  'Email address is too long': 'auth.errors.emailTooLong',
  // Concurrent request guard
  'Authentication already in progress. Please wait.': 'auth.errors.authInProgress',
  // Sign up errors
  'This email is already registered': 'auth.errors.emailAlreadyRegistered',
  'Sign up failed. Please try again.': 'auth.errors.signUpFailed',
  'Sign up failed: network error': 'auth.errors.networkError',
  // Sign in errors
  'Invalid email or password. If you recently signed up, please check your email for confirmation.': 'auth.errors.invalidCredentials',
  'Sign in failed. Please try again.': 'auth.errors.signInFailed',
  'Sign in failed: network error': 'auth.errors.networkError',
  'Sign in failed: invalid response': 'auth.errors.signInFailed',
  // Password reset errors
  'Password reset failed. Please try again.': 'auth.errors.resetFailed',
  'Password reset failed: network error': 'auth.errors.networkError',
  // OTP verification errors
  'Verification code is invalid or has expired. Please request a new one.': 'auth.errors.otpInvalid',
  'Verification failed. Please try again.': 'auth.errors.verificationFailed',
  'Verification failed: network error': 'auth.errors.networkError',
  'Verification failed: no session returned': 'auth.errors.verificationFailed',
  // Resend confirmation errors
  'Please wait before requesting another code.': 'auth.errors.resendRateLimited',
  'Failed to resend confirmation email. Please try again.': 'auth.errors.resendFailed',
  'Resend failed: network error': 'auth.errors.networkError',
  // Supabase rate limiting (429)
  'Too many requests. Please wait a few minutes and try again.': 'auth.errors.supabaseRateLimited',
  // AuthProvider fallbacks
  'Auth not initialized': 'auth.errors.notInitialized',
  'Sign in failed': 'auth.errors.signInFailed',
  'Sign up failed': 'auth.errors.signUpFailed',
  'Reset failed': 'auth.errors.resetFailed',
  'Verification failed': 'auth.errors.verificationFailed',
  'Failed to resend': 'auth.errors.resendFailed',
};

/**
 * Translate a known auth error message to the user's language.
 *
 * SupabaseAuthService throws errors with hardcoded English messages (service layer
 * shouldn't depend on i18n). This function maps those known messages to translated
 * strings using i18next at the UI layer.
 *
 * @param message - The English error message from SupabaseAuthService/AuthProvider
 * @param t - The i18next translation function
 * @returns Translated error message, or the original message if no translation found
 */
export function translateAuthError(message: string, t: TFunction): string {
  // Exact match lookup
  const key = AUTH_ERROR_MAP[message];
  if (key) {
    return t(key, message);
  }

  // Pattern: "Too many failed attempts. Please wait X seconds before trying again."
  const rateMatch = message.match(/wait (\d+) seconds/i);
  if (rateMatch) {
    return t('auth.errors.rateLimited', {
      seconds: rateMatch[1],
      defaultValue: message,
    });
  }

  // Pattern: any remaining network error messages
  if (message.toLowerCase().includes('network error')) {
    return t('auth.errors.networkError', message);
  }

  // No match — return original English message as fallback
  return message;
}
