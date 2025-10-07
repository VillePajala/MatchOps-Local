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
    expect(screen.getByRole('button', { name: 'View Stats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'App Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finnish' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(handlers.onResumeGame).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Load Game' }));
    expect(handlers.onLoadGame).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'View Stats' }));
    expect(handlers.onViewStats).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'App Settings' }));
    expect(handlers.onOpenSettings).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Finnish' }));
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
    expect(screen.getByRole('button', { name: 'How It Works' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finnish' })).toBeInTheDocument();

    // Should not show full interface buttons
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load Game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Stats' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'App Settings' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(handlers.onGetStarted).toHaveBeenCalled();
  });
});
