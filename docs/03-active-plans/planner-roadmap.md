# Planner Roadmap - Canonical Plan

**Status:** Future feature lane. Keep out of the Play Store release branch.
**Last updated:** 2026-05-18
**Release boundary:** Friday, 2026-05-22 Play Store release uses `master` only. Planner work stays off `master`.
**Current foundation branch:** `feature/planner-integration`
**Current master PR:** PR #404, Draft, not for release cutover yet.

---

## Decision

The match planner remains a valuable future feature, but it is not part of the May 22 Play Store release.

`master` should stay release-focused. Planner work continues on a separate feature lane until it is operational, tested, and explicitly approved for a later release.

The existing planner data foundation is mostly useful. The problem is the product surface: the integrated UI does not match the standalone planner's visual, direct-manipulation workflow.

## Current State

### Keep

These parts on `feature/planner-integration` are considered the foundation:

- planning sessions and per-game draft model
- `Game.scheduledSubs`
- local/cloud datastore support
- validation and DoS caps
- sync integration
- import/export and bundle utilities
- named versions
- apply preview and undo pipeline
- existing planner tests around data, validation, import/export, and apply behavior

### Rebuild

The UI layer needs a parity rebuild:

- replace form-driven substitution editing with visual chip rows
- replace starter-only pitch slots with standalone-style pitch cards
- add bench drawer, game ribbon, grid/single view, and tournament totals strip
- add segment-level add/move/replace/remove interactions
- preserve save/version/apply behavior on top of the rebuilt UI

### Defer

These do not block a usable planner MVP:

- detail overlay with scrubber
- live edit undo/redo
- auto-suggest substitutions
- animation polish
- advanced live-game planner UX beyond the already-built scheduled-sub banner

---

## Branching Model

### Protected Release Lane

`master`

- Only release fixes, Play Store work, and urgent production fixes.
- No planner merge before the May 22 Play Store release.
- No planner migrations to production until planner cutover is approved.

### Planner Foundation Lane

`feature/planner-integration`

- Long-running integration branch.
- Holds the current data foundation and draft PR #404.
- PR #404 stays Draft until the planner is actually usable.

### Planner UI Parity Lane

Use small branches off `feature/planner-integration`, each targeting `feature/planner-integration`:

1. `feature/planner-pre-docs-and-fixture`
2. `feature/planner-p1-chiprow-pitchcard`
3. `feature/planner-p2-sheets-and-bench`
4. `feature/planner-p3-ribbon-grid`
5. `feature/planner-p4-totals-highlight`
6. `feature/planner-p5-apply-version-polish`
7. `feature/planner-p6-final-cleanup`

Each branch should have one PR, tests, and a screenshot/manual parity note before merge.

### Branch Cleanup Candidates

Do not delete these without a separate explicit cleanup step, but they are likely stale:

- `planner/08-apply-preview` - old planner phase, contained by `feature/planner-integration`
- `planner/pr-f-bundle-export` - upstream deleted, PR #412 merged into integration
- `fix/login-hydration` - PR #419 merged to master
- `fix/sync-resilience-and-app-resume` - PR #368 merged to master
- `test/sandbox` - already contained in `origin/master`
- `pre-cloud-backup` - old backup branch
- `ci/claude-review-opus-4-7` - workflow experiment branch

Keep for now:

- `feature/planner-integration` - planner foundation
- `feature/freemium-billing` - separate open billing PR
- `feature/desktop-responsive-modals` - unrelated old feature branch; needs separate product decision

---

## Roadmap

### Phase 0 - Documentation and Ground Rules

Goal: make the work understandable before writing more code.

- Make this file the canonical planner roadmap.
- Keep old docs as references, not competing plans.
- Pin the standalone source of truth:
  - primary: `/home/villepajala/projects/matchops-planner/index.html`
  - local fixture/reference: `tournament-planner/planner.html` if committed intentionally
- Create `src/components/planning/CONTRACT.md` before UI implementation.

Exit criteria:

- One roadmap.
- One branch policy.
- Clear release boundary.

### Phase 1 - Visual Pitch Foundation

Goal: one game renders like the standalone planner.

- Add `src/components/planning/ChipRow.tsx`
- Add `src/components/planning/PitchCard.tsx`
- Add chip-row CSS/module contract
- Replace the starter-slot pitch in `PlanningEditor`
- Keep existing save/apply plumbing working

Exit criteria:

- Pitch card has role boxes and proportional segment chips.
- Half-time line, segment colors, and player minute bars render.
- Tests cover segment layout and edge cases.

### Phase 2 - Editing Interactions

Goal: planner editing becomes visual rather than form-driven.

- Add chip/position sheets.
- Add add/move/replace/remove substitution flows.
- Add bench drawer.
- Extract and preserve double-position checks.
- Remove or isolate `PlanningTimeline.tsx` once replacement is complete.

Exit criteria:

- Coach can edit substitutions from the pitch/bench UI.
- Same-game segment interactions are safe.
- No player can silently occupy invalid duplicate roles.

### Phase 3 - Multi-Game Planner Surface

Goal: make tournament planning usable across multiple games.

- Add game ribbon.
- Add single/grid view.
- Preserve per-game drafts.
- Preserve cross-game highlight state.
- Ensure mobile single-game mode and desktop grid mode both work.

Exit criteria:

- Multi-game session is usable without losing per-game differences.
- Switching games does not flatten or replicate drafts.

### Phase 4 - Totals and Fairness

Goal: restore the main reason the planner exists.

- Add tournament totals strip.
- Fold or replace existing dashboard/table UI as needed.
- Keep fair-share math based on included games.
- Preserve priority-player display where useful, but document deviations from standalone.

Exit criteria:

- Coach can see who is under/over-minuted at a glance.
- Clicking a player highlights that player across all games.

### Phase 5 - Apply, Versions, and Polish

Goal: make it safe to use on real game data.

- Re-test save, reopen, duplicate, active version, import/export, and apply.
- Verify apply preview and undo still match the rebuilt UI.
- Confirm scheduled-sub banners still fire from applied plans.
- Finnish copy polish before final cutover.

Exit criteria:

- Planner can be used end to end on a realistic tournament.
- No known data-loss path.
- Full planner regression suite passes.

### Final Cutover

Only after Phases 1-5 are complete:

1. Rebase/refresh `feature/planner-integration` on current `master`.
2. Resolve release-code conflicts.
3. Run full unit, integration, build, and focused manual planner testing.
4. Refresh PR #404 or replace it with a new final planner PR.
5. User manually approves and merges to `master`.

---

## Source Documents

Read these as supporting references, not competing roadmaps:

- [planner-ui-parity-plan.md](./planner-ui-parity-plan.md) - detailed parity implementation notes and PR splits.
- [tournament-planner-integration.md](./tournament-planner-integration.md) - original product architecture.
- [tournament-planner-integration-pr-plan.md](./tournament-planner-integration-pr-plan.md) - original PR-by-PR implementation history.
- [tournament-planner-rebuild-plan.md](./tournament-planner-rebuild-plan.md) - first rebuild analysis after PR #404 divergence.
- [tournament-planner-integration-safety.md](./tournament-planner-integration-safety.md) - safety rules for schema and branch handling.

## Success Definition

The feature is operational when a coach can:

1. Pick a homogeneous set of games.
2. Build separate per-game plans in a visual planner.
3. See tournament-wide minutes/fairness while editing.
4. Save, reopen, duplicate, import, and export plans.
5. Apply the plan safely to real game records.
6. Receive scheduled-sub prompts during live games after applying.
7. Recover safely from mistakes through preview/undo.
