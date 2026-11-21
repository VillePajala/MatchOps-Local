'use client';

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
// Note: Do NOT import updateAppSettings here. StartScreen is for local mode,
// and calling updateAppSettings could cause DataStore conflicts when switching modes.
import { type SetupProgress } from '@/components/RecommendedSetupCard';
import type { HomeSummary } from '@/utils/homeSummary';
import { HomeDashboard, HomeTeamScopeSelect, HomeSeasonHero, HomeStatsHero, HomeTeamsCard, HomeClubCard, HomeIcon, HOME_CARD, HOME_FOCUS, formatDayMonth } from '@/components/HomeDashboard';
import type { HomeCompetition } from '@/utils/homeSummary';
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe';
import { APP_VERSION } from '@/config/constants';
import { commonClubName } from '@/utils/homeTeamScope';
import { useAuth } from '@/contexts/AuthProvider';
import HomeBasic from '@/components/HomeBasic';
import { useNextGamePlan } from '@/hooks/useNextGamePlan';
import type { AppLayout } from '@/types/settings';
import { isAndroid } from '@/utils/platform';
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlineChevronRight,
  HiOutlineUsers,
  HiOutlineUserGroup,
  HiOutlineClipboardDocumentList,
  HiOutlineBookOpen,
  HiOutlineAcademicCap,
  HiOutlineCalendarDays,
  HiOutlineTrophy,
  HiOutlineChartBar,
  HiOutlineUserCircle,
  HiOutlineRectangleStack,
  HiOutlineFolderOpen,
  HiOutlineGlobeAlt,
  HiOutlineClipboard,
  HiOutlineCog6Tooth,
  HiOutlineArchiveBoxArrowDown,
  HiOutlineCloud,
  HiOutlineCloudArrowUp,
  HiOutlineQuestionMarkCircle,
  HiOutlineDocumentText,
  HiOutlineArrowRightStartOnRectangle,
  HiOutlinePlayCircle,
} from 'react-icons/hi2';
import { TASO_URL } from '@/config/externalLinks';
import { useAccountFeatures } from '@/hooks/useAccountFeatures';
import { lazyModal } from '@/components/lazyModal';

/**
 * Pelitapa (hidden behind the server-side 'pelitapa' account flag): its own
 * chunk, fetched only when opened - kept out of the background warm-up so an
 * account without the flag never downloads it.
 */
const PelitapaPresentation = lazyModal(() => import('@/pelitapa/PelitapaPresentation'), { warm: false });

/**
 * HOME, S1 "SYKE REFINED" (owner-approved, phase 1 of 3). Colours and fonts
 * come from the role-named tokens in globals.css; the multi-layer surfaces
 * (s1-list, s1-primary, s1-ghost, s1-sheet, s1-tabbar) live there too.
 *
 * Rows are LIST ITEMS inside a group, not cards:
 *   HomeGroup + HomeRow  - navigation. One solid surface, hairline dividers
 *                          that start after the icon.
 *   cards (HomeDashboard) - information worth its own surface.
 *
 * One icon family (Heroicons outline), one size (22px), one colour (ink-2)
 * for every row; a real chevron for in-app destinations, the corner arrow for
 * external ones. Rows are at least 56px tall with 16px labels.
 */

/** Vertical rhythm between blocks (the mock's 14px). */
const STACK = 'flex flex-col gap-3.5';

const ROW_BASE =
  'group/row relative w-full flex items-stretch gap-3.5 pl-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action first:rounded-t-[22px] last:rounded-b-[22px]';
const ROW_ON = 'hover:bg-white/[0.04] active:bg-white/[0.06]';
const ROW_OFF = 'opacity-40 cursor-not-allowed';
/** The row's text area carries the divider, so it starts after the icon. A
 *  minimum height plus padding, not a fixed height: a label that wraps to two
 *  lines gets room instead of touching the dividers. */
const ROW_RULE = 'flex min-h-14 flex-1 min-w-0 items-center gap-3 py-2.5 pr-4 border-t border-hairline group-first/row:border-transparent';
const ROW_ICON = 'w-[22px] h-[22px] flex-shrink-0 self-center text-ink-2';
// Labels wrap rather than truncate: "Taso - kokoonpanot ja tulokset" lost its last word at 16px.
const ROW_LABEL = 'flex-1 min-w-0 break-words text-left text-base font-semibold leading-snug text-ink';
/** Counts are numerals: Barlow Condensed italic, like every number on Home. */
const ROW_COUNT = 'flex-shrink-0 pr-[2px] font-display text-lg font-bold italic leading-none tabular-nums text-ink-2';
const ROW_CHEVRON = <HiOutlineChevronRight className="w-4 h-4 flex-shrink-0 text-ink-3" aria-hidden="true" />;
/** A row whose tap adds the first one: a plus, not a chevron. */
const ROW_ADD = <HomeIcon name="plus" className="h-[18px] w-[18px] flex-shrink-0 text-ink-3" strokeWidth={2} />;
const ROW_EXTERNAL = <HiOutlineArrowTopRightOnSquare className="w-[18px] h-[18px] flex-shrink-0 text-ink-3" aria-hidden="true" />;

/** The container that makes a run of rows one object instead of several. */
const HomeGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={`${HOME_CARD} flex flex-col`}>
    {children}
  </div>
);

type RowIcon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

