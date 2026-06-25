# Deep Code Review — Confirmed Findings (2026-06-25)

**Method:** read-only multi-agent adversarial review. 9 review dimensions (data-persistence, sync, deletion, auth, game-state/timer, performance/memory, stats, UI/orchestration, edge/security) → **37 candidate findings** → an independent skeptic tried to *refute* each → **24 refuted, 13 confirmed**. Two of the confirmed were the same root cause (account-deletion teardown), so **12 distinct issues** below. Severities are the verifiers' final calls (some were tempered from the original — e.g. deletion is "high" not "critical" because the data is soccer stats, not sensitive PII).

**Scope reminder:** findings only. No fixes applied. We triage which to fix and in what order separately.

Priority order: **data-loss / corruption / deletion / auth first**, then logic, then low-impact.

---

## 🔴 HIGH

### H1 · Account deletion never erases the local database (erasure silently fails) — ✅ Fixed in #520
**`src/contexts/AuthProvider.tsx:972-983`** + `src/datastore/userDatabase.ts:169-217`, `src/datastore/factory.ts:414-434`
*(merges two confirmed findings with the same root cause.)*
`deleteAccount()` calls `deleteUserLocalDatabases()` but never closes the open DataStore connection (no `closeDataStore()`/`resetFactory()`). `indexedDB.deleteDatabase()` on an **open** connection fires `onblocked`, which the code treats as success and resolves (3s timeout also resolves anyway) — so the delete never completes. The local mirror of all the user's data (`matchops_user_{id}`, `matchops_sync_queue_{id}`) survives on disk after they delete their account. The in-code comment claiming "sign-out teardown has begun closing the adapter" is factually false for this path. **Triggers on every cloud-mode account deletion.**
**Fix:** `await closeDataStore({ force: true })` (or `resetFactory` + `closeUserStorageAdapter`) *before* `deleteUserLocalDatabases`, so connections release and the delete can complete. *(confidence ~0.8)*

