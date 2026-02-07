import type { Player } from './index';
import type { PlayerAssessment } from './playerAssessment';

/**
 * Game type - distinguishes between outdoor soccer and indoor futsal.
 * Finnish youth seasons often include both types of games.
 *
 * @remarks
 * - Defaults to 'soccer' for backward compatibility (applied at filter time, not persisted)
 * - Legacy games without gameType are treated as 'soccer' during filtering
 * - Used for filtering games, seasons, tournaments in stats views
 * - Future: may enable different field visualization (soccer field vs futsal court)
 */
export type GameType = 'soccer' | 'futsal';

/**
 * Gender - distinguishes between boys' and girls' games/competitions.
 * Finnish youth soccer is gender-separated.
 *
 * @remarks
 * - Optional field for backward compatibility - legacy games work without gender set
 * - Used for filtering games, seasons, tournaments in stats views
 * - Gender is at entity level (game/season/tournament), NOT player level
 *   (players can participate in both boys' and girls' games in younger age groups)
 * - Games without gender are excluded when filtering by specific gender (boys/girls)
 * - Filter 'all' includes both games with gender set and legacy games without gender
 */
export type Gender = 'boys' | 'girls';

export interface Point {
  relX: number;
  relY: number;
}

export interface Opponent {
  id: string;
  relX: number;
  relY: number;
}

export interface GameEvent {
  id: string;
  type: 'goal' | 'opponentGoal' | 'substitution' | 'periodEnd' | 'gameEnd' | 'fairPlayCard';
  time: number;
  scorerId?: string;
  assisterId?: string;
  entityId?: string;
}

// TimerState is defined in @/utils/timerStateManager.ts (canonical location)
// with readonly modifiers and optional wasRunning field.

export interface IntervalLog {
  period: number;
  duration: number;
  timestamp: number;
}

/**
 * Substitution alert level for timer-based substitution reminders
 */
export type SubAlertLevel = 'none' | 'warning' | 'due';

export interface TacticalDisc {
  id: string;
  relX: number;
  relY: number;
  type: 'home' | 'opponent' | 'goalie';
}

export interface AppState {
  playersOnField: Player[];
  opponents: Opponent[];
  drawings: Point[][];
  availablePlayers: Player[];
  showPlayerNames: boolean;
  teamName: string;
  gameEvents: GameEvent[];
  opponentName: string;
  gameDate: string;
  homeScore: number;
  awayScore: number;
  gameNotes: string;
  homeOrAway: 'home' | 'away';
  numberOfPeriods: 1 | 2;
  periodDurationMinutes: number;
  currentPeriod: number;
  gameStatus: 'notStarted' | 'inProgress' | 'periodEnd' | 'gameEnd';
  /** Indicates if the game has been fully played */
  isPlayed?: boolean;
  selectedPlayerIds: string[];
  assessments?: { [playerId: string]: PlayerAssessment };
  seasonId: string;
  tournamentId: string;
  tournamentLevel?: string;
  /**
   * Tournament series ID - references TournamentSeries.id
   * Used when tournament has multiple series defined
   */
  tournamentSeriesId?: string;
  /** Age group for the game, independent of tournament/season */
  ageGroup?: string;
  /** Difficulty weighting factor for demand-correction averages */
  demandFactor?: number;
  gameLocation?: string;
  gameTime?: string;
  subIntervalMinutes?: number;
  completedIntervalDurations?: IntervalLog[];
  lastSubConfirmationTimeSeconds?: number;
  tacticalDiscs: TacticalDisc[];
  tacticalDrawings: Point[][];
  tacticalBallPosition: Point | null;
  /** Formation snap points for player positioning assistance */
  formationSnapPoints?: Point[];
  teamId?: string;              // NEW: the team this game belongs to
  /**
   * League ID for this game - can override the season's league setting.
   * @see src/config/leagues.ts for available leagues
   * @example 'sm-sarja' | 'harrastesarja' | 'muu'
   */
  leagueId?: string;
  /**
   * Custom league name when leagueId === 'muu'
   * @remarks Only used when leagueId is 'muu', otherwise ignored
   */
  customLeagueName?: string;
  /**
   * Personnel assigned to this game (coaches, trainers, etc.)
   *
   * @remarks
   * Optional for backwards compatibility with old games.
   * Stores IDs only - names resolved from global personnel collection.
   */
  gamePersonnel?: string[];
  /**
   * Timer elapsed time in seconds
   *
   * @remarks
   * Optional for backwards compatibility with old games.
   * Tracks the exact elapsed time for the timer state preservation.
   */
  timeElapsedInSeconds?: number;
  /**
   * Game type - soccer (outdoor) or futsal (indoor).
   *
   * @remarks
   * Optional for backwards compatibility - defaults to 'soccer' if undefined.
   * Used for filtering and organizing games.
   */
  gameType?: GameType;
  /**
   * Gender - boys or girls.
   *
   * @remarks
   * Optional for backwards compatibility - legacy games work without gender set.
   * Used for filtering and organizing games.
   */
  gender?: Gender;
  /** Whether the game went to overtime/extra time */
  wentToOvertime?: boolean;
  /** Whether the game was decided by penalty shootout */
  wentToPenalties?: boolean;
  /** Whether to show position labels (GK, CB, ST, etc.) on the field */
  showPositionLabels?: boolean;
  /**
   * ISO timestamp when the game was created.
   * Optional for backwards compatibility with legacy data.
   */
  createdAt?: string;
  /**
   * ISO timestamp when the game was last updated.
   * Optional for backwards compatibility with legacy data.
   * Used for conflict resolution in multi-device sync.
   */
  updatedAt?: string;
}

export interface SavedGamesCollection {
  [gameId: string]: AppState;
}
