# Tournament Planner Integration — Technical Survey

**Status:** findings (still accurate) · **Last updated:** 2026-04-28 · **Owner:** @valoraami
**Companions:**
- `tournament-planner-integration.md` — design plan
- `tournament-planner-integration-pr-plan.md` — executable PR-by-PR breakdown
- `tournament-planner-integration-safety.md` — process rules

## Re-verified 2026-04-28

The four critical findings below all still hold against current MatchOps-Local master. One small update:

- **Staging Supabase is in sync with prod.** Verified 2026-04-28 by comparing tables, columns, function names, and function-body hashes between `aybjmnxxtgspqesdiqxd` (prod) and `hwcqpvvqnmetjrwvzlfr` (staging). Staging's `supabase_migrations.schema_migrations` is empty (likely set up via dashboard rather than migration log), but the actual schema effects are byte-identical to prod, including the prod-only `fix_consent_rpc_ordering` patch (now backported to the repo as `028_fix_consent_rpc_ordering.sql`). All integration work can develop directly against staging.


## Purpose

Captures what MatchOps-Local actually is, at the code level, so the integration plan can be executed without surprises. Every claim below cites the file and line it came from, so future decisions don't have to re-research.

## TL;DR

Integration is feasible and mostly additive. Four real technical items sit on the critical path:

1. **Positions are coordinate-only.** There is no "role" (GK / LB / ST) stored anywhere on a Player or Game; the pitch renders purely from `relX/relY`. Labels like "LB" are computed from coordinate zones for display only. The planner needs a bidirectional role ↔ coordinate bridge; a `roles` map on `FormationPreset` is the cleanest place to put it.
2. **Scheduled substitutions do not exist.** The only sub data today is retrospective (`GameEvent.type === 'substitution'`). The `subIntervalMinutes` reminder colors the timer text red — no banner, no list. Scheduled subs need new Game state + new reducer actions + a timer-tick check + a banner component.
3. **Adding a new entity is well-trodden but non-trivial.** Ten files to touch across DataStore interface / LocalDataStore / SupabaseDataStore / migrations / sync layer / query hooks / tests. There's a reusable Team recipe to copy from. ~4 hours of focused work for a simple entity.
4. **The UI shell is 26 modals around one soccer field.** No routes. "Planning" slots in naturally as another modal in the Analysis & Tools menu, following a very repeated pattern.

Everything else (menu entry, i18n, design tokens, Tailwind patterns, modal management) is mechanical.

---

## Architecture snapshot

- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, PWA service worker.
- **Dual backend:** `LocalDataStore` (IndexedDB) + `SupabaseDataStore` (Postgres+RLS), both behind a shared `DataStore` interface. Cloud mode wraps both with `SyncedDataStore` for local-first + background sync. Factory: `src/datastore/factory.ts`.
- **State shell:** `src/app/page.tsx` orchestrates the whole app. Game session state lives in `useGameSessionReducer`. Field interactions in `useGameState`. React Query for async data.
- **UI shell:** Single-page; a soccer field is the main view. All 26 features (Stats, Teams, Seasons, Assessment, Rules, Training…) are **modals** opened from the `ControlBar` hamburger menu. No Next.js routes beyond the root.
- **Design tokens:** dark slate background, amber/yellow-400 titles, Rajdhani accents on canvas. Headless UI + Heroicons v2 (`react-icons/hi2`). Modal footer helpers in `src/styles/modalStyles`.

---

## Entity landscape

Everything a planner needs to read, grouped by priority.

### Game (a.k.a. `AppState`)

Defined in `src/types/game.ts:73-178`. The hot fields for the planner:

