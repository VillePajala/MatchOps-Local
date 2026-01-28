/**
 * SyncedDataStore
 *
 * Local-first DataStore implementation that writes to local storage immediately
 * and queues operations for background sync to the cloud.
 *
 * This is the DataStore used in cloud mode. It provides:
 * - Instant writes (to IndexedDB)
 * - Background sync (via SyncQueue + SyncEngine)
 * - Offline support (operations queue until online)
 * - Data safety (local-first, never lose data)
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import type {
  Player,
  Team,
  TeamPlayer,
  Season,
  Tournament,
  PlayerStatAdjustment,
} from '@/types';
import type { AppState, SavedGamesCollection, GameEvent } from '@/types/game';
import type { Personnel } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { AppSettings } from '@/types/settings';
import type { TimerState } from '@/utils/timerStateManager';
import type { DataStore } from '@/interfaces/DataStore';
import { LocalDataStore } from './LocalDataStore';
import { normalizeWarmupPlanForSave } from './normalizers';
import { SyncQueue, SyncEngine, getSyncEngine, type SyncOperationExecutor } from '@/sync';
import type { SyncEntityType, SyncOperationType, SyncStatusInfo } from '@/sync';
import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';

/**
 * Error info passed to queue error listeners
 */
export interface SyncQueueErrorInfo {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  error: string;
}

/**
 * Listener for queue errors - called when an operation fails to queue for sync.
 * This allows the app layer to notify users that their change may not sync.
 */
export type SyncQueueErrorListener = (error: SyncQueueErrorInfo) => void;

/**
 * SyncedDataStore - Local-first DataStore with background cloud sync.
 *
 * All operations:
 * 1. Execute immediately on local storage (IndexedDB via LocalDataStore)
 * 2. Queue sync operation (via SyncQueue)
 * 3. Return result immediately (user sees instant save)
 *
 * The SyncEngine processes the queue in the background when online.
 */
export class SyncedDataStore implements DataStore {
  private localStore: LocalDataStore;
  private syncQueue: SyncQueue;
  private syncEngine: SyncEngine | null = null;
  private initialized = false;
  private queueErrorListeners: Set<SyncQueueErrorListener> = new Set();

  constructor() {
    this.localStore = new LocalDataStore();
    this.syncQueue = new SyncQueue();
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('[SyncedDataStore] Initializing');

    // Initialize local store first (this is the source of truth)
    await this.localStore.initialize();

    // Initialize sync queue
    await this.syncQueue.initialize();

    // Get or create the sync engine singleton
    this.syncEngine = getSyncEngine(this.syncQueue);

    // Note: The executor is NOT set here - it will be set by the factory
    // when it has the cloud store available. This allows SyncedDataStore
    // to work without a cloud connection (queue-only mode for testing).

    this.initialized = true;
    logger.info('[SyncedDataStore] Initialized');
  }

  async close(): Promise<void> {
    logger.info('[SyncedDataStore] Closing');

    // Dispose the sync engine (waits for in-flight ops, clears listeners)
    if (this.syncEngine) {
      await this.syncEngine.dispose();
    }

    // Clear queue error listeners to prevent memory leaks on mode switch
    this.queueErrorListeners.clear();

    // Close local store
    await this.localStore.close();

    // Close sync queue
    await this.syncQueue.close();

    this.initialized = false;
    logger.info('[SyncedDataStore] Closed');
  }

  getBackendName(): string {
    return 'synced';
  }

