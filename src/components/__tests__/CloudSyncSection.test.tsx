/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CloudSyncSection from '../CloudSyncSection';

// Create a test query client
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Wrapper that provides QueryClient context
const renderWithQueryClient = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  const testQueryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>
      {children}
    </QueryClientProvider>
  );
  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient: testQueryClient,
  };
};

// Mock dependencies
jest.mock('@/config/backendConfig', () => ({
  getBackendMode: jest.fn(),
  isCloudAvailable: jest.fn(),
  enableCloudMode: jest.fn(),
  disableCloudMode: jest.fn(),
  getCloudAccountInfo: jest.fn(() => null),
  clearCloudAccountInfo: jest.fn(),
  clearMigrationCompleted: jest.fn(),
}));

jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    mode: 'cloud',
  }),
}));

jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('@/hooks/usePremium', () => ({
  usePremium: () => ({
    isPremium: true,
    isLoading: false,
    canCreate: jest.fn().mockReturnValue(true),
    showUpgradePrompt: jest.fn(),
    grantPremiumAccess: jest.fn(),
    revokePremiumAccess: jest.fn(),
  }),
}));

// Default subscription mock (can be overridden in individual tests)
const mockSubscriptionContext = {
  useSubscriptionOptional: jest.fn().mockReturnValue({
    isActive: true,
    isLoading: false,
  }),
};

