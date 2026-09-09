/**
 * @critical - the page a coach hands to a head coach about one child. Every
 * line must be a fact the app recorded, dated, and nothing else.
 */
import {
  buildPlayerEvidence,
  DEFAULT_EVIDENCE_SECTIONS,
  type EvidenceInput,
  type EvidenceSections,
} from './playerEvidence';

// Mirrors i18next: a counted key resolves its own plural, so the fallback here
// is whichever form the caller asked for, with {{count}} filled in.
const t = (_key: string, fallback: string, options?: Record<string, unknown>) =>
  options && typeof options.count === 'number'
    ? fallback.replace('{{count}}', String(options.count))
    : fallback;

const all: EvidenceSections = { totals: true, competitions: true, notes: true, games: true };

const input: EvidenceInput = {
  playerName: 'Onni Virtanen',
  periodLabel: 'Seurakausi 25/26',
  games: [
    { gameId: 'g1', gameDate: '2026-09-14', opponentName: 'PaU', homeOrAway: 'home', homeScore: 1, awayScore: 6, positions: ['cm'] },
    { gameId: 'g2', gameDate: '2026-09-21', opponentName: 'MP', homeOrAway: 'away', homeScore: 2, awayScore: 1, positions: ['cm', 'rb'] },
  ],
  stats: [
    { gameId: 'g2', date: '2026-09-21', opponentName: 'MP', goals: 0, assists: 1, points: 1, result: 'L', receivedFairPlayCard: false },
    { gameId: 'g1', date: '2026-09-14', opponentName: 'PaU', goals: 2, assists: 0, points: 2, result: 'L', receivedFairPlayCard: false },
    { gameId: 'x1', date: '2026-09-28', opponentName: 'Kultsu', goals: 1, assists: 0, points: 1, result: 'W', receivedFairPlayCard: false, isExternal: true },
  ],
  competitions: [
    { name: 'Aluesarja U10 25/26', games: 2, goals: 2, assists: 1 },
    { name: 'Kesäcup', games: 1, goals: 1, assists: 0 },
  ],
  notes: [
    { gameDate: '2026-09-21', opponentName: 'MP', text: 'Organised the back line himself.' },
    { gameDate: '2026-09-14', opponentName: 'PaU', text: 'Won the ball back three times late on.' },
  ],
  sections: all,
};

describe('buildPlayerEvidence', () => {
  it('states totals, competitions, dated notes and the game list, oldest first', () => {
    expect(buildPlayerEvidence(input, t).split('\n')).toEqual([
      'Onni Virtanen - Player summary',
      'Seurakausi 25/26',
      '',
      'Games: 3',
      'Goals 3, assists 1, points 4',
      'Positions: CM 2, RB 1',
      '',
      'Leagues and tournaments:',
      'Aluesarja U10 25/26: 2 games, 2 goals, 1 assist',
      'Kesäcup: 1 game, 1 goal',
      '',
      'Coach notes from the games:',
      '14.9. PaU: Won the ball back three times late on.',
      '21.9. MP: Organised the back line himself.',
      '',
      'Games:',
      '14.9. PaU 1-6 L | CM | 2 g',
      '21.9. MP 1-2 L | CM/RB | 1 a',
      '28.9. Kultsu W | 1 g',
    ]);
  });

  /**
   * A game the coach could not sit and track is still a game the player
   * played. Splitting the count only invited "which of the nine?".
   */
  it('counts an external game like any other, and marks it as nothing special', () => {
    const text = buildPlayerEvidence(input, t);
    expect(text).toContain('Games: 3');
    expect(text).not.toContain('external');
  });

  it('writes only the blocks the coach asked for', () => {
    const short = buildPlayerEvidence({ ...input, sections: DEFAULT_EVIDENCE_SECTIONS }, t);
    // The game list is the long one, and it is off to begin with.
    expect(short).not.toContain('14.9. PaU 1-6 L');
    expect(short).toContain('Leagues and tournaments:');
    expect(short).toContain('Coach notes from the games:');

    const bare = buildPlayerEvidence(
      { ...input, sections: { totals: true, competitions: false, notes: false, games: false } },
      t,
    );
    expect(bare).toBe('Onni Virtanen - Player summary\nSeurakausi 25/26\n\nGames: 3\nGoals 3, assists 1, points 4\nPositions: CM 2, RB 1');
  });

  it('leaves out blocks that have nothing in them', () => {
    const text = buildPlayerEvidence(
      { ...input, notes: [], stats: [], games: [], competitions: [], sections: all },
      t,
    );
    expect(text).toBe('Onni Virtanen - Player summary\nSeurakausi 25/26\n\nGames: 0\nGoals 0, assists 0, points 0');
  });
});
