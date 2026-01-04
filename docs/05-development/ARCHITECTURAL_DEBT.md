# Architectural Debt Tracker

**Purpose**: Document architectural decisions that work but create complexity or coupling, for future refactoring consideration.

**Status**: Living document - add entries as architectural issues are discovered during development.

---

## Active Debt Items

### 🟡 MEDIUM: playerAssessments Circular Dependency

**Discovered**: November 20, 2025 (during Step 2.6.4 code review)
**Component**: `useGamePersistence`, `usePlayerAssessments`, `useGameOrchestration`
**Impact**: Low immediate risk (works fine), but increases complexity for future refactoring

#### The Problem

Player assessments create a dependency chain between hooks:

```
useGameOrchestration
  ├─> usePlayerAssessments(currentGameId)
  │     └─> returns playerAssessments
  │
  └─> useGamePersistence(currentGameId, playerAssessments)
        └─> needs playerAssessments for snapshot creation
```

#### Why This Is Problematic

1. **Split-Brain Architecture**:
   - Game state (scores, events, players) lives in `GameSessionState`
   - Assessments live in separate storage (`player-assessments-${gameId}`)
   - This creates two sources of truth for game data

2. **Tight Coupling**:
   - Changes to assessment structure require updating 3 hooks
   - Can't test persistence without mocking assessments
   - Can't test assessments without a game context

3. **Architectural Inconsistency**:
   - Why are assessments special and stored separately?
   - Other game data is unified in game session state

#### Refactoring Options

**Option A: Move Assessments into GameSessionState (RECOMMENDED)**
```typescript
// Add to GameSessionState interface
interface GameSessionState {
  // ... existing fields
  assessments: Record<string, PlayerAssessment>;
}

// Benefits:
// - Single source of truth
// - No separate hook needed
// - Automatically saved/loaded with game
// - No circular dependency
// - Consistent with other game data

// Migration Path:
// 1. Add assessments field to GameSessionState
// 2. Add reducer actions: ADD_ASSESSMENT, UPDATE_ASSESSMENT, DELETE_ASSESSMENT
// 3. Migrate existing assessments from separate storage
// 4. Remove usePlayerAssessments hook
// 5. Update UI components to use reducer actions
```

**Option B: Make Assessments Fully Independent**
```typescript
// Don't include assessments in game snapshot
// Save/load separately from game state

// Benefits:
// - Assessments can exist without a game
// - Can assess players across multiple games
// - Useful for team-wide assessment tracking

// Downside:
// - Split-brain architecture persists
// - More complex save/load logic
```

**Option C: Keep Current Architecture (Status Quo)**
```typescript
// Accept currentGameId and assessments as parameters

// Benefits:
// - Works fine, no bugs
// - Minimal changes required
// - Already implemented

// Downside:
// - Architectural debt remains
// - Tight coupling persists
```

#### Current State

- **Chosen Approach**: Option C (parameter passing)
- **Documented In**: `src/components/HomePage/hooks/useGamePersistence.ts` (lines 25-46)
- **Status**: Working correctly, no user-facing issues
- **Priority**: MEDIUM - consider during next major refactoring

#### When to Address

Consider refactoring when:
- Modifying assessment storage or structure
- Refactoring persistence logic
- Adding new assessment features
- Extracting more hooks from useGameOrchestration

#### Related Files

- `src/components/HomePage/hooks/useGamePersistence.ts` - Accepts assessments as parameter
- `src/hooks/usePlayerAssessments.ts` - Manages assessment storage per-game
- `src/components/HomePage/hooks/useGameOrchestration.ts` - Orchestrates both hooks
- `src/utils/playerAssessments.ts` - Storage operations for assessments

---

### 🟡 MEDIUM: Auto-Save Error Handling - Missing Retry Logic

**Discovered**: November 20, 2025 (during Step 2.6.4 code review)
**Component**: `useGamePersistence` - auto-save error handling
**Impact**: Medium - silent data loss possible on transient errors

