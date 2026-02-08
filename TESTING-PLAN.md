# Pre-Release Manual Testing Plan

**Device:** Android phone (Chrome Mobile)
**App URL:** https://match-ops-local.vercel.app/
**Goal:** Verify the app is ready for Play Store release

Test in order. Priority 1 issues are ship-blockers. Priority 3 can be fixed post-launch.

---

## Priority 1: Authentication & Security

These must work perfectly. Broken auth = broken app.

### 1.1 Sign Up

- [ ] Open app fresh (clear site data first)
- [ ] WelcomeScreen appears with language toggle and mode options
- [ ] Tap "Use Cloud Sync"
- [ ] Tap "Create account" / sign-up option
- [ ] Enter valid email and password
- [ ] Terms & Privacy checkbox appears — tap to read each link
- [ ] Check the consent box, submit
- [ ] Verify email confirmation is sent
- [ ] After confirming email, app loads successfully

### 1.2 Sign In

- [ ] Sign out if signed in
- [ ] Sign in with the account you just created
- [ ] App loads to StartScreen or last game
- [ ] Your data is present (or empty for new account)

### 1.3 Sign Out

- [ ] Go to Settings > Account
- [ ] Tap Sign Out
- [ ] Confirm sign-out prompt
- [ ] Returns to LoginScreen
- [ ] Cannot access app data without signing in again

### 1.4 Password Reset

- [ ] On LoginScreen, tap "Forgot password?"
- [ ] Enter your email
- [ ] Confirm "reset email sent" message appears
- [ ] Check email for reset link (optional: actually reset)

### 1.5 Re-Consent Flow

- [ ] If the re-consent modal appeared during sign-in, verify:
  - [ ] Shows what changed in terms/privacy
  - [ ] "View updated policies" links work
  - [ ] Accepting proceeds to the app
  - [ ] Declining blocks access (does not let you use the app)

### 1.6 Session Persistence

- [ ] Close the browser tab completely
- [ ] Reopen the app URL
- [ ] You should still be signed in (session persists)

### 1.7 Delete Account

- [ ] Go to Settings > Account > Delete Account
- [ ] Re-authentication prompt appears — enter password
- [ ] Confirm deletion
- [ ] Account is deleted, returns to WelcomeScreen
- [ ] Cannot sign in with the deleted account anymore

---

## Priority 1: Data Integrity & Persistence

### 2.1 Game Save/Load Cycle

- [ ] Create a new game with all fields filled:
  - Team name, opponent, date, location
  - Select 11 players from roster
  - Pick a season, tournament, team
  - Set period duration, number of periods
- [ ] Place players on the field
- [ ] Start the timer, let it run 10+ seconds
- [ ] Log a goal (tap the goal button on timer overlay)
- [ ] Log an opponent goal
- [ ] Stop timer, save game
- [ ] Go to Load Game, find the saved game
- [ ] Load it — verify ALL data is restored:
  - [ ] Score correct
  - [ ] Player positions on field match
  - [ ] Timer shows elapsed time
  - [ ] Events (goals) present in event log
  - [ ] Season/tournament/team links intact
  - [ ] Game date, location, age group all correct

### 2.2 Game State Survives Refresh

- [ ] While in an active game, pull down to refresh (or close and reopen)
- [ ] Game state should be restored (auto-save)
- [ ] Score, timer position, players on field — all intact

### 2.3 Multiple Games

- [ ] Create 3 different games with different teams/dates
- [ ] Save each one
- [ ] Load Game list shows all 3
- [ ] Load each game — data is independent and correct
- [ ] Delete one game
- [ ] Confirm it's gone from the list
- [ ] Other two games are unaffected

### 2.4 Player Data Integrity

- [ ] Add a new player in Roster
- [ ] Edit their name, jersey number, set as goalkeeper
- [ ] Save, close roster, reopen — changes persisted
- [ ] Delete a player who is NOT used in any game
- [ ] Confirm deletion succeeds
- [ ] Try deleting a player used in a saved game
- [ ] Should warn about usage or handle gracefully

