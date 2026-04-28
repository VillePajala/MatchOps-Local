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

### Scope

- [ ] `supabase/migrations/029_scheduled_subs.sql` — adds `scheduled_subs` JSONB column to `games` table (default `'[]'::jsonb`). Additive only.
- [ ] `src/types/game.ts` — extend `Game` interface with `scheduledSubs?: ScheduledSub[]` and a new `ScheduledSub` type per the integration design plan.
- [ ] `src/datastore/LocalDataStore.ts` — round-trip `scheduledSubs` through IndexedDB transforms. `?? []` defaulting per CLAUDE.md Rule 8.
- [ ] `src/datastore/SupabaseDataStore.ts` — forward (App→DB) and reverse (DB→App) transforms for `scheduled_subs`. Same `?? []` defaulting.
- [ ] `src/datastore/validation.ts` — extend `validateGame` to validate `scheduledSubs` shape (id, role, timeSec, outPlayer, inPlayer).

### Tests

- [ ] `src/datastore/LocalDataStore.test.ts` — round-trip a game with `scheduledSubs[]`.
- [ ] `src/datastore/SupabaseDataStore.test.ts` — forward + reverse transform tests, `?? []` default cases.
- [ ] `src/datastore/validation.test.ts` — invalid `scheduledSubs` shape rejected.
- [ ] `supabase/migrations/__tests__/029_scheduled_subs.test.ts` — column added, default value, RLS policies inherit from `games`.

### Verification

- [ ] Migration applies cleanly on staging via MCP.
- [ ] `npm test` passes (no regressions; coverage thresholds hold).
- [ ] `npm run build` passes.
- [ ] Manual: cloud-mode game still loads + saves on staging.

---

## PR 3 — Phase 0b: live-game banner for scheduled subs

**Branch:** `planner/03-scheduled-subs-banner` → `feature/planner-integration`

### Scope

- [ ] `src/hooks/useGameSessionReducer.ts` — actions `ADD_SCHEDULED_SUB`, `FIRE_SCHEDULED_SUB`, `SKIP_SCHEDULED_SUB`, `APPLY_SCHEDULED_SUB`. Timer tick handler checks `scheduledSubs` and fires due ones.
- [ ] `src/components/ScheduledSubBanner.tsx` — sticky banner ("Planned: OUT Roope / IN Tomas at CDM · Apply · Skip"). Reuses pattern from `UpdateBanner.tsx`.
- [ ] `src/components/GameSettingsModal.tsx` — minimal UI to add/edit/delete a scheduled sub (foundation; richer planner UI comes in Phase 2).
- [ ] Decision documented in this file: pause-time + duplicate-time edge cases (see "Open questions" in `tournament-planner-integration.md`).

### Tests

- [ ] Reducer unit tests for all four new actions.
- [ ] Banner component tests (render, Apply→event, Skip→no event).
- [ ] Integration: timer ticks past a scheduled sub → banner appears.
- [ ] Edge case: timer paused when sub time arrives → behaviour matches the chosen rule from the docs.

### Verification

- [ ] Manual: schedule a sub, run the game timer past it on staging, banner fires.
- [ ] Manual: Apply creates a `substitution` GameEvent with correct `order_index`.

---

## PR 4 — Phase 0.5: External planner bridge (JSON envelope)

**Branch:** `planner/04-bridge-export-import` → `feature/planner-integration`

### Scope

- [ ] `src/components/PlanningModal.tsx` — new modal. Empty state + "Import plan from JSON" button. (Saved-session listing comes in Phase 3.)
- [ ] `src/components/HomePage/containers/ModalManager.tsx` — register PlanningModal.
- [ ] `src/contexts/ModalProvider.tsx` — `isPlanningModalOpen` state.
- [ ] `src/components/ControlBar.tsx` — "Planning" menu item (Analysis & Tools section).
- [ ] `src/utils/planExport.ts` — JSON envelope reader/writer with `formatVersion: 1`. Matches the standalone planner's contract verbatim.
- [ ] `src/utils/planExport.ts` — game-picker constraint: homogeneous selection (same team, format, duration).
- [ ] i18n keys for the menu item and modal labels (en + fi).

### Tests

- [ ] Unit tests for `planExport`: round-trip a sample envelope.
- [ ] Validator rejects malformed envelopes (wrong version, missing fields, bad role names for the formation).
- [ ] Modal test: open/close lifecycle, "Import" file picker.

### Verification

- [ ] Manual: export a plan from the standalone, import it into MatchOps-Local. The plan loads as a draft.

---

## PR 5 — Phase 1: Planning menu + in-memory editor

**Branch:** `planner/05-editor-in-memory` → `feature/planner-integration`

### Scope (revised estimate ~2.5 weeks of work)

- [ ] `src/config/formationPresets.ts` — add the `roles?` map per the integration plan's #1 risk fix. Plus the `sub: 'never' | 'preserved' | 'preferred'` tag. Mirror the standalone's role names exactly.
- [ ] `src/utils/formations.ts` — `rolesForPreset`, `coordForRole`, `roleForCoord` helpers.
- [ ] `src/components/PlanningModal.tsx` — game picker + starting-XI editor + bench drawer. Drag-drop on desktop, tap-to-swap on mobile (port from standalone's `performSwap`).
- [ ] Apply-now flow: write `startingXI` → `Game.playersOnField` (resolving role → relX/relY via `roles` map) + `Game.selectedPlayerIds`. No save of the plan itself yet.

### Tests

- [ ] `formations.test.ts` — round-trip role↔coord for every preset.
- [ ] `PlanningModal.test.tsx` — game picker constraint, swap engine corner cases (cross-half bench overflow, merge unwind, same-position cross-half flip — port the standalone's regression tests).
- [ ] Integration: select games → set XI → Apply → games update.

### Verification

- [ ] All formation presets have role names matching the standalone.
- [ ] Apply preserves `playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers` (CLAUDE.md Rule 3).

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
