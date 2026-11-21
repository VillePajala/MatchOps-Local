import React from 'react';
import { render, screen, fireEvent, within, cleanup, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    language: 'en',
    changeLanguage: jest.fn(),
    isInitialized: true,
    on: jest.fn(),
    off: jest.fn(),
  },
  saveLanguagePreference: jest.fn(),
}));

jest.mock('@/utils/appSettings', () => ({
  __esModule: true,
  updateAppSettings: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/utils/playtimePlanner/planLinks', () => ({ getPlanLink: jest.fn().mockResolvedValue(null) }));
jest.mock('@/utils/playtimePlanner/storage', () => ({
  ...jest.requireActual('@/utils/playtimePlanner/storage'),
  getPlan: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/utils/fullBackup', () => ({
  __esModule: true,
  exportFullBackup: jest.fn().mockResolvedValue('{}'),
}));

const mockSignOut = jest.fn();
jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: jest.fn(() => ({
    user: null,
    mode: 'local',
    signOut: mockSignOut,
  })),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Interpolates {{vars}} like the real t does. Without this the mock
    // returned "{{count}} players" verbatim, so no assertion in this file
    // could ever see an interpolated string - which made a pluralised count
    // look like a regression when it was the mock that could not read it.
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      const text = fallback || key;
      if (!options) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) =>
        String(options[name] ?? ''),
      );
    },
  }),
}));

import i18n, { saveLanguagePreference } from '@/i18n';
import StartScreen from './StartScreen';
import { getPlanLink } from '@/utils/playtimePlanner/planLinks';
import { getPlan } from '@/utils/playtimePlanner/storage';
import { buildFirstPlan } from '@/services/nextGamePair';
import { APP_VERSION } from '@/config/constants';

