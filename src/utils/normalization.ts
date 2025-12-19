/**
 * String normalization utilities for consistent name handling across domains.
 *
 * Used for player names, team names, season names, tournament names, and personnel names.
 */

/**
 * Normalizes a name by trimming whitespace.
 * Use for display and storage.
 */
export const normalizeName = (name: string): string => name.trim();

/**
 * Normalizes a name for case-insensitive comparison.
 * Applies trimming, lowercasing, and Unicode normalization (NFKC).
 * Use for duplicate detection and matching.
 */
export const normalizeNameForCompare = (name: string): string =>
  normalizeName(name).toLowerCase().normalize('NFKC');
