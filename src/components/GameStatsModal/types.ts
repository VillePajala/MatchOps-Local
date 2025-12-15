/**
 * Shared types for GameStatsModal and its sub-components
 */

import { Player, GameEvent, SavedGamesCollection, PlayerStatRow } from '@/types';
import type { GameType, Gender } from '@/types/game';

// Define the type for sortable columns
export type SortableColumn = 'name' | 'goals' | 'assists' | 'totalScore' | 'fpAwards' | 'gamesPlayed' | 'avgPoints';
export type SortDirection = 'asc' | 'desc';

// Define tab types
export type StatsTab = 'currentGame' | 'season' | 'tournament' | 'overall' | 'player';

// Minimal interface for saved game structure used in this component
export interface SavedGame {
  availablePlayers?: Player[];
  selectedPlayerIds?: string[];
  seasonId?: string;
  tournamentId?: string;
  teamId?: string | null;
  gameEvents?: GameEvent[];
  isPlayed?: boolean;
}

// Tournament and season statistics interfaces
export interface TournamentSeasonStats {
  id: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  winPercentage: number;
  averageGoalsFor: number;
  averageGoalsAgainst: number;
  lastGameDate?: string;
}

export interface OverallTournamentSeasonStats {
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalGoalsFor: number;
  totalGoalsAgainst: number;
  totalGoalDifference: number;
  overallWinPercentage: number;
  averageGoalsFor: number;
  averageGoalsAgainst: number;
  tournaments: TournamentSeasonStats[];
  seasons: TournamentSeasonStats[];
}

// Game stats calculation parameters
export interface GameStatsParams {
  activeTab: StatsTab;
  savedGames: SavedGamesCollection | null;
  availablePlayers: Player[];
  selectedPlayerIds: string[];
  localGameEvents: GameEvent[];
  currentGameId: string | null;
  selectedSeasonIdFilter: string | 'all';
  selectedTournamentIdFilter: string | 'all';
  selectedTeamIdFilter: string | 'all' | 'legacy';
  selectedSeriesIdFilter: string | 'all';
  selectedGameTypeFilter: GameType | 'all';
  selectedGenderFilter: Gender | 'all';
  sortColumn: SortableColumn;
  sortDirection: SortDirection;
  filterText: string;
}

// Game stats calculation result
export interface GameStatsResult {
  stats: PlayerStatRow[];
  gameIds: string[];
  totals: {
    gamesPlayed: number;
    goals: number;
    assists: number;
    totalScore: number;
  };
}

// Goal editor state
export interface GoalEditorState {
  editingGoalId: string | null;
  editGoalTime: string;
  editGoalScorerId: string;
  editGoalAssisterId: string | undefined;
}

// Game filters
export interface GameFilters {
  selectedSeasonIdFilter: string | 'all';
  selectedTournamentIdFilter: string | 'all';
  selectedTeamIdFilter: string | 'all' | 'legacy';
  selectedSeriesIdFilter: string | 'all';
}
