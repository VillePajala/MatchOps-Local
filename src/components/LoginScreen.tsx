/**
 * LoginScreen - Authentication screen for cloud mode.
 *
 * Only shown in cloud mode when not authenticated.
 * Supports sign in, sign up, and password reset via shared AuthForm.
 * Visual style unified with StartScreen and WelcomeScreen.
 *
 * Part of Phase 4 Supabase implementation (PR #5).
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 6.4
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { saveLanguagePreference } from '@/i18n';
import AuthForm from './AuthForm';

interface LoginScreenProps {
  /** Called when user wants to go back to WelcomeScreen */
  onBack?: () => void;
  /** Called when user wants to use local mode instead */
  onUseLocalMode?: () => void;
  /** Whether to allow registration (false on desktop - must subscribe via Android app) */
  allowRegistration?: boolean;
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
export default function LoginScreen({ onBack, onUseLocalMode, allowRegistration = true }: LoginScreenProps) {
  const { t } = useTranslation();

  const [language, setLanguage] = useState<string>(i18n.language);

  // Language is already loaded from localStorage by i18n on initialization.
  // i18n.language is the source of truth - no need to call getAppSettings().
  // This avoids DataStore initialization conflicts (MATCHOPS-LOCAL-2N).

  // Save language preference when changed
  useEffect(() => {
    i18n.changeLanguage(language);
    // Save to localStorage (i18n loads from here on init).
    // DO NOT call updateAppSettings here - LoginScreen is shown before login,
    // so there's no userId and it would cause DataStore initialization conflicts.
    saveLanguagePreference(language);
  }, [language]);

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

        {/* === TOP: Back Button + Language Switcher === */}
        <div className="flex justify-between items-center mb-4">
          {/* Back button */}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('common.back', 'Back')}
            </button>
          ) : (
            <div />
          )}

          {/* Language Switcher */}
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

            <AuthForm allowRegistration={allowRegistration} />

            {/* Use without account option */}
            {onUseLocalMode && (
              <div className="mt-8 pt-6 border-t border-slate-700/50 text-center">
                <button
                  type="button"
                  onClick={onUseLocalMode}
                  className="text-slate-400 hover:text-amber-400 text-sm transition-colors"
                >
                  {t('auth.useWithoutAccount', 'Or continue without an account')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
