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
import { SyncQueue, SyncEngine, getSyncEngine, resetSyncEngine, type SyncOperationExecutor } from '@/sync';
import type { SyncEntityType, SyncOperationType, SyncStatusInfo } from '@/sync';
import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';

/**
 * Compare two objects excluding timestamps to detect actual data changes.
 * Used to avoid unnecessary sync operations when data hasn't changed.
 *
 * @param a - First object
 * @param b - Second object
 * @returns true if the objects are equal (excluding timestamps)
 */
function isDataEqual<T extends { createdAt?: string; updatedAt?: string }>(a: T, b: T): boolean {
  // Strip timestamps for comparison (underscore-prefixed vars are intentionally unused)
  const { createdAt: _ca, updatedAt: _ua, ...restA } = a;
  const { createdAt: _cb, updatedAt: _ub, ...restB } = b;

  // JSON.stringify comparison - fast for typical data sizes
  try {
    return JSON.stringify(restA) === JSON.stringify(restB);
  } catch {
    // If serialization fails (circular ref), assume different
    return false;
  }
}

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

  /**
   * Reference to the remote (cloud) DataStore for operations that need direct cloud access.
   * Set by the factory after cloud store is initialized.
   * Used by clearAllUserData() to clear both local AND cloud data.
   */
  private remoteStore: DataStore | null = null;

  /**
   * User ID for user-scoped storage.
   * If set, the underlying LocalDataStore uses a user-specific IndexedDB database.
   */
  private readonly userId?: string;

  /**
   * True after close() has been called. Prevents operations on closed store.
   */
  private closed = false;

  /**
   * Creates a new SyncedDataStore instance.
   *
   * @param userId - Optional user ID for user-scoped storage.
   *                 If provided, data is stored in database `matchops_user_{userId}`.
   *                 If omitted, uses legacy global database `MatchOpsLocal`.
   */
  constructor(userId?: string) {
    this.userId = userId;
    this.localStore = new LocalDataStore(userId);
    // Pass userId to SyncQueue for user-scoped queue database.
    // This prevents stale operations from other users appearing in the queue.
    this.syncQueue = new SyncQueue(userId);
    logger.info('[SyncedDataStore] Created', { userId: userId || '(none)' });
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
    const closeStartTime = Date.now();
    logger.info('[SyncedDataStore] Closing', { userId: this.userId });

    // CRITICAL: Mark as closed FIRST to prevent any concurrent operations
    // This prevents race conditions where setExecutor() is called during close
    this.closed = true;

    // CRITICAL: Reset the sync engine singleton so a new engine is created for the next user.
    // Without this, the new SyncedDataStore's getSyncEngine() would return the OLD
    // instance that still references the OLD SyncQueue, causing:
    // - User B's operations go to SyncQueue B
    // - But SyncEngine processes SyncQueue A (closed/empty)
    // - Result: operations never sync
    // Note: resetSyncEngine() calls dispose() internally, which waits for in-flight ops
    // and clears listeners.
    if (this.syncEngine) {
      logger.info('[SyncedDataStore] Resetting sync engine...');
      // Null the reference BEFORE reset to prevent race conditions where
      // setExecutor() is called on the old engine during dispose
      const engineRef = this.syncEngine;
      this.syncEngine = null;
      await resetSyncEngine();
      logger.info('[SyncedDataStore] Sync engine reset', { elapsedMs: Date.now() - closeStartTime });
    }

    // Clear queue error listeners to prevent memory leaks on mode switch
    this.queueErrorListeners.clear();

    // Close local store
    logger.info('[SyncedDataStore] Closing local store...');
    await this.localStore.close();
    logger.info('[SyncedDataStore] Local store closed', { elapsedMs: Date.now() - closeStartTime });

    // CRITICAL: Clear the sync queue before closing to prevent stale operations
    // from being processed when a new user signs in. Without this, operations
    // queued by User A would be processed when User B signs in, causing:
    // 1. Auth errors (getSession() returns null or different user's session)
    // 2. Potential data leakage (User A's data synced to User B's cloud storage)
    // 3. "Cannot close DataStore: X pending sync operation(s)" blocking user transitions
    // See: MATCHOPS-LOCAL-23 (186+ settings sync failures)
    logger.info('[SyncedDataStore] Clearing sync queue...');
    await this.syncQueue.clear();
    logger.info('[SyncedDataStore] Sync queue cleared', { elapsedMs: Date.now() - closeStartTime });

    // Close sync queue (releases IndexedDB connection)
    await this.syncQueue.close();

    // Close remote store if set (releases Supabase connections)
    // Without this, SupabaseDataStore instances leak on each account switch
    if (this.remoteStore) {
      logger.info('[SyncedDataStore] Closing remote store...');
      try {
        await this.remoteStore.close();
      } catch (e) {
        logger.warn('[SyncedDataStore] Error closing remote store:', e);
      }
      this.remoteStore = null;
    }

    this.initialized = false;
    logger.info('[SyncedDataStore] Closed', { totalDurationMs: Date.now() - closeStartTime });
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
    // Guard: Prevent setting executor on closed store (race condition during user switch)
    if (this.closed) {
      logger.warn('[SyncedDataStore] Cannot set executor - store is closed (user switched?)');
      return;
    }
    if (!this.syncEngine) {
      logger.warn('[SyncedDataStore] Cannot set executor - sync engine not initialized');
      return;
    }
    logger.info('[SyncedDataStore] Setting executor on sync engine');
    this.syncEngine.setExecutor(executor);
  }

  /**
   * Set the remote (cloud) DataStore reference.
   * Called by the factory after cloud store is available.
   * This allows clearAllUserData() to clear both local AND cloud data.
   *
   * @param store - The SupabaseDataStore instance for direct cloud operations
   */
  setRemoteStore(store: DataStore): void {
    // Guard: Prevent setting remote store on closed store (race condition during user switch)
    if (this.closed) {
      logger.warn('[SyncedDataStore] Cannot set remote store - store is closed (user switched?)');
      return;
    }
    this.remoteStore = store;
    logger.info('[SyncedDataStore] Remote store set');
  }

  /**
   * Get the underlying local store for direct writes.
   * Used by conflict resolution to update local without re-queueing for sync.
   *
   * @returns The LocalDataStore instance
   */
  getLocalStore(): DataStore {
    return this.localStore;
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
    // DIAGNOSTIC: Log queue state before starting to help debug sync issues
    this.syncQueue.getStats().then(stats => {
      logger.info('[SyncedDataStore] Starting sync engine', {
        userId: this.userId || '(none)',
        queueStats: stats,
      });
    }).catch(e => {
      logger.warn('[SyncedDataStore] Could not get queue stats before start:', e);
    });
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
        cloudConnected: false,
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
    // Guard: Skip queueing if not initialized (e.g., during startup race conditions)
    // This prevents "SyncQueue not initialized" errors when saves happen before
    // the DataStore is fully ready. The local write still succeeds, but won't sync.
    if (!this.initialized) {
      logger.warn('[SyncedDataStore] queueSync called before initialization, skipping', {
        entityType,
        entityId,
        operation,
      });
      return;
    }

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
    // Get existing game to detect if data actually changed.
    // This prevents unnecessary saves AND preserves correct timestamps for conflict resolution.
    const existing = await this.localStore.getGameById(id);

    // If data is unchanged (excluding timestamps), skip save entirely.
    // This is critical because:
    // 1. LocalDataStore.saveGame() always updates updatedAt to "now"
    // 2. If we save unchanged data, local gets artificially newer timestamp
    // 3. Future conflict resolution would incorrectly favor local (newer timestamp wins)
    // 4. By skipping, we preserve the original timestamp from cloud/last real change
    if (existing && isDataEqual(game, existing)) {
      logger.debug('[SyncedDataStore] Skipping save - game data unchanged (preserving timestamp)', {
        gameId: id.slice(0, 20),
        existingUpdatedAt: existing.updatedAt,
      });
      return existing; // Return existing game with correct timestamp
    }

    // Data changed (or new game) - save and queue for sync
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
    // Get existing settings to detect if data actually changed
    const existing = await this.localStore.getSettings();

    // Skip save if data unchanged - preserves timestamp for correct conflict resolution
    if (isDataEqual(settings, existing)) {
      logger.debug('[SyncedDataStore] Skipping save - settings unchanged (preserving timestamp)');
      return;
    }

    // Data changed - save and queue for sync
    await this.localStore.saveSettings(settings);
    await this.queueSync('settings', 'app', 'update', settings);
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    // Get existing settings to detect if data actually changed
    const existing = await this.localStore.getSettings();

    // Apply updates to check if result would be different
    const merged = { ...existing, ...updates };

    // Skip save if data unchanged - preserves timestamp for correct conflict resolution
    if (isDataEqual(merged, existing)) {
      logger.debug('[SyncedDataStore] Skipping save - settings unchanged (preserving timestamp)');
      return existing;
    }

    // Data changed - save and queue for sync
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

  /**
   * Push all local data directly to cloud, bypassing the sync queue.
   * Use this for bulk operations like backup import where the sync queue
   * approach would be too slow or unreliable due to network issues.
   *
   * This method:
   * 1. Pauses the sync engine to prevent queue processing
   * 2. Clears any pending operations in the queue
   * 3. Reads all local data
   * 4. Writes directly to cloud store
   * 5. Resumes the sync engine
   *
   * @returns Summary of what was pushed
   * @throws If cloud store is not available or push fails
   */
  async pushAllToCloud(): Promise<{
    players: number;
    teams: number;
    seasons: number;
    tournaments: number;
    personnel: number;
    games: number;
    settings: boolean;
    warmupPlan: boolean;
  }> {
    if (!this.remoteStore) {
      throw new Error('Cloud store not available - cannot push to cloud');
    }

    const summary = {
      players: 0,
      teams: 0,
      seasons: 0,
      tournaments: 0,
      personnel: 0,
      games: 0,
      settings: false,
      warmupPlan: false,
    };

    logger.info('[SyncedDataStore] Starting bulk push to cloud...');

    // Pause sync engine to prevent queue processing during bulk push
    if (this.syncEngine) {
      this.syncEngine.pause();
    }

    try {
      // Clear sync queue - we're doing direct push instead
      await this.syncQueue.clear();
      logger.info('[SyncedDataStore] Sync queue cleared for bulk push');

      // Read all local data
      const [
        players,
        teams,
        teamRosters,
        seasons,
        tournaments,
        personnel,
        games,
        settings,
        warmupPlan,
        adjustmentsMap,
      ] = await Promise.all([
        this.localStore.getPlayers(),
        this.localStore.getTeams(true),
        this.localStore.getAllTeamRosters(),
        this.localStore.getSeasons(true),
        this.localStore.getTournaments(true),
        this.localStore.getAllPersonnel(),
        this.localStore.getGames(),
        this.localStore.getSettings(),
        this.localStore.getWarmupPlan(),
        this.localStore.getAllPlayerAdjustments(),
      ]);

      // Push to cloud with error handling for each entity type
      // Using sequential processing to avoid overwhelming the server
      // and to handle Supabase auth lock issues

      // 1. Players (games reference these)
      logger.info(`[SyncedDataStore] Pushing ${players.length} players to cloud...`);
      for (const player of players) {
        try {
          await this.remoteStore.upsertPlayer(player);
          summary.players++;
        } catch (error) {
          logger.warn(`[SyncedDataStore] Failed to push player ${player.id}:`, error);
        }
      }

      // 2. Seasons (games reference these)
      logger.info(`[SyncedDataStore] Pushing ${seasons.length} seasons to cloud...`);
      for (const season of seasons) {
        try {
          await this.remoteStore.upsertSeason(season);
          summary.seasons++;
        } catch (error) {
          logger.warn(`[SyncedDataStore] Failed to push season ${season.id}:`, error);
        }
      }

      // 3. Tournaments (games reference these)
      logger.info(`[SyncedDataStore] Pushing ${tournaments.length} tournaments to cloud...`);
      for (const tournament of tournaments) {
        try {
          await this.remoteStore.upsertTournament(tournament);
          summary.tournaments++;
        } catch (error) {
          logger.warn(`[SyncedDataStore] Failed to push tournament ${tournament.id}:`, error);
        }
      }

      // 4. Teams (games reference these)
      logger.info(`[SyncedDataStore] Pushing ${teams.length} teams to cloud...`);
      for (const team of teams) {
        try {
          await this.remoteStore.upsertTeam(team);
          summary.teams++;
        } catch (error) {
          logger.warn(`[SyncedDataStore] Failed to push team ${team.id}:`, error);
        }
      }

      // 5. Team rosters
      const rosterTeamIds = Object.keys(teamRosters);
      logger.info(`[SyncedDataStore] Pushing ${rosterTeamIds.length} team rosters to cloud...`);
      for (const teamId of rosterTeamIds) {
        try {
          await this.remoteStore.setTeamRoster(teamId, teamRosters[teamId]);
        } catch (error) {
          logger.warn(`[SyncedDataStore] Failed to push roster for team ${teamId}:`, error);
        }
      }

      // 6. Personnel (games reference these)
      logger.info(`[SyncedDataStore] Pushing ${personnel.length} personnel to cloud...`);
      for (const member of personnel) {
        try {
          await this.remoteStore.upsertPersonnelMember(member);
          summary.personnel++;
        } catch (error) {
          logger.warn(`[SyncedDataStore] Failed to push personnel ${member.id}:`, error);
        }
      }

      // 7. Games (the main data - do these last as they reference other entities)
      const gameIds = Object.keys(games);
      logger.info(`[SyncedDataStore] Pushing ${gameIds.length} games to cloud...`);
      for (const gameId of gameIds) {
        try {
          await this.remoteStore.saveGame(gameId, games[gameId]);
          summary.games++;
        } catch (error) {
          logger.warn(`[SyncedDataStore] Failed to push game ${gameId}:`, error);
        }
      }

      // 8. Settings
      logger.info('[SyncedDataStore] Pushing settings to cloud...');
      try {
        await this.remoteStore.saveSettings(settings);
        summary.settings = true;
      } catch (error) {
        logger.warn('[SyncedDataStore] Failed to push settings:', error);
      }

      // 9. Warmup plan
      if (warmupPlan) {
        logger.info('[SyncedDataStore] Pushing warmup plan to cloud...');
        try {
          await this.remoteStore.saveWarmupPlan(warmupPlan);
          summary.warmupPlan = true;
        } catch (error) {
          logger.warn('[SyncedDataStore] Failed to push warmup plan:', error);
        }
      }

      // 10. Player adjustments
      logger.info(`[SyncedDataStore] Pushing adjustments for ${adjustmentsMap.size} players to cloud...`);
      for (const [, adjustments] of adjustmentsMap) {
        for (const adjustment of adjustments) {
          try {
            await this.remoteStore.upsertPlayerAdjustment(adjustment);
          } catch (error) {
            logger.warn(`[SyncedDataStore] Failed to push adjustment ${adjustment.id}:`, error);
          }
        }
      }

      logger.info('[SyncedDataStore] Bulk push to cloud complete', summary);
      return summary;
    } finally {
      // Always resume sync engine
      if (this.syncEngine) {
        this.syncEngine.resume();
      }
    }
  }

  async clearAllUserData(): Promise<void> {
    // Pause sync engine (not stop) so new operations can be queued after clear.
    // Stopping the engine prevents nudge() from triggering processing,
    // which breaks backup import flow where operations are queued after clear.
    const wasRunning = this.syncEngine?.isEngineRunning() ?? false;
    if (this.syncEngine) {
      this.syncEngine.pause();
      logger.info('[SyncedDataStore] Sync engine paused for data clear');
    }

    // Clear the sync queue (pending operations will be discarded)
    await this.syncQueue.clear();

    // Clear cloud data FIRST (while we still have auth/connection)
    // This ensures cloud data is deleted even if local clear fails
    if (this.remoteStore) {
      logger.info('[SyncedDataStore] Clearing remote (cloud) data...');
      await this.remoteStore.clearAllUserData();
      logger.info('[SyncedDataStore] Remote data cleared');
    }

    // Clear local data
    await this.localStore.clearAllUserData();

    // Resume sync engine if it was running before
    // This allows subsequent queueSync() calls to be processed
    if (wasRunning && this.syncEngine) {
      this.syncEngine.resume();
      logger.info('[SyncedDataStore] Sync engine resumed after data clear');
    }

    logger.info('[SyncedDataStore] All user data cleared (local and cloud)');
  }
}
