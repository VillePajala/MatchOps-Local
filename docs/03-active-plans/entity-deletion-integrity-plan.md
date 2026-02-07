# Entity Deletion Integrity Plan

## Problem Statement

When users delete seasons, tournaments, or teams, other entities that reference them are affected:
- Games with `seasonId` pointing to deleted season → **SET NULL** (game loses season link)
- Games with `tournamentId` pointing to deleted tournament → **SET NULL** (game loses tournament link)
- Games with `teamId` pointing to deleted team → **SET NULL** (game loses team link)
- Teams with `boundSeasonId`/`boundTournamentId` pointing to deleted entities → **No FK** (orphan allowed)
- TeamRosters for deleted teams → **CASCADE** (roster deleted with team)
- PlayerAdjustments referencing deleted seasons/tournaments → **SET NULL** (adjustment unlinked)

### Why Block Even Though SET NULL Handles It?

The PostgreSQL schema uses `ON DELETE SET NULL` for games → seasons/tournaments/teams relationships, so deletion technically WORKS without sync failures. However, we still want to **block + encourage archive** because:

1. **Unexpected data loss**: User may not realize games will lose their season/tournament assignment
2. **Better UX**: Archive is reversible; deletion is not
3. **Data organization**: Keeping references intact allows proper filtering/reporting
4. **Consistent behavior**: Same rules for local and cloud modes

**Local behavior:** IndexedDB doesn't enforce referential integrity, so deletions work but create orphaned references.

**Cloud behavior:** PostgreSQL `SET NULL` allows deletion, but the game's `season_id`/`tournament_id` becomes NULL silently.

## Solution: Block Delete + Encourage Archive

Instead of complex cascade delete logic, we:
1. **Check for references** before allowing deletion
2. **Block deletion** if references exist
3. **Offer archive** as the alternative (hides entity but preserves data integrity)
4. **Allow deletion** only when no references exist

### Benefits
- Zero orphaned references ever created
- Simple to implement (~100 lines vs ~700 for cascade)
- No data loss risk
- Clear user experience
- Reversible (unarchive is easy)
- Cloud sync just works

---

## Entity Reference Map

### Season
**Referenced by:**
- `Game.seasonId` - games assigned to this season
- `Team.boundSeasonId` - teams bound to this season
- `PlayerAdjustment.seasonId` - stat adjustments in this season

### Tournament
**Referenced by:**
- `Game.tournamentId` - games in this tournament
- `Game.tournamentSeriesId` - games in a series of this tournament
- `Team.boundTournamentId` - teams bound to this tournament
- `Team.boundTournamentSeriesId` - teams bound to a series of this tournament
- `PlayerAdjustment.tournamentId` - stat adjustments in this tournament

### Team
**Referenced by:**
- `Game.teamId` - games played by this team
- `TeamPlayer` (roster entries) - players on this team's roster
- `Season.teamPlacements[teamId]` - placement records
- `Tournament.teamPlacements[teamId]` - placement records

### Player
**Referenced by:**
- `TeamPlayer` (roster entries) - team memberships (BUT: **snapshot design** - stores name, so no FK)
- `PlayerAdjustment` - stat adjustments for this player (BUT: **no FK constraint** in schema)
- `Game.assessments[playerId]` - assessments (BUT: **keyed by ID**, player name in game snapshot)

**⚠️ IMPORTANT: Player Deletion is SAFE for Cloud Sync**

The schema **intentionally has NO FK constraints referencing the `players` table**. This is documented in migration 013:
```sql
-- NOTE: No FK to players table - INTENTIONAL DESIGN DECISION
-- Reason: Graceful degradation when players are deleted
-- Behavior: UI shows last known name via snapshot stored in team_players.name
-- Trade-off: Orphaned player_id references are acceptable for UX
```

**Impact of player deletion:**
1. **Games**: ✅ Safe - `availablePlayers[]` and `playersOnField[]` are full snapshots
2. **Team Rosters**: ✅ Safe - `TeamPlayer` stores name as snapshot
3. **Assessments**: ✅ Safe - Keyed by playerId, but name available in game's `availablePlayers`
4. **Adjustments**: ⚠️ Orphaned - Can't view stats for deleted player (acceptable)

