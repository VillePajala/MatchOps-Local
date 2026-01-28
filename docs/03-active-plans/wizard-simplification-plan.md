# Wizard Simplification Plan

## Overview

This plan simplifies the cloud sync wizard flow from a complex decision tree to automatic background sync, aligning with local-first philosophy.

**Branch**: `supabase/pr12-wizard-simplification`
**Target**: `feature/supabase-cloud-backend`

---

## Philosophy Change

| Current | Target |
|---------|--------|
| "User chooses where data lives" | "Data is always local, cloud is a sync mirror" |
| Blocking wizard with 5+ options | Automatic sync with status indicator |
| Manual merge/replace/keep-cloud | Automatic last-write-wins |
| User must "migrate" data | Data syncs automatically |

---

## Current Problems

### 1. Double Prompting After Backup Import
```
User imports backup in cloud mode
  → CloudModeImportModal (ask: migrate or local mode?)
  → User clicks "Import & Migrate"
  → Import happens, results shown
  → ...nothing happens...
  → On next app restart: MigrationWizard appears again
```

### 2. Too Many Options in MigrationWizard
- Merge (Recommended)
- Replace Cloud with Local
- Keep Cloud (Delete Local)
- Start Fresh
- Cancel / Switch to Local Mode

Users don't understand these options. They just want "sync to work."

### 3. Modal Overflow
Wizard content overflows on small screens - buttons not visible.
(Already fixed: `max-h-[90vh] flex flex-col` + `overflow-y-auto`)

### 4. Two Migration Code Paths
- `migrationService.ts`: Bulk RPC-based migration
- `SyncEngine`: Background incremental sync

These should be unified.

---

## Simplified Flow

### Scenario 1: First-Time Cloud Setup
```
User enables cloud sync
  → Simple confirmation: "Enable cloud sync? Your data will be backed up automatically."
  → User clicks "Enable"
  → All local entities queued for sync
  → SyncEngine processes in background
  → Status indicator shows progress
  → Done (no wizard blocking the app)
```

### Scenario 2: Backup Import (Any Mode)
```
User imports backup file
  → Backup restored to local IndexedDB (same as now)
  → If cloud sync enabled: all imported entities queued for sync
  → SyncEngine processes in background
  → Status indicator shows progress
  → Done (no CloudModeImportModal needed)
```

### Scenario 3: Both Local and Cloud Have Data
```
User signs in with existing cloud data + local data
  → Automatic merge via SyncEngine
  → Last-write-wins based on updated_at timestamps
  → Conflicts resolved automatically
  → Status indicator shows "Syncing..."
  → Done (no merge/replace wizard)
```

### Scenario 4: New Device
```
User signs in on new device (no local data)
  → Cloud data pulled automatically
  → Local becomes a cache of cloud data
  → User continues with full data access
  → Done (no wizard)
```

---

## Implementation Approach

**Key Insight**: The existing `migrateLocalToCloud()` uses bulk RPC calls which are much faster than queueing individual entities through SyncEngine. For initial migration with 100+ games, bulk is better.

**Pragmatic Approach**:
1. Keep bulk migration for INITIAL setup (fast)
2. Use SyncEngine for INCREMENTAL changes (after migration)
3. Simplify the UI - remove complex options, not the underlying mechanism

---

## Implementation Steps

### Step 1: Fix Modal Overflow ✅
Already done:
- `wizardModalStyle`: Added `max-h-[90vh] flex flex-col`
- `wizardContentStyle`: Added `overflow-y-auto flex-1 min-h-0`

### Step 2: Add Sync Status Indicator
Create lightweight, non-blocking sync status UI:

```tsx
// New component: SyncStatusIndicator.tsx
// Shows in app header or floating position
// States: "Synced" | "Syncing X/Y" | "Offline" | "Error (retry)"
```

Location options:
- A. In ControlBar (always visible)
- B. Floating indicator (appears only when syncing)
- C. In Settings modal (CloudSyncSection)

Recommendation: **Option A** - always visible in ControlBar, minimal footprint.

### Step 3: Remove CloudModeImportModal
Simplify backup import in SettingsModal.tsx:

