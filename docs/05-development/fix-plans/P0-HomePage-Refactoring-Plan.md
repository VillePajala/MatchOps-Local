# P0: HomePage.tsx Refactoring Plan (CRITICAL)

**Priority**: P0 - CRITICAL
**File**: `/src/components/HomePage.tsx`
**Current Size**: 3,602 lines
**Target Size**: 150 lines (orchestrator only)
**Estimated Effort**: 2-3 hours
**Impact**: HIGH - Blocks all major feature development
**Status**: ❌ Not Started

---

## 🎯 OBJECTIVE

Transform the monolithic 3,602-line HomePage component into a clean, testable architecture with 12-15 focused components, each under 600 lines.

---

## 📊 PROBLEM STATEMENT

### Current State

**HomePage.tsx responsibilities** (TOO MANY):
1. Game timer logic orchestration
2. Auto-save functionality
3. 18 modal state management handlers
4. Player field drag & drop coordination
5. Score management
6. React Query data fetching (roster, games, seasons, tournaments)
7. Event handling (goals, substitutions, period ends)
8. Undo/redo state management
9. Tactical board state
10. Game session reducer orchestration
11. Visibility change handling
12. Wake lock management
13. Keyboard shortcuts
14. Toast notifications
15. Player assessment coordination
16. Export functionality coordination

### Evidence of Problems

```typescript
// Current HomePage.tsx structure (SIMPLIFIED)
function HomePage() {
  // STATE (50+ state variables)
  const [isGameStatsModalOpen, setIsGameStatsModalOpen] = useState(false);
  const [isLoadGameModalOpen, setIsLoadGameModalOpen] = useState(false);
  // ... 16 more modal states

  // HOOKS (20+ hooks)
  const { data: roster } = useQuery(/* roster query */);
  const { data: games } = useQuery(/* games query */);
  const [gameState, dispatch] = useReducer(gameSessionReducer, initialState);
  const { fieldState, fieldActions } = useGameState();
  const { timerState } = useGameTimer();
  // ... 15 more hooks

  // EVENT HANDLERS (30+ handlers)
  const handleGoalScored = () => { /* 50 lines */ };
  const handleSubstitution = () => { /* 40 lines */ };
  const handlePeriodEnd = () => { /* 60 lines */ };
  // ... 27 more handlers

  // EFFECTS (10+ useEffect)
  useEffect(() => { /* auto-save logic */ }, [/* 10 dependencies */]);
  useEffect(() => { /* visibility change */ }, [/* 5 dependencies */]);
  // ... 8 more effects

  // RENDER (1,500+ lines of JSX)
  return (
    <div>
      <SoccerField /* 15 props */ />
      <PlayerBar /* 10 props */ />
      <ControlBar /* 20 props */ />
      {/* 18 different modals with complex props */}
      {/* ... 1,400 more lines of JSX */}
    </div>
  );
}
```

**Problems**:
- Impossible to test in isolation
- Any change risks breaking everything
- New features require understanding 3,600 lines
- State changes cause massive re-renders
- Debugging is a nightmare

---

## 🏗️ PROPOSED ARCHITECTURE

### Target Structure

```
src/components/HomePage/
├── index.tsx                          # 150 lines - Main orchestrator (NEW)
├── hooks/
│   └── useGameOrchestration.ts       # 600 lines - Centralizes all state coordination
├── containers/
│   ├── GameContainer.tsx             # 1,200 lines - Main game UI & logic
│   ├── ModalManager.tsx              # 800 lines - All modal routing & state
│   └── FieldContainer.tsx            # 400 lines - Field, player bar, tactical board
├── components/
│   ├── GameControlBar.tsx            # 400 lines - Timer, controls, actions
│   ├── GameInfoBar.tsx               # 200 lines - Team names, scores, date (exists)
│   └── ExportActions.tsx             # 100 lines - Export buttons & logic
└── utils/
    ├── gameStateHelpers.ts           # 300 lines - Pure functions for state calc
    └── modalHelpers.ts               # 100 lines - Modal open/close helpers
```

### Component Responsibilities

**1. HomePage/index.tsx** (150 lines)
```typescript
// ONLY orchestrates, delegates everything else
export default function HomePage() {
  // Single orchestration hook
  const gameOrchestration = useGameOrchestration();

  return (
    <ErrorBoundary>
      <GameContainer orchestration={gameOrchestration} />
      <ModalManager orchestration={gameOrchestration} />
    </ErrorBoundary>
  );
}
```

