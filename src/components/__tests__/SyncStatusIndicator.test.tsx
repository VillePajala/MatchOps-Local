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

describe('SyncStatusIndicator', () => {
  const defaultSyncStatus = {
    mode: 'local' as const,
    state: 'local' as const,
    pendingCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
    isOnline: true,
    isSyncing: false,
    isPaused: false,
    isLoading: false,
    cloudConnected: true,
    syncNow: jest.fn(),
    retryFailed: jest.fn(),
    clearFailed: jest.fn(),
    forceRetryAll: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
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
    mockUseSyncStatus.mockReturnValue(defaultSyncStatus);
    // Default to having active subscription (cloud sync enabled)
    mockUseSubscriptionOptional.mockReturnValue(defaultSubscription);
  });

  describe('local mode', () => {
    it('should render local mode indicator with phone icon', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'local',
        state: 'local',
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      // Local mode shows phone icon with correct title
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
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-slate-600/30');
      expect(button).toHaveClass('border-slate-500/40');
    });
  });

  describe('cloud mode - paused (no subscription)', () => {
    it('should render paused indicator when no subscription', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'synced',
        isLoading: false,
      });
      mockUseSubscriptionOptional.mockReturnValue({
        ...defaultSubscription,
        isActive: false,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'Sync paused - subscription required'
      );
    });

    it('should have amber styling for paused state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'pending',
        isLoading: false,
      });
      mockUseSubscriptionOptional.mockReturnValue({
        ...defaultSubscription,
        isActive: false,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-amber-500/20');
      expect(button).toHaveClass('border-amber-500/40');
    });
  });

  describe('cloud mode - synced state', () => {
    it('should render synced indicator with checkmark', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'synced',
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

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
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-green-500/20');
      expect(button).toHaveClass('border-green-500/40');
    });
  });

  describe('cloud mode - syncing state', () => {
    it('should render syncing indicator with correct title', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'syncing',
        isSyncing: true,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

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
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-sky-500/20');
      expect(button).toHaveClass('border-sky-500/40');
    });
  });

  describe('cloud mode - pending state', () => {
    it('should render pending indicator with count badge', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'pending',
        pendingCount: 5,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      // Count badge shows the pending count
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should have amber styling for pending state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'pending',
        pendingCount: 3,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-amber-500/20');
      expect(button).toHaveClass('border-amber-500/40');
    });

    it('should have correct title for pending state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'pending',
        pendingCount: 3,
        isOnline: true,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        '3 changes waiting to sync'
      );
    });
  });

  describe('cloud mode - error state', () => {
    it('should render error indicator with count badge', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'error',
        failedCount: 2,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      // Count badge shows the failed count
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should render error with ! badge when zero count', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'error',
        failedCount: 0,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      // Shows ! badge when no count
      expect(screen.getByText('!')).toBeInTheDocument();
    });

    it('should have red styling for error state', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'error',
        failedCount: 2,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-red-500/20');
      expect(button).toHaveClass('border-red-500/40');
    });
  });

  describe('cloud mode - offline state', () => {
    it('should render offline indicator with correct title', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'offline',
        isOnline: false,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

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
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-slate-600/30');
      expect(button).toHaveClass('border-slate-500/40');
    });
  });

  describe('default cloud state', () => {
    it('should render cloud indicator for unknown state with correct title', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'unknown' as never, // Force unknown state
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'Data syncs to cloud'
      );
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

    it('should have pointer cursor when no onClick (defaults to opening settings)', () => {
      // Even without onClick prop, component opens Settings modal on click
      mockUseSyncStatus.mockReturnValue(defaultSyncStatus);

      render(<SyncStatusIndicator />);

      expect(screen.getByRole('button')).toHaveClass('cursor-pointer');
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

  describe('subscription loading state', () => {
    it('should show normal sync state while subscription is loading', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'synced',
        isLoading: false,
      });
      // Subscription still loading
      mockUseSubscriptionOptional.mockReturnValue({
        ...defaultSubscription,
        isLoading: true,
      });

      render(<SyncStatusIndicator />);

      // Should show synced state (not paused) while loading
      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'All data synced to cloud'
      );
    });

    it('should show paused state when subscription is not loading and inactive', () => {
      mockUseSyncStatus.mockReturnValue({
        ...defaultSyncStatus,
        mode: 'cloud',
        state: 'synced',
        isLoading: false,
      });
      mockUseSubscriptionOptional.mockReturnValue({
        ...defaultSubscription,
        isActive: false,
        isLoading: false,
      });

      render(<SyncStatusIndicator />);

      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'Sync paused - subscription required'
      );
    });
  });
});
