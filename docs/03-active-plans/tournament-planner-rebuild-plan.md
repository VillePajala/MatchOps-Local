# Tournament Planner — Rebuild Plan (parity with standalone)

**Status:** PR-A in flight (review converging) — PRs B–F not yet started
**Author:** drafted after the pass-10 review of PR #404 surfaced the divergence
**Source of truth for the target UX:** `tournament-planner/planner.html` (1450-line standalone HTML+JS app, the planner Ville built and uses today)
**Companion doc:** `tournament-planner-integration-pr-plan.md` (the original integration plan that produced PR #404, which now needs rebuilding)

---

## Live progress tracker (updated 2026-05-04)

> Single source of truth for cross-session/post-compact context. Update **as work happens** — don't wait until end of PR.

### PR-A — Per-game drafts foundation
**Branch:** `feature/planner-integration` (direct commits — no separate sub-PR; reviewed via umbrella PR #404)
**Status:** ⏳ converging — pass-14 verdict was "Approved with minor notes", but Ville's bar is "only minors and nists" → 2 Issues + 3 Minors + 2 Nits being addressed in pass-15 work on top of `426eafd8`.

**Done (committed on branch):**
- [x] `PlanningEditor` state migrated to `Record<gameId, PlanDraft>` + adapter `setDraft` routes writes to active tab
- [x] Tab strip rendered when `gameIds.length > 1` (subtitle, tabsLabel, includeLabel i18n keys added EN+FI)
- [x] `includedGameIds?: string[]` added to `PlanningSession` type + `resolveIncludedGameIds` helper (NULL = "all")
- [x] Migration 037 (`included_game_ids text[]`) — applied to staging
- [x] Migration 035 (composite PK `user_id, id`) — applied to staging
- [x] Migration 036 (setActiveSession hardening: 100-cap, dedupe, `FOR UPDATE` lock) — applied to staging
- [x] `validatePlanningSession` extended: `includedGameIds` ⊆ `gameIds`, dedupe, `__proto__/constructor/prototype` guard, per-draft player uniqueness, `PLANNING_SESSION_GAME_IDS_MAX = 100`
- [x] `validateScheduledSubsFromDb` boundary helper added (filter+log invalid entries on read)
- [x] `aggregatePlanMinutes` accepts `PlanDraft | Record` — three overloads (single, per-game, union)
- [x] `applyDraftToGame` per-tab iteration (drafts[id] ?? draftFromGame fallback)
- [x] Apply preview computes per-game diffs (was mistakenly active-tab only)
- [x] `applyPresetChange` resets EVERY tab; `handlePresetChange` divergence check iterates all tabs
- [x] `handleSavePlan` saves drafts as-is (no replication); Apply gate at `fieldPlayerCount === 0`
- [x] `handleEditorApplied` stamps `appliedDrafts` + `includedGameIds` per game
- [x] `LocalDataStore.savePlanningSession` + `upsertPlanningSession` deep-clone draft + preserve undefined `includedGameIds`
- [x] `SupabaseDataStore` transforms `included_game_ids` ↔ `includedGameIds`; per-item validation in `getPlanningSessions` + `transformGameFromDb`
- [x] `SyncedDataStore.setActiveSession` cap at 100 + dedupe via Set; sync-race TODO documented
- [x] Preview branch PWA icon (sharp `modulate({hue:180})`) so PWA installs are visually distinct from master
- [x] Pass-13 fixes: cloud `savePlanningSession` `includedGameIds` (Bug 1), `applySnapshot` Player object clones (Issue 1), `aggregatePlanMinutes` overloads (Issue 3), `handleDuplicate` doc + `includedGameIds: undefined` (Minor 1), `draftFromGame` null-coord → bench (Minor 2), `upsertPlanningSession` clone (Minor 3)
- [x] Pass-14 fixes (committed `e74a1aea`): NUL separator, presetId import threading, planApply JSDoc, exported cap, scheduledSubs deep-clone
- [x] Pass-15 fixes (committed `26822434`): PR body migration checklist (028→037), per-game Record overload tests, prototype-pollution guard tests, durationMin/halfTimeMin reserved JSDoc
- [x] Pass-16 fixes (committed `161fe2d1`): planApply outPlayer chain bug, modal a11y, discriminator robustification, useCallback on toggleGame
- [x] Pass-17 fixes (committed `3e8fdc32` + follow-up `4da2cb99`): generateId for scheduled subs, sortedGameIdsKey defensive empty-string filter, PlanningModal reset consolidation, transformPlanningSessionFromDb post-cutover TODO, validation flag for includedGameIds with no draft entry; follow-up fixed two new tests broken by my mis-modeling
- [x] Pass-18 fixes (committed `fa520e85` + follow-up `256de49d`): useDeletePlanningSessionMutation scoped invalidation, planMinutesAggregate empty-Record short-circuit, ScheduledSub stat-consumer JSDoc, push-order comment fix, GAME_IDS_KEY_SEPARATOR exported; follow-up updated PlanningModal test for new mutation signature
- [x] **Pass-19 fixes (in progress, uncommitted) — pass-19 verdict said "Fix Issues 1 and 2 before merging":**
  - [x] Pass-19 fixes committed `f6b5bf7d`: SupabaseDataStore.setActiveSession 100-cap parity, migration 037 verification SQL, LocalDataStore uses constant, validation.ts double-JSDoc fix, parsePlanExport units fix, planFromImport outPlayer comment, resetEditorState alias removed
- [x] **Pass-20 fixes (in progress, uncommitted) — pass-20 verdict was ✅ "Approved with minor follow-ups", 0 bugs/issues, only Minors+Nits — convergence bar reached:**
  - [x] Minor 1 (transformPlanningSessionToDb NULL-clearing): explicit `?? null` instead of key-omission. Without this, an upsert that brings includedGameIds back to undefined ("all included") would leave the existing array in place — LocalDataStore writes undefined verbatim, so the round-trip would diverge. Fix locks lossless cloud↔local parity for a future "clear all" UX.
  - [x] Minor 2 (migration 037 verification SQL): already addressed in pass-19 — file exists at `supabase/migrations/__tests__/037_planning_sessions_included_game_ids.verification.sql`. Pass-20 reviewer was on a stale snapshot.
  - [x] Minor 3 (savePlanningSession 'create' label): now distinguishes create vs update via `session.id` presence. Functionally safe today (cloud executor routes both to upsert), but the labelling fix prevents future conflict-resolution logic from seeing every overwrite as a create.
  - [x] Nit 1 (planDraftFromImport JSDoc): added precondition documenting that callers must validate via parsePlanExport (which rejects reserved role keys); bracket-notation assignment is also safe by construction in modern JS.
  - [ ] Nit 2 (post-cutover types regen): deferred per reviewer to the post-merge task list
  - [ ] **Pending:** commit + push pass-20 fixes (next step)
  - [ ] **Pending:** ASK Ville about merge readiness — pass-20 already approved, pass-21 should be clean

**Deferred to fast-follow (per pass-14 reviewer "fast-follow OK"):**
- Pass-14 Minor 2: `aggregatePlanMinutes` discriminator → branded type / `kind: 'single' | 'per-game'` discriminant
- Pass-14 Nit 7: two-step PK correction (031 + 035) — historical, not actionable
- Pass-14 perf nit: GIN index on `planning_sessions.game_ids` for containment queries — only matters at >>100 sessions/user

### PR-B — Cross-game player tracking + continuous-gradient pills + totals table
**Status:** ⏳ in flight (PR-B-1 ✅ merged, PR-B-2 ⏳ open as #406, PR-B-3 pending)
- [x] **PR-B-1 (continuous-gradient pills)** ✅ MERGED via PR #405 (squash `ed28b19b`) — `fairShareHue(ratio)` red→yellow→green ramp; PlanningMinutesDashboard pills now use inline HSL styles; sort flipped to ASC; pills show `mm:ss (NN%)`; 5 hue unit tests + 2 dashboard tests
- [x] **PR-B-2 (totals table component)** ✅ MERGED via PR #406 — `computePlanTotals` util, `totalBand` helper, `PlanningTotalsTable` component below MinutesDashboard; 14 util tests + 10 component tests; pass-2 review silent
- [x] **PR-B-3 (cross-game player highlight)** ✅ MERGED via PR #407 (8 review passes). Lifted highlight state, controlled ChipGrid, ChipGrid pre-existing-bug fix (per-game cards now read their own draft), dashboard pill click-to-toggle, totals row name toggles, useEffect prunes stale highlights, identity-preservation invariant documented, 4 cross-component integration tests, 2 read-only fallback tests, EMPTY_DRAFT frozen, role="group" on read-only div, sparse-draft fallback test.

### PR-C — Named versions (parent_session_id + migration 038)
**Status:** ⏳ in flight (foundation layer)
- [x] Migration 038 (`parent_session_id text` column + partial index `idx_planning_sessions_parent` on `(user_id, parent_session_id) WHERE parent_session_id IS NOT NULL`) — applied to staging. Verification SQL covers column shape, index definition, NULL→top-level-parent round-trip, child round-trip, and a backfill no-op check.
- [x] `PlanningSession.parentSessionId?: string` field with JSDoc documenting the named-version semantic + RPC scope (single-active enforced per parent's children).
- [x] `validatePlanningSession`: rejects empty-string, non-string, and self-parent (`parentSessionId === id`) cycles. Parent-exists invariant deferred to DataStore boundary.
- [x] SupabaseDataStore.transformPlanningSessionFromDb + ToDb: round-trips `parent_session_id` ↔ `parentSessionId`, explicit-null pattern lets a coach un-link a child by setting `parentSessionId: undefined`.
- [x] LocalDataStore.savePlanningSession: passthrough; upsertPlanningSession covered by `...session` spread.
- [x] 5 new validation unit tests.
- [x] **PR-C-1 ✅ MERGED** via PR #408 (5 review passes; pass-5 was clean approve, no blockers).
- [ ] **Pending (PR-C-2):** UI changes — Versions ▾ dropdown, Save changes / Save as new copy actions, child-list rendering, single-active scoped to parent's children, RPC 033/036 update for parent-scoped activation. PARKED for after PR-D (smaller schema-free PR for velocity).

### PR-D — Half-time (H1/H2) split shortcuts
**Status:** ⏳ in flight (PR #409 opening)
- [x] `planHalftimeSplit.ts` pure util: `halftimeSec`, `classifyRoleSplit` (no-sub / split / complex), `addHalftimeSplit`, `keepStarter`, `keepSub`. 22 unit tests.
- [x] PlanningEditor role-action panel inline below pitch — only renders when a role is selected AND state is no-sub or split (complex routes the coach to the timeline editor as before). 4 component tests.
- [x] 4 i18n keys EN+FI (`roleActionsTitle`, `splitAtHalf`, `keepStarter`, `keepSub`); types regenerated (2605 → 2609).
- [ ] Visual chip-split rendering (slate|amber): **deferred** — minor visual; the action panel + scheduledSubs editor cover the functional need.
- [ ] "Plays both" / "Benched both halves" red borders: **deferred** — UX polish for PR-E.

### PR-E and PR-F — NOT STARTED
- [ ] PR-E — visual parity polish + show-benches + auto-save indicator + reset
- [ ] PR-F — bundle import/export

**PR target convention:** PR-B onwards opened as separate sub-PRs against `feature/planner-integration` (NOT master). Master cutover only after all PRs land + final review pass.

### Master cutover
- PR #404 is held — base is master, but body is feature/planner-integration. Will merge to master only after all 6 sub-PRs converge.
- Migrations 028–037 already applied to staging; production migration is part of cutover checklist.

---

## Why this doc exists

The in-app planner shipped in PR #404 doesn't actually do what the standalone does. It treats a `PlanningSession` as **one shared lineup replicated across N games**; the standalone treats a planning session as **N independent per-game lineups with cross-game minute aggregation**.

The DB schema in #404 already supports per-game divergence (`PlanningSession.draft: Record<gameId, PlanDraft>`), but the editor and the save flow flatten it. We need to rebuild the editor to honour the original product intent, plus port the standalone's other features (minute aggregation, fair-share heat map, player highlight tracking, named versions, half-time split shortcuts, included/excluded games).

This doc:

1. Catalogs the full standalone feature set.
2. Maps each feature to current in-app coverage / gap.
3. Splits the rebuild into reviewable PRs.
4. Calls out cutover order and risk per PR.

---

## 1. Standalone feature inventory (`tournament-planner/planner.html`)

### Data model

```js
state = [
  // 5 games (DEFAULT_INCLUDED.length === 5)
  {
    h1: { GK, LB, RB, CDM, LM, RM, CAM, ST, bench0, bench1, bench2 },  // first half
    h2: { GK, LB, RB, CDM, LM, RM, CAM, ST, bench0, bench1, bench2 },  // second half
  },
  // ... 4 more
]
included     = [true, true, true, true, true]   // per-game include-in-totals checkbox
showBenches  = true                             // global UI toggle
currentVersionName = 'default' | null           // pointer into named-versions map
```

**Constants:**
- `PLAYERS` — 11 hardcoded names
- `POSITIONS` — 8 fixed roles (GK, LB, RB, CDM, LM, RM, CAM, ST). 1-2-1-2-1-1 formation
- `BENCH_SIZE` — 3 per half
- `PRIORITY` — 3 starred players (used in fairness check)
- `HALF_MIN` — 750 sec (12:30 per half → 25 min per game total)
- Heat thresholds — `HEAT_UNDER 0.70`, `HEAT_OVER 1.10`

**Key observation:** the standalone's substitution model is **half-time only** — each position can swap players exactly once per game, between H1 and H2. This is a *simplification* of what the in-app planner already supports (`scheduledSubs[]` lets any number of subs at any time). The H1/H2 model maps to "two scheduled subs at t=0 and t=halfDuration" in the in-app abstraction. The rebuild does NOT regress to half-time-only — it keeps the more general scheduled-subs model and adds H1/H2 as a UX shortcut.

### Per-game UI (one card per included game)

| Region | Behavior |
|---|---|
| Header | "Game N" |
| Pitch | 8 position boxes in formation grid; each box has the position label, a ⚙ wrench, an H1 chip, an H2 chip |
| Same-player both halves | Renders as ONE green "full game" chip |
| Different players | Renders as side-by-side H1 (white) + H2 (yellow) chips |
| Wrench → edit mode | Reveals split/merge buttons |
| ✂ Split (full-game pos) | Bumps H2 player to bench0, opens an H2 sub spot |
| Keep [H1] / Keep [H2] (divided pos) | Merge to that player as full-game; displace the other to bench |
| Bench rows | H1 row + H2 row, each with 3 chips (toggleable via global `showBenches`) |
| Benched both halves | Red highlight on both bench chips |
| "Plays-both" indicator | Red border on H2 chip when player is in divided position but actually still on field in the other half (just a position switch, not a real sub) |

### Cross-game UI (above the game cards)

**Tab strip** — one tab per game with `Include in totals` checkbox:
- Click tab body → `selectedGame = i` → editor focuses that game
- Click tab checkbox → toggles `included[i]`
- Excluded tabs dimmed (opacity 0.55)
- Selected tab green-highlighted

**Player pills row** — one pill per player, sorted ascending by total minutes:
- Pill background uses **continuous red→yellow→green hue gradient** based on `ratio = totalSec / (HALF_MIN × 2 × included.length / playerCount)`
  - 0.4 ratio → hue 0 (deep red)
  - 1.0 ratio → hue 100 (yellow-green "on target")
  - 1.5 ratio → hue 150 (deep green)
- Shows: name, total minutes (M:SS), percentage of fair share
- Click pill → toggle highlight; supports multi-select
- Highlighted pills get orange outline; non-highlighted dim to 35%
- "Clear (N)" button appears when ≥1 highlighted

### Drag-drop (intra-game only; cross-game drops blocked)

Three cases:

1. **Same-half drop**: swap source and target. If target was a "full game" (merged) chip, preserve the merge by also swapping the source player into the other half.
2. **Cross-half drop** (different half, different position): swap target with source player's existing slot in target half. Source slot/half is NOT modified — preserves "one slot per player per half" invariant.
3. **Same-position cross-half drop** (e.g. dragging the H1 chip onto the H2 chip of the same CDM box): GLOBAL swap of those two players across the entire game (every position they occupy in either half).

### Player highlight tracking
- Click any chip OR any pill → toggle that player in `highlightedPlayers` set
- Multi-select works
- All chips and pills of highlighted players get orange outline
- Everything else dims to 35%
- Clear button when active

### Heat / fairness
- Fair-share baseline = `(HALF_MIN × 2) × includedGames / playerCount` = 1500 × includedGames / 11 sec
- Per-player ratio drives:
  - Pill color (continuous gradient)
  - Heat status string (`under` / `ok` / `over`) — used elsewhere in heat-ring rendering

### Totals table (below the games)
- Rows = 11 players
- Cols = G1..G5 + Total
- Cell content: minutes (M:SS) + GK badge (`GK`, `GK·H1`, `GK·H2`) when applicable
- Color: zero = red, < 50min total = orange (below-half), ≥ 60min = green (priority)
- Excluded games column line-through, gray

### Save / load

**Auto-save** (`STORAGE_KEY` localStorage):
- Saves `{games, included, showBenches, currentVersionName}` on every mutation
- "✓ Saved HH:MM:SS" indicator, clears after 3s

**Named versions** (`VERSIONS_KEY` localStorage):
- Map of `{versionName: {games, included, showBenches, savedAt}}`
- "Versions ▾" dropdown:
  - "💾 Save changes to '<currentVersion>'" — overwrite current
  - "💾 Save as new copy…" — prompt for name, save, set as current
  - List of all named versions, sorted by savedAt desc
  - Each row: name, time, ✎ rename, ✕ delete
  - Click row → load that version (replaces current auto-saved state)
- Current version label "📂 versionName" in header

**Import / export**:
- Export: full JSON snapshot (formatVersion: 2) — current state + ALL named versions
- Import: parses, confirms, merges versions (imported wins on name collision), replaces current

### Reset
- Confirm → clear both localStorage keys → reload → re-seeds from `SEED` constant

---

## 2. In-app planner — current state vs standalone

### What's already built (PR #404)

| Component | Status |
|---|---|
| `PlanningSession` entity (id, teamId, name, gameIds[], draft Record, isActive, appliedAt) | ✅ |
| `PlanDraft` shape `{startingXI, bench, scheduledSubs, presetId?}` | ✅ |
| Local + Supabase + Synced datastores with sync queue | ✅ |
| Migrations 028–036 (schema, RPCs, composite PK, hardening) | ✅ (staging applied) |
| `PlanningModal` with list / picker / editor / undoBanner pages | ✅ |
| `PlanningEditor` — single-draft formation grid + drag-drop + scheduled-subs timeline | ✅ |
| `PlanningChipGrid` — N games × roles read-only visualization | ✅ |
| `PlanningMinutesDashboard` — fair-share band pills | ✅ |
| 30-second post-Apply undo banner | ✅ |
| Standalone JSON envelope import (`parsePlanExport`) | ✅ |
| `Player.isPriority` round-trip + ★ rendering | ✅ |
| Active-session toggle (relabeled "Default" in pass 3) | ✅ |
| ~10,000 lines of tests | ✅ |

### What's missing or wrong

| Standalone feature | In-app coverage | Gap severity |
|---|---|---|
| **Per-game drafts** (each game independent) | 🚫 ONE draft replicated across all gameIds | **P0 — product intent violated** |
| **Tab strip** for switching which game's draft to edit | 🚫 None | **P0** |
| **`included[]` per-game toggle** for stats aggregation | 🚫 None | **P0** |
| **Player highlight (click-to-track) across games** | 🚫 chip-grid focus is a different feature | P1 |
| **Heat ring on chips** (continuous gradient) | ⚠ partial — bands only in dashboard pill | P1 |
| **Totals table** with per-game cells + total | ⚠ partial — `PlanningMinutesDashboard` shows pills but no per-game grid | P1 |
| **Continuous color gradient on player pills** | ⚠ partial — discrete bands | P1 |
| **Named versions ("Save as / Save changes to / Load")** | ⚠ partial — `PlanningSession` is ONE row; no in-place rename of current; no "Save as copy" UX | P1 |
| **H1 / H2 split chip rendering + split/merge buttons** | 🚫 None — current uses single startingXI + scheduledSubs[] timeline | P2 |
| **Same-position cross-half global-swap drag-drop** | n/a (depends on H1/H2 model) | P2 |
| **"Benched both halves" red highlight** | n/a (depends on H1/H2 model) | P2 |
| **"Plays both" red border** (divided pos but on field elsewhere) | n/a | P2 |
| **Show-benches toggle** | 🚫 None | P3 |
| **Auto-save indicator** ("✓ Saved HH:MM:SS") | ⚠ implicit via React Query | P3 |
| **Reset to plan** | 🚫 (clear-data exists at app level but not planner-scoped) | P3 |
| **Import/export of session including versions** | ⚠ partial — `parsePlanExport` reads single envelope; no bundle of multiple versions | P3 |

### Key conceptual differences (read carefully)

1. **Half-time vs scheduled-subs:** the standalone has H1/H2; the in-app has `scheduledSubs[]` (timed substitutions). The in-app is **strictly more powerful**. The rebuild keeps the in-app's scheduled-subs model and offers H1/H2 split as a UX **shortcut** (a one-click action that creates a sub at half-time). This is **not** a regression, it's an additive feature.

2. **Fixed 8 positions vs FormationPreset:** the standalone hardcodes 8 positions (GK + 7 outfield) for the team's specific formation. The in-app uses `FormationPreset` (5v5, 7v7, 8v8, 11v11 variants) per game's `gameType`. This is a strict superset. Per-game `presetId` already lives on `PlanDraft`.

3. **String player names vs Player objects:** the standalone holds `'Verne'` as a name string. The in-app uses `Player` objects with id, name, isGoalie, isPriority, etc. The in-app integrates with the master roster — the rebuild doesn't change this.

4. **5-game tournament vs N-game session:** the standalone hardcodes 5 games. The in-app's `gameIds` is variable-length. The rebuild keeps the variable-length model and the tab strip auto-fits.

5. **`SEED` data vs real saved games:** the standalone seeds from a hardcoded constant. The in-app references real `Game` records via `gameIds`. The rebuild does not change this.

---

## 3. PR plan (split for reviewability, ship-able order)

### PR-A — Per-game drafts (the foundational rebuild) — **must-ship before merging the planner to master**

**Scope:**
- `PlanningEditor` gains a top-of-modal **tab strip**:
  - One tab per `gameIds` entry
  - Each tab carries the game label (opponent + date) and an "Include in totals" checkbox
  - Selected tab green-highlighted; excluded tabs dimmed
- **Editor state becomes `Record<gameId, PlanDraft>`** instead of a single `PlanDraft`
- Tab click swaps the active draft; edits in tab A don't bleed into tab B
- **`handleSavePlan` saves per-tab drafts** — each gameId gets its own `PlanDraft`. No more replication.
- **Reopen restores per-game drafts** — `editingSession.draft[gameId]` for each tab
- **Import handoff (`handleUseImportedPlan`)** maps `importedPlan.games[]` to per-game drafts; if standalone has only 1 game and the user picks 3 games, the imported draft seeds the FIRST tab and the others start empty (clear, explicit warning in the success card)
- `applyDraftToGame` already iterates per-game in `handleApply` — change is one line: pass `drafts[gid]` instead of `draft`
- `MinutesDashboard` aggregation is already per-game; just needs `included[]` filter
- Heterogeneous-draft warning code I added in pass 7 becomes obsolete — drafts ARE per-game now; remove the warning
- New "Include in totals" checkbox state lives at the session level: `PlanningSession.includedGameIds: string[]` — defaults to all gameIds

**Migrations:** 037 — `ALTER TABLE planning_sessions ADD COLUMN included_game_ids text[] DEFAULT '{}'::text[]` (additive, nullable, defaults to "all" semantics)

**Tests:**
- Editor: edit tab A, switch to B, edit B, switch back to A → A's edits preserved
- Save: produces `Record<gameId, PlanDraft>` with distinct entries
- Reopen: each tab loads its own draft
- Apply: each game receives its own draft (regression for the bug we're fixing)
- Include toggle: dashboard recomputes when toggled

**Risk:** existing `PlanningSession` rows in staging have replicated drafts; reopening them after rebuild produces 5 identical tabs. Acceptable — coaches can edit them apart now.

**Estimate:** 2 days

---

### PR-B — Cross-game player tracking + minutes table

**Scope:**
- **Player highlight (multi-select):**
  - Click any chip OR any minutes-table row → toggle player in `highlightedPlayers` set
  - Highlighted players: orange outline on every appearance across all tabs
  - Non-highlighted dim to 35%
  - "Clear (N)" button when active
  - Highlight state lives in `PlanningModal` state (not persisted across opens)
- **Continuous-gradient player pills:**
  - Replace the current discrete "under/low/fair/over/heavy-over" bands in `PlanningMinutesDashboard` with HSL hue gradient on ratio
  - Sort pills ascending by minutes (needs-attention-first)
  - Show name + total + percentage
- **Totals table** — new component below the editor:
  - Rows = roster players (filtered to `selectedPlayerIds` across all tabs)
  - Cols = G1..GN + Total
  - Cells: minutes (M:SS) + GK badge inline
  - Color rules: zero = red, < 50% fair share = orange, ≥ 100% = green
  - Excluded game columns line-through

**Migrations:** none

**Tests:**
- Highlight toggles correctly across tabs
- Pill gradient at edge cases (ratio = 0, 1, very large)
- Totals table renders correctly with mixed include states
- GK badge appears for goalie role, "GK·H1" for half-game GK (deferred to PR-D)

**Risk:** none — purely additive UX, no schema change

**Estimate:** 2 days

---

### PR-C — Named versions + version manager

**Scope:**
- The current `PlanningSession` is ONE row. The standalone supports many named versions per "tournament plan". Two options:
  - **Option C-1 (recommended):** add a `parent_session_id` column. A "tournament plan" becomes a parent session; named versions are child sessions referencing the parent. The active session is the one currently `is_active = true` within the parent's children. Apply uses the active child.
  - **Option C-2:** keep one session per named version, group via a UI grouping by team + gameIds-set (no schema change). Lossier semantically.

  **Picking C-1.** Adds clarity and matches the standalone's mental model.

- New UI in `PlanningModal`:
  - "Versions ▾" dropdown on the editor page
  - "💾 Save changes to '<current>'" — overwrite the current child session
  - "💾 Save as new copy…" — prompt for name, create a new child session, set as active
  - List of versions (children) sorted by `updatedAt` desc
  - Each row: name, last-saved date, ✎ rename, ✕ delete
  - Click row → load (with confirm if dirty)
- Apply behavior: applies the **active** child only

**Migrations:** 038 — `ALTER TABLE planning_sessions ADD COLUMN parent_session_id text` + appropriate index + RLS policy update

**Tests:**
- Create parent + 2 versions; activate version A; reopen modal — version A loaded
- Switch active to version B; Apply — only B's drafts hit games
- Delete a version; active version handling
- Rename a version

**Risk:** medium — schema change + behavioral change for sessions list. Existing sessions become "parents with one child" automatically (data migration in 038).

**Estimate:** 2.5 days

---

### PR-D — Half-time (H1/H2) split shortcuts

**Scope:**
- The in-app stays on the more general `scheduledSubs[]` model — no schema change.
- **UI shortcut:** add a wrench (⚙) button on each role in the formation grid. In edit mode, reveal:
  - For full-game roles (no scheduled sub at this role): "✂ Split at half" — creates a scheduled sub at `t = halfDuration` swapping the starter with bench[0]
  - For roles with one mid-game sub: "Keep [starter]" / "Keep [sub]" — removes the scheduled sub, makes it full-game
- **Visual:** a role with one scheduled sub renders the chip as "starter | sub" split (white | yellow), matching the standalone aesthetic (in dark-mode palette: e.g. slate-700 starter / amber-900 sub)
- **"Plays both" red border:** when a sub-in player is also on the field elsewhere in the post-sub period, paint a red border on the chip
- **"Benched both halves":** if `showBenches` is on, players in bench across both pre- and post-sub periods get a red border

This is the standalone's H1/H2 affordance, **adapted** to the in-app's scheduledSubs model. A coach used to half-time-only subs gets the one-click affordance; coaches who want mid-half subs use the existing timeline editor.

**Migrations:** none

**Tests:**
- Split-at-half creates a scheduled sub at `halfDuration` with the right inPlayer/outPlayer
- Keep-starter removes the sub; chip becomes full-game
- Cross-half drag-drop produces the right scheduled-sub deltas
- Edge: role with TWO scheduled subs (split + later sub) — split UI is hidden / disabled

**Risk:** medium — scheduledSubs semantics overlap with the H1/H2 affordance; UI complexity grows

**Estimate:** 2 days

---

### PR-E — Standalone visual parity polish

**Scope:**
- **Dark-mode palette adaptation** of the standalone's design language:
  - Pitch background — slate-800 with green tint (vs standalone's `linear-gradient(#4caf50, #388e3c)`)
  - Position boxes — `rgba(white, 0.18)` translucent (matches standalone)
  - Chip palette — slate-700 starter / amber-700/40 sub-chip / emerald-700/40 full-game / rose-900/30 benched-both
  - Pill gradient — HSL adapted for dark-mode contrast (clamp luminance higher)
- **Show-benches toggle** in modal header (default true)
- **Auto-save indicator** — "✓ Saved HH:MM:SS" in modal header, clears 3s after each mutation. Implementation: hook into the React Query mutation success of `useSavePlanningSessionMutation`
- **Reset to plan** — button in version manager dropdown that wipes the current child session's draft back to the per-game `draftFromGame(savedGames[gid])` baseline (i.e. "discard my edits, start over")

**Migrations:** none

**Tests:** mostly visual; component snapshot tests for the new chip palette + indicator state machines

**Risk:** low — pure UI polish

**Estimate:** 1.5 days

---

### PR-F — Import/export bundle (versions + state)

**Scope:**
- Export current `parsePlanExport` envelope is single-snapshot. Extend to optionally include all named versions (the standalone's `formatVersion: 2` shape).
- Import handles both single-snapshot and bundle. Bundle import creates a parent session + children for each version.
- "Export tournament plan…" button in `PlanningModal` versions menu

**Migrations:** none

**Tests:**
- Roundtrip: export bundle, clear, import → all versions restored
- Single-snapshot import (legacy / standalone format) still works
- Name-collision merge behavior (imported wins on collision, like standalone)

**Risk:** low

**Estimate:** 1 day

---

## 4. Cumulative estimate

| PR | Description | Estimate |
|---|---|---|
| **A** | Per-game drafts (foundational) | 2 d |
| **B** | Cross-game player tracking + minutes table | 2 d |
| **C** | Named versions (parent/child sessions) + version manager | 2.5 d |
| **D** | H1/H2 split shortcuts on top of scheduledSubs | 2 d |
| **E** | Visual parity polish + show-benches + auto-save indicator | 1.5 d |
| **F** | Bundle import/export of all versions | 1 d |
| | **Subtotal** | **11 days** |
| | + 30% testing/buffer | ~14 days |

---

## 5. Cutover order

**Recommendation:**

1. **Hold PR #404 from merging to master.** The current single-draft mode is conceptually wrong; merging it teaches coaches the wrong mental model.
2. **Land PR-A** (per-game drafts) on `feature/planner-integration`. This makes the planner *correct*, even if visually less polished than the standalone.
3. **Land PR-B and PR-C in either order.** Both are additive UX upgrades.
4. **Once A+B+C are landed, merge `feature/planner-integration` to master** along with all migrations 028–037 (or 028–038 if PR-C lands first). This is the new cutover.
5. **PR-D, E, F** ship as follow-up PRs to master.

**Alternative (faster but lossier):** land PR-A only, ship to master, do B–F as separate releases.

---

## 6. What stays from PR #404

The following work is NOT thrown away by the rebuild — it carries forward as-is:

- All migrations 028–036 (schema is correct, just expanded by 037 and 038)
- `PlanningSession` entity + DataStore methods
- Sync queue integration
- 30s undo banner
- Active-session ("Default") toggle
- Standalone JSON envelope parser
- `Player.isPriority` round-trip + ★ rendering
- ~9,000 of the ~10,000 test lines (only the editor-state tests need to be reworked for tabs)
- Multi-tab prevention (Web Locks API)
- Preview-tinted icon system

The rebuild is **the editor and the dashboard**, plus a small schema extension for `included_game_ids` and `parent_session_id`. The data layer, persistence, sync, and migration story are kept.

---

## 7. Open questions for product

1. **PR-C version model:** parent/child via `parent_session_id` (Option C-1) vs UI-grouped flat (Option C-2). C-1 is cleaner; needs sign-off.
2. **Default `included_game_ids`:** when migrating existing sessions from `included_game_ids = NULL` semantics ("all included by default") vs `included_game_ids = []` ("nothing included"). NULL → "all" is least surprising. Confirm.
3. **PR-D wrench affordance** — does the wrench live on the role chip, or as a separate "split at half" button per role? Standalone has wrench → reveal → buttons. Mobile-first: a separate inline "Split at half" button on the role row might be more discoverable.
4. **Mobile UX for tab strip** — 5+ game tabs at small width: horizontal scroll vs dropdown? Standalone is desktop-first; in-app is mobile-first.
5. **Half-time auto-detection** — for split-at-half, `halfDuration = numberOfPeriods === 2 ? periodDurationMinutes * 60 : Math.floor(periodDurationMinutes * 60 / 2)`. What about games with `numberOfPeriods === 1`? (probably no half-time concept, hide the wrench).

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Existing staging sessions have replicated drafts; coaches reopen them after rebuild and see N identical tabs | Medium | Acceptable — they can now edit each independently. Document in the release notes. |
| `parent_session_id` migration of existing rows: each existing session becomes a parent with one child | Medium | Migration 038 is data-migration territory: each existing row gets `parent_session_id = id` (self-parent), then the UI treats self-parents as flat. Or generate a new parent and re-point. Pick before PR-C. |
| H1/H2 split UI conflicts with arbitrary scheduled subs (a role with two subs already) | Low-medium | Disable the wrench when role has > 1 sub; document in the wrench tooltip. |
| Tab strip on mobile at small widths | Low | Horizontal scroll with snap; at < 360px, fall back to a dropdown selector. |
| Test rewrite cost | Medium | Most editor tests assert on draft content via testids; the tab-state expansion is a wrapper change, not a content change. Estimate ~30% test rework. |

---

## 9. Reference files

- `tournament-planner/planner.html` — the standalone (source of truth)
- `docs/03-active-plans/tournament-planner-integration-pr-plan.md` — the original integration plan (now superseded by this doc)
- `src/components/PlanningEditor.tsx` — current single-draft editor (rebuild target)
- `src/components/PlanningModal.tsx` — modal orchestration (mostly kept as-is)
- `src/components/PlanningChipGrid.tsx` — read-only chip grid (likely deprecated by the new tab strip)
- `src/components/PlanningMinutesDashboard.tsx` — fair-share band pills (rebuilt as continuous-gradient pills + totals table in PR-B)
- `src/utils/planSwapEngine.ts` — pure swap logic (kept)
- `src/utils/planMinutesAggregate.ts` — fair-share math (kept; just feeds the new pills + table)
- `src/datastore/SupabaseDataStore.ts` — RPC + transforms (kept)
- `src/datastore/LocalDataStore.ts` — IndexedDB (kept)
- `supabase/migrations/031_planning_sessions.sql` — the table (extended by 037 + 038)

---

**Next step:** review this plan, sign off on PR-A's scope, then I start on the editor rebuild.
