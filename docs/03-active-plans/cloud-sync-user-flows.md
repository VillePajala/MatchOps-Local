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

## First Install Welcome Screen (PR #12)

**Status**: Ready for Implementation
**Priority**: High - Improves onboarding for all user types
**Branch**: `supabase/pr12-welcome-screen`

### Problem Statement

Currently, the app always starts in local mode. Users who want cloud sync must:
1. Navigate to Settings
2. Find and enable Cloud Sync
3. Sign in

This creates friction for:
- **New users who want cloud from the start** - they create local data, discover cloud later, have to migrate
- **Returning users with cloud accounts** - they land in empty local mode, must dig through settings
- **Users with backup files** - not immediately obvious how to import

### Solution: One-Time Welcome Screen

Show a welcome screen **only on first launch** that lets users choose their path.

### Design

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    Welcome to MatchOps!                     │
│                                                             │
│         Track your team's games, players, and stats         │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                                                     │   │
│   │   🏠  Start Fresh                                   │   │
│   │   Data stays on this device                         │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                                                     │   │
│   │   ☁️  Sign In to Cloud                              │   │
│   │   Sync across all your devices                      │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                                                     │   │
│   │   📁  Import Backup                                 │   │
│   │   Restore from exported file                        │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│           You can change this later in Settings             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Note**: "Sign In to Cloud" button only shows if `isCloudAvailable() === true`

### User Flow Diagrams

#### Flow A: Start Fresh (Local)
```
Welcome Screen
    │ click "Start Fresh"
    ▼
Set hasSeenWelcome = true (localStorage)
Mode stays 'local'
    │
    ▼
StartScreen (first-time user view)
    - "Get Started" button prominent
    - No Resume/Load options
    │ click "Get Started"
    ▼
HomePage with first-time guidance
```

#### Flow B: Sign In to Cloud (New Cloud User)
```
Welcome Screen
    │ click "Sign In to Cloud"
    ▼
Set hasSeenWelcome = true
enableCloudMode()
    │
    ▼
LoginScreen
    │ user signs in
    ▼
Cloud data check → empty
    │
    ▼
StartScreen (first-time user view)
    - Same view as local first-timer
    - But data will sync to cloud as created
```

#### Flow C: Sign In to Cloud (Returning User)
```
Welcome Screen
    │ click "Sign In to Cloud"
    ▼
Set hasSeenWelcome = true
enableCloudMode()
    │
    ▼
LoginScreen
    │ user signs in
    ▼
Cloud data loads (games, roster, etc.)
    │
    ▼
StartScreen (returning user view)
    - "Resume" if has current game
    - "Load Game" option available
    - Ready to continue
```

#### Flow D: Import Backup
```
Welcome Screen
    │ click "Import Backup"
    ▼
File picker opens
    │ select file, import succeeds
    ▼
Set hasSeenWelcome = true
Mode stays 'local'
    │
    ▼
StartScreen (returning user view)
    - Shows Resume/Load based on imported data
```

#### Flow E: Import Cancelled
```
Welcome Screen
    │ click "Import Backup"
    ▼
File picker opens
    │ user cancels or import fails
    ▼
Stay on Welcome Screen
    - User can try again or choose different option
```

### Technical Implementation

#### 1. New Component: `WelcomeScreen.tsx`

```typescript
// src/components/WelcomeScreen.tsx

interface WelcomeScreenProps {
  onStartLocal: () => void;
  onSignInCloud: () => void;
  onImportBackup: () => void;
  isCloudAvailable: boolean;
  isImporting: boolean;
}

export default function WelcomeScreen({
  onStartLocal,
  onSignInCloud,
  onImportBackup,
  isCloudAvailable,
  isImporting,
}: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-6">
      <div className="max-w-md w-full space-y-8">
        {/* Logo/Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Welcome to MatchOps!</h1>
          <p className="mt-2 text-slate-400">
            Track your team's games, players, and stats
          </p>
        </div>

        {/* Option Buttons */}
        <div className="space-y-4">
          {/* Start Fresh (Local) */}
          <button
            onClick={onStartLocal}
            className="w-full p-4 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏠</span>
              <div>
                <div className="text-white font-medium">Start Fresh</div>
                <div className="text-slate-400 text-sm">Data stays on this device</div>
              </div>
            </div>
          </button>

          {/* Sign In to Cloud - only if available */}
          {isCloudAvailable && (
            <button
              onClick={onSignInCloud}
              className="w-full p-4 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">☁️</span>
                <div>
                  <div className="text-white font-medium">Sign In to Cloud</div>
                  <div className="text-indigo-200 text-sm">Sync across all your devices</div>
                </div>
              </div>
            </button>
          )}

          {/* Import Backup */}
          <button
            onClick={onImportBackup}
            disabled={isImporting}
            className="w-full p-4 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">📁</span>
              <div>
                <div className="text-white font-medium">
                  {isImporting ? 'Importing...' : 'Import Backup'}
                </div>
                <div className="text-slate-400 text-sm">Restore from exported file</div>
              </div>
            </div>
          </button>
        </div>

        {/* Footer note */}
        <p className="text-center text-slate-500 text-sm">
          You can change this later in Settings
        </p>
      </div>
    </div>
  );
}
```

#### 2. Welcome Flag Management

