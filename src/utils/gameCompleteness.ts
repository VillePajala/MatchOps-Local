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
  /** Report + Roster - the bar for `complete`. */
  coreComplete: boolean;
  /** coreComplete + competition + team + at least some positions & assessments. */
  enriched: boolean;
  overall: 'empty' | 'partial' | 'complete';
}

const nonEmpty = (s?: string): boolean => typeof s === 'string' && s.trim().length > 0;

/**
 * How much of the finishing work is done, as a fraction the UI can show.
 *
 * Counts exactly the rows the checklist card shows, so a bar, a menu badge and
 * the list can never disagree - the same reason the completeness model itself
 * is shared rather than recomputed per surface.
 *
 * Positions and assessments count as done when SOME are recorded, not all: a
 * coach who wrote about the three players they watched has finished that job
 * for this match, and a bar that only fills at fourteen of fourteen would call
 * every real match unfinished.
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
    c.positions.total > 0 && c.positions.done > 0,
    c.assessments.total > 0 && c.assessments.done > 0,
  ];
  return { done: items.filter(Boolean).length, total: items.length };
}

export function computeGameCompleteness(game: CompletenessGame): GameCompleteness {
  const applicable = game.isPlayed !== false;

  const squad = game.selectedPlayerIds ?? [];
  const total = squad.length;
  const positionsDone = squad.filter(id => (game.playerPositions?.[id]?.length ?? 0) > 0).length;
  const assessmentsDone = squad.filter(id => !!game.assessments?.[id]).length;

  const report = nonEmpty(game.gameNotes);
  const roster = total > 0;
  const competition = nonEmpty(game.seasonId) || nonEmpty(game.tournamentId);
  const team = nonEmpty(game.teamId);

  const positions: CountCheck = { done: positionsDone, total };
  const assessments: CountCheck = { done: assessmentsDone, total };

  const coreComplete = report && roster;
  const enriched = coreComplete && competition && team && positionsDone > 0 && assessmentsDone > 0;

  const anyProgress = report || competition || team || positionsDone > 0 || assessmentsDone > 0;
  const overall: GameCompleteness['overall'] = !applicable
    ? 'empty'
    : coreComplete
      ? 'complete'
      : anyProgress
        ? 'partial'
        : 'empty';

  return { applicable, report, roster, competition, team, positions, assessments, coreComplete, enriched, overall };
}
