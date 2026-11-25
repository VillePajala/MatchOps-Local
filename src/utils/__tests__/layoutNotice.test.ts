/**
 * The basic-layout notice's scheduling rule (utils/layoutNotice.ts):
 * wizard -> #1, finished games -> #2 / #3, never after #3, never on match day
 * before kick-off, never on the full layout, at most once a day, and nothing
 * after "Älä näytä enää".
 * @critical
 */
import {
  dueLayoutNotice,
  getFinishedGamesSession,
  layoutNoticeFacts,
  observeFinishedGames,
  resetLayoutNoticeSession,
  shownMarks,
  SAME_SESSION_WAIT_MS,
  type LayoutNoticeInput,
} from '@/utils/layoutNotice';
import type { AppState } from '@/types';
import type { OnboardingMilestones } from '@/types/settings';

const NOW = new Date(2026, 10, 25, 18, 0, 0); // local time
const YESTERDAY = new Date(2026, 10, 24, 12, 0, 0).toISOString();
const EARLIER_TODAY = new Date(2026, 10, 25, 9, 0, 0).toISOString();

const input = (overrides: Partial<LayoutNoticeInput> = {}): LayoutNoticeInput => ({
  layout: 'basic',
  milestones: {},
  wizardSeen: true,
  facts: { finishedGames: 0, savedGames: 1, matchDayPending: false },
  session: { baseline: 0, reachedAt: {} },
  now: NOW,
  ...overrides,
});

const afterOne: OnboardingMilestones = { layoutNotice1Shown: YESTERDAY };

describe('dueLayoutNotice', () => {
  it('#1 right after the wizard', () => {
    expect(dueLayoutNotice(input())).toBe(1);
  });

  it('no #1 before the wizard has been seen', () => {
    expect(dueLayoutNotice(input({ wizardSeen: false }))).toBeNull();
  });

  it('never on the full layout, or while the layout is still loading', () => {
    expect(dueLayoutNotice(input({ layout: 'full' }))).toBeNull();
    expect(dueLayoutNotice(input({ layout: undefined }))).toBeNull();
  });

  it('never on match day before kick-off', () => {
    expect(
      dueLayoutNotice(input({ facts: { finishedGames: 0, savedGames: 1, matchDayPending: true } })),
    ).toBeNull();
  });

  it('#2 after the first finished game, once it was finished before this session', () => {
    expect(
      dueLayoutNotice(input({
        milestones: afterOne,
        facts: { finishedGames: 1, savedGames: 1, matchDayPending: false },
        session: { baseline: 1, reachedAt: {} },
      })),
    ).toBe(2);
  });

  it('#2 waits when the game was finished in this session, until an hour has passed', () => {
    const finishedAt = NOW.getTime() - 10 * 60 * 1000;
    const base = {
      milestones: afterOne,
      facts: { finishedGames: 1, savedGames: 1, matchDayPending: false },
    };
    expect(dueLayoutNotice(input({ ...base, session: { baseline: 0, reachedAt: { 2: finishedAt } } }))).toBeNull();
    expect(
      dueLayoutNotice(input({
        ...base,
        session: { baseline: 0, reachedAt: { 2: NOW.getTime() - SAME_SESSION_WAIT_MS } },
      })),
    ).toBe(2);
  });

  it('no reminder before the session has seen the games', () => {
    expect(
      dueLayoutNotice(input({
        milestones: afterOne,
        facts: { finishedGames: 1, savedGames: 1, matchDayPending: false },
        session: null,
      })),
    ).toBeNull();
  });

  it('#3 after the third finished game, not at two', () => {
    const milestones = { ...afterOne, layoutNotice2Shown: YESTERDAY };
    expect(
      dueLayoutNotice(input({
        milestones,
        facts: { finishedGames: 2, savedGames: 2, matchDayPending: false },
        session: { baseline: 2, reachedAt: {} },
      })),
    ).toBeNull();
    expect(
      dueLayoutNotice(input({
        milestones,
        facts: { finishedGames: 3, savedGames: 3, matchDayPending: false },
        session: { baseline: 3, reachedAt: {} },
      })),
    ).toBe(3);
  });

  it('three games before #2 was seen: #3 is shown and marks #2 with it', () => {
    expect(
      dueLayoutNotice(input({
        milestones: afterOne,
        facts: { finishedGames: 3, savedGames: 3, matchDayPending: false },
        session: { baseline: 3, reachedAt: {} },
      })),
    ).toBe(3);
    expect(shownMarks(3)).toEqual(['layoutNotice1Shown', 'layoutNotice2Shown', 'layoutNotice3Shown']);
    expect(shownMarks(1)).toEqual(['layoutNotice1Shown']);
  });

  it('never again after #3', () => {
    expect(
      dueLayoutNotice(input({
        milestones: { layoutNotice1Shown: YESTERDAY, layoutNotice2Shown: YESTERDAY, layoutNotice3Shown: YESTERDAY },
        facts: { finishedGames: 10, savedGames: 10, matchDayPending: false },
        session: { baseline: 10, reachedAt: {} },
      })),
    ).toBeNull();
  });

  it('at most once a day', () => {
    expect(
      dueLayoutNotice(input({
        milestones: { layoutNotice1Shown: EARLIER_TODAY },
        facts: { finishedGames: 1, savedGames: 1, matchDayPending: false },
        session: { baseline: 1, reachedAt: {} },
      })),
    ).toBeNull();
  });

  it('nothing after "Älä näytä enää"', () => {
    expect(
      dueLayoutNotice(input({
        milestones: { ...afterOne, layoutNoticeStopped: YESTERDAY },
        facts: { finishedGames: 3, savedGames: 3, matchDayPending: false },
        session: { baseline: 3, reachedAt: {} },
      })),
    ).toBeNull();
  });
});

