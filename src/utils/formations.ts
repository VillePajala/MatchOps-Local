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
 * Generate positions for a single row of players
 * @param count - Number of players in this row
 * @param relY - The Y position for this row
 * @param margin - Edge margin (default 0.1 means 10% from each edge)
 */
function generateRow(count: number, relY: number, margin: number = 0.1): FieldPosition[] {
  if (count <= 0) return [];
  if (count === 1) return [{ relX: 0.5, relY }];

  const positions: FieldPosition[] = [];
  const usableWidth = 1 - 2 * margin;
  const spacing = usableWidth / (count - 1);

  for (let i = 0; i < count; i++) {
    positions.push({
      relX: margin + i * spacing,
      relY
    });
  }
  return positions;
}

/**
 * Calculate optimal player positions based on team size
 *
 * Returns an array of field positions arranged in a tactical formation
 * appropriate for the number of players. Positions are in relative
 * coordinates where (0, 0) is top-left and (1, 1) is bottom-right.
 *
 * **Formation Patterns:**
 * - 1-4 players: Simple layouts (line or 2x2)
 * - 5-6 players: 2-2-1 or 2-2-2 formations
 * - 7-10 players: Classic formations (3-3-1, 3-2-2, 4-3-3)
 * - 11+ players: Dynamic generation in balanced rows
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
 * // Returns positions for a 2-2-1 formation
 * ```
 */
export function calculateFormationPositions(playerCount: number): FieldPosition[] {
  // Handle edge cases - defensive programming for invalid inputs
  if (!Number.isFinite(playerCount) || playerCount <= 0) {
    return [];
  }

  // For small teams, use predefined formations
  if (playerCount <= 10) {
    return getSmallTeamFormation(playerCount);
  }

  // For larger teams (11+), dynamically generate positions
  return generateDynamicFormation(playerCount);
}

/**
 * Get predefined formation for teams with 1-10 field players
 * Uses clean horizontal rows with consistent spacing
 * Players positioned in defensive half with forward line around midfield
 */
function getSmallTeamFormation(playerCount: number): FieldPosition[] {
  // Use consistent margin for all rows to create clean horizontal lines
  const MARGIN = 0.15;

  switch (playerCount) {
    case 1:
      // Single player - midfield position
      return [{ relX: 0.5, relY: 0.45 }];

    case 2:
      // 2 players in a row - midfield line
      return generateRow(2, 0.50, MARGIN);

    case 3:
      // 3 players in a row - spread across midfield
      return generateRow(3, 0.55, MARGIN);

    case 4:
      // 2-2 formation - defense and midfield
      return [
        ...generateRow(2, 0.75, MARGIN),
        ...generateRow(2, 0.45, MARGIN)
      ];

    case 5:
      // 3-2 formation - three defenders, two midfielders
      return [
        ...generateRow(3, 0.75, MARGIN),
        ...generateRow(2, 0.45, MARGIN)
      ];

    case 6:
      // 3-3 formation - defense and midfield rows
      return [
        ...generateRow(3, 0.75, MARGIN),
        ...generateRow(3, 0.45, MARGIN)
      ];

    case 7:
      // 3-3-1 formation with forward
      return [
        ...generateRow(3, 0.78, MARGIN),
        ...generateRow(3, 0.55, MARGIN),
        { relX: 0.5, relY: 0.30 }
      ];

    case 8:
      // 3-3-2 formation
      return [
        ...generateRow(3, 0.78, MARGIN),
        ...generateRow(3, 0.55, MARGIN),
        ...generateRow(2, 0.30, 0.25)
      ];

    case 9:
      // 3-3-3 formation - three clean rows
      return [
        ...generateRow(3, 0.78, MARGIN),
        ...generateRow(3, 0.55, MARGIN),
        ...generateRow(3, 0.30, MARGIN)
      ];

    case 10:
      // 4-3-3 formation (classic)
      return [
        ...generateRow(4, 0.78, 0.10),
        ...generateRow(3, 0.55, MARGIN),
        ...generateRow(3, 0.30, MARGIN)
      ];

    default:
      return [];
  }
}

/**
 * Result of applying a formation preset
 */
export interface FormationResult {
  /** Positions for players that fit in the formation */
  positions: FieldPosition[];
  /** Number of extra players that don't fit in formation */
  overflow: number;
}

