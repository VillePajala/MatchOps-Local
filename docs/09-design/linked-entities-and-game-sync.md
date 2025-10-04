# Linked Entities: Live Name Resolution

## Context

- We recently refactored modal data flows to consume React Query–driven props (no on-open storage reads), fixing stale modal state and improving responsiveness.
- Entities (Team, Season, Tournament) are referenced by `id` from games; some fields are also snapshotted into the game (e.g., `teamName`, structural settings prefilled from Season/Tournament).
- This is a **local-first PWA** for single-user, small-scale use (~50-100 games, ~50-100 players). Solutions must match this scale.

## Problem Statement

**Issue**: When a Team/Season/Tournament is renamed, the new name appears inconsistently across the UI.

**Root cause**: Games store both:
- Entity ID reference (e.g., `teamId: "team_123"`)
- Snapshot of name at creation time (e.g., `teamName: "FC United"`)

Different UI components do different things:
- **LoadGameModal filters** → Look up entity by ID, show current name ✅
- **Game card titles** → Use snapshot name ❌
- **ControlBar game title** → Use snapshot name ❌

**Result**: User sees "FC United 2025" in one place, "FC United" in another place, for the same team.

## Current Behavior (Buggy)

**Names:**
- **Team**: Snapshot `teamName` used in game cards/titles; entity name used in filters → Inconsistent ❌
- **Season/Tournament**: Entity lookup in some places, snapshot in others → Inconsistent ❌

**Settings (NOT part of this fix):**
- Structural settings (periods, duration, age group, etc.) prefilled from Season/Tournament at game creation
- Later changes to Season/Tournament do NOT auto-apply to existing games → This is **correct behavior** ✅
- No plan to change this; settings should not unexpectedly change completed/in-progress games

**Orphan handling:**
- If a game references a deleted Team (`teamId` exists, entity missing), we detect it and offer reassignment or reverting to "No Team (master roster)" → Working correctly ✅

## Why This Matters: Import/Export Scenario

**Critical use case**: User backs up data on Device A, imports to Device B (new phone/computer).

**Current backup includes:**
- ✅ Games (with `teamId`/`seasonId`/`tournamentId` + snapshot names)
- ✅ Seasons
- ✅ Tournaments
- ✅ Master roster
- ❌ **Teams are MISSING from backups** (critical bug, see Prerequisite section below)

**What happens without live name lookups:**
1. User renames "FC United" → "FC United 2025" on Device A
2. User exports backup and imports to Device B
3. Device B shows old snapshot "FC United" because:
   - Teams not included in backup (if we fix backup: entity exists but snapshot still used)
   - Components use snapshot instead of entity lookup

**With live name lookups:**
1. User renames team on Device A
2. Export includes Team entity with new name (after fixing backup)
3. Import to Device B → Entity restored with current name
4. All components look up by ID → Show "FC United 2025" everywhere ✅

## Solution: Live Entity Name Resolution

### Single Rule (Simplified)

**For all entities (Team, Season, Tournament):**
- ✅ **If game has entity ID** → Always look up current entity and display its name
- ✅ **If game has NO entity ID** → Use snapshot name (legacy games, "No Team" games)
- ✅ **If entity deleted** → Fall back to snapshot name (with optional indicator)

**No per-game name overrides** - Solving a problem that doesn't exist. If user wants custom name, they don't link to an entity.

**No settings sync** - Deferred until user need is validated. Settings should not auto-update; if user needs this feature in the future, we'll add an explicit "Copy from Season/Tournament" button (no automatic prompts, no bulk-apply complexity).

### Why This Is Simple

**No database changes:**
- Games still store both `teamId` and `teamName` (backward compatible)
- We just ignore the snapshot when an ID exists

**Read-time logic only:**
- Create helper function: `getDisplayNames(game, entityMaps)`
- Every component calls helper instead of using snapshot directly
- Helper returns live names or fallback

**Performance:**
- Memoized entity maps (id→entity) for O(1) lookups
- No repeated linear searches through entity arrays

## CRITICAL PREREQUISITE: Fix Backup System

**Must be done first**, or live name resolution breaks on import/export.

### Current Bug

`src/utils/fullBackup.ts` does NOT back up teams:

```typescript
const keysToBackup = [
  SAVED_GAMES_KEY,
  APP_SETTINGS_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  MASTER_ROSTER_KEY,
  PLAYER_ADJUSTMENTS_KEY,
  // ❌ TEAMS_INDEX_KEY missing
  // ❌ TEAM_ROSTERS_KEY missing
];
```

### Impact

