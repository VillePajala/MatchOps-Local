import { appStateSchema } from './appStateSchema';

describe('appStateSchema', () => {
  const valid = {
    playersOnField: [],
    opponents: [],
    drawings: [],
    availablePlayers: [],
    showPlayerNames: true,
    teamName: 'Team',
    gameEvents: [],
    opponentName: 'Opp',
    gameDate: '2025-01-01',
    homeScore: 0,
    awayScore: 0,
    gameNotes: '',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 10,
    currentPeriod: 1,
    gameStatus: 'notStarted',
    selectedPlayerIds: [],
    seasonId: 's',
    tournamentId: 't',
    tacticalDiscs: [],
    tacticalDrawings: [],
    tacticalBallPosition: { relX: 0, relY: 0 },
  };

  it('parses valid state', () => {
    const result = appStateSchema.parse(valid);
    // The schema may add default values, so we check that our input is contained in the result
    expect(result).toMatchObject(valid);
    // Check that demandFactor gets the default value
    expect(result.demandFactor).toBe(1);
  });

  it('fails for invalid data', () => {
    expect(() => appStateSchema.parse({ ...valid, homeScore: 'bad' })).toThrow();
  });

  describe('scheduledSubs strictness (mirrors validateScheduledSubs)', () => {
    const subValid = {
      id: 's1',
      timeSeconds: 600,
      outPlayer: 'p1',
      inPlayer: 'p2',
      positionRole: 'LB',
      status: 'pending' as const,
    };

    it('accepts a valid scheduled sub array', () => {
      const result = appStateSchema.parse({
        ...valid,
        scheduledSubs: [subValid],
      });
      expect(result.scheduledSubs).toHaveLength(1);
    });

    it('rejects empty positionRole', () => {
      expect(() =>
        appStateSchema.parse({
          ...valid,
          scheduledSubs: [{ ...subValid, positionRole: '' }],
        }),
      ).toThrow();
    });

    it('rejects self-substitution (outPlayer === inPlayer)', () => {
      expect(() =>
        appStateSchema.parse({
          ...valid,
          scheduledSubs: [{ ...subValid, inPlayer: 'p1' }],
        }),
      ).toThrow();
    });

    it('rejects duplicate scheduled-sub ids', () => {
      expect(() =>
        appStateSchema.parse({
          ...valid,
          scheduledSubs: [subValid, { ...subValid, inPlayer: 'p3' }],
        }),
      ).toThrow();
    });

    it('rejects fractional timeSeconds (mirrors integer-only DataStore)', () => {
      expect(() =>
        appStateSchema.parse({
          ...valid,
          scheduledSubs: [{ ...subValid, timeSeconds: 1.5 }],
        }),
      ).toThrow();
    });
  });
});
