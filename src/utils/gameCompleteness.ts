/**
 * Per-game completeness - the shared "is this game fully recorded?" model.
 *
 * Read by both the post-game wrap-up card and the completeness badges so they
 * never disagree. Deliberately does NOT depend on the timer / `gameStatus`
 * ('gameEnd'): a game "finished but never timed to max" must still read as a
 * real game. The only played-vs-planned gate is `isPlayed` (defaults true).
 *
 * Core (makes a game `complete`) = Report + Roster. Competition/team link,
 * positions and assessments are recommended enrichment - they contribute to the
 * optional `enriched` flag but never block `complete`. Pure + i18n-free.
 *
 * Three of the checks ask a different question from the rest. "Did you fill in
 * this field" is easy to see; "does the record contradict itself" is not, and
 * that is the kind that silently corrupts everything downstream - a player's
 * goal count, the recap, the Taso report, the player summary. So the goal log
 * is checked against the scoreboard, every goal is checked for a scorer, and
 * the squad is checked for who has had nothing written about them at all.
 */

/** The subset of a game needed to judge completeness. */
export interface CompletenessGame {
  isPlayed?: boolean;
  gameNotes?: string;
  selectedPlayerIds?: string[];
  seasonId?: string;
  tournamentId?: string;
  teamId?: string;
  playerPositions?: Record<string, string[]>;
  assessments?: Record<string, unknown>;
  /** Goals and notes are read from here; only the fields this model needs. */
  gameEvents?: Array<{ type: string; scorerId?: string; entityId?: string }>;
  homeScore?: number;
  awayScore?: number;
}

export interface CountCheck {
  done: number;
  total: number;
}

export interface GameCompleteness {
  /** false for planned/unplayed games - callers show nothing. */
  applicable: boolean;
  report: boolean;
  roster: boolean;
  competition: boolean;
  team: boolean;
  positions: CountCheck;
  assessments: CountCheck;
  /** Goals in the log vs goals on the scoreboard. done > total is possible. */
  goalsLogged: CountCheck;
  /** Our goals that name a scorer, out of our goals. Opponent goals never do. */
  goalsAttributed: CountCheck;
  /** Squad members with at least one note about them. A count, never a judgement. */
  notesCoverage: CountCheck;
  /** Report + Roster - the bar for `complete`. */
  coreComplete: boolean;
  /** coreComplete + competition + team + at least some positions & assessments. */
  enriched: boolean;
  overall: 'empty' | 'partial' | 'complete';
}

const nonEmpty = (s?: string): boolean => typeof s === 'string' && s.trim().length > 0;

/** How a checklist row reads: nothing yet, some of the squad, or all of them. */
export type CompletenessRowStatus = 'done' | 'partial' | 'todo';

/**
 * The status of a per-player row (positions, assessments).
 *
 * `partial` exists because the two honest answers disagree: "three of fourteen
 * assessed" is neither finished nor untouched, and forcing it into one of those
 * is what made the bar and the list contradict each other twice. A coach who
 * wrote about the players they watched has done that job for this match, so
 * partial counts toward the bar - and the row says so in its own colour instead
 * of claiming a green tick at 1/14.
 */
export function countRowStatus(c: CountCheck): CompletenessRowStatus {
  if (c.total === 0 || c.done === 0) return 'todo';
  return c.done >= c.total ? 'done' : 'partial';
}

/**
 * The goal log against the scoreboard, which is an equality and not a target.
 *
 * More goals logged than the score says is as wrong as fewer, so it cannot use
 * countRowStatus (which reads done >= total as finished). A real 0-0 with an
 * empty log is consistent, and therefore done.
 */
export function goalLogStatus(c: CountCheck): CompletenessRowStatus {
  if (c.done === c.total) return 'done';
  return c.done === 0 ? 'todo' : 'partial';
}

