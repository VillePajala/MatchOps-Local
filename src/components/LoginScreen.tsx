/**
 * LoginScreen - Authentication screen for cloud mode.
 *
 * Only shown in cloud mode when not authenticated.
 * Supports sign in, sign up, and password reset.
 * Visual style unified with StartScreen and WelcomeScreen.
 *
 * Part of Phase 4 Supabase implementation (PR #5).
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 6.4
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useAuth } from '@/contexts/AuthProvider';
import { getAppSettings, updateAppSettings } from '@/utils/appSettings';
import logger from '@/utils/logger';

type AuthMode = 'signIn' | 'signUp' | 'resetPassword';

/**
 * Check if an error message indicates a network problem.
 */
function isNetworkErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('network') || lower.includes('offline') || lower.includes('connection');
}

/**
 * Login screen component for cloud authentication.
 *
 * @remarks
 * This component is only rendered in cloud mode when the user is not authenticated.
 * It provides:
 * - Sign in with email/password
 * - Sign up with email/password (with password requirements)
 * - Password reset via email
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn, signUp, resetPassword } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<string>(i18n.language);

  // Load saved language preference
  useEffect(() => {
    getAppSettings().then((settings) => {
      if (settings.language) {
        setLanguage(settings.language);
      }
    });
  }, []);

  // Save language preference when changed
  useEffect(() => {
    i18n.changeLanguage(language);
    updateAppSettings({ language }).catch((err) => {
      logger.warn('[LoginScreen] Failed to save language preference (non-critical)', { language, error: err });
    });
  }, [language]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    // Trim email to avoid whitespace issues
    const trimmedEmail = email.trim();

    try {
      if (mode === 'signUp') {
        // Validate passwords match
        if (password !== confirmPassword) {
          setError(t('auth.passwordMismatch', 'Passwords do not match'));
          setIsLoading(false);
          return;
        }
        // Password strength is validated in SupabaseAuthService
        const result = await signUp(trimmedEmail, password);
        if (result.error) {
          setError(result.error);
        } else if (result.confirmationRequired) {
          setSuccess(t('auth.checkEmail', 'Check your email to confirm your account'));
          setMode('signIn');
          // Clear password fields
          setPassword('');
          setConfirmPassword('');
        }
        // If no confirmation required, AuthProvider updates state and page re-renders
      } else if (mode === 'signIn') {
        const result = await signIn(trimmedEmail, password);
        if (result.error) {
          setError(result.error);
        }
        // Success: AuthProvider will update state, page.tsx will re-render
      } else if (mode === 'resetPassword') {
        const result = await resetPassword(trimmedEmail);
        if (result.error) {
          setError(result.error);
        } else {
          setSuccess(t('auth.resetEmailSent', 'Check your email for reset instructions'));
          setMode('signIn');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
    // Keep email but clear passwords
    setPassword('');
    setConfirmPassword('');
  };

  // Button styles - indigo for auth forms
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
    <div className="relative flex flex-col min-h-screen min-h-[100dvh] bg-slate-900 text-white overflow-hidden">
      {/* === AMBIENT BACKGROUND GLOWS === */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Blue glow - top right */}
        <div className="absolute -top-[20%] -right-[15%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-3xl" />
        {/* Blue glow - bottom left */}
        <div className="absolute -bottom-[15%] -left-[10%] w-[55%] h-[55%] bg-sky-500/15 rounded-full blur-3xl" />
      </div>

      {/* === MAIN CONTENT === */}
      <div className="relative z-10 flex-1 flex flex-col px-6 py-8 pb-safe">

        {/* === TOP: Language Switcher === */}
        <div className="flex justify-end mb-4">
          <div className="flex rounded-lg bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 text-xs font-bold transition-all ${
                language === 'en'
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('fi')}
              className={`px-3 py-1.5 text-xs font-bold transition-all ${
                language === 'fi'
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              FI
            </button>
          </div>
        </div>

        {/* === HERO: App Name === */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="max-w-sm mx-auto w-full">
            {/* App name */}
            <div className="text-center mb-8">
              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-amber-400">
                MatchOps
              </h1>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center mb-2">
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
                  <div className="text-slate-500 text-sm">
                    {t('auth.noAccount', "Don't have an account?")}{' '}
                    <button type="button" onClick={() => switchMode('signUp')} className={linkButtonStyle}>
                      {t('auth.signUpLink', 'Sign up')}
                    </button>
                  </div>
                </>
              )}
              {mode === 'signUp' && (
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
    </div>
  );
}
