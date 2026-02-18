/**
 * WelcomeScreen Component Tests
 *
 * Tests the first-install welcome screen that lets users choose:
 * - Start Fresh (local mode) - FREE
 * - Use Cloud Sync - FREE (enables cloud mode, shows login)
 * - Import Backup (footer link) - FREE
 *
 * Simplified to 2 primary options + footer link.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import WelcomeScreen from '../WelcomeScreen';

// Mock i18n - both default export properties and named exports
jest.mock('@/i18n', () => ({
  language: 'en',
  changeLanguage: jest.fn(),
  saveLanguagePreference: jest.fn(),
}));

// Mock appSettings
jest.mock('@/utils/appSettings', () => ({
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
    onUseCloudSync: jest.fn(),
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
      // Welcome message and instruction
      expect(screen.getByText('Welcome!')).toBeInTheDocument();
      expect(screen.getByText('Choose how you want to get started')).toBeInTheDocument();
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

    it('renders all options when cloud is available', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      expect(screen.getByText('Start without an account')).toBeInTheDocument();
      // Cloud option - enables cloud mode and shows login
      expect(screen.getByText('Use Cloud Sync')).toBeInTheDocument();
      expect(screen.getByText('Sync your data across all your devices.')).toBeInTheDocument();
      // Import is now a footer link
      expect(screen.getByText('Have a backup file?')).toBeInTheDocument();
    });

    it('hides local-mode options when hideLocalModeOptions is true (Play Store)', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
          hideLocalModeOptions={true}
        />
      );

      // Local-mode button hidden
      expect(screen.queryByText('Start without an account')).not.toBeInTheDocument();
      // Import backup link hidden
      expect(screen.queryByText('Have a backup file?')).not.toBeInTheDocument();
      // "Change in settings" hidden — misleading when there's no choice
      expect(screen.queryByText('You can change this later in Settings')).not.toBeInTheDocument();
      // Cloud option still visible
      expect(screen.getByText('Use Cloud Sync')).toBeInTheDocument();
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
      expect(screen.queryByText('Use Cloud Sync')).not.toBeInTheDocument();
      expect(screen.getByText('Have a backup file?')).toBeInTheDocument();
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
      expect(screen.getByText('Sync your data across all your devices.')).toBeInTheDocument();
      // Import is now a footer link with simpler text
      expect(screen.getByText('Have a backup file?')).toBeInTheDocument();
    });

    it('renders Free badges for both options', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      // Two "FREE" badges (for local and cloud options)
      expect(screen.getAllByText(/^FREE$/i)).toHaveLength(2);
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

    it('calls onUseCloudSync when Use Cloud Sync button is clicked', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      fireEvent.click(screen.getByText('Use Cloud Sync'));
      expect(mockHandlers.onUseCloudSync).toHaveBeenCalledTimes(1);
    });

    it('calls onImportBackup when Have a backup file? link is clicked', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={false}
        />
      );

      fireEvent.click(screen.getByText('Have a backup file?'));
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
      expect(screen.queryByText('Have a backup file?')).not.toBeInTheDocument();
    });

    it('disables import link when importing', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={true}
        />
      );

      const importLink = screen.getByRole('button', {
        name: /importing/i,
      });
      expect(importLink).toBeDisabled();
    });

    it('does not call onImportBackup when import link is disabled', () => {
      render(
        <WelcomeScreen
          {...mockHandlers}
          isCloudAvailable={true}
          isImporting={true}
        />
      );

      const importLink = screen.getByRole('button', {
        name: /importing/i,
      });
      fireEvent.click(importLink);
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
        screen.getByRole('button', { name: /use cloud sync/i })
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
