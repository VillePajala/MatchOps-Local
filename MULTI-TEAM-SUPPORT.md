# Multi-Team Support – Design & Implementation Plan

## Summary

Introduce first-class Teams so a user can manage multiple teams (each with its own roster, seasons, tournaments) and associate a team when creating games. The goal is to remove the current one-team assumption and enable workflows like tracking multiple club teams in one season or a tournament with multiple teams.

## Goals

- Create and manage multiple teams with their own rosters and settings
- Associate games with a specific team; filter views by active team
- Scope seasons and tournaments to a team (optional global items still supported)
- Keep backward compatibility (automatic migration from current one-team model)

## Non-Goals (for initial version)

- Cross-device/cloud sync or user accounts
- Role-based permissions or multi-coach collaboration
- Deep player identity sharing across teams (see Enhancements)

## User Stories

- As a coach, I can create multiple teams (e.g., U9, U10) and switch between them.
- As a coach, each team has its own roster; creating a game uses that roster by default.
- As a coach, I can optionally scope seasons/tournaments to a team and pick them during game creation.
- As a coach, saved games, stats, and loads are filtered to the active team.

## Data Model Changes

### New Entities

```typescript
// New team entity (stored locally)
export interface Team {
  id: string;                 // team_...
  name: string;               // "PEPO U10"
  color?: string;             // brand/accent (optional)
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
}

// Team roster item (reuse existing Player shape where possible)
export interface TeamPlayer {
  id: string;                 // player_...
  name: string;
  nickname?: string;
  jerseyNumber?: string;
  isGoalie?: boolean;
  color?: string;
  // future: linkId to a shared person profile
}
```

### Existing Types to Extend

```typescript
// Saved game state (existing AppState) – add teamId
export interface AppState {
  // ...existing fields...
  teamId?: string;            // NEW: the team this game belongs to
}

// Seasons and Tournaments (add optional team scoping)
export interface Season { id: string; name: string; /* ... */ teamId?: string; }
export interface Tournament { id: string; name: string; /* ... */ teamId?: string; }

// External adjustments already support teamId (keep as-is)
export interface PlayerStatAdjustment { teamId?: string; /* existing fields */ }
```

Notes:
- AppState gains `teamId` for filtering and attribution.
- `Season`/`Tournament` get optional `teamId`. If omitted, they are global (selectable by any team if desired).

## Storage & Keys

Use consistent key naming (see `src/config/storageKeys.ts`). Proposed keys:

- `soccerTeamsIndex` → `{ [teamId: string]: Team }`
- `soccerActiveTeamId` → `string | null`
- `soccerTeamRosters` → `{ [teamId: string]: TeamPlayer[] }`
- Reuse existing:
  - `savedGames` (game objects gain `teamId`; listing functions must filter by active team)
  - `PLAYER_ADJUSTMENTS_KEY` (entries should include `teamId` going forward)
  - seasons/tournaments storage – extend objects with `teamId`

Alternative: store rosters inline within `soccerTeamsIndex`. Chosen split (separate `soccerTeamRosters`) avoids large index payload updates on each roster change.

### React Query Keys (Team-Aware)

Update `src/config/queryKeys.ts` to be team-aware so caches are scoped and invalidated per team:

```ts
// src/config/queryKeys.ts
export const queryKeys = {
  masterRoster: (teamId: string) => ['teams', teamId, 'roster'] as const,
  seasons: (teamId?: string) => ['seasons', teamId ?? 'global'] as const,
  tournaments: (teamId?: string) => ['tournaments', teamId ?? 'global'] as const,
  savedGames: (teamId?: string) => ['savedGames', teamId ?? 'all'] as const,
  appSettingsCurrentGameId: ['appSettingsCurrentGameId'] as const,
};
```

Refactor `useGameDataQueries` to accept `teamId` and use these keys. On team switch, call `queryClient.invalidateQueries({ queryKey: ['teams', oldTeamId] })` and invalidate per-resource keys as needed.

## Migration Strategy (Backward Compatibility)

Trigger once at app startup (idempotent):

