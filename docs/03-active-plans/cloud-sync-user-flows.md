# Cloud Sync User Flows

**Status**: Planning
**Created**: 2026-01-22
**Purpose**: Define all cloud sync scenarios and their expected behaviors

---

## Overview

The app supports two modes:
- **Local mode**: Data stored in browser IndexedDB, works offline, device-specific
- **Cloud mode**: Data stored in Supabase, syncs across devices, requires authentication

This document defines how the app should behave in all cloud sync scenarios.

---

## User Flows Matrix

| # | Scenario | Local Data? | Cloud Data? | Current Behavior | Expected Behavior |
|---|----------|-------------|-------------|------------------|-------------------|
| 1 | Fresh install, stays local | No | N/A | ✅ Works | Works |
| 2 | Local user enables cloud (first time) | Yes | No | ✅ Migration wizard | Migration wizard |
| 3 | Local user enables cloud (has cloud data) | Yes | Yes | ⚠️ Migration wizard (may overwrite) | **Merge/Replace choice** |
| 4 | **New device, existing cloud account** | No | Yes | ❌ Empty app | **Auto-fetch cloud data** |
| 5 | New device with local data, logs into cloud | Yes | Yes | ❌ Unclear | **Merge/Replace choice** |
| 6 | Sign out from cloud mode | Cached | Yes | ❌ Not implemented | **Clear cache, switch to local** |
| 7 | Switch to different cloud account | Cached | Yes (other) | ❌ Not implemented | **Clear cache, fetch new account** |
| 8 | Disable cloud sync (keep cloud data) | No | Yes | ⚠️ Partial | **Reverse migration offer** |
| 9 | Delete cloud account | Cached | Yes→No | ✅ Works | Works |

---

## Detailed Flow Specifications

### Flow 4: New Device with Existing Cloud Account (PRIMARY GAP)

**Trigger**: User enables cloud sync and logs in on a device with NO local data

**Current behavior**:
- App shows empty because it's reading from empty local IndexedDB
- SupabaseDataStore is active but React Query cache is empty
- User sees nothing until manual reload (now fixed) but still no data because cloud data isn't fetched

**Root cause**:
- The app assumes "enable cloud sync" means "upload local data"
- There's no "download from cloud" flow

**Expected behavior**:

```
┌─────────────────────────────────────────────────────────────┐
│  User enables Cloud Sync in Settings                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  User logs in (magic link)                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  App checks: Does user have LOCAL data?                     │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
┌─────────────────────┐       ┌─────────────────────────────┐
│  YES: Has local     │       │  NO: Empty device           │
│  → Show Flow 3 or 5 │       │  → Check cloud for data     │
└─────────────────────┘       └─────────────────────────────┘
                                          │
                            ┌─────────────┴─────────────┐
                            │                           │
                            ▼                           ▼
              ┌─────────────────────┐     ┌─────────────────────┐
              │  Cloud has data     │     │  Cloud is empty     │
              │  → AUTO-FETCH       │     │  → Ready to use     │
              │  → Show loading     │     │  (fresh start)      │
              │  → Display data     │     │                     │
              └─────────────────────┘     └─────────────────────┘
```

**Implementation approach**:

1. After successful cloud login, check if local IndexedDB has data
2. If local is empty AND cloud has data → automatically fetch and display
3. Show a brief loading indicator: "Syncing your data from cloud..."
4. No wizard needed - just seamless data appearance

**Code changes needed**:

```typescript
// In CloudSyncSection.tsx or page.tsx after successful login
const handleCloudLoginSuccess = async () => {
  const localHasData = await hasLocalDataToMigrate();

  if (!localHasData.hasData) {
    // Empty device - check if cloud has data
    const cloudHasData = await hasCloudDataToDownload();

    if (cloudHasData) {
      // Auto-fetch: just switch to cloud mode and refetch queries
      // SupabaseDataStore will automatically read from cloud
      await queryClient.refetchQueries();
      showToast('Synced from cloud', 'success');
    }
    // If cloud is also empty, user starts fresh
  } else {
    // Device has local data - show migration wizard (existing flow)
    setShowMigrationWizard(true);
  }
};
```

---

### Flow 3 & 5: Device Has Local Data, Cloud Has Data (MERGE SCENARIO)

**Trigger**: User enables cloud sync on a device that already has local data, but their cloud account also has data (e.g., from another device)

**Current behavior**:
- Migration wizard shows "Replace" or "Merge" options
- But this is framed as "upload local to cloud", not "reconcile two datasets"

**Expected behavior**:

Show a clear choice dialog:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  You have data on this device AND in the cloud.             │
│                                                             │
│  Local: 15 players, 8 games, 2 seasons                      │
│  Cloud: 12 players, 5 games, 1 season                       │
│                                                             │
│  What would you like to do?                                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📤 Upload Local → Cloud                            │   │
│  │  Replace cloud data with this device's data         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📥 Download Cloud → Local                          │   │
│  │  Replace this device's data with cloud data         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔀 Merge Both (Advanced)                           │   │
│  │  Combine data from both sources (may have dupes)    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ❌ Cancel                                          │   │
│  │  Stay in local mode, don't enable cloud sync        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation notes**:
- Reuse existing MigrationWizard component but add "Download" option
- Merge is complex (ID conflicts, duplicates) - could be Phase 2
- For MVP: just Upload or Download, no merge

---

### Flow 6: Sign Out from Cloud Mode

**Trigger**: User wants to sign out of their cloud account

**Current behavior**: Not implemented (no sign out button visible)

**Expected behavior**:

1. Add "Sign Out" button to Settings → Cloud Sync section (when logged in)
2. On sign out:
   - Call `authService.signOut()`
   - Clear React Query cache
   - Reset factory (clear DataStore singleton)
   - Switch to local mode (`disableCloudMode()`)
   - Show confirmation: "Signed out. App is now in local mode."

**Important decisions**:
- **Keep local cache?** No - clear it to prevent data leakage if device is shared
- **Offer to download first?** Yes - "You have data in cloud. Download before signing out?"

**UI in Settings**:

```
┌─────────────────────────────────────────────────────────────┐
│  Cloud Sync                                          [ON]   │
├─────────────────────────────────────────────────────────────┤
│  Signed in as: user@example.com                             │
│  Last synced: 2 minutes ago                                 │
│                                                             │
│  [Sign Out]              [Manage Account]                   │
└─────────────────────────────────────────────────────────────┘
```

---

### Flow 7: Switch Cloud Accounts

**Trigger**: User wants to sign into a different cloud account

**Expected behavior**:

1. Sign out current account (Flow 6)
2. Clear all local cached data
3. Sign in with new account
4. Fetch new account's cloud data (Flow 4)

**Warning dialog**:

```
┌─────────────────────────────────────────────────────────────┐
│  Switch Account                                             │
├─────────────────────────────────────────────────────────────┤
│  Switching accounts will:                                   │
│  • Sign out of current account (user@example.com)           │
│  • Clear locally cached data                                │
│  • Sign into a new account                                  │
│                                                             │
│  Your cloud data will remain safe in the cloud.             │
│                                                             │
│  [Cancel]                              [Switch Account]     │
└─────────────────────────────────────────────────────────────┘
```

---

### Flow 8: Disable Cloud Sync (Keep Cloud Data)

**Trigger**: User toggles cloud sync OFF but wants to keep cloud data

**Current behavior**: Partial - reverse migration exists but UX is unclear

**Expected behavior**:

```
┌─────────────────────────────────────────────────────────────┐
│  Disable Cloud Sync?                                        │
├─────────────────────────────────────────────────────────────┤
│  Your data will remain in the cloud. Choose what to do      │
│  with the local copy:                                       │
│                                                             │
│  ○ Download a copy to this device                           │
│    (You can use the app offline with this data)             │
│                                                             │
│  ○ Don't download (start fresh locally)                     │
│    (Cloud data stays safe, local will be empty)             │
│                                                             │
│  [Cancel]                              [Disable Cloud]      │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Priority

### Phase 1: Critical (Must Have)

1. **Flow 4: Auto-fetch cloud data on empty device**
   - Highest priority - this is the main blocker for multi-device use
   - Relatively simple: check local empty → fetch cloud → refetch queries

2. **Flow 6: Sign Out**
   - Add sign out button to Settings
   - Clear state and switch to local mode

### Phase 2: Important (Should Have)

3. **Flow 3/5: Upload vs Download choice**
   - Enhance MigrationWizard with bidirectional options
   - Show data counts for informed decision

4. **Flow 8: Disable cloud with download option**
   - Enhance the disable flow with clear choices

### Phase 3: Nice to Have

5. **Flow 7: Switch accounts**
   - Combines sign out + sign in flows

6. **Merge functionality**
   - Complex due to ID conflicts
   - May not be needed if users primarily use one device

---

## Technical Implementation Details

### New Functions Needed

```typescript
// Check if cloud has any data for current user
async function hasCloudDataToDownload(): Promise<boolean> {
  const cloudStore = new SupabaseDataStore();
  await cloudStore.initialize();
  try {
    const counts = await getCloudDataSummary(); // Already exists
    return counts.players > 0 || counts.games > 0 || counts.teams > 0;
  } finally {
    await cloudStore.close();
  }
}