### 2.5 Season/Tournament Integrity

- [ ] Create a season with start/end dates, league, age group
- [ ] Create a tournament with series levels
- [ ] Link a game to the season
- [ ] Link a game to the tournament + series
- [ ] Delete the season — should warn about linked games
- [ ] Verify games don't break if references are cleared

---

## Priority 1: Cloud Sync (Cloud Mode)

### 3.1 Initial Data Migration (Local to Cloud)

- [ ] If you have local data: go to Settings > Data > Sync to Cloud
- [ ] MigrationWizard shows data preview (player/game/team counts)
- [ ] Tap "Sync to Cloud"
- [ ] Progress bar advances through entities
- [ ] Completes successfully — data now visible in cloud mode

### 3.2 Incremental Sync

- [ ] Make a change (edit a player name)
- [ ] Sync status indicator shows "Syncing..."
- [ ] After sync completes, shows green checkmark
- [ ] Open the app on a different device/browser (same account)
- [ ] The change should appear on the other device

### 3.3 Sync After Offline

- [ ] Turn on airplane mode
- [ ] Make changes (edit a game, add a player)
- [ ] Notice sync status shows "Offline" or "Pending"
- [ ] Turn off airplane mode
- [ ] Changes sync automatically
- [ ] Verify data is correct after sync

### 3.4 Sync Status Display

- [ ] In Settings > Cloud sync section:
  - [ ] Current mode shown correctly
  - [ ] Last synced timestamp is recent
  - [ ] Pending changes count is 0 when everything is synced
  - [ ] "Sync Now" button triggers immediate sync

### 3.5 Cloud to Local Migration

- [ ] If testing reverse migration: Settings > Switch to Local
- [ ] Data downloads from cloud to local
- [ ] App works in local mode with all data intact

---

## Priority 2: Core Game Features

### 4.1 Timer Operations

- [ ] Start timer — counts up smoothly
- [ ] Pause timer — stops counting
- [ ] Resume timer — continues from where it stopped
- [ ] Timer overlay shows correct time
- [ ] Period transitions work (Period 1 → Period 2)
- [ ] Sub-interval alerts appear at correct intervals
- [ ] Confirm substitution — logs the event
- [ ] End game after final period

### 4.2 Scoring

- [ ] Tap goal button — score increments for home team
- [ ] Tap opponent goal — score increments for away team
- [ ] Score never goes below 0
- [ ] Goal events appear in the event log with correct time
- [ ] Can assign scorer and assister from player list

### 4.3 Field Interactions

- [ ] Drag a player from PlayerBar to the field
- [ ] Player disc appears at drop position
- [ ] Drag player to new position on field — smooth movement
- [ ] Double-tap player to remove from field
- [ ] Player returns to PlayerBar
- [ ] Place All Players button — fills field with formation
- [ ] Reset Field — clears all players from field
- [ ] Toggle player names on/off

### 4.4 Undo/Redo

- [ ] Place a player on field
- [ ] Undo — player removed
- [ ] Redo — player placed back
- [ ] Works for multiple consecutive actions
- [ ] Works for scoring actions too

### 4.5 Substitution Flow

- [ ] Start a game with timer running
- [ ] When sub interval alert appears:
  - [ ] Alert is visible and clear
  - [ ] Can confirm or dismiss
  - [ ] Sub history is recorded
- [ ] Move players between field and bar (substitution)
- [ ] Sub events logged with correct time

### 4.6 Event Log

- [ ] Open Game Settings > Events tab
- [ ] All logged events visible (goals, subs, etc.)
- [ ] Events show correct time
- [ ] Can delete an event
- [ ] Event deletion updates the score correctly

### 4.7 Game Notes

- [ ] Open Game Settings > Notes
- [ ] Type notes, save
- [ ] Close and reopen — notes persisted
- [ ] Notes appear in game stats export

---

## Priority 2: Team & Roster Management

### 5.1 Team CRUD

