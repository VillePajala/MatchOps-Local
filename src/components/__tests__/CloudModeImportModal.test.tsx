/**
 * CloudModeImportModal Component Tests
 *
 * Tests the modal shown when user attempts to import a backup file while in cloud mode.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import CloudModeImportModal from '../CloudModeImportModal';

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}));

describe('CloudModeImportModal', () => {
  const mockHandlers = {
    onImportAndMigrate: jest.fn(),
    onSwitchToLocal: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <CloudModeImportModal
          isOpen={false}
          {...mockHandlers}
        />
      );

      expect(screen.queryByText('Import Backup')).not.toBeInTheDocument();
    });

    it('renders modal when isOpen is true', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('Import Backup')).toBeInTheDocument();
    });

    it('displays description text', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      expect(screen.getByText(/You're currently using Cloud Sync/)).toBeInTheDocument();
    });

    it('displays both options', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('Import & Migrate to Cloud')).toBeInTheDocument();
      expect(screen.getByText('Switch to Local Mode')).toBeInTheDocument();
    });

    it('shows recommended badge on import and migrate option', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('displays cancel button', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('Button Interactions', () => {
    it('calls onImportAndMigrate when first option is clicked', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      fireEvent.click(screen.getByText('Import & Migrate to Cloud'));
      expect(mockHandlers.onImportAndMigrate).toHaveBeenCalledTimes(1);
    });

    it('calls onSwitchToLocal when second option is clicked', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      fireEvent.click(screen.getByText('Switch to Local Mode'));
      expect(mockHandlers.onSwitchToLocal).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when cancel button is clicked', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      fireEvent.click(screen.getByText('Cancel'));
      expect(mockHandlers.onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when close button (X) is clicked', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      // The close button has aria-label "Close"
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(mockHandlers.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has accessible close button', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('all option buttons are focusable', () => {
      render(
        <CloudModeImportModal
          isOpen={true}
          {...mockHandlers}
        />
      );

      const buttons = screen.getAllByRole('button');
      // Close button, 2 options, Cancel = 4 buttons
      expect(buttons.length).toBe(4);
      buttons.forEach(button => {
        expect(button).not.toHaveAttribute('tabIndex', '-1');
      });
    });
  });
});
