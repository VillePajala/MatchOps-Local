/**
 * Pelitapa: a playing concept as DATA, played by one engine.
 *
 * Coordinates are pitch-relative, the PEPO board's convention:
 * - x 0..68 across the pitch (left touchline .. right touchline),
 * - y 0..100 along it: 0 = the OPPONENT's goal line (top of the screen),
 *   100 = OUR goal line (bottom).
 * The aspect is not fixed: the view stretches the pitch to the screen, so the
 * numbers describe where a player is relative to the lines, not metres.
 *
 * See docs/03-active-plans/UNIFIED-ROADMAP.md, "Pelitapa library".
 */

export const PITCH_WIDTH = 68;
export const PITCH_LENGTH = 100;

export type Point = [number, number];

export type ConceptFormat = '5v5' | '8v8' | '11v11';

export type ArrowKind = 'pass' | 'long' | 'run' | 'drib' | 'press' | 'shot';

export interface ConceptPlayer {
  /** Unique within the concept; referenced by steps, arrows, zones, highlights. */
  id: string;
  side: 'us' | 'opp';
  /** 'gk' marks the goalkeeper (painted as the match view's keeper disc). */
  role?: string;
  start: Point;
}

/** An arrow end: a player id (follows that player's position in the step) or a point. */
export type ArrowEnd = string | Point;

export interface ConceptArrow {
  kind: ArrowKind;
  from: ArrowEnd;
  to: ArrowEnd;
  /** Sideways bend as a fraction of the arrow's length (-1..1). Long passes default to a curve. */
  bend?: number;
}

export type ConceptZone =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; label?: string }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; label?: string }
  /** A full-width band centred on y (e.g. a line of play). */
  | { kind: 'band'; y: number; h?: number; label?: string }
  /** A shape through the CURRENT positions of these players (e.g. a passing triangle). */
  | { kind: 'poly'; ids: string[]; label?: string };

export interface ConceptStep {
  title: string;
  text: string;
  /** Moves made in this step; positions accumulate across steps. */
  positions?: Record<string, Point>;
  /** Who has the ball (player id) or where it is; carries over when omitted. */
  ball?: string | Point;
  arrows?: ConceptArrow[];
  zones?: ConceptZone[];
  /** Player ids drawn with a highlight ring. */
  highlights?: string[];
  /** How long the moves into this step take (ms). */
  durationMs?: number;
}

export interface Concept {
  id: string;
  title: string;
  /** Phase of play, e.g. 'Hyökkääminen'. Free text (the library filters on it). */
  phase: string;
  format: ConceptFormat;
  players: ConceptPlayer[];
  steps: ConceptStep[];
  /** The "Pohdittavaksi" question for the kids, shown after the last step. */
  question?: string;
  tags?: string[];
  version: 1;
}
