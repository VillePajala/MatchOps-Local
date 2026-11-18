/**
 * AuthForm - Shared authentication form component.
 *
 * Renders email/password form with sign in, sign up, and password reset modes.
 * After sign-up, shows OTP code verification (8-digit code from email).
 * Used by LoginScreen (full-page) and AuthModal (dialog overlay).
 *
 * Extracted to eliminate ~200 lines of duplication between LoginScreen and AuthModal.
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthProvider';
import { isNetworkErrorMessage, normalizeEmail, translateAuthError } from '@/utils/authHelpers';
import { AuthError, NetworkError } from '@/interfaces/DataStoreErrors';
import logger from '@/utils/logger';
import { useHoldUnsavedInput } from '@/utils/unsavedInputSignal';
import {
  titleStyle,
  inputBaseStyle,
  primaryButtonStyle as sharedPrimaryButtonStyle,
  linkStyle,
  errorBoxStyle,
  successBoxStyle,
  checkboxStyle,
  fieldHintStyle,
  infoBoxStyle,
} from '@/styles/modalStyles';

/**
 * The sign-up awaiting its emailed code, kept for the tab (review 7.2). A coach
 * fetching the code from their mail app may be away long enough for a reload;
 * without this they came back to Create Account and no screen accepted the code.
 * sessionStorage survives a reload and a tab restore, not a fresh app launch -
 * that case is covered by signing in, which opens the code screen for an
 * unconfirmed account. One hour from sending: the code's own lifetime.
 */
const PENDING_SIGNUP_KEY = 'matchops.pendingSignUp';
const PENDING_SIGNUP_MAX_AGE_MS = 60 * 60 * 1000;

const readPendingSignUpRecord = (): { email: string; at: number } | null => {
  try {
    const raw = sessionStorage.getItem(PENDING_SIGNUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: unknown; at?: unknown } | null;
    if (!parsed || typeof parsed.email !== 'string' || typeof parsed.at !== 'number') return null;
    return { email: parsed.email, at: parsed.at };
  } catch {
    return null;
  }
};

/**
 * `sentNow`: a code was just sent (sign-up). From the sign-in route nothing is
 * sent, so an entry for the same address keeps the time its code went out.
 */
const rememberPendingSignUp = (email: string, sentNow: boolean): void => {
  try {
    const existing = readPendingSignUpRecord();
    const at = !sentNow && existing?.email === email ? existing.at : Date.now();
    sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({ email, at }));
  } catch {
    // Storage unavailable: the code screen still works for this page load.
  }
};

const forgetPendingSignUp = (): void => {
  try {
    sessionStorage.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // Nothing to clear.
  }
};

