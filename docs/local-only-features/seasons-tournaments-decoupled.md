# Seasons & Tournaments – Roster-Decoupled

## What changed
- Seasons and tournaments no longer manage or carry any roster/team-specific data.
- They remain global organizational entities used to group games.

## Why
- Rosters are managed by Teams. Decoupling prevents data duplication and confusion and matches the multi-team design.

## Verification (code)
- Types are clean of roster/team ties:
  - `src/types/index.ts`:
    - `Season` only has `id`, `name`, optional metadata (no roster/team refs)
    - `Tournament` only has `id`, `name`, optional metadata (no roster/team refs)
- Utilities manage global lists only:
  - `src/utils/seasons.ts`: CRUD against seasons list; no roster logic
  - `src/utils/tournaments.ts`: CRUD against tournaments list; no roster logic
- Consumers use global data:
  - `getSeasons()` and `getTournaments()` used in `src/app/page.tsx`, `GameSettingsModal.tsx`
  - No occurrences of `seasonRoster`, `tournamentRoster`, or similar

## Backward compatibility
- Existing games continue to reference seasons/tournaments by id as before
- Any legacy accidental `teamId` on seasons/tournaments should be ignored/stripped by migration when present

## Testing checklist
- Create/update/delete seasons/tournaments works; no impact on team rosters
- New Game: season/tournament selectors list all global items regardless of team
- Stats: filtering by season/tournament works independent of team selection

## Related docs
- Teams and per-team rosters: `team-management.md`
- Full plan: `../../MULTI-TEAM-SUPPORT.md`
