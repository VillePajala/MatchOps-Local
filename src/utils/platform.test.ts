/**
 * Tests for platform detection utilities
 */

import { isAndroid, isIOS, isDesktop, canUsePlayBilling, isDigitalGoodsAvailable, isPlayStoreContext } from './platform';

describe('platform detection utilities', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  describe('isAndroid', () => {
    it('returns true for Android user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36' },
        configurable: true,
      });
      expect(isAndroid()).toBe(true);
    });

    it('returns true for Android tablet', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel C) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(isAndroid()).toBe(true);
    });

    it('returns false for Windows desktop', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
        configurable: true,
      });
      expect(isAndroid()).toBe(false);
    });

    it('returns false for macOS', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(isAndroid()).toBe(false);
    });

    it('returns false for iOS', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15' },
        configurable: true,
      });
      expect(isAndroid()).toBe(false);
    });

    it('returns false when navigator is undefined', () => {
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        configurable: true,
      });
      expect(isAndroid()).toBe(false);
    });
  });

  describe('isIOS', () => {
    it('returns true for iPhone', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1' },
        configurable: true,
      });
      expect(isIOS()).toBe(true);
    });

    it('returns true for iPad', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15' },
        configurable: true,
      });
      expect(isIOS()).toBe(true);
    });

    it('returns true for iPod', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15' },
        configurable: true,
      });
      expect(isIOS()).toBe(true);
    });

    it('returns false for Android', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(isIOS()).toBe(false);
    });

    it('returns false for macOS desktop', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(isIOS()).toBe(false);
    });

    it('returns false when navigator is undefined', () => {
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        configurable: true,
      });
      expect(isIOS()).toBe(false);
    });
  });

  describe('isDesktop', () => {
    it('returns true for Windows desktop', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(isDesktop()).toBe(true);
    });

    it('returns true for macOS desktop', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(isDesktop()).toBe(true);
    });

    it('returns true for Linux desktop', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(isDesktop()).toBe(true);
    });

    it('returns false for Android', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(isDesktop()).toBe(false);
    });

    it('returns false for iOS', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15' },
        configurable: true,
      });
      expect(isDesktop()).toBe(false);
    });
  });

  describe('canUsePlayBilling', () => {
    it('returns true on Android', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(canUsePlayBilling()).toBe(true);
    });

    it('returns false on desktop', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(canUsePlayBilling()).toBe(false);
    });

    it('returns false on iOS', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15' },
        configurable: true,
      });
      expect(canUsePlayBilling()).toBe(false);
    });
  });

  describe('isPlayStoreContext', () => {
    it('returns false when getDigitalGoodsService is not on window', () => {
      // Default test environment has no getDigitalGoodsService
      expect(isPlayStoreContext()).toBe(false);
    });

    it('returns true when getDigitalGoodsService is on window', () => {
      (window as unknown as { getDigitalGoodsService: () => void }).getDigitalGoodsService = jest.fn();
      try {
        expect(isPlayStoreContext()).toBe(true);
      } finally {
        delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
      }
    });
  });

  describe('isDigitalGoodsAvailable', () => {
    it('returns false on non-Android platforms', async () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        configurable: true,
      });
      expect(await isDigitalGoodsAvailable()).toBe(false);
    });

    it('returns false on Android when Digital Goods API not present', async () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36' },
        configurable: true,
      });
      // No getDigitalGoodsService in window
      expect(await isDigitalGoodsAvailable()).toBe(false);
    });

    it('returns true on Android when Digital Goods API is available', async () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36' },
        configurable: true,
      });
      // Mock the Digital Goods API
      const mockService = { getDetails: jest.fn() };
      (window as unknown as { getDigitalGoodsService: (url: string) => Promise<unknown> }).getDigitalGoodsService = jest.fn().mockResolvedValue(mockService);

      expect(await isDigitalGoodsAvailable()).toBe(true);

      // Cleanup
      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });

    it('returns false when Digital Goods API throws', async () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36' },
        configurable: true,
      });
      // Mock the Digital Goods API to throw
      (window as unknown as { getDigitalGoodsService: (url: string) => Promise<unknown> }).getDigitalGoodsService = jest.fn().mockRejectedValue(new Error('Not available'));

      expect(await isDigitalGoodsAvailable()).toBe(false);

      // Cleanup
      delete (window as unknown as { getDigitalGoodsService?: unknown }).getDigitalGoodsService;
    });
  });
});