**2. useGameOrchestration.ts** (600 lines)
```typescript
// Centralizes ALL state management
export function useGameOrchestration() {
  // React Query data fetching
  const roster = useRoster();
  const games = useGameDataQueries();

  // Game session reducer
  const [gameState, dispatch] = useReducer(gameSessionReducer, initialState);

  // Field state
  const fieldState = useGameState();

  // Timer
  const timer = useGameTimer();

  // Auto-save
  useAutoSave(gameState);

  // Modal state (centralized)
  const [modalState, dispatchModal] = useReducer(modalReducer, initialModalState);

  // Undo/redo
  const undoRedo = useUndoRedo();

  // Returns unified interface
  return {
    roster,
    games,
    gameState,
    fieldState,
    timer,
    modalState,
    actions: {
      // Wrapped action creators
      scoreGoal: () => { /* ... */ },
      makeSubstitution: () => { /* ... */ },
      openModal: (modalType) => { /* ... */ },
      // ... etc
    }
  };
}
```

**3. GameContainer.tsx** (1,200 lines)
```typescript
// Renders main game UI, delegates to sub-components
export function GameContainer({ orchestration }) {
  return (
    <div className="game-layout">
      <GameControlBar
        timer={orchestration.timer}
        actions={orchestration.actions}
      />

      <FieldContainer
        fieldState={orchestration.fieldState}
        players={orchestration.roster.players}
        onPlayerMove={orchestration.actions.movePlayer}
      />

      <ExportActions
        gameState={orchestration.gameState}
      />
    </div>
  );
}
```

**4. ModalManager.tsx** (800 lines)
```typescript
// Centralizes ALL modal rendering and state
export function ModalManager({ orchestration }) {
  const { modalState, actions } = orchestration;

  return (
    <>
      <GameStatsModal
        isOpen={modalState.gameStats}
        onClose={() => actions.closeModal('gameStats')}
        {.../* relevant props */}
      />

      <LoadGameModal
        isOpen={modalState.loadGame}
        onClose={() => actions.closeModal('loadGame')}
        {.../* relevant props */}
      />

      {/* ... 16 more modals */}
    </>
  );
}
```

**5. FieldContainer.tsx** (400 lines)
```typescript
// Wraps SoccerField, PlayerBar, tactical controls
export function FieldContainer({ fieldState, players, onPlayerMove }) {
  const isTacticsMode = fieldState.isTacticsBoardView;

  return (
    <div className="field-container">
      {!isTacticsMode && <PlayerBar players={players} />}

      <SoccerField
        {...fieldState}
        onPlayerMove={onPlayerMove}
      />

      {isTacticsMode && <TacticalControls />}
    </div>
  );
}
```

---

## 📝 STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 1: Preparation (30 min)

**Step 1.1**: Create directory structure
```bash
mkdir -p src/components/HomePage/{hooks,containers,components,utils}
```

**Step 1.2**: Create placeholder files
```bash
touch src/components/HomePage/index.tsx
touch src/components/HomePage/hooks/useGameOrchestration.ts
touch src/components/HomePage/containers/GameContainer.tsx
touch src/components/HomePage/containers/ModalManager.tsx
touch src/components/HomePage/containers/FieldContainer.tsx
touch src/components/HomePage/components/GameControlBar.tsx
touch src/components/HomePage/components/ExportActions.tsx
touch src/components/HomePage/utils/gameStateHelpers.ts
touch src/components/HomePage/utils/modalHelpers.ts
```

**Step 1.3**: Run tests to establish baseline
```bash
npm test -- --testPathPattern=HomePage
```

### Phase 2: Extract useGameOrchestration Hook (45 min)

**Step 2.1**: Copy ALL hooks from HomePage.tsx to useGameOrchestration.ts
```typescript
// src/components/HomePage/hooks/useGameOrchestration.ts
export function useGameOrchestration() {
  // Copy these from HomePage.tsx:
  // - useQuery hooks for roster, games, seasons, tournaments
  // - useReducer for game session state
  // - useGameState for field state
  // - useGameTimer for timer
  // - useAutoSave
  // - useUndoRedo
  // - Modal state (initially keep useState, will refactor in P2)

  // Return everything needed by child components
  return {
    // ... all state and actions
  };
}
```

**Step 2.2**: Update HomePage.tsx to use the hook
```typescript
// src/components/HomePage.tsx (temporary, will be moved to index.tsx)
function HomePage() {
  const orchestration = useGameOrchestration();

  // Keep all existing JSX for now
  return (/* existing JSX */);
}
```

**Step 2.3**: Test - Verify no regressions
```bash
npm test
```

### Phase 3: Extract ModalManager (30 min)

**Step 3.1**: Move ALL modal JSX to ModalManager.tsx
```typescript
// src/components/HomePage/containers/ModalManager.tsx
export function ModalManager({ orchestration }) {
  // Cut all modal JSX from HomePage
  return (
    <>
      <GameStatsModal ... />
      <LoadGameModal ... />
      {/* ... all 18 modals */}
    </>
  );
}
```

