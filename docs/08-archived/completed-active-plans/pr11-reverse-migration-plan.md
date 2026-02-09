# PR #11: Reverse Migration & Cloud Account Management

## Overview

This PR implements the "cloud → local" migration path, allowing users to downgrade from cloud mode while keeping their data. It also adds cloud account management features accessible from local mode, including the ability to delete all cloud data (GDPR compliance).

**Branch**: `supabase/pr11-reverse-migration`
**Depends on**: PR #10 merged to `feature/supabase-cloud-backend`
**Estimated effort**: ~8-12 hours

---

## Motivation

### Business Case

With a monetization strategy where:
- **Local mode** = Free or one-time purchase
- **Cloud mode** = Subscription-based

Users need the ability to:
1. **Downgrade gracefully** - Switch from cloud to local without losing data
2. **Delete cloud data** - GDPR "right to be forgotten" even after downgrading
3. **Re-subscribe easily** - Return to cloud mode with existing data

### Current Gap

| Action | Current Behavior | Expected Behavior |
|--------|-----------------|-------------------|
| Cloud → Local | Empty app (local was cleared) | Data downloaded to local |
| Delete cloud from local mode | Not possible | Should be possible |
| Re-subscribe after downgrade | Works (migration wizard) | Works ✓ |

---

## User Scenarios

### Scenario 1: Downgrade and Keep Cloud Copy

User wants to switch to local but might re-subscribe later.

```
1. User clicks "Disable Cloud Sync"
2. Reverse Migration Wizard appears
3. Shows data counts from cloud
4. User selects "Download & Keep Cloud Copy"
5. Data downloads to IndexedDB
6. App switches to local mode
7. Cloud data remains in Supabase (for future re-subscription)
```

### Scenario 2: Downgrade and Delete Cloud Data

User wants to completely leave cloud, remove all remote data.

```
1. User clicks "Disable Cloud Sync"
2. Reverse Migration Wizard appears
3. User selects "Download & Delete Cloud Data"
4. Data downloads to IndexedDB
5. Cloud data is deleted from Supabase
6. App switches to local mode
7. No trace in cloud
```

### Scenario 3: Delete Cloud Data from Local Mode

User previously downgraded, now wants to delete cloud data.

```
1. User is in local mode
2. Goes to Settings → Cloud Account section
3. Sees "You have data in the cloud"
4. Clicks "Delete All Cloud Data"
5. Authenticates (if session expired)
6. Confirms with typed "DELETE"
7. All Supabase data removed
```

### Scenario 4: Re-subscribe After Downgrade

User returns to cloud after time in local mode.

```
1. User enables cloud sync
2. Logs in
3. Migration Wizard appears (existing functionality)
4. Options:
   - Merge: Combine local + cloud data
   - Replace: Overwrite cloud with local
5. Continues using cloud mode
```

---

## Technical Design

### 1. Reverse Migration Service

**File**: `src/services/reverseMigrationService.ts`

```typescript
export interface ReverseMigrationResult {
  success: boolean;
  downloaded: MigrationCounts;
  errors: string[];
  warnings: string[];
}

export type ReverseMigrationMode = 'keep-cloud' | 'delete-cloud';

/**
 * Download cloud data to local IndexedDB.
 * Optionally deletes cloud data after successful download.
 */
export async function migrateCloudToLocal(
  onProgress: MigrationProgressCallback,
  mode: ReverseMigrationMode = 'keep-cloud'
): Promise<ReverseMigrationResult>;

/**
 * Check if user has data in Supabase.
 * Works even in local mode (uses stored auth session).
 */
export async function hasCloudData(): Promise<boolean>;

/**
 * Get counts of cloud data.
 * Used for preview in reverse migration wizard.
 */
export async function getCloudDataSummary(): Promise<MigrationCounts>;
```

#### Implementation Steps

1. **Export from cloud**: Read all data from SupabaseDataStore
2. **Write to local**: Use LocalDataStore to save to IndexedDB
3. **Verify counts**: Ensure local counts match cloud counts
4. **Delete cloud** (if mode = 'delete-cloud'): Call `clearAllUserData()`
5. **Switch mode**: Set backend mode to 'local'

### 2. Reverse Migration Wizard Component

**File**: `src/components/ReverseMigrationWizard.tsx`

#### Steps

| Step | Name | Description |
|------|------|-------------|
| 1 | `preview` | Show cloud data counts |
| 2 | `choose` | Select keep/delete cloud option |
| 3 | `confirm` | Confirm if deleting (typed "DELETE") |
| 4 | `progress` | Download progress |
| 5 | `complete` | Success message |
| 6 | `error` | Error handling with retry |

