# Tournament Series & Season Leagues - Implementation Plan

> **Status**: ✅ REFINED - Ready for implementation
> **Created**: December 2025
> **Last Updated**: December 6, 2025
> **Estimated Effort**: 6-8 hours across 3 PRs

---

## Branch Strategy

```
master
  └── feature/tournament-series-and-leagues (integration branch)
        ├── PR #1: feature/ts-types-and-storage
        ├── PR #2: feature/ts-tournament-ui
        └── PR #3: feature/ts-season-leagues
```

**Workflow:**
1. Create integration branch `feature/tournament-series-and-leagues` from `master`
2. Each PR merges INTO the integration branch (not master)
3. After all 3 PRs merged to integration, final PR to `master`

---

## PR #1: Types & Storage Layer (~2 hours)

**Branch**: `feature/ts-types-and-storage`
**Merge Target**: `feature/tournament-series-and-leagues`

### What This PR Does
- Adds new TypeScript types for tournament series
- Updates storage utilities with migration logic
- Creates league configuration file
- Adds new reducer action for series
- **NO UI CHANGES** - purely backend/data layer

### Files to Create

#### `src/config/leagues.ts` (NEW)
```typescript
/**
 * Finnish youth football league hierarchy.
 * Based on Palloliitto competition structure.
 */
export interface League {
  id: string;
  name: string;
  isCustom?: boolean;
}

export const FINNISH_YOUTH_LEAGUES: League[] = [
  // Valtakunnalliset (National) - 5 levels
  { id: 'sm-sarja', name: 'Valtakunnallinen SM-sarja' },
  { id: 'sm-karsinta', name: 'Valtakunnallinen SM-karsintasarja' },
  { id: 'valtakunnallinen-1', name: 'Valtakunnallinen Ykkönen' },
  { id: 'valtakunnallinen-2', name: 'Valtakunnallinen Kakkonen' },
  { id: 'valtakunnallinen-3', name: 'Valtakunnallinen Kolmonen' },

  // Aluesarjat (Regional) - 4 regions × 3 levels = 12
  { id: 'aluesarja-1-etela', name: 'Aluesarja taso 1 – Etelä' },
  { id: 'aluesarja-1-lansi', name: 'Aluesarja taso 1 – Länsi' },
  { id: 'aluesarja-1-ita', name: 'Aluesarja taso 1 – Itä' },
  { id: 'aluesarja-1-pohjoinen', name: 'Aluesarja taso 1 – Pohjoinen' },
  { id: 'aluesarja-2-etela', name: 'Aluesarja taso 2 – Etelä' },
  { id: 'aluesarja-2-lansi', name: 'Aluesarja taso 2 – Länsi' },
  { id: 'aluesarja-2-ita', name: 'Aluesarja taso 2 – Itä' },
  { id: 'aluesarja-2-pohjoinen', name: 'Aluesarja taso 2 – Pohjoinen' },
  { id: 'aluesarja-3-etela', name: 'Aluesarja taso 3 – Etelä' },
  { id: 'aluesarja-3-lansi', name: 'Aluesarja taso 3 – Länsi' },
  { id: 'aluesarja-3-ita', name: 'Aluesarja taso 3 – Itä' },
  { id: 'aluesarja-3-pohjoinen', name: 'Aluesarja taso 3 – Pohjoinen' },

  // Paikallissarjat (Local) - 4 regions × 3 levels = 12
  { id: 'paikallissarja-1-etela', name: 'Paikallissarja taso 1 – Etelä' },
  { id: 'paikallissarja-1-lansi', name: 'Paikallissarja taso 1 – Länsi' },
  { id: 'paikallissarja-1-ita', name: 'Paikallissarja taso 1 – Itä' },
  { id: 'paikallissarja-1-pohjoinen', name: 'Paikallissarja taso 1 – Pohjoinen' },
  { id: 'paikallissarja-2-etela', name: 'Paikallissarja taso 2 – Etelä' },
  { id: 'paikallissarja-2-lansi', name: 'Paikallissarja taso 2 – Länsi' },
  { id: 'paikallissarja-2-ita', name: 'Paikallissarja taso 2 – Itä' },
  { id: 'paikallissarja-2-pohjoinen', name: 'Paikallissarja taso 2 – Pohjoinen' },
  { id: 'paikallissarja-3-etela', name: 'Paikallissarja taso 3 – Etelä' },
  { id: 'paikallissarja-3-lansi', name: 'Paikallissarja taso 3 – Länsi' },
  { id: 'paikallissarja-3-ita', name: 'Paikallissarja taso 3 – Itä' },
  { id: 'paikallissarja-3-pohjoinen', name: 'Paikallissarja taso 3 – Pohjoinen' },

  // Muut (Other) - 4
  { id: 'harrastesarja', name: 'Harrastesarja (Palloliitto)' },
  { id: 'seuran-harrasteliiga', name: 'Seuran oma harrasteliiga' },
  { id: 'koulusarja', name: 'Koulusarja / Koululiiga' },
  { id: 'miniliiga', name: 'Seuran oma pelitapahtuma / Miniliiga' },

  // Custom option - always last
  { id: 'muu', name: 'Muu (vapaa kuvaus)', isCustom: true },
];

export function getLeagueById(id: string): League | undefined {
  return FINNISH_YOUTH_LEAGUES.find(l => l.id === id);
}

export function getLeagueName(id: string | undefined): string {
  if (!id) return '';
  const league = getLeagueById(id);
  return league?.name ?? id;
}
```

