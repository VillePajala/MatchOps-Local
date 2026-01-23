/**
 * Tests for usePlayBilling hook
 *
 * @module hooks/__tests__/usePlayBilling
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePlayBilling } from '../usePlayBilling';
import * as playBilling from '@/utils/playBilling';

// Mock the playBilling utilities
jest.mock('@/utils/playBilling');

// Mock the Supabase client
jest.mock('@/datastore/supabase/client', () => ({
  getSupabaseClient: jest.fn(() => ({
    functions: {
      invoke: jest.fn().mockResolvedValue({
        data: { success: true, status: 'active', periodEnd: '2025-02-23T00:00:00Z' },
        error: null,
      }),
    },
  })),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockPlayBilling = playBilling as jest.Mocked<typeof playBilling>;

describe('usePlayBilling', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockPlayBilling.isPlayBillingAvailable.mockResolvedValue(false);
    mockPlayBilling.getSubscriptionDetails.mockResolvedValue(null);
    mockPlayBilling.purchaseSubscription.mockResolvedValue({ success: false, error: 'Not available' });
    mockPlayBilling.getExistingPurchases.mockResolvedValue([]);
    // Note: SUBSCRIPTION_PRODUCT_ID is read-only, we just verify its value in tests
  });

  describe('initialization', () => {
    it('starts with isLoading true', () => {
      const { result } = renderHook(() => usePlayBilling());
      expect(result.current.isLoading).toBe(true);
    });

    it('sets isAvailable to false when Play Billing is not available', async () => {
      mockPlayBilling.isPlayBillingAvailable.mockResolvedValue(false);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAvailable).toBe(false);
      expect(result.current.details).toBeNull();
    });

    it('sets isAvailable to true and loads details when Play Billing is available', async () => {
      const mockDetails: playBilling.SubscriptionDetails = {
        productId: 'matchops_premium_monthly',
        title: 'MatchOps Premium',
        description: 'Monthly subscription',
        price: '4.99',
        priceMicros: 4990000,
        currencyCode: 'EUR',
      };

      mockPlayBilling.isPlayBillingAvailable.mockResolvedValue(true);
      mockPlayBilling.getSubscriptionDetails.mockResolvedValue(mockDetails);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAvailable).toBe(true);
      expect(result.current.details).toEqual(mockDetails);
    });
  });

  describe('purchase', () => {
    it('returns error when Play Billing is not available', async () => {
      mockPlayBilling.isPlayBillingAvailable.mockResolvedValue(false);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let purchaseResult: playBilling.PurchaseResult | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchase();
      });

      expect(purchaseResult?.success).toBe(false);
      expect(purchaseResult?.error).toBe('Play Billing not available');
    });

    it('completes purchase flow successfully', async () => {
      mockPlayBilling.isPlayBillingAvailable.mockResolvedValue(true);
      mockPlayBilling.getSubscriptionDetails.mockResolvedValue({
        productId: 'matchops_premium_monthly',
        title: 'Premium',
        description: 'Monthly',
        price: '4.99',
        priceMicros: 4990000,
        currencyCode: 'EUR',
      });
      mockPlayBilling.purchaseSubscription.mockResolvedValue({
        success: true,
        purchaseToken: 'test-token-123',
      });

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let purchaseResult: playBilling.PurchaseResult | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchase();
      });

      expect(purchaseResult?.success).toBe(true);
      expect(purchaseResult?.purchaseToken).toBe('test-token-123');
    });

    it('prevents duplicate purchases', async () => {
      mockPlayBilling.isPlayBillingAvailable.mockResolvedValue(true);

      // Create a promise that we can control when it resolves
      let resolvePurchase: (value: playBilling.PurchaseResult) => void;
      const purchasePromise = new Promise<playBilling.PurchaseResult>((resolve) => {
        resolvePurchase = resolve;
      });
      mockPlayBilling.purchaseSubscription.mockReturnValue(purchasePromise);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Start first purchase (don't await - let it hang)
      let firstPromise: Promise<playBilling.PurchaseResult>;
      act(() => {
        firstPromise = result.current.purchase();
      });

      // Wait for isPurchasing to be true
      await waitFor(() => {
        expect(result.current.isPurchasing).toBe(true);
      });

      // Try second purchase while first is in progress
      let secondResult: playBilling.PurchaseResult | undefined;
      await act(async () => {
        secondResult = await result.current.purchase();
      });

      expect(secondResult?.success).toBe(false);
      expect(secondResult?.error).toBe('Purchase already in progress');

      // Clean up: resolve the first purchase
      await act(async () => {
        resolvePurchase!({ success: true, purchaseToken: 'token' });
        await firstPromise!;
      });
    });
  });

  describe('restore', () => {
    it('returns error when no purchases to restore', async () => {
      mockPlayBilling.isPlayBillingAvailable.mockResolvedValue(true);
      mockPlayBilling.getExistingPurchases.mockResolvedValue([]);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let restoreResult: playBilling.PurchaseResult | undefined;
      await act(async () => {
        restoreResult = await result.current.restore();
      });

      expect(restoreResult?.success).toBe(false);
      expect(restoreResult?.error).toBe('No purchases to restore');
    });

    it('restores existing purchase successfully', async () => {
      mockPlayBilling.isPlayBillingAvailable.mockResolvedValue(true);
      mockPlayBilling.getExistingPurchases.mockResolvedValue(['existing-token-456']);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let restoreResult: playBilling.PurchaseResult | undefined;
      await act(async () => {
        restoreResult = await result.current.restore();
      });

      expect(restoreResult?.success).toBe(true);
      expect(restoreResult?.purchaseToken).toBe('existing-token-456');
    });
  });

  describe('refreshDetails', () => {
    it('refreshes product details', async () => {
      const initialDetails: playBilling.SubscriptionDetails = {
        productId: 'matchops_premium_monthly',
        title: 'Premium',
        description: 'Monthly',
        price: '4.99',
        priceMicros: 4990000,
        currencyCode: 'EUR',
      };

      const updatedDetails: playBilling.SubscriptionDetails = {
        ...initialDetails,
        price: '5.99',
        priceMicros: 5990000,
      };

      mockPlayBilling.isPlayBillingAvailable.mockResolvedValue(true);
      mockPlayBilling.getSubscriptionDetails
        .mockResolvedValueOnce(initialDetails)
        .mockResolvedValueOnce(updatedDetails);

      const { result } = renderHook(() => usePlayBilling());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.details?.price).toBe('4.99');

      await act(async () => {
        await result.current.refreshDetails();
      });

      expect(result.current.details?.price).toBe('5.99');
    });
  });
});
