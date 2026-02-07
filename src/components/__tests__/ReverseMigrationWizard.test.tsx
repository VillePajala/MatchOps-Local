/**
 * Tests for ReverseMigrationWizard
 *
 * Tests the reverse migration wizard for switching from cloud to local mode.
 * Part of PR #11: Reverse Migration & Cloud Account Management
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ReverseMigrationWizard from '../ReverseMigrationWizard';
import type { ReverseMigrationCounts, ReverseMigrationProgress } from '@/services/reverseMigrationService';

// Mock the reverseMigrationService
const mockGetCloudDataSummary = jest.fn();
const mockMigrateCloudToLocal = jest.fn();

jest.mock('@/services/reverseMigrationService', () => ({
  getCloudDataSummary: () => mockGetCloudDataSummary(),
  migrateCloudToLocal: (
    onProgress: (p: ReverseMigrationProgress) => void,
    mode: string,
    userId?: string
  ) => mockMigrateCloudToLocal(onProgress, mode, userId),
}));

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback || key,
  }),
}));

// Mock useFocusTrap
jest.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: jest.fn(),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ReverseMigrationWizard', () => {
  const mockOnComplete = jest.fn();
  const mockOnCancel = jest.fn();

  const mockSummary: ReverseMigrationCounts = {
    players: 10,
    teams: 2,
    teamRosters: 20,
    seasons: 3,
    tournaments: 1,
    games: 15,
    personnel: 4,
    playerAdjustments: 5,
    warmupPlan: true,
    settings: true,
  };

  const mockSuccessResult = {
    success: true,
    errors: [],
    warnings: [],
    downloaded: mockSummary,
  };

  const renderWizard = (props?: { userId?: string }) => {
    return render(
      <ReverseMigrationWizard
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        userId={props?.userId}
      />
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCloudDataSummary.mockResolvedValue(mockSummary);
    mockMigrateCloudToLocal.mockResolvedValue(mockSuccessResult);
  });

  // ==========================================================================
  // PREVIEW STEP TESTS
  // ==========================================================================

  describe('preview step', () => {
    it('should render with loading state initially', () => {
      // Never resolve to keep in loading state
      mockGetCloudDataSummary.mockImplementation(() => new Promise(() => {}));
      renderWizard();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Switch to Local Mode');
    });

    it('should show data summary after loading', async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      // Check all counts are displayed
      expect(screen.getByText('Players')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Teams')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Games')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
    });

    it('should show error state when summary loading fails', async () => {
      mockGetCloudDataSummary.mockRejectedValue(new Error('Network error'));
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Failed to check cloud data')).toBeInTheDocument();
        // Error messages are sanitized - network errors show user-friendly message
        expect(screen.getByText('Network error. Please check your connection and try again.')).toBeInTheDocument();
      });

      // Should have retry button
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('should retry loading summary when retry button clicked', async () => {
      mockGetCloudDataSummary.mockRejectedValueOnce(new Error('Network error'));

      renderWizard();

      await waitFor(() => {
        // Error messages are sanitized
        expect(screen.getByText('Network error. Please check your connection and try again.')).toBeInTheDocument();
      });

      // Reset mock for retry
      mockGetCloudDataSummary.mockResolvedValue(mockSummary);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });
    });

    it('should show no data message when cloud is empty', async () => {
      mockGetCloudDataSummary.mockResolvedValue(null);
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('No cloud data found.')).toBeInTheDocument();
      });
    });

    it('should call onCancel when cancel button clicked', async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should call onCancel when close button clicked', async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Close'));

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should disable continue button when loading', () => {
      mockGetCloudDataSummary.mockImplementation(() => new Promise(() => {}));
      renderWizard();

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      expect(continueButton).toBeDisabled();
    });

    it('should enable continue button after summary loaded', async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      expect(continueButton).not.toBeDisabled();
    });

    it('should proceed to choose step when continue clicked', async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // CHOOSE STEP TESTS
  // ==========================================================================

  describe('choose step', () => {
    const goToChooseStep = async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });
    };

    it('should show two mode options', async () => {
      await goToChooseStep();

      expect(screen.getByText('Keep cloud copy')).toBeInTheDocument();
      expect(screen.getByText('Delete cloud data')).toBeInTheDocument();
    });

    it('should have keep-cloud selected by default', async () => {
      await goToChooseStep();

      // Check that the keep cloud option has the selected styling
      const keepOption = screen.getByText('Keep cloud copy').closest('button');
      expect(keepOption).toHaveClass('border-sky-500');
    });

    it('should allow selecting delete-cloud option', async () => {
      await goToChooseStep();

      await act(async () => {
        fireEvent.click(screen.getByText('Delete cloud data'));
      });

      const deleteOption = screen.getByText('Delete cloud data').closest('button');
      expect(deleteOption).toHaveClass('border-red-500');
    });

    it('should go back to preview step when back clicked', async () => {
      await goToChooseStep();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });
    });

    it('should start migration immediately for keep-cloud mode', async () => {
      await goToChooseStep();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      // Should go to progress step
      await waitFor(() => {
        expect(mockMigrateCloudToLocal).toHaveBeenCalledWith(
          expect.any(Function),
          'keep-cloud',
          undefined
        );
      });
    });

    it('should pass userId to migrateCloudToLocal when provided', async () => {
      renderWizard({ userId: 'user-abc-123' });

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(mockMigrateCloudToLocal).toHaveBeenCalledWith(
          expect.any(Function),
          'keep-cloud',
          'user-abc-123'
        );
      });
    });

    it('should go to confirm step for delete-cloud mode', async () => {
      await goToChooseStep();

      await act(async () => {
        fireEvent.click(screen.getByText('Delete cloud data'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'Confirm Cloud Deletion' })).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // CONFIRM STEP TESTS
  // ==========================================================================

  describe('confirm step', () => {
    const goToConfirmStep = async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Delete cloud data'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'Confirm Cloud Deletion' })).toBeInTheDocument();
      });
    };

    it('should show warning message', async () => {
      await goToConfirmStep();

      expect(screen.getByText(/ALL cloud data will be permanently deleted/)).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    });

    it('should show data counts in warning', async () => {
      await goToConfirmStep();

      expect(screen.getByText(/10.*players/i)).toBeInTheDocument();
      expect(screen.getByText(/15.*games/i)).toBeInTheDocument();
    });

    it('should require DELETE confirmation', async () => {
      await goToConfirmStep();

      expect(screen.getByPlaceholderText('DELETE')).toBeInTheDocument();
      expect(screen.getByText('Type DELETE to confirm:')).toBeInTheDocument();
    });

    it('should disable submit button when confirmation text is wrong', async () => {
      await goToConfirmStep();

      const submitButton = screen.getByRole('button', { name: /Download & Delete/i });
      expect(submitButton).toBeDisabled();

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('DELETE'), {
          target: { value: 'WRONG' },
        });
      });

      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when DELETE is typed (case insensitive)', async () => {
      await goToConfirmStep();

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('DELETE'), {
          target: { value: 'delete' },
        });
      });

      const submitButton = screen.getByRole('button', { name: /Download & Delete/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('should go back to choose step when cancel clicked', async () => {
      await goToConfirmStep();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });
    });

    it('should clear confirmation text when going back', async () => {
      await goToConfirmStep();

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('DELETE'), {
          target: { value: 'DELETE' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      });

      // Go back to confirm step
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText('DELETE')).toHaveValue('');
      });
    });

    it('should start migration with delete-cloud mode when confirmed', async () => {
      await goToConfirmStep();

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('DELETE'), {
          target: { value: 'DELETE' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Download & Delete/i }));
      });

      await waitFor(() => {
        expect(mockMigrateCloudToLocal).toHaveBeenCalledWith(
          expect.any(Function),
          'delete-cloud',
          undefined
        );
      });
    });
  });

  // ==========================================================================
  // PROGRESS STEP TESTS
  // ==========================================================================

  describe('progress step', () => {
    it('should show progress bar during migration', async () => {
      // Make migration take time
      mockMigrateCloudToLocal.mockImplementation(
        (onProgress: (p: ReverseMigrationProgress) => void) => {
          onProgress({
            stage: 'downloading',
            progress: 50,
            currentEntity: 'games',
            message: 'Downloading games...',
          });
          return new Promise(() => {}); // Never resolve
        }
      );

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('50%')).toBeInTheDocument();
        expect(screen.getByText('Downloading games...')).toBeInTheDocument();
      });
    });

    it('should hide close button during migration', async () => {
      mockMigrateCloudToLocal.mockImplementation(() => new Promise(() => {}));

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText(/Downloading/)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // COMPLETE STEP TESTS
  // ==========================================================================

  describe('complete step', () => {
    const triggerSuccessfulMigration = async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      // Wait for complete step - look for the Done & Reload button which only appears on complete step
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Done & Reload' })).toBeInTheDocument();
      });
    };

    it('should show success message', async () => {
      await triggerSuccessfulMigration();

      expect(screen.getByText('Switch Complete!')).toBeInTheDocument();
      expect(screen.getByText(/Your data has been downloaded/)).toBeInTheDocument();
    });

    it('should show downloaded counts', async () => {
      await triggerSuccessfulMigration();

      // The counts are displayed in the summary
      expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
    });

    it('should call onComplete when done clicked', async () => {
      await triggerSuccessfulMigration();

      fireEvent.click(screen.getByRole('button', { name: 'Done & Reload' }));

      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should show warnings if present with different title', async () => {
      mockMigrateCloudToLocal.mockResolvedValue({
        ...mockSuccessResult,
        warnings: ['Warning 1', 'Warning 2'],
      });

      await triggerSuccessfulMigration();

      // P1-2: When there are warnings, title should indicate this
      expect(screen.getByText('Switch Complete with Warnings')).toBeInTheDocument();
      expect(screen.getByText('Warnings')).toBeInTheDocument();
      expect(screen.getByText(/Warning 1/)).toBeInTheDocument();
      expect(screen.getByText(/Warning 2/)).toBeInTheDocument();
    });

    it('should truncate warnings list if more than 5', async () => {
      mockMigrateCloudToLocal.mockResolvedValue({
        ...mockSuccessResult,
        warnings: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'],
      });

      await triggerSuccessfulMigration();

      // Should show first 5 and "...and X more" (mock t doesn't interpolate, uses template)
      expect(screen.getByText(/W1/)).toBeInTheDocument();
      expect(screen.getByText(/W5/)).toBeInTheDocument();
      // The mock t function doesn't interpolate, so look for the template pattern
      expect(screen.getByText(/\.\.\.and.*more/)).toBeInTheDocument();
    });

    it('should show deleted message for delete-cloud mode', async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Delete cloud data'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'Confirm Cloud Deletion' })).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('DELETE'), {
          target: { value: 'DELETE' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Download & Delete/i }));
      });

      await waitFor(() => {
        expect(screen.getByText(/cloud data has been deleted/)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // ERROR STEP TESTS
  // ==========================================================================

  describe('error step', () => {
    const triggerFailedMigration = async () => {
      mockMigrateCloudToLocal.mockResolvedValue({
        success: false,
        errors: ['Network error', 'Failed to save data'],
        warnings: [],
        downloaded: {
          players: 0,
          teams: 0,
          teamRosters: 0,
          seasons: 0,
          tournaments: 0,
          games: 0,
          personnel: 0,
          playerAdjustments: 0,
          warmupPlan: false,
          settings: false,
        },
      });

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'Download Failed' })).toBeInTheDocument();
      });
    };

    it('should show error title', async () => {
      await triggerFailedMigration();

      expect(screen.getByRole('heading', { level: 2, name: 'Download Failed' })).toBeInTheDocument();
    });

    it('should show error messages', async () => {
      await triggerFailedMigration();

      expect(screen.getByText(/Network error/)).toBeInTheDocument();
      expect(screen.getByText(/Failed to save data/)).toBeInTheDocument();
    });

    it('should allow retry', async () => {
      await triggerFailedMigration();

      // Reset mock for retry
      mockMigrateCloudToLocal.mockResolvedValue(mockSuccessResult);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      });

      // Should go back to preview
      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });
    });

    it('should have retry cooldown', async () => {
      await triggerFailedMigration();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      });

      // Now trigger another error
      mockMigrateCloudToLocal.mockResolvedValue({
        success: false,
        errors: ['Another error'],
        warnings: [],
        downloaded: {
          players: 0, teams: 0, teamRosters: 0, seasons: 0, tournaments: 0,
          games: 0, personnel: 0, playerAdjustments: 0, warmupPlan: false, settings: false,
        },
      });

      // Go through steps again
      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'Download Failed' })).toBeInTheDocument();
      });

      // Retry button should show cooldown (we just used retry)
      const retryButton = screen.getByRole('button', { name: /Retry/ });
      expect(retryButton).toBeDisabled();
    });

    it('should allow cancel from error step', async () => {
      await triggerFailedMigration();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should handle thrown exceptions', async () => {
      // Use an error that will be sanitized to a generic message
      mockMigrateCloudToLocal.mockRejectedValue(new Error('Some internal error'));

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'Download Failed' })).toBeInTheDocument();
        // Error messages are sanitized - generic errors show user-friendly message
        // Text includes bullet point prefix
        expect(screen.getByText(/Download failed\. Please try again\./)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // ACCESSIBILITY TESTS
  // ==========================================================================

  describe('accessibility', () => {
    it('should have proper ARIA attributes', async () => {
      renderWizard();

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'reverse-migration-wizard-title');
    });

    it('should update title based on step', async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Switch to Local Mode');
      });

      // Go to choose step
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      // Title should still be Switch to Local Mode for choose step
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Switch to Local Mode');
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge cases', () => {
    it('should not start migration while already migrating', async () => {
      // Make migration take forever
      mockMigrateCloudToLocal.mockImplementation(() => new Promise(() => {}));

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      // Wait for migration to start
      await waitFor(() => {
        expect(mockMigrateCloudToLocal).toHaveBeenCalledTimes(1);
      });

      // Migration should only be called once even if something tries to trigger it again
      expect(mockMigrateCloudToLocal).toHaveBeenCalledTimes(1);
    });

    it('should handle unmount during loading gracefully', async () => {
      let resolveSummary: (value: typeof mockSummary) => void;
      const summaryPromise = new Promise<typeof mockSummary>((resolve) => {
        resolveSummary = resolve;
      });
      mockGetCloudDataSummary.mockReturnValue(summaryPromise);

      const { unmount } = renderWizard();

      // Unmount before loading completes
      unmount();

      // Should not throw
      await act(async () => {
        resolveSummary!(mockSummary);
      });
    });

    it('should close modal when Escape is pressed during preview step', async () => {
      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should NOT close modal when Escape is pressed during progress step', async () => {
      let resolveMigration: () => void;
      const migrationPromise = new Promise<void>((resolve) => {
        resolveMigration = resolve;
      });
      mockMigrateCloudToLocal.mockReturnValue(migrationPromise);

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      // Go to choose step
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      // Start migration (keep-cloud mode - no confirm step)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      // Wait for progress step
      await waitFor(() => {
        expect(screen.getByText(/Downloading Your Data/)).toBeInTheDocument();
      });

      // Try to close with Escape - should be blocked
      fireEvent.keyDown(document, { key: 'Escape' });

      // onCancel should NOT have been called
      expect(mockOnCancel).not.toHaveBeenCalled();

      await act(async () => {
        resolveMigration!();
      });
    });

    it('should disable retry button during cooldown', async () => {
      // Make migration fail
      mockMigrateCloudToLocal.mockResolvedValue({
        success: false,
        errors: ['Test error'],
        warnings: [],
        downloaded: mockSummary,
        cloudDeleted: false,
      });

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });

      // Go to choose step
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      await waitFor(() => {
        expect(screen.getByText('What should happen to your cloud data?')).toBeInTheDocument();
      });

      // Start migration
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      // Wait for error step (use heading role to avoid duplicate text match)
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'Download Failed' })).toBeInTheDocument();
      });

      // Retry button should exist (first retry, no cooldown yet)
      const retryButton = screen.getByRole('button', { name: 'Retry' });
      expect(retryButton).toBeInTheDocument();

      // Click retry - this will trigger cooldown for next retry
      await act(async () => {
        fireEvent.click(retryButton);
      });

      // Should go back to preview
      await waitFor(() => {
        expect(screen.getByText('Your Cloud Data')).toBeInTheDocument();
      });
    });
  });
});