### Files to Modify

#### `src/types/index.ts`
Add after `Tournament` interface:
```typescript
/**
 * Tournament series - represents a competition level within a tournament.
 * E.g., "Elite", "Kilpa", "Haaste", "Harraste"
 */
export interface TournamentSeries {
  id: string;      // UUID format: series_timestamp_random
  level: string;   // One of LEVELS from gameOptions.ts
}
```

Modify `Tournament` interface - add after `level?: string;`:
```typescript
  /**
   * Tournament series for multi-level tournaments.
   * Each series represents a different competition level (Elite, Kilpa, etc.)
   *
   * @remarks
   * - If series array exists and has items, use series for game assignment
   * - If series is empty/undefined, fall back to legacy `level` field
   * - Migration: tournaments with level but no series get auto-migrated
   */
  series?: TournamentSeries[];
```

Modify `Season` interface - add after `ageGroup?: string;`:
```typescript
  /**
   * League ID from predefined Finnish youth leagues.
   * @see src/config/leagues.ts for available leagues
   */
  leagueId?: string;

  /**
   * Custom league name when leagueId === 'muu'
   */
  customLeagueName?: string;
```

#### `src/types/game.ts`
Add to `AppState` interface after `tournamentLevel?: string;`:
```typescript
  /**
   * Tournament series ID - references TournamentSeries.id
   * Used when tournament has multiple series defined
   */
  tournamentSeriesId?: string;
```

#### `src/hooks/useGameSessionReducer.ts`
Add to `GameSessionState` interface after `tournamentLevel?: string;`:
```typescript
  tournamentSeriesId?: string;
```

Add to action types:
```typescript
  | { type: 'SET_TOURNAMENT_SERIES_ID'; payload: string }
```

Add reducer case after `SET_TOURNAMENT_LEVEL`:
```typescript
    case 'SET_TOURNAMENT_SERIES_ID':
      return { ...state, tournamentSeriesId: action.payload };
```

Update `LOAD_PERSISTED_GAME_DATA` case to include `tournamentSeriesId`:
```typescript
      const tournamentSeriesId = loadedData.tournamentSeriesId;
      // ... in stateToBeReturned:
      tournamentSeriesId,
```

