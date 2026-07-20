import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

import i18n from '@/i18n';
import StartScreen from './StartScreen';

describe('StartScreen', () => {
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

  it('first-run routes the new coach into Home setup (add players, then first game)', () => {
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

    // The two-step setup path replaces the old single "Get Started → demo field".
    expect(screen.queryByRole('button', { name: 'Get Started' })).not.toBeInTheDocument();
    const addPlayers = screen.getByRole('button', { name: /Add your players/ });
    const createGame = screen.getByRole('button', { name: /Create your first game/ });
    const explore = screen.getByRole('button', { name: 'Just explore first' });

    // Step 1 opens the roster (Home setup), NOT the demo field.
    fireEvent.click(addPlayers);
    expect(handlers.onManageRoster).toHaveBeenCalled();
    expect(handlers.onGetStarted).not.toHaveBeenCalled();

    // Step 2 opens new-game setup.
    fireEvent.click(createGame);
    expect(handlers.onNewGame).toHaveBeenCalled();

    // "Explore first" preserves the old demo-field opt-in.
    fireEvent.click(explore);
    expect(handlers.onGetStarted).toHaveBeenCalled();

    // Still no full-interface buttons / tabs for a first-timer.
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('first-run buttons fall back to onGetStarted when the setup handlers are unwired', () => {
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
        // onManageRoster / onNewGame intentionally omitted
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add your players/ }));
    fireEvent.click(screen.getByRole('button', { name: /Create your first game/ }));
    // Both steps + Explore all route to onGetStarted when their handler is absent.
    expect(onGetStarted).toHaveBeenCalledTimes(2);
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

  describe('Recommended setup card', () => {
    const baseHandlers = () => ({
      onLoadGame: jest.fn(),
      onResumeGame: jest.fn(),
      onGetStarted: jest.fn(),
      onViewStats: jest.fn(),
      onOpenSettings: jest.fn(),
    });

    beforeEach(() => localStorage.clear());

    it('shows the card for a returning user with incomplete setup', async () => {
      render(
        <StartScreen
          {...baseHandlers()}
          canResume={true}
          hasSavedGames={true}
          isFirstTimeUser={false}
          setupProgress={{ players: true, competition: false, team: false, teamLinkedGame: false }}
        />
      );
      expect(await screen.findByText('Get the most out of MatchOps')).toBeInTheDocument();
      expect(screen.getByText('Build a team')).toBeInTheDocument();
    });

    it('hides the card once all setup steps are complete', () => {
      render(
        <StartScreen
          {...baseHandlers()}
          canResume={true}
          hasSavedGames={true}
          isFirstTimeUser={false}
          setupProgress={{ players: true, competition: true, team: true, teamLinkedGame: true }}
        />
      );
      expect(screen.queryByText('Get the most out of MatchOps')).not.toBeInTheDocument();
    });

    it('does not show the card for first-time users', () => {
      render(
        <StartScreen
          {...baseHandlers()}
          canResume={false}
          hasSavedGames={false}
          isFirstTimeUser={true}
          setupProgress={{ players: false, competition: false, team: false, teamLinkedGame: false }}
        />
      );
      expect(screen.queryByText('Get the most out of MatchOps')).not.toBeInTheDocument();
    });

    it('dismisses the card and keeps it dismissed on re-render', async () => {
      const props = {
        ...baseHandlers(),
        canResume: true,
        hasSavedGames: true,
        isFirstTimeUser: false,
        setupProgress: { players: false, competition: false, team: false, teamLinkedGame: false },
      };
      const { unmount } = render(<StartScreen {...props} />);
      expect(await screen.findByText('Get the most out of MatchOps')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByText('Get the most out of MatchOps')).not.toBeInTheDocument();

      unmount();
      render(<StartScreen {...props} />);
      // Persisted dismissal: the localStorage flag keeps the card hidden across renders.
      // (Hidden in every state here — pre-hydration and post-effect — so no wait needed.)
      expect(screen.queryByText('Get the most out of MatchOps')).not.toBeInTheDocument();
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

  it('renders the four club-level tabs with Games active', () => {
    render(<StartScreen {...shellProps()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Games', 'Team', 'Competitions', 'Stats']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('Team tab switches to the club panel; its rows open the existing modals', () => {
    const props = { ...shellProps(), onManageTeams: jest.fn(), onManagePersonnel: jest.fn(), onOpenTraining: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    // Real tab semantics: selection moves, the body becomes the club rows.
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveAttribute('aria-selected', 'true');
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
    fireEvent.click(screen.getByRole('button', { name: 'Personnel' }));
    expect(props.onManagePersonnel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Warmup Plan' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Seasons' }));
    expect(props.onManageSeasons).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Tournaments' }));
    expect(props.onManageTournaments).toHaveBeenCalledTimes(1);
    // Stats tab -> one row PER aggregate stats tab (W8).
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(props.onViewStatsTab).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Season stats' }));
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
    expect(screen.getByRole('button', { name: 'Season stats' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    // The sheet holds the whole device/account bucket.
    const sheet = screen.getByRole('dialog', { name: 'App & account' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Settings' }));
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
    // The sheet closes after routing.
    expect(screen.queryByRole('dialog', { name: 'App & account' })).not.toBeInTheDocument();
  });

  it('gear sheet routes backup and rules to their openers', () => {
    const props = { ...shellProps(), onOpenBackup: jest.fn(), onOpenRules: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Backup & Restore' }));
    expect(props.onOpenBackup).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rules' }));
    expect(props.onOpenRules).toHaveBeenCalledTimes(1);
  });

  it('the Taso link sits on the games front page (game-day workflow tool)', () => {
    render(<StartScreen {...shellProps()} />);
    const taso = screen.getByRole('link', { name: /Taso - lineups & results/ });
    expect(taso).toHaveAttribute('href', 'https://taso.palloliitto.fi');
    expect(taso).toHaveAttribute('target', '_blank');
  });

  it('the Coaching Materials link sits on the Team panel (training scope)', () => {
    render(<StartScreen {...shellProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    const coaching = screen.getByRole('link', { name: /Coaching Materials/ });
    expect(coaching).toHaveAttribute('href', 'https://www.palloliitto.fi/valmentajien-materiaalit-jalkapallo');
    expect(coaching).toHaveAttribute('target', '_blank');
  });

  it('unwired Team-panel rows render DISABLED - never silently dead-clickable', () => {
    const props = { ...shellProps(), onManageRoster: undefined };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.getByRole('button', { name: 'Players' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Teams' })).toBeDisabled(); // onManageTeams not passed
  });

  it('an unwired Competitions panel renders its rows DISABLED - never silently dead-clickable', () => {
    // (All four tabs switch local panels now; each ROW needs its handler.)
    const props = { ...shellProps(), onManageSeasons: undefined, onManageTournaments: undefined };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    expect(screen.getByRole('button', { name: 'Seasons' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tournaments' })).toBeDisabled();
  });

  it('exactly one Settings control exists after the footer link folded into the gear', () => {
    render(<StartScreen {...shellProps()} />);
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
  });

  it('hides the tab bar for first-time users (focused first-run setup panel)', () => {
    render(<StartScreen {...shellProps()} isFirstTimeUser={true} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Add your players/ })).toBeInTheDocument();
  });
});

describe('Home dashboard view (opt-in)', () => {
  const summary = {
    resume: { id: 'g1', opponent: 'FC Inter', ourScore: 2, theirScore: 1, homeOrAway: 'home' as const, isPlayed: false },
    vuosi: { label: '24/25', gamesPlayed: 8, wins: 5, ties: 2, losses: 1, goalsFor: 18, goalsAgainst: 9, goalDifference: 9 },
    recent: [
      { id: 'g2', opponent: 'HJK', ourScore: 3, theirScore: 1, result: 'W' as const, date: '2024-07-10', isFriendly: false },
    ],
    counts: { players: 18, teams: 3, personnel: 2, seasons: 3, tournaments: 2 },
    countsReady: true,
    topScorer: { name: 'Aho', goals: 6 },
  };
  const dashProps = (over = {}) => ({
    onLoadGame: jest.fn(), onResumeGame: jest.fn(), onGetStarted: jest.fn(),
    onViewStats: jest.fn(), onViewStatsTab: jest.fn(), onOpenSettings: jest.fn(),
    onSetHomeView: jest.fn(), onOpenGameById: jest.fn(),
    canResume: true, hasSavedGames: true, isFirstTimeUser: false,
    homeView: 'dashboard' as const, homeSummary: summary,
    ...over,
  });

  it('renders the resume card, Vuosi bar and recent strip when on', () => {
    render(<StartScreen {...dashProps()} />);
    expect(screen.getByText('FC Inter')).toBeInTheDocument();       // resume card
    expect(screen.getByText('2–1')).toBeInTheDocument();
    expect(screen.getByText(/24\/25/)).toBeInTheDocument();          // Vuosi bar
    expect(screen.getByText('HJK')).toBeInTheDocument();             // recent strip
    // The plain Continue button is replaced by the card.
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('falls back to the plain launcher when off', () => {
    render(<StartScreen {...dashProps({ homeView: 'simple' as const })} />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByText('FC Inter')).not.toBeInTheDocument();
    expect(screen.queryByText('HJK')).not.toBeInTheDocument();
  });

  it('never shows the dashboard for a first-time user, even if toggled on', () => {
    render(<StartScreen {...dashProps({ isFirstTimeUser: true })} />);
    expect(screen.queryByText('FC Inter')).not.toBeInTheDocument();
  });

  it('recent card opens that game; Vuosi bar opens overall stats; resume resumes', () => {
    const props = dashProps();
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByText('HJK'));
    expect(props.onOpenGameById).toHaveBeenCalledWith('g2');
    fireEvent.click(screen.getByText(/24\/25/));
    expect(props.onViewStatsTab).toHaveBeenCalledWith('overall');
    fireEvent.click(screen.getByText('FC Inter'));
    expect(props.onResumeGame).toHaveBeenCalled();
  });

  it('gear sheet toggle flips the view via onSetHomeView', () => {
    const props = dashProps();
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' })); // opens gear sheet
    const sheet = screen.getByRole('dialog', { name: 'App & account' });
    fireEvent.click(within(sheet).getByRole('button', { name: /Show summary on home/ }));
    expect(props.onSetHomeView).toHaveBeenCalledWith('simple'); // was 'dashboard'
  });

  it('Joukkue tab shows the counts header + Valmennus group when on', () => {
    const props = { ...dashProps(), onManageTeams: jest.fn(), onManagePersonnel: jest.fn(), onOpenTraining: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.getByText(/18 players/)).toBeInTheDocument();
    expect(screen.getByText(/3 teams/)).toBeInTheDocument();
    expect(screen.getByText('Coaching')).toBeInTheDocument(); // Valmennus group label
  });

  it('Kilpailut tab shows the club-season card; it opens OVERALL stats (not a Kausi)', () => {
    const props = { ...dashProps(), onManageSeasons: jest.fn(), onManageTournaments: jest.fn() };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    expect(screen.getByText('This season')).toBeInTheDocument();
    expect(screen.getByText(/3 seasons · 2 tournaments/)).toBeInTheDocument();
    // The card shows the club-season (Vuosi) record, so it must open OVERALL
    // stats - NOT the 'season' tab (a user Kausi). Guards the #688 fix.
    (props.onViewStatsTab as jest.Mock).mockClear();
    fireEvent.click(screen.getByText('This season'));
    expect(props.onViewStatsTab).toHaveBeenCalledWith('overall');
  });

  it('Tilastot tab shows the overview tiles when on', () => {
    render(<StartScreen {...dashProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.getByText('Goal diff')).toBeInTheDocument();
    expect(screen.getByText(/Aho 6/)).toBeInTheDocument(); // top scorer tile
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
    resume: null, vuosi: null, recent: [],
    counts: { players: 0, teams: 0, personnel: 0, seasons: 0, tournaments: 0 },
    countsReady: true, topScorer: null, ...over,
  });

  it('Team tab shows the add-players hint when the roster is empty', () => {
    render(<StartScreen {...props({ homeSummary: emptySummary() })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.getByText('Start by adding your players.')).toBeInTheDocument();
  });

  it('Team hint is hidden once players exist', () => {
    render(<StartScreen {...props({ homeSummary: emptySummary({ counts: { players: 5, teams: 0, personnel: 0, seasons: 0, tournaments: 0 } }) })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.queryByText('Start by adding your players.')).not.toBeInTheDocument();
  });

  it('Team hint is suppressed until counts are ready (no flash for existing users)', () => {
    render(<StartScreen {...props({ homeSummary: emptySummary({ countsReady: false }) })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.queryByText('Start by adding your players.')).not.toBeInTheDocument();
  });

  it('Competitions tab shows the create-competition hint when none exist', () => {
    render(<StartScreen {...props({ homeSummary: emptySummary() })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    expect(screen.getByText('Create a season or tournament to group your games.')).toBeInTheDocument();
  });

  it('Stats tab explains stats are empty when there are no games', () => {
    render(<StartScreen {...props({ hasSavedGames: false })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByText("Statistics appear once you've played games.")).toBeInTheDocument();
  });
});