1. User creates Team "FC United" with ID `team_123`
2. User creates games linked to `team_123`
3. User exports backup → **Team entity NOT included**
4. User imports on Device B → Games have `teamId: "team_123"` but no Team entity exists
5. Live name lookup fails → Falls back to snapshot

### Fix Required

**Before implementing live name resolution**, add teams to backup:

```typescript
const keysToBackup = [
  SAVED_GAMES_KEY,
  APP_SETTINGS_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  MASTER_ROSTER_KEY,
  PLAYER_ADJUSTMENTS_KEY,
  TEAMS_INDEX_KEY,      // ← ADD
  TEAM_ROSTERS_KEY,     // ← ADD
];
```

Update `FullBackupData` interface to include `TeamsIndex` and `TeamRostersIndex` types.

## Data Model Changes

**None required** ✅

- Games already store both `teamId` and `teamName` (keep both for backward compatibility)
- Teams already have `updatedAt` field (checked in `src/utils/teams.ts:75-81`)
- Seasons and Tournaments already have `createdAt` (assume they also have `updatedAt`, verify in code)
- No new fields needed
- No migration needed

## Implementation: Entity Lookup Utility

**New file: `src/utils/entityLookup.ts`**

```typescript
import type { AppState, Team, Season, Tournament } from '@/types';

export interface EntityMaps {
  teams: Map<string, Team>;
  seasons: Map<string, Season>;
  tournaments: Map<string, Tournament>;
}

// Create memoized lookup maps for O(1) performance
export function createEntityMaps(
  teams: Team[],
  seasons: Season[],
  tournaments: Tournament[]
): EntityMaps {
  return {
    teams: new Map(teams.map(t => [t.id, t])),
    seasons: new Map(seasons.map(s => [s.id, s])),
    tournaments: new Map(tournaments.map(t => [t.id, t])),
  };
}

// Resolve display names with entity lookup + snapshot fallback
export function getDisplayNames(game: AppState, maps: EntityMaps) {
  const team = game.teamId ? maps.teams.get(game.teamId) : null;
  const season = game.seasonId ? maps.seasons.get(game.seasonId) : null;
  const tournament = game.tournamentId ? maps.tournaments.get(game.tournamentId) : null;

  return {
    teamName: team?.name ?? game.teamName,
    seasonName: season?.name ?? game.seasonName,
    tournamentName: tournament?.name ?? game.tournamentName,
  };
}
```

**Usage in components:**

```typescript
import { createEntityMaps, getDisplayNames } from '@/utils/entityLookup';

// In component (e.g., LoadGameModal):
const entityMaps = useMemo(
  () => createEntityMaps(teams, seasons, tournaments),
  [teams, seasons, tournaments]
);

// For each game:
const { teamName, seasonName, tournamentName } = getDisplayNames(game, entityMaps);
```

## Components Requiring Updates

**Files to modify:**

1. **`src/components/LoadGameModal.tsx`**
   - Create entity maps from React Query data (`teams`, `seasons`, `tournaments`)
   - Use `getDisplayNames()` for all game cards
   - Use entity names in filter dropdowns

2. **`src/components/ControlBar.tsx`**
   - Receive entity maps from parent or create locally
   - Use `getDisplayNames()` for current game title display

3. **`src/components/GameSettingsModal.tsx`**
   - Use entity names in "Linked to: [Name]" displays
   - Show fallback indicator if entity deleted (e.g., "Team name (deleted)")

4. **`src/app/page.tsx`**
   - Already fetches teams/seasons/tournaments via React Query
   - Pass to child components that need name lookups

**Estimated:** ~4-5 components to update

## Testing Strategy

### Unit Tests

**New file: `src/utils/entityLookup.test.ts`**
- Test `createEntityMaps()` creates correct Map structures
- Test `getDisplayNames()` with entities present → Returns live names
- Test `getDisplayNames()` with entity missing → Falls back to snapshot
- Test with `null`/`undefined` IDs → Uses snapshot
- Test with empty entity arrays → Falls back to snapshot

### Integration Tests

**Update: `src/utils/fullBackup.test.ts`**
- Test export includes `TEAMS_INDEX_KEY` and `TEAM_ROSTERS_KEY`
- Test import restores teams correctly
- Test cross-device scenario: export on Device A → import on Device B → teams restored

**Update: `src/components/LoadGameModal.test.tsx`**
- Test displays live entity names when game linked to team/season/tournament
- Test displays snapshot when entity deleted
- Test filters work correctly after team/season/tournament rename

**Update: `src/components/ControlBar.test.tsx`**
- Test game title shows live entity names
- Test fallback to snapshot when entity missing

### Manual Testing Checklist

