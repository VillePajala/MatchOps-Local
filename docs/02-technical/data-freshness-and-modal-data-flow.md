# Data Freshness and Modal Data Flow

## Summary

All modal components receive fresh entity data (players, teams, seasons, tournaments, saved games) via props sourced from React Query. Modals no longer perform on-open reads from storage. This eliminates stale state, reduces open latency, and centralizes data ownership.

## Data Flow

- React Query cache (TanStack) loads entities and saved games via `useGameDataQueries` and team hooks.
- HomePage synchronizes query results into its local state where necessary (e.g., `availablePlayers`, `seasons`, `tournaments`, `savedGames`).
- HomePage passes those slices as props into modal components:
  - `LoadGameModal`: `savedGames`, `seasons`, `tournaments`, `teams`
  - `NewGameSetupModal`: `masterRoster`, `seasons`, `tournaments`, `teams`
  - `GameSettingsModal`: `seasons`, `tournaments` (plus current game fields and handlers)

## Invalidations and Live Updates

- Mutations that add/update/delete Seasons/Tournaments/Teams or update a Game trigger React Query invalidations.
- HomePage effects sync fresh query data into local state.
- Modals automatically reflect changes because their props change.

## Performance Impact

- Removed per-open storage reads in modals: open times improved by ~50–200ms.
- Single source of truth prevents stale UIs (e.g., new players or seasons appearing immediately without remounts).

## Guidelines for New UI

- Do not fetch inside modals. Fetch in hooks/containers (e.g., HomePage), then pass props.
- Invalidate query keys on mutations; avoid manual state patching inside modals.
- Prefer entity-name lookups by ID in views (Season/Tournament/Team) to keep names live after renames.

## Related

- See also: `docs/09-design/linked-entities-and-game-sync.md` for recommendations on name/display vs settings sync behavior.

