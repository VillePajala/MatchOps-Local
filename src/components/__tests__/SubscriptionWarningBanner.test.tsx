/**
 * Tests for SubscriptionWarningBanner component
 *
 * @module components/__tests__/SubscriptionWarningBanner
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubscriptionWarningBanner } from '../SubscriptionWarningBanner';
import * as SubscriptionContext from '@/contexts/SubscriptionContext';
import * as platform from '@/utils/platform';

// Mock dependencies
jest.mock('@/contexts/SubscriptionContext');
jest.mock('@/utils/platform');
// Translation map for tests
const translations: Record<string, string> = {
  'subscription.graceWarning': 'Your subscription has expired. Renew within {{days}} days to keep cloud access.',
  'subscription.expiredWarning': 'Your subscription has expired. Renew to restore cloud access.',
  'subscription.renewNow': 'Renew Now',
  'subscription.renewOnAndroid': 'Renew via Android app',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, unknown>) => {
      const template = translations[key] || key;
      if (typeof options === 'string') return options;
      if (options && typeof options === 'object') {
        // Handle defaultValue
        let value = 'defaultValue' in options ? (options.defaultValue as string) : template;
        // Simple interpolation for {{days}}
        if (options.days !== undefined) {
          value = value.replace('{{days}}', String(options.days));
        }
        return value;
      }
      return template;
    },
  }),
}));

const mockUseSubscriptionOptional = SubscriptionContext.useSubscriptionOptional as jest.MockedFunction<
  typeof SubscriptionContext.useSubscriptionOptional
>;
const mockIsAndroid = platform.isAndroid as jest.MockedFunction<typeof platform.isAndroid>;

describe('SubscriptionWarningBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAndroid.mockReturnValue(false);
  });

  describe('when subscription context is not available', () => {
    it('renders nothing', () => {
      mockUseSubscriptionOptional.mockReturnValue(null);

      const { container } = render(<SubscriptionWarningBanner />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('when subscription status is active', () => {
    it('renders nothing', () => {
      mockUseSubscriptionOptional.mockReturnValue({
        status: 'active',
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        graceEnd: null,
        isActive: true,
        isLoading: false,
        fetchFailed: false,
        refresh: jest.fn(),
      });

      const { container } = render(<SubscriptionWarningBanner />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('when subscription status is none', () => {
    it('renders nothing', () => {
      mockUseSubscriptionOptional.mockReturnValue({
        status: 'none',
        periodEnd: null,
        graceEnd: null,
        isActive: false,
        isLoading: false,
        fetchFailed: false,
        refresh: jest.fn(),
      });

      const { container } = render(<SubscriptionWarningBanner />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('when subscription is in grace period', () => {
    beforeEach(() => {
      // Grace ends in 5 days
      mockUseSubscriptionOptional.mockReturnValue({
        status: 'grace',
        periodEnd: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        graceEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        isActive: true,
        isLoading: false,
        fetchFailed: false,
        refresh: jest.fn(),
      });
    });

    it('renders warning banner with days remaining', () => {
      render(<SubscriptionWarningBanner />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/5 days/)).toBeInTheDocument();
    });

    it('applies amber styling for grace period', () => {
      render(<SubscriptionWarningBanner />);

      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('bg-amber-900');
    });

    it('shows "Renew via Android app" on non-Android', () => {
      mockIsAndroid.mockReturnValue(false);

      render(<SubscriptionWarningBanner onRenew={jest.fn()} />);

      expect(screen.getByText('Renew via Android app')).toBeInTheDocument();
    });

    it('shows renew button on Android', () => {
      mockIsAndroid.mockReturnValue(true);
      const onRenew = jest.fn();

      render(<SubscriptionWarningBanner onRenew={onRenew} />);

      const button = screen.getByText('Renew Now');
      expect(button).toBeInTheDocument();

      fireEvent.click(button);
      expect(onRenew).toHaveBeenCalledTimes(1);
    });
  });

  describe('when subscription is expired', () => {
    beforeEach(() => {
      mockUseSubscriptionOptional.mockReturnValue({
        status: 'expired',
        periodEnd: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        graceEnd: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        isActive: false,
        isLoading: false,
        fetchFailed: false,
        refresh: jest.fn(),
      });
    });

    it('renders expired warning message', () => {
      render(<SubscriptionWarningBanner />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Your subscription has expired. Renew to restore cloud access.')).toBeInTheDocument();
    });

    it('applies red styling for expired', () => {
      render(<SubscriptionWarningBanner />);

      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('bg-red-900');
    });

    it('shows renew button on Android with red styling', () => {
      mockIsAndroid.mockReturnValue(true);
      const onRenew = jest.fn();

      render(<SubscriptionWarningBanner onRenew={onRenew} />);

      const button = screen.getByText('Renew Now');
      expect(button.className).toContain('bg-red-600');
    });
  });

  describe('when cancelled but still in period', () => {
    it('renders nothing (still has access)', () => {
      mockUseSubscriptionOptional.mockReturnValue({
        status: 'cancelled',
        periodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        graceEnd: null,
        isActive: true,
        isLoading: false,
        fetchFailed: false,
        refresh: jest.fn(),
      });

      const { container } = render(<SubscriptionWarningBanner />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('accessibility', () => {
    it('has role="alert" for screen readers', () => {
      mockUseSubscriptionOptional.mockReturnValue({
        status: 'grace',
        periodEnd: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        graceEnd: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        isActive: true,
        isLoading: false,
        fetchFailed: false,
        refresh: jest.fn(),
      });

      render(<SubscriptionWarningBanner />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
