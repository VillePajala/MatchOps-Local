import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Statistics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FI' })).toBeInTheDocument();
    // Planner moved to the in-game hamburger menu - no Start Screen button.
    expect(screen.queryByRole('button', { name: 'Plan playing time' })).not.toBeInTheDocument();

    // User Guide link points to the full online guide (Start Screen discovery point)
    const guideLink = screen.getByRole('link', { name: 'User Guide' });
    expect(guideLink).toHaveAttribute('href', 'https://www.match-ops.com/guide');
    expect(guideLink).toHaveAttribute('target', '_blank');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(handlers.onResumeGame).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Load Game' }));
    expect(handlers.onLoadGame).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    expect(handlers.onViewStats).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(handlers.onOpenSettings).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'FI' }));
    expect(i18n.changeLanguage).toHaveBeenCalledWith('fi');
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
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(handlers.onGetStarted).toHaveBeenCalled();
  });

  it('shows Sign Out footer when in cloud mode', () => {
    const { useAuth } = jest.requireMock('@/contexts/AuthProvider');
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      mode: 'cloud',
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

    expect(screen.getByText('Signed in as')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(mockSignOut).toHaveBeenCalled();
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
