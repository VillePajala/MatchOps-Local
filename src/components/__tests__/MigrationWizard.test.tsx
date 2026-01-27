/**
 * Tests for simplified MigrationWizard component
 *
 * Tests the simplified migration wizard flow:
 * - Preview: Shows local data, "Sync to Cloud" and "Not Now" buttons
 * - Syncing: Progress during migration
 * - Complete: Success message with "Done" button
 * - Error: Error message with "Retry" and "Cancel" buttons
 *
 * @see docs/03-active-plans/wizard-simplification-plan.md
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MigrationWizard from '../MigrationWizard';
import { getLocalDataSummary, migrateLocalToCloud } from '@/services/migrationService';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// Mock the migration service
jest.mock('@/services/migrationService', () => ({
  getLocalDataSummary: jest.fn(),
  migrateLocalToCloud: jest.fn(),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock useFocusTrap
jest.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: jest.fn(),
}));

const mockDataSummary = {
  players: 10,
  teams: 2,
  teamRosters: 20,
  seasons: 3,
  tournaments: 5,
  games: 50,
  personnel: 4,
  playerAdjustments: 8,
  warmupPlan: true,
  settings: true,
};

const mockMigrationResult = {
  success: true,
  errors: [],
  warnings: [],
  migrated: mockDataSummary,
};

/**
 * Helper to wait for data to load (loading state to complete)
 */
async function waitForDataLoaded() {
  await waitFor(() => {
    expect(screen.getByText('Local Data')).toBeInTheDocument();
  });
}