| Field | Type | Notes |
|---|---|---|
| `playersOnField` | `Player[]` | Each carries `relX/relY` — this IS the visible lineup |
| `selectedPlayerIds` | `string[]` | Squad for the match. **Rule 3:** `playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers` |
| `availablePlayers` | `Player[]` | Full roster for this game (no positions) |
| `gameEvents` | `GameEvent[]` | Goals, subs, etc. Only retrospective. Rule 4: `order_index` in DB |
| `subIntervalMinutes` | `number?` | Existing reminder interval (no UI banner — just text colour) |
| `lastSubConfirmationTimeSeconds` | `number?` | Pairs with the interval to compute "next due" |
| `completedIntervalDurations` | `IntervalLog[]?` | `{ period, duration, timestamp }` — logged at each sub confirmation |
| `periodDurationMinutes` / `numberOfPeriods` | | Defines total game duration |
| `homeOrAway` | `'home' \| 'away'` | Use `??` defaulting, not `\|\|` (Rule 2) |
| `teamId`, `seasonId`, `tournamentId`, `tournamentSeriesId` | `string` | Empty string ↔ NULL at the DB boundary (Rule 1) |
| `gameType` | `'soccer' \| 'futsal'?` | Soccer default |
| `createdAt` / `updatedAt` | `string?` | Used for sync conflict resolution |

**No scheduled-sub field exists.** Adding it is additive — either a new array on `Game` or (more structured) a new sidecar entity. Current design leans toward `scheduledSubs?: ScheduledSub[]` on `Game` for tight coupling with the timer.

### Player

`src/types/index.ts:3-16`. No `role`, `position`, or `positionLabel` field — only `relX/relY` when placed. `isGoalie: boolean` is the only semantic tag.

### Team

`src/types/index.ts:28-41`. Has an optional `TeamPlayer` roster link (separate entity). Composite uniqueness: `name + boundSeasonId + boundTournamentId + boundTournamentSeriesId + gameType` (Rule 6, enforced at app level).

### Tournament / Season

`src/types/index.ts:70-227`. Both carry dates, optional age group / gender / gameType, optional `teamPlacements` map. Tournaments have `series: TournamentSeries[]` (modern) or a legacy `level` string (auto-migrated per Rule 13). `clubSeason` is computed on read.

### GameEvent

`src/types/game.ts:43-50`. Types: `goal | opponentGoal | substitution | periodEnd | gameEnd | fairPlayCard`. Carries `id, type, time, scorerId?, assisterId?, entityId?`. Ordered via `order_index` in DB.

### What's missing

- No scheduled / planned substitution concept anywhere. Adding it is the biggest new-feature lift that's actually a MatchOps-Local feature (not just a planner feature) — the live timer benefits directly.
- No formation role map. See next section.
- No "planning session" entity. Designed to be added for the planner; recipe in §"Adding a new entity".

---

## Field rendering + formation model

### How positions are stored today

**Coordinate-only.** `Player.relX` and `Player.relY` (both 0–1 floats) are the only spatial data. There is no role or position name persisted anywhere.

### SoccerField rendering

`src/components/SoccerField.tsx:18-58`. Props include `players: Player[]`, `onPlayerDrop(playerId, relX, relY)`, `onPlayerMove(playerId, relX, relY)`, `formationSnapPoints?: Point[]`. Rendering reads `relX/relY` from each player and positions them as discs on a canvas pitch. Drag-drop writes coordinates back.

### FormationPreset

`src/config/formationPresets.ts:27-40`. The shape:

```ts
interface FormationPreset {
  id: string;              // e.g. '5v5-2-2'
  name: string;
  labelKey: string;        // i18n key
  fieldSize: FieldSize;
  playerCount: number;
  positions: FieldPosition[];  // [{ relX, relY }, ...] — JUST coordinates
}
```

**No role names.** A 4-3-3 preset is 10 `{relX, relY}` entries with no semantic tags.

### Position labels

`src/utils/positionLabels.ts:1-162`. `getPositionLabel(relX, relY)` computes labels like `"CB" / "LW" / "ST"` from coordinate thresholds:

- GK: `relY ≥ 0.90`
- DEF: `relY ≥ 0.73`
- DEF_MID: `relY ≥ 0.55`
- MID: `relY ≥ 0.48`
- ATT_MID: `relY ≥ 0.32`
- ATT: `relY < 0.32`

