/**
 * Tests for usePlayBilling hook
 *
 * Tests the React hook for Google Play Billing integration.
 * Covers purchase flow, restore flow, and server verification.
 *
 * @critical - Financial flow tests
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePlayBilling, grantMockSubscription, BillingResult } from './usePlayBilling';
import type { PurchaseResult } from '@/utils/playBilling';

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

  // Valid session mock for all tests
  const validSession = {
    user: { id: 'test-user-id' },
    access_token: 'valid-test-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockIsPlayBillingAvailable.mockResolvedValue(false);
    mockGetSubscriptionDetails.mockResolvedValue(null);
    mockPurchaseSubscription.mockResolvedValue({ success: false, error: 'Not available' });
    mockGetExistingPurchases.mockResolvedValue([]);

    // Setup Supabase mock with auth - include access_token and expires_at
    mockFunctionsInvoke = jest.fn().mockResolvedValue({ data: null, error: null });
    mockGetSession = jest.fn().mockResolvedValue({ data: { session: validSession } });
    mockGetSupabaseClient.mockReturnValue({
      functions: {
        invoke: mockFunctionsInvoke,
      },
      auth: {
        getSession: mockGetSession,
        refreshSession: jest.fn().mockResolvedValue({ data: { session: validSession }, error: null }),
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

      let purchaseResult: BillingResult | undefined;
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

      let purchaseResult: BillingResult | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchase();
      });

      expect(purchaseResult).toEqual({
        success: true,
        purchaseToken: 'purchase-token-123',
      });

      // Verify server verification was called with Authorization header
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('verify-subscription', {
        body: {
          purchaseToken: 'purchase-token-123',
          productId: 'matchops_premium_monthly',
        },
        headers: {
          Authorization: 'Bearer valid-test-token',
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

      let purchaseResult: BillingResult | undefined;
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

      let purchaseResult: BillingResult | undefined;
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

      let purchaseResult: BillingResult | undefined;
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

      // Verify server verification was called with the first token and Authorization header
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('verify-subscription', {
        body: {
          purchaseToken: 'existing-token-123',
          productId: 'matchops_premium_monthly',
        },
        headers: {
          Authorization: 'Bearer valid-test-token',
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
  let mockGetSession: jest.Mock;

  // Mock session with valid expiry (1 hour from now)
  const mockSession = {
    user: { id: 'user-123' },
    access_token: 'valid-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_INTERNAL_TESTING = 'true';

    mockFunctionsInvoke = jest.fn();
    mockGetSession = jest.fn().mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    mockGetSupabaseClient.mockReturnValue({
      auth: {
        getSession: mockGetSession,
        refreshSession: jest.fn().mockResolvedValue({
          data: { session: mockSession },
          error: null,
        }),
      },
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

    expect(result).toEqual({ success: true, purchaseToken: 'test-12345-abc' });
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('verify-subscription', {
      body: {
        purchaseToken: 'test-12345-abc',
        productId: 'matchops_premium_monthly',
      },
      headers: {
        Authorization: 'Bearer valid-token',
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

  it('returns error when not logged in', async () => {
    // Mock both getSession and refreshSession to return no session
    // ensureFreshSession tries refreshSession as recovery when getSession returns null
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const mockRefreshSession = jest.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockGetSupabaseClient.mockReturnValue({
      functions: {
        invoke: mockFunctionsInvoke,
      },
      auth: {
        getSession: mockGetSession,
        refreshSession: mockRefreshSession,
      },
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await grantMockSubscription('test-12345-abc');

    expect(result).toEqual({
      success: false,
      error: 'Not logged in. Please sign in first.',
    });
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('refreshes expired session before calling Edge Function', async () => {
    // Mock an expired session (expired 10 minutes ago)
    const expiredSession = {
      ...mockSession,
      expires_at: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
    };

    const refreshedSession = {
      ...mockSession,
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };

    const mockRefreshSession = jest.fn().mockResolvedValue({
      data: { session: refreshedSession },
      error: null,
    });

    mockGetSession.mockResolvedValue({
      data: { session: expiredSession },
      error: null,
    });

    mockGetSupabaseClient.mockReturnValue({
      auth: {
        getSession: mockGetSession,
        refreshSession: mockRefreshSession,
      },
      functions: {
        invoke: mockFunctionsInvoke,
      },
    } as unknown as ReturnType<typeof getSupabaseClient>);

    mockFunctionsInvoke.mockResolvedValue({
      data: { success: true, status: 'active' },
      error: null,
    });

    const result = await grantMockSubscription('test-12345-abc');

    expect(result).toEqual({ success: true, purchaseToken: 'test-12345-abc' });
    expect(mockRefreshSession).toHaveBeenCalled();
    expect(mockFunctionsInvoke).toHaveBeenCalled();
  });
});

// =============================================================================
// EDGE CASES AND ROBUSTNESS TESTS
// =============================================================================

describe('usePlayBilling - Race Conditions', () => {
  let mockFunctionsInvoke: jest.Mock;
  let mockGetSession: jest.Mock;

  const mockSession = {
    user: { id: 'user-123' },
    access_token: 'valid-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockIsPlayBillingAvailable.mockResolvedValue(true);
    mockGetSubscriptionDetails.mockResolvedValue({
      productId: 'matchops_premium_monthly',
      title: 'MatchOps Premium',
      description: 'Premium subscription',
      price: '4.99',
      priceMicros: 4990000,
      currencyCode: 'EUR',
    });

    mockFunctionsInvoke = jest.fn();
    mockGetSession = jest.fn().mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    mockGetSupabaseClient.mockReturnValue({
      auth: {
        getSession: mockGetSession,
        refreshSession: jest.fn().mockResolvedValue({ data: { session: mockSession }, error: null }),
      },
      functions: { invoke: mockFunctionsInvoke },
    } as unknown as ReturnType<typeof getSupabaseClient>);
  });

  /**
   * @critical - Ensures rapid button clicks don't cause double-charges
   */
  it('handles rapid double-click on purchase button (only one purchase attempt)', async () => {
    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Mock purchase that takes some time
    let purchaseCallCount = 0;
    mockPurchaseSubscription.mockImplementation(() => {
      purchaseCallCount++;
      return new Promise((resolve) =>
        setTimeout(() => resolve({ success: true, purchaseToken: `token-${purchaseCallCount}` }), 50)
      );
    });
    mockFunctionsInvoke.mockResolvedValue({ data: { success: true }, error: null });

    // Simulate rapid double-click (no delay between clicks)
    const results: Array<{ success: boolean; error?: string }> = [];

    await act(async () => {
      // Fire 3 rapid clicks
      const p1 = result.current.purchase();
      const p2 = result.current.purchase();
      const p3 = result.current.purchase();

      results.push(...(await Promise.all([p1, p2, p3])));
    });

    // Only one should succeed, others should be blocked
    const successCount = results.filter((r) => r.success).length;
    const blockedCount = results.filter((r) => r.error === 'Purchase already in progress').length;

    expect(successCount).toBe(1);
    expect(blockedCount).toBe(2);
    // Purchase should only be called once
    expect(purchaseCallCount).toBe(1);
  });

  /**
   * @critical - Ensures restore and purchase don't interfere with each other
   */
  it('blocks purchase while restore is in progress', async () => {
    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Mock slow restore
    mockGetExistingPurchases.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(['existing-token']), 100))
    );
    mockFunctionsInvoke.mockResolvedValue({ data: { success: true }, error: null });

    let restoreResult: { success: boolean; error?: string };
    let purchaseResult: { success: boolean; error?: string };

    await act(async () => {
      // Start restore first
      const restorePromise = result.current.restore();
      // Then try purchase while restore is running
      const purchasePromise = result.current.purchase();

      [restoreResult, purchaseResult] = await Promise.all([restorePromise, purchasePromise]);
    });

    // One should succeed, one should be blocked (by operationLockRef)
    const blocked =
      restoreResult!.error === 'Operation already in progress' ||
      purchaseResult!.error === 'Purchase already in progress';
    expect(blocked).toBe(true);
  });
});

