# HomePage Architecture Guide

**Last Updated**: November 7, 2025
**Status**: Layer 1 Complete (View-Model Extraction)
**Next**: Layer 2 (Bootstrap & Autosave Consolidation)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture Pattern](#architecture-pattern)
- [Core Hooks](#core-hooks)
- [Container Components](#container-components)
- [Adding New Features](#adding-new-features)
- [Testing Patterns](#testing-patterns)
- [Common Pitfalls](#common-pitfalls)

---

## Overview

HomePage has been refactored from a 3,725-line monolithic component into a **view-model coordinator** that assembles data from specialized hooks and delegates rendering to container components.

### Current State (Layer 1)
```
HomePage (Coordinator)
  ├── useGameOrchestration (orchestration)
  ├── useHomeModalControls (modal state)
  ├── useNewGameFlow (new game logic)
  ├── useSavedGameManager (persistence)
  └── Containers (presentation)
      ├── GameContainer
      ├── ModalManager
      └── FieldContainer
```

### Design Principles

1. **Separation of Concerns**: Data/logic vs presentation
2. **Single Responsibility**: Each hook has one purpose
3. **Intent Callbacks**: Containers trigger intents, not direct state mutation
4. **View-Model Pattern**: HomePage assembles typed view-models for containers

---

## Architecture Pattern

### View-Model Coordinator Pattern

**HomePage's Role**:
- Assembles view-models from hooks
- Passes explicit, typed props to containers
- Does NOT render UI directly (delegates to containers)

**Example**:
```typescript
// HomePage.tsx (Coordinator)
const modalControls = useHomeModalControls({ ... });
const newGameFlow = useNewGameFlow({ ... });
const savedGameManager = useSavedGameManager({ ... });

const playerBarProps = {
  players: availablePlayers,
  onDragStart: handlePlayerDragStart,
  selectedIds: gameSessionState.selectedPlayerIds,
  // ... explicit props
};

return (
  <>
    <GameContainer
      playerBarProps={playerBarProps}
      gameInfoBarProps={gameInfoBarProps}
      fieldProps={fieldProps}
      controlBarProps={controlBarProps}
    />
    <ModalManager {...modalViewModel} />
  </>
);
```

### Why This Pattern?

**Before (Monolithic)**:
```typescript
// HomePage.tsx (3,725 lines)
const HomePage = () => {
  // 18+ modal states
  const [isLoadGameModalOpen, setIsLoadGameModalOpen] = useState(false);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  // ... 16 more

  // Hundreds of lines of logic mixed with JSX

  return (
    <div>
      {/* 2000+ lines of JSX */}
      <SoccerField {...everythingFromHomePage} />
      <PlayerBar {...everythingFromHomePage} />
      {/* ... */}
    </div>
  );
};
```

**After (View-Model)**:
```typescript
// HomePage.tsx (~1,900 lines after Layer 1)
const HomePage = () => {
  // Assemble view-models from hooks
  const modalControls = useHomeModalControls({ ... });
  const playerBarProps = { ... };

  // Delegate rendering
  return (
    <>
      <GameContainer {...viewModel} />
      <ModalManager {...modalViewModel} />
    </>
  );
};
```

**Benefits**:
- ✅ HomePage is readable (coordinator only)
- ✅ Containers are testable in isolation
- ✅ Changes don't cascade through 3,725 lines
- ✅ Clear data flow

---

## Core Hooks

### 1. useHomeModalControls

**Purpose**: Centralizes modal open/close state

**Responsibilities**:
- Manages all modal visibility state
- Provides stable callbacks (useCallback)
- Single source of truth for modal state

**Usage**:
```typescript
const modalControls = useHomeModalControls({
  setIsLoadGameModalOpen,
  setIsNewGameSetupModalOpen,
  setIsRosterModalOpen,
  // ... other modal setters from ModalProvider
});

// In component
<Button onClick={modalControls.openLoadGameModal}>Load Game</Button>
```

**Why Not Direct State?**
```typescript
// ❌ Bad: Scattered state mutation
<Button onClick={() => setIsLoadGameModalOpen(true)}>Load</Button>

// ✅ Good: Centralized via hook
<Button onClick={modalControls.openLoadGameModal}>Load</Button>
```

**Note**: This hook currently wraps individual useState setters. Layer 2 (P2 fix) will migrate to useReducer for true single source of truth.

---

### 2. useNewGameFlow

**Purpose**: Owns new game creation flow logic

**Responsibilities**:
- "No players selected" warning
- "Save before new game" confirmation
- Start new game flow
- **Critical**: Awaits save before opening setup modal

**Usage**:
```typescript
const newGameFlow = useNewGameFlow({
  availablePlayers,
  savedGames,
  currentGameId,
  // ... 31 parameters (see improvement note below)
});

// Trigger new game flow
newGameFlow.handleNewGame();
```

**State Machine**:
```
User clicks "New Game"
  ↓
No players? → Show warning → Done
  ↓
Unsaved changes? → Confirm save → Save → Open setup
  ↓
Open setup modal
```

**Critical Fix**: Autosave hardening
```typescript
// Before: Race condition (could skip save)
handleSaveBeforeNewConfirmed() {
  quickSaveNonBlocking();  // Don't wait
  setIsNewGameSetupModalOpen(true);  // Open immediately
}

// After: Awaits save
async handleSaveBeforeNewConfirmed() {
  await quickSaveNonBlocking();  // Wait for save
  setIsNewGameSetupModalOpen(true);  // Then open
}
```

**Known Issue**: 31 parameters (tight coupling). See [Common Pitfalls](#common-pitfalls) for improvement plan.

---

### 3. useSavedGameManager

**Purpose**: Wraps game persistence operations

**Responsibilities**:
- Load game
- Delete game
- Reassign game
- Orphan game detection
- `loadGameStateFromData` helper

**Usage**:
```typescript
const savedGameManager = useSavedGameManager({
  savedGames,
  setSavedGames,
  dispatch,
  // ... other deps
});

// Load game
await savedGameManager.handleLoadGame(gameId);

// Delete game
await savedGameManager.handleDeleteGame(gameId);
```

**Why Extract?**
- HomePage no longer holds persistence plumbing
- Easier to test (mock one hook vs 500 lines)
- Single place to update load/delete logic

---

### 4. useGameOrchestration

**Purpose**: Core game session orchestration

**Status**: Created in previous work, continues to be used

**Responsibilities**:
- Game session reducer
- Undo/redo
- Timer management
- Autosave
- React Query mutations

**Note**: Not modified in Layer 1. Layer 2 will extract bootstrap and autosave logic.

---

## Container Components

### 1. GameContainer

**Purpose**: Renders main game UI (field, player bar, info bar, controls)

**Props Structure**:
```typescript
interface GameContainerProps {
  playerBarProps: PlayerBarProps;
  gameInfoBarProps: GameInfoBarProps;
  fieldProps: FieldProps;
  controlBarProps: ControlBarProps;
}
```

**Why Explicit Props?**
- Clear what data the container needs
- Easy to mock in tests
- TypeScript ensures completeness

**Known Issue**: `fieldProps` still has 77 props (see [Common Pitfalls](#common-pitfalls))

---

### 2. FieldContainer

**Purpose**: Encapsulates soccer field, timer overlay, first-game guide, orphan banner

**Pattern**: Intent callbacks
```typescript
interface FieldContainerProps {
  // ... field state
  onOpenNewGameSetup: () => void;  // Intent, not state mutation
  onOpenRosterModal: () => void;
  // ...
}

// In FieldContainer
<Button onClick={onOpenNewGameSetup}>Setup New Game</Button>
// NOT: <Button onClick={() => setIsNewGameSetupModalOpen(true)}>
```

**Why Intent Callbacks?**
- Keeps FieldContainer purely presentational
- HomePage decides how to handle intents
- Easier to test (mock callbacks)

---

### 3. ModalManager

**Purpose**: Renders all modals

**Props**: Tailored view-model (not entire useGameOrchestration return)

**Example**:
```typescript
<ModalManager
  isLoadGameModalOpen={isLoadGameModalOpen}
  isNewGameSetupModalOpen={isNewGameSetupModalOpen}
  onCloseLoadGameModal={modalControls.closeLoadGameModal}
  onStartNewGame={newGameFlow.handleStartNewGame}
  // ... specific props matching modal signatures
/>
```

**Why?**
- Props match `NewGameSetupModal` signature
- Prevents runtime mismatches
- Clear which handlers mutate modal state

---

## Adding New Features

### Adding a New Modal

**1. Add State to ModalProvider**
```typescript
// src/contexts/ModalProvider.tsx
const [isMyModalOpen, setIsMyModalOpen] = useState(false);

return (
  <ModalContext.Provider value={{
    // ... existing
    isMyModalOpen,
    setIsMyModalOpen,
  }}>
```

**2. Add Open/Close to useHomeModalControls**
```typescript
// src/components/HomePage/hooks/useHomeModalControls.ts
export function useHomeModalControls({
  setIsMyModalOpen,
  // ... other setters
}: UseHomeModalControlsOptions) {
  const openMyModal = useCallback(
    () => setIsMyModalOpen(true),
    [setIsMyModalOpen]
  );

  const closeMyModal = useCallback(
    () => setIsMyModalOpen(false),
    [setIsMyModalOpen]
  );

  return {
    // ... existing
    openMyModal,
    closeMyModal,
  };
}
```

**3. Pass to ModalManager**
```typescript
// HomePage.tsx
<ModalManager
  isMyModalOpen={isMyModalOpen}
  onOpenMyModal={modalControls.openMyModal}
  onCloseMyModal={modalControls.closeMyModal}
  // ...
/>
```

**4. Use in Component**
```typescript
// Any component
const { openMyModal } = useHomeModalControls();
<Button onClick={openMyModal}>Open My Modal</Button>
```

---

### Adding New Game Flow Step

**Example**: Add "confirm player count" before new game

**1. Add State to useNewGameFlow**
```typescript
const [showPlayerCountConfirm, setShowPlayerCountConfirm] = useState(false);
```

**2. Update handleNewGame**
```typescript
const handleNewGame = useCallback(() => {
  if (availablePlayers.length < 11) {
    setShowPlayerCountConfirm(true);
    return;
  }
  // ... rest of flow
}, [availablePlayers]);
```

**3. Add Confirmation Dialog**
```typescript
return {
  handleNewGame,
  showPlayerCountConfirm,
  confirmPlayerCount: () => {
    setShowPlayerCountConfirm(false);
    // Continue flow...
  },
};
```

---

### Adding New Field Interaction

**Example**: Add "zoom" button to field

**1. Add Handler to HomePage**
```typescript
const handleFieldZoom = useCallback((zoomLevel: number) => {
  // Zoom logic
}, []);
```

**2. Add to fieldProps**
```typescript
const fieldProps = {
  // ... existing
  onZoom: handleFieldZoom,
};
```

**3. Update FieldContainer**
```typescript
interface FieldContainerProps {
  // ... existing
  onZoom?: (zoomLevel: number) => void;
}

// In component
<Button onClick={() => onZoom?.(1.5)}>Zoom In</Button>
```

---

## Testing Patterns

### Testing Hooks

**Pattern**: Dependency injection with mocks

**Example** (from `newGameHandlers.test.ts`):
```typescript
describe('useNewGameFlow', () => {
  it('should handle new game with no players', () => {
    const mockSetWarning = jest.fn();
    const mockSetIsNewGameSetupModalOpen = jest.fn();

    const { handleNewGame } = useNewGameFlow({
      availablePlayers: [],
      setPlayerIdsForNewGame: jest.fn(),
      setIsNewGameSetupModalOpen: mockSetIsNewGameSetupModalOpen,
      // ... other mocks
    });

    handleNewGame();

    expect(mockSetWarning).toHaveBeenCalledWith(
      expect.stringContaining('No players')
    );
    expect(mockSetIsNewGameSetupModalOpen).not.toHaveBeenCalled();
  });
});
```

**Why This Works**:
- No real state needed
- Fast (no rendering)
- Clear assertions

---

### Testing Containers

**Pattern**: Mock props, verify rendering

**Example**:
```typescript
describe('FieldContainer', () => {
  it('should trigger onOpenNewGameSetup when guide clicked', () => {
    const mockOpenNewGameSetup = jest.fn();

    render(
      <FieldContainer
        showFirstGameGuide={true}
        onOpenNewGameSetup={mockOpenNewGameSetup}
        // ... minimal props
      />
    );

    fireEvent.click(screen.getByText('Setup New Game'));

    expect(mockOpenNewGameSetup).toHaveBeenCalledTimes(1);
  });
});
```

---

## Common Pitfalls

### 1. Hook Parameter Explosion (useNewGameFlow: 31 params)

**Current Issue**:
```typescript
export function useNewGameFlow({
  availablePlayers,
  savedGames,
  setSavedGames,
  currentGameId,
  setIsNewGameSetupModalOpen,
  // ... 26 more parameters
}: UseNewGameFlowOptions) {
```

**Why This Happened**: Rapid extraction without grouping

**Planned Fix (Layer 2)**:
```typescript
interface GameFlowContext {
  gameState: {
    currentGameId: string;
    savedGames: AppState[];
    availablePlayers: Player[];
  };
  actions: {
    setSavedGames: (games: AppState[]) => void;
    setCurrentGameId: (id: string) => void;
  };
  config: {
    defaultSubIntervalMinutes: number;
    defaultPeriodDurationMinutes: number;
  };
}

export function useNewGameFlow(context: GameFlowContext) {
  // 1 parameter vs 31
}
```

**Benefits**:
- Easier to refactor (change one object vs 31 call sites)
- Better encapsulation
- Simpler testing (mock one object vs 31 params)

**When to Fix**: Layer 2 (not blocking Layer 1)

---

### 2. FieldContainer Props Explosion (77 props)

**Current Issue**:
```typescript
export interface FieldContainerProps {
  gameSessionState: GameSessionState;
  playersOnField: AppState['playersOnField'];
  // ... 75 more props with || (() => {}) fallbacks
}
```

**Why This Happened**: Direct extraction without logical grouping

**Planned Fix (Layer 2)**:
```typescript
interface FieldContainerProps {
  gameState: GameStateViewModel;
  fieldInteractions: FieldInteractionHandlers;
  modalTriggers: ModalTriggerCallbacks;
  guideState: FirstGameGuideState;
}

// Where:
interface FieldInteractionHandlers {
  onPlayerDrop: (playerId: string, position: Position) => void;
  onDrawingComplete: (drawing: Drawing) => void;
  onTacticalDiscPlace: (disc: TacticalDisc) => void;
}
```

**Benefits**:
- Easier to understand dependencies
- Simpler to add new interactions (add to one object)
- Better for React DevTools inspection

**When to Fix**: Layer 2

---

### 3. Modal State Still Scattered

**Current State**: useHomeModalControls wraps individual useState setters

```typescript
const openLoadGameModal = useCallback(
  () => setIsLoadGameModalOpen(true),
  [setIsLoadGameModalOpen]
);
```

**Why This Is OK for Layer 1**:
- Centralized access point (single source)
- Stable callbacks
- Clear intent

**Planned Fix (P2 - Modal State Management)**:
```typescript
// ModalProvider will use useReducer
const [modalState, dispatchModal] = useReducer(modalReducer, initialState);

// Actions
const openLoadGameModal = () => dispatchModal({ type: 'OPEN_LOAD_GAME' });

// Single source of truth
// Prevents race conditions when multiple modals interact
// Easier debugging (action log)
```

**Why Not Now?**:
- P2 fix explicitly addresses this
- Would require updating all modal consumers
- Layer 1 focus was view-model extraction

**When to Fix**: P2 (after P0 Layer 2 complete)

---

### 4. Avoid Prop Drilling

**Anti-Pattern**:
```typescript
// ❌ Bad: Passing setters through 3 levels
<GameContainer
  setIsLoadGameModalOpen={setIsLoadGameModalOpen}
>
  <PlayerBar
    setIsLoadGameModalOpen={setIsLoadGameModalOpen}
  >
    <PlayerCard
      setIsLoadGameModalOpen={setIsLoadGameModalOpen}
    />
  </PlayerBar>
</GameContainer>
```

**Solution**: Use intent callbacks
```typescript
// ✅ Good: Intent callbacks at container level
<GameContainer
  onOpenLoadGameModal={modalControls.openLoadGameModal}
>
  <PlayerBar
    onLoadGameRequested={onOpenLoadGameModal}
  >
    <PlayerCard
      onLoadGameRequested={onLoadGameRequested}
    />
  </PlayerBar>
</GameContainer>
```

---

### 5. Avoid Business Logic in Containers

**Anti-Pattern**:
```typescript
// ❌ Bad: Business logic in FieldContainer
const FieldContainer = ({ players }) => {
  const eligiblePlayers = players.filter(p => p.age >= 18);
  const sortedPlayers = eligiblePlayers.sort((a, b) => ...);
  // ...
};
```

**Solution**: Pass computed data from HomePage
```typescript
// ✅ Good: HomePage computes, container renders
// HomePage.tsx
const eligiblePlayers = useMemo(
  () => players.filter(p => p.age >= 18),
  [players]
);

<FieldContainer players={eligiblePlayers} />
```

---

## Next Steps (Layer 2+)

### Layer 2: Bootstrap & Autosave
- Extract bootstrap effects
- Consolidate autosave logic
- Group hook parameters (fix 31-param issue)
- Group field props (fix 77-prop issue)

### Layer 3: Final Cleanup
- Remove remaining HomePage business logic
- Final size reduction (target: <600 lines)
- Performance optimizations (React.memo, useMemo)

### P2: Modal State Management
- Migrate to useReducer
- True single source of truth
- Action logging/debugging

---

## FAQ

### Q: Why not extract everything at once?
**A**: Incremental refactoring reduces risk. Layer 1 focused on view-model extraction. Layer 2 will address parameter grouping and autosave. Trying to do everything at once = high risk of breaking changes.

### Q: When should I update this guide?
**A**: After each layer completion. Add new patterns, update "Next Steps", document learnings.

### Q: How do I know if I'm following the pattern correctly?
**A**: Check these rules:
- HomePage assembles view-models, doesn't render UI
- Containers are presentational (no business logic)
- Hooks have single responsibility
- Props are explicit and typed
- Intent callbacks, not direct state mutation

### Q: What if I need to add a complex feature?
**A**: Create a new hook (like useNewGameFlow) that encapsulates the complexity. HomePage should remain simple coordinator.

---

**Document Owner**: Development Team
**Next Review**: After Layer 2 completion
**Questions?**: See [CLAUDE.md](../../CLAUDE.md) for AI assistance guidelines
