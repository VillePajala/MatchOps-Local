/**
 * AuthForm - Shared authentication form component.
 *
 * Renders email/password form with sign in, sign up, and password reset modes.
 * After sign-up, shows OTP code verification (6-digit code from email).
 * Used by LoginScreen (full-page) and AuthModal (dialog overlay).
 *
 * Extracted to eliminate ~200 lines of duplication between LoginScreen and AuthModal.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthProvider';
import { isNetworkErrorMessage, normalizeEmail } from '@/utils/authHelpers';
import { AuthError, NetworkError } from '@/interfaces/DataStoreErrors';
import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';

export type AuthMode = 'signIn' | 'signUp' | 'resetPassword';

export interface AuthFormProps {
  /** Initial auth mode */
  initialMode?: AuthMode;
  /** Whether to allow registration (false hides sign-up option) */
  allowRegistration: boolean;
  /** Called on successful sign in or sign up */
  onSuccess?: () => void;
  /** Whether to autoFocus the email input */
  autoFocus?: boolean;
  /** Optional id for the title element (for aria-labelledby) */
  titleId?: string;
}

export default function AuthForm({
  initialMode = 'signIn',
  allowRegistration,
  onSuccess,
  autoFocus = false,
  titleId,
}: AuthFormProps) {
  const { t } = useTranslation();
  const { signIn, signUp, resetPassword, setMarketingConsent, verifySignUpOtp, resendSignUpConfirmation } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  // Password stored in React state (not refs) for controlled input validation.
  // State is acceptable here: the value is short-lived (cleared on mode switch
  // and after submission), never persisted, and React state is not more
  // accessible to XSS than a ref — both live in the same JS heap.
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // GDPR consent checkbox for sign up
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  // Marketing consent checkbox for sign up (unchecked by default, GDPR)
  const [wantsMarketing, setWantsMarketing] = useState(false);

  // OTP verification state (shown after successful sign-up)
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  // Track if marketing consent was desired (persists across sign-up → OTP flow)
  const [pendingWantsMarketing, setPendingWantsMarketing] = useState(false);

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
          if (isNetworkErrorMessage(result.error)) {
            logger.warn('[AuthForm] Network error during sign up:', result.error);
          }
        } else if (result.confirmationRequired) {
          if (result.existingUser) {
            // Possibly existing user — show generic message and go to sign-in
            setSuccess(t('auth.emailMayExist', 'If this email is not already registered, check your inbox for confirmation. If you already have an account, please sign in instead.'));
            setMode('signIn');
            setPassword('');
            setConfirmPassword('');
          } else {
            // New user — transition to OTP verification screen
            setPendingEmail(normalizedEmail);
            setPendingWantsMarketing(wantsMarketing);
            setPendingVerification(true);
            setPassword('');
            setConfirmPassword('');
          }
        } else {
          // Success - user signed up and logged in (auto-confirmed)
          // Record marketing consent if checkbox was checked (non-blocking)
          if (wantsMarketing) {
            setMarketingConsent(true).catch((err) => {
              logger.warn('[AuthForm] Failed to record marketing consent after sign-up:', err);
            });
          }
          onSuccess?.();
        }
      } else if (mode === 'signIn') {
        const result = await signIn(normalizedEmail, password);
        if (result.error) {
          setError(result.error);
          if (isNetworkErrorMessage(result.error)) {
            logger.warn('[AuthForm] Network error during sign in:', result.error);
          }
        } else {
          // Success - user signed in
          onSuccess?.();
        }
      } else if (mode === 'resetPassword') {
        const result = await resetPassword(normalizedEmail);
        if (result.error) {
          setError(result.error);
          if (isNetworkErrorMessage(result.error)) {
            logger.warn('[AuthForm] Network error during password reset:', result.error);
          }
        } else {
          setSuccess(t('auth.resetEmailSent', 'Check your email for reset instructions'));
          setMode('signIn');
        }
      }
    } catch (error) {
      // Handle thrown exceptions (NetworkError, AuthError, NotInitializedError, etc.)
      // Sanitize: AuthError/NetworkError messages are user-friendly, but fallback
      // AuthError(error.message) paths in SupabaseAuthService could leak Supabase/PostgreSQL
      // internals. Only pass through known safe error types; use generic message otherwise.
      const errorMessage = (error instanceof NetworkError || error instanceof AuthError)
        ? error.message
        : t('auth.unexpectedError', 'An unexpected error occurred');
      setError(errorMessage);
      logger.error('[AuthForm] Unexpected error during auth:', error);
      try {
        Sentry.captureException(error, {
          tags: { flow: `auth-form-${mode}` },
          level: 'error',
        });
      } catch {
        // Sentry failure must not affect auth error handling
      }
    } finally {
      setIsLoading(false);
    }
  }, [email, password, confirmPassword, mode, hasAcceptedTerms, wantsMarketing, signIn, signUp, resetPassword, setMarketingConsent, onSuccess, t]);

  const handleVerifyOtp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    const trimmedCode = otpCode.trim();
    if (!trimmedCode || trimmedCode.length !== 6) {
      setError(t('auth.otpInvalidLength', 'Please enter the 6-digit code from your email'));
      setIsLoading(false);
      return;
    }

    try {
      const result = await verifySignUpOtp(pendingEmail, trimmedCode);
      if (result.error) {
        setError(result.error);
      } else {
        // Success — user verified and logged in
        // Record marketing consent if checkbox was checked during sign-up (non-blocking)
        if (pendingWantsMarketing) {
          setMarketingConsent(true).catch((err) => {
            logger.warn('[AuthForm] Failed to record marketing consent after OTP verification:', err);
          });
        }
        onSuccess?.();
      }
    } catch (error) {
      const errorMessage = (error instanceof NetworkError || error instanceof AuthError)
        ? error.message
        : t('auth.unexpectedError', 'An unexpected error occurred');
      setError(errorMessage);
      logger.error('[AuthForm] OTP verification error:', error);
      try {
        Sentry.captureException(error, {
          tags: { flow: 'auth-form-verify-otp' },
          level: 'error',
        });
      } catch {
        // Sentry failure must not affect error handling
      }
    } finally {
      setIsLoading(false);
    }
  }, [otpCode, pendingEmail, pendingWantsMarketing, verifySignUpOtp, setMarketingConsent, onSuccess, t]);

  const handleResendCode = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const result = await resendSignUpConfirmation(pendingEmail);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(t('auth.otpResent', 'A new code has been sent to your email'));
      }
    } catch (error) {
      const errorMessage = (error instanceof NetworkError || error instanceof AuthError)
        ? error.message
        : t('auth.unexpectedError', 'An unexpected error occurred');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [pendingEmail, resendSignUpConfirmation, t]);

  const switchMode = useCallback((newMode: AuthMode) => {
    if (newMode === 'signUp' && !allowRegistration) {
      return;
    }
    setMode(newMode);
    setError(null);
    setSuccess(null);
    setPendingVerification(false);
    setOtpCode('');
    // Keep email but clear passwords and consent
    setPassword('');
    setConfirmPassword('');
    setHasAcceptedTerms(false);
    setWantsMarketing(false);
  }, [allowRegistration]);

  const exitVerification = useCallback(() => {
    setPendingVerification(false);
    setOtpCode('');
    setError(null);
    setSuccess(null);
    setMode('signIn');
  }, []);

  // Shared style definitions
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

  // --- OTP Verification Screen ---
  if (pendingVerification) {
    return (
      <>
        <h2 id={titleId} className="text-2xl font-bold text-center mb-2">
          {t('auth.otpTitle', 'Enter Verification Code')}
        </h2>

        <p className="text-slate-400 text-center mb-6 text-sm">
          {t('auth.otpSubtitle', 'We sent a 6-digit code to {{email}}. Enter it below to verify your account.', { email: pendingEmail })}
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

        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder={t('auth.otpPlaceholder', '000000')}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={inputStyle + ' text-center text-2xl tracking-[0.5em] font-mono'}
            required
            autoComplete="one-time-code"
            autoFocus
            disabled={isLoading}
          />

          <button type="submit" className={primaryButtonStyle} disabled={isLoading || otpCode.length !== 6}>
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('auth.otpVerifying', 'Verifying...')}
              </span>
            ) : (
              t('auth.otpVerify', 'Verify')
            )}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleResendCode}
            className={linkButtonStyle}
            disabled={isLoading}
          >
            {t('auth.otpResendLink', "Didn't receive a code? Resend")}
          </button>
          <button type="button" onClick={exitVerification} className={linkButtonStyle}>
            {t('auth.backToSignIn', 'Back to sign in')}
          </button>
        </div>
      </>
    );
  }

  // --- Normal Auth Form ---
  return (
    <>
      {/* Title */}
      <h2 id={titleId} className="text-2xl font-bold text-center mb-2">
        {mode === 'signIn' && t('auth.signIn', 'Sign In')}
        {mode === 'signUp' && t('auth.createAccount', 'Create Account')}
        {mode === 'resetPassword' && t('auth.resetPassword', 'Reset Password')}
      </h2>

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
          autoFocus={autoFocus}
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

            {/* Marketing Consent Checkbox (optional, unchecked by default) */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={wantsMarketing}
                onChange={(e) => setWantsMarketing(e.target.checked)}
                disabled={isLoading}
                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
              />
              <span className="text-slate-400 text-xs leading-relaxed group-hover:text-slate-300 transition-colors">
                {t('auth.marketingConsent', 'Send me product updates and tips via email')}
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
            {allowRegistration ? (
              <div className="text-slate-500 text-sm">
                {t('auth.noAccount', "Don't have an account?")}{' '}
                <button type="button" onClick={() => switchMode('signUp')} className={linkButtonStyle}>
                  {t('auth.signUpLink', 'Sign up')}
                </button>
              </div>
            ) : (
              // No registration - must subscribe via Android app
              <div className="mt-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
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
                  <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            )}
          </>
        )}
        {mode === 'signUp' && allowRegistration && (
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
    </>
  );
}