describe('StartScreen', () => {
  /** Phase 3 entry point: "Add to player stats" is the last row of the Stats tab, live even before the first match. */
  it('offers Add to player stats on the Stats tab and hides it without a handler', () => {
    const onAddExternalGame = jest.fn();
    const base = { onLoadGame: jest.fn(), onGetStarted: jest.fn(), onViewStats: jest.fn(), onOpenSettings: jest.fn(), canResume: false, hasSavedGames: false, isFirstTimeUser: false };
    const { rerender } = render(<StartScreen {...base} onAddExternalGame={onAddExternalGame} />);
    expect(screen.queryByTestId('home-add-external-game')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByTestId('home-add-external-game')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('home-add-external-game'));
    expect(onAddExternalGame).toHaveBeenCalled();
    rerender(<StartScreen {...base} />);
    expect(screen.queryByTestId('home-add-external-game')).not.toBeInTheDocument();
  });

  it('renders experienced user interface with all action buttons', () => {
    const handlers = {
      onLoadGame: jest.fn(),
      onResumeGame: jest.fn(),
      onGetStarted: jest.fn(),
      onViewStats: jest.fn(),
      onOpenSettings: jest.fn(),
    };

    render(
      <StartScreen
        onLoadGame={handlers.onLoadGame}
        onResumeGame={handlers.onResumeGame}
        onGetStarted={handlers.onGetStarted}
        onViewStats={handlers.onViewStats}
        onOpenSettings={handlers.onOpenSettings}
        canResume={true}
        hasSavedGames={true}
        isFirstTimeUser={false} // Experienced user interface
      />
    );

    // The Pelit front page (restructure PR 1.3): resume card, one pinned
    // primary, entry rows. The old Load Game / Statistics grid is GONE - the
    // tab bar and rows cover both.
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saved games' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load Game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Statistics' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FI' })).toBeInTheDocument();

    // The guide link moved into the gear sheet (PR 1.4) - open it to check.
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const guideLink = screen.getByRole('link', { name: 'User Guide' });
    expect(guideLink).toHaveAttribute('href', 'https://www.match-ops.com/guide');
    expect(guideLink).toHaveAttribute('target', '_blank');
    fireEvent.click(screen.getByTestId('gear-sheet-backdrop'));

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(handlers.onResumeGame).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(handlers.onGetStarted).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Saved games' }));
    expect(handlers.onLoadGame).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const gearSheet = screen.getByRole('dialog', { name: 'App & account' });
    fireEvent.click(within(gearSheet).getByRole('button', { name: 'Settings' }));
    expect(handlers.onOpenSettings).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'FI' }));
    expect(i18n.changeLanguage).toHaveBeenCalledWith('fi');
  });

  /**
   * @critical - owner-reported: switching language on Home made the screen
   * flicker and reload forever.
   *
   * Mounting used to change the language. `language` starts at 'fi' (the
   * SSR-safe default), and an effect keyed on it fired changeLanguage with
   * that pre-adopt value still in its closure - so every mount reverted the
   * coach's choice and emitted `languageChanged`. That event rebuilds `t`,
   * which rebuilt applyTeamScope -> checkAppState in page.tsx, which re-ran
   * the app-state check behind a loading gate, which unmounted this screen.
   * Remounting fired the effect again.
   *
   * This asserts the half that lives here: mounting is not a language change.
   * The i18n mock reports 'en' while the initial state is 'fi', which is
   * exactly the mismatch that used to trigger the revert.
   */
  it('does not change the language just by mounting', () => {
    render(
      <StartScreen
        onLoadGame={jest.fn()}
        onGetStarted={jest.fn()}
        onViewStats={jest.fn()}
        onOpenSettings={jest.fn()}
        hasSavedGames
        isFirstTimeUser={false}
      />,
    );
    expect(i18n.changeLanguage).not.toHaveBeenCalled();
    expect(saveLanguagePreference).not.toHaveBeenCalled();

    // A real click still does the work - this must not be fixed by making the
    // switcher inert.
    fireEvent.click(screen.getByRole('button', { name: 'FI' }));
    expect(i18n.changeLanguage).toHaveBeenCalledWith('fi');
    expect(saveLanguagePreference).toHaveBeenCalledWith('fi');
  });

  it('front page: no resume card without a resumable game; planner row only when wired', () => {
    const onOpenPlanner = jest.fn();
    const base = {
      onLoadGame: jest.fn(),
      onGetStarted: jest.fn(),
      onViewStats: jest.fn(),
      onOpenSettings: jest.fn(),
      hasSavedGames: true,
      isFirstTimeUser: false,
    };
    const { unmount } = render(<StartScreen {...base} canResume={false} onOpenPlanner={onOpenPlanner} />);
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Match planner' }));
    expect(onOpenPlanner).toHaveBeenCalledTimes(1);
    unmount();

    render(<StartScreen {...base} canResume={false} />);
    expect(screen.queryByRole('button', { name: 'Match planner' })).not.toBeInTheDocument();
  });

  it('a brand-new coach lands on the real Home hub with New Game as the primary action', () => {
    const handlers = {
      onLoadGame: jest.fn(),
      onResumeGame: jest.fn(),
      onGetStarted: jest.fn(),
      onNewGame: jest.fn(),
      onManageRoster: jest.fn(),
      onViewStats: jest.fn(),
      onOpenSettings: jest.fn(),
    };

    render(
      <StartScreen
        onLoadGame={handlers.onLoadGame}
        onResumeGame={handlers.onResumeGame}
        onGetStarted={handlers.onGetStarted}
        onNewGame={handlers.onNewGame}
        onManageRoster={handlers.onManageRoster}
        onViewStats={handlers.onViewStats}
        onOpenSettings={handlers.onOpenSettings}
        canResume={false}
        hasSavedGames={false}
        isFirstTimeUser={true}
      />
    );

    // The old separate first-run mode (two-step panel) is gone.
    expect(screen.queryByRole('button', { name: /Add your players/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create your first game/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Just explore first' })).not.toBeInTheDocument();

    // A new coach sees the real Home hub - the tab bar is present from the start.
    expect(screen.getAllByRole('tab')).toHaveLength(4);

    // New Game is the day-one primary action (players are added inside that flow).
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(handlers.onNewGame).toHaveBeenCalled();

    // Nothing to load yet, so Saved games is hidden.
    expect(screen.queryByRole('button', { name: 'Saved games' })).not.toBeInTheDocument();

    // The gear is still reachable, and the simple launcher shows the tagline.
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Plan · Track · Discover')).toBeInTheDocument();
  });

  // With games, the dashboard replaces the launcher (compact view retired), so the
  // tagline is for a returning coach who has no games yet.
  it('shows the brand tagline for a returning coach (not a first-timer) without games', () => {
    render(
      <StartScreen
        onLoadGame={jest.fn()}
        onResumeGame={jest.fn()}
        onGetStarted={jest.fn()}
        onNewGame={jest.fn()}
        onManageRoster={jest.fn()}
        onViewStats={jest.fn()}
        onOpenSettings={jest.fn()}
        canResume={false}
        hasSavedGames={false}
        isFirstTimeUser={false}
      />
    );

    expect(screen.getByText('Plan · Track · Discover')).toBeInTheDocument();
  });

  it('the primary New Game falls back to onGetStarted when onNewGame is unwired', () => {
    const onGetStarted = jest.fn();
    render(
      <StartScreen
        onLoadGame={jest.fn()}
        onResumeGame={jest.fn()}
        onGetStarted={onGetStarted}
        onViewStats={jest.fn()}
        onOpenSettings={jest.fn()}
        canResume={false}
        hasSavedGames={false}
        isFirstTimeUser={true}
        // onNewGame intentionally omitted
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(onGetStarted).toHaveBeenCalledTimes(1);
  });

  it('cloud mode: the gear sheet shows the account entry with the email (footer is gone)', () => {
    const { useAuth } = jest.requireMock('@/contexts/AuthProvider');
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      mode: 'cloud',
      signOut: mockSignOut,
    });
    const onOpenAccount = jest.fn();
    render(
      <StartScreen
        onLoadGame={jest.fn()}
        onResumeGame={jest.fn()}
        onGetStarted={jest.fn()}
        onViewStats={jest.fn()}
        onOpenSettings={jest.fn()}
        onOpenAccount={onOpenAccount}
        canResume={false}
        hasSavedGames={true}
        isFirstTimeUser={false}
      />
    );

    // No footer any more - sign-out lives in Settings -> Account.
    expect(screen.queryByText('Signed in as')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cloud account/ }));
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it('cloud mode: the gear sheet has a DIRECT sign out (3.1b - no longer buried in Settings)', () => {
    const { useAuth } = jest.requireMock('@/contexts/AuthProvider');
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      mode: 'cloud',
      signOut: mockSignOut,
    });
    const onSignOut = jest.fn();
    render(
      <StartScreen
        onLoadGame={jest.fn()}
        onResumeGame={jest.fn()}
        onGetStarted={jest.fn()}
        onViewStats={jest.fn()}
        onOpenSettings={jest.fn()}
        onSignOut={onSignOut}
        canResume={false}
        hasSavedGames={true}
        isFirstTimeUser={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    // The sheet closes after routing.
    expect(screen.queryByRole('dialog', { name: 'App & account' })).not.toBeInTheDocument();
  });

  it('does not show Sign Out footer when in local mode', () => {
    const { useAuth } = jest.requireMock('@/contexts/AuthProvider');
    useAuth.mockReturnValue({
      user: null,
      mode: 'local',
      signOut: mockSignOut,
    });

    const handlers = {
      onLoadGame: jest.fn(),
      onResumeGame: jest.fn(),
      onGetStarted: jest.fn(),
      onViewStats: jest.fn(),
      onOpenSettings: jest.fn(),
    };

    render(
      <StartScreen
        onLoadGame={handlers.onLoadGame}
        onResumeGame={handlers.onResumeGame}
        onGetStarted={handlers.onGetStarted}
        onViewStats={handlers.onViewStats}
        onOpenSettings={handlers.onOpenSettings}
        canResume={false}
        hasSavedGames={true}
        isFirstTimeUser={false}
      />
    );

    expect(screen.queryByText('Signed in as')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument();
  });

  describe('Setup tracker (gear-sheet entry)', () => {
    const baseHandlers = () => ({
      onLoadGame: jest.fn(),
      onResumeGame: jest.fn(),
      onGetStarted: jest.fn(),
      onViewStats: jest.fn(),
      onOpenSettings: jest.fn(),
    });

    beforeEach(() => localStorage.clear());

    const openGear = () => fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    it('the home-surface getting-started banner is GONE (superseded by the composed start screen)', async () => {
      render(
        <StartScreen
          {...baseHandlers()}
          canResume={true}
          hasSavedGames={true}
          isFirstTimeUser={false}
          setupProgress={{ players: true, competition: false, team: false, teamLinkedGame: false }}
        />
      );
      // The gear entry (previous test) remains the post-game setup path.
      await screen.findByRole('button', { name: 'Settings' });
      expect(screen.queryByTestId('setup-banner')).not.toBeInTheDocument();
    });

    it('has no getting-started banner for first-time users', () => {
      render(
        <StartScreen
          {...baseHandlers()}
          canResume={false}
          hasSavedGames={false}
          isFirstTimeUser={true}
          setupProgress={{ players: false, competition: false, team: false, teamLinkedGame: false }}
        />
      );
      expect(screen.queryByTestId('setup-banner')).not.toBeInTheDocument();
    });

    it('has no getting-started guide entry (first-use help removed, Onboarding v3 C11)', () => {
      render(
        <StartScreen
          {...baseHandlers()}
          canResume={false}
          hasSavedGames={false}
          isFirstTimeUser={false}
          setupProgress={{ players: true, competition: true, team: true, teamLinkedGame: true }}
        />
      );
      openGear();
      expect(screen.queryByTestId('gear-restart-tour')).not.toBeInTheDocument();
      expect(screen.queryByText('Getting started guide')).not.toBeInTheDocument();
    });

    it('has no setup checklist entry in the gear sheet (first-use help removed, R8)', async () => {
      render(
        <StartScreen
          {...baseHandlers()}
          canResume={true}
          hasSavedGames={true}
          isFirstTimeUser={false}
          setupProgress={{ players: true, competition: false, team: false, teamLinkedGame: false }}
        />
      );
      openGear();
      const sheet = await screen.findByRole('dialog', { name: 'App & account' });
      expect(within(sheet).queryByRole('button', { name: /Setup checklist/ })).not.toBeInTheDocument();
    });

    it('has no getting-started banner once setup is complete', async () => {
      render(
        <StartScreen
          {...baseHandlers()}
          canResume={true}
          hasSavedGames={true}
          isFirstTimeUser={false}
          setupProgress={{ players: true, competition: true, team: true, teamLinkedGame: true }}
        />
      );
      // Allow the post-hydration effect to run, then assert the banner never appears.
      await screen.findByRole('button', { name: 'Settings' });
      expect(screen.queryByTestId('setup-banner')).not.toBeInTheDocument();
    });

  });
});

describe('Home shell tab bar (two-level restructure PR 1.2)', () => {
  const shellProps = () => ({
    onLoadGame: jest.fn(),
    onResumeGame: jest.fn(),
    onGetStarted: jest.fn(),
    onViewStats: jest.fn(),
    onOpenSettings: jest.fn(),
    onManageRoster: jest.fn(),
    onManageSeasons: jest.fn(),
    onManageTournaments: jest.fn(),
    canResume: true,
    hasSavedGames: true,
    isFirstTimeUser: false,
  });

  describe('Onboarding v2 composition (pre-first-game)', () => {
    beforeEach(() => localStorage.clear());

    const composeProps = (progress: { players: boolean; team: boolean }) => ({
      onLoadGame: jest.fn(),
      onResumeGame: jest.fn(),
      onGetStarted: jest.fn(),
      onViewStats: jest.fn(),
      onOpenSettings: jest.fn(),
      onManageRoster: jest.fn(),
      onManageTeams: jest.fn(),
      onNewGame: jest.fn(),
      canResume: false,
      hasSavedGames: false,
      isFirstTimeUser: !progress.players,
      setupProgress: { ...progress, competition: false, teamLinkedGame: false },
    });

    /**
     * @critical - The screen itself is the checklist: no players -> the hero
     * is Add players, and the later steps stay VISIBLE as ordered rows
     * (reorder, never hide).
     */
    it('empty account: Add players is the hero, team and game are visible ordered rows', () => {
      const props = composeProps({ players: false, team: false });
      render(<StartScreen {...props} />);

      // No welcome strip any more (Onboarding v3, C11): the hero names the step.
      expect(screen.queryByTestId('welcome-strip')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('hero-add-players'));
      expect(props.onManageRoster).toHaveBeenCalledTimes(1);

      const steps = screen.getByTestId('onboarding-steps');
      expect(within(steps).getByText('Create your team')).toBeInTheDocument();
      // New Game stays reachable (and keeps the tour anchor).
      fireEvent.click(within(steps).getByTestId('tour-new-game'));
      expect(props.onNewGame).toHaveBeenCalledTimes(1);
    });

    it('players done: Create your team is the hero, players row shows a check', () => {
      const props = composeProps({ players: true, team: false });
      render(<StartScreen {...props} />);

      fireEvent.click(screen.getByTestId('hero-create-team'));
      expect(props.onManageTeams).toHaveBeenCalledTimes(1);

      // Done steps collapse into the one-line summary (owner round 4).
      const summary = screen.getByTestId('onboarding-done-summary');
      expect(within(summary).getByText('✓')).toBeInTheDocument();
      expect(within(summary).getByText('Add players')).toBeInTheDocument();
    });

    it('compose mode defers the side rows (planner, Taso) until the first game exists', () => {
      const props = { ...composeProps({ players: true, team: true }), onOpenPlanner: jest.fn() };
      render(<StartScreen {...props} />);
      expect(screen.queryByText('Match planner')).not.toBeInTheDocument();
      expect(screen.queryByText(/Taso/)).not.toBeInTheDocument();

      cleanup();
      // With a game saved, composition ends and the rows return.
      render(<StartScreen {...props} hasSavedGames={true} />);
      expect(screen.getByText('Match planner')).toBeInTheDocument();
      expect(screen.getByText(/Taso/)).toBeInTheDocument();
    });

    /**
     * @critical - Wizard graduates here: team + players exist, no games ->
     * the stock amber New Game hero takes over (no duplicate custom hero).
     */
    it('team ready: the stock New Game hero leads', () => {
      const props = composeProps({ players: true, team: true });
      render(<StartScreen {...props} />);

      expect(screen.queryByTestId('hero-add-players')).not.toBeInTheDocument();
      expect(screen.queryByTestId('hero-create-team')).not.toBeInTheDocument();
      // Exactly ONE tour-new-game element (the stock hero), no step duplicate.
      expect(screen.getAllByTestId('tour-new-game')).toHaveLength(1);
      fireEvent.click(screen.getByTestId('tour-new-game'));
      expect(props.onNewGame).toHaveBeenCalledTimes(1);
    });

    it('once a game exists the composition and strip are gone', () => {
      const props = { ...composeProps({ players: true, team: true }), hasSavedGames: true };
      render(<StartScreen {...props} />);
      expect(screen.queryByTestId('welcome-strip')).not.toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-steps')).not.toBeInTheDocument();
    });
  });

  it('renders the four club-level tabs with Games active', () => {
    render(<StartScreen {...shellProps()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Games', 'Club', 'Competitions', 'Stats']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('Team tab switches to the club panel; its rows open the existing modals', () => {
    const props = { ...shellProps(), onManageTeams: jest.fn(), onManagePersonnel: jest.fn(), onOpenTraining: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    // Real tab semantics: selection moves, the body becomes the club rows.
    expect(screen.getByRole('tab', { name: 'Club' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'false');
    // Owner decision (2026-07-15, screenshot feedback): Jatka and New Game
    // live ONLY on the Pelit panel - other tabs show just their own rows.
    expect(screen.queryByRole('button', { name: 'New Game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saved games' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Players' }));
    expect(props.onManageRoster).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
    expect(props.onManageTeams).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Staff' }));
    expect(props.onManagePersonnel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /^Warmup Plan/ }));
    expect(props.onOpenTraining).toHaveBeenCalledTimes(1);

    // Back to Games restores the front page.
    fireEvent.click(screen.getByRole('tab', { name: 'Games' }));
    expect(screen.getByRole('button', { name: 'New Game' })).toBeInTheDocument();
  });

  it('Seasons and Stats are REAL panels: tabs switch, the rows open the surfaces (3.1b)', () => {
    const props = { ...shellProps(), onViewStatsTab: jest.fn() };
    render(<StartScreen {...props} />);
    // Competitions tab -> two entry rows (Seasons, Tournaments); the tab opens nothing.
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    expect(props.onManageSeasons).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Leagues' }));
    expect(props.onManageSeasons).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Tournaments' }));
    expect(props.onManageTournaments).toHaveBeenCalledTimes(1);
    // Stats tab -> one row PER aggregate stats tab (W8).
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(props.onViewStatsTab).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'League stats' }));
    expect(props.onViewStatsTab).toHaveBeenCalledWith('season');
    fireEvent.click(screen.getByRole('button', { name: 'Player stats' }));
    expect(props.onViewStatsTab).toHaveBeenCalledWith('player');
  });

  it('disables the Stats tab without saved games; the gear opens the app sheet', () => {
    const props = { ...shellProps(), hasSavedGames: false, onOpenBackup: jest.fn(), onOpenRules: jest.fn() };
    render(<StartScreen {...props} />);
    // 3.1b: the tab always switches; the PANEL ROWS are what disable
    // without saved games (never silently dead-clickable).
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByRole('button', { name: 'League stats' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    // The sheet holds the whole device/account bucket.
    const sheet = screen.getByRole('dialog', { name: 'App & account' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Settings' }));
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
    // The sheet closes after routing.
    expect(screen.queryByRole('dialog', { name: 'App & account' })).not.toBeInTheDocument();
  });

  it('gear sheet routes backup to its opener', () => {
    const props = { ...shellProps(), onOpenBackup: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Backup & Restore' }));
    expect(props.onOpenBackup).toHaveBeenCalledTimes(1);
  });

  /**
   * Rules is reference material a coach consults, not app configuration, so it
   * sits with the Coaching Materials link rather than under the gear - where
   * someone scanning the tabs would never have met it.
   */
  it('Rules sits on the Club panel and opens the directory', () => {
    const props = { ...shellProps(), onOpenRules: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    fireEvent.click(screen.getByTestId('club-rules'));
    expect(props.onOpenRules).toHaveBeenCalledTimes(1);
  });

  it('hides the Rules row when no opener is wired', () => {
    render(<StartScreen {...shellProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    expect(screen.queryByTestId('club-rules')).not.toBeInTheDocument();
  });

  /**
   * @critical - one modal, one entry point per screen. A leftover gear entry
   * would drift from the Club row the moment either changed.
   */
  it('does not also offer Rules in the gear sheet', () => {
    render(<StartScreen {...shellProps()} onOpenRules={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const sheet = screen.getByRole('dialog', { name: 'App & account' });
    expect(within(sheet).queryByRole('button', { name: 'Rules' })).not.toBeInTheDocument();
  });

  /**
   * The URL is asserted as a LITERAL, deliberately, and not as the TASO_URL
   * constant it now comes from. Importing the constant would make both sides of
   * the assertion move together, so a typo in it would still pass; spelling the
   * address out means the test fails if the value ever changes by accident.
   */
  it('the Taso link sits on the games front page (game-day workflow tool)', () => {
    render(<StartScreen {...shellProps()} />);
    const taso = screen.getByRole('link', { name: /Taso/ });
    expect(taso).toHaveTextContent('lineups & results');
    expect(taso).toHaveAttribute('href', 'https://taso.palloliitto.fi');
    expect(taso).toHaveAttribute('target', '_blank');
  });

  it('the Coaching Materials link sits on the Team panel (training scope)', () => {
    render(<StartScreen {...shellProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    const coaching = screen.getByRole('link', { name: /Coaching Materials/ });
    expect(coaching).toHaveAttribute('href', 'https://www.palloliitto.fi/valmentajien-materiaalit-jalkapallo');
    expect(coaching).toHaveAttribute('target', '_blank');
  });

  it('unwired Team-panel rows render DISABLED - never silently dead-clickable', () => {
    const props = { ...shellProps(), onManageRoster: undefined };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    expect(screen.getByRole('button', { name: 'Players' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Teams' })).toBeDisabled(); // onManageTeams not passed
  });

  it('an unwired Competitions panel renders its rows DISABLED - never silently dead-clickable', () => {
    // (All four tabs switch local panels now; each ROW needs its handler.)
    const props = { ...shellProps(), onManageSeasons: undefined, onManageTournaments: undefined };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    expect(screen.getByRole('button', { name: 'Leagues' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tournaments' })).toBeDisabled();
  });

  it('exactly one Settings control exists after the footer link folded into the gear', () => {
    render(<StartScreen {...shellProps()} />);
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
  });

  it('shows the tab bar to first-time users too (they learn the real Home from the start)', () => {
    render(<StartScreen {...shellProps()} isFirstTimeUser={true} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    // No separate first-run panel any more.
    expect(screen.queryByRole('button', { name: /Add your players/ })).not.toBeInTheDocument();
  });
});

describe('Home dashboard view (opt-in)', () => {
  const summary = {
    resume: { id: 'g1', opponent: 'FC Inter', ourScore: 2, theirScore: 1, homeOrAway: 'home' as const, isPlayed: false, mapsUrl: null },
    vuosi: { label: '24/25', gamesPlayed: 8, wins: 5, ties: 2, losses: 1, goalsFor: 18, goalsAgainst: 9, goalDifference: 9 },
    recent: [
      { id: 'g2', opponent: 'HJK', ourScore: 3, theirScore: 1, result: 'W' as const, date: '2024-07-10', isFriendly: false },
    ],
    upcoming: null,
    lastPlayed: null,
    upcomingList: [],
    counts: { players: 18, teams: 3, personnel: 2, seasons: 3, tournaments: 2 },
    countsReady: true,
    teamRecords: [
      // Deliberately out of order: the card sorts (most games, then name).
      { teamId: 'tB', fallbackName: 'Kotkat T11', gamesPlayed: 3, wins: 1, ties: 1, losses: 1, goalsFor: 4, goalsAgainst: 6, goalDifference: -2, form: ['L' as const, 'D' as const, 'W' as const] },
      { teamId: 'tA', fallbackName: 'Kotkat P12', gamesPlayed: 5, wins: 4, ties: 1, losses: 0, goalsFor: 14, goalsAgainst: 3, goalDifference: 11, form: ['W' as const, 'W' as const, 'D' as const, 'W' as const, 'W' as const] },
      { teamId: 'tC', fallbackName: 'Ahmat', gamesPlayed: 3, wins: 0, ties: 0, losses: 3, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: ['L' as const, 'L' as const, 'L' as const] },
    ],
    homeAway: {
      home: { gamesPlayed: 5, wins: 4, ties: 1, losses: 0, goalsFor: 12, goalsAgainst: 4, goalDifference: 8 },
      away: { gamesPlayed: 3, wins: 1, ties: 1, losses: 1, goalsFor: 6, goalsAgainst: 5, goalDifference: 1 },
    },
  };
  const dashProps = (over = {}) => ({
    onLoadGame: jest.fn(), onResumeGame: jest.fn(), onGetStarted: jest.fn(),
    onViewStats: jest.fn(), onViewStatsTab: jest.fn(), onOpenSettings: jest.fn(),
    onOpenGameById: jest.fn(),
    canResume: true, hasSavedGames: true, isFirstTimeUser: false,
    homeSummary: summary,
    ...over,
  });

  it('renders the resume card and recent strip; the season record is not on the Pelit list header', () => {
    render(<StartScreen {...dashProps()} />);
    expect(screen.getByText('FC Inter')).toBeInTheDocument();       // resume card
    expect(screen.getByText('2–1')).toBeInTheDocument();
    // The season record moved to Kilpailut / Tilastot (owner 2026-11-19).
    expect(screen.queryByText(/24\/25/)).not.toBeInTheDocument();
    expect(screen.getByText('HJK')).toBeInTheDocument();             // recent strip
    // The plain Continue button is replaced by the card.
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  /**
   * The compact launcher was retired (2026-11-19): with games, the full layout
   * always shows the dashboard and the gear sheet has no view toggle.
   * @critical
   */
  it('always shows the dashboard with games, and the gear has no compact-view toggle', () => {
    render(<StartScreen {...dashProps()} />);
    expect(screen.getByText('FC Inter')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const sheet = screen.getByRole('dialog', { name: 'App & account' });
    expect(within(sheet).queryByRole('button', { name: /Compact home cards/ })).not.toBeInTheDocument();
  });

  it('never shows the dashboard for a first-time user, even if toggled on', () => {
    render(<StartScreen {...dashProps({ isFirstTimeUser: true })} />);
    expect(screen.queryByText('FC Inter')).not.toBeInTheDocument();
  });

  it('recent card opens that game; resume resumes', () => {
    const props = dashProps();
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByText('HJK'));
    expect(props.onOpenGameById).toHaveBeenCalledWith('g2');
    fireEvent.click(screen.getByText('FC Inter'));
    expect(props.onResumeGame).toHaveBeenCalled();
  });

  /**
   * Owner call: Pelit is the club as one block. The team choice belongs to
   * Tilastot, and only narrows what Tilastot shows.
   */
  it('offers the team choice on Stats only, and Stats reads the team-scoped summary', () => {
    const teams = [{ id: 'a', label: 'PePo Lila (Aluesarja)' }, { id: 'b', label: 'PePo Lila (Futsal)' }];
    const scoped = {
      ...summary,
      vuosi: { ...summary.vuosi, gamesPlayed: 3, goalsFor: 4 },
      teamRecords: [{ ...summary.teamRecords[0], teamId: 'a' }],
    };
    render(<StartScreen {...dashProps({ teamScopeOptions: teams, teamScope: 'a', homeStatsSummary: scoped })} />);
    expect(screen.queryByTestId('home-team-scope')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByTestId('home-team-scope')).toBeInTheDocument();
    expect(within(screen.getByTestId('stats-hero')).getByText('3')).toBeInTheDocument();
    // One team in scope: the club-wide team rows must not leak in.
    expect(screen.queryByTestId('home-teams')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-away')).toBeInTheDocument();
  });

  /**
   * Seura club card (owner's pick "A · Seurakortti"): each count is the entry
   * to its manager, so the number and the modal it opens must stay paired.
   * @critical
   */
  it('Club card counts show the numbers and open the players / teams / personnel managers', () => {
    const props = { ...dashProps(), onManageRoster: jest.fn(), onManageTeams: jest.fn(), onManagePersonnel: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    fireEvent.click(screen.getByRole('button', { name: /18\s*Players/ }));
    expect(props.onManageRoster).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /3\s*Teams/ }));
    expect(props.onManageTeams).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /2\s*Staff/ }));
    expect(props.onManagePersonnel).toHaveBeenCalledTimes(1);
    expect(props.onManageRoster).toHaveBeenCalledTimes(1);
    expect(props.onManageTeams).toHaveBeenCalledTimes(1);
  });

  /** Owner, 2026-11-21: Home is about teams - no top scorer on the club card. */
  it('Club card shows the season record and no top scorer', () => {
    render(<StartScreen {...dashProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    const season = screen.getByTestId('club-card-season');
    expect(season).toHaveTextContent('5-2-1');
    expect(season).not.toHaveTextContent(/scorer/i);
    expect(within(screen.getByTestId('club-card')).getByText('Season 24/25')).toBeInTheDocument();
  });

  it('Club card hides the record line before a game is played', () => {
    const noGames = { ...summary, vuosi: { ...summary.vuosi, gamesPlayed: 0, wins: 0, ties: 0, losses: 0, goalDifference: 0 } };
    render(<StartScreen {...dashProps({ homeSummary: noGames })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    expect(screen.getByTestId('club-card')).toBeInTheDocument();
    expect(screen.queryByTestId('club-card-season')).not.toBeInTheDocument();
  });

  it('Club card title is the club name every team shares, otherwise the neutral "Club"', () => {
    const shared = [{ id: 'a', label: 'Kotkat P12 Musta' }, { id: 'b', label: 'Kotkat T11' }];
    const { unmount } = render(<StartScreen {...dashProps({ teamScopeOptions: shared })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    expect(within(screen.getByTestId('club-card')).getByRole('heading', { name: 'Kotkat' })).toBeInTheDocument();
    unmount();

    render(<StartScreen {...dashProps({ teamScopeOptions: [{ id: 'a', label: 'PePo Lila' }] })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    expect(within(screen.getByTestId('club-card')).getByRole('heading', { name: 'Club' })).toBeInTheDocument();
  });

  it('Club card counts read 0 with no players and still open the add flow', () => {
    const empty = { ...summary, counts: { players: 0, teams: 0, personnel: 0, seasons: 0, tournaments: 0 } };
    const props = { ...dashProps({ homeSummary: empty }), onManageRoster: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    fireEvent.click(screen.getByRole('button', { name: /0\s*Players/ }));
    expect(props.onManageRoster).toHaveBeenCalledTimes(1);
  });

  it('Kilpailut tab shows the club-season card; it opens OVERALL stats (not a Kausi)', () => {
    const props = { ...dashProps(), onManageSeasons: jest.fn(), onManageTournaments: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    const hero = screen.getByTestId('competitions-hero');
    expect(within(hero).getByText('24/25')).toBeInTheDocument();
    // The full record lives here, each figure in its result colour.
    const record = within(hero).getByTitle('Wins - draws - losses');
    expect(record).toHaveTextContent('5-2-1');
    expect(within(record).getByText('5')).toHaveClass('text-win');
    expect(within(record).getByText('2')).toHaveClass('text-draw');
    expect(within(record).getByText('1')).toHaveClass('text-loss');
    // "8 games · 18–9" - played games and goals for and against.
    expect(screen.getByTestId('competitions-hero-line')).toHaveTextContent('8 games·18–9');
    expect(screen.getByTestId('home-seasons-row')).toHaveTextContent(/Leagues\s*3/);
    expect(screen.getByTestId('home-tournaments-row')).toHaveTextContent(/Tournaments\s*2/);
    // The card shows the club-season (Vuosi) record, so it must open OVERALL
    // stats - NOT the 'season' tab (a user Kausi). Guards the #688 fix.
    (props.onViewStatsTab as jest.Mock).mockClear();
    fireEvent.click(screen.getByText('24/25'));
    expect(props.onViewStatsTab).toHaveBeenCalledWith('overall');
  });

  it('Tilastot tab shows one empty message, not zero tiles, before any game is played', () => {
    const empty = { ...summary, vuosi: { ...summary.vuosi!, gamesPlayed: 0, wins: 0, ties: 0, losses: 0, goalDifference: 0 }, teamRecords: [], homeAway: null };
    render(<StartScreen {...dashProps({ homeSummary: empty })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByTestId('home-stats-empty')).toBeInTheDocument();
    expect(screen.queryByText('Goal diff')).not.toBeInTheDocument();
  });

  /** Owner, 2026-11-19: two wide tiles, no scorer tile. */
  it('Tilastot hero has two tiles, record and goal difference, and no scorer tile', () => {
    render(<StartScreen {...dashProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    const hero = screen.getByTestId('stats-hero');
    expect(within(hero).getAllByRole('button')).toHaveLength(2);
    expect(hero.querySelector('.grid')).toHaveClass('grid-cols-2');
    expect(within(hero).getByText('W–D–L')).toBeInTheDocument();
    expect(within(screen.getByTestId('stats-tile-record')).getByTitle('Wins - draws - losses')).toHaveTextContent('5-2-1');
    expect(within(hero).getByText('Goal diff')).toBeInTheDocument();
    expect(within(screen.getByTestId('stats-tile-goal-diff')).getByText('+9')).toBeInTheDocument();
    expect(screen.queryByTestId('stats-tile-scorer')).not.toBeInTheDocument();
  });

  /** @critical Both tiles are a way in to overall stats. */
  it('Tilastot tiles open overall stats', () => {
    const props = dashProps();
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    fireEvent.click(screen.getByTestId('stats-tile-record'));
    expect(props.onViewStatsTab).toHaveBeenLastCalledWith('overall');
    fireEvent.click(screen.getByTestId('stats-tile-goal-diff'));
    expect(props.onViewStatsTab).toHaveBeenLastCalledWith('overall');
    expect(props.onViewStatsTab).toHaveBeenCalledTimes(2);
  });

  /**
   * Owner, 2026-11-21: the scorers card is replaced by one row per team -
   * record in the result colours, coloured goal difference, last five results.
   * @critical
   */
  it('Tilastot "Teams" card: one row per team, most games first then name, each opening that team', () => {
    const teams = [
      { id: 'tA', label: 'Kotkat P12', color: '#1d4ed8' },
      { id: 'tB', label: 'Kotkat T11' },
      { id: 'tC', label: 'Ahmat' },
    ];
    const props = { ...dashProps({ teamScopeOptions: teams }), onViewTeamStats: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    const card = screen.getByTestId('home-teams');
    expect(within(card).getByText('Teams')).toBeInTheDocument();
    const rows = within(card).getAllByRole('button');
    expect(rows.map((r) => within(r).getByTestId('team-row-name').textContent)).toEqual(['Kotkat P12', 'Ahmat', 'Kotkat T11']);

    const [a, , b] = rows;
    const record = within(a).getByTitle('Wins - draws - losses');
    expect(record).toHaveTextContent('4-1-0');
    expect(within(record).getByText('4')).toHaveClass('text-win');
    expect(within(record).getByText('0')).toHaveClass('text-loss');
    expect(within(within(a).getByTestId('team-row-goal-diff')).getByText('+11')).toHaveClass('text-win');
    expect(within(within(b).getByTestId('team-row-goal-diff')).getByText('-2')).toHaveClass('text-loss');
    expect(within(within(rows[1]).getByTestId('team-row-goal-diff')).getByText('0')).toHaveClass('text-ink-2');
    // Last five, newest first, in the shared result disc colours.
    const discs = within(a).getByTestId('team-row-form').querySelectorAll('[data-result]');
    expect(Array.from(discs).map((d) => d.getAttribute('data-result'))).toEqual(['W', 'W', 'D', 'W', 'W']);
    // The team's kit colour on its swatch; none -> the empty outline.
    expect(within(a).getByTestId('team-row-swatch')).toHaveStyle({ backgroundColor: '#1d4ed8' });
    expect(within(b).getByTestId('team-row-swatch').getAttribute('style')).toBeNull();

    fireEvent.click(b);
    expect(props.onViewTeamStats).toHaveBeenCalledWith('tB');
  });

  it('Tilastot "Teams" rows fall back to the name on the games, and are not tappable without a handler', () => {
    render(<StartScreen {...dashProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    const card = screen.getByTestId('home-teams');
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(within(card).getAllByTestId('team-row-name').map((n) => n.textContent)).toEqual(['Kotkat P12', 'Ahmat', 'Kotkat T11']);
  });

  /** One team row would only repeat the hero: show its home / away split. */
  it('Tilastot shows the home / away split instead when only one team has games', () => {
    const one = { ...summary, teamRecords: [summary.teamRecords[1]] };
    render(<StartScreen {...dashProps({ homeSummary: one, onViewTeamStats: jest.fn() })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.queryByTestId('home-teams')).not.toBeInTheDocument();
    const card = screen.getByTestId('home-away');
    expect(within(card).getByText('Home and away')).toBeInTheDocument();
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    const home = screen.getByTestId('home-away-home');
    expect(home).toHaveTextContent('Home');
    expect(within(home).getByTitle('Wins - draws - losses')).toHaveTextContent('4-1-0');
    expect(within(home).getByText('+8')).toHaveClass('text-win');
    const away = screen.getByTestId('home-away-away');
    expect(away).toHaveTextContent('Away');
    expect(within(away).getByTitle('Wins - draws - losses')).toHaveTextContent('1-1-1');
    expect(within(away).getByText('+1')).toHaveClass('text-win');
  });

  it('Tilastot home / away: a side with no games says so', () => {
    const one = {
      ...summary,
      teamRecords: [summary.teamRecords[1]],
      homeAway: { ...summary.homeAway, away: { gamesPlayed: 0, wins: 0, ties: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 } },
    };
    render(<StartScreen {...dashProps({ homeSummary: one })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByTestId('home-away-away')).toHaveTextContent('No games');
  });

  /** Owner, 2026-11-21: no top scorer anywhere on Home. */
  it('no Home tab shows a top scorer', () => {
    render(<StartScreen {...dashProps({ teamScopeOptions: [{ id: 'tA', label: 'Kotkat P12' }] })} />);
    for (const tab of ['Games', 'Club', 'Competitions', 'Stats']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      expect(screen.queryByTestId('top-scorers')).not.toBeInTheDocument();
      expect(screen.queryByTestId('club-card-scorer')).not.toBeInTheDocument();
      expect(screen.queryByText(/top scorer/i)).not.toBeInTheDocument();
    }
  });

  /** Owner, 2026-11-19: three layers - hero, the team card, then ONE grouped list of links. */
  it('Tilastot stats views are one grouped list, with the add-to-stats row last', () => {
    const props = { ...dashProps(), onAddExternalGame: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    const first = screen.getByTestId('home-stats-season');
    const group = first.parentElement as HTMLElement;
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'League stats', 'Tournament stats', 'Overall stats', 'Player stats', 'Add to player stats',
    ]);
    expect(screen.queryByTestId('home-stats-grid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('home-stats-tournament'));
    expect(props.onViewStatsTab).toHaveBeenCalledWith('tournament');
    fireEvent.click(screen.getByTestId('home-add-external-game'));
    expect(props.onAddExternalGame).toHaveBeenCalledTimes(1);
    // Layer order: hero, scorers (when any), links.
    expect(screen.getByTestId('stats-hero').compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  const competitions = {
    seasons: [{ id: 's1', name: 'P12 Harrastesarja 2026', clubSeason: '25/26', gender: 'boys' as const, games: 7, goals: 13 }],
    tournaments: [{ id: 't1', name: 'IPS Talviturnaus', startDate: '2027-02-28', series: [{ id: 'x', level: 'Elite' }], games: 3, goals: 5 }],
  };
  const withFeatured = {
    ...competitions,
    featuredSeason: competitions.seasons[0],
    featuredTournament: competitions.tournaments[0],
  };

  /**
   * Owner, 2026-11-19: Kilpailut is a SHORT overview - one row each for
   * leagues and tournaments naming the one that matters now, never a second
   * list of cards. Each row opens its manager.
   * @critical
   */
  it('Kilpailut shows one row per kind with the featured one as subtitle; rows open the managers', () => {
    const many = {
      ...withFeatured,
      seasons: Array.from({ length: 8 }, (_, i) => ({ ...competitions.seasons[0], id: `s${i}` })),
    };
    const props = {
      ...dashProps({ homeSummary: { ...summary, competitions: many } }),
      onManageSeasons: jest.fn(), onManageTournaments: jest.fn(), onAddCompetition: jest.fn(),
    };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    const leagues = screen.getByTestId('home-seasons-row');
    expect(leagues).toHaveTextContent('Leagues');
    expect(leagues).toHaveTextContent('P12 Harrastesarja 2026');
    expect(leagues).toHaveTextContent('3');
    const tournaments = screen.getByTestId('home-tournaments-row');
    expect(tournaments).toHaveTextContent('IPS Talviturnaus · 28.2.');
    // Never a list: eight leagues still render as the one row.
    expect(screen.getAllByText('P12 Harrastesarja 2026')).toHaveLength(1);
    expect(screen.queryByTestId('home-season-card')).not.toBeInTheDocument();
    fireEvent.click(leagues);
    expect(props.onManageSeasons).toHaveBeenCalledTimes(1);
    fireEvent.click(tournaments);
    expect(props.onManageTournaments).toHaveBeenCalledTimes(1);
    expect(props.onAddCompetition).not.toHaveBeenCalled();
  });

  it('Kilpailut rows offer adding when there is none, instead of a dead zero', () => {
    const none = { ...summary, counts: { ...summary.counts, seasons: 0, tournaments: 0 }, competitions: { seasons: [], tournaments: [], featuredSeason: null, featuredTournament: null } };
    const props = {
      ...dashProps({ homeSummary: none }),
      onManageSeasons: jest.fn(), onAddCompetition: jest.fn(),
    };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    const leagues = screen.getByTestId('home-seasons-row');
    expect(leagues).toHaveTextContent('Add League');
    expect(leagues).not.toHaveTextContent('0');
    fireEvent.click(leagues);
    expect(props.onAddCompetition).toHaveBeenCalledWith('season');
    expect(props.onManageSeasons).not.toHaveBeenCalled();
    const tournaments = screen.getByTestId('home-tournaments-row');
    expect(tournaments).toHaveTextContent('Add Tournament');
    fireEvent.click(tournaments);
    expect(props.onAddCompetition).toHaveBeenLastCalledWith('tournament');
  });

  /** The last five results on the season hero, newest first like Pelit's list. */
  it('Kilpailut hero shows the last five results, newest first, in result colours', () => {
    const r = (id: string, result: 'W' | 'D' | 'L') => ({ id, opponent: id, ourScore: 1, theirScore: 0, result, date: '2024-07-10', isFriendly: false });
    const recent = [r('a', 'L'), r('b', 'W'), r('c', 'D'), r('d', 'W'), r('e', 'W'), r('f', 'L')];
    render(<StartScreen {...dashProps({ homeSummary: { ...summary, recent } })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    const form = screen.getByTestId('competitions-form');
    const chips = Array.from(form.querySelectorAll('[data-result]'));
    expect(chips.map((c) => c.getAttribute('data-result'))).toEqual(['L', 'W', 'D', 'W', 'W']);
    expect(chips[0]).toHaveClass('text-loss');
    expect(chips[1]).toHaveClass('text-win');
    expect(chips[2]).toHaveClass('text-draw');
    expect(form).toHaveAccessibleName('Recent form: L W T W W');
  });

  it('Kilpailut hero has no form strip before any result', () => {
    render(<StartScreen {...dashProps({ homeSummary: { ...summary, recent: [] } })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    expect(screen.queryByTestId('competitions-form')).not.toBeInTheDocument();
  });

  it('the full season record is on Kilpailut and Tilastot only, not on Pelit', () => {
    render(<StartScreen {...dashProps()} />);
    expect(screen.queryByTitle('Wins - draws - losses')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    expect(screen.getByTitle('Wins - draws - losses')).toHaveTextContent('5-2-1');
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    // The hero's record; the team rows below carry their own.
    expect(within(screen.getByTestId('stats-hero')).getByTitle('Wins - draws - losses')).toHaveTextContent('5-2-1');
  });

  /**
   * Swiping the tab content moves between tabs (owner, 2026-11-19) - and the
   * tab bar's selection follows, so it is the same state, not a second one.
   * @critical
   */
  it('a horizontal swipe on the content switches tabs and aria-selected follows', () => {
    render(<StartScreen {...dashProps()} />);
    const content = screen.getByTestId('home-tab-content');
    const swipe = (fromX: number, toX: number, dy = 0) => {
      fireEvent.touchStart(content, { touches: [{ clientX: fromX, clientY: 300 }] });
      fireEvent.touchMove(content, { touches: [{ clientX: (fromX + toX) / 2, clientY: 300 + dy / 2 }] });
      fireEvent.touchEnd(content, { changedTouches: [{ clientX: toX, clientY: 300 + dy }] });
    };
    expect(screen.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');
    swipe(300, 150);
    expect(screen.getByRole('tab', { name: 'Club' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'false');
    swipe(300, 150);
    swipe(300, 150);
    expect(screen.getByRole('tab', { name: 'Stats' })).toHaveAttribute('aria-selected', 'true');
    // The last tab does not wrap round.
    swipe(300, 150);
    expect(screen.getByRole('tab', { name: 'Stats' })).toHaveAttribute('aria-selected', 'true');
    swipe(150, 300);
    expect(screen.getByRole('tab', { name: 'Competitions' })).toHaveAttribute('aria-selected', 'true');
    // A vertical drag is a scroll, never a tab change.
    swipe(200, 180, 200);
    expect(screen.getByRole('tab', { name: 'Competitions' })).toHaveAttribute('aria-selected', 'true');
    // Nor does a swipe from the screen edge (Android's back gesture).
    swipe(10, 200);
    expect(screen.getByRole('tab', { name: 'Competitions' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a swipe starting on the tab bar does nothing', () => {
    render(<StartScreen {...dashProps()} />);
    const bar = screen.getByRole('tablist', { name: 'Home sections' });
    fireEvent.touchStart(bar, { touches: [{ clientX: 300, clientY: 700 }] });
    fireEvent.touchEnd(bar, { changedTouches: [{ clientX: 100, clientY: 700 }] });
    expect(screen.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * Owner, 2026-11-19: the selected tab's amber line spans the whole tab
   * block and sits on the bar's top edge (it was a short centred dash).
   */
  it('marks only the selected tab, with a full-width indicator on the bar edge', () => {
    render(<StartScreen {...dashProps()} />);
    const indicators = screen.getAllByTestId('home-tab-indicator');
    expect(indicators).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Games' })).toContainElement(indicators[0]);
    expect(indicators[0]).toHaveClass('inset-x-0', '-top-0.5', 'bg-action');
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getAllByTestId('home-tab-indicator')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Stats' })).toContainElement(screen.getByTestId('home-tab-indicator'));
  });

  it('puts the outline New Game directly under the hero, with a neutral "+"', () => {
    render(<StartScreen {...dashProps()} />);
    const newGame = screen.getByTestId('tour-new-game');
    const listRow = screen.getByText('HJK');
    expect(newGame.compareDocumentPosition(listRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(newGame.querySelector('svg')).not.toHaveClass('text-action');
  });

  it('gear sheet rows carry line icons and the footer names the version', () => {
    render(<StartScreen {...dashProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const sheet = screen.getByRole('dialog', { name: 'App & account' });
    const settingsRow = within(sheet).getByRole('button', { name: 'Settings' });
    expect(settingsRow.querySelector('svg')).not.toBeNull();
    expect(within(sheet).getByRole('link', { name: 'User Guide' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('gear-footer')).toHaveTextContent(`MatchOps ${APP_VERSION}·match-ops.com`);
    expect(within(sheet).getByRole('link', { name: 'match-ops.com' })).toHaveAttribute('href', 'https://www.match-ops.com');
  });
});

describe('Home guide + empty-state guidance', () => {
  const props = (over = {}) => ({
    onLoadGame: jest.fn(), onResumeGame: jest.fn(), onGetStarted: jest.fn(),
    onViewStats: jest.fn(), onViewStatsTab: jest.fn(), onOpenSettings: jest.fn(),
    onManageRoster: jest.fn(), onManageSeasons: jest.fn(), onManageTournaments: jest.fn(),
    onManageTeams: jest.fn(), onManagePersonnel: jest.fn(),
    onOpenGuide: jest.fn(),
    canResume: true, hasSavedGames: true, isFirstTimeUser: false,
    ...over,
  });

  it('gear sheet has an in-app "How it works" entry that calls onOpenGuide', () => {
    const p = props();
    render(<StartScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' })); // opens gear
    const sheet = screen.getByRole('dialog', { name: 'App & account' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'How it works' }));
    expect(p.onOpenGuide).toHaveBeenCalledTimes(1);
  });

  const emptySummary = (over = {}) => ({
    // The full HomeSummary shape: since the compact launcher was retired the
    // dashboard renders for any coach with games, so a partial fixture crashes.
    resume: null, lastPlayed: null, vuosi: null, recent: [], upcoming: null, upcomingList: [],
    counts: { players: 0, teams: 0, personnel: 0, seasons: 0, tournaments: 0 },
    countsReady: true, playedCount: 0, ...over,
  });

  it('Team tab shows the add-players hint when the roster is empty', () => {
    render(<StartScreen {...props({ homeSummary: emptySummary() })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    expect(screen.getByText('Start by adding your players.')).toBeInTheDocument();
  });

  it('Team hint is hidden once players exist', () => {
    render(<StartScreen {...props({ homeSummary: emptySummary({ counts: { players: 5, teams: 0, personnel: 0, seasons: 0, tournaments: 0 } }) })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    expect(screen.queryByText('Start by adding your players.')).not.toBeInTheDocument();
  });

  it('Team hint is suppressed until counts are ready (no flash for existing users)', () => {
    render(<StartScreen {...props({ homeSummary: emptySummary({ countsReady: false }) })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Club' }));
    expect(screen.queryByText('Start by adding your players.')).not.toBeInTheDocument();
  });

  it('Competitions tab shows the create-competition hint when none exist', () => {
    render(<StartScreen {...props({ homeSummary: emptySummary() })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    expect(screen.getByText('Create a league or tournament to group your games.')).toBeInTheDocument();
  });

  it('Stats tab explains stats are empty when there are no games', () => {
    render(<StartScreen {...props({ hasSavedGames: false })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByText("Statistics appear once you've played games.")).toBeInTheDocument();
  });

  /**
   * Onboarding v3 layouts: the basic layout is its own Home with no tab bar,
   * and while the account's layout is not known yet neither layout renders.
   * @critical
   */
  describe('layouts', () => {
    const summary = {
      resume: null,
      lastPlayed: null,
      vuosi: null,
      recent: [],
      upcoming: null,
      upcomingList: [],
      counts: { players: 9, teams: 1, personnel: 0, seasons: 0, tournaments: 0 },
      countsReady: true,
      playedCount: 0,
    };
    const shellProps = () => ({
      onLoadGame: jest.fn(),
      onResumeGame: jest.fn(),
      onGetStarted: jest.fn(),
      onViewStats: jest.fn(),
      onOpenSettings: jest.fn(),
      canResume: false,
      hasSavedGames: true,
      isFirstTimeUser: false,
    });

    it('basic: the basic Home, no tablist, no simplified-view switch in the gear', () => {
      render(<StartScreen {...shellProps()} appLayout="basic" homeSummary={summary} />);
      expect(screen.getByTestId('home-basic')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByTestId('all-features')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      expect(screen.queryByText('Compact home cards')).not.toBeInTheDocument();
    });

    it('full (the default): the tabbed Home as before', () => {
      render(<StartScreen {...shellProps()} homeSummary={summary} />);
      expect(screen.queryByTestId('home-basic')).not.toBeInTheDocument();
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('loading: neither layout renders (no flash of the wrong one)', () => {
      render(<StartScreen {...shellProps()} appLayout="loading" homeSummary={summary} />);
      expect(screen.queryByTestId('home-basic')).not.toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.queryByText('New Game')).not.toBeInTheDocument();
    });
  });
});

/**
 * The full layout's next-match card shows and shares the game's plan like the
 * basic card - through the same lookup and actions (useNextGamePlan).
 * @critical
 */
describe('Full layout next-match card: the game\'s plan', () => {
  const plan = buildFirstPlan({
    team: { id: 'team-1', name: 'MePa P12' },
    players: Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` })),
    fieldSize: '8v8',
    gameType: 'soccer',
    ageGroup: 'U12',
    numberOfPeriods: 2,
    periodMinutes: 25,
    gameDate: '2026-11-22',
    opponentName: 'Rantakylän FC',
  });
  const summary = {
    resume: null,
    vuosi: null,
    recent: [],
    upcoming: { id: 'game-1', opponent: 'Rantakylän FC', date: '2026-11-22', time: '10:00', mapsUrl: null, daysAway: 3, travel: null, teamName: 'MePa P12' },
    lastPlayed: null,
    upcomingList: [],
    counts: { players: 10, teams: 1, personnel: 0, seasons: 0, tournaments: 0 },
    countsReady: true,
  };
  const props = (over = {}) => ({
    onLoadGame: jest.fn(), onResumeGame: jest.fn(), onGetStarted: jest.fn(),
    onViewStats: jest.fn(), onOpenSettings: jest.fn(), onOpenGameById: jest.fn(),
    onShowPlan: jest.fn(), onOpenPlannerAt: jest.fn(),
    canResume: false, hasSavedGames: true, isFirstTimeUser: false,
    appLayout: 'full' as const,
    homeSummary: summary,
    ...over,
  });

  afterEach(() => {
    (getPlanLink as jest.Mock).mockResolvedValue(null);
    (getPlan as jest.Mock).mockResolvedValue(null);
  });

  it('without a plan the card has no plan actions', async () => {
    render(<StartScreen {...props()} />);
    await waitFor(() => expect(getPlanLink).toHaveBeenCalledWith('game-1'));
    expect(screen.getByText('Rantakylän FC')).toBeInTheDocument();
    expect(screen.queryByTestId('next-match-show-plan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('next-match-share')).not.toBeInTheDocument();
  });

  it('with a plan: Show rotation opens the plan view, Share opens the share sheet', async () => {
    (getPlanLink as jest.Mock).mockResolvedValue({ planId: plan.id, planGameId: plan.games[0].id });
    (getPlan as jest.Mock).mockResolvedValue(plan);
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const p = props();
    try {
      render(<StartScreen {...p} />);
      await waitFor(() => expect(screen.getByTestId('next-match-show-plan')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('next-match-show-plan'));
      expect(p.onShowPlan).toHaveBeenCalledWith(plan.id, 'game-1');

      await act(async () => {
        fireEvent.click(screen.getByTestId('next-match-share'));
      });
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(share.mock.calls[0][0].text).toContain('MePa P12 – Rantakylän FC');
    } finally {
      delete (navigator as unknown as { share?: unknown }).share;
    }
  });

  it('the basic layout leaves the lookup to its own card (no second lookup)', async () => {
    render(<StartScreen {...props({ appLayout: 'basic' as const })} />);
    await waitFor(() => expect(getPlanLink).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('next-match-show-plan')).not.toBeInTheDocument();
  });
});
