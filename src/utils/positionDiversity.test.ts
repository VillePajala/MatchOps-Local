import { computePositionDiversity, type DiversityGame } from './positionDiversity';

const g = (playerPositions: Record<string, string[]>): DiversityGame => ({ playerPositions });
const player = (id: string, games: DiversityGame[]) =>
  computePositionDiversity(games).players.find(p => p.playerId === id)!;

describe('computePositionDiversity', () => {
  it('returns an empty result for no games / no recorded positions', () => {
    expect(computePositionDiversity([]).players).toEqual([]);
    expect(computePositionDiversity([{}]).totalGames).toBe(0);
    expect(computePositionDiversity([g({})]).totalGames).toBe(0);
    // A player entry with an empty array is ignored (no position recorded).
    expect(computePositionDiversity([g({ p1: [] })]).players).toEqual([]);
  });

  it('counts games per position and per line, once per game', () => {
    const p = player('p1', [g({ p1: ['cb'] }), g({ p1: ['cb'] }), g({ p1: ['lb'] })]);
    expect(p.totalGames).toBe(3);
    expect(p.byPosition).toEqual({ cb: 2, lb: 1 });
    expect(p.byLine.def).toBe(3);
    expect(p.distinctPositions).toBe(2);
    expect(p.distinctLines).toBe(1);
    expect(p.primaryPosition).toBe('cb'); // most-frequent
    expect(p.primaryLine).toBe('def');
  });

  it('flags a single-line player as narrow regardless of game count', () => {
    const many = player('p1', [g({ p1: ['cb'] }), g({ p1: ['cb'] }), g({ p1: ['lb'] })]);
    expect(many.narrow).toBe(true);
    expect(many.topLineShare).toBe(1);

    // Even a single appearance in one line is flagged now (no games gate).
    const once = player('p1', [g({ p1: ['cb'] })]);
    expect(once.totalGames).toBe(1);
    expect(once.narrow).toBe(true);
  });

  it('does not flag a player who has played more than one line', () => {
    const p = player('p2', [g({ p2: ['cb'] }), g({ p2: ['cm'] }), g({ p2: ['st'] }), g({ p2: ['cb'] })]);
    expect(p.distinctLines).toBe(3);
    expect(p.narrow).toBe(false);
  });

  it('counts each line a multi-position game touched, but the game once', () => {
    const p = player('p3', [g({ p3: ['cb', 'cm'] })]);
    expect(p.totalGames).toBe(1);
    expect(p.byPosition).toEqual({ cb: 1, cm: 1 });
    expect(p.byLine.def).toBe(1);
    expect(p.byLine.mid).toBe(1);
    expect(p.distinctPositions).toBe(2);
    expect(p.distinctLines).toBe(2);
  });

  it('keeps topLineShare on the dominant line even with a secondary line', () => {
    // def every game, mid in two of them -> def is dominant, but two lines exist.
    const p = player('p1', [
      g({ p1: ['cb', 'cm'] }),
      g({ p1: ['cb', 'cm'] }),
      g({ p1: ['cb'] }),
      g({ p1: ['cb'] }),
      g({ p1: ['cb'] }),
    ]);
    expect(p.byLine).toMatchObject({ def: 5, mid: 2 });
    expect(p.topLineShare).toBe(1);
    expect(p.distinctLines).toBe(2);
    expect(p.narrow).toBe(false); // has some midfield experience
  });

  it('reports how many distinct players covered each position and line', () => {
    const r = computePositionDiversity([
      g({ p1: ['st'], p2: ['st'] }), // st by two players
      g({ p1: ['cb'] }),
    ]);
    expect(r.positionCoverage.st).toBe(2);
    expect(r.positionCoverage.cb).toBe(1);
    expect(r.lineCoverage.att).toBe(2);
    expect(r.lineCoverage.def).toBe(1);
    expect(r.totalGames).toBe(2);
  });

  it('breaks primary-position ties by back-to-front config order', () => {
    // cb (def) and st (att) both played once; cb comes first in config order.
    const p = player('p1', [g({ p1: ['st'] }), g({ p1: ['cb'] })]);
    expect(p.byPosition).toEqual({ st: 1, cb: 1 });
    expect(p.primaryPosition).toBe('cb');
  });

  it('sorts players deterministically by id', () => {
    const r = computePositionDiversity([g({ pB: ['cb'], pA: ['st'] })]);
    expect(r.players.map(p => p.playerId)).toEqual(['pA', 'pB']);
  });
});