1. **Basic rename flow:**
   - Create team "Test Team"
   - Create game linked to "Test Team"
   - Rename team to "Test Team 2025"
   - ✅ Verify game card shows "Test Team 2025" everywhere (LoadGameModal, ControlBar, GameSettings)

2. **Backup/restore flow:**
   - Create team, season, tournament
   - Create games linked to them
   - Rename all entities
   - Export backup
   - Open in private browser / new device (clear localStorage)
   - Import backup
   - ✅ Verify all names show correctly (not old snapshots)

3. **Deleted entity flow:**
   - Create team "Delete Me"
   - Create game linked to it
   - Delete team
   - ✅ Verify game shows snapshot name (possibly with indicator like "Delete Me (deleted)")

4. **Legacy game flow:**
   - Create game with custom team name (no team link)
   - ✅ Verify game shows custom name correctly

5. **Filter consistency:**
   - Create multiple teams, rename one
   - ✅ Verify LoadGameModal filters show updated name
   - ✅ Verify game cards show same updated name (no mismatch)

## Edge Cases Handled

### Deleted Entity
- User deletes Team after games created
- Lookup returns `null` → Falls back to snapshot `game.teamName`
- Optional: Show indicator like "(deleted)" or warning icon

### Legacy Games (No Entity Link)
- Old games created before entity linking existed
- No `teamId`/`seasonId`/`tournamentId` (or set to `null`)
- Always uses snapshot names
- Works automatically, no special handling needed

### "No Team" Games
- User explicitly chooses "No Team (use master roster)"
- `teamId` is `null`, `teamName` is custom string
- Uses snapshot `teamName`
- Works correctly

### Import Without Entities (Old Backups)
- User imports old backup that doesn't include teams
- Lookup returns `null` → Falls back to snapshot
- Graceful degradation, no errors

## Files Modified Summary

**New files (2):**
- `src/utils/entityLookup.ts` - Name resolution utility (~40 lines)
- `src/utils/entityLookup.test.ts` - Unit tests (~150 lines)

**Modified files (~7):**
- `src/utils/fullBackup.ts` - Add teams to backup (~5 line change)
- `src/components/LoadGameModal.tsx` - Use entity lookups (~20 lines)
- `src/components/ControlBar.tsx` - Use entity lookups (~10 lines)
- `src/components/GameSettingsModal.tsx` - Use entity lookups (~15 lines)
- `src/app/page.tsx` - Pass entity data (if needed, ~5 lines)
- `src/utils/fullBackup.test.ts` - Test team backup/restore (~30 lines)
- `src/components/LoadGameModal.test.tsx` - Test name display (~40 lines)

**Total: ~9 files, estimated ~315 new/modified lines**

## Migration & Rollout

**No database migration needed** ✅
- Read-time logic only
- No schema changes
- No data backfill required

**Backward compatibility:**
- Old backups without teams → Still work (entities missing, falls back to snapshots)
- New backups with teams → Work on old app version (extra keys ignored during JSON parsing)
- Old games without entity IDs → Continue working with snapshot names

**Release notes:**
- "Team/Season/Tournament names now update everywhere when renamed"
- "Backups now include all team data for complete cross-device transfers"
- "Deleted entities gracefully fall back to last known name"

## Success Criteria

✅ **Backup completeness**: Export includes `TEAMS_INDEX_KEY` and `TEAM_ROSTERS_KEY`
✅ **Import correctness**: Restore includes teams and rosters
✅ **Name consistency**: Renaming team/season/tournament reflects immediately in all UI locations
✅ **Fallback handling**: Deleted entities show snapshot name (no crashes)
✅ **Legacy support**: Old games without entity links continue working
✅ **Performance**: No performance regression (memoized maps prevent repeated lookups)
✅ **All tests pass**: Unit, integration, and manual test checklists complete
✅ **No console warnings**: Clean execution, no errors

## Out of Scope (Deferred)

**NOT included in this implementation:**

❌ **Per-game name overrides** - No user need identified; if user wants custom name, they don't link to entity
❌ **Settings sync** - No evidence users change season settings mid-season; defer until validated
❌ **Sync timestamps** (`lastSeasonSyncAt`, etc.) - Only needed for settings sync (not implemented)
❌ **"New settings available" prompts** - Over-engineering for single-user, small-scale app
❌ **Bulk-apply tools** - At this scale (~50-100 games), manual updates are acceptable
❌ **`updatedAt` fields on entities** - Already exist on Team; not needed for name resolution

These features may be added later if user feedback indicates they're needed. Current approach focuses on fixing the name inconsistency bug with minimal complexity.
