/**
 * AuthModal - Authentication modal for signing in/up from any mode.
 *
 * Issue #336: Allows users to sign in while in local mode.
 * Authentication is independent of data storage mode (auth ≠ sync).
 *
 * Features:
 * - Sign in with email/password
 * - Sign up with email/password (with GDPR consent)
 * - Password reset via email
 * - Can be shown from WelcomeScreen or Settings
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md
 */

'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { HiOutlineXMark } from 'react-icons/hi2';
import { useAuth } from '@/contexts/AuthProvider';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { isNetworkErrorMessage, normalizeEmail } from '@/utils/authHelpers';
import { isAndroid } from '@/utils/platform';
import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';

type AuthMode = 'signIn' | 'signUp' | 'resetPassword';

export interface AuthModalProps {
  /** Initial mode to show */
  initialMode?: AuthMode;
  /** Called when auth is successful (user signed in or signed up) */
  onSuccess: () => void;
  /** Called when user cancels/closes the modal */
  onCancel: () => void;
  /** Whether to allow registration (false on desktop - must subscribe via Android app) */
  allowRegistration?: boolean;
}

/**
 * Authentication modal component.
 *
 * Can be used from WelcomeScreen or Settings to sign in/up
 * without changing the data storage mode.
 */
export default function AuthModal({
  initialMode = 'signIn',
  onSuccess,
  onCancel,
  allowRegistration,
}: AuthModalProps) {
  const { t } = useTranslation();
  const { signIn, signUp, resetPassword } = useAuth();
  const modalRef = useRef<HTMLDivElement>(null);

  // Platform-enforced registration: only allow on Android (Play Billing required)
  // If prop is explicitly set, respect it; otherwise default based on platform
  const effectiveAllowRegistration = useMemo(() => {
    if (allowRegistration !== undefined) {
      return allowRegistration;
    }
    // Default: only allow registration on Android
    return isAndroid();
  }, [allowRegistration]);

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // GDPR consent checkbox for sign up
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);

  // Focus trap
  useFocusTrap(modalRef, true);

  // Handle Escape key
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [isLoading, onCancel]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    // Normalize email (trim and lowercase) for consistent handling
    const normalizedEmail = normalizeEmail(email);

    try {
      if (mode === 'signUp') {
        // Validate consent checkbox
        if (!hasAcceptedTerms) {
          setError(t('auth.consentRequired', 'You must accept the Terms of Service and Privacy Policy'));
          setIsLoading(false);
          return;
        }
        // Validate passwords match
        if (password !== confirmPassword) {
          setError(t('auth.passwordMismatch', 'Passwords do not match'));
          setIsLoading(false);
          return;
        }
        // Password strength is validated in SupabaseAuthService
        const result = await signUp(normalizedEmail, password);
        if (result.error) {
          setError(result.error);
          // Log network errors for production monitoring (non-user-error)
          if (isNetworkErrorMessage(result.error)) {
            logger.warn('[AuthModal] Network error during sign up:', result.error);
          }
        } else if (result.confirmationRequired) {
          setSuccess(t('auth.checkEmail', 'Check your email to confirm your account'));
          setMode('signIn');
          // Clear password fields
          setPassword('');
          setConfirmPassword('');
        } else {
          // Success - user signed up and logged in
          onSuccess();
        }
      } else if (mode === 'signIn') {
        const result = await signIn(normalizedEmail, password);
        if (result.error) {
          setError(result.error);
          // Log network errors for production monitoring (non-user-error)
          if (isNetworkErrorMessage(result.error)) {
            logger.warn('[AuthModal] Network error during sign in:', result.error);
          }
        } else {
          // Success - user signed in
          onSuccess();
        }
      } else if (mode === 'resetPassword') {
        const result = await resetPassword(normalizedEmail);
        if (result.error) {
          setError(result.error);
          // Log network errors for production monitoring (non-user-error)
          if (isNetworkErrorMessage(result.error)) {
            logger.warn('[AuthModal] Network error during password reset:', result.error);
          }
        } else {
          setSuccess(t('auth.resetEmailSent', 'Check your email for reset instructions'));
          setMode('signIn');
        }
      }
    } catch (error) {
      // Handle thrown exceptions (NetworkError, AuthError, NotInitializedError, etc.)
      const errorMessage = error instanceof Error ? error.message : t('auth.unexpectedError', 'An unexpected error occurred');
      setError(errorMessage);
      // Log unexpected exceptions for production monitoring
      logger.error('[AuthModal] Unexpected error during auth:', error);
      // Track in Sentry for production visibility
      Sentry.captureException(error, {
        tags: { flow: `auth-modal-${mode}` },
        level: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [email, password, confirmPassword, mode, hasAcceptedTerms, signIn, signUp, resetPassword, onSuccess, t]);

  const switchMode = useCallback((newMode: AuthMode) => {
    // Prevent switching to signUp if registration is not allowed (non-Android)
    if (newMode === 'signUp' && !effectiveAllowRegistration) {
      return;
    }
    setMode(newMode);
    setError(null);
    setSuccess(null);
    // Keep email but clear passwords and consent
    setPassword('');
    setConfirmPassword('');
    setHasAcceptedTerms(false);
  }, [effectiveAllowRegistration]);

  // Styles
  const primaryButtonStyle =
    'w-full h-12 px-4 py-2 rounded-md text-base font-bold transition-all duration-200 ' +
    'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900 ' +
    'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)] ' +
    'hover:from-indigo-600 hover:to-indigo-700 hover:shadow-lg active:scale-[0.98] active:shadow-inner ' +
    'border border-white/10 shadow-md [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.1),0_4px_6px_-1px_rgba(0,0,0,0.3)] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-indigo-500 disabled:hover:to-indigo-600 disabled:active:scale-100';

  const linkButtonStyle = 'text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors';

  const inputStyle =
    'w-full h-12 px-4 rounded-md bg-slate-800 border border-slate-700 text-white ' +
    'placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative w-full max-w-md mx-4 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h2 id="auth-modal-title" className="text-lg font-semibold text-slate-100">
            {mode === 'signIn' && t('auth.signIn', 'Sign In')}
            {mode === 'signUp' && t('auth.createAccount', 'Create Account')}
            {mode === 'resetPassword' && t('auth.resetPassword', 'Reset Password')}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            aria-label={t('common.close', 'Close')}
          >
            <HiOutlineXMark className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {/* Subtitle */}
          <p className="text-slate-400 text-center mb-6 text-sm">
            {mode === 'signIn' && t('auth.signInSubtitle', 'Sign in to sync your data across devices')}
            {mode === 'signUp' && t('auth.signUpSubtitle', 'Create an account to enable cloud sync')}
            {mode === 'resetPassword' && t('auth.resetSubtitle', 'Enter your email to receive reset instructions')}
          </p>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-900/50 border border-red-500/50 text-red-200 text-sm">
              <p>{error}</p>
              {isNetworkErrorMessage(error) && (
                <p className="mt-1 text-red-300/80">
                  {t('auth.networkErrorHint', 'Please check your internet connection and try again.')}
                </p>
              )}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-md bg-green-900/50 border border-green-500/50 text-green-200 text-sm">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder={t('auth.email', 'Email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputStyle}
              required
              autoComplete="email"
              disabled={isLoading}
              autoFocus
            />

            {mode !== 'resetPassword' && (
              <input
                type="password"
                placeholder={t('auth.password', 'Password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputStyle}
                required
                autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                disabled={isLoading}
              />
            )}

            {mode === 'signUp' && (
              <>
                <input
                  type="password"
                  placeholder={t('auth.confirmPassword', 'Confirm Password')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputStyle}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                <p className="text-slate-500 text-xs">
                  {t('auth.passwordRequirements', 'Password must be at least 12 characters and include 3 of: uppercase, lowercase, numbers, special characters.')}
                </p>

                {/* GDPR Consent Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={hasAcceptedTerms}
                    onChange={(e) => setHasAcceptedTerms(e.target.checked)}
                    disabled={isLoading}
                    className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                  />
                  <span className="text-slate-400 text-xs leading-relaxed group-hover:text-slate-300 transition-colors">
                    {t('auth.termsConsent', 'I have read and agree to the')}{' '}
                    <Link
                      href="/terms"
                      target="_blank"
                      className="text-indigo-400 hover:text-indigo-300 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t('auth.termsLink', 'Terms of Service')}
                    </Link>{' '}
                    {t('auth.and', 'and')}{' '}
                    <Link
                      href="/privacy-policy"
                      target="_blank"
                      className="text-indigo-400 hover:text-indigo-300 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t('auth.privacyLink', 'Privacy Policy')}
                    </Link>
                  </span>
                </label>
              </>
            )}

            <button type="submit" className={primaryButtonStyle} disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('common.loading', 'Loading...')}
                </span>
              ) : (
                <>
                  {mode === 'signIn' && t('auth.signIn', 'Sign In')}
                  {mode === 'signUp' && t('auth.createAccount', 'Create Account')}
                  {mode === 'resetPassword' && t('auth.sendResetEmail', 'Send Reset Email')}
                </>
              )}
            </button>
          </form>

          {/* Mode switching links */}
          <div className="mt-6 flex flex-col items-center gap-2">
            {mode === 'signIn' && (
              <>
                <button type="button" onClick={() => switchMode('resetPassword')} className={linkButtonStyle}>
                  {t('auth.forgotPassword', 'Forgot password?')}
                </button>
                {effectiveAllowRegistration ? (
                  <div className="text-slate-500 text-sm">
                    {t('auth.noAccount', "Don't have an account?")}{' '}
                    <button type="button" onClick={() => switchMode('signUp')} className={linkButtonStyle}>
                      {t('auth.signUpLink', 'Sign up')}
                    </button>
                  </div>
                ) : (
                  // Non-Android: No registration - must subscribe via Android app
                  <div className="mt-4 p-3 rounded-lg bg-slate-700/50 border border-slate-600/50 text-center">
                    <p className="text-slate-400 text-sm">
                      {t('auth.androidOnlyRegistration', "Don't have an account? Subscribe via the Android app.")}
                    </p>
                    <a
                      href="https://play.google.com/store/apps/details?id=com.matchops.local"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 text-sm hover:text-amber-300 inline-flex items-center gap-1 mt-1"
                    >
                      {t('auth.getAndroidApp', 'Get on Google Play')}
                      <span aria-hidden="true">→</span>
                    </a>
                  </div>
                )}
              </>
            )}
            {mode === 'signUp' && effectiveAllowRegistration && (
              <div className="text-slate-500 text-sm">
                {t('auth.hasAccount', 'Already have an account?')}{' '}
                <button type="button" onClick={() => switchMode('signIn')} className={linkButtonStyle}>
                  {t('auth.signInLink', 'Sign in')}
                </button>
              </div>
            )}
            {mode === 'resetPassword' && (
              <button type="button" onClick={() => switchMode('signIn')} className={linkButtonStyle}>
                {t('auth.backToSignIn', 'Back to sign in')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
