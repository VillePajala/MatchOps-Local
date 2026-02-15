# 06. State & Hooks — React Query, useReducer, Custom Hook Patterns

> **Audience**: AI agent building the new app
> **Purpose**: How to wire data fetching, caching, mutations, synchronous state, undo/redo, and auto-save

---

## State Strategy Overview

```
┌──────────────────────────────────────────────────────┐
│                   REACT QUERY                        │
│  Async data: exercises, players, sessions, settings  │
│  Loading states, caching, retries, invalidation      │
└─────────────────────────┬────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────┐
│                   useReducer                         │
│  Synchronous session state: blocks, timing, order    │
│  Atomic multi-field updates, undo/redo snapshots     │
└─────────────────────────┬────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────┐
│                   useState                           │
│  Local UI state: modal visibility, form inputs,      │
│  selection state, tab state                          │
└──────────────────────────────────────────────────────┘
```

**Key insight**: React Query handles everything that touches the DataStore (async, cached). `useReducer` handles complex synchronous state with multiple related fields. `useState` handles simple per-component UI state.

---

## 1. React Query Setup

### QueryProvider

```typescript
// src/app/QueryProvider.tsx

'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBackendMode } from '@/config/backendConfig';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function createQueryClient(): QueryClient {
  let mode: 'local' | 'cloud' = 'local';
  try {
    mode = getBackendMode();
  } catch {
    // Default to local if detection fails
  }

  if (mode === 'cloud') {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: FIVE_MINUTES_MS,        // Data fresh for 5 min
          gcTime: THIRTY_MINUTES_MS,          // Keep unused data 30 min
          retry: 3,
          retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
          refetchOnWindowFocus: true,
          refetchOnMount: false,
          refetchOnReconnect: true,
        },
      },
    });
  }

  // Local mode: retry: 3 is CRITICAL for IndexedDB transient failures on mobile
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 3,
      },
    },
  });
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

**Key traps**:
- `retry: 3` is non-negotiable for local mode. IndexedDB on mobile Chrome has transient read/write failures. Reducing retries causes data loading failures on real devices.
- Use `useState(() => createQueryClient())` — not `useMemo` — to create the client once. The initializer function runs only on first render.
- Cloud mode uses `refetchOnMount: false` so cached data is shown immediately. Network happens in background.

### Query Keys

```typescript
// src/config/queryKeys.ts

export const QUERY_KEYS = {
  exercises: ['exercises'] as const,
  exercise: (id: string) => ['exercises', id] as const,
  practiceSessions: ['practiceSessions'] as const,
  practiceSession: (id: string) => ['practiceSessions', id] as const,
  templates: ['templates'] as const,
  players: ['players'] as const,
  teams: ['teams'] as const,
  teamRoster: (teamId: string) => ['teamRoster', teamId] as const,
  seasons: ['seasons'] as const,
  personnel: ['personnel'] as const,
  settings: ['settings'] as const,
  attendance: (sessionId: string) => ['attendance', sessionId] as const,
} as const;
```

**Key pattern**: Keys are `as const` arrays. For user-scoped storage, include `userId` in query keys:

```typescript
queryKey: [...QUERY_KEYS.exercises, userId]
```

### useDataStore Hook

Combines auth context with DataStore access:

```typescript
// src/hooks/useDataStore.ts

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { isCloudAvailable } from '@/config/backendConfig';
import { getDataStore } from '@/datastore/factory';
import type { DataStore } from '@/interfaces/DataStore';

export function useDataStore() {
  const { user } = useAuth();

  const cloudAvailable = isCloudAvailable();
  const userId = cloudAvailable && user?.id ? user.id : undefined;

  const getStore = useCallback(async (): Promise<DataStore> => {
    return getDataStore(userId);
  }, [userId]);

  return useMemo(
    () => ({ userId, getStore, isUserScoped: !!userId }),
    [userId, getStore]
  );
}
```

---

## 2. Data Hook Pattern — Query + Mutation

Every entity needs a hook that provides: data, loading state, error state, and CRUD mutation functions.

### Example: useExercises

```typescript
// src/features/exercise-library/hooks/useExercises.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { QUERY_KEYS } from '@/config/queryKeys';
import type { Exercise } from '@/types/exercise';