**Current Flow (lines 205-211)**:
```tsx
if (mode === 'cloud') {
  setShowCloudModeImportModal(true);  // Shows choice wizard
} else {
  setShowRestoreConfirm(true);
}
```

**New Flow**:
```tsx
// Same confirmation for both modes - just import
setShowRestoreConfirm(true);

// After import completes (in handleRestore):
if (mode === 'cloud') {
  // Clear migration flag to trigger simplified wizard
  clearMigrationCompleted(user.id);
  // Set flag to show migration wizard immediately after modal closes
  setPendingMigrationTrigger(true);
}
```

**Changes needed**:
1. Remove `showCloudModeImportModal` state
2. Remove `handleCloudModeImportCancel`, `handleCloudModeImportAndMigrate`, `handleCloudModeSwitchToLocal`
3. Remove CloudModeImportModal import and JSX
4. Add `pendingMigrationTrigger` state for post-import wizard
5. Modify `handleRestore` to set migration trigger after import

### Step 4: Simplify MigrationWizard
Reduce to single confirmation. Remove all scenarios and options.

**Current Structure** (984 lines):
- `WizardStep`: 'loading' | 'select-action' | 'confirm' | 'progress' | 'complete' | 'error'
- `MigrationScenario`: 'local-only' | 'both-have-data'
- `MigrationMode`: 'merge' | 'replace'
- Complex UI with 5+ action buttons depending on scenario

**New Structure** (~200 lines):
- `WizardStep`: 'preview' | 'syncing' | 'complete' | 'error'
- No scenarios - always "sync local to cloud"
- No migration modes - always merge (last-write-wins)
- 2 action buttons: "Sync to Cloud" | "Not Now"

**Simplified Flow**:
```
[Preview] → [Syncing] → [Complete]
     ↓           ↓           ↓
  "X items    Progress    "Synced!"
   to sync"    bar        [Done]
```

**Simplified Component**:
```tsx
type WizardStep = 'preview' | 'syncing' | 'complete' | 'error';

// No cloudCounts prop needed - we always merge
interface SimplifiedMigrationWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

// Steps:
// 1. Preview: Show local data counts, "Sync to Cloud" button
// 2. Syncing: Progress bar, "Syncing..." message
// 3. Complete: Success message, "Done" button
// 4. Error: Error message, "Retry" / "Cancel" buttons
```

**Key Simplifications**:
1. Remove `scenario` logic entirely - we don't need to know what's in cloud
2. Remove `migrationMode` selection - always merge
3. Remove cloudCounts prop and related API calls
4. Remove "Keep Cloud", "Replace Cloud", "Start Fresh" options
5. Remove confirmation step with "REPLACE" text input
6. Keep progress tracking (users like seeing progress)

### Step 5: Leverage SyncEngine for Bulk Migration
New function to queue all local entities:

```typescript
// New: src/sync/bulkSync.ts
export async function queueAllEntitiesForSync(): Promise<void> {
  const localStore = getLocalDataStore();
  const syncQueue = getSyncQueue();

  // Queue all players
  const players = await localStore.getPlayers();
  for (const player of players) {
    await syncQueue.enqueue({
      entityType: 'player',
      entityId: player.id,
      operation: 'upsert',  // Create or update
      data: player,
      timestamp: Date.now(),
    });
  }

  // Queue all teams, seasons, tournaments, games, etc.
  // ...

  // Trigger immediate processing
  getSyncEngine().nudge();
}
```

### Step 6: Auto-Merge with Last-Write-Wins
Ensure SyncEngine handles conflicts:

```typescript
// In SyncEngine or SupabaseDataStore
async function syncEntity(operation: SyncOperation): Promise<void> {
  const { entityType, entityId, data, timestamp } = operation;

  // Check if cloud has newer version
  const cloudVersion = await this.getCloudEntity(entityType, entityId);

  if (cloudVersion && cloudVersion.updated_at > timestamp) {
    // Cloud is newer - skip upload, pull cloud version to local
    await this.localStore.save(entityType, cloudVersion);
    return;
  }

  // Local is newer or entity doesn't exist in cloud - upload
  await this.cloudStore.save(entityType, data);
}
```

### Step 7: Update State Management
Remove migration-specific state:

