# External Matches (Player Stat Adjustments)

## Overview
Add player statistics from games played outside MatchOps and include them in totals, with optional season/tournament association.

## Data Model
- `PlayerStatAdjustment` (see `src/types/index.ts`): optional seasonId, tournamentId, teamId, externalTeamName, scores, date, includeInSeasonTournament, deltas, note

## Storage
- `PLAYER_ADJUSTMENTS_KEY` in localStorage
- CRUD in `src/utils/playerAdjustments.ts`

## Calculation
- `calculatePlayerStats(...)` processes saved games, then applies adjustments
- If `includeInSeasonTournament` is true, deltas contribute to season/tournament aggregates; always counted in totals

## UI
- `src/components/PlayerStatsView.tsx`
  - Add external stats button, expandable form, validation, and list of entries
  - Delete confirmation modal

## i18n
- Keys under `playerStats.*` in `public/locales/*/common.json`
