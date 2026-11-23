import { lintConcept, validateConcept } from '../validateConcept';
import { crossesCut, resolveStep } from '../resolveStep';
import { assignPlayers, discName } from '../assignNames';
import { DEMO_CONCEPT } from './demoConcept.fixture';
import type { Concept } from '../types';
import type { Player } from '@/types';

/** A small valid concept; tests break one thing at a time. */
const base = (): Concept => ({
  id: 'c1',
  title: 'Test',
  phase: 'Hyökkääminen',
  format: '5v5',
  version: 1,
  players: [
    { id: 'gk', side: 'us', role: 'gk', start: [34, 95] },
    { id: 'a', side: 'us', start: [20, 70] },
    { id: 'b', side: 'us', start: [48, 70] },
    { id: 'x', side: 'opp', start: [34, 40] },
  ],
  steps: [
    { title: 'One', text: 'First', ball: 'gk', arrows: [{ kind: 'pass', from: 'gk', to: 'a' }] },
    { title: 'Two', text: 'Second', positions: { a: [18, 60] }, highlights: ['a'] },
    { title: 'Three', text: 'Third', positions: { b: [50, 55] }, ball: [30, 50] },
  ],
});

describe('validateConcept', () => {
  it('accepts a valid concept and the demo fixture', () => {
    expect(validateConcept(base())).toEqual({ ok: true, concept: base() });
    const demo = validateConcept(DEMO_CONCEPT);
    expect(demo.ok ? [] : demo.errors).toEqual([]);
  });

  it('the demo is an 8v8 with eight players a side and a question', () => {
    expect(DEMO_CONCEPT.format).toBe('8v8');
    expect(DEMO_CONCEPT.players.filter((p) => p.side === 'us')).toHaveLength(8);
    expect(DEMO_CONCEPT.players.filter((p) => p.side === 'opp')).toHaveLength(8);
    expect(DEMO_CONCEPT.steps.length).toBeGreaterThanOrEqual(4);
    expect(DEMO_CONCEPT.question).toBeTruthy();
  });

  const errorsOf = (value: unknown): string[] => {
    const r = validateConcept(value);
    return r.ok ? [] : r.errors;
  };

  it('rejects non-objects and missing basics', () => {
    expect(errorsOf(null)).toEqual(['concept: not an object']);
    const c = { ...base(), version: 2, title: '', format: '7v7' };
    expect(errorsOf(c)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^version/), expect.stringMatching(/^title/), expect.stringMatching(/^format/)]),
    );
  });

  it('needs at least one step', () => {
    expect(errorsOf({ ...base(), steps: [] })).toEqual(['steps: must have at least one step']);
  });

  it('rejects duplicate player ids and coordinates off the pitch', () => {
    const c = base();
    c.players.push({ id: 'a', side: 'opp', start: [70, 50] });
    c.players.push({ id: 'z', side: 'opp', start: [10, -1] });
    expect(errorsOf(c)).toEqual([
      'players[4].id: duplicate id "a"',
      'players[4].start: x 70 is outside 0..68',
      'players[5].start: y -1 is outside 0..100',
    ]);
  });

  it('arrows, ball, positions and highlights must reference real players or points', () => {
    const c = base();
    c.steps[0].arrows = [{ kind: 'pass', from: 'gk', to: 'nobody' }];
    c.steps[0].ball = 'ghost';
    c.steps[1].positions = { who: [1, 1] };
    c.steps[1].highlights = ['nope'];
    c.steps[2].arrows = [{ kind: 'run', from: 'a', to: [99, 10] }];
    expect(errorsOf(c)).toEqual([
      'steps[0].ball: unknown player "ghost"',
      'steps[0].arrows[0].to: unknown player "nobody"',
      'steps[1].positions.who: unknown player "who"',
      'steps[1].highlights[0]: unknown player "nope"',
      'steps[2].arrows[0].to: x 99 is outside 0..68',
    ]);
  });

  it('rejects an unknown arrow kind and an out-of-range bend', () => {
    const c = base();
    c.steps[0].arrows = [{ kind: 'teleport' as 'pass', from: 'gk', to: 'a', bend: 3 }];
    expect(errorsOf(c)).toEqual([
      'steps[0].arrows[0].kind: must be one of pass, long, run, drib, press, shot',
      'steps[0].arrows[0].bend: must be a number in -1..1',
    ]);
  });

  it('checks zones: rect inside the pitch, poly ids real and at least three', () => {
    const c = base();
    c.steps[0].zones = [
      { kind: 'rect', x: 60, y: 10, w: 20, h: 5 },
      { kind: 'poly', ids: ['a', 'b'] },
      { kind: 'poly', ids: ['a', 'b', 'q'] },
      { kind: 'ellipse', cx: 34, cy: 50, rx: 5, ry: 4 },
      { kind: 'band', y: 50 },
    ];
    expect(errorsOf(c)).toEqual([
      'steps[0].zones[0]: reaches past the touchline',
      'steps[0].zones[1].ids: needs at least three player ids',
      'steps[0].zones[2].ids[2]: unknown player "q"',
    ]);
  });
});

