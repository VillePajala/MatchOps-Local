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

import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import AuthForm, { hasPendingSignUp } from './AuthForm';
import { primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';

/** The welcome step's four points (Onboarding v3, agreed word for word in fi). */
const INTRO_POINTS = [
  ['auth.introPointPlan', 'Your game plan always with you'],
  ['auth.introPointClock', 'Match clock'],
  ['auth.introPointEvents', 'Log match events'],
  ['auth.introPointStats', 'Statistics build up automatically'],
] as const;

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

  /**
   * Two-step sign-up (Onboarding v3): a new device first sees what the app is
   * for, then the form. The welcome step is only for the sign-up funnel - a
   * device that has signed in before opens straight on the sign-in form.
   * `formMode` is the mode the form opens in, chosen on the welcome step.
   */
  const offerIntro = allowRegistration && initialMode === 'signUp';
  // A reload while the emailed code is pending goes straight back to the code
  // screen (review 7.2), never through the welcome step. Read in the initial
  // state: this screen is never server-rendered (page.tsx shows the loading
  // screen until auth has resolved), and the read is storage-safe on a server.
  const [showIntro, setShowIntro] = useState(() => offerIntro && !hasPendingSignUp());
  const [formMode, setFormMode] = useState<'signIn' | 'signUp'>(initialMode);
  const openForm = (mode: 'signIn' | 'signUp') => {
    setFormMode(mode);
    setShowIntro(false);
  };
  // On the form, "back" returns to the welcome step when there is one.
  const handleBack = offerIntro && !showIntro ? () => setShowIntro(true) : onBack;

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
      <div className="relative z-10 flex-1 flex flex-col px-6 pt-3 pb-6 pb-safe">

        {/* === TOP: Back Button + Language Switcher === */}
        <div className="flex justify-between items-center mb-1">
          {/* Back button */}
          {handleBack ? (
            <button
              type="button"
              onClick={handleBack}
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
          {/* Compact in width, but each button is the full 44px tall touch
              target; the lifted pill inside it is only the visual. */}
          <div className="s1-raised flex h-11 rounded-full px-0.5 text-xs font-bold tracking-[0.06em]">
            {(['en', 'fi'] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => handleChangeLanguage(lng)}
                aria-pressed={language === lng}
                className="group grid h-11 min-w-10 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                <span
                  className={`grid h-9 min-w-9 place-items-center rounded-full px-1.5 transition-colors ${
                    language === lng ? 's1-seg-on text-ink' : 'text-ink-3 group-hover:text-ink-2'
                  }`}
                >
                  {lng.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* === HERO: App Name === */}
        {/* py-6 keeps the centered block off both edges even when the tall
            signUp form fills the screen - the footer link must never hug the
            gesture bar (owner round 7). */}
        {showIntro ? (
          <div className="flex-1 flex flex-col py-2" data-testid="login-intro">
            {/* The content block is centred; the two actions sit at the bottom
                within thumb reach. */}
            <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full text-center">
              <Image
                src="/icons/icon-512x512.png"
                alt=""
                width={88}
                height={88}
                unoptimized
                draggable={false}
                className="mx-auto mb-2 select-none"
              />
              <p className="font-[family-name:var(--font-rajdhani)] font-bold leading-none tracking-[0.01em] text-action text-[clamp(2rem,9vw,2.5rem)]">
                PePo Ops
              </p>
              <h1 className="mt-3 font-display font-bold tracking-[0.01em] text-ink text-[clamp(1.75rem,8.5vw,2.25rem)] leading-tight">
                {t('auth.introHeadline', 'Plan, rotate, record.')}
              </h1>
              {/* A centred BLOCK whose ticks line up in a column. */}
              <ul className="mt-5 mx-auto inline-flex flex-col items-start gap-2.5 text-left">
                {INTRO_POINTS.map(([key, fallback]) => (
                  <li key={key} className="flex items-center gap-2.5 text-[15px] text-ink-2">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="h-5 w-5 shrink-0 text-ink-2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                    >
                      <circle cx="10" cy="10" r="8" />
                      <path d="M6.5 10.2l2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t(key, fallback)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="max-w-sm mx-auto w-full space-y-2.5 pt-6">
              <button
                type="button"
                data-testid="login-intro-create"
                onClick={() => openForm('signUp')}
                className={`${primaryButtonStyle} w-full min-h-12 text-base`}
              >
                {t('auth.createAccount', 'Create a free account')}
              </button>
              <button
                type="button"
                data-testid="login-intro-signin"
                onClick={() => openForm('signIn')}
                className={`${secondaryButtonStyle} w-full min-h-12 text-base`}
              >
                {t('auth.introSignIn', 'Sign in')}
              </button>
              {onUseLocalMode && (
                <div className="text-center">
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
        ) : (
        <div className="flex-1 flex flex-col justify-center py-2">
          <div className="max-w-sm mx-auto w-full">
            {/* Small logo above the form's title (Onboarding v3). */}
            <Image
              src="/icons/icon-512x512.png"
              alt="PePo Ops"
              width={52}
              height={52}
              unoptimized
              draggable={false}
              className="mx-auto mb-2 select-none"
            />

            <AuthForm key={formMode} allowRegistration={allowRegistration} initialMode={formMode} />

            {/* Use without account option */}
            {onUseLocalMode && (
              <div className="mt-4 pt-2 border-t border-hairline text-center">
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
        )}
      </div>
    </div>
  );
}