#### The Problem

Auto-save currently has no retry mechanism for transient errors:

```typescript
// Current: Single attempt, no retry
useAutoSave({
  saveFunction: () => handleQuickSaveGame(true, true),
  // If this fails, the data is lost
});
```

**Transient Error Scenarios:**
- Storage quota temporarily exceeded
- IndexedDB locked by another tab
- Brief network interruption (if syncing)
- Device suspend/resume timing issues

#### Why This Is Problematic

1. **Silent Data Loss**:
   - User makes changes → auto-save triggered → error occurs → changes lost
   - No indication to user that save failed
   - Only discoverable when loading game later

2. **No Resilience**:
   - Transient errors (90% of failures) treated same as permanent errors
   - Single point of failure for all auto-saves
   - No exponential backoff or circuit breaker

3. **Limited Observability**:
   - ✅ FIXED: Errors now logged to Sentry
   - ✅ FIXED: Error toasts suppressed for auto-save
   - ❌ TODO: No retry metrics or success rate tracking

#### Current State (Partial Fix)

**✅ Completed (November 20, 2025)**:
- Errors logged to Sentry with context (gameId, operation, teamId)
- Error toasts suppressed for auto-save (no UX disruption)
- Manual saves still show error toasts for immediate feedback

**❌ Not Yet Implemented**:
- Retry logic with exponential backoff
- Differentiation between transient and permanent errors
- Circuit breaker to prevent retry storms
- Success rate metrics

#### Refactoring Options

**Option A: Exponential Backoff Retry (RECOMMENDED)**
```typescript
async function saveWithRetry(saveFn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await saveFn();
      return { success: true };
    } catch (error) {
      if (!isTransientError(error) || attempt === maxRetries - 1) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Benefits:
// - Handles transient errors gracefully
// - Exponential backoff prevents retry storms
// - Configurable max retries
// - Preserves user data

// Downside:
// - Adds complexity
// - Delayed feedback on permanent failures
```

**Option B: Circuit Breaker Pattern**
```typescript
class SaveCircuitBreaker {
  private failures = 0;
  private threshold = 5;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async execute(saveFn) {
    if (this.state === 'open') {
      throw new Error('Circuit breaker open');
    }
    try {
      await saveFn();
      this.onSuccess();
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}

// Benefits:
// - Prevents cascading failures
// - Automatic recovery (half-open state)
// - Protects storage layer

// Downside:
// - More complex than retry
// - Needs threshold tuning
```

**Option C: Status Quo + Monitoring**
```typescript
// Keep current error handling, add metrics
Sentry.captureException(error, {
  tags: { operation: 'auto_save', attempt: 1 },
});

// Show non-intrusive indicator
setAutoSaveStatus('failed'); // Visual indicator in UI

// Benefits:
// - Simple, minimal changes
// - User awareness of failures
// - Sentry monitoring enabled

// Downside:
// - No automatic recovery
// - Still loses data on transient errors
```

#### Recommended Approach

**Phase 1: Immediate (Current)**
- ✅ Log to Sentry with context
- ✅ Suppress error toasts for auto-save

**Phase 2: Short-term (Next PR)**
- Add simple retry (3 attempts, exponential backoff)
- Detect transient errors vs permanent errors
- Add auto-save status indicator in UI

**Phase 3: Long-term (Future)**
- Circuit breaker for storage protection
- Metrics dashboard for save success rates
- User notification for repeated failures

#### When to Address

**Priority: MEDIUM** - Address in next 1-2 sprints

Triggers:
- User reports of lost data
- Sentry shows high auto-save error rate (>5%)
- Adding offline mode or sync features
- Storage layer changes

#### Related Files

- `src/components/HomePage/hooks/useGamePersistence.ts` - Auto-save implementation
- `src/hooks/useAutoSave.ts` - Auto-save hook with debouncing
- `src/utils/savedGames.ts` - Storage operations

---

