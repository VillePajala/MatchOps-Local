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
    expect(screen.getByRole('button', { name: 'Resume match' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Resume match' }));
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
    expect(screen.queryByRole('button', { name: 'Resume match' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Match planner' }));
    expect(onOpenPlanner).toHaveBeenCalledTimes(1);
    unmount();

    render(<StartScreen {...base} canResume={false} />);
    expect(screen.queryByRole('button', { name: 'Match planner' })).not.toBeInTheDocument();
  });

  it('renders first-time user interface with simplified buttons', () => {
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
        hasSavedGames={false}
        isFirstTimeUser={true} // First-time user interface
      />
    );

    // Should only show simplified interface
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FI' })).toBeInTheDocument();

    // Should not show full interface buttons
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load Game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Statistics' })).not.toBeInTheDocument();
    // The hero's gear corner is visible for EVERYONE since the Home shell
    // (PR 1.2) - a first-timer restoring a backup needs Settings -> Data.
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(handlers.onGetStarted).toHaveBeenCalled();
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
    expect(screen.queryByRole('button', { name: 'New Game' })).not.toBeInTheDocument();

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

  it('Seasons and Stats tabs stay one-tap openers for their single-purpose scopes', () => {
    const props = shellProps();
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }));
    expect(props.onManageSeasons).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(props.onViewStats).toHaveBeenCalledTimes(1);
  });

  it('disables the Stats tab without saved games; the gear opens the app sheet', () => {
    const props = { ...shellProps(), hasSavedGames: false, onOpenBackup: jest.fn(), onOpenRules: jest.fn() };
    render(<StartScreen {...props} />);
    expect(screen.getByRole('tab', { name: 'Stats' })).toBeDisabled();
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

  it('unwired Team-panel rows render DISABLED - never silently dead-clickable', () => {
    const props = { ...shellProps(), onManageRoster: undefined };
    render(<StartScreen {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.getByRole('button', { name: 'Players' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Teams' })).toBeDisabled(); // onManageTeams not passed
  });

  it('an unwired Seasons tab renders DISABLED - never silently dead-clickable', () => {
    // (The Team tab now switches a local panel, so it needs no handler.)
    const props = { ...shellProps(), onManageSeasons: undefined };
    render(<StartScreen {...props} />);
    expect(screen.getByRole('tab', { name: 'Competitions' })).toBeDisabled();
  });

  it('exactly one Settings control exists after the footer link folded into the gear', () => {
    render(<StartScreen {...shellProps()} />);
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
  });

  it('hides the tab bar for first-time users (single Get Started flow untouched)', () => {
    render(<StartScreen {...shellProps()} isFirstTimeUser={true} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
  });
});
