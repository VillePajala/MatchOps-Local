/**
 * Tests for Play Billing utilities
 */

import {
  isPlayBillingAvailable,
  getSubscriptionDetails,
  purchaseSubscription,
  getExistingPurchases,
  isMockBillingEnabled,
  generateTestPurchaseToken,
  SUBSCRIPTION_PRODUCT_ID,
} from './playBilling';

// Store original env
const originalEnv = process.env;

describe('playBilling utilities', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isMockBillingEnabled', () => {
    it('returns false when NEXT_PUBLIC_MOCK_BILLING is not set', () => {
      // Mock billing disabled by default in test environment
      expect(isMockBillingEnabled()).toBe(false);
    });
  });

  describe('generateTestPurchaseToken', () => {
    it('generates a token with test- prefix', () => {
      const token = generateTestPurchaseToken();
      expect(token.startsWith('test-')).toBe(true);
    });

    it('generates unique tokens', () => {
      const token1 = generateTestPurchaseToken();
      const token2 = generateTestPurchaseToken();
      expect(token1).not.toBe(token2);
    });

    it('generates tokens in expected format', () => {
      const token = generateTestPurchaseToken();
      // Format: test-{timestamp}-{random}
      expect(token).toMatch(/^test-\d+-[a-z0-9]+$/);
    });
  });

  describe('SUBSCRIPTION_PRODUCT_ID', () => {
    it('has correct product ID', () => {
      expect(SUBSCRIPTION_PRODUCT_ID).toBe('matchops_premium_monthly');
    });
  });

  describe('isPlayBillingAvailable', () => {
    it('returns false when getDigitalGoodsService is not available', async () => {
      // Default window doesn't have getDigitalGoodsService
      const result = await isPlayBillingAvailable();
      expect(result).toBe(false);
    });

    it('returns false when getDigitalGoodsService returns null', async () => {
      const mockGetService = jest.fn().mockResolvedValue(null);
      (window as unknown as { getDigitalGoodsService: typeof mockGetService }).getDigitalGoodsService = mockGetService;

      const result = await isPlayBillingAvailable();
      expect(result).toBe(false);

      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });

    it('returns true when getDigitalGoodsService returns a service', async () => {
      const mockService = { getDetails: jest.fn(), listPurchases: jest.fn() };
      const mockGetService = jest.fn().mockResolvedValue(mockService);
      (window as unknown as { getDigitalGoodsService: typeof mockGetService }).getDigitalGoodsService = mockGetService;

      const result = await isPlayBillingAvailable();
      expect(result).toBe(true);

      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });

    it('returns false when getDigitalGoodsService throws', async () => {
      const mockGetService = jest.fn().mockRejectedValue(new Error('Not available'));
      (window as unknown as { getDigitalGoodsService: typeof mockGetService }).getDigitalGoodsService = mockGetService;

      // Suppress expected warning
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await isPlayBillingAvailable();
      expect(result).toBe(false);

      warnSpy.mockRestore();
      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });
  });

  describe('getSubscriptionDetails', () => {
    it('returns null when service is not available', async () => {
      const result = await getSubscriptionDetails();
      expect(result).toBeNull();
    });

    it('returns null when getDetails returns empty array', async () => {
      const mockService = {
        getDetails: jest.fn().mockResolvedValue([]),
        listPurchases: jest.fn(),
      };
      const mockGetService = jest.fn().mockResolvedValue(mockService);
      (window as unknown as { getDigitalGoodsService: typeof mockGetService }).getDigitalGoodsService = mockGetService;

      const result = await getSubscriptionDetails();
      expect(result).toBeNull();

      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });

    it('returns subscription details when available', async () => {
      const mockItem = {
        itemId: 'matchops_premium_monthly',
        title: 'MatchOps Premium',
        description: 'Premium subscription',
        price: {
          currency: 'EUR',
          value: '4.99',
          valueMicros: 4990000,
        },
      };
      const mockService = {
        getDetails: jest.fn().mockResolvedValue([mockItem]),
        listPurchases: jest.fn(),
      };
      const mockGetService = jest.fn().mockResolvedValue(mockService);
      (window as unknown as { getDigitalGoodsService: typeof mockGetService }).getDigitalGoodsService = mockGetService;

      const result = await getSubscriptionDetails();
      expect(result).toEqual({
        productId: 'matchops_premium_monthly',
        title: 'MatchOps Premium',
        description: 'Premium subscription',
        price: '4.99',
        priceMicros: 4990000,
        currencyCode: 'EUR',
      });

      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });
  });

  describe('purchaseSubscription', () => {
    it('returns error when product not available', async () => {
      // No Digital Goods Service = no product details
      const result = await purchaseSubscription();
      expect(result).toEqual({ success: false, error: 'Product not available' });
    });
  });

  describe('getExistingPurchases', () => {
    it('returns empty array when service not available', async () => {
      const result = await getExistingPurchases();
      expect(result).toEqual([]);
    });

    it('returns purchase tokens for matching product', async () => {
      const mockPurchases = [
        { itemId: 'matchops_premium_monthly', purchaseToken: 'token-123' },
        { itemId: 'other_product', purchaseToken: 'token-456' },
        { itemId: 'matchops_premium_monthly', purchaseToken: 'token-789' },
      ];
      const mockService = {
        getDetails: jest.fn(),
        listPurchases: jest.fn().mockResolvedValue(mockPurchases),
      };
      const mockGetService = jest.fn().mockResolvedValue(mockService);
      (window as unknown as { getDigitalGoodsService: typeof mockGetService }).getDigitalGoodsService = mockGetService;

      const result = await getExistingPurchases();
      expect(result).toEqual(['token-123', 'token-789']);

      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });

    it('returns empty array when no purchases for product', async () => {
      const mockPurchases = [
        { itemId: 'other_product', purchaseToken: 'token-456' },
      ];
      const mockService = {
        getDetails: jest.fn(),
        listPurchases: jest.fn().mockResolvedValue(mockPurchases),
      };
      const mockGetService = jest.fn().mockResolvedValue(mockService);
      (window as unknown as { getDigitalGoodsService: typeof mockGetService }).getDigitalGoodsService = mockGetService;

      const result = await getExistingPurchases();
      expect(result).toEqual([]);

      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });

    it('returns empty array when listPurchases throws', async () => {
      const mockService = {
        getDetails: jest.fn(),
        listPurchases: jest.fn().mockRejectedValue(new Error('Failed')),
      };
      const mockGetService = jest.fn().mockResolvedValue(mockService);
      (window as unknown as { getDigitalGoodsService: typeof mockGetService }).getDigitalGoodsService = mockGetService;

      const result = await getExistingPurchases();
      expect(result).toEqual([]);

      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });
  });
});