export function useExercises() {
  const { userId, getStore } = useDataStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // === QUERIES ===

  const {
    data: exercises = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: [...QUERY_KEYS.exercises, userId],
    queryFn: async () => {
      const store = await getStore();
      return store.getExercises();
    },
  });

  // === MUTATIONS ===

  const createMutation = useMutation({
    mutationFn: async (data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>) => {
      const store = await getStore();
      return store.createExercise(data);
    },
    onSuccess: (newExercise) => {
      // Optimistic: update cache immediately
      queryClient.setQueryData(
        [...QUERY_KEYS.exercises, userId],
        (prev: Exercise[] = []) => [...prev, newExercise]
      );
      showToast('Exercise created', 'success');
    },
    onError: (error) => {
      showToast(error.message, 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Exercise> }) => {
      const store = await getStore();
      return store.updateExercise(id, updates);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(
        [...QUERY_KEYS.exercises, userId],
        (prev: Exercise[] = []) =>
          prev.map(e => e.id === updated.id ? updated : e)
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const store = await getStore();
      await store.deleteExercise(id);
      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData(
        [...QUERY_KEYS.exercises, userId],
        (prev: Exercise[] = []) => prev.filter(e => e.id !== deletedId)
      );
      showToast('Exercise deleted', 'success');
    },
  });

  return {
    exercises,
    isLoading,
    error,
    createExercise: createMutation.mutateAsync,
    updateExercise: updateMutation.mutateAsync,
    deleteExercise: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
```

**Key patterns from MatchOps-Local**:
1. **Optimistic cache updates** in `onSuccess` — don't wait for refetch
2. **Include `userId` in query keys** — prevents data leakage between users
3. **Error handling via toast** — show user-safe error messages
4. **Return `isPending` states** — let UI show loading indicators on buttons

---

## 3. Synchronous State — useReducer

For complex state with multiple related fields that must update atomically, use `useReducer`.

### Practice Session Editor Example

```typescript
// src/features/practice/hooks/usePracticeBlockReducer.ts

import { useReducer } from 'react';
import type { PracticeBlock } from '@/types/practice';

interface PracticeEditorState {
  blocks: PracticeBlock[];
  totalDurationMinutes: number;
  activeBlockIndex: number | null;
  isDirty: boolean;
}

type PracticeEditorAction =
  | { type: 'ADD_BLOCK'; payload: PracticeBlock }
  | { type: 'REMOVE_BLOCK'; payload: number }  // index
  | { type: 'MOVE_BLOCK'; payload: { from: number; to: number } }
  | { type: 'UPDATE_BLOCK'; payload: { index: number; updates: Partial<PracticeBlock> } }
  | { type: 'SET_ACTIVE_BLOCK'; payload: number | null }
  | { type: 'LOAD_BLOCKS'; payload: PracticeBlock[] }
  | { type: 'MARK_SAVED' };

function calculateTotalDuration(blocks: PracticeBlock[]): number {
  return blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
}

function practiceEditorReducer(
  state: PracticeEditorState,
  action: PracticeEditorAction
): PracticeEditorState {
  switch (action.type) {
    case 'ADD_BLOCK': {
      const blocks = [...state.blocks, action.payload];
      return {
        ...state,
        blocks,
        totalDurationMinutes: calculateTotalDuration(blocks),
        isDirty: true,
      };
    }
    case 'REMOVE_BLOCK': {
      const blocks = state.blocks.filter((_, i) => i !== action.payload);
      return {
        ...state,
        blocks,
        totalDurationMinutes: calculateTotalDuration(blocks),
        activeBlockIndex: null,
        isDirty: true,
      };
    }
    case 'MOVE_BLOCK': {
      const { from, to } = action.payload;
      const blocks = [...state.blocks];
      const [moved] = blocks.splice(from, 1);
      blocks.splice(to, 0, moved);
      return { ...state, blocks, isDirty: true };
    }
    case 'UPDATE_BLOCK': {
      const { index, updates } = action.payload;
      const blocks = state.blocks.map((b, i) =>
        i === index ? { ...b, ...updates } : b
      );
      return {
        ...state,
        blocks,
        totalDurationMinutes: calculateTotalDuration(blocks),
        isDirty: true,
      };
    }
    case 'SET_ACTIVE_BLOCK':
      return { ...state, activeBlockIndex: action.payload };
    case 'LOAD_BLOCKS':
      return {
        ...state,
        blocks: action.payload,
        totalDurationMinutes: calculateTotalDuration(action.payload),
        isDirty: false,
      };
    case 'MARK_SAVED':
      return { ...state, isDirty: false };
    default:
      return state;
  }
}

export function usePracticeBlockReducer(initialBlocks: PracticeBlock[] = []) {
  return useReducer(practiceEditorReducer, {
    blocks: initialBlocks,
    totalDurationMinutes: calculateTotalDuration(initialBlocks),
    activeBlockIndex: null,
    isDirty: false,
  });
}
```

**Why useReducer over useState**:
- `ADD_BLOCK` updates `blocks`, recalculates `totalDurationMinutes`, and sets `isDirty` — all atomically
- `MOVE_BLOCK` reorders without losing other state
- Actions are named and debuggable
- Reducer is pure and easy to test

---

## 4. Undo/Redo

```typescript
// src/hooks/useUndoRedo.ts

import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_HISTORY_SIZE = 150;  // ~1.5-7.5MB for full state snapshots

export interface UseUndoRedoReturn<T> {
  state: T;
  set: (next: T) => void;
  reset: (next: T) => void;  // Replaces entire history (for loading new document)
  undo: () => T | null;
  redo: () => T | null;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo<T>(initialState: T): UseUndoRedoReturn<T> {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [index, setIndex] = useState(0);
  const historyRef = useRef(history);
  const indexRef = useRef(index);

  // Keep refs in sync for immediate reads in callbacks
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { indexRef.current = index; }, [index]);

  const set = useCallback((next: T) => {
    const current = historyRef.current[indexRef.current];
    if (JSON.stringify(current) === JSON.stringify(next)) return;  // Skip no-ops

    let newHistory = historyRef.current.slice(0, indexRef.current + 1);
    newHistory.push(next);

    // Cap history to prevent memory growth
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory = newHistory.slice(newHistory.length - MAX_HISTORY_SIZE);
    }

    const newIndex = newHistory.length - 1;
    historyRef.current = newHistory;
    indexRef.current = newIndex;
    setHistory(newHistory);
    setIndex(newIndex);
  }, []);

  const reset = useCallback((next: T) => {
    historyRef.current = [next];
    indexRef.current = 0;
    setIndex(0);
    setHistory([next]);
  }, []);

  const undo = useCallback((): T | null => {
    if (indexRef.current === 0) return null;
    const newIndex = indexRef.current - 1;
    indexRef.current = newIndex;
    setIndex(newIndex);
    return historyRef.current[newIndex];
  }, []);

  const redo = useCallback((): T | null => {
    if (indexRef.current >= historyRef.current.length - 1) return null;
    const newIndex = indexRef.current + 1;
    indexRef.current = newIndex;
    setIndex(newIndex);
    return historyRef.current[newIndex];
  }, []);

  return {
    state: history[index],
    set, reset, undo, redo,
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
}
```

**Key traps**:
- **Ref + state dual tracking**: Refs provide immediate reads in callbacks (no stale closures). State triggers re-renders.
- **JSON.stringify for deep equality**: Prevents duplicate history entries when React re-renders without actual state change.
- **MAX_HISTORY_SIZE**: Without this, mobile devices can run out of memory on long editing sessions.
- **`reset()` for document switching**: When loading a new practice session, call `reset(newState)` — not `set(newState)` — to clear the undo history.

---

## 5. Auto-Save with Tiered Debouncing

Different state changes have different urgency. Use tiered debouncing:

```typescript
// src/hooks/useAutoSave.ts

interface StateGroup {
  states: Record<string, unknown>;
  delay: number;  // milliseconds
}

interface UseAutoSaveConfig {
  immediate?: StateGroup;  // 0ms — critical data (scores, events)
  short?: StateGroup;      // 500ms — metadata (names, notes)
  long?: StateGroup;       // 2000ms — tactical data (positions, drawings)
  saveFunction: () => void | Promise<void>;
  enabled: boolean;
  currentSessionId: string | null;
}
```

**Critical pattern — Content-based change detection**:

```typescript
// ❌ WRONG: Object references change every render → timer cancelled every render
useEffect(() => {
  // This runs on EVERY render because `states` is a new object
  const timer = setTimeout(saveFn, 2000);
  return () => clearTimeout(timer);
}, [states]);  // New reference every render!

// ✅ RIGHT: Serialize to string → stable dependency
const serialized = JSON.stringify(states);
useEffect(() => {
  // This only runs when content actually changes
  if (prevRef.current !== null && prevRef.current !== serialized) {
    timer = setTimeout(saveFn, 2000);
  }
  prevRef.current = serialized;
  return () => clearTimeout(timer);
}, [serialized]);
```

**Why this matters**: In MatchOps-Local, the timer ticks every second (updating `timeElapsedInSeconds`), which creates a new `gameSessionState` object on every render. Without content-based change detection, the 2000ms debounce for position saving was being cancelled every second, so positions were never saved. This took hours to debug.

**Ref pattern for stale closures**:

```typescript
// Always-current refs prevent stale closures in timer callbacks
const saveFunctionRef = useRef(saveFunction);
const enabledRef = useRef(enabled);

useEffect(() => { saveFunctionRef.current = saveFunction; }, [saveFunction]);
useEffect(() => { enabledRef.current = enabled; }, [enabled]);

// In timer callback (runs after delay):
setTimeout(() => {
  if (enabledRef.current) {        // ✅ Current value
    saveFunctionRef.current();       // ✅ Current function
  }
}, 2000);
```

---

## 6. Optimistic Updates with Rollback

For mutations that the user expects to feel instant:

```typescript
const handleAddPlayer = useCallback(async (data) => {
  const prev = [...availablePlayers];      // Save rollback state

  // Optimistic update — show immediately
  const temp = { id: `temp-${Date.now()}`, ...data };
  setAvailablePlayers([...availablePlayers, temp]);

  try {
    const saved = await addPlayer(data, userId);
    if (saved) {
      // Replace temp with real ID
      setAvailablePlayers(ps => ps.map(p => p.id === temp.id ? saved : p));

      // Update React Query cache directly
      queryClient.setQueryData(
        [...QUERY_KEYS.players, userId],
        (prev: Player[] = []) => [...prev, saved]
      );

      // Background refetch for consistency
      await queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.players, userId]
      });
    } else {
      setAvailablePlayers(prev);  // Rollback
    }
  } catch {
    setAvailablePlayers(prev);    // Rollback on error
  }
}, [availablePlayers, userId, queryClient]);
```

**Pattern**: Save previous → optimistic update → try save → on error rollback.

---

## 7. Hook Composition — Keeping Hooks Small

**Lesson from MatchOps-Local**: The main orchestration hook had 17+ dependencies. For the new app, keep hooks focused:

```
Route Component (page.tsx)
    │
    ├── useExercises()        — React Query: exercise CRUD
    ├── usePracticeEditor()   — React Query + reducer: session editing
    ├── useAttendance()       — React Query: attendance data
    ├── useFieldDiagram()     — useState: canvas state
    └── useAutoSave()         — Effect: tiered save
