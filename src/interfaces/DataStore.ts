/**
 * DataStore Interface
 *
 * Backend-agnostic interface for all data operations.
 * Part of Phase 2 backend abstraction (PR #4).
 *
 * @remarks
 * This interface defines the contract that all data store implementations
 * must follow. Currently implemented by LocalDataStore (IndexedDB).
 * Future: SupabaseDataStore for cloud sync.
 *
 * Design decisions (see REALISTIC-IMPLEMENTATION-PLAN.md Section 9):
 * - Game events use index-based operations (not eventId) - matches current implementation
 * - No getPlayerById, getSeasonById, getTournamentById - filter from getAll
 * - Bulk operations (export/import) stay in fullBackup.ts - orchestrate DataStore calls
 * - Premium license excluded - intentionally device-bound
 *
 * @see docs/03-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md
 */

import type { Player, Team, TeamPlayer, Season, Tournament, PlayerStatAdjustment } from '@/types';
import type { AppState, SavedGamesCollection, GameEvent } from '@/types/game';
import type { Personnel } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { AppSettings } from '@/utils/appSettings';
import type { TimerState } from '@/utils/timerStateManager';

/**
 * Main DataStore interface for backend-agnostic data access.
 *
 * Implementations:
 * - LocalDataStore: IndexedDB via @/utils/storage (Phase 3)
 * - SupabaseDataStore: Cloud sync (Phase 4, optional)
 */
export interface DataStore {
  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Initialize the data store.
   * Must be called before any other operations.
   */
  initialize(): Promise<void>;

  /**
   * Close the data store and release resources.
   */
  close(): Promise<void>;

  /**
   * Get the backend name for logging/debugging.
   * @returns Backend identifier (e.g., 'local', 'supabase', 'firebase')
   *
   * @remarks
   * Returns a specific backend identifier string, allowing for multiple
   * cloud providers. Compare with AuthService.getMode() which returns
   * a high-level mode ('local' | 'cloud').
   */
  getBackendName(): string;

  /**
   * Check if the data store is available and ready.
   * @returns true if data store can accept operations
   */
  isAvailable(): Promise<boolean>;

  // ==========================================================================
  // PLAYERS (Master Roster)
  // Note: No getPlayerById - filter from getPlayers() in consuming code.
  // This matches the existing masterRosterManager.ts pattern.
  // ==========================================================================

  /**
   * Get all players from the master roster.
   * @returns All players
   */
  getPlayers(): Promise<Player[]>;

  /**
   * Create a new player.
   * @param player - Player data without id (id will be generated)
   * @returns The created player with generated id
   */
  createPlayer(player: Omit<Player, 'id'>): Promise<Player>;

  /**
   * Update an existing player.
   * @param id - Player ID
   * @param updates - Partial player data to update
   * @returns Updated player or null if not found
   */
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | null>;

  /**
   * Delete a player.
   * @param id - Player ID
   * @returns true if deleted, false if not found
   */
  deletePlayer(id: string): Promise<boolean>;

  // ==========================================================================
  // TEAMS
  // Note: Teams have getTeamById because teams have associated rosters and
  // more complex operations. This matches the existing teams.ts pattern.
  // ==========================================================================

  /**
   * Get all teams.
   * @param includeArchived - If true, include archived teams (default: false)
   * @returns All teams (optionally including archived)
   */
  getTeams(includeArchived?: boolean): Promise<Team[]>;

  /**
   * Get a team by ID.
   * @param id - Team ID
   * @returns Team or null if not found
   */
  getTeamById(id: string): Promise<Team | null>;

  /**
   * Create a new team.
   * @param team - Team data (id, createdAt, updatedAt will be generated)
   * @returns The created team
   */
  createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team>;

  /**
   * Update an existing team.
   * @param id - Team ID
   * @param updates - Partial team data to update
   * @returns Updated team or null if not found
   */
  updateTeam(id: string, updates: Partial<Team>): Promise<Team | null>;

  /**
   * Delete a team.
   * @param id - Team ID
   * @returns true if deleted, false if not found
   */
  deleteTeam(id: string): Promise<boolean>;

  // ==========================================================================
  // TEAM ROSTERS
  // ==========================================================================