1. Create a default team from current data
   - Generate `team_<timestamp>`; name from current default team name (from settings or fallback "My Team").
   - Write to `soccerTeamsIndex`; set `soccerActiveTeamId`.
2. Move roster into `soccerTeamRosters[teamId]`
   - Copy players from `getMasterRoster()`
3. Tag existing seasons/tournaments with `teamId`
   - Update season/tournament objects to include the new team id
4. Update saved games to include `teamId`
   - For each saved game, set `teamId` to the default team
5. External player adjustments
   - For entries without `teamId`, set to default team id (non-destructive; preserves external context fields)

Store a migration version flag (e.g., `appDataVersion = 2`) to skip on subsequent runs.

Additional migration notes:
- Ensure every `PlayerStatAdjustment` without `teamId` is assigned to the default team.
- Normalize any local `DEFAULT_GAME_ID` redefinitions to use `src/config/constants.ts`.

## API/Utils Changes

Introduce team-aware variants with safe defaults and maintain wrappers for backward compatibility.

- Roster
  - `getMasterRoster()` → deprecate; new `getTeamRoster(teamId: string)`
  - `addPlayerToRoster(teamId, player)`, `updatePlayerInRoster(teamId, player)`, `removePlayerFromRoster(teamId, playerId)`
  - Provide `getActiveTeamId()` and `setActiveTeamId()` in `appSettings`

- Seasons/Tournaments
  - `getSeasons(teamId?: string)` – when provided, filter by `teamId` or global
  - `addSeason({... , teamId })` – require team context in UI flows

- Saved Games
  - When creating a game, require `teamId` and store on `AppState`
  - Update list/load/export functions to filter by `teamId` (except backups)

- Player Stats
  - Prefer adding optional `teamId?: string` to `calculatePlayerStats(...)` and filter inside the function.
  - Alternatively, enforce pre-filtered inputs at call sites; in either case, update `PlayerStatsView` to pass `teamId` and to request team-scoped adjustments.

- Player Adjustments
  - Add `getAdjustmentsForPlayer(playerId: string, teamId?: string)` and filter by `teamId` when provided.
  - When saving new adjustments, always set `teamId`.

## UI/UX Updates

### Global/Start Screen

- Team Switcher (top or start screen): shows active team; dropdown to switch; shortcut to Team Manager
- First-time experience: if no teams exist → show "Create Team" primary action
- Buttons and detection (`hasPlayers`, `hasSavedGames`, etc.) are computed for the active team context

### Team Manager (New Modal)

- CRUD teams: Create, Rename, Delete (with confirmation), Duplicate
- Manage roster for the selected team (reuses current RosterSettings UI scoped by `teamId`)
- Optional: team color/logo

### New Game Setup

- Add "Team" selector (required if multiple teams exist; preselect active team)
- Seasons/Tournaments dropdown filtered by the chosen team (plus global items)

### HomePage / Field

- All roster-related actions use the active team’s roster
- Overlays and warnings remain unchanged but respect team-scoped state

### Load Game

- Filter by active team; show a team badge on each game card
- If user loads a game from another team, prompt to switch active team (and then load)

### Stats

- Player stats and adjustments views filter data by team
- Add a team selector where relevant

### Backup/Restore

- Backup includes teams index, rosters, and team-linked fields
- Restore older backups triggers the migration flow

## i18n Keys (Additions)

```json
// startScreen
"startScreen": {
  "team": "Team",
  "createTeam": "Create Team",
  "manageTeams": "Manage Teams"
}

// teamManager
"teamManager": {
  "title": "Teams",
  "newTeam": "New Team",
  "rename": "Rename",
  "duplicate": "Duplicate",
  "delete": "Delete",
  "confirmDelete": "Delete team \"{name}\"? All associated data remains but will be unassigned.",
  "namePlaceholder": "Team name",
  "roster": "Roster",
  "noTeams": "No teams yet. Create your first team to get started."
}
```

## Code Impact Assessment (Current Codebase)

### Roster Dependencies and Single-Team Assumptions

