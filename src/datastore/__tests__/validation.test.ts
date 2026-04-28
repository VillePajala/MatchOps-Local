/**
 * Tests for shared DataStore validation helpers.
 *
 * @critical Both LocalDataStore and SupabaseDataStore call into validateGame,
 * so a regression here breaks both backends silently.
 */

import { validateGame } from '../validation';
import { ValidationError } from '@/interfaces/DataStoreErrors';
import type { AppState, ScheduledSub } from '@/types/game';

const baseGame = (): AppState => ({
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [],
  showPlayerNames: true,
  teamName: 'My Team',
  gameEvents: [],
  opponentName: 'Opponent',
  gameDate: '2026-04-28',
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 10,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  isPlayed: true,
  selectedPlayerIds: [],
  assessments: {},
  seasonId: '',
  tournamentId: '',
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0.5, relY: 0.5 },
  completedIntervalDurations: [],
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
    expect(() => validateGame(game)).toThrow(ValidationError);
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
