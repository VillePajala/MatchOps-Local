/**
 * Tests for shared DataStore validation helpers.
 *
 * @critical Both LocalDataStore and SupabaseDataStore call into validateGame,
 * so a regression here breaks both backends silently.
 */

import { validateGame, validatePlanningSession, sortedGameIdsKey } from '@/datastore/validation';
import type { ScheduledSub } from '@/types/game';
import type { PlanningSession } from '@/types';
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

const baseSession = (
  overrides: Partial<PlanningSession> = {},
): PlanningSession => ({
  id: 'planningSession_1',
  teamId: 'team_1',
  name: 'Lauto 80 Verne-5',
  gameIds: ['g1', 'g2'],
  draft: {
    g1: {
      startingXI: { GK: 'p1', LB: 'p2' },
      bench: ['p3'],
      scheduledSubs: [
        { id: 's1', timeSeconds: 600, inPlayer: 'p3', positionRole: 'LB' },
      ],
    },
    g2: {
      startingXI: { GK: 'p1' },
      bench: ['p2', 'p3'],
      scheduledSubs: [],
    },
  },
  isActive: false,
  createdAt: '2026-04-30T12:00:00.000Z',
  updatedAt: '2026-04-30T12:00:00.000Z',
  ...overrides,
});

describe('validatePlanningSession', () => {
  it('accepts a well-formed session', () => {
    expect(() => validatePlanningSession(baseSession())).not.toThrow();
  });

  it('rejects an empty name', () => {
    expect(() =>
      validatePlanningSession(baseSession({ name: '   ' })),
    ).toThrow(/name must be a non-empty string/);
  });

  it('rejects a name exceeding the max length', () => {
    expect(() =>
      validatePlanningSession(baseSession({ name: 'x'.repeat(201) })),
    ).toThrow(/cannot exceed 200 characters/);
  });

  it('rejects a missing teamId', () => {
    expect(() =>
      validatePlanningSession(baseSession({ teamId: '' })),
    ).toThrow(/teamId must be a non-empty string/);
  });

  it('rejects an empty gameIds array', () => {
    expect(() =>
      validatePlanningSession(baseSession({ gameIds: [], draft: {} })),
    ).toThrow(/gameIds must be a non-empty array/);
  });

  it('rejects duplicate gameIds', () => {
    expect(() =>
      validatePlanningSession(
        baseSession({
          gameIds: ['g1', 'g1'],
          draft: {
            g1: {
              startingXI: {},
              bench: [],
              scheduledSubs: [],
            },
          },
        }),
      ),
    ).toThrow(/gameIds contains duplicate id "g1"/);
  });

  it('rejects a draft entry for a game not in gameIds', () => {
    const session = baseSession();
    session.draft.g3 = { startingXI: {}, bench: [], scheduledSubs: [] };
    expect(() => validatePlanningSession(session)).toThrow(
      /draft contains entry for gameId "g3" not present in gameIds/,
    );
  });

  it('rejects a session that lists a gameId without a matching draft entry', () => {
    // Parity check: every gameId must have a draft entry, otherwise a
    // partial cloud-write loads silently empty.
    const session = baseSession();
    delete (session.draft as Record<string, unknown>).g2;
    expect(() => validatePlanningSession(session)).toThrow(
      /draft is missing entry for gameId "g2" listed in gameIds/,
    );
  });

  it('rejects a non-object draft value', () => {
    expect(() =>
      validatePlanningSession({
        ...baseSession(),
        draft: { g1: 'oops' as unknown as PlanningSession['draft'][string] },
      } as PlanningSession),
    ).toThrow(/draft.g1 must be an object/);
  });

  it('rejects a non-object startingXI', () => {
    const session = baseSession();
    (session.draft.g1.startingXI as unknown) = 'oops';
    expect(() => validatePlanningSession(session)).toThrow(
      /startingXI must be a Record/,
    );
  });

  it('rejects a non-string playerId in startingXI', () => {
    const session = baseSession();
    (session.draft.g1.startingXI as Record<string, unknown>).GK = 42;
    expect(() => validatePlanningSession(session)).toThrow(
      /startingXI\[GK\] must be a non-empty playerId/,
    );
  });

  it('rejects a bench that is not an array', () => {
    const session = baseSession();
    (session.draft.g1.bench as unknown) = 'oops';
    expect(() => validatePlanningSession(session)).toThrow(
      /bench must be an array/,
    );
  });

  it('rejects a draft scheduledSub with negative timeSeconds', () => {
    const session = baseSession();
    session.draft.g1.scheduledSubs[0].timeSeconds = -1;
    expect(() => validatePlanningSession(session)).toThrow(
      /timeSeconds must be a non-negative integer/,
    );
  });

  it('rejects a draft scheduledSub with duplicate id', () => {
    const session = baseSession();
    session.draft.g1.scheduledSubs.push({
      id: session.draft.g1.scheduledSubs[0].id,
      timeSeconds: 1200,
      inPlayer: 'p4',
      positionRole: 'LB',
    });
    expect(() => validatePlanningSession(session)).toThrow(
      /duplicates an earlier entry/,
    );
  });

  it('does not require status or outPlayer (these are draft-only)', () => {
    // Drafts intentionally omit `status` and `outPlayer` per
    // DraftScheduledSub (status set on Apply, outPlayer computed lazily).
    const session = baseSession();
    expect(session.draft.g1.scheduledSubs[0]).not.toHaveProperty('status');
    expect(session.draft.g1.scheduledSubs[0]).not.toHaveProperty('outPlayer');
    expect(() => validatePlanningSession(session)).not.toThrow();
  });

  // Pass-17 Minor 3: includedGameIds entries that don't have a draft
  // entry would silently produce empty minutes (aggregatePlanMinutes
  // skips gameIds with no draft). Catch at the save boundary so a
  // programmatic caller (sync replay, future import) can't land an
  // inconsistent session.
  it('rejects includedGameIds entries that have no draft entry', () => {
    const session = baseSession({
      // includedGameIds references g2, but draft only has g1.
      includedGameIds: ['g2'],
      draft: {
        g1: {
          startingXI: { GK: 'p1' },
          bench: ['p2'],
          scheduledSubs: [],
        },
      },
    });
    expect(() => validatePlanningSession(session)).toThrow(
      /has no entry in draft/,
    );
  });

  it('accepts includedGameIds === undefined ("all included") even with sparse draft', () => {
    // Legacy sessions can have sparse drafts (lazy-seeded at load time
    // by the editor). undefined includedGameIds means "all included" —
    // missing draft entries contribute nothing but don't break.
    const session = baseSession({
      includedGameIds: undefined,
      gameIds: ['g1', 'g2'],
      draft: {
        g1: {
          startingXI: { GK: 'p1' },
          bench: ['p2'],
          scheduledSubs: [],
        },
      },
    });
    expect(() => validatePlanningSession(session)).not.toThrow();
  });
});

