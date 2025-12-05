# ADR-004: Orchestration Hook Prop Grouping Pattern

**Status**: Accepted
**Date**: 2025-12-05
**Context**: Step 2.8 Modal Architecture Fix

## Context

Complex orchestration hooks can accumulate many parameters over time. `useModalOrchestration` had grown to 76 flat parameters, which made the interface difficult to read and maintain.

## Decision

When an orchestration hook exceeds ~20 parameters, group them into 4 logical categories:

```typescript
interface UseOrchestrationProps {
  hooks: {
    // Other extracted hooks this hook depends on
    gameDataManagement: UseGameDataManagementReturn;
    fieldCoordination: UseFieldCoordinationReturn;
    // ...
  };
  session: {
    // Core state and dispatch
    gameSessionState: GameSessionState;
    dispatchGameSession: React.Dispatch<GameSessionAction>;
  };
  ui: {
    // UI-specific state (display values, selections, settings)
    availablePlayers: Player[];
    currentGameId: string | null;
    // ...
  };
  handlers: {
    // Callback functions for actions
    handleUpdateGameEvent: (event: GameEvent) => void;
    handleExportOneExcel: (gameId: string) => void;
    // ...
  };
}
```

## Rationale

1. **Discoverability**: Developers can quickly find what they need by category
2. **Testability**: Mock props can be constructed per-group
3. **Maintenance**: Adding new props has a clear location
4. **Documentation**: Interface is self-documenting by structure

## Consequences

### Positive
- Cleaner interface for complex hooks
- Consistent pattern across orchestration hooks
- Easier code review (grouped diffs)

### Negative
- Slightly more verbose call sites
- Additional destructuring in hook implementation

## Applicability

Apply this pattern when:
- Hook has >20 parameters
- Parameters naturally fall into these 4 categories
- Hook serves as an orchestration/coordination layer

Do NOT apply when:
- Hook has <15 parameters (keep flat)
- Hook is a simple utility (use plain parameters)
