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

  it('rejects scheduledSubs longer than SCHEDULED_SUBS_MAX (DoS guard)', () => {
    // Hand-crafted backup files could pump tens of thousands of subs
    // into a single game; the sub-banner UI would freeze on restore.
    // Cap is 500 per validation.ts. 501 entries should trip.
    const subs = Array.from({ length: 501 }, (_, i) =>
      wellFormedSub({ id: `sub_${i}`, timeSeconds: i * 10 }),
    );
    const game = { ...baseGame(), scheduledSubs: subs };
    expect(() => validateGame(game)).toThrow(/scheduledSubs cannot exceed 500/);
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

  it('rejects gameIds longer than PLANNING_SESSION_GAME_IDS_MAX (DoS guard)', () => {
    // Mirrors migration 036's RPC cap. A backup-restore over 100 would
    // corrupt activation downstream because RPC scope-matching uses
    // canonical_game_ids and the cap is enforced server-side.
    const overcap = Array.from({ length: 101 }, (_, i) => `g${i}`);
    const draft: PlanningSession['draft'] = {};
    for (const gid of overcap) {
      draft[gid] = { startingXI: {}, bench: [], scheduledSubs: [] };
    }
    expect(() =>
      validatePlanningSession(baseSession({ gameIds: overcap, draft })),
    ).toThrow(/gameIds cannot exceed 100/);
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects reserved role key "%s" in startingXI (prototype-pollution defense)',
    (badKey) => {
      const session = baseSession();
      // Cast through unknown — the type forbids the bad keys but the
      // sync/upsert path can construct them from raw JSON.
      session.draft.g1.startingXI = {
        [badKey]: 'p1',
      } as unknown as PlanningSession['draft'][string]['startingXI'];
      expect(() => validatePlanningSession(session)).toThrow(
        /startingXI uses reserved role key/,
      );
    },
  );

  it('rejects startingXI duplicating a playerId across roles', () => {
    const session = baseSession();
    session.draft.g1.startingXI = { GK: 'p1', LB: 'p1' };
    expect(() => validatePlanningSession(session)).toThrow(
      /startingXI duplicates playerId "p1"/,
    );
  });

  it('rejects a player appearing in both startingXI and bench', () => {
    const session = baseSession();
    session.draft.g1.startingXI = { GK: 'p1', LB: 'p2' };
    session.draft.g1.bench = ['p1', 'p3'];
    expect(() => validatePlanningSession(session)).toThrow(
      /player "p1" appears in both startingXI and bench/,
    );
  });

  it('rejects scheduledSubs longer than SCHEDULED_SUBS_MAX per draft (DoS guard)', () => {
    const session = baseSession();
    session.draft.g1.scheduledSubs = Array.from({ length: 501 }, (_, i) => ({
      id: `sub_${i}`,
      timeSeconds: i * 10,
      inPlayer: 'p3',
      positionRole: 'LB',
    }));
    expect(() => validatePlanningSession(session)).toThrow(
      /scheduledSubs cannot exceed 500/,
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

  // parentSessionId carries the named-version → parent linkage. The
  // validator only catches structural violations (the parent-exists
  // invariant is enforced at the DataStore boundary, since the
  // validator can't reach the store).
  describe('parentSessionId validation', () => {
    it('accepts undefined parentSessionId (top-level parent plan)', () => {
      const session = baseSession({ parentSessionId: undefined });
      expect(() => validatePlanningSession(session)).not.toThrow();
    });

    it('accepts a non-empty parentSessionId pointing at a different session', () => {
      const session = baseSession({
        id: 'planningSession_child',
        parentSessionId: 'planningSession_parent',
      });
      expect(() => validatePlanningSession(session)).not.toThrow();
    });

    it('rejects an empty-string parentSessionId', () => {
      const session = baseSession({ parentSessionId: '' });
      expect(() => validatePlanningSession(session)).toThrow(
        /parentSessionId must be a non-empty string/,
      );
    });

    it('rejects a parentSessionId that equals session.id (self-parent cycle)', () => {
      const session = baseSession({
        id: 'planningSession_self',
        parentSessionId: 'planningSession_self',
      });
      expect(() => validatePlanningSession(session)).toThrow(
        /self-parent cycle/,
      );
    });

    it('rejects a non-string parentSessionId', () => {
      const session = baseSession({
        parentSessionId: 123 as unknown as string,
      });
      expect(() => validatePlanningSession(session)).toThrow(
        /parentSessionId must be a non-empty string/,
      );
    });

    it('treats null parentSessionId as absent (defensive guard)', () => {
      // Defensive against raw DB rows that bypass the `?? undefined`
      // conversion in transformPlanningSessionFromDb. The TS type is
      // `string | undefined`, but the validator treats null as "no
      // parent" rather than throwing on it.
      const session = baseSession({
        parentSessionId: null as unknown as undefined,
      });
      expect(() => validatePlanningSession(session)).not.toThrow();
    });
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
