import {
  DISC_RADIUS_RATIO,
  OPP_DISC_SCALE,
  PITCH_LENGTH,
  PITCH_WIDTH,
  type ArrowKind,
  type Concept,
  type ConceptFormat,
  type Point,
} from './types';
import { resolveStep } from './resolveStep';

/**
 * Checks a concept before the engine plays it. Concepts will come from the
 * database (club playbooks), so the input is `unknown` and every reference is
 * checked: ids exist, coordinates are on the pitch, arrows point at real
 * players or points, there is at least one step.
 *
 * Returns every problem found (paths like `steps[2].arrows[0].to`), not just
 * the first, so a content author can fix a concept in one go.
 */
export type ConceptValidation = { ok: true; concept: Concept } | { ok: false; errors: string[] };

const FORMATS: readonly ConceptFormat[] = ['5v5', '8v8', '11v11'];
const ARROW_KINDS: readonly ArrowKind[] = ['pass', 'long', 'run', 'drib', 'press', 'shot'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function validateConcept(input: unknown): ConceptValidation {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);

  if (!isObj(input)) return { ok: false, errors: ['concept: not an object'] };

  if (input.version !== 1) err('version', 'must be 1');
  if (!isText(input.id)) err('id', 'missing');
  if (!isText(input.title)) err('title', 'missing');
  if (!isText(input.phase)) err('phase', 'missing');
  if (!FORMATS.includes(input.format as ConceptFormat)) err('format', `must be one of ${FORMATS.join(', ')}`);
  if (input.question !== undefined && typeof input.question !== 'string') err('question', 'must be text');
  if (input.tags !== undefined && (!Array.isArray(input.tags) || !input.tags.every((t) => typeof t === 'string'))) {
    err('tags', 'must be a list of text');
  }

  const checkPoint = (path: string, v: unknown): boolean => {
    if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0]) || !isNum(v[1])) {
      err(path, 'must be [x, y]');
      return false;
    }
    if (v[0] < 0 || v[0] > PITCH_WIDTH) err(path, `x ${v[0]} is outside 0..${PITCH_WIDTH}`);
    if (v[1] < 0 || v[1] > PITCH_LENGTH) err(path, `y ${v[1]} is outside 0..${PITCH_LENGTH}`);
    return true;
  };
  const inX = (path: string, v: unknown) => {
    if (!isNum(v) || v < 0 || v > PITCH_WIDTH) err(path, `must be a number in 0..${PITCH_WIDTH}`);
  };
  const inY = (path: string, v: unknown) => {
    if (!isNum(v) || v < 0 || v > PITCH_LENGTH) err(path, `must be a number in 0..${PITCH_LENGTH}`);
  };
  const positive = (path: string, v: unknown) => {
    if (!isNum(v) || v <= 0) err(path, 'must be a positive number');
  };

  // Players
  const ids = new Set<string>();
  if (!Array.isArray(input.players) || input.players.length === 0) {
    err('players', 'must be a non-empty list');
  } else {
    input.players.forEach((p, i) => {
      const path = `players[${i}]`;
      if (!isObj(p)) return err(path, 'not an object');
      if (!isText(p.id)) err(`${path}.id`, 'missing');
      else if (ids.has(p.id)) err(`${path}.id`, `duplicate id "${p.id}"`);
      else ids.add(p.id);
      if (p.side !== 'us' && p.side !== 'opp') err(`${path}.side`, "must be 'us' or 'opp'");
      if (p.role !== undefined && typeof p.role !== 'string') err(`${path}.role`, 'must be text');
      checkPoint(`${path}.start`, p.start);
    });
  }

  const checkId = (path: string, v: unknown) => {
    if (typeof v !== 'string') return err(path, 'must be a player id');
    if (!ids.has(v)) err(path, `unknown player "${v}"`);
  };
  const checkEnd = (path: string, v: unknown) => {
    if (typeof v === 'string') checkId(path, v);
    else checkPoint(path, v);
  };

  // Steps
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    err('steps', 'must have at least one step');
  } else {
    input.steps.forEach((s, i) => {
      const path = `steps[${i}]`;
      if (!isObj(s)) return err(path, 'not an object');
      if (!isText(s.title)) err(`${path}.title`, 'missing');
      if (typeof s.text !== 'string') err(`${path}.text`, 'must be text');
      if (s.durationMs !== undefined) positive(`${path}.durationMs`, s.durationMs);
      if (s.cut !== undefined && typeof s.cut !== 'boolean') err(`${path}.cut`, 'must be true or false');

      if (s.positions !== undefined) {
        if (!isObj(s.positions)) err(`${path}.positions`, 'must be an object of id -> [x, y]');
        else {
          for (const [id, pt] of Object.entries(s.positions)) {
            checkId(`${path}.positions.${id}`, id);
            checkPoint(`${path}.positions.${id}`, pt);
          }
        }
      }
      if (s.ball !== undefined) checkEnd(`${path}.ball`, s.ball);

      if (s.highlights !== undefined) {
        if (!Array.isArray(s.highlights)) err(`${path}.highlights`, 'must be a list of player ids');
        else s.highlights.forEach((h, j) => checkId(`${path}.highlights[${j}]`, h));
      }

      if (s.arrows !== undefined) {
        if (!Array.isArray(s.arrows)) err(`${path}.arrows`, 'must be a list');
        else {
          s.arrows.forEach((a, j) => {
            const ap = `${path}.arrows[${j}]`;
            if (!isObj(a)) return err(ap, 'not an object');
            if (!ARROW_KINDS.includes(a.kind as ArrowKind)) err(`${ap}.kind`, `must be one of ${ARROW_KINDS.join(', ')}`);
            checkEnd(`${ap}.from`, a.from);
            checkEnd(`${ap}.to`, a.to);
            if (a.bend !== undefined && (!isNum(a.bend) || a.bend < -1 || a.bend > 1)) {
              err(`${ap}.bend`, 'must be a number in -1..1');
            }
            if (a.label !== undefined && (!isText(a.label) || Array.from(a.label).length > 3)) {
              err(`${ap}.label`, 'must be 1-3 characters');
            }
          });
        }
      }

      if (s.zones !== undefined) {
        if (!Array.isArray(s.zones)) err(`${path}.zones`, 'must be a list');
        else {
          s.zones.forEach((z, j) => {
            const zp = `${path}.zones[${j}]`;
            if (!isObj(z)) return err(zp, 'not an object');
            if (z.label !== undefined && typeof z.label !== 'string') err(`${zp}.label`, 'must be text');
            switch (z.kind) {
              case 'rect':
                inX(`${zp}.x`, z.x);
                inY(`${zp}.y`, z.y);
                positive(`${zp}.w`, z.w);
                positive(`${zp}.h`, z.h);
                if (isNum(z.x) && isNum(z.w) && z.x + z.w > PITCH_WIDTH) err(zp, 'reaches past the touchline');
                if (isNum(z.y) && isNum(z.h) && z.y + z.h > PITCH_LENGTH) err(zp, 'reaches past the goal line');
                break;
              case 'ellipse':
                inX(`${zp}.cx`, z.cx);
                inY(`${zp}.cy`, z.cy);
                positive(`${zp}.rx`, z.rx);
                positive(`${zp}.ry`, z.ry);
                break;
              case 'band':
                inY(`${zp}.y`, z.y);
                if (z.h !== undefined) positive(`${zp}.h`, z.h);
                break;
              case 'poly':
                if (!Array.isArray(z.ids) || z.ids.length < 3) err(`${zp}.ids`, 'needs at least three player ids');
                else z.ids.forEach((id, k) => checkId(`${zp}.ids[${k}]`, id));
                break;
              case 'link':
                if (!Array.isArray(z.ids) || z.ids.length !== 2) err(`${zp}.ids`, 'needs exactly two player ids');
                else z.ids.forEach((id, k) => checkId(`${zp}.ids[${k}]`, id));
                break;
              default:
                err(`${zp}.kind`, "must be 'rect', 'ellipse', 'band', 'poly' or 'link'");
            }
          });
        }
      }
    });
  }

  return errors.length === 0 ? { ok: true, concept: input as unknown as Concept } : { ok: false, errors };
}