  async isAvailable(): Promise<boolean> {
    return this.localStore.isAvailable();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  clearUserCaches(): void {
    // SyncedDataStore doesn't maintain its own caches.
    // LocalDataStore is called directly for all operations.
    // SyncQueue and SyncEngine manage their own state independently
    // and don't have user-specific caches to clear.
  }

  // ==========================================================================
  // SYNC ENGINE CONTROL
  // ==========================================================================

  /**
   * Set the executor that syncs operations to the cloud.
   * Called by the factory after cloud store is available.
   */
  setExecutor(executor: SyncOperationExecutor): void {
    if (!this.syncEngine) {
      logger.warn('[SyncedDataStore] Cannot set executor - sync engine not initialized');
      return;
    }
    this.syncEngine.setExecutor(executor);
  }

  /**
   * Start the sync engine.
   * Called by the factory after executor is set.
   */
  startSync(): void {
    if (!this.syncEngine) {
      logger.warn('[SyncedDataStore] Cannot start sync - sync engine not initialized');
      return;
    }
    this.syncEngine.start();
  }

  /**
   * Stop the sync engine.
   */
  stopSync(): void {
    if (this.syncEngine) {
      this.syncEngine.stop();
    }
  }

  /**
   * Get the current sync status.
   */
  async getSyncStatus(): Promise<SyncStatusInfo> {
    if (!this.syncEngine) {
      // Log when returning fallback status to aid debugging
      logger.debug('[SyncedDataStore] getSyncStatus: returning fallback (no sync engine)');
      return {
        state: 'offline',
        pendingCount: 0,
        failedCount: 0,
        lastSyncedAt: null,
        isOnline: false,
      };
    }
    return this.syncEngine.getStatus();
  }

  /**
   * Subscribe to sync status changes.
   */
  onSyncStatusChange(listener: (status: SyncStatusInfo) => void): () => void {
    if (!this.syncEngine) {
      return () => {};
    }
    return this.syncEngine.onStatusChange(listener);
  }

  /**
   * Subscribe to queue error events.
   * Called when an operation fails to queue for sync (local write succeeds but sync won't happen).
   * This allows the app to notify users that their change may not sync to cloud.
   *
   * @returns Unsubscribe function
   */
  onQueueError(listener: SyncQueueErrorListener): () => void {
    this.queueErrorListeners.add(listener);
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return; // Idempotent unsubscribe
      unsubscribed = true;
      this.queueErrorListeners.delete(listener);
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Notify all queue error listeners.
   */
  private notifyQueueError(info: SyncQueueErrorInfo): void {
    for (const listener of this.queueErrorListeners) {
      try {
        listener(info);
      } catch (listenerError) {
        logger.error('[SyncedDataStore] Queue error listener threw:', listenerError);
        // Track in Sentry - listener bugs could cause sync errors to go unreported to users
        try {
          Sentry.captureException(listenerError, {
            tags: { component: 'SyncedDataStore', action: 'notifyQueueError' },
            level: 'error',
            extra: { queueErrorInfo: info },
          });
        } catch {
          // Sentry failure must not prevent other listeners from being notified
        }
      }
    }
  }

  /**
   * Queue a sync operation and nudge the engine.
   */
  private async queueSync(
    entityType: SyncEntityType,
    entityId: string,
    operation: SyncOperationType,
    data: unknown
  ): Promise<void> {
    try {
      await this.syncQueue.enqueue({
        entityType,
        entityId,
        operation,
        data,
        timestamp: Date.now(),
      });

      // Nudge the engine to process soon
      if (this.syncEngine) {
        this.syncEngine.nudge();
      }
    } catch (error) {
      // Local write succeeded, but failed to queue sync operation.
      // This is not fatal - log and continue. The operation will be
      // missing from sync, but local data is safe. User can trigger
      // a full sync later if needed.
      //
      // IMPORTANT: This is a data loss scenario - the change won't sync to cloud.
      // We log to Sentry and notify listeners so the app can alert the user.
      const errorMessage = error instanceof Error ? error.message : String(error);
      const context = {
        entityType,
        entityId,
        operation,
        error: errorMessage,
      };
      logger.error('[SyncedDataStore] Failed to queue sync operation', context);

      // Report to Sentry for production tracking
      try {
        Sentry.captureException(error, {
          tags: { component: 'SyncedDataStore', action: 'queueSync' },
          extra: context,
        });
      } catch {
        // Sentry failure must not prevent listener notification
      }

      // Notify listeners so the app can alert the user
      this.notifyQueueError({
        entityType,
        entityId,
        operation,
        error: errorMessage,
      });
    }
  }

  // ==========================================================================
  // PLAYERS (Master Roster)
  // ==========================================================================

  async getPlayers(): Promise<Player[]> {
    return this.localStore.getPlayers();
  }

  async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
    const created = await this.localStore.createPlayer(player);
    await this.queueSync('player', created.id, 'create', created);
    return created;
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | null> {
    const updated = await this.localStore.updatePlayer(id, updates);
    if (updated) {
      await this.queueSync('player', id, 'update', updated);
    }
    return updated;
  }

  async deletePlayer(id: string): Promise<boolean> {
    const deleted = await this.localStore.deletePlayer(id);
    if (deleted) {
      await this.queueSync('player', id, 'delete', null);
    }
    return deleted;
  }

  async upsertPlayer(player: Player): Promise<Player> {
    const result = await this.localStore.upsertPlayer(player);
    // Queue as 'create' - the cloud store uses upsert which handles both create and update.
    // Using 'create' ensures correct deduplication: CREATE + DELETE = nothing (entity never synced)
    await this.queueSync('player', player.id, 'create', result);
    return result;
  }

  // ==========================================================================
  // TEAMS
  // ==========================================================================

  async getTeams(includeArchived?: boolean): Promise<Team[]> {
    return this.localStore.getTeams(includeArchived);
  }

  async getTeamById(id: string): Promise<Team | null> {
    return this.localStore.getTeamById(id);
  }

  async createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    const created = await this.localStore.createTeam(team);
    await this.queueSync('team', created.id, 'create', created);
    return created;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    const updated = await this.localStore.updateTeam(id, updates);
    if (updated) {
      await this.queueSync('team', id, 'update', updated);
    }
    return updated;
  }

  async deleteTeam(id: string): Promise<boolean> {
    const deleted = await this.localStore.deleteTeam(id);
    if (deleted) {
      await this.queueSync('team', id, 'delete', null);
    }
    return deleted;
  }

  async upsertTeam(team: Team): Promise<Team> {
    const result = await this.localStore.upsertTeam(team);
    // Queue as 'create' - cloud uses upsert, ensures correct deduplication
    await this.queueSync('team', team.id, 'create', result);
    return result;
  }

  // ==========================================================================
  // TEAM ROSTERS
  // ==========================================================================

  async getTeamRoster(teamId: string): Promise<TeamPlayer[]> {
    return this.localStore.getTeamRoster(teamId);
  }

  async setTeamRoster(teamId: string, roster: TeamPlayer[]): Promise<void> {
    await this.localStore.setTeamRoster(teamId, roster);
    await this.queueSync('teamRoster', teamId, 'update', roster);
  }

  async getAllTeamRosters(): Promise<Record<string, TeamPlayer[]>> {
    return this.localStore.getAllTeamRosters();
  }

  // ==========================================================================
  // SEASONS
  // ==========================================================================

  async getSeasons(includeArchived?: boolean): Promise<Season[]> {
    return this.localStore.getSeasons(includeArchived);
  }

  async createSeason(
    name: string,
    extra?: Partial<Omit<Season, 'id' | 'name'>>
  ): Promise<Season> {
    const created = await this.localStore.createSeason(name, extra);
    await this.queueSync('season', created.id, 'create', created);
    return created;
  }

  async updateSeason(season: Season): Promise<Season | null> {
    const updated = await this.localStore.updateSeason(season);
    if (updated) {
      await this.queueSync('season', season.id, 'update', updated);
    }
    return updated;
  }

  async deleteSeason(id: string): Promise<boolean> {
    const deleted = await this.localStore.deleteSeason(id);
    if (deleted) {
      await this.queueSync('season', id, 'delete', null);
    }
    return deleted;
  }

  async upsertSeason(season: Season): Promise<Season> {
    const result = await this.localStore.upsertSeason(season);
    // Queue as 'create' - cloud uses upsert, ensures correct deduplication
    await this.queueSync('season', season.id, 'create', result);
    return result;
  }

  // ==========================================================================
  // TOURNAMENTS
  // ==========================================================================

  async getTournaments(includeArchived?: boolean): Promise<Tournament[]> {
    return this.localStore.getTournaments(includeArchived);
  }

  async createTournament(
    name: string,
    extra?: Partial<Omit<Tournament, 'id' | 'name'>>
  ): Promise<Tournament> {
    const created = await this.localStore.createTournament(name, extra);
    await this.queueSync('tournament', created.id, 'create', created);
    return created;
  }

  async updateTournament(tournament: Tournament): Promise<Tournament | null> {
    const updated = await this.localStore.updateTournament(tournament);
    if (updated) {
      await this.queueSync('tournament', tournament.id, 'update', updated);
    }
    return updated;
  }

  async deleteTournament(id: string): Promise<boolean> {
    const deleted = await this.localStore.deleteTournament(id);
    if (deleted) {
      await this.queueSync('tournament', id, 'delete', null);
    }
    return deleted;
  }

  async upsertTournament(tournament: Tournament): Promise<Tournament> {
    const result = await this.localStore.upsertTournament(tournament);
    // Queue as 'create' - cloud uses upsert, ensures correct deduplication
    await this.queueSync('tournament', tournament.id, 'create', result);
    return result;
  }

  // ==========================================================================
  // PERSONNEL
  // ==========================================================================

  async getAllPersonnel(): Promise<Personnel[]> {
    return this.localStore.getAllPersonnel();
  }

  async getPersonnelById(id: string): Promise<Personnel | null> {
    return this.localStore.getPersonnelById(id);
  }

  async addPersonnelMember(
    data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Personnel> {
    const created = await this.localStore.addPersonnelMember(data);
    await this.queueSync('personnel', created.id, 'create', created);
    return created;
  }

  async updatePersonnelMember(
    id: string,
    updates: Partial<Personnel>
  ): Promise<Personnel | null> {
    const updated = await this.localStore.updatePersonnelMember(id, updates);
    if (updated) {
      await this.queueSync('personnel', id, 'update', updated);
    }
    return updated;
  }

  async removePersonnelMember(id: string): Promise<boolean> {
    const deleted = await this.localStore.removePersonnelMember(id);
    if (deleted) {
      await this.queueSync('personnel', id, 'delete', null);
    }
    return deleted;
  }

  async upsertPersonnelMember(personnel: Personnel): Promise<Personnel> {
    const result = await this.localStore.upsertPersonnelMember(personnel);
    // Queue as 'create' - cloud uses upsert, ensures correct deduplication
    await this.queueSync('personnel', personnel.id, 'create', result);
    return result;
  }

  // ==========================================================================
  // GAMES
  // ==========================================================================

  async getGames(): Promise<SavedGamesCollection> {
    return this.localStore.getGames();
  }

  async getGameById(id: string): Promise<AppState | null> {
    return this.localStore.getGameById(id);
  }

  async createGame(
    game: Partial<AppState>
  ): Promise<{ gameId: string; gameData: AppState }> {
    const result = await this.localStore.createGame(game);
    await this.queueSync('game', result.gameId, 'create', result.gameData);
    return result;
  }

  async saveGame(id: string, game: AppState): Promise<AppState> {
    const saved = await this.localStore.saveGame(id, game);
    await this.queueSync('game', id, 'update', saved);
    return saved;
  }

  async saveAllGames(games: SavedGamesCollection): Promise<void> {
    await this.localStore.saveAllGames(games);

    // Queue all games in parallel - use allSettled so one failure doesn't
    // prevent other queue attempts. queueSync already logs individual errors.
    const results = await Promise.allSettled(
      Object.entries(games).map(([gameId, gameData]) =>
        this.queueSync('game', gameId, 'update', gameData)
      )
    );

    // Log summary if any failed to queue
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      logger.warn('[SyncedDataStore] Some games failed to queue for sync', {
        failed: failures.length,
        total: Object.keys(games).length,
      });
    }
  }

  async deleteGame(id: string): Promise<boolean> {
    const deleted = await this.localStore.deleteGame(id);
    if (deleted) {
      await this.queueSync('game', id, 'delete', null);
    }
    return deleted;
  }

  // ==========================================================================
  // GAME EVENTS
  // ==========================================================================

  async addGameEvent(gameId: string, event: GameEvent): Promise<AppState | null> {
    const updated = await this.localStore.addGameEvent(gameId, event);
    if (updated) {
      await this.queueSync('game', gameId, 'update', updated);
    }
    return updated;
  }

  async updateGameEvent(
    gameId: string,
    eventIndex: number,
    event: GameEvent
  ): Promise<AppState | null> {
    const updated = await this.localStore.updateGameEvent(gameId, eventIndex, event);
    if (updated) {
      await this.queueSync('game', gameId, 'update', updated);
    }
    return updated;
  }

  async removeGameEvent(
    gameId: string,
    eventIndex: number
  ): Promise<AppState | null> {
    const updated = await this.localStore.removeGameEvent(gameId, eventIndex);
    if (updated) {
      await this.queueSync('game', gameId, 'update', updated);
    }
    return updated;
  }

  // ==========================================================================
  // SETTINGS
  // ==========================================================================

  async getSettings(): Promise<AppSettings> {
    return this.localStore.getSettings();
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.localStore.saveSettings(settings);
    await this.queueSync('settings', 'app', 'update', settings);
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const updated = await this.localStore.updateSettings(updates);
    await this.queueSync('settings', 'app', 'update', updated);
    return updated;
  }

  // ==========================================================================
  // PLAYER ADJUSTMENTS
  // ==========================================================================

  async getPlayerAdjustments(playerId: string): Promise<PlayerStatAdjustment[]> {
    return this.localStore.getPlayerAdjustments(playerId);
  }

  async addPlayerAdjustment(
    adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & {
      id?: string;
      appliedAt?: string;
    }
  ): Promise<PlayerStatAdjustment> {
    const created = await this.localStore.addPlayerAdjustment(adjustment);
    await this.queueSync('playerAdjustment', created.id, 'create', created);
    return created;
  }

  async upsertPlayerAdjustment(
    adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & {
      id?: string;
      appliedAt?: string;
    }
  ): Promise<PlayerStatAdjustment> {
    const result = await this.localStore.upsertPlayerAdjustment(adjustment);
    // Queue as 'create' - cloud uses upsert, ensures correct deduplication (CREATE + DELETE = nothing)
    await this.queueSync('playerAdjustment', result.id, 'create', result);
    return result;
  }

  async updatePlayerAdjustment(
    playerId: string,
    adjustmentId: string,
    patch: Partial<PlayerStatAdjustment>
  ): Promise<PlayerStatAdjustment | null> {
    const updated = await this.localStore.updatePlayerAdjustment(
      playerId,
      adjustmentId,
      patch
    );
    if (updated) {
      await this.queueSync('playerAdjustment', adjustmentId, 'update', updated);
    }
    return updated;
  }

  async deletePlayerAdjustment(
    playerId: string,
    adjustmentId: string
  ): Promise<boolean> {
    const deleted = await this.localStore.deletePlayerAdjustment(
      playerId,
      adjustmentId
    );
    if (deleted) {
      // playerAdjustment delete requires playerId in data (composite key in cloud)
      await this.queueSync('playerAdjustment', adjustmentId, 'delete', { playerId });
    }
    return deleted;
  }

  async getAllPlayerAdjustments(): Promise<Map<string, PlayerStatAdjustment[]>> {
    return this.localStore.getAllPlayerAdjustments();
  }

  // ==========================================================================
  // WARMUP PLAN
  // ==========================================================================

  async getWarmupPlan(): Promise<WarmupPlan | null> {
    return this.localStore.getWarmupPlan();
  }

  async saveWarmupPlan(plan: WarmupPlan): Promise<boolean> {
    const result = await this.localStore.saveWarmupPlan(plan);
    if (result) {
      // Sync the normalized version (same normalization as LocalDataStore)
      const normalizedPlan = normalizeWarmupPlanForSave(plan);
      await this.queueSync('warmupPlan', 'default', 'update', normalizedPlan);
    }
    return result;
  }

  async deleteWarmupPlan(): Promise<boolean> {
    const deleted = await this.localStore.deleteWarmupPlan();
    if (deleted) {
      await this.queueSync('warmupPlan', 'default', 'delete', null);
    }
    return deleted;
  }

  // ==========================================================================
  // TIMER STATE
  // ==========================================================================

  async getTimerState(): Promise<TimerState | null> {
    return this.localStore.getTimerState();
  }

  async saveTimerState(state: TimerState): Promise<void> {
    // Timer state is ephemeral - local only, no sync needed
    return this.localStore.saveTimerState(state);
  }

  async clearTimerState(): Promise<void> {
    // Timer state is ephemeral - local only, no sync needed
    return this.localStore.clearTimerState();
  }

  // ==========================================================================
  // DATA MANAGEMENT
  // ==========================================================================

  async clearAllUserData(): Promise<void> {
    // Stop sync engine first. Note: This immediately stops processing,
    // so any in-flight sync operations will be interrupted. This is
    // acceptable for a "clear all data" operation - we're wiping everything.
    if (this.syncEngine) {
      this.syncEngine.stop();
    }

    // Clear the sync queue (pending operations will be discarded)
    await this.syncQueue.clear();

    // Clear local data
    await this.localStore.clearAllUserData();

    logger.info('[SyncedDataStore] All user data cleared');
  }
}
