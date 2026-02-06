# User Flow & Cloud Architecture Testing Plan

**Purpose**: Comprehensive manual testing for auth, data layer, sync, and security.
**Scope**: User flows, data integrity, cloud sync reliability, transform correctness, and edge cases.
**Last Updated**: 2026-02-06

---

## Prerequisites

- Access to staging environment (Vercel preview with Supabase configured)
- At least 2 test accounts (User A, User B)
- A backup file from previous export
- Access to Supabase dashboard (to verify cloud data directly)
- Two devices OR two browser profiles (for multi-device tests)
- DevTools available (for offline simulation, network throttling)

---

## 1. Fresh Install Flows

### 1.1 Fresh Install → Local Mode
- [ ] Open app for first time (clear all data first)
- [ ] Welcome screen appears with 2 primary options
- [ ] Click "Continue Locally"
- [ ] Main app loads with empty state overlay
- [ ] Can dismiss overlay and explore field
- [ ] Banner shows "No game created yet"
- [ ] Refresh page — Welcome screen does NOT reappear

### 1.2 Fresh Install → Create Account → Cloud Mode
- [ ] Open app for first time
- [ ] Click "Continue with Cloud"
- [ ] Login screen appears
- [ ] Create new account with email/password
- [ ] Verify email (check inbox, or auto-verify in staging)
- [ ] Main app loads with empty state
- [ ] Sync indicator shows cloud mode active
- [ ] Refresh page — Welcome screen does NOT reappear

### 1.3 Fresh Install → Import Backup (via footer link)
- [ ] Open app for first time
- [ ] Use "Import a backup" link
- [ ] Select valid backup file
- [ ] Data imports successfully
- [ ] Main app loads with imported data visible
- [ ] Players appear in roster, games in list

---

## 2. Authentication Flows

### 2.1 Sign Up — New Account
- [ ] Enter valid email and strong password (12+ chars, 3 of 4 char types)
- [ ] Account created successfully
- [ ] Redirected to main app or email verification prompt

### 2.2 Sign Up — Password Validation
- [ ] Try password < 12 characters → rejected with clear message
- [ ] Try password with only lowercase letters → rejected (needs 3 of 4 types)
- [ ] Try password "abcdefghijkl" → rejected (only 1 character type)
- [ ] Try "Abcdefgh1234" → accepted (uppercase + lowercase + digits)
- [ ] Validation feedback appears client-side (before server round-trip)

### 2.3 Sign Up — Existing Email
- [ ] Try to sign up with already-used email
- [ ] Error message shown (not leaking whether account exists, or clear "account exists")
- [ ] Prompted to sign in instead

### 2.4 Sign In — Valid Credentials
- [ ] Enter correct email/password
- [ ] Sign in succeeds
- [ ] User data loads (if any exists in cloud)

### 2.5 Sign In — Wrong Password
- [ ] Enter correct email, wrong password
- [ ] Clear error message shown (not leaking implementation details)
- [ ] Can retry

### 2.6 Sign In — Non-existent Account
- [ ] Enter email that doesn't exist
- [ ] Error message shown
- [ ] Can switch to sign up

### 2.7 Password Reset
- [ ] From login screen, click "Forgot password"
- [ ] Enter email address
- [ ] Confirmation shown ("check your email")
- [ ] Email arrives with reset link
- [ ] Click link → set new password (must pass same validation rules)
- [ ] Can sign in with new password
- [ ] Old password no longer works

### 2.8 Session Persistence
- [ ] Sign in to cloud mode
- [ ] Close browser tab completely
- [ ] Reopen app → session restored automatically (no sign-in required)
- [ ] Refresh page → session persists
- [ ] Cloud data loads without re-authentication

### 2.9 Session Expiry
- [ ] Sign in to cloud mode
- [ ] Wait for token to expire (or manually clear Supabase cookies in DevTools)
- [ ] Try to perform an action (save game, add player)
- [ ] App either auto-refreshes token or prompts re-authentication
- [ ] No data loss during re-auth

### 2.10 Auth Init Timeout
- [ ] Simulate very slow network (DevTools → Network → Slow 3G)
- [ ] Open app while signed in
- [ ] If auth init exceeds 30 seconds → retry button should appear
- [ ] Clicking retry → auth initializes successfully

### 2.11 Sign Out
- [ ] While signed in, go to Settings
- [ ] Click Sign Out
- [ ] Returned to Welcome screen (or local mode)
- [ ] Cloud data NOT deleted (preserved in Supabase)
- [ ] Local cache cleared
- [ ] Refresh → cannot access cloud data without signing back in

---

## 3. Data Creation Flows

