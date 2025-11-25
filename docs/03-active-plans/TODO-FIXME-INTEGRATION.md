# TODO/FIXME Integration Plan

**Status**: Active tracking
**Last Updated**: November 24, 2025

This document tracks the integration of 5 TODO/FIXME comments found in the codebase into the 8-week refactoring roadmap.

---

## Summary

**Total Items**: 5 TODO/FIXME comments
**Active Integration Points**: 3 (Week 2, Phase 2 PR 7, Week 8 PR 12)
**Total Additional Effort**: ~1-3 hours across existing phases
**Impact**: Minimal - naturally integrated into existing PRs

---

## TODO Items by Status

### ✅ Week 2-3 (Phase 1) - Immediate Cleanup

#### 1. useGameOrchestration.ts:278 - OBSOLETE
```typescript
// TODO: Add useGamePersistence hook call here after reordering dependencies
```
**Status**: Obsolete - hook already called at line 1060
**Action**: Delete comment (15 seconds)
**Integration**: Week 2 cleanup

#### 2. useGameOrchestration.ts:240 - LIKELY OBSOLETE
```typescript
// TODO: Remove savedGames local state once all references are updated to use gameDataManagement.savedGames
```
**Status**: Likely obsolete after Phase 1 PR 2 context migration
**Action**:
- Verify if GameStateContext eliminates need for local `savedGames` state
- If yes: Remove local state, delete comment, update tests (treat React Query `savedGames` as single source of truth and replace local setSavedGames calls with queryClient.setQueryData/invalidations)
- If no: Update comment with reason still needed
**Effort**: 30-60 minutes (small standalone PR)
**Integration**: Run as its own PR (not a blocker for Phase 2)

---

### 🔄 Weeks 4-5 (Phase 2) - Modal Decoupling

#### 3. ModalProvider.tsx:31 - ACTIVE EVALUATION
```typescript
// TODO: Consider extracting this guard into a shared hook if/when additional modals need it.
```
**Context**: Anti-flash guard pattern (200ms window prevents rapid modal re-close)
**Current Usage**: 2 modals (loadGame, newGameSetup)
**Decision Point**: Extract to hook if ≥3 modals need protection

**Action in PR 7**:
- [ ] Count modals using anti-flash guard after modal decoupling
- [ ] **If ≥3 modals need guard**:
  - Create `src/hooks/useAntiFlashGuard.ts`
  - Refactor affected modals to use new hook
  - Add tests for hook behavior
  - Estimated effort: 1-2 hours
- [ ] **If <3 modals**:
  - Keep inline implementation
  - Update TODO comment to document decision
  - Estimated effort: 5 minutes

**Proposed Hook Signature** (if extraction needed):
```typescript
function useAntiFlashGuard(
  modalId: string,
  antiFlashMs: number = 200
): [boolean, React.Dispatch<React.SetStateAction<boolean>>]
```

**Integration**: Phase 2 PR 7 (orchestrator pruning)

---

### 📋 Week 8 (Phase 5) - Documentation

#### 4. useFieldCoordination.ts:480 - FEATURE REQUEST
```typescript
// TODO: Future enhancement - Use configurable formations:
// - Selected formation (e.g., 4-3-3, 3-4-3) determines positions
// - Extra players beyond formation size placed neatly on field side
// - See roadmap.md for detailed implementation plan
```
**Status**: Already documented in roadmap.md
**Feature**: Configurable Formation System
**Target**: v1.5 (Q2 2026) or v2.0 (Q1 2027)
**Effort**: 16-24 hours (future work, post-refactoring)

**Action in PR 12**:
- Update TODO comment to clarify target release:
```typescript
// TODO: Future enhancement (target v1.5-2.0) - Configurable formations
// See docs/03-active-plans/roadmap.md "Configurable Formation System" section
// for full implementation plan (16-24 hour effort estimate).
```
**Effort**: 2 minutes

**Integration**: Week 8 PR 12 (metrics/docs update)

---

### ⏸️ No Action Required

#### 5. clubSeason.ts:20 - VERY LOW PRIORITY
```typescript
// TODO: After 2099, implement smart century detection based on current year
// or make century configurable. Current implementation is sufficient through 2099.
```
**Status**: 75+ years away
**Priority**: Very Low
**Action**: None - keep as-is
**Rationale**: Current implementation correctly handles 2000-2099 range; Y2100 problem not relevant

---

## Integration Timeline

| Week | Phase | TODO Items | Effort | Files |
|------|-------|------------|--------|-------|
| 2-3 | Phase 1 | #1, #2 (cleanup) | ~1 hour | useGameOrchestration.ts:240,278 |
| 4-5 | Phase 2 PR 7 | #3 (evaluate) | 0-2 hours | ModalProvider.tsx:31 |
| 8 | Phase 5 PR 12 | #4 (update comment) | 2 min | useFieldCoordination.ts:480 |
| - | No action | #5 (Y2100 issue) | 0 | clubSeason.ts:20 |

**Total Additional Effort**: ~1-3 hours
**Impact on Timeline**: None (integrated into existing PRs)

---

## Success Criteria

### Week 2-3 Success
- ✅ No obsolete TODO comments in useGameOrchestration.ts
- ✅ Clean state management (no duplicate savedGames state)
- ✅ All tests passing after cleanup

### Phase 2 Success
- ✅ Anti-flash guard pattern properly evaluated
- ✅ Extraction decision documented (extract or keep inline)
- ✅ No modal behavior regressions

### Phase 5 Success
- ✅ All TODO comments accurate and actionable
- ✅ Future enhancements properly tracked in roadmap.md
- ✅ Documentation reflects actual codebase state

---

## Related Documentation

- **Roadmap Integration**: See `PROFESSIONAL_ARCHITECTURE_ROADMAP.md` for specific PR checklists
- **Feature Planning**: See `roadmap.md` for "Configurable Formation System" details
- **Refactoring Status**: See `REFACTORING_STATUS.md` for overall progress tracking

---

## Notes

**Why This Matters**:
- Stale TODO comments create confusion and technical debt
- Proper integration ensures cleanup happens at natural points
- Minimal additional effort maintains momentum on main refactoring goals
- Documentation accuracy improves code maintainability

**Decision Making**:
- Obsolete TODOs: Delete immediately (Week 2)
- Active TODOs: Evaluate during relevant phase (Phase 2)
- Feature TODOs: Track in roadmap, update references (Week 8)
- Low priority TODOs: Keep as-is with clear context
