# Tournament Planner Integration — PR Plan

**Status:** active · **Last updated:** 2026-04-28 · **Owner:** @valoraami
**Companions:**
- `tournament-planner-integration.md` — design plan (the *what* and *why*)
- `tournament-planner-integration-survey.md` — code-base findings (the *where*)
- `tournament-planner-integration-safety.md` — process rules (the *how*)

This is the executable form of the integration plan. Each section is one PR. Tick boxes as PRs merge into `feature/planner-integration`.

## Branching

```
master                              ← never touched until final cutover
└── feature/planner-integration     ← long-running integration branch
    ├── planner/01-foundation       ← this PR
    ├── planner/02-scheduled-subs-schema
    ├── planner/03-scheduled-subs-types
    ├── ... etc
```

Each sub-PR targets `feature/planner-integration`, not master. AI review fires on PR open. User merges manually.

---

## PR 1 — Foundation: docs, drift fix, safety rules

**Branch:** `planner/01-foundation` → `feature/planner-integration`
**Status:** in flight

### Scope

- [x] `supabase/migrations/028_fix_consent_rpc_ordering.sql` — backport of the production-only patch applied 2026-02-10. Idempotent (`CREATE OR REPLACE FUNCTION`), already live on prod and staging.
- [x] `docs/03-active-plans/tournament-planner-integration.md` — first-class commit (was untracked).
- [x] `docs/03-active-plans/tournament-planner-integration-survey.md` — first-class commit (was untracked).
- [x] `docs/03-active-plans/tournament-planner-integration-safety.md` — new, the process rules.
- [x] `docs/03-active-plans/tournament-planner-integration-pr-plan.md` — this file.

### Doc updates from current planner state (already in the docs)

The standalone planner has evolved since the integration docs were written. Captured in the doc updates landing in this PR:

- **Period model.** Planner now stores canonical `numberOfPeriods` + `periodDurationMinutes` matching MatchOps-Local's existing fields. One less transform than the doc anticipated.
- **Role stamina tag.** Each formation role carries `sub: 'never' | 'preserved' | 'preferred'`. When MatchOps-Local adopts the `roles?` map on `FormationPreset` (see Phase 1), this tag should land alongside it.
- **Standalone interactivity grew.** Detail view, multi-sub workflow, segment-level Move/Replace/Remove, role-aware fair-share. Phase 1's "starting-XI editor with drag-drop" is now ~2.5 weeks rather than 1.5.

### Tests

None — doc-only PR plus an idempotent SQL backport that's already live everywhere.

### Verification

- [ ] `npm run build` passes locally.
- [ ] AI review on GitHub raises no blocking concerns.

---

## PR 2 — Phase 0a: `scheduledSubs` schema + types

**Branch:** `planner/02-scheduled-subs-schema` → `feature/planner-integration`
**Status:** in flight

### Scope