### 3.1 Create Data in Local Mode
- [ ] In local mode (no account)
- [ ] Create roster (add players with names, jersey numbers)
- [ ] Create a season, a team, a tournament
- [ ] Create and save a game with events
- [ ] Refresh page → all data persists from IndexedDB

### 3.2 Create Data in Cloud Mode
- [ ] Sign in to cloud account
- [ ] Create roster (add players)
- [ ] Create a season, a team, a tournament
- [ ] Create a game, add events, save
- [ ] Check Supabase dashboard → data appears in cloud tables
- [ ] Refresh page → data persists (loaded from cloud, not just local cache)

### 3.3 Verify Cloud Persistence (not just cache)
- [ ] In cloud mode, create a player with a unique name
- [ ] Open a different browser profile (or incognito + sign in)
- [ ] Sign in as same user → player appears
- [ ] This confirms data is in Supabase, not just local IndexedDB

---

## 4. Migration Flows

### 4.1 Local → Cloud (First Time Sign In with Local Data)
- [ ] Start in local mode
- [ ] Create meaningful data: 3+ players, 1 team, 1 season, 2 games with events
- [ ] Go to Settings → sign in to cloud
- [ ] Migration Wizard appears with Sync option
- [ ] Choose to sync local data to cloud
- [ ] Progress indicator during migration
- [ ] Migration completes successfully
- [ ] Verify in Supabase dashboard: all players, teams, seasons, games present
- [ ] Refresh page → data still accessible
- [ ] Refresh again → Migration Wizard does NOT reappear

### 4.2 Local → Cloud ("Not Now" — Start Fresh)
- [ ] Start in local mode with data
- [ ] Go to Settings → sign in to cloud
- [ ] Migration Wizard appears
- [ ] Choose "Not Now" / skip migration
- [ ] Cloud mode starts with empty data
- [ ] Local data is NOT pushed to cloud
- [ ] Verify Supabase dashboard: no game data for this user

### 4.3 Cloud → Local (Sign Out Hydration)
- [ ] In cloud mode with data (players, games, etc.)
- [ ] Sign out
- [ ] Mode switches to local
- [ ] Data hydrated from cloud to local IndexedDB
- [ ] Can view and edit all games, players in local mode
- [ ] Game events, assessments, tactical data all intact

### 4.4 Sign In to Account with Existing Cloud Data
- [ ] Have data in cloud (from previous session)
- [ ] Fresh install or cleared local data
- [ ] Sign in to cloud account
- [ ] Cloud data fetches automatically
- [ ] All data appears in app

---

## 5. Data Transform Verification (Cloud Mode)

These tests verify the 19 transform rules between app state and Supabase tables.

### 5.1 Empty String ↔ NULL (Rule 1)
- [ ] Create a game with NO season, NO tournament, NO league selected
- [ ] Save → reload → those fields show as empty (not "null" text, not broken)
- [ ] Check Supabase: `season_id`, `tournament_id`, `league_id` are NULL (not empty string)
- [ ] Create a game WITH season and tournament selected
- [ ] Save → reload → selections preserved correctly

### 5.2 Legacy Defaults (Rule 2)
- [ ] Create a game, leave homeOrAway as default
- [ ] Save → reload → should show "home" (default)
- [ ] Check Supabase: `home_or_away = 'home'`

### 5.3 Player Array Relationships (Rule 3)
- [ ] Create a game with 15 available players
- [ ] Select 11 players, put 7 on field
- [ ] Save → reload
- [ ] Available players: still 15
- [ ] Selected players: still 11
- [ ] On-field players: still 7, with correct positions on field
- [ ] Verify: all on-field players are also in selected list

### 5.4 Event Ordering (Rule 4)
- [ ] Create a game, add 5 events (goals, subs, etc.)
- [ ] Save → reload → events appear in same order
- [ ] Delete the 2nd and 4th events
- [ ] Save → reload → remaining 3 events in correct order, no gaps
- [ ] Add 2 new events → save → reload → order is: [old1, old3, old5, new1, new2]

### 5.5 Assessment Sliders (Rule 5)
- [ ] End a game, open Player Assessment
- [ ] Rate a player: set all 10 sliders to distinct values (e.g., intensity=8, courage=6, ...)
- [ ] Add a text note
- [ ] Save → reload game → open assessments
- [ ] All 10 slider values match exactly what was set
- [ ] Note text preserved

### 5.6 Tactical Data (Rule 8)
- [ ] In a game, place tactical discs on the field
- [ ] Draw tactical lines/arrows
- [ ] Move the ball position to a specific spot
- [ ] Save → reload
- [ ] Discs in same positions
- [ ] Drawings preserved
- [ ] Ball position matches where you placed it

### 5.7 Game Type — Futsal Round-Trip
- [ ] Create a futsal game (not soccer)
- [ ] Add players, events, save
- [ ] Reload → game type is still futsal
- [ ] Field renders as futsal court (brown/tan, not green)
- [ ] No green flash on load