```typescript
// page.tsx - Remove:
- showMigrationWizard state
- showCloudModeImportModal state
- migrationService calls

// page.tsx - Keep/Add:
+ syncStatus subscription (from SyncEngine events)
+ Initial sync trigger on cloud mode enable
```

### Step 8: Clean Up Unused Files
After migration:
- Remove or simplify `migrationService.ts` (keep only if needed for edge cases)
- Remove `CloudModeImportModal.tsx` entirely
- Simplify `MigrationWizard.tsx` to single confirmation

---

## Files to Modify

| File | Change |
|------|--------|
| `src/styles/modalStyles.tsx` | ✅ Already fixed overflow |
| `src/components/UpgradePromptModal.tsx` | ✅ Already fixed double-click |
| `src/components/SyncStatusIndicator.tsx` | **NEW** - Lightweight sync status |
| `src/components/MigrationWizard.tsx` | Simplify to single confirmation |
| `src/components/CloudModeImportModal.tsx` | **DELETE** |
| `src/components/SettingsModal.tsx` | Remove CloudModeImportModal usage |
| `src/app/page.tsx` | Remove migration wizard orchestration |
| `src/sync/bulkSync.ts` | **NEW** - Queue all entities for sync |
| `src/sync/SyncEngine.ts` | Add conflict resolution (if not present) |
| `src/services/migrationService.ts` | Simplify or remove |
| `src/config/backendConfig.ts` | Keep migration flags for backwards compat |

---

## Testing Plan

### Unit Tests
- [ ] SyncStatusIndicator renders all states
- [ ] queueAllEntitiesForSync queues all entity types
- [ ] Conflict resolution: local newer wins
- [ ] Conflict resolution: cloud newer wins

### Integration Tests
- [ ] First-time cloud setup queues all data
- [ ] Backup import in cloud mode queues imported data
- [ ] Offline → online triggers sync
- [ ] Progress indicator updates correctly

### Manual Tests
- [ ] Enable cloud sync on device with local data
- [ ] Import backup while in cloud mode
- [ ] Sign in on new device, verify data pulls
- [ ] Edit on device A, verify syncs to device B
- [ ] Overflow fixed: all buttons visible on small screens

---

## Migration Path

For existing users who have already completed migration:
- Migration flags remain unchanged
- New simplified flow only for new migrations
- No breaking changes for existing cloud users

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during auto-merge | Last-write-wins preserves latest version; no deletions without explicit user action |
| Large data sets slow to sync | SyncEngine already handles batching and retries |
| User confusion about sync status | Clear status indicator with "Synced ✓" confirmation |
| Offline behavior unclear | Status shows "Offline - changes will sync when online" |

---

## Success Criteria

1. ✅ User imports backup in cloud mode → ONE prompt, not two
2. ✅ MigrationWizard → 2 buttons max (Sync / Not Now)
3. ✅ Status indicator shows sync progress (nice to have)
4. ✅ All buttons visible on small screens
5. ✅ No manual merge/replace decisions needed
6. ✅ Existing cloud users unaffected

---

## Conflict Resolution Strategy

**Current Behavior** (upserts):
- Same entity ID in local and cloud → local overwrites cloud
- This is "local wins" which is correct for "push local to cloud"

**Simplified Mental Model**:
- Local is the **source of truth on this device**
- Cloud is a **backup/sync destination**
- When syncing: local → cloud (upserts)
- After initial sync: SyncEngine handles incremental changes

**Edge Case: New Device**
- User signs in on new device (local empty, cloud has data)
- App should: auto-pull from cloud (no wizard)
- This is handled separately from migration wizard

**Edge Case: Both Have Data**
- User has local data AND cloud has data
- Simplified approach: "Sync local to cloud?" → merge (upsert)
- Result: cloud gets local data, cloud-only items unchanged
- If user needs cloud-only items on local: pull manually in Settings

---

## Timeline

| Step | Complexity | Order |
|------|------------|-------|
| Fix modal overflow | ✅ Done | - |
| Create SyncStatusIndicator | Medium | 1 |
| Simplify MigrationWizard | Medium | 2 |
| Remove CloudModeImportModal | Low | 3 |
| Add queueAllEntitiesForSync | Medium | 4 |
| Update page.tsx orchestration | Medium | 5 |
| Testing & polish | Medium | 6 |