describe('sortedGameIdsKey', () => {
  it('produces the same key for the same set in different order', () => {
    expect(sortedGameIdsKey(['b', 'a', 'c'])).toBe(sortedGameIdsKey(['c', 'a', 'b']));
  });

  it('produces a different key for different sets', () => {
    expect(sortedGameIdsKey(['a', 'b'])).not.toBe(sortedGameIdsKey(['a', 'c']));
  });

  it('handles a single-element array', () => {
    expect(sortedGameIdsKey(['only'])).toBe('only');
  });

  // Locks in the no-collision contract: a separator that could appear
  // inside any plausible gameId would let `sortedGameIdsKey(['a b'])`
  // and `sortedGameIdsKey(['a', 'b'])` collide. The current
  // `game_{ts}_{rand}` format excludes spaces, but the validator
  // accepts non-empty strings without rejecting whitespace, so the
  // separator must be non-collidable on its own. NUL byte (\x00) was
  // chosen because JS strings can hold it but no game ID format can
  // produce it.
  it('does not collide when gameIds contain spaces or printable separators', () => {
    expect(sortedGameIdsKey(['a b'])).not.toBe(sortedGameIdsKey(['a', 'b']));
    expect(sortedGameIdsKey(['a,b'])).not.toBe(sortedGameIdsKey(['a', 'b']));
    expect(sortedGameIdsKey(['a|b'])).not.toBe(sortedGameIdsKey(['a', 'b']));
  });

  // pass-17 Issue 4: parity with migration 036's
  //   `WHERE g IS NOT NULL AND g <> ''`
  // canonicalization. Validator rejects empties under the normal save
  // path, so this is purely defensive — locks LocalDataStore vs SQL
  // canonical-key agreement against a future bug routing around
  // validation.
  it('filters empty strings to match SQL canonicalization (migration 036)', () => {
    expect(sortedGameIdsKey(['a', '', 'b'])).toBe(sortedGameIdsKey(['a', 'b']));
    expect(sortedGameIdsKey([''])).toBe('');
  });
});