describe('usePlayBilling - Edge Function Error Responses', () => {
  let mockFunctionsInvoke: jest.Mock;
  let mockGetSession: jest.Mock;

  const mockSession = {
    user: { id: 'user-123' },
    access_token: 'valid-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockIsPlayBillingAvailable.mockResolvedValue(true);
    mockGetSubscriptionDetails.mockResolvedValue({
      productId: 'matchops_premium_monthly',
      title: 'MatchOps Premium',
      description: 'Premium subscription',
      price: '4.99',
      priceMicros: 4990000,
      currencyCode: 'EUR',
    });

    mockFunctionsInvoke = jest.fn();
    mockGetSession = jest.fn().mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    mockGetSupabaseClient.mockReturnValue({
      auth: {
        getSession: mockGetSession,
        refreshSession: jest.fn().mockResolvedValue({ data: { session: mockSession }, error: null }),
      },
      functions: { invoke: mockFunctionsInvoke },
    } as unknown as ReturnType<typeof getSupabaseClient>);
  });

  /**
   * @edge-case - Token already claimed by another user (409 Conflict)
   */
  it('handles 409 Conflict - token claimed by another user', async () => {
    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockPurchaseSubscription.mockResolvedValue({
      success: true,
      purchaseToken: 'purchase-token-123',
    });

    // Simulate 409 conflict response from Edge Function
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: false, error: 'Token already claimed by another account' },
      error: null,
    });

    let purchaseResult: BillingResult | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    expect(purchaseResult).toEqual({
      success: false,
      error: 'Token already claimed by another account',
    });
  });

  /**
   * @edge-case - Rate limit exceeded (429 Too Many Requests)
   */
  it('handles 429 Rate Limit - too many requests', async () => {
    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockPurchaseSubscription.mockResolvedValue({
      success: true,
      purchaseToken: 'purchase-token-123',
    });

    // Simulate 429 rate limit response
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: false, error: 'Rate limit exceeded. Please try again later.' },
      error: null,
    });

    let purchaseResult: BillingResult | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    expect(purchaseResult).toEqual({
      success: false,
      error: 'Rate limit exceeded. Please try again later.',
    });
  });

  /**
   * @edge-case - Edge Function throws exception (non-2xx with error object)
   */
  it('handles Edge Function exception with error object', async () => {
    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockPurchaseSubscription.mockResolvedValue({
      success: true,
      purchaseToken: 'purchase-token-123',
    });

    // Simulate Edge Function returning non-2xx status
    mockFunctionsInvoke.mockResolvedValue({
      data: { error: 'Internal server error' },
      error: { message: 'Edge function returned non-2xx status code' },
    });

    let purchaseResult: BillingResult | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    // Should extract error from data.error when main error is generic
    expect(purchaseResult).toEqual({
      success: false,
      error: 'Internal server error',
    });
  });

  /**
   * @edge-case - Missing purchaseToken after successful Play Billing flow
   */
  it('handles missing purchaseToken from Play Billing', async () => {
    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Play Billing returns success but no token (shouldn't happen but defensive)
    // Cast to unknown to simulate malformed response for defensive testing
    mockPurchaseSubscription.mockResolvedValue({
      success: true,
      purchaseToken: undefined, // Missing token
    } as unknown as PurchaseResult);

    let purchaseResult: BillingResult | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    expect(purchaseResult).toEqual({
      success: false,
      error: 'No purchase token received',
    });
    // Should not call Edge Function without token
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });
});

