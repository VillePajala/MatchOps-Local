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
    it('renders app name and tagline', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      expect(screen.getByText('MatchOps')).toBeInTheDocument();
      // Default language is 'en' in test mock
      expect(screen.getByText('Plan · Track · Assess')).toBeInTheDocument();
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

      expect(screen.getByText('Start without an account')).toBeInTheDocument();
      expect(screen.getByText('Sign in or create an account')).toBeInTheDocument();
      expect(screen.getByText('Import a backup')).toBeInTheDocument();
    });

    it('hides cloud option when cloud is not available', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={false}
          isImporting={false}
        />
      );

      expect(screen.getByText('Start without an account')).toBeInTheDocument();
      expect(screen.queryByText('Sign in or create an account')).not.toBeInTheDocument();
      expect(screen.getByText('Import a backup')).toBeInTheDocument();
    });

    it('renders descriptions for each option', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      expect(screen.getByText('Your data is saved on this device only.')).toBeInTheDocument();
      expect(screen.getByText('Your data syncs across devices.')).toBeInTheDocument();
      expect(screen.getByText('Restore your previous data from a file and continue where you left off.')).toBeInTheDocument();
    });

    it('renders Free and Paid badges', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      // Two "FREE" badges (for local and import options)
      expect(screen.getAllByText(/^FREE$/i)).toHaveLength(2);
      expect(screen.getByText(/^PAID$/i)).toBeInTheDocument();
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
    it('calls onStartLocal when Start without account button is clicked', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      fireEvent.click(screen.getByText('Start without an account'));
      expect(mockHandlers.onStartLocal).toHaveBeenCalledTimes(1);
    });

    it('calls onSignInCloud when Sign in or create account button is clicked', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      fireEvent.click(screen.getByText('Sign in or create an account'));
      expect(mockHandlers.onSignInCloud).toHaveBeenCalledTimes(1);
    });

    it('calls onImportBackup when Import a backup button is clicked', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      fireEvent.click(screen.getByText('Import a backup'));
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
      expect(screen.queryByText('Import a backup')).not.toBeInTheDocument();
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
        screen.getByRole('button', { name: /start without an account/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /sign in or create an account/i })
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

      const startButton = screen.getByRole('button', { name: /start without an account/i });
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