- [ ] Create a new team with name, color, age group
- [ ] Bind team to a season
- [ ] Edit team details — changes save
- [ ] Team appears in team selection dropdowns (new game, etc.)
- [ ] Archive a team — disappears from active lists
- [ ] Show archived toggle — archived team reappears
- [ ] Unarchive — returns to active list
- [ ] Delete team (no linked games) — removed

### 5.2 Team Roster

- [ ] Open a team, go to Roster tab
- [ ] Add players from master roster
- [ ] Remove a player from team roster
- [ ] When creating a game with this team selected:
  - [ ] Team roster players appear as available
  - [ ] Can select which ones to include in game

### 5.3 Personnel

- [ ] Add a coach: name, role (Head Coach), phone, email
- [ ] Add a physio
- [ ] Edit personnel details
- [ ] Delete personnel member
- [ ] In new game setup, select personnel for the game
- [ ] Saved game shows personnel in game settings

---

## Priority 2: Seasons & Tournaments

### 6.1 Season CRUD

- [ ] Create a season: name, dates, age group, game type
- [ ] Select a league from Finnish presets
  - [ ] Area filter works (South, West, etc.)
  - [ ] Level filter works (National, Regional, etc.)
- [ ] Custom league name works if no preset
- [ ] Edit season — changes save
- [ ] Archive season
- [ ] Delete season (check linked games warning)

### 6.2 Tournament CRUD

- [ ] Create a tournament: name, dates, location
- [ ] Add tournament series (e.g., "A-level", "B-level")
- [ ] Edit series levels
- [ ] Remove a series
- [ ] Archive tournament
- [ ] Delete tournament

### 6.3 Game-Competition Linking

- [ ] Create game linked to a season
- [ ] Create game linked to tournament + series
- [ ] In Game Stats, filter by season — only linked games show
- [ ] Filter by tournament — only linked games show
- [ ] Stats (goals, wins) compute correctly for filtered view

---

## Priority 2: Stats & Assessment

### 7.1 Player Assessment

- [ ] End a game (or open a saved finished game)
- [ ] Open Player Assessment
- [ ] Select a player — expand their card
- [ ] Adjust overall rating
- [ ] Move all 10 sliders to different values
- [ ] Add a note for the player
- [ ] Save — checkmark appears, card collapses
- [ ] Progress header updates (1/N assessed)
- [ ] Close and reopen — ratings persisted
- [ ] Rate all players — progress shows complete

### 7.2 Game Stats

- [ ] Open Game Stats modal
- [ ] Current Game tab shows:
  - [ ] Score, teams, date
  - [ ] Player stats (goals, assists, time)
  - [ ] Events list
  - [ ] Performance ratings (if assessed)
- [ ] Season tab shows aggregate stats
- [ ] Tournament tab shows aggregate stats
- [ ] Player tab shows individual player detail
- [ ] Filters work (game type, season, team)

### 7.3 Player Stats View

- [ ] Open a player's individual stats
- [ ] Games played count is correct
- [ ] Goals/assists/points tally correctly
- [ ] Performance metrics show averages
- [ ] Filter by season — stats update
- [ ] Filter by tournament — stats update

### 7.4 Export

- [ ] Export single game as JSON — file downloads
- [ ] Export single game as Excel — file downloads
- [ ] Export all games as JSON
- [ ] Open exported file — data looks correct

---

## Priority 2: Data Management

### 8.1 Full Backup

- [ ] Settings > Data > Backup All Data
- [ ] File downloads (JSON)
- [ ] File is non-empty and contains recognizable data

### 8.2 Restore from Backup

- [ ] Settings > Data > Restore from Backup
- [ ] Select the backup file created above
- [ ] Results modal shows what was imported
- [ ] App reloads with restored data
- [ ] All entities present (players, teams, seasons, games)

### 8.3 Game Import

- [ ] Export a single game to JSON
- [ ] Delete that game from the app
- [ ] Import the exported JSON file
- [ ] Import results show success
- [ ] Game is back in Load Game list
- [ ] Player mapping handled correctly

---

## Priority 3: Settings & Preferences

### 9.1 Language