- Direct usages of `getMasterRoster()`:
  - `src/app/page.tsx` (first-time checks)
  - `src/components/NewGameSetupModal.tsx`
  - `src/utils/masterRoster.ts` (internal operations repeatedly call `getMasterRoster()`)
  - Tests under `src/utils/masterRoster*.test.ts`
- Manager wrapper: `src/utils/masterRosterManager.ts` exposes `getMasterRoster` etc.

Action items:
- Introduce `getTeamRoster(teamId: string)` and `getActiveTeamId()`.
- Provide temporary shim `getMasterRoster = () => getTeamRoster(getActiveTeamId())` in `masterRosterManager.ts` to limit blast radius while refactoring.
- Replace imports of `getMasterRoster` in UI files with the team-aware versions.

### React Query Usage and Cache Strategy

- Current keys (team-agnostic): `src/config/queryKeys.ts` uses static arrays like `['masterRoster']`, `['savedGames']`.
- TanStack usage found in:
  - `src/components/HomePage.tsx` (useMutation/useQueryClient)
  - `src/hooks/useGameDataQueries.ts` (useQuery)

Action items:
- Refactor `queryKeys` to functions with `teamId` (see proposal above).
- Update `useGameDataQueries(teamId)` to use team keys and filter data accordingly.
- On active team change, invalidate `masterRoster(teamId)`, `seasons(teamId)`, `tournaments(teamId)`, and optionally `savedGames(teamId)`.

### Stats Calculations and External Adjustments

- `src/utils/playerStats.ts` iterates all `savedGames` without team filtering and merges adjustments with no team filter.
- `src/components/PlayerStatsView.tsx` calls `getAdjustmentsForPlayer(player.id)` without `teamId` and passes unfiltered `savedGames`.

Action items:
- Add optional `teamId` param to `calculatePlayerStats` and filter:
  - Only include games where `game.teamId === teamId` (when provided)
  - Only include seasons/tournaments where `teamId` matches or is global
- Extend `getAdjustmentsForPlayer(playerId, teamId)` to filter by `teamId`.
- Update `PlayerStatsView` to pass `teamId` (from active team context) to both calls.

### DEFAULT_GAME_ID Workspace

- Source of truth: `src/config/constants.ts` → `export const DEFAULT_GAME_ID = 'unsaved_game'`.
- Inconsistency: `src/components/LoadGameModal.tsx` defines `const DEFAULT_GAME_ID = '__default_unsaved__';` locally.

Action items:
- Replace local constant with import from `@/config/constants` to ensure consistent behavior and easier team scoping later.
- Keep workspace behavior per active team (unsaved workspace should be isolated by team context in UI logic).

### Team Deletion and Orphaned Data

Policy options (pick one for v1):
- Prevent deletion if any games/seasons/tournaments exist for the team (surface counts in confirm modal).
- Or allow soft delete: mark team as archived and keep data accessible in read-only mode until reassigned.

Implementation notes:
- If soft delete: add `archived?: boolean` to `Team` and hide by default; add a reassignment tool later.

## Implementation Progress

### ✅ Phase 1: Data Layer & Migration (In Progress)
- ✅ Fixed DEFAULT_GAME_ID inconsistency (`LoadGameModal.tsx` now imports from constants)
- ✅ Added Team and TeamPlayer interfaces to types
- ✅ Extended Season, Tournament, and AppState with optional `teamId`
- ✅ Added new storage keys: `TEAMS_INDEX_KEY`, `ACTIVE_TEAM_ID_KEY`, `TEAM_ROSTERS_KEY`, `APP_DATA_VERSION_KEY`
- ✅ Created complete `src/utils/teams.ts` with CRUD operations
- ✅ Implemented comprehensive migration system in `src/utils/migration.ts`
- 🚧 Next: Add team-aware React Query keys

## Phased Implementation & Estimates

1) Data Layer & Migration (1–2 days)
- ✅ Add storage keys, team entity, migration function, `teamId` on games/seasons/tournaments
- ✅ Active team setting; wrappers for old utils

