/**
 * Tests for usePlayBilling hook
 *
 * Tests the React hook for Google Play Billing integration.
 * Covers purchase flow, restore flow, and server verification.
 *
 * @critical - Financial flow tests
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePlayBilling, grantMockSubscription } from './usePlayBilling';

// Mock playBilling utilities
jest.mock('@/utils/playBilling', () => ({
  isPlayBillingAvailable: jest.fn(),
  purchaseSubscription: jest.fn(),
  getSubscriptionDetails: jest.fn(),
  getExistingPurchases: jest.fn(),
  SUBSCRIPTION_PRODUCT_ID: 'matchops_premium_monthly',
}));

// Mock Supabase client
jest.mock('@/datastore/supabase/client', () => ({
  getSupabaseClient: jest.fn(() => ({
    functions: {
      invoke: jest.fn(),
    },
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } } }),
    },
  })),
}));

// Mock SubscriptionContext
jest.mock('@/contexts/SubscriptionContext', () => ({
  clearSubscriptionCache: jest.fn().mockResolvedValue(undefined),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  isPlayBillingAvailable,
  purchaseSubscription,
  getSubscriptionDetails,
  getExistingPurchases,
} from '@/utils/playBilling';
import { getSupabaseClient } from '@/datastore/supabase/client';

const mockIsPlayBillingAvailable = isPlayBillingAvailable as jest.MockedFunction<typeof isPlayBillingAvailable>;
const mockPurchaseSubscription = purchaseSubscription as jest.MockedFunction<typeof purchaseSubscription>;
const mockGetSubscriptionDetails = getSubscriptionDetails as jest.MockedFunction<typeof getSubscriptionDetails>;
const mockGetExistingPurchases = getExistingPurchases as jest.MockedFunction<typeof getExistingPurchases>;
const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>;

describe('usePlayBilling', () => {
  let mockFunctionsInvoke: jest.Mock;
  let mockGetSession: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockIsPlayBillingAvailable.mockResolvedValue(false);
    mockGetSubscriptionDetails.mockResolvedValue(null);
    mockPurchaseSubscription.mockResolvedValue({ success: false, error: 'Not available' });
    mockGetExistingPurchases.mockResolvedValue([]);

    // Setup Supabase mock with auth
    mockFunctionsInvoke = jest.fn().mockResolvedValue({ data: null, error: null });
    mockGetSession = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } } });
    mockGetSupabaseClient.mockReturnValue({
      functions: {
        invoke: mockFunctionsInvoke,
      },
      auth: {
        getSession: mockGetSession,
      },
    } as unknown as ReturnType<typeof getSupabaseClient>);
  });

  describe('initialization', () => {
    it('starts with loading state', () => {
      const { result } = renderHook(() => usePlayBilling());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAvailable).toBe(false);
      expect(result.current.details).toBeNull();
    });

    it('sets isAvailable to true when Play Billing is available', async () => {
      mockIsPlayBillingAvailable.mockResolvedValue(true);
      mockGetSubscriptionDetails.mockResolvedValue({
        productId: 'matchops_premium_monthly',
        title: 'MatchOps Premium',
        description: 'Premium subscription',
        price: '4.99',
        priceMicros: 4990000,
        currencyCode: 'EUR',
      });

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAvailable).toBe(true);
      expect(result.current.details).not.toBeNull();
      expect(result.current.details?.price).toBe('4.99');
    });

    it('sets isAvailable to false when Play Billing is not available', async () => {
      mockIsPlayBillingAvailable.mockResolvedValue(false);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAvailable).toBe(false);
      expect(result.current.details).toBeNull();
    });

    it('handles initialization errors gracefully', async () => {
      mockIsPlayBillingAvailable.mockRejectedValue(new Error('Init failed'));

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAvailable).toBe(false);
    });
  });

  describe('purchase flow', () => {
    beforeEach(() => {
      mockIsPlayBillingAvailable.mockResolvedValue(true);
      mockGetSubscriptionDetails.mockResolvedValue({
        productId: 'matchops_premium_monthly',
        title: 'MatchOps Premium',
        description: 'Premium subscription',
        price: '4.99',
        priceMicros: 4990000,
        currencyCode: 'EUR',
      });
    });

    it('returns error when Play Billing is not available', async () => {
      mockIsPlayBillingAvailable.mockResolvedValue(false);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let purchaseResult;
      await act(async () => {
        purchaseResult = await result.current.purchase();
      });

      expect(purchaseResult).toEqual({
        success: false,
        error: 'Play Billing not available',
      });
    });

    it('prevents concurrent purchases (race condition protection)', async () => {
      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Mock a slow purchase
      mockPurchaseSubscription.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, purchaseToken: 'token-1' }), 100))
      );
      mockFunctionsInvoke.mockResolvedValue({ data: { success: true }, error: null });

      // Start two purchases simultaneously
      let result1: { success: boolean; error?: string };
      let result2: { success: boolean; error?: string };

      await act(async () => {
        const promise1 = result.current.purchase();
        const promise2 = result.current.purchase();

        [result1, result2] = await Promise.all([promise1, promise2]);
      });

      // First purchase should succeed, second should be blocked
      expect(result1!.success || result2!.success).toBe(true);
      expect(result1!.error === 'Purchase already in progress' || result2!.error === 'Purchase already in progress').toBe(true);
    });

    it('completes successful purchase flow', async () => {
      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockPurchaseSubscription.mockResolvedValue({
        success: true,
        purchaseToken: 'purchase-token-123',
      });
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: true, status: 'active', periodEnd: '2025-02-01' },
        error: null,
      });

      let purchaseResult;
      await act(async () => {
        purchaseResult = await result.current.purchase();
      });

      expect(purchaseResult).toEqual({
        success: true,
        purchaseToken: 'purchase-token-123',
      });

      // Verify server verification was called
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('verify-subscription', {
        body: {
          purchaseToken: 'purchase-token-123',
          productId: 'matchops_premium_monthly',
        },
      });
    });

    it('handles purchase cancellation', async () => {
      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockPurchaseSubscription.mockResolvedValue({
        success: false,
        error: 'cancelled',
      });

      let purchaseResult;
      await act(async () => {
        purchaseResult = await result.current.purchase();
      });

      expect(purchaseResult).toEqual({
        success: false,
        error: 'cancelled',
      });
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('handles server verification failure', async () => {
      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockPurchaseSubscription.mockResolvedValue({
        success: true,
        purchaseToken: 'purchase-token-123',
      });
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: false, error: 'Invalid token' },
        error: null,
      });

      let purchaseResult;
      await act(async () => {
        purchaseResult = await result.current.purchase();
      });

      expect(purchaseResult).toEqual({
        success: false,
        error: 'Invalid token',
      });
    });

    it('handles network error during verification', async () => {
      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockPurchaseSubscription.mockResolvedValue({
        success: true,
        purchaseToken: 'purchase-token-123',
      });
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      let purchaseResult;
      await act(async () => {
        purchaseResult = await result.current.purchase();
      });

      expect(purchaseResult).toEqual({
        success: false,
        error: 'Network error',
      });
    });

    it('sets isPurchasing during purchase flow', async () => {
      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isPurchasing).toBe(false);

      let resolvePromise: () => void;
      mockPurchaseSubscription.mockImplementation(
        () => new Promise((resolve) => {
          resolvePromise = () => resolve({ success: true, purchaseToken: 'token' });
        })
      );
      mockFunctionsInvoke.mockResolvedValue({ data: { success: true }, error: null });

      // Start purchase
      act(() => {
        result.current.purchase();
      });

      // Should be purchasing
      await waitFor(() => {
        expect(result.current.isPurchasing).toBe(true);
      });

      // Complete purchase
      await act(async () => {
        resolvePromise!();
      });

      await waitFor(() => {
        expect(result.current.isPurchasing).toBe(false);
      });
    });
  });

  describe('restore flow', () => {
    beforeEach(() => {
      mockIsPlayBillingAvailable.mockResolvedValue(true);
      mockGetSubscriptionDetails.mockResolvedValue({
        productId: 'matchops_premium_monthly',
        title: 'MatchOps Premium',
        description: 'Premium subscription',
        price: '4.99',
        priceMicros: 4990000,
        currencyCode: 'EUR',
      });
    });

    it('returns error when Play Billing is not available', async () => {
      mockIsPlayBillingAvailable.mockResolvedValue(false);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let restoreResult;
      await act(async () => {
        restoreResult = await result.current.restore();
      });

      expect(restoreResult).toEqual({
        success: false,
        error: 'Play Billing not available',
      });
    });

    it('returns error when no purchases to restore', async () => {
      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetExistingPurchases.mockResolvedValue([]);

      let restoreResult;
      await act(async () => {
        restoreResult = await result.current.restore();
      });

      expect(restoreResult).toEqual({
        success: false,
        error: 'No purchases to restore',
      });
    });

    it('completes successful restore flow', async () => {
      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetExistingPurchases.mockResolvedValue(['existing-token-123']);
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: true, status: 'active', periodEnd: '2025-02-01' },
        error: null,
      });

      let restoreResult;
      await act(async () => {
        restoreResult = await result.current.restore();
      });

      expect(restoreResult).toEqual({
        success: true,
        purchaseToken: 'existing-token-123',
      });

      // Verify server verification was called with the first token
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('verify-subscription', {
        body: {
          purchaseToken: 'existing-token-123',
          productId: 'matchops_premium_monthly',
        },
      });
    });

    it('prevents concurrent restore operations', async () => {
      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Mock a slow restore
      mockGetExistingPurchases.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(['token-1']), 100))
      );
      mockFunctionsInvoke.mockResolvedValue({ data: { success: true }, error: null });

      // Start two restores simultaneously
      let result1: { success: boolean; error?: string };
      let result2: { success: boolean; error?: string };

      await act(async () => {
        const promise1 = result.current.restore();
        const promise2 = result.current.restore();

        [result1, result2] = await Promise.all([promise1, promise2]);
      });

      // First should succeed, second should be blocked
      expect(result1!.error === 'Operation already in progress' || result2!.error === 'Operation already in progress').toBe(true);
    });
  });

  describe('refreshDetails', () => {
    it('does nothing when Play Billing is not available', async () => {
      mockIsPlayBillingAvailable.mockResolvedValue(false);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.refreshDetails();
      });

      // getSubscriptionDetails should only be called during init (but not on refresh since not available)
      expect(mockGetSubscriptionDetails).toHaveBeenCalledTimes(0);
    });

    it('refreshes product details when available', async () => {
      mockIsPlayBillingAvailable.mockResolvedValue(true);
      mockGetSubscriptionDetails.mockResolvedValue({
        productId: 'matchops_premium_monthly',
        title: 'MatchOps Premium',
        description: 'Premium subscription',
        price: '4.99',
        priceMicros: 4990000,
        currencyCode: 'EUR',
      });

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initial call during init
      expect(mockGetSubscriptionDetails).toHaveBeenCalledTimes(1);

      // Update mock to return new price
      mockGetSubscriptionDetails.mockResolvedValue({
        productId: 'matchops_premium_monthly',
        title: 'MatchOps Premium',
        description: 'Premium subscription',
        price: '5.99',
        priceMicros: 5990000,
        currencyCode: 'EUR',
      });

      await act(async () => {
        await result.current.refreshDetails();
      });

      // Called again on refresh
      expect(mockGetSubscriptionDetails).toHaveBeenCalledTimes(2);
      expect(result.current.details?.price).toBe('5.99');
    });
  });
});

describe('grantMockSubscription', () => {
  let mockFunctionsInvoke: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFunctionsInvoke = jest.fn();
    mockGetSupabaseClient.mockReturnValue({
      functions: {
        invoke: mockFunctionsInvoke,
      },
    } as unknown as ReturnType<typeof getSupabaseClient>);
  });

  it('calls verify-subscription with test token', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: true, status: 'active' },
      error: null,
    });

    const result = await grantMockSubscription('test-12345-abc');

    expect(result).toEqual({ success: true });
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('verify-subscription', {
      body: {
        purchaseToken: 'test-12345-abc',
        productId: 'matchops_premium_monthly',
      },
    });
  });

  it('returns error when verification fails', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: false, error: 'Test tokens not accepted in production' },
      error: null,
    });

    const result = await grantMockSubscription('test-12345-abc');

    expect(result).toEqual({
      success: false,
      error: 'Test tokens not accepted in production',
    });
  });

  it('handles network errors', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Network error' },
    });

    const result = await grantMockSubscription('test-12345-abc');

    expect(result).toEqual({
      success: false,
      error: 'Network error',
    });
  });
});
