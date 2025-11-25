# Saved Games Integrity Plan (Import & New Game Flow)

**Goal**: Eliminate duplicate/default games and missing player discs by hardening post-import handling, cache updates, and new-game creation. No code changes yet—this documents the agreed steps.

## Actions to Implement

1) Post-import consistency  
- After restore, force full reload; if reload is deferred, block UI interactions until savedGames + currentGameId are refetched and currentGameId is set to an existing imported game (fallback to latest).  
- Ensure roster is loaded before the player bar renders.

2) Current game guard  
- Do not autosave or create a new game while currentGameId is default/missing or while initial load/import is in progress.

3) Single-shot creation  
- Make new-game creation idempotent per interaction so one flow cannot create multiple entries.

4) Cache strategy  
- Use functional `setSavedGames` merges to avoid dropping entries from a stale base.  
- Use `setSavedGames` as the primary cache update for local saves; reserve `invalidateQueries`/refetch for external changes (import/restore/hard reset).

5) Validation checklist  
- After restore, confirm Load Game list matches `getSavedGames()`.  
- Confirm player discs render on first load post-restore.  
- Confirm only one “New game created…” log per interaction.

## Notes
- This plan complements the existing refactor roadmap; it does not revert deduplication work.  
- Target to execute before merging any further saved-games or import changes.
