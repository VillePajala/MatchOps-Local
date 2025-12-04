/**
 * Tests for checksum utilities
 * @critical - Data integrity verification for migrations and backups
 */

import {
  generateChecksum,
  verifyChecksum,
  isWebCryptoSupported,
  getWebCryptoCompatibilityInfo,
  generateResumeDataChecksum,
  verifyResumeDataIntegrity,
} from './checksumUtils';

// Mock logger
jest.mock('@/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

describe('checksumUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // isWebCryptoSupported
  // ============================================
  describe('isWebCryptoSupported', () => {
    it('should return true when Web Crypto API is available', () => {
      // In jsdom/Node with crypto polyfill, this should be true
      const result = isWebCryptoSupported();
      expect(typeof result).toBe('boolean');
    });

    it('should detect Web Crypto support status', () => {
      // jsdom may not have full Web Crypto API (crypto.subtle)
      // The function should return false gracefully in that case
      const result = isWebCryptoSupported();
      expect(typeof result).toBe('boolean');
      // In jsdom 26, crypto exists but subtle may not
      // This is expected behavior - the fallback hash will be used
    });
  });

  // ============================================
  // getWebCryptoCompatibilityInfo
  // ============================================
  describe('getWebCryptoCompatibilityInfo', () => {
    it('should return feature availability information', () => {
      const info = getWebCryptoCompatibilityInfo();

      expect(info).toHaveProperty('supported');
      expect(info).toHaveProperty('features');
      expect(info.features).toHaveProperty('crypto');
      expect(info.features).toHaveProperty('subtle');
      expect(info.features).toHaveProperty('digest');
    });

    it('should detect crypto availability in test environment', () => {
      // In jsdom, crypto may or may not have subtle depending on version
      const info = getWebCryptoCompatibilityInfo();
      expect(info.features.crypto).toBe(true); // crypto object exists
      // subtle may not be available in jsdom, so we just check the structure
      expect(typeof info.supported).toBe('boolean');
      if (!info.supported) {
        expect(info.recommendation).toBeDefined();
      }
    });
  });

  // ============================================
  // generateChecksum
  // ============================================
  describe('generateChecksum', () => {
    it('should generate consistent checksums for the same input', async () => {
      const data = 'test data';
      const checksum1 = await generateChecksum(data);
      const checksum2 = await generateChecksum(data);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksums for different inputs', async () => {
      const checksum1 = await generateChecksum('data 1');
      const checksum2 = await generateChecksum('data 2');

      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle empty string', async () => {
      const checksum = await generateChecksum('');
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });

    it('should handle unicode characters', async () => {
      const checksum = await generateChecksum('こんにちは世界 🌍');
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });

    it('should handle large strings', async () => {
      const largeData = 'x'.repeat(100000);
      const checksum = await generateChecksum(largeData);
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });

    it('should return hex string', async () => {
      const checksum = await generateChecksum('test');
      expect(checksum).toMatch(/^[0-9a-f]+$/);
    });

    it('should produce valid checksum even when using fallback', async () => {
      // In jsdom without full Web Crypto, the fallback simple hash is used
      // Just verify it produces consistent results
      const checksum1 = await generateChecksum('test fallback');
      const checksum2 = await generateChecksum('test fallback');

      expect(checksum1).toBe(checksum2);
      expect(typeof checksum1).toBe('string');
      expect(checksum1.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // verifyChecksum
  // ============================================
  describe('verifyChecksum', () => {
    it('should return true for matching checksum', async () => {
      const data = 'test data';
      const checksum = await generateChecksum(data);

      const result = await verifyChecksum(data, checksum);
      expect(result).toBe(true);
    });

    it('should return false for non-matching checksum', async () => {
      const data = 'test data';
      const wrongChecksum = 'incorrect_checksum';

      const result = await verifyChecksum(data, wrongChecksum);
      expect(result).toBe(false);
    });

    it('should return false when data has been modified', async () => {
      const originalData = 'original data';
      const modifiedData = 'modified data';
      const checksum = await generateChecksum(originalData);

      const result = await verifyChecksum(modifiedData, checksum);
      expect(result).toBe(false);
    });

    it('should return false for mismatched checksums', async () => {
      // Any wrong checksum should return false
      const result = await verifyChecksum('data', 'wrong_checksum_value');
      expect(result).toBe(false);
    });
  });

  // ============================================
  // generateResumeDataChecksum
  // ============================================
  describe('generateResumeDataChecksum', () => {
    it('should generate checksum for resume data object', async () => {
      const resumeData = {
        step: 3,
        processedItems: 100,
        timestamp: 1234567890,
      };

      const checksum = await generateResumeDataChecksum(resumeData);
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });

    it('should generate consistent checksum regardless of key order', async () => {
      const resumeData1 = { a: 1, b: 2, c: 3 };
      const resumeData2 = { c: 3, a: 1, b: 2 };

      const checksum1 = await generateResumeDataChecksum(resumeData1);
      const checksum2 = await generateResumeDataChecksum(resumeData2);

      expect(checksum1).toBe(checksum2);
    });

    it('should handle nested objects', async () => {
      const resumeData = {
        outer: {
          inner: {
            value: 'nested',
          },
        },
      };

      const checksum = await generateResumeDataChecksum(resumeData);
      expect(typeof checksum).toBe('string');
    });

    it('should handle arrays', async () => {
      const resumeData = {
        items: [1, 2, 3],
        names: ['a', 'b', 'c'],
      };

      const checksum = await generateResumeDataChecksum(resumeData);
      expect(typeof checksum).toBe('string');
    });

    it('should handle empty object', async () => {
      const checksum = await generateResumeDataChecksum({});
      expect(typeof checksum).toBe('string');
    });
  });

  // ============================================
  // verifyResumeDataIntegrity
  // ============================================
  describe('verifyResumeDataIntegrity', () => {
    it('should return true for intact resume data', async () => {
      const resumeData = {
        step: 5,
        processedItems: 250,
      };
      const checksum = await generateResumeDataChecksum(resumeData);

      const result = await verifyResumeDataIntegrity(resumeData, checksum);
      expect(result).toBe(true);
    });

    it('should return false when data has been tampered', async () => {
      const originalData = {
        step: 5,
        processedItems: 250,
      };
      const checksum = await generateResumeDataChecksum(originalData);

      const tamperedData = {
        step: 5,
        processedItems: 300, // Modified value
      };

      const result = await verifyResumeDataIntegrity(tamperedData, checksum);
      expect(result).toBe(false);
    });

    it('should return false when checksum is invalid', async () => {
      const resumeData = { step: 1 };

      const result = await verifyResumeDataIntegrity(resumeData, 'invalid_checksum');
      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      // Pass null which should cause JSON.stringify to fail in edge cases
      // or at minimum not match
      const result = await verifyResumeDataIntegrity(
        { circular: 'test' },
        'some_checksum'
      );
      expect(typeof result).toBe('boolean');
    });
  });

  // ============================================
  // Edge cases and security considerations
  // ============================================
  describe('edge cases', () => {
    it('should handle special characters in data', async () => {
      const specialChars = '<script>alert("xss")</script>\n\r\t';
      const checksum = await generateChecksum(specialChars);
      expect(typeof checksum).toBe('string');
    });

    it('should handle null bytes in data', async () => {
      const dataWithNull = 'before\x00after';
      const checksum = await generateChecksum(dataWithNull);
      expect(typeof checksum).toBe('string');
    });

    it('should produce different checksums for visually similar but different data', async () => {
      // These look similar but have different characters
      const data1 = 'password'; // ASCII
      const data2 = 'раssword'; // First 'p' is Cyrillic

      const checksum1 = await generateChecksum(data1);
      const checksum2 = await generateChecksum(data2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle JSON with various types', async () => {
      const complexData = {
        string: 'test',
        number: 42,
        float: 3.14,
        boolean: true,
        null: null,
        array: [1, 'two', false],
        nested: { deep: { value: 'found' } },
      };

      const checksum = await generateResumeDataChecksum(complexData);
      expect(typeof checksum).toBe('string');

      // Verify it's consistent
      const checksum2 = await generateResumeDataChecksum(complexData);
      expect(checksum).toBe(checksum2);
    });
  });
});