This is **one-way (coords → label)** and zone-based, so two players at slightly different coords can both label as "LB" but there's no canonical "LB slot" to snap to.

### Snap points

`src/components/HomePage/hooks/useFieldCoordination.ts:667-673`. `formationSnapPoints` combines GK slot + formation positions + sub slot coordinates. Snapping uses a 36px threshold — pure coordinate distance, no role awareness.

### Gap for the planner

The planner thinks in roles: *"Alexandra plays LB in game 3"*. To round-trip cleanly into `playersOnField` we need:

- **Role → coord**: given `"LB"` for the active formation, where does the disc go?
- **Coord → role**: given `{relX, relY}` of a disc, which role slot is it filling?

### Proposed bridge (low-impact, additive)

Extend `FormationPreset` with an optional `roles` map:

```ts
interface FormationPreset {
  // ... existing fields unchanged ...
  roles?: Record<string, FieldPosition>;  // { "LB": { relX: 0.15, relY: 0.75 }, ... }
}
```

Add helpers in `src/utils/formations.ts`:

- `rolesForPreset(preset)` → ordered role list
- `coordForRole(preset, role)` → `{ relX, relY } | null`
- `roleForCoord(preset, relX, relY, tolerance)` → role name or null (nearest-neighbour match within tolerance)

Backwards compatible: existing code consumes `positions[]` as today. Planner-aware code reads `roles`. Migration is just filling the `roles` maps in each preset — not a schema migration.

---

## Live-game runtime

### State owner

`src/hooks/useGameSessionReducer.ts`. Reducer fields (lines 5-46) include `timeElapsedInSeconds`, `isTimerRunning`, `gameStatus`, `gameEvents`, `subIntervalMinutes`, `nextSubDueTimeSeconds`, `subAlertLevel`. Actions: `SET_TIMER_ELAPSED`, `ADD_GAME_EVENT`, `CONFIRM_SUBSTITUTION`, `SET_SUB_INTERVAL`, …

### Timer tick

`src/hooks/useGameTimer.ts:91-131`. Uses `usePrecisionTimer` (not `setInterval`) with a **50ms tick interval**. On each tick, dispatches `SET_TIMER_ELAPSED { payload: elapsedSeconds }`. Reducer recomputes `subAlertLevel` by comparing `timeElapsedInSeconds >= nextSubDueTimeSeconds` (line 348) — when true, alert level becomes `'due'`.

### Existing sub reminder UX

`src/components/TimerOverlay.tsx:106-110`. When `subAlertLevel === 'due'`, the timer text turns red/orange. **No banner, no toast, no button.** The coach is expected to decide and use the existing substitution UI.

### Banner / toast infrastructure

`src/contexts/ToastProvider.tsx:1-127`. Production-grade toast via `useToast()` hook. Auto-dismiss 3–5 s. Rendered top-right with safe-area awareness. Usable as-is for sub-notification, but a **sticky banner** is probably better UX (toast auto-hides before coach can react). Follow the pattern in `UpdateBanner.tsx` for a persistent-until-dismissed banner.

### Substitution creation today

`ADD_GAME_EVENT` (reducer line 297-298) appends `{ type: 'substitution', time, entityId }`. Full-save pattern (Rule 11): the reducer only mutates local state; the parent orchestrator must call `dataStore.saveGame(id, fullState)` to persist. No incremental writes.

### How scheduled subs would land

1. Add `scheduledSubs?: ScheduledSub[]` to `GameSessionState` AND to `Game` (persisted form).
2. New reducer actions: `ADD_SCHEDULED_SUB`, `FIRE_SCHEDULED_SUB`, `SKIP_SCHEDULED_SUB`, `APPLY_SCHEDULED_SUB` (the last converts it into a real `substitution` `GameEvent`).
3. Extend `SET_TIMER_ELAPSED` handler (reducer line 340-353) to also find any pending sub whose `timeSeconds` is now past and dispatch `FIRE_SCHEDULED_SUB` (sets `activeScheduledSubPrompt`). 50 ms precision is overkill — debounce to 1 s for this check.
4. Add a sticky `<ScheduledSubBanner>` component reading `activeScheduledSubPrompt` from the reducer. Two buttons: **Apply** dispatches `APPLY_SCHEDULED_SUB` (appends substitution GameEvent, resets `nextSubDueTimeSeconds`); **Skip** dispatches `SKIP_SCHEDULED_SUB`. Either way, banner clears.
5. Parent orchestrator detects state change → full-save (Rule 11).