describe('validateConcept: links, arrow labels, cuts', () => {
  it('accepts a link zone, a short arrow label and a cut step', () => {
    const c = base();
    c.steps[1] = {
      ...c.steps[1],
      cut: true,
      zones: [{ kind: 'link', ids: ['a', 'b'], label: 'Pari' }],
      arrows: [{ kind: 'pass', from: 'a', to: 'b', label: '2' }],
    };
    const v = validateConcept(c);
    expect(v.ok ? [] : v.errors).toEqual([]);
  });

  it('rejects a link without exactly two real players, a long label and a non-boolean cut', () => {
    const c = base() as unknown as { steps: Array<Record<string, unknown>> };
    c.steps[1].zones = [{ kind: 'link', ids: ['a'] }, { kind: 'link', ids: ['a', 'nobody'] }];
    c.steps[1].arrows = [{ kind: 'pass', from: 'a', to: 'b', label: 'four' }, { kind: 'run', from: 'a', to: 'b', label: '' }];
    c.steps[1].cut = 'yes';
    const v = validateConcept(c);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors).toEqual(
      expect.arrayContaining([
        'steps[1].zones[0].ids: needs exactly two player ids',
        'steps[1].zones[1].ids[1]: unknown player "nobody"',
        'steps[1].arrows[0].label: must be 1-3 characters',
        'steps[1].arrows[1].label: must be 1-3 characters',
        'steps[1].cut: must be true or false',
      ]),
    );
  });
});

