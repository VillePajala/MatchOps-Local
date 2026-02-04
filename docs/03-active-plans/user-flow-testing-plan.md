# User Flow Testing Plan

**Purpose**: Test all structural user paths for auth, data, and sync flows.
**Scope**: Flow structure only - not business logic (game scoring, stats, etc.)
**Last Updated**: 2026-02-03

---

## Prerequisites

- Access to staging environment (Vercel preview)
- At least 2 test accounts (User A, User B)
- A backup file from previous export
- Access to Supabase dashboard (to verify cloud data)
- Two devices OR two browser profiles (for multi-device tests)

---

## 1. Fresh Install Flows

### 1.1 Fresh Install → Local Mode
- [ ] Open app for first time (clear all data first)
- [ ] Welcome screen appears with 3 options
- [ ] Click "Start without an account"
- [ ] Main app loads with empty state overlay
- [ ] Can dismiss overlay and explore field
- [ ] Banner shows "No game created yet"

### 1.2 Fresh Install → Create Account → Cloud Mode
- [ ] Open app for first time
- [ ] Click "Sign in or create an account"
- [ ] Create new account with email/password
- [ ] Verify email (or auto-verify in staging)
- [ ] Main app loads with empty state
- [ ] Sync indicator shows cloud mode

### 1.3 Fresh Install → Import Backup
- [ ] Open app for first time
- [ ] Click "Import a backup"
- [ ] Select valid backup file
- [ ] Data imports successfully
- [ ] Main app loads with imported data visible
- [ ] Players appear in roster, games in list, etc.

---

## 2. Authentication Flows

### 2.1 Sign Up - New Account
- [ ] Enter valid email and password
- [ ] Account created successfully
- [ ] Redirected to main app

### 2.2 Sign Up - Existing Email
- [ ] Try to sign up with already-used email
- [ ] Error message shown (account exists)
- [ ] Prompted to sign in instead

### 2.3 Sign In - Valid Credentials
- [ ] Enter correct email/password
- [ ] Sign in succeeds
- [ ] User data loads (if any exists)

### 2.4 Sign In - Wrong Password
- [ ] Enter correct email, wrong password
- [ ] Error message shown
- [ ] Can retry

### 2.5 Sign In - Non-existent Account
- [ ] Enter email that doesn't exist
- [ ] Error message shown
- [ ] Can switch to sign up

### 2.6 Sign Out
- [ ] While signed in, go to Settings
- [ ] Click Sign Out
- [ ] Returned to Welcome screen (or local mode)
- [ ] Local data cleared (cloud data preserved)

---

## 3. Data Creation Flows

### 3.1 Create Data in Local Mode
- [ ] In local mode (no account)
- [ ] Create roster (add players)
- [ ] Create a game
- [ ] Save game with some data
- [ ] Refresh page - data persists

### 3.2 Create Data in Cloud Mode
- [ ] Sign in to cloud account
- [ ] Create roster (add players)
- [ ] Create a game
- [ ] Save game with some data
- [ ] Check Supabase - data appears in cloud
- [ ] Refresh page - data persists

---

## 4. Migration Flows

### 4.1 Local → Cloud (First Time Sign In with Local Data)
- [ ] Start in local mode
- [ ] Create some data (players, games)
- [ ] Go to Settings → Sign in to cloud
- [ ] Migration wizard appears
- [ ] Choose to sync local data to cloud
- [ ] Data uploads to cloud successfully
- [ ] Verify in Supabase dashboard

### 4.2 Cloud → Local (Disable Sync)
- [ ] In cloud mode with data
- [ ] Go to Settings → Disable cloud sync
- [ ] Option to download data first
- [ ] Download data
- [ ] Switch to local mode
- [ ] Data preserved locally

### 4.3 Sign In to Account with Existing Cloud Data
- [ ] Have data in cloud (from previous session)
- [ ] Fresh install or cleared local data
- [ ] Sign in to account
- [ ] Cloud data fetches automatically
- [ ] All data appears in app

