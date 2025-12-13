/**
 * UpgradePromptManager Tests
 *
 * Tests for the upgrade prompt manager component:
 * - Handler registration with PremiumContext
 * - Modal state management (open/close)
 * - Resource tracking for triggered limits
 * - Integration with UpgradePromptModal
 *
 * @integration - PremiumContext integration
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import UpgradePromptManager from '../UpgradePromptManager';
import { ResourceType } from '@/config/premiumLimits';

// Track the registered handler
let registeredHandler: ((resource?: ResourceType) => void) | null = null;

// Mock PremiumContext
jest.mock('@/contexts/PremiumContext', () => ({
  usePremiumContext: () => ({
    setUpgradePromptHandler: jest.fn((handler) => {
      registeredHandler = handler;
    }),
  }),
}));

// Mock UpgradePromptModal to verify props
jest.mock('../UpgradePromptModal', () => {
  return function MockUpgradePromptModal({
    isOpen,
    onClose,
    resource,
  }: {
    isOpen: boolean;
    onClose: () => void;
    resource?: ResourceType;
  }) {
    if (!isOpen) return null;
    return (
      <div data-testid="upgrade-modal">
        <span data-testid="modal-resource">{resource || 'none'}</span>
        <button data-testid="close-modal" onClick={onClose}>
          Close
        </button>
      </div>
    );
  };
});

describe('UpgradePromptManager', () => {
  beforeEach(() => {
    registeredHandler = null;
  });

  describe('handler registration', () => {
    it('registers handler with PremiumContext on mount', () => {
      render(
        <UpgradePromptManager>
          <div>Child content</div>
        </UpgradePromptManager>
      );

      expect(registeredHandler).not.toBeNull();
      expect(typeof registeredHandler).toBe('function');
    });

    it('renders children', () => {
      render(
        <UpgradePromptManager>
          <div data-testid="child">Child content</div>
        </UpgradePromptManager>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child content')).toBeInTheDocument();
    });
  });

  describe('modal state management', () => {
    it('opens modal when handler is called', async () => {
      render(
        <UpgradePromptManager>
          <div>Content</div>
        </UpgradePromptManager>
      );

      expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();

      await act(async () => {
        registeredHandler?.();
      });

      expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
    });

    it('closes modal when onClose is called', async () => {
      render(
        <UpgradePromptManager>
          <div>Content</div>
        </UpgradePromptManager>
      );

      // Open modal
      await act(async () => {
        registeredHandler?.();
      });

      expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();

      // Close modal
      await act(async () => {
        fireEvent.click(screen.getByTestId('close-modal'));
      });

      expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
    });
  });

  describe('resource tracking', () => {
    it('passes resource to modal when provided', async () => {
      render(
        <UpgradePromptManager>
          <div>Content</div>
        </UpgradePromptManager>
      );

      await act(async () => {
        registeredHandler?.('team');
      });

      expect(screen.getByTestId('modal-resource')).toHaveTextContent('team');
    });

    it('passes different resource types correctly', async () => {
      render(
        <UpgradePromptManager>
          <div>Content</div>
        </UpgradePromptManager>
      );

      // Test with 'player'
      await act(async () => {
        registeredHandler?.('player');
      });
      expect(screen.getByTestId('modal-resource')).toHaveTextContent('player');

      // Close and reopen with different resource
      await act(async () => {
        fireEvent.click(screen.getByTestId('close-modal'));
      });

      await act(async () => {
        registeredHandler?.('game');
      });
      expect(screen.getByTestId('modal-resource')).toHaveTextContent('game');
    });

    it('handles no resource (undefined) correctly', async () => {
      render(
        <UpgradePromptManager>
          <div>Content</div>
        </UpgradePromptManager>
      );

      await act(async () => {
        registeredHandler?.();
      });

      expect(screen.getByTestId('modal-resource')).toHaveTextContent('none');
    });

    it('clears resource when modal is closed', async () => {
      render(
        <UpgradePromptManager>
          <div>Content</div>
        </UpgradePromptManager>
      );

      // Open with resource
      await act(async () => {
        registeredHandler?.('season');
      });
      expect(screen.getByTestId('modal-resource')).toHaveTextContent('season');

      // Close
      await act(async () => {
        fireEvent.click(screen.getByTestId('close-modal'));
      });

      // Reopen without resource
      await act(async () => {
        registeredHandler?.();
      });
      expect(screen.getByTestId('modal-resource')).toHaveTextContent('none');
    });
  });

  describe('multiple children', () => {
    it('renders multiple children correctly', () => {
      render(
        <UpgradePromptManager>
          <div data-testid="child1">Child 1</div>
          <div data-testid="child2">Child 2</div>
          <span data-testid="child3">Child 3</span>
        </UpgradePromptManager>
      );

      expect(screen.getByTestId('child1')).toBeInTheDocument();
      expect(screen.getByTestId('child2')).toBeInTheDocument();
      expect(screen.getByTestId('child3')).toBeInTheDocument();
    });
  });
});
