/**
 * UpgradePromptModal Tests
 *
 * Tests for the premium upgrade prompt modal:
 * - Rendering (open/closed states)
 * - Focus management (initial focus, focus trap)
 * - Keyboard interactions (Escape to close)
 * - Dev vs prod mode behavior
 * - Resource-specific limit display
 *
 * @critical - Core monetization UI
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import UpgradePromptModal from '../UpgradePromptModal';
import type { UpgradePromptModalProps } from '../UpgradePromptModal';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOptions?: string | { defaultValue?: string; limit?: number; resource?: string; count?: number }) => {
      // Handle t(key, defaultValue) pattern
      if (typeof defaultValueOrOptions === 'string') {
        return defaultValueOrOptions;
      }
      // Handle t(key, { defaultValue }) pattern
      if (defaultValueOrOptions?.defaultValue) {
        return defaultValueOrOptions.defaultValue;
      }
      return key;
    },
  }),
}));

// Mock usePremium hook
const mockGrantPremiumAccess = jest.fn();
jest.mock('@/hooks/usePremium', () => ({
  usePremium: () => ({
    grantPremiumAccess: mockGrantPremiumAccess,
  }),
}));

// Store original NODE_ENV
const originalNodeEnv = process.env.NODE_ENV;

describe('UpgradePromptModal', () => {
  const defaultProps: UpgradePromptModalProps = {
    isOpen: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
    });
  });

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(<UpgradePromptModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders dialog when isOpen is true', () => {
      render(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays premium benefits list', () => {
      render(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByText('Unlimited teams')).toBeInTheDocument();
      expect(screen.getByText('Unlimited players')).toBeInTheDocument();
      expect(screen.getByText('Unlimited seasons & tournaments')).toBeInTheDocument();
      expect(screen.getByText('Unlimited games per competition')).toBeInTheDocument();
    });

    it('displays price', () => {
      render(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByText('9,99 €')).toBeInTheDocument();
      expect(screen.getByText('one-time payment')).toBeInTheDocument();
    });

    it('displays upgrade and dismiss buttons', () => {
      render(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: /upgrade to premium/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /maybe later/i })).toBeInTheDocument();
    });
  });

  describe('resource-specific display', () => {
    it('displays resource limit info when resource prop is provided', () => {
      render(
        <UpgradePromptModal
          {...defaultProps}
          resource="team"
          currentCount={1}
        />
      );

      // Check that limit explanation is shown
      expect(screen.getByText(/free tier limit/i)).toBeInTheDocument();
    });

    it('displays current usage when currentCount is provided', () => {
      render(
        <UpgradePromptModal
          {...defaultProps}
          resource="player"
          currentCount={18}
        />
      );

      // The translation returns the default template with interpolation markers
      // since the mock doesn't process {{count}} and {{limit}}
      expect(screen.getByText(/Current:/)).toBeInTheDocument();
    });

    it('does not display resource info when resource prop is not provided', () => {
      render(<UpgradePromptModal {...defaultProps} />);

      expect(screen.queryByText(/free tier limit/i)).not.toBeInTheDocument();
    });
  });

  describe('focus management', () => {
    it('focuses the Maybe Later button on open', async () => {
      render(<UpgradePromptModal {...defaultProps} />);

      await waitFor(() => {
        const maybeLaterButton = screen.getByRole('button', { name: /maybe later/i });
        expect(document.activeElement).toBe(maybeLaterButton);
      });
    });

    it('restores focus to previously focused element on close', async () => {
      const TestComponent = () => {
        const [isOpen, setIsOpen] = React.useState(false);
        return (
          <>
            <button data-testid="trigger" onClick={() => setIsOpen(true)}>
              Open
            </button>
            <UpgradePromptModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
          </>
        );
      };

      render(<TestComponent />);

      const triggerButton = screen.getByTestId('trigger');
      triggerButton.focus();
      expect(document.activeElement).toBe(triggerButton);

      // Open modal
      await act(async () => {
        fireEvent.click(triggerButton);
      });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Close modal
      const maybeLaterButton = screen.getByRole('button', { name: /maybe later/i });
      await act(async () => {
        fireEvent.click(maybeLaterButton);
      });

      await waitFor(() => {
        expect(document.activeElement).toBe(triggerButton);
      });
    });
  });

  describe('keyboard interactions', () => {
    it('closes modal when Escape key is pressed', async () => {
      const onClose = jest.fn();
      render(<UpgradePromptModal {...defaultProps} onClose={onClose} />);

      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('button interactions', () => {
    it('calls onClose when Maybe Later is clicked', async () => {
      const onClose = jest.fn();
      render(<UpgradePromptModal {...defaultProps} onClose={onClose} />);

      const maybeLaterButton = screen.getByRole('button', { name: /maybe later/i });
      await act(async () => {
        fireEvent.click(maybeLaterButton);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('dev mode behavior', () => {
    beforeEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
      });
    });

    it('shows dev mode confirmation when upgrade is clicked in dev', async () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
      render(<UpgradePromptModal {...defaultProps} />);

      const upgradeButton = screen.getByRole('button', { name: /upgrade to premium/i });
      await act(async () => {
        fireEvent.click(upgradeButton);
      });

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEV MODE')
      );

      confirmSpy.mockRestore();
    });

    it('grants premium access when confirmed in dev mode', async () => {
      const onClose = jest.fn();
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      mockGrantPremiumAccess.mockResolvedValue(undefined);

      render(<UpgradePromptModal {...defaultProps} onClose={onClose} />);

      const upgradeButton = screen.getByRole('button', { name: /upgrade to premium/i });
      await act(async () => {
        fireEvent.click(upgradeButton);
      });

      expect(mockGrantPremiumAccess).toHaveBeenCalledWith('dev-test-token');
      expect(onClose).toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('does not grant premium when cancelled in dev mode', async () => {
      const onClose = jest.fn();
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

      render(<UpgradePromptModal {...defaultProps} onClose={onClose} />);

      const upgradeButton = screen.getByRole('button', { name: /upgrade to premium/i });
      await act(async () => {
        fireEvent.click(upgradeButton);
      });

      expect(mockGrantPremiumAccess).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });

  describe('production mode behavior', () => {
    beforeEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
      });
    });

    it('shows coming soon alert in production', async () => {
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
      render(<UpgradePromptModal {...defaultProps} />);

      const upgradeButton = screen.getByRole('button', { name: /upgrade to premium/i });
      await act(async () => {
        fireEvent.click(upgradeButton);
      });

      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('coming soon')
      );

      alertSpy.mockRestore();
    });
  });

  describe('accessibility', () => {
    it('has proper aria attributes', () => {
      render(<UpgradePromptModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('title is associated with dialog via aria-labelledby', () => {
      render(<UpgradePromptModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      const labelledById = dialog.getAttribute('aria-labelledby');
      const title = document.getElementById(labelledById!);

      expect(title).toBeInTheDocument();
      expect(title).toHaveTextContent(/free version limit reached/i);
    });
  });
});