- [ ] Switch language EN → FI
- [ ] All visible UI text changes to Finnish
- [ ] Switch back FI → EN
- [ ] All text is English again
- [ ] Language persists after closing and reopening

### 9.2 Default Team Name

- [ ] Set a default team name in Settings
- [ ] Create a new game — team name pre-filled

### 9.3 App Guide

- [ ] Reset app guide in Settings
- [ ] First-time guide should reappear

---

## Priority 3: PWA & Offline

### 10.1 PWA Install

- [ ] Open app in Chrome on Android
- [ ] Install prompt appears (or use browser menu > Add to Home Screen)
- [ ] App installs to home screen
- [ ] Opens in standalone mode (no browser chrome)

### 10.2 Offline Mode (Local Mode)

- [ ] Switch to local mode (or use without account)
- [ ] Turn on airplane mode
- [ ] Open the app — it loads from cache
- [ ] Can view saved games
- [ ] Can make changes (create game, edit roster)
- [ ] Turn off airplane mode — app continues working

### 10.3 App Update Detection

- [ ] After a new deployment, open the installed PWA
- [ ] Update banner should appear (if service worker detects changes)
- [ ] Tapping "Update" reloads with new version

---

## Priority 3: UI & Polish

### 11.1 Screen Rotation

- [ ] Rotate phone to landscape — layout adjusts
- [ ] Field view is usable in both orientations
- [ ] Modals don't break or overflow

### 11.2 Modal Behavior

- [ ] Open any modal — backdrop appears
- [ ] Tap backdrop — modal closes
- [ ] Scroll within long modals (Game Settings, Stats)
- [ ] Open modals sequentially — no stacking issues
- [ ] Hardware back button closes modal (Android)

### 11.3 Toast Notifications

- [ ] Trigger a save — success toast appears (green)
- [ ] Trigger an error (e.g., go offline and try cloud action) — error toast (red)
- [ ] Toasts auto-dismiss after a few seconds
- [ ] Multiple toasts don't pile up excessively

### 11.4 Loading States

- [ ] When loading games/data — spinner or skeleton visible
- [ ] No blank screens during data fetches
- [ ] Error states show helpful messages, not raw errors

### 11.5 Tactics Board

- [ ] Enable drawing mode from field tools
- [ ] Draw lines on the field
- [ ] Add tactical discs
- [ ] Place ball marker
- [ ] Clear all drawings
- [ ] Undo drawing actions

### 11.6 Wake Lock

- [ ] During live game with timer running
- [ ] Screen should NOT auto-lock
- [ ] When timer is paused/game ends, wake lock releases

---

## Priority 3: Premium & Billing

### 12.1 Free Limits

- [ ] In free mode, try exceeding limits:
  - [ ] Create >1 team — upgrade prompt appears
  - [ ] Add >18 players — upgrade prompt appears
  - [ ] Create >1 season — upgrade prompt appears
- [ ] Prompt shows correct limits and feature list
- [ ] "Not now" dismisses the prompt

### 12.2 Premium Status Display

- [ ] Settings > Premium tab shows current status
- [ ] Free users see upgrade option
- [ ] Premium users see active subscription

---

## Priority 3: Resources & Help

### 13.1 Training Resources

- [ ] Open Training Resources from menu
- [ ] Warmup Plan loads — can edit sections
- [ ] Save changes to warmup plan
- [ ] Example Drills section visible

### 13.2 Rules Directory

- [ ] Open Rules Directory from menu
- [ ] Links to official rules PDFs work (open in browser)

### 13.3 Legal Pages

- [ ] Privacy Policy page loads: /privacy-policy
- [ ] Terms of Service page loads: /terms
- [ ] Content is readable and up to date

---

## Post-Testing Notes

Use this section to track issues found during testing:

### Ship-Blockers (must fix before release)

| # | Description | Priority | Status |
|---|-------------|----------|--------|
|   |             |          |        |

### Minor Issues (can fix after release)

| # | Description | Priority | Status |
|---|-------------|----------|--------|
|   |             |          |        |

### Observations

_Notes about UX, performance, or things to improve later:_

-
-
-
