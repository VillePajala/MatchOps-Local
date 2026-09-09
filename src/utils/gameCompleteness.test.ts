import { completenessProgress, computeGameCompleteness, countRowStatus, goalLogStatus, type CompletenessGame } from './gameCompleteness';

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
    // 2 of 7: the squad, and a 0-0 with an empty goal log is consistent.
    expect(completenessProgress(computeGameCompleteness(base))).toEqual({ done: 2, total: 6 });
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

    expect(completenessProgress(partial)).toEqual({ done: 6, total: 6 });
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
    expect(completenessProgress(none)).toEqual({ done: 4, total: 6 });

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
    expect(completenessProgress(all)).toEqual({ done: 6, total: 6 });
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
    expect(completenessProgress(seasonOnly).done).toBe(3);

    const both = computeGameCompleteness({ ...base, gameNotes: 'x', seasonId: 's1', teamId: 't1' });
    expect(completenessProgress(both).done).toBe(4);
  });

  it('reports nothing for a game that was never played', () => {
    expect(completenessProgress(computeGameCompleteness({ ...base, isPlayed: false }))).toEqual({
      done: 0,
      total: 0,
    });
  });
});

describe('assessments setting', () => {
  /** Off by default (owner, 2026-09-09): ratings must not hold a game hostage. */
  it('reports 0/0 and stops gating enrichment when the feature is off', () => {
    const rated: CompletenessGame = { ...base, gameNotes: 'Report', selectedPlayerIds: ['a', 'b'],
      seasonId: 's', teamId: 't', playerPositions: { a: ['CM'] }, assessments: { a: {} } };
    const on = computeGameCompleteness(rated);
    const off = computeGameCompleteness(rated, { assessmentsEnabled: false });
    expect(on.assessments).toEqual({ done: 1, total: 2 });
    expect(off.assessments).toEqual({ done: 0, total: 0 });
    expect(off.enriched).toBe(true);
    expect(off.overall).toBe(on.overall);
  });

  /**
   * @critical - with the feature off, the bar counted a row that no longer
   * existed and stopped at 4/5 forever while the pill next to it said Complete.
   */
  it('drops assessments from the progress count when the feature is off', () => {
    const finished: CompletenessGame = { ...base, gameNotes: 'Report', selectedPlayerIds: ['a'],
      seasonId: 's', teamId: 't', playerPositions: { a: ['CM'] }, assessments: {} };
    expect(completenessProgress(computeGameCompleteness(finished))).toEqual({ done: 5, total: 6 });
    expect(completenessProgress(computeGameCompleteness(finished, { assessmentsEnabled: false }))).toEqual({ done: 5, total: 5 });
  });
});