**Reusability:** This feature works without the planner. A coach can manually schedule a sub for 14:30 in the game-setup modal, and the banner fires. The planner just writes bulk scheduled subs into the same field.

---

## Navigation & UI shell

### No routes — all modals

`src/app/page.tsx` swaps between two "screens" (`start` vs `home`), and everything else is a modal. 26 modals already exist (Stats, LoadGame, GameSettings, Roster, Teams, Personnel, Seasons/Tournaments, Assessment, Training, Rules, Settings, …).

### Modal machinery

- **State:** `src/contexts/ModalProvider.tsx` holds each modal's `isOpen` boolean plus a setter. Added as a one-line pair per new modal.
- **Render:** `src/components/HomePage/containers/ModalManager.tsx` mounts every modal (most via `next/dynamic` for code splitting). Rendered conditionally from the provider state.
- **Trigger:** `src/components/ControlBar.tsx` (the hamburger side-menu). Opens a 320px slide-in panel with 5 sections (Game Management / Setup & Config / Analysis & Tools / Resources / Settings). Menu items are plain buttons with `HiOutline*` icons from `react-icons/hi2`.
- **i18n:** `public/locales/{en,fi}/common.json`. Dotted keys like `controlBar.menu.planning`. Always called via `useTranslation()` with a fallback string.
- **Design:** Overlay z-60, `bg-black bg-opacity-70`, inner card `bg-slate-800 rounded-lg`. Header `text-3xl font-bold text-yellow-400 tracking-wide`. Footer via `<ModalFooter>` helper from `src/styles/modalStyles`. Close button uses `primaryButtonStyle`.

### Skeleton for a new modal

See `src/components/RulesDirectoryModal.tsx` as the smallest complete reference. Four-step plumb-in:

1. **Create** `src/components/PlanningModal.tsx` following the Rules skeleton (header + scroll area + ModalFooter).
2. **Register** `isPlanningModalOpen` + setter in `ModalProvider`.
3. **Mount** via `const PlanningModal = dynamic(() => import('@/components/PlanningModal'))` in `ModalManager`, render with open/close props.
4. **Link** a menu item in `ControlBar.tsx` (Analysis & Tools section) with `wrapModal(() => setIsPlanningModalOpen(true))`.

Plus two i18n entries (`en` + `fi`).

### Recommended placement for "Planning"

**Modal in the Analysis & Tools section of the ControlBar menu.** Matches the 26-modal pattern exactly; no routing refactor; peers with Stats and Player Assessment which are semantically adjacent. Route-based alternative would require refactoring `useDeepLinkHandler` and breaks the established SPA pattern.

---

## Adding a new entity end-to-end (PlanningSession)

There's a repeatable recipe. Team is the closest structural analogue.

### Files to touch