  /**
   * Get the roster for a specific team.
   * @param teamId - Team ID
   * @returns Array of team players (empty if team has no roster)
   */
  getTeamRoster(teamId: string): Promise<TeamPlayer[]>;

  /**
   * Set the entire roster for a team.
   * @param teamId - Team ID
   * @param roster - Complete roster to set
   */
  setTeamRoster(teamId: string, roster: TeamPlayer[]): Promise<void>;

  // ==========================================================================
  // SEASONS
  // Note: No getSeasonById - filter from getSeasons() in consuming code.
  // This matches the existing seasons.ts pattern.
  // ==========================================================================

  /**
   * Get all seasons.
   * @param includeArchived - If true, include archived seasons (default: false)
   * @returns All seasons (optionally including archived)
   */
  getSeasons(includeArchived?: boolean): Promise<Season[]>;

  /**
   * Create a new season.
   * @param name - Season name
   * @param extra - Optional additional season data
   * @returns The created season
   */
  createSeason(name: string, extra?: Partial<Omit<Season, 'id' | 'name'>>): Promise<Season>;

  /**
   * Update an existing season.
   * @param season - Full season object with updates
   * @returns Updated season or null if not found
   */
  updateSeason(season: Season): Promise<Season | null>;

  /**
   * Delete a season.
   * @param id - Season ID
   * @returns true if deleted, false if not found
   */
  deleteSeason(id: string): Promise<boolean>;

  // ==========================================================================
  // TOURNAMENTS
  // Note: No getTournamentById - filter from getTournaments() in consuming code.
  // This matches the existing tournaments.ts pattern.
  // ==========================================================================

  /**
   * Get all tournaments.
   * @param includeArchived - If true, include archived tournaments (default: false)
   * @returns All tournaments (optionally including archived)
   */
  getTournaments(includeArchived?: boolean): Promise<Tournament[]>;

  /**
   * Create a new tournament.
   * @param name - Tournament name
   * @param extra - Optional additional tournament data
   * @returns The created tournament
   */
  createTournament(name: string, extra?: Partial<Omit<Tournament, 'id' | 'name'>>): Promise<Tournament>;

  /**
   * Update an existing tournament.
   * @param tournament - Full tournament object with updates
   * @returns Updated tournament or null if not found
   */
  updateTournament(tournament: Tournament): Promise<Tournament | null>;

  /**
   * Delete a tournament.
   * @param id - Tournament ID
   * @returns true if deleted, false if not found
   */
  deleteTournament(id: string): Promise<boolean>;

  // ==========================================================================
  // PERSONNEL
  // ==========================================================================

  /**
   * Get all personnel members.
   * @returns All personnel as array
   */
  getAllPersonnel(): Promise<Personnel[]>;

  /**
   * Get a personnel member by ID.
   * @param id - Personnel ID
   * @returns Personnel or null if not found
   */
  getPersonnelById(id: string): Promise<Personnel | null>;

  /**
   * Add a new personnel member.
   * @param data - Personnel data (id, createdAt, updatedAt will be generated)
   * @returns The created personnel member
   */
  addPersonnelMember(data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>): Promise<Personnel>;

  /**
   * Update an existing personnel member.
   * @param id - Personnel ID
   * @param updates - Partial personnel data to update
   * @returns Updated personnel or null if not found
   */
  updatePersonnelMember(id: string, updates: Partial<Personnel>): Promise<Personnel | null>;

  /**
   * Remove a personnel member.
   * CASCADE DELETE: Also removes from all games' gamePersonnel arrays.
   * @param id - Personnel ID
   * @returns true if deleted, false if not found
   */
  removePersonnelMember(id: string): Promise<boolean>;

  // ==========================================================================
  // GAMES
  // ==========================================================================

  /**
   * Get all saved games.
   * @returns Games collection (object map by gameId)
   */
  getGames(): Promise<SavedGamesCollection>;

  /**
   * Get a game by ID.
   * @param id - Game ID
   * @returns Game state or null if not found
   */
  getGameById(id: string): Promise<AppState | null>;

  /**
   * Create a new game.
   * @param game - Partial game data (defaults will be applied)
   * @returns Object containing generated gameId and full game data
   */
  createGame(game: Partial<AppState>): Promise<{ gameId: string; gameData: AppState }>;

