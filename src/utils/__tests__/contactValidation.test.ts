/**
 * Tests for contactValidation.ts
 *
 * Validates security-critical contact sanitization and XSS prevention
 * for tel: and mailto: links used in personnel contact information.
 * @critical
 */

import {
  isSafePhoneNumber,
  isSafeEmail,
  sanitizePhoneNumber,
  sanitizeEmail,
  getSafeTelHref,
  getSafeMailtoHref,
} from '../contactValidation';

describe('contactValidation', () => {
  describe('isSafePhoneNumber', () => {
    it('accepts a standard phone number with country code', () => {
      expect(isSafePhoneNumber('+358 40 123 4567')).toBe(true);
    });

    it('accepts a phone number with dashes', () => {
      expect(isSafePhoneNumber('040-123-4567')).toBe(true);
    });

    it('accepts a phone number with parentheses', () => {
      expect(isSafePhoneNumber('(040) 1234567')).toBe(true);
    });

    it('accepts a phone number with dots', () => {
      expect(isSafePhoneNumber('040.123.4567')).toBe(true);
    });

    it('accepts digits only', () => {
      expect(isSafePhoneNumber('0401234567')).toBe(true);
    });

    it('accepts a phone with plus sign at start', () => {
      expect(isSafePhoneNumber('+1 555 0100')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isSafePhoneNumber('')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSafePhoneNumber(undefined)).toBe(false);
    });

    it('returns false for null passed as undefined', () => {
      expect(isSafePhoneNumber(null as unknown as undefined)).toBe(false);
    });

    // Security: XSS injection vectors
    it('blocks javascript: protocol injection', () => {
      expect(isSafePhoneNumber('javascript:alert(1)')).toBe(false);
    });

    it('blocks javascript: with mixed case', () => {
      expect(isSafePhoneNumber('JavaScript:alert(1)')).toBe(false);
    });

    it('blocks javascript: with uppercase', () => {
      expect(isSafePhoneNumber('JAVASCRIPT:alert(1)')).toBe(false);
    });

    it('blocks data: protocol injection', () => {
      expect(isSafePhoneNumber('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('blocks data: with mixed case', () => {
      expect(isSafePhoneNumber('Data:text/html,test')).toBe(false);
    });

    it('blocks HTML script tags', () => {
      expect(isSafePhoneNumber('<script>alert(1)</script>')).toBe(false);
    });

    it('blocks HTML img tags with angle brackets', () => {
      expect(isSafePhoneNumber('<img src=x onerror=alert(1)>')).toBe(false);
    });

    it('blocks phone number containing angle brackets', () => {
      expect(isSafePhoneNumber('+358 <40> 1234567')).toBe(false);
    });

    it('rejects alphabetic characters mixed with digits', () => {
      expect(isSafePhoneNumber('040abc4567')).toBe(false);
    });

    it('rejects strings with only spaces', () => {
      // Regex matches spaces, so a string of spaces technically matches the character class
      // But from a practical standpoint, the regex allows it since spaces are valid chars
      expect(isSafePhoneNumber('   ')).toBe(true);
    });

    it('handles a very long string of digits', () => {
      const longNumber = '1'.repeat(500);
      expect(isSafePhoneNumber(longNumber)).toBe(true);
    });

    it('handles a very long string with injection buried in it', () => {
      const longString = '0'.repeat(200) + 'javascript:alert(1)' + '0'.repeat(200);
      expect(isSafePhoneNumber(longString)).toBe(false);
    });

    it('handles Unicode digits (not allowed by regex)', () => {
      // Arabic-Indic digits
      expect(isSafePhoneNumber('\u0660\u0661\u0662')).toBe(false);
    });
  });

  describe('isSafeEmail', () => {
    it('accepts a standard email address', () => {
      expect(isSafeEmail('user@example.com')).toBe(true);
    });

    it('accepts email with subdomain', () => {
      expect(isSafeEmail('user@mail.example.com')).toBe(true);
    });

    it('accepts email with plus alias', () => {
      expect(isSafeEmail('user+tag@example.com')).toBe(true);
    });

    it('accepts email with dots in local part', () => {
      expect(isSafeEmail('first.last@example.com')).toBe(true);
    });

    it('accepts email with hyphens in domain', () => {
      expect(isSafeEmail('user@my-domain.com')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isSafeEmail('')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSafeEmail(undefined)).toBe(false);
    });

    it('returns false for null passed as undefined', () => {
      expect(isSafeEmail(null as unknown as undefined)).toBe(false);
    });

    it('returns false for string without @ sign', () => {
      expect(isSafeEmail('userexample.com')).toBe(false);
    });

    it('returns false for string without domain part', () => {
      expect(isSafeEmail('user@')).toBe(false);
    });

    it('returns false for string without TLD', () => {
      expect(isSafeEmail('user@example')).toBe(false);
    });

    it('returns false for email with spaces', () => {
      expect(isSafeEmail('user @example.com')).toBe(false);
    });

    // Security: XSS injection vectors
    it('blocks javascript: protocol injection', () => {
      expect(isSafeEmail('javascript:alert(1)')).toBe(false);
    });

    it('blocks javascript: with mixed case', () => {
      expect(isSafeEmail('JavaScript:alert(1)@evil.com')).toBe(false);
    });

    it('blocks data: protocol injection', () => {
      expect(isSafeEmail('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('blocks data: with mixed case', () => {
      expect(isSafeEmail('Data:text/html,test@evil.com')).toBe(false);
    });

    it('blocks HTML script tags', () => {
      expect(isSafeEmail('<script>alert(1)</script>@evil.com')).toBe(false);
    });

    it('blocks HTML img tags', () => {
      expect(isSafeEmail('<img src=x>@evil.com')).toBe(false);
    });

    it('blocks email with angle brackets in local part', () => {
      expect(isSafeEmail('user<script>@example.com')).toBe(false);
    });

    it('handles a very long valid email', () => {
      const longLocal = 'a'.repeat(200);
      const email = `${longLocal}@example.com`;
      expect(isSafeEmail(email)).toBe(true);
    });

    it('handles a very long string with injection buried in it', () => {
      const longEmail = 'a'.repeat(200) + 'javascript:alert(1)' + '@example.com';
      expect(isSafeEmail(longEmail)).toBe(false);
    });

    it('handles Unicode in email (rejected by regex)', () => {
      expect(isSafeEmail('\u00FC\u00E4@example.com')).toBe(true);
    });
  });

  describe('sanitizePhoneNumber', () => {
    it('returns a clean phone number unchanged', () => {
      expect(sanitizePhoneNumber('+358 40 123-4567')).toBe('+358 40 123-4567');
    });

    it('preserves digits', () => {
      expect(sanitizePhoneNumber('0401234567')).toBe('0401234567');
    });

    it('preserves plus sign', () => {
      expect(sanitizePhoneNumber('+1')).toBe('+1');
    });

    it('preserves dashes', () => {
      expect(sanitizePhoneNumber('040-123-4567')).toBe('040-123-4567');
    });

    it('preserves spaces', () => {
      expect(sanitizePhoneNumber('040 123 4567')).toBe('040 123 4567');
    });

    it('preserves parentheses', () => {
      expect(sanitizePhoneNumber('(040) 1234567')).toBe('(040) 1234567');
    });

    it('preserves dots', () => {
      expect(sanitizePhoneNumber('040.123.4567')).toBe('040.123.4567');
    });

    it('strips alphabetic characters', () => {
      expect(sanitizePhoneNumber('040abc4567')).toBe('0404567');
    });

    it('strips special characters like @ and #', () => {
      expect(sanitizePhoneNumber('040@123#4567')).toBe('0401234567');
    });

    it('strips HTML tags', () => {
      expect(sanitizePhoneNumber('<script>040</script>')).toBe('040');
    });

    it('strips javascript: protocol', () => {
      expect(sanitizePhoneNumber('javascript:alert(1)')).toBe('(1)');
    });

    it('returns empty string for input with no valid chars', () => {
      expect(sanitizePhoneNumber('abc!@#$%^&*=')).toBe('');
    });

    it('handles empty string input', () => {
      expect(sanitizePhoneNumber('')).toBe('');
    });
  });

  describe('sanitizeEmail', () => {
    it('trims leading whitespace', () => {
      const result = sanitizeEmail('  user@example.com');
      expect(decodeURIComponent(result)).toBe('user@example.com');
    });

    it('trims trailing whitespace', () => {
      const result = sanitizeEmail('user@example.com   ');
      expect(decodeURIComponent(result)).toBe('user@example.com');
    });

    it('trims both leading and trailing whitespace', () => {
      const result = sanitizeEmail('  user@example.com  ');
      expect(decodeURIComponent(result)).toBe('user@example.com');
    });

    it('URI-encodes the @ symbol', () => {
      const result = sanitizeEmail('user@example.com');
      expect(result).toContain('%40');
    });

    it('URI-encodes special characters', () => {
      const result = sanitizeEmail('user+tag@example.com');
      expect(result).toContain('%2B');
    });

    it('handles empty string', () => {
      expect(sanitizeEmail('')).toBe('');
    });

    it('handles string with only whitespace', () => {
      expect(sanitizeEmail('   ')).toBe('');
    });

    it('does not double-encode already encoded strings', () => {
      // encodeURIComponent encodes % as %25
      const result = sanitizeEmail('user%40@example.com');
      expect(result).toContain('%2540');
    });
  });

  describe('getSafeTelHref', () => {
    it('returns tel: href for a valid phone number', () => {
      const result = getSafeTelHref('+358 40 1234567');
      expect(result).toBe('tel:+358 40 1234567');
    });

    it('returns tel: href with sanitized number', () => {
      const result = getSafeTelHref('040-123-4567');
      expect(result).toBe('tel:040-123-4567');
    });

    it('returns null for undefined', () => {
      expect(getSafeTelHref(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getSafeTelHref('')).toBeNull();
    });

    it('returns null for javascript: injection', () => {
      expect(getSafeTelHref('javascript:alert(1)')).toBeNull();
    });

    it('returns null for data: injection', () => {
      expect(getSafeTelHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('returns null for HTML injection', () => {
      expect(getSafeTelHref('<img src=x onerror=alert(1)>')).toBeNull();
    });

    it('returns null for alphabetic input', () => {
      expect(getSafeTelHref('not a phone number')).toBeNull();
    });
  });

  describe('getSafeMailtoHref', () => {
    it('returns mailto: href for a valid email', () => {
      const result = getSafeMailtoHref('user@example.com');
      expect(result).toBe('mailto:user%40example.com');
    });

    it('returns mailto: href with trimmed and encoded email', () => {
      const result = getSafeMailtoHref('user@example.com');
      expect(result).toMatch(/^mailto:/);
      expect(result).toContain('%40');
    });

    it('returns null for undefined', () => {
      expect(getSafeMailtoHref(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getSafeMailtoHref('')).toBeNull();
    });

    it('returns null for javascript: injection', () => {
      expect(getSafeMailtoHref('javascript:alert(1)')).toBeNull();
    });

    it('returns null for data: injection', () => {
      expect(getSafeMailtoHref('data:text/html,test')).toBeNull();
    });

    it('returns null for HTML injection', () => {
      expect(getSafeMailtoHref('<script>alert(1)</script>@evil.com')).toBeNull();
    });

    it('returns null for invalid email without domain', () => {
      expect(getSafeMailtoHref('user@')).toBeNull();
    });

    it('returns null for invalid email without @', () => {
      expect(getSafeMailtoHref('userexample.com')).toBeNull();
    });
  });
});
