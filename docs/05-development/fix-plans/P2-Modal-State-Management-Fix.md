# P2: Modal State Management Fix (MEDIUM)

**Priority**: P2 - MEDIUM
**File**: `/src/contexts/ModalProvider.tsx`
**Current Issue**: 10 independent useState calls causing potential race conditions
**Target**: Single useReducer with centralized state
**Estimated Effort**: 30 minutes
**Impact**: MEDIUM - Prevents race conditions, improves maintainability
**Status**: ⏸ Deferred to Layer 2 (micro-steps)

Note: The modal reducer and centralization will be done incrementally per `docs/03-active-plans/MICRO-REFactor-ROADMAP.md` Layer 2. We will migrate one modal at a time after Layer 1 stabilization.
**Dependency**: Should be done after P1 (GameSettingsModal refactoring)

---

## 🎯 OBJECTIVE

Replace 10 independent modal state variables with a single `useReducer` managing all modal state centrally.

---

## 📊 PROBLEM STATEMENT

### Current Implementation

```typescript
// src/contexts/ModalProvider.tsx - CURRENT (PROBLEMATIC)
export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [isGameStatsModalOpen, setIsGameStatsModalOpen] = useState(false);
  const [isLoadGameModalOpen, setIsLoadGameModalOpen] = useState(false);
  const [isNewGameModalOpen, setIsNewGameModalOpen] = useState(false);
  const [isRosterSettingsModalOpen, setIsRosterSettingsModalOpen] = useState(false);
  const [isGameSettingsModalOpen, setIsGameSettingsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSeasonTournamentModalOpen, setIsSeasonTournamentModalOpen] = useState(false);
  const [isTeamManagerModalOpen, setIsTeamManagerModalOpen] = useState(false);
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);
  const [isTrainingResourcesModalOpen, setIsTrainingResourcesModalOpen] = useState(false);

  const value = {
    isGameStatsModalOpen, setIsGameStatsModalOpen,
    isLoadGameModalOpen, setIsLoadGameModalOpen,
    // ... 8 more pairs
  };

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}
```

### Problems

1. **Race Conditions**: Rapid clicks can open multiple modals
   ```typescript
   // User clicks rapidly:
   setIsGameStatsModalOpen(true);  // Frame 1
   setIsLoadGameModalOpen(true);   // Frame 1 - Both open! 🐛
   ```

2. **No Single Source of Truth**: State scattered across 10 variables

3. **Difficult to Enforce Rules**: Can't easily enforce "only one modal at a time"

4. **Hard to Debug**: Which modal is open? Must check 10 variables

---

## 🏗️ PROPOSED SOLUTION

### Modal State Reducer

```typescript
// src/contexts/ModalProvider.tsx - NEW (IMPROVED)

// 1. Define modal types
type ModalType =
  | 'gameStats'
  | 'loadGame'
  | 'newGame'
  | 'rosterSettings'
  | 'gameSettings'
  | 'settings'
  | 'seasonTournament'
  | 'teamManager'
  | 'instructions'
  | 'trainingResources'
  | null; // null = no modal open

// 2. Define state shape
interface ModalState {
  currentModal: ModalType;
  previousModal: ModalType; // For back navigation
  modalData?: unknown; // Optional data to pass to modal
}

// 3. Define actions
type ModalAction =
  | { type: 'OPEN_MODAL'; payload: { modal: ModalType; data?: unknown } }
  | { type: 'CLOSE_MODAL' }
  | { type: 'CLOSE_ALL_MODALS' }
  | { type: 'GO_BACK' }; // Return to previous modal

// 4. Create reducer
function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_MODAL':
      return {
        ...state,
        previousModal: state.currentModal,
        currentModal: action.payload.modal,
        modalData: action.payload.data
      };

    case 'CLOSE_MODAL':
      return {
        ...state,
        currentModal: null,
        modalData: undefined
      };

    case 'CLOSE_ALL_MODALS':
      return {
        currentModal: null,
        previousModal: null,
        modalData: undefined
      };

    case 'GO_BACK':
      return {
        ...state,
        currentModal: state.previousModal,
        previousModal: null,
        modalData: undefined
      };

    default:
      return state;
  }
}

// 5. Create provider with useReducer
export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(modalReducer, {
    currentModal: null,
    previousModal: null,
    modalData: undefined
  });

  // Create helper functions
  const openModal = useCallback((modal: ModalType, data?: unknown) => {
    dispatch({ type: 'OPEN_MODAL', payload: { modal, data } });
  }, []);

  const closeModal = useCallback(() => {
    dispatch({ type: 'CLOSE_MODAL' });
  }, []);

  const closeAllModals = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_MODALS' });
  }, []);

  const goBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, []);

  // Helper function to check if specific modal is open
  const isModalOpen = useCallback((modal: ModalType) => {
    return state.currentModal === modal;
  }, [state.currentModal]);

  const value = {
    currentModal: state.currentModal,
    modalData: state.modalData,
    openModal,
    closeModal,
    closeAllModals,
    goBack,
    isModalOpen
  };

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}
```