### H2 · Corrupted saved-games blob → next save wipes ALL games — ✅ Fixed in #521
**`src/datastore/LocalDataStore.ts:2651-2668` (loadSavedGames)** feeding `saveGame`/`saveAllGames`/`addGameEvent`
`loadSavedGames()` catches a JSON.parse failure (or non-object value) and returns `{}` (empty). Every mutating method is read-modify-write: it reloads, mutates, then writes the **whole** object back. So if the stored blob is ever corrupt, the read yields `{}` and the next auto-save (which fires constantly during a match) persists only the single active game — **permanently destroying every other saved game**. No user error, no recovery; `storageRecovery` is never invoked on this path. Trigger is external/on-disk IndexedDB corruption or a non-object legacy/migration value (lower probability, catastrophic impact — a whole season's games).
**Fix:** on parse failure, quarantine the bad blob under a timestamped key and/or throw `CORRUPTED_DATA` to abort the destructive overwrite — never silently return `{}` and overwrite. *(confidence ~0.83)*

### H3 · "Save & Continue" discards the game even when the save silently failed — ✅ Fixed in #522
**`src/components/HomePage/hooks/useGameOrchestration.ts:2167-2172`**
The "Save Current Game?" path (new game from an unsaved scratch session) awaits `handleQuickSaveGame()` then unconditionally opens new-game setup. But `handleQuickSaveGame` catches all errors internally and never rethrows, so the `await` resolves even when the save **failed** (quota, IndexedDB error on mobile). The scratch game — which has no auto-save (intentionally disabled for `DEFAULT_GAME_ID`) — is then abandoned and **permanently lost**, despite the user explicitly choosing to save.
**Fix:** have `handleQuickSaveGame` return a boolean / rethrow; only proceed when the save actually succeeded, otherwise keep the dialog open and show an error to retry. *(confidence ~0.72)*

### H4 · exportPlayerExcel double-counts external adjustments
**`src/utils/exportExcel.ts:785-799`**
`playerData` already includes external-adjustment deltas (merged in `useGameStats.ts:158-162`), but the exporter adds the same deltas a second time. The per-player Excel "Player Summary" shows **double** the external games/goals/assists vs the on-screen numbers (and inflated averages/points). Triggers whenever an exported player has any external adjustment.
**Fix:** don't re-add deltas in the exporter — use `playerData.gamesPlayed/goals/assists` directly (single source of truth). *(confidence ~0.85)*

---

## 🟠 MEDIUM

### M1 · `totalGames` counts a 0-game adjustment as 1 game
**`src/utils/playerStats.ts:226-233`** — `sum + (adj?.gamesPlayedDelta || 1)`. A legitimate goals/assists-only correction with `gamesPlayedDelta=0` evaluates `0 || 1 = 1`, inflating total games and skewing `avgGoalsPerGame`/`avgAssistsPerGame`. The per-season path just above correctly uses `|| 0`, so the two are inconsistent.
**Fix:** `adj?.gamesPlayedDelta ?? 1` (nullish). *(confidence ~0.8)*

### M2 · Stale timer anchor survives a game switch → mis-resumes the clock
**`src/components/HomePage/hooks/useGamePersistence.ts:551`** (and `useSavedGameManager.ts:222`). Load paths call `clearTimerState()` (IndexedDB) but not `clearTimerAnchor()` (the localStorage wall-clock anchor). Switch away from a running game without pausing, come back to it, reload → boot replays the stale anchor and attributes the inter-session gap as elapsed match time, auto-resuming a wrong clock. (Bounded by the period cap; affects only the live clock, not saved records.)
**Fix:** `clearTimerAnchor()` alongside `clearTimerState()` in both load paths. *(confidence ~0.72)*

### M3 · Destructive confirm dialogs can double-fire
**`src/components/HomePage/containers/ModalManager.tsx:559-601`** — the noPlayers/hardReset/saveBeforeNew/startNew `ConfirmationModal`s don't pass `isConfirming`, so the confirm button isn't disabled while the async handler is in flight. A mobile double-tap on **saveBeforeNew** fires two concurrent `handleQuickSaveGame()` → two duplicate created games. (The other three are effectively idempotent.) The correct pattern already exists in `GameSettingsModal.tsx:2608`.
**Fix:** pass an in-flight `isConfirming` flag, or set the show-flag `false` synchronously before awaiting. *(confidence ~0.6)*

### M4 · Server-side sign-out can be ignored (UI stays "logged in")
**`src/contexts/AuthProvider.tsx:372-384`** — `onAuthStateChange` ignores *any* `signed_out` event while `hasSignedInThisSessionRef` is true. This swallows **legitimate** server revocations (password changed elsewhere, token revoked, account disabled): the service clears its session but the provider keeps `isAuthenticated` true, so the UI shows logged-in while API calls 401 and sync silently fails until reload. (`updatePassword` already has a manual workaround for this exact guard — confirming it's known.)
**Fix:** honor a genuine `SIGNED_OUT` event; only suppress spurious null-sessions in a narrow post-sign-in window. *(confidence ~0.5)*

---

## 🟡 LOW

### L1 · Fractional pause time not floored
**`src/hooks/useGameSessionReducer.ts:260-276`** — `PAUSE_TIMER` stores the un-floored precise time, leaving `timeElapsedInSeconds` non-integer (everything else uses floored seconds). Can cause a rare off-by-one in sub-due math and a fractional persisted value. **Fix:** `Math.floor(...)` the pause time. *(confidence ~0.35)*

### L2 · Confirmed substitution may not persist immediately
**`src/components/HomePage/hooks/useGamePersistence.ts:478-531`** — `completedIntervalDurations` / `lastSubConfirmationTimeSeconds` aren't in the auto-save watch list, so a sub confirmed mid-running-timer isn't saved until some other watched field changes. If the app is killed first, the interval log is lost and sub alerts shift. **Fix:** add those two fields to the short/immediate watch tier. *(confidence ~0.62)*

### L3 · Modern CSP reports silently dropped
**`src/app/api/csp-report/route.ts:46-47,85-88`** — endpoint only parses the legacy `report-uri` shape; modern Reporting API (`report-to`, which `next.config.ts` also emits) sends a JSON array → throws → caught → 204, never logged to Sentry. Chromium CSP violations aren't monitored. **Fix:** handle both payload shapes. *(confidence ~0.85)*

### L4 · Excel season/tournament fair-play uses player-wide flag
**`src/utils/exportExcel.ts:913,947`** — accumulates `playerData.receivedFairPlayCard` (one roster-level boolean) for every game instead of the per-game snapshot, so the fair-play count equals games-played (or 0). The on-screen stats and the Game History sheet read it correctly per-game. **Fix:** read `game.availablePlayers?.find(p => p.id === playerId)?.receivedFairPlayCard` per game. *(confidence ~0.72)*

---

## Notes
- **Refuted (24)** candidates were dropped by the adversarial pass — e.g. plausible sync/race/leak hypotheses that turned out correct-by-design or unreachable. Good signal-to-noise.
- The original synthesis agent returned a malformed stub; these findings were reconstructed directly from the verified agent transcripts (workflow run `wf_e84d8696-ccd`).
- Themes: the two genuinely scary ones are **H1 (deletion never completes)** and **H2 (corruption → mass wipe)** — both are silent. **H3** is the most *likely* real-world loss (mobile save failure on the explicit save path).
