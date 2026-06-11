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

- [ ] **Store-listing accuracy** — `store-description-en.md:52/54/63/67` and root `README.md` still say "works offline / no account / optional cloud sync," but the Play build is **cloud-only (account required)**. Misleading to users; possible policy risk. Rewrite the listing copy + README framing.
- [ ] **Stop publishing internal docs** — `site/scripts/copy-docs.js` only excludes `08-archived`; it currently publishes `docs/11-blueprint/` (internal "how to clone this app" build instructions) and a 2.4 MB `08-archived.tar.gz` to the public docs site. Add `11-blueprint`, `10-analysis`, and `08-archived.tar.gz` to `excludeDirs`.
- [ ] **`get_user_consent` returns stale 'granted'** (#371) — function orders by `consented_at DESC` but never reads the `status` column, so a withdrawn consent still reads as granted. GDPR-correctness. Fix: new migration making `get_user_consent` status-aware (`008_user_consents.sql:155`). While in that code, also regenerate `src/types/supabase.ts` (missing `user_consents.status`) and optionally apply the two minor consent hardening notes (uuid id, month regex) closed from #374/#375.

- [ ] **Redeploy delete-account Edge Function** — `supabase functions deploy delete-account` so production matches the refactored repo code from `77ac8034` (handler extracted to `handler.ts`; behavior identical, but deployed copy must not drift from repo).

### 🧨 Code review 2026-06-11 — Critical (data loss / broken core flows)

Found by a 7-agent whole-app review; top claims hand-verified against code.

- [ ] **CR-C1: Mid-game reload corrupts the match clock** — saved in-progress game loads as `notStarted` (`useGameSessionReducer.ts:500`); pressing Start dispatches `START_PERIOD(1)` which resets elapsed/period and wipes `completedIntervalDurations` (`useGameTimer.ts:27`); boot-time `RESTORE_TIMER_STATE` is dead code (only applies to `inProgress`, which load can never produce — `useGameOrchestration.ts:857`). Common because `useAppResume.ts:178` force-reloads after >5 min background. Auto-save then persists the corrupted clock. Fix: first-class resume path (`RESUME_GAME` from saved time/period when `elapsed > 0`); reconcile `stableStartTime` on `START_PERIOD`.
- [ ] **CR-C2: Transient IndexedDB read failure → wholesale data wipe** — every `LocalDataStore.load*` helper catches ALL errors and returns `{}`/`[]` (`LocalDataStore.ts:2620` + 6 siblings); read-modify-write paths (`saveGame:1798`, `upsertPlayer`, `setTeamRoster`…) then persist the empty collection. One transient mobile read failure (issue #262 documents these) during a save erases all other games. Fix: only swallow JSON parse errors; rethrow `StorageError` so the locked write aborts.
- [ ] **CR-C3: Cloud: deleting a season/team/tournament with attached games always fails** — composite FKs in `013_composite_primary_keys.sql:165-190` use `ON DELETE SET NULL`, which nulls ALL referencing columns incl. NOT NULL `user_id` → 23502 → parent DELETE errors. SyncedDataStore: local delete succeeds, cloud delete poisons the queue → permanent divergence. Fix migration: PG15 column-subset `ON DELETE SET NULL (season_id)` for the 5 FKs (games×3, player_adjustments×2).
- [ ] **CR-C4: Stale-snapshot rollback via re-migration** — `bootstrapGetItem` swallows read errors as `null` (`storageBootstrap.ts:101`) → config falls back to `mode:'localStorage'` → `performIndexedDbMigration` re-runs on app start and overwrites live IndexedDB with the migration-day localStorage snapshot (kept as backup, `migration.ts:249`). Fix: distinguish read-error from missing-key + "migration done" sentinel stored in IndexedDB itself.

### Code review 2026-06-11 — High

- [ ] **CR-H1: Sync lost-update via dedup id reuse** — `SyncQueue.ts:447` replaces a pending op's data under the same id while SyncEngine executes an in-memory snapshot; `markCompleted(id)` deletes the newer data (e.g. second goal logged during a slow batch push never syncs). Fix: re-read op after `markSyncing`, or new id on dedup replace, or timestamp-conditional `markCompleted`.
- [ ] **CR-H2: Account-switch race disposes the live SyncEngine** — stale-init recovery (`factory.ts:732`) → `SyncedDataStore.close()` → global `resetSyncEngine()` disposes whoever the current singleton is; new user's sync dead until reload. Fix: ownership check in `resetSyncEngine(engine)`.
- [ ] **CR-H3: Offline cold start >1h locks cloud users out** — `cachedSession.ts:87` rejects expired access tokens (ignores refresh token); `AuthProvider.tsx:411` catch never runs the grace-period check (NetworkError from `getCurrentUser` lands there). "Locked out at the field" for the headline use case. Fix: honor refresh-token presence in `getCachedUserIdentity`; run grace check in the catch.
- [ ] **CR-H4: initAuth failure strands the user** — catch sets no retry UI, no subscription, `signIn` returns "Auth not initialized" forever (e.g. chunk-load failure post-deploy). Also `initTimedOut` never cleared on late success → signed-in user sees "Connection Timeout" (`AuthProvider.tsx:441`). Fix: set `initTimedOut` in catch (reuses retry screen); clear it on success.
- [ ] **CR-H5: Invisible tactical-ball touch dead zone at center field** — `SoccerField.tsx:1578`: touch path checks `isPointInBall` unconditionally; mouse path gates behind `isTacticsBoardView`. Default ball pos = kickoff spot; touches there drag the invisible ball instead of the player. One-line fix: gate with `isTacticsBoardView &&`.
- [ ] **CR-H6: Async destructive confirms double-fire** — delete-event confirms (GameSettingsModal:1314, GoalLogModal:246, useGoalEditor:142) + backup restore (SettingsModal:292) never pass `isConfirming` to ConfirmationModal; `handleDeleteGameEvent` (`useGamePersistence.ts:671`) splices storage by an index from React state → double-tap deletes the WRONG event + decrements score twice. Restore can run twice concurrently — and `importFullBackup` clears all data BEFORE writing with no rollback snapshot (`fullBackup.ts:552`). Fix: pass `isConfirming`, in-flight guards, delete by event id, snapshot-before-clear in restore.
- [ ] **CR-H7: Auto-save wipes undo + full snapshot save every second** — `resetHistory` on every silent auto-save (`useGamePersistence.ts:312`); `timeElapsedInSeconds` in the immediate tier → full save + `invalidateQueries` + history wipe every second of a running match (~3000/game; each feeds the sync queue in cloud mode). Fix: no resetHistory on silent saves; move elapsed-time out of immediate tier; drop per-save invalidation.
- [ ] **CR-H8: IndexedDB recovery latches wedge the app until reload** — (a) terminated connection: `connectionTerminated` reset unreachable (`indexedDbKvAdapter.ts:496`, close() guarded by `if (this.db)` which is already null); (b) adapter retry lockout: 3 failures permanent, TTL reset path dead (`storage.ts:682-751`), cleanup never wired; (c) legacy→user-DB migration partial-failure never retries (idempotency = `players.length > 0`, `legacyMigrationService.ts:257`). Fix: reset flags on close/cooldown; explicit migration-completed flag.
- [ ] **CR-H9: Marketing consent re-grant permanently impossible** — `026_marketing_consent.sql:47`: unique on `(user, type, version, status)` + `ON CONFLICT DO NOTHING` → withdraw-then-regrant silently no-ops, RPC reports success, status stays withdrawn. Fix: drop status-inclusive constraint, append-only rows.

### Code review 2026-06-11 — Medium

- [ ] **CR-M1 (sync correctness cluster)**: failed/syncing ops escape dedup and later replay stale snapshots with no timestamp guard (`SyncQueue.ts:329`, `retryFailed:1163`); conflict resolver swallows name-collision unique violations as "already synced" and acks without pushing (`conflictResolution.ts:236`); LWW compares device clock vs server clock — skewed phone loses fresh edits (`conflictResolution.ts:185` vs `001_rpc_functions.sql:79`); `pause()` isn't a barrier — in-flight op can write into a just-cleared cloud (`SyncEngine.ts:403`, `SyncedDataStore.ts:1069/1459`); upsert* enqueues 'create' → CREATE+DELETE coalescing can cancel a needed delete (`SyncQueue.ts:429`); pause-state leaks in clearAllUserData/pushAllToCloud (`SyncedDataStore.ts:1447-1497`).
- [ ] **CR-M2 (transform fidelity)**: `transformSettingsFromDb` drops `updatedAt` → settings conflicts always local-wins (`SupabaseDataStore.ts:2756`); player/season/tournament upserts reset `created_at` on every sync push — ordering churn, original timestamps destroyed (`:1019/:1910/:2290`; teams/personnel do it right).
- [ ] **CR-M3 (optimistic locking weaker than tests suggest)**: version SELECT lacks `FOR UPDATE` (TOCTOU, `027:52`); cold `gameVersionCache` passes NULL → unguarded overwrite (`SupabaseDataStore.ts:3557`); ambiguous-network retry of an already-committed save throws spurious ConflictError at the user (`:3571-3652`).
- [ ] **CR-M4 (UI)**: browsing league FILTERS instantly persists `leagueId: undefined` — looking around destroys the saved league (`GameSettingsModal.tsx:1777`); period-duration input commits garbage intermediates, 15→25 passes through persisted "125" (`:2261`); GoalLogModal goal-edit lacks the rollback its GameSettingsModal twin has + weaker time validation (`GoalLogModal.tsx:206`); goalie toggle double-fires on touch (`PlayerDisk.tsx:131`, onClick+onTouchEnd, no preventDefault); assister select flips controlled↔uncontrolled (`GameSettingsModal.tsx:2416`).
- [ ] **CR-M5 (auth)**: suppressed `signed_out` → zombie session after real server-side revocation, sync silently dead (`AuthProvider.tsx:307`); auth listener can leak per retry cycle + registered after long awaits (`:256-267`); grace-period trigger 3 keeps a non-null session, violating the documented invariant (`:332`); reload mid password-reset signs user in with OLD password (`SupabaseAuthService.ts:1222`); re-consent race via SIGNED_IN event path (`:344`); AbortError fallback validation can wipe a valid recovered session (`SupabaseAuthService.ts:328-401`).
- [ ] **CR-M6 (data-layer parity)**: composite-uniqueness divergence — Local checks raw stored `clubSeason`, Supabase checks computed (`LocalDataStore.ts:1071` vs `SupabaseDataStore.ts:1683`); `SupabaseDataStore.updateSettings` non-atomic + skips validation (`:2743`); `deleteWarmupPlan` return divergence; `getTournamentReferences` dead series clause (`LocalDataStore.ts:2455`); one-way gameTime/gameDate loss on migration (invalid date silently becomes TODAY, `SupabaseDataStore.ts:2974`).
- [ ] **CR-M7 (storage/migration)**: migration "success" with up to 50% keys lost — core keys must be mandatory (`migration.ts:230`); app-data migration reads roster from IndexedDB BEFORE the localStorage copy runs → empty default team for v1 upgraders (`migration.ts:119`); mutex released by non-owner on acquire timeout (`storage.ts:309/704`); legacy `savedGames` backups skip player remapping due to normalization ordering (`fullBackup.ts:574/612`); SW caches every navigated HTML URL with no trim (`sw.js:121`).
- [ ] **CR-M8 (backend, dormant until billing/consent matters)**: purchase-token reuse race — no unique index on token (`019` is non-unique, `verify-subscription/index.ts:283`); `is_active` never expires without a client call (`010:96`); purchase never acknowledged with Google → auto-refund in ~3 days when billing goes live; `user_consents` directly writable via PostgREST `FOR ALL` policy — replace with SELECT-only like the 018 subscriptions fix (`016:99`); `check_rate_limit` cleanup uses caller's window — latent until windows diverge (`024:46`); `cf-connecting-ip` trusted before `x-forwarded-for` in rate-limit keys (both edge functions) — verify Supabase strips it or drop it.

**Verified solid (no action):** RLS on every table; `save_game_with_relations` (027) pins search_path + force-injects user_id/game_id; all 19 transform rules hold in both stores; reducer score/event atomicity; IndexedDB transaction usage; sign-out hygiene; edge-function JWT verification + fail-closed rate limiting; SW/manifest pipeline.

---

## 🟠 P1 — Observability (we just launched — get eyes on it)

- [ ] **Sentry release tagging** — web build reports `release: 1.0.0` regardless of version; wire the real version/commit so errors can be sliced by release.
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