describe('consistency checks', () => {
  const ev = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra });

  /**
   * @critical - the goal log against the scoreboard. A game whose log does not
   * add up gives the player the wrong goals, the recap the wrong scorers and
   * the Taso report a half-time score it has to withhold. 8 of 207 real games.
   */
  it('counts the goal log against both scores, and calls a surplus unfinished too', () => {
    const g = (events: ReturnType<typeof ev>[], home: number, away: number): CompletenessGame =>
      ({ ...base, gameEvents: events, homeScore: home, awayScore: away });
    expect(computeGameCompleteness(g([ev('goal'), ev('opponentGoal')], 1, 1)).goalsLogged).toEqual({ done: 2, total: 2 });
    expect(computeGameCompleteness(g([ev('goal')], 2, 1)).goalsLogged).toEqual({ done: 1, total: 3 });
    // A real 0-0 with an empty log is consistent, not unfinished.
    expect(goalLogStatus(computeGameCompleteness(g([], 0, 0)).goalsLogged)).toBe('done');
    expect(goalLogStatus(computeGameCompleteness(g([ev('goal')], 2, 1)).goalsLogged)).toBe('partial');
    expect(goalLogStatus(computeGameCompleteness(g([], 2, 1)).goalsLogged)).toBe('todo');
    // More logged than scored is as wrong as fewer, so never 'done'.
    expect(goalLogStatus(computeGameCompleteness(g([ev('goal'), ev('goal')], 1, 0)).goalsLogged)).toBe('partial');
  });

  it('counts our goals that name a scorer, and never asks it of opponent goals', () => {
    const c = computeGameCompleteness({
      ...base,
      gameEvents: [ev('goal', { scorerId: 'p1' }), ev('goal'), ev('opponentGoal')],
      homeScore: 2, awayScore: 1,
    });
    expect(c.goalsAttributed).toEqual({ done: 1, total: 2 });
  });

  it('counts squad members with a note about them, ignoring notes about the game', () => {
    const c = computeGameCompleteness({
      ...base,
      selectedPlayerIds: ['p1', 'p2', 'p3'],
      gameEvents: [ev('note', { entityId: 'p1' }), ev('note', { entityId: 'p1' }), ev('note'), ev('note', { entityId: 'gone' })],
    });
    expect(c.notesCoverage).toEqual({ done: 1, total: 3 });
  });

  it('counts the new checks in the progress fraction, and skips the ones with nothing to check', () => {
    // report, roster, competition+team, goal log, positions, assessments. No
    // goals of ours, so no scorers item - and notes are never an item.
    const empty = computeGameCompleteness({ ...base, homeScore: 0, awayScore: 0 });
    expect(completenessProgress(empty).total).toBe(6);
    // Our goal adds the scorers item.
    const withGoals = computeGameCompleteness({ ...base, gameEvents: [ev('goal')], homeScore: 1, awayScore: 0 });
    expect(completenessProgress(withGoals).total).toBe(7);
  });
});

describe('notes coverage is shown, never scored', () => {
  /**
   * @critical - a meter that says "not complete" is a demand however it is
   * worded. Nobody owes an observation about every child in every match; that
   * is how the rating sliders filled up with "hyva peli".
   */
  it('does not change the fraction whether anyone has been written about or not', () => {
    const g = (events: Array<{ type: string; entityId?: string }>) =>
      computeGameCompleteness({ ...base, gameEvents: events, homeScore: 0, awayScore: 0 });
    const none = completenessProgress(g([]));
    const some = completenessProgress(g([{ type: 'note', entityId: 'p1' }]));
    expect(some).toEqual(none);
    // ...and the count is still there to read.
    expect(g([{ type: 'note', entityId: 'p1' }]).notesCoverage).toEqual({ done: 1, total: 4 });
  });
});

describe('unhandled recordings', () => {
  const note = (source?: string) => ({ type: 'note', entityId: 'p1', source });

  /**
   * @critical - a clip is deleted after 30 days and the coach's words go with
   * it, so audio nobody wrote out is real unfinished work.
   */
  it('counts pending clips only for a game that has audio, and turns done at zero', () => {
    const plain = computeGameCompleteness(base);
    // Never recorded: no item at all, so no free tick either.
    expect(completenessProgress(plain, { voiceClipsPending: 0 })).toEqual(completenessProgress(plain));
    // Clips waiting: one more item, not done.
    const waiting = completenessProgress(plain, { voiceClipsPending: 2 });
    expect(waiting.total).toBe(completenessProgress(plain).total + 1);
    expect(waiting.done).toBe(completenessProgress(plain).done);
    // Written out: the item stays, and is done.
    const handled = computeGameCompleteness({ ...base, gameEvents: [note('dictation')] });
    const after = completenessProgress(handled, { voiceClipsPending: 0 });
    expect(after.total).toBe(completenessProgress(handled).total + 1);
    expect(after.done).toBe(completenessProgress(handled).done + 1);
  });

  it('does not treat a typed note as proof of audio', () => {
    const typed = computeGameCompleteness({ ...base, gameEvents: [note('manual')] });
    expect(typed.dictatedNotes).toBe(0);
    expect(completenessProgress(typed, { voiceClipsPending: 0 })).toEqual(completenessProgress(typed));
  });
});