/**
 * How much of the finishing work is done, as a fraction the UI can show.
 *
 * The bar counts exactly the rows the checklist does not show in amber, because
 * both read this same function - not two parallel expressions that have twice
 * drifted apart. A bar, a menu badge and the list therefore cannot disagree
 * without the shared rule itself changing.
 */
export function completenessProgress(c: GameCompleteness): { done: number; total: number } {
  if (!c.applicable) return { done: 0, total: 0 };
  const items = [
    c.report,
    c.roster,
    // Both, because the checklist's "Competition & team" row is done only when
    // both are set. Counting just one made the badge claim all-done while the
    // list underneath still showed the row outstanding.
    c.competition && c.team,
    goalLogStatus(c.goalsLogged) === 'done',
    countRowStatus(c.positions) !== 'todo',
    // 0/0 = the assessment feature is off, or there is nothing of that kind in
    // this game (no goals to attribute, no squad): not an item, or the bar
    // could never reach the end.
    ...(c.goalsAttributed.total > 0 ? [countRowStatus(c.goalsAttributed) === 'done'] : []),
    ...(c.notesCoverage.total > 0 ? [countRowStatus(c.notesCoverage) !== 'todo'] : []),
    ...(c.assessments.total > 0 ? [countRowStatus(c.assessments) !== 'todo'] : []),
  ];
  return { done: items.filter(Boolean).length, total: items.length };
}

export interface CompletenessOptions {
  /** When the assessment feature is off, assessments report 0/0 and never count
      toward enrichment or progress - the wrap-up card then drops the row. */
  assessmentsEnabled?: boolean;
}

export function computeGameCompleteness(game: CompletenessGame, options: CompletenessOptions = {}): GameCompleteness {
  const assessmentsEnabled = options.assessmentsEnabled ?? true;
  const applicable = game.isPlayed !== false;

  const squad = game.selectedPlayerIds ?? [];
  const total = squad.length;
  const positionsDone = squad.filter(id => (game.playerPositions?.[id]?.length ?? 0) > 0).length;
  const assessmentsDone = assessmentsEnabled ? squad.filter(id => !!game.assessments?.[id]).length : 0;

  const report = nonEmpty(game.gameNotes);
  const roster = total > 0;
  const competition = nonEmpty(game.seasonId) || nonEmpty(game.tournamentId);
  const team = nonEmpty(game.teamId);

  const positions: CountCheck = { done: positionsDone, total };
  const assessments: CountCheck = assessmentsEnabled ? { done: assessmentsDone, total } : { done: 0, total: 0 };

  const events = game.gameEvents ?? [];
  const ownGoals = events.filter(e => e.type === 'goal');
  const loggedGoals = ownGoals.length + events.filter(e => e.type === 'opponentGoal').length;
  // Side does not matter: both scores together are what the log must add up to.
  const scoredGoals = (game.homeScore ?? 0) + (game.awayScore ?? 0);
  const goalsLogged: CountCheck = { done: loggedGoals, total: scoredGoals };
  const goalsAttributed: CountCheck = {
    done: ownGoals.filter(e => nonEmpty(e.scorerId)).length,
    total: ownGoals.length,
  };
  const written = new Set(events.filter(e => e.type === 'note' && nonEmpty(e.entityId)).map(e => e.entityId));
  const notesCoverage: CountCheck = { done: squad.filter(id => written.has(id)).length, total };

  const coreComplete = report && roster;
  const enriched = coreComplete && competition && team && positionsDone > 0 && (!assessmentsEnabled || assessmentsDone > 0);

  const anyProgress = report || competition || team || positionsDone > 0 || assessmentsDone > 0;
  const overall: GameCompleteness['overall'] = !applicable
    ? 'empty'
    : coreComplete
      ? 'complete'
      : anyProgress
        ? 'partial'
        : 'empty';

  return { applicable, report, roster, competition, team, positions, assessments, goalsLogged, goalsAttributed, notesCoverage, coreComplete, enriched, overall };
}
