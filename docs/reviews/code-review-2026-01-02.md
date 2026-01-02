# Code Review Update (2026-01-02)

Repo: `MatchOps-Local`  
Reviewed commit: `7b1b3617`  
Previous review baseline: `docs/reviews/code-review-2026-01-01.md` (commit `d24f8fdb`)

## Scope & Method

Static inspection only (source reading + targeted searches). No `npm` scripts executed.

This update focuses on:
- What changed since the 2026-01-01 review (what was addressed)
- The remaining large-module refactors
- The service worker “update/retry” behavior and the reported data loss

---

## What Was Addressed Since 2026-01-01 (Quick Summary)

These items from the previous review appear to be handled in the current state:

### Premium gating / client env correctness
- `process.env.VERCEL_ENV` checks in client code have been replaced with a safer feature-flag approach.
- `src/config/constants.ts` introduces `PREMIUM_ENFORCEMENT_ENABLED` (currently `false`), which effectively makes premium enforcement opt-in at the code level.

Primary files:
- `src/config/constants.ts`
- `src/components/UpgradePromptModal.tsx`
- `src/components/SettingsModal.tsx`
- `src/utils/premiumManager.ts`

### PWA update polling noise reduction
- `src/components/ServiceWorkerRegistration.tsx` now:
  - avoids update checks while offline (`navigator.onLine`)
  - uses hourly polling in prod/test instead of 60s
  - logs update-check failures at `warn` instead of `error`

### Analytics / privacy
- Analytics was made truly opt-in and then removed from the layout entirely.
- `src/app/layout.tsx` no longer loads `@vercel/analytics`.

### Accessibility: focus trapping
- A reusable focus trap hook exists: `src/hooks/useFocusTrap.ts`
- Core modals now use it (e.g., `src/components/ConfirmationModal.tsx`, `src/components/UpgradePromptModal.tsx`).
- The focus trap also applies `inert` to the app root with reference counting (supports nested modals).

### Type safety cleanup (removal of production `any`)
- Production hook typing was tightened (notably around React Query mutations).

### Documentation/testing alignment
- Documentation was adjusted to better reflect the actual Jest configuration and CI scripts.

---

## P0 — Service Worker Update Flow Can Cause User-Perceived Data Loss

### The likely root cause

The key risk is not IndexedDB corruption; it’s **in-memory state loss** due to **page reloads** happening while the user is in an active session (especially in an “unsaved” game).

#### 1) `DEFAULT_GAME_ID` (“unsaved_game”) is intentionally not auto-saved

Auto-save is disabled for the “scratch/unsaved” game ID:
- `src/config/constants.ts` sets `DEFAULT_GAME_ID = 'unsaved_game'`
- `src/components/HomePage/hooks/useGamePersistence.ts` calls `useAutoSave` with:
  - `enabled: initialLoadComplete && currentGameId !== DEFAULT_GAME_ID`

Implication:
- If the user is in a scratch game (common during onboarding or quick usage) and the app reloads, recent changes may be lost entirely unless the user manually saved and created a real game ID.

#### 2) Even “saved games” have debounced saves (0ms/500ms/2000ms)

For non-default games, auto-save is debounced:
- critical events: immediate
- metadata: 500ms
- tactical edits: 2000ms

Implication:
- A reload can still drop the last ~0.5–2.0 seconds of work, depending on what the user was doing.

#### 3) Update flows currently include “reload now” paths

There are two notable reload triggers:

1) Global controller-change reload in `src/components/ServiceWorkerRegistration.tsx`:
- listens to `navigator.serviceWorker` `controllerchange`
- calls `window.location.reload()`

This is a common pattern, but it is “blind” to whether the user is in an unsaved session or has pending debounced saves.

2) Manual update flow in Settings (`src/components/SettingsModal.tsx`):
- `handleUpdateConfirmed` posts `SKIP_WAITING` and calls `window.location.reload()`
- this reload is not coordinated with persistence/auto-save and may occur before a “safe save” completes.

If the user chose “update now”, they may inadvertently accept a reload that loses a scratch game or the last seconds of tactical work.

#### 4) Multi-tab / multi-surface scenarios amplify the risk

Even if you discourage multi-tab use, there are realistic “two surface” cases:
- installed PWA + a browser tab
- Android TWA + a normal browser session

One surface activating the new SW can trigger `controllerchange` in the other surface, causing a reload at an unexpected time.

### Suggested investigation checklist (to confirm the above)

Try reproducing with the smallest possible repro steps:

1) **Scratch game loss**
   - Start a match (still `unsaved_game`)
   - Make tactical edits (drawings / player moves)
   - Trigger an update (banner “Update now”, or Settings → “Check for Updates” → confirm)
   - Observe: after reload, scratch session state is gone

2) **Debounce window loss**
   - Load a saved game (non-default ID)
   - Make a tactical change and immediately update/reload within <2 seconds
   - Observe: last change missing after reload

3) **Multi-surface reload**
   - Open app in two contexts (PWA + tab)
   - Trigger update in one context
   - Observe if the other context reloads unexpectedly

