import { computeGameCompleteness, type CompletenessGame } from './gameCompleteness';

const base: CompletenessGame = {
  isPlayed: true,
  gameNotes: '',
  selectedPlayerIds: ['p1', 'p2', 'p3', 'p4'],
  seasonId: '',
  tournamentId: '',
  teamId: '',
  playerPositions: {},
  assessments: {},
};

describe('computeGameCompleteness', () => {
  it('planned (isPlayed false) games are not applicable', () => {
    const c = computeGameCompleteness({ ...base, isPlayed: false, gameNotes: 'x' });
    expect(c.applicable).toBe(false);
    expect(c.overall).toBe('empty');
  });

  it('core = report + roster; complete once the report is written', () => {
    const empty = computeGameCompleteness(base);
    expect(empty.roster).toBe(true); // squad selected
    expect(empty.report).toBe(false);
    expect(empty.coreComplete).toBe(false);
    expect(empty.overall).toBe('empty');

    const withReport = computeGameCompleteness({ ...base, gameNotes: '  Good game  ' });
    expect(withReport.report).toBe(true);
    expect(withReport.coreComplete).toBe(true);
    expect(withReport.overall).toBe('complete');
  });

  it('does NOT depend on the timer/gameEnd - report alone completes a played game', () => {
    // No gameStatus anywhere in the model; a played game with a report is complete.
    const c = computeGameCompleteness({ ...base, gameNotes: 'report' });
    expect(c.overall).toBe('complete');
  });

  it('counts positions and assessments over the squad', () => {
    const c = computeGameCompleteness({
      ...base,
      playerPositions: { p1: ['gk'], p2: ['cb', 'rb'], pX: ['st'] }, // pX not in squad -> ignored
      assessments: { p1: {}, p2: {}, p3: {} },
    });
    expect(c.positions).toEqual({ done: 2, total: 4 });
    expect(c.assessments).toEqual({ done: 3, total: 4 });
  });

  it('recommended items make it partial but never block complete', () => {
    // competition/team set but no report -> still not complete (report is core).
    const c = computeGameCompleteness({ ...base, seasonId: 's1', teamId: 't1' });
    expect(c.competition).toBe(true);
    expect(c.team).toBe(true);
    expect(c.coreComplete).toBe(false);
    expect(c.overall).toBe('partial');
  });

  it('enriched = complete + competition + team + some positions & assessments', () => {
    const notEnriched = computeGameCompleteness({ ...base, gameNotes: 'r' });
    expect(notEnriched.coreComplete).toBe(true);
    expect(notEnriched.enriched).toBe(false);

    const enriched = computeGameCompleteness({
      ...base,
      gameNotes: 'r',
      seasonId: 's1',
      teamId: 't1',
      playerPositions: { p1: ['gk'] },
      assessments: { p1: {} },
    });
    expect(enriched.enriched).toBe(true);
  });
});
