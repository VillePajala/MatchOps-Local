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
}));

jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}));

jest.mock('@/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
}));

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

import {
  getBackendMode,
  isCloudAvailable,
  enableCloudMode,
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
});