#### `src/utils/tournaments.ts`
Add migration helper function:
```typescript
/**
 * Migrates legacy tournament level to series format.
 * Called during getTournaments() to ensure backwards compatibility.
 */
function migrateTournamentLevel(tournament: Tournament): Tournament {
  // If already has series, no migration needed
  if (tournament.series && tournament.series.length > 0) {
    return tournament;
  }

  // If has legacy level but no series, migrate
  if (tournament.level) {
    return {
      ...tournament,
      series: [{
        id: `series_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        level: tournament.level,
      }],
    };
  }

  // No level set, return as-is
  return tournament;
}
```

Update `getTournaments()` to apply migration:
```typescript
    return parsed.map(t => migrateTournamentLevel({
      ...t,
      level: t.level ?? undefined,
      ageGroup: t.ageGroup ?? undefined,
    })) as Tournament[];
```

### Tests to Add

#### `src/utils/__tests__/tournaments.test.ts`
```typescript
describe('Tournament Series Migration', () => {
  it('migrates legacy level field to series array', async () => {
    // Setup: tournament with level but no series
    // Assert: series array contains one item with matching level
  });

  it('preserves existing series array', async () => {
    // Setup: tournament with series already defined
    // Assert: series unchanged, no duplicate migration
  });

  it('handles tournament with no level', async () => {
    // Setup: tournament without level or series
    // Assert: no series array created
  });
});
```

### Acceptance Criteria
- [ ] TypeScript compiles with no errors
- [ ] All existing tests pass (2,085)
- [ ] New types are exported from `src/types/index.ts`
- [ ] Migration logic tested for tournaments
- [ ] `leagues.ts` exports FINNISH_YOUTH_LEAGUES constant

---

## PR #2: Tournament Series UI (~2.5 hours)

**Branch**: `feature/ts-tournament-ui`
**Merge Target**: `feature/tournament-series-and-leagues`
**Depends On**: PR #1 merged

### What This PR Does
- Adds series management UI to TournamentDetailsModal
- Updates NewGameSetupModal to show series picker when tournament selected
- Updates GameSettingsModal series picker (same pattern)
- Adds translations (EN/FI)

### Files to Modify

#### `src/components/TournamentDetailsModal.tsx`
Add state for series management:
```typescript
const [series, setSeries] = useState<TournamentSeries[]>([]);
```

Add series section in form (after Level dropdown):
```typescript
{/* Series Section */}
<div>
  <label className="block text-sm font-medium text-slate-300 mb-1">
    {t('tournamentDetailsModal.seriesLabel', 'Tournament Series')}
  </label>

  {/* Series chips */}
  <div className="flex flex-wrap gap-2 mb-2">
    {series.map((s) => (
      <span key={s.id} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-600/30 text-indigo-200 border border-indigo-500/30">
        {t(`common.level${s.level}` as TranslationKey, s.level)}
        <button
          type="button"
          onClick={() => setSeries(series.filter(x => x.id !== s.id))}
          className="ml-2 text-indigo-300 hover:text-white"
        >
          ×
        </button>
      </span>
    ))}
  </div>

  {/* Add series dropdown */}
  {availableLevels.length > 0 && (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) {
          setSeries([...series, {
            id: `series_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            level: e.target.value,
          }]);
        }
      }}
      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
    >
      <option value="">{t('tournamentDetailsModal.addSeries', '+ Add Series')}</option>
      {availableLevels.map(lvl => (
        <option key={lvl} value={lvl}>
          {t(`common.level${lvl}` as TranslationKey, lvl)}
        </option>
      ))}
    </select>
  )}

  <p className="mt-1 text-xs text-slate-400">
    {t('tournamentDetailsModal.seriesHelp', 'Add series levels for this tournament (e.g., Elite, Kilpa)')}
  </p>
</div>
```

Compute `availableLevels`:
```typescript
const availableLevels = useMemo(() => {
  const usedLevels = new Set(series.map(s => s.level));
  return LEVELS.filter(l => !usedLevels.has(l));
}, [series]);
```

Update form initialization (in useLayoutEffect):
```typescript
setSeries(tournament.series || []);
```

Update handleSave to include series:
```typescript
const newTournament = {
  ...existing,
  series: series.length > 0 ? series : undefined,
};
```

#### `src/components/NewGameSetupModal.tsx`
Add state for selected series:
```typescript
const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
```

Add series picker after tournament dropdown (when tournament selected):
```typescript
{selectedTournamentId && selectedTournament?.series && selectedTournament.series.length > 0 && (
  <div className="mt-2">
    <label className="block text-sm font-medium text-slate-300 mb-1">
      {t('newGameSetupModal.seriesLabel', 'Series')}
    </label>
    <select
      value={selectedSeriesId || ''}
      onChange={(e) => {
        setSelectedSeriesId(e.target.value || null);
        // Also update tournamentLevel for backwards compatibility
        const series = selectedTournament.series?.find(s => s.id === e.target.value);
        if (series) setTournamentLevel(series.level);
      }}
      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
    >
      <option value="">{t('newGameSetupModal.selectSeries', '-- Select Series --')}</option>
      {selectedTournament.series.map(s => (
        <option key={s.id} value={s.id}>
          {t(`common.level${s.level}` as TranslationKey, s.level)}
        </option>
      ))}
    </select>
  </div>
)}
```

Auto-select if only one series:
```typescript
useEffect(() => {
  if (selectedTournamentId) {
    const tournament = tournaments.find(t => t.id === selectedTournamentId);
    if (tournament?.series?.length === 1) {
      setSelectedSeriesId(tournament.series[0].id);
      setTournamentLevel(tournament.series[0].level);
    } else {
      setSelectedSeriesId(null);
    }
  }
}, [selectedTournamentId, tournaments]);
```

Update onStart callback to pass seriesId:
```typescript
// Need to add tournamentSeriesId to onStart signature (or pass through tournamentLevel)
```

**DECISION POINT**: The current `onStart` signature doesn't include `tournamentSeriesId`. Options:
1. Add new parameter to `onStart` (breaking change, but isolated)
2. Piggyback on existing field (hacky)

**Recommendation**: Add `tournamentSeriesId: string | null` parameter after `tournamentLevel`.

#### `src/components/GameSettingsModal.tsx`
Similar changes - add series picker when editing a game associated with a multi-series tournament.

#### Translation Files

`public/locales/en/common.json`:
```json
{
  "tournamentDetailsModal": {
    "seriesLabel": "Tournament Series",
    "addSeries": "+ Add Series",
    "seriesHelp": "Add competition levels for this tournament (e.g., Elite, Kilpa)"
  },
  "newGameSetupModal": {
    "seriesLabel": "Series",
    "selectSeries": "-- Select Series --"
  }
}
```

`public/locales/fi/common.json`:
```json
{
  "tournamentDetailsModal": {
    "seriesLabel": "Turnauksen sarjat",
    "addSeries": "+ Lisää sarja",
    "seriesHelp": "Lisää kilpailutasot tälle turnaukselle (esim. Elite, Kilpa)"
  },
  "newGameSetupModal": {
    "seriesLabel": "Sarja",
    "selectSeries": "-- Valitse sarja --"
  }
}
```

### Acceptance Criteria
- [ ] Can add/remove series when creating/editing tournament
- [ ] Series dropdown appears in NewGameSetupModal when tournament has series
- [ ] Auto-selects if tournament has exactly one series
- [ ] Series selection persists to game state
- [ ] Existing games without series still work (backwards compatible)
- [ ] All tests pass

---

## PR #3: Season Leagues (~1.5 hours)

**Branch**: `feature/ts-season-leagues`
**Merge Target**: `feature/tournament-series-and-leagues`
**Depends On**: PR #1 merged (PR #2 can be parallel)

### What This PR Does
- Adds league picker to SeasonDetailsModal
- Shows custom input when "Muu" (Other) selected
- Adds translations

### Files to Modify

#### `src/components/SeasonDetailsModal.tsx`
Add imports:
```typescript
import { FINNISH_YOUTH_LEAGUES, getLeagueName } from '@/config/leagues';
```

Add state:
```typescript
const [leagueId, setLeagueId] = useState('');
const [customLeagueName, setCustomLeagueName] = useState('');
```

Add league picker after Age Group dropdown:
```typescript
{/* League Selection */}
<div>
  <label className="block text-sm font-medium text-slate-300 mb-1">
    {t('seasonDetailsModal.leagueLabel', 'League')}
  </label>
  <select
    value={leagueId}
    onChange={(e) => {
      setLeagueId(e.target.value);
      if (e.target.value !== 'muu') setCustomLeagueName('');
    }}
    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
  >
    <option value="">{t('seasonDetailsModal.selectLeague', '-- Select League --')}</option>
    {FINNISH_YOUTH_LEAGUES.map(league => (
      <option key={league.id} value={league.id}>{league.name}</option>
    ))}
  </select>
</div>

{/* Custom League Name - shown when "Muu" selected */}
{leagueId === 'muu' && (
  <div>
    <label className="block text-sm font-medium text-slate-300 mb-1">
      {t('seasonDetailsModal.customLeagueLabel', 'Custom League Name')}
    </label>
    <input
      type="text"
      value={customLeagueName}
      onChange={(e) => setCustomLeagueName(e.target.value)}
      placeholder={t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name')}
      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400"
    />
  </div>
)}
```

Update form initialization:
```typescript
setLeagueId(season.leagueId || '');
setCustomLeagueName(season.customLeagueName || '');
```

Update handleSave:
```typescript
const newSeason: Season = {
  ...existing,
  leagueId: leagueId || undefined,
  customLeagueName: leagueId === 'muu' ? customLeagueName.trim() || undefined : undefined,
};
```

#### Translation Files

`public/locales/en/common.json`:
```json
{
  "seasonDetailsModal": {
    "leagueLabel": "League",
    "selectLeague": "-- Select League --",
    "customLeagueLabel": "Custom League Name",
    "customLeaguePlaceholder": "Enter league name"
  }
}
```

`public/locales/fi/common.json`:
```json
{
  "seasonDetailsModal": {
    "leagueLabel": "Sarja",
    "selectLeague": "-- Valitse sarja --",
    "customLeagueLabel": "Oma sarjan nimi",
    "customLeaguePlaceholder": "Kirjoita sarjan nimi"
  }
}
```

### Acceptance Criteria
- [ ] League dropdown appears in SeasonDetailsModal
- [ ] Selecting "Muu" shows custom text input
- [ ] League selection persists to season
- [ ] Existing seasons without league work (backwards compatible)
- [ ] All tests pass

---

## Final Integration PR

**Branch**: `feature/tournament-series-and-leagues`
**Merge Target**: `master`

After all 3 PRs merged to integration branch:
1. Run full test suite
2. Manual smoke test
3. Create PR to master with summary of all changes

---

## Test Checklist

### Unit Tests
- [ ] Tournament migration (level → series)
- [ ] League lookup functions
- [ ] Reducer actions for series

### Integration Tests
- [ ] Create tournament with multiple series
- [ ] Create game in tournament with series selection
- [ ] Edit existing tournament series
- [ ] Create season with league
- [ ] Create season with custom league

### Manual Testing
- [ ] Create new tournament → add Elite + Kilpa series → save → verify persisted
- [ ] Load saved tournament → verify series shown
- [ ] New game → select tournament with series → verify series dropdown
- [ ] New game → select tournament with 1 series → auto-selected
- [ ] New season → select "Aluesarja taso 1 – Etelä" → save → verify
- [ ] New season → select "Muu" → enter custom name → save → verify

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration corrupts tournament data | Low | High | Migration is additive (adds series), doesn't remove level |
| Breaking change in onStart signature | Low | Medium | TypeScript will catch all call sites |
| Translation missing | Low | Low | Fallback text in code |
| Series dropdown confusing UX | Low | Medium | Auto-select single series, clear labels |

---

## Summary

| PR | Scope | Effort | Dependencies |
|----|-------|--------|--------------|
| PR #1 | Types + Storage + Migration | ~2h | None |
| PR #2 | Tournament Series UI | ~2.5h | PR #1 |
| PR #3 | Season Leagues UI | ~1.5h | PR #1 |
| PR #4 | Stats Filtering | ~3h | PR #2, PR #3 |
| Final | Integration to master | ~30min | All PRs |

**Total: ~9.5 hours**

---

## PR #4: Stats Filtering (~3 hours)

**Branch**: `feature/ts-stats-filtering`
**Merge Target**: `feature/tournament-series-and-leagues`
**Depends On**: PR #2 and PR #3 merged

### What This PR Does
- Adds series filter dropdown to tournament stats
- Shows league badges in game lists
- Displays series/league labels in stats views

### Features

#### 1. Tournament Stats Filtering by Series
- Add dropdown in tournament stats view: "All Series" / "Elite" / "Kilpa" / etc.
- Filter player stats table to show only games from selected series
- Show series breakdown: "Elite: 3 games, Kilpa: 5 games"

#### 2. League Display in Game Lists
- Show league badge/label next to season games in LoadGameModal
- Format: "vs Opponent • Aluesarja taso 1 – Etelä"

#### 3. Series Display in Tournament Game Lists
- Show series level next to tournament games
- Format: "vs Opponent • Elite"

### Files to Modify
- `src/components/StatsModal.tsx` - Add series filter dropdown
- `src/components/LoadGameModal.tsx` - Add league/series badges to game cards
- Translation files (filter labels)

### Acceptance Criteria
- [ ] Can filter tournament stats by series
- [ ] League name visible in season game lists
- [ ] Series name visible in tournament game lists

---

## TDD Approach

We'll use **Test-Driven Development** for this feature:

### TDD Workflow Per PR

```
1. Write failing test (RED)
2. Write minimal code to pass (GREEN)
3. Refactor if needed (REFACTOR)
4. Repeat
```

### PR #1: Types & Storage (TDD Focus: Migration)

**Tests to write FIRST:**
```typescript
// src/utils/__tests__/tournaments.test.ts
describe('Tournament Series Migration', () => {
  it('should migrate legacy level to series array');
  it('should preserve existing series array');
  it('should handle tournament without level');
});

// src/config/__tests__/leagues.test.ts
describe('League Utilities', () => {
  it('should return league by ID');
  it('should return undefined for unknown ID');
  it('should return league name or fallback');
});
```

### PR #2: Tournament Series UI (TDD Focus: Reducer)

**Tests to write FIRST:**
```typescript
// src/hooks/__tests__/useGameSessionReducer.test.ts
describe('SET_TOURNAMENT_SERIES_ID', () => {
  it('should set tournamentSeriesId in state');
  it('should preserve other state fields');
});
```

### PR #3: Season Leagues UI (TDD Focus: Form Logic)

**Tests to write FIRST:**
```typescript
// Component tests - verify league dropdown behavior
describe('SeasonDetailsModal', () => {
  it('should show custom input when "muu" selected');
  it('should clear custom name when different league selected');
});
```

### PR #4: Stats Filtering (TDD Focus: Filter Logic)

**Tests to write FIRST:**
```typescript
describe('Tournament Stats Filtering', () => {
  it('should filter games by series ID');
  it('should show all games when "all" selected');
  it('should calculate stats only for filtered games');
});
```

### Benefits of TDD Here

1. **Migration safety**: Tests prove old data converts correctly before we write converter
2. **Reducer confidence**: Tests verify state changes before UI depends on them
3. **Regression prevention**: If migration breaks, tests catch it immediately
4. **Documentation**: Tests show exactly how the feature should behave