**Step 3.2**: Update HomePage to use ModalManager
```typescript
// src/components/HomePage.tsx
import { ModalManager } from './containers/ModalManager';

function HomePage() {
  const orchestration = useGameOrchestration();

  return (
    <>
      {/* existing game UI JSX */}
      <ModalManager orchestration={orchestration} />
    </>
  );
}
```

**Step 3.3**: Test modal functionality
```bash
npm test -- --testPathPattern="Modal"
```

### Phase 4: Extract GameContainer (30 min)

**Step 4.1**: Move main game UI to GameContainer.tsx
```typescript
// src/components/HomePage/containers/GameContainer.tsx
export function GameContainer({ orchestration }) {
  // Cut main game layout JSX from HomePage
  return (
    <div className="game-layout">
      <SoccerField ... />
      <PlayerBar ... />
      <ControlBar ... />
      {/* etc */}
    </div>
  );
}
```

**Step 4.2**: Update HomePage to use GameContainer
```typescript
// src/components/HomePage.tsx
import { GameContainer } from './containers/GameContainer';
import { ModalManager } from './containers/ModalManager';

function HomePage() {
  const orchestration = useGameOrchestration();

  return (
    <>
      <GameContainer orchestration={orchestration} />
      <ModalManager orchestration={orchestration} />
    </>
  );
}
```

### Phase 5: Extract Sub-Components (30 min)

**Step 5.1**: Extract GameControlBar from GameContainer
```typescript
// src/components/HomePage/components/GameControlBar.tsx
export function GameControlBar({ timer, actions }) {
  return (
    <div className="control-bar">
      <ControlBar {...timer} onAction={actions.timerAction} />
      {/* Add other controls */}
    </div>
  );
}
```

**Step 5.2**: Extract FieldContainer from GameContainer
```typescript
// src/components/HomePage/containers/FieldContainer.tsx
export function FieldContainer({ fieldState, players, actions }) {
  return (
    <div className="field-area">
      <PlayerBar players={players} onDrag={actions.playerDrag} />
      <SoccerField {...fieldState} />
    </div>
  );
}
```

**Step 5.3**: Extract ExportActions from GameContainer
```typescript
// src/components/HomePage/components/ExportActions.tsx
export function ExportActions({ gameState }) {
  return (
    <div className="export-actions">
      <button onClick={() => exportJson(gameState)}>Export JSON</button>
      <button onClick={() => exportCsv(gameState)}>Export CSV</button>
    </div>
  );
}
```

### Phase 6: Create New HomePage Index (15 min)

**Step 6.1**: Move HomePage.tsx to HomePage/index.tsx
```bash
mv src/components/HomePage.tsx src/components/HomePage/HomePage.legacy.tsx
```

**Step 6.2**: Create new minimal index.tsx
```typescript
// src/components/HomePage/index.tsx
import { useGameOrchestration } from './hooks/useGameOrchestration';
import { GameContainer } from './containers/GameContainer';
import { ModalManager } from './containers/ModalManager';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function HomePage() {
  const orchestration = useGameOrchestration();

  return (
    <ErrorBoundary>
      <GameContainer orchestration={orchestration} />
      <ModalManager orchestration={orchestration} />
    </ErrorBoundary>
  );
}
```

**Step 6.3**: Delete HomePage.legacy.tsx
```bash
rm src/components/HomePage/HomePage.legacy.tsx
```

### Phase 7: Final Testing & Cleanup (15 min)

**Step 7.1**: Run full test suite
```bash
npm test
```

**Step 7.2**: Run manual smoke tests
- Start new game
- Add goals/substitutions
- Open/close all modals
- Save/load game
- Undo/redo actions
- Export data

**Step 7.3**: Check bundle size
```bash
npm run build
```

**Step 7.4**: Verify no performance regressions
- Use React DevTools Profiler
- Check re-render times
- Test on mobile device

---

## ✅ ACCEPTANCE CRITERIA

- [ ] No single file exceeds 600 lines
- [ ] HomePage/index.tsx is ≤150 lines (orchestrator only)
- [ ] All 991 existing tests still pass
- [ ] New tests added for extracted components
- [ ] No functionality regression (manual testing)
- [ ] Bundle size unchanged or smaller
- [ ] React DevTools Profiler shows ≤50ms re-render times
- [ ] Code review approved by team

---

## 🧪 TESTING STRATEGY

### Unit Tests

**Create tests for each new component:**

```typescript
// src/components/HomePage/containers/__tests__/GameContainer.test.tsx
describe('GameContainer', () => {
  it('renders field and player bar', () => {
    const orchestration = mockOrchestration();
    render(<GameContainer orchestration={orchestration} />);
    expect(screen.getByTestId('soccer-field')).toBeInTheDocument();
    expect(screen.getByTestId('player-bar')).toBeInTheDocument();
  });

  it('passes timer props to ControlBar', () => {
    const orchestration = mockOrchestration({ timer: { elapsed: 300 } });
    render(<GameContainer orchestration={orchestration} />);
    expect(screen.getByText(/05:00/)).toBeInTheDocument();
  });
});
```

