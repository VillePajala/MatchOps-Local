/**
 * Position Label Utility
 *
 * Computes position labels (CB, LW, ST, etc.) dynamically from player coordinates.
 * Used for both field player labels and sideline sub slot labels.
 */

export type PositionZone = 'gk' | 'def' | 'mid' | 'att' | 'sub';

export interface PositionLabelInfo {
  /** Short position label: "CB", "LW", "ST", etc. */
  label: string;
  /** Position zone for grouping */
  zone: PositionZone;
}

/**
 * Sideline boundary thresholds
 * Players beyond these X values are considered on the sideline (sub area)
 */
const SIDELINE_LEFT = 0.08;
const SIDELINE_RIGHT = 0.92;

/**
 * Horizontal position thresholds
 */
const LEFT_ZONE = 0.33;
const RIGHT_ZONE = 0.67;

/**
 * Vertical position thresholds (relY: 0 = opponent goal, 1 = own goal)
 */
const GK_ZONE = 0.90;     // Goalkeeper area
const DEF_ZONE = 0.65;    // Defense line starts here
const MID_ZONE = 0.40;    // Midfield zone starts here
// Below MID_ZONE = Attack zone

/**
 * Check if a position is on the sideline (sub area)
 */
export function isSidelinePosition(relX: number): boolean {
  return relX < SIDELINE_LEFT || relX > SIDELINE_RIGHT;
}

/**
 * Get the horizontal zone (left, center, right) from relX
 */
function getHorizontalZone(relX: number): 'left' | 'center' | 'right' {
  if (relX < LEFT_ZONE) return 'left';
  if (relX > RIGHT_ZONE) return 'right';
  return 'center';
}

/**
 * Get position label from relative coordinates
 *
 * Position mapping:
 * | relY Zone        | Left (relX < 0.33) | Center | Right (relX > 0.67) |
 * |------------------|-------------------|--------|---------------------|
 * | GK (>=0.90)      | GK                | GK     | GK                  |
 * | DEF (0.65-0.90)  | LB                | CB     | RB                  |
 * | MID (0.40-0.65)  | LM                | CM     | RM                  |
 * | ATT (<=0.40)     | LW                | ST     | RW                  |
 * | Sideline         | SUB               | SUB    | SUB                 |
 */
export function getPositionLabel(relX: number, relY: number): PositionLabelInfo {
  // Sideline players are substitutes
  if (isSidelinePosition(relX)) {
    return { label: 'SUB', zone: 'sub' };
  }

  const hZone = getHorizontalZone(relX);

  // Goalkeeper zone
  if (relY >= GK_ZONE) {
    return { label: 'GK', zone: 'gk' };
  }

  // Defensive zone
  if (relY >= DEF_ZONE) {
    const labels = { left: 'LB', center: 'CB', right: 'RB' };
    return { label: labels[hZone], zone: 'def' };
  }

  // Midfield zone
  if (relY >= MID_ZONE) {
    const labels = { left: 'LM', center: 'CM', right: 'RM' };
    return { label: labels[hZone], zone: 'mid' };
  }

  // Attack zone
  const labels = { left: 'LW', center: 'ST', right: 'RW' };
  return { label: labels[hZone], zone: 'att' };
}

/**
 * Get position label for a specific formation position
 * Used to generate labels for sideline sub slots
 */
export function getPositionLabelForFormationPosition(
  relX: number,
  relY: number
): PositionLabelInfo {
  // Formation positions are always on-field, so use direct mapping
  return getPositionLabel(
    // Clamp to field area to avoid 'SUB' label
    Math.max(SIDELINE_LEFT + 0.01, Math.min(SIDELINE_RIGHT - 0.01, relX)),
    relY
  );
}

/**
 * Export thresholds for use in other modules
 */
export const POSITION_THRESHOLDS = {
  SIDELINE_LEFT,
  SIDELINE_RIGHT,
  LEFT_ZONE,
  RIGHT_ZONE,
  GK_ZONE,
  DEF_ZONE,
  MID_ZONE,
} as const;
