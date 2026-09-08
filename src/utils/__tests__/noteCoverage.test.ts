import { computeNoteCoverage, type CoverageGame } from '../noteCoverage';
import type { Player } from '@/types';
import type { GameEvent } from '@/types/game';

const player = (id: string, name: string, nickname?: string): Player =>
  ({ id, name, nickname, isGoalie: false, receivedFairPlayCard: false }) as Player;

const roster = [
  player('p1', 'Emma Virtanen', 'Emma'),
  player('p2', 'Matti Korhonen', 'Matti'),
  player('p3', 'Sofia Nieminen', 'Sofia'),
];

const note = (id: string, about?: string): GameEvent =>
  ({ id, type: 'note', time: 100, text: 'jotain', entityId: about, source: 'manual' }) as GameEvent;

const goal = (id: string): GameEvent => ({ id, type: 'goal', time: 50, scorerId: 'p1' }) as GameEvent;

const game = (over: Partial<CoverageGame> = {}): CoverageGame => ({
  isPlayed: true,
  selectedPlayerIds: ['p1', 'p2', 'p3'],
  gameEvents: [],
  ...over,
}) as CoverageGame;

describe('computeNoteCoverage', () => {
  it('reports who has nothing written about them, with the matches as the denominator', () => {
    const c = computeNoteCoverage(
      [
        game({ gameEvents: [note('n1', 'p1'), note('n2', 'p1')] }),
        game({ gameEvents: [note('n3', 'p2')] }),
      ],
      roster,
    );

    expect(c.matches).toBe(2);
    expect(c.players).toBe(3);
    expect(c.playersWithNotes).toBe(2);
    expect(c.totalNotes).toBe(3);
    expect(c.unwritten.map((p) => p.name)).toEqual(['Sofia']);
    expect(c.unwritten[0]).toMatchObject({ notes: 0, matches: 2 });
  });

  /**
   * @critical - the honest reading of a zero depends entirely on how many
   * matches the player was actually there for. A substitute who played once is
   * not the same gap as a regular nobody has written about all season.
   */
  it('puts the widest gap first: fewest notes, then most matches present', () => {
    const c = computeNoteCoverage(
      [
        game({ selectedPlayerIds: ['p1', 'p2'], gameEvents: [note('n1', 'p1')] }),
        game({ selectedPlayerIds: ['p1', 'p2'], gameEvents: [] }),
        // Sofia appears once and has nothing written - a smaller gap than
        // Matti, who was there twice with nothing.
        game({ selectedPlayerIds: ['p1', 'p3'], gameEvents: [] }),
      ],
      roster,
    );

    expect(c.unwritten.map((p) => [p.name, p.matches])).toEqual([
      ['Matti', 2],
      ['Sofia', 1],
    ]);
  });

  it('counts a note about the match without blaming it on a player', () => {
    const c = computeNoteCoverage([game({ gameEvents: [note('n1'), note('n2', 'p1')] })], roster);

    expect(c.totalNotes).toBe(2);
    expect(c.playersWithNotes).toBe(1);
    expect(c.all.find((p) => p.name === 'Matti')?.notes).toBe(0);
  });

  it('ignores everything that is not a note', () => {
    const c = computeNoteCoverage([game({ gameEvents: [goal('g1'), note('n1', 'p1')] })], roster);
    expect(c.totalNotes).toBe(1);
  });

  it('does not count a match that has not been played', () => {
    // A planned match is not a chance the coach missed.
    const c = computeNoteCoverage([game({ isPlayed: false })], roster);
    expect(c).toMatchObject({ matches: 0, players: 0, unwritten: [] });
  });

  it('says nothing at all when there is nothing in scope', () => {
    expect(computeNoteCoverage([], roster).unwritten).toEqual([]);
    expect(computeNoteCoverage([game()], []).unwritten).toEqual([]);
  });

  it('leaves out a player who was never picked for any match in scope', () => {
    // Not a gap: the coach had no occasion to write about them here.
    const c = computeNoteCoverage([game({ selectedPlayerIds: ['p1'] })], roster);
    expect(c.players).toBe(1);
    expect(c.all.map((p) => p.name)).toEqual(['Emma']);
  });

  it('ignores a note about a player who has since left the roster', () => {
    const c = computeNoteCoverage([game({ gameEvents: [note('n1', 'gone')] })], roster);
    expect(c.totalNotes).toBe(1);
    expect(c.playersWithNotes).toBe(0);
  });

  it('prefers the nickname the coach uses, falling back to the full name', () => {
    const c = computeNoteCoverage(
      [game({ selectedPlayerIds: ['p1', 'p4'] })],
      [...roster, player('p4', 'Aino Lahtinen')],
    );
    expect(c.all.map((p) => p.name).sort()).toEqual(['Aino Lahtinen', 'Emma']);
  });
});
