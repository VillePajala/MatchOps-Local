/**
 * @critical - what the coach copies into Palloliitto's official match report.
 * A wrong minute or a wrong shirt number here becomes a wrong official record.
 */
import { buildTasoReport, tasoMinute, type TasoGame } from './tasoReport';
import type { Player } from '@/types';
import type { GameEvent } from '@/types/game';

const t = (_key: string, fallback: string) => fallback;

const players: Player[] = [
  { id: 'p1', name: 'Liam Smith', jerseyNumber: '10' },
  { id: 'p2', name: 'Emma Jones', jerseyNumber: '1', isGoalie: true },
  { id: 'p3', name: 'Noah Brown', jerseyNumber: '7' },
  { id: 'p4', name: 'Ada Lovelace' }, // no number
];

const ev = (type: GameEvent['type'], time: number, extra: Partial<GameEvent> = {}): GameEvent =>
  ({ id: `${type}-${time}`, type, time, ...extra });

const base: TasoGame = {
  teamName: 'Tigers',
  opponentName: 'Lions',
  homeOrAway: 'home',
  homeScore: 2,
  awayScore: 1,
  gameEvents: [],
  selectedPlayerIds: ['p1', 'p2', 'p3', 'p4'],
  numberOfPeriods: 2,
  periodDurationMinutes: 25,
};

describe('buildTasoReport', () => {
  it('lists the squad by shirt number, keeper marked, unnumbered last', () => {
    const { lineup } = buildTasoReport(base, players, t);
    expect(lineup.split('\n')).toEqual([
      'Squad for Taso',
      '1 Emma Jones (GK)',
      '7 Noah Brown',
      '10 Liam Smith',
      '- Ada Lovelace',
    ]);
  });

  it('writes the result home team first, with the half-time score from the first period end', () => {
    const game: TasoGame = {
      ...base,
      gameEvents: [
        ev('goal', 12 * 60, { scorerId: 'p1', assisterId: 'p3' }),
        ev('opponentGoal', 20 * 60),
        ev('periodEnd', 25 * 60 + 30),
        ev('goal', 40 * 60, { scorerId: 'p3' }),
        ev('gameEnd', 51 * 60),
      ],
    };
    const { report } = buildTasoReport(game, players, t);
    expect(report.split('\n')).toEqual([
      'Match report for Taso',
      'Tigers - Lions 2-1 (half-time 1-1)',
      'Goals (minute, scorer, assist):',
      "13' #10 Liam Smith (assist #7 Noah Brown)",
      "21' opponent goal",
      "41' #7 Noah Brown",
    ]);
  });

  it('puts the opponent first when we were away', () => {
    const { report } = buildTasoReport({ ...base, homeOrAway: 'away', homeScore: 1, awayScore: 2 }, players, t);
    expect(report.split('\n')[1]).toBe('Lions - Tigers 1-2');
  });

  it('says so when no goal was recorded', () => {
    const { report } = buildTasoReport({ ...base, homeScore: 0, awayScore: 0 }, players, t);
    expect(report).toContain('No goals recorded.');
  });
});

describe('tasoMinute', () => {
  it('counts the minute of play from a cumulative clock', () => {
    expect(tasoMinute(0, [], 25)).toBe('1');
    expect(tasoMinute(59, [], 25)).toBe('1');
    expect(tasoMinute(60, [], 25)).toBe('2');
    expect(tasoMinute(40 * 60, [25 * 60], 25)).toBe('41');
  });

  /** Taso writes stoppage as 45+2, and the period comes from the whistle, not from arithmetic. */
  it('writes added time the way Taso does, per period', () => {
    expect(tasoMinute(26 * 60 + 10, [27 * 60], 25)).toBe('25+2');   // still first half, whistle at 27:00
    expect(tasoMinute(26 * 60 + 10, [25 * 60], 25)).toBe('27');     // second half, whistle at 25:00
    expect(tasoMinute(52 * 60, [25 * 60], 25)).toBe('50+3');
  });
});
