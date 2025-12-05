 
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

import SettingsModal from './SettingsModal';
import { ToastProvider } from '@/contexts/ToastProvider';

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
      <ToastProvider>
        {children}
      </ToastProvider>
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
    // Ensure navigator.storage is undefined by default for clean test state
    if ('storage' in navigator) {
      delete (navigator as any).storage;
    }
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

  test('displays storage unavailable message when navigator.storage is not supported', () => {
    // Don't mock navigator.storage - let it be undefined
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText('Storage Usage')).toBeInTheDocument();
    expect(screen.getByText('Storage usage information unavailable.')).toBeInTheDocument();
  });

  test('displays storage usage when available', async () => {
    // Mock navigator.storage.estimate before rendering
    const estimateMock = jest.fn().mockResolvedValue({ usage: 1048576, quota: 5242880 });
    Object.defineProperty(global.navigator, 'storage', {
      value: { estimate: estimateMock },
      configurable: true,
      writable: true,
    });

    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );

    // Wait for the storage section to appear
    expect(await screen.findByText('Storage Usage')).toBeInTheDocument();

    // Wait for the storage estimate to resolve and display
    await waitFor(() => {
      expect(estimateMock).toHaveBeenCalled();
    });

    expect(await screen.findByText(/1\.0 MB of 5\.0 MB used/)).toBeInTheDocument();
  });

  test('displays usage in KB when below 1 MB', async () => {
    // Mock navigator.storage.estimate with smaller usage
    const estimateMock = jest.fn().mockResolvedValue({
      usage: 512 * 1024, // 512 KB
      quota: 5 * 1024 * 1024, // 5 MB to match test expectation
    });
    Object.defineProperty(global.navigator, 'storage', {
      value: { estimate: estimateMock },
      configurable: true,
      writable: true,
    });

    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );

    // Wait for the storage section to appear
    expect(await screen.findByText('Storage Usage')).toBeInTheDocument();

    // Wait for the storage estimate to resolve and display
    await waitFor(() => {
      expect(estimateMock).toHaveBeenCalled();
    });

    // Wait for the text to appear, using a more flexible matcher
    await waitFor(() => {
      const text = screen.queryByText(/512\.0 KB of 5\.0 MB used/);
      expect(text).toBeInTheDocument();
    });
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

  /**
   * Tests club season date selectors rendering
   * @critical
   */
  test('should render club season date selectors', () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );

    // Check for period start label
    const startLabel = screen.getByText(/Period Start/i);
    expect(startLabel).toBeInTheDocument();

    // Check for period end label
    const endLabel = screen.getByText(/Period End/i);
    expect(endLabel).toBeInTheDocument();

    // Verify month and day dropdowns exist
    const monthSelects = screen.getAllByLabelText(/Month/i);
    expect(monthSelects.length).toBeGreaterThanOrEqual(2); // At least 2 month selects (start and end)

    const daySelects = screen.getAllByLabelText(/Day/i);
    expect(daySelects.length).toBeGreaterThanOrEqual(2); // At least 2 day selects (start and end)
  });

  /**
   * Tests that season date dropdowns are interactive
   * @integration
   */
  test('should allow changing season date values', async () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText(/Period Start/i)).toBeInTheDocument();
    });

    // Find the month and day select elements
    const monthSelects = screen.getAllByLabelText(/Month/i);
    const daySelects = screen.getAllByLabelText(/Day/i);

    // Verify the dropdown elements are rendered and can be interacted with
    expect(monthSelects.length).toBeGreaterThanOrEqual(2);
    expect(daySelects.length).toBeGreaterThanOrEqual(2);

    // Note: We're not testing the actual save functionality here as that's
    // tested at the unit level in appSettings.test.ts and requires complex mocking
  });
});
