# User-Scoped Storage Plan - Data Model Verification

**Purpose**: Verify the user-scoped plan matches the actual IndexedDB schema from master branch.
**Created**: 2026-01-30
**Status**: VERIFIED - All mappings confirmed against master branch

### Related Documents

| Document | Purpose |
|----------|---------|
| [user-scoped-storage-plan-v2.md](./user-scoped-storage-plan-v2.md) | Main implementation plan |
| [supabase-schema.md](../02-technical/database/supabase-schema.md) | Supabase PostgreSQL schema |
| [current-storage-schema.md](../02-technical/database/current-storage-schema.md) | IndexedDB storage schema |

---

## Executive Summary

**VERIFIED**: The data model is correctly mapped between IndexedDB and Supabase:
- 10 storage keys → 16 Supabase tables
- 10 foreign keys correctly identified
- 13 intentionally missing FKs for graceful degradation
- All field mappings verified (camelCase → snake_case)
- Game data correctly splits into 5 tables

---

## Actual Storage Keys (from master:src/config/storageKeys.ts)

| Key Constant | Value | Format (from types) |
|--------------|-------|---------------------|
| `MASTER_ROSTER_KEY` | `soccerMasterRoster` | `Player[]` |
| `TEAMS_INDEX_KEY` | `soccerTeamsIndex` | `Record<string, Team>` |
| `TEAM_ROSTERS_KEY` | `soccerTeamRosters` | `Record<string, TeamPlayer[]>` |
| `SEASONS_LIST_KEY` | `soccerSeasons` | `Season[]` |
| `TOURNAMENTS_LIST_KEY` | `soccerTournaments` | `Tournament[]` |
| `SAVED_GAMES_KEY` | `savedSoccerGames` | `Record<string, AppState>` |
| `PERSONNEL_KEY` | `soccerPersonnel` | `Record<string, Personnel>` |
| `PLAYER_ADJUSTMENTS_KEY` | `soccerPlayerAdjustments` | `Record<string, PlayerStatAdjustment[]>` |
| `WARMUP_PLAN_KEY` | `soccerWarmupPlan` | `WarmupPlan` |
| `APP_SETTINGS_KEY` | `soccerAppSettings` | `AppSettings` |
| `TIMER_STATE_KEY` | `soccerTimerState` | `TimerState` (session only) |

---

## Actual Relationships (from master branch types)

### Game (AppState) → Other Entities

| Field | Target | FK in Supabase? | Notes |
|-------|--------|-----------------|-------|
| `seasonId` | Season.id | YES (SET NULL) | Empty string = unassigned |
| `tournamentId` | Tournament.id | YES (SET NULL) | Empty string = unassigned |
| `tournamentSeriesId` | TournamentSeries.id | NO | Within tournament.series[] jsonb |
| `tournamentLevel` | Legacy string | NO | Free text |
| `teamId` | Team.id | YES (SET NULL) | Optional |
| `gamePersonnel[]` | Personnel.id[] | NO | Array stored as text[] |
| `playersOnField[].id` | Player snapshot | NO | Full player data embedded |
| `availablePlayers[].id` | Player snapshot | NO | Full player data embedded |
| `selectedPlayerIds[]` | Player IDs | NO | IDs only, no FK |
| `assessments[playerId]` | Keyed by player | NO | Embedded in game |
| `gameEvents[].scorerId` | Player.id | NO | Graceful degradation |
| `gameEvents[].assisterId` | Player.id | NO | Graceful degradation |
| `gameEvents[].entityId` | Any entity ID | NO | Generic reference |

### Team → Other Entities

| Field | Target | FK in Supabase? | Notes |
|-------|--------|-----------------|-------|
| `boundSeasonId` | Season.id | NO | Context binding, no FK |
| `boundTournamentId` | Tournament.id | NO | Context binding, no FK |
| `boundTournamentSeriesId` | TournamentSeries.id | NO | Context binding, no FK |

### TeamRosters → Other Entities

| Field | Target | FK in Supabase? | Notes |
|-------|--------|-----------------|-------|
| Key (teamId) | Team.id | YES (CASCADE) | team_players.team_id |
| Entry[].id | Player.id | NO | Same ID as master roster, NO FK |

### Tournament → Other Entities

| Field | Target | FK in Supabase? | Notes |
|-------|--------|-----------------|-------|
| `awardedPlayerId` | Player.id | NO | Graceful degradation |
| `teamPlacements[teamId]` | Team.id | NO | jsonb, no FK |
| `series[].id` | TournamentSeries | NO | jsonb array |