describe('usePlayBilling - Session Expiry Scenarios', () => {
  let mockFunctionsInvoke: jest.Mock;
  let mockGetSession: jest.Mock;
  let mockRefreshSession: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockIsPlayBillingAvailable.mockResolvedValue(true);
    mockGetSubscriptionDetails.mockResolvedValue({
      productId: 'matchops_premium_monthly',
      title: 'MatchOps Premium',
      description: 'Premium subscription',
      price: '4.99',
      priceMicros: 4990000,
      currencyCode: 'EUR',
    });

    mockFunctionsInvoke = jest.fn();
    mockGetSession = jest.fn();
    mockRefreshSession = jest.fn();

    mockGetSupabaseClient.mockReturnValue({
      auth: {
        getSession: mockGetSession,
        refreshSession: mockRefreshSession,
      },
      functions: { invoke: mockFunctionsInvoke },
    } as unknown as ReturnType<typeof getSupabaseClient>);
  });

  /**
   * @edge-case - Session expires during purchase flow, refresh fails
   */
  it('handles session refresh failure during verification', async () => {
    // Start with expired session
    const expiredSession = {
      user: { id: 'user-123' },
      access_token: 'expired-token',
      expires_at: Math.floor(Date.now() / 1000) - 600, // Expired 10 min ago
    };

    mockGetSession.mockResolvedValue({
      data: { session: expiredSession },
      error: null,
    });

    // Refresh fails
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Refresh token expired' },
    });

    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockPurchaseSubscription.mockResolvedValue({
      success: true,
      purchaseToken: 'purchase-token-123',
    });

    let purchaseResult: BillingResult | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    // Should fail gracefully when session refresh fails
    expect(purchaseResult?.success).toBe(false);
    // Should not call Edge Function with invalid session
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  /**
   * @edge-case - Session expires right before Edge Function call (within buffer)
   */
  it('proactively refreshes session expiring within 60-second buffer', async () => {
    // Session expiring in 30 seconds (within 60s buffer)
    const soonToExpireSession = {
      user: { id: 'user-123' },
      access_token: 'soon-to-expire-token',
      expires_at: Math.floor(Date.now() / 1000) + 30, // 30 seconds from now
    };

    const freshSession = {
      user: { id: 'user-123' },
      access_token: 'fresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };

    mockGetSession.mockResolvedValue({
      data: { session: soonToExpireSession },
      error: null,
    });

    mockRefreshSession.mockResolvedValue({
      data: { session: freshSession },
      error: null,
    });

    mockFunctionsInvoke.mockResolvedValue({
      data: { success: true, status: 'active' },
      error: null,
    });

    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockPurchaseSubscription.mockResolvedValue({
      success: true,
      purchaseToken: 'purchase-token-123',
    });

    let purchaseResult: BillingResult | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    expect(purchaseResult?.success).toBe(true);
    // Should have proactively refreshed the session
    expect(mockRefreshSession).toHaveBeenCalled();
    // Should call Edge Function with the fresh token
    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'verify-subscription',
      expect.objectContaining({
        headers: { Authorization: 'Bearer fresh-token' },
      })
    );
  });

  /**
   * @edge-case - No session at all when trying to purchase
   */
  it('requires authentication before purchase', async () => {
    // No session
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let purchaseResult: BillingResult | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    expect(purchaseResult).toEqual({
      success: false,
      error: 'Please sign in to purchase',
    });
    expect(mockPurchaseSubscription).not.toHaveBeenCalled();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  /**
   * @edge-case - Session exists but access_token is missing
   */
  it('handles session with missing access_token', async () => {
    // Session exists but access_token is null/undefined
    const invalidSession = {
      user: { id: 'user-123' },
      access_token: null,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    mockGetSession.mockResolvedValue({
      data: { session: invalidSession },
      error: null,
    });

    const { result } = renderHook(() => usePlayBilling());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockPurchaseSubscription.mockResolvedValue({
      success: true,
      purchaseToken: 'purchase-token-123',
    });

    let purchaseResult: BillingResult | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    expect(purchaseResult?.success).toBe(false);
    if (purchaseResult && !purchaseResult.success) {
      expect(purchaseResult.error).toContain('Session invalid');
    }
  });
});
