/**
 * Soccer Formation Utilities
 *
 * Provides pure functions for calculating player positions on the field
 * based on team size. Formations are designed for youth soccer with
 * realistic spacing and positioning.
 *
 * @module formations
 * @category Utils
 */

/**
 * Position on the soccer field using relative coordinates
 */
export interface FieldPosition {
  /** Relative X position (0.0 = left edge, 1.0 = right edge) */
  relX: number;
  /** Relative Y position (0.0 = top/opponent goal, 1.0 = bottom/own goal) */
  relY: number;
}

/**
 * Calculate optimal player positions based on team size
 *
 * Returns an array of field positions arranged in a tactical formation
 * appropriate for the number of players. Positions are in relative
 * coordinates where (0, 0) is top-left and (1, 1) is bottom-right.
 *
 * **Formation Patterns:**
 * - 1 player: Single central position
 * - 2 players: Side-by-side
 * - 3 players: Triangle formation
 * - 4 players: Diamond (2-2)
 * - 5 players: 2-2-1 formation
 * - 6 players: 2-2-2 formation
 * - 7 players: 3-2-2 formation
 * - 8 players: 2-2-2-2 formation
 * - 9 players: 3-2-3-1 formation
 * - 10+ players: 4-3-3 formation
 *
 * **Note:** Does NOT include goalkeeper position - caller should handle
 * goalkeeper placement separately (typically at relY: 0.95)
 *
 * @param playerCount - Number of field players (excluding goalkeeper)
 * @returns Array of field positions for the formation
 *
 * @example
 * ```typescript
 * // Get positions for 5 field players
 * const positions = calculateFormationPositions(5);
 * // Returns: [
 * //   { relX: 0.2, relY: 0.65 },  // Left back
 * //   { relX: 0.8, relY: 0.65 },  // Right back
 * //   { relX: 0.3, relY: 0.45 },  // Left mid
 * //   { relX: 0.7, relY: 0.45 },  // Right mid
 * //   { relX: 0.5, relY: 0.25 }   // Forward
 * // ]
 * ```
 */
export function calculateFormationPositions(playerCount: number): FieldPosition[] {
  // Handle edge cases - defensive programming for invalid inputs
  if (!Number.isFinite(playerCount) || playerCount <= 0) {
    return [];
  }

  let positions: FieldPosition[];

  // Formation logic based on number of players
  if (playerCount === 1) {
    // Single player - central position
    positions = [{ relX: 0.5, relY: 0.5 }];
  } else if (playerCount === 2) {
    // Two players - side by side
    positions = [
      { relX: 0.35, relY: 0.5 },
      { relX: 0.65, relY: 0.5 }
    ];
  } else if (playerCount === 3) {
    // Triangle formation - 1 mid, 2 wide
    positions = [
      { relX: 0.25, relY: 0.5 },
      { relX: 0.5, relY: 0.4 },
      { relX: 0.75, relY: 0.5 }
    ];
  } else if (playerCount === 4) {
    // Diamond formation - 2 back, 2 forward
    positions = [
      { relX: 0.25, relY: 0.6 },
      { relX: 0.75, relY: 0.6 },
      { relX: 0.35, relY: 0.35 },
      { relX: 0.65, relY: 0.35 }
    ];
  } else if (playerCount === 5) {
    // 2-2-1 formation - 2 backs, 2 mids, 1 forward
    positions = [
      { relX: 0.2, relY: 0.65 },
      { relX: 0.8, relY: 0.65 },
      { relX: 0.3, relY: 0.45 },
      { relX: 0.7, relY: 0.45 },
      { relX: 0.5, relY: 0.25 }
    ];
  } else if (playerCount === 6) {
    // 2-2-2 formation - balanced lines
    positions = [
      { relX: 0.2, relY: 0.7 },
      { relX: 0.8, relY: 0.7 },
      { relX: 0.3, relY: 0.5 },
      { relX: 0.7, relY: 0.5 },
      { relX: 0.35, relY: 0.3 },
      { relX: 0.65, relY: 0.3 }
    ];
  } else if (playerCount === 7) {
    // 3-2-2 formation - strong defense
    positions = [
      { relX: 0.15, relY: 0.75 },
      { relX: 0.5, relY: 0.75 },
      { relX: 0.85, relY: 0.75 },
      { relX: 0.25, relY: 0.5 },
      { relX: 0.75, relY: 0.5 },
      { relX: 0.35, relY: 0.25 },
      { relX: 0.65, relY: 0.25 }
    ];
  } else if (playerCount === 8) {
    // 2-2-2-2 formation - 4 lines of 2
    positions = [
      { relX: 0.15, relY: 0.75 },
      { relX: 0.85, relY: 0.75 },
      { relX: 0.25, relY: 0.55 },
      { relX: 0.75, relY: 0.55 },
      { relX: 0.35, relY: 0.35 },
      { relX: 0.65, relY: 0.35 },
      { relX: 0.4, relY: 0.15 },
      { relX: 0.6, relY: 0.15 }
    ];
  } else if (playerCount === 9) {
    // 3-2-3-1 formation - wide coverage
    positions = [
      { relX: 0.1, relY: 0.75 },
      { relX: 0.5, relY: 0.75 },
      { relX: 0.9, relY: 0.75 },
      { relX: 0.25, relY: 0.5 },
      { relX: 0.75, relY: 0.5 },
      { relX: 0.15, relY: 0.3 },
      { relX: 0.5, relY: 0.3 },
      { relX: 0.85, relY: 0.3 },
      { relX: 0.5, relY: 0.1 }
    ];
  } else {
    // 10+ players - 4-3-3 formation (classic)
    positions = [
      { relX: 0.1, relY: 0.75 },
      { relX: 0.35, relY: 0.75 },
      { relX: 0.65, relY: 0.75 },
      { relX: 0.9, relY: 0.75 },
      { relX: 0.25, relY: 0.5 },
      { relX: 0.5, relY: 0.5 },
      { relX: 0.75, relY: 0.5 },
      { relX: 0.2, relY: 0.25 },
      { relX: 0.5, relY: 0.25 },
      { relX: 0.8, relY: 0.25 }
    ];
  }

  // Return only the positions needed (in case we have more positions than players)
  return positions.slice(0, playerCount);
}
