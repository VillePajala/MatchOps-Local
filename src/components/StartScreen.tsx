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
  /** Front-page entry: open the Playing-Time Planner. */
  onOpenPlanner?: () => void;
  /** Team panel: teams manager (opens the existing modal). */
  onManageTeams?: () => void;
  /** Team panel: personnel manager (opens the existing modal). */
  onManagePersonnel?: () => void;
  /** Team panel: warmup/training resources (opens the existing modal). */
  onOpenTraining?: () => void;
  /** Gear sheet: settings straight onto the Backup & Restore tab. */
  onOpenBackup?: () => void;
  /** Gear sheet: settings straight onto the cloud Account tab (cloud mode). */
  onOpenAccount?: () => void;
  /** Gear sheet: the rules directory. */
  onOpenRules?: () => void;
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
  onOpenPlanner,
  onManageTeams,
  onManagePersonnel,
  onOpenTraining,
  onOpenBackup,
  onOpenAccount,
  onOpenRules,
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
  const { user, mode } = useAuth();
  // SSR-safe initial value: must match i18n.ts default ('fi') so the server-rendered
  // HTML and the first client render produce identical markup. Reading i18n.language
  // here directly causes a hydration mismatch when localStorage holds a non-default
  // language (MATCHOPS-LOCAL-8K / MATCHOPS-LOCAL-3). The real value is adopted
  // post-hydration via useEffect below.
  const [language, setLanguage] = useState<string>('fi');
  // Which Home panel the body shows (restructure 1.3b): the tabs became REAL
  // tabs - Games (front page) and Team (club entry rows) switch panels here;
  // Seasons/Stats stay one-tap openers for their single-purpose scopes.
  const [activeTab, setActiveTab] = useState<'games' | 'team'>('games');
  // Gear sheet (restructure PR 1.4): the app/account bucket. Everything
  // device- or account-scoped lives here, off the front page.
  const [showGearSheet, setShowGearSheet] = useState(false);

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
              onClick={() => setShowGearSheet(true)}
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
                  aria-selected={activeTab === 'games'}
                  onClick={() => setActiveTab('games')}
                  className={`flex-1 px-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeTab === 'games'
                      ? 'bg-indigo-600 text-white shadow-inner'
                      : 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                  }`}
                >
                  {t('startScreen.tabGames', 'Games')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'team'}
                  onClick={() => setActiveTab('team')}
                  className={`flex-1 px-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeTab === 'team'
                      ? 'bg-indigo-600 text-white shadow-inner'
                      : 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
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
                  {t('startScreen.tabSeasons', 'Competitions')}
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
            ) : activeTab === 'team' ? (
              /* Team panel (restructure 1.3b): every club-people item gets a
                 Home entry - the rows open the EXISTING modals (strangler);
                 phase 2 turns them into page sections. */
              <>
                <button
                  type="button"
                  onClick={onManageRoster}
                  disabled={!onManageRoster}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                    onManageRoster
                      ? 'bg-slate-800/90 border-slate-700/60 hover:bg-slate-700/90'
                      : 'bg-slate-800/40 border-slate-700/40 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="text-sm font-semibold text-white">
                    {t('startScreen.rowPlayers', 'Players')}
                  </span>
                  <span className="text-slate-500" aria-hidden="true">&rsaquo;</span>
                </button>
                <button
                  type="button"
                  onClick={onManageTeams}
                  disabled={!onManageTeams}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                    onManageTeams
                      ? 'bg-slate-800/90 border-slate-700/60 hover:bg-slate-700/90'
                      : 'bg-slate-800/40 border-slate-700/40 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="text-sm font-semibold text-white">
                    {t('startScreen.rowTeams', 'Teams')}
                  </span>
                  <span className="text-slate-500" aria-hidden="true">&rsaquo;</span>
                </button>
                <button
                  type="button"
                  onClick={onManagePersonnel}
                  disabled={!onManagePersonnel}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                    onManagePersonnel
                      ? 'bg-slate-800/90 border-slate-700/60 hover:bg-slate-700/90'
                      : 'bg-slate-800/40 border-slate-700/40 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="text-sm font-semibold text-white">
                    {t('startScreen.rowPersonnel', 'Personnel')}
                  </span>
                  <span className="text-slate-500" aria-hidden="true">&rsaquo;</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenTraining}
                  disabled={!onOpenTraining}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                    onOpenTraining
                      ? 'bg-slate-800/90 border-slate-700/60 hover:bg-slate-700/90'
                      : 'bg-slate-800/40 border-slate-700/40 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="text-sm font-semibold text-white">
                    {t('startScreen.rowTraining', 'Warmup Plan')}
                  </span>
                  <span className="text-slate-500" aria-hidden="true">&rsaquo;</span>
                </button>
                {/* Training CONTENT scope: the coaching materials link lives
                    with the team, not under the gear. */}
                <a
                  href="https://www.palloliitto.fi/valmentajien-materiaalit-jalkapallo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-sm text-slate-400 hover:text-amber-400 transition-colors pt-1"
                >
                  {t('controlBar.coachingMaterials', 'Coaching Materials')} →
                </a>
              </>
            ) : (
              /* Returning user: the Pelit front page (two-level restructure
                 PR 1.3) - resume card, one pinned primary, and full-width
                 entry rows. The Stats/Load grid buttons are gone: the tab bar
                 and the rows below cover both. */
              <>
                {canResume && (
                  <button
                    type="button"
                    onClick={onResumeGame}
                    className="w-full text-left p-4 rounded-xl bg-gradient-to-r from-indigo-800 to-indigo-600 border border-indigo-400/40 shadow-lg shadow-indigo-900/40 hover:from-indigo-700 hover:to-indigo-500 transition-all"
                  >
                    <span className="flex items-center gap-2 text-white font-bold">
                      <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.6)]" aria-hidden="true" />
                      {t('startScreen.resumeCard', 'Resume match')}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onGetStarted}
                  className="w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-bold text-lg hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
                >
                  {t('startScreen.newGame', 'New Game')}
                </button>

                <button
                  type="button"
                  onClick={onLoadGame}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-slate-800/90 border border-slate-700/60 hover:bg-slate-700/90 transition-all"
                >
                  <span className="text-sm font-semibold text-white">
                    {t('startScreen.savedGames', 'Saved games')}
                  </span>
                  <span className="text-slate-500" aria-hidden="true">&rsaquo;</span>
                </button>

                {onOpenPlanner && (
                  <button
                    type="button"
                    onClick={onOpenPlanner}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-slate-800/90 border border-slate-700/60 hover:bg-slate-700/90 transition-all"
                  >
                    <span className="text-sm font-semibold text-white">
                      {t('controlBar.planner', 'Match planner')}
                    </span>
                    <span className="text-slate-500" aria-hidden="true">&rsaquo;</span>
                  </button>
                )}
                {/* Taso is a game-day workflow tool (submit the lineup before,
                    report the result after) - it earns a games-tab link, not a
                    burial under the gear. */}
                <a
                  href="https://taso.palloliitto.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-sm text-slate-400 hover:text-amber-400 transition-colors pt-1"
                >
                  {t('startScreen.tasoLink', 'Taso - lineups & results →')}
                </a>
              </>
            )}
          </div>

          {/* Recommended setup card — teaches the fuller workflow to quick-path users */}
          {showSetupCard && setupProgress && (
            <RecommendedSetupCard progress={setupProgress} onDismiss={handleDismissSetup} />
          )}

        </div>
      </div>

      {/* ⚙ sheet (restructure PR 1.4): every device/account-scope item in one
          bucket - settings, backup, cloud account, guide, rules, external
          links. Entries open the EXISTING modals/links (strangler). */}
      {showGearSheet && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
          onClick={() => setShowGearSheet(false)}
          data-testid="gear-sheet-backdrop"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('startScreen.gearTitle', 'App & account')}
            className="w-full max-w-sm bg-slate-800 border border-slate-600 border-b-0 rounded-t-2xl p-4 pb-6 shadow-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-full bg-slate-600 mx-auto mb-3" aria-hidden="true" />
            <h4 className="text-base font-semibold text-slate-100 mb-3">{t('startScreen.gearTitle', 'App & account')}</h4>
            <div className="space-y-1.5">
              <button type="button" onClick={() => { setShowGearSheet(false); onOpenSettings(); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-100 hover:bg-slate-700/75 transition-colors">
                {t('startScreen.appSettings', 'Settings')}
              </button>
              {onOpenBackup && (
                <button type="button" onClick={() => { setShowGearSheet(false); onOpenBackup(); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-100 hover:bg-slate-700/75 transition-colors">
                  {t('startScreen.gearBackup', 'Backup & Restore')}
                </button>
              )}
              {isCloudMode ? (
                onOpenAccount && (
                  <button type="button" onClick={() => { setShowGearSheet(false); onOpenAccount(); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-100 hover:bg-slate-700/75 transition-colors">
                    {t('startScreen.gearAccount', 'Cloud account')}
                    <span className="block text-xs text-slate-500">{user.email}</span>
                  </button>
                )
              ) : isCloudAvailable && (onEnableCloudSync || onSignInExistingSubscriber) ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowGearSheet(false);
                    (isAndroid() ? onEnableCloudSync : onSignInExistingSubscriber ?? onEnableCloudSync)?.();
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-100 hover:bg-slate-700/75 transition-colors"
                >
                  {t('startScreen.enableCloudSync', 'Enable Cloud Sync →')}
                </button>
              ) : null}
              {onOpenRules && (
                <button type="button" onClick={() => { setShowGearSheet(false); onOpenRules(); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-100 hover:bg-slate-700/75 transition-colors">
                  {t('startScreen.gearRules', 'Rules')}
                </button>
              )}
              <a href="https://www.match-ops.com/guide" target="_blank" rel="noopener noreferrer" className="block w-full px-3 py-2.5 rounded-lg text-sm text-slate-100 hover:bg-slate-700/75 transition-colors">
                {t('controlBar.userGuide', 'User Guide')}
              </a>
              <div className="pt-2 mt-1 border-t border-slate-700/60 px-3 text-xs">
                <a href="https://www.match-ops.com" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-amber-400 transition-colors">match-ops.com</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StartScreen;