| # | File | What to add | Copy from |
|---|---|---|---|
| 1 | `src/types/index.ts` | `interface PlanningSession { ... }` | Team lines 28-41 |
| 2 | `src/config/storageKeys.ts` | `PLANNING_SESSIONS_KEY = 'planning_sessions:index'` | Existing keys |
| 3 | `src/config/validationLimits.ts` | Name/notes max | Team entry |
| 4 | `src/interfaces/DataStore.ts` | 5 method signatures | Team section 124-172 |
| 5 | `src/datastore/LocalDataStore.ts` | Loader + 5 implementations + key-locks | Team lines 775-935 |
| 6 | `src/datastore/SupabaseDataStore.ts` | Row types + transforms + 5 implementations | Team section ~800-1300 |
| 7 | `supabase/migrations/NNN_planning_sessions.sql` | Table + RLS + indexes | `000_schema.sql` + `002_rls_policies.sql` |
| 8 | `src/sync/types.ts` | Add `'planningSession'` to `SyncEntityType` | Existing union |
| 9 | `src/sync/createSyncExecutor.ts` | Switch case reusing `createStandardExecutor` | Existing cases |
| 10 | `src/config/queryKeys.ts` + `src/hooks/usePlanningSessionQueries.ts` | Query + mutation hooks | `useTeamQueries.ts` |
| 11 | Tests: `src/datastore/LocalDataStore.test.ts` + `usePlanningSessionQueries.test.tsx` | CRUD + mutation tests | Team tests |

### Must-respect rules (from CLAUDE.md)

- **Rule 1** — Empty string ↔ NULL at the Supabase boundary for every optional string FK or text field.
- **Rule 6** — Composite uniqueness validated in app code (not just DB) — even if SQL is simpler.
- **Rule 12** — Cloud = local-first-plus-sync. No Supabase-only code paths.
- **Rule 14** — Validation parity. Extract validators to `src/datastore/validation.ts` so both stores enforce identically.
- **Rule 17** — Postgres handles concurrency; don't add app-level locks in SupabaseDataStore.
- **Rule 19** — Apply all legacy migrations (e.g. clubSeason compute) through DataStore getters, not raw storage reads.

Estimated effort for a simple entity: **~4 hours**. Two of those are tests.

### No factory changes required

`factory.ts` is mode-aware but entity-agnostic. Once the DataStore interface and both implementations carry the new methods, nothing else there changes.

---

## Integration risk map

Where effort most likely balloons.

### 1. Role↔coord bridge — medium risk

If coaches run multiple formations per tournament, filling the `roles` map for every preset is a tedious-but-necessary one-time data task. Missing role maps break the planner's mental model silently. Guard with a validator: any `FormationPreset` used by a planned game must have its `roles` map populated.

### 2. Scheduled-sub edge cases — medium risk

- What if the game timer is paused at the planned time? Fire when resumed past the mark, or skip automatically?
- What if two scheduled subs are at the same time for different players? Banner needs to handle a queue or show multiple rows.
- What if the coach applies an unplanned substitution at 11:00 that makes a 12:00 planned sub impossible (target player already off)? Probably auto-skip with a log entry.

These are live-match details. Decide each in phase 0 so the model supports them.

### 3. Full-save pattern cost — low risk

Every scheduled-sub state change saves the whole game. Fine at the app's scale (single-user, <100 games) but don't try to compose 50 sub-events rapidly in a loop — debounce writes at the planner layer.

### 4. Formation variability across selected games — medium risk (planner-specific)

If the coach picks two games with different formations, the pitch grid and role set differ per game. MVP guard: game picker rejects heterogeneous selections (already decided in the design plan). Without this, the planner UI grows a branching layer.

### 5. Roster identity — low risk

`availablePlayers` can differ per game (a kid absent from game 2 but not game 3). The planner's minute math must treat the union across selected games, but marker UI must clarify when a player is literally absent from a game vs just on the bench. Needs a small "missing roster" treatment in the planner.

### 6. Sync race on Apply — low risk

Applying a plan to 5 games in cloud mode pushes 5 saveGame operations into the sync queue. Already how it works for any bulk change. No new work; just confirm the queue handles 5 rapid enqueues correctly.

---

## Open technical questions that need decisions

These can't be answered from code alone.

1. **Where exactly does `ScheduledSub` live on a `Game`?** Three options:
   - `Game.scheduledSubs: ScheduledSub[]` — simple, tightly coupled, good default.
   - Sidecar table in Supabase (`game_scheduled_subs`). Cleaner for queries across games but adds a transform/relation.
   - Inside `tacticalDiscs`-adjacent JSONB (`game_tactical_data.scheduled_subs`) — piggybacks an existing JSONB field, minimal schema change.

   Recommended: option (a) initially; split to (b) only if cross-game queries show up as a hot path.