/**
 * Disc sizes on the board in concept units, from the same constants the board
 * draws with (DISC_RADIUS_RATIO of the pitch width; an opponent OPP_DISC_SCALE
 * of that). Used to find discs that sit on top of each other.
 */
export const LINT_DISC_RADIUS = {
  us: DISC_RADIUS_RATIO * PITCH_WIDTH,
  opp: DISC_RADIUS_RATIO * OPP_DISC_SCALE * PITCH_WIDTH,
} as const;
/** Discs closer than the sum of their radii plus this gap read as one blob. */
export const LINT_DISC_GAP = 0.3;
/** More arrows than this in one step is hard to follow for a kid. */
export const LINT_MAX_ARROWS = 4;

const PASS_KINDS: readonly ArrowKind[] = ['pass', 'long', 'shot'];

/**
 * Readability warnings for a concept that already passed validateConcept: it
 * plays, but something will look wrong on the board. Warnings, not errors -
 * usePlaybooks never rejects a concept for these; content authors fix them.
 *
 * - two discs overlap (centres closer than the radii + a small gap), checked
 *   when one of the pair moves (or at the first step / a `cut` step);
 * - a disc reaches past the edge of the pitch (it would be clipped);
 * - a step has more than four arrows;
 * - a pass / long ball / shot does not start at the ball holder.
 */
