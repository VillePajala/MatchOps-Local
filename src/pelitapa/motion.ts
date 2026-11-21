import { resolveStep } from './resolveStep';
import type { ArrowKind, Concept, Point } from './types';

/**
 * How the players and the ball travel from one step to the next.
 *
 * A step's arrows announce the move into the NEXT step (they resolve against
 * the positions at their own step, see resolveStep). So when the presentation
 * goes from step i to i + 1, a run arrow of step i from player P whose end is
 * where P stands in step i + 1 IS P's path: P follows its curve instead of
 * gliding in a straight line across players the arrow goes round. Going back
 * from i + 1 to i retraces the same curve. The ball follows the pass arrow of
 * step i the same way (curved for a long ball), or its holder's path when the
 * holder carries it.
 *
 * Everything here is pure and in concept units; the board maps the points to
 * pixels. Bezier curves survive that (affine) mapping, so a curve planned here
 * and the arrow drawn on the board are the same curve.
 */

/** A move from `from` to `to`; `bend` as an arrow's (0 = straight). */
export interface MovePath {
  from: Point;
  to: Point;
  bend: number;
}

export interface BallMove extends MovePath {
  /** The ball sits at its holder's feet: the board offsets it by the holder's disc size. */
  fromHolder?: string;
  toHolder?: string;
}

export interface StepMotion {
  /** Only the players that move. */
  players: Record<string, MovePath>;
  ball: BallMove | null;
  durationMs: number;
}

/** An arrow end within this distance of a player's new place is that player's path. */
export const PATH_MATCH_TOLERANCE = 1.5;
/** Move duration when the step does not set one: base + per unit of the longest move, clamped. */
export const MIN_MOVE_MS = 700;
export const MAX_MOVE_MS = 2200;
export const MOVE_MS_PER_UNIT = 25;

const RUN_KINDS: readonly ArrowKind[] = ['run', 'drib'];
const BALL_KINDS: readonly ArrowKind[] = ['pass', 'long', 'shot', 'drib'];

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (a: Point, b: Point) => dist(a, b) <= PATH_MATCH_TOLERANCE;

/**
 * The control point of a bent arrow's quadratic curve: off the chord's middle,
 * sideways by `bend` x the chord's length. The board draws arrows with this
 * and moves players with it, so the two always coincide. Any coordinate space.
 */
export function bendControl(from: Point, to: Point, bend: number): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return [(from[0] + to[0]) / 2 - bend * dy, (from[1] + to[1]) / 2 + bend * dx];
}

/** The point at t (0..1) on the quadratic curve from p0 via control c to p1. */
export function quadPoint(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
}

/** The point at t along a move: on the bent curve, or the straight line. */
export function pointOnPath(path: MovePath, t: number): Point {
  if (path.bend === 0) {
    return [path.from[0] + (path.to[0] - path.from[0]) * t, path.from[1] + (path.to[1] - path.from[1]) * t];
  }
  return quadPoint(path.from, bendControl(path.from, path.to, path.bend), path.to, t);
}

/** Length of a move (a curve measured in short straight pieces). */
export function pathLength(path: MovePath): number {
  if (path.bend === 0) return dist(path.from, path.to);
  let len = 0;
  let prev = path.from;
  for (let i = 1; i <= 16; i++) {
    const p = pointOnPath(path, i / 16);
    len += dist(prev, p);
    prev = p;
  }
  return len;
}

/**
 * The board's easing, cubic-bezier(.4, 0, .2, 1) (Material "standard"): the
 * same curve the moves had as a CSS transition.
 */
export function easeStandard(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x1 = 0.4;
  const x2 = 0.2;
  const bx = (s: number) => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
  const dbx = (s: number) => 3 * x1 * (1 - s) ** 2 + 6 * (x2 - x1) * s * (1 - s) + 3 * (1 - x2) * s * s;
  // Solve bx(s) = t (Newton, then bisection if the slope is flat), return by(s).
  let s = t;
  for (let i = 0; i < 8; i++) {
    const err = bx(s) - t;
    if (Math.abs(err) < 1e-6) break;
    const d = dbx(s);
    if (Math.abs(d) < 1e-6) break;
    s -= err / d;
  }
  if (s < 0 || s > 1 || Math.abs(bx(s) - t) > 1e-4) {
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 30; i++) {
      if (bx(s) < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
  }
  const y1 = 0;
  const y2 = 1;
  return 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
}

/** The step's own duration wins; otherwise long moves get more time than short ones. */
export function moveDuration(explicitMs: number | undefined, longestMove: number): number {
  if (explicitMs !== undefined) return explicitMs;
  return Math.round(Math.min(MAX_MOVE_MS, Math.max(MIN_MOVE_MS, MIN_MOVE_MS + longestMove * MOVE_MS_PER_UNIT)));
}

/**
 * The moves from step `from` to step `to`. Between neighbouring steps the
 * moves follow the arrows of the earlier step; a longer jump (a step dot)
 * moves everyone straight.
 */
export function planMotion(concept: Concept, from: number, to: number): StepMotion {
  const a = resolveStep(concept, from);
  const b = resolveStep(concept, to);
  const forward = b.index > a.index;
  const adjacent = Math.abs(b.index - a.index) === 1;
  // The arrows that describe this transition, at the earlier step's positions.
  const arrows = adjacent ? resolveStep(concept, Math.min(a.index, b.index)).arrows : [];

  const players: Record<string, MovePath> = {};
  for (const id of Object.keys(b.positions)) {
    const p0 = a.positions[id];
    const p1 = b.positions[id];
    if (!p0 || dist(p0, p1) < 0.01) continue;
    // The arrow starts where P stands at the earlier step and ends where P stands at the later one.
    const [early, late] = forward ? [p0, p1] : [p1, p0];
    const arrow = arrows.find(
      (ar) => RUN_KINDS.includes(ar.kind) && ar.fromId === id && near(ar.from, early) && near(ar.to, late),
    );
    // A dribble is drawn as a zigzag along a straight line: the player goes straight.
    const bend = arrow && arrow.kind === 'run' ? (forward ? arrow.bend : -arrow.bend) : 0;
    players[id] = { from: p0, to: p1, bend };
  }

  let ball: BallMove | null = null;
  if (a.ball && b.ball && (!near(a.ball.at, b.ball.at) || a.ball.holder !== b.ball.holder)) {
    const holders = { fromHolder: a.ball.holder, toHolder: b.ball.holder };
    let bend = 0;
    const carrier = a.ball.holder && a.ball.holder === b.ball.holder ? players[a.ball.holder] : undefined;
    if (carrier) {
      bend = carrier.bend;
    } else if (adjacent) {
      const [early, late] = forward ? [a.ball, b.ball] : [b.ball, a.ball];
      const pass = arrows.find(
        (ar) =>
          BALL_KINDS.includes(ar.kind) &&
          ((early.holder !== undefined && ar.fromId === early.holder) || near(ar.from, early.at)) &&
          ((late.holder !== undefined && ar.toId === late.holder) || near(ar.to, late.at)),
      );
      if (pass && pass.kind !== 'drib') bend = forward ? pass.bend : -pass.bend;
    }
    ball = { from: a.ball.at, to: b.ball.at, bend, ...holders };
  }

  const longest = Math.max(0, ...Object.values(players).map(pathLength), ball ? pathLength(ball) : 0);
  return { players, ball, durationMs: moveDuration(b.step.durationMs, longest) };
}
