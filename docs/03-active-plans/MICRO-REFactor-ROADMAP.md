# MatchOps Local — Micro Refactor Roadmap (3-Layer Plan, Small Steps)

Status: Active

Purpose: Replace the big-bang refactor plans (P0/P1/P2) with a safe, micro‑step roadmap that we execute one small change at a time and manually test after every step. This avoids regressions like we saw when attempting Layer 1 in one chunk.

Guiding principles
- Only one small change per step (5–30 min each)
- Manual testing gate after every step
- Enable quick rollback (keep commits surgical)
- Preserve user data; never drop storage unless explicitly requested

Architecture layers (context)
- Layer 1: View-model + initialization stability (HomePage orchestration, modal flow)
- Layer 2: Modal state reducer + shared modal infra
- Layer 3: Performance + error handling polish

We will execute these as micro-steps. Each step includes objective, change, test, and rollback.

---------------------------------------------------------------------
LAYER 1 — Stabilize Initialization + Modal Flows (Micro-steps)
---------------------------------------------------------------------

Step 1.0 — Baseline tools (no app code changes)
- Change: Add or verify two static tools under `public/`:
  - `/debug-state.html` to inspect IndexedDB keys: `savedSoccerGames`, `soccerAppSettings`
  - `/clear-cache.html` to reset SW/caches (optional; use with caution)
- Test:
  - Start app → open `/debug-state.html` → Inspect IndexedDB
  - Confirm keys exist and currentGameId is visible
- Rollback: None (static files)

Step 1.1 — Modal click-through guard (menu → modal)
- Change:
  - Add 120ms deferral after closing the side menu before opening any modal action (prevents click-through)
  - Delay focusing confirm button by ~150ms to avoid accidentally capturing the original click
- Test:
  - Open “Load Game” and “New Game” from left menu; ensure no flash/auto-close
- Rollback: Remove the deferral/focus delay lines

Step 1.2 — Auto-save gating while modals open
- Change:
  - Pause auto-save when any major modal is open (load game, new game, settings, etc.)
- Test:
  - Open Load Game and New Game; observe no auto-save logs while modal is open
- Rollback: Revert the modal-open guard on auto-save

Step 1.3 — Initialize app state deterministically
- Change:
  - Set `initialLoadComplete` unconditionally after first pass; add fallback direct storage read if React Query hydration lags; safety select latest real game if stuck in default
- Test:
  - Fresh start: default game → continue
  - Import backup → reload → Continue should open a real game (no first-game overlay)
- Rollback: Revert initialization changes

Step 1.4 — Restore normalization + post-restore currentGameId
- Change:
  - Normalize legacy backup keys (e.g., `savedGames` → `savedSoccerGames`)
  - After restore, ensure `soccerAppSettings.currentGameId` points to a real game and hard reload
- Test:
  - Import backup → reload → `/debug-state.html` shows real currentGameId; Continue → app enters real game
- Rollback: Revert normalization; keep reload fallback

Step 1.5 — Portalize all modals (top-most layer)
- Change:
  - Render the `ModalManager` via a portal to `document.body`
- Test:
  - Open every modal (Load Game, Game Settings, App Settings, Season/Tournaments, Player Assessment); verify they render above overlays
- Rollback: Remove portal wrapper

Step 1.6 — Anti-flash safety for specific modals
- Change:
  - In `ModalProvider`, ignore a modal “close” event that occurs within 200ms of opening for Load Game / New Game Setup (stops flash-and-close on rehydrate)
- Test:
  - Reproduce import → open Load Game: confirm it stays open
- Rollback: Remove the 200ms safety

Step 1.7 — Manual regression script (document)
- Change:
  - Capture a 1-page checklist (start from scratch, import backup, open all modals, create new game, load game, etc.)
- Test:
  - Execute against a fresh run and after data import

---------------------------------------------------------------------
LAYER 2 — Modal State Reducer (Opt-in, incremental)
---------------------------------------------------------------------

Step 2.0 — Add modal reducer skeleton (no switching yet)
- Change:
  - Introduce `modalReducer` with one field (e.g., `loadGame`) and a no-op mapping in provider
- Test: no behavior change

Step 2.1 — Migrate LoadGame modal to reducer
- Change: wire `loadGame` open/close to reducer
- Test: open/close works; others untouched

Step 2.2 — Migrate NewGame setup modal
- Change: move `newGameSetup` to reducer
- Test: confirm flows still work (save-before-new → setup)

Step 2.3 — Migrate remaining modals in pairs (small, safe increments)
- Repeat until all are consolidated

Step 2.4 — Parameter/props grouping (reduce coupling)
- Change:
  - Group `useNewGameFlow` options into cohesive objects: `gameState`, `actions`, `dependencies`, `config`
  - Introduce view-models for `GameContainer` and `FieldContainer` (reduce >50 props to a few sub-objects)
- Test:
  - Focused unit tests for new groups; ensure existing behavior unchanged
- See: docs/03-active-plans/L2-2.4-HomePage-Reduction-PLAN.md
- Status:
  - ✅ 2.4.0–2.4.6 shipped (view-model adapter, FieldContainer/timer VMs, PlayerBar/GameInfo VM-only data paths, and useNewGameFlow context grouping)
  - ✅ 2.4.5 Debug instrumentation unification (central `debug.enabled()`, `.env` docs, `HomePage`/history/tactical call-site migrations + tests) — executed early to keep manual verification predictable.
  - ✅ 2.4.7 Field interaction VM extraction + reducer-driven modal intents wired through HomePage/FieldContainer.
  - ✅ 2.4.8 FieldContainer interaction sub-VMs + roster/season reducer coverage (CTA + reducer regression tests added).
  - ✅ 2.4.9 ControlBar/ModalManager reducer adoption (eliminated direct modal setters + added ControlBar anti-flash regression test).

Step 2.5 — Edge-case tests
- Add tests for:
  - Backup restore → latest game fallback (stale `currentGameId`)
  - `useGameState` availablePlayers → playersOnField sync

Housekeeping
- Remove redundant/skipped tests; if a test is needed, implement deterministically without relying on IndexedDB
- Name magic numbers (e.g., modal deferral) and centralize in constants

Design note (P2, plan later)
- External games (player adjustments) may benefit from optional associations to `teamId`, `seasonId`, and `tournamentId` to enable season/tournament/team-filtered views and Excel exports to include validated external games.
- Keep `includeInSeasonTournament` as an opt‑in flag to avoid polluting aggregates by default.
- If adopted, update: Player tab totals, aggregate stats (view + Excel), and filtering utilities.

---------------------------------------------------------------------
LAYER 3 — Performance + Error Handling (targeted)
---------------------------------------------------------------------

Step 3.0 — ErrorBoundary tuning
- Change: add friendly fallback + logging tags; ensure modal portals are wrapped
- Test: cause synthetic error in modal; confirm graceful fallback

Step 3.1 — Auto-save batching refinements
- Change: tune delays per state cluster; add guard for heavy redraws
- Test: watch logs; ensure fewer saves while typing

Step 3.2 — Query cache hygiene
- Change: centralize invalidations after backup import & new game
- Test: load game, switch, import; avoid stale UIs

---------------------------------------------------------------------
Execution checklist (per step)
1) Create branch `micro/step-X`
2) Implement the minimal change
3) Manual test per step’s test section
4) If good, merge; otherwise rollback and adjust

Where to start
- If this is a clean reset, start at Step 1.0 and progress to 1.6. After that, decide whether consolidation (Layer 2) is needed now or later.

Supersedes
- These micro-steps replace the big-bang approach described in P0/P1/P2 plans. See notes added atop those files.