---

## 📝 STEP-BY-STEP IMPLEMENTATION

### Step 1: Update ModalProvider.tsx (20 min)

1. Replace useState calls with useReducer
2. Create modalReducer function
3. Create helper functions (openModal, closeModal, etc.)
4. Update context value

### Step 2: Update Components Using Modal Context (10 min)

**Before:**
```typescript
const { isGameStatsModalOpen, setIsGameStatsModalOpen } = useModalContext();

<button onClick={() => setIsGameStatsModalOpen(true)}>
  Open Stats
</button>

<GameStatsModal
  isOpen={isGameStatsModalOpen}
  onClose={() => setIsGameStatsModalOpen(false)}
/>
```

**After:**
```typescript
const { isModalOpen, openModal, closeModal } = useModalContext();

<button onClick={() => openModal('gameStats')}>
  Open Stats
</button>

<GameStatsModal
  isOpen={isModalOpen('gameStats')}
  onClose={closeModal}
/>
```

### Step 3: Add Tests (Optional but recommended)

```typescript
// src/contexts/__tests__/ModalProvider.test.tsx
describe('ModalProvider', () => {
  it('opens modal when openModal called', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ModalProvider
    });

    act(() => {
      result.current.openModal('gameStats');
    });

    expect(result.current.isModalOpen('gameStats')).toBe(true);
  });

  it('closes current modal when closeModal called', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ModalProvider
    });

    act(() => {
      result.current.openModal('gameStats');
    });

    act(() => {
      result.current.closeModal();
    });

    expect(result.current.currentModal).toBeNull();
  });

  it('prevents multiple modals from opening', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ModalProvider
    });

    act(() => {
      result.current.openModal('gameStats');
      result.current.openModal('loadGame'); // Should replace, not add
    });

    expect(result.current.isModalOpen('loadGame')).toBe(true);
    expect(result.current.isModalOpen('gameStats')).toBe(false);
  });
});
```

---

## ✅ ACCEPTANCE CRITERIA

- [ ] Single useReducer manages all modal state
- [ ] No race conditions (only one modal can be open)
- [ ] All modals still open/close correctly
- [ ] Type-safe modal actions
- [ ] Tests added for modal state transitions
- [ ] No functionality regression

---

## 🎁 BONUS FEATURES (Optional)

### Modal History Navigation

```typescript
// Allow navigating back to previous modal
const { goBack, previousModal } = useModalContext();

{previousModal && (
  <button onClick={goBack}>
    ← Back to {previousModal}
  </button>
)}
```

### Modal Data Passing

```typescript
// Pass data when opening modal
openModal('gameStats', { gameId: '123', highlightGoals: true });

// Access in modal
function GameStatsModal() {
  const { modalData } = useModalContext();
  const { gameId, highlightGoals } = modalData as { gameId: string; highlightGoals: boolean };
}
```

---

## 📚 RELATED DOCUMENTS

- [P0: HomePage Refactoring](./P0-HomePage-Refactoring-Plan.md)
- [Critical Fixes Overview](../../CRITICAL_FIXES_REQUIRED.md)

---

**Last Updated**: October 16, 2025
