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
 *
 * Note: These must be tighter than formation margins.
 * - generateDynamicFormation() can use margins as low as 0.05 for large teams
 * - Sub slots are placed at relX = 0.96
 * - So we use 0.04 (left) and 0.955 (right) to avoid classifying wide formation
 *   positions as sideline subs
 */
const SIDELINE_LEFT = 0.04;
const SIDELINE_RIGHT = 0.955;

/**
 * Horizontal position thresholds
 */
const LEFT_ZONE = 0.33;
const RIGHT_ZONE = 0.67;

/**
 * Vertical position thresholds (relY: 0 = opponent goal, 1 = own goal)
 *
 * Typical formation Y positions for reference:
 * - Defenders: 0.75-0.80
 * - Defensive midfielders: 0.55-0.70
 * - Central midfielders: 0.48-0.55
 * - Attacking midfielders: 0.32-0.48
 * - Attackers: 0.20-0.32
 *
 * Note: Zone boundaries are set to accommodate player movement and
 * positioning variations. A player slightly out of their "ideal" position
 * will still get the correct label.
 *
 * Boundary rule: >= threshold assigns to the higher zone (closer to own goal).
 * Example: relY = 0.55 exactly → DEF_MID zone (CDM), not MID zone (CM).
 */
const GK_ZONE = 0.90;     // Goalkeeper area
const DEF_ZONE = 0.73;    // Defense line starts here (defenders at 0.75+)
const DEF_MID_ZONE = 0.55; // Defensive midfield (DM/CDM) zone starts here
const MID_ZONE = 0.48;    // Central midfield zone starts here
const ATT_MID_ZONE = 0.32; // Attacking midfield (AM/CAM) zone starts here
// Below ATT_MID_ZONE = Attack zone (ST/LW/RW)

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
 * | relY Zone            | Left (relX < 0.33) | Center | Right (relX > 0.67) |
 * |----------------------|-------------------|--------|---------------------|
 * | GK (>=0.90)          | GK                | GK     | GK                  |
 * | DEF (0.73-0.90)      | LB                | CB     | RB                  |
 * | DEF_MID (0.55-0.73)  | LDM               | CDM    | RDM                 |
 * | MID (0.48-0.55)      | LM                | CM     | RM                  |
 * | ATT_MID (0.32-0.48)  | LAM               | CAM    | RAM                 |
 * | ATT (<=0.32)         | LW                | ST     | RW                  |
 * | Sideline             | SUB               | SUB    | SUB                 |
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

  // Defensive midfield zone
  if (relY >= DEF_MID_ZONE) {
    const labels = { left: 'LDM', center: 'CDM', right: 'RDM' };
    return { label: labels[hZone], zone: 'mid' };
  }

  // Central midfield zone
  if (relY >= MID_ZONE) {
    const labels = { left: 'LM', center: 'CM', right: 'RM' };
    return { label: labels[hZone], zone: 'mid' };
  }

  // Attacking midfield zone
  if (relY >= ATT_MID_ZONE) {
    const labels = { left: 'LAM', center: 'CAM', right: 'RAM' };
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
  DEF_MID_ZONE,
  MID_ZONE,
  ATT_MID_ZONE,
} as const;
