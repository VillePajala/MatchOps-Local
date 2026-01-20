/**
 * Tests for MigrationWizard component
 *
 * Tests the migration wizard flow: preview, confirm, progress, complete, error
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
  const mockOnSkip = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getLocalDataSummary as jest.Mock).mockResolvedValue(mockDataSummary);
    (migrateLocalToCloud as jest.Mock).mockResolvedValue(mockMigrationResult);
    (clearLocalIndexedDBData as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders the preview step with data summary', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    // Wait for data summary to load
    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    // Check that counts are displayed
    expect(screen.getByText('Players')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Games')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('shows loading state while fetching data summary', async () => {
    // Use fake timers for deterministic timing
    jest.useFakeTimers();

    // Create a manually resolvable promise
    let resolvePromise: (value: typeof mockDataSummary) => void;
    const delayedPromise = new Promise<typeof mockDataSummary>(resolve => {
      resolvePromise = resolve;
    });
    (getLocalDataSummary as jest.Mock).mockReturnValue(delayedPromise);

    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    // Should show loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Resolve the promise and flush
    await act(async () => {
      resolvePromise!(mockDataSummary);
    });

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Restore real timers
    jest.useRealTimers();
  });

  it('calls onSkip when skip button is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    const skipButton = screen.getByText('Skip for Now');
    fireEvent.click(skipButton);

    expect(mockOnSkip).toHaveBeenCalledTimes(1);
  });

  it('advances to confirm step when Continue is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Should show confirm step
    expect(
      screen.getByText('Are you sure you want to migrate your data to the cloud?')
    ).toBeInTheDocument();
  });

  it('can go back from confirm to preview', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    // Go to confirm
    fireEvent.click(screen.getByText('Continue'));
    expect(
      screen.getByText('Are you sure you want to migrate your data to the cloud?')
    ).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByText('Back'));

    // Should be back at preview
    expect(screen.getByText('Data Summary')).toBeInTheDocument();
  });

  it('starts migration when Start Migration is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    // Go to confirm
    fireEvent.click(screen.getByText('Continue'));

    // Start migration
    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    // Migration should be called
    expect(migrateLocalToCloud).toHaveBeenCalledTimes(1);
  });

  it('shows complete step after successful migration', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    // Go through wizard
    fireEvent.click(screen.getByText('Continue'));

    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    // Wait for complete step
    await waitFor(() => {
      expect(screen.getByText('Migration complete!')).toBeInTheDocument();
    });
  });

  it('calls onComplete when Done is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    // Complete migration
    fireEvent.click(screen.getByText('Continue'));

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

    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    // Complete migration
    fireEvent.click(screen.getByText('Continue'));

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

    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    // First attempt
    fireEvent.click(screen.getByText('Continue'));

    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    await waitFor(() => {
      expect(screen.getByText('Migration Failed')).toBeInTheDocument();
    });

    // Retry
    await act(async () => {
      fireEvent.click(screen.getByText('Retry Migration'));
    });

    // Should be back at preview (retry resets to preview)
    expect(screen.getByText('Data Summary')).toBeInTheDocument();
  });

  it('clears local data when button is clicked', async () => {
    render(<MigrationWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);

    await waitFor(() => {
      expect(screen.getByText('Data Summary')).toBeInTheDocument();
    });

    // Complete migration
    fireEvent.click(screen.getByText('Continue'));

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
});
