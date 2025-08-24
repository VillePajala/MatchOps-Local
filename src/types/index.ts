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
  defaultRosterId?: string;
  defaultRoster?: string[];
  notes?: string;
  color?: string;
  badge?: string;
  ageGroup?: string;
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
  defaultRosterId?: string;
  defaultRoster?: string[];
  notes?: string;
  color?: string;
  badge?: string;
  level?: string;
  ageGroup?: string;
}

export * from './playerAssessment';
export * from "./game";

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
  note?: string; // optional note shown in UI
  createdBy?: string; // optional user identifier
  appliedAt: string; // ISO timestamp
}
