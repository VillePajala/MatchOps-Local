# Undo/Redo System

**Status**: ✅ Implemented
**Last Updated**: January 5, 2026

## Overview

Full undo/redo support for game actions and tactical board drawings.

## Key Components

- `useUndoRedo.ts` - Generic undo/redo hook
- `useTacticalHistory.ts` - Tactical board history
- `useGameSessionWithHistory.ts` - Game action history

## Supported Actions

### Game Actions
- Goal events (add/remove)
- Player selections
- Score changes
- Period changes

### Tactical Board
- Drawing strokes
- Player position changes
- Formation changes
- Clear operations

## Implementation

```typescript
interface HistoryState<T> {
  past: T[];      // Undo stack
  present: T;     // Current state
  future: T[];    // Redo stack
}
```

### Operations
- **Undo**: Pop from past, push present to future
- **Redo**: Pop from future, push present to past
- **New Action**: Push present to past, clear future

## User Flow

1. Perform action (e.g., log goal)
2. Action added to history
3. Press Undo → Action reversed
4. Press Redo → Action restored

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Undo | Ctrl/Cmd + Z |
| Redo | Ctrl/Cmd + Shift + Z |

## UI Controls

- Undo/Redo buttons in Control Bar
- Disabled when stack empty
- Visual feedback on action

## History Limits

- Maximum 50 undo steps (configurable)
- Older actions dropped when limit reached
- History cleared on game save

## Tactical Board Specifics

The tactical board maintains separate history for:
- Drawing paths
- Player positions
- Formations

Each can be undone independently.
