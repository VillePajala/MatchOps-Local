/**
 * @jest-environment jsdom
 */

/**
 * MigrationStatus Component Tests
 *
 * Tests for the localStorage → IndexedDB migration status display component.
 * Covers progress display, notifications, accessibility, and edge cases.
 *
 * @critical - Tests migration UI feedback to users during data upgrade
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MigrationStatus } from '../MigrationStatus';
import { useMigrationStatus, MigrationProgress } from '@/hooks/useMigrationStatus';

// Mock the hook
jest.mock('@/hooks/useMigrationStatus', () => ({
  useMigrationStatus: jest.fn(),
}));

const mockUseMigrationStatus = useMigrationStatus as jest.MockedFunction<typeof useMigrationStatus>;

describe('MigrationStatus', () => {
  const mockDismissNotification = jest.fn();

  const defaultMockReturn = {
    isRunning: false,
    progress: null as MigrationProgress | null,
    error: null as string | null,
    showNotification: false,
    dismissNotification: mockDismissNotification,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMigrationStatus.mockReturnValue(defaultMockReturn);
  });

  describe('when no migration activity', () => {
    it('should render nothing when not running and no notification', () => {
      const { container } = render(<MigrationStatus />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when migration is running', () => {
    it('should render progress dialog', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 45.5,
          message: 'Migration in progress',
          currentStep: 'Migrating game data...',
          processedKeys: 23,
          totalKeys: 50,
          estimatedTimeRemainingText: '2 minutes',
        },
      });

      render(<MigrationStatus />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Upgrading Storage')).toBeInTheDocument();
      expect(screen.getByText('Migrating game data...')).toBeInTheDocument();
    });

    it('should display progress bar with correct percentage', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 75,
          message: 'Processing data',
          currentStep: 'Processing...',
          processedKeys: 75,
          totalKeys: 100,
          estimatedTimeRemainingText: undefined,
        },
      });

      render(<MigrationStatus />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '75');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('should display items processed count', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 30,
          message: 'Migrating data',
          currentStep: 'Processing...',
          processedKeys: 15,
          totalKeys: 50,
          estimatedTimeRemainingText: undefined,
        },
      });

      render(<MigrationStatus />);

      expect(screen.getByText('15/50 items processed')).toBeInTheDocument();
    });

    it('should display estimated time when available', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 50,
          message: 'Migrating data',
          currentStep: 'Processing...',
          processedKeys: 50,
          totalKeys: 100,
          estimatedTimeRemainingText: '5 minutes',
        },
      });

      render(<MigrationStatus />);

      expect(screen.getByText('Estimated time: 5 minutes')).toBeInTheDocument();
    });

    it('should not display estimated time when undefined', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 50,
          message: 'Migrating data',
          currentStep: 'Processing...',
          processedKeys: 50,
          totalKeys: 100,
          estimatedTimeRemainingText: undefined,
        },
      });

      render(<MigrationStatus />);

      expect(screen.queryByText(/Estimated time/)).not.toBeInTheDocument();
    });

    it('should have proper accessibility attributes', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 25,
          message: 'Migrating data',
          currentStep: 'Migrating...',
          processedKeys: 25,
          totalKeys: 100,
          estimatedTimeRemainingText: undefined,
        },
      });

      render(<MigrationStatus />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'migration-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'migration-description');
    });

    it('should handle null progress gracefully', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: null,
      });

      render(<MigrationStatus />);

      // Should still render dialog with default step
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Preparing migration...')).toBeInTheDocument();
    });
  });

  describe('when showing success notification', () => {
    it('should render success notification', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        showNotification: true,
        error: null,
      });

      render(<MigrationStatus />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Storage Upgraded Successfully')).toBeInTheDocument();
      expect(screen.getByText('Your data has been migrated to improved storage for better performance.')).toBeInTheDocument();
    });

    it('should call dismissNotification when close button clicked', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        showNotification: true,
        error: null,
      });

      render(<MigrationStatus />);

      const dismissButton = screen.getByRole('button', { name: /dismiss success notification/i });
      fireEvent.click(dismissButton);

      expect(mockDismissNotification).toHaveBeenCalled();
    });
  });

  describe('when showing error notification', () => {
    it('should render warning notification with error message', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        showNotification: true,
        error: 'Some migration data could not be transferred.',
      });

      render(<MigrationStatus />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Storage Upgrade Warning')).toBeInTheDocument();
      expect(screen.getByText('Some migration data could not be transferred.')).toBeInTheDocument();
    });

    it('should use warning styling for error notifications', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        showNotification: true,
        error: 'Error occurred',
      });

      render(<MigrationStatus />);

      // Check for amber/warning colors in classes
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('amber');
    });

    it('should use success styling for success notifications', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        showNotification: true,
        error: null,
      });

      render(<MigrationStatus />);

      // Check for green/success colors in classes
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('green');
    });
  });

  describe('ThrottledProgress', () => {
    it('should throttle percentage updates to nearest 0.5%', () => {
      // This test verifies throttling behavior through the displayed text
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 33.7, // Should throttle to 33.5
          message: 'Processing',
          currentStep: 'Processing...',
          processedKeys: 34,
          totalKeys: 100,
          estimatedTimeRemainingText: undefined,
        },
      });

      render(<MigrationStatus />);

      // 33.7 rounds to 33.5 (nearest 0.5)
      expect(screen.getByText('33.5% complete')).toBeInTheDocument();
    });

    it('should round up when closer to higher 0.5', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 33.8, // Should throttle to 34.0
          message: 'Processing',
          currentStep: 'Processing...',
          processedKeys: 34,
          totalKeys: 100,
          estimatedTimeRemainingText: undefined,
        },
      });

      render(<MigrationStatus />);

      expect(screen.getByText('34.0% complete')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have aria-live region for progress updates', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 50,
          message: 'Migrating',
          currentStep: 'Processing...',
          processedKeys: 50,
          totalKeys: 100,
          estimatedTimeRemainingText: undefined,
        },
      });

      render(<MigrationStatus />);

      // The progress text is in a nested div; find the container with aria-live
      const progressTextElement = screen.getByText('50.0% complete');
      const ariaLiveContainer = progressTextElement.closest('div[aria-live]');
      expect(ariaLiveContainer).toHaveAttribute('aria-live', 'polite');
    });

    it('should have aria-assertive for notifications', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        showNotification: true,
        error: null,
      });

      render(<MigrationStatus />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('should have descriptive progress bar label', () => {
      mockUseMigrationStatus.mockReturnValue({
        ...defaultMockReturn,
        isRunning: true,
        progress: {
          percentage: 60,
          message: 'Migrating',
          currentStep: 'Processing...',
          processedKeys: 60,
          totalKeys: 100,
          estimatedTimeRemainingText: undefined,
        },
      });

      render(<MigrationStatus />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-label', 'Migration progress: 60.0% complete');
    });
  });

  describe('memoization', () => {
    it('should be memoized (displayName check)', () => {
      expect(MigrationStatus.displayName).toBe('MigrationStatus');
    });
  });
});