**DECISION: Player deletion does NOT need blocking** since there are no FK violations.
However, we may still want to:
- Warn user that adjustments will become inaccessible
- Consider adding `archived` flag for hiding instead of deleting (nice-to-have, not required)

### Personnel
**Already implemented:** `removePersonnelMember` cascades removal from `Game.gamePersonnel[]`

---

## Implementation Plan

### Phase 1: Reference Check Functions

Add to `DataStore` interface and implement in `LocalDataStore` and `SupabaseDataStore`:

```typescript
// New interface methods to add to src/interfaces/DataStore.ts
interface DataStore {
  // ... existing methods ...

  /**
   * Check if a season can be safely deleted (no references).
   * Returns reference counts for UI display.
   */
  getSeasonReferences(seasonId: string): Promise<EntityReferences>;

  /**
   * Check if a tournament can be safely deleted (no references).
   */
  getTournamentReferences(tournamentId: string): Promise<EntityReferences>;

  /**
   * Check if a team can be safely deleted (no references).
   */
  getTeamReferences(teamId: string): Promise<EntityReferences>;

  // NOTE: getPlayerReferences() NOT needed - no FK constraints on players
  // NOTE: getPersonnelReferences() NOT needed - uses cascade RPC that removes from game_personnel[]
}

// Add to src/interfaces/DataStore.ts
interface EntityReferences {
  canDelete: boolean;  // true if all counts are 0
  counts: {
    games?: number;
    teams?: number;
    players?: number;       // for team rosters
    adjustments?: number;
    seasonPlacements?: number;
    tournamentPlacements?: number;
  };
  // Human-readable summary for UI
  summary: string;  // e.g., "Used by 5 games and 2 teams"
}
```

#### Implementation: LocalDataStore

**Design Decision: Adjustments use SET NULL (not blocking)**

Player adjustments have FK to seasons/tournaments with `ON DELETE SET NULL`. When a season/tournament is deleted:
- Adjustments survive but lose their `season_id`/`tournament_id` (becomes NULL)
- This is acceptable because adjustments are for external games and don't require strict organization
- We show adjustment count in the summary for awareness, but it does NOT block deletion

```typescript
async getSeasonReferences(seasonId: string): Promise<EntityReferences> {
  const games = await this.getGames();
  const teams = await this.getTeams(true); // include archived

  const gameCount = Object.values(games).filter(g => g.seasonId === seasonId).length;
  const teamCount = teams.filter(t => t.boundSeasonId === seasonId).length;

  // Adjustments: count for info, but don't block (SET NULL handles deletion gracefully)
  const adjustments = await this.getAllPlayerAdjustments();
  let adjustmentCount = 0;
  for (const [, playerAdj] of adjustments) {
    adjustmentCount += playerAdj.filter(a => a.seasonId === seasonId).length;
  }

  const counts = { games: gameCount, teams: teamCount, adjustments: adjustmentCount };

  // Only GAMES and TEAMS block deletion (hard references)
  // Adjustments use SET NULL and survive deletion
  const canDelete = gameCount === 0 && teamCount === 0;

  const parts = [];
  if (gameCount > 0) parts.push(`${gameCount} game${gameCount > 1 ? 's' : ''}`);
  if (teamCount > 0) parts.push(`${teamCount} team${teamCount > 1 ? 's' : ''}`);
  // Show adjustments in summary for awareness, but they don't block
  if (adjustmentCount > 0) parts.push(`${adjustmentCount} stat adjustment${adjustmentCount > 1 ? 's' : ''} (will be unlinked)`);

  return {
    canDelete,
    counts,
    summary: parts.length > 0 ? `Used by ${parts.join(' and ')}` : 'Not used by any other data',
  };
}
```

Similar implementations for `getTournamentReferences` and `getTeamReferences`.

**Note:** `getPlayerReferences()` is NOT needed - no FK constraints on players.

#### Implementation: SupabaseDataStore

Use SQL COUNT queries for efficiency:

