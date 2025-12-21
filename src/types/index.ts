import type { GameType, Gender } from './game';

export interface Player {
  id: string;
  name: string; // Full name
  nickname?: string; // Optional nickname (e.g., first name) for display on disc
  relX?: number; // Relative X (0.0 to 1.0)
  relY?: number; // Relative Y (0.0 to 1.0)
  color?: string; // Optional: Specific color for the disk
  isGoalie?: boolean; // Optional: Is this player the goalie?
  jerseyNumber?: string; // Optional: Player's jersey number
  notes?: string; // Optional: Notes specific to this player
  receivedFairPlayCard?: boolean; // Optional: Did this player receive the fair play card?
}

export interface PlayerStatRow extends Player {
  goals: number;
  assists: number;
  totalScore: number;
  fpAwards?: number;
  gamesPlayed: number;
  avgPoints: number;
}

// Team entity for multi-team support
export interface Team {
  id: string;                 // team_...
  name: string;               // "PEPO U10"
  color?: string;             // brand/accent (optional)
  ageGroup?: string;          // Optional: age group (U7-U21) for team organization
  notes?: string;             // Optional: notes/description for the team
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
  archived?: boolean;         // Optional: soft delete flag
}

// Team player (reuses existing Player shape where possible)
export interface TeamPlayer {
  id: string;                 // player_...
  name: string;
  nickname?: string;
  jerseyNumber?: string;
  isGoalie?: boolean;
  color?: string;
  notes?: string;
  receivedFairPlayCard?: boolean;
  // Note: relX/relY are removed as they're field-specific, not roster-specific
}

/**
 * Team placement information for tournaments and seasons.
 *
 * @remarks
 * - Tracks team achievements (1st, 2nd, 3rd place, etc.)
 * - Used in both Season and Tournament interfaces
 * - Displayed with placement badges (🥇🥈🥉) in UI
 */
export interface TeamPlacementInfo {
  placement: number;  // 1 = 1st place, 2 = 2nd place, etc.
  award?: string;     // Optional: "Champion", "Runner-up", etc.
  note?: string;      // Optional coach notes
}

export interface Season {
  id: string;
  name: string;
  location?: string;
  periodCount?: number;
  periodDuration?: number;
  startDate?: string;
  endDate?: string;
  gameDates?: string[];
  archived?: boolean;
  notes?: string;
  color?: string;
  badge?: string;
  ageGroup?: string;
  /**
   * League ID from predefined Finnish youth leagues.
   * @see src/config/leagues.ts for available leagues
   * @example 'sm-sarja' | 'harrastesarja' | 'muu'
   */
  leagueId?: string;
  /**
   * Custom league name when leagueId === 'muu'
   * @remarks Only persisted when leagueId is 'muu', otherwise cleared
   */
  customLeagueName?: string;
  /**
   * Optional team placements for this season.
   * Maps team IDs to their final placement/ranking.
   *
   * @remarks
   * - Allows tracking team achievements (1st, 2nd, 3rd place, etc.)
   * - Backward compatible: seasons without placements work seamlessly
   * - Displayed with placement badges (🥇🥈🥉) in UI
   */
  teamPlacements?: {
    [teamId: string]: TeamPlacementInfo;
  };
  /**
   * Game type for this season - soccer (outdoor) or futsal (indoor).
   *
   * @remarks
   * Optional for backwards compatibility - defaults to 'soccer' if undefined.
   * Games in this season can inherit this setting or override it.
   */
  gameType?: GameType;
  /**
   * Gender for this season - boys or girls.
   *
   * @remarks
   * Optional for backwards compatibility - legacy seasons work without gender set.
   * Games in this season can inherit this setting or override it.
   */
  gender?: Gender;
  // Note: teamId removed - seasons are global entities per plan
  // Note: roster management removed - teams handle rosters now
}

/**
 * Tournament series - represents a competition level within a tournament.
 * E.g., "Elite", "Kilpa", "Haaste", "Harraste"
 *
 * @remarks
 * - Each series has a unique ID and a level from LEVELS constant
 * - Tournaments can have multiple series running simultaneously
 * - Games reference a specific series via tournamentSeriesId
 */
export interface TournamentSeries {
  id: string;      // UUID format: series_timestamp_random
  level: string;   // One of LEVELS from gameOptions.ts
}

export interface Tournament {
  id: string;
  name: string;
  location?: string;
  periodCount?: number;
  periodDuration?: number;
  startDate?: string;
  endDate?: string;
  gameDates?: string[];
  archived?: boolean;
  notes?: string;
  color?: string;
  badge?: string;
  level?: string;
  ageGroup?: string;
  /**
   * Tournament series for multi-level tournaments.
   * Each series represents a different competition level (Elite, Kilpa, etc.)
   *
   * @remarks
   * - If series array exists and has items, use series for game assignment
   * - If series is empty/undefined, fall back to legacy `level` field
   * - Migration: tournaments with level but no series get auto-migrated on read
   */
  series?: TournamentSeries[];
  /**
   * Optional player ID for "Player of Tournament" award.
   *
   * @remarks
   * - If player is deleted from roster, trophy UI is gracefully hidden (no broken references)
   * - Backward compatible: tournaments without awards work seamlessly
   * - Displayed with trophy emoji 🏆 in UI (stats tables, tournament list, settings)
   */
  awardedPlayerId?: string;
  /**
   * Optional team placements for this tournament.
   * Maps team IDs to their final placement/ranking.
   *
   * @remarks
   * - Allows tracking team achievements (1st, 2nd, 3rd place, etc.)
   * - Backward compatible: tournaments without placements work seamlessly
   * - Displayed with placement badges (🥇🥈🥉) in UI
   */
  teamPlacements?: {
    [teamId: string]: TeamPlacementInfo;
  };
  /**
   * Game type for this tournament - soccer (outdoor) or futsal (indoor).
   *
   * @remarks
   * Optional for backwards compatibility - defaults to 'soccer' if undefined.
   * Games in this tournament can inherit this setting or override it.
   */
  gameType?: GameType;
  /**
   * Gender for this tournament - boys or girls.
   *
   * @remarks
   * Optional for backwards compatibility - legacy tournaments work without gender set.
   * Games in this tournament can inherit this setting or override it.
   */
  gender?: Gender;
  // Note: teamId removed - tournaments are global entities per plan
  // Note: roster management removed - teams handle rosters now
}

export * from './playerAssessment';
export * from "./game";
export * from './personnel';
export * from './modals';
export * from './settings';

// Player-level manual stat adjustments (e.g., external games not tracked in app)
export interface PlayerStatAdjustment {
  id: string;
  playerId: string;
  seasonId?: string; // optional season association
  teamId?: string; // optional, could be "External" or another team id
  tournamentId?: string; // optional tournament context
  externalTeamName?: string; // optional name of the team the player represented
  opponentName?: string; // optional opponent name
  scoreFor?: number; // optional score for player's team
  scoreAgainst?: number; // optional score against
  gameDate?: string; // optional specific date of the game(s)
  homeOrAway?: 'home' | 'away' | 'neutral'; // relative to externalTeamName
  includeInSeasonTournament?: boolean; // whether to include in season/tournament statistics
  gamesPlayedDelta: number; // may be 0
  goalsDelta: number; // may be 0
  assistsDelta: number; // may be 0
  fairPlayCardsDelta?: number; // Optional: fair play cards from external games (defaults to 0 if undefined)
  note?: string; // optional note shown in UI
  createdBy?: string; // optional user identifier
  appliedAt: string; // ISO timestamp
}
