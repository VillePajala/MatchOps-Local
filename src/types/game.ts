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

export interface TimerState {
  gameId: string;
  timeElapsedInSeconds: number;
  timestamp: number;
}

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

// =============================================================================
// AppState decomposed into focused sub-interfaces
// These provide better type organization while maintaining full backward compatibility.
// =============================================================================

/**
 * Game metadata - identifying information about the game.
 */
export interface GameMetadata {
  /** Home team name */
  teamName: string;
  /** Opponent team name */
  opponentName: string;
  /** Date of the game (YYYY-MM-DD format) */
  gameDate: string;
  /** Time of the game (optional, for display purposes) */
  gameTime?: string;
  /** Location/venue of the game */
  gameLocation?: string;
  /** Notes about the game */
  gameNotes: string;
  /**
   * Game type - soccer (outdoor) or futsal (indoor).
   * @remarks Optional for backwards compatibility - defaults to 'soccer' if undefined.
   */
  gameType?: GameType;
  /**
   * Gender - boys or girls.
   * @remarks Optional for backwards compatibility - legacy games work without gender set.
   */
  gender?: Gender;
  /** Age group for the game, independent of tournament/season */
  ageGroup?: string;
}

/**
 * Game configuration - settings for how the game is structured.
 */
export interface GameConfiguration {
  /** Whether playing at home or away */
  homeOrAway: 'home' | 'away';
  /** Number of periods (halves) in the game */
  numberOfPeriods: 1 | 2;
  /** Duration of each period in minutes */
  periodDurationMinutes: number;
  /** Substitution interval in minutes (optional) */
  subIntervalMinutes?: number;
  /** Whether to show player names on the field */
  showPlayerNames: boolean;
  /** Difficulty weighting factor for demand-correction averages */
  demandFactor?: number;
}

/**
 * Game scoring and progress state.
 */
export interface GameScoreState {
  /** Home team score */
  homeScore: number;
  /** Away team score */
  awayScore: number;
  /** Current period number (1 or 2) */
  currentPeriod: number;
  /** Current game status */
  gameStatus: 'notStarted' | 'inProgress' | 'periodEnd' | 'gameEnd';
  /** Indicates if the game has been fully played */
  isPlayed?: boolean;
}

/**
 * Game timer state - tracks time-related state.
 */
export interface GameTimerState {
  /** Timer elapsed time in seconds */
  timeElapsedInSeconds?: number;
  /** Last substitution confirmation time in seconds */
  lastSubConfirmationTimeSeconds?: number;
  /** Completed interval durations for substitution tracking */
  completedIntervalDurations?: IntervalLog[];
}

/**
 * Game player data - players involved in the game.
 */
export interface GamePlayerData {
  /** Players currently on the field with positions */
  playersOnField: Player[];
  /** All players available for this game */
  availablePlayers: Player[];
  /** IDs of players selected/checked for the game */
  selectedPlayerIds: string[];
  /** Player assessments/ratings for this game */
  assessments?: { [playerId: string]: PlayerAssessment };
}

/**
 * Game tactical data - field drawings and positioning.
 */
export interface GameTacticalState {
  /** Tactical discs on the field */
  tacticalDiscs: TacticalDisc[];
  /** Tactical drawings (arrow paths, etc.) */
  tacticalDrawings: Point[][];
  /** Ball position on field (null if not placed) */
  tacticalBallPosition: Point | null;
  /** Formation snap points for player positioning assistance */
  formationSnapPoints?: Point[];
  /** Legacy drawings on field */
  drawings: Point[][];
  /** Opponent markers on field */
  opponents: Opponent[];
}

/**
 * Game references - links to other entities (season, tournament, team).
 */
export interface GameReferences {
  /** Season this game belongs to (empty string if none) */
  seasonId: string;
  /** Tournament this game belongs to (empty string if none) */
  tournamentId: string;
  /** Tournament series ID within a tournament */
  tournamentSeriesId?: string;
  /** Legacy tournament level field */
  tournamentLevel?: string;
  /** Team this game belongs to */
  teamId?: string;
  /**
   * League ID for this game - can override the season's league setting.
   * @see src/config/leagues.ts for available leagues
   */
  leagueId?: string;
  /** Custom league name when leagueId === 'muu' */
  customLeagueName?: string;
}

/**
 * Game events data - goals, substitutions, etc.
 */
export interface GameEventsData {
  /** List of events that occurred during the game */
  gameEvents: GameEvent[];
}

/**
 * Game personnel - coaches and staff assigned to the game.
 */
export interface GamePersonnelData {
  /**
   * Personnel assigned to this game (coaches, trainers, etc.)
   * @remarks Stores IDs only - names resolved from global personnel collection.
   */
  gamePersonnel?: string[];
}

/**
 * AppState - Complete game state.
 *
 * Composed from smaller focused interfaces for better organization:
 * - GameMetadata: team names, date, location, type, gender
 * - GameConfiguration: periods, duration, settings
 * - GameScoreState: scores, period, status
 * - GameTimerState: elapsed time, intervals
 * - GamePlayerData: players on field, available, selected
 * - GameTacticalState: drawings, discs, ball position
 * - GameReferences: season, tournament, team links
 * - GameEventsData: game events
 * - GamePersonnelData: assigned personnel
 *
 * @remarks
 * The type is defined as an intersection of all sub-interfaces for full
 * backward compatibility - existing code using AppState works unchanged.
 */
export type AppState =
  GameMetadata &
  GameConfiguration &
  GameScoreState &
  GameTimerState &
  GamePlayerData &
  GameTacticalState &
  GameReferences &
  GameEventsData &
  GamePersonnelData;

export interface SavedGamesCollection {
  [gameId: string]: AppState;
}