const HomeRow: React.FC<{
  icon: RowIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
  /** Trailing element: a chevron by default, or a custom node (a step badge). */
  trailing?: React.ReactNode;
  /** How many of the thing the row opens (shown before the chevron). Omit while unknown. */
  count?: number;
  /** One short line under the label saying what is behind the row. */
  subtitle?: string;
}> = ({ icon: Icon, label, onClick, disabled, testId, trailing, count, subtitle }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    data-testid={testId}
    className={`${ROW_BASE} ${disabled ? ROW_OFF : ROW_ON}`}
  >
    <Icon className={ROW_ICON} aria-hidden="true" />
    <span className={ROW_RULE}>
      {subtitle ? (
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-semibold leading-snug text-ink">{label}</span>
          <span className="block break-words text-[13px] leading-tight text-ink-3">{subtitle}</span>
        </span>
      ) : (
        <span className={ROW_LABEL}>{label}</span>
      )}
      {count !== undefined && <span className={ROW_COUNT}>{count}</span>}
      {trailing ?? ROW_CHEVRON}
    </span>
  </button>
);

/** Same row, for a destination outside the app. The corner icon is honest. */
const HomeLinkRow: React.FC<{ icon: RowIcon; label: string; subtitle?: string; href: string }> = ({ icon: Icon, label, subtitle, href }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={`${ROW_BASE} ${ROW_ON}`}>
    <Icon className={ROW_ICON} aria-hidden="true" />
    <span className={ROW_RULE}>
      {subtitle ? (
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-semibold leading-snug text-ink">{label}</span>
          <span className="block break-words text-[13px] leading-tight text-ink-3">{subtitle}</span>
        </span>
      ) : (
        <span className={ROW_LABEL}>{label}</span>
      )}
      {ROW_EXTERNAL}
    </span>
  </a>
);

/** The amber primary pill (the one "press this" on a screen). */
const PRIMARY_BTN = `s1-primary w-full flex h-14 items-center justify-center gap-2.5 rounded-full px-5 text-base font-bold transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed ${HOME_FOCUS}`;
/** The outline secondary pill. */
const GHOST_BTN = `s1-ghost flex h-12 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold text-ink transition-colors ${HOME_FOCUS}`;

/** A row in a bottom sheet: same group/row grammar - and the same line icons - as the Home tabs. */
const SHEET_ROW = `${ROW_BASE} ${ROW_ON} pl-4`;
const SHEET_ROW_RULE = ROW_RULE;

/** Step badge on an onboarding row. */
const StepBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="flex-shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2">{children}</span>
);

/**
 * The subtitle under a Kilpailut row: the league or tournament it is about
 * ("IPS Talviturnaus · 28.2." - a tournament's date is the point of it).
 */
const competitionSubtitle = (c: HomeCompetition | null | undefined, withDate: boolean): string | undefined => {
  if (!c) return undefined;
  const date = withDate && c.startDate ? formatDayMonth(c.startDate) : '';
  return date ? `${c.name} · ${date}` : c.name;
};

type HomeTabId = 'games' | 'team' | 'seasons' | 'stats';
/** The tab bar's order, which swiping follows. */
const HOME_TAB_ORDER: HomeTabId[] = ['games', 'team', 'seasons', 'stats'];

interface StartScreenProps {
  onLoadGame: () => void;
  /** Stats tab: "Täydennä pelaajan tilastoja", the player-stats additions modal with the player picked first. */
  onAddExternalGame?: () => void;
  onResumeGame?: () => void;
  /** Persists this match's own arrival buffer / measured drive time. */
  onAdjustTravel?: (id: string, next: { arrivalBufferMinutes?: number; travelMinutes?: number }) => void;
  onGetStarted: () => void;
  /** New Game row: opens the lifted NewGameSetup in place (L.3b). Falls back
   *  to onGetStarted (the old enter-the-workspace behavior) when absent. */
  onNewGame?: () => void;
  onViewStats: () => void;
  /** Stats panel rows mirror the aggregate tabs (W8): open club stats on one. */
  onViewStatsTab?: (tab: 'season' | 'tournament' | 'overall' | 'player') => void;
  /** Tilastot's "Joukkueet" rows: that team's stats ('' = games naming no team). */
  onViewTeamStats?: (teamId: string) => void;
  /** Kilpailut's "Sarjat / Turnaukset" rows with none yet: the add sheet. */
  onAddCompetition?: (kind: 'season' | 'tournament') => void;
  /** Gear sheet: direct sign out (cloud mode only). */
  onSignOut?: () => void;
  onOpenSettings: () => void;
  /** Home tab: master roster / teams / personnel (opens the existing modal). */
  onManageRoster?: () => void;
  /** Home tab: seasons & tournaments (opens the existing modal). */
  onManageSeasons?: () => void;
  /** Teams the coach can scope Home to, and the current choice. */
  teamScopeOptions?: Array<{ id: string; label: string; color?: string }>;
  teamScope?: string;
  onTeamScopeChange?: (scope: string) => void;
  onManageTournaments?: () => void;
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
  /** Gear sheet: the in-app "How it works" guide. */
  onOpenGuide?: () => void;
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
  /** Computed Pelit-tab dashboard data (resume, Vuosi record, recent games). */
  homeSummary?: HomeSummary | null;
  /** Tilastot tab only: the same summary narrowed to the chosen team. */
  homeStatsSummary?: HomeSummary | null;
  /** Recent-strip deep-link: open a specific saved game by id. */
  onOpenGameById?: (id: string) => void;
  /**
   * Which layout Home renders (Onboarding v3): 'basic' (Perusnäkymä, no tab
   * bar), 'full' (the tabbed Home), or 'loading' while the account's setting is
   * not known yet - then the body stays empty rather than flash either one.
   */
  appLayout?: AppLayout | 'loading';
  /** "Vaihda koko näkymään" at the bottom of the basic Home. */
  onSwitchToFullLayout?: () => void;
  /** "Ketkä ovat paikalla?" for a game ('start' opens the game afterwards). */
  onOpenAttendance?: (gameId: string, mode: 'save' | 'start') => void;
  /** "Näytä suunnitelma" for a one-game plan: the compact plan screen. */
  onShowPlan?: (planId: string, gameId: string) => void;
  /** "Näytä suunnitelma" for a game of a multi-game plan: the planner on that game. */
  onOpenPlannerAt?: (planId: string, planGameId: string) => void;
  /** Basic Home: "Siirrä päivää" on a game that never started (R2). */
  onMoveGameDate?: (gameId: string, gameDate: string) => Promise<boolean>;
  /** Basic Home: "Poista" on a game that never started (R2). */
  onDeleteGame?: (gameId: string) => Promise<boolean>;
  /** Basic Home: "Lisää pelaajat" with no players yet (R12). */
  onAddPlayers?: (names: string[]) => Promise<number>;
}

