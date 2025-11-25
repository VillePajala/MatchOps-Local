# React Query Cache Guidelines

**Purpose:** Keep React Query as the single source of truth and avoid duplicate local state that can drift or flicker.

## Update Patterns
- Prefer `queryClient.setQueryData` with functional merges for optimistic updates. Example:
  ```ts
  queryClient.setQueryData<SavedGamesCollection>(queryKeys.savedGames, (prev = {}) => ({
    ...prev,
    [gameId]: nextSnapshot,
  }));
  ```
- Only invalidate/refetch when data changed outside the current view (e.g., backup restore, file import, hard reset). For local saves/creates where you already set the cache, skip redundant invalidations.
- Avoid mirroring query data in `useState`. Derive from queries via `useMemo` if you need a stable reference.
- When you must replace a collection, base it on the previous cache value (functional update) rather than a possibly stale snapshot.
- After external writes (imports/restore), refetch `savedGames` and related keys before allowing new saves/creates.

## Audit Checklist
- Are we holding duplicate local state for data that already lives in a query? If yes, collapse to the query.
- Do updates use functional `setQueryData` merges (not whole-object replacements from stale copies)?
- Are invalidations used only for external changes, not immediately after optimistic updates?
- After imports/restores, do we refetch caches (savedGames, appSettings currentGameId, roster) before enabling save/create flows?
- Do interactions guard against running while initial load/import is in flight?

## Lint Guard (follow-up)
- Add a lint rule/check that flags new `useState` usages of data already provided by React Query (allow explicit opt-outs with a comment). Off-the-shelf ESLint may need a small custom rule or convention script to enforce this.