```typescript
// src/config/backendConfig.ts (add to existing file)

const WELCOME_SEEN_KEY = 'matchops_welcome_seen';

/**
 * Check if user has seen the welcome screen.
 * @returns true if welcome screen has been completed
 */
export function hasSeenWelcome(): boolean {
  if (typeof window === 'undefined') return true; // SSR: skip welcome
  return safeGetItem(WELCOME_SEEN_KEY) === 'true';
}

/**
 * Mark welcome screen as seen.
 * Called after user makes a choice (any of the 3 options).
 */
export function setWelcomeSeen(): void {
  if (typeof window === 'undefined') return;
  safeSetItem(WELCOME_SEEN_KEY, 'true');
}

/**
 * Reset welcome flag (for testing).
 */
export function clearWelcomeSeen(): void {
  if (typeof window === 'undefined') return;
  safeRemoveItem(WELCOME_SEEN_KEY);
}
```

#### 3. Integration in `page.tsx`

```typescript
// src/app/page.tsx - modifications

import WelcomeScreen from '@/components/WelcomeScreen';
import { hasSeenWelcome, setWelcomeSeen } from '@/config/backendConfig';
import { isCloudAvailable, enableCloudMode } from '@/config/backendConfig';

export default function Home() {
  // Existing state...
  const [showWelcome, setShowWelcome] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Check welcome flag on mount
  useEffect(() => {
    if (!hasSeenWelcome()) {
      setShowWelcome(true);
    }
  }, []);

  // Welcome screen handlers
  const handleStartLocal = useCallback(() => {
    setWelcomeSeen();
    setShowWelcome(false);
    // Mode is already 'local' by default
  }, []);

  const handleSignInCloud = useCallback(() => {
    setWelcomeSeen();
    enableCloudMode();
    setShowWelcome(false);
    // Now needsAuth will be true, LoginScreen will show
  }, []);

  const handleImportBackup = useCallback(async () => {
    setIsImporting(true);
    try {
      // Trigger file picker and import
      const success = await importFromFilePicker();
      if (success) {
        setWelcomeSeen();
        setShowWelcome(false);
        setRefreshTrigger(prev => prev + 1);
      }
      // If cancelled/failed, stay on welcome screen
    } finally {
      setIsImporting(false);
    }
  }, []);

  // Render logic - add welcome screen check
  return (
    <ErrorBoundary>
      <ModalProvider>
        {isAuthLoading || isCheckingState ? (
          // Loading spinner...
        ) : showWelcome ? (
          // Welcome screen (first install)
          <WelcomeScreen
            onStartLocal={handleStartLocal}
            onSignInCloud={handleSignInCloud}
            onImportBackup={handleImportBackup}
            isCloudAvailable={isCloudAvailable()}
            isImporting={isImporting}
          />
        ) : needsAuth ? (
          // LoginScreen...
        ) : showMigrationWizard ? (
          // MigrationWizard...
        ) : screen === 'start' ? (
          // StartScreen...
        ) : (
          // HomePage...
        )}
      </ModalProvider>
    </ErrorBoundary>
  );
}
```

#### 4. Import Helper Function

```typescript
// src/utils/importHelper.ts (new file or add to existing utils)

/**
 * Opens file picker and imports backup file.
 * @returns true if import succeeded, false if cancelled or failed
 */
export async function importFromFilePicker(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(false);
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Use existing import logic from DataManagementModal
        await importBackupData(data);
        resolve(true);
      } catch (error) {
        console.error('Import failed:', error);
        // Could show toast here
        resolve(false);
      }
    };

    input.oncancel = () => resolve(false);
    input.click();
  });
}
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/WelcomeScreen.tsx` | **Create** | New welcome screen component |
| `src/config/backendConfig.ts` | Modify | Add welcome flag functions |
| `src/app/page.tsx` | Modify | Integrate welcome screen |
| `src/utils/importHelper.ts` | Create | File picker import utility |
| `src/components/__tests__/WelcomeScreen.test.tsx` | **Create** | Unit tests |

### Testing Checklist

- [ ] Fresh install shows welcome screen
- [ ] "Start Fresh" → local mode → StartScreen (first-time)
- [ ] "Sign In to Cloud" → cloud mode → LoginScreen → StartScreen
- [ ] "Import Backup" → file picker → successful import → StartScreen with data
- [ ] "Import Backup" → cancelled → stays on welcome screen
- [ ] Returning visit (has flag) → skips welcome screen
- [ ] Cloud button hidden when `!isCloudAvailable()`
- [ ] Welcome screen styling matches app theme
- [ ] Works on mobile viewport

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Browser has leftover IndexedDB data | Welcome still shows (flag-based, not data-based) |
| User closes tab during import | Import cancelled, stays on welcome |
| Import file is invalid JSON | Show error, stay on welcome |
| Cloud sign-in fails | Stay on LoginScreen (existing behavior) |
| localStorage blocked | Skip welcome, go to local mode |

### Accessibility

- All buttons have proper focus states
- Screen reader friendly labels
- Keyboard navigation works
- Color contrast meets WCAG AA

---

## Next Steps

1. [x] ~~Review this document and finalize decisions~~
2. [x] ~~**Phase 1**: Implement Flow 4 (auto-fetch on empty device)~~ - Fixed in recent commits
3. [x] ~~**Phase 1**: Add Sign Out button (Flow 6)~~ - Working
4. [ ] **Phase 1.5**: Implement Welcome Screen (PR #12) - **NEXT**
5. [ ] **Phase 2**: Enhance MigrationWizard with download option (Flow 3/5)
6. [ ] **Phase 2**: Add cloud status to Start Screen header
7. [ ] ~~**Phase 2**: Add "Sign In" option for fresh installs on Start Screen~~ - Replaced by Welcome Screen
8. [ ] **Phase 3**: Full Start Screen cloud integration
9. [ ] Test multi-device scenario end-to-end
