import React from 'react';
import { render } from '@testing-library/react';
import {
  bendControl,
  easeStandard,
  MAX_MOVE_MS,
  MIN_MOVE_MS,
  MOVE_MS_PER_UNIT,
  moveDuration,
  planMotion,
  pointOnPath,
  quadPoint,
} from '../motion';
import { resolveStep } from '../resolveStep';
import PelitapaPitch from '../PelitapaPitch';
import { PITCH_LENGTH, PITCH_WIDTH, type Concept, type Point } from '../types';

/** a runs round x on a curve; the ball goes with a long ball to b, then a carries it. */
const concept = (): Concept => ({
  id: 'm1',
  title: 'Motion',
  phase: 'Hyökkääminen',
  format: '5v5',
  version: 1,
  players: [
    { id: 'gk', side: 'us', role: 'gk', start: [34, 95] },
    { id: 'a', side: 'us', start: [20, 70] },
    { id: 'b', side: 'us', start: [48, 70] },
    { id: 'x', side: 'opp', start: [26, 55] },
  ],
  steps: [
    {
      title: 'One',
      text: '',
      ball: 'gk',
      arrows: [
        { kind: 'run', from: 'a', to: [20, 40], bend: 0.3 },
        { kind: 'long', from: 'gk', to: 'b' },
      ],
    },
    { title: 'Two', text: '', positions: { a: [20, 40] }, ball: 'b', arrows: [{ kind: 'pass', from: 'b', to: 'a' }] },
    { title: 'Three', text: '', ball: 'a', arrows: [{ kind: 'drib', from: 'a', to: [20, 20] }] },
    { title: 'Four', text: '', positions: { a: [20, 20] } },
  ],
});

const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);

