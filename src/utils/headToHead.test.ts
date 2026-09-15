/**
 * @critical - head-to-head is the first thing that reads opponentName as data
 * rather than as a caption. If it groups wrongly it does not merely look odd,
 * it tells a coach they lose to a team they have never played.
 */
import { computeHeadToHead } from './headToHead';
import type { AppState } from '@/types/game';

const game = (opponentName: string, ourScore: number, theirScore: number): AppState =>
  ({
    opponentName,
    homeOrAway: 'home',
    homeScore: ourScore,
    awayScore: theirScore,
    gameEvents: [],
  }) as unknown as AppState;

describe('computeHeadToHead', () => {
  it('gives one row per opponent with its record', () => {
    const rows = computeHeadToHead([
      game('HJK', 3, 1),
      game('HJK', 0, 2),
      game('KuPS', 1, 1),
    ]);
    expect(rows).toHaveLength(2);
    const hjk = rows.find((r) => r.opponent === 'HJK')!;
    expect(hjk).toMatchObject({ gamesPlayed: 2, wins: 1, losses: 1, ties: 0, goalDifference: 0 });
    const kups = rows.find((r) => r.opponent === 'KuPS')!;
    expect(kups).toMatchObject({ gamesPlayed: 1, ties: 1, goalsFor: 1, goalsAgainst: 1 });
  });

  /** The reason the spelling work had to come first. */
  it('counts every spelling of a team as that one team', () => {
    const rows = computeHeadToHead([
      game('LauTP / Sininen', 1, 0),
      game('LAUTP/Sininen', 2, 0),
      game('lautp sininen', 0, 1),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].gamesPlayed).toBe(3);
    // Shown under the spelling those games use most; here all three differ, so
    // the tie falls to the first seen - stable, never arbitrary.
    expect(rows[0].opponent).toBe('LauTP / Sininen');
  });

  /** Two squads sharing a club name must never be merged into one record. */
  it('keeps sibling teams apart', () => {
    const rows = computeHeadToHead([game('IPS/Punainen', 1, 0), game('IPS/Sininen', 0, 3)]);
    expect(rows).toHaveLength(2);
  });

  it('counts an away game from the coach side, not the home side', () => {
    const away = {
      opponentName: 'HJK',
      homeOrAway: 'away',
      homeScore: 1,
      awayScore: 4,
      gameEvents: [],
    } as unknown as AppState;
    const [row] = computeHeadToHead([away]);
    expect(row).toMatchObject({ wins: 1, goalsFor: 4, goalsAgainst: 1 });
  });

  it('puts the most-played team first', () => {
    const rows = computeHeadToHead([
      game('HJK', 1, 0),
      game('KuPS', 1, 0),
      game('KuPS', 1, 0),
    ]);
    expect(rows.map((r) => r.opponent)).toEqual(['KuPS', 'HJK']);
  });

  /** A missing name is missing data, not a team called "". */
  it('skips games with no opponent name', () => {
    expect(computeHeadToHead([game('', 1, 0), game('   ', 1, 0), game('HJK', 1, 0)])).toHaveLength(
      1,
    );
  });

  it('handles an empty set', () => {
    expect(computeHeadToHead([])).toEqual([]);
  });
});