describe('playBilling mock mode', () => {
  // These tests require re-importing the module with different env
  // We use jest.isolateModules to test mock mode behavior

  it('isPlayBillingAvailable returns true in mock mode', async () => {
    jest.isolateModules(async () => {
      process.env.NEXT_PUBLIC_MOCK_BILLING = 'true';
      const { isPlayBillingAvailable: mockIsAvailable } = await import('./playBilling');
      const result = await mockIsAvailable();
      expect(result).toBe(true);
    });
  });

  it('getSubscriptionDetails returns mock details in mock mode', async () => {
    jest.isolateModules(async () => {
      process.env.NEXT_PUBLIC_MOCK_BILLING = 'true';
      const { getSubscriptionDetails: mockGetDetails } = await import('./playBilling');
      const result = await mockGetDetails();
      expect(result).toEqual({
        productId: 'matchops_premium_monthly',
        title: 'MatchOps Premium',
        description: 'Unlimited teams, players, and cloud sync',
        price: '4.99',
        priceMicros: 4990000,
        currencyCode: 'EUR',
      });
    });
  });

  it('purchaseSubscription returns test token in mock mode', async () => {
    jest.isolateModules(async () => {
      process.env.NEXT_PUBLIC_MOCK_BILLING = 'true';
      const { purchaseSubscription: mockPurchase } = await import('./playBilling');
      const result = await mockPurchase();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.purchaseToken).toMatch(/^test-\d+-[a-z0-9]+$/);
      }
    });
  });

  it('getExistingPurchases returns empty array in mock mode', async () => {
    jest.isolateModules(async () => {
      process.env.NEXT_PUBLIC_MOCK_BILLING = 'true';
      const { getExistingPurchases: mockGetPurchases } = await import('./playBilling');
      const result = await mockGetPurchases();
      expect(result).toEqual([]);
    });
  });
});
