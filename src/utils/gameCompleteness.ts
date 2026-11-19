/**
 * Per-game completeness - the shared "is this game fully recorded?" model.
 *
 * Read by both the post-game wrap-up card and the completeness badges so they
 * never disagree. A game is judged only once it has STARTED (review R2,
 * "started = played"): its clock has run or it has a play event (the evidence
 * `hasBeenPlayed` reads), it has left `notStarted`, or it has a score. A game that has not
 * started is never "valmis" and never a recorded 0-0, whatever its `isPlayed`
 * flag says. It does not need to have reached 'gameEnd': a game "finished but
 * never timed to max" is still a real game. `isPlayed: false` still opts out.
 *
 * Core (makes a game `complete`, "valmis") = squad selected + the goal log
 * matches the score (D2, Onboarding v3). Scorers are optional: a goal with no
 * scorer still counts as logged. The written report, competition/team link,
 * positions and assessments are checklist items and feed the optional
 * `enriched` flag, but never block `complete`. Applied on read to every game,
 * so no stored data changes when the rule does. Pure + i18n-free.
 *
 * Three of the checks ask a different question from the rest. "Did you fill in
 * this field" is easy to see; "does the record contradict itself" is not, and
 * that is the kind that silently corrupts everything downstream - a player's
 * goal count, the recap, the Taso report, the player summary. So the goal log
 * is checked against the scoreboard, every goal is checked for a scorer, and
 * the squad is checked for who has had nothing written about them at all.
 */

import type { AppLayout } from '@/types/settings';
import { hasBeenPlayed } from '@/utils/matchPlayedDefault';

/** The subset of a game needed to judge completeness. */
export interface CompletenessGame {
  isPlayed?: boolean;
  /** Match clock; any time on it means the game has started. */
  timeElapsedInSeconds?: number;
  /** Anything other than 'notStarted' means the game has started. */
  gameStatus?: string;
  gameNotes?: string;
  selectedPlayerIds?: string[];
  seasonId?: string;
  tournamentId?: string;
  teamId?: string;
  playerPositions?: Record<string, string[]>;
  assessments?: Record<string, unknown>;
  /** Goals and notes are read from here; only the fields this model needs. */
  gameEvents?: Array<{ type: string; scorerId?: string; entityId?: string; source?: string }>;
  homeScore?: number;
  awayScore?: number;
}

export interface CountCheck {
  done: number;
  total: number;
}

export interface GameCompleteness {
  /** false for planned/unplayed or not-yet-started games - callers show nothing. */
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
  /**
   * Squad members with at least one note about them. Information only: it is
   * shown but never scored, so the checklist never demands a note per child.
   */
  notesCoverage: CountCheck;
  /** Notes that came from a recording. Proof this game had audio at all. */
  dictatedNotes: number;
  /** Squad selected + goal log matches the score - the bar for `complete`. */
  coreComplete: boolean;
  /** coreComplete + report + competition + team + at least some positions & assessments. */
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
 * Whether the checklist's "Competition & team" row is a real task for this
 * coach. The basic layout hides it; in the full layout it only asks for a link
 * when there is something to link to - a coach with no (active) season or
 * tournament would otherwise carry a permanently open item they cannot close.
 * `undefined` layout = settings still loading: not shown rather than flashed.
 */
export function competitionRowRelevant(
  layout: AppLayout | undefined,
  activeSeasonAndTournamentCount: number,
): boolean {
  return layout === 'full' && activeSeasonAndTournamentCount > 0;
}

/**
 * The finishing counter ("x/y", the amber/green dot, the menu badge, the
 * saved-games badge): ONLY the D2 core items - squad selected and a goal log
 * that adds up to the score (review R7). It therefore reaches its end exactly
 * when the game is "valmis" (`coreComplete`), on every surface. The report,
 * positions, assessments, competition link and voice notes are checklist rows
 * the coach can do, never part of the count.
 */
export function completenessProgress(c: GameCompleteness): { done: number; total: number } {
  if (!c.applicable) return { done: 0, total: 0 };
  const items = [c.roster, goalLogStatus(c.goalsLogged) === 'done'];
  return { done: items.filter(Boolean).length, total: items.length };
}

export interface CompletenessOptions {
  /** When the assessment feature is off, assessments report 0/0 and never count
      toward enrichment or progress - the wrap-up card then drops the row. */
  assessmentsEnabled?: boolean;
}

export function computeGameCompleteness(game: CompletenessGame, options: CompletenessOptions = {}): GameCompleteness {
  const assessmentsEnabled = options.assessmentsEnabled ?? true;
  // R2: not started = not played, whatever the flag says - never a 0-0 "valmis".
  // A score on the board is evidence too: it cannot be a 0-0 nobody played,
  // and a score with no goals logged is exactly the record to flag.
  const started =
    hasBeenPlayed({ timeElapsedInSeconds: game.timeElapsedInSeconds, gameEvents: game.gameEvents }) ||
    (game.gameStatus !== undefined && game.gameStatus !== 'notStarted') ||
    (game.homeScore ?? 0) + (game.awayScore ?? 0) > 0;
  const applicable = game.isPlayed !== false && started;

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
  const dictatedNotes = events.filter(e => e.type === 'note' && e.source === 'dictation').length;

  // D2: "valmis" = squad + a goal log that adds up to the score. Scorers are
  // optional and the report is a checklist item, not a gate.
  const coreComplete = roster && goalLogStatus(goalsLogged) === 'done';
  const enriched =
    coreComplete && report && competition && team && positionsDone > 0 && (!assessmentsEnabled || assessmentsDone > 0);

  const anyProgress =
    report || competition || team || positionsDone > 0 || assessmentsDone > 0 || loggedGoals > 0;
  const overall: GameCompleteness['overall'] = !applicable
    ? 'empty'
    : coreComplete
      ? 'complete'
      : anyProgress
        ? 'partial'
        : 'empty';

  return { applicable, report, roster, competition, team, positions, assessments, goalsLogged, goalsAttributed, notesCoverage, dictatedNotes, coreComplete, enriched, overall };
}