```

Each hook should:
- Have **<8 dependencies** in its dependency arrays
- Be **testable in isolation** (mock DataStore, render hook)
- Handle **one concern** (data fetching OR state management OR side effects)

---

## 8. Wiring in Layout

Provider nesting order matters:

```tsx
// src/app/layout.tsx

<I18nInitializer>          {/* Must be outermost — translations used everywhere */}
  <ServiceWorkerRegistration />
  <InstallPrompt />
  <QueryProvider>           {/* React Query — must wrap all data hooks */}
    <AuthProvider>          {/* Auth — must wrap anything that checks user */}
      <ToastProvider>       {/* Toasts — used by mutation error handlers */}
        {children}
      </ToastProvider>
    </AuthProvider>
  </QueryProvider>
</I18nInitializer>
```

**Key traps**:
- `QueryProvider` must be **above** `AuthProvider` because auth initialization may use React Query.
- `ToastProvider` must be **inside** the auth tree so toast messages can reference auth state.
- `I18nInitializer` must be **outermost** because every component (including auth forms) uses translations.

---

## Traps

1. **`retry: 3` is non-negotiable**: Mobile IndexedDB has transient failures. Reducing retries breaks real devices. This was tested and confirmed on mobile Chrome.

2. **Content-based change detection for auto-save**: If your app has a timer or any frequently-updating state, naive dependency arrays will cancel debounce timers on every render.

3. **Ref + state dual tracking in undo/redo**: Without refs, callbacks in setTimeout/setInterval will read stale state values.

4. **`useState(initialValue)` only uses the initial value once**: If props change after first render, the state won't update. Use `useEffect` to sync:
   ```typescript
   const [value, setValue] = useState(prop);
   useEffect(() => { setValue(prop); }, [prop]);
   ```

5. **Memoize all callback props**: Any function passed as a prop or hook argument should be wrapped in `useCallback`. Unstable references cause infinite re-renders in effects that depend on them.
