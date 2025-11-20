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

## Resolved Debt Items

_(Items that have been refactored and resolved)_

### ✅ RESOLVED: HomePage.tsx God Component

**Resolved**: November 18, 2025
**Solution**: Extracted into useGameOrchestration, containers, and view-models
**Result**: HomePage reduced from 3,680 lines → 62 lines (98.3% reduction)
**Details**: See [REFACTORING_STATUS.md](../03-active-plans/REFACTORING_STATUS.md)

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
**Last Updated**: November 20, 2025
**Next Review**: When modifying assessment or persistence logic
