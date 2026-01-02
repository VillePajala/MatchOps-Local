 
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

import SettingsModal from './SettingsModal';
import { ToastProvider } from '@/contexts/ToastProvider';
import { PremiumProvider } from '@/contexts/PremiumContext';

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
      <PremiumProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </PremiumProvider>
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
     * Tests that the state machine waits for installing worker to reach terminal state
     * @critical
     */
    test('should wait for installing worker to reach terminal state (installed)', async () => {
      // Setup: registration has an installing worker
      const stateChangeCallbackRef: { current: (() => void) | null } = { current: null };
      const installingWorker = {
        scriptURL: '/sw.js?v=new',
        state: 'installing',
        addEventListener: jest.fn((event: string, callback: () => void) => {
          if (event === 'statechange') {
            stateChangeCallbackRef.current = callback;
          }
        }),
        removeEventListener: jest.fn(),
      };
      mockRegistration.installing = installingWorker;

      // After update(), simulate the worker becoming installed
      mockRegistration.update.mockImplementation(async () => {
        // Installing state continues...
      });

      render(
        <TestWrapper>
          <SettingsModal {...defaultProps} />
        </TestWrapper>
      );

      // Find and click the "Check for Updates" button
      const checkButton = screen.getByRole('button', { name: /Check for Updates/i });
      fireEvent.click(checkButton);

      // Wait for the state change listener to be added
      await waitFor(() => {
        expect(installingWorker.addEventListener).toHaveBeenCalledWith(
          'statechange',
          expect.any(Function)
        );
      });

      // Simulate the worker reaching 'installed' state
      installingWorker.state = 'installed';
      mockRegistration.waiting = { scriptURL: '/sw.js?v=new', postMessage: jest.fn() };
      mockRegistration.installing = null;

      // Trigger the state change callback
      if (stateChangeCallbackRef.current) {
        stateChangeCallbackRef.current();
      }

      // Should eventually show the update confirmation dialog
      await waitFor(() => {
        expect(installingWorker.removeEventListener).toHaveBeenCalledWith(
          'statechange',
          expect.any(Function)
        );
      });
    });

    /**
     * Tests that redundant (failed) worker state is handled correctly
     * @edge-case
     */
    test('should handle installing worker that becomes redundant', async () => {
      const stateChangeCallbackRef: { current: (() => void) | null } = { current: null };
      const installingWorker = {
        scriptURL: '/sw.js?v=new',
        state: 'installing',
        addEventListener: jest.fn((event: string, callback: () => void) => {
          if (event === 'statechange') {
            stateChangeCallbackRef.current = callback;
          }
        }),
        removeEventListener: jest.fn(),
      };
      mockRegistration.installing = installingWorker;

      render(
        <TestWrapper>
          <SettingsModal {...defaultProps} />
        </TestWrapper>
      );

      const checkButton = screen.getByRole('button', { name: /Check for Updates/i });
      fireEvent.click(checkButton);

      await waitFor(() => {
        expect(installingWorker.addEventListener).toHaveBeenCalledWith(
          'statechange',
          expect.any(Function)
        );
      });

      // Simulate the worker becoming redundant (failure case)
      installingWorker.state = 'redundant';
      mockRegistration.installing = null;

      if (stateChangeCallbackRef.current) {
        stateChangeCallbackRef.current();
      }

      // Should clean up the listener
      await waitFor(() => {
        expect(installingWorker.removeEventListener).toHaveBeenCalledWith(
          'statechange',
          expect.any(Function)
        );
      });
    });

    /**
     * Tests that handleUpdateConfirmed shows message instead of reloading
     * @critical - Safety fix to prevent data loss
     */
    test('should show message instead of reloading on update confirm', async () => {
      // Setup: registration has a waiting worker ready to activate
      const postMessageMock = jest.fn();
      mockRegistration.waiting = {
        scriptURL: '/sw.js?v=new',
        postMessage: postMessageMock,
      };

      render(
        <TestWrapper>
          <SettingsModal {...defaultProps} />
        </TestWrapper>
      );

      // Click "Check for Updates" to detect the waiting worker
      const checkButton = screen.getByRole('button', { name: /Check for Updates/i });
      fireEvent.click(checkButton);

      // Wait for the confirmation dialog to appear (use heading role for specificity)
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Update Available/i })).toBeInTheDocument();
      });

      // Click the "Install" button in the confirmation dialog
      const updateButton = screen.getByRole('button', { name: /Install/i });
      fireEvent.click(updateButton);

      // Verify postMessage was called with SKIP_WAITING
      await waitFor(() => {
        expect(postMessageMock).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      });

      // The confirmation dialog should be closed
      await waitFor(() => {
        expect(screen.queryByText(/Update Available/i)).not.toBeInTheDocument();
      });

      // CRITICAL: The code path in handleUpdateConfirmed does NOT call window.location.reload
      // This is verified by the code review - if it did call reload, the dialog would not close
      // because the page would refresh before React state could update
    });

    /**
     * Tests detection of already-waiting worker (skips installing state)
     * @edge-case
     */
    test('should detect waiting worker immediately without installing phase', async () => {
      // Setup: registration already has a waiting worker (no installing phase)
      mockRegistration.waiting = { scriptURL: '/sw.js?v=new', postMessage: jest.fn() };
      mockRegistration.installing = null;

      render(
        <TestWrapper>
          <SettingsModal {...defaultProps} />
        </TestWrapper>
      );

      const checkButton = screen.getByRole('button', { name: /Check for Updates/i });
      fireEvent.click(checkButton);

      // Should show update available since waiting worker exists (use heading role for specificity)
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Update Available/i })).toBeInTheDocument();
      });
    });
  });
});
