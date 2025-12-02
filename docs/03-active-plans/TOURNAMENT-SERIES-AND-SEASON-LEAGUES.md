# Tournament Series & Season Leagues - Design Document

> **Status**: Design complete, pending implementation
> **Created**: December 2025
> **Priority**: To be scheduled in roadmap

## Overview

Two related features to improve how competition levels are tracked:

1. **Tournament Series** (Feature 1): Tournaments can have multiple series at different levels
2. **Season Leagues** (Feature 2): Seasons can be assigned to a predefined Finnish youth league

**Proposed implementation order**: Feature 1 first, then Feature 2

---

# Feature 1: Tournament Series

## Problem

Tournaments currently have a single `level` field, but tournaments have multiple **series** (e.g., Elite, Kilpa, Haaste, Harraste). Games should belong to a specific series.

## Solution

- Tournaments define multiple series (one per level, predefined when creating tournament)
- Games reference a specific series when they belong to a tournament
- Stats can filter by series/level within a tournament

## Data Model Changes

### New Type
```typescript
interface TournamentSeries {
  id: string;      // UUID
  level: string;   // Elite, Kilpa, Haaste, Harraste
}
```

### Modified Tournament
```typescript
interface Tournament {
  // ... existing fields
  level?: string;              // DEPRECATED - kept for migration
  series?: TournamentSeries[]; // NEW
}
```

### Modified Game State
```typescript
interface AppState {
  // ... existing fields
  tournamentLevel?: string;       // DEPRECATED - kept for migration
  tournamentSeriesId?: string;    // NEW
  tournamentSeriesLevel?: string; // NEW - denormalized for display
}
```

## User Flows

### Creating Tournament
1. Fill name, location, dates
2. **Series section**: Click "+ Add Series" → select level
3. Add multiple series (max one per level)
4. Save

### Logging Tournament Game
1. Select tournament from dropdown
2. **NEW**: Select series from dropdown (shows only defined series)
3. If only 1 series → auto-selected
4. Fill other details, start game

## Files to Modify

- `src/types/index.ts` - Add TournamentSeries, update Tournament
- `src/types/game.ts` - Add series fields to AppState
- `src/utils/tournaments.ts` - Handle series in CRUD, migration
- `src/components/TournamentDetailsModal.tsx` - Series management UI
- `src/components/NewGameSetupModal.tsx` - Series picker
- `src/components/GameSettingsModal.tsx` - Series picker
- `src/hooks/useGameSessionReducer.ts` - Series action
- Translation files

## Migration

**Tournaments**: If `level` exists but `series` is empty → create `series: [{ id, level }]`

**Games**: If `tournamentLevel` exists but `tournamentSeriesId` is empty → find matching series, set both fields

---

# Feature 2: Season Leagues

## Problem

Seasons lack formal league association. Currently, league context is embedded in the season name (e.g., "Espoo D2 2024-2025"). This works but prevents future data aggregation and consistent filtering.

## Solution

- Predefined list of Finnish youth leagues (hardcoded)
- When creating a season, select a league from dropdown
- Filter leagues based on age group (ikäluokka) if set
- "Muu" option for custom/unlisted leagues

## Predefined League List

```typescript
const FINNISH_YOUTH_LEAGUES = [
  // Valtakunnalliset (National)
  { id: 'sm-sarja', name: 'Valtakunnallinen SM-sarja' },
  { id: 'sm-karsinta', name: 'Valtakunnallinen SM-karsintasarja' },
  { id: 'valtakunnallinen-1', name: 'Valtakunnallinen Ykkönen' },
  { id: 'valtakunnallinen-2', name: 'Valtakunnallinen Kakkonen' },
  { id: 'valtakunnallinen-3', name: 'Valtakunnallinen Kolmonen' },

  // Aluesarjat (Regional) - 4 regions × 3 levels
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

  // Paikallissarjat (Local) - 4 regions × 3 levels
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

  // Muut (Other)
  { id: 'harrastesarja', name: 'Harrastesarja (Palloliitto)' },
  { id: 'seuran-harrasteliiga', name: 'Seuran oma harrasteliiga' },
  { id: 'koulusarja', name: 'Koulusarja / Koululiiga' },
  { id: 'miniliiga', name: 'Seuran oma pelitapahtuma / Miniliiga' },

  // Custom
  { id: 'muu', name: 'Muu (vapaa kuvaus)', isCustom: true },
];
```

## Data Model Changes

### Modified Season
```typescript
interface Season {
  // ... existing fields
  leagueId?: string;        // NEW - reference to predefined league
  customLeagueName?: string; // NEW - if leagueId === 'muu'
}
```

## User Flow

### Creating Season
1. Fill name, dates, age group
2. **NEW**: Select league from dropdown (filtered by age group if set)
3. If "Muu" selected → show text input for custom name
4. Save

## Files to Modify

- `src/types/index.ts` - Update Season interface
- `src/config/leagues.ts` - NEW - predefined league list
- `src/utils/seasons.ts` - Handle leagueId in CRUD
- `src/components/SeasonDetailsModal.tsx` - League picker dropdown
- Translation files

## Migration

No migration needed - existing seasons simply have no league (leagueId undefined)

---

# Future Considerations (Deferred)

## Gender Handling
- Currently not implemented
- Needs elaboration on where gender should live (Team? Season? Game?)
- Would enable filtering leagues by gender (boys/girls leagues)
- **Action**: Document and revisit in separate planning session

## Age Group Filtering
- Filter league dropdown based on season's age group
- Needs investigation: which leagues are available for which age groups
- **Action**: Can be added as enhancement after initial implementation

---

# Implementation Phases

## Phase 1: Tournament Series (Feature 1)
1. Add types (TournamentSeries)
2. Update Tournament type and storage
3. Update game types and reducer
4. Update TournamentDetailsModal UI
5. Update NewGameSetupModal and GameSettingsModal
6. Add translations
7. Test migration

## Phase 2: Season Leagues (Feature 2)
1. Create leagues config file
2. Update Season type and storage
3. Update SeasonDetailsModal UI
4. Add translations
5. Test with existing data

---

# Critical Files Summary

**Feature 1 (Tournament Series):**
- `src/types/index.ts`
- `src/types/game.ts`
- `src/utils/tournaments.ts`
- `src/components/TournamentDetailsModal.tsx`
- `src/components/NewGameSetupModal.tsx`
- `src/components/GameSettingsModal.tsx`
- `src/hooks/useGameSessionReducer.ts`

**Feature 2 (Season Leagues):**
- `src/types/index.ts`
- `src/config/leagues.ts` (NEW)
- `src/utils/seasons.ts`
- `src/components/SeasonDetailsModal.tsx`
