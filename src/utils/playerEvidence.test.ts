/**
 * @critical - the page a coach hands to a head coach about one child. Every
 * line must be a fact the app recorded, dated, and nothing else.
 */
import { buildPlayerEvidence, type EvidenceInput } from './playerEvidence';

const t = (_key: string, fallback: string) => fallback;

const input: EvidenceInput = {
  playerName: 'Onni Virtanen',
  periodLabel: 'Seurakausi 25/26',
  teamGamesInScope: 9,
  games: [
    { gameId: 'g1', gameDate: '2026-09-14', opponentName: 'PaU', homeOrAway: 'home', homeScore: 1, awayScore: 6, positions: ['cm'] },
    { gameId: 'g2', gameDate: '2026-09-21', opponentName: 'MP', homeOrAway: 'away', homeScore: 2, awayScore: 1, positions: ['cm', 'rb'] },
  ],
  stats: [
    { gameId: 'g2', date: '2026-09-21', opponentName: 'MP', goals: 0, assists: 1, points: 1, result: 'L', receivedFairPlayCard: false },
    { gameId: 'g1', date: '2026-09-14', opponentName: 'PaU', goals: 2, assists: 0, points: 2, result: 'L', receivedFairPlayCard: false },
    { gameId: 'x1', date: '2026-09-28', opponentName: 'Kultsu', goals: 1, assists: 0, points: 1, result: 'W', receivedFairPlayCard: false, isExternal: true },
  ],
  notes: [
    { gameDate: '2026-09-21', opponentName: 'MP', text: 'Organised the back line himself.' },
    { gameDate: '2026-09-14', opponentName: 'PaU', text: 'Won the ball back three times late on.' },
  ],
};

describe('buildPlayerEvidence', () => {
  it('states games, totals, positions, dated notes and a game list, oldest first', () => {
    expect(buildPlayerEvidence(input, t).split('\n')).toEqual([
      'Onni Virtanen - Match evidence',
      'Seurakausi 25/26',
      '',
      'Games: 3 / 9 team games',
      'Goals 3, assists 1, points 4',
      'Positions: CM 2, RB 1',
      '',
      'Coach notes from the games:',
      '14.9. PaU: Won the ball back three times late on.',
      '21.9. MP: Organised the back line himself.',
      '',
      'Games:',
      '14.9. PaU 1-6 L | CM | 2 g',
      '21.9. MP 1-2 L | CM/RB | 1 a',
      '28.9. Kultsu W | 1 g | external',
    ]);
  });

  it('leaves out blocks that have nothing in them', () => {
    const text = buildPlayerEvidence({ ...input, notes: [], stats: [], games: [], teamGamesInScope: 0 }, t);
    expect(text).toBe('Onni Virtanen - Match evidence\nSeurakausi 25/26\n\nGames: 0\nGoals 0, assists 0, points 0');
  });
});
