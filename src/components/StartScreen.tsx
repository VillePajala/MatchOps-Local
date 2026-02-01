'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { saveLanguagePreference } from '@/i18n';
// Note: Do NOT import updateAppSettings here. StartScreen is for local mode,
// and calling updateAppSettings could cause DataStore conflicts when switching modes.
import InstructionsModal from '@/components/InstructionsModal';
import logger from '@/utils/logger';
import { useAuth } from '@/contexts/AuthProvider';
import { isAndroid } from '@/utils/platform';

interface StartScreenProps {
  onLoadGame: () => void;
  onResumeGame?: () => void;
  onGetStarted: () => void;
  onViewStats: () => void;
  onOpenSettings: () => void;
  /** Called on Android to enable cloud sync (shows upgrade modal if not premium) */
  onEnableCloudSync?: () => void;
  /** Called on desktop for existing subscribers to sign in (bypasses premium check) */
  onSignInExistingSubscriber?: () => void;
  canResume?: boolean;
  hasSavedGames?: boolean;
  isFirstTimeUser?: boolean;
  isCloudAvailable?: boolean;
}

const StartScreen: React.FC<StartScreenProps> = ({
  onLoadGame,
  onResumeGame,
  onGetStarted,
  onViewStats,
  onOpenSettings,
  onEnableCloudSync,
  onSignInExistingSubscriber,
  canResume = false,
  hasSavedGames = false,
  isFirstTimeUser = false,
  isCloudAvailable = false,
}) => {
  const { t } = useTranslation();
  const { user, mode, signOut } = useAuth();
  const [language, setLanguage] = useState<string>(i18n.language);
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);

  const isCloudMode = mode === 'cloud' && user;

  // Language is already loaded from localStorage by i18n on initialization.
  // i18n.language is the source of truth - no need to call getAppSettings().
  // This avoids DataStore initialization conflicts (MATCHOPS-LOCAL-2N).

  useEffect(() => {
    i18n.changeLanguage(language);
    // Save to localStorage (i18n loads from here on init).
    // DO NOT call updateAppSettings here - StartScreen is shown in local mode,
    // so calling it could cause DataStore initialization conflicts if user switches modes.
    saveLanguagePreference(language);
  }, [language]);

  const isEnglish = language === 'en';

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
        <div className={`flex-1 flex flex-col ${isFirstTimeUser ? 'justify-start pt-[20vh]' : 'justify-center'}`}>
          <div className="text-center mb-6">
            {/* App Name as Logo */}
            <div className="relative inline-block mb-3">
              <h1 className="relative text-5xl sm:text-6xl font-bold tracking-tight">
                <span className="text-amber-400">MatchOps</span>
              </h1>
            </div>

            {/* Tagline */}
            <p className="text-lg text-slate-400">
              {isEnglish ? 'Plan · Track · Assess' : 'Suunnittele · Kirjaa · Arvioi'}
            </p>
          </div>

          {/* === ACTION BUTTONS === */}
          <div className="max-w-sm mx-auto w-full space-y-3">
            {isFirstTimeUser ? (
              /* First-time user: single prominent button */
              <button
                type="button"
                onClick={onGetStarted}
                className="w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-bold text-lg hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
              >
                {t('startScreen.getStarted', 'Get Started')}
              </button>
            ) : (
              /* Returning user: menu */
              <>
                {/* Primary action: Continue or New Game */}
                {canResume ? (
                  <button
                    type="button"
                    onClick={onResumeGame}
                    className="w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-bold text-lg hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
                  >
                    {t('startScreen.continue', 'Continue')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onGetStarted}
                    className="w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-bold text-lg hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
                  >
                    {t('startScreen.newGame', 'New Game')}
                  </button>
                )}

                {/* Secondary actions: 2-column grid */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={onLoadGame}
                    className="p-4 rounded-xl bg-slate-800/90 border-2 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50 transition-all"
                  >
                    <span className="text-sm font-semibold text-white">
                      {t('startScreen.loadGame', 'Load Game')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={hasSavedGames ? onViewStats : undefined}
                    disabled={!hasSavedGames}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      hasSavedGames
                        ? 'bg-slate-800/90 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50'
                        : 'bg-slate-800/40 border-slate-700/40 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${hasSavedGames ? 'text-white' : 'text-slate-500'}`}>
                      {t('startScreen.viewStats', 'Statistics')}
                    </span>
                  </button>
                </div>

                {/* Settings - subtle text link style */}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="w-full py-3 text-slate-400 hover:text-slate-200 transition-all"
                >
                  <span className="text-sm">
                    {t('startScreen.appSettings', 'Settings')}
                  </span>
                </button>
              </>
            )}
          </div>

          {/* Mode footer */}
          {isCloudMode ? (
            <div className="mt-8 text-center text-sm text-slate-500">
              <span>{t('startScreen.signedInAs', 'Signed in as')} </span>
              <span className="text-slate-400">{user.email}</span>
              <span className="mx-2">·</span>
              <button
                type="button"
                onClick={signOut}
                className="text-amber-400 hover:text-amber-300 transition-colors"
              >
                {t('controlBar.signOut', 'Sign Out')}
              </button>
            </div>
          ) : isCloudAvailable && (onEnableCloudSync || onSignInExistingSubscriber) ? (
            isAndroid() ? (
              // Android: Show enable cloud sync (triggers upgrade modal → purchase)
              <div className="mt-8 text-center text-sm text-slate-500">
                <span>{t('startScreen.usingLocalStorage', 'Using local storage')}</span>
                <span className="mx-2">·</span>
                <button
                  type="button"
                  onClick={onEnableCloudSync}
                  className="text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {t('startScreen.enableCloudSync', 'Enable Cloud Sync →')}
                </button>
              </div>
            ) : (
              // Desktop: Show sign in for existing subscribers + Play Store link for new users
              <div className="mt-8 text-center text-sm">
                <div className="text-slate-500 mb-2">
                  {t('startScreen.usingLocalStorage', 'Using local storage')}
                </div>
                {onSignInExistingSubscriber && (
                  <button
                    type="button"
                    onClick={onSignInExistingSubscriber}
                    className="text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    {t('startScreen.existingSubscriber', 'Already a subscriber? Sign in →')}
                  </button>
                )}
                <div className="mt-3 text-slate-500 text-xs">
                  <span>{t('startScreen.newToCloud', 'New here? Subscribe via the Android app.')}</span>
                  <a
                    href="https://play.google.com/store/apps/details?id=com.matchops.local"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400/80 hover:text-amber-300 ml-1"
                  >
                    {t('startScreen.getAndroidApp', 'Get on Google Play')}
                  </a>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>

      {/* Instructions Modal */}
      <InstructionsModal
        isOpen={isInstructionsModalOpen}
        onClose={() => setIsInstructionsModalOpen(false)}
      />
    </div>
  );
};

export default StartScreen;
