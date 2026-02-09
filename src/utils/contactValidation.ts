/**
 * Contact information validation and sanitization utilities
 * Prevents XSS attacks through tel: and mailto: links
 */

/**
 * Validates if a string is a safe phone number
 * Allows: digits, spaces, hyphens, parentheses, plus sign
 * Blocks: javascript:, data:, and other protocol handlers
 */
export function isSafePhoneNumber(phone: string | undefined): boolean {
  if (!phone || typeof phone !== 'string') return false;

  // Block protocol handlers and suspicious patterns
  const lowerPhone = phone.toLowerCase();
  if (lowerPhone.includes('javascript:') ||
      lowerPhone.includes('data:') ||
      lowerPhone.includes('<') ||
      lowerPhone.includes('>')) {
    return false;
  }

  // Allow only valid phone number characters
  // Digits, spaces, hyphens, parentheses, plus, dots
  const phoneRegex = /^[\d\s\-().+]+$/;
  if (!phoneRegex.test(phone)) return false;

  // Must contain at least one digit to be a valid phone number
  return /\d/.test(phone);
}

/**
 * Validates if a string is a safe email address
 * Uses standard email regex and blocks malicious patterns
 */
export function isSafeEmail(email: string | undefined): boolean {
  if (!email || typeof email !== 'string') return false;

  // Block protocol handlers and suspicious patterns
  const lowerEmail = email.toLowerCase();
  if (lowerEmail.includes('javascript:') ||
      lowerEmail.includes('data:') ||
      lowerEmail.includes('<') ||
      lowerEmail.includes('>')) {
    return false;
  }

  // Basic email validation regex
  // Not perfect but catches most valid emails and blocks malicious input
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitizes a phone number for use in tel: links
 * Removes all non-digit/space/hyphen/plus characters
 */
export function sanitizePhoneNumber(phone: string): string {
  // Keep only safe characters
  return phone.replace(/[^\d\s\-().+]/g, '');
}

/**
 * Sanitizes an email address for use in mailto: links
 * Encodes URI component to prevent injection
 */
export function sanitizeEmail(email: string): string {
  return encodeURIComponent(email.trim());
}

/**
 * Gets a safe tel: href or null if phone is invalid
 */
export function getSafeTelHref(phone: string | undefined): string | null {
  if (!isSafePhoneNumber(phone)) return null;
  return `tel:${sanitizePhoneNumber(phone!)}`;
}

/**
 * Gets a safe mailto: href or null if email is invalid
 */
export function getSafeMailtoHref(email: string | undefined): string | null {
  if (!isSafeEmail(email)) return null;
  return `mailto:${sanitizeEmail(email!)}`;
}
