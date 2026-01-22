/**
 * WelcomeScreen Component Tests
 *
 * Tests the first-install welcome screen that lets users choose:
 * - Start Fresh (local mode)
 * - Sign In to Cloud
 * - Import Backup
 */

import { render, screen, fireEvent } from '@testing-library/react';
import WelcomeScreen from '../WelcomeScreen';

// Mock i18n
jest.mock('@/i18n', () => ({
  language: 'en',
  changeLanguage: jest.fn(),
}));

// Mock appSettings
jest.mock('@/utils/appSettings', () => ({
  getAppSettings: jest.fn().mockResolvedValue({ language: 'en' }),
  updateAppSettings: jest.fn().mockResolvedValue(undefined),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('WelcomeScreen', () => {
  const mockHandlers = {
    onStartLocal: jest.fn(),
    onSignInCloud: jest.fn(),
    onImportBackup: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders app name and welcome message', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      expect(screen.getByText('MatchOps')).toBeInTheDocument();
      expect(screen.getByText('Welcome!')).toBeInTheDocument();
      expect(
        screen.getByText("Track your team's games, players, and stats")
      ).toBeInTheDocument();
    });

    it('renders language selector', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      expect(screen.getByText('EN')).toBeInTheDocument();
      expect(screen.getByText('FI')).toBeInTheDocument();
    });

    it('renders all three options when cloud is available', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      expect(screen.getByText('Start Fresh')).toBeInTheDocument();
      expect(screen.getByText('Sign In to Cloud')).toBeInTheDocument();
      expect(screen.getByText('Import Backup')).toBeInTheDocument();
    });

    it('hides cloud option when cloud is not available', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={false}
          isImporting={false}
        />
      );

      expect(screen.getByText('Start Fresh')).toBeInTheDocument();
      expect(screen.queryByText('Sign In to Cloud')).not.toBeInTheDocument();
      expect(screen.getByText('Import Backup')).toBeInTheDocument();
    });

    it('renders descriptions for each option', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      expect(screen.getByText('Data stays on this device')).toBeInTheDocument();
      expect(screen.getByText('Sync across all your devices')).toBeInTheDocument();
      expect(screen.getByText('Restore from exported file')).toBeInTheDocument();
    });

    it('shows footer note about settings', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      expect(
        screen.getByText('You can change this later in Settings')
      ).toBeInTheDocument();
    });
  });

  describe('Button Interactions', () => {
    it('calls onStartLocal when Start Fresh button is clicked', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      fireEvent.click(screen.getByText('Start Fresh'));
      expect(mockHandlers.onStartLocal).toHaveBeenCalledTimes(1);
    });

    it('calls onSignInCloud when Sign In to Cloud button is clicked', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      fireEvent.click(screen.getByText('Sign In to Cloud'));
      expect(mockHandlers.onSignInCloud).toHaveBeenCalledTimes(1);
    });

    it('calls onImportBackup when Import Backup button is clicked', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      fireEvent.click(screen.getByText('Import Backup'));
      expect(mockHandlers.onImportBackup).toHaveBeenCalledTimes(1);
    });
  });

  describe('Import State', () => {
    it('shows "Importing..." text when importing', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={true}
        />
      );

      expect(screen.getByText('Importing...')).toBeInTheDocument();
      expect(screen.queryByText('Import Backup')).not.toBeInTheDocument();
    });

    it('disables import button when importing', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={true}
        />
      );

      const importButton = screen.getByRole('button', {
        name: /importing/i,
      });
      expect(importButton).toBeDisabled();
    });

    it('does not call onImportBackup when import button is disabled', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={true}
        />
      );

      const importButton = screen.getByRole('button', {
        name: /importing/i,
      });
      fireEvent.click(importButton);
      expect(mockHandlers.onImportBackup).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has accessible button labels', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      expect(
        screen.getByRole('button', { name: /start fresh in local mode/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /sign in to cloud sync/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /import backup file/i })
      ).toBeInTheDocument();
    });

    it('updates aria-label when importing', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={true}
        />
      );

      expect(
        screen.getByRole('button', { name: /importing backup file/i })
      ).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('all main option buttons are native button elements (keyboard accessible by default)', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      // 3 option buttons + 2 language buttons = 5 total
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);
      // Native <button> elements handle Enter/Space automatically
      buttons.forEach(button => {
        expect(button.tagName).toBe('BUTTON');
      });
    });

    it('all buttons are focusable (no negative tabIndex)', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).not.toHaveAttribute('tabIndex', '-1');
      });
    });

    it('buttons can receive focus', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      const startButton = screen.getByRole('button', { name: /start fresh/i });
      startButton.focus();
      expect(document.activeElement).toBe(startButton);
    });
  });

  describe('Language Selector', () => {
    it('switches language when clicking language buttons', async () => {
      const i18n = jest.requireMock('@/i18n');

      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      fireEvent.click(screen.getByText('FI'));
      expect(i18n.changeLanguage).toHaveBeenCalledWith('fi');

      fireEvent.click(screen.getByText('EN'));
      expect(i18n.changeLanguage).toHaveBeenCalledWith('en');
    });
  });
});