describe('resolveStep', () => {
  it('link zones follow the two players; arrow labels carry through', () => {
    const c = base();
    c.steps[1] = {
      ...c.steps[1],
      zones: [{ kind: 'link', ids: ['a', 'gk'] }],
      arrows: [{ kind: 'run', from: 'a', to: [10, 50], label: '1' }],
    };
    const r = resolveStep(c, 1);
    expect(r.zones[0]).toEqual({ kind: 'link', points: [[18, 60], [34, 95]], label: undefined });
    expect(r.arrows[0].label).toBe('1');
    expect(resolveStep(base(), 0).arrows[0]).not.toHaveProperty('label');
  });

  it('crossesCut: only a move over a cut step jumps, in either direction', () => {
    const c = base();
    c.steps[2] = { ...c.steps[2], cut: true };
    expect(crossesCut(c, 0, 1)).toBe(false);
    expect(crossesCut(c, 1, 2)).toBe(true);
    expect(crossesCut(c, 2, 1)).toBe(true);
    expect(crossesCut(c, 0, 2)).toBe(true);
    expect(crossesCut(c, 2, 2)).toBe(false);
    expect(crossesCut(base(), 0, 2)).toBe(false);
  });


  it('step 0: start positions, the ball on its holder, arrows resolved to points', () => {
    const r = resolveStep(base(), 0);
    expect(r.positions.a).toEqual([20, 70]);
    expect(r.ball).toEqual({ at: [34, 95], holder: 'gk' });
    expect(r.arrows).toEqual([{ kind: 'pass', from: [34, 95], to: [20, 70], bend: 0, fromId: 'gk', toId: 'a' }]);
    expect(r.isFirst).toBe(true);
    expect(r.isLast).toBe(false);
  });

  it('moves accumulate step by step; the ball carries over until it changes', () => {
    const one = resolveStep(base(), 1);
    expect(one.positions.a).toEqual([18, 60]);
    expect(one.positions.b).toEqual([48, 70]);
    expect(one.ball).toEqual({ at: [34, 95], holder: 'gk' });
    expect(one.highlights).toEqual(['a']);
    expect(one.arrows).toEqual([]);

    const two = resolveStep(base(), 2);
    expect(two.positions.a).toEqual([18, 60]); // kept from step 1
    expect(two.positions.b).toEqual([50, 55]);
    expect(two.ball).toEqual({ at: [30, 50] });
    expect(two.isLast).toBe(true);
  });

  it('a ball on a player follows the player when they move', () => {
    const c = base();
    c.steps[1].ball = 'a';
    expect(resolveStep(c, 1).ball).toEqual({ at: [18, 60], holder: 'a' });
  });

  it('clamps the index', () => {
    expect(resolveStep(base(), -3).index).toBe(0);
    expect(resolveStep(base(), 99).index).toBe(2);
  });

  it('long passes curve by default; poly zones resolve to current positions', () => {
    const c = base();
    c.steps[1].arrows = [{ kind: 'long', from: 'gk', to: 'b' }];
    c.steps[1].zones = [{ kind: 'poly', ids: ['gk', 'a', 'b'] }];
    const r = resolveStep(c, 1);
    expect(r.arrows[0].bend).toBeGreaterThan(0);
    expect(r.zones[0]).toEqual({ kind: 'poly', points: [[34, 95], [18, 60], [48, 70]], label: undefined });
  });

  it('does not mutate the concept', () => {
    const c = base();
    const copy = JSON.parse(JSON.stringify(c));
    resolveStep(c, 2);
    expect(c).toEqual(copy);
  });
});

describe('assignPlayers', () => {
  const p = (id: string, extra: Partial<Player> = {}): Player => ({ id, name: `${id} Surname`, ...extra });

  it('without a formation: roster order, a roster keeper on the keeper disc', () => {
    const roster = [p('r1'), p('r2', { isGoalie: true }), p('r3'), p('r4')];
    expect(assignPlayers(base(), roster)).toEqual({ gk: 'r2', a: 'r1', b: 'r3' });
  });

  it('with the current formation: nearest field player to each spot', () => {
    const field = [
      p('keeper', { relX: 0.5, relY: 0.95, isGoalie: true }),
      p('right', { relX: 0.7, relY: 0.7 }),
      p('left', { relX: 0.3, relY: 0.7 }),
    ];
    expect(assignPlayers(base(), [p('r1')], field)).toEqual({ gk: 'keeper', a: 'left', b: 'right' });
  });

  it('fills from the roster when the formation has fewer players, never twice', () => {
    const field = [p('left', { relX: 0.3, relY: 0.7 })];
    const roster = [p('left'), p('r9')];
    const r = assignPlayers(base(), roster, field);
    expect(r.a).toBe('left');
    expect(new Set(Object.values(r)).size).toBe(Object.values(r).length);
    expect(Object.values(r)).toContain('r9');
  });

  it('skips archived players and leaves discs nameless when the roster runs out', () => {
    const r = assignPlayers(base(), [p('gone', { archived: true }), p('only')]);
    expect(Object.values(r)).toEqual(['only']);
  });

  it('discName: nickname, else first name', () => {
    expect(discName({ name: 'Eeli Virtanen', nickname: 'Eetu' })).toBe('Eetu');
    expect(discName({ name: 'Eeli Virtanen' })).toBe('Eeli');
    expect(discName({ name: '  Onni ', nickname: ' ' })).toBe('Onni');
  });
});

