# GameStatsModal Refactor — Code Review

This document captures bugs found, fixes applied, potential issues, and recommended follow‑ups after the refactor that split the large GameStatsModal into smaller hooks and components.

## Summary

- The refactor significantly improves readability and maintainability by extracting hooks (`useGameStats`, `useGoalEditor`, `useTournamentSeasonStats`) and leaf components (`GameInfoCard`, `PlayerStatsTable`, `GoalEventList`, `GameNotesEditor`, `FilterControls`, `TeamPerformanceCard`).
- Data flow and memoization are largely correct; tests cover the main UI behaviors.
- A couple of correctness issues were identified and fixed; several small improvements are suggested below.

## Fixes Applied

- Opponent goal editing hidden to prevent invalid scorer requirement.
  - Change: Opponent goal rows no longer show the Edit button; Delete remains available.
  - File: `src/components/GameStatsModal/components/GoalEventList.tsx`

- Type correctness for stats result.
  - Change: `GameStatsResult.stats` now correctly uses `PlayerStatRow[]` and adds the missing import.
  - File: `src/components/GameStatsModal/types.ts`

## Findings and Recommendations

1) Unused parameter in `useGameStats`
- `gameEvents` is part of `GameStatsParams`, but the hook only uses `localGameEvents`.
- Recommendation: Remove `gameEvents` from `GameStatsParams` and from the call site to reduce confusion and re-renders.

2) Sorting nuance in `useGameStats`
- Current sort intentionally prioritizes players with `gamesPlayed > 0` before applying the selected column sort. This can surprise when sorting by name/points.
- Recommendation: Consider removing the “gamesPlayed priority” to sort strictly by the selected column.

3) Edit model for opponent goals
- With the applied fix, opponent goals are no longer editable. If editing is required, the editor should allow time-only edits and skip scorer/assist validation.
- Recommendation: Either keep non-editable opponent goals (simple), or add an alternate edit path that only shows a time field for opponent goals.

4) Exports guardrails
- `isExportDisabled` correctly gates current vs aggregate exports. Ensure copy makes it clear why export is disabled (e.g., no games match filters).
- Recommendation: Add a tooltip or helper text near disabled export buttons.

5) Accessibility polish
- Sortable table headers use onClick on `<th>`. Screen readers expect a focusable control and `aria-sort` on the `<th>`.
- Recommendation: Wrap header label in a `<button>` inside the `<th>`, and set `aria-sort` on the active header.

6) Performance considerations
- Heavy computations depend on `savedGames` identity; if the parent recreates this object often, memoization churns.
- Recommendation: Ensure parent keeps a stable `savedGames` reference when unchanged; optionally memoize the derived arrays of IDs.

7) Tests
- UI tests cover most flows, but hooks earned by the refactor would benefit from direct unit tests.
- Recommendation: Add tests for `useGameStats`, `useTournamentSeasonStats`, and `useGoalEditor` to pin logic.

## Notable Positives

- Clear separation of concerns between data (hooks) and view (components).
- Filter controls and aggregation logic are easier to reason about than in the previous monolith.
- Game info card correctly shows specs like `numPeriods x periodDurationMinutes` and handles not-set values via i18n.

## Suggested Follow‑Up Tasks

- Remove `gameEvents` from `GameStatsParams` and update call sites.
- Decide on final opponent-goal edit behavior (non-editable vs time-only edit).
- Simplify sorting to rely solely on the chosen column (optional).
- Add accessible sortable headers and `aria-sort`.
- Add hook-level tests for stats and aggregation logic.

## Files Touched In This Review

- `src/components/GameStatsModal/components/GoalEventList.tsx` — hide edit button for opponent goals.
- `src/components/GameStatsModal/types.ts` — fix `GameStatsResult.stats` type and import.

## References (key implementations)

- Main modal: `src/components/GameStatsModal.tsx`
- Hooks: `src/components/GameStatsModal/hooks/*`
- Components: `src/components/GameStatsModal/components/*`