### 5.8 Game Type — Soccer Round-Trip
- [ ] Create a soccer game
- [ ] Save → reload → game type still soccer
- [ ] Field renders as soccer field (green)

### 5.9 Personnel (Rule 7, Rule 9)
- [ ] Add a personnel member (coach) with certifications
- [ ] Assign them to a game's personnel list
- [ ] Save → reload → personnel member appears in game
- [ ] Certifications field preserved
- [ ] Delete the personnel member from roster
- [ ] Check the game → personnel member removed from game's personnel list too (cascade)

---

## 6. Cloud Sync Reliability

### 6.1 Basic Sync Cycle
- [ ] In cloud mode, online
- [ ] Add a player → sync indicator shows activity → settles to synced
- [ ] Create a game → save → sync completes
- [ ] Verify in Supabase dashboard: data matches

### 6.2 Offline → Queue → Online Sync
- [ ] In cloud mode, go offline (DevTools → Network → Offline)
- [ ] Add a player
- [ ] Save a game
- [ ] UI should remain responsive (writes to local)
- [ ] Sync status shows pending/offline indicator
- [ ] Go back online
- [ ] Pending operations sync automatically
- [ ] Verify in Supabase: data matches
- [ ] Refresh app → data consistent

### 6.3 Rapid Operations
- [ ] In cloud mode, quickly:
  - Add 5 players in rapid succession
  - Create a game, add 3 events quickly
  - Edit game settings, save immediately
- [ ] All operations complete without errors
- [ ] Sync queue processes everything
- [ ] Final state is correct (no lost writes)

### 6.4 Large Data Set
- [ ] In cloud mode, create 10+ games with events and assessments
- [ ] All games sync without timeout
- [ ] Loading game list is responsive
- [ ] Switching between games works smoothly

### 6.5 Sync After App Restart
- [ ] In cloud mode, make changes
- [ ] Close the app/tab before sync completes (if possible)
- [ ] Reopen the app
- [ ] Pending operations should resume and sync
- [ ] No data loss

---

## 7. Multi-Device & User Isolation

### 7.1 Same Account, Two Devices
- [ ] Sign in as User A on Device 1
- [ ] Create players and a game
- [ ] Wait for sync to complete
- [ ] Sign in as User A on Device 2
- [ ] All data appears on Device 2
- [ ] Make change on Device 2 (edit a player name)
- [ ] Refresh Device 1 → change appears

### 7.2 Two Accounts, Same Device — Data Isolation
- [ ] Sign in as User A → create distinctive data (player named "Alice")
- [ ] Sign out
- [ ] Sign in as User B
- [ ] User B sees empty state — NO User A data visible
- [ ] Create data as User B (player named "Bob")
- [ ] Sign out → sign in as User A
- [ ] User A sees "Alice", does NOT see "Bob"
- [ ] No data leakage in any direction

### 7.3 Rapid Account Switching
- [ ] Sign in as User A → verify data loads
- [ ] Sign out → sign in as User B → verify data loads
- [ ] Sign out → sign in as User A again → verify data correct
- [ ] No stale data, no infinite spinners, no errors in console

---

## 8. Import/Export Flows

### 8.1 Export Backup (Local Mode)
- [ ] In local mode with data
- [ ] Go to Settings → Export/Backup
- [ ] Click Export
- [ ] File downloads (JSON)
- [ ] File contains all data (players, games, settings)

### 8.2 Export Backup (Cloud Mode)
- [ ] In cloud mode with data
- [ ] Go to Settings → Export/Backup
- [ ] Click Export
- [ ] File downloads
- [ ] File contains all data

### 8.3 Import Backup (Replace Data)
- [ ] Have some existing data
- [ ] Import a different backup file
- [ ] Warning about replacing data shown
- [ ] Confirm import
- [ ] Old data replaced with backup data

### 8.4 Import Invalid File
- [ ] Try to import non-JSON file
- [ ] Error message shown
- [ ] App state unchanged

---

## 9. Edge Cases & Error Handling

### 9.1 Offline Behavior — Local Mode
- [ ] In local mode, go offline (airplane mode)
- [ ] Can still use app fully: create/edit players, games
- [ ] Data saves to IndexedDB
- [ ] Go back online → no errors, app continues normally

### 9.2 Offline Behavior — Cloud Mode
- [ ] In cloud mode, go offline
- [ ] Warning or indicator shown about offline state
- [ ] Operations either queue for later sync OR show clear error
- [ ] No crashes, no lost state
- [ ] Go online → queued operations sync

### 9.3 Slow Network
- [ ] DevTools → Network → Slow 3G
- [ ] Sign in → may be slow but should complete (or timeout gracefully)
- [ ] Save a game → should not hang indefinitely
- [ ] Sync operations should not stack up and overwhelm

