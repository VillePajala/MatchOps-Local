# Team Management (Multi‑Team Support)

## Overview
Manage multiple teams as curated sub-rosters. Select a team during game creation to auto-load roster and persist `teamId` on the game. Filter Load/Stats by team.

## Key Behaviors
- Teams (CRUD) with per-team rosters
- New Game: team dropdown ("No Team" uses master roster); roster auto-loads; team name auto-fills
- Load Game: filter by All / each Team / Legacy
- Stats: team filter (optional), passed to calculators

## Data Model (summary)
- `Team` and `TeamRoster` stored via `soccerTeams`, `soccerTeamRosters`
- `AppState.teamId?: string` (per-game association)
- Seasons/Tournaments remain global

## Files
- Data: `src/utils/teams.ts`
- New Game: `src/components/NewGameSetupModal.tsx`
- Load: `src/components/LoadGameModal.tsx`
- Stats: `src/components/GameStatsModal.tsx`, `src/components/PlayerStatsView.tsx`, `src/utils/playerStats.ts`
- Team Manager: `src/components/TeamManagerModal.tsx`, `src/components/TeamRosterModal.tsx`

## i18n
- `teamManager.*`, `newGameSetupModal.*`, `loadGameModal.*`, `gameStatsModal.*`, `controlBar.manageTeams`

## Full Design & Acceptance Criteria
See `../../MULTI-TEAM-SUPPORT.md` for the complete plan, risks, migration, testing, and success criteria.