### Season → Other Entities

| Field | Target | FK in Supabase? | Notes |
|-------|--------|-----------------|-------|
| `teamPlacements[teamId]` | Team.id | NO | jsonb, no FK |

### PlayerStatAdjustment → Other Entities

| Field | Target | FK in Supabase? | Notes |
|-------|--------|-----------------|-------|
| `playerId` | Player.id | NO | Graceful degradation |
| `seasonId` | Season.id | YES (SET NULL) | Optional |
| `tournamentId` | Tournament.id | YES (SET NULL) | Optional |
| `teamId` | Team.id or "External" | NO | Can be non-ID value |

---

## Supabase Tables → Storage Keys Mapping

| Supabase Table | Storage Key | Notes |
|----------------|-------------|-------|
| `players` | `MASTER_ROSTER_KEY` | Array → rows |
| `teams` | `TEAMS_INDEX_KEY` | Record values → rows |
| `team_players` | `TEAM_ROSTERS_KEY` | Nested arrays → rows |
| `seasons` | `SEASONS_LIST_KEY` | Array → rows |
| `tournaments` | `TOURNAMENTS_LIST_KEY` | Array → rows |
| `games` | `SAVED_GAMES_KEY` | Record values → rows (main table) |
| `game_players` | `SAVED_GAMES_KEY` | Game's player arrays → rows |
| `game_events` | `SAVED_GAMES_KEY` | Game's events array → rows |
| `game_tactical_data` | `SAVED_GAMES_KEY` | Game's tactical fields → single row |
| `player_assessments` | `SAVED_GAMES_KEY` | Game's assessments → rows |
| `personnel` | `PERSONNEL_KEY` | Record values → rows |
| `player_adjustments` | `PLAYER_ADJUSTMENTS_KEY` | Nested arrays → rows |
| `warmup_plans` | `WARMUP_PLAN_KEY` | Single object → single row |
| `user_settings` | `APP_SETTINGS_KEY` | Single object → single row |
| `user_consents` | N/A (cloud only) | GDPR consent records |
| `subscriptions` | N/A (cloud only) | Play Store billing |

---

## Foreign Keys in Supabase Schema (DEFINITIVE LIST)

### FKs That EXIST (need composite conversion):

1. `team_players.team_id → teams.id` (CASCADE)
2. `games.team_id → teams.id` (SET NULL)
3. `games.season_id → seasons.id` (SET NULL)
4. `games.tournament_id → tournaments.id` (SET NULL)
5. `game_events.game_id → games.id` (CASCADE)
6. `game_players.game_id → games.id` (CASCADE)
7. `game_tactical_data.game_id → games.id` (CASCADE)
8. `player_assessments.game_id → games.id` (CASCADE)
9. `player_adjustments.season_id → seasons.id` (SET NULL)
10. `player_adjustments.tournament_id → tournaments.id` (SET NULL)
11. All `user_id → auth.users.id` (CASCADE)

### FKs That DO NOT EXIST (intentionally, for graceful degradation):

- `team_players.player_id` → NO FK to players
- `game_players.player_id` → NO FK to players
- `game_events.scorer_id/assister_id/entity_id` → NO FK
- `player_assessments.player_id` → NO FK
- `player_adjustments.player_id` → NO FK
- `player_adjustments.team_id` → NO FK (can be "External")
- `tournaments.awarded_player_id` → NO FK
- `teams.bound_season_id/bound_tournament_id/bound_tournament_series_id` → NO FK
- `seasons.team_placements` → NO FK (jsonb)
- `tournaments.team_placements` → NO FK (jsonb)
- `tournaments.series` → NO FK (jsonb)
- `games.game_personnel` → NO FK (text[])
- `games.tournament_series_id` → NO FK
- `games.tournament_level` → NO FK

---

## Verification Checklist

- [x] All 10 storage keys mapped to Supabase tables
- [x] All 10 table FKs identified and listed for composite conversion
- [x] All "no FK" relationships documented (13 fields)
- [x] Graceful degradation preserved (player references have no FK)
- [x] team_players has FK to teams only, NOT to players
- [x] Personnel cascade delete is app-level (remove from gamePersonnel arrays)
- [x] Game data correctly splits into 5 tables
- [x] Assessment sliders correctly flatten from nested object to columns
- [x] Event order preserved via order_index column

---

