import { resolveGameResult } from './gameResult';
import { getShootoutTally, getShootoutWinner, hasDecidedShootout } from './shootout';
import type { ShootoutKick } from '@/types/game';

const kick = (team: 'home' | 'away', scored: boolean, order: number): ShootoutKick => ({
  id: `k${order}`,
  team,
  scored,
  order,
});

describe('shootout derivation', () => {
  it('tallies scored kicks per side', () => {
    const kicks = [kick('home', true, 0), kick('away', false, 1), kick('home', true, 2), kick('away', true, 3)];
    expect(getShootoutTally(kicks)).toEqual({ home: 2, away: 1 });
  });

  it('returns zero tally for undefined/empty', () => {
    expect(getShootoutTally(undefined)).toEqual({ home: 0, away: 0 });
    expect(getShootoutTally([])).toEqual({ home: 0, away: 0 });
  });

  it('picks the winner by higher tally', () => {
    expect(getShootoutWinner([kick('home', true, 0), kick('away', false, 1)])).toBe('home');
    expect(getShootoutWinner([kick('home', false, 0), kick('away', true, 1)])).toBe('away');
  });

  it('returns null for no kicks or a level/undecided shootout', () => {
    expect(getShootoutWinner(undefined)).toBeNull();
    expect(getShootoutWinner([])).toBeNull();
    expect(getShootoutWinner([kick('home', true, 0), kick('away', true, 1)])).toBeNull();
    expect(hasDecidedShootout([kick('home', true, 0), kick('away', true, 1)])).toBe(false);
  });

  it('handles free-form formats (single pair, best-of-3) by counting only', () => {
    // single-pair sudden death: home scores, away misses
    expect(getShootoutWinner([kick('home', true, 0), kick('away', false, 1)])).toBe('home');
    // best-of-3 ending 2-1
    const bo3 = [
      kick('home', true, 0), kick('away', true, 1),
      kick('home', false, 2), kick('away', false, 3),
      kick('home', true, 4), kick('away', false, 5),
    ];
    expect(getShootoutTally(bo3)).toEqual({ home: 2, away: 1 });
    expect(getShootoutWinner(bo3)).toBe('home');
  });
});

describe('resolveGameResult', () => {
  it('resolves regulation results by side (home perspective)', () => {
    expect(resolveGameResult({ homeScore: 2, awayScore: 1, homeOrAway: 'home' })).toBe('W');
    expect(resolveGameResult({ homeScore: 1, awayScore: 2, homeOrAway: 'home' })).toBe('L');
    expect(resolveGameResult({ homeScore: 1, awayScore: 1, homeOrAway: 'home' })).toBe('D');
  });

  it('inverts correctly when we are the away side', () => {
    expect(resolveGameResult({ homeScore: 2, awayScore: 1, homeOrAway: 'away' })).toBe('L');
    expect(resolveGameResult({ homeScore: 1, awayScore: 2, homeOrAway: 'away' })).toBe('W');
  });

  it('is identical to legacy logic for games without a shootout (back-compat)', () => {
    // level with no shootout stays a draw
    expect(resolveGameResult({ homeScore: 0, awayScore: 0, homeOrAway: 'home' })).toBe('D');
    expect(resolveGameResult({ homeScore: 3, awayScore: 3, homeOrAway: 'away', shootoutKicks: [] })).toBe('D');
  });

  it('breaks a level score via the penalty shootout (home perspective)', () => {
    const game = {
      homeScore: 3,
      awayScore: 3,
      homeOrAway: 'home' as const,
      shootoutKicks: [kick('home', true, 0), kick('away', false, 1)],
    };
    expect(resolveGameResult(game)).toBe('W');
  });

  it('breaks a level score via the penalty shootout (away perspective)', () => {
    const game = {
      homeScore: 2,
      awayScore: 2,
      homeOrAway: 'away' as const,
      shootoutKicks: [kick('home', true, 0), kick('away', false, 1)],
    };
    // home won the shootout, but we are away → Loss
    expect(resolveGameResult(game)).toBe('L');
  });

  it('resolves from a decided shootout on the kicks alone (no separate flag needed)', () => {
    // The logged kicks are the authority — a recorded shootout always resolves.
    const game = {
      homeScore: 3,
      awayScore: 3,
      homeOrAway: 'home' as const,
      shootoutKicks: [kick('home', true, 0), kick('away', false, 1)],
    };
    expect(resolveGameResult(game)).toBe('W');
  });

  it('a shootout never overrides a decided score', () => {
    // unequal score → shootout (if somehow present) is ignored
    const game = {
      homeScore: 4,
      awayScore: 2,
      homeOrAway: 'home' as const,
      shootoutKicks: [kick('away', true, 0)],
    };
    expect(resolveGameResult(game)).toBe('W');
  });

  it('a tied/incomplete shootout leaves the game a draw', () => {
    const game = {
      homeScore: 1,
      awayScore: 1,
      homeOrAway: 'home' as const,
      shootoutKicks: [kick('home', true, 0), kick('away', true, 1)],
    };
    expect(resolveGameResult(game)).toBe('D');
  });
});