```typescript
async getSeasonReferences(seasonId: string): Promise<EntityReferences> {
  const userId = await this.getUserId();

  const { data, error } = await this.getClient().rpc('get_season_references', {
    p_season_id: seasonId,
  });

  // Or use parallel queries:
  const [gamesResult, teamsResult, adjustmentsResult] = await Promise.all([
    this.getClient()
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId),
    this.getClient()
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('bound_season_id', seasonId),
    this.getClient()
      .from('player_adjustments')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId),
  ]);

  // Build response...
}
```

### Phase 2: Update Delete Functions

Modify delete functions to check references first:

```typescript
// LocalDataStore.deleteSeason
async deleteSeason(id: string): Promise<boolean> {
  const refs = await this.getSeasonReferences(id);

  if (!refs.canDelete) {
    throw new ValidationError(
      `Cannot delete season: ${refs.summary}. Archive it instead.`,
      'seasonId',
      id
    );
  }

  // Proceed with deletion (existing code)
  return withKeyLock(SEASONS_LIST_KEY, async () => {
    // ... existing deletion logic ...
  });
}
```

Same pattern for `deleteTournament` and `deleteTeam`.

**Note:** `deletePlayer` does NOT need modification - no FK constraints on players.

### Phase 3: UI Changes

#### Option A: Pre-check in UI (Recommended)

Before showing delete confirmation, check references:

```typescript
// In SeasonTournamentManagementModal.tsx - handleDeleteClick
const handleDeleteClick = async (item: Season | Tournament, type: 'season' | 'tournament') => {
  // Check references first
  const refs = type === 'season'
    ? await dataStore.getSeasonReferences(item.id)
    : await dataStore.getTournamentReferences(item.id);

  if (!refs.canDelete) {
    // Show "cannot delete" dialog with archive option
    setDeleteBlockedState({
      open: true,
      entityType: type,
      entityName: item.name,
      references: refs,
      item,
    });
  } else {
    // Show normal delete confirmation (existing flow)
    setItemToDelete({ id: item.id, name: item.name, type });
    setShowDeleteConfirm(true);
  }
  setActionsMenuId(null);
};
```

#### Dialog Component: DeleteBlockedDialog

Create new component `src/components/DeleteBlockedDialog.tsx`:

```tsx
interface DeleteBlockedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'season' | 'tournament' | 'team' | 'player';
  entityName: string;
  references: EntityReferences;
  onArchive: () => void;
  supportsArchive?: boolean; // false for players until we add archive support
}

const DeleteBlockedDialog: React.FC<DeleteBlockedDialogProps> = ({
  isOpen, onClose, entityType, entityName, references, onArchive, supportsArchive = true
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-slate-800 p-6 rounded-lg border border-slate-600 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">
          {t('deleteBlocked.title', 'Cannot Delete "{{name}}"', { name: entityName })}
        </h3>
        <div className="text-slate-300 mb-6 space-y-3">
          <p>{t('deleteBlocked.reason', 'This {{type}} is {{summary}}.', {
            type: entityType,
            summary: references.summary
          })}</p>

          {supportsArchive ? (
            <>
              <p>{t('deleteBlocked.archiveOption', 'You can archive it instead, which will:')}</p>
              <ul className="list-disc list-inside text-sm text-slate-400 space-y-1">
                <li>{t('deleteBlocked.hideFromLists', 'Hide it from lists and dropdowns')}</li>
                <li>{t('deleteBlocked.keepData', 'Keep all linked data intact')}</li>
                <li>{t('deleteBlocked.canRestore', 'Allow you to restore it later')}</li>
              </ul>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              {t('deleteBlocked.unlinkFirst', 'To delete, first remove this {{type}} from all referencing items.', { type: entityType })}
            </p>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 rounded border border-slate-600 hover:bg-slate-600 text-sm font-medium">
            {t('common.cancel', 'Cancel')}
          </button>
          {supportsArchive && (
            <button onClick={onArchive} className="px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-500 text-sm font-medium text-white">
              {t('deleteBlocked.archiveInstead', 'Archive Instead')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
```

#### Alternative: Conditional Delete Button Visibility

Hide delete button entirely when references exist (pre-compute on modal open):

