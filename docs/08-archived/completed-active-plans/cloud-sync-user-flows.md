# Cloud Sync User Flows

**Status**: Planning (Updated per Issue #336)
**Created**: 2026-01-22
**Updated**: 2026-01-28
**Purpose**: Define all cloud sync scenarios and their expected behaviors

---

## Overview

### Key Principle: Sign-In ≠ Cloud Mode

**Authentication and sync are separate concepts:**
- **Sign-in** = Create/access an account (for future features, upgrade path)
- **Enable sync** = Turn on cloud mode (subscriber-only feature)

A user can be signed in but still use local mode. Cloud sync is an **explicit toggle** available only to subscribers.

### Mode/Sync Matrix (Source of Truth)

| User State | Mode | Sync | Storage | Limits |
|------------|------|------|---------|--------|
| No account | Local | OFF | IndexedDB | None |
| Free account (signed in) | Local | OFF | IndexedDB | None |
| Subscriber + sync OFF | Local | OFF | IndexedDB | None |
| Subscriber + sync ON | Cloud | ON | Supabase | None |

### Storage Modes

- **Local mode**: Data stored in browser IndexedDB, works offline, device-specific, unlimited
- **Cloud mode**: Data stored in Supabase, syncs across devices, requires active subscription

This document defines how the app should behave in all cloud sync scenarios.

---

## User Flows Matrix

| # | Scenario | Account | Subscription | Sync | Expected Behavior |
|---|----------|---------|--------------|------|-------------------|
| 1 | Fresh install, stays local | None | No | OFF | Works in local mode |
| 2 | Create free account | Free | No | OFF | Account created, stays local mode |
| 3 | Free user tries to enable sync | Free | No | OFF | Show "Subscribe to enable sync" |
| 4 | Subscribe (first time) | Subscriber | Yes | OFF→ON | Post-payment prompt: "Enable sync now?" |
| 5 | Subscriber enables sync (no local data) | Subscriber | Yes | ON | Switch to cloud, auto-fetch if cloud has data |
| 6 | Subscriber enables sync (has local data) | Subscriber | Yes | ON | Migration wizard (upload/download/merge) |
| 7 | Subscriber disables sync | Subscriber | Yes | ON→OFF | Offer to download, switch to local mode |
| 8 | Sign out (any user) | Any→None | - | OFF | Clear cache, stay/switch to local mode |
| 9 | Subscription expires | Expired | No | ON→OFF | Auto-disable sync, switch to local, keep data |

---

## Detailed Flow Specifications

### Flow 2: Create Free Account

**Trigger**: User clicks "Sign In" or "Create Account" on Welcome Screen or Settings

**Expected behavior**:
```
┌─────────────────────────────────────────────────────────────┐
│  User clicks "Sign In" / "Create Account"                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  LoginScreen: Enter email, receive magic link               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Account created/accessed                                   │
│  User is now AUTHENTICATED but still in LOCAL MODE          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Show welcome message:                                      │
│  "Welcome! Your data stays on this device.                  │
│   Subscribe to sync across all your devices."               │
└─────────────────────────────────────────────────────────────┘
```

**Key point**: Sign-in does NOT enable cloud mode. User stays in local mode.

---

### Flow 3: Free User Tries to Enable Sync

**Trigger**: Free user clicks "Enable Sync" toggle in Settings

**Expected behavior**:
```
┌─────────────────────────────────────────────────────────────┐
│  Free user clicks "Enable Cloud Sync"                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Show upgrade prompt:                                       │
│  "Cloud sync is a Premium feature.                          │
│   Subscribe to sync your data across all devices."          │
│                                                             │
│   [Subscribe Now]          [Maybe Later]                    │
└─────────────────────────────────────────────────────────────┘
```

**Key point**: Sync toggle is disabled/shows prompt for free users.

---

### Flow 4: Post-Subscription Sync Prompt

**Trigger**: User completes subscription payment

**Expected behavior**:
```
┌─────────────────────────────────────────────────────────────┐
│  Payment successful!                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Show sync prompt:                                          │
│  "🎉 Welcome to Premium!                                    │
│                                                             │
│   Would you like to enable cloud sync now?                  │
│   Your data will sync across all your devices.              │
│                                                             │
│   [Enable Sync Now]        [Maybe Later]                    │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
       Enable Sync Now              Maybe Later
              │                           │
              ▼                           ▼
       Go to Flow 5 or 6          Stay in local mode
       (based on local data)      (can enable later)
```

---

### Flow 5: Subscriber Enables Sync (No Local Data)

**Trigger**: Subscriber enables sync on empty device

**Expected behavior**:
```
┌─────────────────────────────────────────────────────────────┐
│  Subscriber clicks "Enable Cloud Sync"                      │
│  Device has NO local data                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Check: Does cloud have data?                               │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
┌─────────────────────┐       ┌─────────────────────────────┐
│  Cloud has data     │       │  Cloud is empty             │
│  → AUTO-FETCH       │       │  → Switch to cloud mode     │
│  → "Syncing..."     │       │  → Fresh start              │
│  → Display data     │       │  → Ready to use             │
└─────────────────────┘       └─────────────────────────────┘
```

**Implementation**:
```typescript
const handleEnableSync = async () => {
  // Subscriber enabling sync
  const localHasData = await hasLocalDataToMigrate();

  if (!localHasData.hasData) {
    // Empty device - check cloud
    const cloudHasData = await hasCloudDataToDownload();

    if (cloudHasData) {
      // Auto-fetch from cloud
      enableCloudMode();
      await queryClient.refetchQueries();
      showToast('Synced from cloud', 'success');
    } else {
      // Both empty - just switch modes
      enableCloudMode();
      showToast('Cloud sync enabled', 'success');
    }
  } else {
    // Device has local data - show migration wizard (existing flow)
    setShowMigrationWizard(true);
  }
};
```

---

### Flow 6: Subscriber Enables Sync (Has Local Data)

**Trigger**: Subscriber enables sync on device that has local data

**Expected behavior**:

Show migration wizard with clear choices:

```
┌─────────────────────────────────────────────────────────────┐
│  Enable Cloud Sync                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You have data on this device.                              │
│  Local: 15 players, 8 games, 2 seasons                      │
│  Cloud: 12 players, 5 games, 1 season (or "empty")          │
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
│  │  ❌ Cancel                                          │   │
│  │  Stay in local mode                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Notes**:
- Merge option deferred (complex ID conflicts)
- For MVP: Upload OR Download, not both

---

### Flow 7: Subscriber Disables Sync

**Trigger**: Subscriber toggles "Cloud Sync" OFF in Settings

**Expected behavior**:

```
┌─────────────────────────────────────────────────────────────┐
│  Disable Cloud Sync?                                        │
├─────────────────────────────────────────────────────────────┤
│  Your data will remain safely in the cloud.                 │
│                                                             │
│  What would you like to do with this device?                │
│                                                             │
│  ○ Download a copy to this device                           │
│    (Continue using app offline with local data)             │
│                                                             │
│  ○ Don't download (fresh local start)                       │
│    (Cloud data stays safe, local will be empty)             │
│                                                             │
│  [Cancel]                              [Disable Sync]       │
└─────────────────────────────────────────────────────────────┘
```

**After disable**:
- `syncEnabled` = false
- Mode switches to 'local'
- User stays authenticated (can re-enable sync later)

---

### Flow 8: Sign Out

**Trigger**: User clicks "Sign Out" in Settings

**Expected behavior**:

1. Show confirmation if in cloud mode:
   ```
   Sign out will switch to local mode.
   Your cloud data remains safe.
   [Cancel]  [Sign Out]
   ```
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

### Flow 9: Subscription Expires

**Trigger**: User's subscription lapses (payment failed, cancelled, etc.)

**Expected behavior**:
1. Auto-disable sync (can't use cloud without subscription)
2. Download cloud data to local (preserve user's work)
3. Switch to local mode
4. Show message: "Subscription expired. Your data has been saved locally."
5. User stays authenticated (can resubscribe and re-enable sync)

---

## Implementation Priority

### Phase 1: Critical (Must Have)

1. **Separate sign-in from sync** (Issue #336 core change)
   - Sign-in creates account only, stays local
   - Sync is explicit toggle for subscribers

2. **Post-subscription sync prompt**
   - After payment, ask "Enable sync now?"

3. **Flow 5: Auto-fetch on empty device**
   - When subscriber enables sync on empty device

### Phase 2: Important (Should Have)

4. **Flow 6: Migration wizard for local data**
   - Upload/Download choice when enabling sync with local data

5. **Flow 7: Disable sync with download**
   - Reverse migration when disabling sync

6. **Flow 8: Sign out**
   - Clean up and switch to local

### Phase 3: Nice to Have

7. **Switch accounts**
   - Combines sign out + sign in

8. **Merge functionality**
   - Complex due to ID conflicts

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
│  Create an account for future features and upgrades         │
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

**After successful login (IMPORTANT: stays in LOCAL mode)**:
- Show welcome message: "Welcome! Your data stays on this device."
- If subscriber → show "Enable cloud sync?" prompt
- If free user → show "Subscribe to sync across devices"
- User continues in LOCAL mode until they explicitly enable sync

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
│   │   👤  Sign In                                       │   │
│   │   Create account or access existing                 │   │
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

**Note**: "Sign In" button only shows if `isCloudAvailable() === true`

**IMPORTANT (Issue #336)**: Sign-in does NOT enable cloud mode. User stays in local mode after sign-in. Cloud sync requires subscription + explicit enable.

### User Flow Diagrams

#### Flow A: Start Fresh (Local, No Account)
```
Welcome Screen
    │ click "Start Fresh"
    ▼
Set hasSeenWelcome = true (localStorage)
Mode stays 'local', no account
    │
    ▼
StartScreen (first-time user view)
    - "Get Started" button prominent
    - No Resume/Load options
    │ click "Get Started"
    ▼
HomePage with first-time guidance
```

#### Flow B: Sign In (Creates Account, STAYS LOCAL)
```
Welcome Screen
    │ click "Sign In"
    ▼
Set hasSeenWelcome = true
    │
    ▼
LoginScreen
    │ user signs in / creates account
    ▼
Show welcome message:
"Welcome! Your data stays on this device.
 Subscribe to sync across devices."
    │
    ▼
MODE STAYS 'LOCAL' (not cloud!)
User has account but no sync
    │
    ▼
StartScreen (first-time user view)
```

#### Flow C: Sign In (Returning Subscriber Who Had Sync Enabled)
```
Welcome Screen
    │ click "Sign In"
    ▼
Set hasSeenWelcome = true
    │
    ▼
LoginScreen
    │ user signs in
    ▼
Check: Was sync previously enabled for this account?
    │ yes (subscriber with sync preference)
    ▼
Prompt: "Welcome back! Enable cloud sync?"
    │ yes
    ▼
Enable cloud mode, fetch cloud data
    │
    ▼
StartScreen (returning user view)
    - "Resume" if has current game
    - "Load Game" option available
    - Data synced from cloud
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
  onSignIn: () => void;        // Note: Sign-in only, NOT "sign in to cloud"
  onImportBackup: () => void;
  isCloudAvailable: boolean;   // Show sign-in button only if cloud backend available
  isImporting: boolean;
}