- [x] `supabase/migrations/029_scheduled_subs.sql` — adds `scheduled_subs` JSONB column to `games` table (default `'[]'::jsonb`). Additive only.
- [x] `supabase/migrations/030_save_game_rpc_scheduled_subs.sql` — `CREATE OR REPLACE` of `save_game_with_relations` so the upsert clause writes `scheduled_subs`. Without this the RPC silently drops the new column on every save (it enumerates each games-table column explicitly — see `023_fix_save_game_rpc.sql`).
- [x] `src/types/game.ts` — adds `ScheduledSub`, `ScheduledSubStatus`, and a `PositionRole = string` placeholder (real type lands in PR 5 with the formation-roles map per issue #372). Adds `scheduledSubs?: ScheduledSub[]` on `AppState`.
- [x] `src/types/supabase.ts` — adds `scheduled_subs: Json` to games Row/Insert/Update.
- [x] `src/datastore/LocalDataStore.ts` — round-trips `scheduledSubs` through IndexedDB; adds `[]` default to `createGame`. (No per-field transform needed — IndexedDB stores AppState whole.)
- [x] `src/datastore/SupabaseDataStore.ts` — forward (App→DB) and reverse (DB→App) transforms with `?? []` defaulting (CLAUDE.md Rule 8). Adds `[]` default to `createGame`.
- [x] `src/datastore/validation.ts` — extends `validateGame` with `validateScheduledSubs` (id, timeSeconds, outPlayer, inPlayer, positionRole, status).

### Tests

- [x] `src/datastore/LocalDataStore.test.ts` — round-trip a game with `scheduledSubs[]`; reject malformed entries.
- [x] `src/datastore/__tests__/SupabaseDataStore.test.ts` — forward + reverse transform tests covering: undefined → `[]`, well-formed preserved, `null`/non-array DB row → `[]`.
- [x] `src/datastore/__tests__/validation.test.ts` — rejects every individual malformed shape, accepts valid + omitted.
- [x] `supabase/migrations/__tests__/029_030_scheduled_subs.verification.sql` — psql verification: column shape + default; RPC body still contains `scheduled_subs = EXCLUDED.scheduled_subs`. Matches the existing `*.verification.sql` pattern in `__tests__/`; the repo has no Jest harness for migrations.

### Verification

- [ ] Migration applies cleanly on staging via MCP.
- [ ] `npm test` passes (no regressions; coverage thresholds hold).
- [ ] `npm run build` passes.
- [ ] Manual: cloud-mode game still loads + saves on staging.

---

## PR 3 — Phase 0b: live-game banner for scheduled subs

**Branch:** `planner/03-scheduled-subs-banner` → `feature/planner-integration`
**Status:** in flight

### Scope

- [x] `src/hooks/useGameSessionReducer.ts` — adds `scheduledSubs?` and `activeScheduledSubPrompt?` state and five new actions: `ADD_SCHEDULED_SUB`, `UPDATE_SCHEDULED_SUB`, `DELETE_SCHEDULED_SUB`, `SKIP_SCHEDULED_SUB`, `APPLY_SCHEDULED_SUB`. Banner firing is implicit via `SET_TIMER_ELAPSED` (it surfaces the first pending due sub whenever the timer is running) — no separate FIRE action.
- [x] `src/components/ScheduledSubBanner.tsx` — sticky `role="alert"` banner with Apply / Skip buttons, modelled on `UpdateBanner.tsx`.
- [x] `src/components/ScheduledSubsSection.tsx` — minimal add/edit/delete editor wired into `GameSettingsModal`. Save disabled when out=in or fields missing; edit disabled on already-fired/skipped subs.
- [x] Wiring: handlers added to `useGameSessionCoordination`, threaded through `useGameOrchestration` → `useModalOrchestration` → `ModalManager` → `GameSettingsModal`. Banner mounts in `HomePage.tsx` reading from a new `scheduledSubBannerProps` exposed by the orchestration return.
- [x] Decisions documented in `tournament-planner-integration.md` § "Decisions closed in PR 3": pause-time edge (no fire while paused) + duplicate-time edge (one banner at a time, queue tail).
- [x] i18n keys added to `public/locales/{en,fi}/common.json` for `scheduledSubBanner.*` and `scheduledSubsSection.*`.

### Tests

- [x] Reducer: 12 new cases — ADD/UPDATE/DELETE/FIRE/SKIP/APPLY plus three SET_TIMER_ELAPSED cases (fires due sub, skips while paused, no override of existing prompt, ignores already-fired entries) plus LOAD_PERSISTED restoration.
- [x] `ScheduledSubBanner.test.tsx` — 10 cases including hidden-when-null, `role`/`aria-live` for assertive announcement, button click delegation, name fallback to player id.
- [x] `ScheduledSubsSection.test.tsx` — 9 cases including empty state, save flow, validation gates (missing fields, out===in), edit pre-fill, delete, fired-row edit-disable.
- [x] `ModalManager.test.tsx` regression: existing tests still green after adding three new handler stubs.

### Verification

- [ ] Manual: schedule a sub via Game Settings, run the game timer past it on staging, banner fires.
- [ ] Manual: Apply creates a `substitution` GameEvent at the current elapsed time and persists.

---

## PR 4 — Phase 0.5: External planner bridge (JSON envelope)

**Branch:** `planner/04-bridge-export-import` → `feature/planner-integration`
**Status:** in flight

### Scope

- [x] `src/components/PlanningModal.tsx` — new modal. Empty state + "Import plan from JSON" file-picker. Surfaces a per-error path on validation failure and a parsed-summary card on success. Saved-session listing remains a Phase 3 deliverable.
- [x] `src/components/HomePage/containers/ModalManager.tsx` — registers PlanningModal via the `dynamic` lazy-load pattern, alongside the new `closePlanningModal` handler in the props interface.
- [x] `src/contexts/ModalProvider.tsx` — `isPlanningModalOpen` + setter added to the context value and memo deps.
- [x] `src/components/ControlBar.tsx` — "Planning" menu item with `HiOutlineCalendarDays` icon, placed first in the Analysis & Tools section.
- [x] `src/utils/planExport.ts` — `parsePlanExport` (reader/validator with structured `{message, path}` errors) and `serializePlanExport` (writer). Translates field names `timeSec`↔`timeSeconds`, `role`↔`positionRole`; stamps `status: 'pending'` on import, strips it on export. Matches standalone's `formatVersion: 1` envelope verbatim.
- [x] i18n keys for the menu item and modal labels (en + fi). Counts +14 in `i18n-validation` snapshot.

**Deferred to PR 5/8 (deliberate scope decision):** game-picker constraint (homogeneous selection by team/format/duration). The planExport reader doesn't need it — the constraint is a UI concern that lives next to the editor in PR 5. Tracked in the modal's empty-state hint.

### Tests

- [x] `src/utils/__tests__/planExport.test.ts` — 13 cases. Reader: well-formed accept, JSON parse error, formatVersion mismatch, kind mismatch, missing tournament, empty games array, fractional rosterSize, fractional timeSec, out===in, duplicate sub ids, included[] padding. Writer: round-trip, wire-shape (timeSec/role not timeSeconds/positionRole, status stripped).
- [x] `src/components/__tests__/PlanningModal.test.tsx` — 8 cases. Closed-render no-op, empty-state copy, Done callback, success summary, validation-failure error + path display, JSON parse failure surfacing, state reset on close + reopen.
- [x] `ModalManager.test.tsx` regression: handler/state fixtures updated for `closePlanningModal` / `isPlanningModalOpen`.
- [x] Integration regressions (`modals.portalization`, `controlBar.modal-guard`, `menu.modal-deferral`) updated for the new ControlBar prop and ModalManager state field.

### Verification

- [ ] Manual: export a plan from the standalone, import it into MatchOps-Local. The plan loads as a draft.

---

## PR 5a — Phase 1 foundation: formation roles map + helpers

**Branch:** `planner/05-editor-in-memory` → `feature/planner-integration`
**Status:** in flight

The original Phase 1 (PR 5) was estimated at ~2.5 weeks. To keep the autonomous loop's review windows tight, Phase 1 splits into 5a (this) + 5b.

### Scope

- [x] `src/config/formationPresets.ts` — adds the `roles?` map to every built-in preset, mirroring the standalone planner's coordinates exactly. Each role carries `name`, `relX`, `relY`, and a `sub: 'never' | 'preserved' | 'preferred'` stamina tag (GK→`never`; preserved-set per standalone convention; rest→`preferred`). 5v5 has no preserved roles per the standalone.
- [x] `src/utils/formations.ts` — adds `FormationRole` type, `RoleStaminaTag`, `ROLE_COORD_TOLERANCE` constant, and three helpers: `rolesForPreset`, `coordForRole`, `roleForCoord`. The inverse helper snaps to the closest role within tolerance and returns `null` for off-formation coords.
- [x] Closes design plan open question #1 (role↔coord bridge) and resolves issue #372.

### Tests

- [x] `src/utils/__tests__/formations.roles.test.ts` — 14 cases. Registry coverage (every preset has roles, GK at canonical (0.5, 0.95) with `sub: 'never'`, role count = playerCount+1, names unique, coords in unit square). Round-trip: `coordForRole` and `roleForCoord` agree for every role of every preset; off-formation coords return `null`; jitter within tolerance still resolves; jitter beyond doesn't; near-tie picks closest. Stamina tags exactly match the standalone's convention.

### Verification

- [x] All formation presets have role names matching the standalone (round-trip test confirms).

---

## PR 5b — Phase 1 editor foundation: swap engine + Apply utility + import bridge

**Branch:** `planner/05b-editor-ui` → `feature/planner-integration`
**Status:** in flight

PR 5b further splits into 5b (this — pure-logic foundation) and 5c (the actual editor UI). Same justification as 5a → 5b: the autonomous loop reviews better with smaller, focused pieces, and shipping the pure logic first lets PR 5c's UI build on tested primitives.

### Scope

- [x] `src/utils/planSwapEngine.ts` — pure swap operations on a `PlanDraft = { startingXI: Record<RoleName, PlayerId>, bench: PlayerId[] }`. `performSwap` covers field↔field, bench↔field, field→bench. Returns the same draft for invalid ops (same-source/target, bench↔bench, missing benchPlayerId, empty source). `createEmptyDraft(roster)` and `checkRosterIntegrity(draft, roster)` round out the toolkit. No mutation; all ops return new drafts.
- [x] `src/utils/planApply.ts` — `applyDraftToGame(draft, preset, roster)` produces `{ playersOnField, selectedPlayerIds, unknownRoles, unknownPlayerIds }`. Resolves role→coords via the PR 5a `roles?` map; surfaces unknown roles + unknown player ids without throwing. Preserves CLAUDE.md Rule 3 (playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers).
- [x] `src/utils/planFromImport.ts` — `planDraftFromImport(importedGame, roster)` bridges PR 4's reader output to a `PlanDraft`. Strips unknown player ids and surfaces them; bench preserves roster order for snapshot determinism.

### Tests

- [x] `planSwapEngine.test.ts` — 20 cases. Invalid ops are no-ops; field↔field swap (assigned/empty/both empty); bench↔field (move, displace, return); roster-integrity over a sequence of swaps.
- [x] `planApply.test.ts` — 11 cases. Coords from preset roles map; player metadata preserved; Rule 3 satisfied; legacy preset (no `roles`) gracefully returns empty playersOnField; unknown role names + unknown player ids filtered + surfaced; null preset; pathological draft with same player in two roles doesn't crash.
- [x] `planFromImport.test.ts` — 6 cases. Filters unknown ids; skips empty slots; bench order deterministic.

37/37 tests pass.

### Verification

- [x] Pure logic; no UI / orchestration changes. `npm test`-affected only via the new test files.

---

## PR 5c — Phase 1 UI part 1: multi-page navigation + game picker

**Branch:** `planner/05c-editor-ui` → `feature/planner-integration`
**Status:** in flight

Phase 1 UI (originally PR 5c) further splits into 5c (this — picker) + 5d (editor + Apply) + 5e (drag-drop polish, optional). Keeps each PR focused enough to review in one sitting. Editor + Apply ride together in 5d because they have no value separately.

### Scope

- [ ] `src/components/PlanningModal.tsx` — convert to a page state machine (`'list' | 'picker'` for now; `'editor'` lands in 5d). Add a "New plan" CTA on the list page that opens the picker.
- [ ] `src/components/PlanningGamePicker.tsx` — list of saved games for the active team with multi-select. Homogeneous-set guard: same team / formation / numberOfPeriods + periodDurationMinutes; the "Continue" CTA is disabled with a helpful hint when violated.
- [ ] `ModalManager.tsx` — pass `savedGames`, `currentGameId`, and the `currentTeamId` (or just `gameSessionState.teamId`) into PlanningModal so the picker can scope to the right team.
- [ ] i18n keys for the picker page (en + fi).

### Tests

- [ ] `PlanningModal.test.tsx` — page navigation: list → picker → back to list; picker disabled state when fewer than one valid game.
- [ ] `PlanningGamePicker.test.tsx` — homogeneous-set guard rejects mixed formations / mixed durations; allows a single game; allows multiple games sharing all relevant fields.

### Verification

- [ ] Manual: open Planning, click "New plan", verify the picker lists this team's games and blocks heterogeneous selections with a clear hint.

---

## PR 5d — Phase 1 UI part 2: editor + Apply

**Branch:** `planner/05d-editor-apply` → `feature/planner-integration`

### Scope

- [ ] `src/components/PlanningEditor.tsx` — pitch with role labels + bench drawer + tap-to-swap. Uses `planSwapEngine` from PR 5b.
- [ ] Apply-now: wire `applyDraftToGame` (PR 5b) into the existing `mutateGameDetails` path so each selected game persists via the auto-save tier.
- [ ] PlanningModal page state extends to `'editor'`; "Continue" from the picker enters the editor.

**Legacy-coord fallback** (raised on PR 5a): pre-existing saved games hold the old 11v11 midfield X-coords (~0.05 drift). The editor uses the `roleForCoord` helper (PR 5b) to derive role assignments from `playersOnField` when loading a saved game; off-formation players surface as drag-targets the coach can manually slot. No data migration.

### Tests

- [ ] `PlanningEditor.test.tsx` — tap-to-swap interactions; legacy-coord game loads without crashing; off-formation players surface separately.
- [ ] Integration: pick games → set XI → Apply → games update via `mutateGameDetails`.

### Verification

- [ ] Apply preserves `playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers` (CLAUDE.md Rule 3).

---

## PR 5e — Phase 1 polish (optional): desktop drag-drop

**Branch:** `planner/05e-drag-drop` → `feature/planner-integration`

### Scope

- [ ] Drag-drop on desktop in `PlanningEditor.tsx` (HTML5 drag events). Tap-to-swap remains the mobile fallback.
- [ ] Visual feedback: drop targets highlight on dragover; drag-source dims.

May fold into a later UX polish pass if not needed in MVP.

---

## PR 6 — Phase 2: Timeline sub editor

**Branch:** `planner/06-timeline-sub-editor` → `feature/planner-integration`

### Scope

- [ ] Per-game timeline strip below the pitch (port from standalone's detail-view timeline).
- [ ] Drag markers to add/move subs, tap to edit out/in/position.
- [ ] Fairness math recomputes from intervals (not fixed halves).
- [ ] Subs flow into `Game.scheduledSubs` on Apply.

### Tests

- [ ] Timeline component renders correct segments for varied sub layouts.
- [ ] Apply writes correct `scheduledSubs[]` to the game record.
- [ ] Fairness math matches the standalone for a known fixture.

---

## PR 7 — Phase 3: `PlanningSession` entity

**Branch:** `planner/07-planning-session-entity` → `feature/planner-integration`

### Scope

- [ ] `supabase/migrations/030_planning_sessions.sql` — new table per the integration design.
- [ ] `src/types/index.ts` — `PlanningSession` interface.
- [ ] `src/interfaces/DataStore.ts` — `getPlanningSessions`, `savePlanningSession`, `deletePlanningSession`, `setActiveSession`.
- [ ] `src/datastore/LocalDataStore.ts` — IndexedDB implementation.
- [ ] `src/datastore/SupabaseDataStore.ts` — Postgres implementation + transforms.
- [ ] `src/sync/types.ts` + `src/sync/createSyncExecutor.ts` — register `'planningSession'` sync entity type.
- [ ] `src/hooks/usePlanningSessionQueries.ts` — React Query hooks.
- [ ] `src/components/PlanningModal.tsx` — Save / Rename / Delete / Duplicate UI; landing-screen session list.

### Tests

- [ ] `LocalDataStore.test.ts` — full CRUD on `PlanningSession`.
- [ ] `SupabaseDataStore.test.ts` — round-trip with sync queue.
- [ ] `usePlanningSessionQueries.test.tsx` — query + mutation hooks.
- [ ] Migration test: table created, RLS enforced.

---

## PR 8 — Phase 4: Apply preview + safety

**Branch:** `planner/08-apply-preview` → `feature/planner-integration`

### Scope

- [ ] Diff-preview modal before Apply ("Game 2: 3 changes — Verne → bench H2, Tomas → CDM, schedule 14:00 sub").
- [ ] Per-game opt-out checkboxes during Apply.
- [ ] 30-second post-Apply undo banner (restore from a transient cache; not full Undo history).

### Tests

- [ ] Diff calculator: produces correct diffs for representative changes.
- [ ] Undo restores the pre-Apply state exactly within the window.
- [ ] After 30 seconds, undo is no longer offered.

---

## PR 9 — Phase 5: Minutes dashboard + versioning polish

**Branch:** `planner/09-minutes-dashboard-and-polish` → `feature/planner-integration`

### Scope

- [ ] Port the standalone's quick-scan chip grid + multi-player focus comparison.
- [ ] Priority-player ★ marker, over/under fair-share signalling.
- [ ] Active-session toggle when multiple plans cover the same game set.
- [ ] One-time importer for legacy standalone JSON exports → `PlanningSession` records.

### Tests

- [ ] Minutes calculations match standalone for fixture data.
- [ ] Active-session toggle is mutually exclusive within a game set.

---

## Final cutover — `feature/planner-integration` → master

**Not a PR per se — the merge of the long-running branch.**

### Pre-merge checklist

- [ ] Every PR above has merged into `feature/planner-integration` and AI-reviewed clean.
- [ ] `npm test` passes (4500+ tests + new ones).
- [ ] `npm run build` passes.
- [ ] Manual smoke test on staging: Planning menu opens → game picker → editor → Apply → games updated. PlanningSession saves and reloads.
- [ ] Manual smoke test on staging: live-match scheduled-sub banner fires.
- [ ] Local mode parity confirmed (cloud features absent gracefully when in local mode).
- [ ] All migrations 029, 030, ... applied to staging without error.
- [ ] Standalone JSON envelope still imports correctly.

### Cutover steps (production)

1. Merge `feature/planner-integration` → `master` (user, manual).
2. Vercel auto-deploys to prod. Feature available, but new schema columns are still `null` (no migration applied yet).
3. Apply migrations 029, 030, ... to prod via MCP `apply_migration` against `aybjmnxxtgspqesdiqxd`, in version order.
4. Verify: a clean prod login → Planning menu → empty session list → import standalone export → save → reload → session reappears.
5. Announce to coaches; deprecate the standalone Vercel URL ~2 weeks later.

---

## Why this ordering

- **Phase 0 first** because `scheduledSubs` is independently useful (live-match banner) and unblocks all later planner phases.
- **Phase 0.5 (bridge) before Phase 1 (in-app editor)** so coaches can keep using the standalone with end-to-end JSON round-trip while the in-app editor is being built — no regression in capability during dev.
- **Phase 3 (PlanningSession entity) after Phase 1+2** because the in-memory editor is enough to validate the data shape before committing to a persistent table.
- **Phase 4 (Apply preview/safety) before Phase 5 (polish)** because Apply is destructive and we want safeguards in before fairness signals are pretty.