export function lintConcept(concept: Concept): string[] {
  const warnings: string[] = [];
  const side = new Map(concept.players.map((p) => [p.id, p.side]));
  const radius = (id: string) => LINT_DISC_RADIUS[side.get(id) ?? 'us'];
  const ids = concept.players.map((p) => p.id);
  const fmt = (n: number) => n.toFixed(1);

  concept.steps.forEach((step, i) => {
    const resolved = resolveStep(concept, i);
    const pos = resolved.positions;
    const fresh = i === 0 || step.cut === true;
    const moved = new Set(fresh ? ids : Object.keys(step.positions ?? {}));
    const where = (id: string) =>
      fresh && !step.positions?.[id] ? `players[${ids.indexOf(id)}].start` : `steps[${i}].positions.${id}`;

    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const A = ids[a];
        const B = ids[b];
        if (!moved.has(A) && !moved.has(B)) continue;
        const d = Math.hypot(pos[A][0] - pos[B][0], pos[A][1] - pos[B][1]);
        const min = radius(A) + radius(B) + LINT_DISC_GAP;
        if (d < min) {
          warnings.push(`steps[${i}]: "${A}" and "${B}" overlap (${fmt(d)} apart, need ${fmt(min)})`);
        }
      }
    }

    for (const id of moved) {
      const [x, y] = pos[id];
      const rr = radius(id);
      if (x < rr || x > PITCH_WIDTH - rr || y < rr || y > PITCH_LENGTH - rr) {
        warnings.push(`${where(id)}: the disc at [${fmt(x)}, ${fmt(y)}] reaches past the edge of the pitch`);
      }
    }

    const arrows = step.arrows ?? [];
    if (arrows.length > LINT_MAX_ARROWS) {
      warnings.push(`steps[${i}].arrows: ${arrows.length} arrows (more than ${LINT_MAX_ARROWS} is hard to follow)`);
    }
    arrows.forEach((arrow, j) => {
      if (!PASS_KINDS.includes(arrow.kind)) return;
      const ball = resolved.ball;
      const path = `steps[${i}].arrows[${j}].from`;
      if (!ball) {
        warnings.push(`${path}: a ${arrow.kind} but no ball on the pitch`);
        return;
      }
      const startsAtHolder =
        typeof arrow.from === 'string'
          ? arrow.from === ball.holder
          : Math.hypot((arrow.from as Point)[0] - ball.at[0], (arrow.from as Point)[1] - ball.at[1]) <= 1.5;
      if (!startsAtHolder) {
        const holder = ball.holder ? `"${ball.holder}"` : `[${fmt(ball.at[0])}, ${fmt(ball.at[1])}]`;
        warnings.push(`${path}: a ${arrow.kind} that does not start at the ball (${holder})`);
      }
    });
  });

  return warnings;
}