### 🟢 LOW: CollapsibleFilters Prop Drilling and Scattered Filter Logic

**Discovered**: December 11, 2025 (during Game Stats UI review)
**Component**: `src/components/GameStatsModal/components/CollapsibleFilters.tsx`
**Impact**: Low - fully functional today, but adding filters or tests requires plumbing 7+ props through a single component

#### The Problem

`CollapsibleFilters` owns seven filter values/callbacks plus optional children. Cross-filter reset logic (series reset on tournament change, badge counts, clear-all behavior) lives inline with rendering, so each new filter requires updating the prop surface and the internal reset logic.

#### Why This Is Problematic

1. **Prop Drilling Overhead**:
   - Every consumer must manage and pass all filter states/callbacks, even when only a subset is relevant.
   - Adding a new filter increases the prop list and component signature churn.

2. **Mixed Concerns**:
   - UI rendering, state wiring, and reset rules are interleaved, making the component harder to unit test in isolation.
   - Clear-all logic is scattered across handlers instead of living in one place.

3. **Test Friction**:
   - Verifying filter interactions requires building a heavy prop object rather than calling a focused state helper.

#### Refactoring Options

**Option A (Recommended)**: Extract `useStatsFilters` hook that owns filter state, derived counts, and reset rules. The hook would expose `filters`, `setFilter`, `clearAll()`, and derived metadata (e.g., `activeFilterCount`, `hasSeries`). `CollapsibleFilters` becomes a thin view layer consuming the hook output.

**Option B**: Introduce a lightweight `StatsFiltersProvider` context that wraps the Game Stats modal and supplies filter state via context. Components inside the modal consume only the filters they need, and clear/reset logic stays centralized.

**Option C**: Keep the current implementation but add a small helper module for badge counting and reset orchestration to reduce inline complexity.

#### Current State

- **Chosen Approach**: Option C (status quo)
- **Status**: Works; no user-facing issues
- **Priority**: LOW - treat as technical debt to unblock future filter additions or testing improvements

#### When to Address

- Adding another stats filter (e.g., venue, opponent strength)
- Creating unit tests for filter interactions or reset flows
- Reworking Game Stats modal UX/IA

#### Related Files

- `src/components/GameStatsModal/components/CollapsibleFilters.tsx`
- `src/components/GameStatsModal` (filter consumers)

---

## Resolved Debt Items

_(Items that have been refactored and resolved)_

### ✅ RESOLVED: HomePage.tsx God Component

**Resolved**: November 18, 2025
**Solution**: Extracted into useGameOrchestration, containers, and view-models
**Result**: HomePage reduced from 3,680 lines → 62 lines (98.3% reduction)
**Details**: P0 refactoring complete - see archived fix-plans in `docs/08-archived/fix-plans/`

---

## Guidelines for Adding Debt Items

When documenting architectural debt:

1. **Be Specific**: Include file names, line numbers, and code examples
2. **Explain Impact**: Low/Medium/High priority with justification
3. **Propose Solutions**: List at least 2-3 refactoring options with pros/cons
4. **Document Current State**: Why was this approach chosen initially?
5. **Set Triggers**: When should this be revisited?

### Template

```markdown
### 🟡 PRIORITY: Brief Title

**Discovered**: Date
**Component**: Affected files/hooks
**Impact**: Low/Medium/High with explanation

#### The Problem
[Describe the architectural issue]

#### Why This Is Problematic
[Explain coupling, complexity, or inconsistency]

#### Refactoring Options
**Option A**: [Preferred solution]
**Option B**: [Alternative solution]

#### Current State
- **Chosen Approach**: [Current implementation]
- **Status**: [Working/Broken/Workaround]
- **Priority**: [LOW/MEDIUM/HIGH]

#### When to Address
[Triggers for refactoring]

#### Related Files
[List of affected files]
```

---

**Document Owner**: Development Team
**Last Updated**: January 4, 2026
**Next Review**: When modifying assessment/persistence logic or expanding stats filters
