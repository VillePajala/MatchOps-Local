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

import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import {
  segmentTrackStyle,
  segmentStyle,
  segmentSelectedStyle,
  titleStyle,
  cardStyle,
  linkStyle,
} from '@/styles/modalStyles';
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
  // The app language (shared with every other language control; hydration-safe).
  // Changed by the buttons only - it used to be an effect keyed on the value,
  // which re-fired on mount with the pre-adopt 'fi' (review 8.1).
  const [language, setLanguage] = useAppLanguage();

  return (
    <div className="s1-canvas relative flex flex-col min-h-screen min-h-[100dvh] font-ui text-ink overflow-y-auto">
      {/* === MAIN CONTENT === */}
      <div className="relative z-10 flex-1 flex flex-col px-6 pt-3 pb-6 pb-safe">

        {/* === TOP: Language Switcher === */}
        <div className="flex justify-end mb-1">
          <div className={`${segmentTrackStyle} w-24`}>
            <button
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
              className={`${language === 'en' ? segmentSelectedStyle : segmentStyle} min-h-9 text-xs`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('fi')}
              aria-pressed={language === 'fi'}
              className={`${language === 'fi' ? segmentSelectedStyle : segmentStyle} min-h-9 text-xs`}
            >
              FI
            </button>
          </div>
        </div>

        {/* === HERO: App Name === */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-center mb-5">
            {/* App Name as Logo */}
            <h1 className="mb-3 font-[family-name:var(--font-rajdhani)] font-bold leading-none tracking-[0.01em] text-action text-[clamp(2.5rem,11vw,3.25rem)]">
              MatchOps
            </h1>

            {/* Welcome message */}
            <p className={`${titleStyle} mb-2`}>
              {t('welcome.title', 'Welcome!')}
            </p>
            {/* Instruction */}
            <p className="text-base text-ink-3">
              {t('welcome.instruction', 'Choose how you want to get started')}
            </p>
          </div>

          {/* === OPTION BUTTONS === */}
          <div className="max-w-sm mx-auto w-full space-y-2.5">
            {/* Start without account (Local) — hidden in Play Store context */}
            {!hideLocalModeOptions && (
              <button
                onClick={onStartLocal}
                className={`${cardStyle} block w-full min-h-14 text-left transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-action`}
                aria-label={t('welcome.startLocalAria', 'Start without an account, free')}
              >
                <div className="text-ink font-semibold text-lg">
                  {t('welcome.startLocal', 'Start without an account')}
                </div>
                <div className="text-win text-xs font-semibold uppercase tracking-wide mb-1">
                  {t('welcome.badgeFree', 'FREE')}
                </div>
                <div className="text-ink-3 text-sm">
                  {t('welcome.startLocalDesc', 'Your data is saved on this device only.')}
                </div>
              </button>
            )}

            {/* Use Cloud Sync - only if Supabase is configured */}
            {isCloudAvailable && (
              <button
                onClick={onUseCloudSync}
                className={`${cardStyle} block w-full min-h-14 text-left transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-action`}
                aria-label={t('welcome.useCloudSyncAria', 'Use cloud sync, access from any device')}
              >
                <div className="text-ink font-semibold text-lg">
                  {t('welcome.useCloudSync', 'Use Cloud Sync')}
                </div>
                <div className="text-win text-xs font-semibold uppercase tracking-wide mb-1">
                  {t('welcome.badgeFree', 'FREE')}
                </div>
                <div className="text-ink-3 text-sm">
                  {t('welcome.useCloudSyncDesc', 'Sync your data across all your devices.')}
                </div>
              </button>
            )}
            {/* Settings note — only shown when there's actually a choice to change */}
            {!hideLocalModeOptions && (
              <p className="text-ink-3 text-sm text-center pt-1">
                {t('welcome.changeInSettings', 'You can change this later in Settings')}
              </p>
            )}
          </div>

          {/* Footer: Import backup — hidden in Play Store (available via Settings after auth) */}
          {!hideLocalModeOptions && (
            <div className="text-center mt-3">
              <button
                onClick={onImportBackup}
                disabled={isImporting}
                className={`${linkStyle} inline-flex min-h-11 items-center text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label={isImporting ? t('welcome.importingAria', 'Importing backup file') : t('welcome.importBackupAria', 'Import backup file')}
              >
                {isImporting
                  ? t('welcome.importing', 'Importing...')
                  : t('welcome.haveBackup', 'Have a backup file?')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