const StartScreen: React.FC<StartScreenProps> = ({
  onLoadGame,
  onAddExternalGame,
  onResumeGame,
  onAdjustTravel,
  onGetStarted,
  onNewGame,
  onViewStats,
  onViewStatsTab,
  onViewTeamStats,
  onAddCompetition,
  onSignOut,
  onOpenSettings,
  onManageRoster,
  teamScopeOptions,
  teamScope,
  onTeamScopeChange,
  onManageSeasons,
  onManageTournaments,
  onOpenPlanner,
  onManageTeams,
  onManagePersonnel,
  onOpenTraining,
  onOpenBackup,
  onOpenAccount,
  onOpenRules,
  onOpenGuide,
  onEnableCloudSync,
  onSignInExistingSubscriber,
  onShowWelcome,
  canResume = false,
  hasSavedGames = false,
  isFirstTimeUser = false,
  isCloudAvailable = false,
  setupProgress,
  homeSummary,
  homeStatsSummary,
  onOpenGameById,
  appLayout = 'full',
  onSwitchToFullLayout,
  onOpenAttendance,
  onShowPlan,
  onOpenPlannerAt,
  onMoveGameDate,
  onDeleteGame,
  onAddPlayers,
}) => {
  const { t } = useTranslation();
  const { hasFeature } = useAccountFeatures();
  const pelitapaOn = hasFeature('pelitapa');
  const [pelitapaOpen, setPelitapaOpen] = useState(false);
  // Dashboard is the default view, but it only renders once there are games to
  // summarise - a brand-new coach (no games yet) still gets the simple launcher.
  // The full layout always shows the dashboard once there are games: the old
  // compact launcher ("Etusivun kortit: tiivis") was retired 2026-11-19 - the
  // basic layout (Perusnäkymä) now serves coaches who want a simpler Home.
  const dashboardOn = !isFirstTimeUser && hasSavedGames;
  // Entity counts on the Club / Competitions rows - only once the enriched
  // summary has loaded, so a still-loading 0 never reads as "you have none".
  const counts = homeSummary?.countsReady ? homeSummary.counts : undefined;
  // Kilpailut's rows: club-wide, like its season hero. Undefined until loaded.
  const competitions = homeSummary?.competitions;
  // Tilastot reads the team-scoped copy of the summary.
  const statsSummary = homeStatsSummary ?? homeSummary;
  // Its record and goal-difference tiles open overall stats; a "Joukkueet"
  // row opens overall stats filtered to that team.
  const openOverall = onViewStatsTab ? () => onViewStatsTab('overall') : onViewStats;
  // Club card title: the app has no club-name field, so it shows a club name
  // only when every team's name starts with the same one ("Kotkat P12",
  // "Kotkat T11" -> "Kotkat"); otherwise the neutral "Seura".
  const clubName = commonClubName((teamScopeOptions ?? []).map((o) => o.label));
  // "Täydennä pelaajan tilastoja" on the Tilastot tab, null without a handler.
  const externalGameRow = onAddExternalGame ? (
    <HomeRow
      icon={HiOutlineGlobeAlt}
      label={t('startScreen.addExternalGame', 'Add to player stats')}
      onClick={onAddExternalGame}
      testId="home-add-external-game"
    />
  ) : null;
  // With nothing to resume, "New Game" is the day-one hero: it's the single
  // action a new coach needs (players are added inside the new-game flow). When
  // there's a game to resume, Continue is the hero and New Game steps back to a row.
  const newGamePrimary = !canResume && !dashboardOn;

  // Onboarding v2 (PR 20): pre-first-game composition. Until the first game
  // exists, the Pelit page itself is the checklist - the HERO is the next
  // missing step (players -> team -> game) and the other steps stay visible as
  // ordered rows (reorder, never hide - owner decision). Once a game exists
  // (or one is resumable) the screen returns to its normal shape for good.
  const composeOnboarding = !!setupProgress && !hasSavedGames && !canResume;
  const heroStep: 'players' | 'team' | 'game' | null = !composeOnboarding
    ? null
    : !setupProgress.players
      ? 'players'
      : !setupProgress.team
        ? 'team'
        : 'game';
  const { user, mode } = useAuth();
  const isBasic = appLayout === 'basic';
  const layoutKnown = appLayout !== 'loading';
  // The app language (shared with every other language control; hydration-safe).
  const [language, changeLanguage] = useAppLanguage();
  // The full layout's next-match card: "Näytä suunnitelma" / "Jaa" when the
  // game has a plan - the same lookup and actions as the basic card. Only in
  // the full layout (HomeBasic runs its own) and only with the dashboard on.
  const fullNextPlan = useNextGamePlan({
    game: layoutKnown && !isBasic && dashboardOn ? homeSummary?.upcoming : undefined,
    refreshKey: homeSummary,
    onShowPlan,
    onOpenPlannerAt,
    locale: language,
    t,
  });
  // Which Home panel the body shows (restructure 1.3b): the tabs became REAL
  // tabs - Games (front page) and Team (club entry rows) switch panels here;
  // Seasons/Stats stay one-tap openers for their single-purpose scopes.
  const [activeTab, setActiveTab] = useState<HomeTabId>('games');
  // Which way the last SWIPE moved, for the content's slide-in (null after a
  // tab tap: a tap needs no motion to explain it). Reduced motion: none.
  const [slideDir, setSlideDir] = useState<'fwd' | 'back' | null>(null);
  // Gear sheet (restructure PR 1.4): the app/account bucket. Everything
  // device- or account-scoped lives here, off the front page.
  const [showGearSheet, setShowGearSheet] = useState(false);

  const isCloudMode = mode === 'cloud' && user;

  /**
   * Switching the language is an ACTION, not a state sync.
   *
   * This used to be an effect keyed on `language`, and that effect fed a loop
   * the owner hit in production: this component's `language` starts at 'fi'
   * (the SSR-safe default above), so on every mount the effect fired
   * changeLanguage('fi') with the pre-adopt value still in its closure - which
   * silently reverted the coach's choice and emitted `languageChanged`. That
   * event rebuilds `t`, which rebuilds applyTeamScope -> checkAppState in
   * page.tsx, which re-runs the app-state check, which unmounts this screen
   * behind a loading gate. Remounting fired the effect again. Home flickered
   * between fi and en, re-reading the roster and every saved game each pass.
   *
   * Doing the work in the click handler makes that structurally impossible:
   * nothing changes the language unless a coach asked for it.
   */
  const handleChangeLanguage = changeLanguage;

  // Onboarding step rows (pre-first-game composition): which pending steps
  // stay visible as rows below the hero step.
  const showPlayersStep = heroStep !== 'players' && !setupProgress?.players;
  const showTeamStep = heroStep !== 'team' && !setupProgress?.team;
  const showGameStep = heroStep !== 'game';

  /**
   * New Game in the outline style, for when something else is the hero. Its
   * "+" is neutral (owner, 2026-11-19): amber is the screen's one primary
   * action, and this is not it.
   */
  const newGameGhost = (
    <button
      type="button"
      onClick={onNewGame ?? onGetStarted}
      data-testid="tour-new-game"
      className={`${GHOST_BTN} w-full`}
    >
      <HomeIcon name="plus" className="h-5 w-5 text-ink-2" strokeWidth={2.2} />
      <span className="truncate">{t('startScreen.newGame', 'New Game')}</span>
    </button>
  );

  const tabs: Array<{ id: HomeTabId; label: string; testId?: string }> = [
    { id: 'games', label: t('startScreen.tabGames', 'Games'), testId: 'tour-tab-games' },
    { id: 'team', label: t('startScreen.tabTeam', 'Club'), testId: 'tour-tab-club' },
    // 3.1b (owner feedback 2026-07-17): Kaudet & Tilastot are REAL tabs - same
    // panel-switching behavior as the first two. A tab that popped a modal
    // directly broke the tab contract.
    { id: 'seasons', label: t('startScreen.tabSeasons', 'Competitions') },
    { id: 'stats', label: t('startScreen.tabStats', 'Stats') },
  ];

  // Swiping the tab content moves to the next / previous tab (full layout
  // only; the ends do not wrap). See useHorizontalSwipe for what it ignores.
  const stepTab = useCallback((step: 1 | -1) => {
    const next = HOME_TAB_ORDER[HOME_TAB_ORDER.indexOf(activeTab) + step];
    if (!next) return;
    setSlideDir(step === 1 ? 'fwd' : 'back');
    setActiveTab(next);
  }, [activeTab]);
  const swipe = useHorizontalSwipe({
    enabled: layoutKnown && !isBasic,
    onSwipeLeft: () => stepTab(1),
    onSwipeRight: () => stepTab(-1),
  });

  return (
    <div className="s1-canvas relative flex flex-col h-screen h-[100dvh] overflow-hidden font-ui text-ink antialiased">

      {/* === TOP BAR: wordmark left; language + gear right. The Welcome
          back-link (local mode) sits before the wordmark as a back chevron. === */}
      <header className="relative z-10 flex flex-shrink-0 items-center justify-between gap-2 pl-5 pr-4 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2">
          {!isCloudMode && onShowWelcome && (
            <button
              type="button"
              onClick={onShowWelcome}
              aria-label={t('startScreen.welcomeScreen', 'Welcome')}
              title={t('startScreen.welcomeScreen', 'Welcome')}
              className={`s1-raised -ml-1 grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:text-ink ${HOME_FOCUS}`}
            >
              <HomeIcon name="back" className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
          <h1 className="truncate font-[family-name:var(--font-rajdhani)] text-[28px] font-bold leading-none tracking-[0.01em] text-action">
            MatchOps
          </h1>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {/* Compact in width, but each button is the full 44px tall touch
              target; the lifted pill inside it is only the visual. */}
          <div className="s1-raised flex h-11 rounded-full px-0.5 text-[13px] font-bold tracking-[0.06em]">
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
          <button
            type="button"
            onClick={() => setShowGearSheet(true)}
            aria-label={t('startScreen.appSettings', 'Settings')}
            className={`s1-raised grid h-11 w-11 place-items-center rounded-full text-ink-2 transition-colors hover:text-ink ${HOME_FOCUS}`}
          >
            <HomeIcon name="gear" className="h-5 w-5" strokeWidth={1.6} />
          </button>
        </div>
      </header>

      {/* === MAIN CONTENT === Scrolls when content exceeds the viewport, so
          the lower rows are never clipped; the tab bar below stays put.
          min-h-0 lets the flex child actually shrink to enable it. */}
      {/* Content fades out under the top bar instead of being cut by a hard edge. */}
      <main
        className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-3 pb-5 [mask-image:linear-gradient(to_bottom,transparent_0,black_14px)]"
        data-testid="home-tab-content"
        {...swipe}
      >
        {/* Keyed by tab so a swipe's slide-in replays on every change. */}
        <div
          key={isBasic ? 'basic' : activeTab}
          className={`mx-auto w-full max-w-md ${STACK} ${isBasic ? 'min-h-full' : ''} ${
            slideDir === 'fwd' ? 'planner-slide-fwd' : slideDir === 'back' ? 'planner-slide-back' : ''
          }`}
        >
          {!layoutKnown ? null : isBasic ? (
            /* Perusnäkymä (Onboarding v3): its own body, no tab bar. */
            <HomeBasic
              summary={homeSummary}
              onOpenGame={(id) => onOpenGameById?.(id)}
              onResumeGame={onResumeGame}
              onNewGame={onNewGame ?? onGetStarted}
              onOpenAttendance={onOpenAttendance}
              onShowPlan={onShowPlan}
              onOpenPlannerAt={onOpenPlannerAt}
              // The team row is the player list in the basic layout (R4).
              onOpenPlayers={onManageRoster ?? onManageTeams}
              onLoadGame={onLoadGame}
              onMoveGameDate={onMoveGameDate}
              onDeleteGame={onDeleteGame}
              onAddPlayers={onAddPlayers}
              onViewStats={onViewStatsTab ? () => onViewStatsTab('overall') : onViewStats}
              onSwitchToFull={onSwitchToFullLayout}
              locale={language}
              t={t}
            />
          ) : (<>

          {/* Tagline - the simple launcher only (the dashboard leads with its
              card; the onboarding composition needs the room). */}
          {activeTab === 'games' && !dashboardOn && !composeOnboarding && (
            <p className="px-1 pt-4 pb-1 font-display text-[clamp(28px,8.5vw,34px)] font-bold leading-none tracking-[0.005em] text-ink">
              {t('startScreen.tagline', 'Plan · Track · Discover')}
            </p>
          )}

          {activeTab === 'team' ? (
            /* Club panel: the club card (owner's pick "A · Seurakortti",
               2026-11-19) - its three counts open the players / teams /
               personnel managers - then the coaching material. Every entry
               opens the EXISTING modal (strangler). */
            <>
              {homeSummary?.countsReady && homeSummary.counts.players === 0 && (
                <p className="px-1 text-center text-sm text-ink-3">{t('startScreen.emptyTeam', 'Start by adding your players.')}</p>
              )}
              <HomeClubCard
                title={clubName ?? t('startScreen.tabTeam', 'Club')}
                showClubEyebrow={!!clubName}
                counts={counts}
                vuosi={homeSummary?.vuosi ?? null}
                onPlayers={onManageRoster}
                onTeams={onManageTeams}
                onPersonnel={onManagePersonnel}
                t={t}
              />

              <p className="px-1 pt-1.5 text-xs font-semibold uppercase tracking-[0.09em] text-ink-3">
                {t('startScreen.clubSectionCoaching', 'Coaching')}
              </p>
              <HomeGroup>
                <HomeRow
                  icon={HiOutlineClipboardDocumentList}
                  label={t('startScreen.rowTraining', 'Warmup Plan')}
                  subtitle={t('startScreen.clubTrainingSub', 'Your pre-game warm-up')}
                  onClick={onOpenTraining}
                  disabled={!onOpenTraining}
                />
                {pelitapaOn && (
                  <HomeRow
                    icon={HiOutlinePlayCircle}
                    label={t('startScreen.rowPelitapa', 'Playing style (test)')}
                    subtitle={t('startScreen.clubPelitapaSub', 'Animated game situations')}
                    onClick={() => setPelitapaOpen(true)}
                    testId="club-pelitapa"
                  />
                )}
                {/* Rules belongs with the coaching material: reference a coach
                    consults, not app configuration. */}
                {onOpenRules && (
                  <HomeRow
                    icon={HiOutlineBookOpen}
                    label={t('startScreen.rowRules', 'Rules')}
                    subtitle={t('startScreen.clubRulesSub', 'Game and league rules')}
                    onClick={onOpenRules}
                    testId="club-rules"
                  />
                )}
                <HomeLinkRow
                  icon={HiOutlineAcademicCap}
                  label={t('controlBar.coachingMaterials', 'Coaching Materials')}
                  subtitle={t('startScreen.clubMaterialsSub', 'Finnish FA coaching materials')}
                  href="https://www.palloliitto.fi/valmentajien-materiaalit-jalkapallo"
                />
              </HomeGroup>
            </>
          ) : activeTab === 'seasons' ? (
            /* Competitions panel (owner, 2026-11-19): a SHORT overview, never a
               second list - the season hero with its form strip, then one row
               each for leagues and tournaments naming the one that matters
               now. The rows open the managers; the page stays one screen tall
               however many competitions there are. */
            <>
              {dashboardOn && homeSummary && (
                <HomeSeasonHero
                  vuosi={homeSummary.vuosi}
                  recent={homeSummary.recent}
                  onOpen={onViewStatsTab ? () => onViewStatsTab('overall') : onViewStats}
                  t={t}
                />
              )}
              {homeSummary?.countsReady && homeSummary.counts.seasons === 0 && homeSummary.counts.tournaments === 0 && (
                <p className="px-1 text-center text-sm text-ink-3">{t('startScreen.emptyCompetitions', 'Create a league or tournament to group your games.')}</p>
              )}
              <HomeGroup>
                {/* With none yet, a row offers adding one instead of a dead 0. */}
                {counts?.seasons === 0 ? (
                  <HomeRow
                    icon={HiOutlineCalendarDays}
                    label={t('seasonTournamentModal.seasons', 'Leagues')}
                    subtitle={t('seasonTournamentModal.addSeason', 'Add League')}
                    onClick={onAddCompetition ? () => onAddCompetition('season') : onManageSeasons}
                    disabled={!onAddCompetition && !onManageSeasons}
                    trailing={ROW_ADD}
                    testId="home-seasons-row"
                  />
                ) : (
                  <HomeRow
                    icon={HiOutlineCalendarDays}
                    label={t('seasonTournamentModal.seasons', 'Leagues')}
                    count={counts?.seasons}
                    subtitle={competitionSubtitle(competitions?.featuredSeason, false)}
                    onClick={onManageSeasons}
                    disabled={!onManageSeasons}
                    testId="home-seasons-row"
                  />
                )}
                {counts?.tournaments === 0 ? (
                  <HomeRow
                    icon={HiOutlineTrophy}
                    label={t('seasonTournamentModal.tournaments', 'Tournaments')}
                    subtitle={t('seasonTournamentModal.addTournament', 'Add Tournament')}
                    onClick={onAddCompetition ? () => onAddCompetition('tournament') : onManageTournaments}
                    disabled={!onAddCompetition && !onManageTournaments}
                    trailing={ROW_ADD}
                    testId="home-tournaments-row"
                  />
                ) : (
                  <HomeRow
                    icon={HiOutlineTrophy}
                    label={t('seasonTournamentModal.tournaments', 'Tournaments')}
                    count={counts?.tournaments}
                    subtitle={competitionSubtitle(competitions?.featuredTournament, true)}
                    onClick={onManageTournaments}
                    disabled={!onManageTournaments}
                    testId="home-tournaments-row"
                  />
                )}
              </HomeGroup>
            </>
          ) : activeTab === 'stats' ? (
            /* Stats panel (W8): one row per aggregate stats tab. Disabled until
               there is a game to aggregate - never silently dead-clickable. */
            <>
              {dashboardOn && statsSummary && (
                <>
                  {/* The team choice narrows only these tiles. Pelit stays
                      club-wide on purpose. */}
                  <HomeTeamScopeSelect
                    teams={teamScopeOptions ?? []}
                    scope={teamScope ?? 'all'}
                    onChange={onTeamScopeChange ?? (() => {})}
                    t={t}
                  />
                  <HomeStatsHero
                    vuosi={statsSummary.vuosi}
                    onOpenOverall={openOverall}
                    t={t}
                  />
                  <HomeTeamsCard
                    summary={statsSummary}
                    teams={teamScopeOptions ?? []}
                    onOpenTeam={onViewTeamStats}
                    t={t}
                  />
                </>
              )}
              {!hasSavedGames && (
                <p className="px-1 text-center text-sm text-ink-3">{t('startScreen.emptyStats', "Statistics appear once you've played games.")}</p>
              )}
              {/* The four stats views as ONE grouped list (owner, 2026-11-19),
                  topping up a player's record as its last row - a stats task
                  that works before the first recorded match too. */}
              <HomeGroup>
                {([
                  ['season', t('startScreen.statsSeason', 'League stats'), HiOutlineCalendarDays],
                  ['tournament', t('startScreen.statsTournament', 'Tournament stats'), HiOutlineTrophy],
                  ['overall', t('startScreen.statsOverall', 'Overall stats'), HiOutlineChartBar],
                  ['player', t('startScreen.statsPlayer', 'Player stats'), HiOutlineUserCircle],
                ] as const).map(([tab, label, Icon]) => (
                  <HomeRow
                    key={tab}
                    icon={Icon}
                    label={label}
                    onClick={onViewStatsTab ? () => onViewStatsTab(tab) : onViewStats}
                    disabled={!hasSavedGames}
                    testId={`home-stats-${tab}`}
                  />
                ))}
                {externalGameRow}
              </HomeGroup>
            </>
          ) : (
            /* The Pelit front page (two-level restructure PR 1.3). */
            <>
              {/* Onboarding v2 composition: the amber hero = next missing step
                  (the game step reuses the New Game hero below); the remaining
                  steps render as ordered rows. */}
              {composeOnboarding && heroStep !== 'game' && (
                <button
                  type="button"
                  onClick={heroStep === 'players' ? onManageRoster : onManageTeams}
                  disabled={heroStep === 'players' ? !onManageRoster : !onManageTeams}
                  data-testid={heroStep === 'players' ? 'hero-add-players' : 'hero-create-team'}
                  className={PRIMARY_BTN}
                >
                  {heroStep === 'players'
                    ? t('startScreen.heroAddPlayers', 'Add players')
                    : t('startScreen.heroCreateTeam', 'Create your team')}
                  <HomeIcon name="arrow" className="h-5 w-5" strokeWidth={2.4} />
                </button>
              )}
              {composeOnboarding && (
                <div className="flex flex-col gap-2.5" data-testid="onboarding-steps">
                  {/* DONE steps collapse into one quiet line (owner round 4);
                      pending steps keep their full rows below. */}
                  {(setupProgress?.players || setupProgress?.team) && (
                    <div
                      data-testid="onboarding-done-summary"
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[13px] text-ink-3"
                    >
                      {setupProgress?.players && (
                        <span className="flex items-center gap-1.5">
                          <span className="text-win" aria-hidden="true">✓</span>
                          {t('startScreen.heroAddPlayers', 'Add players')}
                        </span>
                      )}
                      {setupProgress?.team && (
                        <span className="flex items-center gap-1.5">
                          <span className="text-win" aria-hidden="true">✓</span>
                          {t('startScreen.heroCreateTeam', 'Create your team')}
                        </span>
                      )}
                    </div>
                  )}
                  {(showPlayersStep || showTeamStep || showGameStep) && (
                    <HomeGroup>
                      {showPlayersStep && (
                        <HomeRow
                          icon={HiOutlineUsers}
                          label={t('startScreen.heroAddPlayers', 'Add players')}
                          onClick={onManageRoster}
                          disabled={!onManageRoster}
                          trailing={<StepBadge>{t('startScreen.stepBadge', 'Step {{n}}', { n: 1 })}</StepBadge>}
                        />
                      )}
                      {showTeamStep && (
                        <HomeRow
                          icon={HiOutlineUserGroup}
                          label={t('startScreen.heroCreateTeam', 'Create your team')}
                          onClick={onManageTeams}
                          disabled={!onManageTeams}
                          trailing={<StepBadge>{t('startScreen.stepBadge', 'Step {{n}}', { n: 2 })}</StepBadge>}
                        />
                      )}
                      {showGameStep && (
                        <HomeRow
                          icon={HiOutlineClipboard}
                          label={t('startScreen.newGame', 'New Game')}
                          onClick={onNewGame ?? onGetStarted}
                          testId="tour-new-game"
                          trailing={<StepBadge>{t('startScreen.stepBadge', 'Step {{n}}', { n: 3 })}</StepBadge>}
                        />
                      )}
                    </HomeGroup>
                  )}
                </div>
              )}
              {dashboardOn && homeSummary ? (
                /* The dashboard: the hero card for the match this screen is
                   about + the latest results, in place of the plain Continue. */
                <HomeDashboard
                  summary={homeSummary}
                  onResume={onResumeGame}
                  onOpenVuosi={onViewStatsTab ? () => onViewStatsTab('overall') : onViewStats}
                  onOpenGame={onOpenGameById}
                  onAdjustTravel={onAdjustTravel}
                  onNewGame={onNewGame}
                  onSetStartingPoint={onOpenSettings}
                  onMarkAbsences={onOpenAttendance ? (id) => onOpenAttendance(id, 'save') : undefined}
                  nextMatchPlan={
                    fullNextPlan.state === 'ready'
                      ? { onShowPlan: fullNextPlan.showPlan, onShare: fullNextPlan.share }
                      : undefined
                  }
                  afterHero={newGameGhost}
                  locale={language}
                  t={t}
                />
              ) : canResume ? (
                <button type="button" onClick={onResumeGame} className={PRIMARY_BTN}>
                  {t('startScreen.resumeCard', 'Continue')}
                  <HomeIcon name="arrow" className="h-5 w-5" strokeWidth={2.4} />
                </button>
              ) : null}
              {/* New Game is the hero when there's nothing to resume (the new
                  coach adds players inside this flow); otherwise it steps back
                  to the outline style - paired with Saved games in dashboard
                  mode, stacked in the simple launcher. Saved games hides when
                  there are none. */}
              {/* In the dashboard the outline New Game sits right under the
                  hero instead (afterHero above). */}
              {(!composeOnboarding || heroStep === 'game') && !(dashboardOn && homeSummary) && (newGamePrimary ? (
                <>
                  <button
                    type="button"
                    onClick={onNewGame ?? onGetStarted}
                    data-testid="tour-new-game"
                    className={PRIMARY_BTN}
                  >
                    <HomeIcon name="plus" className="h-5 w-5" strokeWidth={2.4} />
                    {t('startScreen.newGame', 'New Game')}
                  </button>
                  {hasSavedGames && (
                    <HomeGroup>
                      <HomeRow
                        icon={HiOutlineFolderOpen}
                        label={t('startScreen.savedGames', 'Saved games')}
                        onClick={onLoadGame}
                      />
                    </HomeGroup>
                  )}
                </>
              ) : (
                /* With a game to resume, the amber action above is the hero and
                   these step back to the outline style. New Game still leads:
                   starting a match is why the app exists. In the dashboard,
                   Saved games joins the navigation rows below instead (a
                   half-width pill truncated its label). */
                <div className="flex flex-col gap-2.5">
                  {newGameGhost}
                  {hasSavedGames && !dashboardOn && (
                    <button type="button" onClick={onLoadGame} className={`${GHOST_BTN} w-full`}>
                      <HomeIcon name="folder" className="h-5 w-5 text-ink-2" strokeWidth={1.9} />
                      <span className="truncate">{t('startScreen.savedGames', 'Saved games')}</span>
                    </button>
                  )}
                </div>
              ))}

              {/* Side entries are DEFERRED while composing (owner round 4);
                  back automatically once a game exists. Taso is a game-day
                  workflow tool - it earns a games-tab row. */}
              {!composeOnboarding && (
                <HomeGroup>
                  {dashboardOn && hasSavedGames && (
                    <HomeRow
                      icon={HiOutlineFolderOpen}
                      label={t('startScreen.savedGames', 'Saved games')}
                      onClick={onLoadGame}
                    />
                  )}
                  {onOpenPlanner && (
                    <HomeRow
                      icon={HiOutlineClipboard}
                      label={t('controlBar.planner', 'Match planner')}
                      onClick={onOpenPlanner}
                    />
                  )}
                  <HomeLinkRow
                    icon={HiOutlineRectangleStack}
                    label={t('startScreen.tasoLink', 'Taso')}
                    subtitle={t('startScreen.tasoSubtitle', 'lineups & results')}
                    href={TASO_URL}
                  />
                </HomeGroup>
              )}
            </>
          )}
          </>)}
        </div>
      </main>

      {/* === HOME TABS (two-level restructure): a bottom tab bar. Pelit is the
          front page; the other tabs switch the panel above. The full layout
          only - the basic layout has no tabs. === */}
      {layoutKnown && !isBasic && (
      <div className="s1-tabbar relative z-10 flex-shrink-0 px-2 pt-0.5 pb-[max(6px,env(safe-area-inset-bottom))]">
        <div
          className="mx-auto grid max-w-md grid-cols-4"
          role="tablist"
          aria-label={t('startScreen.homeTabs', 'Home sections')}
        >
          {tabs.map(({ id, label, testId }) => {
            const on = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                data-testid={testId}
                onClick={() => { setSlideDir(null); setActiveTab(id); }}
                className={`relative flex min-h-[46px] items-center justify-center rounded-xl px-1 text-[13px] font-semibold tracking-[0.01em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action ${
                  on ? 'text-action' : 'text-ink-2 opacity-60 hover:opacity-100'
                }`}
              >
                {/* The selected tab's indicator: the FULL width of its block,
                    flush with the bar's top edge (owner, 2026-11-19) - the
                    bar's 2px top padding is exactly what -top-0.5 undoes, so
                    it never overlaps the label. */}
                {on && (
                  <span
                    aria-hidden="true"
                    data-testid="home-tab-indicator"
                    className="pointer-events-none absolute inset-x-0 -top-0.5 h-[3px] rounded-b-[3px] bg-action"
                  />
                )}
                <span className="max-w-full truncate px-0.5">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* ⚙ sheet (restructure PR 1.4): every device/account-scope item in one
          bucket. Entries open the EXISTING modals/links (strangler). */}
      {showGearSheet && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70"
          onClick={() => setShowGearSheet(false)}
          data-testid="gear-sheet-backdrop"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('startScreen.gearTitle', 'App & account')}
            className="s1-sheet w-full max-w-md max-h-[80vh] overflow-y-auto rounded-t-[28px] px-4 pt-3 pb-[max(24px,env(safe-area-inset-bottom))] font-ui text-ink antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
            <h4 className="mb-2.5 px-1 text-xs font-bold uppercase tracking-[0.16em] text-ink-3">{t('startScreen.gearTitle', 'App & account')}</h4>
            <div className={HOME_CARD + ' flex flex-col'}>
              <button type="button" onClick={() => { setShowGearSheet(false); onOpenSettings(); }} className={SHEET_ROW}>
                <HiOutlineCog6Tooth className={ROW_ICON} aria-hidden="true" />
                <span className={SHEET_ROW_RULE}>
                  <span className={ROW_LABEL}>{t('startScreen.appSettings', 'Settings')}</span>
                  {ROW_CHEVRON}
                </span>
              </button>
              {onOpenBackup && (
                <button type="button" onClick={() => { setShowGearSheet(false); onOpenBackup(); }} className={SHEET_ROW}>
                  <HiOutlineArchiveBoxArrowDown className={ROW_ICON} aria-hidden="true" />
                  <span className={SHEET_ROW_RULE}>
                    <span className={ROW_LABEL}>{t('startScreen.gearBackup', 'Backup & Restore')}</span>
                    {ROW_CHEVRON}
                  </span>
                </button>
              )}
              {isCloudMode ? (
                onOpenAccount && (
                  <button type="button" onClick={() => { setShowGearSheet(false); onOpenAccount(); }} className={SHEET_ROW}>
                    <HiOutlineCloud className={ROW_ICON} aria-hidden="true" />
                    <span className={SHEET_ROW_RULE}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-ink">{t('startScreen.gearAccount', 'Cloud account')}</span>
                        <span className="block truncate text-[13px] text-ink-3">{user.email}</span>
                      </span>
                      {ROW_CHEVRON}
                    </span>
                  </button>
                )
              ) : isCloudAvailable && (onEnableCloudSync || onSignInExistingSubscriber) ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowGearSheet(false);
                    (isAndroid() ? onEnableCloudSync : onSignInExistingSubscriber ?? onEnableCloudSync)?.();
                  }}
                  className={SHEET_ROW}
                >
                  <HiOutlineCloudArrowUp className={ROW_ICON} aria-hidden="true" />
                  <span className={SHEET_ROW_RULE}>
                    <span className={`${ROW_LABEL} text-action`}>{t('startScreen.enableCloudSync', 'Enable Cloud Sync')}</span>
                    {ROW_CHEVRON}
                  </span>
                </button>
              ) : null}
              {/* Rules lives on the Club tab - deliberately NOT duplicated here. */}
              {/* In-app "How it works" guide (rebuilt for the two-level UI). */}
              {onOpenGuide && (
                <button type="button" onClick={() => { setShowGearSheet(false); onOpenGuide(); }} className={SHEET_ROW}>
                  <HiOutlineQuestionMarkCircle className={ROW_ICON} aria-hidden="true" />
                  <span className={SHEET_ROW_RULE}>
                    <span className={ROW_LABEL}>{t('startScreen.gearGuide', 'How it works')}</span>
                    {ROW_CHEVRON}
                  </span>
                </button>
              )}
              <a href="https://www.match-ops.com/guide" target="_blank" rel="noopener noreferrer" className={SHEET_ROW}>
                <HiOutlineDocumentText className={ROW_ICON} aria-hidden="true" />
                <span className={SHEET_ROW_RULE}>
                  <span className={ROW_LABEL}>{t('controlBar.userGuide', 'User Guide')}</span>
                  {ROW_EXTERNAL}
                </span>
              </a>
            </div>
            {/* Direct sign out (3.1b, owner decision 2026-07-17): account-scope
                action, so it lives in the gear. Cloud mode only. Its own group:
                it ends the session rather than opening something. */}
            {isCloudMode && onSignOut && (
              <div className={`${HOME_CARD} mt-3 flex flex-col`}>
                <button
                  type="button"
                  onClick={() => { setShowGearSheet(false); onSignOut(); }}
                  className={SHEET_ROW}
                >
                  <HiOutlineArrowRightStartOnRectangle className={`${ROW_ICON} text-loss`} aria-hidden="true" />
                  <span className={SHEET_ROW_RULE}>
                    <span className={`${ROW_LABEL} text-loss`}>{t('startScreen.gearSignOut', 'Sign out')}</span>
                  </span>
                </button>
              </div>
            )}
            {/* Which build this is, and where the app lives. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-1.5 px-1 text-[13px] text-ink-3" data-testid="gear-footer">
              <span>MatchOps {APP_VERSION}</span>
              <span aria-hidden="true">·</span>
              <a
                href="https://www.match-ops.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-lg transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                match-ops.com
              </a>
            </div>
          </div>
        </div>
      )}

      {pelitapaOn && pelitapaOpen && (
        <PelitapaPresentation isOpen onClose={() => setPelitapaOpen(false)} />
      )}
    </div>
  );
};

export default StartScreen;
