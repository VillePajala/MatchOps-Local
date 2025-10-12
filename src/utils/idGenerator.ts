/**
 * ID generation utilities for consistent ID creation across the application
 */

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