describe('MigrationWizard', () => {
  const mockOnComplete = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getLocalDataSummary as jest.Mock).mockResolvedValue(mockDataSummary);
    (migrateLocalToCloud as jest.Mock).mockResolvedValue(mockMigrationResult);
  });

  // ============================================================================
  // Loading State Tests
  // ============================================================================

  it('renders loading state initially', async () => {
    // Create a manually resolvable promise to control when data loads
    let resolvePromise: (value: typeof mockDataSummary) => void;
    const delayedPromise = new Promise<typeof mockDataSummary>(resolve => {
      resolvePromise = resolve;
    });
    (getLocalDataSummary as jest.Mock).mockReturnValue(delayedPromise);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    // Should show loading initially
    expect(screen.getByText('Loading data...')).toBeInTheDocument();

    // Resolve the promise
    await act(async () => {
      resolvePromise!(mockDataSummary);
    });

    // After loading, should show preview with Local Data
    await waitForDataLoaded();
  });

  // ============================================================================
  // Preview Step Tests
  // ============================================================================

  it('renders the preview step with local data summary after loading', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    // Wait for loading to complete
    await waitForDataLoaded();

    // Should show data counts
    expect(screen.getByText('Games')).toBeInTheDocument();
    expect(screen.getByText('Players')).toBeInTheDocument();

    // Should have the two action buttons
    expect(screen.getByRole('button', { name: 'Sync to Cloud' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not Now' })).toBeInTheDocument();
  });

  it('calls onCancel when "Not Now" is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Not Now' }));
    });

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when close button is clicked in preview step', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    // Click the close button (X)
    const closeButton = screen.getByLabelText('Close');
    await act(async () => {
      fireEvent.click(closeButton);
    });

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  // ============================================================================
  // Syncing Step Tests
  // ============================================================================

  it('starts migration when "Sync to Cloud" is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    // Migration should be called with merge mode
    expect(migrateLocalToCloud).toHaveBeenCalledWith(expect.any(Function), 'merge');
  });

  it('shows progress state during migration', async () => {
    // Make migration take time
    let resolveMigration: (result: typeof mockMigrationResult) => void;
    const migrationPromise = new Promise<typeof mockMigrationResult>(resolve => {
      resolveMigration = resolve;
    });
    (migrateLocalToCloud as jest.Mock).mockReturnValue(migrationPromise);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    // Should show preparing message
    await waitFor(() => {
      expect(screen.getByText('Preparing...')).toBeInTheDocument();
    });

    // Close button should not be visible during sync
    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();

    // Resolve migration
    await act(async () => {
      resolveMigration!(mockMigrationResult);
    });
  });

  // ============================================================================
  // Complete Step Tests
  // ============================================================================

  it('shows complete step after successful migration', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync complete!')).toBeInTheDocument();
    });

    // Should show Done button
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('calls onComplete when Done is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });

    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete when close button is clicked in complete step', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync complete!')).toBeInTheDocument();
    });

    // Click close button in complete step
    const closeButton = screen.getByLabelText('Close');
    await act(async () => {
      fireEvent.click(closeButton);
    });

    // Should call onComplete (not onCancel) in complete step
    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });

  // ============================================================================
  // Error Step Tests
  // ============================================================================

  it('shows error step when migration fails', async () => {
    const failedResult = {
      success: false,
      errors: ['Network error occurred'],
      warnings: [],
      migrated: { players: 0, teams: 0, games: 0, seasons: 0, tournaments: 0, personnel: 0, teamRosters: 0 },
    };
    (migrateLocalToCloud as jest.Mock).mockResolvedValue(failedResult);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    // Should show sanitized error message (not raw error from service)
    expect(screen.getByText('Network error. Please check your connection and try again.')).toBeInTheDocument();

    // Should show Retry and Cancel buttons
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('allows retry from error step', async () => {
    const failedResult = {
      success: false,
      errors: ['First attempt failed'],
      warnings: [],
      migrated: { players: 0, teams: 0, games: 0, seasons: 0, tournaments: 0, personnel: 0, teamRosters: 0 },
    };
    (migrateLocalToCloud as jest.Mock)
      .mockResolvedValueOnce(failedResult)
      .mockResolvedValueOnce(mockMigrationResult);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    // First attempt fails
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    // Click Retry - goes back to preview
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });

    // Should go back to preview step
    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Second attempt succeeds
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync complete!')).toBeInTheDocument();
    });
  });

  it('calls onCancel when Cancel is clicked in error step', async () => {
    const failedResult = {
      success: false,
      errors: ['Migration failed'],
      warnings: [],
      migrated: { players: 0, teams: 0, games: 0, seasons: 0, tournaments: 0, personnel: 0, teamRosters: 0 },
    };
    (migrateLocalToCloud as jest.Mock).mockResolvedValue(failedResult);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  // ============================================================================
  // Error Message Sanitization Tests
  // ============================================================================

  it('sanitizes network error messages', async () => {
    const networkError = new Error('fetch failed: network error');
    (migrateLocalToCloud as jest.Mock).mockRejectedValue(networkError);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    // Should show sanitized message, not raw error
    expect(screen.getByText('Network error. Please check your connection and try again.')).toBeInTheDocument();
    expect(screen.queryByText('fetch failed')).not.toBeInTheDocument();
  });

  it('sanitizes authentication error messages', async () => {
    const authError = new Error('not authenticated: session expired at server');
    (migrateLocalToCloud as jest.Mock).mockRejectedValue(authError);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    // Should show sanitized message
    expect(screen.getByText('Session expired. Please sign in again.')).toBeInTheDocument();
  });

  it('sanitizes rate limit error messages', async () => {
    const rateLimitError = new Error('too many requests: rate limit exceeded');
    (migrateLocalToCloud as jest.Mock).mockRejectedValue(rateLimitError);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    // Should show sanitized message
    expect(screen.getByText('Too many attempts. Please wait a moment and try again.')).toBeInTheDocument();
  });

  it('sanitizes storage/quota error messages', async () => {
    const quotaError = new Error('quota exceeded: storage limit reached');
    (migrateLocalToCloud as jest.Mock).mockRejectedValue(quotaError);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    // Should show sanitized message
    expect(screen.getByText('Storage error. Please try again or contact support.')).toBeInTheDocument();
  });

  it('sanitizes non-Error objects', async () => {
    // When a string or other non-Error is thrown
    (migrateLocalToCloud as jest.Mock).mockRejectedValue('string error message');

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    // Should show generic sanitized message
    expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
    // Should NOT show the raw string
    expect(screen.queryByText('string error message')).not.toBeInTheDocument();
  });

  // ============================================================================
  // Data Loading Error Tests
  // ============================================================================

  it('handles data loading errors gracefully', async () => {
    (getLocalDataSummary as jest.Mock).mockRejectedValue(new Error('IndexedDB error'));

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    // Should show error state after loading fails
    await waitFor(() => {
      expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
    });

    // Should show error message
    expect(screen.getByText('Failed to load your data. Please try again.')).toBeInTheDocument();

    // Should have Retry and Cancel buttons
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('allows retry after data loading error', async () => {
    // First call fails, second succeeds
    (getLocalDataSummary as jest.Mock)
      .mockRejectedValueOnce(new Error('IndexedDB error'))
      .mockResolvedValueOnce(mockDataSummary);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText('Failed to load your data. Please try again.')).toBeInTheDocument();
    });

    // Click Retry
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });

    // Should show data after retry succeeds
    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Sync button should now be enabled
    expect(screen.getByRole('button', { name: 'Sync to Cloud' })).toBeEnabled();
  });

  // ============================================================================
  // Empty Data Tests
  // ============================================================================

  it('shows "No data to sync" when local data is empty', async () => {
    (getLocalDataSummary as jest.Mock).mockResolvedValue({
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
    });

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('No data to sync')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Deprecated Props Tests
  // ============================================================================

  it('accepts deprecated cloudCounts prop without error', async () => {
    // Old code might still pass these props - ensure they don't cause errors
    const cloudCounts = {
      players: 5,
      teams: 1,
      games: 10,
      seasons: 2,
      tournaments: 1,
      personnel: 0,
      teamRosters: 5,
      playerAdjustments: 0,
      warmupPlan: false,
      settings: false,
    };

    render(
      <MigrationWizard
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        cloudCounts={cloudCounts}
        isLoadingCloudCounts={false}
      />
    );

    // Wait for data to load
    await waitForDataLoaded();

    // Should render normally - deprecated props are ignored
    expect(screen.getByRole('button', { name: 'Sync to Cloud' })).toBeInTheDocument();
  });

  // ============================================================================
  // Double-Click Protection Tests
  // ============================================================================

  it('prevents double-click on Sync to Cloud button', async () => {
    let migrationCallCount = 0;
    let resolveMigration: () => void;
    const migrationPromise = new Promise<typeof mockMigrationResult>(resolve => {
      resolveMigration = () => resolve(mockMigrationResult);
    });
    (migrateLocalToCloud as jest.Mock).mockImplementation(() => {
      migrationCallCount++;
      return migrationPromise;
    });

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    await waitForDataLoaded();

    const syncButton = screen.getByRole('button', { name: 'Sync to Cloud' });

    // Rapid double-click
    await act(async () => {
      fireEvent.click(syncButton);
      fireEvent.click(syncButton);
    });

    // Should only call migration once due to syncLockRef
    expect(migrationCallCount).toBe(1);

    // Cleanup
    await act(async () => {
      resolveMigration!();
    });

    await waitFor(() => {
      expect(screen.getByText('Sync complete!')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Additional Error Sanitization Tests
  // ============================================================================

  it('sanitizes timeout error messages', async () => {
    const timeoutError = new Error('request timed out after 30000ms');
    (migrateLocalToCloud as jest.Mock).mockRejectedValue(timeoutError);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    expect(screen.getByText('Request timed out. Please try again with a stable connection.')).toBeInTheDocument();
  });

  it('sanitizes permission error messages', async () => {
    const permissionError = new Error('row level security policy violation');
    (migrateLocalToCloud as jest.Mock).mockRejectedValue(permissionError);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    expect(screen.getByText('Permission error. Please try signing out and back in.')).toBeInTheDocument();
  });

  it('sanitizes validation error messages', async () => {
    const validationError = new Error('validation failed: invalid email format');
    (migrateLocalToCloud as jest.Mock).mockRejectedValue(validationError);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    expect(screen.getByText('Data validation failed. Please check your data and try again.')).toBeInTheDocument();
  });

  it('sanitizes result.errors array (not just thrown exceptions)', async () => {
    // When migration returns failure with errors array (not thrown exception)
    const failedResult = {
      success: false,
      errors: ['RLS policy denied: insufficient permissions'],
      warnings: [],
      migrated: { players: 0, teams: 0, games: 0, seasons: 0, tournaments: 0, personnel: 0, teamRosters: 0 },
    };
    (migrateLocalToCloud as jest.Mock).mockResolvedValue(failedResult);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    await waitForDataLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    // Should show sanitized message (matches 'policy' pattern)
    expect(screen.getByText('Permission error. Please try signing out and back in.')).toBeInTheDocument();
    // Should NOT show raw error
    expect(screen.queryByText('RLS policy denied')).not.toBeInTheDocument();
  });

  // ============================================================================
  // Retry Data Reload Tests
  // ============================================================================

  it('reloads data on retry after sync failure', async () => {
    let loadCallCount = 0;
    (getLocalDataSummary as jest.Mock).mockImplementation(() => {
      loadCallCount++;
      return Promise.resolve(mockDataSummary);
    });

    const failedResult = {
      success: false,
      errors: ['Sync failed'],
      warnings: [],
      migrated: { players: 0, teams: 0, games: 0, seasons: 0, tournaments: 0, personnel: 0, teamRosters: 0 },
    };
    (migrateLocalToCloud as jest.Mock)
      .mockResolvedValueOnce(failedResult)
      .mockResolvedValueOnce(mockMigrationResult);

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitForDataLoaded();
    expect(loadCallCount).toBe(1); // Initial load

    // Sync fails
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to Cloud' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    // Retry
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });

    // Should reload data on retry
    await waitFor(() => {
      expect(loadCallCount).toBe(2);
    });
  });
});
