/**
 * Tests for shared DataStore validation helpers.
 *
 * @critical Both LocalDataStore and SupabaseDataStore call into validateGame,
 * so a regression here breaks both backends silently.
 */

import { validateGame } from '@/datastore/validation';
import type { ScheduledSub } from '@/types/game';
import { TestFixtures } from '../../../tests/fixtures';

const baseGame = () => TestFixtures.games.newGame({
  // Validation needs these explicitly set / well-formed for the suite
  // to focus on scheduledSubs without unrelated noise.
  seasonId: '',
  tournamentId: '',
});

const wellFormedSub = (overrides: Partial<ScheduledSub> = {}): ScheduledSub => ({
  id: 'sub_1',
  timeSeconds: 600,
  outPlayer: 'p1',
  inPlayer: 'p2',
  positionRole: 'CDM',
  status: 'pending',
  ...overrides,
});

describe('validateGame — scheduledSubs', () => {
  it('accepts a game with no scheduledSubs field', () => {
    const game = baseGame();
    delete game.scheduledSubs;
    expect(() => validateGame(game)).not.toThrow();
  });

  it('accepts an empty scheduledSubs array', () => {
    const game = { ...baseGame(), scheduledSubs: [] };
    expect(() => validateGame(game)).not.toThrow();
  });

  it('accepts a well-formed scheduledSubs array', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [
        wellFormedSub(),
        wellFormedSub({ id: 'sub_2', timeSeconds: 0, status: 'fired' }),
        wellFormedSub({ id: 'sub_3', status: 'skipped' }),
      ],
    };
    expect(() => validateGame(game)).not.toThrow();
  });

  it('rejects scheduledSubs that is not an array', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: 'not-an-array' as unknown as ScheduledSub[],
    };
    // toThrow(regex) also asserts something was thrown — single check is enough.
    expect(() => validateGame(game)).toThrow(/scheduledSubs must be an array/);
  });

  it('rejects an entry that is not an object', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [null as unknown as ScheduledSub],
    };
    expect(() => validateGame(game)).toThrow(/scheduledSubs\[0\] must be an object/);
  });

  it('rejects an entry missing id', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [wellFormedSub({ id: '' })],
    };
    expect(() => validateGame(game)).toThrow(/scheduledSubs\[0\]\.id/);
  });

  it('rejects an entry with non-finite timeSeconds', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [wellFormedSub({ timeSeconds: Number.NaN })],
    };
    expect(() => validateGame(game)).toThrow(/timeSeconds/);
  });

  it('rejects an entry with negative timeSeconds', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [wellFormedSub({ timeSeconds: -1 })],
    };
    expect(() => validateGame(game)).toThrow(/timeSeconds/);
  });

  it('rejects an entry with fractional timeSeconds (live timer ticks in whole seconds)', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [wellFormedSub({ timeSeconds: 600.5 })],
    };
    expect(() => validateGame(game)).toThrow(/timeSeconds.*integer/i);
  });

  it('rejects an entry missing outPlayer', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [wellFormedSub({ outPlayer: '' })],
    };
    expect(() => validateGame(game)).toThrow(/outPlayer/);
  });

  it('rejects an entry missing inPlayer', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [wellFormedSub({ inPlayer: '   ' })],
    };
    expect(() => validateGame(game)).toThrow(/inPlayer/);
  });

  it('rejects an entry where outPlayer equals inPlayer (player cannot sub for themselves)', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [wellFormedSub({ outPlayer: 'p1', inPlayer: 'p1' })],
    };
    expect(() => validateGame(game)).toThrow(/inPlayer must differ from outPlayer/);
  });

  it('rejects scheduledSubs with duplicate ids (live-timer lookup must be unambiguous)', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [
        wellFormedSub({ id: 'sub_dup' }),
        wellFormedSub({ id: 'sub_dup', timeSeconds: 900 }),
      ],
    };
    expect(() => validateGame(game)).toThrow(/duplicate id "sub_dup"/);
  });

  it('rejects an entry missing positionRole', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [wellFormedSub({ positionRole: '' })],
    };
    expect(() => validateGame(game)).toThrow(/positionRole/);
  });

  it('rejects an entry with invalid status', () => {
    const game = {
      ...baseGame(),
      scheduledSubs: [
        wellFormedSub({ status: 'queued' as unknown as ScheduledSub['status'] }),
      ],
    };
    expect(() => validateGame(game)).toThrow(/status must be one of/);
  });

  it('still validates other fields when scheduledSubs is OK', () => {
    const game = { ...baseGame(), teamName: '', scheduledSubs: [] };
    expect(() => validateGame(game)).toThrow(/Missing required game fields/);
  });
});
