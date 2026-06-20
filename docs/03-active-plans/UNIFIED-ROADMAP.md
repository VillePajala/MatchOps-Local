# MatchOps-Local: Unified Project Roadmap

**Last Updated**: 2026-06-10
**Status**: 🚀 **LIVE IN PRODUCTION** (Google Play, released 2026-06-09) · **Free** (no billing)
**Purpose**: Single, prioritized source of truth for remaining work.

> Consolidated and triaged post-launch (2026-06-10). Monetization is parked (going free).
> Completed/scrapped plans were archived to `docs/08-archived/completed-active-plans/`.
> Speculative feature ideas live in `docs/04-features/future-vision.md` — not deleted, just
> off the active roadmap. Preserved code snapshots: git tags `archive/pre-cloud-backup`,
> `archive/planner-integration`, `archive/desktop-responsive-modals`.

Priorities are **P0 (do first) → P4 (someday)**, ordered by what matters most for a free,
solo-maintained, just-launched app: live correctness first, then observability, then UX, then
features, then big bets.

---

## 🔴 P0 — Fix because we're live

Real issues affecting production users / exposure right now. Small, high-leverage.

- [x] **Store-listing accuracy** — ✅ **DONE 2026-06-18**. Live Play listing was already corrected by the user; aligned the stale repo copy: `store-description-en.md` no longer claims "no account / optional cloud / data stays on device" (now: free account required, secure cloud sync, works offline at the field). Added a README note that the Play build is cloud-only (the README's dual-mode description is otherwise accurate for the web/PWA version).
- [x] **Stop publishing internal docs** — ✅ **DONE 2026-06-18** (PR #435). `site/scripts/copy-docs.js` flipped from denylist to **allowlist** — only `QUICK_START.md` + `USER_MANUAL.md` publish; all internal dirs (roadmap/security findings, DB schema, blueprint, analysis, business, archive) are excluded. Also closed the larger surface: the **GitHub repo was public** and is now **private** (user keeps a separate mock/showcase repo).
- [x] **`get_user_consent` returns stale 'granted'** (#371) — ✅ **DONE 2026-06-18**. RPC fix was already LIVE (prod hotfix 2026-06-10 `fix_consent_rpc_ordering`; repo migration 029, PR #422). Repo sync completed: added `user_consents.status` (`text NOT NULL DEFAULT 'granted'`) to `src/types/supabase.ts` Row/Insert/Update; tsc clean. Optional consent hardening (uuid id, month regex from #374/#375) deferred — not blocking.

- [x] **Redeploy delete-account Edge Function** — ✅ **DONE 2026-06-18**. Deployed the refactored repo code (index.ts + handler.ts) as **v10** via the Supabase MCP, `verify_jwt=false` preserved. Before deploying, found the repo had drifted from the safe live behavior on one security-relevant line (rate-limit IP precedence — see CR-M8) and fixed the repo first so the deploy was a true no-behavior-change refactor. Verified live: OPTIONS→200, GET→405, POST-no-auth→401, POST-bad-token→401 (full path incl. rate-limit RPC + JWT verify), identical to the v9 baseline.

### 🧨 Code review 2026-06-11 — Critical (data loss / broken core flows)

Found by a 7-agent whole-app review; top claims hand-verified against code.

- [x] **CR-C1: Mid-game reload corrupts the match clock** — ✅ **DONE 2026-06-12** (PR #424): `RESUME_GAME` resumes loaded in-progress games at the saved clock/period; boot consumes the hidden-session timer record (background time folded in, capped at period boundary) then clears it; orchestration-level tests for the force-reload path. ⚠️ Manual device QA still recommended: start game → lock phone 6+ min → reopen → Start → clock continues. Was: — saved in-progress game loads as `notStarted` (`useGameSessionReducer.ts:500`); pressing Start dispatches `START_PERIOD(1)` which resets elapsed/period and wipes `completedIntervalDurations` (`useGameTimer.ts:27`); boot-time `RESTORE_TIMER_STATE` is dead code (only applies to `inProgress`, which load can never produce — `useGameOrchestration.ts:857`). Common because `useAppResume.ts:178` force-reloads after >5 min background. Auto-save then persists the corrupted clock. Fix: first-class resume path (`RESUME_GAME` from saved time/period when `elapsed > 0`); reconcile `stableStartTime` on `START_PERIOD`.
- [x] **Timer pauses on backgrounding and silently stays paused** (user-reported incident, 2026-06-15) — ✅ **DONE 2026-06-16** (PR #427): in-session background→foreground path (separate from CR-C1's reload path). Old code paused on hide and relied on reading a `wasRunning` marker back from IndexedDB to resume; that read fails on mobile (fire-and-forget write never flushes before freeze, or a no-`wasRunning` tick-save overwrites it) → timer stayed paused, match time lost. Fix: never pause on backgrounding — the precision timer is wall-clock based, so on return re-anchor to `Date.now()` truth and keep running (`usePrecisionTimer.reanchor`); pausing happens only on the explicit control. Follow-ups below.
  - [x] **>5min auto-resume** — ✅ **DONE 2026-06-19** (two parts). **On-device QA of the first attempt (#439) FAILED**: a 6-min lock force-reloaded the app → dropped to the start screen → "Jatka" loaded the game paused. Root cause: `useAppResume` force-reloads unconditionally at >5min, throwing away the live in-game state (and the boot auto-resume didn't fire on the start-screen→Continue path). **Real fix:** suppress the force-reload while a match clock is running (`matchTimerSignal` set by `useGameTimer`, read by `useAppResume`) — the wall-clock reanchor already keeps the timer going, so the user stays on the game screen with the clock running, no reload/Jatka/pause. The force-reload still applies when idle (no live match). The #439 boot auto-resume (`RESUME_GAME` after load, capped at period boundary) remains as a backstop for the rare case the OS itself kills the WebView. Also fixed a latent bug: `RESUME_GAME` was uncategorized in the history wrapper (console.error on every manual resume) — now NO_HISTORY. **Re-QA the >5min lock on device.**
  - [x] **Dead-code cleanup** — ✅ **DONE 2026-06-20**. Removed the orphaned `PAUSE_TIMER_FOR_HIDDEN` + `RESTORE_TIMER_STATE` reducer actions (union members + cases), their NO_HISTORY classification entries, the `useTimerRestore` export from `usePrecisionTimer`, and all their tests/mocks (reducer test, action-validation reference list, usePrecisionTimer test, useGameTimer mock). Confirmed zero production dispatches before removing; 157 timer/reducer/history tests green.
  - [x] ⚠️ **On-device QA** — ✅ **CONFIRMED FIXED 2026-06-20**. Diagnosed via temporary Sentry `timer_diag` instrumentation on the real Android 10 device (could not reproduce locally). Three confirmed-from-data fixes: (1) **durable wall-clock anchor** (PR #444) — async IndexedDB recovery record never flushes before the OS freezes the WebView; replaced with a synchronous `localStorage` anchor that survives freeze/kill (Sentry showed `source:"anchor"`, time recovered correctly). (2) **deferred boot auto-resume** (PR #446) — `RESUME_GAME` was batched with `LOAD_PERSISTED_GAME_DATA`, so `useGameTimer`'s `stableStartTime` never synced and the timer stayed paused; now dispatched one render later via `pendingAutoResumeRef` + effect, mirroring the manual Start-tap flow (Sentry confirmed `timerRunning:true`). Also closed a load re-entrancy race. (3) Diagnostics removed (PR #447). Lock-mid-match → reopen → clock running with correct time, verified on device.
- [x] **CR-C2: Transient IndexedDB read failure → wholesale data wipe** — ✅ **DONE 2026-06-12** (PR #423): all 8 `load*` helpers now propagate storage read errors (only JSON corruption reads as empty); `createTeam` reads both collections before its first write; per-collection abort-without-write regression tests added. Consciously rejected as over-engineering: two-phase commit for createTeam's two writes (orphan self-heals — `getTeamRoster` defaults to `[]`), and `getSettings`/`getWarmupPlan` outer-try (read-only, no RMW follows; `updateSettings` reads storage directly and propagates).
- [x] **CR-C3: Cloud: deleting a season/team/tournament with attached games always fails** — ✅ **DONE 2026-06-11**: applied to prod (`fix_composite_fk_set_null_columns`, verified with rolled-back pre/post probes) + repo migration 028 merged (PR #421). Was: composite FKs from 013 nulled ALL columns incl. NOT NULL `user_id` → 23502 on every referenced-entity delete.
- [x] **CR-C4: Stale-snapshot rollback via re-migration** — ✅ **DONE 2026-06-12** (PR #425): bootstrapGetItem propagates infra errors; migration-completed sentinel in IndexedDB checked before any copy (unreadable sentinel aborts); target-not-empty guard skips the copy and repairs config. Was: — `bootstrapGetItem` swallows read errors as `null` (`storageBootstrap.ts:101`) → config falls back to `mode:'localStorage'` → `performIndexedDbMigration` re-runs on app start and overwrites live IndexedDB with the migration-day localStorage snapshot (kept as backup, `migration.ts:249`). Fix: distinguish read-error from missing-key + "migration done" sentinel stored in IndexedDB itself.

### Code review 2026-06-11 — High

- [x] **CR-H1: Sync lost-update via dedup id reuse** — ✅ **DONE 2026-06-20**. `enqueue` dedup-replaces a still-`pending` op's data under the same id; in the window between `getPending()` (which snapshots `op.data`) and `markSyncing()`, that could swap in newer data (e.g. a 2nd goal logged during a slow push) while SyncEngine still held the stale snapshot — it pushed the old data and `markCompleted()` then deleted the op holding the newer write (lost update). Fix (`SyncEngine.processOperation`): after `markSyncing()` flips status to `syncing` (which stops further dedup-replace, since `enqueue` only matches `pending`), **re-read the op via `getById()` and execute the fresh data**. Regression test added (verified it fails on the stale-snapshot path, passes with the re-read); 168 sync tests green.
- [ ] **CR-H2: Account-switch race disposes the live SyncEngine** — stale-init recovery (`factory.ts:732`) → `SyncedDataStore.close()` → global `resetSyncEngine()` disposes whoever the current singleton is; new user's sync dead until reload. Fix: ownership check in `resetSyncEngine(engine)`.
- [ ] **CR-H3: Offline cold start >1h locks cloud users out** — `cachedSession.ts:87` rejects expired access tokens (ignores refresh token); `AuthProvider.tsx:411` catch never runs the grace-period check (NetworkError from `getCurrentUser` lands there). "Locked out at the field" for the headline use case. Fix: honor refresh-token presence in `getCachedUserIdentity`; run grace check in the catch.
- [ ] **CR-H4: initAuth failure strands the user** — catch sets no retry UI, no subscription, `signIn` returns "Auth not initialized" forever (e.g. chunk-load failure post-deploy). Also `initTimedOut` never cleared on late success → signed-in user sees "Connection Timeout" (`AuthProvider.tsx:441`). Fix: set `initTimedOut` in catch (reuses retry screen); clear it on success.
- [x] **CR-H5: Invisible tactical-ball touch dead zone at center field** — ✅ **DONE 2026-06-12** (PR #426): touch hit-test gated to tactics view like the mouse path; regression tests verified to fail against ungated code. Was: — `SoccerField.tsx:1578`: touch path checks `isPointInBall` unconditionally; mouse path gates behind `isTacticsBoardView`. Default ball pos = kickoff spot; touches there drag the invisible ball instead of the player. One-line fix: gate with `isTacticsBoardView &&`.
- [ ] **CR-H6: Async destructive confirms double-fire** — delete-event confirms (GameSettingsModal:1314, GoalLogModal:246, useGoalEditor:142) + backup restore (SettingsModal:292) never pass `isConfirming` to ConfirmationModal; `handleDeleteGameEvent` (`useGamePersistence.ts:671`) splices storage by an index from React state → double-tap deletes the WRONG event + decrements score twice. Restore can run twice concurrently — and `importFullBackup` clears all data BEFORE writing with no rollback snapshot (`fullBackup.ts:552`). Fix: pass `isConfirming`, in-flight guards, delete by event id, snapshot-before-clear in restore.
- [ ] **CR-H7: Auto-save wipes undo + full snapshot save every second** — _partially fixed._ ✅ **Per-second save/sync DONE 2026-06-20** (user-reported: cloud-sync icon flickered every second during a match): `timeElapsedInSeconds` was in the immediate (0ms) auto-save tier, so every clock tick fired a full save + cloud sync (~3000/game). Swapped it for `isTimerRunning` in the change-detection set, so the clock saves when the timer **stops/starts** (both `PAUSE_TIMER` and `END_PERIOD_OR_GAME` set the precise `timeElapsedInSeconds` + `isTimerRunning:false`), and goals/scores still save instantly; the save still persists the exact elapsed. Live-clock crash recovery is covered by the timer-state record + localStorage anchor. Regression test added. **Still open:** `resetHistory` on every silent auto-save (`useGamePersistence.ts`) wipes undo; and per-save `invalidateQueries`. Fix: no resetHistory on silent saves; drop per-save invalidation.
- [ ] **CR-H8: IndexedDB recovery latches wedge the app until reload** — (a) terminated connection: `connectionTerminated` reset unreachable (`indexedDbKvAdapter.ts:496`, close() guarded by `if (this.db)` which is already null); (b) adapter retry lockout: 3 failures permanent, TTL reset path dead (`storage.ts:682-751`), cleanup never wired; (c) legacy→user-DB migration partial-failure never retries (idempotency = `players.length > 0`, `legacyMigrationService.ts:257`). Fix: reset flags on close/cooldown; explicit migration-completed flag.
- [x] **CR-H9: Marketing consent re-grant permanently impossible** — ✅ **DONE**: was already fixed in prod by the 2026-06-10 `fix_consent_rpc_ordering` hotfix (`ON CONFLICT DO UPDATE` bumps `consented_at`); repo synced via migration 029 (PR #422, 2026-06-11).
- [x] **Test-suite cumulative memory leak → CI "Test" job OOM** (found 2026-06-17, PR #431) — ✅ **DONE 2026-06-18**. Root cause: `src/setupTests.mjs` registered an **anonymous** `uncaughtException` process listener at module scope (line ~159) and never removed it. Jest re-runs the setup file per test file in the same worker, so the listener accumulated (~one per suite), and each new one closed over the growing array of prior listeners — quadratic closure retention. Its sibling `unhandledRejection` was correctly paired (add/remove); `uncaughtException` was not. Fix: made the handler a named, module-scoped function and removed it in the same `afterAll` (preserving prior behavior). Verified: full single-process (`--runInBand`) run, which previously OOM'd even at 8 GB, now completes 230/230 suites / 4,860 tests at **~922 MB peak** with **zero** `MaxListenersExceededWarning`. The omitted Unknown-scorer edit round-trip test was re-added. Things tried first that did NOT help (kept for reference): raising `--max-old-space-size` to 6/8 GB; `workerIdleMemoryLimit` at 1 GB/512 MB.

### Code review 2026-06-11 — Medium

- [ ] **CR-M1 (sync correctness cluster)**: failed/syncing ops escape dedup and later replay stale snapshots with no timestamp guard (`SyncQueue.ts:329`, `retryFailed:1163`); conflict resolver swallows name-collision unique violations as "already synced" and acks without pushing (`conflictResolution.ts:236`); LWW compares device clock vs server clock — skewed phone loses fresh edits (`conflictResolution.ts:185` vs `001_rpc_functions.sql:79`); `pause()` isn't a barrier — in-flight op can write into a just-cleared cloud (`SyncEngine.ts:403`, `SyncedDataStore.ts:1069/1459`); upsert* enqueues 'create' → CREATE+DELETE coalescing can cancel a needed delete (`SyncQueue.ts:429`); pause-state leaks in clearAllUserData/pushAllToCloud (`SyncedDataStore.ts:1447-1497`).
- [ ] **CR-M2 (transform fidelity)**: `transformSettingsFromDb` drops `updatedAt` → settings conflicts always local-wins (`SupabaseDataStore.ts:2756`); player/season/tournament upserts reset `created_at` on every sync push — ordering churn, original timestamps destroyed (`:1019/:1910/:2290`; teams/personnel do it right).
- [ ] **CR-M3 (optimistic locking weaker than tests suggest)**: version SELECT lacks `FOR UPDATE` (TOCTOU, `027:52`); cold `gameVersionCache` passes NULL → unguarded overwrite (`SupabaseDataStore.ts:3557`); ambiguous-network retry of an already-committed save throws spurious ConflictError at the user (`:3571-3652`).
- [ ] **CR-M4 (UI)**: browsing league FILTERS instantly persists `leagueId: undefined` — looking around destroys the saved league (`GameSettingsModal.tsx:1777`); period-duration input commits garbage intermediates, 15→25 passes through persisted "125" (`:2261`); GoalLogModal goal-edit lacks the rollback its GameSettingsModal twin has + weaker time validation (`GoalLogModal.tsx:206`); goalie toggle double-fires on touch (`PlayerDisk.tsx:131`, onClick+onTouchEnd, no preventDefault); assister select flips controlled↔uncontrolled (`GameSettingsModal.tsx:2416`).
- [ ] **CR-M5 (auth)**: suppressed `signed_out` → zombie session after real server-side revocation, sync silently dead (`AuthProvider.tsx:307`); auth listener can leak per retry cycle + registered after long awaits (`:256-267`); grace-period trigger 3 keeps a non-null session, violating the documented invariant (`:332`); reload mid password-reset signs user in with OLD password (`SupabaseAuthService.ts:1222`); re-consent race via SIGNED_IN event path (`:344`); AbortError fallback validation can wipe a valid recovered session (`SupabaseAuthService.ts:328-401`).
- [ ] **CR-M6 (data-layer parity)**: composite-uniqueness divergence — Local checks raw stored `clubSeason`, Supabase checks computed (`LocalDataStore.ts:1071` vs `SupabaseDataStore.ts:1683`); `SupabaseDataStore.updateSettings` non-atomic + skips validation (`:2743`); `deleteWarmupPlan` return divergence; `getTournamentReferences` dead series clause (`LocalDataStore.ts:2455`); one-way gameTime/gameDate loss on migration (invalid date silently becomes TODAY, `SupabaseDataStore.ts:2974`).
- [ ] **CR-M7 (storage/migration)**: migration "success" with up to 50% keys lost — core keys must be mandatory (`migration.ts:230`); app-data migration reads roster from IndexedDB BEFORE the localStorage copy runs → empty default team for v1 upgraders (`migration.ts:119`); mutex released by non-owner on acquire timeout (`storage.ts:309/704`); legacy `savedGames` backups skip player remapping due to normalization ordering (`fullBackup.ts:574/612`); SW caches every navigated HTML URL with no trim (`sw.js:121`).
- [ ] **CR-M8 (backend, dormant until billing/consent matters)**: purchase-token reuse race — no unique index on token (`019` is non-unique, `verify-subscription/index.ts:283`); `is_active` never expires without a client call (`010:96`); purchase never acknowledged with Google → auto-refund in ~3 days when billing goes live; `user_consents` directly writable via PostgREST `FOR ALL` policy — replace with SELECT-only like the 018 subscriptions fix (`016:99`); `check_rate_limit` cleanup uses caller's window — latent until windows diverge (`024:46`); ~~`cf-connecting-ip` trusted before `x-forwarded-for` in rate-limit keys (both edge functions)~~ ✅ **FIXED 2026-06-18**: both `delete-account/handler.ts` and `verify-subscription/index.ts` now prefer the platform-set `x-forwarded-for` over the client-forgeable `cf-connecting-ip`, so the rate-limit key can't be rotated to bypass the limit. (delete-account fix is live in edge v10; verify-subscription fix ships to repo and applies on its next deploy.)

**Verified solid (no action):** RLS on every table; `save_game_with_relations` (027) pins search_path + force-injects user_id/game_id; all 19 transform rules hold in both stores; reducer score/event atomicity; IndexedDB transaction usage; sign-out hygiene; edge-function JWT verification + fail-closed rate limiting; SW/manifest pipeline.

---

## 🟠 P1 — Observability (we just launched — get eyes on it)

- [x] **In-app update banner showed the same text across deploys** (reported 2026-06-19) — ✅ **RESOLVED 2026-06-19.** Investigation: NOT a regeneration/cache bug — `build` runs `generate-changelog.mjs` → `public/changelog.json` regenerates from `release-notes.json` per deploy; the client fetches it network-only with a `?t=` cache-bust (verified live: both prod domains served the new note within minutes of PR #439). The text looked static only because the in-between PRs were `skip-release-notes` internal changes that didn't touch the notes. **Decision (one concept):** every merge to master ships a new build, so every build must carry a user-friendly note. **Removed the `skip-release-notes` escape hatch** — the Release Notes Guard now requires *every* PR to master to add a fresh top entry to `release-notes.json` (EN + FI), no exceptions; deleted the label. The guard verifies a genuinely **new top entry** (compares `releases[0]` against base, not just "file touched"), so editing the comment or tweaking an old entry can't satisfy it. The banner shows that entry. (Future nicety, not required: accumulate all notes newer than the user's installed version so a multi-version skip shows the full list.)
- [ ] **Sentry alerting** — configure alert rules for crash-rate / new-issue spikes (notifications already route to alerts@velomoai.com).
- [ ] **Reduce Sentry storage-retry noise** — `storage.ts:829/871/908/768` log `error` (→ Sentry) on *every* retry, including recovered transient IndexedDB failures. Log non-final attempts at `warn`; reserve `error` for final failure.
- [ ] **CI audit gate** — fail CI on critical production dependency vulnerabilities.

---

## 🟡 P2 — UX & quality polish

- [ ] **Play Store data-deletion declaration** (deferred 2026-06-11) — Data Safety form wrongly says the app offers no data deletion; full account deletion exists (Settings → Delete Account → `delete-account` Edge Function). Steps: 1) verify deletion flow end-to-end with a throwaway account, 2) add `/delete-account` page to marketing site (Google wants a web deletion-request URL), 3) update Data Safety form in Play Console.
- [ ] **Local device-data wipe on account deletion** (added 2026-06-11) — account deletion removes cloud data + auth user but leaves the user-scoped IndexedDB mirror (`matchops_user_{id}`) and sync-queue DB on the device forever. Add best-effort `indexedDB.deleteDatabase()` for both after successful deletion (in `AuthProvider.deleteAccount`), and consider the same on the reverse-migration "delete cloud account" path. Orphaned storage + readable data on shared devices.
- [ ] **Core accessibility** — color contrast, touch targets, keyboard nav, screen-reader support.
- [ ] **Season League UX filters** — group the 34-league flat list by area (Itä/Länsi/Etelä) + age group in `SeasonDetailsModal`. ~1 week.
- [ ] **Site polish** (bundled, ~15 min) — add 9 missing FI keys under `features.foundation.*` in `site/public/locales/fi/common.json`; fix `site/README.md` (says Next 15, actual 16).
- [ ] **Deploy `verify-subscription` edge function** (deferred — billing) — the repo carries the CR-M8 rate-limit fix (prefer `x-forwarded-for` over `cf-connecting-ip`) but it has never been deployed. The function is dormant while billing is parked, so there's no live benefit now. **When billing is revived** (or next time that function is touched), deploy it the same careful way `delete-account` v10 was done: diff deployed-vs-repo, preserve `verify_jwt`, deploy, then smoke-test. Also fold in the other CR-M8 billing items at that time (purchase-token unique index, `is_active` expiry, Google purchase acknowledgement).
- [x] **PR #431 review nits** (Minor, from claude-review) — ✅ **DONE 2026-06-18**. 1) `handleRecalculateScoreFromEvents` (`useTimerManagement.ts`) now depends only on `homeOrAway` + `gameEvents` (the fields `computeScoreFromEvents` reads), so its reference is stable across timer ticks. 2) CSV "Unknown" label — **closed as won't-fix**: `exportCsv` is intentionally all-English (40+ hardcoded literals, takes no `translate`); i18n-ing one word would make it the *only* translated string and more inconsistent, not less. The structural choice (CSV English-only vs Excel i18n) is out of scope for a nit.

---

## 🟢 P3 — Feature backlog (value/effort ordered)

Low-effort, high-value first. Detailed concepts in `docs/04-features/future-vision.md`.

| Feature | Effort | Note |
|---------|--------|------|
| Player Milestones & Certificates | Low | Auto-detect 10/25/50/100 appearances; exportable. High youth-motivation value. |
| Quick Post-Game Ratings | Low | 30s/player across 7 dimensions; better youth-dev signal than goals. |
| Configurable Formations | Low | TODO in `useFieldCoordination.ts`. |
| Overtime & penalty shootout (#273) | Low | Real gap for knockout games. |
| Substitution "who came off" field (#381) | Low-Med | Substitution GameEvent lacks outgoing-player → blocks who-came-off stats. (Decoupled from the scrapped Planner.) |
| Formation Templates (one-tap switch) | Med | Save/switch formations; ends 11-player drag pain. |
| Moment Capture (tap-to-log) | Med | 2-tap logging of notable plays; goals/assists miss most player value. |
| Field Export (image / PDF) | Med | Shareable field + lineup. |
| Futsal Field Visualization | Med | Completes existing futsal support (smaller court, 5 players). |
| Visual Analytics | Med | Charts, event timeline, goal-log filtering. |
| Age-appropriate assessment profiles (#364) | Med | U8-U10 simplified, U13+ full. Aligns with youth focus. |

---

## 🔵 P4 — Big bets (need planning before any code)

- [ ] **Tournament Planner — full replan** (#369) — multi-game lineup planning + game-day propagation. Previous implementation scrapped; decide standalone app vs in-app. Old code at tag `archive/planner-integration`.
- [ ] **Desktop responsive UI** (#360) — phone-frame / desktop layout. To be rebuilt from scratch; clever ideas preserved at tag `archive/desktop-responsive-modals`.
- [ ] **AI Assistant (chat with your data)** — long-term flagship. LLM function-calling over the user's games/players/stats. **Prerequisite:** richer data collection first. (Premium-shaped, but billing is parked.)

---

## 🧪 Post-launch QA (verification pass, not features)

Manual checklists `TESTING-PLAN.md` (root) + `user-flow-testing-plan.md` are unexecuted — run as a verification sweep when convenient. Specific gaps to confirm: session-expiry handling, auth-init timeout recovery, post-login marketing-consent prompt. ⚠️ The "Free Limits" test is stale (premium enforcement is off / app is free).

---

## 📁 Reference

| Purpose | Location |
|---------|----------|
| This roadmap | `docs/03-active-plans/UNIFIED-ROADMAP.md` |
| Post-launch QA checklists | `docs/03-active-plans/user-flow-testing-plan.md`, `TESTING-PLAN.md` |
| Speculative feature ideas | `docs/04-features/future-vision.md` |
| Supabase implementation reference | `docs/02-technical/supabase-implementation-guide.md` |
| Archived plans (Play Store, billing, reviews, etc.) | `docs/08-archived/completed-active-plans/` |
| Preserved code snapshots | tags `archive/pre-cloud-backup`, `archive/planner-integration`, `archive/desktop-responsive-modals` |
| Open issues | #371 (consent bug), #381 (sub stats), #364, #360, #273, #369 (planner replan) |

---

## ✅ Completed (history)

- **Production launch** (2026-06-09) — Google Play, cloud-only gate enabled, free.
- **Supabase cloud backend** — DataStore abstraction, SupabaseDataStore, both-way migration, local-first sync (SyncQueue/SyncEngine/SyncedDataStore).
- **Billing infrastructure built** (Phases 1-7) — then parked (free); plan archived for an eventual replan.
- **Welcome-screen simplification**, **communication infrastructure** (domains, email routing, Sentry alerts, velomoai.com).
- **Features** — Gender + Game Type labeling/filtering, Personnel Management, Tournament Series & Season Leagues (34 Finnish leagues), First Game Onboarding, External Match Stats, Warm-up Plan, auto-save, backup/restore.
- **Platform** — Next.js 16 + React 19, 0 npm vulns, HomePage refactor (3,725→62 lines), PWA stability, IndexedDB migration.
- **Verified-fixed during triage** — 3 cloud-sync bugs (warmup ID conflict, warmup metadata, games `created_at`) were already fixed (commits `847f0dab`, `b0816143`); CORS extraction, TournamentSeriesManager extraction, jest-axe types all already done.

---

## 📝 Change Log

| Date | Update |
|------|--------|
| 2026-06-11 | 🧨 **Whole-app code review (7-agent) → P0.** 4 critical (mid-game reload clock corruption, IndexedDB read-error wipe path, cloud entity-delete FK failure, stale-snapshot re-migration), 9 high, 8 medium clusters added as CR-C/H/M items. Also: account-deletion hardening shipped (`77ac8034`), Play badge links live (`944509fe`), P2 items added for Play Store data-deletion declaration + local device-data wipe. |
| 2026-06-10 | 🧹 **Full backlog triage + prioritization.** Parked monetization (going free → closed #171/#172, archived billing plan). Scrapped Planner impl (closed PR #404 + #372/#373/#377/#378/#379, reframed #369, tagged code). Verified-and-discarded 3 phantom cloud-sync bugs + several already-done tech-debt items. Kept #371 (consent), #381, #364, #360, #273. Tagged & deleted desktop branch. Reprioritized everything P0-P4. |
| 2026-06-09 | 🚀 Production release — live on Google Play (cloud-only, free). |
| 2026-01-28 | Docs audit; future-vision features + cloud-sync bugs added to backlog. |
| 2025-12 | Supabase backend, Gender/Game Type features, Next.js 16 + React 19 upgrade. |

---

**Current Focus**: 🔴 P0 — code-review criticals CR-C1…C4 first (data loss / broken deletes), then CR-H items; store-listing accuracy, internal-docs publishing, and consent `status` bug (#371) remain alongside.
