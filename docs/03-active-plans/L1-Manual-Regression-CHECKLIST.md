# Layer 1 — Manual Regression Checklist (Micro‑Refactor)

Purpose: Fast, deterministic sanity pass after each micro‑step in Layer 1. Keep sessions short, check only what the step could have broken.

Tools
- Debug: `http://localhost:<port>/debug-state.html`
- Clear caches/SW: `http://localhost:<port>/clear-cache.html`
- DevTools Console: watch logs like `[Modal Trigger Effect]`, `[useAutoSave]`, `[EFFECT game load]`, `[PWA]`.

Pre‑flight
- Close all app tabs from the same origin.
- Open Clear Cache → Clear SW and caches (and optionally IndexedDB for fresh state).
- Reload the app once after clearing.

A) First‑time user path
- Launch app → Start Screen shows Get Started.
- Click “Aloita tästä / Get Started”.
- If roster empty, overlay invites to set up roster (correct).
- Open Settings from Start Screen → modal opens and closes cleanly (no flash).

B) Import backup path
- Start app → Open Settings → Import Full Backup (confirm overwrite).
- App returns to Start Screen.
- Click “Jatka / Continue”:
  - Lands in a real game (no first‑time overlay).
  - `debug-state.html` shows a non‑default `currentGameId` that exists in `savedSoccerGames`.

C) Modal reliability (open/close)
- Open each from the left menu (one by one):
  - Load Game, New Game, Game Settings, App Settings, Team Manager, Personnel Manager, Seasons/Tournaments, Stats, Player Assessment, Training, How It Works.
- Expectation:
  - Menu closes first, then modal opens ~150ms later.
  - No modal flashes or instantly closes.
  - Closing a modal immediately after opening is ignored (only for Load/New), but closes fine after ~0.3s.

D) Autosave gating
- With a real game active, open Load Game and keep it open for ~5s.
- DevTools Console: verify no `[useAutoSave] Short/Long-delay` logs while modal is open.
- Close modal, change a field (e.g., team name) → short‑delay autosave log appears.

E) Portal layering
- With any overlay visible (timer overlay, first‑game overlay, etc.), open a modal.
- Modal content renders above overlays and is interactable.

F) Deterministic initialization
- Hard refresh the app.
- If a valid `currentGameId` exists, app loads that game; if stale/missing but games exist, latest game becomes current.
- `debug-state.html` reflects the same `currentGameId`.

G) Load/Delete game edge cases
- Open Load Game → delete a non‑active game → list updates.
- Delete the active game:
  - If other games exist → latest game becomes active.
  - If none remain → default state loads; first‑game overlay appears.

H) New game flow
- With unsaved edits, choose New Game from menu.
- “Save before new?” prompt appears → Confirm to save or discard works; New Game setup opens and stays open.

Troubleshooting
- If a modal flashes/closes:
  - Check Console for `[useAutoSave]` logs at the time of open; autosave should be paused.
  - Verify menu deferral (modal opens ~150ms after menu closes).
  - Ensure portalization is active (modals render at document.body).
- If Continue shows first‑game overlay after import:
  - Check `debug-state.html` that `soccerAppSettings.currentGameId` points to an existing game.
  - If missing/stale, run Clear Cache (SW+caches), reload, and retry Continue.

Execution notes
- Run this checklist after each micro‑step that touches Layer 1 (especially state init, modal handling, autosave).
- Keep changes small; commit only after this checklist passes.

