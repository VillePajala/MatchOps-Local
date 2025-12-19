/**
 * ID generation utilities for consistent ID creation across the application
 */

/**
 * Generates a short random string for ID generation.
 * Uses crypto.randomUUID() when available for better randomness,
 * falls back to Math.random() otherwise.
 *
 * @returns 8-character random string
 */
const generateRandomPart = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // Use first segment of UUID (8 hex characters)
    return crypto.randomUUID().split('-')[0];
  }
  // Fallback: 8 characters from base36
  return Math.random().toString(36).substring(2, 10);
};

/**
 * Generates a unique ID with the specified prefix.
 * Format: {prefix}_{timestamp}_{random}
 *
 * @param prefix - The entity type prefix (e.g., 'player', 'team', 'season')
 * @returns Unique ID string
 *
 * @example
 * generateId('player');   // "player_1703123456789_a1b2c3d4"
 * generateId('team');     // "team_1703123456789_e5f6g7h8"
 * generateId('season');   // "season_1703123456789_i9j0k1l2"
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now();
  const randomPart = generateRandomPart();
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Generates a unique player ID using timestamp and random string
 *
 * @param index - Optional index to append (useful for batch operations)
 * @returns Unique player ID in format: player_{timestamp}_{random}_{index}
 *
 * @example
 * const id = generatePlayerId(0);
 * // Returns: "player_1703123456789_a1b2c3d4e_0"
 */
export function generatePlayerId(index: number = 0): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 11);
  return `player_${timestamp}_${randomPart}_${index}`;
}

/**
 * Generates multiple unique player IDs
 *
 * @param count - Number of IDs to generate
 * @returns Array of unique player IDs
 *
 * @example
 * const ids = generatePlayerIds(3);
 * // Returns: ["player_1703123456789_a1b2c3d4e_0", "player_1703123456789_f5g6h7i8j_1", ...]
 */
export function generatePlayerIds(count: number): string[] {
  const timestamp = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const randomPart = Math.random().toString(36).substring(2, 11);
    return `player_${timestamp}_${randomPart}_${index}`;
  });
}

/**
 * Extracts the timestamp from an ID in format: {prefix}_{timestamp}_{random}[_{index}]
 * Works with player IDs, game IDs, and other entities using this format.
 *
 * @param id - The ID string to extract timestamp from
 * @returns The timestamp as a number, or 0 if extraction fails
 *
 * @example
 * extractTimestampFromId('player_1703123456789_a1b2c3d4e_0'); // Returns: 1703123456789
 * extractTimestampFromId('game_1703123456789_xyz'); // Returns: 1703123456789
 * extractTimestampFromId('invalid'); // Returns: 0
 */
export function extractTimestampFromId(id: string): number {
  const parts = id.split('_');
  return parts.length >= 2 ? parseInt(parts[1], 10) || 0 : 0;
}
