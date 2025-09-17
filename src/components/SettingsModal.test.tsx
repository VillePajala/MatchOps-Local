/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

import SettingsModal from './SettingsModal';

// Create test query client
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  },
});

// Test wrapper with providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: any) => {
      if (typeof fallbackOrOpts === 'string') return fallbackOrOpts;
      if (key === 'settingsModal.storageUsageDetails' && fallbackOrOpts) {
        return `${fallbackOrOpts.used} of ${fallbackOrOpts.quota} used`;
      }
      // Return English translations for common keys
      const translations: Record<string, string> = {
        'settingsModal.title': 'App Settings',
        'settingsModal.languageLabel': 'Language',
        'settingsModal.defaultTeamNameLabel': 'Default Team Name',
        'settingsModal.storageUsageLabel': 'Storage Usage',
        'settingsModal.storageUsageUnavailable': 'Storage usage information unavailable.',
        'settingsModal.doneButton': 'Done',
        'settingsModal.dangerZoneTitle': 'Danger Zone',
        'settingsModal.hardResetButton': 'Hard Reset App',
        'settingsModal.resetGuideButton': 'Reset App Guide',
        'settingsModal.confirmResetLabel': 'Type RESET to confirm',
        'settingsModal.backupButton': 'Backup All Data',
        'settingsModal.restoreButton': 'Restore from Backup',
      };
      return translations[key] || fallbackOrOpts || key;
    },
  }),
}));

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  language: 'en',
  onLanguageChange: jest.fn(),
  defaultTeamName: 'My Team',
  onDefaultTeamNameChange: jest.fn(),
  onResetGuide: jest.fn(),
  onHardResetApp: jest.fn(),
  onCreateBackup: jest.fn(),
};

describe('<SettingsModal />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock navigator.storage.estimate properly
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      writable: true,
      value: {
        estimate: jest.fn().mockResolvedValue({ usage: 1048576, quota: 5242880 }),
      },
    });
  });

  test('renders when open', () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );
    expect(screen.getByText('App Settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Team Name')).toBeInTheDocument();
  });

  test('displays storage usage when available', async () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );
    expect(await screen.findByText('Storage Usage')).toBeInTheDocument();
    expect(await screen.findByText(/1\.0 MB of 5\.0 MB used/)).toBeInTheDocument();
  });

  test('displays usage in KB when below 1 MB', async () => {
    (navigator.storage.estimate as jest.Mock).mockResolvedValueOnce({
      usage: 512 * 1024,
      quota: 2 * 1048576,
    });
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );
    expect(await screen.findByText(/512\.0 KB of 5\.0 MB used/)).toBeInTheDocument();
  });

  test('calls onClose when Done clicked', () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /Done/i }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  test('requires typing RESET before Hard Reset', () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );
    const resetBtn = screen.getByRole('button', { name: /Hard Reset App/i });
    expect(resetBtn).toBeDisabled();
    fireEvent.change(
      screen.getByLabelText('Type RESET to confirm'),
      { target: { value: 'RESET' } }
    );
    fireEvent.click(resetBtn);
    expect(defaultProps.onHardResetApp).toHaveBeenCalled();
  });

  test('calls onResetGuide when Reset App Guide clicked', () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /Reset App Guide/i }));
    expect(defaultProps.onResetGuide).toHaveBeenCalled();
  });

  test('backup button triggers callback', () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );
    const backupButton = screen.getByRole('button', { name: /Backup All Data/i });
    fireEvent.click(backupButton);
    expect(defaultProps.onCreateBackup).toHaveBeenCalled();
  });

  test('does not auto focus team name input on open', () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );
    const input = screen.getByLabelText('Default Team Name');
    expect(input).not.toHaveFocus();
  });
});