2) Core UI – Team Switcher & Manager (1–2 days)
- Start screen updates; simple Team Manager modal; roster scoped by team

3) Game Creation & Filtering (1–2 days)
- Team selection in New Game Setup; filter Load Game by team; `AppState.teamId` usage

4) Seasons/Tournaments Scoping (0.5–1 day)
- Filter and creation flows set `teamId`; show badge

5) Stats & Adjustments (0.5–1 day)
- Filter inputs/outputs by team; ensure adjustments carry teamId

6) Polish & Back-Compat Cleanup (0.5–1 day)
- Remove deprecated entry points; finalize documentation; QA

Total: ~4–8 days depending on depth and polish.

## Difficulty & Risk

- Difficulty: Medium-High – touches multiple modules (roster, games, seasons/tournaments, stats)
- Primary risks:
  - Migration correctness (assigning `teamId` reliably)
  - Hidden usages of one-team assumptions (e.g., `getMasterRoster()`)
  - UI surface area (filters, selectors) introducing complexity

Mitigations:
- Keep a clear Active Team context
- Maintain compatibility wrappers temporarily
- Add visible team badges in UI where ambiguity is possible

## Blind Spots / Decisions

- Shared players across teams: are they independent copies or linked profiles?
  - v1: independent per-team roster; later: optional shared "Person" profiles
- Seasons/Tournaments across teams: allow global items; recommend scoping to team for clarity
- External Adjustments: ensure `teamId` is set to avoid cross-team pollution
- Temporary workspace (`DEFAULT_GAME_ID`): remains per active team context
- Data import from older backups: migration reliability and id collisions

## Enhancements (Future)

- Team branding (logo, colors), quick theme per team
- Player linking across teams (single identity, per-team jersey numbers)
- Opponent library per team
- Calendar/schedule per team and cross-team views
- Multi-coach profiles and permissions

## Acceptance Criteria

- Users can create 2+ teams and switch between them
- Each team has an independent roster; creating a game requires/selects a team
- Load Game shows only that team’s games by default (with an option to view all)
- Seasons/Tournaments can be created for a team and are available in creation flows
- Migration preserves existing data and creates a default team with prior roster/games

## Test Plan (High-Level)

- Migration: cold start with existing data → default team created, data tagged
- Team CRUD: create/rename/duplicate/delete; roster operations per team
- New Game: team selection; correct roster available; saved game has `teamId`
- Load/Stats: data filtered by team; switching team updates lists
- Seasons/Tournaments: filtering and association behavior


## Detailed Testing Plan

### Migration Tests
- Seed legacy data (single roster, saved games, seasons/tournaments, adjustments without teamId) and run app init → verify:
  - Default team created and set active; roster copied into `soccerTeamRosters[teamId]`
  - All saved games now have `teamId`
  - Seasons/Tournaments tagged with `teamId`
  - Adjustments without `teamId` assigned to default team
  - Idempotency: running migration twice makes no additional changes

### Cross-Team Scenarios
- Create two teams A and B with distinct rosters; create games for both; assert:
  - Load Game lists only active team by default; toggling team switches list
  - New Game Setup preselects active team; switching team updates selectable roster
  - Stats show only games/adjustments for active team
  - Seasons/Tournaments dropdowns reflect team scoping + global items

### Query & Caching
- Verify `useGameDataQueries(teamId)` re-fetches on team change and invalidates relevant caches
- Ensure no data leaks between teams in UI when switching rapidly

### Workspace Behavior
- With `DEFAULT_GAME_ID`, ensure overlays/warnings work per active team context (no cross bleed)

### Deletion Policies
- Prevent deletion when dependent entities exist (or validate archive flow if chosen)

## UI Polish – Team Switcher

- Placement: top bar or start screen; always visible when >1 team exists
- Behavior:
  - Show active team name with badge/color
  - Opening menu shows all teams + “Manage Teams” and “Create Team”
  - Indicate loading state during team switch (spinner on button + optimistic UI)
- Accessibility:
  - Keyboard navigable menu; ARIA roles; focus management
  - Localized labels using new i18n keys


