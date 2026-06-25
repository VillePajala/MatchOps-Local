/**
 * Tests for BackupReminderBanner (Data Safety - Layer 2b)
 *
 * @module components/__tests__/BackupReminderBanner
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BackupReminderBanner from '../BackupReminderBanner';
import * as appSettings from '@/utils/appSettings';
import * as fullBackup from '@/utils/fullBackup';

jest.mock('@/utils/appSettings');
jest.mock('@/utils/fullBackup');
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: 'user-1' }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));

const mockGetLastOffDevice = appSettings.getLastOffDeviceBackupTime as jest.MockedFunction<
  typeof appSettings.getLastOffDeviceBackupTime
>;
const mockGetDismissed = appSettings.getBackupReminderDismissedTime as jest.MockedFunction<
  typeof appSettings.getBackupReminderDismissedTime
>;
const mockSetDismissed = appSettings.setBackupReminderDismissed as jest.MockedFunction<
  typeof appSettings.setBackupReminderDismissed
>;
const mockExport = fullBackup.exportFullBackup as jest.MockedFunction<typeof fullBackup.exportFullBackup>;

const THIRTY_ONE_DAYS_AGO = Date.now() - 31 * 24 * 60 * 60 * 1000;
const TWO_DAYS_AGO = Date.now() - 2 * 24 * 60 * 60 * 1000;

describe('BackupReminderBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLastOffDevice.mockResolvedValue(null);
    mockGetDismissed.mockResolvedValue(null);
    mockSetDismissed.mockResolvedValue(undefined);
    mockExport.mockResolvedValue('{}');
  });

  it('renders nothing when the user has no saved games', () => {
    const { container } = render(<BackupReminderBanner hasSavedGames={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the reminder when data exists and there is no recent backup', async () => {
    render(<BackupReminderBanner hasSavedGames />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/off-device copy/i)).toBeInTheDocument();
  });

  it('stays hidden when an off-device backup was made recently', async () => {
    mockGetLastOffDevice.mockResolvedValue(TWO_DAYS_AGO);
    const { container } = render(<BackupReminderBanner hasSavedGames />);
    await waitFor(() => expect(mockGetLastOffDevice).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('stays hidden when recently dismissed', async () => {
    mockGetDismissed.mockResolvedValue(TWO_DAYS_AGO);
    const { container } = render(<BackupReminderBanner hasSavedGames />);
    await waitFor(() => expect(mockGetDismissed).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('shows the reminder when a previous backup is older than 30 days', async () => {
    mockGetLastOffDevice.mockResolvedValue(THIRTY_ONE_DAYS_AGO);
    render(<BackupReminderBanner hasSavedGames />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('triggers the export flow when "Back up now" is clicked', async () => {
    render(<BackupReminderBanner hasSavedGames />);
    const button = await screen.findByText('Back up now');
    fireEvent.click(button);
    await waitFor(() => expect(mockExport).toHaveBeenCalledWith(expect.any(Function), 'user-1'));
  });

  it('records a dismissal and hides the banner when dismissed', async () => {
    const { container } = render(<BackupReminderBanner hasSavedGames />);
    const button = await screen.findByText('Dismiss');
    fireEvent.click(button);
    await waitFor(() => expect(mockSetDismissed).toHaveBeenCalled());
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