### 9.4 Pending Sync During Sign Out
- [ ] In cloud mode, go offline
- [ ] Make several changes (queue builds up)
- [ ] Try to sign out
- [ ] Warning about pending changes should appear
- [ ] User can choose to discard or cancel sign-out
- [ ] If user discards and signs out → clear communication about data loss

### 9.5 Browser Tab Close During Sync
- [ ] Make changes in cloud mode
- [ ] Close tab immediately (before sync completes)
- [ ] Reopen → pending operations should be in queue
- [ ] Queue processes and syncs

### 9.6 PWA Install + Cloud Mode
- [ ] Install the app as PWA
- [ ] Sign in to cloud mode
- [ ] Close the PWA
- [ ] Reopen → session still active, data loads correctly
- [ ] No re-authentication required

### 9.7 App Update / PWA Refresh
- [ ] Have data in app
- [ ] Update available notification appears
- [ ] Refresh/update app
- [ ] Data still present after update
- [ ] No migration issues

---

## 10. Settings & Account Management

### 10.1 Change Language
- [ ] Go to Settings
- [ ] Switch language (EN ↔ FI)
- [ ] All UI updates immediately (including modals, buttons, labels)
- [ ] Setting persists after refresh
- [ ] Works in both local and cloud mode

### 10.2 Clear Local Data (Cloud Mode)
- [ ] In cloud mode with local cache
- [ ] Settings → Clear Local Data
- [ ] Local data cleared
- [ ] Cloud data intact (verify in Supabase)
- [ ] Re-fetch from cloud works — data reappears

### 10.3 Delete Account
- [ ] In cloud mode
- [ ] Settings → Delete Account
- [ ] Confirm with "DELETE" typed
- [ ] Cloud data deleted (verify in Supabase: all tables empty for this user)
- [ ] Auth account deleted
- [ ] Returned to welcome screen
- [ ] Cannot sign in with same credentials
- [ ] User consent record retained (GDPR legal requirement)

### 10.4 Delete Account — Then Re-register
- [ ] After deleting account (10.3)
- [ ] Sign up with the same email
- [ ] New account created successfully
- [ ] Starts with empty data (no ghost data from old account)

---

## 11. Security & RLS Verification

### 11.1 User Data Isolation via RLS
- [ ] Sign in as User A, create a game, note the game ID from Supabase dashboard
- [ ] Sign in as User B
- [ ] User B cannot see User A's game in the app
- [ ] (Optional) In Supabase SQL editor with User B's JWT: query for User A's game ID → returns empty

### 11.2 Error Messages — No Implementation Leaks
- [ ] Trigger various errors (wrong password, network failure, etc.)
- [ ] Error messages are user-friendly
- [ ] No stack traces, no "mock mode" references, no config details leaked
- [ ] No Supabase internal error codes shown to user

### 11.3 Password Security
- [ ] Weak passwords rejected client-side (before network request)
- [ ] No password shown in URL or logs
- [ ] Password field is type="password" (masked)

---

## Progress Summary

| Section | Tests | Passed | Failed | Status |
|---------|-------|--------|--------|--------|
| 1. Fresh Install | 3 flows | | | Not started |
| 2. Authentication | 11 flows | | | Not started |
| 3. Data Creation | 3 flows | | | Not started |
| 4. Migration | 4 flows | | | Not started |
| 5. Data Transforms | 9 flows | | | Not started |
| 6. Sync Reliability | 5 flows | | | Not started |
| 7. Multi-Device / Isolation | 3 flows | | | Not started |
| 8. Import/Export | 4 flows | | | Not started |
| 9. Edge Cases | 7 flows | | | Not started |
| 10. Settings & Account | 4 flows | | | Not started |
| 11. Security & RLS | 3 flows | | | Not started |
| **Total** | **56 flows** | | | **Not started** |

### Suggested Testing Order

1. **Section 1** (Fresh Install) — establishes baseline
2. **Section 2** (Auth) — must work before anything cloud-related
3. **Section 3** (Data Creation) — basic data layer works
4. **Section 5** (Transforms) — data integrity in cloud mode
5. **Section 4** (Migration) — local ↔ cloud transitions
6. **Section 6** (Sync) — reliability under real conditions
7. **Section 7** (Isolation) — multi-user security
8. **Section 9** (Edge Cases) — stress and failure scenarios
9. **Section 8** (Import/Export) — backup workflows
10. **Section 10** (Settings) — account management
11. **Section 11** (Security) — final verification

---

## Notes & Bugs Found

_Record testing observations, bugs, and follow-up items here._

| # | Section | Description | Severity | Status |
|---|---------|-------------|----------|--------|
| | | | | |
