'use client';

/**
 * WelcomeScreen Component
 *
 * First-install welcome screen that lets users choose their onboarding path:
 * - Start Fresh (local mode) - data stays on device
 * - Sign In to Cloud - sync across devices
 * - Import Backup - restore from exported file
 *
 * Only shown once on first launch. After user makes a choice,
 * the welcome flag is set and this screen won't show again.
 *
 * Visual style matches StartScreen and LoginScreen for consistency.
 *
 * @see docs/03-active-plans/cloud-sync-user-flows.md
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { saveLanguagePreference } from '@/i18n';
// Note: Do NOT import updateAppSettings here. WelcomeScreen is pre-login,
// so there's no userId and calling updateAppSettings would cause DataStore conflicts.
import logger from '@/utils/logger';

interface WelcomeScreenProps {
  /** Called when user chooses "Start Fresh" (local mode) */
  onStartLocal: () => void;
  /** Called when user chooses "Sign In to Cloud" */
  onSignInCloud: () => void;
  /** Called when user chooses "Import Backup" */
  onImportBackup: () => void;
  /** Whether cloud option should be shown (Supabase configured) */
  isCloudAvailable: boolean;
  /** Whether import is currently in progress */
  isImporting: boolean;
}

export default function WelcomeScreen({
  onStartLocal,
  onSignInCloud,
  onImportBackup,
  isCloudAvailable,
  isImporting,
}: WelcomeScreenProps) {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<string>(i18n.language);

  // Language is already loaded from localStorage by i18n on initialization.
  // i18n.language is the source of truth - no need to call getAppSettings().
  // This avoids DataStore initialization conflicts (MATCHOPS-LOCAL-2N).

  // Save language preference when changed
  useEffect(() => {
    i18n.changeLanguage(language);
    // Save to localStorage (i18n loads from here on init).
    // DO NOT call updateAppSettings here - WelcomeScreen is shown before login,
    // so there's no userId and it would cause DataStore initialization conflicts.
    saveLanguagePreference(language);
  }, [language]);

  return (
    <div className="relative flex flex-col min-h-screen min-h-[100dvh] bg-slate-900 text-white overflow-y-auto">
      {/* === AMBIENT BACKGROUND GLOWS === */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Blue glow - top right */}
        <div className="absolute -top-[20%] -right-[15%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-3xl" />
        {/* Blue glow - bottom left */}
        <div className="absolute -bottom-[15%] -left-[10%] w-[55%] h-[55%] bg-sky-500/15 rounded-full blur-3xl" />
      </div>

      {/* === MAIN CONTENT === */}
      <div className="relative z-10 flex-1 flex flex-col px-6 py-6 pb-safe">

        {/* === TOP: Language Switcher === */}
        <div className="flex justify-end mb-2">
          <div className="flex rounded-lg bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm overflow-hidden">
            <button
              onClick={() => setLanguage('en')}
              className={`px-4 py-2.5 text-sm font-bold transition-all ${
                language === 'en'
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('fi')}
              className={`px-4 py-2.5 text-sm font-bold transition-all ${
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
          <div className="text-center mb-6">
            {/* App Name as Logo */}
            <div className="relative inline-block mb-3">
              <h1 className="relative text-5xl sm:text-6xl font-bold tracking-tight">
                <span className="text-amber-400">MatchOps</span>
              </h1>
            </div>

            {/* Welcome message */}
            <p className="text-xl text-white font-medium mb-2">
              {t('welcome.title', 'Welcome!')}
            </p>
            {/* Instruction */}
            <p className="text-base text-slate-400">
              {t('welcome.instruction', 'Choose how you want to get started')}
            </p>
          </div>

          {/* === OPTION BUTTONS === */}
          <div className="max-w-sm mx-auto w-full space-y-3">
            {/* Start without account (Local) */}
            <button
              onClick={onStartLocal}
              className="w-full p-4 rounded-xl bg-slate-800/90 border-2 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50 transition-all text-left"
              aria-label={t('welcome.startLocalAria', 'Start without an account, free')}
            >
              <div className="text-white font-semibold text-lg">
                {t('welcome.startLocal', 'Start without an account')}
              </div>
              <div className="text-green-400 text-xs font-medium uppercase tracking-wide mb-1">
                {t('welcome.badgeFree', 'Free')}
              </div>
              <div className="text-slate-400 text-sm">
                {t('welcome.startLocalDesc', 'Your data is saved on this device only.')}
              </div>
            </button>

            {/* Sign in or create account - only if Supabase is configured */}
            {/* Account creation is FREE on all platforms. Subscription only required for sync. */}
            {isCloudAvailable && (
              <button
                onClick={onSignInCloud}
                className="w-full p-4 rounded-xl bg-slate-800/90 border-2 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50 transition-all text-left"
                aria-label={t('welcome.signInCloudAria', 'Sign in or create a free account')}
              >
                <div className="text-white font-semibold text-lg">
                  {t('welcome.signInCloud', 'Sign in or create an account')}
                </div>
                <div className="text-green-400 text-xs font-medium uppercase tracking-wide mb-1">
                  {t('welcome.badgeFreeAccount', 'Free Account')}
                </div>
                <div className="text-slate-400 text-sm">
                  {t('welcome.signInCloudDescWithPrice', 'Create a free account. Cloud sync available for €4.99/month.')}
                </div>
              </button>
            )}

            {/* Import Backup */}
            <button
              onClick={onImportBackup}
              disabled={isImporting}
              className="w-full p-4 rounded-xl bg-slate-800/90 border-2 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800/90 disabled:hover:border-sky-500/30"
              aria-label={isImporting ? t('welcome.importingAria', 'Importing backup file') : t('welcome.importBackupAria', 'Import backup file')}
            >
              <div className="text-white font-semibold text-lg">
                {isImporting ? t('welcome.importing', 'Importing...') : t('welcome.importBackup', 'Import a backup')}
              </div>
              <div className="text-green-400 text-xs font-medium uppercase tracking-wide mb-1">
                {t('welcome.badgeFree', 'Free')}
              </div>
              <div className="text-slate-400 text-sm">
                {t('welcome.importBackupDesc', 'Restore your previous data from a file and continue where you left off.')}
              </div>
            </button>
          </div>

          {/* Footer Note */}
          <p className="text-center text-slate-500 text-sm mt-6">
            {t('welcome.changeInSettings', 'You can change this later in Settings')}
          </p>
        </div>
      </div>
    </div>
  );
}
