import { computeScoreFromEvents, adjustScoreForRemovedEvent } from './gameEventScore';
import type { AppState, GameEvent } from '@/types';

const ev = (type: GameEvent['type'], id: string): GameEvent => ({ id, type, time: 0 });

const base = (overrides: Partial<AppState>): Pick<AppState, 'homeOrAway' | 'homeScore' | 'awayScore'> & { gameEvents?: GameEvent[] } => ({
  homeOrAway: 'home',
  homeScore: 0,
  awayScore: 0,
  ...overrides,
});

describe('computeScoreFromEvents', () => {
  it('maps our/opponent goals to home/away for a home game', () => {
    const game = base({
      homeOrAway: 'home',
      gameEvents: [ev('goal', 'g1'), ev('goal', 'g2'), ev('opponentGoal', 'o1')],
    });
    expect(computeScoreFromEvents(game)).toEqual({ homeScore: 2, awayScore: 1 });
  });

  it('puts our goals in awayScore for an away game', () => {
    const game = base({
      homeOrAway: 'away',
      gameEvents: [ev('goal', 'g1'), ev('opponentGoal', 'o1'), ev('opponentGoal', 'o2')],
    });
    // our 1 (away), opponent 2 (home)
    expect(computeScoreFromEvents(game)).toEqual({ homeScore: 2, awayScore: 1 });
  });

  it('ignores non-goal events', () => {
    const game = base({
      homeOrAway: 'home',
      gameEvents: [ev('goal', 'g1'), ev('substitution', 's1'), ev('periodEnd', 'p1')],
    });
    expect(computeScoreFromEvents(game)).toEqual({ homeScore: 1, awayScore: 0 });
  });

  it('returns 0-0 with no events', () => {
    expect(computeScoreFromEvents(base({ gameEvents: [] }))).toEqual({ homeScore: 0, awayScore: 0 });
  });
});

describe('adjustScoreForRemovedEvent', () => {
  it('decrements our tally (home) for a removed goal', () => {
    expect(adjustScoreForRemovedEvent(base({ homeScore: 2, awayScore: 1 }), ev('goal', 'g')))
      .toEqual({ homeScore: 1, awayScore: 1 });
  });

  it('decrements our tally (away → awayScore) for a removed goal', () => {
    expect(adjustScoreForRemovedEvent(base({ homeOrAway: 'away', homeScore: 3, awayScore: 2 }), ev('goal', 'g')))
      .toEqual({ homeScore: 3, awayScore: 1 });
  });

  it('leaves the score unchanged for a non-goal event', () => {
    expect(adjustScoreForRemovedEvent(base({ homeScore: 2, awayScore: 1 }), ev('substitution', 's')))
      .toEqual({ homeScore: 2, awayScore: 1 });
  });

  it('never goes below zero', () => {
    expect(adjustScoreForRemovedEvent(base({ homeScore: 0, awayScore: 0 }), ev('goal', 'g')))
      .toEqual({ homeScore: 0, awayScore: 0 });
  });
});