### Remediation options (ordered by safety)

#### Option A (safest): stop auto-reloading on `controllerchange`

Change behavior:
- Do not immediately call `window.location.reload()` when the SW controller changes.
- Instead, set “update ready” state and prompt the user to restart when convenient.

Tradeoff:
- Update completion becomes user-driven (safer for in-progress sessions).

#### Option B: add a “safe reload coordinator” (recommended long-term)

Introduce an explicit, awaitable workflow for any reload:
- SW update apply
- manual update from Settings
- `useAppResume` forced reload after long background
- backup restore reload

High-level design:
1) A central coordinator exposes `requestReload(reason): Promise<boolean>`
2) HomePage/persistence registers a handler to “flush” state before reload:
   - if currentGameId is a real game: force immediate save (await)
   - if currentGameId is `unsaved_game`: write a *draft* snapshot to `unsaved_game` (no new ID creation), or explicitly warn user that they will lose the scratch session
3) Only after flush completes does the coordinator allow reload.

Implementation patterns that fit this codebase:
- A context provider at the app root (preferred)
- Or a narrow custom-event handshake (`window.dispatchEvent(...)` + promise/ack)
- Or `BroadcastChannel` if you want cross-tab safety later (likely optional)

#### Option C: enable draft auto-save for `unsaved_game`

If you want the scratch session to survive any reload:
- Add a “draft save” path that persists snapshots to `unsaved_game` without creating a permanent game ID.
- Keep it excluded from exports/lists and from “resume latest” selection if that’s still desired.

This alone won’t solve the “last 2 seconds” debounce window, but it eliminates the biggest perceived loss.

---

## Remaining Large-Module Refactors (Still Worth Doing)

These are still the main maintainability risks by size and responsibility density:

- `src/components/GameSettingsModal.tsx` (~2457 LOC)
- `src/components/HomePage/hooks/useGameOrchestration.ts` (~2160 LOC)
- `src/components/SoccerField.tsx` (~1658 LOC)
- `src/datastore/LocalDataStore.ts` (~2004 LOC)

The repo already shows good progress (many hooks/components extracted), but these files remain “system integrators” and are hard to reason about.

### `useGameOrchestration` (highest ROI)

Current symptoms:
- The hook manages many orthogonal responsibilities: bootstrapping, persistence, exports, onboarding, modal orchestration, timer/wakelock, roster sync, etc.

Recommended extraction seams (incremental, low-risk):
1) **Update/reload safety** (ties to the P0 issue)
   - Extract a small “lifecycle coordinator” that handles update/reload events and delegates to persistence.
2) **Export handlers**
   - Move “current game export” and “aggregate export” handlers into a dedicated hook: `useExports(...)`.
3) **New game flow**
   - Extract “start new game setup + save-before-new confirmations” into `useNewGameFlow(...)`.
4) **Bootstrapping/resume**
   - Extract initial load + “resume last game” logic into `useHomeBootstrap(...)`.

Goal:
- Make `useGameOrchestration` mainly compose hooks and return view-model-like props.

File: `src/components/HomePage/hooks/useGameOrchestration.ts`

### `GameSettingsModal`

Current symptoms:
- Already has some extracted sections, but still mixes:
  - UI rendering
  - event editing
  - league selection logic
  - async updates/mutations
  - many cross-cutting conditionals

Recommended extraction seams:
1) Extract “event editor” into `GameEventsEditor` + `useGameEventsEditor(...)`
2) Extract league selection into a `LeagueSelector` component (with derived-data memoization inside)
3) Extract season/tournament binding section into a component that takes “available seasons/tournaments” + selection handlers

File: `src/components/GameSettingsModal.tsx`

### `SoccerField`

Current symptoms:
- It’s a combined drawing engine + interaction engine + rendering component.

Recommended extraction seams:
1) Move pointer/mouse/touch logic into `useSoccerFieldInteractions(...)` (returns handlers and computed positions)
2) Move rendering pipeline into `src/utils/fieldRender/` or `src/components/SoccerField/render/`
   - keep `SoccerField.tsx` as a thin wrapper that wires props → draw + handlers
3) Consider a “render model” object that precomputes what to draw (reduces re-render complexity and makes profiling easier)

File: `src/components/SoccerField.tsx`

### `LocalDataStore`

This is less urgent than UI/orchestration refactors, but it’s a natural next step for clarity:
- Split validators/normalizers/serializers into modules (especially as backend abstraction grows).

File: `src/datastore/LocalDataStore.ts`

---

## Recommended Next Steps (Concrete)

1) Decide desired UX: should `unsaved_game` survive reloads?
   - If yes: implement draft saves (Option C) and/or safe reload coordinator (Option B).
2) Make SW updates non-destructive:
   - Stop auto reload on `controllerchange` or gate it behind a safe-save handshake.
   - Ensure Settings “Update now” also uses the safe-save handshake.
3) Start refactoring with the highest ROI extraction:
   - Pull “export handlers” and “new game flow” out of `useGameOrchestration` first.

