# Technical Debt Reduction Plan – Game Session & Modal Architecture

This blueprint decomposes the refactor into small, reviewable PRs. Update the checkboxes as work progresses. Every task must keep existing behaviour intact and add automated coverage before merging.

---

## Phase 0 – Guardrails and Baseline (PR-0)
- [ ] **P0.1** Add integration tests for:
  - Season/tournament prefill (select/clear/race scenarios)
  - Undo/redo restoring full session state
  - New game creation success + failure (ensure rollback)
- [ ] **P0.2** Create shared helpers (e.g., `buildGameSessionHistorySlice`) and document hot spots in `/docs/CRITICAL_FIXES_REQUIRED.md`.

---

## Phase 1 – Game Session Orchestration

### PR-1.1: Extract `useGameSessionOrchestrator`
- [ ] Move reducer wiring, undo/redo, mutation helper, and auto-save out of `HomePage.tsx` into `src/hooks/useGameSessionOrchestrator.ts`.
- [ ] Expose minimal API: `{ gameSessionState, dispatch, historyHelpers, mutationHelpers }`.
- [ ] Unit tests: sequence guard, history payload completeness, season/tournament mutation paths.
- [ ] Refactor `HomePage.tsx` to consume the hook (no UI changes).

### PR-1.2: Persistence Service
- [ ] Add `src/services/gamePersistence.ts` to encapsulate `utilSaveGame`, current ID storage, optimistic updates/rollback.
- [ ] Update orchestrator to call service instead of inline try/catch.
- [ ] Integration tests: new game creation success & failure ensure state/UI remain consistent.

---

## Phase 2 – Modal Decomposition

### PR-2.1: Modal Context Simplification
- [ ] Extract modal state machine into dedicated module (typed context with reducers or state machine).
- [ ] Add unit tests for open/close transitions and default states.

### PR-2.2: Game Settings Modal Container/View
- [ ] Split into `GameSettingsModalContainer` (data + mutations) and `GameSettingsModalView` (pure presentational).
- [ ] Container exclusively handles `mutateGameDetails`; view receives props/callbacks.
- [ ] Tests:
  - RTL tests covering view interactions with mocked callbacks.
  - Unit tests ensuring container queues mutations with correct metadata.

### PR-2.x: Remaining Modals (repeat per modal)
- [ ] New Game Setup Modal (PR-2.3) – container/view split + tests.
- [ ] Roster Settings Modal (PR-2.4) – same pattern.
- [ ] Game Stats / Load Game / etc. (PR-2.5+) – tackle iteratively.

---

## Phase 3 – Timer & History Isolation

### PR-3.1: Timer Service Extraction
- [ ] Introduce `src/services/timerPersistence.ts` handling IndexedDB saves, restore, visibility change.
- [ ] Refactor `useGameTimer` to depend on service (no direct storage calls).
- [ ] Unit tests: timer tick persistence, visibility pause/resume (mock persistence).

### PR-3.2: History Payload Enforcement
- [ ] Replace ad-hoc history construction with helper that enumerates all fields (`createHistoryPayload`).
- [ ] Add compile-time `satisfies` assertions to catch missing fields.
- [ ] Unit test verifying new `GameSessionState` fields must be consciously ignored/handled.

---

## Phase 4 – API Boundaries & Typing

### PR-4.1: Mutation Meta Builders
- [ ] Move `MutationMeta` types into `src/types/mutations.ts`.
- [ ] Provide builder functions (`createSeasonPrefillMeta`, etc.) to generate meta with required fields.
- [ ] Tests ensuring builders produce expected shapes and reject invalid combinations.

### PR-4.2: React Query Helpers
- [ ] Wrap `useMutation` in `useGameDetailsMutation` (typed, shared onSuccess/onError logic).
- [ ] Update orchestrator/container to use helper.
- [ ] Tests: stale response skipping, sequence reset on modal open.

---

## Phase 5 – Cleanup & Documentation

### PR-5.1: Remove Prefill Delay Magic Number
- [ ] Replace `setTimeout(..., 100)` with explicit readiness check or mutation chaining (`onSettled` or derived state).
- [ ] Tests confirming prefill triggers only once per selection without arbitrary delay.

### PR-5.2: Documentation & Onboarding
- [ ] Add `/docs/architecture/game-session.md` summarising new layers, responsibilities, and common flows.
- [ ] Provide migration checklist (e.g., when adding new fields to `GameSessionState` or new modals).
- [ ] Optional: storybook/demo entries for modal views to aid designers/QA.

---

## Ongoing Quality Gates
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run test:integration` (introduced in Phase 0)
- [ ] Ensure each PR updates this document and `/docs/CRITICAL_FIXES_REQUIRED.md` with current status.