const readPendingSignUp = (): string | null => {
  const record = readPendingSignUpRecord();
  if (!record || Date.now() - record.at > PENDING_SIGNUP_MAX_AGE_MS) {
    forgetPendingSignUp();
    return null;
  }
  return record.email;
};
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
  const { signIn, signUp, resetPassword, signOut, verifySignUpOtp, resendSignUpConfirmation, verifyPasswordResetOtp, updatePassword } = useAuth();

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
  // OTP verification state (shown after successful sign-up)
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  // Password reset OTP flow state
  const [pendingPasswordReset, setPendingPasswordReset] = useState(false);
  const [pendingResetEmail, setPendingResetEmail] = useState('');
  const [resetOtpCode, setResetOtpCode] = useState('');
  const [showNewPasswordForm, setShowNewPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Back on the code screen after a reload (review 7.2). After mount, not in the
  // initial state, so the server render and the first client render agree.
  useEffect(() => {
    const email = readPendingSignUp();
    if (email) {
      setPendingEmail(email);
      setPendingVerification(true);
    }
  }, []);

  // While the code screen is up, the long-background reload waits (review 7.1).
  useHoldUnsavedInput(pendingVerification);

  /** Show the code screen for this address and remember it for a reload. */
  const openCodeScreen = useCallback((address: string, sentNow: boolean) => {
    setPendingEmail(address);
    setPendingVerification(true);
    rememberPendingSignUp(address, sentNow);
  }, []);

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
            openCodeScreen(normalizedEmail, true);
            setPassword('');
            setConfirmPassword('');
          }
        } else {
          // Success - user signed up and logged in (auto-confirmed)
          forgetPendingSignUp();
          onSuccess?.();
        }
      } else if (mode === 'signIn') {
        const result = await signIn(normalizedEmail, password);
        if (result.emailNotConfirmed) {
          // Signed up but never entered the code (review 7.2): the email holds a
          // code, and this is the only screen that accepts it.
          setPassword('');
          openCodeScreen(normalizedEmail, false);
        } else if (result.error) {
          setError(result.error);
          if (isNetworkErrorMessage(result.error)) {
            logger.warn('[AuthForm] Network error during sign in:', result.error);
          }
        } else {
          // Success - user signed in. Any remembered sign-up is settled (or was
          // someone else's): it must not reopen a code screen after a sign-out.
          forgetPendingSignUp();
          setPassword('');
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
          // Transition to reset OTP input screen
          setPendingResetEmail(normalizedEmail);
          setPendingPasswordReset(true);
          setPassword('');
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
  }, [email, password, confirmPassword, mode, hasAcceptedTerms, signIn, signUp, resetPassword, onSuccess, t, openCodeScreen]);

  const handleVerifyOtp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    const trimmedCode = otpCode.trim();
    if (!trimmedCode || trimmedCode.length < 6 || trimmedCode.length > 8) {
      setError(t('auth.otpInvalidLength', 'Please enter the 8-digit code from your email'));
      setIsLoading(false);
      return;
    }

    try {
      const result = await verifySignUpOtp(pendingEmail, trimmedCode);
      if (result.error) {
        setError(result.error);
      } else {
        // Success — user verified and logged in
        forgetPendingSignUp();
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
  }, [otpCode, pendingEmail, verifySignUpOtp, onSuccess, t]);

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

  const handleVerifyResetOtp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    const trimmedCode = resetOtpCode.trim();
    if (!trimmedCode || trimmedCode.length !== 8) {
      setError(t('auth.otpInvalidLength', 'Please enter the 8-digit code from your email'));
      setIsLoading(false);
      return;
    }

    try {
      const result = await verifyPasswordResetOtp(pendingResetEmail, trimmedCode);
      if (result.error) {
        setError(result.error);
      } else {
        // OTP verified — transition to set new password form
        setShowNewPasswordForm(true);
        setResetOtpCode('');
      }
    } catch (error) {
      const errorMessage = (error instanceof NetworkError || error instanceof AuthError)
        ? error.message
        : t('auth.unexpectedError', 'An unexpected error occurred');
      setError(errorMessage);
      logger.error('[AuthForm] Reset OTP verification error:', error);
      try {
        Sentry.captureException(error, {
          tags: { flow: 'auth-form-verify-reset-otp' },
          level: 'error',
        });
      } catch {
        // Sentry failure must not affect error handling
      }
    } finally {
      setIsLoading(false);
    }
  }, [resetOtpCode, pendingResetEmail, verifyPasswordResetOtp, t]);

  const handleSetNewPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmNewPassword) {
      setError(t('auth.passwordMismatch', 'Passwords do not match'));
      return;
    }

    setIsLoading(true);

    try {
      const result = await updatePassword(newPassword);
      if (result.error) {
        setError(result.error);
      } else {
        // Password updated successfully — return to sign-in
        setSuccess(t('auth.passwordUpdated', 'Password updated successfully. Please sign in with your new password.'));
        setPendingPasswordReset(false);
        setShowNewPasswordForm(false);
        setNewPassword('');
        setConfirmNewPassword('');
        setResetOtpCode('');
        setPendingResetEmail('');
        setMode('signIn');
      }
    } catch (error) {
      const errorMessage = (error instanceof NetworkError || error instanceof AuthError)
        ? error.message
        : t('auth.unexpectedError', 'An unexpected error occurred');
      setError(errorMessage);
      logger.error('[AuthForm] Password update error:', error);
      try {
        Sentry.captureException(error, {
          tags: { flow: 'auth-form-update-password' },
          level: 'error',
        });
      } catch {
        // Sentry failure must not affect error handling
      }
    } finally {
      setIsLoading(false);
    }
  }, [newPassword, confirmNewPassword, updatePassword, t]);

  const handleResendResetCode = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const result = await resetPassword(pendingResetEmail);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(t('auth.resetOtpResent', 'A new reset code has been sent to your email'));
      }
    } catch (error) {
      const errorMessage = (error instanceof NetworkError || error instanceof AuthError)
        ? error.message
        : t('auth.unexpectedError', 'An unexpected error occurred');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [pendingResetEmail, resetPassword, t]);

  const exitPasswordReset = useCallback(() => {
    // If OTP was already verified, a recovery session exists — sign out to clean it up
    if (showNewPasswordForm) {
      signOut().catch(() => {
        // Non-critical: recovery session will expire naturally
      });
    }
    setPendingPasswordReset(false);
    setShowNewPasswordForm(false);
    setResetOtpCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPendingResetEmail('');
    setError(null);
    setSuccess(null);
    setMode('signIn');
  }, [showNewPasswordForm, signOut]);

  const switchMode = useCallback((newMode: AuthMode) => {
    if (newMode === 'signUp' && !allowRegistration) {
      return;
    }
    setMode(newMode);
    setError(null);
    setSuccess(null);
    setPendingVerification(false);
    setOtpCode('');
    setPendingPasswordReset(false);
    setShowNewPasswordForm(false);
    setResetOtpCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPendingResetEmail('');
    // Keep email but clear passwords and consent
    setPassword('');
    setConfirmPassword('');
    setHasAcceptedTerms(false);
  }, [allowRegistration]);

  const exitVerification = useCallback(() => {
    // Leaving on purpose: no code screen after a reload. Signing in with the
    // password brings it back while the account is unconfirmed.
    forgetPendingSignUp();
    // Restored after a reload, the sign-in field is empty - carry the address over.
    if (pendingEmail) setEmail(pendingEmail);
    setPendingVerification(false);
    setOtpCode('');
    setError(null);
    setSuccess(null);
    setMode('signIn');
  }, [pendingEmail]);

  // Shared style definitions (the app's shared popup/form styles)
  const primaryButtonStyle = `${sharedPrimaryButtonStyle} w-full min-h-12`;

  const linkButtonStyle =
    'inline-flex min-h-11 items-center px-2 rounded-full font-ui text-sm font-semibold text-action hover:brightness-110 transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-action';

  const inputStyle = inputBaseStyle;

  // --- Set New Password Screen (after reset OTP verified) ---
  if (pendingPasswordReset && showNewPasswordForm) {
    return (
      <>
        <h2 id={titleId} className={`${titleStyle} text-center mb-2`}>
          {t('auth.newPasswordTitle', 'Set New Password')}
        </h2>

        <p className="font-ui text-ink-3 text-center mb-6 text-sm">
          {t('auth.newPasswordSubtitle', 'Enter your new password below.')}
        </p>

        {/* Error/Success Messages */}
        {error && (
          <div className={`mb-4 ${errorBoxStyle} font-ui text-sm text-ink`}>
            <p>{translateAuthError(error, t)}</p>
            {isNetworkErrorMessage(error) && (
              <p className="mt-1 text-ink-2">
                {t('auth.networkErrorHint', 'Please check your internet connection and try again.')}
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSetNewPassword} className="space-y-4">
          <input
            type="password"
            placeholder={t('auth.newPasswordPlaceholder', 'New password')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputStyle}
            required
            autoComplete="new-password"
            autoFocus
            disabled={isLoading}
          />
          <input
            type="password"
            placeholder={t('auth.confirmNewPasswordPlaceholder', 'Confirm new password')}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            className={inputStyle}
            required
            autoComplete="new-password"
            disabled={isLoading}
          />
          <p className={fieldHintStyle}>
            {t('auth.passwordRequirements', 'Password must be at least 8 characters.')}
          </p>

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
              t('auth.setNewPassword', 'Set New Password')
            )}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button type="button" onClick={exitPasswordReset} className={linkButtonStyle}>
            {t('auth.backToSignIn', 'Back to sign in')}
          </button>
        </div>
      </>
    );
  }

  // --- Password Reset OTP Verification Screen ---
  if (pendingPasswordReset) {
    return (
      <>
        <h2 id={titleId} className={`${titleStyle} text-center mb-2`}>
          {t('auth.resetOtpTitle', 'Enter Reset Code')}
        </h2>

        <p className="font-ui text-ink-3 text-center mb-6 text-sm">
          {t('auth.resetOtpSubtitle', 'We sent a reset code to {{email}}. Enter it below to reset your password.', { email: pendingResetEmail })}
        </p>

        {/* Error/Success Messages */}
        {error && (
          <div className={`mb-4 ${errorBoxStyle} font-ui text-sm text-ink`}>
            <p>{translateAuthError(error, t)}</p>
            {isNetworkErrorMessage(error) && (
              <p className="mt-1 text-ink-2">
                {t('auth.networkErrorHint', 'Please check your internet connection and try again.')}
              </p>
            )}
          </div>
        )}
        {success && (
          <div className={`mb-4 ${successBoxStyle} font-ui text-sm text-ink`}>
            {success}
          </div>
        )}

        <form onSubmit={handleVerifyResetOtp} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            placeholder={t('auth.otpPlaceholder', '00000000')}
            value={resetOtpCode}
            onChange={(e) => setResetOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className={inputStyle + ' text-center text-2xl tracking-[0.5em] font-mono'}
            required
            autoComplete="one-time-code"
            autoFocus
            disabled={isLoading}
          />

          <button type="submit" className={primaryButtonStyle} disabled={isLoading || resetOtpCode.length !== 8}>
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
            onClick={handleResendResetCode}
            className={linkButtonStyle}
            disabled={isLoading}
          >
            {t('auth.resendResetCode', "Didn't receive a code? Resend")}
          </button>
          <button type="button" onClick={exitPasswordReset} className={linkButtonStyle}>
            {t('auth.backToSignIn', 'Back to sign in')}
          </button>
        </div>
      </>
    );
  }

  // --- Sign-Up OTP Verification Screen ---
  if (pendingVerification) {
    return (
      <>
        <h2 id={titleId} className={`${titleStyle} text-center mb-2`}>
          {t('auth.otpTitle', 'Enter Verification Code')}
        </h2>

        <p className="font-ui text-ink-3 text-center mb-6 text-sm">
          {t('auth.otpSubtitle', 'We sent a verification code to {{email}}. Enter it below to verify your account.', { email: pendingEmail })}
        </p>

        {/* Error/Success Messages */}
        {error && (
          <div className={`mb-4 ${errorBoxStyle} font-ui text-sm text-ink`}>
            <p>{translateAuthError(error, t)}</p>
            {isNetworkErrorMessage(error) && (
              <p className="mt-1 text-ink-2">
                {t('auth.networkErrorHint', 'Please check your internet connection and try again.')}
              </p>
            )}
          </div>
        )}
        {success && (
          <div className={`mb-4 ${successBoxStyle} font-ui text-sm text-ink`}>
            {success}
          </div>
        )}

        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            placeholder={t('auth.otpPlaceholder', '00000000')}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className={inputStyle + ' text-center text-2xl tracking-[0.5em] font-mono'}
            required
            autoComplete="one-time-code"
            autoFocus
            disabled={isLoading}
          />

          <button type="submit" className={primaryButtonStyle} disabled={isLoading || otpCode.length < 6}>
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
      <h2 id={titleId} className={`${titleStyle} text-center mb-2`}>
        {mode === 'signIn' && t('auth.signIn', 'Sign In')}
        {mode === 'signUp' && t('auth.createAccount', 'Create Account')}
        {mode === 'resetPassword' && t('auth.resetPassword', 'Reset Password')}
      </h2>

      <p className="font-ui text-ink-3 text-center mb-6 text-sm">
        {mode === 'signIn' && t('auth.signInSubtitle', 'Sign in to sync your data across devices')}
        {mode === 'signUp' && t('auth.signUpSubtitle', 'Create an account to enable cloud sync')}
        {mode === 'resetPassword' && t('auth.resetSubtitle', 'Enter your email to receive a reset code')}
      </p>

      {/* Error/Success Messages */}
      {error && (
        <div className={`mb-4 ${errorBoxStyle} font-ui text-sm text-ink`}>
          <p>{translateAuthError(error, t)}</p>
          {isNetworkErrorMessage(error) && (
            <p className="mt-1 text-ink-2">
              {t('auth.networkErrorHint', 'Please check your internet connection and try again.')}
            </p>
          )}
        </div>
      )}
      {success && (
        <div className={`mb-4 ${successBoxStyle} font-ui text-sm text-ink`}>
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
            <p className={fieldHintStyle}>
              {t('auth.passwordRequirements', 'Password must be at least 8 characters.')}
            </p>

            {/* GDPR Consent Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer min-h-11 font-ui">
              <input
                type="checkbox"
                checked={hasAcceptedTerms}
                onChange={(e) => setHasAcceptedTerms(e.target.checked)}
                disabled={isLoading}
                className={`${checkboxStyle} mt-0.5 shrink-0 cursor-pointer`}
              />
              <span className="text-ink-2 text-[13px] leading-relaxed">
                {t('auth.termsConsent', 'I have read and agree to the')}{' '}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkStyle}
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('auth.termsLink', 'Terms of Service')}
                </Link>{' '}
                {t('auth.and', 'and')}{' '}
                <Link
                  href="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkStyle}
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
            {allowRegistration ? (
              <div className="font-ui text-ink-3 text-sm flex flex-wrap items-center justify-center">
                {t('auth.noAccount', "Don't have an account?")}{' '}
                <button type="button" onClick={() => switchMode('signUp')} className={linkButtonStyle}>
                  {t('auth.signUpLink', 'Sign up')}
                </button>
              </div>
            ) : (
              // No registration - must subscribe via Android app
              <div className={`mt-4 ${infoBoxStyle} text-center`}>
                <p className={fieldHintStyle}>
                  {t('auth.androidOnlyRegistration', "Don't have an account? Subscribe via the Android app.")}
                </p>
                <a
                  href="https://play.google.com/store/apps/details?id=com.matchops.local"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${linkStyle} text-sm inline-flex min-h-11 items-center gap-1`}
                >
                  {t('auth.getAndroidApp', 'Get on Google Play')}
                  <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            )}
          </>
        )}
        {mode === 'signUp' && allowRegistration && (
          <div className="font-ui text-ink-3 text-sm flex flex-wrap items-center justify-center">
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
