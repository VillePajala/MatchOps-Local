/**
 * UpgradePromptModal Tests
 *
 * Tests for the premium upgrade prompt modal:
 * - Rendering (open/closed states)
 * - Focus management (initial focus, focus trap)
 * - Keyboard interactions (Escape to close)
 * - Dev vs prod mode behavior
 * - Resource-specific limit display
 * - Platform-specific behavior (Android vs Desktop)
 *
 * @critical - Core monetization UI
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import UpgradePromptModal from '../UpgradePromptModal';
import type { UpgradePromptModalProps } from '../UpgradePromptModal';
import { ToastProvider } from '@/contexts/ToastProvider';
import * as platformModule from '@/utils/platform';

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

// Mock usePlayBilling hook
jest.mock('@/hooks/usePlayBilling', () => ({
  usePlayBilling: () => ({
    isAvailable: false,
    isPurchasing: false,
    details: null,
    purchase: jest.fn(),
    restore: jest.fn(),
    refreshDetails: jest.fn(),
  }),
}));

// Mock SubscriptionContext
jest.mock('@/contexts/SubscriptionContext', () => ({
  clearSubscriptionCache: jest.fn().mockResolvedValue(undefined),
}));

// Mock AuthProvider
jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    mode: 'cloud',
  }),
}));

// Mock platform detection
jest.mock('@/utils/platform', () => ({
  isAndroid: jest.fn().mockReturnValue(false),
  isTWA: jest.fn().mockReturnValue(false),
}));

const mockIsAndroid = platformModule.isAndroid as jest.MockedFunction<typeof platformModule.isAndroid>;

// Wrapper component with ToastProvider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

// Custom render with providers
const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: TestWrapper });
};

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
    // Default to Android to test upgrade button (most tests expect it)
    mockIsAndroid.mockReturnValue(true);
  });

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
    });
  });

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      renderWithProviders(<UpgradePromptModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders dialog when isOpen is true', () => {
      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays cloud sync benefits list', () => {
      // Note: No resource limits in the app (local is free unlimited)
      // Modal shows cloud-specific benefits only
      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByText('Sync across all your devices')).toBeInTheDocument();
      expect(screen.getByText('Automatic cloud backup')).toBeInTheDocument();
      expect(screen.getByText('Secure cloud storage')).toBeInTheDocument();
    });

    it('displays price', () => {
      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByText('€4.99/month')).toBeInTheDocument();
      expect(screen.getByText('monthly subscription')).toBeInTheDocument();
      expect(screen.getByText('Cancel anytime')).toBeInTheDocument();
    });

    it('displays upgrade and dismiss buttons on Android', () => {
      mockIsAndroid.mockReturnValue(true);

      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: /upgrade to premium/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /maybe later/i })).toBeInTheDocument();
    });

    it('displays Android-only message and OK button on desktop', () => {
      mockIsAndroid.mockReturnValue(false);

      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByText('Subscriptions are available on the Android app.')).toBeInTheDocument();
      expect(screen.getByText('Get on Google Play')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ok/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /upgrade to premium/i })).not.toBeInTheDocument();
    });
  });

  describe('resource-specific display', () => {
    it('displays resource limit info when resource prop is provided', () => {
      renderWithProviders(
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
      renderWithProviders(
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
      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      expect(screen.queryByText(/free tier limit/i)).not.toBeInTheDocument();
    });
  });

  describe('focus management', () => {
    it('focuses the dismiss button on open (Maybe Later on Android)', async () => {
      mockIsAndroid.mockReturnValue(true);

      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      await waitFor(() => {
        const maybeLaterButton = screen.getByRole('button', { name: /maybe later/i });
        expect(document.activeElement).toBe(maybeLaterButton);
      });
    });

    it('focuses the dismiss button on open (OK on desktop)', async () => {
      mockIsAndroid.mockReturnValue(false);

      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      await waitFor(() => {
        const okButton = screen.getByRole('button', { name: /ok/i });
        expect(document.activeElement).toBe(okButton);
      });
    });

    it('restores focus to previously focused element on close', async () => {
      mockIsAndroid.mockReturnValue(true);

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

      renderWithProviders(<TestComponent />);

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
      renderWithProviders(<UpgradePromptModal {...defaultProps} onClose={onClose} />);

      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('button interactions', () => {
    it('calls onClose when Maybe Later is clicked (Android)', async () => {
      mockIsAndroid.mockReturnValue(true);

      const onClose = jest.fn();
      renderWithProviders(<UpgradePromptModal {...defaultProps} onClose={onClose} />);

      const maybeLaterButton = screen.getByRole('button', { name: /maybe later/i });
      await act(async () => {
        fireEvent.click(maybeLaterButton);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when OK is clicked (desktop)', async () => {
      mockIsAndroid.mockReturnValue(false);

      const onClose = jest.fn();
      renderWithProviders(<UpgradePromptModal {...defaultProps} onClose={onClose} />);

      const okButton = screen.getByRole('button', { name: /ok/i });
      await act(async () => {
        fireEvent.click(okButton);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('internal testing behavior', () => {
    beforeEach(() => {
      // Set internal testing flag
      process.env.NEXT_PUBLIC_INTERNAL_TESTING = 'true';
      mockIsAndroid.mockReturnValue(false); // Not on Android
    });

    afterEach(() => {
      delete process.env.NEXT_PUBLIC_INTERNAL_TESTING;
    });

    it('grants premium access with test token when INTERNAL_TESTING is enabled', async () => {
      const onClose = jest.fn();
      mockGrantPremiumAccess.mockResolvedValue(undefined);

      renderWithProviders(<UpgradePromptModal {...defaultProps} onClose={onClose} />);

      const upgradeButton = screen.getByRole('button', { name: /upgrade to premium/i });
      await act(async () => {
        fireEvent.click(upgradeButton);
      });

      // Wait for all async operations (including clearSubscriptionCache)
      await waitFor(() => {
        // Token format: test-internal-{timestamp}
        expect(mockGrantPremiumAccess).toHaveBeenCalledWith(expect.stringMatching(/^test-internal-\d+$/));
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('production mode behavior', () => {
    beforeEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
      });
    });

    it('shows upgrade button on Android when PREMIUM_ENFORCEMENT_ENABLED is false', () => {
      mockIsAndroid.mockReturnValue(true);

      // Currently PREMIUM_ENFORCEMENT_ENABLED = false, so upgrade is available on Android
      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: /upgrade to premium/i })).toBeInTheDocument();
    });

    it('shows Android-only message on desktop in production', () => {
      mockIsAndroid.mockReturnValue(false);

      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      // Desktop users see message to get Android app
      expect(screen.getByText('Subscriptions are available on the Android app.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /upgrade to premium/i })).not.toBeInTheDocument();
    });

    // TODO: Add test for when PREMIUM_ENFORCEMENT_ENABLED = true:
    // it('shows inline coming soon message when enforcement is enabled (no upgrade button)', () => {
    //   // When PREMIUM_ENFORCEMENT_ENABLED is true and no Play Billing,
    //   // upgrade button should be replaced with "coming soon" message
    // });
  });

  describe('accessibility', () => {
    it('has proper aria attributes', () => {
      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('title is associated with dialog via aria-labelledby', () => {
      renderWithProviders(<UpgradePromptModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      const labelledById = dialog.getAttribute('aria-labelledby');
      const title = document.getElementById(labelledById!);

      expect(title).toBeInTheDocument();
      expect(title).toHaveTextContent(/free version limit reached/i);
    });
  });
});
