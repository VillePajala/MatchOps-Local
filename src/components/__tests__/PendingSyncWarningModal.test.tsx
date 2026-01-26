/**
 * Tests for PendingSyncWarningModal component
 *
 * @see src/components/PendingSyncWarningModal.tsx
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PendingSyncWarningModal from '../PendingSyncWarningModal';

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

// Mock useFocusTrap
const mockUseFocusTrap = jest.fn();
jest.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: (...args: unknown[]) => mockUseFocusTrap(...args),
}));

describe('PendingSyncWarningModal', () => {
  const defaultProps = {
    pendingCount: 3,
    failedCount: 0,
    isSyncing: false,
    isOnline: true,
    onAction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFocusTrap.mockClear();
  });

  describe('rendering', () => {
    it('should render the modal with title', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText('Unsynced Changes')).toBeInTheDocument();
    });

    it('should show total unsynced count in warning message', () => {
      render(<PendingSyncWarningModal {...defaultProps} pendingCount={5} failedCount={2} />);

      expect(screen.getByText(/You have 7 changes/)).toBeInTheDocument();
    });

    it('should show pending count breakdown', () => {
      render(<PendingSyncWarningModal {...defaultProps} pendingCount={3} />);

      expect(screen.getByText('3 pending changes')).toBeInTheDocument();
    });

    it('should show failed count breakdown', () => {
      render(<PendingSyncWarningModal {...defaultProps} failedCount={2} />);

      expect(screen.getByText('2 failed to sync')).toBeInTheDocument();
    });

    it('should show both pending and failed counts', () => {
      render(<PendingSyncWarningModal {...defaultProps} pendingCount={3} failedCount={2} />);

      expect(screen.getByText('3 pending changes')).toBeInTheDocument();
      expect(screen.getByText('2 failed to sync')).toBeInTheDocument();
    });

    it('should show consequence message', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      expect(screen.getByText('Switching to local mode now will abandon these changes.')).toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('should render Sync First button', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Sync First' })).toBeInTheDocument();
    });

    it('should render Discard & Continue button', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Discard & Continue' })).toBeInTheDocument();
    });

    it('should render Cancel button', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should call onAction with sync when Sync First is clicked', () => {
      const onAction = jest.fn();
      render(<PendingSyncWarningModal {...defaultProps} onAction={onAction} />);

      fireEvent.click(screen.getByRole('button', { name: 'Sync First' }));

      expect(onAction).toHaveBeenCalledWith('sync');
    });

    it('should call onAction with discard when Discard & Continue is clicked', () => {
      const onAction = jest.fn();
      render(<PendingSyncWarningModal {...defaultProps} onAction={onAction} />);

      fireEvent.click(screen.getByRole('button', { name: 'Discard & Continue' }));

      expect(onAction).toHaveBeenCalledWith('discard');
    });

    it('should call onAction with cancel when Cancel is clicked', () => {
      const onAction = jest.fn();
      render(<PendingSyncWarningModal {...defaultProps} onAction={onAction} />);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onAction).toHaveBeenCalledWith('cancel');
    });

    it('should call onAction with cancel when close button is clicked', () => {
      const onAction = jest.fn();
      render(<PendingSyncWarningModal {...defaultProps} onAction={onAction} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeButton);

      expect(onAction).toHaveBeenCalledWith('cancel');
    });
  });

  describe('syncing state', () => {
    it('should show syncing text when isSyncing is true', () => {
      render(<PendingSyncWarningModal {...defaultProps} isSyncing={true} />);

      expect(screen.getByRole('button', { name: 'Syncing...' })).toBeInTheDocument();
    });

    it('should disable Sync First button when syncing', () => {
      render(<PendingSyncWarningModal {...defaultProps} isSyncing={true} />);

      expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled();
    });

    it('should disable Discard button when syncing', () => {
      render(<PendingSyncWarningModal {...defaultProps} isSyncing={true} />);

      expect(screen.getByRole('button', { name: 'Discard & Continue' })).toBeDisabled();
    });

    it('should disable Cancel button when syncing', () => {
      render(<PendingSyncWarningModal {...defaultProps} isSyncing={true} />);

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    it('should not show close button when syncing', () => {
      render(<PendingSyncWarningModal {...defaultProps} isSyncing={true} />);

      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });
  });

  describe('offline state', () => {
    it('should disable Sync First button when offline', () => {
      render(<PendingSyncWarningModal {...defaultProps} isOnline={false} />);

      expect(screen.getByRole('button', { name: 'Sync First' })).toBeDisabled();
    });

    it('should show offline notice when offline', () => {
      render(<PendingSyncWarningModal {...defaultProps} isOnline={false} />);

      expect(screen.getByText('Cannot sync while offline')).toBeInTheDocument();
    });

    it('should not show offline notice when online', () => {
      render(<PendingSyncWarningModal {...defaultProps} isOnline={true} />);

      expect(screen.queryByText('Cannot sync while offline')).not.toBeInTheDocument();
    });

    it('should allow discard when offline', () => {
      render(<PendingSyncWarningModal {...defaultProps} isOnline={false} />);

      expect(screen.getByRole('button', { name: 'Discard & Continue' })).not.toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('should initialize focus trap', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      expect(mockUseFocusTrap).toHaveBeenCalledWith(
        expect.any(Object), // ref
        true // isOpen
      );
    });

    it('should have role alertdialog', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('should have aria-modal true', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('should have aria-labelledby pointing to title', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'pending-sync-warning-title');
      expect(screen.getByText('Unsynced Changes')).toHaveAttribute('id', 'pending-sync-warning-title');
    });

    it('should have aria-describedby pointing to description', () => {
      render(<PendingSyncWarningModal {...defaultProps} />);

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveAttribute('aria-describedby', 'pending-sync-warning-description');
    });
  });

  describe('keyboard interaction', () => {
    it('should call onAction with cancel when Escape is pressed', () => {
      const onAction = jest.fn();
      render(<PendingSyncWarningModal {...defaultProps} onAction={onAction} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onAction).toHaveBeenCalledWith('cancel');
    });

    it('should not call onAction when Escape is pressed while syncing', () => {
      const onAction = jest.fn();
      render(<PendingSyncWarningModal {...defaultProps} onAction={onAction} isSyncing={true} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onAction).not.toHaveBeenCalled();
    });
  });
});
