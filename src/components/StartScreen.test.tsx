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
}));

jest.mock('@/utils/appSettings', () => ({
  __esModule: true,
  getAppSettings: jest.fn().mockResolvedValue({ language: 'en' }),
  updateAppSettings: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/utils/fullBackup', () => ({
  __esModule: true,
  exportFullBackup: jest.fn().mockResolvedValue('{}'),
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
      onStartNewGame: jest.fn(),
      onLoadGame: jest.fn(),
      onResumeGame: jest.fn(),
      onCreateSeason: jest.fn(),
      onViewStats: jest.fn(),
      onGetStarted: jest.fn(),
      onSetupRoster: jest.fn(),
    };

    render(
      <StartScreen
        onStartNewGame={handlers.onStartNewGame}
        onLoadGame={handlers.onLoadGame}
        onResumeGame={handlers.onResumeGame}
        onGetStarted={handlers.onGetStarted}
        onCreateSeason={handlers.onCreateSeason}
        onViewStats={handlers.onViewStats}
        onSetupRoster={handlers.onSetupRoster}
        canResume={true}
        hasPlayers={true}
        hasSavedGames={true}
        hasSeasonsTournaments={true}
        isFirstTimeUser={false} // Experienced user interface
      />
    );

    expect(screen.getByRole('button', { name: 'Resume Last Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create New Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seasons & Tournaments' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Stats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finnish' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create New Game' }));
    expect(handlers.onStartNewGame).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Resume Last Game' }));
    expect(handlers.onResumeGame).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Finnish' }));
    expect(i18n.changeLanguage).toHaveBeenCalledWith('fi');
  });

  it('renders first-time user interface with simplified buttons', () => {
    const handlers = {
      onStartNewGame: jest.fn(),
      onLoadGame: jest.fn(),
      onResumeGame: jest.fn(),
      onCreateSeason: jest.fn(),
      onViewStats: jest.fn(),
      onGetStarted: jest.fn(),
      onSetupRoster: jest.fn(),
    };

    render(
      <StartScreen
        onStartNewGame={handlers.onStartNewGame}
        onLoadGame={handlers.onLoadGame}
        onResumeGame={handlers.onResumeGame}
        onGetStarted={handlers.onGetStarted}
        onCreateSeason={handlers.onCreateSeason}
        onViewStats={handlers.onViewStats}
        onSetupRoster={handlers.onSetupRoster}
        canResume={false}
        hasPlayers={false}
        hasSavedGames={false}
        hasSeasonsTournaments={false}
        isFirstTimeUser={true} // First-time user interface
      />
    );

    // Should only show simplified interface
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How It Works' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finnish' })).toBeInTheDocument();

    // Should not show full interface buttons
    expect(screen.queryByRole('button', { name: 'Resume Last Game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create New Game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load Game' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(handlers.onGetStarted).toHaveBeenCalled();
  });
});