describe('lintConcept', () => {
  /** Players well apart, a pass from the holder: nothing to warn about. */
  const clean = (): Concept => ({
    ...base(),
    players: [
      { id: 'gk', side: 'us', role: 'gk', start: [34, 95] },
      { id: 'a', side: 'us', start: [20, 70] },
      { id: 'b', side: 'us', start: [48, 70] },
      { id: 'x', side: 'opp', start: [34, 40] },
    ],
    steps: [
      { title: 'One', text: '', ball: 'gk', arrows: [{ kind: 'pass', from: 'gk', to: 'a' }] },
      { title: 'Two', text: '', ball: 'a', positions: { a: [18, 60] }, arrows: [{ kind: 'long', from: 'a', to: [40, 30] }] },
    ],
  });

  it('has no warnings for a clean concept or the demo fixture', () => {
    expect(lintConcept(clean())).toEqual([]);
    expect(lintConcept(DEMO_CONCEPT)).toEqual([]);
  });

  it('warns about discs on top of each other (our 2.9 + their 2.2 + a small gap)', () => {
    const c = clean();
    // 4 apart: closer than 2.9 + 2.2 + gap.
    c.steps[1].positions = { a: [34, 44] };
    const w = lintConcept(c);
    expect(w).toEqual([expect.stringMatching(/^steps\[1\]: "a" and "x" overlap \(4\.0 apart/)]);
    // 5.6 apart is enough.
    c.steps[1].positions = { a: [34, 45.6] };
    expect(lintConcept(c)).toEqual([]);
  });

  it('reports an overlap once, at the step where it starts (not again while nobody moves)', () => {
    const c = clean();
    c.steps[0].positions = { b: [22, 72] }; // next to a at the start
    c.steps.push({ title: 'Three', text: '' });
    const w = lintConcept(c).filter((m) => m.includes('overlap'));
    expect(w).toEqual([expect.stringMatching(/^steps\[0\]: "a" and "b" overlap/)]);
  });

  it('warns about a disc reaching past the edge of the pitch', () => {
    const c = clean();
    c.steps[1].positions = { a: [1, 60] };
    expect(lintConcept(c)).toEqual([expect.stringMatching(/^steps\[1\]\.positions\.a: the disc at \[1\.0, 60\.0\] reaches past the edge/)]);
    const start = clean();
    start.players[3].start = [34, 1];
    expect(lintConcept(start)).toEqual([expect.stringMatching(/^players\[3\]\.start: .* reaches past the edge/)]);
  });

  it('warns about more than four arrows in a step', () => {
    const c = clean();
    c.steps[0].arrows = [
      { kind: 'pass', from: 'gk', to: 'a' },
      { kind: 'run', from: 'a', to: [10, 60] },
      { kind: 'run', from: 'b', to: [58, 60] },
      { kind: 'press', from: 'x', to: 'gk' },
      { kind: 'run', from: 'gk', to: [34, 92] },
    ];
    expect(lintConcept(c)).toEqual(['steps[0].arrows: 5 arrows (more than 4 is hard to follow)']);
  });

  it('warns about a pass that does not start at the ball', () => {
    const c = clean();
    c.steps[0].arrows = [{ kind: 'pass', from: 'b', to: 'a' }];
    c.steps[1].arrows = [{ kind: 'shot', from: [40, 40], to: [34, 0] }];
    expect(lintConcept(c)).toEqual([
      'steps[0].arrows[0].from: a pass that does not start at the ball ("gk")',
      'steps[1].arrows[0].from: a shot that does not start at the ball ("a")',
    ]);
    // A pass from a point next to a loose ball is fine; with no ball at all it is not.
    const loose = clean();
    loose.steps[0] = { title: 'One', text: '', ball: [30, 50], arrows: [{ kind: 'pass', from: [30.5, 50], to: 'a' }] };
    expect(lintConcept(loose).filter((m) => m.includes('steps[0]'))).toEqual([]);
    const noBall = clean();
    noBall.steps = [{ title: 'One', text: '', arrows: [{ kind: 'pass', from: 'gk', to: 'a' }] }];
    expect(lintConcept(noBall)).toEqual(['steps[0].arrows[0].from: a pass but no ball on the pitch']);
  });
});