#### UI Mockup - Preview Step

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                     Switch to Local Mode            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 Your Cloud Data                                         │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  👤 Players              45                         │   │
│  │  👥 Teams                 8                         │   │
│  │  ⚽ Games                23                         │   │
│  │  📅 Seasons               2                         │   │
│  │  🏆 Tournaments           3                         │   │
│  │  👔 Personnel             5                         │   │
│  │  📈 Player Adjustments   12                         │   │
│  │  🏃 Warmup Plan          Yes                        │   │
│  │  ⚙️ Settings             Yes                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  This data will be downloaded to your device.               │
│                                                             │
│                                          [Continue]         │
└─────────────────────────────────────────────────────────────┘
```

#### UI Mockup - Choose Mode Step

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                     Switch to Local Mode            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  What should happen to your cloud data?                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ○ Keep cloud copy                                   │   │
│  │   Your data stays in Supabase. You can re-enable    │   │
│  │   cloud sync later without losing anything.         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ○ Delete cloud data                                 │   │
│  │   After download, all your data will be removed     │   │
│  │   from our servers. This cannot be undone.          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                          [Continue]         │
└─────────────────────────────────────────────────────────────┘
```

#### UI Mockup - Delete Confirmation Step

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                     Confirm Cloud Deletion          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⚠️ Warning                                                 │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  After downloading your data, ALL cloud data will be        │
│  permanently deleted from our servers.                      │
│                                                             │
│  • 45 players                                               │
│  • 23 games                                                 │
│  • All associated data                                      │
│                                                             │
│  This action cannot be undone.                              │
│                                                             │
│  Type DELETE to confirm:                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Cancel]                    [Download & Delete Cloud]      │
└─────────────────────────────────────────────────────────────┘
```

### 3. Cloud Account Section in Settings

**File**: `src/components/CloudSyncSection.tsx` (extend existing)

Add new section visible when:
- User has ever authenticated with Supabase, OR
- User has cloud data (check via stored session)

#### UI Mockup - Local Mode with Cloud Data

```
┌─────────────────────────────────────────────────────────────┐
│  ☁️ Cloud Sync                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📍 Current Mode: Local                                     │
│  Data stored on this device only.                           │
│                                                             │
│  [Enable Cloud Sync]                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  🔐 Cloud Account                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Email: user@example.com                                    │
│  Status: Signed out (session expired)                       │
│  Cloud data: Yes (last synced Jan 15, 2026)                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ⚠️ You have data stored in the cloud.               │   │
│  │                                                     │   │
│  │ [Delete All Cloud Data]                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Cloud Account State Tracking

**File**: `src/config/backendConfig.ts` (extend)

```typescript
// Store minimal cloud account info in localStorage
const CLOUD_ACCOUNT_KEY = 'matchops_cloud_account';

interface CloudAccountInfo {
  email: string;
  userId: string;
  lastSyncedAt: string;
  hasCloudData: boolean;
}

export function getCloudAccountInfo(): CloudAccountInfo | null;
export function setCloudAccountInfo(info: CloudAccountInfo): void;
export function clearCloudAccountInfo(): void;
```

Update this info:
- On successful cloud sync operations
- On successful migration
- Clear on "Delete All Cloud Data"

### 5. Authentication for Deletion from Local Mode

When user clicks "Delete All Cloud Data" from local mode:

1. Check if valid Supabase session exists (may be stored)
2. If expired: Show re-authentication modal
3. After auth: Proceed with deletion
4. Clear cloud account info after successful deletion

**File**: `src/components/CloudAuthModal.tsx` (new)

Simple modal for re-authentication:
```
┌─────────────────────────────────────────┐
│  Sign in to delete cloud data           │
├─────────────────────────────────────────┤
│                                         │
│  Email: user@example.com                │
│                                         │
│  Password:                              │
│  ┌─────────────────────────────────┐    │
│  │ ••••••••                        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Cancel]              [Sign In]        │
└─────────────────────────────────────────┘
```

---

## File Changes Summary

### New Files