/**
 * Apply a formation preset to a given number of players
 *
 * If there are more players than the preset supports, the extra players
 * are counted as "overflow" and should be placed elsewhere (e.g., sideline).
 *
 * If there are fewer players than the preset supports, only positions
 * for the available players are returned (from the front of the formation).
 *
 * @param presetPositions - Array of positions from the formation preset
 * @param playerCount - Number of field players (excluding goalkeeper)
 * @returns Object containing positions to use and overflow count
 *
 * @example
 * ```typescript
 * // Apply a 4-3-3 formation to 12 players
 * const result = applyFormationPreset(preset.positions, 12);
 * // result.positions has 10 positions (4-3-3)
 * // result.overflow is 2 (extra players)
 * ```
 */
export function applyFormationPreset(
  presetPositions: FieldPosition[],
  playerCount: number
): FormationResult {
  const formationSize = presetPositions.length;

  if (playerCount <= formationSize) {
    // Fewer players than positions: use first N positions
    return {
      positions: presetPositions.slice(0, playerCount),
      overflow: 0,
    };
  }

  // More players than positions: all positions used, extra overflow
  return {
    positions: presetPositions,
    overflow: playerCount - formationSize,
  };
}

/**
 * Generate sideline positions for overflow/substitute players
 *
 * Places extra players on the right sideline near the bottom corner,
 * stacked vertically with tight spacing (like substitutes on the bench).
 *
 * @param count - Number of overflow players
 * @returns Array of sideline positions
 */
export function generateSidelinePositions(count: number): FieldPosition[] {
  if (count <= 0) return [];

  const positions: FieldPosition[] = [];
  const startY = 0.92;  // Start from bottom corner
  const spacing = 0.06; // Tight spacing between subs

  for (let i = 0; i < count; i++) {
    positions.push({
      relX: 0.97,  // Right edge of field
      relY: startY - i * spacing,  // Stack upward from bottom
    });
  }

  return positions;
}

/**
 * Generate positions dynamically for large teams (11+ field players)
 * Distributes players across 3-4 rows from defense to attack
 * Players positioned lower on field (defensive orientation)
 */
function generateDynamicFormation(playerCount: number): FieldPosition[] {
  const positions: FieldPosition[] = [];

  // Define row structure based on player count
  // Use 4 rows: defense (back), def-mid, att-mid, attack (front)
  // Positions are lower on the field (higher relY = closer to own goal)
  const rowYPositions = [0.80, 0.60, 0.42, 0.25];

  // Distribute players across rows
  // More players in defense, balanced mid, fewer in attack
  let remaining = playerCount;
  const rowCounts: number[] = [];

  if (playerCount <= 12) {
    // 4-4-2-2 style
    rowCounts.push(Math.min(4, remaining)); remaining -= rowCounts[0];
    rowCounts.push(Math.min(4, remaining)); remaining -= rowCounts[1];
    rowCounts.push(Math.min(2, remaining)); remaining -= rowCounts[2];
    rowCounts.push(remaining);
  } else if (playerCount <= 16) {
    // 4-4-4-rest style
    rowCounts.push(Math.min(4, remaining)); remaining -= rowCounts[0];
    rowCounts.push(Math.min(4, remaining)); remaining -= rowCounts[1];
    rowCounts.push(Math.min(4, remaining)); remaining -= rowCounts[2];
    rowCounts.push(remaining);
  } else {
    // Very large teams - distribute more evenly
    const perRow = Math.ceil(playerCount / 4);
    rowCounts.push(Math.min(perRow, remaining)); remaining -= rowCounts[0];
    rowCounts.push(Math.min(perRow, remaining)); remaining -= rowCounts[1];
    rowCounts.push(Math.min(perRow, remaining)); remaining -= rowCounts[2];
    rowCounts.push(remaining);
  }

  // Generate positions for each row
  for (let i = 0; i < 4; i++) {
    if (rowCounts[i] > 0) {
      // Use tighter margins for rows with more players
      const margin = Math.max(0.05, 0.15 - (rowCounts[i] - 3) * 0.02);
      positions.push(...generateRow(rowCounts[i], rowYPositions[i], margin));
    }
  }

  return positions;
}
