import { appStateSchema, gameEventSchema } from './appStateSchema';

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

  /** Review 11.1: a game in extra time (period 3-4) is valid; period 5 is not. */
  it('accepts extra-time periods and their fields', () => {
    expect(appStateSchema.safeParse({ ...valid, currentPeriod: 3, extraTimePeriods: 2, extraTimeMinutes: 15 }).success).toBe(true);
    expect(appStateSchema.safeParse({ ...valid, currentPeriod: 5 }).success).toBe(false);
    expect(appStateSchema.safeParse({ ...valid, extraTimePeriods: 3 }).success).toBe(false);
    // Bounded by the game's own structure: a plain 2-period game cannot be in period 3.
    expect(appStateSchema.safeParse({ ...valid, numberOfPeriods: 2, currentPeriod: 3 }).success).toBe(false);
    // Extra time needs whole-minute lengths.
    expect(appStateSchema.safeParse({ ...valid, currentPeriod: 3, extraTimePeriods: 2 }).success).toBe(false);
    expect(appStateSchema.safeParse({ ...valid, currentPeriod: 3, extraTimePeriods: 2, extraTimeMinutes: 7.5 }).success).toBe(false);
  });

  it('fails for invalid data', () => {
    expect(() => appStateSchema.parse({ ...valid, homeScore: 'bad' })).toThrow();
  });
});

describe('gameEventSchema - Kirjuri note events (migration 041)', () => {
  /** @critical - backup restore parses with this schema; a rejected note would throw the whole restore. */
  it('parses a note event with period, text and source', () => {
    const parsed = gameEventSchema.parse({
      id: 'n1', type: 'note', time: 1834, period: 2, entityId: 'p2', text: 'hieno syöttö', source: 'dictation',
    });
    expect(parsed).toMatchObject({ type: 'note', period: 2, text: 'hieno syöttö', source: 'dictation' });
  });

  it('rejects an unknown note source', () => {
    expect(() => gameEventSchema.parse({ id: 'n1', type: 'note', time: 1, text: 'x', source: 'robot' })).toThrow();
  });
});

describe('fields the AI work added survive an import', () => {
  /**
   * @critical - Zod strips unknown keys and the PARSED object is what gets
   * saved, so a field missing from the schema is lost on every import. The
   * debrief tag is what tells a later draft "this is the coach's own account",
   * and aiMeta is the only record of which model wrote a line.
   */
  it('keeps a note tag and its provenance', () => {
    const parsed = gameEventSchema.parse({
      id: 'n1',
      type: 'note',
      time: 3000,
      period: 2,
      text: 'Oma yhteenvetoni ottelusta',
      source: 'dictation',
      tag: 'debrief',
      aiMeta: { model: 'gpt-5-mini', packet: 'v1-abcdef0123456789' },
    });

    expect(parsed.tag).toBe('debrief');
    expect(parsed.aiMeta).toEqual({ model: 'gpt-5-mini', packet: 'v1-abcdef0123456789' });
  });

  it('rejects a tag it does not know rather than storing it', () => {
    expect(() =>
      gameEventSchema.parse({ id: 'n1', type: 'note', time: 1, text: 'x', tag: 'invented' }),
    ).toThrow();
  });
});