## Complete Data Flow: IndexedDB ↔ Supabase

### 1. MASTER ROSTER (MASTER_ROSTER_KEY)

```
IndexedDB: Player[]  →  Supabase: players table

Field Mapping:
  id                    → id
  name                  → name
  nickname              → nickname
  jerseyNumber          → jersey_number
  isGoalie              → is_goalie
  color                 → color
  notes                 → notes
  receivedFairPlayCard  → received_fair_play_card

NOTE: relX/relY are NOT in master roster - they're per-game in game_players
```

### 2. TEAMS (TEAMS_INDEX_KEY)

```
IndexedDB: Record<string, Team>  →  Supabase: teams table

Field Mapping:
  id                      → id
  name                    → name
  boundSeasonId           → bound_season_id (NO FK)
  boundTournamentId       → bound_tournament_id (NO FK)
  boundTournamentSeriesId → bound_tournament_series_id (NO FK)
  gameType                → game_type
  ageGroup                → age_group
  color                   → color
  notes                   → notes
  archived                → archived
  createdAt               → created_at
  updatedAt               → updated_at
```

### 3. TEAM ROSTERS (TEAM_ROSTERS_KEY)

```
IndexedDB: Record<teamId, TeamPlayer[]>  →  Supabase: team_players table

Transform:
  - Key (teamId)     → team_id (FK→teams, CASCADE)
  - TeamPlayer.id    → player_id (NO FK - graceful degradation)
  - Generate new id  → id (format: {team_id}_{player_id})

Field Mapping for each TeamPlayer:
  id (master roster ID) → player_id (NO FK!)
  name                  → name
  nickname              → nickname
  jerseyNumber          → jersey_number
  isGoalie              → is_goalie
  color                 → color
  notes                 → notes
  receivedFairPlayCard  → received_fair_play_card
```

### 4. SEASONS (SEASONS_LIST_KEY)

```
IndexedDB: Season[]  →  Supabase: seasons table

All fields map camelCase → snake_case
Special transforms:
  teamPlacements (object) → team_placements (jsonb)
  gameDates (string[])    → game_dates (date[])
  series (object[])       → series (jsonb)
```

### 5. TOURNAMENTS (TOURNAMENTS_LIST_KEY)

```
IndexedDB: Tournament[]  →  Supabase: tournaments table

Special fields:
  awardedPlayerId  → awarded_player_id (NO FK - graceful degradation)
  series[]         → series (jsonb)
  teamPlacements   → team_placements (jsonb)
```

### 6. GAMES (SAVED_GAMES_KEY) - SPLITS INTO 5 TABLES

```
IndexedDB: Record<gameId, AppState>  →  Supabase: 5 TABLES

┌────────────────────────────────────────────────────────────────────────┐
│ TABLE 1: games (main game data)                                        │
├────────────────────────────────────────────────────────────────────────┤
│ seasonId        → season_id (FK→seasons, SET NULL)                     │
│ tournamentId    → tournament_id (FK→tournaments, SET NULL)             │
│ teamId          → team_id (FK→teams, SET NULL)                         │
│ gamePersonnel   → game_personnel (text[] - NO FK to personnel)         │
│ All scalar fields: homeScore, awayScore, gameStatus, etc.              │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ TABLE 2: game_players (from 3 arrays in AppState)                      │
├────────────────────────────────────────────────────────────────────────┤
│ Source arrays: playersOnField + availablePlayers + selectedPlayerIds   │
│                                                                        │
│ game_id    → FK→games (CASCADE)                                        │
│ player_id  → NO FK (graceful degradation)                              │
│                                                                        │
│ Derived fields:                                                        │
│   on_field    = player in playersOnField[]                             │
│   is_selected = player.id in selectedPlayerIds[]                       │
│   rel_x/rel_y = from playersOnField[].relX/relY (null if not on field) │
│                                                                        │
│ Player snapshot fields copied for historical accuracy                  │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ TABLE 3: game_events (from gameEvents[])                               │
├────────────────────────────────────────────────────────────────────────┤
│ game_id     → FK→games (CASCADE)                                       │
│ scorer_id   → NO FK (graceful degradation)                             │
│ assister_id → NO FK (graceful degradation)                             │
│ entity_id   → NO FK (generic reference)                                │
│                                                                        │
│ CRITICAL: order_index = array index (preserves insertion order)        │
│                                                                        │
│ type → event_type                                                      │
│ time → time_seconds                                                    │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ TABLE 4: game_tactical_data (tactical fields from AppState)            │
├────────────────────────────────────────────────────────────────────────┤
│ game_id (PK + FK→games CASCADE)                                        │
│                                                                        │
│ tacticalDiscs        → tactical_discs (jsonb)                          │
│ tacticalDrawings     → tactical_drawings (jsonb)                       │
│ tacticalBallPosition → tactical_ball_position (jsonb, can be null)     │
│ drawings             → drawings (jsonb)                                │
│ opponents            → opponents (jsonb)                               │
│ formationSnapPoints  → formation_snap_points (jsonb)                   │
│ completedIntervalDurations → completed_interval_durations (jsonb)      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ TABLE 5: player_assessments (from assessments object)                  │
├────────────────────────────────────────────────────────────────────────┤
│ game_id    → FK→games (CASCADE)                                        │
│ player_id  → NO FK (graceful degradation)                              │
│ id         → assessment_{game_id}_{player_id}                          │
│                                                                        │
│ FLATTENING: sliders.X → individual columns                             │
│   sliders.intensity  → intensity                                       │
│   sliders.courage    → courage                                         │
│   sliders.duels      → duels                                           │
│   sliders.technique  → technique                                       │
│   sliders.creativity → creativity                                      │
│   sliders.decisions  → decisions                                       │
│   sliders.awareness  → awareness                                       │
│   sliders.teamwork   → teamwork                                        │
│   sliders.fair_play  → fair_play                                       │
│   sliders.impact     → impact                                          │
│                                                                        │
│ overall        → overall_rating                                        │
│ notes          → notes                                                 │
│ minutesPlayed  → minutes_played                                        │
│ createdAt      → created_at (bigint - Unix timestamp ms)               │
│ createdBy      → created_by                                            │
└────────────────────────────────────────────────────────────────────────┘
```