export default function WelcomeScreen({
  onStartLocal,
  onSignIn,
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

          {/* Sign In - only if cloud available (for future features) */}
          {isCloudAvailable && (
            <button
              onClick={onSignIn}
              className="w-full p-4 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">👤</span>
                <div>
                  <div className="text-white font-medium">Sign In</div>
                  <div className="text-slate-400 text-sm">Create account or access existing</div>
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
import { isCloudAvailable } from '@/config/backendConfig';

export default function Home() {
  // Existing state...
  const [showWelcome, setShowWelcome] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showLoginScreen, setShowLoginScreen] = useState(false);

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
    // Mode stays 'local', no account
  }, []);

  // IMPORTANT (Issue #336): Sign-in does NOT enable cloud mode
  // User creates/accesses account but stays in local mode
  const handleSignIn = useCallback(() => {
    setWelcomeSeen();
    setShowWelcome(false);
    setShowLoginScreen(true);
    // NOTE: Do NOT call enableCloudMode() here!
    // After login, user stays in local mode
    // Cloud sync requires subscription + explicit enable
  }, []);

  const handleImportBackup = useCallback(async () => {
    setIsImporting(true);
    try {
      const success = await importFromFilePicker();
      if (success) {
        setWelcomeSeen();
        setShowWelcome(false);
        setRefreshTrigger(prev => prev + 1);
      }
    } finally {
      setIsImporting(false);
    }
  }, []);

  // After successful login, show welcome message (stays in local mode)
  const handleLoginSuccess = useCallback(() => {
    setShowLoginScreen(false);
    showToast('Welcome! Your data stays on this device. Subscribe to sync across devices.');
    // User is now authenticated but still in LOCAL mode
  }, []);

  // Render logic
  return (
    <ErrorBoundary>
      <ModalProvider>
        {isAuthLoading || isCheckingState ? (
          // Loading spinner...
        ) : showWelcome ? (
          <WelcomeScreen
            onStartLocal={handleStartLocal}
            onSignIn={handleSignIn}
            onImportBackup={handleImportBackup}
            isCloudAvailable={isCloudAvailable()}
            isImporting={isImporting}
          />
        ) : showLoginScreen ? (
          <LoginScreen onSuccess={handleLoginSuccess} />
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
