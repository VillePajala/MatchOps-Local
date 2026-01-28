/**
 * Auth Helper Utilities
 *
 * Shared utilities for authentication components.
 * Used by AuthModal, LoginScreen, and other auth-related components.
 */

/**
 * Check if an error message indicates a network problem.
 * Used to provide more helpful feedback to users when network issues occur.
 *
 * @param message - The error message to check
 * @returns true if the message indicates a network-related error
 */
export function isNetworkErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('offline') ||
    lower.includes('connection') ||
    lower.includes('fetch') ||
    lower.includes('timeout')
  );
}

/**
 * Normalize email for consistent handling.
 * Trims whitespace and converts to lowercase.
 *
 * @param email - The email to normalize
 * @returns Normalized email string
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