```tsx
// In TeamManagerModal actions menu
{actionsMenuTeamId === team.id && (
  <div className="...">
    <button onClick={() => handleToggleArchive(team.id, team.archived || false)}>
      {team.archived ? t('unarchive') : t('archive')}
    </button>
    <button onClick={() => handleEditTeam(team.id)}>
      {t('edit')}
    </button>
    {/* Only show delete if no references - requires pre-computing refs */}
    {teamCanDelete[team.id] && (
      <button onClick={() => handleDeleteTeam(team.id)} className="text-red-400">
        {t('delete')}
      </button>
    )}
  </div>
)}
```

**Note:** Pre-computing refs for all items on modal open may be expensive. The dialog approach (check on click) is more efficient.

#### Accessing DataStore in UI Components

Use the `useDataStore` hook to get the DataStore instance:

```typescript
// In SeasonTournamentManagementModal.tsx
import { useDataStore } from '@/hooks/useDataStore';

const SeasonTournamentManagementModal = ({ ... }) => {
  const { getStore } = useDataStore();

  const handleDeleteClick = async (item: Season | Tournament, type: 'season' | 'tournament') => {
    const store = await getStore();
    const refs = type === 'season'
      ? await store.getSeasonReferences(item.id)
      : await store.getTournamentReferences(item.id);

    if (!refs.canDelete) {
      // Show blocked dialog
    } else {
      // Show normal confirmation
    }
  };
  // ...
};
```

### Phase 4: Legacy Orphan Handling (Safety Net)

For existing backups with orphaned references, add detection in `pushAllToCloud`:

```typescript
// In SyncedDataStore.pushAllToCloud()

// Before pushing games, validate references
const seasons = await this.localStore.getSeasons(true);
const tournaments = await this.localStore.getTournaments(true);
const teams = await this.localStore.getTeams(true);
const seasonIds = new Set(seasons.map(s => s.id));
const tournamentIds = new Set(tournaments.map(t => t.id));
const teamIds = new Set(teams.map(t => t.id));

const orphanWarnings: string[] = [];

for (const [gameId, game] of Object.entries(games)) {
  let modified = false;

  if (game.seasonId && !seasonIds.has(game.seasonId)) {
    orphanWarnings.push(`Game "${game.teamName} vs ${game.opponentName}" had invalid season reference`);
    game.seasonId = '';
    modified = true;
  }

  if (game.tournamentId && !tournamentIds.has(game.tournamentId)) {
    orphanWarnings.push(`Game "${game.teamName} vs ${game.opponentName}" had invalid tournament reference`);
    game.tournamentId = '';
    game.tournamentSeriesId = '';
    modified = true;
  }

  if (game.teamId && !teamIds.has(game.teamId)) {
    orphanWarnings.push(`Game "${game.teamName} vs ${game.opponentName}" had invalid team reference`);
    game.teamId = undefined;
    modified = true;
  }

  if (modified) {
    // Update local storage too so local and cloud stay in sync
    await this.localStore.saveGame(gameId, game);
  }
}

// Skip rosters for teams that don't exist
const validRosterTeamIds = Object.keys(teamRosters).filter(teamId => teamIds.has(teamId));
const skippedRosters = Object.keys(teamRosters).length - validRosterTeamIds.length;
if (skippedRosters > 0) {
  orphanWarnings.push(`Skipped ${skippedRosters} roster(s) for deleted teams`);
}

// Add warnings to result
if (orphanWarnings.length > 0) {
  logger.warn('[SyncedDataStore] Fixed orphaned references:', orphanWarnings);
  // Include in return summary for UI display
}
```

---

## Cloud Sync Behavior

### How This Affects Sync

With this approach, cloud sync becomes simple:

1. **Delete with references blocked** → No orphans created locally
2. **Archive instead** → Entity still exists, references valid
3. **Cloud has FK constraints** → All references valid, sync succeeds
4. **Legacy orphans** → Safety net in `pushAllToCloud` fixes them once

### Sync Flow

