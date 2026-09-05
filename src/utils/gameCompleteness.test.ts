import { completenessProgress, computeGameCompleteness, countRowStatus, type CompletenessGame } from './gameCompleteness';

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

describe('completenessProgress', () => {
  const base = {
    isPlayed: true,
    gameNotes: '',
    selectedPlayerIds: ['p1', 'p2'],
    seasonId: '',
    tournamentId: '',
    teamId: '',
    playerPositions: {},
    assessments: {},
  };

  it('counts the same items the checklist shows', () => {
    // Roster only: a squad is picked, nothing else recorded yet.
    expect(completenessProgress(computeGameCompleteness(base))).toEqual({ done: 1, total: 5 });
  });

  /**
   * Some, not all: a coach who wrote about the three players they watched has
   * finished that job for this match, and a bar that only filled at fourteen of
   * fourteen would call every real match unfinished.
   */
  it('counts positions and assessments as done once any are recorded', () => {
    const partial = computeGameCompleteness({
      ...base,
      gameNotes: 'Yleiskuva: hyva',
      seasonId: 's1',
      teamId: 't1',
      playerPositions: { p1: ['CM'] },
      assessments: { p1: { overall: 7, sliders: {} } } as never,
    });

    expect(completenessProgress(partial)).toEqual({ done: 5, total: 5 });
    // ...and the rows say the same thing in their own words: started, not done.
    expect(countRowStatus(partial.positions)).toBe('partial');
    expect(countRowStatus(partial.assessments)).toBe('partial');
  });

  /**
   * @critical - the bar counting a row the list showed as outstanding is the
   * bug this model exists to make impossible, and it has happened twice. Both
   * surfaces now read countRowStatus, so this pins the rule itself.
   */
  it('leaves a row out of the count exactly when it has nothing recorded', () => {
    const none = computeGameCompleteness({
      ...base,
      gameNotes: 'r',
      seasonId: 's1',
      teamId: 't1',
    });
    expect(countRowStatus(none.positions)).toBe('todo');
    expect(countRowStatus(none.assessments)).toBe('todo');
    expect(completenessProgress(none)).toEqual({ done: 3, total: 5 });

    const all = computeGameCompleteness({
      ...base,
      gameNotes: 'r',
      seasonId: 's1',
      teamId: 't1',
      playerPositions: { p1: ['CM'], p2: ['RB'], p3: ['LB'], p4: ['ST'] },
      assessments: { p1: {}, p2: {}, p3: {}, p4: {} },
    });
    expect(countRowStatus(all.positions)).toBe('done');
    expect(countRowStatus(all.assessments)).toBe('done');
    expect(completenessProgress(all)).toEqual({ done: 5, total: 5 });
  });

  it('reports an empty squad as nothing recorded rather than all done', () => {
    // 0/0 is vacuously "all done" if you only compare done >= total.
    expect(countRowStatus({ done: 0, total: 0 })).toBe('todo');
  });

  /**
   * @critical - the checklist's "Competition & team" row needs BOTH, so counting
   * only the competition let the badge say all-done while the list underneath
   * still showed that row outstanding. The whole point of the shared model is
   * that two surfaces cannot disagree.
   */
  it('agrees with the checklist row that needs both a competition and a team', () => {
    const seasonOnly = computeGameCompleteness({ ...base, gameNotes: 'x', seasonId: 's1' });
    expect(completenessProgress(seasonOnly).done).toBe(2);

    const both = computeGameCompleteness({ ...base, gameNotes: 'x', seasonId: 's1', teamId: 't1' });
    expect(completenessProgress(both).done).toBe(3);
  });

  it('reports nothing for a game that was never played', () => {
    expect(completenessProgress(computeGameCompleteness({ ...base, isPlayed: false }))).toEqual({
      done: 0,
      total: 0,
    });
  });
});
