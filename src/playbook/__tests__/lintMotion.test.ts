import { lintConceptMotion } from '../lintMotion';
import type { Concept, ConceptStep } from '../types';

/** Two of ours and one of theirs on an otherwise empty pitch. */
const concept = (steps: ConceptStep[]): Concept => ({
  id: 't',
  title: 'T',
  phase: 'Hyökkääminen',
  format: '8v8',
  version: 1,
  players: [
    { id: 'a', side: 'us', start: [20, 60] },
    { id: 'b', side: 'us', start: [48, 60] },
    { id: 'x', side: 'opp', start: [34, 40] },
  ],
  steps,
});

describe('lintConceptMotion', () => {
  it('has nothing to say about a pass and a run that go round everybody', () => {
    const c = concept([
      { title: 'One', text: '', ball: 'a', arrows: [{ kind: 'pass', from: 'a', to: 'b' }, { kind: 'run', from: 'a', to: [20, 40] }] },
      { title: 'Two', text: '', ball: 'b', positions: { a: [20, 40] } },
    ]);
    expect(lintConceptMotion(c)).toEqual([]);
  });

  /** @edge-case */
  it('warns when two players swap places through each other', () => {
    const c = concept([
      { title: 'One', text: '', ball: 'a' },
      { title: 'Two', text: '', positions: { a: [48, 60], b: [20, 60] } },
    ]);
    expect(lintConceptMotion(c)).toEqual([expect.stringMatching(/^steps\[0\] -> steps\[1\]: "a" and "b" run through each other/)]);
  });

  /** @edge-case */
  it('warns about a ground pass and its arrow through a bystander, but not a long ball over them', () => {
    const through = (kind: 'pass' | 'long'): Concept =>
      concept([
        { title: 'One', text: '', ball: 'a', positions: { x: [34, 60] }, arrows: [{ kind, from: 'a', to: 'b', bend: 0 }] },
        { title: 'Two', text: '', ball: 'b' },
      ]);
    expect(lintConceptMotion(through('pass'))).toEqual([
      expect.stringMatching(/^steps\[0\]\.arrows\[0\]: the pass arrow crosses "x"/),
      expect.stringMatching(/^steps\[0\] -> steps\[1\]: the ball travels through "x"/),
    ]);
    expect(lintConceptMotion(through('long'))).toEqual([]);
  });

  it('a cut step is a jump: nothing travels into it', () => {
    const c = concept([
      { title: 'One', text: '', ball: 'a' },
      { title: 'Two', text: '', cut: true, ball: 'a', positions: { a: [48, 60], b: [20, 60] } },
    ]);
    expect(lintConceptMotion(c)).toEqual([]);
  });
});