```
Local Delete Attempt
        │
        ▼
Reference Check
        │
   ┌────┴────┐
   │         │
Has refs   No refs
   │         │
   ▼         ▼
BLOCKED    DELETE OK
   │         │
   ▼         ▼
Offer      Delete locally
Archive    + Queue sync
   │         │
   ▼         ▼
Archive    Sync to cloud
locally    (DELETE succeeds,
+ Queue    no FK issues)
sync
   │
   ▼
Sync to cloud
(UPDATE archived=true,
 entity still exists,
 refs still valid)
```

### What About Existing Data?

**Scenario:** User has old backup with orphaned references, imports it.

1. Import runs `pushAllToCloud`
2. Safety net detects orphans
3. Fixes them locally AND in cloud push
4. Warns user: "Fixed 2 games with invalid season references"
5. Import succeeds

After this one-time fix, no new orphans can be created.

---

## Files to Modify

### Core Changes
| File | Changes |
|------|---------|
| `src/interfaces/DataStore.ts` | Add `getSeasonReferences()`, `getTournamentReferences()`, `getTeamReferences()` methods |
| `src/datastore/LocalDataStore.ts` | Implement reference checks, update delete functions |
| `src/datastore/SupabaseDataStore.ts` | Implement reference checks, update delete functions |
| `src/datastore/SyncedDataStore.ts` | Add orphan detection safety net in `pushAllToCloud` |

### UI Changes
| File | Changes |
|------|---------|
| `src/components/SeasonTournamentManagementModal.tsx` | Check refs before delete, show blocked dialog |
| `src/components/TeamManagerModal.tsx` | Check refs before delete, show blocked dialog (replace existing warning-only logic) |
| `src/components/DeleteBlockedDialog.tsx` | **NEW** - Reusable dialog for "cannot delete" scenario |

**Note:** `RosterSettingsModal.tsx` (players) does NOT need changes - player deletion has no FK constraints.

### Tests
| File | Changes |
|------|---------|
| `src/datastore/LocalDataStore.test.ts` | Test reference checks, blocked deletes |
| `src/datastore/SupabaseDataStore.test.ts` | Test reference checks, blocked deletes |
| `tests/datastore/SyncedDataStore.pushAllToCloud.test.ts` | Test orphan detection |

---

## Acceptance Criteria

