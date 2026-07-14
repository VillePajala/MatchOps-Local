'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { saveLanguagePreference } from '@/i18n';
// Note: Do NOT import updateAppSettings here. StartScreen is for local mode,
// and calling updateAppSettings could cause DataStore conflicts when switching modes.
import RecommendedSetupCard, { type SetupProgress } from '@/components/RecommendedSetupCard';
import { useAuth } from '@/contexts/AuthProvider';
import { isAndroid } from '@/utils/platform';

interface StartScreenProps {
  onLoadGame: () => void;
  onResumeGame?: () => void;
  onGetStarted: () => void;
  onViewStats: () => void;
  onOpenSettings: () => void;
  /** Home tab: master roster / teams / personnel (opens the existing modal). */
  onManageRoster?: () => void;
  /** Home tab: seasons & tournaments (opens the existing modal). */
  onManageSeasons?: () => void;
  /** Called on Android to enable cloud sync (shows upgrade modal if not premium) */
  onEnableCloudSync?: () => void;
  /** Called on desktop for existing subscribers to sign in (bypasses premium check) */
  onSignInExistingSubscriber?: () => void;
  /** Called to navigate back to the welcome/setup screen */
  onShowWelcome?: () => void;
  canResume?: boolean;
  hasSavedGames?: boolean;
  isFirstTimeUser?: boolean;
  isCloudAvailable?: boolean;
  /** Completion signals for the recommended full-setup workflow card. */
  setupProgress?: SetupProgress;
}

const StartScreen: React.FC<StartScreenProps> = ({
  onLoadGame,
  onResumeGame,
  onGetStarted,
  onViewStats,
  onOpenSettings,
  onManageRoster,
  onManageSeasons,
  onEnableCloudSync,
  onSignInExistingSubscriber,
  onShowWelcome,
  canResume = false,
  hasSavedGames = false,
  isFirstTimeUser = false,
  isCloudAvailable = false,
  setupProgress,
}) => {
  const { t } = useTranslation();
  const { user, mode, signOut } = useAuth();
  // SSR-safe initial value: must match i18n.ts default ('fi') so the server-rendered
  // HTML and the first client render produce identical markup. Reading i18n.language
  // here directly causes a hydration mismatch when localStorage holds a non-default
  // language (MATCHOPS-LOCAL-8K / MATCHOPS-LOCAL-3). The real value is adopted
  // post-hydration via useEffect below.
  const [language, setLanguage] = useState<string>('fi');

  // Recommended-setup card dismissal. Read post-hydration (SSR-safe, like language):
  // both server and first client render show nothing until setupHydrated flips true.
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [setupHydrated, setSetupHydrated] = useState(false);
  const setupDismissKey = `matchops_recommended_setup_dismissed_${user?.id ?? 'local'}`;

  const isCloudMode = mode === 'cloud' && user;

  useEffect(() => {
    try {
      // eslint-disable-next-line no-restricted-globals -- one-time UI dismissal flag, not app data
      setSetupDismissed(localStorage.getItem(setupDismissKey) === '1');
    } catch {
      // localStorage unavailable — treat as not dismissed
    }
    setSetupHydrated(true);
  }, [setupDismissKey]);

  const handleDismissSetup = () => {
    setSetupDismissed(true);
    try {
      // eslint-disable-next-line no-restricted-globals -- one-time UI dismissal flag, not app data
      localStorage.setItem(setupDismissKey, '1');
    } catch {
      // localStorage unavailable — dismissal won't persist, acceptable
    }
  };

  const setupComplete = !!setupProgress &&
    setupProgress.players && setupProgress.competition && setupProgress.team && setupProgress.teamLinkedGame;
  const showSetupCard = !isFirstTimeUser && setupHydrated && !setupDismissed && !!setupProgress && !setupComplete;

  // Adopt the real i18n language once on the client, after hydration has completed.
  useEffect(() => {
    if (i18n.language !== language) {
      setLanguage(i18n.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    i18n.changeLanguage(language);
    // Save to localStorage (i18n loads from here on init).
    // DO NOT call updateAppSettings here - StartScreen is shown in local mode,
    // so calling it could cause DataStore initialization conflicts if user switches modes.
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

        {/* === TOP: Welcome Link + Language Switcher === */}
        <div className="flex justify-between items-center mb-4">
          {/* Welcome screen link - local mode only */}
          {!isCloudMode && onShowWelcome ? (
            <button
              type="button"
              onClick={onShowWelcome}
              className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('startScreen.welcomeScreen', 'Welcome')}
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={t('startScreen.appSettings', 'Settings')}
              className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm text-slate-300 hover:text-white hover:bg-slate-700/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
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
        </div>

        {/* === HERO: App Name (top-anchored - the Home shell of the two-level
            restructure; the tab bar below is the club-level navigation) === */}
        <div className={`flex-1 flex flex-col ${isFirstTimeUser ? 'justify-start pt-[20vh]' : 'justify-start pt-[6vh]'}`}>
          <div className="text-center mb-6">
            {/* App Name as Logo */}
            <div className="relative inline-block mb-3">
              <h1 className="relative text-5xl sm:text-6xl font-bold tracking-tight">
                <span className="text-amber-400">MatchOps</span>
              </h1>
            </div>

            {/* Tagline */}
            <p className="text-lg text-slate-400">
              {t('startScreen.tagline', 'Plan · Track · Discover')}
            </p>
          </div>

          {/* === HOME TABS (two-level restructure PR 1.2, strangler stage):
              Pelit is this page; the other tabs OPEN THE EXISTING MODALS
              unchanged. Phase 2 dissolves the modals into real tab content. === */}
          {!isFirstTimeUser && (
            <div className="max-w-sm mx-auto w-full mb-5" role="tablist" aria-label={t('startScreen.homeTabs', 'Home sections')}>
              <div className="flex gap-1.5 rounded-xl bg-slate-800/70 border border-slate-700/60 backdrop-blur-sm p-1.5">
                <button
                  type="button"
                  role="tab"
                  aria-selected="true"
                  className="flex-1 px-2 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white shadow-inner"
                >
                  {t('startScreen.tabGames', 'Games')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected="false"
                  onClick={onManageRoster}
                  disabled={!onManageRoster}
                  className={`flex-1 px-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    onManageRoster
                      ? 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                      : 'text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {t('startScreen.tabTeam', 'Team')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected="false"
                  onClick={onManageSeasons}
                  disabled={!onManageSeasons}
                  className={`flex-1 px-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    onManageSeasons
                      ? 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                      : 'text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {t('startScreen.tabSeasons', 'Seasons')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected="false"
                  onClick={hasSavedGames ? onViewStats : undefined}
                  disabled={!hasSavedGames}
                  className={`flex-1 px-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    hasSavedGames
                      ? 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                      : 'text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {t('startScreen.tabStats', 'Stats')}
                </button>
              </div>
            </div>
          )}

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

              </>
            )}
          </div>

          {/* Recommended setup card — teaches the fuller workflow to quick-path users */}
          {showSetupCard && setupProgress && (
            <RecommendedSetupCard progress={setupProgress} onDismiss={handleDismissSetup} />
          )}

          {/* Footer links: Settings + User Guide side by side. The Start Screen is where
              every reload lands, so the full guide stays one tap away here. */}
          <div className="mt-6 flex items-center justify-center gap-3 text-sm">
            <a
              href="https://www.match-ops.com/guide"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-amber-400 transition-colors"
            >
              {t('controlBar.userGuide', 'User Guide')}
            </a>
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
    </div>
  );
};

export default StartScreen;