describe('observeFinishedGames (this app session)', () => {
  beforeEach(() => resetLayoutNoticeSession());

  it('the first read is the baseline; a later rise notes when each threshold was reached', () => {
    observeFinishedGames('u1', 0, 1000);
    expect(getFinishedGamesSession('u1')).toEqual({ baseline: 0, reachedAt: {} });
    observeFinishedGames('u1', 1, 2000);
    observeFinishedGames('u1', 1, 3000);
    expect(getFinishedGamesSession('u1')?.reachedAt).toEqual({ 2: 2000 });
    observeFinishedGames('u1', 3, 4000);
    expect(getFinishedGamesSession('u1')?.reachedAt).toEqual({ 2: 2000, 3: 4000 });
  });

  it('a count already reached at launch is not "reached in this session"', () => {
    observeFinishedGames('u2', 3, 1000);
    observeFinishedGames('u2', 4, 2000);
    expect(getFinishedGamesSession('u2')).toEqual({ baseline: 3, reachedAt: {} });
    expect(getFinishedGamesSession('other')).toBeNull();
  });
});

describe('layoutNoticeFacts', () => {
  const game = (overrides: Partial<AppState>): AppState => ({ gameStatus: 'notStarted', ...overrides } as AppState);

  it('counts finished games and spots a match today that has not kicked off', () => {
    const facts = layoutNoticeFacts(
      {
        a: game({ gameStatus: 'gameEnd', gameDate: '2026-11-20', homeScore: 2 }),
        b: game({ gameDate: '2026-11-25' }),
        unsaved_game: game({ gameStatus: 'gameEnd' }),
      },
      '2026-11-25',
    );
    expect(facts).toEqual({ finishedGames: 1, savedGames: 2, matchDayPending: true });
  });

  it('a match today that has kicked off is not "before kick-off"', () => {
    const facts = layoutNoticeFacts({ b: game({ gameDate: '2026-11-25', gameStatus: 'inProgress' }) }, '2026-11-25');
    expect(facts.matchDayPending).toBe(false);
  });
});
