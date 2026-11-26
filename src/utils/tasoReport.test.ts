/**
 * @critical - what the coach copies into Palloliitto's official match report.
 * A wrong minute or a wrong shirt number here becomes a wrong official record.
 */
import { TASO_NO_NUMBER, hasTasoNumber, buildTasoReport, tasoMinute, tasoPeriod, type TasoGame } from './tasoReport';
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
      'Squad',
      '1 Emma Jones (GK)',
      '7 Noah Brown',
      '10 Liam Smith',
      '– Ada Lovelace',
    ]);
  });

  /** Owner: a missing number keeps its column ("–"), and the finish screen counts them. */
  it('marks a missing or non-numeric shirt number with a dash in the number column', () => {
    expect(hasTasoNumber({ id: 'a', name: 'A', jerseyNumber: '7' })).toBe(true);
    expect(hasTasoNumber({ id: 'b', name: 'B', jerseyNumber: ' ' })).toBe(false);
    expect(hasTasoNumber({ id: 'c', name: 'C', jerseyNumber: '7b' })).toBe(false);
    expect(hasTasoNumber({ id: 'd', name: 'D' })).toBe(false);
    const { lineup } = buildTasoReport(base, players, t);
    expect(lineup).toContain(`${TASO_NO_NUMBER} Ada Lovelace`);
  });

  /**
   * Taso's lineup screen has a box for the keeper and a box for the captain,
   * and one player can fill both.
   */
  it('marks the captain, alongside the keeper mark when it is the same player', () => {
    expect(buildTasoReport({ ...base, captainId: 'p3' }, players, t)).toMatchObject({
      lineup: expect.stringContaining('7 Noah Brown (C)'),
    });
    expect(buildTasoReport({ ...base, captainId: 'p2' }, players, t).lineup)
      .toContain('1 Emma Jones (GK, C)');
    // No captain named: no mark anywhere, and no stray brackets.
    expect(buildTasoReport(base, players, t).lineup).not.toContain('(C)');
  });

  describe('positions in the line-up', () => {
    const onField = (id: string, relX: number, relY: number) => ({ id, relX, relY });

    /**
     * @critical - the recorded positions win; the pitch is only the fallback,
     * and a player with neither gets no position at all.
     */
    it('adds the recorded position, else the starting spot on the pitch, else nothing', () => {
      const { lineup } = buildTasoReport({
        ...base,
        captainId: 'p2',
        playerPositions: { p1: ['st', 'cb'], p2: ['gk'] },
        // p1's pitch spot is ignored (recorded wins); p3 has only a pitch spot.
        playersOnField: [onField('p1', 0.5, 0.2), onField('p3', 0.5, 0.8)],
      }, players, t);
      expect(lineup.split('\n')).toEqual([
        'Squad',
        // The keeper mark already says GK: not repeated as a position.
        '1 Emma Jones (GK, C)',
        '7 Noah Brown · CB',
        // Back-to-front order, whatever order they were recorded in.
        '10 Liam Smith · CB/ST',
        '– Ada Lovelace',
      ]);
    });

    it('reads the position abbreviations through the translations', () => {
      const tr = (key: string, fallback: string) =>
        ({ 'playingPositions.cb.abbrev': 'TP', 'positions.ST': 'HY' } as Record<string, string>)[key] ?? fallback;
      const { lineup } = buildTasoReport({
        ...base,
        playerPositions: { p1: ['cb'] },
        playersOnField: [onField('p3', 0.5, 0.2)],
      }, players, tr);
      expect(lineup).toContain('10 Liam Smith · TP');
      expect(lineup).toContain('7 Noah Brown · HY');
    });

    it('gives no position to a player standing on the sideline', () => {
      const { lineup } = buildTasoReport({ ...base, playersOnField: [onField('p3', 0.97, 0.5)] }, players, t);
      expect(lineup).toContain('\n7 Noah Brown\n');
    });

    it('keeps a keeper\'s outfield spell as their position', () => {
      const { lineup } = buildTasoReport({ ...base, playerPositions: { p2: ['gk', 'lb'] } }, players, t);
      expect(lineup).toContain('1 Emma Jones (GK) · LB');
    });
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
      'Match sheet',
      'Tigers - Lions 2-1 (half-time 1-1)',
      'Goals (minute, scorer, assist):',
      "13' 10 Liam Smith (assist 7 Noah Brown)",
      "25' opponent goal",
      "41' 7 Noah Brown",
    ]);
  });

  /** Review 11.1 (owner 2026-11-17): the extra-time score beside the final one. */
  it('adds the extra-time score after the half-time score, home team first', () => {
    const game: TasoGame = {
      ...base, homeOrAway: 'away', homeScore: 1, awayScore: 2, extraTimePeriods: 2, extraTimeMinutes: 15,
      gameEvents: [
        ev('opponentGoal', 10 * 60),
        ev('goal', 40 * 60, { scorerId: 'p1' }),
        ev('goal', 55 * 60, { scorerId: 'p3' }), // in extra time
      ],
    };
    const { report } = buildTasoReport(game, players, t);
    expect(report.split('\n')[1]).toBe('Lions - Tigers 1-2 (half-time 1-0, extra time 0-1)');
    // The goal log missing a goal: neither half-time nor extra-time score.
    const partial = buildTasoReport({ ...game, gameEvents: game.gameEvents.slice(1) }, players, t);
    expect(partial.report.split('\n')[1]).toBe('Lions - Tigers 1-2');
  });

  /**
   * Demo prep 2026-11-25: a final decided on penalties showed only the level
   * score. The shootout result is its own line under the final score, home team
   * first (kick sides are the game's home/away), and the final and extra-time
   * scores stay as they were.
   */
  it('adds the penalty shoot-out result under a level final score', () => {
    const kick = (team: 'home' | 'away', scored: boolean, order: number) => ({ id: `k${order}`, team, scored, order });
    const game: TasoGame = {
      ...base, homeOrAway: 'away', homeScore: 1, awayScore: 1, extraTimePeriods: 2, extraTimeMinutes: 5,
      gameEvents: [ev('opponentGoal', 10 * 60), ev('goal', 40 * 60, { scorerId: 'p1' })],
      shootoutKicks: [
        kick('home', true, 1), kick('away', true, 2),
        kick('home', false, 3), kick('away', true, 4),
        kick('home', true, 5), kick('away', true, 6),
      ],
    };
    const { report, text } = buildTasoReport(game, players, t);
    expect(report.split('\n').slice(0, 3)).toEqual([
      'Match sheet',
      'Lions - Tigers 1-1 (half-time 1-0, extra time 0-0)',
      'Penalty shoot-out 2-3',
    ]);
    expect(text.split('\n\n')[0]).toBe('Match sheet\nLions - Tigers 1-1 (half-time 1-0, extra time 0-0)\nPenalty shoot-out 2-3');
    // No kicks logged: no shootout line.
    expect(buildTasoReport({ ...game, shootoutKicks: [] }, players, t).report).not.toContain('Penalty shoot-out');
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
    expect(buildTasoReport(game, players, t).report).toContain("5' Ada Lovelace");
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

  /**
   * @critical - review R13: the copied sheet starts with what a reader wants
   * first, the title and the score, then the line-up, then the goals.
   */
  it('copies as title + score, then the line-up, then the goals', () => {
    const goals = [ev('goal', 5 * 60, { scorerId: 'p1' }), ev('goal', 30 * 60, { scorerId: 'p3' }), ev('opponentGoal', 40 * 60)];
    const { text, lineup } = buildTasoReport({ ...base, gameEvents: goals }, players, t);
    const blocks = text.split('\n\n');
    expect(blocks[0].split('\n')).toEqual(['Match sheet', 'Tigers - Lions 2-1 (half-time 1-0)']);
    expect(blocks[1]).toBe(lineup);
    expect(blocks[2].startsWith('Goals (minute, scorer, assist):')).toBe(true);
    expect(blocks).toHaveLength(3);
  });
});
