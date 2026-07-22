import { computeTeamRecord } from './teamRecord';
import type { AppState } from '@/types';

const g = (o: Partial<AppState> = {}): AppState => ({
  teamName: 'Meidän', opponentName: 'Vastustaja', gameDate: '2024-06-01', homeOrAway: 'home',
  homeScore: 0, awayScore: 0, isPlayed: true, seasonId: '', tournamentId: '', teamId: '',
  selectedPlayerIds: [], assessments: {}, ...o,
} as AppState);

describe('computeTeamRecord', () => {
  it('tallies W/D/L and goals from the coach perspective (honours homeOrAway)', () => {
    const rec = computeTeamRecord([
      g({ homeOrAway: 'home', homeScore: 3, awayScore: 1 }), // W, GF3 GA1
      g({ homeOrAway: 'away', homeScore: 2, awayScore: 2 }), // D, GF2 GA2
      g({ homeOrAway: 'away', homeScore: 3, awayScore: 1 }), // our=1 their=3 -> L, GF1 GA3
    ]);
    expect(rec.gamesPlayed).toBe(3);
    expect(rec.wins).toBe(1);
    expect(rec.ties).toBe(1);
    expect(rec.losses).toBe(1);
    expect(rec.goalsFor).toBe(6);
    expect(rec.goalsAgainst).toBe(6);
    expect(rec.goalDifference).toBe(0);
  });

  it('is empty for no games', () => {
    expect(computeTeamRecord([])).toEqual({
      gamesPlayed: 0, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0,
    });
  });
});