2. **Is `FormationPreset` user-editable?** If yes, where? I didn't find a formation editor. The preset config file is static. If users need custom formations for the planner, we need a small editor UI and a way to store custom presets per team.

3. **Auto-apply starting XI on game open or prompt?** (Open Q 2 in the design plan.) Default lean is prompt, but it depends on how often coaches plan vs improvise.

4. **How to migrate data from the standalone?** The standalone's JSON export has its own shape (hardcoded 11 players + 5 games + 8 positions). The one-time importer must transform that into `PlanningSession` + game edits, respecting the Rule 3 player-array subset. Design the mapping in phase 5, not phase 0.

5. **Where does `PlanningSession` belong in the ControlBar menu?** Analysis & Tools is recommended. Confirm in UX review.

---

## Appendices

### A. Modals already in the app

(Via `ControlBar.tsx` search.) All follow the same open/close pattern described in §"Navigation & UI shell":

GameSettings, LoadGame, RosterSettings, TeamManager, SeasonTournamentManagement, GameStats, PlayerAssessment, PersonnelManager, TrainingResources, RulesDirectory, Settings (with 3 tabs: general/data/account/about), BackupRestoreResults, MigrationWizard, ReverseMigrationWizard, CloudSyncSection, PendingSyncWarning, GoalLog, InstructionsModal, Upgrade, Tournament/SeasonDetails, SubscriptionWarning, plus update / install banners.

Planning will be modal #27.

### B. CLAUDE.md rules most relevant to the integration

Rule 1 (empty ↔ NULL), Rule 3 (player array subsets), Rule 4 (event order_index), Rule 8 (JSONB defaults — `?? []` not `|| []`), Rule 11 (event CRUD = full-save), Rule 12 (local-first sync), Rule 14 (validation parity), Rule 17 (no app locks in Supabase).

### C. Key file atlas (quick reference)

| Area | File |
|---|---|
| Types | `src/types/index.ts`, `src/types/game.ts`, `src/types/personnel.ts` |
| DataStore | `src/interfaces/DataStore.ts`, `src/datastore/LocalDataStore.ts`, `src/datastore/SupabaseDataStore.ts`, `src/datastore/factory.ts` |
| Sync | `src/sync/types.ts`, `src/sync/createSyncExecutor.ts`, `src/sync/SyncedDataStore.ts` |
| Game runtime | `src/hooks/useGameSessionReducer.ts`, `src/hooks/useGameTimer.ts`, `src/hooks/usePrecisionTimer.ts` |
| Field | `src/components/SoccerField.tsx`, `src/components/HomePage/hooks/useFieldCoordination.ts`, `src/config/formationPresets.ts`, `src/utils/positionLabels.ts` |
| UI shell | `src/app/page.tsx`, `src/components/ControlBar.tsx`, `src/contexts/ModalProvider.tsx`, `src/components/HomePage/containers/ModalManager.tsx`, `src/styles/modalStyles.ts` |
| Toast | `src/contexts/ToastProvider.tsx`, `src/components/UpdateBanner.tsx` |
| i18n | `public/locales/en/common.json`, `public/locales/fi/common.json` |
| Migrations | `supabase/migrations/` |

### D. What was NOT investigated

- **Authentication flows** (LocalAuthService / SupabaseAuthService). Planner doesn't need to touch auth.
- **Edge Functions** (subscription / delete-account). Not in scope.
- **PWA update flow**. Working as-is; the integrated planner will be part of the same SW.
- **Internationalization of dynamic content** (player names, team names). Not relevant — already handled at display layer.
- **Screen reader behaviour** on the soccer field. Out of scope for the integration itself.

---

**Next action:** review this survey alongside the design plan (`tournament-planner-integration.md`). The two docs together are sufficient to start Phase 0 (scheduled subs) without further discovery. Open questions above each need a one-line decision appended to the design plan before Phase 0 starts.
