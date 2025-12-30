/**
 * Field configurations for soccer and futsal visualizations.
 *
 * @remarks
 * These configurations define how the field/court is drawn for each game type.
 * All positional values are relative (0-1 range) for responsive rendering.
 *
 * Soccer field dimensions (reference): 105m x 68m (FIFA standard)
 * Futsal court dimensions (reference): 40m x 20m (FIFA standard)
 */

import type { FieldConfig } from '@/types/fieldConfig';
import type { GameType } from '@/types/game';

/**
 * Soccer field configuration.
 *
 * Based on FIFA standard dimensions:
 * - Field: 105m x 68m (aspect ratio ~1.54)
 * - Penalty area: 40.3m x 16.5m
 * - Goal area: 18.3m x 5.5m
 * - Center circle: 9.15m radius
 * - Corner arc: 1m radius
 * - Penalty spot: 11m from goal line
 */
export const SOCCER_FIELD_CONFIG: FieldConfig = {
  gameType: 'soccer',
  displayName: 'Soccer Field',
  aspectRatio: 1.5,

  penaltyArea: {
    type: 'rectangle',
    width: 0.6,      // ~40m on 68m wide field
    height: 0.18,    // ~16.5m on 105m long field (per half)
  },

  penaltyArc: {
    enabled: true,
    radiusMultiplier: 0.8,  // Slightly smaller than center circle
  },

  goalArea: {
    enabled: true,
    width: 0.3,      // ~18m on 68m wide field
    height: 0.07,    // ~5.5m on 105m long field (per half)
  },

  centerCircle: {
    radius: 0.08,    // ~9m on 105m field height
  },

  cornerArc: {
    radius: 0.02,    // ~1m quarter circle
  },

  penaltySpotDistance: 0.12,  // ~11m on 105m field (per half)

  goal: {
    width: 0.15,     // Visual representation
    height: 5,       // Pixels
  },

  // Soccer doesn't have these
  substitutionZone: undefined,
  secondPenaltySpot: undefined,

  style: {
    fieldColor: '#427B44',           // Grass green
    lineColor: 'rgba(255, 255, 255, 0.6)',
    lineOpacity: 0.6,
    lineWidth: 2,
    showGrassTexture: true,
    stripeCount: 9,
  },

  defaultPlayerCount: 11,

  // Default 4-4-2 formation positions (attacking downward)
  // Positions are relative: (0,0) = top-left, (1,1) = bottom-right
  defaultPositions: [
    // Goalkeeper
    { relX: 0.5, relY: 0.08 },
    // Defenders (4)
    { relX: 0.15, relY: 0.25 },
    { relX: 0.38, relY: 0.22 },
    { relX: 0.62, relY: 0.22 },
    { relX: 0.85, relY: 0.25 },
    // Midfielders (4)
    { relX: 0.15, relY: 0.45 },
    { relX: 0.38, relY: 0.42 },
    { relX: 0.62, relY: 0.42 },
    { relX: 0.85, relY: 0.45 },
    // Forwards (2)
    { relX: 0.35, relY: 0.65 },
    { relX: 0.65, relY: 0.65 },
  ],
};

/**
 * Futsal court configuration.
 *
 * Based on FIFA standard dimensions:
 * - Court: 40m x 20m (aspect ratio = 2.0)
 * - Penalty area: 6m radius arc from goal center
 * - No goal area (6-yard box)
 * - Center circle: 3m radius
 * - Corner arc: 25cm radius
 * - First penalty spot: 6m from goal line
 * - Second penalty spot: 10m from goal line
 * - Substitution zones: 5m each, 5m from halfway line
 */
export const FUTSAL_FIELD_CONFIG: FieldConfig = {
  gameType: 'futsal',
  displayName: 'Futsal Court',
  aspectRatio: 2.0,

  penaltyArea: {
    type: 'arc',
    width: 0.3,      // Arc spans ~6m on 20m wide court
    height: 0.15,    // 6m radius on 40m court = 0.15 per half
  },

  penaltyArc: {
    enabled: false,  // Futsal doesn't have the D outside penalty area
    radiusMultiplier: 0,
  },

  goalArea: {
    enabled: false,  // Futsal has no 6-yard box
    width: 0,
    height: 0,
  },

  centerCircle: {
    radius: 0.075,   // 3m on 40m court
  },

  cornerArc: {
    radius: 0.0125,  // 25cm on 20m width
  },

  penaltySpotDistance: 0.15,  // 6m on 40m court (per half)

  goal: {
    width: 0.15,     // 3m goal on 20m court
    height: 5,       // Pixels
  },

  substitutionZone: {
    enabled: true,
    length: 0.125,   // 5m on 40m court
    position: 0.125, // 5m from halfway line
  },

  secondPenaltySpot: {
    enabled: true,
    distance: 0.25,  // 10m on 40m court (per half)
  },

  style: {
    fieldColor: '#3a74a3',           // Indoor court blue (slightly brighter for contrast)
    lineColor: 'rgba(255, 255, 255, 0.78)',
    lineOpacity: 0.7,
    lineWidth: 2,
    showGrassTexture: false,         // Indoor court, no grass
    stripeCount: 0,
  },

  defaultPlayerCount: 5,

  // Default 1-2-2 formation positions
  // Positions are relative: (0,0) = top-left, (1,1) = bottom-right
  defaultPositions: [
    // Goalkeeper
    { relX: 0.5, relY: 0.1 },
    // Defenders (2) - "Fixos"
    { relX: 0.25, relY: 0.35 },
    { relX: 0.75, relY: 0.35 },
    // Forwards (2) - "Alas" / "Pivô"
    { relX: 0.35, relY: 0.6 },
    { relX: 0.65, relY: 0.6 },
  ],
};

/**
 * Map of game types to their field configurations.
 */
export const FIELD_CONFIGS: Record<GameType, FieldConfig> = {
  soccer: SOCCER_FIELD_CONFIG,
  futsal: FUTSAL_FIELD_CONFIG,
};

/**
 * Gets the field configuration for a given game type.
 * Defaults to soccer if game type is undefined.
 *
 * @param gameType - The game type ('soccer' or 'futsal')
 * @returns The corresponding field configuration
 */
export function getFieldConfig(gameType: GameType | undefined): FieldConfig {
  return FIELD_CONFIGS[gameType ?? 'soccer'];
}

/**
 * Alternative futsal court color options for future customization.
 */
export const FUTSAL_COURT_COLORS = {
  blue: '#3d6b99',      // Standard indoor blue
  wooden: '#8b7355',    // Wooden floor
  green: '#2d5a27',     // Green synthetic
  red: '#8b4444',       // Red synthetic
} as const;
