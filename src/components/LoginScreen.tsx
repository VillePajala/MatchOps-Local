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

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import AuthForm from './AuthForm';
import {
  segmentTrackStyle,
  segmentStyle,
  segmentSelectedStyle,
} from '@/styles/modalStyles';

interface LoginScreenProps {
  /** Called when user wants to go back to WelcomeScreen */
  onBack?: () => void;
  /** Called when user wants to use local mode instead */
  onUseLocalMode?: () => void;
  /** Whether to allow registration (false on desktop - must subscribe via Android app) */
  allowRegistration?: boolean;
  /** Which auth mode the form opens in. Defaults to 'signIn'; the production
   *  cloud funnel passes 'signUp' so new users land on Create Account. */
  initialMode?: 'signIn' | 'signUp';
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
export default function LoginScreen({ onBack, onUseLocalMode, allowRegistration = true, initialMode = 'signIn' }: LoginScreenProps) {
  const { t } = useTranslation();

  // The app language (shared with every other language control; hydration-safe -
  // see useAppLanguage, MATCHOPS-LOCAL-8K).
  const [language, changeLanguage] = useAppLanguage();

  /**
   * Switching the language is an ACTION, not a state sync. As an effect keyed
   * on `language` this fired on every mount with the pre-adopt 'fi' still in
   * its closure, reverting the choice and emitting `languageChanged`. On Home
   * that fed a render loop (see StartScreen). Here it is only ever wrong
   * rather than catastrophic, but it is the same mistake, so it gets the same
   * fix rather than waiting to find out what it costs.
   */
  const handleChangeLanguage = changeLanguage;

  return (
    <div className="s1-canvas relative flex flex-col min-h-screen min-h-[100dvh] font-ui text-ink overflow-hidden">
      {/* === MAIN CONTENT === */}
      <div className="relative z-10 flex-1 flex flex-col px-6 pt-6 pb-10 pb-safe">

        {/* === TOP: Back Button + Language Switcher === */}
        <div className="flex justify-between items-center mb-4">
          {/* Back button */}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center gap-1 rounded-full pr-3 text-ink-3 hover:text-ink transition-colors text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
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
          <div className={`${segmentTrackStyle} w-32`}>
            <button
              type="button"
              onClick={() => handleChangeLanguage('en')}
              aria-pressed={language === 'en'}
              className={language === 'en' ? segmentSelectedStyle : segmentStyle}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => handleChangeLanguage('fi')}
              aria-pressed={language === 'fi'}
              className={language === 'fi' ? segmentSelectedStyle : segmentStyle}
            >
              FI
            </button>
          </div>
        </div>

        {/* === HERO: App Name === */}
        {/* py-6 keeps the centered block off both edges even when the tall
            signUp form fills the screen - the footer link must never hug the
            gesture bar (owner round 7). */}
        <div className="flex-1 flex flex-col justify-center py-6">
          <div className="max-w-sm mx-auto w-full">
            {/* App name */}
            <div className="text-center mb-8">
              <h1 className="font-display text-[clamp(2.8rem,12vw,4rem)] font-bold italic tracking-[0.01em] text-action">
                MatchOps
              </h1>
            </div>

            <AuthForm allowRegistration={allowRegistration} initialMode={initialMode} />

            {/* Use without account option */}
            {onUseLocalMode && (
              <div className="mt-8 pt-6 border-t border-hairline text-center">
                <button
                  type="button"
                  onClick={onUseLocalMode}
                  className="inline-flex min-h-11 items-center rounded-full px-3 text-ink-3 hover:text-ink text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
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