| File | Description |
|------|-------------|
| `src/services/reverseMigrationService.ts` | Cloud → Local migration logic |
| `src/components/ReverseMigrationWizard.tsx` | Wizard UI component |
| `src/components/CloudAuthModal.tsx` | Re-auth modal for deletion |
| `src/components/__tests__/ReverseMigrationWizard.test.tsx` | Tests |
| `src/components/__tests__/CloudAuthModal.test.tsx` | Tests |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/CloudSyncSection.tsx` | Add Cloud Account section, trigger reverse wizard |
| `src/config/backendConfig.ts` | Add cloud account info storage |
| `src/app/page.tsx` | Handle reverse migration flow |
| `public/locales/en/common.json` | Translation keys |
| `public/locales/fi/common.json` | Finnish translations |

---

## Translation Keys

```json
{
  "reverseMigration": {
    "title": "Switch to Local Mode",
    "subtitle": "Download your cloud data",
    "cloudDataTitle": "Your Cloud Data",
    "downloadMessage": "This data will be downloaded to your device.",
    "chooseTitle": "What should happen to your cloud data?",
    "keepCloudOption": "Keep cloud copy",
    "keepCloudDesc": "Your data stays in Supabase. You can re-enable cloud sync later without losing anything.",
    "deleteCloudOption": "Delete cloud data",
    "deleteCloudDesc": "After download, all your data will be removed from our servers. This cannot be undone.",
    "confirmDeleteTitle": "Confirm Cloud Deletion",
    "confirmDeleteWarning": "After downloading your data, ALL cloud data will be permanently deleted from our servers.",
    "confirmDeleteLabel": "Type DELETE to confirm:",
    "cannotBeUndone": "This action cannot be undone.",
    "downloadButton": "Download to Device",
    "downloadAndDeleteButton": "Download & Delete Cloud",
    "downloading": "Downloading...",
    "success": "Data downloaded successfully!",
    "successDeleted": "Data downloaded and cloud data deleted.",
    "error": "Failed to download data",
    "continueButton": "Continue",
    "cancelButton": "Cancel"
  },
  "cloudAccount": {
    "title": "Cloud Account",
    "email": "Email",
    "status": "Status",
    "statusSignedOut": "Signed out (session expired)",
    "statusActive": "Active",
    "cloudData": "Cloud data",
    "cloudDataYes": "Yes (last synced {{date}})",
    "cloudDataNo": "No data in cloud",
    "hasDataWarning": "You have data stored in the cloud.",
    "deleteAllButton": "Delete All Cloud Data",
    "deleteConfirmTitle": "Delete Cloud Data",
    "deleteConfirmMessage": "This will permanently delete all your data from our servers. Your local data will not be affected.",
    "signInToDelete": "Sign in to delete cloud data",
    "deleteSuccess": "All cloud data has been deleted.",
    "deleteError": "Failed to delete cloud data."
  }
}
```

---

## Acceptance Criteria

### Reverse Migration Wizard

- [ ] Wizard appears when user clicks "Disable Cloud Sync" (and has cloud data)
- [ ] Shows accurate counts of cloud data
- [ ] "Keep cloud copy" downloads data and preserves cloud
- [ ] "Delete cloud data" downloads data then deletes from Supabase
- [ ] Progress indicator during download
- [ ] Error handling with retry option
- [ ] App switches to local mode after completion
- [ ] Local data is usable immediately after migration

### Cloud Account Section

- [ ] Visible in Settings when user has ever used cloud
- [ ] Shows email and last sync date
- [ ] Shows "Delete All Cloud Data" button
- [ ] Works from local mode (re-authenticates if needed)
- [ ] Typed "DELETE" confirmation required
- [ ] Success/error feedback

### Data Integrity

- [ ] All entity types transferred correctly (players, games, teams, etc.)
- [ ] Game relationships preserved (events, players, assessments)
- [ ] No data loss during transfer
- [ ] Verification step confirms counts match

### Edge Cases

- [ ] Handle network failure during download
- [ ] Handle network failure during deletion
- [ ] Handle expired auth session
- [ ] Handle partial download (resume/retry)
- [ ] Handle user cancel mid-process

---

## Testing Plan

### Unit Tests

1. `reverseMigrationService.ts`
   - Download all entity types
   - Handle network errors
   - Verify counts match
   - Delete cloud data after download

2. `ReverseMigrationWizard.tsx`
   - Step navigation
   - Mode selection (keep/delete)
   - DELETE confirmation
   - Progress display
   - Error states

3. `CloudAuthModal.tsx`
   - Form validation
   - Auth success/failure
   - Cancel behavior

### Integration Tests

1. Full reverse migration flow (keep cloud)
2. Full reverse migration flow (delete cloud)
3. Delete from local mode flow
4. Re-subscription after downgrade

### Manual Testing Checklist

- [ ] Cloud → Local with "keep cloud" - verify data in both places
- [ ] Cloud → Local with "delete cloud" - verify cloud is empty
- [ ] Delete from local mode - verify re-auth works
- [ ] Re-enable cloud after downgrade - verify merge/replace works
- [ ] Network interruption during download - verify recovery
- [ ] Cancel mid-download - verify clean state

---

## Implementation Order

1. **Cloud account info tracking** (backendConfig.ts)
2. **Reverse migration service** (reverseMigrationService.ts)
3. **Reverse migration wizard** (ReverseMigrationWizard.tsx)
4. **Cloud account section** (CloudSyncSection.tsx)
5. **Re-auth modal** (CloudAuthModal.tsx)
6. **Integration in page.tsx**
7. **Translations**
8. **Tests**

---

## Dependencies

- PR #10 must be merged first
- Existing migration service patterns
- Existing typed confirmation patterns (DELETE/REPLACE)
- SupabaseDataStore methods
- LocalDataStore methods

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Download fails mid-transfer | Implement retry, don't delete cloud until verified |
| Auth expires during deletion | Re-auth modal, preserve operation state |
| User confused by options | Clear UI copy, preview data before action |
| Large data sets slow to download | Progress indicator, consider pagination |

---

## Future Considerations

- **Selective sync**: Only download certain data types
- **Scheduled backups**: Auto-download to local periodically
- **Conflict resolution**: Handle data modified in both places
- **Account deletion**: Full Supabase account deletion (not just data)
