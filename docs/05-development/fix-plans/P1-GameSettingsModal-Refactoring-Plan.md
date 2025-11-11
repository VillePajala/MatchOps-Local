# P1: GameSettingsModal.tsx Refactoring Plan (HIGH)

**Priority**: P1 - HIGH
**File**: `/src/components/GameSettingsModal.tsx`
**Current Size**: 1,995 lines
**Target Size**: 200 lines (orchestrator only)
**Estimated Effort**: 1 hour
**Impact**: HIGH - Reduces complexity, improves maintainability
**Status**: ❌ Not Started

---

## 🎯 OBJECTIVE

Decompose the 1,995-line GameSettingsModal into 5 focused sub-components, each responsible for one configuration section.

---

## 📊 PROBLEM STATEMENT

### Current State

GameSettingsModal contains **ALL game configuration UI**:
1. Teams & Roster Selection (300+ lines)
2. Game Details (Season/Tournament, Date, Location, Time) (400+ lines)
3. Game Configuration (Periods, Duration, Demand Factor) (300+ lines)
4. Event Log (Goals, Substitutions editing) (400+ lines)
5. Game Notes (200+ lines)
6. Fair Play Card Selection (100+ lines)
7. State management for all above (200+ lines)

**Problems**:
- 90+ props passed to component
- Complex state management (refs, effects, local state)
- Impossible to test sections in isolation
- High cognitive load - can't hold entire component in memory
- Changes to one section risk breaking others

---

## 🏗️ PROPOSED ARCHITECTURE

### Target Structure

```
src/components/GameSettingsModal/
├── index.tsx                              # 200 lines - Main orchestrator
├── sections/
│   ├── TeamsAndRosterSection.tsx         # 400 lines - Team selection, roster
│   ├── GameDetailsSection.tsx            # 400 lines - Season/Tournament, Date, etc
│   ├── GameConfigSection.tsx             # 300 lines - Periods, duration, settings
│   ├── EventLogSection.tsx               # 400 lines - Event list, edit, delete
│   └── GameNotesSection.tsx              # 200 lines - Notes textarea
├── hooks/
│   └── useGameSettingsState.ts           # 300 lines - Centralized state mgmt
└── utils/
    └── gameSettingsHelpers.ts            # 100 lines - Validation, formatters
```

---

## 📝 STEP-BY-STEP IMPLEMENTATION

### Phase 1: Preparation (10 min)

```bash
mkdir -p src/components/GameSettingsModal/{sections,hooks,utils}
touch src/components/GameSettingsModal/index.tsx
touch src/components/GameSettingsModal/sections/{TeamsAndRosterSection,GameDetailsSection,GameConfigSection,EventLogSection,GameNotesSection}.tsx
touch src/components/GameSettingsModal/hooks/useGameSettingsState.ts
touch src/components/GameSettingsModal/utils/gameSettingsHelpers.ts
```

### Phase 2: Extract Sections (40 min)

**Each section follows the same pattern:**

1. Copy relevant JSX from GameSettingsModal.tsx
2. Extract relevant props and handlers
3. Create focused component interface
4. Test in isolation

**Example - TeamsAndRosterSection.tsx:**

```typescript
// src/components/GameSettingsModal/sections/TeamsAndRosterSection.tsx
interface TeamsAndRosterSectionProps {
  // Teams
  teams: Team[];
  selectedTeamId: string | null;
  onTeamIdChange: (teamId: string | null) => void;

  // Team names
  teamName: string;
  opponentName: string;
  onTeamNameChange: (name: string) => void;
  onOpponentNameChange: (name: string) => void;

  // Player selection
  availablePlayers: Player[];
  selectedPlayerIds: string[];
  onSelectedPlayersChange: (ids: string[]) => void;

  // Fair Play Card
  onAwardFairPlayCard: (playerId: string | null, time: number) => void;
  timeElapsedInSeconds: number;

  // State
  isProcessing?: boolean;
}

export function TeamsAndRosterSection(props: TeamsAndRosterSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700">
      <h3 className="text-lg font-semibold text-slate-200">
        {t('gameSettingsModal.teamsAndRosterLabel', 'Teams & Roster')}
      </h3>

      {/* Team Selection */}
      <TeamSelectionInput
        teams={props.teams}
        selectedTeamId={props.selectedTeamId}
        onChange={props.onTeamIdChange}
      />

      {/* Team/Opponent Names */}
      <TeamOpponentInputs
        teamName={props.teamName}
        opponentName={props.opponentName}
        onTeamNameChange={props.onTeamNameChange}
        onOpponentNameChange={props.onOpponentNameChange}
      />

      {/* Player Selection */}
      <PlayerSelectionSection
        availablePlayers={props.availablePlayers}
        selectedPlayerIds={props.selectedPlayerIds}
        onSelectedPlayersChange={props.onSelectedPlayersChange}
      />

      {/* Fair Play Card */}
      <FairPlayCardInput
        players={props.availablePlayers}
        onAwardCard={props.onAwardFairPlayCard}
        timeElapsed={props.timeElapsedInSeconds}
      />
    </div>
  );
}
```

### Phase 3: Create Main Orchestrator (10 min)

```typescript
// src/components/GameSettingsModal/index.tsx
export function GameSettingsModal({
  isOpen,
  onClose,
  currentGameId,
  // ... all other props
}: GameSettingsModalProps) {
  const { t } = useTranslation();

  // Use centralized state hook
  const settingsState = useGameSettingsState({
    currentGameId,
    initialValues: { /* ... */ }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]">
      <div className="bg-slate-800 rounded-none shadow-xl flex flex-col h-full w-full">
        {/* Header */}
        <ModalHeader title={t('gameSettingsModal.title', 'Game Settings')} />

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <TeamsAndRosterSection {...settingsState.teams} />
          <GameDetailsSection {...settingsState.details} />
          <GameConfigSection {...settingsState.config} />
          <EventLogSection {...settingsState.events} />
          <GameNotesSection {...settingsState.notes} />
        </div>

        {/* Footer */}
        <ModalFooter>
          <button onClick={onClose}>Done</button>
        </ModalFooter>
      </div>
    </div>
  );
}
```

---

## ✅ ACCEPTANCE CRITERIA

- [ ] Main GameSettingsModal/index.tsx ≤200 lines
- [ ] Each section component ≤400 lines
- [ ] All existing functionality preserved
- [ ] All tests pass
- [ ] Each section testable in isolation
- [ ] No prop drilling beyond 2 levels

---

## 🧪 TESTING STRATEGY

```typescript
// src/components/GameSettingsModal/sections/__tests__/TeamsAndRosterSection.test.tsx
describe('TeamsAndRosterSection', () => {
  it('renders team selection dropdown', () => {
    const props = mockTeamsAndRosterProps();
    render(<TeamsAndRosterSection {...props} />);
    expect(screen.getByLabelText(/select team/i)).toBeInTheDocument();
  });

  it('calls onTeamIdChange when team selected', async () => {
    const handleChange = jest.fn();
    const props = mockTeamsAndRosterProps({ onTeamIdChange: handleChange });
    render(<TeamsAndRosterSection {...props} />);

    const select = screen.getByLabelText(/select team/i);
    await userEvent.selectOptions(select, 'team-123');

    expect(handleChange).toHaveBeenCalledWith('team-123');
  });
});
```

---

## 📚 RELATED DOCUMENTS

- [P0: HomePage Refactoring](./P0-HomePage-Refactoring-Plan.md)
- [Critical Fixes Overview](../../CRITICAL_FIXES_REQUIRED.md)

---

**Last Updated**: October 16, 2025
