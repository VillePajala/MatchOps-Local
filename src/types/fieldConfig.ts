/**
 * Field configuration types for soccer and futsal court visualizations.
 *
 * @remarks
 * These types define the configurable properties for drawing different
 * field types (soccer vs futsal) on the canvas. All measurements are
 * relative (0-1 range) for responsive rendering.
 */

import type { GameType } from './game';

/**
 * Relative position on the field (0-1 range for both axes).
 * Used for default player positions.
 */
export interface RelativePosition {
  relX: number;
  relY: number;
}

/**
 * Penalty area configuration.
 * Soccer uses rectangular penalty boxes, futsal uses arc-shaped areas.
 */
export interface PenaltyAreaConfig {
  /** Shape type: 'rectangle' for soccer, 'arc' for futsal */
  type: 'rectangle' | 'arc';
  /** Width as percentage of field width (0-1) */
  width: number;
  /** Height as percentage of field height (0-1), or radius for arc */
  height: number;
}

/**
 * Goal area (6-yard box) configuration.
 * Soccer has a rectangular goal area, futsal does not have one.
 */
export interface GoalAreaConfig {
  /** Whether the goal area is enabled (futsal has no 6-yard box) */
  enabled: boolean;
  /** Width as percentage of field width (0-1) */
  width: number;
  /** Height as percentage of field height (0-1) */
  height: number;
}

/**
 * Center circle configuration.
 */
export interface CenterCircleConfig {
  /** Radius as percentage of field height (0-1) */
  radius: number;
}

/**
 * Corner arc configuration.
 */
export interface CornerArcConfig {
  /** Radius as percentage of field width (0-1) */
  radius: number;
}

/**
 * Substitution zone configuration (futsal-specific).
 * Futsal has designated substitution zones on the sidelines.
 */
export interface SubstitutionZoneConfig {
  /** Whether substitution zones are enabled */
  enabled: boolean;
  /** Length of each zone as percentage of field height (0-1) */
  length: number;
  /** Distance from halfway line as percentage of field height (0-1) */
  position: number;
}

/**
 * Second penalty spot configuration (futsal-specific).
 * Futsal has a second penalty mark at 10m for accumulated fouls.
 */
export interface SecondPenaltySpotConfig {
  /** Whether the second penalty spot is enabled */
  enabled: boolean;
  /** Distance from goal line as percentage of field height (0-1) */
  distance: number;
}

/**
 * Goal dimensions configuration.
 */
export interface GoalConfig {
  /** Width as percentage of field width (0-1) */
  width: number;
  /** Height in pixels (rendered height of the goal bar) */
  height: number;
}

/**
 * Visual style configuration for the field.
 */
export interface FieldStyleConfig {
  /** Primary field/court color */
  fieldColor: string;
  /** Line color (can include opacity via rgba) */
  lineColor: string;
  /**
   * Line opacity (0-1).
   * @remarks Currently unused - opacity is embedded in lineColor rgba value.
   * @deprecated Use lineColor with rgba() instead. May be removed in future.
   */
  lineOpacity?: number;
  /** Line width in pixels */
  lineWidth: number;
  /** Whether to show grass texture/stripes (soccer) */
  showGrassTexture: boolean;
  /** Number of mowing stripes (soccer only) */
  stripeCount: number;
}

/**
 * Complete field configuration for a game type.
 */
export interface FieldConfig {
  /** Game type this configuration is for */
  gameType: GameType;

  /** Display name for the field type */
  displayName: string;

  /**
   * Aspect ratio (width/height).
   * - Soccer: ~1.5 (105m x 68m)
   * - Futsal: ~2.0 (40m x 20m)
   * @remarks Currently unused - field fills available space.
   * Documents intended proportions for reference.
   */
  aspectRatio?: number;

  /** Penalty area configuration */
  penaltyArea: PenaltyAreaConfig;

  /** Penalty arc configuration (the D outside the penalty box) */
  penaltyArc: {
    /** Whether the penalty arc is enabled */
    enabled: boolean;
    /** Radius multiplier relative to center circle radius */
    radiusMultiplier: number;
  };

  /** Goal area (6-yard box) configuration */
  goalArea: GoalAreaConfig;

  /** Center circle configuration */
  centerCircle: CenterCircleConfig;

  /** Corner arc configuration */
  cornerArc: CornerArcConfig;

  /** Penalty spot distance from goal line as percentage of field height (0-1) */
  penaltySpotDistance: number;

  /** Goal configuration */
  goal: GoalConfig;

  /** Futsal-specific: substitution zones */
  substitutionZone?: SubstitutionZoneConfig;

  /** Futsal-specific: second penalty spot (10m mark) */
  secondPenaltySpot?: SecondPenaltySpotConfig;

  /** Visual style configuration */
  style: FieldStyleConfig;

  /** Default number of players on field */
  defaultPlayerCount: number;

  /**
   * Default player positions for formations.
   * Positions are relative (0-1 range) where:
   * - (0.5, 0) = top center (defending goal)
   * - (0.5, 1) = bottom center (attacking goal)
   */
  defaultPositions: RelativePosition[];
}