// Sign out and clean up
async function signOutAndCleanup(queryClient: QueryClient): Promise<void> {
  const authService = await getAuthService();
  await authService.signOut();
  await resetFactory();
  queryClient.clear(); // Clear all cached data
  disableCloudMode();
}
```

### State Machine for Cloud Sync

```
                    ┌──────────────┐
                    │  LOCAL_MODE  │◄─────────────────────┐
                    └──────┬───────┘                      │
                           │ enable cloud                 │ sign out /
                           ▼                              │ disable cloud
                    ┌──────────────┐                      │
                    │  LOGGING_IN  │                      │
                    └──────┬───────┘                      │
                           │ login success                │
                           ▼                              │
                    ┌──────────────┐                      │
                    │ CHECKING_    │                      │
                    │ DATA_STATE   │                      │
                    └──────┬───────┘                      │
           ┌───────────────┼───────────────┐              │
           │               │               │              │
           ▼               ▼               ▼              │
    ┌────────────┐  ┌────────────┐  ┌────────────┐       │
    │ EMPTY_BOTH │  │ CLOUD_ONLY │  │ BOTH_HAVE  │       │
    │ (fresh)    │  │ (fetch)    │  │ (choose)   │       │
    └─────┬──────┘  └─────┬──────┘  └─────┬──────┘       │
          │               │               │              │
          └───────────────┴───────────────┘              │
                          │                              │
                          ▼                              │
                    ┌──────────────┐                     │
                    │  CLOUD_MODE  │─────────────────────┘
                    │  (synced)    │
                    └──────────────┘
```

---

## UI Components to Modify

1. **CloudSyncSection.tsx**
   - Add "Sign Out" button when logged in
   - Show sync status and last sync time
   - Improve enable/disable flow

2. **MigrationWizard.tsx**
   - Rename to `DataSyncWizard.tsx`?
   - Add "Download from cloud" option
   - Show data comparison (local vs cloud counts)

3. **page.tsx**
   - Handle Flow 4 (auto-fetch on empty device)
   - Update `handleMigrationComplete` logic

4. **New: DataSyncChoiceModal.tsx** (optional)
   - Dedicated modal for Upload/Download/Merge choice
   - Cleaner than overloading MigrationWizard

---

## Open Questions

1. **Offline handling**: What if user enables cloud sync but is offline?
   - Suggestion: Show error, don't enable until online

2. **Partial sync failures**: What if some entities fail to download?
   - Suggestion: Show warning but continue, let user retry

3. **Conflict resolution**: If same entity edited on two devices?
   - Current: Last-write-wins (no real sync, just upload/download)
   - Future: Could add timestamps and conflict detection

4. **Session expiry**: What if auth token expires while using app?
   - Suggestion: Show "Session expired, please sign in again" and gracefully handle

---

## Testing Plan

### Manual Test Cases

1. [ ] Fresh install → enable cloud → login → see "empty, start fresh" state
2. [ ] Fresh install → enable cloud → login (has cloud data) → auto-fetch works
3. [ ] Has local data → enable cloud → login (cloud empty) → upload wizard
4. [ ] Has local data → enable cloud → login (cloud has data) → choice dialog
5. [ ] Cloud mode → sign out → returns to local mode, data cleared
6. [ ] Cloud mode → disable sync → download option works
7. [ ] Test on two devices with same account → data syncs

### Automated Tests

- Unit tests for `hasCloudDataToDownload()`
- Unit tests for `signOutAndCleanup()`
- Integration test for Flow 4 (mock cloud data, verify fetch)

---

---

## Start Screen Integration (Future Iteration)

### Current Problem

Cloud sync is buried in Settings:
```
Start Screen → Settings → Scroll to Cloud Sync → Enable → Login
```

This is:
- Not discoverable for new users
- Inconvenient for users who want to access cloud data on a new device
- Doesn't communicate the app's multi-device capability

### Proposed: Smart Start Screen

The Start Screen should adapt based on the user's state:

#### State 1: Fresh Install (No Local Data, Not Logged In)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                      ⚽ MatchOps                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │            🆕  Get Started                          │   │
│  │            Start fresh on this device               │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │            ☁️  Sign In                              │   │
│  │            Access your existing data                │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                              ⚙️ Settings    │
└─────────────────────────────────────────────────────────────┘
```

**Rationale**: New users see two clear paths:
- "I'm new" → Get Started
- "I have data elsewhere" → Sign In

#### State 2: Has Local Data, Not Logged In

