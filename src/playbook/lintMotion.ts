import { planMotion, pointOnPath, type MovePath } from './motion';
import { resolveStep } from './resolveStep';
import { LINT_DISC_RADIUS } from './validateConcept';
import type { Concept, Point } from './types';

/**
 * Stricter, motion-aware readability checks for content we author ourselves
 * (the built-in collections). lintConcept looks at each step's still picture;
 * this looks at what happens BETWEEN the pictures and at the arrows on them:
 *
 * - two discs run through each other on the way to the next step;
 * - a pass along the ground travels through a player who is neither the
 *   passer nor the receiver;
 * - an arrow is drawn across the disc of a player it has nothing to do with.
 *
 * Long balls are in the air, so they may cross players. A `cut` step is a
 * jump, not a move, so nothing travels into it.
 *
 * Only tests import this (playbookContent.test.ts): it is not part of the
 * app bundle and usePlaybooks never rejects a concept for these.
 */

/** Moving discs closer than this share of their radii sum read as running through each other. */
export const MOTION_OVERLAP_SHARE = 0.8;
/** A ground pass or an arrow this close to a bystander's disc edge reads as going through it. */
export const PATH_CLEARANCE = 0.3;
const SAMPLES = 24;

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const fmt = (n: number) => n.toFixed(1);

export function lintConceptMotion(concept: Concept): string[] {
  const warnings: string[] = [];
  const side = new Map(concept.players.map((p) => [p.id, p.side]));
  const radius = (id: string) => LINT_DISC_RADIUS[side.get(id) ?? 'us'];
  const ids = concept.players.map((p) => p.id);

  concept.steps.forEach((step, i) => {
    const here = resolveStep(concept, i);

    // Arrows on this step's picture must not cross a bystander's disc.
    here.arrows.forEach((arrow, j) => {
      if (arrow.kind === 'long') return;
      const path: MovePath = { from: arrow.from, to: arrow.to, bend: arrow.bend };
      for (const id of ids) {
        if (id === arrow.fromId || id === arrow.toId) continue;
        const at = here.positions[id];
        // A player standing at a point end (e.g. the spot a pass is cut out at) belongs to the arrow.
        if (dist(at, arrow.from) < radius(id) || dist(at, arrow.to) < radius(id)) continue;
        let closest = Infinity;
        for (let k = 0; k <= SAMPLES; k++) closest = Math.min(closest, dist(pointOnPath(path, k / SAMPLES), at));
        if (closest < radius(id) + PATH_CLEARANCE) {
          warnings.push(`steps[${i}].arrows[${j}]: the ${arrow.kind} arrow crosses "${id}" (${fmt(closest)} from its centre)`);
        }
      }
    });

    // The move into the next step.
    const next = concept.steps[i + 1];
    if (!next || next.cut) return;
    const motion = planMotion(concept, i, i + 1);
    const at = (id: string, t: number): Point =>
      motion.players[id] ? pointOnPath(motion.players[id], t) : here.positions[id];

    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const A = ids[a];
        const B = ids[b];
        if (!motion.players[A] && !motion.players[B]) continue;
        const min = (radius(A) + radius(B)) * MOTION_OVERLAP_SHARE;
        let closest = Infinity;
        for (let k = 0; k <= SAMPLES; k++) closest = Math.min(closest, dist(at(A, k / SAMPLES), at(B, k / SAMPLES)));
        if (closest < min) {
          warnings.push(`steps[${i}] -> steps[${i + 1}]: "${A}" and "${B}" run through each other (${fmt(closest)} apart, need ${fmt(min)})`);
        }
      }
    }

    const ball = motion.ball;
    const carried = ball && ball.fromHolder !== undefined && ball.fromHolder === ball.toHolder;
    const lofted = here.arrows.some((ar) => ar.kind === 'long' && (ar.fromId === ball?.fromHolder || dist(ar.from, ball?.from ?? ar.from) < 1.5));
    if (ball && !carried && !lofted) {
      for (const id of ids) {
        if (id === ball.fromHolder || id === ball.toHolder) continue;
        let closest = Infinity;
        for (let k = 0; k <= SAMPLES; k++) {
          const t = k / SAMPLES;
          closest = Math.min(closest, dist(pointOnPath(ball, t), at(id, t)));
        }
        if (closest < radius(id) + PATH_CLEARANCE) {
          warnings.push(`steps[${i}] -> steps[${i + 1}]: the ball travels through "${id}" (${fmt(closest)} from its centre)`);
        }
      }
    }
  });

  return warnings;
}
