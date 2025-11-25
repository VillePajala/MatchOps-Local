# Architecture Merge Regression Investigation

**Purpose:** Track the regression introduced by the `refactor/2.6-integration` merge (useGameOrchestration split) and the remediation steps.

## Current State
- `master` reverted to pre-merge commit `cd3d486e50ebd4277e8645671a029a2604ed1162` to stabilize production.
- Investigation branch: `investigate/arch-merge-bug` (rooted at merge commit `9492cdf174f8888c92063bbb9c298a89ff34f034`).
- Integration branch to reintroduce refactor + fix: `integration/arch-refactor-fix` (refactor restored, game-load guard fix, savedGames dedupe).
- Backup: `backup/master-arch-merge` holds pre-revert state.
- New SW bump build artifacts ready on `integration/arch-refactor-fix` (`public/sw.js`, `public/release-notes.json`).

## Issue Summary
- Symptom: After deleting the currently open game (often post-import), the next game briefly loads then gets overwritten with default values—stale/default state applied during a game switch.
- Root cause: Game-load effect applied defaults when `savedGames[currentGameId]` wasn’t available yet during a switch (merge-only change in refactor/2.6 integration).

## Fix Status
- Guard added in `useGameOrchestration` to wait for saved game data and skip defaults mid-transition.
- Saved games deduped to React Query cache (single source of truth).
- Tests passing on `integration/arch-refactor-fix` (lint/type/test:ci).

## Plan
1) Merge `integration/arch-refactor-fix` into master (normal merge, not GitHub UI if you prefer).
2) Rebase downstream branches (e.g., `chore/savedgames-dedupe-cleanup`) onto the updated master.
3) Push SW bump to production to ensure clients pick up the new service worker.

## Notes
- Avoid pulling remote master into local master until the integration merge is ready (master is intentionally reverted).
- Keep `backup/master-arch-merge` until after the fix lands.***
