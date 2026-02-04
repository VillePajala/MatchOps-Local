/**
 * @jest-environment jsdom
 */

/**
 * SubscriptionContext Tests
 *
 * Tests for the subscription state management context.
 * Covers caching, error handling, and state transitions.
 *
 * @critical - Tests subscription provider, caching, and hook behavior
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import {
  SubscriptionProvider,
  useSubscription,
  useSubscriptionOptional,
  isSubscriptionActive,
  clearSubscriptionCache,
} from '../SubscriptionContext';
import { useAuth } from '../AuthProvider';
import { getSupabaseClient } from '@/datastore/supabase/client';
import { getStorageItem, setStorageItem } from '@/utils/storage';

// Mock dependencies
jest.mock('../AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/datastore/supabase/client', () => ({
  getSupabaseClient: jest.fn(),
}));

jest.mock('@/utils/storage', () => ({
  getStorageItem: jest.fn(),
  setStorageItem: jest.fn(),
}));

// Issue #336: Mock backendConfig for isCloudAvailable
jest.mock('@/config/backendConfig', () => ({
  isCloudAvailable: jest.fn(() => true),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>;
const mockGetStorageItem = getStorageItem as jest.MockedFunction<typeof getStorageItem>;
const mockSetStorageItem = setStorageItem as jest.MockedFunction<typeof setStorageItem>;

describe('SubscriptionContext', () => {
  const mockRpcFn = jest.fn();
  const mockSupabaseClient = {
    rpc: mockRpcFn,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabaseClient.mockReturnValue(mockSupabaseClient as unknown as ReturnType<typeof getSupabaseClient>);
    mockGetStorageItem.mockResolvedValue(null);
    mockSetStorageItem.mockResolvedValue(undefined);
    // Issue #336: Reset isCloudAvailable to default between tests for isolation
    const backendConfig = require('@/config/backendConfig');
    backendConfig.isCloudAvailable.mockReturnValue(true);
  });

  describe('isSubscriptionActive helper', () => {
    it('should return true for active status', () => {
      expect(isSubscriptionActive('active')).toBe(true);
    });

    it('should return true for cancelled status (still has access until period ends)', () => {
      expect(isSubscriptionActive('cancelled')).toBe(true);
    });

    it('should return true for grace status (payment failed but grace period)', () => {
      expect(isSubscriptionActive('grace')).toBe(true);
    });

    // TEMPORARY: These tests are skipped while subscription is always active (free sync)
    // TODO: Restore when implementing paid subscriptions (see issue #354)
    it.skip('should return false for none status', () => {
      expect(isSubscriptionActive('none')).toBe(false);
    });

    it.skip('should return false for expired status', () => {
      expect(isSubscriptionActive('expired')).toBe(false);
    });
  });

  describe('SubscriptionProvider', () => {
    it('should show loading state initially in cloud mode', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'cloud',
      } as ReturnType<typeof useAuth>);

      mockRpcFn.mockResolvedValue({
        data: [{ status: 'active', period_end: null, grace_end: null }],
        error: null,
      });

      const TestComponent = () => {
        const { isLoading } = useSubscription();
        return <div data-testid="loading">{isLoading.toString()}</div>;
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      // Initially loading
      expect(screen.getByTestId('loading').textContent).toBe('true');

      // After fetch completes
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
    });

    it('should fetch subscription status for cloud users', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'cloud',
      } as ReturnType<typeof useAuth>);

      mockRpcFn.mockResolvedValue({
        data: [{
          status: 'active',
          period_end: '2025-12-31T00:00:00Z',
          grace_end: '2026-01-07T00:00:00Z'
        }],
        error: null,
      });

      const TestComponent = () => {
        const { status, isActive, periodEnd } = useSubscription();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="active">{isActive.toString()}</span>
            <span data-testid="period-end">{periodEnd?.toISOString() ?? 'null'}</span>
          </div>
        );
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('active');
      });
      expect(screen.getByTestId('active').textContent).toBe('true');
      expect(screen.getByTestId('period-end').textContent).toBe('2025-12-31T00:00:00.000Z');
    });

    it('should return none status for local mode users without authentication', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        mode: 'local',
      } as ReturnType<typeof useAuth>);

      const TestComponent = () => {
        const { status, isActive, isLoading } = useSubscription();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="active">{isActive.toString()}</span>
            <span data-testid="loading">{isLoading.toString()}</span>
          </div>
        );
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('status').textContent).toBe('none');
      expect(screen.getByTestId('active').textContent).toBe('false');
      expect(mockRpcFn).not.toHaveBeenCalled();
    });

    /**
     * Issue #336: Subscription should be fetched in local mode when cloud is available
     * AND user is authenticated. This allows subscription checks to work even when
     * user is in local data storage mode (auth ≠ sync).
     */
    it('should fetch subscription in local mode when cloud is available and user is authenticated', async () => {
      const backendConfig = require('@/config/backendConfig');
      backendConfig.isCloudAvailable.mockReturnValue(true);

      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'local', // Key: local mode, but user is authenticated
      } as ReturnType<typeof useAuth>);

      mockRpcFn.mockResolvedValue({
        data: [{ status: 'active', period_end: null, grace_end: null }],
        error: null,
      });

      const TestComponent = () => {
        const { status, isActive, isLoading } = useSubscription();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="active">{isActive.toString()}</span>
            <span data-testid="loading">{isLoading.toString()}</span>
          </div>
        );
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      // Should fetch and return active subscription
      expect(screen.getByTestId('status').textContent).toBe('active');
      expect(screen.getByTestId('active').textContent).toBe('true');
      // RPC should be called even in local mode
      expect(mockRpcFn).toHaveBeenCalledWith('get_subscription_status');
    });

    /**
     * Issue #336: Subscription should NOT be fetched when cloud is unavailable,
     * even if we somehow have a user (edge case).
     */
    it('should not fetch subscription when cloud is unavailable', async () => {
      const backendConfig = require('@/config/backendConfig');
      backendConfig.isCloudAvailable.mockReturnValue(false);

      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'local',
      } as ReturnType<typeof useAuth>);

      const TestComponent = () => {
        const { status, isActive, isLoading } = useSubscription();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="active">{isActive.toString()}</span>
            <span data-testid="loading">{isLoading.toString()}</span>
          </div>
        );
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      // Should return 'none' without calling RPC
      expect(screen.getByTestId('status').textContent).toBe('none');
      expect(screen.getByTestId('active').textContent).toBe('false');
      expect(mockRpcFn).not.toHaveBeenCalled();
    });

    it('should use cached subscription if available', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'cloud',
      } as ReturnType<typeof useAuth>);

      // Return cached data
      mockGetStorageItem.mockResolvedValue(JSON.stringify({
        data: {
          status: 'cancelled',
          periodEnd: '2025-06-30T00:00:00Z',
          graceEnd: null,
          isActive: true,
        },
        timestamp: Date.now(), // Fresh cache
      }));

      const TestComponent = () => {
        const { status, isActive } = useSubscription();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="active">{isActive.toString()}</span>
          </div>
        );
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('cancelled');
      });
      expect(screen.getByTestId('active').textContent).toBe('true');
      // Should not call RPC when cache is fresh
      expect(mockRpcFn).not.toHaveBeenCalled();
    });

    it('should fetch fresh data if cache is expired', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'cloud',
      } as ReturnType<typeof useAuth>);

      // Return expired cache (6 minutes old, cache TTL is 5 minutes)
      mockGetStorageItem.mockResolvedValue(JSON.stringify({
        data: {
          status: 'cancelled',
          periodEnd: null,
          graceEnd: null,
          isActive: true,
        },
        timestamp: Date.now() - 6 * 60 * 1000,
      }));

      mockRpcFn.mockResolvedValue({
        data: [{ status: 'active', period_end: null, grace_end: null }],
        error: null,
      });

      const TestComponent = () => {
        const { status } = useSubscription();
        return <span data-testid="status">{status}</span>;
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('active');
      });
      // Should call RPC when cache is expired
      expect(mockRpcFn).toHaveBeenCalledWith('get_subscription_status');
    });

    it('should set fetchFailed when RPC fails', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'cloud',
      } as ReturnType<typeof useAuth>);

      mockRpcFn.mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const TestComponent = () => {
        const { fetchFailed, status } = useSubscription();
        return (
          <div>
            <span data-testid="failed">{fetchFailed.toString()}</span>
            <span data-testid="status">{status}</span>
          </div>
        );
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('failed').textContent).toBe('true');
      });
      // Falls back to 'none' when fetch fails and no cache
      expect(screen.getByTestId('status').textContent).toBe('none');
    });

    it('should use cached data with fetchFailed flag when RPC fails but cache exists', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'cloud',
      } as ReturnType<typeof useAuth>);

      // First call returns null (skip cache), second call returns cache (error fallback)
      mockGetStorageItem
        .mockResolvedValueOnce(null) // No cache on initial check
        .mockResolvedValueOnce(JSON.stringify({
          data: {
            status: 'active',
            periodEnd: null,
            graceEnd: null,
            isActive: true,
          },
          timestamp: Date.now() - 1000, // Fresh cache
        }));

      mockRpcFn.mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const TestComponent = () => {
        const { fetchFailed, status, isActive } = useSubscription();
        return (
          <div>
            <span data-testid="failed">{fetchFailed.toString()}</span>
            <span data-testid="status">{status}</span>
            <span data-testid="active">{isActive.toString()}</span>
          </div>
        );
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('failed').textContent).toBe('true');
      });
      // Uses cached status
      expect(screen.getByTestId('status').textContent).toBe('active');
      expect(screen.getByTestId('active').textContent).toBe('true');
    });

    it('should handle empty RPC response', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'cloud',
      } as ReturnType<typeof useAuth>);

      mockRpcFn.mockResolvedValue({
        data: [], // Empty array
        error: null,
      });

      const TestComponent = () => {
        const { status, isActive } = useSubscription();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="active">{isActive.toString()}</span>
          </div>
        );
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('none');
      });
      expect(screen.getByTestId('active').textContent).toBe('false');
    });
  });

  describe('useSubscription hook', () => {
    it('should throw when used outside provider', () => {
      const TestComponent = () => {
        useSubscription();
        return null;
      };

      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useSubscription must be used within SubscriptionProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('useSubscriptionOptional hook', () => {
    it('should return null when used outside provider', () => {
      const TestComponent = () => {
        const context = useSubscriptionOptional();
        return <div data-testid="result">{context === null ? 'null' : 'defined'}</div>;
      };

      render(<TestComponent />);
      expect(screen.getByTestId('result').textContent).toBe('null');
    });

    it('should return context when used inside provider', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        mode: 'local',
      } as ReturnType<typeof useAuth>);

      const TestComponent = () => {
        const context = useSubscriptionOptional();
        return <div data-testid="result">{context === null ? 'null' : 'defined'}</div>;
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('result').textContent).toBe('defined');
      });
    });
  });

  describe('clearSubscriptionCache', () => {
    it('should clear cache for specific user', async () => {
      await clearSubscriptionCache('user-123');

      expect(mockSetStorageItem).toHaveBeenCalledWith(
        'matchops_subscription_cache_user-123',
        ''
      );
    });

    it('should handle storage errors gracefully', async () => {
      mockSetStorageItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(clearSubscriptionCache('user-123')).resolves.toBeUndefined();
    });
  });

  describe('refresh function', () => {
    it('should clear cache and refetch', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        mode: 'cloud',
      } as ReturnType<typeof useAuth>);

      mockRpcFn.mockResolvedValue({
        data: [{ status: 'active', period_end: null, grace_end: null }],
        error: null,
      });

      const refreshRef = { current: null as (() => Promise<void>) | null };

      const TestComponent = () => {
        const { status, refresh } = useSubscription();
        // Use ref pattern to capture refresh function without triggering lint warning
        React.useEffect(() => {
          refreshRef.current = refresh;
        }, [refresh]);
        return <span data-testid="status">{status}</span>;
      };

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('active');
      });

      // Update mock to return different status
      mockRpcFn.mockResolvedValue({
        data: [{ status: 'cancelled', period_end: null, grace_end: null }],
        error: null,
      });

      // Call refresh
      await act(async () => {
        await refreshRef.current!();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('cancelled');
      });

      // Should have cleared cache
      expect(mockSetStorageItem).toHaveBeenCalledWith(
        'matchops_subscription_cache_user-123',
        ''
      );
    });
  });
});
