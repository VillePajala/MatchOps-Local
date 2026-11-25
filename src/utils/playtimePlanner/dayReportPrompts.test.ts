/**
 * When the day report is offered outside the planner: the finish screen of
 * the day's last game, and Home until the report is written or a week passes.
 */
import type { AppState } from '@/types/game';
import { TestFixtures } from '../../../tests/fixtures';
import { DAY_REPORT_PROMPT_DAYS, findDayReportPrompts, planDayStatus } from './dayReportPrompts';
import type { PlanLinksCollection } from './planLinks';
import type { PlaytimePlan } from './types';

const plan = (id: string, over: Partial<PlaytimePlan> = {}): PlaytimePlan => ({
  id,
  name: `Plan ${id}`,
  version: 1,
  createdAt: '',
  updatedAt: '',
  players: [],
  games: ['a', 'b', 'c'].map((g) => ({
    id: `${id}-${g}`,
    label: g,
    formationId: '5v5',
    numberOfPeriods: 1,
    periodMinutes: 15,
    included: true,
    startingSlots: [],
    subs: [],
  })),
  ...over,
});

const finished = (gameDate: string, over: Partial<AppState> = {}): AppState =>
  TestFixtures.games.completed({ gameDate, gameStatus: 'gameEnd', homeScore: 1, awayScore: 0, ...over });
const notStarted = (gameDate: string): AppState =>
  TestFixtures.games.completed({ gameDate, gameStatus: 'notStarted', homeScore: 0, awayScore: 0, gameEvents: [] });

/** Links game_<n>_x -> plan games a/b/c in order. */
const linksFor = (planId: string, gameIds: string[]): PlanLinksCollection =>
  Object.fromEntries(gameIds.map((gid, i) => [gid, { planId, planGameId: `${planId}-${['a', 'b', 'c'][i]}` }]));

const TODAY = '2026-12-14';

describe('planDayStatus', () => {
  it('is all finished when every game made from the plan is over', () => {
    const games = { game_1_x: finished('2026-12-12'), game_2_x: finished('2026-12-12') };
    expect(planDayStatus(plan('p'), linksFor('p', ['game_1_x', 'game_2_x']), games)).toEqual({
      linked: 2,
      finished: 2,
      allFinished: true,
      lastGameDate: '2026-12-12',
    });
  });

  it('a game still under way (clock running or between periods) is not finished', () => {
    const links = linksFor('p', ['game_1_x', 'game_2_x']);
    for (const gameStatus of ['inProgress', 'periodEnd'] as const) {
      const games = { game_1_x: finished('2026-12-12'), game_2_x: finished('2026-12-12', { gameStatus }) };
      expect(planDayStatus(plan('p'), links, games).allFinished).toBe(false);
    }
  });

  /** @critical the finish screen of the last game: that game counts once played at all */
  it('counts the game whose finish screen is open once it is played, even mid-way', () => {
    const links = linksFor('p', ['game_1_x', 'game_2_x']);
    const games = { game_1_x: finished('2026-12-12'), game_2_x: finished('2026-12-12', { gameStatus: 'periodEnd' }) };
    expect(planDayStatus(plan('p'), links, games, 'game_2_x').allFinished).toBe(true);
    // ...but not before it has been played at all.
    const unplayed = { ...games, game_2_x: notStarted('2026-12-12') };
    expect(planDayStatus(plan('p'), links, unplayed, 'game_2_x').allFinished).toBe(false);
  });

  it('is not finished with no games made from the plan', () => {
    expect(planDayStatus(plan('p'), {}, {}).allFinished).toBe(false);
  });

  it('ignores links whose game was deleted', () => {
    const games = { game_1_x: finished('2026-12-12') };
    expect(planDayStatus(plan('p'), linksFor('p', ['game_1_x', 'game_2_x']), games)).toMatchObject({
      linked: 1,
      allFinished: true,
    });
  });
});

describe('findDayReportPrompts (Home)', () => {
  const links = linksFor('p', ['game_1_x', 'game_2_x']);
  const games = { game_1_x: finished('2026-12-11'), game_2_x: finished('2026-12-12') };

  it('offers a finished day with no report written', () => {
    expect(findDayReportPrompts([plan('p', { name: 'Joulufutis 12.12.' })], links, games, TODAY)).toEqual([
      { planId: 'p', planName: 'Joulufutis 12.12.', lastGameDate: '2026-12-12' },
    ]);
  });

  it('is gone once the day report is written', () => {
    expect(findDayReportPrompts([plan('p', { dayReport: 'Hyvä päivä.' })], links, games, TODAY)).toEqual([]);
    // Whitespace is not a report.
    expect(findDayReportPrompts([plan('p', { dayReport: '  ' })], links, games, TODAY)).toHaveLength(1);
  });

  it(`shows for ${DAY_REPORT_PROMPT_DAYS} days counting the day of the last game, then stops`, () => {
    const p = [plan('p')];
    expect(findDayReportPrompts(p, links, games, '2026-12-12')).toHaveLength(1);
    expect(findDayReportPrompts(p, links, games, '2026-12-18')).toHaveLength(1); // 6 days after
    expect(findDayReportPrompts(p, links, games, '2026-12-19')).toEqual([]); // 7 days after
  });

  it('is not offered while a game is unplayed, for an archived plan, a future-dated or undated day', () => {
    const unplayed = { ...games, game_2_x: notStarted('2026-12-12') };
    expect(findDayReportPrompts([plan('p')], links, unplayed, TODAY)).toEqual([]);
    expect(findDayReportPrompts([plan('p', { archived: true })], links, games, TODAY)).toEqual([]);
    expect(findDayReportPrompts([plan('p')], links, games, '2026-12-10')).toEqual([]);
    const undated = { game_1_x: finished(''), game_2_x: finished('') };
    expect(findDayReportPrompts([plan('p')], links, undated, TODAY)).toEqual([]);
  });

  it('puts the most recent day first', () => {
    const allLinks = { ...links, ...linksFor('q', ['game_3_x']) };
    const allGames = { ...games, game_3_x: finished('2026-12-13') };
    expect(findDayReportPrompts([plan('p'), plan('q')], allLinks, allGames, TODAY).map((x) => x.planId)).toEqual([
      'q',
      'p',
    ]);
  });
});