jest.mock('@/contexts/SubscriptionContext', () => ({
  useSubscriptionOptional: () => mockSubscriptionContext.useSubscriptionOptional(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  debug: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock ModalProvider context (required by SyncStatusIndicator)
jest.mock('@/contexts/ModalProvider', () => ({
  useModalContext: () => ({
    isGameSettingsModalOpen: false,
    setIsGameSettingsModalOpen: jest.fn(),
    isLoadGameModalOpen: false,
    setIsLoadGameModalOpen: jest.fn(),
    isRosterModalOpen: false,
    setIsRosterModalOpen: jest.fn(),
    isStatsModalOpen: false,
    setIsStatsModalOpen: jest.fn(),
    isNewGameSetupModalOpen: false,
    setIsNewGameSetupModalOpen: jest.fn(),
    isTeamModalOpen: false,
    setIsTeamModalOpen: jest.fn(),
    isSeasonTournamentModalOpen: false,
    setIsSeasonTournamentModalOpen: jest.fn(),
    isPersonnelModalOpen: false,
    setIsPersonnelModalOpen: jest.fn(),
    isSettingsModalOpen: false,
    setIsSettingsModalOpen: jest.fn(),
    openSettingsToTab: jest.fn(),
    settingsInitialTab: undefined,
    isPlayerAssessmentModalOpen: false,
    setIsPlayerAssessmentModalOpen: jest.fn(),
  }),
}));

// Default useSyncStatus mock (can be overridden in individual tests)
const mockSyncStatus = {
  pendingCount: 0,
  failedCount: 0,
  isSyncing: false,
  isOnline: true,
  lastSyncedAt: null,
  syncNow: jest.fn().mockResolvedValue(undefined),
  retryFailed: jest.fn().mockResolvedValue(undefined),
  clearFailed: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/hooks/useSyncStatus', () => ({
  useSyncStatus: () => mockSyncStatus,
}));

// Mock PendingSyncWarningModal for testing pending sync flow
jest.mock('../PendingSyncWarningModal', () => {
  return function MockPendingSyncWarningModal({
    pendingCount,
    failedCount,
    isSyncing,
    isOnline,
    onAction,
  }: {
    pendingCount: number;
    failedCount: number;
    isSyncing: boolean;
    isOnline: boolean;
    onAction: (action: 'sync' | 'discard' | 'cancel') => void;
  }) {
    return (
      <div data-testid="pending-sync-warning-modal">
        <span data-testid="pending-count">{pendingCount}</span>
        <span data-testid="failed-count">{failedCount}</span>
        <span data-testid="is-syncing">{isSyncing ? 'true' : 'false'}</span>
        <span data-testid="is-online">{isOnline ? 'true' : 'false'}</span>
        <button onClick={() => onAction('sync')}>Sync First</button>
        <button onClick={() => onAction('discard')}>Discard & Continue</button>
        <button onClick={() => onAction('cancel')}>Cancel</button>
      </div>
    );
  };
});

// Mock getDataStore and getAuthService for cloud data clearing and sign out tests
jest.mock('@/datastore/factory', () => ({
  getDataStore: jest.fn().mockImplementation(() =>
    Promise.resolve({
      clearAllUserData: jest.fn(),
      getBackendName: jest.fn().mockReturnValue('supabase'),
    })
  ),
  getAuthService: jest.fn().mockImplementation(() =>
    Promise.resolve({
      signOut: jest.fn().mockResolvedValue(undefined),
    })
  ),
}));

// Mock ReverseMigrationWizard for testing wizard flow
jest.mock('../ReverseMigrationWizard', () => {
  return function MockReverseMigrationWizard({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
    return (
      <div data-testid="reverse-migration-wizard">
        <button onClick={onComplete}>Complete Migration</button>
        <button onClick={onCancel}>Cancel Migration</button>
      </div>
    );
  };
});

// Mock UpgradePromptModal to avoid async state update issues from usePlayBilling
jest.mock('../UpgradePromptModal', () => {
  return function MockUpgradePromptModal({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
    source?: string;
  }) {
    if (!isOpen) return null;
    return (
      <div data-testid="upgrade-prompt-modal">
        <button onClick={onClose}>Close Upgrade Modal</button>
        <button onClick={onClose}>Subscribe Now</button>
      </div>
    );
  };
});

import {
  getBackendMode,
  isCloudAvailable,
  enableCloudMode,
  clearMigrationCompleted,
} from '@/config/backendConfig';
import { getDataStore, getAuthService } from '@/datastore/factory';

const mockGetBackendMode = getBackendMode as jest.MockedFunction<typeof getBackendMode>;
const mockIsCloudAvailable = isCloudAvailable as jest.MockedFunction<typeof isCloudAvailable>;
const mockEnableCloudMode = enableCloudMode as jest.MockedFunction<typeof enableCloudMode>;

describe('CloudSyncSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBackendMode.mockReturnValue('local');
    mockIsCloudAvailable.mockReturnValue(false);
    // Reset subscription mock to default state (prevents test pollution)
    mockSubscriptionContext.useSubscriptionOptional.mockReturnValue({
      isActive: true,
      isLoading: false,
    });
    // Reset sync status mock to default state (no pending/failed syncs)
    mockSyncStatus.pendingCount = 0;
    mockSyncStatus.failedCount = 0;
    mockSyncStatus.isSyncing = false;
    mockSyncStatus.isOnline = true;
    mockSyncStatus.lastSyncedAt = null;
    mockSyncStatus.syncNow = jest.fn().mockResolvedValue(undefined);
    mockSyncStatus.retryFailed = jest.fn().mockResolvedValue(undefined);
    mockSyncStatus.clearFailed = jest.fn().mockResolvedValue(undefined);
  });

  describe('local mode display', () => {
    it('shows local mode status when in local mode', () => {
      mockGetBackendMode.mockReturnValue('local');

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.getByText('Local Storage')).toBeInTheDocument();
      expect(screen.getByText('Enable Cloud Sync')).toBeInTheDocument();
    });

    it('shows local mode description', () => {
      mockGetBackendMode.mockReturnValue('local');

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.getByText(/stored locally on this device/i)).toBeInTheDocument();
    });

    it('shows cloud not available warning when cloud is not configured', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(false);

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.getByText(/Cloud sync is not available/i)).toBeInTheDocument();
    });

    it('disables enable button when cloud is not available', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(false);

      renderWithQueryClient(<CloudSyncSection />);

      const enableButton = screen.getByRole('button', { name: /enable cloud sync/i });
      expect(enableButton).toBeDisabled();
    });
  });

  describe('cloud mode display', () => {
    it('shows cloud mode status when in cloud mode', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.getByText('Cloud Sync Enabled')).toBeInTheDocument();
      expect(screen.getByText('Switch to Local Mode')).toBeInTheDocument();
    });

    it('shows cloud mode description', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.getByText(/syncs to the cloud/i)).toBeInTheDocument();
    });

    it('shows sign out button in cloud mode', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });

    it('does not show sign out button in local mode', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    });
  });

  describe('sign out', () => {
    let mockAuthService: { signOut: jest.Mock };

    beforeEach(() => {
      mockAuthService = {
        signOut: jest.fn().mockResolvedValue(undefined),
      };
      (getAuthService as jest.Mock).mockResolvedValue(mockAuthService);
    });

    it('calls signOut when sign out button is clicked', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      const signOutButton = screen.getByRole('button', { name: /sign out/i });
      fireEvent.click(signOutButton);

      await waitFor(() => {
        expect(mockAuthService.signOut).toHaveBeenCalled();
      });
    });

    it('clears migration completed flag before signing out', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      const signOutButton = screen.getByRole('button', { name: /sign out/i });
      fireEvent.click(signOutButton);

      await waitFor(() => {
        // clearMigrationCompleted should be called with the user ID from useAuth mock
        expect(clearMigrationCompleted).toHaveBeenCalledWith('test-user-id');
      });
    });

    it('shows loading state while signing out', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      // Make signOut take some time
      mockAuthService.signOut.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      renderWithQueryClient(<CloudSyncSection />);

      const signOutButton = screen.getByRole('button', { name: /sign out/i });
      fireEvent.click(signOutButton);

      await waitFor(() => {
        expect(screen.getByText(/signing out/i)).toBeInTheDocument();
      });
    });
  });

  describe('enabling cloud mode', () => {
    it('calls enableCloudMode when button is clicked', async () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(true);
      mockEnableCloudMode.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      const enableButton = screen.getByRole('button', { name: /enable cloud sync/i });
      fireEvent.click(enableButton);

      await waitFor(() => {
        expect(mockEnableCloudMode).toHaveBeenCalled();
      });
    });

    it('calls onModeChange callback when mode is enabled', async () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(true);
      mockEnableCloudMode.mockReturnValue(true);

      const onModeChange = jest.fn();
      renderWithQueryClient(<CloudSyncSection onModeChange={onModeChange} />);

      const enableButton = screen.getByRole('button', { name: /enable cloud sync/i });
      fireEvent.click(enableButton);

      await waitFor(() => {
        expect(onModeChange).toHaveBeenCalled();
      });
    });
  });

  describe('disabling cloud mode', () => {
    it('shows reverse migration wizard when button is clicked', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('reverse-migration-wizard')).toBeInTheDocument();
      });
    });

    it('closes wizard when cancelled', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('reverse-migration-wizard')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel Migration' }));

      await waitFor(() => {
        expect(screen.queryByTestId('reverse-migration-wizard')).not.toBeInTheDocument();
      });
    });

    it('closes wizard on completion', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('reverse-migration-wizard')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Complete Migration' }));

      await waitFor(() => {
        expect(screen.queryByTestId('reverse-migration-wizard')).not.toBeInTheDocument();
      });
    });
  });

  describe('migration note', () => {
    it('shows migration note when cloud is available in local mode', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.getByText(/migrate your existing local data/i)).toBeInTheDocument();
    });

    it('does not show migration note in cloud mode', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.queryByText(/migrate your existing local data/i)).not.toBeInTheDocument();
    });
  });

  describe('clear cloud data', () => {
    let mockDataStoreInstance: { clearAllUserData: jest.Mock; getBackendName: jest.Mock };

    beforeEach(() => {
      mockDataStoreInstance = {
        clearAllUserData: jest.fn().mockResolvedValue(undefined),
        getBackendName: jest.fn().mockReturnValue('supabase'),
      };
      (getDataStore as jest.Mock).mockResolvedValue(mockDataStoreInstance);
    });

    it('shows danger zone only in cloud mode with cloud available', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.getByText('Danger Zone')).toBeInTheDocument();
      expect(screen.getByText('Clear All Cloud Data')).toBeInTheDocument();
    });

    it('does not show danger zone in local mode', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument();
    });

    it('shows confirmation dialog when clear button is clicked', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      const clearButton = screen.getByRole('button', { name: /clear all cloud data/i });
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('This action cannot be undone!')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('DELETE')).toBeInTheDocument();
      });
    });

    it('requires DELETE confirmation to proceed', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockDataStoreInstance.getBackendName.mockReturnValue('supabase');

      renderWithQueryClient(<CloudSyncSection />);

      // Open confirmation dialog
      const clearButton = screen.getByRole('button', { name: /clear all cloud data/i });
      fireEvent.click(clearButton);

      // Find the confirm button - it should be disabled until DELETE is typed
      const confirmButton = await screen.findByRole('button', { name: /clear all data/i });
      expect(confirmButton).toBeDisabled();

      // Type partial text - should still be disabled
      const input = screen.getByPlaceholderText('DELETE');
      fireEvent.change(input, { target: { value: 'DELE' } });
      expect(confirmButton).toBeDisabled();

      // Type DELETE - should be enabled
      fireEvent.change(input, { target: { value: 'DELETE' } });
      expect(confirmButton).not.toBeDisabled();
    });

    it('prevents clear if backend is not supabase (defense-in-depth)', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      // Simulate edge case where factory returns wrong backend
      mockDataStoreInstance.getBackendName.mockReturnValue('local');

      const mockShowToast = jest.fn();
      jest.spyOn(require('@/contexts/ToastProvider'), 'useToast').mockReturnValue({
        showToast: mockShowToast,
      });

      renderWithQueryClient(<CloudSyncSection />);

      // Open confirmation dialog
      const clearButton = screen.getByRole('button', { name: /clear all cloud data/i });
      fireEvent.click(clearButton);

      // Type DELETE and confirm
      const input = await screen.findByPlaceholderText('DELETE');
      fireEvent.change(input, { target: { value: 'DELETE' } });

      const confirmButton = screen.getByRole('button', { name: /clear all data/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        // Should show error toast about wrong backend
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('not connected to cloud'),
          'error'
        );
      });

      // clearAllUserData should NOT have been called
      expect(mockDataStoreInstance.clearAllUserData).not.toHaveBeenCalled();
    });

    it('can cancel the confirmation dialog', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      renderWithQueryClient(<CloudSyncSection />);

      // Open confirmation dialog
      const clearButton = screen.getByRole('button', { name: /clear all cloud data/i });
      fireEvent.click(clearButton);

      // Click cancel
      const cancelButton = await screen.findByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      // Confirmation dialog should be hidden
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('DELETE')).not.toBeInTheDocument();
      });
    });
  });

  describe('subscription warning banner', () => {
    it('shows subscription warning when in cloud mode without active subscription', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSubscriptionContext.useSubscriptionOptional.mockReturnValue({
        isActive: false,
        isLoading: false,
      });

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.getByText('Subscription Required')).toBeInTheDocument();
      // "sync is paused" appears in both description and warning banner
      expect(screen.getAllByText(/sync is paused/i)).toHaveLength(2);
      // There are now two "Subscribe Now" buttons - one in banner, one in auto-shown upgrade modal
      expect(screen.getAllByRole('button', { name: /subscribe now/i }).length).toBeGreaterThanOrEqual(1);
      // Verify the upgrade modal is auto-shown
      expect(screen.getByTestId('upgrade-prompt-modal')).toBeInTheDocument();
    });

    it('does not show subscription warning when user has active subscription', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSubscriptionContext.useSubscriptionOptional.mockReturnValue({
        isActive: true,
        isLoading: false,
      });

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.queryByText('Subscription Required')).not.toBeInTheDocument();
      expect(screen.getByText(/syncs to the cloud/i)).toBeInTheDocument();
    });

    it('does not show subscription warning in local mode', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSubscriptionContext.useSubscriptionOptional.mockReturnValue({
        isActive: false,
        isLoading: false,
      });

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.queryByText('Subscription Required')).not.toBeInTheDocument();
    });

    it('does not show subscription warning while loading', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSubscriptionContext.useSubscriptionOptional.mockReturnValue({
        isActive: false,
        isLoading: true,
      });

      renderWithQueryClient(<CloudSyncSection />);

      expect(screen.queryByText('Subscription Required')).not.toBeInTheDocument();
    });

    it('shows paused message instead of sync message when no subscription', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSubscriptionContext.useSubscriptionOptional.mockReturnValue({
        isActive: false,
        isLoading: false,
      });

      renderWithQueryClient(<CloudSyncSection />);

      // Should show "paused" messages (appears in description and warning banner)
      // Verify warning banner with its specific text
      expect(screen.getByText('Subscription Required')).toBeInTheDocument();
      // Verify syncs to cloud message is NOT shown
      expect(screen.queryByText(/syncs to the cloud.*access from any device/i)).not.toBeInTheDocument();
    });
  });

  describe('pending sync warning modal', () => {
    it('shows warning modal when switching to local with pending syncs', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.pendingCount = 3;

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('pending-sync-warning-modal')).toBeInTheDocument();
      });

      // Verify correct counts are passed
      expect(screen.getByTestId('pending-count').textContent).toBe('3');
    });

    it('shows warning modal when switching to local with failed syncs', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.failedCount = 2;

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('pending-sync-warning-modal')).toBeInTheDocument();
      });

      expect(screen.getByTestId('failed-count').textContent).toBe('2');
    });

    it('shows wizard directly when no pending or failed syncs', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.pendingCount = 0;
      mockSyncStatus.failedCount = 0;

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      // Should show wizard directly, not warning modal
      await waitFor(() => {
        expect(screen.getByTestId('reverse-migration-wizard')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('pending-sync-warning-modal')).not.toBeInTheDocument();
    });

    it('triggers sync when Sync First is clicked', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.pendingCount = 3;

      renderWithQueryClient(<CloudSyncSection />);

      // Click switch to local to show warning modal
      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('pending-sync-warning-modal')).toBeInTheDocument();
      });

      // Click Sync First
      fireEvent.click(screen.getByRole('button', { name: 'Sync First' }));

      await waitFor(() => {
        expect(mockSyncStatus.syncNow).toHaveBeenCalled();
      });
    });

    it('shows wizard after successful sync', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.pendingCount = 3;

      renderWithQueryClient(<CloudSyncSection />);

      // Click switch to local to show warning modal
      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('pending-sync-warning-modal')).toBeInTheDocument();
      });

      // Click Sync First
      fireEvent.click(screen.getByRole('button', { name: 'Sync First' }));

      // After sync completes, wizard should appear
      await waitFor(() => {
        expect(screen.getByTestId('reverse-migration-wizard')).toBeInTheDocument();
      });
    });

    it('clears failed items when Discard & Continue is clicked', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.failedCount = 2;

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('pending-sync-warning-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Discard & Continue' }));

      await waitFor(() => {
        expect(mockSyncStatus.clearFailed).toHaveBeenCalled();
      });
    });

    it('shows wizard after discard', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.pendingCount = 3;
      mockSyncStatus.failedCount = 0;

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('pending-sync-warning-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Discard & Continue' }));

      await waitFor(() => {
        expect(screen.getByTestId('reverse-migration-wizard')).toBeInTheDocument();
      });
    });

    it('closes modal without action when Cancel is clicked', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.pendingCount = 3;

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('pending-sync-warning-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByTestId('pending-sync-warning-modal')).not.toBeInTheDocument();
      });

      // Should not show wizard or trigger any sync actions
      expect(screen.queryByTestId('reverse-migration-wizard')).not.toBeInTheDocument();
      expect(mockSyncStatus.syncNow).not.toHaveBeenCalled();
      expect(mockSyncStatus.clearFailed).not.toHaveBeenCalled();
    });

    it('passes isOnline and isSyncing props to modal', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.pendingCount = 3;
      mockSyncStatus.isOnline = false;
      mockSyncStatus.isSyncing = true;

      renderWithQueryClient(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(screen.getByTestId('pending-sync-warning-modal')).toBeInTheDocument();
      });

      expect(screen.getByTestId('is-online').textContent).toBe('false');
      expect(screen.getByTestId('is-syncing').textContent).toBe('true');
    });

    it('calls onShowReverseMigration callback if provided', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);
      mockSyncStatus.pendingCount = 3;

      const onShowReverseMigration = jest.fn();
      renderWithQueryClient(<CloudSyncSection onShowReverseMigration={onShowReverseMigration} />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      // Should call callback directly, not show pending sync modal
      expect(onShowReverseMigration).toHaveBeenCalled();
      expect(screen.queryByTestId('pending-sync-warning-modal')).not.toBeInTheDocument();
    });
  });
});
