/**
 * @critical - what the coach copies into Palloliitto's official match report.
 * A wrong minute or a wrong shirt number here becomes a wrong official record.
 */
import { buildTasoReport, tasoMinute, tasoPeriod, type TasoGame } from './tasoReport';
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
      // Realistic: goals only, as prod data has. No periodEnd events exist.
      gameEvents: [
        ev('goal', 12 * 60 + 30, { scorerId: 'p1', assisterId: 'p3' }),
        ev('opponentGoal', 25 * 60),          // on the boundary: still first half
        ev('goal', 40 * 60 + 5, { scorerId: 'p3' }),
      ],
    };
    const { report } = buildTasoReport(game, players, t);
    expect(report.split('\n')).toEqual([
      'Match report for Taso',
      'Tigers - Lions 2-1 (half-time 1-1)',
      'Goals (minute, scorer, assist):',
      "13' #10 Liam Smith (assist #7 Noah Brown)",
      "25' opponent goal",
      "41' #7 Noah Brown",
    ]);
  });

  it('puts the opponent first when we were away', () => {
    const { report } = buildTasoReport({ ...base, homeOrAway: 'away', homeScore: 1, awayScore: 2 }, players, t);
    expect(report.split('\n')[1]).toBe('Lions - Tigers 1-2');
  });

  it('omits the half-time score when the goal log does not account for the whole score', () => {
    const game: TasoGame = { ...base, gameEvents: [ev('goal', 5 * 60, { scorerId: 'p1' })] }; // score says 2-1
    expect(buildTasoReport(game, players, t).report.split('\n')[1]).toBe('Tigers - Lions 2-1');
  });

  it('marks an unnumbered scorer the same way as in the squad list', () => {
    const game: TasoGame = { ...base, homeScore: 1, awayScore: 0, gameEvents: [ev('goal', 5 * 60, { scorerId: 'p4' })] };
    expect(buildTasoReport(game, players, t).report).toContain("5' #- Ada Lovelace");
  });

  it('says so when no goal was recorded', () => {
    const { report } = buildTasoReport({ ...base, homeScore: 0, awayScore: 0 }, players, t);
    expect(report).toContain('No goals recorded.');
  });
});

describe('tasoMinute and tasoPeriod', () => {
  it('counts the minute of play from the cumulative clock, ceiling, never 0', () => {
    expect(tasoMinute(0)).toBe(1);
    expect(tasoMinute(1)).toBe(1);
    expect(tasoMinute(60)).toBe(1);
    expect(tasoMinute(61)).toBe(2);
    expect(tasoMinute(40 * 60 + 5)).toBe(41);
  });

  /**
   * @critical - the app emits no periodEnd event; periods come from the
   * nominal length, and a reading on the boundary belongs to the half that
   * just ended.
   */
  it('assigns the period by nominal length with the boundary in the earlier period', () => {
    expect(tasoPeriod(0, 2, 25)).toBe(1);
    expect(tasoPeriod(25 * 60, 2, 25)).toBe(1);
    expect(tasoPeriod(25 * 60 + 1, 2, 25)).toBe(2);
    expect(tasoPeriod(70 * 60, 2, 25)).toBe(2);
    expect(tasoPeriod(31 * 60, 4, 15)).toBe(3);
    expect(tasoPeriod(31 * 60, 1, 60)).toBe(1);
  });

  it('gives no half-time score unless the game has two periods', () => {
    const goals = [ev('goal', 5 * 60, { scorerId: 'p1' })];
    expect(buildTasoReport({ ...base, numberOfPeriods: 4, periodDurationMinutes: 15, gameEvents: goals, homeScore: 1, awayScore: 0 }, players, t).report)
      .not.toContain('half-time');
  });
});
