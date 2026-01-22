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
import i18n from '@/i18n';
import { getAppSettings, updateAppSettings } from '@/utils/appSettings';
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
    updateAppSettings({ language }).catch((error) => {
      logger.warn('[WelcomeScreen] Failed to save language preference (non-critical)', { language, error });
    });
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

        {/* === TOP: Language Switcher === */}
        <div className="flex justify-end mb-4">
          <div className="flex rounded-lg bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm overflow-hidden">
            <button
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
        <div className="flex-1 flex flex-col justify-start pt-[10vh]">
          <div className="text-center mb-8">
            {/* App Name as Logo */}
            <div className="relative inline-block mb-3">
              <h1 className="relative text-5xl sm:text-6xl font-bold tracking-tight">
                <span className="text-amber-400">MatchOps</span>
              </h1>
            </div>

            {/* Welcome Message */}
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">
              {t('welcome.title', 'Welcome!')}
            </h2>
            <p className="text-slate-400">
              {t('welcome.subtitle', 'Track your team\'s games, players, and stats')}
            </p>
          </div>

          {/* === OPTION BUTTONS === */}
          <div className="max-w-sm mx-auto w-full space-y-3">
            {/* Start Fresh (Local) */}
            <button
              onClick={onStartLocal}
              className="w-full p-4 rounded-xl bg-slate-800/90 border-2 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50 transition-all text-left"
              aria-label={t('welcome.startFreshAria', 'Start fresh in local mode')}
            >
              <div className="text-white font-semibold text-lg">
                {t('welcome.startFresh', 'Start Fresh')}
              </div>
              <div className="text-slate-400 text-sm">
                {t('welcome.startFreshDesc', 'Data stays on this device')}
              </div>
            </button>

            {/* Sign In to Cloud - only if Supabase is configured */}
            {isCloudAvailable && (
              <button
                onClick={onSignInCloud}
                className="w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 hover:from-amber-400 hover:to-amber-500 transition-all text-left shadow-lg shadow-amber-500/20"
                aria-label={t('welcome.signInCloudAria', 'Sign in to cloud sync')}
              >
                <div className="font-bold text-lg">
                  {t('welcome.signInCloud', 'Sign In to Cloud')}
                </div>
                <div className="text-slate-800 text-sm">
                  {t('welcome.signInCloudDesc', 'Sync across all your devices')}
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
                {isImporting ? t('welcome.importing', 'Importing...') : t('welcome.importBackup', 'Import Backup')}
              </div>
              <div className="text-slate-400 text-sm">
                {t('welcome.importBackupDesc', 'Restore from exported file')}
              </div>
            </button>
          </div>

          {/* Footer Note */}
          <p className="text-center text-slate-500 text-sm mt-8">
            {t('welcome.changeInSettings', 'You can change this later in Settings')}
          </p>
        </div>
      </div>
    </div>
  );
}
