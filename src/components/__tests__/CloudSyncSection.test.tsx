/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CloudSyncSection from '../CloudSyncSection';

// Mock dependencies
jest.mock('@/config/backendConfig', () => ({
  getBackendMode: jest.fn(),
  isCloudAvailable: jest.fn(),
  enableCloudMode: jest.fn(),
  disableCloudMode: jest.fn(),
  hasModeOverride: jest.fn(),
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

import {
  getBackendMode,
  isCloudAvailable,
  enableCloudMode,
  disableCloudMode,
  hasModeOverride,
} from '@/config/backendConfig';

const mockGetBackendMode = getBackendMode as jest.MockedFunction<typeof getBackendMode>;
const mockIsCloudAvailable = isCloudAvailable as jest.MockedFunction<typeof isCloudAvailable>;
const mockEnableCloudMode = enableCloudMode as jest.MockedFunction<typeof enableCloudMode>;
const mockDisableCloudMode = disableCloudMode as jest.MockedFunction<typeof disableCloudMode>;
const mockHasModeOverride = hasModeOverride as jest.MockedFunction<typeof hasModeOverride>;

describe('CloudSyncSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBackendMode.mockReturnValue('local');
    mockIsCloudAvailable.mockReturnValue(false);
    mockHasModeOverride.mockReturnValue(false);
  });

  describe('local mode display', () => {
    it('shows local mode status when in local mode', () => {
      mockGetBackendMode.mockReturnValue('local');

      render(<CloudSyncSection />);

      expect(screen.getByText('Local Storage')).toBeInTheDocument();
      expect(screen.getByText('Enable Cloud Sync')).toBeInTheDocument();
    });

    it('shows local mode description', () => {
      mockGetBackendMode.mockReturnValue('local');

      render(<CloudSyncSection />);

      expect(screen.getByText(/stored locally on this device/i)).toBeInTheDocument();
    });

    it('shows cloud not available warning when cloud is not configured', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(false);

      render(<CloudSyncSection />);

      expect(screen.getByText(/Cloud sync is not available/i)).toBeInTheDocument();
    });

    it('disables enable button when cloud is not available', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(false);

      render(<CloudSyncSection />);

      const enableButton = screen.getByRole('button', { name: /enable cloud sync/i });
      expect(enableButton).toBeDisabled();
    });
  });

  describe('cloud mode display', () => {
    it('shows cloud mode status when in cloud mode', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      render(<CloudSyncSection />);

      expect(screen.getByText('Cloud Sync Enabled')).toBeInTheDocument();
      expect(screen.getByText('Switch to Local Mode')).toBeInTheDocument();
    });

    it('shows cloud mode description', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      render(<CloudSyncSection />);

      expect(screen.getByText(/syncs to the cloud/i)).toBeInTheDocument();
    });
  });

  describe('enabling cloud mode', () => {
    it('calls enableCloudMode when button is clicked', async () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(true);
      mockEnableCloudMode.mockReturnValue(true);

      render(<CloudSyncSection />);

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
      render(<CloudSyncSection onModeChange={onModeChange} />);

      const enableButton = screen.getByRole('button', { name: /enable cloud sync/i });
      fireEvent.click(enableButton);

      await waitFor(() => {
        expect(onModeChange).toHaveBeenCalled();
      });
    });
  });

  describe('disabling cloud mode', () => {
    it('calls disableCloudMode when button is clicked', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      render(<CloudSyncSection />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(mockDisableCloudMode).toHaveBeenCalled();
      });
    });

    it('calls onModeChange callback when mode is disabled', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      const onModeChange = jest.fn();
      render(<CloudSyncSection onModeChange={onModeChange} />);

      const disableButton = screen.getByRole('button', { name: /switch to local mode/i });
      fireEvent.click(disableButton);

      await waitFor(() => {
        expect(onModeChange).toHaveBeenCalled();
      });
    });
  });

  describe('restart required notice', () => {
    it('shows restart notice when mode override exists', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockHasModeOverride.mockReturnValue(true);

      render(<CloudSyncSection />);

      expect(screen.getByText(/restart the app to apply/i)).toBeInTheDocument();
    });

    it('does not show restart notice when no mode override', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockHasModeOverride.mockReturnValue(false);

      render(<CloudSyncSection />);

      expect(screen.queryByText(/restart the app to apply/i)).not.toBeInTheDocument();
    });
  });

  describe('migration note', () => {
    it('shows migration note when cloud is available in local mode', () => {
      mockGetBackendMode.mockReturnValue('local');
      mockIsCloudAvailable.mockReturnValue(true);

      render(<CloudSyncSection />);

      expect(screen.getByText(/migrate your existing local data/i)).toBeInTheDocument();
    });

    it('does not show migration note in cloud mode', () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockIsCloudAvailable.mockReturnValue(true);

      render(<CloudSyncSection />);

      expect(screen.queryByText(/migrate your existing local data/i)).not.toBeInTheDocument();
    });
  });
});