### Must Have
- [ ] Cannot delete season if **games or teams** reference it (adjustments use SET NULL - don't block)
- [ ] Cannot delete tournament if **games or teams** reference it (adjustments use SET NULL - don't block)
- [ ] Cannot delete team if **games** reference it (rosters CASCADE delete - don't block; placements are JSONB - don't block)
- [ ] ~~Cannot delete player if rosters/adjustments reference it~~ **NOT NEEDED** - No FK constraints
- [ ] ~~Cannot delete personnel if games reference it~~ **NOT NEEDED** - Has cascade RPC that removes from `game_personnel[]`
- [ ] Clear error message when delete is blocked
- [ ] Archive option offered when delete is blocked (season, tournament, team)
- [ ] Legacy orphans fixed during cloud push with warning

### Should Have
- [ ] Reference count shown in delete blocked dialog
- [ ] "What will happen" explanation in archive dialog
- [ ] Orphan fix logged to console for debugging

### Nice to Have
- [ ] Show which specific items reference the entity
- [ ] Batch fix option for multiple orphans
- [ ] Migration script to clean existing local data

---

## Manual Testing Checklist

### Phase 1: Reference Check Functions
```bash
# In browser console after implementation
const store = await window.__getDataStore?.() || (await import('@/datastore/factory')).getDataStore();

// Test season with games
const refs = await store.getSeasonReferences('YOUR_SEASON_ID');
console.log(refs); // Should show canDelete: false, games: N

// Test season without references
// (Create a new season, don't assign any games)
const newSeasonRefs = await store.getSeasonReferences('NEW_SEASON_ID');
console.log(newSeasonRefs); // Should show canDelete: true
```

### Phase 2: UI Dialogs
1. **Season with games:**
   - Open Season/Tournament Management
   - Click "..." on a season that has games
   - Click "Delete" → Should show DeleteBlockedDialog
   - Click "Archive Instead" → Season should be archived

2. **Season without references:**
   - Create new season (don't assign games)
   - Click "Delete" → Should show normal confirmation
   - Confirm → Season should be deleted

3. **Team with games:**
   - Open Team Management
   - Click "..." on a team that has games
   - Click "Delete" → Should show DeleteBlockedDialog

4. **Player deletion (NO blocking expected):**
   - Open Roster Settings
   - Click "..." on any player
   - Click "Delete" → Should show normal confirmation (no blocking)
   - This is by design - no FK constraints on players

### Phase 3: Cloud Sync
1. Create backup file with orphaned references (manually edit JSON)
2. Import backup in cloud mode
3. Verify orphans are fixed (check console for warnings)
4. Verify import succeeds

---

## Rollout Plan

### Phase 1: Reference Checks (PR 1)
1. Add interface methods
2. Implement in LocalDataStore
3. Implement in SupabaseDataStore
4. Add tests
5. Update delete functions to check references

### Phase 2: UI Dialogs (PR 2)
1. Create `DeleteBlockedDialog` component
2. Update `SeasonTournamentManagementModal.tsx`:
   - Add ref check before delete (using `getStore()` from `useDataStore`)
   - Show `DeleteBlockedDialog` when blocked
3. Update `TeamManagerModal.tsx`:
   - Replace game count warning with proper blocking
   - Remove or hide "Orphaned Games" button (no longer needed)

**Note:** Player deletion does NOT need blocking (no FK constraints).

### Phase 3: Orphan Safety Net (PR 3)
1. Add orphan detection to pushAllToCloud
2. Fix orphans in both local and cloud
3. Add warnings to result summary
4. Add tests

---

## Questions Resolved

1. **Player assessments when player deleted?** → KEEP (player name in game snapshot)
2. **TeamPlacements when team deleted?** → Would need cleanup, but blocked delete prevents this
3. **Why local works but cloud fails?** → IndexedDB has no FK constraints, PostgreSQL does
4. **Cascade vs Block?** → Block is simpler, safer, reversible

---

## Design Decision: No Force Delete

**We intentionally do NOT allow deletion when references exist.**

Rationale:
- Archive is always sufficient for "hiding" unwanted data
- Cascade delete is complex and risky
- Users can manually unlink references if they really need to delete
- Simpler code, fewer edge cases, safer data

If a user truly wants to delete an entity that has references:
1. They must manually unlink all references first (change games to different season, etc.)
2. Then the entity can be deleted (no references = delete allowed)

This is intentional friction to prevent accidental data loss.

---

## Complete Entity Inventory (2026-02-05)

This section documents ALL app entities, their FK relationships, archive support, and whether delete-blocking is needed.

### Summary Table

| Entity | FK References | Archive Field | Archive UI | Delete Blocking |
|--------|---------------|---------------|------------|-----------------|
| **Players** | ❌ None (intentional) | ❌ No | ❌ No | ❌ **NO** - Safe to delete |
| **Teams** | ✅ `games.team_id` (SET NULL) | ✅ Yes | ✅ Yes + toggle | ✅ **YES** |
| **Seasons** | ✅ `games.season_id` (SET NULL) | ✅ Yes | ✅ Yes + toggle | ✅ **YES** |
| **Tournaments** | ✅ `games.tournament_id` (SET NULL) | ✅ Yes | ✅ Yes + toggle | ✅ **YES** |
| **Personnel** | ❌ `games.game_personnel[]` (text array, not FK) | ❌ No | ❌ No | ❌ **NO** - Has cascade RPC |
| **Games** | Children CASCADE delete | ❌ No | ❌ No | ❌ **NO** - End entity |
| **Player Adjustments** | FK TO seasons/tournaments (SET NULL) | ❌ No | ❌ No | ❌ **NO** - Child records |
| **Warmup Plans** | ❌ None | ❌ No | ❌ No | ❌ **NO** - Single per user |
| **User Settings** | ❌ None | N/A | N/A | ❌ **NO** - 1:1 with user |
| **Team Players** | ✅ `teams` (CASCADE) | ❌ No | ❌ No | ❌ **NO** - Part of team |

### Detailed Analysis

#### 1. Players (Master Roster)
- **FK References**: **NONE** - Intentional design for graceful degradation
- **Schema Note**: `team_players.player_id`, `game_players.player_id`, `player_assessments.player_id`, `player_adjustments.player_id` all have NO FK constraint
- **Archive Field**: ❌ No
- **Archive UI Support**: ❌ No (only delete in RosterSettingsModal)
- **Delete Blocking Needed**: ❌ **NO** - Delete is safe, uses snapshot pattern
- **Delete Impact**: Orphaned `player_id` values acceptable (UI shows snapshot names)

#### 2. Teams
- **FK References**:
  - `games.team_id` → teams (ON DELETE SET NULL) - games survive deletion
  - `team_players.team_id` → teams (ON DELETE CASCADE) - roster deleted with team
- **Archive Field**: ✅ Yes (`archived?: boolean`)
- **Archive UI Support**: ✅ Yes - TeamManagerModal has "Show Archived" toggle + Archive action
- **Delete Blocking Needed**: ✅ **YES** - Should block if games reference this team
- **Current Behavior**: Shows game count warning but STILL ALLOWS delete

#### 3. Seasons
- **FK References**:
  - `games.season_id` → seasons (ON DELETE SET NULL)
  - `player_adjustments.season_id` → seasons (ON DELETE SET NULL)
- **Archive Field**: ✅ Yes (`archived?: boolean`)
- **Archive UI Support**: ✅ Yes - SeasonTournamentManagementModal has "Show Archived" toggle + Archive action
- **Delete Blocking Needed**: ✅ **YES** - Should block if games reference this season
- **Current Behavior**: Deletes directly without checking references

#### 4. Tournaments
- **FK References**:
  - `games.tournament_id` → tournaments (ON DELETE SET NULL)
  - `player_adjustments.tournament_id` → tournaments (ON DELETE SET NULL)
- **Archive Field**: ✅ Yes (`archived?: boolean`)
- **Archive UI Support**: ✅ Yes - SeasonTournamentManagementModal has "Show Archived" toggle + Archive action
- **Delete Blocking Needed**: ✅ **YES** - Should block if games reference this tournament
- **Current Behavior**: Deletes directly without checking references

#### 5. Personnel
- **FK References**: `games.game_personnel[]` is a **text array** of personnel IDs - NOT a FK constraint
- **Archive Field**: ❌ No
- **Archive UI Support**: ❌ No (PersonnelManagerModal has only delete)
- **Delete Blocking Needed**: ❌ **NO** - Has `delete_personnel_cascade` RPC that removes ID from `games.game_personnel[]`
- **Current Behavior**: Shows game count, allows deletion, cascade removes from games

#### 6. Games
- **FK References** (FROM games to parents): season, tournament, team (all SET NULL)
- **FK References** (FROM children):
  - `game_events` → games (CASCADE)
  - `game_players` → games (CASCADE)
  - `player_assessments` → games (CASCADE)
  - `game_tactical_data` → games (CASCADE)
- **Archive Field**: ❌ No - Games are deleted, not archived
- **Delete Blocking Needed**: ❌ **NO** - This is the end entity; children CASCADE delete safely

#### 7. Player Adjustments
- **FK References** (TO other tables):
  - `seasons` (ON DELETE SET NULL) - survives season deletion
  - `tournaments` (ON DELETE SET NULL) - survives tournament deletion
  - `player_id` (NO FK - intentional)
- **Archive Field**: ❌ No
- **Delete Blocking Needed**: ❌ **NO** - These are child records; SET NULL handles parent deletion

#### 8. Warmup Plans
- **FK References**: None (standalone entity, 1 per user)
- **Archive Field**: ❌ No
- **Delete Blocking Needed**: ❌ **NO** - Single entity per user, no references

#### 9. User Settings
- **FK References**: None (1:1 with user)
- **Archive Field**: N/A (system settings, not user content)
- **Delete Blocking Needed**: ❌ **NO** - Deleted with account

#### 10. Team Players (Team Roster Entries)
- **FK References**:
  - `teams` (ON DELETE CASCADE) - deleted with team
  - `player_id` (NO FK - intentional, graceful degradation)
- **Archive Field**: ❌ No (part of team, not standalone)
- **Delete Blocking Needed**: ❌ **NO** - CASCADE deletes with team

### Entities Requiring Delete Blocking

Only **3 entities** need delete-blocking implementation:

| Entity | Reason | Alternative |
|--------|--------|-------------|
| **Seasons** | Games/adjustments use FK | Archive (UI supported) |
| **Tournaments** | Games/adjustments use FK | Archive (UI supported) |
| **Teams** | Games use FK | Archive (UI supported) |

All other entities either:
- Have no FK constraints (Players, Personnel via array)
- Have CASCADE delete (Team Players, Game children)
- Have SET NULL behavior (Player Adjustments)
- Are standalone (Warmup Plans, User Settings)

---

## Code Review Findings (2026-02-05)

### Current Delete UI Locations

| Entity | Component | Current Behavior | Archive Support | Needs Blocking? |
|--------|-----------|------------------|-----------------|-----------------|
| Season | `SeasonTournamentManagementModal.tsx` | Deletes directly, no ref check | ✅ Yes + "Show Archived" toggle | **YES** - FK on games |
| Tournament | `SeasonTournamentManagementModal.tsx` | Deletes directly, no ref check | ✅ Yes + "Show Archived" toggle | **YES** - FK on games |
| Team | `TeamManagerModal.tsx` | Shows game count warning, but allows delete | ✅ Yes + "Show Archived" toggle | **YES** - FK on games |
| Player | `RosterSettingsModal.tsx` | Deletes directly, no warning | ❌ No archive support | **NO** - No FK constraints |
| Personnel | `PersonnelManagerModal.tsx` | Shows game count, allows delete, cascade removes from games | ❌ No archive support | **NO** - Has cascade RPC |

### Existing Patterns to Leverage

1. **ConfirmationModal** - Used by all delete flows, can be extended or replaced with `DeleteBlockedDialog`
2. **Archive toggle** - Already implemented for Season, Tournament, Team (via update mutation)
3. **"Orphaned Games" button** in `TeamManagerModal.tsx` - Shows they're aware of orphan issue; this will become obsolete with blocked deletes
4. **Premium limits check** - Archive operations already respect premium limits (e.g., unarchiving blocked if at limit)

### Changes Required for Player Archive (OPTIONAL - Nice to Have)

**Player archive is NOT required for cloud sync integrity** because there are no FK constraints referencing players.

If we want to add it for UX consistency in the future:

1. Add to `src/types/index.ts`:
   ```typescript
   export interface Player {
     // ... existing fields ...
     archived?: boolean;  // NEW
   }
   ```

2. Update `RosterSettingsModal.tsx`:
   - Add "Show Archived" toggle (like teams/seasons)
   - Add Archive option in actions menu
   - Filter archived players from lists by default

3. Update `LocalDataStore.getPlayers()`:
   - Add `includeArchived?: boolean` parameter
   - Filter out archived players by default

4. Same for `SupabaseDataStore.getPlayers()`

**This can be deferred to a future enhancement.**

### UI Implementation Notes

The delete flow in each component follows a consistent pattern:
```typescript
// 1. User clicks Delete in actions menu
handleDeleteClick(item) → setItemToDelete(item) → setShowDeleteConfirm(true)

// 2. Confirmation modal shown
<ConfirmationModal onConfirm={handleDeleteConfirmed} />

// 3. Delete executed
handleDeleteConfirmed() → deleteMutation.mutate(itemId)
```

For blocked delete, we insert a check BEFORE step 2:
```typescript
handleDeleteClick(item) {
  const refs = await dataStore.getXxxReferences(item.id);
  if (refs.canDelete) {
    // Show normal confirmation
    setShowDeleteConfirm(true);
  } else {
    // Show blocked dialog with archive option
    setShowDeleteBlocked({ ...refs, item });
  }
}
```

---

## GDPR Compliance

GDPR "right to be forgotten" is **already handled** through existing functionality:

1. **Download cloud data** - User can export all their data
2. **Delete all cloud data** - Complete account deletion wipes everything

These are separate from individual entity deletion. Users who want their data completely removed use the account deletion flow, which cascades through all data by design.

Individual entity deletion (seasons, teams, etc.) is for **data organization**, not data removal. Archive is sufficient for hiding unwanted items.