### 7. PERSONNEL (PERSONNEL_KEY)

```
IndexedDB: Record<string, Personnel>  →  Supabase: personnel table

All fields map directly (camelCase → snake_case)
certifications[] → certifications (text[])

NOTE: games.game_personnel references personnel.id but has NO FK
      App-level cascade: removePersonnelMember() removes ID from all games
```

### 8. PLAYER ADJUSTMENTS (PLAYER_ADJUSTMENTS_KEY)

```
IndexedDB: Record<playerId, PlayerStatAdjustment[]>  →  Supabase: player_adjustments

Transform:
  - Key (playerId)  → player_id (NO FK - graceful degradation)
  - Each array item → one row

FK fields:
  seasonId     → season_id (FK→seasons, SET NULL)
  tournamentId → tournament_id (FK→tournaments, SET NULL)

NO FK fields:
  playerId → player_id (graceful degradation)
  teamId   → team_id (can be "External" - non-ID value)
```

---

## Graceful Degradation Summary

These fields intentionally have NO foreign key constraints:

| Field | Why No FK |
|-------|-----------|
| `team_players.player_id` | Player can be deleted, team roster entry survives with snapshot |
| `game_players.player_id` | Player can be deleted, game snapshot survives |
| `game_events.scorer_id` | Player can be deleted, goal record survives |
| `game_events.assister_id` | Player can be deleted, assist record survives |
| `game_events.entity_id` | Generic reference, may not be a player |
| `player_assessments.player_id` | Player can be deleted, assessment survives |
| `player_adjustments.player_id` | Player can be deleted, adjustment survives |
| `player_adjustments.team_id` | Can be "External" (non-ID value) |
| `tournaments.awarded_player_id` | Player can be deleted, award history survives |
| `teams.bound_season_id` | Season can be deleted, binding becomes stale (OK) |
| `teams.bound_tournament_id` | Tournament can be deleted, binding becomes stale (OK) |
| `games.game_personnel[]` | Personnel can be deleted, game record survives |
| `games.tournament_series_id` | Stored in tournament.series jsonb, no FK needed |

---

## User-Scoped Plan Impact

The user-scoped plan adds `user_id` to composite primary keys:

| Current PK | New Composite PK |
|------------|------------------|
| `id` | `(user_id, id)` |

This allows:
- Same entity ID to exist for different users
- Backup sharing between users (import preserves IDs)
- No ID regeneration or mapping needed

The 10 existing FKs become composite FKs:
- `FOREIGN KEY (game_id)` → `FOREIGN KEY (user_id, game_id)`
- etc.

This preserves all existing referential integrity while enabling multi-user data isolation.