### Integration Tests

**Update existing integration tests:**

```typescript
// tests/integration/core-workflows-simple.test.tsx
// These should still pass without modification
// But add new tests for component integration
```

### Manual Testing Checklist

- [ ] Start new game
- [ ] Score goals for both teams
- [ ] Make substitutions
- [ ] End period / end game
- [ ] Save game
- [ ] Load saved game
- [ ] Use undo/redo
- [ ] Export JSON/CSV
- [ ] Open/close all 18 modals
- [ ] Tactics board mode
- [ ] Field drawing
- [ ] Player assessments
- [ ] Keyboard shortcuts

---

## 🔄 ROLLBACK PLAN

If issues are discovered after deployment:

**Step 1**: Git revert the refactor commit
```bash
git revert <refactor-commit-hash>
```

**Step 2**: Deploy revert immediately
```bash
npm run build
# Deploy to production
```

**Step 3**: Create hotfix branch to address issues
```bash
git checkout -b hotfix/homepage-refactor-issues
```

**Step 4**: Fix issues, test thoroughly, re-deploy

---

## 📈 SUCCESS METRICS

Track these before and after refactoring:

| Metric | Before | Target After | Measurement |
|--------|--------|--------------|-------------|
| Largest file size | 3,602 lines | ≤600 lines | `wc -l HomePage/**/*.{ts,tsx}` |
| Test coverage | ~85% | ≥85% | `npm run test:coverage` |
| Test execution time | ~28s | ≤30s | `npm test` |
| HomePage component re-render | ~150ms | ≤50ms | React DevTools Profiler |
| Bundle size | Baseline | ≤Baseline | `npm run build` |
| Time to add new feature | Baseline | 50% of baseline | Developer survey |

---

## 🚧 POTENTIAL ISSUES & SOLUTIONS

### Issue 1: Prop Drilling

**Problem**: Passing orchestration object through many layers

**Solution**: Use React Context for orchestration if prop drilling becomes excessive

```typescript
// src/components/HomePage/contexts/GameOrchestrationContext.tsx
const GameOrchestrationContext = createContext(null);

export function GameOrchestrationProvider({ children }) {
  const orchestration = useGameOrchestration();
  return (
    <GameOrchestrationContext.Provider value={orchestration}>
      {children}
    </GameOrchestrationContext.Provider>
  );
}

export function useGameOrchestrationContext() {
  return useContext(GameOrchestrationContext);
}
```

### Issue 2: Performance Regression

**Problem**: Additional component layers cause performance issues

**Solution**: Use React.memo strategically

```typescript
// src/components/HomePage/containers/GameContainer.tsx
export const GameContainer = React.memo(function GameContainer({ orchestration }) {
  // ... component code
}, (prevProps, nextProps) => {
  // Custom comparison function
  return isEqual(prevProps.orchestration, nextProps.orchestration);
});
```

### Issue 3: Test Failures

**Problem**: Existing tests fail after refactoring

**Solution**: Update test imports and mocks

```typescript
// Update all test files that import HomePage
- import HomePage from '@/components/HomePage';
+ import HomePage from '@/components/HomePage/index';
```

---

## 📚 RELATED DOCUMENTS

- [Critical Fixes Overview](../../CRITICAL_FIXES_REQUIRED.md)
- [P1: GameSettingsModal Refactoring](./P1-GameSettingsModal-Refactoring-Plan.md)
- [P2: Modal State Management](./P2-Modal-State-Management-Fix.md)
- [Code Review Document](../../reviews/code-review-2025-10-16.md)

---

## ✍️ NOTES

**Why This Refactoring is Critical**:

The HomePage component has grown organically as features were added. Each feature seemed small enough to add to the existing file. However, the cumulative effect is a component that violates every principle of good software design.

This refactoring is not "nice to have" - it's **critical infrastructure work**. Without it, every future feature will take 3-5x longer to implement and will introduce bugs that are nearly impossible to debug.

**Developer Experience Impact**:

Before refactoring:
- New developer: "Where do I add this feature?" → 2 hours searching through 3,600 lines
- Debugging: "Why is this modal not opening?" → 1 hour tracing state through 50 variables

After refactoring:
- New developer: "Where do I add this feature?" → 10 minutes finding the right component
- Debugging: "Why is this modal not opening?" → 5 minutes checking ModalManager

**The ROI is undeniable. This must be done before the next sprint.**

---

**Document Version**: 1.0
**Last Updated**: October 16, 2025
**Author**: Code Review AI Agent
**Status**: Ready for Implementation
