/**
 * Tests for MigrationWizard component
 *
 * Tests the migration wizard flow: loading, select-action, confirm, progress, complete, error
 * Part of PR #9: Infrastructure & Migration UI
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MigrationWizard from '../MigrationWizard';
import { getLocalDataSummary, migrateLocalToCloud } from '@/services/migrationService';
import { clearLocalIndexedDBData } from '@/utils/clearLocalData';

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

// Mock the clear local data utility
jest.mock('@/utils/clearLocalData', () => ({
  clearLocalIndexedDBData: jest.fn(),
}));

// Mock backendConfig
jest.mock('@/config/backendConfig', () => ({
  disableCloudMode: jest.fn(() => ({ success: true })),
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

describe('MigrationWizard', () => {
  const mockOnComplete = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getLocalDataSummary as jest.Mock).mockResolvedValue(mockDataSummary);
    (migrateLocalToCloud as jest.Mock).mockResolvedValue(mockMigrationResult);
    (clearLocalIndexedDBData as jest.Mock).mockResolvedValue(undefined);
  });

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

    // Wait for data to load and move to select-action step
    await waitFor(() => {
      expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
    });
  });

  it('renders the select-action step with local data summary after loading', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    // Wait for data summary to load and move to select-action step
    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Check that local data is displayed
    expect(screen.getByText(/50.*Games.*10.*Players.*2.*Teams/i)).toBeInTheDocument();
  });

  it('calls onCancel when Cancel option is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('advances to confirm step when Migrate option is clicked (local-only scenario)', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Click the "Migrate to Cloud (Recommended)" button
    const migrateButton = screen.getByText('Migrate to Cloud (Recommended)');
    fireEvent.click(migrateButton);

    // Should show confirm step
    expect(
      screen.getByText('Are you sure you want to migrate your data to the cloud?')
    ).toBeInTheDocument();
  });

  it('can go back from confirm to select-action', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Go to confirm
    fireEvent.click(screen.getByText('Migrate to Cloud (Recommended)'));
    expect(
      screen.getByText('Are you sure you want to migrate your data to the cloud?')
    ).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByText('Back'));

    // Should be back at select-action
    expect(screen.getByText('Local Data')).toBeInTheDocument();
  });

  it('starts migration when Start Migration is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Go to confirm
    fireEvent.click(screen.getByText('Migrate to Cloud (Recommended)'));

    // Start migration
    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    // Migration should be called
    expect(migrateLocalToCloud).toHaveBeenCalledTimes(1);
  });

  it('shows complete step after successful migration', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Go through wizard
    fireEvent.click(screen.getByText('Migrate to Cloud (Recommended)'));

    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    // Wait for complete step
    await waitFor(() => {
      expect(screen.getByText('Migration complete!')).toBeInTheDocument();
    });
  });

  it('calls onComplete when Done is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Complete migration
    fireEvent.click(screen.getByText('Migrate to Cloud (Recommended)'));

    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    await waitFor(() => {
      expect(screen.getByText('Migration complete!')).toBeInTheDocument();
    });

    // Click Done
    fireEvent.click(screen.getByText('Done'));

    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });

  it('shows error step when migration fails', async () => {
    (migrateLocalToCloud as jest.Mock).mockResolvedValue({
      success: false,
      errors: ['Network error'],
      warnings: [],
      migrated: { ...mockDataSummary, games: 0 },
    });

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Complete migration
    fireEvent.click(screen.getByText('Migrate to Cloud (Recommended)'));

    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    // Should show error step
    await waitFor(() => {
      expect(screen.getByText('Migration Failed')).toBeInTheDocument();
    });

    // Error should be shown
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('allows retry from error step', async () => {
    let callCount = 0;
    (migrateLocalToCloud as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          success: false,
          errors: ['First attempt failed'],
          warnings: [],
          migrated: mockDataSummary,
        });
      }
      return Promise.resolve(mockMigrationResult);
    });

    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // First attempt
    fireEvent.click(screen.getByText('Migrate to Cloud (Recommended)'));

    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    await waitFor(() => {
      expect(screen.getByText('Migration Failed')).toBeInTheDocument();
    });

    // Retry - clicking will start cooldown, but should reset to select-action
    await act(async () => {
      fireEvent.click(screen.getByText('Retry Migration'));
    });

    // Should be back at select-action (retry resets to select-action)
    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });
  });

  it('clears local data when button is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Complete migration
    fireEvent.click(screen.getByText('Migrate to Cloud (Recommended)'));

    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    await waitFor(() => {
      expect(screen.getByText('Migration complete!')).toBeInTheDocument();
    });

    // Clear local data
    await act(async () => {
      fireEvent.click(screen.getByText('Clear Local Data'));
    });

    expect(clearLocalIndexedDBData).toHaveBeenCalledTimes(1);
    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });

  it('shows both-have-data scenario when cloud has data', async () => {
    const cloudCounts = {
      players: 5,
      teams: 1,
      teamRosters: 5,
      seasons: 1,
      tournaments: 2,
      games: 20,
      personnel: 2,
      playerAdjustments: 3,
      warmupPlan: false,
      settings: true,
    };

    render(
      <MigrationWizard
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        cloudCounts={cloudCounts}
        isLoadingCloudCounts={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Should show both local and cloud data
    expect(screen.getByText('Cloud Data')).toBeInTheDocument();

    // Should show merge option (both-have-data scenario)
    expect(screen.getByText('Merge (Recommended)')).toBeInTheDocument();
    expect(screen.getByText('Replace Cloud with Local')).toBeInTheDocument();
    expect(screen.getByText('Keep Cloud (Delete Local)')).toBeInTheDocument();
  });

  it('handles Start Fresh option in local-only scenario', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Local Data')).toBeInTheDocument();
    });

    // Click Start Fresh
    await act(async () => {
      fireEvent.click(screen.getByText('Start Fresh'));
    });

    // Should clear local data and complete
    expect(clearLocalIndexedDBData).toHaveBeenCalledTimes(1);
    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });
});
