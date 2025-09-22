/**
 * Checksum Utilities for Data Integrity
 *
 * Provides cryptographic hashing for verifying data integrity,
 * particularly for migration resume data validation.
 */

/**
 * Generate SHA-256 hash of data for integrity verification
 */
export async function generateChecksum(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Use Web Crypto API for modern browsers
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback for environments without Web Crypto API
    return simpleHash(data);
  }
}

/**
 * Verify data against its checksum
 */
export async function verifyChecksum(data: string, expectedChecksum: string): Promise<boolean> {
  try {
    const actualChecksum = await generateChecksum(data);
    return actualChecksum === expectedChecksum;
  } catch {
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
  } catch {
    return false;
  }
}