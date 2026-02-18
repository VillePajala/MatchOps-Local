'use client';

/**
 * WelcomeScreen Component
 *
 * First-install welcome screen with 2 primary paths + footer link:
 * - Start without an account (local mode) - data stays on device
 * - Use Cloud Sync - enables cloud mode, shows login screen after reload
 * - Have a backup file? (footer link) - restore from exported file
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

interface WelcomeScreenProps {
  /** Called when user chooses "Start Fresh" (local mode) */
  onStartLocal: () => void;
  /** Called when user chooses "Use Cloud Sync" - enables cloud mode and shows login */
  onUseCloudSync: () => void;
  /** Called when user chooses "Import Backup" */
  onImportBackup: () => void;
  /** Whether cloud option should be shown (Supabase configured) */
  isCloudAvailable: boolean;
  /** Whether import is currently in progress */
  isImporting: boolean;
  /** Hide local-mode options: "Start without account" button + "Import backup" link (Play Store context — cloud is required) */
  hideLocalModeOptions?: boolean;
}

export default function WelcomeScreen({
  onStartLocal,
  onUseCloudSync,
  onImportBackup,
  isCloudAvailable,
  isImporting,
  hideLocalModeOptions = false,
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
            {/* Start without account (Local) — hidden in Play Store context */}
            {!hideLocalModeOptions && (
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
            )}

            {/* Use Cloud Sync - only if Supabase is configured */}
            {isCloudAvailable && (
              <button
                onClick={onUseCloudSync}
                className="w-full p-4 rounded-xl bg-slate-800/90 border-2 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50 transition-all text-left"
                aria-label={t('welcome.useCloudSyncAria', 'Use cloud sync, access from any device')}
              >
                <div className="text-white font-semibold text-lg">
                  {t('welcome.useCloudSync', 'Use Cloud Sync')}
                </div>
                <div className="text-green-400 text-xs font-medium uppercase tracking-wide mb-1">
                  {t('welcome.badgeFree', 'FREE')}
                </div>
                <div className="text-slate-400 text-sm">
                  {t('welcome.useCloudSyncDesc', 'Sync your data across all your devices.')}
                </div>
              </button>
            )}
            {/* Settings note — only shown when there's actually a choice to change */}
            {!hideLocalModeOptions && (
              <p className="text-slate-500 text-xs text-center pt-1">
                {t('welcome.changeInSettings', 'You can change this later in Settings')}
              </p>
            )}
          </div>

          {/* Footer: Import backup — hidden in Play Store (available via Settings after auth) */}
          {!hideLocalModeOptions && (
            <div className="text-center mt-6">
              <p className="text-slate-500 text-sm">
                <button
                  onClick={onImportBackup}
                  disabled={isImporting}
                  className="text-slate-400 hover:text-white underline transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={isImporting ? t('welcome.importingAria', 'Importing backup file') : t('welcome.importBackupAria', 'Import backup file')}
                >
                  {isImporting
                    ? t('welcome.importing', 'Importing...')
                    : t('welcome.haveBackup', 'Have a backup file?')}
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
