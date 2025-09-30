/**
 * Checksum Utilities for Data Integrity
 *
 * Provides cryptographic hashing for verifying data integrity,
 * particularly for migration resume data validation.
 */

/**
 * Generate SHA-256 hash of data for integrity verification
 * Uses Web Crypto API with comprehensive browser compatibility warnings
 */
export async function generateChecksum(data: string): Promise<string> {
  // Check for Web Crypto API support with detailed warnings
  if (!isWebCryptoSupported()) {
    const compatInfo = getWebCryptoCompatibilityInfo();

    // eslint-disable-next-line no-console
    console.warn('⚠️ Web Crypto API Compatibility Warning:');
    // eslint-disable-next-line no-console
    console.warn('Your browser does not fully support the Web Crypto API.');
    // eslint-disable-next-line no-console
    console.warn('This may affect data integrity verification during migration.');
    // eslint-disable-next-line no-console
    console.warn('Browser Support: Chrome 37+, Firefox 34+, Safari 7+, Edge 12+');

    if (compatInfo.recommendation) {
      // eslint-disable-next-line no-console
      console.warn('Recommendation:', compatInfo.recommendation);
    }

    // eslint-disable-next-line no-console
    console.warn('Falling back to a simpler checksum algorithm.');
    return simpleHash(data);
  }

  try {
    // Use Web Crypto API for modern browsers
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Web Crypto API operation failed, falling back to simple hash:', error);
    return simpleHash(data);
  }
}

/**
 * Check if Web Crypto API is supported in the current environment
 */
export function isWebCryptoSupported(): boolean {
  try {
    return (
      typeof crypto !== 'undefined' &&
      crypto.subtle !== undefined &&
      typeof crypto.subtle.digest === 'function'
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to check Web Crypto API support', { error });
    return false;
  }
}

/**
 * Get detailed browser compatibility information for Web Crypto API
 */
export function getWebCryptoCompatibilityInfo(): {
  supported: boolean;
  features: {
    crypto: boolean;
    subtle: boolean;
    digest: boolean;
  };
  recommendation?: string;
} {
  const features = {
    crypto: typeof crypto !== 'undefined',
    subtle: typeof crypto !== 'undefined' && crypto.subtle !== undefined,
    digest: typeof crypto !== 'undefined' && crypto.subtle !== undefined && typeof crypto.subtle.digest === 'function'
  };

  const supported = features.crypto && features.subtle && features.digest;

  let recommendation;
  if (!supported) {
    if (!features.crypto) {
      recommendation = 'Please update to a modern browser that supports the Web Crypto API (Chrome 37+, Firefox 34+, Safari 7+, Edge 12+)';
    } else if (!features.subtle) {
      recommendation = 'Your browser has crypto but not crypto.subtle. This may indicate an insecure context (non-HTTPS). Please use HTTPS.';
    } else if (!features.digest) {
      recommendation = 'Your browser supports crypto.subtle but not the digest function. Please update your browser.';
    }
  }

  return {
    supported,
    features,
    recommendation
  };
}

/**
 * Verify data against its checksum
 */
export async function verifyChecksum(data: string, expectedChecksum: string): Promise<boolean> {
  try {
    const actualChecksum = await generateChecksum(data);
    return actualChecksum === expectedChecksum;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to verify checksum', { error });
    return false;
  }
}

/**
 * Simple hash function fallback for environments without Web Crypto API
 * Not cryptographically secure but provides basic integrity checking
 */
function simpleHash(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString(16);

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to positive hex string
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate checksum for migration resume data
 */
export async function generateResumeDataChecksum(resumeData: Record<string, unknown>): Promise<string> {
  // Create a stable string representation for hashing
  const stableData = JSON.stringify(resumeData, Object.keys(resumeData).sort());
  return generateChecksum(stableData);
}

/**
 * Verify migration resume data integrity
 */
export async function verifyResumeDataIntegrity(
  resumeData: Record<string, unknown>,
  expectedChecksum: string
): Promise<boolean> {
  try {
    const actualChecksum = await generateResumeDataChecksum(resumeData);
    return actualChecksum === expectedChecksum;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to verify resume data integrity', { error });
    return false;
  }
}