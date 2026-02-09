# User-Scoped Data Architecture Plan

**Status:** Planning
**Created:** 2026-01-29
**Last Updated:** 2026-01-29 (Review 8)
**Branch:** `feature/user-scoped-storage` (from `feature/supabase-cloud-backend`)

## Executive Summary

This plan implements **user-scoped local storage** that:

1. Requires account creation (provides userId for data scoping)
2. Stores all data locally in user-specific IndexedDB namespaces
3. Makes cloud sync an optional paid feature (not required for basic use)
4. Enables multiple users on shared devices with complete data isolation
5. Supports portable backup export/import with ID regeneration

**Key Insight:** Account ≠ Cloud Sync. Users get the "local feel" (fast, offline-capable, persistent session) while having an account that scopes their data.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Detailed Design](#2-detailed-design)
3. [Export/Import (Backup/Restore)](#3-exportimport-backuprestore)
4. [Implementation Plan](#4-implementation-plan)
5. [PR Breakdown](#5-pr-breakdown)
6. [Testing Strategy](#6-testing-strategy)
7. [Security Considerations](#7-security-considerations)
8. [Edge Cases and Error Handling](#8-edge-cases-and-error-handling)
9. [Multi-Agent Review Findings](#9-multi-agent-review-findings)
10. [Critical Implementation Fixes](#10-critical-implementation-fixes-from-creative-review)

---

## 1. Architecture Overview

### 1.1 The Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ACCOUNT REQUIRED                             │
│                                                                      │
│  Creates userId → All data scoped to this user                       │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     LOCAL STORAGE                            │    │
│  │                     (IndexedDB)                              │    │
│  │                                                              │    │
│  │  abc123def456_soccerMasterRoster    → Your players           │    │
│  │  abc123def456_savedSoccerGames      → Your games             │    │
│  │  abc123def456_soccerSeasons         → Your seasons           │    │
│  │                                                              │    │
│  │  Data ALWAYS lives here. Fast. Offline-capable.              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              │ SYNC (optional, paid)                 │
│                              ↓                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     CLOUD STORAGE                            │    │
│  │                     (Supabase)                               │    │
│  │                                                              │    │
│  │  Copies data for multi-device access and backup              │    │
│  │  Subscription required. Can be disabled anytime.             │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 User Experience

| State | Experience |
|-------|------------|
| **Not logged in** | Must sign in/sign up. Can't access app. |
| **Logged in (no sync)** | Full app functionality. Data on this device only. Free. |
| **Logged in (sync enabled)** | Full app + multi-device access. Paid subscription. |
| **Subscription ends** | Sync stops. Local data remains. Can still use on this device. |

### 1.3 Multi-User on Shared Device

```
SHARED TABLET AT SOCCER CLUB:

Coach A logs in:
  → Reads from: abc123def456_*
  → Sees: Coach A's 15 players, 8 games

Coach A logs out, Coach B logs in:
  → Reads from: xyz789uvw012_*
  → Sees: Coach B's 12 players, 5 games

Complete isolation. No data leakage.
```

### 1.4 Why This Model

| Aspect | Benefit |
|--------|---------|
| **Feels local** | Data in IndexedDB, instant load, session persists |
| **Works offline** | No network needed for basic use |
| **Multi-user safe** | Each user's data isolated by userId |
| **Privacy on device** | Your data in your namespace, not globally visible |
| **Simple architecture** | One mode, sync is just a feature flag |
| **Clear monetization** | Free = one device, Paid = sync across devices |
| **No migration complexity** | User-scoped from day 1, no mode switching |

---

## 2. Detailed Design

### 2.1 Storage Key Scoping

**File:** `src/config/storageKeys.ts`

```typescript
// Base keys (unchanged)
export const SEASONS_LIST_KEY = 'soccerSeasons';
export const TOURNAMENTS_LIST_KEY = 'soccerTournaments';
export const SAVED_GAMES_KEY = 'savedSoccerGames';
export const MASTER_ROSTER_KEY = 'soccerMasterRoster';
// ... etc

/**
 * Get user-scoped storage key.
 *
 * @param baseKey - The base storage key (e.g., 'soccerMasterRoster')
 * @param userId - The user's ID (required - account always exists)
 * @returns Scoped key (e.g., 'abc123def456_soccerMasterRoster')
 * @throws Error if userId is not provided
 */
export function getScopedKey(baseKey: string, userId: string): string {
  if (!userId) {
    throw new Error('userId is required for scoped storage key');
  }
  // Use first 12 chars of userId (hyphens removed) for collision safety
  const userPrefix = userId.replace(/-/g, '').slice(0, 12);
  return `${userPrefix}_${baseKey}`;
}
```

### 2.2 ID Generation

**File:** `src/utils/idGenerator.ts`

> **⚠️ Note:** The current `generateId()` function does NOT accept a userId parameter.
> This section describes the **target implementation** for PR #1. The current signature is:
> `generateId(prefix: string): string` → returns `"player_1703123456789_a1b2c3d4"` (no user prefix)

```typescript
/**
 * Generates a unique ID with user prefix.
 *
 * Format: {userPrefix}_{entityType}_{timestamp}_{random}
 *
 * @param prefix - Entity type (e.g., 'player', 'team')
 * @param userId - User's ID (required)
 * @returns Unique ID string
 *
 * @example
 * generateId('player', 'abc123-def456-...')
 * // Returns: "abc123def456_player_1703123456789_a1b2c3d4"
 */
export function generateId(prefix: string, userId: string): string {
  if (!userId) {
    throw new Error('userId is required for ID generation');
  }

  const timestamp = Date.now();
  const randomPart = generateRandomPart();
  const userPrefix = userId.replace(/-/g, '').slice(0, 12);

  return `${userPrefix}_${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Extracts the timestamp from an ID.
 * Handles BOTH formats:
 * - Legacy: {entityType}_{timestamp}_{random} (timestamp at index 1)
 * - New: {userPrefix}_{entityType}_{timestamp}_{random} (timestamp at index 2)
 *
 * @param id - The ID string
 * @returns The timestamp as a number, or 0 if extraction fails
 */
export function extractTimestampFromId(id: string): number {
  const parts = id.split('_');

  // Helper to check if a value looks like a timestamp
  const isValidTimestamp = (val: number): boolean =>
    val > 1_000_000_000_000 && val < 10_000_000_000_000;

  // Try new format first: userPrefix_entityType_timestamp_random (index 2)
  if (parts.length >= 4) {
    const timestamp = parseInt(parts[2], 10);
    if (isValidTimestamp(timestamp)) {
      return timestamp;
    }
  }

  // Try legacy format: entityType_timestamp_random (index 1)
  if (parts.length >= 2) {
    const timestamp = parseInt(parts[1], 10);
    if (isValidTimestamp(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}

/**
 * Known entity type prefixes used in IDs.
 * Used to distinguish legacy IDs from user-prefixed IDs.
 *
 * NOTE: LocalDataStore uses 'adj' while SupabaseDataStore uses 'adjustment'.
 * Both must be included for compatibility.
 */
const ENTITY_TYPES = new Set([
  'player', 'team', 'season', 'tournament', 'game',
  'personnel', 'event', 'adj', 'adjustment', 'warmup', 'section', 'series'
]);

/**
 * Strips the user prefix from an ID to make it portable.
 *
 * IMPORTANT: Must distinguish between:
 * - Legacy: player_1703..._abc123_0 (4 parts, first is entity type)
 * - New: abc123def456_player_1703..._abc123 (4 parts, first is user prefix)
 *
 * @param id - User-prefixed ID (e.g., "abc123def456_player_1703...")
 * @returns Portable ID (e.g., "player_1703...")
 */
export function stripUserPrefix(id: string): string {
  const parts = id.split('_');

  // If first part is a known entity type, it's already a legacy/portable ID
  if (ENTITY_TYPES.has(parts[0])) {
    return id; // Already portable
  }

  // Format: userPrefix_entityType_timestamp_random[_index]
  // Remove first part (userPrefix) if second part is entity type
  if (parts.length >= 4 && ENTITY_TYPES.has(parts[1])) {
    return parts.slice(1).join('_');
  }

  return id; // Return as-is if format doesn't match
}

/**
 * Adds user prefix to a portable ID.
 *
 * @param id - Portable ID (e.g., "player_1703...")
 * @param userId - User's ID
 * @returns User-prefixed ID (e.g., "abc123def456_player_1703...")
 */
export function addUserPrefix(id: string, userId: string): string {
  const userPrefix = userId.replace(/-/g, '').slice(0, 12);
  return `${userPrefix}_${id}`;
}
```

### 2.3 LocalDataStore Changes

**File:** `src/datastore/LocalDataStore.ts`

```typescript
export class LocalDataStore implements DataStore {
  private userId: string;

  constructor(userId: string) {
    if (!userId) {
      throw new Error('userId is required for LocalDataStore');
    }
    this.userId = userId;
  }

  private getKey(baseKey: string): string {
    return getScopedKey(baseKey, this.userId);
  }

  // All methods use scoped keys
  async getPlayers(): Promise<Player[]> {
    const key = this.getKey(MASTER_ROSTER_KEY);
    const data = await getStorageItem<Player[]>(key);
    return data ?? [];
  }

  // Entity creation uses user-prefixed IDs
  async createPlayer(playerData: Omit<Player, 'id'>): Promise<Player> {
    const id = generateId('player', this.userId);
    const player: Player = { ...playerData, id };
    // ... save logic
    return player;
  }

  // ... all other methods follow same pattern
}
```

### 2.4 SyncQueue User Scoping

**File:** `src/sync/SyncQueue.ts`

**Architecture:** Single database with user-tagged operations (consistent with main storage pattern).

```typescript
export class SyncQueue {
  private db: IDBDatabase | null = null;
  private currentUserId: string | null = null;
  private readonly dbName = 'matchops_sync_queue'; // Single database

  /**
   * Set current user (call on sign-in).
   * Operations will be tagged with this userId.
   */
  setCurrentUser(userId: string): void {
    if (!userId) {
      throw new Error('userId is required');
    }
    this.currentUserId = userId;
  }

  /**
   * Clear current user (call on sign-out).
   * Pending operations are preserved for when user signs back in.
   */
  clearCurrentUser(): void {
    this.currentUserId = null;
  }

  /**
   * Get pending operations for current user only.
   * Returns empty array if no user is set.
   */
  async getPending(): Promise<SyncOperation[]> {
    if (!this.currentUserId) return [];
    const allOps = await this.getAllOperations();
    return allOps.filter(op => op.userId === this.currentUserId);
  }

  /**
   * Add operation tagged with current userId.
   */
  async addOperation(op: Omit<SyncOperation, 'userId'>): Promise<void> {
    if (!this.currentUserId) {
      throw new Error('No user set - cannot queue operation');
    }
    const operation: SyncOperation = { ...op, userId: this.currentUserId };
    // ... save to IndexedDB
  }
}
```

**SyncOperation type update:**

```typescript
// src/sync/types.ts
export interface SyncOperation {
  id: string;
  userId: string;  // Required - tags operation to specific user
  entityType: SyncEntityType;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: unknown;
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  lastError?: string;
}
```

### 2.5 Factory Changes

**File:** `src/datastore/factory.ts`

```typescript
let currentDataStore: LocalDataStore | null = null;
let currentSyncedStore: SyncedDataStore | null = null;
let currentUserId: string | null = null;

/**
 * Get the DataStore for the current user.
 * Returns SyncedDataStore if sync is enabled, LocalDataStore otherwise.
 */
export function getDataStore(userId: string, syncEnabled: boolean): DataStore {
  if (!userId) {
    throw new Error('userId is required');
  }

  // Reset if user changed
  if (currentUserId !== userId) {
    currentDataStore = null;
    currentSyncedStore = null;
    currentUserId = userId;
  }

  // Create LocalDataStore if needed
  if (!currentDataStore) {
    currentDataStore = new LocalDataStore(userId);
  }

  // Return SyncedDataStore if sync enabled
  if (syncEnabled) {
    if (!currentSyncedStore) {
      currentSyncedStore = new SyncedDataStore(currentDataStore, userId);
    }
    return currentSyncedStore;
  }

  return currentDataStore;
}

/**
 * Reset DataStore instances (call on sign-out).
 */
export function resetDataStore(): void {
  currentDataStore = null;
  currentSyncedStore = null;
  currentUserId = null;
}
```

### 2.6 Sign-In Flow

**File:** `src/contexts/AuthProvider.tsx`

> **Note:** This shows the BASE sign-in flow. PR #0 (Legacy Migration) will add a step between
> steps 1 and 2 to check for and migrate legacy data. See Section 10.11 for the complete flow.

```typescript
const handleSignIn = useCallback(async (user: User) => {
  // Reset any existing DataStore
  resetDataStore();

  // ⚠️ PR #0 adds here: Check for legacy data and migrate if needed
  // See Section 10.11 for migrateLegacyDataToUser()

  // Check subscription status
  const subscription = await getSubscriptionStatus(user.id);
  const syncEnabled = subscription.isActive;

  // Set current user in SyncQueue (for operation tagging - see Section 10.2)
  syncQueue.setCurrentUser(user.id);

  // Get DataStore for this user
  const store = getDataStore(user.id, syncEnabled);

  // If sync enabled and this is first time on device, download cloud data
  if (syncEnabled) {
    const hasLocalData = await checkUserHasLocalData(user.id);
    if (!hasLocalData) {
      await downloadCloudDataToLocal(user.id);
    }
  }

  // Set user in state
  setUser(user);
}, []);
```

### 2.7 Sign-Out Flow

**File:** `src/contexts/AuthProvider.tsx`

```typescript
const handleSignOut = useCallback(async () => {
  // Check for unsynced changes (if sync was enabled)
  if (syncEnabled) {
    const status = await getSyncEngine().getStatus();
    if (status.pendingCount > 0) {
      // Show warning
      setShowUnsyncedWarning(true);
      return;
    }
  }

  // Clear current user from SyncQueue (preserves operations for re-login - see Section 10.2)
  syncQueue.clearCurrentUser();

  // Reset DataStore (clears in-memory references)
  resetDataStore();

  // Clear React Query cache (CRITICAL: see Section 10.3 and 10.14 for full implementation)
  queryClient.clear();

  // Sign out from Supabase
  await authService.signOut();

  // Clear state
  setUser(null);

  // Note: Data remains in IndexedDB under user's namespace
  // They can access it by signing back in
}, [syncEnabled]);
```

### 2.8 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER SIGNS IN                                │
│                                                                      │
│  1. Auth succeeds → get userId                                       │
│  2. Check subscription → syncEnabled true/false                      │
│  3. Create LocalDataStore(userId)                                    │
│  4. If syncEnabled, wrap in SyncedDataStore                          │
│                                                                      │
│  ┌─────────────────┐      ┌─────────────────┐      ┌──────────────┐ │
│  │  User Action    │ ──→  │   DataStore     │ ──→  │ LocalDataStore│ │
│  │  (create player)│      │ (or SyncedDS)   │      │ (userId_*)    │ │
│  └─────────────────┘      └────────┬────────┘      └──────────────┘ │
│                                    │                                 │
│                          (if sync enabled)                           │
│                                    ↓                                 │
│                           ┌─────────────────┐                        │
│                           │   SyncQueue     │                        │
│                           │ (userId-scoped) │                        │
│                           └────────┬────────┘                        │
│                                    │                                 │
│                                    ↓                                 │
│                           ┌─────────────────┐                        │
│                           │    Supabase     │                        │
│                           │   (cloud)       │                        │
│                           └─────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Export/Import (Backup/Restore)

### 3.1 Design Principle

**Backups are portable.** Export strips user prefix, import regenerates with current user's prefix. This enables:
- Sharing data with other coaches
- Moving to a new account
- Importing on a new device

#### ID Transform Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           ID TRANSFORMATION FLOW                            │
│                                                                             │
│  IN-APP (User A's data)              BACKUP FILE              IN-APP (Any user)
│  ───────────────────────            ─────────────            ─────────────────
│                                                                             │
│  abc123_player_1703_xyz             player_1703_xyz          def456_player_1703_xyz
│  abc123_team_1704_uvw      EXPORT   team_1704_uvw    IMPORT  def456_team_1704_uvw
│  abc123_game_1705_rst   ──────────► game_1705_rst ─────────► def456_game_1705_rst
│                          (strips     (portable,      (adds                  │
│                           prefix)    no prefix)      new prefix)            │
│                                                                             │
│  User-specific                      Portable                  User-specific  │
│  (scoped storage)                   (shareable)              (scoped storage)│
└────────────────────────────────────────────────────────────────────────────┘

EXPORT: stripUserPrefix("abc123_player_1703_xyz") → "player_1703_xyz"
IMPORT: generateId("player", "def456") → "def456_player_1706_newrandom"
        idMap.set("player_1703_xyz", "def456_player_1706_newrandom")
        → All references updated via idMap

LEGACY MIGRATION: Same as import! Global keys already have no prefix.
```

**Key Points:**
1. **Export** always strips user prefix → backup file is NOT user-specific
2. **Import** always regenerates IDs with current user's prefix
3. **Legacy migration** packages global data as backup format → calls `importBackup()`
4. Same `importBackup()` code handles both file imports AND legacy migration

### 3.2 Backup File Format

```json
{
  "version": "2.0",
  "exportedAt": "2026-01-29T12:00:00Z",
  "appVersion": "1.5.0",
  "players": [
    { "id": "player_1703123456789_abc123", "name": "John", ... }
  ],
  "teams": [
    { "id": "team_1703123456789_def456", "name": "U12 Blue", ... }
  ],
  "teamRosters": {
    "team_1703123456789_def456": [
      { "playerId": "player_1703123456789_abc123", "jerseyNumber": "10" }
    ]
  },
  "games": [
    {
      "id": "game_1703123456789_ghi789",
      "teamId": "team_1703123456789_def456",
      ...
    }
  ],
  "seasons": [...],
  "tournaments": [...],
  "personnel": [...],
  "playerAdjustments": [
    { "id": "adj_1703...", "playerId": "player_1703...", "seasonId": "season_1703...", ... }
  ],
  "warmupPlan": { "id": "warmup_1703...", "sections": [...] },
  "settings": {...}
}
```

**Note:** All IDs are in portable format (no user prefix).

**Complete field list:**
- `players` - Master roster (all players)
- `teams` - Team definitions
- `teamRosters` - Which players are on which teams (object keyed by teamId)
- `games` - All saved games
- `seasons` - Season definitions
- `tournaments` - Tournament definitions
- `personnel` - Coaches, assistants, staff
- `playerAdjustments` - Per-player stat adjustments per season/tournament
- `warmupPlan` - User's warmup plan (can be null)
- `settings` - App settings

### 3.3 Export Implementation

**File:** `src/utils/backup.ts`

```typescript
/**
 * Export all user data as portable backup.
 * IMPORTANT: Must include ALL data types to prevent data loss on import.
 */
export async function exportBackup(userId: string): Promise<BackupData> {
  const store = new LocalDataStore(userId);

  // Read ALL data - missing any field = data loss on import!
  // FORMAT NOTES:
  // - getGames() returns {gameId: AppState}, backup needs [AppState]
  // - getAllPlayerAdjustments() returns Map<playerId, adj[]>, backup needs [adj]
  // - getPersonnel() returns Personnel[] - already correct
  // - getAllTeamRosters() returns {teamId: entries[]} - matches backup format

  const gamesObject = await store.getGames();
  const gamesArray = Object.values(gamesObject);         // Convert {id: game} → [game]

  const adjustmentsMap = await store.getAllPlayerAdjustments();
  const flatAdjustments = [...adjustmentsMap.values()].flat(); // Flatten: Map → [adj]

  const data = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    players: await store.getPlayers(),
    teams: await store.getTeams(true),
    teamRosters: await store.getAllTeamRosters(),        // ⚠️ CRITICAL: Team memberships
    games: gamesArray,                                   // ⚠️ CRITICAL: Converted to array
    seasons: await store.getSeasons(true),
    tournaments: await store.getTournaments(true),
    personnel: await store.getAllPersonnel(),
    playerAdjustments: flatAdjustments,                  // ⚠️ CRITICAL: Flattened to array
    warmupPlan: await store.getWarmupPlan(),             // ⚠️ CRITICAL: Warmup plan
    settings: await store.getSettings(),
  };

  // Strip user prefix from all IDs to make portable
  return stripAllUserPrefixes(data);
}

/**
 * Strip user prefix from all IDs in backup data.
 * IMPORTANT: Must handle ALL entity types including nested references.
 */
function stripAllUserPrefixes(data: BackupData): BackupData {
  return {
    ...data,
    players: data.players.map(p => ({ ...p, id: stripUserPrefix(p.id) })),
    teams: data.teams.map(t => stripTeamIds(t)),
    teamRosters: stripTeamRosterIds(data.teamRosters),   // Object keys are teamIds
    games: data.games.map(g => stripGameIds(g)),
    seasons: data.seasons.map(s => stripSeasonIds(s)),
    tournaments: data.tournaments.map(t => stripTournamentIds(t)),
    personnel: data.personnel.map(p => ({ ...p, id: stripUserPrefix(p.id) })),
    playerAdjustments: data.playerAdjustments.map(a => stripAdjustmentIds(a)),
    warmupPlan: data.warmupPlan ? stripWarmupPlanIds(data.warmupPlan) : null,
    settings: stripSettingsIds(data.settings),
  };
}

/**
 * Strip IDs from a team.
 * Includes boundSeasonId, boundTournamentId, boundTournamentSeriesId.
 */
function stripTeamIds(team: Team): Team {
  return {
    ...team,
    id: stripUserPrefix(team.id),
    boundSeasonId: team.boundSeasonId ? stripUserPrefix(team.boundSeasonId) : undefined,
    boundTournamentId: team.boundTournamentId ? stripUserPrefix(team.boundTournamentId) : undefined,
    boundTournamentSeriesId: team.boundTournamentSeriesId ? stripUserPrefix(team.boundTournamentSeriesId) : undefined,
  };
}

/**
 * Strip IDs from a season.
 * Includes teamPlacements keys (teamIds).
 */
function stripSeasonIds(season: Season): Season {
  return {
    ...season,
    id: stripUserPrefix(season.id),
    teamPlacements: season.teamPlacements
      ? Object.fromEntries(
          Object.entries(season.teamPlacements).map(([teamId, placement]) => [
            stripUserPrefix(teamId),
            placement,
          ])
        )
      : undefined,
  };
}

/**
 * Strip IDs from team rosters (object keyed by teamId).
 */
function stripTeamRosterIds(rosters: Record<string, TeamRosterEntry[]>): Record<string, TeamRosterEntry[]> {
  const result: Record<string, TeamRosterEntry[]> = {};
  for (const [teamId, entries] of Object.entries(rosters)) {
    const strippedTeamId = stripUserPrefix(teamId);
    result[strippedTeamId] = entries.map(e => ({
      ...e,
      playerId: stripUserPrefix(e.playerId),
    }));
  }
  return result;
}

/**
 * Strip IDs from player adjustments.
 */
function stripAdjustmentIds(adj: PlayerStatAdjustment): PlayerStatAdjustment {
  return {
    ...adj,
    id: stripUserPrefix(adj.id),
    playerId: stripUserPrefix(adj.playerId),
    seasonId: adj.seasonId ? stripUserPrefix(adj.seasonId) : undefined,
    teamId: adj.teamId ? stripUserPrefix(adj.teamId) : undefined,
    tournamentId: adj.tournamentId ? stripUserPrefix(adj.tournamentId) : undefined,
  };
}

/**
 * Strip IDs from warmup plan.
 */
function stripWarmupPlanIds(plan: WarmupPlan): WarmupPlan {
  return {
    ...plan,
    id: stripUserPrefix(plan.id),
    sections: plan.sections.map(s => ({
      ...s,
      id: stripUserPrefix(s.id),
    })),
  };
}

/**
 * Strip IDs from a game.
 * Games have the most ID references - all must be stripped for portability.
 */
function stripGameIds(game: AppState): AppState {
  return {
    ...game,
    id: stripUserPrefix(game.id),
    teamId: game.teamId ? stripUserPrefix(game.teamId) : undefined,
    seasonId: game.seasonId ? stripUserPrefix(game.seasonId) : game.seasonId,
    tournamentId: game.tournamentId ? stripUserPrefix(game.tournamentId) : game.tournamentId,
    tournamentSeriesId: game.tournamentSeriesId ? stripUserPrefix(game.tournamentSeriesId) : game.tournamentSeriesId,
    // NOTE: leagueId is NOT stripped - it's a predefined constant

    playersOnField: game.playersOnField.map(p => ({
      ...p,
      id: stripUserPrefix(p.id),
    })),
    availablePlayers: game.availablePlayers.map(p => ({
      ...p,
      id: stripUserPrefix(p.id),
    })),
    selectedPlayerIds: game.selectedPlayerIds.map(id => stripUserPrefix(id)),

    gameEvents: game.gameEvents.map(e => ({
      ...e,
      id: stripUserPrefix(e.id),
      scorerId: e.scorerId ? stripUserPrefix(e.scorerId) : undefined,
      assisterId: e.assisterId ? stripUserPrefix(e.assisterId) : undefined,
      entityId: e.entityId ? stripUserPrefix(e.entityId) : undefined,
    })),

    gamePersonnel: game.gamePersonnel?.map(id => stripUserPrefix(id)),

    assessments: game.assessments
      ? Object.fromEntries(
          Object.entries(game.assessments).map(([playerId, assessment]) => [
            stripUserPrefix(playerId),
            assessment,
          ])
        )
      : undefined,
  };
}

/**
 * Strip IDs from a tournament.
 * Has series[].id, awardedPlayerId, and teamPlacements keys.
 */
function stripTournamentIds(tournament: Tournament): Tournament {
  return {
    ...tournament,
    id: stripUserPrefix(tournament.id),
    awardedPlayerId: tournament.awardedPlayerId
      ? stripUserPrefix(tournament.awardedPlayerId)
      : undefined,
    series: tournament.series?.map(s => ({
      ...s,
      id: stripUserPrefix(s.id),
    })),
    teamPlacements: tournament.teamPlacements
      ? Object.fromEntries(
          Object.entries(tournament.teamPlacements).map(([teamId, placement]) => [
            stripUserPrefix(teamId),
            placement,
          ])
        )
      : undefined,
  };
}

/**
 * Strip IDs from settings.
 */
function stripSettingsIds(settings: AppSettings): AppSettings {
  return {
    ...settings,
    currentGameId: settings.currentGameId
      ? stripUserPrefix(settings.currentGameId)
      : undefined,
  };
}
```

### 3.4 Import Implementation

**File:** `src/utils/backup.ts`

> **⚠️ CRITICAL:** Replace mode MUST use atomic import (temp namespace → validate → swap).
> See **Section 10.12** for the full atomic implementation. The simplified code below
> shows the conceptual flow but NOT the atomic safety mechanism.

```typescript
/**
 * Import backup data for current user.
 *
 * IMPORTANT: Replace mode uses ATOMIC IMPORT:
 * 1. Import to temp namespace
 * 2. Validate all references
 * 3. Only then swap (delete old, move temp to real)
 *
 * See Section 10.12 for full implementation.
 */
export async function importBackup(
  userId: string,
  backup: BackupData,
  mode: 'merge' | 'replace'
): Promise<ImportResult> {
  // Validate backup format first
  validateBackupFormat(backup);

  // Build ID mapping (old portable ID → new user-prefixed ID)
  const idMap = new Map<string, string>();

  // Regenerate all IDs with user prefix
  const migrated = regenerateAllIds(backup, userId, idMap);

  if (mode === 'replace') {
    // ⚠️ ATOMIC REPLACE - See Section 10.12 for full implementation
    // 1. Import to temp namespace first
    // 2. Validate import succeeded
    // 3. Only then: clear real data + move temp to real
    // NEVER delete before import succeeds!
    return await atomicReplaceImport(userId, migrated, idMap);
  }

  // Merge mode: add to existing data
  const store = new LocalDataStore(userId);
  await importAllEntities(store, migrated);

  return {
    success: true,
    imported: {
      players: migrated.players.length,
      teams: migrated.teams.length,
      games: migrated.games.length,
      // ...
    }
  };
}

/**
 * Import all entities to the data store.
 * IMPORTANT: Handles format conversions between backup format and storage format.
 *
 * FORMAT CONVERSIONS:
 * - playerAdjustments: Backup has flat array [adj1, adj2, adj3]
 *                      Storage needs {playerId: [adj1, adj2], playerId2: [adj3]}
 *                      → Group by playerId before storing
 * - teamRosters: Both formats use {teamId: entries[]} - no conversion needed
 *
 * NOTE: IDs and references already updated by regenerateAllIds() before this call.
 */
async function importAllEntities(
  store: LocalDataStore,
  data: BackupData
): Promise<void> {
  // Import in dependency order: independent entities first
  for (const player of data.players) {
    await store.upsertPlayer(player);
  }

  for (const team of data.teams) {
    await store.upsertTeam(team);
  }

  // Team rosters (uses same {teamId: entries[]} format)
  for (const [teamId, entries] of Object.entries(data.teamRosters)) {
    await store.setTeamRoster(teamId, entries);
  }

  for (const season of data.seasons) {
    await store.upsertSeason(season);
  }

  for (const tournament of data.tournaments) {
    await store.upsertTournament(tournament);
  }

  for (const person of data.personnel) {
    await store.upsertPersonnelMember(person);
  }

  // PlayerAdjustments: flat array → grouped by playerId
  // Use addPlayerAdjustment which auto-groups by playerId
  for (const adjustment of data.playerAdjustments) {
    await store.addPlayerAdjustment(adjustment);
  }

  if (data.warmupPlan) {
    await store.saveWarmupPlan(data.warmupPlan);
  }

  for (const game of data.games) {
    await store.saveGame(game.id, game);
  }

  if (data.settings) {
    await store.saveSettings(data.settings);
  }
}

/**
 * Regenerate all IDs with user prefix and update references.
 * IMPORTANT: Must process ALL entity types from Section 3.2.
 */
function regenerateAllIds(
  backup: BackupData,
  userId: string,
  idMap: Map<string, string>
): BackupData {
  // ========== PHASE 1: Generate new IDs for all entities ==========
  // Order matters: independent entities first, then dependent ones

  const players = backup.players.map(p => {
    const newId = generateId('player', userId);
    idMap.set(p.id, newId);
    return { ...p, id: newId };
  });

  const teams = backup.teams.map(t => {
    const newId = generateId('team', userId);
    idMap.set(t.id, newId);
    return { ...t, id: newId };
  });

  const seasons = backup.seasons.map(s => {
    const newId = generateId('season', userId);
    idMap.set(s.id, newId);
    return { ...s, id: newId };
  });

  const tournaments = backup.tournaments.map(t => {
    const newId = generateId('tournament', userId);
    idMap.set(t.id, newId);
    // Also regenerate series IDs
    const series = t.series?.map(s => {
      const newSeriesId = generateId('series', userId);
      idMap.set(s.id, newSeriesId);
      return { ...s, id: newSeriesId };
    });
    return { ...t, id: newId, series };
  });

  const personnel = backup.personnel.map(p => {
    const newId = generateId('personnel', userId);
    idMap.set(p.id, newId);
    return { ...p, id: newId };
  });

  const playerAdjustments = backup.playerAdjustments?.map(a => {
    const newId = generateId('adjustment', userId);
    idMap.set(a.id, newId);
    return { ...a, id: newId };
  }) ?? [];

  const warmupPlan = backup.warmupPlan ? {
    ...backup.warmupPlan,
    id: (() => {
      const newId = generateId('warmup', userId);
      idMap.set(backup.warmupPlan!.id, newId);
      return newId;
    })(),
    sections: backup.warmupPlan.sections.map(s => {
      const newId = generateId('section', userId);
      idMap.set(s.id, newId);
      return { ...s, id: newId };
    }),
  } : null;

  const games = backup.games.map(g => {
    const newId = generateId('game', userId);
    idMap.set(g.id, newId);
    return { ...g, id: newId };
  });

  // ========== PHASE 2: Update all references using idMap ==========
  // See Section 3.5 Reference Update Matrix for full list

  return {
    ...backup,
    players,
    teams: teams.map(t => updateTeamReferences(t, idMap)),
    teamRosters: updateTeamRosterReferences(backup.teamRosters, idMap),
    games: games.map(g => updateGameReferences(g, idMap, userId)),  // Pass userId for event ID regeneration
    seasons: seasons.map(s => updateSeasonReferences(s, idMap)),
    tournaments: tournaments.map(t => updateTournamentReferences(t, idMap)),
    personnel,
    playerAdjustments: playerAdjustments.map(a => updateAdjustmentReferences(a, idMap)),
    warmupPlan,
    settings: updateSettingsReferences(backup.settings, idMap),
  };
}

/**
 * Update all ID references in a game.
 * This is the most complex reference update - Games have 15+ ID reference fields.
 *
 * See Section 3.5 Reference Update Matrix for full list.
 */
function updateGameReferences(
  game: AppState,
  idMap: Map<string, string>,
  userId: string  // Needed to regenerate event IDs
): AppState {
  const mapId = (id: string | undefined): string | undefined =>
    id ? (idMap.get(id) ?? id) : id;

  return {
    ...game,
    // Entity references
    teamId: mapId(game.teamId),
    seasonId: mapId(game.seasonId),
    tournamentId: mapId(game.tournamentId),
    tournamentSeriesId: mapId(game.tournamentSeriesId),
    // NOTE: leagueId is NOT remapped - it's a predefined constant, not a user ID

    // Player arrays
    playersOnField: game.playersOnField.map(p => ({
      ...p,
      id: mapId(p.id) ?? p.id,
    })),
    availablePlayers: game.availablePlayers.map(p => ({
      ...p,
      id: mapId(p.id) ?? p.id,
    })),
    selectedPlayerIds: game.selectedPlayerIds.map(id => mapId(id) ?? id),

    // Game events - regenerate IDs to avoid collision on re-import
    gameEvents: game.gameEvents.map(e => ({
      ...e,
      id: generateId('event', userId),  // Regenerate event IDs
      scorerId: mapId(e.scorerId),
      assisterId: mapId(e.assisterId),
      entityId: mapId(e.entityId),
    })),

    // Personnel references
    gamePersonnel: game.gamePersonnel?.map(id => mapId(id) ?? id),

    // Assessments - object keys are playerIds, need key remapping
    assessments: game.assessments
      ? Object.fromEntries(
          Object.entries(game.assessments).map(([playerId, assessment]) => [
            mapId(playerId) ?? playerId,
            assessment,
          ])
        )
      : undefined,
  };
}

/**
 * Update ID references in a team.
 * See Section 3.5 Reference Update Matrix.
 */
function updateTeamReferences(team: Team, idMap: Map<string, string>): Team {
  const mapId = (id: string | undefined): string | undefined =>
    id ? (idMap.get(id) ?? id) : id;

  return {
    ...team,
    boundSeasonId: mapId(team.boundSeasonId),
    boundTournamentId: mapId(team.boundTournamentId),
    boundTournamentSeriesId: mapId(team.boundTournamentSeriesId),
  };
}

/**
 * Update ID references in team rosters.
 * Rosters are keyed by teamId, values contain playerId references.
 */
function updateTeamRosterReferences(
  rosters: Record<string, TeamRosterEntry[]>,
  idMap: Map<string, string>
): Record<string, TeamRosterEntry[]> {
  const result: Record<string, TeamRosterEntry[]> = {};

  for (const [oldTeamId, entries] of Object.entries(rosters)) {
    const newTeamId = idMap.get(oldTeamId) ?? oldTeamId;
    result[newTeamId] = entries.map(e => ({
      ...e,
      playerId: idMap.get(e.playerId) ?? e.playerId,
    }));
  }

  return result;
}

/**
 * Update ID references in a season.
 * teamPlacements is an object keyed by teamId - keys must be remapped.
 */
function updateSeasonReferences(season: Season, idMap: Map<string, string>): Season {
  return {
    ...season,
    teamPlacements: season.teamPlacements
      ? Object.fromEntries(
          Object.entries(season.teamPlacements).map(([oldTeamId, placement]) => [
            idMap.get(oldTeamId) ?? oldTeamId,
            placement,
          ])
        )
      : undefined,
  };
}

/**
 * Update ID references in a tournament.
 * Has series[].id, awardedPlayerId, and teamPlacements (keyed by teamId).
 */
function updateTournamentReferences(
  tournament: Tournament,
  idMap: Map<string, string>
): Tournament {
  const mapId = (id: string | undefined): string | undefined =>
    id ? (idMap.get(id) ?? id) : id;

  return {
    ...tournament,
    awardedPlayerId: mapId(tournament.awardedPlayerId),
    // Note: series[].id already regenerated in Phase 1 of regenerateAllIds()
    teamPlacements: tournament.teamPlacements
      ? Object.fromEntries(
          Object.entries(tournament.teamPlacements).map(([oldTeamId, placement]) => [
            idMap.get(oldTeamId) ?? oldTeamId,
            placement,
          ])
        )
      : undefined,
  };
}

/**
 * Update ID references in a player adjustment.
 */
function updateAdjustmentReferences(
  adj: PlayerStatAdjustment,
  idMap: Map<string, string>
): PlayerStatAdjustment {
  const mapId = (id: string | undefined): string | undefined =>
    id ? (idMap.get(id) ?? id) : id;

  return {
    ...adj,
    playerId: idMap.get(adj.playerId) ?? adj.playerId,
    seasonId: mapId(adj.seasonId),
    teamId: mapId(adj.teamId),
    tournamentId: mapId(adj.tournamentId),
  };
}

/**
 * Update ID references in settings.
 */
function updateSettingsReferences(
  settings: AppSettings,
  idMap: Map<string, string>
): AppSettings {
  return {
    ...settings,
    currentGameId: settings.currentGameId
      ? (idMap.get(settings.currentGameId) ?? settings.currentGameId)
      : undefined,
  };
}
```

### 3.5 Reference Update Matrix

When regenerating IDs, these references must be updated:

| Entity | Fields with ID References |
|--------|---------------------------|
| **Team** | `id`, `boundSeasonId`, `boundTournamentId`, `boundTournamentSeriesId` |
| **Team Roster** | `playerId` for each entry |
| **Season** | `id`, `teamPlacements` (object keys are teamIds) |
| **Tournament** | `id`, `series[].id`, `awardedPlayerId`, `teamPlacements` (object keys are teamIds) |
| **Game** | `id`, `teamId`, `seasonId`, `tournamentId`, `tournamentSeriesId`, `playersOnField[].id`, `selectedPlayerIds[]`, `availablePlayers[].id`, `gameEvents[].id`, `gameEvents[].scorerId`, `gameEvents[].assisterId`, `gameEvents[].entityId`, `gamePersonnel[]`, `assessments` (object keys are playerIds). **Note:** `leagueId` is a predefined constant (not user-created), DO NOT remap. |
| **Personnel** | `id` |
| **Settings** | `currentGameId` |
| **Player Adjustments** | `id`, `playerId`, `seasonId`, `teamId`, `tournamentId` |
| **Warmup Plan** | `id`, `sections[].id` |

**Important Notes:**
- `teamPlacements` in Season/Tournament is an **object** where keys are teamIds - these keys must be remapped during import
- `boundSeasonId`, `boundTournamentId`, `boundTournamentSeriesId` on Team are optional references that scope which season/tournament/series a team is bound to
- Settings has `currentGameId` (not activeTeamId/activeSeasonId/activeTournamentId - those don't exist in the current schema)
- **GameEvent uses `scorerId`, `assisterId`, `entityId`** - NOT a single `playerId` field (corrected from original plan)
- `awardedPlayerId` on Tournament is optional ("Player of Tournament" award)
- `sections[].id` on WarmupPlan must be regenerated for each warmup section
- `assessments` on Game is an object where keys are playerIds - need key remapping

**✅ teamPlacements VERIFIED:** This field is fully implemented in:
- Type definitions (`src/types/index.ts` lines 62-66, 102-104, 191-193)
- Database schema (`supabase/migrations/000_schema.sql` lines 63, 100)
- SupabaseDataStore transforms (lines 218-227, 1732, 1757, 2076, 2100)
- Utility functions (`src/utils/teamPlacements.ts` with 22 test cases)
- UI components (TeamManagerModal, UnifiedTeamModal)

### 3.6 Import UI

```
┌─────────────────────────────────────────────────────────────┐
│ Import Data                                                  │
│                                                              │
│ File: roster_backup_2026-01-29.json                         │
│                                                              │
│ This backup contains:                                        │
│ • 15 players                                                 │
│ • 3 teams                                                    │
│ • 8 games                                                    │
│ • 2 seasons                                                  │
│                                                              │
│ You already have data. How would you like to import?         │
│                                                              │
│ [Merge] - Add to existing data                               │
│ [Replace] - Delete existing, use backup only                 │
│ [Cancel]                                                     │
└─────────────────────────────────────────────────────────────┘
```

### 3.7 Cloud Data Export (GDPR Compliance)

**GDPR Article 20 - Right to Data Portability** requires that users can ALWAYS download their cloud data, regardless of subscription status. We cannot lock their own data behind a paywall.

#### What We're Selling

| Feature | Availability | Notes |
|---------|--------------|-------|
| **Local export** | Always | Data is on device |
| **Cloud export** | **Always** | GDPR right - cannot restrict |
| **Automatic sync** | Paid subscription | The CONVENIENCE of real-time two-way sync |

The subscription pays for the **convenience of automatic sync**, NOT access to the data itself.

#### Cloud Export Flow

```
┌─────────────────────────────────────────────────────────────┐
│ NEW DEVICE - NO SUBSCRIPTION                                 │
│                                                              │
│ User signs in → No local data, sync disabled                 │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  "You have data stored in the cloud."                   ││
│  │                                                          ││
│  │  To access your data on this device:                     ││
│  │                                                          ││
│  │  [Download My Cloud Data]  - One-time download           ││
│  │                              (import to use locally)     ││
│  │                                                          ││
│  │  [Subscribe for Auto-Sync] - Automatic sync across       ││
│  │                              all devices                 ││
│  │                                                          ││
│  │  [Start Fresh]             - Begin with empty data       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│ "Download My Cloud Data":                                    │
│   1. Fetches all user data from Supabase                     │
│   2. Packages as BackupData (same format as local export)    │
│   3. User saves file                                         │
│   4. User can then import to local storage                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Implementation

**File:** `src/utils/cloudExport.ts`

```typescript
/**
 * Export user's cloud data directly from Supabase.
 * ALWAYS available regardless of subscription status (GDPR compliance).
 *
 * This is separate from sync - it's a one-time download.
 */
export async function exportCloudData(userId: string): Promise<BackupData> {
  const supabase = getSupabaseClient();

  // Fetch ALL user data from cloud (RLS ensures only user's data)
  // CRITICAL: Must fetch all 10 data types to match local export
  const [
    players,
    teams,
    teamRosters,
    games,
    seasons,
    tournaments,
    personnel,
    playerAdjustments,
    warmupPlan,
    settings,
  ] = await Promise.all([
    supabase.from('players').select('*').eq('user_id', userId),
    supabase.from('teams').select('*').eq('user_id', userId),
    supabase.from('team_rosters').select('*').eq('user_id', userId),
    supabase.from('games').select('*').eq('user_id', userId),
    supabase.from('seasons').select('*').eq('user_id', userId),
    supabase.from('tournaments').select('*').eq('user_id', userId),
    supabase.from('personnel').select('*').eq('user_id', userId),
    supabase.from('player_adjustments').select('*').eq('user_id', userId),
    supabase.from('warmup_plans').select('*').eq('user_id', userId).single(),
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
  ]);

  // Transform to BackupData format (same as local export)
  // NOTE: transformXxxFromCloud functions reuse SupabaseDataStore's DB→App transforms
  // (found in src/datastore/SupabaseDataStore.ts), then call stripXxxIds() for portability.
  // Example: transformPlayersFromCloud = (rows) => rows.map(r => ({ ...r, id: stripUserPrefix(r.id) }))
  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    players: transformPlayersFromCloud(players.data ?? []),
    teams: transformTeamsFromCloud(teams.data ?? []),
    teamRosters: transformTeamRostersFromCloud(teamRosters.data ?? []),
    games: transformGamesFromCloud(games.data ?? []),
    seasons: transformSeasonsFromCloud(seasons.data ?? []),
    tournaments: transformTournamentsFromCloud(tournaments.data ?? []),
    personnel: transformPersonnelFromCloud(personnel.data ?? []),
    playerAdjustments: transformAdjustmentsFromCloud(playerAdjustments.data ?? []),
    warmupPlan: warmupPlan.data ? transformWarmupPlanFromCloud(warmupPlan.data) : null,
    settings: settings.data ? transformSettingsFromCloud(settings.data) : {},
  };
}

/**
 * Check if user has data in the cloud.
 * Used to show "Download Cloud Data" option.
 */
export async function checkCloudDataExists(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();

  // Quick check - just count players (most users have players if they have any data)
  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  return (count ?? 0) > 0;
}
```

#### UI Integration

Show "Download Cloud Data" option when:
1. User is signed in
2. User has cloud data (`checkCloudDataExists()` returns true)
3. Sync is NOT enabled (no subscription, or subscription expired)

```typescript
// In Settings or a dedicated CloudDataSection component
const { data: hasCloudData } = useQuery(['cloudDataExists', userId], () =>
  checkCloudDataExists(userId)
);

const showCloudExport = hasCloudData && !syncEnabled;
```

#### Why This Is Fair

| Scenario | Without Cloud Export | With Cloud Export |
|----------|---------------------|-------------------|
| User cancels subscription | Data "trapped" in cloud | User downloads data, continues locally |
| User loses device | Must resubscribe to recover | Downloads cloud data to new device |
| User wants multi-device | Must pay for sync | Pays for CONVENIENCE, not data access |

**The value proposition of paid sync:**
- **Automatic** - changes sync in real-time
- **Seamless** - no manual export/import
- **Multi-device** - all devices stay in sync
- **Backup** - cloud copy protects against device loss

**What's free:**
- Local-only usage (one device)
- Manual export/import (portable backups)
- One-time cloud data download (GDPR right)

---

## 4. Implementation Plan

### 4.1 Phase 1: Core Infrastructure

1. **Storage key scoping** - Add `getScopedKey()` that requires userId
2. **ID generation** - Update to require userId, add strip/add prefix utilities
3. **LocalDataStore** - Require userId in constructor, use scoped keys
4. **SyncQueue** - User-tagged operations (single database, filter by userId)
5. **Factory** - Updated to manage user-scoped instances

### 4.2 Phase 2: Auth Integration

1. **Sign-in flow** - Initialize DataStore with userId
2. **Sign-out flow** - Reset DataStore, handle unsynced warning
3. **App startup** - Require sign-in before accessing any data

### 4.3 Phase 3: Export/Import

1. **Export** - Strip user prefixes, create portable backup
2. **Import** - Regenerate IDs, update references, merge/replace options
3. **UI** - Export/import buttons in settings

---

## 5. PR Breakdown

> **⚠️ IMPORTANT: Before starting ANY PR, carefully read that PR's full description below.**
>
> Do NOT assume how something is implemented. Each PR has specific:
> - Dependencies on other PRs
> - Code reuse requirements (e.g., PR #0 MUST use `importBackup()` from PR #3)
> - Acceptance criteria that must all pass
> - Edge cases that must be handled
>
> **Read first, then implement.** Assumptions lead to duplicate code and bugs.

### Deployment Strategy (CRITICAL)

**All PRs MUST be deployed together in a single release.**

```
DEVELOPMENT ORDER:          DEPLOYMENT:
PR #1 (infrastructure)  ─┐
PR #2 (auth flow)       ─┼──► Single Release (all at once)
PR #3 (export/import)   ─┤
PR #0 (legacy migration)─┘
```

**Why?** If PR #1 is deployed without PR #0:
- PR #1 changes LocalDataStore to use prefixed keys (`abc123_soccerMasterRoster`)
- Existing users have data in global keys (`soccerMasterRoster`)
- Result: **Existing users see empty app, data appears lost**

**Correct approach:**
1. Develop PRs in order: #1 → #2 → #3 → #0 (PR #0 depends on #3's `importBackup()`)
2. Merge all PRs to feature branch
3. Test complete flow end-to-end
4. Deploy feature branch to production as ONE release

**Never deploy partial implementation.** The legacy migration (PR #0) must be present at the moment the user-scoped storage (PR #1) goes live.

### PR #0: Legacy Data Migration (CRITICAL - Data Loss Prevention)

> **⚠️ NAMING NOTE:** Despite being named "PR #0", this PR is developed LAST (after #1, #2, #3).
> The "#0" indicates it handles "day zero" users (existing users before this update).
> **Development order: PR #1 → PR #2 → PR #3 → PR #0**

**Branch:** `user-scoped/pr0-legacy-migration`
**Size:** Small (reuses PR #3 import logic)
**Risk:** HIGH (data loss if done wrong)
**Priority:** Deploy AFTER PR #3 (depends on `importBackup()`)

**Why This PR Exists:**
Existing users have data in GLOBAL keys (e.g., `soccerMasterRoster`). After the user-scoped update, the app will look for PREFIXED keys (e.g., `abc123_soccerMasterRoster`). Without migration, existing users will see an empty app and lose all data.

**Key Insight: Legacy data format = exported backup format!**
- Legacy IDs: `player_1703...` (no user prefix)
- Exported backup IDs: `player_1703...` (export strips prefixes)
- **Solution:** Package legacy data as BackupData → call `importBackup()` from PR #3

**Changes:**
- [ ] Create `src/utils/legacyDataMigration.ts`
- [ ] Implement `checkForLegacyData()` - detect data in global keys
- [ ] Implement `readLegacyDataAsBackup()` - package global data as BackupData
- [ ] Implement `migrateLegacyDataToUser()` - **calls `importBackup()`** for all ID/reference work
- [ ] Implement `confirmLegacyMigration()` - clean up global keys after user confirms
- [ ] Create `LegacyMigrationModal.tsx` component
- [ ] Integrate into AuthProvider sign-in flow
- [ ] Store migration flag per user to prevent re-migration

**Files:**
- `src/utils/legacyDataMigration.ts` (NEW - thin wrapper around `importBackup()`)
- `src/components/LegacyMigrationModal.tsx` (NEW)
- `src/contexts/AuthProvider.tsx` (add migration check)
- Test files

**Acceptance Criteria:**
- [ ] First sign-in after update detects legacy data in global keys
- [ ] User sees count of data found and can choose "Keep" or "Start Fresh"
- [ ] "Keep My Data" calls `importBackup()` with legacy data packaged as BackupData
- [ ] All IDs regenerated with user prefix (via `importBackup()`)
- [ ] All internal references updated (via `importBackup()`)
- [ ] Atomic import ensures data safety (via `importBackup()`)
- [ ] Migration flag prevents re-migration on subsequent sign-ins
- [ ] Global keys preserved as backup until user confirms
- [ ] Second user on same device does NOT see first user's migrated data
- [ ] Corrupted legacy data handled gracefully (via `importBackup()` validation)

**Test Scenarios:**
- [ ] User with 100 games, 50 players → all migrated correctly
- [ ] User with empty data → no migration prompt
- [ ] User already migrated → skip migration
- [ ] Migration fails mid-process → atomic rollback, global data intact
- [ ] Two users on shared device → first claims data, second starts fresh
- [ ] Legacy migration uses SAME code path as importing a backup file

---

### PR #1: User-Scoped Storage Infrastructure

**Branch:** `user-scoped/pr1-infrastructure`
**Size:** Large
**Risk:** Medium

**Changes:**
- [ ] Update `getScopedKey()` to require userId, use 12-char prefix
- [ ] Update `generateId()` to require userId
- [ ] Add `stripUserPrefix()` and `addUserPrefix()` utilities
- [ ] Update `extractTimestampFromId()` to handle **both** legacy and new ID formats
- [ ] Update `LocalDataStore` constructor to require userId
- [ ] Update all ~70 LocalDataStore methods to use scoped keys (see Section 9.1 for full list)
- [ ] Update `SyncQueue` to tag operations with userId (single `matchops_sync_queue` database - see Section 10.2)
- [ ] Update `SyncedDataStore` to accept and propagate userId
- [ ] Update `createSyncExecutor` to receive userId context
- [ ] Update factory to manage user-scoped instances
- [ ] Add `resetDataStore()` function
- [ ] Refactor 8 files with inline ID generation to use `generateId()` (2 are ephemeral, see Section 10.7)
- [ ] Update 12 files that call `getDataStore()` to pass userId

**Files (Core Changes):**
- `src/config/storageKeys.ts`
- `src/utils/idGenerator.ts`
- `src/datastore/LocalDataStore.ts` (~70 methods - see Section 9.1)
- `src/datastore/SyncedDataStore.ts`
- `src/datastore/factory.ts`
- `src/sync/SyncQueue.ts`
- `src/sync/SyncEngine.ts`
- `src/sync/createSyncExecutor.ts`

**Files (Factory Usage - 12 files, see Section 9.4 for full details):**
- `src/utils/teams.ts`, `src/utils/savedGames.ts`, `src/utils/seasons.ts`
- `src/utils/tournaments.ts`, `src/utils/masterRoster.ts`, `src/utils/personnelManager.ts`
- `src/utils/playerAdjustments.ts`, `src/utils/warmupPlan.ts`, `src/utils/appSettings.ts`
- `src/utils/timerStateManager.ts`, `src/contexts/AuthProvider.tsx`, `src/components/CloudSyncSection.tsx`

**Test Files (~100 tests need updates):**
- `src/datastore/__tests__/LocalDataStore.test.ts`
- `src/sync/__tests__/SyncQueue.test.ts`
- `src/sync/__tests__/SyncEngine.test.ts`
- `src/utils/__tests__/idGenerator.test.ts`
- All integration tests that create entities

**Acceptance Criteria:**
- [ ] `getScopedKey('roster', userId)` returns `'{12-char-prefix}_roster'`
- [ ] `getScopedKey('roster', undefined)` throws error
- [ ] `generateId('player', userId)` returns user-prefixed ID
- [ ] `stripUserPrefix()` and `addUserPrefix()` work correctly
- [ ] `extractTimestampFromId()` works with both legacy (`player_123...`) and new (`abc123_player_123...`) formats
- [ ] LocalDataStore requires userId, uses scoped keys (~70 methods)
- [ ] SyncQueue tags operations with userId, filters by current user (single `matchops_sync_queue` database)
- [ ] Factory creates correct DataStore based on userId and syncEnabled
- [ ] All existing tests updated and passing

---

### PR #2: Auth Flow Updates

**Branch:** `user-scoped/pr2-auth-flow`
**Size:** Medium
**Risk:** Medium

**Changes:**
- [ ] Update sign-in flow to initialize user-scoped DataStore
- [ ] Update sign-out flow to reset DataStore and warn about unsynced
- [ ] **CRITICAL: Clear React Query cache synchronously on sign-out**
- [ ] **CRITICAL: Block sign-in while cache is clearing (race condition fix)**
- [ ] Ensure app requires sign-in before any data access
- [ ] Update AuthProvider to pass userId to DataStore factory
- [ ] Handle subscription status for sync enable/disable
- [ ] Handle orphaned data when account deleted remotely
- [ ] Store `lastKnownUserId` for orphan detection

**Files:**
- `src/contexts/AuthProvider.tsx`
- `src/app/page.tsx` (or wherever DataStore is accessed)
- `src/components/SignOutWarningModal.tsx` (new or updated)
- `src/components/OrphanDataModal.tsx` (NEW - handles remote account deletion)
- `src/utils/orphanDataHandler.ts` (NEW)
- Related test files

**Acceptance Criteria:**
- [ ] Cannot access app data without being signed in
- [ ] Sign-in creates user-scoped DataStore
- [ ] Sign-out resets DataStore, shows warning if unsynced changes
- [ ] **React Query cache cleared synchronously before sign-out completes**
- [ ] **Sign-in blocked while cache clearing in progress**
- [ ] User A signs out → User B cannot see User A's cached data
- [ ] Rapid sign-out/sign-in cycles work correctly
- [ ] Account deleted remotely → user prompted to export/clear local data
- [ ] Subscription status determines if sync is enabled
- [ ] Multiple sign-in/sign-out cycles work correctly

---

### PR #3: Export/Import with ID Regeneration

**Branch:** `user-scoped/pr3-export-import`
**Size:** Medium
**Risk:** HIGH (data loss if atomic import fails)

**Changes:**
- [ ] Implement `exportBackup()` with ID stripping
- [ ] Implement `importBackup()` with ID regeneration
- [ ] **CRITICAL: Implement ATOMIC replace mode (import to temp → validate → swap)**
- [ ] **CRITICAL: Implement `validateAllReferences()` post-import validation**
- [ ] **CRITICAL: Implement `checkStorageQuota()` pre-import check**
- [ ] Implement reference update logic for **all** entity types (see matrix below)
- [ ] Handle `teamPlacements` object key remapping in Season/Tournament
- [ ] Add merge/replace import modes
- [ ] Update export/import UI in settings
- [ ] **GDPR: Implement `exportCloudData()` - download cloud data without subscription (see Section 3.7)**
- [ ] **GDPR: Implement `checkCloudDataExists()` - detect if user has cloud data**
- [ ] **GDPR: Add "Download My Cloud Data" UI for users with cloud data but no sync**

**Reference Update Matrix (from Section 3.5):**
| Entity | ID Fields to Update |
|--------|---------------------|
| Team | `id`, `boundSeasonId`, `boundTournamentId`, `boundTournamentSeriesId` |
| Team Roster | `playerId` for each entry |
| Season | `id`, `teamPlacements` keys |
| Tournament | `id`, `series[].id`, `awardedPlayerId`, `teamPlacements` keys |
| Game | `id`, `teamId`, `seasonId`, `tournamentId`, `tournamentSeriesId`, `playersOnField[].id`, `selectedPlayerIds[]`, `availablePlayers[].id`, `gameEvents[].id`, `gameEvents[].scorerId`, `gameEvents[].assisterId`, `gameEvents[].entityId`, `gamePersonnel[]`, `assessments` (object keys). **Note:** `leagueId` is a predefined constant, DO NOT remap. |
| Personnel | `id` |
| Settings | `currentGameId` |
| Player Adjustments | `id`, `playerId`, `seasonId`, `teamId`, `tournamentId` |
| Warmup Plan | `id`, `sections[].id` |

**Files:**
- `src/utils/backup.ts` (new - portable export/import)
- `src/utils/fullBackup.ts` (update to use new ID utilities)
- `src/utils/idMigration.ts` (new - ID regeneration utilities)
- `src/utils/referenceValidator.ts` (NEW - post-import validation)
- `src/utils/storageQuota.ts` (NEW - quota pre-check)
- `src/utils/cloudExport.ts` (NEW - GDPR cloud data export)
- `src/components/ImportDataModal.tsx` (new or updated)
- `src/components/ExportDataButton.tsx` (updated)
- `src/components/CloudDataDownloadSection.tsx` (NEW - UI for cloud export)
- Related test files (~70 new tests)

**Acceptance Criteria:**
- [ ] Export creates portable backup (no user prefixes in IDs)
- [ ] Import regenerates all IDs with current user's prefix
- [ ] **Replace mode: import to temp namespace → validate → atomic swap**
- [ ] **Import fails mid-process → original data INTACT**
- [ ] **Post-import validation checks ALL references resolve**
- [ ] **Pre-import quota check prevents partial imports**
- [ ] Team `boundSeasonId`, `boundTournamentId`, `boundTournamentSeriesId` references updated
- [ ] Season/Tournament `teamPlacements` object keys remapped to new teamIds
- [ ] PlayerStatAdjustment `seasonId`, `teamId`, `tournamentId` references updated
- [ ] Settings `currentGameId` reference updated
- [ ] Merge mode adds to existing data
- [ ] Replace mode uses atomic swap (never deletes before import succeeds)
- [ ] Import/export works for all entity types
- [ ] Backup from User A can be imported by User B
- [ ] Quota exceeded → clear error message, no partial import
- [ ] **GDPR: Cloud export works WITHOUT subscription (user's right to their data)**
- [ ] **GDPR: "Download My Cloud Data" button shown when user has cloud data but no sync**
- [ ] **GDPR: Cloud export produces same format as local export (can be imported normally)**

---

## 6. Testing Strategy

### 6.1 Unit Tests

- [ ] `getScopedKey()` returns correct keys, throws without userId
- [ ] `generateId()` creates user-prefixed IDs
- [ ] `stripUserPrefix()` / `addUserPrefix()` handle all formats
- [ ] `stripUserPrefix()` correctly identifies legacy IDs (first part is entity type)
- [ ] `extractTimestampFromId()` works with new format
- [ ] LocalDataStore uses correct scoped keys
- [ ] SyncQueue tags operations with userId and filters by current user (single database)

### 6.2 Integration Tests

- [ ] Sign-in creates user-scoped storage
- [ ] Sign-out resets DataStore, data remains in IndexedDB
- [ ] Sign back in accesses same data
- [ ] Different user on same device sees different data
- [ ] Export creates portable backup
- [ ] Export converts games object to array, adjustments map to flat array
- [ ] Import regenerates IDs correctly
- [ ] Import merge mode preserves existing data
- [ ] Import replace mode clears existing data

### 6.3 Multi-User Tests

- [ ] User A creates data → sign out → User B signs in → sees empty
- [ ] User B creates data → sign out → User A signs in → sees only User A's data
- [ ] Both users' data persists in IndexedDB simultaneously

### 6.4 Export/Import Tests

**Local Export/Import:**
- [ ] Export → Import on same account (IDs change but data intact)
- [ ] User A exports → User B imports (works, different IDs)
- [ ] Import with merge preserves existing + adds new
- [ ] Import with replace removes existing
- [ ] All references updated correctly after import
- [ ] **Import while sync enabled → imported data queued for cloud sync**
- [ ] Large import (100+ games) with sync → shows progress, doesn't overwhelm queue

**Cloud Export (GDPR - Section 3.7):**
- [ ] Cloud export works WITHOUT active subscription (GDPR right)
- [ ] Cloud export produces same format as local export
- [ ] Cloud export file can be imported normally
- [ ] `checkCloudDataExists()` returns true when user has cloud data
- [ ] `checkCloudDataExists()` returns false when user has no cloud data
- [ ] "Download My Cloud Data" button shown when: has cloud data AND no sync
- [ ] "Download My Cloud Data" button hidden when: sync enabled OR no cloud data
- [ ] Cloud export handles network failure gracefully
- [ ] Cloud export includes ALL data types (players, teams, games, etc.)

### 6.5 CRITICAL: Data Loss Prevention Tests

**Legacy Migration Tests (PR #0):**
- [ ] Existing user with global data → migration prompt shown
- [ ] User chooses "Keep My Data" → all data migrated to prefixed keys
- [ ] All player IDs regenerated with user prefix
- [ ] All game references (playerIds, teamId, etc.) updated to new IDs
- [ ] Migration flag set → no prompt on subsequent sign-ins
- [ ] User chooses "Start Fresh" → no migration, empty data
- [ ] Second user on device → does NOT see first user's migrated data
- [ ] Corrupted legacy data → skip corrupt records, migrate rest
- [ ] Migration fails mid-process → rollback, global data intact

**Atomic Import Tests (PR #3):**
- [ ] Replace mode: data imported to temp namespace first
- [ ] Replace mode: validation runs before any real data deleted
- [ ] Replace mode: import fails mid-process → original data INTACT
- [ ] Replace mode: import succeeds → atomic swap to real namespace
- [ ] Temp namespace cleaned up after success/failure
- [ ] Quota check: insufficient space → clear error, no partial import
- [ ] Reference validation catches broken references after import
- [ ] Reference validation catches missing players in team rosters

**Cache Race Condition Tests (PR #2):**
- [ ] Sign-out clears React Query cache synchronously
- [ ] Sign-in blocked while sign-out in progress
- [ ] Rapid sign-out/sign-in (User A → User B) → User B never sees User A cache
- [ ] Background queries cancelled before sign-out completes

**Orphan Data Tests (PR #2):**
- [ ] Account deleted remotely → local orphan data detected
- [ ] User prompted: export, clear, or keep read-only
- [ ] Export option → backup file downloaded, then data cleared
- [ ] Clear option → data deleted immediately
- [ ] Keep read-only → data visible but no edits allowed

### 6.6 Manual Testing Checklist

- [ ] Create account → add players/games → sign out → sign back in → data persists
- [ ] Two users on same device → each sees only their data
- [ ] Export backup → delete all data → import backup → data restored
- [ ] Share backup with another coach → they can import it
- [ ] Enable sync → data uploads → disable sync → local data remains
- [ ] **CRITICAL: Existing user before update → update → sign in → migration prompt → data preserved**
- [ ] **CRITICAL: Import with replace → kill app mid-import → restart → original data intact**
- [ ] **GDPR: Cancel subscription → sign in on new device → "Download My Cloud Data" works → import succeeds**
- [ ] **GDPR: User with cloud data but no subscription → can always download their data**

---

## 7. Security Considerations

### 7.1 Data Isolation

**Local isolation:** User-scoped storage keys ensure User B cannot access User A's IndexedDB data. Without knowing the userId prefix, the keys are invisible.

**Cloud isolation:** RLS policies ensure User B cannot access User A's Supabase data. The `user_id` column + `auth.uid()` check enforces this.

### 7.2 Double Protection

Even if someone bypasses the UI:
1. They don't have a userId → can't construct storage keys
2. Storage keys don't exist in global namespace → no data to read
3. Would need to guess the 12-char prefix to access any data

### 7.3 Sign-Out Security

On sign-out:
- Supabase session fully cleared
- React Query cache cleared
- DataStore instances reset
- Data remains in IndexedDB but inaccessible without signing in

### 7.4 Backup Security

Backup files contain data but:
- No user identification in the file
- IDs are portable (no user prefix)
- Anyone with the file can import it
- User should protect their backup files

### 7.5 Accepted Risks and Security Rationale

**Industry Standard Decision:** This app follows standard practices for consumer-facing local-first applications.

#### What We Do NOT Encrypt (and Why)

| Data | Storage | Why No Encryption |
|------|---------|-------------------|
| Player rosters | IndexedDB | Sports stats, not financial/health data |
| Game records | IndexedDB | Non-sensitive coaching data |
| Seasons/Tournaments | IndexedDB | Organizational data only |
| Settings | IndexedDB | Preferences only |
| Personnel contacts | IndexedDB | Contact info for coaches/assistants (see PII note below) |

#### PII Note: Personnel Contact Data

Personnel data may include **email addresses and phone numbers** of coaches, assistants, and team staff. Under GDPR, this is considered Personally Identifiable Information (PII).

**Risk Assessment:**
- This is contact info for people the user (coach) works with
- Similar to storing contacts in a phone's address book
- Data is on the user's own device (local mode) or in their authenticated cloud account (cloud mode)
- Industry standard: Phone contact apps, note-taking apps, calendar apps all store similar data without additional encryption

**Mitigation:**
- Cloud mode: Data protected by Supabase RLS (only authenticated owner can access)
- Local mode: Data protected by device access controls
- Export files: User warned to protect backup files containing personnel data

#### Theoretical Attack Vectors (All Requiring Device Access)

| Attack Vector | Mitigation | Risk Level |
|---------------|------------|------------|
| DevTools inspection | Requires physical device access | Accepted |
| IndexedDB browser export | Requires physical device access | Accepted |
| Memory dump attack | Requires root/admin access | Accepted |
| Malicious browser extension | User responsibility (sandbox protection) | Accepted |

**Key Point:** If an attacker has physical or remote access to a user's device, they typically have access to far more sensitive data (email, banking apps, photos) than soccer coaching statistics.

#### Security Comparison

| App Type | Encryption Level | MatchOps Comparison |
|----------|------------------|---------------------|
| Banking apps | Full encryption at rest | N/A - Different risk profile |
| Healthcare apps | Full encryption (HIPAA) | N/A - Not healthcare data |
| Note-taking apps (Notion, Bear) | No additional encryption | ✅ Equivalent |
| Contact/Calendar apps | No additional encryption | ✅ Equivalent |
| Sports coaching apps | Varies, typically none | ✅ Industry standard |

#### Decision Rationale

1. **Cost/Benefit**: Client-side encryption adds complexity (~50-100 hours dev time) for minimal security benefit
2. **Performance**: Encryption would slow IndexedDB operations on mobile devices
3. **Industry Standard**: Major local-first apps (Obsidian, Notion, Bear) don't encrypt IndexedDB
4. **Target User**: Amateur soccer coaches, not high-security environments
5. **Data Sensitivity**: Sports statistics and coach contact info, not financial/health data

#### Legal Disclosure

This decision MUST be disclosed in:
1. **Privacy Policy** - Section on data storage and security
2. **Terms of Service** - Acknowledgment of local storage security

See implementation task in Section 10.10.

---

## 8. Edge Cases and Error Handling

### 8.1 Account and Session Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Account deleted on another device** | On next auth check, detect deleted account, show "Account no longer exists" message, clear local session |
| **Session expires during sync** | SyncEngine detects 401 error, triggers re-auth flow, queues pending operations |
| **Multiple tabs open** | Use `BroadcastChannel` or storage events to coordinate DataStore singleton; tabs share same user session |
| **Browser clears IndexedDB** | On sign-in, detect empty local data, offer to re-download from cloud (if sync enabled) or start fresh |
| **User clears site data** | Same as IndexedDB cleared - detect and handle gracefully |
| **Sign-in on new device with sync** | Download cloud data to local IndexedDB under user's namespace |
| **Sign-in on new device without sync (no cloud data)** | Start with empty data (free tier, new user) |
| **Sign-in on new device without sync (has cloud data)** | Show options: "Download My Cloud Data" (one-time, GDPR right), "Subscribe for Auto-Sync", or "Start Fresh". User can always download their cloud data regardless of subscription status. See Section 3.7. |
| **Sign-in succeeds but DataStore creation fails** | Catch DataStore initialization error, show retry prompt. Do NOT sign out - user may retry. Log error to Sentry with userId context. |

### 8.2 Sync Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Sync enabled → disabled mid-sync** | Complete in-flight operations, stop queue processing, show "Sync paused" |
| **Network lost during sync** | Queue operations, retry with exponential backoff, show "Offline - changes will sync when online" |
| **Conflict: local and cloud both changed** | Last-write-wins (timestamp-based), log conflict for debugging |
| **Sync queue has 1000+ pending items** | Batch processing, progress indicator, avoid UI blocking |
| **Subscription lapses with pending sync** | Warn user, offer to re-subscribe or continue in local-only mode |
| **Account deleted with pending sync** | Before deletion: check `getPendingSyncCount()`. If > 0, warn user: "You have X changes that haven't synced. Delete anyway?" On confirm: clear user's SyncQueue operations, then proceed with deletion. |

### 8.3 Import/Export Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Import file from older app version** | Version check in backup metadata, apply migrations if needed |
| **Import file with invalid JSON** | Parse error with clear message: "Invalid backup file format" |
| **Import file with missing required fields** | Validate schema, report which entities are invalid |
| **Import causes duplicate names** | Allow duplicates (IDs are unique), user can rename manually |
| **Export fails mid-process** | Atomic operation (build in memory, then save), no partial files |
| **Import on device with no space** | Check quota before import, show error if insufficient |
| **Cloud export with no network** | Show error: "Cannot download cloud data while offline. Please check your connection." |
| **Cloud export fails mid-download** | Atomic operation (build complete object in memory before returning), retry with exponential backoff |
| **Cloud data empty but user expected data** | Show clear message: "No data found in the cloud for your account." Possible reasons: never synced, data deleted, wrong account. |
| **Cloud export takes too long (large dataset)** | Show progress indicator, allow cancellation, consider pagination for very large datasets |
| **Import while sync is enabled** | Imported data goes to local first, then SyncedDataStore queues all entities for cloud sync. For large imports (100+ games), consider: (1) show progress "Syncing imported data...", (2) allow user to pause sync mid-import, (3) batch operations to avoid overwhelming sync queue. |
| **Import from cloud export on same account** | Works normally - IDs are regenerated anyway, so no conflicts. User effectively creates a "snapshot restore" of their cloud data. |

### 8.4 Data Integrity Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Referenced entity deleted** | Graceful degradation: show "Unknown Team" for deleted teamId, don't crash |
| **Circular references in backup** | ID regeneration handles this - each entity gets new ID independently |
| **Legacy IDs without user prefix** | `extractTimestampFromId()` handles both formats |
| **Corrupted IndexedDB data** | Validation on read, skip corrupt records, log warning |
| **Storage key generation fails** | Validate inputs: `baseKey` must be non-empty string, `userId` must be string. Throw descriptive error on invalid input. Never silently fall back to unscoped key. |
| **ID collision (astronomically rare)** | Rely on database unique constraint to detect. On collision error, re-generate with new timestamp/random. Risk: ~1 in 4 billion per millisecond - acceptable for single-user app. |
| **IndexedDB quota exceeded** | Detect via `QuotaExceededError`. Show user message: "Storage full. Delete old games or enable cloud sync for backup." Pre-check quota before large imports. |

---

## 9. Multi-Agent Review Findings

This section documents findings from the comprehensive codebase review conducted on 2026-01-29.

### 9.1 LocalDataStore Analysis

**~70 methods require userId scoping changes** (~61 public + ~9 private helpers, not 47 as originally estimated):
- **Players (6):** getPlayers, createPlayer, updatePlayer, deletePlayer, upsertPlayer, loadPlayers
- **Teams (11):** getTeams, getTeamById, createTeam, updateTeam, deleteTeam, upsertTeam, getTeamRoster, setTeamRoster, getAllTeamRosters, loadTeamsIndex, loadTeamRosters
- **Seasons (6):** getSeasons, createSeason, updateSeason, deleteSeason, upsertSeason, loadSeasons
- **Tournaments (6):** getTournaments, createTournament, updateTournament, deleteTournament, upsertTournament, loadTournaments
- **Personnel (7):** getAllPersonnel, getPersonnelById, addPersonnelMember, updatePersonnelMember, upsertPersonnelMember, removePersonnelMember, loadPersonnelCollection
- **Games (11):** getGames, getGameById, createGame, saveGame, saveAllGames, deleteGame, addGameEvent, updateGameEvent, removeGameEvent, loadSavedGames, validateGame
- **Settings (5):** getSettings, saveSettings, updateSettings, invalidateSettingsCache, mergeWithDefaults
- **Adjustments (7):** getPlayerAdjustments, addPlayerAdjustment, upsertPlayerAdjustment, updatePlayerAdjustment, deletePlayerAdjustment, getAllPlayerAdjustments, buildPlayerAdjustment
- **Warmup Plan (4):** getWarmupPlan, saveWarmupPlan, deleteWarmupPlan, normalizeWarmupPlanForSave
- **Timer State (3):** getTimerState, saveTimerState, clearTimerState
- **Data Management (2):** clearAllUserData, isAvailable

**Storage keys that need scoping (16 total, 8 were missing from original estimate):**

| Key Constant | Base Value | Scope Strategy |
|--------------|------------|----------------|
| `MASTER_ROSTER_KEY` | `'soccerMasterRoster'` | User-scoped |
| `SAVED_GAMES_KEY` | `'savedSoccerGames'` | User-scoped |
| `SEASONS_LIST_KEY` | `'soccerSeasons'` | User-scoped |
| `TOURNAMENTS_LIST_KEY` | `'soccerTournaments'` | User-scoped |
| `PERSONNEL_KEY` | `'soccerPersonnel'` | User-scoped |
| `APP_SETTINGS_KEY` | `'soccerAppSettings'` | User-scoped |
| `WARMUP_PLAN_KEY` | `'soccerWarmupPlan'` | User-scoped |
| `PLAYER_ADJUSTMENTS_KEY` | `'soccerPlayerAdjustments'` | User-scoped |
| `TEAMS_INDEX_KEY` | `'soccerTeamsIndex'` | User-scoped |
| `TEAM_ROSTERS_KEY` | `'soccerTeamRosters'` | User-scoped |
| `TIMER_STATE_KEY` | `'soccerTimerState'` | User-scoped |
| `LAST_HOME_TEAM_NAME_KEY` | `'lastHomeTeamName'` | User-scoped (legacy) |
| `APP_DATA_VERSION_KEY` | `'appDataVersion'` | **User-scoped** (per-user migration version) |
| `PREMIUM_LICENSE_KEY` | `'soccerPremiumLicense'` | **User-scoped** (per-user subscription) |
| `INSTALL_PROMPT_DISMISSED_KEY` | `'installPromptDismissed'` | **Global** (device-level UI) |
| `HAS_SEEN_FIRST_GAME_GUIDE_KEY` | `'hasSeenFirstGameGuide'` | **User-scoped** (per-user onboarding) |

**Note:** Only `INSTALL_PROMPT_DISMISSED_KEY` is truly global (device-level preference). All other keys must be user-scoped to prevent data/state leakage between users. See Section 10.4 for detailed analysis.

### 9.2 ID Generation Usage Analysis

**11 files directly use ID generation** (clarified from original estimate):

**Files that directly import and call generateId/generatePlayerId (4 files):**
1. `src/utils/idGenerator.ts` - Definition file
2. `src/datastore/LocalDataStore.ts` - Entity creation (7 calls at lines 56, 304, 466, 641, 884, etc.)
3. `src/datastore/SupabaseDataStore.ts` - Cloud operations (lines 46, 810, 1104, 1562, 1904)
4. `src/utils/warmupPlan.ts` - Local generateId (lines 10, 81)

**Files that import extractTimestampFromId (2 files):**
5. `src/components/LoadGameModal.tsx` - For sorting games by creation time
6. `src/components/RosterSettingsModal.tsx` - For sorting players by creation time

**Files with custom generateId implementations (2 files):**
7. `src/sync/SyncQueue.ts` - Custom UUID-format generateId (lines 46, 382)
8. `src/components/TrainingResourcesModal.tsx` - Inline generateId (lines 51, 67)

**Files that call DataStore methods which internally use generateId (7 files - indirect):**
- `src/utils/masterRoster.ts` - calls `dataStore.createPlayer()`
- `src/utils/personnelManager.ts` - calls `dataStore.addPersonnelMember()`
- `src/utils/playerAdjustments.ts` - calls `dataStore.addPlayerAdjustment()`
- `src/utils/seasons.ts` - calls `dataStore.createSeason()`
- `src/utils/teams.ts` - calls `dataStore.createTeam()`
- `src/utils/tournaments.ts` - calls `dataStore.createTournament()`
- `src/utils/savedGames.ts` - calls `dataStore.createGame()`

**10 files have inline ID generation (needs refactoring):**
1. `src/utils/teams.ts` (line 225) - `player_${Date.now()}_...` - inconsistent with DataStore
2. `src/utils/warmupPlan.ts` (lines 10, 81) - Local `generateId()` using Date.now()
3. `src/hooks/useGameState.ts` (line 332) - `opp-${Date.now()}` for opponents
4. `src/hooks/useTacticalBoard.ts` (line 69) - `tactical-${type}-${Date.now()}`
5. `src/hooks/useRoster.ts` (line 31) - `temp-${Date.now()}` for optimistic updates
6. `src/components/HomePage/hooks/useTimerManagement.ts` (lines 154, 178) - `goal-${Date.now()}-...` for events
7. `src/components/TournamentSeriesManager.tsx` (line 42) - `series_${Date.now()}_...`
8. `src/contexts/ToastProvider.tsx` (line 24) - `toast-${Date.now()}-...` for toast notifications
9. `src/components/TrainingResourcesModal.tsx` (lines 51, 67) - Inline generateId for resources
10. `src/components/HomePage/utils/newGameHandlers.ts` (line 187) - `game_${Date.now()}_...` for game IDs

### 9.3 SyncQueue and SyncEngine Analysis

**SyncQueue changes needed:**
- Current: `const SYNC_DB_NAME = 'matchops_sync_queue'` (global, no user isolation)
- Required: Keep single `matchops_sync_queue` database, add `userId` field to operations (see Section 10.2)
- Add `setCurrentUser()`, `clearCurrentUser()`, `getPending()` with user filtering

**SyncEngine changes needed:**
- Needs to pass userId to SyncQueue
- Needs to pass userId to createSyncExecutor

### 9.4 Factory Usage Analysis

**12 files use the factory** (verified count, originally estimated 35+):

**Production files calling `getDataStore()` (12 files):**
1. `src/components/CloudSyncSection.tsx`
2. `src/contexts/AuthProvider.tsx`
3. `src/utils/appSettings.ts`
4. `src/utils/masterRoster.ts`
5. `src/utils/personnelManager.ts`
6. `src/utils/playerAdjustments.ts`
7. `src/utils/savedGames.ts`
8. `src/utils/seasons.ts`
9. `src/utils/teams.ts`
10. `src/utils/timerStateManager.ts`
11. `src/utils/tournaments.ts`
12. `src/utils/warmupPlan.ts`

**Note:** `migrationService.ts` and `reverseMigrationService.ts` import `getAuthService` but NOT `getDataStore()`. They directly instantiate DataStore classes (documented in "bypass factory" section below).

**Files bypassing factory (direct instantiation - needs review):**
- `src/components/CloudAuthModal.tsx` (line 268) - `new SupabaseDataStore()`
- `src/services/migrationService.ts` (lines 381, 1587, 1623) - Direct for migration ops
- `src/services/reverseMigrationService.ts` - Direct for reverse migration

**Factory signature mismatch:**
- Plan expects: `getDataStore(userId: string, syncEnabled: boolean): DataStore`
- Current: `async function getDataStore(): Promise<DataStore>` (no params)

### 9.5 Test Impact Analysis

**Test suite overview:**
- Total test files: ~201 files
- Total tests in suite: ~1,400 tests

**Tests requiring direct updates (userId mocking): 120-180 tests** (revised down from 200-250 due to centralized fixtures - see Section 10.9)

**Core component tests (358 tests in 6 files):**
| File | Tests | Impact |
|------|-------|--------|
| `LocalDataStore.test.ts` | 180 | MAJOR - All ~70 methods need userId |
| `SyncedDataStore.test.ts` | 60 | MAJOR - userId propagation |
| `SyncQueue.test.ts` | 37 | MAJOR - User-scoped database |
| `SyncEngine.test.ts` | 34 | MAJOR - userId propagation |
| `factory.test.ts` | 24 | MAJOR - Signature change |
| `idGenerator.test.ts` | 23 | MAJOR - New format + 12-17 new tests |

**Utility tests (315+ tests in 12 files):**
- All files mocking `getDataStore()` need userId parameter updates
- `tournaments.test.ts`, `seasons.test.ts`, `teams.test.ts`, `masterRoster.test.ts`, etc.

**Service tests (~90 tests):**
- `migrationService.test.ts` (~50 tests)
- `reverseMigrationService.test.ts` (~40 tests)

**New tests needed (80-120 estimated):**
- extractTimestampFromId() dual-format support: 8-12 tests
- stripUserPrefix/addUserPrefix utilities: 8-10 tests
- Factory user-switching scenarios: 8-12 tests
- Multi-user isolation: 15-20 tests
- Edge cases from Section 8: 30-50 tests

### 9.6 Critical Findings Summary

| Finding | Severity | PR | Status |
|---------|----------|-----|--------|
| `extractTimestampFromId()` must handle both legacy and new ID formats | **High** | PR1 | ✅ Plan updated |
| LocalDataStore has ~61 public + ~9 private = ~70 methods | **High** | PR1 | ✅ Plan updated |
| 16 storage keys exist (15 user-scoped, 1 global) | **High** | PR1 | ✅ Plan updated (see Section 10.4) |
| GameEvent uses `scorerId`/`assisterId`/`entityId`, not `playerId` | **High** | PR3 | ✅ Plan updated |
| Tournament has `awardedPlayerId` for Player of Tournament | **Medium** | PR3 | ✅ Plan updated |
| WarmupPlan has `sections[].id` for nested IDs | **Medium** | PR3 | ✅ Plan updated |
| `teamPlacements` fully implemented (types, schema, DataStore, UI) | **Info** | PR3 | ✅ Verified |
| Factory signature mismatch (no params currently) | **High** | PR1 | ✅ Documented |
| 4 files bypass factory (direct instantiation for migration ops) | **Medium** | PR1 | ✅ Plan updated |
| App initialization doesn't require auth before data access | **High** | PR2 | ✅ Documented |
| SyncQueue uses global database name | **High** | PR1 | ✅ Documented |
| Conflict resolution (LWW) fully implemented | **Info** | N/A | ✅ Verified |
| Edge cases: 2 fully implemented, 5 partial, 1 documented-unsupported | **High** | All | ✅ Section 8 updated |
| **SyncQueue global singleton (data breach risk)** | **Critical** | PR1 | ⚠️ See Section 10.2 |
| **React Query cache not cleared on sign-out** | **High** | PR2 | ⚠️ See Section 10.3 |
| **"Start without account" breaks user-scoping** | **Critical** | PR2 | ⚠️ See Section 10.1 |
| **3 global keys should be user-scoped** | **High** | PR1 | ⚠️ See Section 10.4 |
| **3 extractTimestampFromId() implementations** | **Medium** | PR1 | ⚠️ See Section 10.5 |
| **generatePlayerId() missing userId param** | **High** | PR1 | ⚠️ See Section 10.6 |
| **Only 8 of 10 inline ID files need refactoring** | **Info** | PR1 | ✅ See Section 10.7 |
| **CRITICAL: No migration for existing users with global keys** | **CRITICAL** | PR0 | ✅ See Section 10.11 |
| **CRITICAL: Import replace mode not atomic (data loss risk)** | **CRITICAL** | PR3 | ✅ See Section 10.12 |
| **Reference validation after import missing** | **High** | PR3 | ✅ See Section 10.13 |
| **Sign-in/sign-out cache race condition** | **High** | PR2 | ✅ See Section 10.14 |
| **Quota pre-check for import missing** | **Medium** | PR3 | ✅ See Section 10.15 |
| **Orphan data on remote account deletion** | **Medium** | PR2 | ✅ See Section 10.16 |

### 9.7 Edge Case Implementation Status (from Section 8 review)

| Edge Case | Status | Details |
|-----------|--------|---------|
| **Account deleted detection** | ✅ Planned | Orphan data handling added in Section 10.16 |
| **First sign-in cloud data download** | ✅ Implemented | `reverseMigrationService.ts` downloads cloud data on first sign-in |
| **Session 401 handling** | ⚠️ Partial | Detected but no graceful re-auth flow in SyncEngine |
| **IndexedDB cleared detection** | ⚠️ Partial | Detected via `hasLocalDataToMigrate()`, no recovery UI |
| **Storage quota pre-check** | ✅ Planned | Added `checkStorageQuota()` in Section 10.15 |
| **Multi-tab coordination** | ❌ Documented | Documented as unsupported in CLAUDE.md, acceptable for MVP |
| **Conflict resolution (LWW)** | ✅ Implemented | Full implementation in `src/sync/conflictResolution.ts` (112 lines, 386+ tests) |
| **Orphaned reference handling** | ✅ Planned | Reference validation added in Section 10.13 |
| **Legacy data migration** | ✅ Planned | PR #0 added in Section 10.11 |
| **Atomic import** | ✅ Planned | Section 10.12 ensures data safety |
| **Cache race condition** | ✅ Planned | Section 10.14 blocks sign-in during cache clear |

**Remaining gaps (lower priority):**
1. Session 401 re-auth flow - graceful handling in SyncEngine (currently detects but no recovery UI)
2. IndexedDB cleared recovery UI - offer to re-download from cloud

### 9.8 Comprehensive 8-Agent Review (2026-01-29)

Final stress-test review conducted with 8 specialized agents analyzing plan quality.

#### Review Summary

| Agent | Rating | Key Findings |
|-------|--------|--------------|
| **Plan Completeness** | 75% | Gaps: offline quota exceeded, data corruption recovery, first-run after IndexedDB clear |
| **Internal Consistency** | 95% | 2 contradictions fixed (SyncQueue arch, method count) |
| **PR Dependencies** | ✅ | Correct order; blocker: remove "start without account" before PR1 |
| **Security** | 10 items | Race conditions, cache collision during sign-out (mitigated by 10.2/10.3) |
| **Migration** | 3 risks | Existing users with legacy IDs (handled by dual-format extractTimestamp) |
| **Test Coverage** | 24% → plan updated | Section 9.5 expanded with estimates |
| **Code Examples** | 3/10 | Expected - examples show TARGET state, not current |
| **Edge Cases** | 18 total | 4 critical, 8 high, 6 medium (see Section 8) |

#### Contradictions Fixed

1. **SyncQueue architecture** (lines 723, 755-756, 796-797): Now consistently describes single `matchops_sync_queue` database with userId-tagged operations (not per-user databases)
2. **LocalDataStore method count** (lines 754, 766, 1836): Now correctly says "~61 public methods (~70 with private helpers)" referencing Section 9.1

#### Critical Blockers for PR1

| Blocker | Why | Resolution |
|---------|-----|------------|
| Remove "Start without account" | Breaks entire user-scoping model | See Section 10.1 - remove option first |
| Fix factory signature | Current `getDataStore()` takes no params | Update signature BEFORE updating callsites |

#### Accepted Risks (Documented)

| Risk | Mitigation | Status |
|------|------------|--------|
| Multi-tab usage | Documented as unsupported in CLAUDE.md | ✅ Accepted |
| Legacy ID coexistence | Dual-format `extractTimestampFromId()` | ✅ Planned in Section 2.2 |
| Offline quota exceeded | Users should enable cloud sync for backup | ⚠️ Could add warning UI (low priority) |

#### Round 1 Fixes Applied (2026-01-29)

| Fix | Description |
|-----|-------------|
| Line reference | 1795→1836 in contradictions section |
| Storage key count | Updated to "15 user-scoped, 1 global" |
| Method count | Updated all refs from "68+" to "~70" |
| PR #3 matrix | Added `awardedPlayerId`, `gameEvents[].id`, `sections[].id` |
| Import order | Added PlayerAdjustments and WarmupPlan |
| LoginScreen lines | 409-417 → 409-420 |
| Edge cases | Added 4 missing: storage key failure, ID collision, DataStore init failure, account deletion with pending sync |

#### Verdict

**Plan is SOLID** for implementation. All critical contradictions resolved. Security gaps addressed in Section 10.2 (SyncQueue isolation) and Section 10.3 (cache clearing). Edge cases documented in Section 8.

---

## 10. Critical Implementation Fixes (From Creative Review)

This section documents critical issues discovered during multi-agent behavioral review on 2026-01-29. These MUST be addressed in the implementation.

### 10.1 Remove "Start Without Account" Flow

**Current State:** Users can choose "Start without an account" on WelcomeScreen and LoginScreen, bypassing authentication entirely.

**Problem:** This breaks the entire user-scoping model. Without a userId, we cannot:
- Scope storage keys
- Prefix entity IDs
- Isolate data between users on shared devices

**Files to Modify:**

| File | Change |
|------|--------|
| `src/components/WelcomeScreen.tsx` | Remove "Start without an account" button (lines 126-141) |
| `src/components/WelcomeScreen.test.tsx` | Remove/update tests for "Start without account" (lines 88, 104, 165-174, 262, 330) |
| `src/components/LoginScreen.tsx` | Remove "Or continue without an account" option (lines 409-420) |
| `src/app/page.tsx` | Remove `handleWelcomeStartLocal` (line 152) and `handleLoginUseLocalMode` (line 264) handlers |
| `src/i18n-types.ts` | Remove `'auth.useWithoutAccount'` translation key (line 42) |
| Localization files | Remove corresponding translation strings |

**New Flow:**
1. WelcomeScreen shows only: "Sign in or create account" and "Import a backup"
2. Import backup flow requires authentication FIRST, then imports into user's namespace
3. No path exists to use app without authentication

---

### 10.2 Fix SyncQueue User Isolation (CRITICAL - Data Breach Risk)

**Current State:** SyncQueue operations are not tagged with userId.

```typescript
// CURRENT (INSECURE)
// Operations stored without userId - no way to filter by user
{ id: 'op_123', entityType: 'player', operation: 'create', data: {...} }
```

**Problem:** When User A signs out and User B signs in:
- User B's SyncEngine processes User A's pending operations
- User A's data syncs to User B's cloud account
- **This is a data breach.**

**Architecture Decision:** Use single database with user-tagged operations (consistent with main storage pattern).

```typescript
// SECURE - Operations tagged with userId
{ id: 'op_123', userId: 'abc123...', entityType: 'player', operation: 'create', data: {...} }
```

**Required Fix:**

```typescript
// src/sync/types.ts - Add userId to SyncOperation

export interface SyncOperation {
  id: string;
  userId: string;  // NEW: Required field
  entityType: SyncEntityType;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: unknown;
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  lastError?: string;
}
```

```typescript
// src/sync/SyncQueue.ts

export class SyncQueue {
  private currentUserId: string | null = null;

  // 1. Set current user (call on sign-in)
  setCurrentUser(userId: string): void {
    this.currentUserId = userId;
  }

  // 2. Clear current user (call on sign-out)
  clearCurrentUser(): void {
    this.currentUserId = null;
  }

  // 3. Add operation WITH userId
  async addOperation(op: Omit<SyncOperation, 'userId'>): Promise<void> {
    if (!this.currentUserId) {
      throw new Error('No user set - cannot queue operation');
    }
    const operation: SyncOperation = {
      ...op,
      userId: this.currentUserId,
    };
    // ... save to IndexedDB
  }

  // 4. Get pending operations FOR CURRENT USER ONLY
  async getPending(): Promise<SyncOperation[]> {
    if (!this.currentUserId) {
      return []; // No user = no operations
    }
    const allOps = await this.getAllOperations();
    return allOps.filter(op => op.userId === this.currentUserId);
  }

  // 5. Clear operations for current user only (on sign-out if desired)
  async clearUserOperations(): Promise<void> {
    if (!this.currentUserId) return;
    const allOps = await this.getAllOperations();
    const otherUserOps = allOps.filter(op => op.userId !== this.currentUserId);
    // Rewrite database with only other users' operations
    await this.replaceAllOperations(otherUserOps);
  }
}
```

```typescript
// src/sync/SyncEngine.ts - Validate userId before processing

async processOperation(op: SyncOperation): Promise<void> {
  // CRITICAL: Verify operation belongs to current user
  if (op.userId !== this.currentUserId) {
    logger.warn('[SyncEngine] Skipping operation for different user', {
      opUserId: op.userId,
      currentUserId: this.currentUserId,
    });
    return; // Skip, don't delete - user might sign back in
  }

  // ... proceed with sync
}
```

**Sign-In Flow Update:**

```typescript
// When user signs in
syncQueue.setCurrentUser(user.id);
```

**Sign-Out Flow Update (AuthProvider.tsx):**

```typescript
const signOut = useCallback(async () => {
  // Option 1: Clear current user's operations (lose pending sync)
  // await syncQueue.clearUserOperations();

  // Option 2: Just clear current user reference (preserve for re-login)
  syncQueue.clearCurrentUser();

  // Clear React Query cache
  clearQueryCache();

  // ... existing sign-out logic
}, []);
```

**Benefits of this approach:**
- ✅ Consistent with main storage pattern (single DB, user-prefixed data)
- ✅ User A's pending ops preserved if User B uses device temporarily
- ✅ User A signs back in → their pending ops resume automatically
- ✅ Double protection: userId in data AND filter on read

---

### 10.3 Clear React Query Cache on Sign-Out

**Current State:** Sign-out clears DataStore caches but NOT React Query cache.

**Problem:** User B sees User A's cached data for 5-30 minutes after sign-out.

**Required Fixes (Two Parts):**

#### Part A: Clear Cache on Sign-Out

**Option A: Create cache manager utility (Recommended)**

```typescript
// src/utils/cacheManager.ts
import type { QueryClient } from '@tanstack/react-query';

let queryClientInstance: QueryClient | null = null;

export function setQueryClient(client: QueryClient): void {
  queryClientInstance = client;
}

export function clearQueryCache(): void {
  if (queryClientInstance) {
    queryClientInstance.clear();
  }
}
```

**Option B: Update QueryProvider**

```typescript
// src/app/QueryProvider.tsx
import { setQueryClient } from '@/utils/cacheManager';

// In component:
useEffect(() => {
  setQueryClient(queryClient);
}, [queryClient]);
```

**Option C: Update AuthProvider sign-out**

```typescript
// src/contexts/AuthProvider.tsx
import { clearQueryCache } from '@/utils/cacheManager';

const signOut = useCallback(async () => {
  // Clear React Query cache
  clearQueryCache();

  // ... existing sign-out logic
}, []);
```

#### Part B: Add userId to Query Keys (Cache Isolation)

**Current Problem:** Query keys are global (no userId), so even with cache clearing, there's a race condition window.

**Current keys (src/config/queryKeys.ts):**
```typescript
// CURRENT - Global keys, no user isolation
export const queryKeys = {
  masterRoster: ['masterRoster'],
  savedGames: ['savedGames'],
  seasons: ['seasons'],
  tournaments: ['tournaments'],
  teams: ['teams'],
  personnel: ['personnel'],
  // ... all global
};
```

**Required update:**
```typescript
// UPDATED - User-scoped keys
export const queryKeys = {
  masterRoster: (userId: string) => ['masterRoster', userId],
  savedGames: (userId: string) => ['savedGames', userId],
  seasons: (userId: string) => ['seasons', userId],
  tournaments: (userId: string) => ['tournaments', userId],
  teams: (userId: string) => ['teams', userId],
  personnel: (userId: string) => ['personnel', userId],
  settings: {
    detail: (userId: string) => ['settings', 'detail', userId],
  },
  warmupPlan: (userId: string) => ['warmupPlan', userId],
  // ... all user-scoped
};
```

**Why Both Fixes Are Needed:**
1. **Cache clearing** handles the happy path (User A signs out, cache cleared, User B signs in fresh)
2. **User-scoped keys** handles edge cases:
   - Race conditions during sign-out
   - Multiple browser tabs with different users
   - Background refetch completing after sign-out started

**Files Affected by Cache Key Changes:**
- `src/config/queryKeys.ts` - Update all ~15 key definitions
- All hooks using `useQuery` - Pass userId to queryKey functions
- All components calling `queryClient.invalidateQueries()` - Pass userId

---

### 10.4 Storage Key Scoping - Global vs User-Scoped Analysis

**Current Plan:** 4 keys marked as "global" without justification.

**Analysis and Recommendations:**

| Key | Current | Recommendation | Rationale |
|-----|---------|----------------|-----------|
| `APP_DATA_VERSION_KEY` | Global | **USER-SCOPED** | Each user's data has its own migration version. If User A upgrades to v3, User B's v2 data shouldn't skip migration. |
| `PREMIUM_LICENSE_KEY` | Global | **USER-SCOPED** | Each user has their own subscription. If global, User B could read User A's premium license. |
| `INSTALL_PROMPT_DISMISSED_KEY` | Global | **GLOBAL (OK)** | Device-level UI preference. All users on device share PWA install decision. Acceptable. |
| `HAS_SEEN_FIRST_GAME_GUIDE_KEY` | Global | **USER-SCOPED** | Each user should see their own onboarding. User B shouldn't skip guide because User A saw it. |

**Updated Storage Key Table (Section 9.1):**

| Key | Scope | Rationale |
|-----|-------|-----------|
| 12 data keys | User-scoped | User data isolation |
| `APP_DATA_VERSION_KEY` | **User-scoped** | Per-user migration tracking |
| `PREMIUM_LICENSE_KEY` | **User-scoped** | Per-user subscription status |
| `INSTALL_PROMPT_DISMISSED_KEY` | Global | Device-level UI preference |
| `HAS_SEEN_FIRST_GAME_GUIDE_KEY` | **User-scoped** | Per-user onboarding state |

**Result:** 15 user-scoped keys, 1 global key (was 12 user-scoped, 4 global).

---

### 10.5 Consolidate extractTimestampFromId() Implementations

**Current State:** 3 separate implementations exist:

| Location | Implementation |
|----------|----------------|
| `src/utils/idGenerator.ts` (lines 85-88) | `parts[1]` - legacy only |
| `src/utils/savedGames.ts` (lines 203-214) | `parts[1]` - legacy only |
| `src/services/migrationService.ts` (line 847) | Regex `/^game_(\d+)_/` - legacy only |

**Problem:** All assume legacy format. None will work with user-prefixed IDs.

**Required Fix:**

1. **Update `extractTimestampFromId()` in idGenerator.ts** (as per Section 2.2)
2. **Delete duplicate in savedGames.ts** - use imported utility
3. **Update migrationService.ts regex** - use utility instead of regex

```typescript
// src/services/migrationService.ts - REPLACE regex approach
// BEFORE:
const deriveGameDateFromId = (gameId: string): string | null => {
  const match = /^game_(\d+)_/.exec(gameId);
  if (!match) return null;
  const timestamp = Number(match[1]);
  // ...
};

// AFTER:
import { extractTimestampFromId } from '@/utils/idGenerator';

const deriveGameDateFromId = (gameId: string): string | null => {
  const timestamp = extractTimestampFromId(gameId);
  if (timestamp === 0) return null;
  // ...
};
```

---

### 10.6 Update generatePlayerId() and generatePlayerIds()

**Current State:** Plan only updates `generateId()`. Two other functions exist:

```typescript
// src/utils/idGenerator.ts (lines 49-71)
export function generatePlayerId(index: number = 0): string {
  const timestamp = Date.now();
  const randomPart = generateRandomPart();
  return `player_${timestamp}_${randomPart}_${index}`;  // NO userId!
}

export function generatePlayerIds(count: number): string[] {
  // Same issue - no userId parameter
}
```

**Problem:** These functions generate IDs without user prefix.

**Required Fix:**

```typescript
/**
 * Generates a unique player ID with user prefix.
 * Format: {userPrefix}_player_{timestamp}_{random}_{index}
 */
export function generatePlayerId(userId: string, index: number = 0): string {
  if (!userId) {
    throw new Error('userId is required for player ID generation');
  }
  const timestamp = Date.now();
  const randomPart = generateRandomPart();
  const userPrefix = userId.replace(/-/g, '').slice(0, 12);
  return `${userPrefix}_player_${timestamp}_${randomPart}_${index}`;
}

/**
 * Generates multiple unique player IDs with user prefix.
 */
export function generatePlayerIds(userId: string, count: number): string[] {
  if (!userId) {
    throw new Error('userId is required for player ID generation');
  }
  const timestamp = Date.now();
  const userPrefix = userId.replace(/-/g, '').slice(0, 12);
  return Array.from({ length: count }, (_, index) => {
    const randomPart = generateRandomPart();
    return `${userPrefix}_player_${timestamp}_${randomPart}_${index}`;
  });
}
```

**Files using these functions (need signature updates):**
- Search for `generatePlayerId` and `generatePlayerIds` usage
- Update call sites to pass userId

---

### 10.7 Inline ID Generation - Ephemeral vs Persisted

**Finding:** Only 8 of 10 files actually need user-scoping. 2 are ephemeral:

| File | Pattern | Persisted? | Action |
|------|---------|-----------|--------|
| `src/hooks/useRoster.ts` | `temp-${Date.now()}` | ❌ Optimistic only | **SKIP** - temp ID replaced before save |
| `src/contexts/ToastProvider.tsx` | `toast-${Date.now()}-...` | ❌ UI only | **SKIP** - never persisted |
| Other 8 files | Various | ✅ Yes | **REFACTOR** - need user prefix |

**Updated PR #1 scope:** Refactor 8 files (not 10).

---

### 10.8 Export/Import Critical Gaps

**Missing implementations for PR #3:**

| Gap | Description | Required Implementation |
|-----|-------------|------------------------|
| **ID Regeneration** | `stripUserPrefix()`, `addUserPrefix()` don't exist | Implement in `idGenerator.ts` |
| **Reference Remapping** | Only player IDs in games are remapped | Implement for ALL 8 entity types (see Section 3.5 matrix) |
| **Merge Mode** | Code always clears before import | Implement true merge that preserves existing data |
| **Rollback** | Failed import corrupts data | Implement pre-validation OR backup-restore pattern |
| **WarmupPlan sections[].id** | Nested IDs not handled | Add to reference update matrix |

---

### 10.9 Test Infrastructure Updates

**Finding:** Tests are well-centralized but need updates:

| Update | Location | Effort |
|--------|----------|--------|
| Create `TEST_USER_ID` constant | `tests/fixtures/constants.ts` (new) | 30min |
| Add `TestIdGenerator.reset()` to afterEach | `src/setupTests.mjs` | 1hr |
| Update mock DataStore to use TestIdGenerator | `tests/fixtures/mockDataStore.ts` | 2hrs |
| Replace hardcoded user IDs | 6 test files | 2hrs |

**Revised test estimate:** 120-180 tests affected (not 200-250).

### 10.10 Legal Document Updates (Security Disclosure)

**Required:** Update legal documents to disclose local storage security characteristics and personnel PII handling.

#### Privacy Policy Updates

Add to `docs/07-business/store-listing/privacy-policy.md`:

**1. Update "Data We May Collect" section - add Personnel data:**

```markdown
### Personnel Data (Cloud Mode)
When you add team personnel (coaches, assistants, medical staff), we store:
- Name
- Role
- Email address (optional)
- Phone number (optional)
- Certifications (optional)

This data is stored:
- **Local mode**: On your device only
- **Cloud mode**: In our secure database, accessible only to you
```

**2. Add new "Data Security Disclosure" section:**

```markdown
## Data Security

### Local Storage Security
In local mode, your data is stored in your browser's IndexedDB database. This data:
- Is protected by your device's access controls (screen lock, password)
- Is NOT encrypted at rest beyond what your device provides
- Could theoretically be accessed by someone with physical access to your unlocked device

This is industry standard for local-first applications and is appropriate for non-sensitive coaching data. If you store personnel contact information (email, phone numbers), please be aware this data follows the same security model.

### Cloud Storage Security
In cloud mode, your data is:
- Encrypted in transit (HTTPS/TLS)
- Stored in secure EU-based servers
- Protected by row-level security (only you can access your data)
- Backed by Supabase's security infrastructure

### Backup File Security
When you export your data, the backup file:
- Contains all your data including personnel contact information
- Is NOT encrypted
- Should be stored securely and not shared

We recommend storing backup files in a secure location.
```

#### Terms of Service Updates

Add to `docs/07-business/store-listing/terms-of-service.md`:

**1. Add to "Data and Privacy" section:**

```markdown
### Data Security Acknowledgment
By using MatchOps, you acknowledge that:
- Local mode data is stored in your browser's IndexedDB without additional encryption
- Device access controls (screen lock, password) are your primary protection for local data
- Backup files contain unencrypted data and should be stored securely
- You are responsible for protecting access to your device and backup files
```

#### Implementation Checklist

- [ ] Update `docs/07-business/store-listing/privacy-policy.md`
- [ ] Update `docs/07-business/store-listing/terms-of-service.md`
- [ ] Update `site/pages/docs/07-business/store-listing/privacy-policy.md` (mirror)
- [ ] Update `site/pages/docs/07-business/store-listing/terms-of-service.md` (mirror)
- [ ] Update "Last Updated" dates to reflect changes
- [ ] Ensure hosted versions are updated after deployment

### 10.11 CRITICAL: Existing User Data Migration (Data Loss Prevention)

**Problem:** Existing users have data stored in GLOBAL keys (e.g., `soccerMasterRoster`). After this update, the app will look for PREFIXED keys (e.g., `abc123def456_soccerMasterRoster`). Without migration, existing users will see an EMPTY APP and lose all their data.

**Scope:** Any user who has used the app before this update goes live.

#### Key Insight: Reuse Import Logic

**Legacy data in global keys has the SAME format as exported backup files:**
- Global key IDs: `player_1703123456789_abc123` (no user prefix)
- Exported backup IDs: `player_1703123456789_abc123` (no user prefix - export strips them)

**Therefore, legacy migration = read global keys → package as BackupData → call `importBackup()`**

This reuses ALL the ID regeneration, reference remapping, and validation logic from PR #3!

#### Migration Flow

```typescript
// src/utils/legacyDataMigration.ts (NEW FILE)

import { importBackup, BackupData } from './backup';

const LEGACY_MIGRATION_FLAG = 'legacyDataMigrationComplete';

/**
 * Check if user has legacy (unprefixed) data that needs migration.
 * Called on first sign-in after update.
 */
export async function checkForLegacyData(): Promise<LegacyDataCheck> {
  const globalKeys = [
    MASTER_ROSTER_KEY, SAVED_GAMES_KEY, SEASONS_LIST_KEY,
    TOURNAMENTS_LIST_KEY, PERSONNEL_KEY, TEAMS_INDEX_KEY,
    TEAM_ROSTERS_KEY, APP_SETTINGS_KEY, PLAYER_ADJUSTMENTS_KEY,
    WARMUP_PLAN_KEY,
  ];

  const counts: Record<string, number> = {};
  let hasAnyData = false;

  for (const key of globalKeys) {
    const data = await getStorageItem(key);
    if (data) {
      const parsed = JSON.parse(data);
      const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      if (count > 0) {
        counts[key] = count;
        hasAnyData = true;
      }
    }
  }

  return { hasLegacyData: hasAnyData, counts };
}

/**
 * Read legacy data from global keys and package as BackupData.
 * IDs are ALREADY in portable format (no user prefix).
 *
 * ⚠️ IMPORTANT: This reads RAW IndexedDB storage, not via DataStore API.
 * Storage format differs from DataStore API return types:
 * - Storage: Objects keyed by ID (e.g., {personnelId: Personnel})
 * - API: Often returns arrays (e.g., getAllPersonnel() returns Personnel[])
 * We must convert objects to arrays to match BackupData format.
 *
 * STORAGE FORMAT REFERENCE (from LocalDataStore):
 * - players: Player[] (array)
 * - games: {gameId: AppState} (object keyed by gameId)
 * - seasons: Season[] (array)
 * - tournaments: Tournament[] (array)
 * - personnel: {personnelId: Personnel} (object keyed by personnelId)
 * - teams: {teamId: Team} (object keyed by teamId)
 * - teamRosters: {teamId: TeamRosterEntry[]} (object keyed by teamId)
 * - settings: AppSettings (single object)
 * - adjustments: {playerId: PlayerStatAdjustment[]} (object keyed by playerId, value is array)
 * - warmupPlan: WarmupPlan | null (single object or null)
 */
async function readLegacyDataAsBackup(): Promise<BackupData> {
  // Read from global keys (same format as exported backups!)
  const players = JSON.parse(await getStorageItem(MASTER_ROSTER_KEY) || '[]');
  const games = JSON.parse(await getStorageItem(SAVED_GAMES_KEY) || '{}');
  const seasons = JSON.parse(await getStorageItem(SEASONS_LIST_KEY) || '[]');
  const tournaments = JSON.parse(await getStorageItem(TOURNAMENTS_LIST_KEY) || '[]');
  const personnel = JSON.parse(await getStorageItem(PERSONNEL_KEY) || '{}');
  const teams = JSON.parse(await getStorageItem(TEAMS_INDEX_KEY) || '{}');
  const teamRosters = JSON.parse(await getStorageItem(TEAM_ROSTERS_KEY) || '{}');
  const settings = JSON.parse(await getStorageItem(APP_SETTINGS_KEY) || '{}');
  const adjustments = JSON.parse(await getStorageItem(PLAYER_ADJUSTMENTS_KEY) || '{}');
  const warmupPlan = JSON.parse(await getStorageItem(WARMUP_PLAN_KEY) || 'null');

  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    players,                                      // Already an array
    games: Object.values(games),                  // Convert {gameId: game} to array
    seasons,                                      // Already an array
    tournaments,                                  // Already an array
    personnel: Object.values(personnel),          // Convert {personnelId: person} to array
    teams: Object.values(teams),                  // Convert {teamId: team} to array
    teamRosters,                                  // Keep as {teamId: entries[]} (matches backup format)
    settings,                                     // Single object
    // Flatten: {playerId: [adj1, adj2]} → [adj1, adj2, adj3, ...]
    playerAdjustments: Object.values(adjustments).flat(),
    warmupPlan,                                   // Single object or null
  };
}

/**
 * Migrate legacy data to user-scoped keys.
 * REUSES importBackup() for all ID regeneration and reference updates!
 */
export async function migrateLegacyDataToUser(userId: string): Promise<MigrationResult> {
  // 1. Check if already migrated (per-user flag)
  const migrationFlag = getScopedKey(LEGACY_MIGRATION_FLAG, userId);
  const alreadyMigrated = await getStorageItem(migrationFlag);
  if (alreadyMigrated === 'true') {
    return { status: 'already_migrated', migrated: {} };
  }

  // 2. Check for legacy data in global keys
  const legacyCheck = await checkForLegacyData();
  if (!legacyCheck.hasLegacyData) {
    await setStorageItem(migrationFlag, 'true');
    return { status: 'no_legacy_data', migrated: {} };
  }

  // 3. Package legacy data as BackupData (same format as exports!)
  const backupData = await readLegacyDataAsBackup();

  // 4. REUSE importBackup() - handles ALL:
  //    - ID regeneration with user prefix
  //    - Reference remapping (teamPlacements, gameEvents, etc.)
  //    - Atomic import (temp namespace → validate → swap)
  //    - Reference validation
  const result = await importBackup(userId, backupData, 'replace');

  if (!result.success) {
    return { status: 'failed', error: result.error, migrated: {} };
  }

  // 5. Mark migration complete for this user
  await setStorageItem(migrationFlag, 'true');

  // 6. DO NOT delete global keys yet - keep as backup until user confirms
  return { status: 'migrated', migrated: result.imported };
}

/**
 * After user confirms migration worked, clean up global keys.
 */
export async function confirmLegacyMigration(): Promise<void> {
  const globalKeys = [
    MASTER_ROSTER_KEY, SAVED_GAMES_KEY, SEASONS_LIST_KEY,
    TOURNAMENTS_LIST_KEY, PERSONNEL_KEY, TEAMS_INDEX_KEY,
    TEAM_ROSTERS_KEY, APP_SETTINGS_KEY, PLAYER_ADJUSTMENTS_KEY,
    WARMUP_PLAN_KEY,
  ];

  for (const key of globalKeys) {
    await removeStorageItem(key);
  }
}
```

#### Why This Works

| Scenario | ID Format | Handler |
|----------|-----------|---------|
| **New user** | N/A (no data) | Normal flow, IDs generated with prefix |
| **Existing user (legacy)** | `player_1703...` (no prefix) | `readLegacyDataAsBackup()` → `importBackup()` |
| **Backup file import** | `player_1703...` (no prefix) | `importBackup()` directly |

All three scenarios use the SAME `importBackup()` logic for ID regeneration!

#### UI Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FIRST SIGN-IN AFTER UPDATE                        │
│                                                                      │
│  1. User signs in → get userId                                       │
│                                                                      │
│  2. Check for legacy data in global keys                             │
│     └─ If NO legacy data → proceed normally                          │
│     └─ If HAS legacy data → show migration prompt                    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  "We found existing data from before this update:"          │    │
│  │                                                              │    │
│  │    • 15 players                                              │    │
│  │    • 23 games                                                │    │
│  │    • 2 seasons                                               │    │
│  │    • 1 tournament                                            │    │
│  │                                                              │    │
│  │  This data will be linked to your account.                   │    │
│  │                                                              │    │
│  │  [Keep My Data]              [Start Fresh]                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  3. If "Keep My Data":                                               │
│     a. Call migrateLegacyDataToUser(userId)                          │
│        (internally uses importBackup() for all the heavy lifting)    │
│     b. Show success: "Migration complete! All data preserved."       │
│     c. Ask: "Delete old backup copy?" → confirmLegacyMigration()     │
│                                                                      │
│  4. If "Start Fresh":                                                │
│     a. Mark migration flag as done (skip future prompts)             │
│     b. User starts with empty data                                   │
│     c. Global data remains (another user could claim it later)       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Two users on shared device, both want legacy data** | First user to sign in and choose "Keep" gets the data. Second user sees "Start Fresh" only (global keys cleared). |
| **Migration fails mid-process** | `importBackup()` uses atomic import (temp namespace) - global data remains intact. |
| **Migration fails due to quota** | Pre-import quota check in `importBackup()` catches this. Global data intact. |
| **User signed in before, data already scoped** | Migration flag check skips - no duplicate migration. |
| **Corrupted legacy data** | `importBackup()` validation catches this, reports errors. |
| **User with old backup file** | Same flow - `importBackup()` handles both legacy migration AND file imports identically. |

#### Implementation Checklist

- [ ] Create `src/utils/legacyDataMigration.ts`
- [ ] Add `checkForLegacyData()` function
- [ ] Add `readLegacyDataAsBackup()` function (packages global data as BackupData)
- [ ] Add `migrateLegacyDataToUser()` function (calls `importBackup()`)
- [ ] Add `confirmLegacyMigration()` function
- [ ] Create `LegacyMigrationModal.tsx` component
- [ ] Integrate into AuthProvider sign-in flow
- [ ] Add tests for migration scenarios
- [ ] Test: legacy migration uses SAME code path as backup file import

### 10.12 CRITICAL: Atomic Import for Replace Mode (Data Loss Prevention)

**Problem:** Current import replace mode deletes all data BEFORE importing. If import fails after deletion, data is permanently lost.

**Solution:** Import to temporary namespace, validate, then atomic swap.

#### Updated Import Implementation

```typescript
// src/utils/backup.ts - UPDATED importBackup()

export async function importBackup(
  userId: string,
  backup: BackupData,
  mode: 'merge' | 'replace'
): Promise<ImportResult> {
  // Validate backup format first (before any data changes)
  const validation = validateBackupFormat(backup);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Build ID mapping (old portable ID → new user-prefixed ID)
  const idMap = new Map<string, string>();
  const migrated = regenerateAllIds(backup, userId, idMap);

  if (mode === 'replace') {
    // ========== ATOMIC REPLACE MODE ==========

    // Step 1: Import to TEMPORARY namespace
    const tempUserId = `${userId}_import_${Date.now()}`;

    try {
      // Import all entities to temp namespace
      const tempStore = new LocalDataStore(tempUserId);
      await importAllEntities(tempStore, migrated);

      // Step 2: Validate import succeeded
      const importValidation = await validateImportedData(tempUserId, migrated);
      if (!importValidation.valid) {
        // Clean up temp data and abort
        await clearUserData(tempUserId);
        return {
          success: false,
          error: `Import validation failed: ${importValidation.errors.join(', ')}`
        };
      }

      // Step 3: Atomic swap - only now do we touch real data
      // 3a. Backup current data (optional, for recovery)
      const backupKey = `${userId}_pre_import_backup_${Date.now()}`;
      await createQuickBackup(userId, backupKey);

      // 3b. Clear real user data
      await clearUserData(userId);

      // 3c. Move temp data to real namespace
      await moveNamespace(tempUserId, userId);

      // 3d. Clean up backup after successful move (or keep for X days)
      // await clearUserData(backupKey); // Optional: keep for recovery

    } catch (error) {
      // Clean up temp namespace on any error
      // IMPORTANT: Use stored tempUserId, NOT a new Date.now() call!
      await clearUserData(tempUserId).catch(() => {});
      throw error;
    }

  } else {
    // ========== MERGE MODE ==========
    // Add to existing data (no deletion risk)
    const store = new LocalDataStore(userId);
    await importAllEntities(store, migrated);
  }

  return {
    success: true,
    imported: {
      players: migrated.players.length,
      teams: migrated.teams.length,
      games: migrated.games.length,
      seasons: migrated.seasons.length,
      tournaments: migrated.tournaments.length,
      personnel: migrated.personnel.length,
    }
  };
}

/**
 * Move all data from one namespace to another.
 * Used for atomic swap after validated import.
 */
async function moveNamespace(fromUserId: string, toUserId: string): Promise<void> {
  const keys = [
    MASTER_ROSTER_KEY,
    SAVED_GAMES_KEY,
    SEASONS_LIST_KEY,
    TOURNAMENTS_LIST_KEY,
    PERSONNEL_KEY,
    TEAMS_INDEX_KEY,
    TEAM_ROSTERS_KEY,
    APP_SETTINGS_KEY,
    PLAYER_ADJUSTMENTS_KEY,
    WARMUP_PLAN_KEY,
    TIMER_STATE_KEY,
  ];

  for (const baseKey of keys) {
    const fromKey = getScopedKey(baseKey, fromUserId);
    const toKey = getScopedKey(baseKey, toUserId);

    const data = await getStorageItem(fromKey);
    if (data) {
      await setStorageItem(toKey, data);
      await removeStorageItem(fromKey);
    }
  }
}

/**
 * Validate that imported data is complete and references resolve.
 */
async function validateImportedData(
  userId: string,
  expected: BackupData
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const store = new LocalDataStore(userId);

  // Check counts match
  const players = await store.getPlayers();
  if (players.length !== expected.players.length) {
    errors.push(`Player count mismatch: expected ${expected.players.length}, got ${players.length}`);
  }

  // Check all references resolve (see Section 10.13)
  const refValidation = await validateAllReferences(userId);
  errors.push(...refValidation.errors);

  return { valid: errors.length === 0, errors };
}
```

#### Implementation Checklist

- [ ] Update `importBackup()` with atomic replace mode
- [ ] Add `moveNamespace()` utility
- [ ] Add `validateImportedData()` validation
- [ ] Add `createQuickBackup()` for pre-import safety
- [ ] Add tests for import failure scenarios
- [ ] Test: import fails mid-process → original data intact

### 10.13 Reference Validation After Import

**Problem:** If any ID reference is missed during import remapping, data becomes silently corrupted (e.g., game references non-existent team).

**Solution:** Post-import validation that checks ALL references resolve.

```typescript
// src/utils/referenceValidator.ts (NEW FILE)

/**
 * Validate all ID references in user's data resolve to existing entities.
 * Call after import or migration to ensure data integrity.
 */
export async function validateAllReferences(userId: string): Promise<ReferenceValidation> {
  const store = new LocalDataStore(userId);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Load all entities for reference checking
  const players = await store.getPlayers();
  const playerIds = new Set(players.map(p => p.id));

  const teams = await store.getTeams(true);
  const teamIds = new Set(teams.map(t => t.id));

  const seasons = await store.getSeasons(true);
  const seasonIds = new Set(seasons.map(s => s.id));

  const tournaments = await store.getTournaments(true);
  const tournamentIds = new Set(tournaments.map(t => t.id));
  const seriesIds = new Set(tournaments.flatMap(t => t.series?.map(s => s.id) ?? []));

  const personnel = await store.getAllPersonnel();
  const personnelIds = new Set(personnel.map(p => p.id));

  // getGames() returns {gameId: AppState}, not an array
  const games = await store.getGames();

  // Validate each game's references
  for (const [gameId, game] of Object.entries(games)) {
    // Team reference
    if (game.teamId && !teamIds.has(game.teamId)) {
      errors.push(`Game ${gameId}: teamId "${game.teamId}" not found`);
    }

    // Season reference
    if (game.seasonId && game.seasonId !== '' && !seasonIds.has(game.seasonId)) {
      errors.push(`Game ${gameId}: seasonId "${game.seasonId}" not found`);
    }

    // Tournament reference
    if (game.tournamentId && game.tournamentId !== '' && !tournamentIds.has(game.tournamentId)) {
      errors.push(`Game ${gameId}: tournamentId "${game.tournamentId}" not found`);
    }

    // Tournament series reference
    if (game.tournamentSeriesId && game.tournamentSeriesId !== '' && !seriesIds.has(game.tournamentSeriesId)) {
      errors.push(`Game ${gameId}: tournamentSeriesId "${game.tournamentSeriesId}" not found`);
    }

    // Player references in playersOnField
    for (const player of game.playersOnField) {
      if (!playerIds.has(player.id)) {
        errors.push(`Game ${gameId}: playersOnField contains unknown player "${player.id}"`);
      }
    }

    // Player references in selectedPlayerIds
    for (const playerId of game.selectedPlayerIds) {
      if (!playerIds.has(playerId)) {
        errors.push(`Game ${gameId}: selectedPlayerIds contains unknown player "${playerId}"`);
      }
    }

    // Player references in availablePlayers
    for (const player of game.availablePlayers) {
      if (!playerIds.has(player.id)) {
        errors.push(`Game ${gameId}: availablePlayers contains unknown player "${player.id}"`);
      }
    }

    // Player references in gameEvents
    for (const event of game.gameEvents) {
      if (event.scorerId && !playerIds.has(event.scorerId)) {
        errors.push(`Game ${gameId}: event scorerId "${event.scorerId}" not found`);
      }
      if (event.assisterId && !playerIds.has(event.assisterId)) {
        errors.push(`Game ${gameId}: event assisterId "${event.assisterId}" not found`);
      }
      if (event.entityId && event.type === 'fairPlayCard' && !playerIds.has(event.entityId)) {
        errors.push(`Game ${gameId}: fairPlayCard entityId "${event.entityId}" not found`);
      }
    }

    // Personnel references in gamePersonnel
    if (game.gamePersonnel) {
      for (const personnelId of game.gamePersonnel) {
        if (!personnelIds.has(personnelId)) {
          warnings.push(`Game ${gameId}: gamePersonnel contains unknown personnel "${personnelId}"`);
        }
      }
    }

    // Player references in assessments (object keys)
    if (game.assessments) {
      for (const playerId of Object.keys(game.assessments)) {
        if (!playerIds.has(playerId)) {
          errors.push(`Game ${gameId}: assessments contains unknown player "${playerId}"`);
        }
      }
    }
  }

  // Validate team references
  for (const team of teams) {
    if (team.boundSeasonId && !seasonIds.has(team.boundSeasonId)) {
      warnings.push(`Team ${team.id}: boundSeasonId "${team.boundSeasonId}" not found`);
    }
    if (team.boundTournamentId && !tournamentIds.has(team.boundTournamentId)) {
      warnings.push(`Team ${team.id}: boundTournamentId "${team.boundTournamentId}" not found`);
    }
    if (team.boundTournamentSeriesId && !seriesIds.has(team.boundTournamentSeriesId)) {
      warnings.push(`Team ${team.id}: boundTournamentSeriesId "${team.boundTournamentSeriesId}" not found`);
    }
  }

  // Validate tournament awardedPlayerId
  for (const tournament of tournaments) {
    if (tournament.awardedPlayerId && !playerIds.has(tournament.awardedPlayerId)) {
      warnings.push(`Tournament ${tournament.id}: awardedPlayerId "${tournament.awardedPlayerId}" not found`);
    }

    // Validate teamPlacements keys
    if (tournament.teamPlacements) {
      for (const teamId of Object.keys(tournament.teamPlacements)) {
        if (!teamIds.has(teamId)) {
          warnings.push(`Tournament ${tournament.id}: teamPlacements contains unknown team "${teamId}"`);
        }
      }
    }
  }

  // Validate season teamPlacements
  for (const season of seasons) {
    if (season.teamPlacements) {
      for (const teamId of Object.keys(season.teamPlacements)) {
        if (!teamIds.has(teamId)) {
          warnings.push(`Season ${season.id}: teamPlacements contains unknown team "${teamId}"`);
        }
      }
    }
  }

  // Validate team rosters (player references)
  const teamRosters = await store.getAllTeamRosters();
  for (const [teamId, entries] of Object.entries(teamRosters)) {
    // Validate teamId exists
    if (!teamIds.has(teamId)) {
      warnings.push(`Team roster: teamId "${teamId}" not found`);
    }
    // Validate each player reference
    for (const entry of entries) {
      if (!playerIds.has(entry.playerId)) {
        errors.push(`Team roster ${teamId}: playerId "${entry.playerId}" not found`);
      }
    }
  }

  // Validate player adjustments
  // NOTE: getAllPlayerAdjustments() returns Map<playerId, PlayerStatAdjustment[]>
  const adjustmentsMap = await store.getAllPlayerAdjustments();
  for (const [playerId, adjArray] of adjustmentsMap) {
    // Validate playerId exists (the key itself)
    if (!playerIds.has(playerId)) {
      errors.push(`Adjustments for player "${playerId}": playerId not found`);
    }
    // Validate each adjustment's references
    for (const adj of adjArray) {
      if (adj.seasonId && !seasonIds.has(adj.seasonId)) {
        warnings.push(`Adjustment ${adj.id}: seasonId "${adj.seasonId}" not found`);
      }
      if (adj.teamId && !teamIds.has(adj.teamId)) {
        warnings.push(`Adjustment ${adj.id}: teamId "${adj.teamId}" not found`);
      }
      if (adj.tournamentId && !tournamentIds.has(adj.tournamentId)) {
        warnings.push(`Adjustment ${adj.id}: tournamentId "${adj.tournamentId}" not found`);
      }
    }
  }

  // Validate settings currentGameId
  const settings = await store.getSettings();
  if (settings.currentGameId && !games[settings.currentGameId]) {
    warnings.push(`Settings: currentGameId "${settings.currentGameId}" not found`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalReferencesChecked: errors.length + warnings.length,
      errorCount: errors.length,
      warningCount: warnings.length,
    }
  };
}
```

#### Implementation Checklist

- [ ] Create `src/utils/referenceValidator.ts`
- [ ] Call `validateAllReferences()` after import
- [ ] Call `validateAllReferences()` after legacy migration
- [ ] Add UI to show validation warnings (non-blocking)
- [ ] Add tests for each reference type (including team rosters)
- [ ] Test: import with missing references → validation catches it
- [ ] Test: team roster with missing player → validation catches it

### 10.14 Block Sign-In Until Cache Clear (Race Condition Fix)

**Problem:** Section 10.3 mitigates React Query cache leakage but race conditions can still occur if User B signs in before cache is fully cleared.

**Solution:** Make sign-out and sign-in synchronous with respect to cache state.

```typescript
// src/contexts/AuthProvider.tsx - UPDATED

const [isCacheClearing, setIsCacheClearing] = useState(false);

const signOut = useCallback(async () => {
  setIsCacheClearing(true);

  try {
    // 1. Check for unsynced changes
    if (syncEnabled) {
      const status = await getSyncEngine().getStatus();
      if (status.pendingCount > 0) {
        setShowUnsyncedWarning(true);
        setIsCacheClearing(false);
        return;
      }
    }

    // 2. Clear React Query cache FIRST (synchronous)
    queryClient.clear();

    // 3. Wait for any in-flight queries to settle
    await queryClient.cancelQueries();

    // 4. Verify cache is empty
    const cacheState = queryClient.getQueryCache().getAll();
    if (cacheState.length > 0) {
      console.warn('Cache not fully cleared, forcing removal');
      queryClient.getQueryCache().clear();
    }

    // 5. Reset DataStore
    resetDataStore();

    // 6. Sign out from Supabase
    await authService.signOut();

    // 7. Clear user state
    setUser(null);

  } finally {
    setIsCacheClearing(false);
  }
}, [syncEnabled, queryClient]);

// Block sign-in while cache is clearing
const signIn = useCallback(async (email: string, password: string) => {
  // Wait for any pending sign-out to complete
  if (isCacheClearing) {
    throw new Error('Please wait for sign-out to complete');
  }

  // ... rest of sign-in logic
}, [isCacheClearing]);
```

#### Edge Case: Cache Clear Failure

**Problem:** What if `queryClient.clear()` or `queryClient.cancelQueries()` fails?

**Solution:** Retry with exponential backoff, then fail safe (block sign-in until resolved).

```typescript
// In signOut, wrap cache clearing with retry logic:
const clearCacheWithRetry = async (maxRetries = 3): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      queryClient.clear();
      await queryClient.cancelQueries();

      // Verify cleared
      const remaining = queryClient.getQueryCache().getAll();
      if (remaining.length === 0) return true;

      // Force clear remaining
      queryClient.getQueryCache().clear();
      return true;
    } catch (error) {
      console.error(`Cache clear attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 100 * attempt)); // Backoff
      }
    }
  }
  return false; // All retries failed
};

// In signOut:
const cacheCleared = await clearCacheWithRetry();
if (!cacheCleared) {
  // FAIL SAFE: Don't proceed with sign-out if cache couldn't be cleared
  // This prevents data leakage to next user
  setSignOutError('Unable to clear cached data. Please refresh the page and try again.');
  setIsCacheClearing(false);
  return;
}
```

#### Implementation Checklist

- [ ] Add `isCacheClearing` state to AuthProvider
- [ ] Update `signOut` to be fully synchronous with cache
- [ ] Add cache verification after clear
- [ ] **Add retry logic for cache clear failures**
- [ ] **Fail safe: block sign-out completion if cache can't be cleared**
- [ ] Block `signIn` while `isCacheClearing` is true
- [ ] Add visual indicator during sign-out
- [ ] Add error message for cache clear failure
- [ ] Test: rapid sign-out/sign-in cycles
- [ ] Test: cache clear failure scenario

### 10.15 IndexedDB Quota Pre-Check for Import

**Problem:** Large imports can exceed IndexedDB quota mid-import, causing partial failures.

**Solution:** Estimate required space and check quota before starting import.

```typescript
// src/utils/storageQuota.ts (NEW FILE)

/**
 * Estimate storage size needed for backup data.
 */
export function estimateBackupSize(backup: BackupData): number {
  // JSON stringify gives approximate size in characters (≈ bytes for ASCII)
  const jsonString = JSON.stringify(backup);
  // Add 20% overhead for IndexedDB storage
  return Math.ceil(jsonString.length * 1.2);
}

/**
 * Check if there's enough storage quota for the import.
 */
export async function checkStorageQuota(
  requiredBytes: number
): Promise<QuotaCheckResult> {
  try {
    // Use Storage API if available
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const available = (estimate.quota ?? 0) - (estimate.usage ?? 0);

      return {
        hasSpace: available >= requiredBytes,
        available,
        required: requiredBytes,
        quotaTotal: estimate.quota ?? 0,
        quotaUsed: estimate.usage ?? 0,
      };
    }

    // Fallback: assume we have space (let it fail gracefully)
    return {
      hasSpace: true,
      available: Infinity,
      required: requiredBytes,
      quotaTotal: 0,
      quotaUsed: 0,
    };

  } catch (error) {
    // Storage API not available or failed
    console.warn('Could not check storage quota:', error);
    return {
      hasSpace: true, // Optimistic fallback
      available: Infinity,
      required: requiredBytes,
      quotaTotal: 0,
      quotaUsed: 0,
    };
  }
}

/**
 * Request persistent storage (helps prevent data eviction).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      return await navigator.storage.persist();
    }
    return false;
  } catch {
    return false;
  }
}
```

**Updated import flow:**

```typescript
// In importBackup() - add at the start:

// Check quota before import
const estimatedSize = estimateBackupSize(backup);
const quotaCheck = await checkStorageQuota(estimatedSize);

if (!quotaCheck.hasSpace) {
  const availableMB = Math.round(quotaCheck.available / 1024 / 1024);
  const requiredMB = Math.round(quotaCheck.required / 1024 / 1024);

  return {
    success: false,
    error: `Not enough storage space. Need ${requiredMB}MB but only ${availableMB}MB available. ` +
           `Try deleting old games or clearing browser data.`,
    quotaInfo: quotaCheck,
  };
}
```

#### Implementation Checklist

- [ ] Create `src/utils/storageQuota.ts`
- [ ] Add `estimateBackupSize()` function
- [ ] Add `checkStorageQuota()` function
- [ ] Integrate quota check into `importBackup()`
- [ ] Add user-friendly error message for quota exceeded
- [ ] Test with limited quota (DevTools throttling)

### 10.16 Orphan Data Handling on Remote Account Deletion

**Problem:** If account is deleted on another device, local data becomes orphaned (exists but user can't sign in to access it).

**Solution:** Clear orphan data with user confirmation, or allow data export before clearing.

```typescript
// src/utils/orphanDataHandler.ts (NEW FILE)

/**
 * Handle the case where user's account no longer exists.
 * Called when auth check returns "account not found".
 */
export async function handleOrphanedData(
  lastKnownUserId: string
): Promise<OrphanHandlingResult> {
  // Check if there's local data for this user
  const hasLocalData = await checkUserHasLocalData(lastKnownUserId);

  if (!hasLocalData) {
    return { action: 'none', hadData: false };
  }

  // Return info for UI to show options
  return {
    action: 'prompt_user',
    hadData: true,
    userId: lastKnownUserId,
    options: [
      {
        id: 'export_then_clear',
        label: 'Export Data & Clear',
        description: 'Download your data as a backup file, then clear local storage',
      },
      {
        id: 'clear_only',
        label: 'Clear Data',
        description: 'Delete local data without exporting',
      },
      {
        id: 'keep_readonly',
        label: 'Keep (Read-Only)',
        description: 'Keep data locally but you cannot make changes without signing in',
      },
    ],
  };
}

/**
 * Execute user's choice for handling orphaned data.
 */
export async function executeOrphanDataChoice(
  userId: string,
  choice: 'export_then_clear' | 'clear_only' | 'keep_readonly'
): Promise<void> {
  switch (choice) {
    case 'export_then_clear':
      // Export first
      const backup = await exportBackup(userId);
      downloadBackupFile(backup);
      // Then clear
      await clearUserData(userId);
      break;

    case 'clear_only':
      await clearUserData(userId);
      break;

    case 'keep_readonly':
      // Mark data as read-only (cannot create new entities)
      // User must create new account to continue
      localStorage.setItem(`${userId}_readonly`, 'true');
      break;
  }
}
```

**AuthProvider integration:**

```typescript
// In AuthProvider, when checking auth state:

useEffect(() => {
  const checkAuth = async () => {
    try {
      const session = await authService.getSession();
      if (session) {
        setUser(session.user);
      }
    } catch (error) {
      if (error.code === 'USER_NOT_FOUND' || error.code === 'ACCOUNT_DELETED') {
        // Account no longer exists
        const lastUserId = localStorage.getItem('lastKnownUserId');
        if (lastUserId) {
          const orphanResult = await handleOrphanedData(lastUserId);
          if (orphanResult.action === 'prompt_user') {
            setOrphanDataPrompt(orphanResult);
          }
        }
      }
    }
  };

  checkAuth();
}, []);
```

#### Implementation Checklist

- [ ] Create `src/utils/orphanDataHandler.ts`
- [ ] Add `handleOrphanedData()` function
- [ ] Add `executeOrphanDataChoice()` function
- [ ] Create `OrphanDataModal.tsx` component
- [ ] Store `lastKnownUserId` on successful sign-in
- [ ] Integrate into AuthProvider error handling
- [ ] Test: delete account remotely → check local behavior

---

## Appendix A: File Change Summary

### Legacy Data Migration (PR0) - CRITICAL

| File | Changes |
|------|---------|
| `src/utils/legacyDataMigration.ts` | **NEW** - `checkForLegacyData()`, `migrateLegacyDataToUser()`, `confirmLegacyMigration()` |
| `src/components/LegacyMigrationModal.tsx` | **NEW** - UI for migration prompt ("Keep My Data" / "Start Fresh") |
| `src/contexts/AuthProvider.tsx` | Integrate legacy migration check into sign-in flow |

### Core Infrastructure (PR1)

| File | Changes |
|------|---------|
| `src/config/storageKeys.ts` | `getScopedKey()` requires userId |
| `src/utils/idGenerator.ts` | `generateId()` requires userId, `generatePlayerId()` requires userId, `generatePlayerIds()` requires userId, add strip/add utilities, dual-format `extractTimestampFromId()`, consolidate 3 implementations |
| `src/datastore/LocalDataStore.ts` | Require userId, update ~70 methods to use scoped keys (see Section 9.1) |
| `src/datastore/SyncedDataStore.ts` | Accept and propagate userId |
| `src/datastore/factory.ts` | User-scoped instance management, `resetDataStore()` |
| `src/sync/SyncQueue.ts` | Add userId to operations, add `setCurrentUser()`, add `clearCurrentUser()`, add `getPending()` user filtering, add `clearUserOperations()` |
| `src/sync/types.ts` | Add `userId` field to `SyncOperation` interface |
| `src/sync/SyncEngine.ts` | Accept and propagate userId |
| `src/sync/createSyncExecutor.ts` | Accept userId context |
| `src/utils/savedGames.ts` | Remove duplicate `extractTimestampFromGameId()`, use shared utility |
| `src/services/migrationService.ts` | Replace regex timestamp extraction with shared utility |

### Factory Consumers - Files Calling getDataStore() (PR1)

**Total: ~79 callsites across 12+ files**

All these callsites must be updated to pass `userId` parameter.

| File | Callsite Count | Notes |
|------|----------------|-------|
| `src/utils/teams.ts` | ~14 | getAllTeams, getTeams, getTeamById, createTeam, updateTeam, deleteTeam, etc. |
| `src/utils/savedGames.ts` | ~7 | getSavedGames, saveGame, deleteGame, getLatestGameId, etc. |
| `src/utils/playerAdjustments.ts` | ~4 | getPlayerAdjustments, savePlayerAdjustment, etc. |
| `src/utils/warmupPlan.ts` | ~3 | getWarmupPlan, saveWarmupPlan, deleteWarmupPlan |
| `src/utils/appSettings.ts` | ~3 | getAppSettings, saveAppSettings, updateAppSettings |
| `src/utils/masterRoster.ts` | ~6 | getMasterRoster, createPlayer, updatePlayer, deletePlayer, etc. |
| `src/utils/personnelManager.ts` | ~6 | getPersonnel, addPersonnelMember, updatePersonnelMember, etc. |
| `src/utils/tournaments.ts` | ~8 | getTournaments, createTournament, updateTournament, etc. |
| `src/utils/seasons.ts` | ~8 | getSeasons, createSeason, updateSeason, etc. |
| `src/contexts/AuthProvider.tsx` | ~2 | DataStore initialization, clearUserCaches |
| `src/components/CloudSyncSection.tsx` | ~2 | Sync status, manual sync trigger |
| `src/app/page.tsx` | ~1 | resetFactory on mode change |

**Note:** Each util function (e.g., `getTeams()`) will also need its signature updated to accept `userId`, cascading to all components that call these utils. This is covered in Section 2.3 and 2.5.

### Auth Flow (PR2)

| File | Changes |
|------|---------|
| `src/contexts/AuthProvider.tsx` | Sign-in/sign-out flows, DataStore initialization, **synchronous cache clear**, **block sign-in during cache clear**, orphan data handling |
| `src/app/page.tsx` | Gate app on auth, pass userId to DataStore, remove local mode handlers |
| `src/components/WelcomeScreen.tsx` | Remove "Start without an account" button (lines 126-141) |
| `src/components/WelcomeScreen.test.tsx` | Remove/update "Start without account" tests |
| `src/components/LoginScreen.tsx` | Remove "Or continue without an account" option (lines 409-420) |
| `src/components/SignOutWarningModal.tsx` | Unsynced changes warning (new) |
| `src/components/OrphanDataModal.tsx` | **NEW** - Handle remote account deletion (export/clear/keep options) |
| `src/utils/cacheManager.ts` | React Query cache clear utility (new) |
| `src/utils/orphanDataHandler.ts` | **NEW** - Detect and handle orphaned local data |

### React Query Cache Keys (PR2) - User-Scoped Keys

**Total: 13 query key definitions + all hooks using them**

| File | Changes |
|------|---------|
| `src/config/queryKeys.ts` | Update all 13 key functions to accept userId parameter |

**Hooks needing queryKey updates:**

| Hook File | Query Keys Used |
|-----------|-----------------|
| `src/hooks/useQueryPlayers.ts` | `masterRoster` |
| `src/hooks/useQueryGames.ts` | `savedGames` |
| `src/hooks/useQuerySeasons.ts` | `seasons` |
| `src/hooks/useQueryTournaments.ts` | `tournaments` |
| `src/hooks/useQueryTeams.ts` | `teams` |
| `src/hooks/useQueryPersonnel.ts` | `personnel` |
| `src/hooks/useQuerySettings.ts` | `settings.detail` |
| `src/hooks/useQueryWarmupPlan.ts` | `warmupPlan` |

**Components with direct queryClient usage (invalidateQueries, etc.):**

| Component | Usage |
|-----------|-------|
| `src/app/page.tsx` | Multiple invalidations on data changes |
| `src/components/CloudAuthModal.tsx` | Cache clearing on account deletion |
| Various modals | Invalidations after create/update/delete |

### Export/Import (PR3)

| File | Changes |
|------|---------|
| `src/utils/backup.ts` | Major rewrite: export strips IDs, **ATOMIC import** (temp namespace → validate → swap) |
| `src/utils/fullBackup.ts` | Update to use new ID utilities |
| `src/utils/idMigration.ts` | ID regeneration utilities (new) |
| `src/utils/referenceValidator.ts` | **NEW** - `validateAllReferences()` post-import validation |
| `src/utils/storageQuota.ts` | **NEW** - `checkStorageQuota()`, `estimateBackupSize()` |
| `src/utils/cloudExport.ts` | **NEW** - GDPR cloud data export: `exportCloudData()`, `checkCloudDataExists()` |
| `src/components/ImportDataModal.tsx` | Import UI with merge/replace, quota check, validation results |
| `src/components/ExportDataButton.tsx` | Update for portable export |
| `src/components/CloudDataDownloadSection.tsx` | **NEW** - UI for "Download My Cloud Data" (GDPR compliance) |

### Test Files (~120-180 updates needed, see Section 10.9)

| File | Estimated Changes |
|------|-------------------|
| `src/datastore/__tests__/LocalDataStore.test.ts` | Major - all tests need userId |
| `src/sync/__tests__/SyncQueue.test.ts` | Major - user-scoped database |
| `src/sync/__tests__/SyncEngine.test.ts` | Major - userId propagation |
| `src/utils/__tests__/idGenerator.test.ts` | Major - new format tests |
| Integration tests | Medium - mock userId in all tests |

---

## Appendix B: Comparison with Previous Plan

| Aspect | Previous Plan | This Plan |
|--------|---------------|-----------|
| **Account** | Optional (local mode without account) | Required |
| **Local mode** | Full-featured standalone mode | N/A (account gives local feel) |
| **Legacy migration** | N/A | PR #0 migrates existing users' global data |
| **Sign-out behavior** | Keep local copy option | Data stays in namespace, inaccessible until sign-in |
| **PRs** | 6 (complex) | 4 (focused): PR0-legacy, PR1-infra, PR2-auth, PR3-export |
| **Export/Import** | Complex (mode-aware) | Atomic import with validation |
| **Merge flows** | Multiple scenarios | Just import merge/replace |
| **Data loss prevention** | N/A | Atomic import, legacy migration, reference validation |

---

## Appendix C: Monetization Model

### Tier Breakdown

| Tier | Features | Price |
|------|----------|-------|
| **Free** | Account + all features on ONE device | €0 |
| **Pro** | Everything + Automatic Cloud Sync (multi-device, real-time backup) | €X/month |

### What's Free vs Paid

| Feature | Free | Pro |
|---------|:----:|:---:|
| All app features (games, stats, rosters, etc.) | ✅ | ✅ |
| Local data storage | ✅ | ✅ |
| Export local data (backup file) | ✅ | ✅ |
| Import backup file | ✅ | ✅ |
| **Download cloud data (GDPR right)** | ✅ | ✅ |
| **Automatic real-time sync** | ❌ | ✅ |
| **Multi-device access** | ❌ | ✅ |
| **Automatic cloud backup** | ❌ | ✅ |

### Key Distinction

**What we're selling with Pro subscription:**
- The **CONVENIENCE** of automatic, real-time sync across all devices
- NOT access to the user's own data

**GDPR Compliance (Article 20 - Right to Data Portability):**
- Users can ALWAYS download their cloud data, regardless of subscription
- This is a one-time manual download, not continuous sync
- We cannot lock user data behind a paywall

**Value Proposition of Pro:**
- **Automatic** - changes sync instantly, no manual export/import
- **Seamless** - all devices stay in sync without user action
- **Protected** - cloud copy automatically protects against device loss
- **Convenient** - sign in on any device, data is there

---

## Appendix D: Storage Key Implementation Checklist

Use this matrix to track implementation progress for each storage key. Mark each cell when complete.

### User-Scoped Keys (15 keys)

| Storage Key | Scope Type | getScopedKey | LocalDataStore | Tests | Verified |
|-------------|------------|:------------:|:--------------:|:-----:|:--------:|
| `MASTER_ROSTER_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `SAVED_GAMES_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `SEASONS_LIST_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `TOURNAMENTS_LIST_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `PERSONNEL_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `APP_SETTINGS_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `WARMUP_PLAN_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `PLAYER_ADJUSTMENTS_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `TEAMS_INDEX_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `TEAM_ROSTERS_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `TIMER_STATE_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `LAST_HOME_TEAM_NAME_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `APP_DATA_VERSION_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `PREMIUM_LICENSE_KEY` | User | ☐ | ☐ | ☐ | ☐ |
| `HAS_SEEN_FIRST_GAME_GUIDE_KEY` | User | ☐ | ☐ | ☐ | ☐ |

### Global Key (1 key - no scoping needed)

| Storage Key | Scope Type | Reason | Verified |
|-------------|------------|--------|:--------:|
| `INSTALL_PROMPT_DISMISSED_KEY` | Global | Device-level PWA install UI preference | ☐ |

### Column Definitions

| Column | Description |
|--------|-------------|
| **getScopedKey** | Key added to `getScopedKey()` function or explicitly handled |
| **LocalDataStore** | LocalDataStore methods updated to use scoped key |
| **Tests** | Unit tests verify key is scoped correctly |
| **Verified** | Manual test: User A data NOT visible to User B |

### Entity ID Implementation Checklist

Track ID generation updates for each entity type:

| Entity | generateId | stripUserPrefix | addUserPrefix | Import Remap | Tests | Verified |
|--------|:----------:|:---------------:|:-------------:|:------------:|:-----:|:--------:|
| Player | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Team | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Season | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Tournament | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| TournamentSeries | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Personnel | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Game | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| GameEvent | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| PlayerStatAdjustment | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| WarmupPlan | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| WarmupPlanSection | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### Factory Consumer Checklist

Track updates to files using `getDataStore()`:

| File | Signature Updated | userId Passed | Tests | Verified |
|------|:-----------------:|:-------------:|:-----:|:--------:|
| `src/utils/teams.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/utils/savedGames.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/utils/seasons.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/utils/tournaments.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/utils/masterRoster.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/utils/personnelManager.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/utils/playerAdjustments.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/utils/warmupPlan.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/utils/appSettings.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/utils/timerStateManager.ts` | ☐ | ☐ | ☐ | ☐ |
| `src/contexts/AuthProvider.tsx` | ☐ | ☐ | ☐ | ☐ |
| `src/components/CloudSyncSection.tsx` | ☐ | ☐ | ☐ | ☐ |

### React Query Cache Keys Checklist

Track updates to query keys for user-scoping (from `src/config/queryKeys.ts`):

| Query Key | userId Param Added | Hooks Updated | Invalidations Updated | Verified |
|-----------|:------------------:|:-------------:|:---------------------:|:--------:|
| `masterRoster` | ☐ | ☐ | ☐ | ☐ |
| `savedGames` | ☐ | ☐ | ☐ | ☐ |
| `seasons` | ☐ | ☐ | ☐ | ☐ |
| `tournaments` | ☐ | ☐ | ☐ | ☐ |
| `teams` | ☐ | ☐ | ☐ | ☐ |
| `teamRoster` | ☐ | ☐ | ☐ | ☐ |
| `personnel` | ☐ | ☐ | ☐ | ☐ |
| `personnelDetail` | ☐ | ☐ | ☐ | ☐ |
| `personnelByRole` | ☐ | ☐ | ☐ | ☐ |
| `settings.all` | ☐ | ☐ | ☐ | ☐ |
| `settings.detail` | ☐ | ☐ | ☐ | ☐ |
| `appSettingsCurrentGameId` | ☐ | ☐ | ☐ | ☐ |
| `warmupPlan` | ☐ | ☐ | ☐ | ☐ |

---

*End of Plan Document*
