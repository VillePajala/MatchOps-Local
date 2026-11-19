import {
  competitionRowRelevant,
  completenessProgress,
  computeGameCompleteness,
  countRowStatus,
  goalLogStatus,
  type CompletenessGame,
} from './gameCompleteness';

const base: CompletenessGame = {
  isPlayed: true,
  // Played: the match was run to full time (R2 - only a started game is judged).
  gameStatus: 'gameEnd',
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

  it('core = squad + goal log matching the score; the report is not required', () => {
    // A 0-0 with an empty log and a squad: consistent, so complete without a report.
    const noReport = computeGameCompleteness({ ...base, homeScore: 0, awayScore: 0 });
    expect(noReport.roster).toBe(true);
    expect(noReport.report).toBe(false);
    expect(noReport.coreComplete).toBe(true);
    expect(noReport.overall).toBe('complete');

    const withReport = computeGameCompleteness({ ...base, gameNotes: '  Good game  ' });
    expect(withReport.report).toBe(true);
    expect(withReport.coreComplete).toBe(true);
    expect(withReport.overall).toBe('complete');
  });

  it('does NOT need gameEnd - a recorded goal alone makes a game started and judged', () => {
    const { gameStatus: _omit, ...unTimed } = base;
    const c = computeGameCompleteness({ ...unTimed, gameEvents: [{ type: 'goal', scorerId: 'p1' }], homeScore: 1, awayScore: 0 });
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

  it('recommended items make it partial but never complete it on their own', () => {
    // Competition/team and a report, but the score says 2-0 and no goal is
    // logged: not complete, only partial.
    const c = computeGameCompleteness({ ...base, gameNotes: 'r', seasonId: 's1', teamId: 't1', homeScore: 2, awayScore: 0 });
    expect(c.competition).toBe(true);
    expect(c.team).toBe(true);
    expect(c.coreComplete).toBe(false);
    expect(c.overall).toBe('partial');
  });

  it('enriched = complete + report + competition + team + some positions & assessments', () => {
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

    // Everything but the report: complete, yet not enriched.
    const noReport = computeGameCompleteness({
      ...base,
      seasonId: 's1',
      teamId: 't1',
      playerPositions: { p1: ['gk'] },
      assessments: { p1: {} },
    });
    expect(noReport.overall).toBe('complete');
    expect(noReport.enriched).toBe(false);
  });
});

describe('D2 "valmis" rule: squad + goal log matches the score', () => {
  const goal = (scorerId?: string) => ({ type: 'goal', ...(scorerId ? { scorerId } : {}) });
  const opp = { type: 'opponentGoal' };

  /**
   * @critical - scorers are optional (D2). A goal logged without a scorer
   * (UNKNOWN_SCORER / skipped) still makes the log add up.
   */
  it('is complete with goals logged but no scorers named', () => {
    const c = computeGameCompleteness({ ...base, gameEvents: [goal(), goal(), opp], homeScore: 2, awayScore: 1 });
    expect(c.goalsAttributed).toEqual({ done: 0, total: 2 });
    expect(c.report).toBe(false);
    expect(c.coreComplete).toBe(true);
    expect(c.overall).toBe('complete');
  });

  /** @critical - fewer goals logged than the score is an unfinished record. */
  it('is not complete when fewer goals are logged than the score', () => {
    const c = computeGameCompleteness({ ...base, gameNotes: 'Report', gameEvents: [goal('p1')], homeScore: 2, awayScore: 1 });
    expect(c.coreComplete).toBe(false);
    expect(c.overall).toBe('partial');
  });

  /** @critical - more goals logged than the score is as wrong as fewer. */
  it('is not complete when more goals are logged than the score', () => {
    const c = computeGameCompleteness({ ...base, gameEvents: [goal('p1'), goal('p2')], homeScore: 1, awayScore: 0 });
    expect(c.coreComplete).toBe(false);
    expect(c.overall).toBe('partial');
  });

  /** @critical - no squad, no completeness, however consistent the log. */
  it('is not complete without a squad', () => {
    const c = computeGameCompleteness({ ...base, selectedPlayerIds: [], gameNotes: 'Report', homeScore: 0, awayScore: 0 });
    expect(c.roster).toBe(false);
    expect(c.coreComplete).toBe(false);
    expect(c.overall).toBe('partial');
  });

  /** @critical - planned games are never judged, whatever they contain. */
  it('does not apply to unplayed games', () => {
    const c = computeGameCompleteness({ ...base, isPlayed: false, gameEvents: [goal('p1')], homeScore: 1, awayScore: 0 });
    expect(c.applicable).toBe(false);
    expect(c.overall).toBe('empty');
    expect(completenessProgress(c)).toEqual({ done: 0, total: 0 });
  });

  it('treats a legacy game without isPlayed as played once it has started', () => {
    const { isPlayed: _omit, ...legacy } = base;
    const c = computeGameCompleteness({ ...legacy, homeScore: 0, awayScore: 0 });
    expect(c.applicable).toBe(true);
    expect(c.overall).toBe('complete');
  });
});

describe('R2: a game that has not started is never judged', () => {
  const notStarted: CompletenessGame = { ...base, gameStatus: 'notStarted', timeElapsedInSeconds: 0, gameEvents: [], homeScore: 0, awayScore: 0 };

  /**
   * @critical - "started = played": a fixture marked played (isPlayed true, the
   * old default) but never kicked off must not read as a valmis 0-0.
   */
  it('is not applicable, not complete and has no counter, whatever isPlayed says', () => {
    for (const isPlayed of [true, undefined]) {
      const c = computeGameCompleteness({ ...notStarted, isPlayed });
      expect(c.applicable).toBe(false);
      expect(c.coreComplete).toBe(true); // the raw check still says "consistent"...
      expect(c.overall).toBe('empty'); // ...but the game is not judged
      expect(completenessProgress(c)).toEqual({ done: 0, total: 0 });
    }
  });

  /** @critical - a game with no status at all (legacy) and no evidence is not started either. */
  it('treats a legacy game with no clock and no events as not started', () => {
    const { gameStatus: _omit, ...legacy } = notStarted;
    expect(computeGameCompleteness(legacy).applicable).toBe(false);
  });

  it('a pre-match note does not start the game', () => {
    const c = computeGameCompleteness({ ...notStarted, gameEvents: [{ type: 'note', entityId: 'p1' }] });
    expect(c.applicable).toBe(false);
  });

  /** @critical - any of the three signals starts it. */
  it('starts on clock time, a play event, a status past notStarted, or a score', () => {
    expect(computeGameCompleteness({ ...notStarted, timeElapsedInSeconds: 1 }).applicable).toBe(true);
    expect(computeGameCompleteness({ ...notStarted, gameEvents: [{ type: 'opponentGoal' }], awayScore: 1 }).applicable).toBe(true);
    expect(computeGameCompleteness({ ...notStarted, gameStatus: 'inProgress' }).applicable).toBe(true);
  });

  it('a score with no goals logged is a started game whose record needs finishing', () => {
    const c = computeGameCompleteness({ ...notStarted, homeScore: 1 });
    expect(c.applicable).toBe(true);
    expect(c.coreComplete).toBe(false);
    expect(completenessProgress(c)).toEqual({ done: 1, total: 2 });
  });
});

describe('competition & team item', () => {
  /**
   * @critical - the row is hidden in the basic layout and, in the full one,
   * only a task once the coach has a season or tournament to link to. A hidden
   * row must not count, or the bar could never reach the end.
   */
  it('is relevant only in the full layout with at least one season or tournament', () => {
    expect(competitionRowRelevant('basic', 3)).toBe(false);
    expect(competitionRowRelevant('full', 0)).toBe(false);
    expect(competitionRowRelevant(undefined, 2)).toBe(false);
    expect(competitionRowRelevant('full', 1)).toBe(true);
  });
});

describe('completenessProgress: the D2 core only (R7)', () => {
  /**
   * @critical - the counter, the menu badge and the saved-games badge count
   * exactly the core (squad + goal log), so "x/y" reaches its end exactly when
   * the game is "valmis" and the two can never disagree.
   */
  it('reaches its end exactly when the game is complete', () => {
    const cases: CompletenessGame[] = [
      base,
      { ...base, selectedPlayerIds: [] },
      { ...base, gameEvents: [{ type: 'goal' }], homeScore: 2, awayScore: 0 },
      { ...base, gameEvents: [{ type: 'goal' }, { type: 'goal' }], homeScore: 1, awayScore: 0 },
      { ...base, gameEvents: [{ type: 'goal' }], homeScore: 1, awayScore: 0 },
      { ...base, selectedPlayerIds: [], homeScore: 1, awayScore: 0 },
    ];
    for (const game of cases) {
      const c = computeGameCompleteness(game);
      const p = completenessProgress(c);
      expect(p.total).toBe(2);
      expect(p.done === p.total).toBe(c.coreComplete);
    }
  });

  /** @critical - nothing outside the core moves the counter. */
  it('ignores the report, competition, positions, assessments, scorers and notes', () => {
    const bare = completenessProgress(computeGameCompleteness({ ...base, gameEvents: [{ type: 'goal' }], homeScore: 1, awayScore: 0 }));
    const rich = completenessProgress(computeGameCompleteness({
      ...base,
      gameNotes: 'Report',
      seasonId: 's1',
      teamId: 't1',
      playerPositions: { p1: ['CM'] },
      assessments: { p1: {} },
      gameEvents: [{ type: 'goal', scorerId: 'p1' }, { type: 'note', entityId: 'p1', source: 'dictation' }],
      homeScore: 1,
      awayScore: 0,
    }));
    expect(rich).toEqual(bare);
    expect(bare).toEqual({ done: 2, total: 2 });
  });

  it('counts the squad and the goal log separately', () => {
    expect(completenessProgress(computeGameCompleteness({ ...base, homeScore: 1, awayScore: 0 }))).toEqual({ done: 1, total: 2 });
    expect(completenessProgress(computeGameCompleteness({ ...base, selectedPlayerIds: [] }))).toEqual({ done: 1, total: 2 });
  });

  it('reports an empty squad as nothing recorded rather than all done', () => {
    // 0/0 is vacuously "all done" if you only compare done >= total.
    expect(countRowStatus({ done: 0, total: 0 })).toBe('todo');
  });

  it('marks a per-player row partial once any are recorded', () => {
    const partial = computeGameCompleteness({ ...base, playerPositions: { p1: ['CM'] }, assessments: { p1: {} } });
    expect(countRowStatus(partial.positions)).toBe('partial');
    expect(countRowStatus(partial.assessments)).toBe('partial');
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

describe('recordings', () => {
  const note = (source?: string) => ({ type: 'note', entityId: 'p1', source });

  it('counts dictated notes, and does not treat a typed note as proof of audio', () => {
    expect(computeGameCompleteness({ ...base, gameEvents: [note('dictation')] }).dictatedNotes).toBe(1);
    expect(computeGameCompleteness({ ...base, gameEvents: [note('manual')] }).dictatedNotes).toBe(0);
  });
});
