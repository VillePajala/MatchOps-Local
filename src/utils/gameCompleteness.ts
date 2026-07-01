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
