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

import { getPositionLabelForFormationPosition } from './positionLabels';

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
  const relX = 0.945;   // Slightly inside the touch boundary

  for (let i = 0; i < count; i++) {
    positions.push({
      relX,  // Right sideline (slightly inside)
      relY: startY - i * spacing,  // Stack upward from bottom
    });
  }

  return positions;
}

/**
 * Sub slot for substitution planning
 * Represents a position on the sideline where a sub can be placed
 */
export interface SubSlot {
  /** X position on sideline (typically 0.96 for right edge) */
  relX: number;
  /** Y position matching the formation position */
  relY: number;
  /** Position label (CB, LW, ST, etc.) */
  positionLabel: string;
}

/**
 * Generate sub slots on the right sideline corresponding to formation positions
 *
 * Creates labeled slots where substitutes can be placed. When multiple positions
 * share the same row (e.g., LB and RB), slots are stacked vertically to avoid overlap.
 *
 * @param formationPositions - Array of field positions from the current formation
 * @returns Array of sub slots with position labels
 */
export function generateSubSlots(formationPositions: FieldPosition[]): SubSlot[] {
  // Defensive guard for null/undefined/empty input
  if (!formationPositions?.length) {
    return [];
  }

  const SUB_SLOT_X = 0.96; // Right sideline
  const ROW_TOLERANCE = 0.08; // Positions within this relY range are considered same row
  // Vertical spacing between stacked slots. Increased from 0.045 after player transparency
  // was removed - opaque players need more spacing to prevent visual overlap
  const SLOT_SPACING = 0.07;

  // Add position labels to each position
  const positionsWithLabels = formationPositions.map(pos => ({
    ...pos,
    label: getPositionLabelForFormationPosition(pos.relX, pos.relY).label,
  }));

  // Group positions by similar relY (same row)
  const rows: Array<typeof positionsWithLabels> = [];
  const used = new Set<number>();

  for (let i = 0; i < positionsWithLabels.length; i++) {
    if (used.has(i)) continue;

    const row = [positionsWithLabels[i]];
    used.add(i);

    // Find other positions in the same row
    for (let j = i + 1; j < positionsWithLabels.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(positionsWithLabels[j].relY - positionsWithLabels[i].relY) < ROW_TOLERANCE) {
        row.push(positionsWithLabels[j]);
        used.add(j);
      }
    }

    // Sort row by relX (left to right on field)
    row.sort((a, b) => a.relX - b.relX);
    rows.push(row);
  }

  // Generate sub slots, stacking vertically within each row
  const subSlots: SubSlot[] = [];

  // Midline avoidance: nudge slots away from relY = 0.5 for better visibility
  const MIDLINE_Y = 0.5;
  const MIDLINE_BUFFER = 0.03; // Minimum distance from midline
  const MIDLINE_NUDGE = 0.04;  // How far to nudge away

  for (const row of rows) {
    // Calculate center relY for this row
    const centerY = row.reduce((sum, p) => sum + p.relY, 0) / row.length;

    // Stack slots vertically around the center
    const totalHeight = (row.length - 1) * SLOT_SPACING;
    const startY = centerY - totalHeight / 2;

    row.forEach((pos, index) => {
      let slotY = startY + index * SLOT_SPACING;

      // Nudge away from midline if too close
      const distanceFromMidline = Math.abs(slotY - MIDLINE_Y);
      if (distanceFromMidline < MIDLINE_BUFFER) {
        // Nudge up or down depending on which side of midline
        slotY = slotY < MIDLINE_Y
          ? MIDLINE_Y - MIDLINE_NUDGE
          : MIDLINE_Y + MIDLINE_NUDGE;
      }

      subSlots.push({
        relX: SUB_SLOT_X,
        relY: slotY,
        positionLabel: pos.label,
      });
    });
  }

  return subSlots;
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
