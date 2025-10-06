# Documentation Alignment Plan: IndexedDB Branch 1/4 Foundation Focus

## Problem
Documentation incorrectly emphasizes "migration" when we're implementing **Branch 1 of 4: IndexedDB Foundation**. Migration was completed separately. This causes AI reviewer misalignment.

## Core Corrections Needed

### 1. MASTER_EXECUTION_GUIDE.md Updates
**Current Status Fix:**
```markdown
### M1B: IndexedDB Foundation (Branch 1/4) 🚧 IN PROGRESS (PR pending)
- ✅ IndexedDB-only storage helpers implemented
- ✅ Storage factory with adapter pattern
- ✅ Async operations throughout application
- ✅ Error handling and type safety
- ✅ Test infrastructure completed
- [ ] PR merge to complete Branch 1/4

**Migration Note**: Migration utility completed in previous work (not current focus)
**Current Work**: Building IndexedDB storage foundation (Branch 1 of 4-branch plan)
```

### 2. Context Headers for AI Agents
Add to key files (migration.ts, storage.ts, etc.):
```typescript
/**
 * INDEXEDDB BRANCH CONTEXT (Branch 1/4):
 * - Current: IndexedDB storage foundation implementation
 * - Migration: Completed separately (not main focus)
 * - Review Focus: Storage architecture quality, async patterns, type safety
 * - Next: Branches 2-4 will build advanced features on this foundation
 */
```

### 3. Documentation Terminology Update
**Replace throughout docs:**
- "IndexedDB Migration System" → "IndexedDB Foundation (Branch 1/4)"
- "Migration implementation" → "Storage architecture implementation"
- "Migration features" → "Storage foundation features"

### 4. Review Guidelines for Future AIs
**Create clear context:**
- This is foundational storage work (Branch 1/4)
- Migration is done (separate work)
- Evaluate storage patterns, not migration complexity
- Foundation quality matters for future branches

## Outcome
Clear documentation that we're building IndexedDB storage foundation (Branch 1/4), with migration as completed separate work. Future AI agents will understand the actual scope and review accordingly.

---

## Concrete Implementation Steps

### 1. MASTER_EXECUTION_GUIDE.md Updates
- **Rename**: "Phase M1: IndexedDB Migration" → "Phase M1: IndexedDB Foundation"
- **Update "Start Here" bullets**: "Storage migration" → "Storage architecture (IndexedDB foundation)"
- **Collapse M1C**: Replace "Migration Execution" with small "Prerequisite completed" note
- **Reference**: Point to short appendix for migration details if needed

### 2. docs/README.md Updates
- **Change heading**: "Storage Integration" → "IndexedDB Foundation (Critical Fix)"
- **Reorder links**: Point first to foundation docs (ACTION_PLAN_VERIFICATION.md)
- **De-emphasize**: Keep migration specs accessible but secondary

### 3. File-Level Context Headers
Add "IndexedDB Branch Context (Branch 1/4)" to:
- `src/utils/storage.ts`
- `src/utils/storageFactory.ts`
- `src/utils/migration.ts` (explicitly note: "migration is completed prerequisite; not branch focus")

### 4. Migration Status UI Naming (Optional)
- **Rename**: `MigrationStatus` → `StorageUpgradeStatus`
- **Behavior**: Only render notification when storage upgrade occurred in session
- **Benefit**: Reduces semantic noise

### 5. Root App Context
In `src/app/page.tsx` (where `runMigration()` is called):
```typescript
// This runs once to ensure legacy data is converted.
// IndexedDB is the runtime storage; this is not the focus of current work.
```

### 6. Canonical Path Priority
- **Primary**: `docs/storage-integration/README.md` and `ACTION_PLAN_VERIFICATION.md`
- **These already reflect**: No-fallback IndexedDB posture and true branch scope
- **Ensure**: These are the central "Start Here" for this branch

## Verification: Code Already Aligned ✅
- ✅ Config in IndexedDB (storageConfigManager)
- ✅ i18n and timer use storage helper (no localStorage)
- ✅ FullBackup refactored to storage helper
- ✅ Migration throws on IndexedDB unavailability (no fallback)
- ✅ Remaining localStorage references confined to allowed areas:
  - One-time migration logic
  - LocalStorage utils/adapter code/tests
- ✅ Lint guardrails prevent regressions (no-restricted-imports/globals)

## Success Criteria
- Documentation clearly positions this as "IndexedDB Foundation (Branch 1/4)"
- Migration mentioned only as completed prerequisite
- Future AI agents understand the actual scope and review storage architecture quality
- Consistent terminology across all documentation
- Reviewers focus on IndexedDB foundation quality, not migration complexity

## Bottom Line
**Root Cause**: Documentation framing drives "migration popping up everywhere," not the code
**Solution**: Implement these changes to align reviewers and future AIs with true scope: **IndexedDB foundation, not migration**