describe('bendControl / easeStandard', () => {
  it('bends to the same side whichever way the chord is walked with the bend negated', () => {
    const p: Point = [0, 0];
    const q: Point = [0, 10];
    expect(bendControl(p, q, 0.3)).toEqual([-3, 5]);
    expect(bendControl(q, p, -0.3)).toEqual([-3, 5]);
    expect(bendControl(p, q, 0)).toEqual([0, 5]);
  });

  it('eases from 0 to 1, monotonic, slow-out fast-in like cubic-bezier(.4,0,.2,1)', () => {
    expect(easeStandard(0)).toBe(0);
    expect(easeStandard(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const v = easeStandard(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Past halfway at half time (decelerating curve), but not done.
    expect(easeStandard(0.5)).toBeGreaterThan(0.6);
    expect(easeStandard(0.5)).toBeLessThan(0.9);
  });
});

describe('planMotion', () => {
  /** @critical a player follows the arrow's curve, not a straight line across the board */
  it('a run arrow that ends where the player goes is the player\'s path (its bend)', () => {
    const m = planMotion(concept(), 0, 1);
    expect(m.players.a).toEqual({ from: [20, 70], to: [20, 40], bend: 0.3 });
    // Mid-way the player is off the straight line, on the arrow's side.
    const mid = pointOnPath(m.players.a, 0.5);
    expect(mid[0]).toBeCloseTo(20 + 0.3 * 30 / 2, 5);
    expect(Object.keys(m.players)).toEqual(['a']);
  });

  it('going back retraces the same curve', () => {
    const fwd = planMotion(concept(), 0, 1).players.a;
    const back = planMotion(concept(), 1, 0).players.a;
    expect(back.from).toEqual(fwd.to);
    expect(back.to).toEqual(fwd.from);
    for (const t of [0.25, 0.5, 0.75]) {
      const a = pointOnPath(fwd, t);
      const b = pointOnPath(back, 1 - t);
      expect(a[0]).toBeCloseTo(b[0], 6);
      expect(a[1]).toBeCloseTo(b[1], 6);
    }
  });

  it('the ball follows a long ball\'s curve, and its carrier\'s path; a dribble goes straight', () => {
    const pass = planMotion(concept(), 0, 1).ball;
    expect(pass).toMatchObject({ from: [34, 95], to: [48, 70], bend: 0.18, fromHolder: 'gk', toHolder: 'b' });
    const carried = planMotion(concept(), 2, 3);
    expect(carried.players.a.bend).toBe(0);
    expect(carried.ball).toMatchObject({ from: [20, 40], to: [20, 20], bend: 0, fromHolder: 'a', toHolder: 'a' });
  });

  it('moves straight when the arrow does not end where the player goes, or over a jump of several steps', () => {
    const c = concept();
    c.steps[1].positions = { a: [30, 40] }; // not where the arrow points
    expect(planMotion(c, 0, 1).players.a.bend).toBe(0);
    expect(planMotion(concept(), 0, 3).players.a.bend).toBe(0);
  });

  it('nothing moves between a step and itself', () => {
    expect(planMotion(concept(), 2, 2)).toEqual({ players: {}, ball: null, durationMs: MIN_MOVE_MS });
  });

  /** Long runs are not rushed; an explicit duration wins. */
  it('scales the duration with the longest move, clamped; the step\'s own durationMs wins', () => {
    expect(moveDuration(undefined, 0)).toBe(MIN_MOVE_MS);
    expect(moveDuration(undefined, 20)).toBe(MIN_MOVE_MS + 20 * MOVE_MS_PER_UNIT);
    expect(moveDuration(undefined, 500)).toBe(MAX_MOVE_MS);
    expect(moveDuration(1500, 500)).toBe(1500);

    const short = planMotion(concept(), 2, 3).durationMs; // 20 units
    const long = planMotion(concept(), 0, 1).durationMs; // a curved 30-unit run, the long ball ~29
    expect(long).toBeGreaterThan(short);
    expect(short).toBe(MIN_MOVE_MS + 20 * MOVE_MS_PER_UNIT);

    const c = concept();
    c.steps[1].durationMs = 2500;
    expect(planMotion(c, 0, 1).durationMs).toBe(2500);
  });
});

describe('PelitapaPitch motion', () => {
  const W = 340;
  const H = 500;
  const px = (p: Point): Point => [(p[0] / PITCH_WIDTH) * W, (p[1] / PITCH_LENGTH) * H];
  const translateOf = (el: Element): Point => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec((el as HTMLElement).style.transform);
    if (!m) throw new Error(`no translate in "${(el as HTMLElement).style.transform}"`);
    return [Number(m[1]), Number(m[2])];
  };

  let frames: FrameRequestCallback[];
  let rafSpy: jest.SpyInstance;
  let cafSpy: jest.SpyInstance;
  const runFrame = (now: number) => {
    const due = frames;
    frames = [];
    due.forEach((cb) => cb(now));
  };
  const setReducedMotion = (reduce: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }),
    });
  };

  beforeEach(() => {
    frames = [];
    rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    cafSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      frames = [];
    });
    setReducedMotion(false);
  });
  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  const board = (step: number, motion: ReturnType<typeof planMotion> | null) => (
    <PelitapaPitch width={W} height={H} players={concept().players} resolved={resolveStep(concept(), step)} labels={{}} motion={motion} />
  );

  /** @critical the disc travels along the run arrow's curve, eased, in sync with the plan */
  it('moves a disc along the curve at mid-animation, and lands on its place', () => {
    const { rerender, container } = render(board(0, null));
    const motion = planMotion(concept(), 0, 1);
    rerender(board(1, motion));
    const disc = container.querySelector('[data-player="a"]') as Element;

    // Before the first frame it is still where it started.
    expect(dist(translateOf(disc), px([20, 70]))).toBeLessThan(0.2);

    runFrame(1000);
    runFrame(1000 + motion.durationMs / 2);
    const p0 = px([20, 70]);
    const p1 = px([20, 40]);
    const expected = quadPoint(p0, bendControl(p0, p1, 0.3), p1, easeStandard(0.5));
    const at = translateOf(disc);
    expect(dist(at, expected)).toBeLessThan(0.2);
    // Clearly off the straight line between the two places (x stays 20 on it).
    expect(at[0] - p0[0]).toBeGreaterThan(10);

    runFrame(1000 + motion.durationMs + 16);
    expect(dist(translateOf(disc), p1)).toBeLessThan(0.2);
    expect(frames).toHaveLength(0);
  });

  it('the run arrow is drawn on the same curve the disc follows', () => {
    const { container } = render(board(0, null));
    const run = container.querySelector('[data-arrow-kind="run"] path[stroke="#ffd27a"]') as SVGPathElement;
    const m = /M([\d.]+) ([\d.]+) Q([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/.exec(run.getAttribute('d') ?? '');
    expect(m).not.toBeNull();
    const [sx, sy, , , ex, ey] = (m as RegExpExecArray).slice(1).map(Number);
    const p0 = px([20, 70]);
    const p1 = px([20, 40]);
    const c = bendControl(p0, p1, 0.3);
    // Both drawn ends lie on the disc's path.
    const closest = (pt: Point) =>
      Math.min(...Array.from({ length: 201 }, (_, i) => dist(quadPoint(p0, c, p1, i / 200), pt)));
    expect(closest([sx, sy])).toBeLessThan(0.6);
    expect(closest([ex, ey])).toBeLessThan(0.6);
  });

  it('the ball follows the long ball\'s curve', () => {
    const { rerender, container } = render(board(0, null));
    const motion = planMotion(concept(), 0, 1);
    rerender(board(1, motion));
    runFrame(0);
    runFrame(motion.durationMs / 2);
    const ball = translateOf(container.querySelector('[data-testid="pelitapa-ball"]') as Element);
    // The straight line from the keeper to b would be the chord; the curve is off it.
    const a = px([34, 95]);
    const b = px([48, 70]);
    const cross = Math.abs((b[0] - a[0]) * (ball[1] - a[1]) - (b[1] - a[1]) * (ball[0] - a[0])) / dist(a, b);
    expect(cross).toBeGreaterThan(5);
  });

  it('prefers-reduced-motion: the disc is at its place at once, no frames', () => {
    setReducedMotion(true);
    const { rerender, container } = render(board(0, null));
    rerender(board(1, planMotion(concept(), 0, 1)));
    expect(dist(translateOf(container.querySelector('[data-player="a"]') as Element), px([20, 40]))).toBeLessThan(0.2);
    expect(frames).toHaveLength(0);
  });

  it('a jump (no motion, e.g. a cut step) ends a move in flight at once', () => {
    const { rerender, container } = render(board(0, null));
    rerender(board(1, planMotion(concept(), 0, 1)));
    runFrame(0);
    runFrame(300);
    rerender(board(0, null));
    expect(dist(translateOf(container.querySelector('[data-player="a"]') as Element), px([20, 70]))).toBeLessThan(0.2);
    expect(frames).toHaveLength(0);
  });
});
