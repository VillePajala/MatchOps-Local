/**
 * Tests for SyncStatusIndicator component
 *
 * @see src/components/SyncStatusIndicator.tsx
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SyncStatusIndicator from '../SyncStatusIndicator';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useSubscriptionOptional } from '@/contexts/SubscriptionContext';

// Mock useSyncStatus hook
jest.mock('@/hooks/useSyncStatus');
const mockUseSyncStatus = useSyncStatus as jest.MockedFunction<typeof useSyncStatus>;

// Mock useSubscriptionOptional hook
jest.mock('@/contexts/SubscriptionContext', () => ({
  useSubscriptionOptional: jest.fn(),
}));
const mockUseSubscriptionOptional = useSubscriptionOptional as jest.MockedFunction<typeof useSubscriptionOptional>;

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string, options?: Record<string, unknown>) => {
      if (options?.count !== undefined) {
        return defaultValue.replace('{{count}}', String(options.count));
      }
      return defaultValue;
    },
  }),
}));

describe('SyncStatusIndicator', () => {
  const defaultSyncStatus = {
    mode: 'local' as const,
    state: 'local' as const,
    pendingCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
    isOnline: true,
    isSyncing: false,
    syncNow: jest.fn(),
    retryFailed: jest.fn(),
    clearFailed: jest.fn(),
  };

  // Default subscription state (active subscription)
  const defaultSubscription = {
    status: 'active' as const,
    periodEnd: null,
    graceEnd: null,
    isActive: true,
    isLoading: false,
    fetchFailed: false,
    refresh: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSyncStatus.mockReturnValue({ ...defaultSyncStatus, isLoading: false });
    // Default to having active subscription (cloud sync enabled)
    mockUseSubscriptionOptional.mockReturnValue(defaultSubscription);
  });

  describe('local mode', () => {
    it('should render local mode indicator', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'local',
        state: 'local',
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByText('Local')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'Data stored locally on device'
      );
    });

    it('should have correct styling for local mode', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'local',
        state: 'local',
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-slate-600/30');
      expect(button).toHaveClass('border-slate-500/40');
    });
  });

  describe('cloud mode - synced state', () => {
    it('should render synced indicator', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'synced',
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'All data synced to cloud'
      );
    });

    it('should have green styling for synced state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'synced',
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-green-500/20');
      expect(button).toHaveClass('border-green-500/40');
    });
  });

  describe('cloud mode - syncing state', () => {
    it('should render syncing indicator with spinning icon', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'syncing',
        isSyncing: true,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByText('Syncing')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'Syncing data to cloud...'
      );
    });

    it('should have sky styling for syncing state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'syncing',
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-sky-500/20');
      expect(button).toHaveClass('border-sky-500/40');
    });
  });

  describe('cloud mode - pending state', () => {
    it('should render pending indicator with count', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'pending',
        pendingCount: 5,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByText('5 pending')).toBeInTheDocument();
    });

    it('should render pending without count when zero', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'pending',
        pendingCount: 0,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should have amber styling for pending state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'pending',
        pendingCount: 3,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-amber-500/20');
      expect(button).toHaveClass('border-amber-500/40');
    });

    it('should show online indicator when pending and online', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'pending',
        pendingCount: 3,
        isOnline: true,
      });

      render(<SyncStatusIndicator />);

      // Should have the small signal icon
      expect(screen.getByTitle('Online')).toBeInTheDocument();
    });
  });

  describe('cloud mode - error state', () => {
    it('should render error indicator with count', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'error',
        failedCount: 2,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByText('2 failed')).toBeInTheDocument();
    });

    it('should render error without count when zero', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'error',
        failedCount: 0,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('should have red styling for error state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'error',
        failedCount: 2,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-red-500/20');
      expect(button).toHaveClass('border-red-500/40');
    });
  });

  describe('cloud mode - offline state', () => {
    it('should render offline indicator', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'offline',
        isOnline: false,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByText('Offline')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'No internet connection - changes will sync when online'
      );
    });

    it('should have slate styling for offline state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'offline',
        isOnline: false,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-slate-600/30');
      expect(button).toHaveClass('border-slate-500/40');
    });

    it('should not show online indicator when offline', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'offline',
        isOnline: false,
      });

      render(<SyncStatusIndicator />);

      expect(screen.queryByTitle('Online')).not.toBeInTheDocument();
    });
  });

  describe('default cloud state', () => {
    it('should render cloud indicator for unknown state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'unknown' as never, // Force unknown state
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByText('Cloud')).toBeInTheDocument();
    });
  });

  describe('click handler', () => {
    it('should call onClick when provided', () => {
      const onClick = jest.fn();
      mockUseSyncStatus.mockReturnValue(defaultSyncStatus);

      render(<SyncStatusIndicator onClick={onClick} />);

      fireEvent.click(screen.getByRole('button'));

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should have pointer cursor when onClick provided', () => {
      const onClick = jest.fn();
      mockUseSyncStatus.mockReturnValue(defaultSyncStatus);

      render(<SyncStatusIndicator onClick={onClick} />);

      expect(screen.getByRole('button')).toHaveClass('cursor-pointer');
    });

    it('should have default cursor when no onClick', () => {
      mockUseSyncStatus.mockReturnValue(defaultSyncStatus);

      render(<SyncStatusIndicator />);

      expect(screen.getByRole('button')).toHaveClass('cursor-default');
    });
  });

  describe('accessibility', () => {
    it('should have aria-label matching title', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'synced',
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'All data synced to cloud');
      expect(button).toHaveAttribute('title', 'All data synced to cloud');
    });

    it('should be a button element', () => {
      mockUseSyncStatus.mockReturnValue(defaultSyncStatus);

      render(<SyncStatusIndicator />);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });
  });

  describe('online indicator', () => {
    it('should show online indicator for pending state when online', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'pending',
        isOnline: true,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByTitle('Online')).toBeInTheDocument();
    });

    it('should show online indicator for error state when online', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'error',
        isOnline: true,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByTitle('Online')).toBeInTheDocument();
    });

    it('should show online indicator for syncing state when online', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'syncing',
        isOnline: true,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByTitle('Online')).toBeInTheDocument();
    });

    it('should NOT show online indicator for synced state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'synced',
        isOnline: true,
      });

      render(<SyncStatusIndicator />);

      expect(screen.queryByTitle('Online')).not.toBeInTheDocument();
    });

    it('should NOT show online indicator in local mode', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'local',
        state: 'local',
        isOnline: true,
      });

      render(<SyncStatusIndicator />);

      expect(screen.queryByTitle('Online')).not.toBeInTheDocument();
    });
  });
});
