import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

import SettingsModal from './SettingsModal';
import { ToastProvider } from '@/contexts/ToastProvider';
import { PremiumProvider } from '@/contexts/PremiumContext';
import { AuthProvider } from '@/contexts/AuthProvider';

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
      <AuthProvider>
        <PremiumProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </PremiumProvider>
      </AuthProvider>
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
        'settingsModal.tabs.general': 'General',
        'settingsModal.tabs.season': 'Season',
        'settingsModal.tabs.data': 'Data',
        'settingsModal.tabs.premium': 'Premium',
        'settingsModal.tabs.about': 'About',
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
        'settingsModal.checkForUpdates': 'Check for Updates',
        'settingsModal.checkingUpdates': 'Checking...',
        'settingsModal.updateAvailableTitle': 'Update Available',
        'settingsModal.updateAvailableConfirmSafe': 'Update available! Click Install to prepare the update. You can reload when convenient to apply it.',
        'settingsModal.installUpdate': 'Install',
        'settingsModal.updateReadyReload': 'Update installed! Reload the app when ready to apply.',
        'settingsModal.upToDate': 'App is up to date!',
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

// Helper to navigate to a specific tab
// Note: Season settings are now in General tab, Premium renamed to Account
const navigateToTab = (tabName: 'General' | 'Data' | 'Account' | 'About') => {
  const tab = screen.getByRole('button', { name: tabName });
  fireEvent.click(tab);
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

    navigateToTab('About');

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

    navigateToTab('About');

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

    navigateToTab('About');

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
    // Hard Reset is in the Account tab (Danger Zone section)
    navigateToTab('Account');
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
    navigateToTab('About');
    fireEvent.click(screen.getByRole('button', { name: /Reset App Guide/i }));
    expect(defaultProps.onResetGuide).toHaveBeenCalled();
  });

  test('backup button triggers callback', () => {
    render(
      <TestWrapper>
        <SettingsModal {...defaultProps} />
      </TestWrapper>
    );
    // Backup button is in Data tab
    navigateToTab('Data');
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

    navigateToTab('General');

    // Check for season start label
    const startLabel = screen.getByText(/New season starts/i);
    expect(startLabel).toBeInTheDocument();

    // Check for season ends label (read-only display)
    const endLabel = screen.getByText(/Season ends/i);
    expect(endLabel).toBeInTheDocument();

    // Verify month and day dropdowns exist for start date only (end date is auto-calculated, read-only)
    const monthSelects = screen.getAllByLabelText(/Month/i);
    expect(monthSelects.length).toBe(1); // Only 1 month select (start)

    const daySelects = screen.getAllByLabelText(/Day/i);
    expect(daySelects.length).toBe(1); // Only 1 day select (start)

    // Verify auto-calculated text is shown
    expect(screen.getByText(/auto-calculated/i)).toBeInTheDocument();
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

    navigateToTab('General');

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText(/New season starts/i)).toBeInTheDocument();
    });

    // Find the month and day select elements (only for start date)
    const monthSelects = screen.getAllByLabelText(/Month/i);
    const daySelects = screen.getAllByLabelText(/Day/i);

    // Verify the dropdown elements are rendered and can be interacted with
    // Only 1 month and 1 day select (end date is auto-calculated, read-only)
    expect(monthSelects.length).toBe(1);
    expect(daySelects.length).toBe(1);

    // Note: We're not testing the actual save functionality here as that's
    // tested at the unit level in appSettings.test.ts and requires complex mocking
  });

  /**
   * Service Worker Update Flow Tests
   * @critical - Tests the state machine for SW updates to prevent regressions
   */
  describe('Service Worker Update Flow', () => {
    let mockRegistration: {
      active: { scriptURL: string } | null;
      waiting: { scriptURL: string; postMessage: jest.Mock } | null;
      installing: {
        scriptURL: string;
        state: string;
        addEventListener: jest.Mock;
        removeEventListener: jest.Mock;
      } | null;
      update: jest.Mock;
    };

    let originalServiceWorker: ServiceWorkerContainer;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      // Store originals
      originalServiceWorker = navigator.serviceWorker;
      originalFetch = global.fetch;

      // Create mock registration
      mockRegistration = {
        active: { scriptURL: '/sw.js' },
        waiting: null,
        installing: null,
        update: jest.fn().mockResolvedValue(undefined),
      };

      // Mock navigator.serviceWorker
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          getRegistration: jest.fn().mockResolvedValue(mockRegistration),
        },
        configurable: true,
      });

      // Mock fetch for sw.js
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('// Build Timestamp: 2026-01-02T12:00:00Z'),
      });
    });

    afterEach(() => {
      // Restore originals
      Object.defineProperty(navigator, 'serviceWorker', {
        value: originalServiceWorker,
        configurable: true,
      });
      global.fetch = originalFetch;
    });

    /**
     * Tests that update check triggers registration.update()
     * @critical
     */
    test('should call registration.update() when checking for updates', async () => {
      mockRegistration.waiting = null;
      mockRegistration.installing = null;

      render(
        <TestWrapper>
          <SettingsModal {...defaultProps} />
        </TestWrapper>
      );

      navigateToTab('About');

      // Find and click the "Check for Updates" button
      const checkButton = screen.getByRole('button', { name: /Check for Updates/i });
      fireEvent.click(checkButton);

      // Wait for registration.update() to be called
      await waitFor(() => {
        expect(mockRegistration.update).toHaveBeenCalled();
      });
    });

    /**
     * Tests that button shows loading state during update check
     * @edge-case
     */
    test('should disable button while checking for updates', async () => {
      // Make update() take time to resolve
      let resolveUpdate: () => void;
      mockRegistration.update.mockImplementation(() => new Promise<void>(r => { resolveUpdate = r; }));

      render(
        <TestWrapper>
          <SettingsModal {...defaultProps} />
        </TestWrapper>
      );

      navigateToTab('About');

      const checkButton = screen.getByRole('button', { name: /Check for Updates/i });

      // Button should be enabled initially
      expect(checkButton).not.toBeDisabled();

      fireEvent.click(checkButton);

      // Button should be disabled while checking
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Checking/i })).toBeDisabled();
      });

      // Resolve the update promise
      resolveUpdate!();

      // Button should be enabled again after check completes
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Check for Updates/i })).not.toBeDisabled();
      });
    });

    /**
     * Tests that check for updates shows up-to-date toast when no update available
     * @critical - User feedback when app is current
     */
    test('should show up-to-date toast when no waiting worker exists', async () => {
      // Setup: no waiting worker (app is up to date)
      mockRegistration.waiting = null;
      mockRegistration.installing = null;

      render(
        <TestWrapper>
          <SettingsModal {...defaultProps} />
        </TestWrapper>
      );

      navigateToTab('About');

      // Click "Check for Updates"
      const checkButton = screen.getByRole('button', { name: /Check for Updates/i });
      fireEvent.click(checkButton);

      // Wait for registration.update() to be called
      await waitFor(() => {
        expect(mockRegistration.update).toHaveBeenCalled();
      });

      // Should show "up to date" toast (UpdateBanner handles the update UI, not SettingsModal)
      await waitFor(() => {
        expect(screen.getByText(/App is up to date/i)).toBeInTheDocument();
      });
    });

    /**
     * Tests that check for updates does NOT show toast when update is available
     * @edge-case - UpdateBanner (separate component) handles update UI
     */
    test('should not show up-to-date toast when waiting worker exists', async () => {
      // Setup: waiting worker exists (update available)
      mockRegistration.waiting = { scriptURL: '/sw.js?v=new', postMessage: jest.fn() };
      mockRegistration.installing = null;

      render(
        <TestWrapper>
          <SettingsModal {...defaultProps} />
        </TestWrapper>
      );

      navigateToTab('About');

      const checkButton = screen.getByRole('button', { name: /Check for Updates/i });
      fireEvent.click(checkButton);

      // Wait for registration.update() to be called
      await waitFor(() => {
        expect(mockRegistration.update).toHaveBeenCalled();
      });

      // Should NOT show "up to date" toast when update is available
      // Note: UpdateBanner (a separate component) handles showing the update UI
      await waitFor(() => {
        expect(screen.queryByText(/App is up to date/i)).not.toBeInTheDocument();
      });
    });
  });

});