```
┌─────────────────────────────────────────────────────────────┐
│                                                     ☁️ 🔗   │
│                      ⚽ MatchOps                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ▶️  Resume Game                                    │   │
│  │  FC Thunder vs FC Lightning • 23:45                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌───────────────────┐  ┌───────────────────┐              │
│  │  📂 Load Game     │  │  🆕 New Game      │              │
│  └───────────────────┘  └───────────────────┘              │
│                                                             │
│  ┌───────────────────┐  ┌───────────────────┐              │
│  │  📊 Statistics    │  │  ⚙️ Settings      │              │
│  └───────────────────┘  └───────────────────┘              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  ☁️ Sync to cloud to access on other devices  [Enable]     │
└─────────────────────────────────────────────────────────────┘
```

**Rationale**:
- Primary actions (Resume, Load, New) remain prominent
- Subtle cloud prompt at bottom for discoverability
- Small cloud icon in header (greyed out = not connected)

#### State 3: Logged In, Cloud Mode Active

```
┌─────────────────────────────────────────────────────────────┐
│                                                     ☁️ ✓    │
│                      ⚽ MatchOps                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ▶️  Resume Game                                    │   │
│  │  FC Thunder vs FC Lightning • 23:45                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌───────────────────┐  ┌───────────────────┐              │
│  │  📂 Load Game     │  │  🆕 New Game      │              │
│  └───────────────────┘  └───────────────────┘              │
│                                                             │
│  ┌───────────────────┐  ┌───────────────────┐              │
│  │  📊 Statistics    │  │  ⚙️ Settings      │              │
│  └───────────────────┘  └───────────────────┘              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  ☁️ Synced • user@example.com           [Manage]           │
└─────────────────────────────────────────────────────────────┘
```

**Rationale**:
- Cloud icon shows connected status (checkmark)
- Footer shows sync status and email
- "Manage" opens cloud settings (sign out, etc.)

### Implementation Approach

#### Phase 1 (Current PR): Backend Logic
- Implement auto-fetch on empty device (Flow 4)
- Add sign out functionality (Flow 6)
- Keep existing Settings-based UI for now

#### Phase 2 (Next Iteration): Start Screen Enhancement
- Add cloud status indicator to Start Screen header
- For fresh installs: show "Get Started" vs "Sign In" choice
- For existing users: show subtle sync prompt in footer

#### Phase 3 (Polish): Full Integration
- Cloud status in header across all screens
- Quick-access cloud menu from header icon
- Sync status notifications ("Last synced 2 min ago")

### Start Screen Component Changes

Current `StartScreen.tsx` props:
```typescript
interface StartScreenProps {
  onLoadGame: () => void;
  onResumeGame: () => void;
  onGetStarted: () => void;
  onViewStats: () => void;
  onOpenSettings: () => void;
  canResume: boolean;
  hasSavedGames: boolean;
  isFirstTimeUser: boolean;
}
```

New props needed:
```typescript
interface StartScreenProps {
  // ... existing props ...

  // Cloud state
  isCloudMode: boolean;
  isAuthenticated: boolean;
  userEmail?: string;
  lastSyncedAt?: string;

  // Cloud actions
  onSignIn: () => void;        // Opens login flow
  onManageCloud: () => void;   // Opens cloud settings modal
}
```

### Decision Point: Fresh Install UX

**Option A: Two Buttons (Recommended)**
- "Get Started" and "Sign In" as equal choices
- Clear, unambiguous, no explanation needed
- User makes explicit choice

**Option B: Single Button + Prompt**
- "Get Started" button only
- After tap, show: "Do you have existing data in the cloud?"
- More guided but adds a step

**Option C: Automatic Detection**
- Check if user has ever logged in (stored email in localStorage)
- If yes: show "Welcome back, sign in to sync"
- If no: show normal "Get Started"
- Smart but might confuse users who used different email

**Recommendation**: Option A for simplicity and clarity.

### Login Flow from Start Screen

When user taps "Sign In" on Start Screen:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    Sign In to MatchOps                      │
│                                                             │
│  Access your game data from any device                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Email                                              │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │ coach@example.com                             │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Send Magic Link                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  We'll send you a sign-in link. No password needed.         │
│                                                             │
│                      [Cancel - Use Locally]                 │
└─────────────────────────────────────────────────────────────┘
```

After successful login:
- If cloud has data → auto-fetch and show Start Screen with data
- If cloud is empty → show normal Start Screen (first-time user flow)

---

## Next Steps

1. [ ] Review this document and finalize decisions
2. [ ] **Phase 1**: Implement Flow 4 (auto-fetch on empty device) - highest priority
3. [ ] **Phase 1**: Add Sign Out button (Flow 6)
4. [ ] **Phase 2**: Enhance MigrationWizard with download option (Flow 3/5)
5. [ ] **Phase 2**: Add cloud status to Start Screen header
6. [ ] **Phase 2**: Add "Sign In" option for fresh installs on Start Screen
7. [ ] **Phase 3**: Full Start Screen cloud integration
8. [ ] Test multi-device scenario end-to-end