---

## 5. Import/Export Flows

### 5.1 Export Backup (Local Mode)
- [ ] In local mode with data
- [ ] Go to Settings → Export/Backup
- [ ] Click Export
- [ ] File downloads (JSON)
- [ ] File contains all data (players, games, settings)

### 5.2 Export Backup (Cloud Mode)
- [ ] In cloud mode with data
- [ ] Go to Settings → Export/Backup
- [ ] Click Export
- [ ] File downloads
- [ ] File contains all data

### 5.3 Import Backup (Replace Data)
- [ ] Have some existing data
- [ ] Import a different backup file
- [ ] Warning about replacing data shown
- [ ] Confirm import
- [ ] Old data replaced with backup data

### 5.4 Import Invalid File
- [ ] Try to import non-JSON file
- [ ] Error message shown
- [ ] App state unchanged

---

## 6. Multi-Device / User Isolation

### 6.1 Same Account, Two Devices
- [ ] Sign in as User A on Device 1
- [ ] Create some data
- [ ] Wait for sync
- [ ] Sign in as User A on Device 2
- [ ] Data appears on Device 2
- [ ] Make change on Device 2
- [ ] Change appears on Device 1 (after refresh/sync)

### 6.2 Two Accounts, Same Device
- [ ] Sign in as User A
- [ ] Create data
- [ ] Sign out
- [ ] Sign in as User B
- [ ] User B sees empty state (not User A's data)
- [ ] Create data as User B
- [ ] Sign out, sign in as User A
- [ ] User A's data intact, no User B data visible

---

## 7. Edge Cases

### 7.1 Offline Behavior (Local Mode)
- [ ] In local mode
- [ ] Go offline (airplane mode)
- [ ] Can still use app, create/edit data
- [ ] Data saves to IndexedDB

### 7.2 Offline Behavior (Cloud Mode)
- [ ] In cloud mode
- [ ] Go offline
- [ ] Warning shown about offline state
- [ ] Changes queue for later sync (or blocked)

### 7.3 Session Expiry
- [ ] Sign in to cloud mode
- [ ] Wait for session to expire (or manually clear)
- [ ] Try to perform action
- [ ] Prompted to re-authenticate

### 7.4 App Update / PWA Refresh
- [ ] Have data in app
- [ ] Update available notification
- [ ] Refresh/update app
- [ ] Data still present after update

---

## 8. Settings & Account Management

### 8.1 Change Language
- [ ] Go to Settings
- [ ] Switch language (EN ↔ FI)
- [ ] UI updates immediately
- [ ] Persists after refresh

### 8.2 Clear Local Data (Cloud Mode)
- [ ] In cloud mode with local cache
- [ ] Settings → Clear Local Data
- [ ] Local data cleared
- [ ] Cloud data intact
- [ ] Re-fetch from cloud works

### 8.3 Delete Account
- [ ] In cloud mode
- [ ] Settings → Delete Account
- [ ] Confirm with "DELETE"
- [ ] Cloud data deleted
- [ ] Account deleted
- [ ] Returned to welcome screen
- [ ] Cannot sign in with same credentials

---

## Progress Summary

| Section | Tests | Passed | Status |
|---------|-------|--------|--------|
| 1. Fresh Install | 3 | 0 | Not started |
| 2. Authentication | 6 | 0 | Not started |
| 3. Data Creation | 2 | 0 | Not started |
| 4. Migration | 3 | 0 | Not started |
| 5. Import/Export | 4 | 0 | Not started |
| 6. Multi-Device | 2 | 0 | Not started |
| 7. Edge Cases | 4 | 0 | Not started |
| 8. Settings | 3 | 0 | Not started |
| **Total** | **27** | **0** | **Not started** |

---

## Notes

_Add testing notes, bugs found, or observations here._