  /**
   * Save a game (create or update).
   * @param id - Game ID
   * @param game - Full game state
   * @returns The saved game state
   */
  saveGame(id: string, game: AppState): Promise<AppState>;

  /**
   * Delete a game.
   * @param id - Game ID
   * @returns true if deleted, false if not found
   */
  deleteGame(id: string): Promise<boolean>;

  // ==========================================================================
  // GAME EVENTS
  // Events are stored inside game documents, not separately.
  // Operations use index-based access to match current implementation.
  // ==========================================================================

  /**
   * Add an event to a game.
   * @param gameId - Game ID
   * @param event - Event to add
   * @returns Updated game state or null if game not found
   */
  addGameEvent(gameId: string, event: GameEvent): Promise<AppState | null>;

  /**
   * Update an event in a game.
   * @param gameId - Game ID
   * @param eventIndex - Index of event in gameEvents array
   * @param event - Updated event data
   * @returns Updated game state or null if game/event not found
   */
  updateGameEvent(gameId: string, eventIndex: number, event: GameEvent): Promise<AppState | null>;

  /**
   * Remove an event from a game.
   * @param gameId - Game ID
   * @param eventIndex - Index of event in gameEvents array
   * @returns Updated game state or null if game/event not found
   */
  removeGameEvent(gameId: string, eventIndex: number): Promise<AppState | null>;

  // ==========================================================================
  // SETTINGS
  // ==========================================================================

  /**
   * Get application settings.
   * @returns Current settings (defaults applied if not set)
   */
  getSettings(): Promise<AppSettings>;

  /**
   * Save application settings.
   * @param settings - Full settings object to save
   */
  saveSettings(settings: AppSettings): Promise<void>;

  // ==========================================================================
  // PLAYER ADJUSTMENTS (External Stats)
  // ==========================================================================

  /**
   * Get all adjustments for a player.
   * @param playerId - Player ID
   * @returns Array of adjustments for the player
   */
  getPlayerAdjustments(playerId: string): Promise<PlayerStatAdjustment[]>;

  /**
   * Add a new player adjustment.
   * @param adjustment - Adjustment data (id and appliedAt will be generated if not provided)
   * @returns The created adjustment
   */
  addPlayerAdjustment(
    adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
  ): Promise<PlayerStatAdjustment>;

  /**
   * Update a player adjustment.
   * @param playerId - Player ID
   * @param adjustmentId - Adjustment ID
   * @param patch - Partial adjustment data to update
   * @returns Updated adjustment or null if not found
   */
  updatePlayerAdjustment(
    playerId: string,
    adjustmentId: string,
    patch: Partial<PlayerStatAdjustment>
  ): Promise<PlayerStatAdjustment | null>;

  /**
   * Delete a player adjustment.
   * @param playerId - Player ID
   * @param adjustmentId - Adjustment ID
   * @returns true if deleted, false if not found
   */
  deletePlayerAdjustment(playerId: string, adjustmentId: string): Promise<boolean>;

  // ==========================================================================
  // WARMUP PLAN
  // ==========================================================================

  /**
   * Get the warmup plan.
   * @returns Warmup plan or null if not set
   */
  getWarmupPlan(): Promise<WarmupPlan | null>;

  /**
   * Save the warmup plan.
   * @param plan - Warmup plan to save
   * @returns true if saved successfully
   */
  saveWarmupPlan(plan: WarmupPlan): Promise<boolean>;

  /**
   * Delete the warmup plan.
   * @returns true if deleted, false if not found
   */
  deleteWarmupPlan(): Promise<boolean>;

  // ==========================================================================
  // TIMER STATE
  // Timer state is ephemeral - used for tab visibility restore.
  // ==========================================================================

  /**
   * Get the current timer state.
   * @returns Timer state or null if not set
   */
  getTimerState(): Promise<TimerState | null>;

  /**
   * Save timer state.
   * @param state - Timer state to save
   */
  saveTimerState(state: TimerState): Promise<void>;

  /**
   * Clear timer state.
   */
  clearTimerState(): Promise<void>;
}
