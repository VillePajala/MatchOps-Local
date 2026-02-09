# Supabase Implementation Verification Matrix

**Purpose**: Single source of truth mapping every TypeScript field to schema column and transform logic.
**Status**: Ready for verification
**Created**: January 11, 2026

Use this document to verify the implementation plan is complete and correct. Each field should be checked against:
1. TypeScript type definition
2. Schema column definition
3. Forward transform (App → DB)
4. Reverse transform (DB → App)
5. Test data presence

---

## Verification Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Verified correct |
| ❌ | Issue found |
| ⚠️ | Needs attention |
| 🔍 | To verify |

---

## 1. AppState → games Table

**TypeScript**: `src/types/game.ts` (AppState interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (games table)
**Transform**: `docs/03-active-plans/supabase-implementation-guide.md` (transformGameToTables)

### 1.1 Required String Fields

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|----------|---------|-------------------|-------------------|-----------|
| `teamName` | `string` | `team_name` | `text NOT NULL` | No | - | Direct | Direct | 🔍 |
| `opponentName` | `string` | `opponent_name` | `text NOT NULL` | No | - | Direct | Direct | 🔍 |
| `gameDate` | `string` | `game_date` | `date NOT NULL` | No | - | Direct | Direct | 🔍 |
| `gameNotes` | `string` | `game_notes` | `text NOT NULL` | No | `''` | Direct | Direct | 🔍 |

### 1.2 Required Enum Fields

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|----------|---------|-------------------|-------------------|-----------|
| `homeOrAway` | `'home' \| 'away'` | `home_or_away` | `text NOT NULL CHECK(...)` | No | `'home'` | `?? 'home'` | Direct | 🔍 |
| `gameStatus` | `'notStarted' \| 'inProgress' \| 'periodEnd' \| 'gameEnd'` | `game_status` | `text NOT NULL CHECK(...)` | No | `'notStarted'` | Direct | Direct | 🔍 |
| `numberOfPeriods` | `1 \| 2` | `number_of_periods` | `integer NOT NULL CHECK(...)` | No | `2` | Direct | Direct | 🔍 |

### 1.3 Required Number Fields

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|----------|---------|-------------------|-------------------|-----------|
| `homeScore` | `number` | `home_score` | `integer NOT NULL` | No | `0` | Direct | Direct | 🔍 |
| `awayScore` | `number` | `away_score` | `integer NOT NULL` | No | `0` | Direct | Direct | 🔍 |
| `currentPeriod` | `number` | `current_period` | `integer NOT NULL` | No | `1` | Direct | Direct | 🔍 |
| `periodDurationMinutes` | `number` | `period_duration_minutes` | `integer NOT NULL` | No | - | Direct | Direct | 🔍 |

### 1.4 Required Boolean Fields

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|----------|---------|-------------------|-------------------|-----------|
| `showPlayerNames` | `boolean` | `show_player_names` | `boolean NOT NULL` | No | `true` | Direct | Direct | 🔍 |

### 1.5 Optional String Fields (Empty String ↔ NULL)

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|----------|---------|-------------------|-------------------|-----------|
| `seasonId` | `string` | `season_id` | `text` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |
| `tournamentId` | `string` | `tournament_id` | `text` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |
| `tournamentSeriesId` | `string?` | `tournament_series_id` | `text` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |
| `tournamentLevel` | `string?` | `tournament_level` | `text` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |
| `teamId` | `string?` | `team_id` | `text` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |
| `gameTime` | `string?` | `game_time` | `time` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |
| `gameLocation` | `string?` | `game_location` | `text` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |
| `ageGroup` | `string?` | `age_group` | `text` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |
| `leagueId` | `string?` | `league_id` | `text` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |
| `customLeagueName` | `string?` | `custom_league_name` | `text` | Yes | - | `'' → NULL` | `NULL → ''` | 🔍 |

### 1.6 Optional Enum Fields

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|----------|---------|-------------------|-------------------|-----------|
| `gameType` | `'soccer' \| 'futsal'?` | `game_type` | `text CHECK(...)` | Yes | - | Direct | Direct | 🔍 |
| `gender` | `'boys' \| 'girls'?` | `gender` | `text CHECK(...)` | Yes | - | Direct | Direct | 🔍 |

### 1.7 Optional Number Fields

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|----------|---------|-------------------|-------------------|-----------|
| `subIntervalMinutes` | `number?` | `sub_interval_minutes` | `integer` | Yes | - | Direct | Direct | 🔍 |
| `demandFactor` | `number?` | `demand_factor` | `numeric(4,2) CHECK(0.1-10)` | Yes | - | Direct | Direct | 🔍 |
| `timeElapsedInSeconds` | `number?` | `time_elapsed_in_seconds` | `numeric(10,3)` | Yes | - | Direct | Direct | 🔍 |

### 1.8 Optional Boolean Fields

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Forward Transform | Reverse Transform | CRITICAL Notes | Test Data |
|----------|---------|---------------|-------------|----------|---------|-------------------|-------------------|----------------|-----------|
| `isPlayed` | `boolean?` | `is_played` | `boolean NOT NULL` | No | `false` | `?? true` (legacy!) | Direct | **Default TRUE for undefined** | 🔍 |

### 1.9 Array/Object Fields

| TS Field | TS Type | Schema Column | Schema Type | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|-------------------|-------------------|-----------|
| `gamePersonnel` | `string[]?` | `game_personnel` | `text[]` | `?? []` | `?? []` | 🔍 |
| `formationSnapPoints` | `Point[]?` | `formation_snap_points` | `jsonb` | Direct | Direct | 🔍 |
| `completedIntervalDurations` | `IntervalLog[]?` | → `game_tactical_data` | `jsonb` | Direct | Direct | 🔍 |
| `lastSubConfirmationTimeSeconds` | `number?` | → `game_tactical_data` | `numeric(10,3)` | Direct | Direct | 🔍 |

### 1.10 Fields Stored in Related Tables

| TS Field | TS Type | Target Table | Notes |
|----------|---------|--------------|-------|
| `playersOnField` | `Player[]` | `game_players` | `on_field=true`, has relX/relY |
| `availablePlayers` | `Player[]` | `game_players` | All players for game |
| `selectedPlayerIds` | `string[]` | `game_players` | `is_selected=true` |
| `gameEvents` | `GameEvent[]` | `game_events` | Separate table |
| `assessments` | `Record<string, PlayerAssessment>` | `player_assessments` | Separate table |
| `opponents` | `Opponent[]` | `game_tactical_data` | `jsonb`, defaults `?? []` |
| `drawings` | `Point[][]` | `game_tactical_data` | `jsonb`, defaults `?? []` |
| `tacticalDiscs` | `TacticalDisc[]` | `game_tactical_data` | `jsonb`, defaults `?? []` |
| `tacticalDrawings` | `Point[][]` | `game_tactical_data` | `jsonb`, defaults `?? []` |
| `tacticalBallPosition` | `Point \| null` | `game_tactical_data` | `jsonb`, defaults `?? null` |

---

## 2. Player → game_players Table

**TypeScript**: `src/types/index.ts` (Player interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (game_players table)

### 2.1 Player Fields in game_players

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|----------|-------------------|-------------------|-----------|
| `id` | `string` | `player_id` | `text NOT NULL` | No | Direct | Direct | 🔍 |
| `name` | `string` | `player_name` | `text NOT NULL` | No | Direct | Direct | 🔍 |
| `nickname` | `string?` | `nickname` | `text` | Yes | `?? ''` | `?? ''` | 🔍 |
| `jerseyNumber` | `string?` | `jersey_number` | `text` | Yes | `?? ''` | `?? ''` | 🔍 |
| `isGoalie` | `boolean?` | `is_goalie` | `boolean` | Yes | `?? false` | `?? false` | 🔍 |
| `color` | `string?` | `color` | `text` | Yes | Direct | Direct | 🔍 |
| `notes` | `string?` | `notes` | `text` | Yes | `?? ''` | `?? ''` | 🔍 |
| `receivedFairPlayCard` | `boolean?` | `received_fair_play_card` | `boolean` | Yes | `?? false` | `?? false` | 🔍 |
| `relX` | `number?` | `rel_x` | `double precision` | Yes | Only if on_field | Only if on_field | 🔍 |
| `relY` | `number?` | `rel_y` | `double precision` | Yes | Only if on_field | Only if on_field | 🔍 |

### 2.2 game_players Status Flags

| Schema Column | Schema Type | Derived From | Notes |
|---------------|-------------|--------------|-------|
| `id` | `text PRIMARY KEY` | `{game_id}_{player_id}` | Composite key |
| `is_selected` | `boolean` | `selectedPlayerIds.has(id) \|\| on_field` | **CRITICAL: Normalize on_field→selected** |
| `on_field` | `boolean` | `playersOnField.some(p => p.id === id)` | Has relX/relY |

### 2.3 CRITICAL: Player Array Reconstruction

```
Forward Transform:
- Use availablePlayers as base (all game participants)
- is_selected = selectedPlayerIds.includes(id) || isOnField  ← NORMALIZE!
- on_field = playersOnField.some(p => p.id === id)
- rel_x/rel_y from playersOnField version if on_field

Reverse Transform:
- availablePlayers = ALL game_players (no relX/relY)
- playersOnField = game_players WHERE on_field=true (WITH relX/relY)
- selectedPlayerIds = game_players WHERE is_selected=true
```

---

## 3. GameEvent → game_events Table

**TypeScript**: `src/types/game.ts` (GameEvent interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (game_events table)

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Forward Transform | Reverse Transform | Test Data |
|----------|---------|---------------|-------------|----------|-------------------|-------------------|-----------|
| `id` | `string` | `id` | `text PRIMARY KEY` | No | Direct | Direct | 🔍 |
| `type` | `EventType` | `event_type` | `text NOT NULL` | No | Direct | Direct | 🔍 |
| `time` | `number` | `time_seconds` | `numeric(10,2) NOT NULL` | No | Direct | Direct | 🔍 |
| (array index) | - | `order_index` | `integer NOT NULL` | No | Array index | Sort by this | 🔍 |
| `scorerId` | `string?` | `scorer_id` | `text` | Yes | Direct | Direct | 🔍 |
| `assisterId` | `string?` | `assister_id` | `text` | Yes | Direct | Direct | 🔍 |
| `entityId` | `string?` | `entity_id` | `text` | Yes | Direct | Direct | 🔍 |

---

## 4. PlayerAssessment → player_assessments Table

**TypeScript**: `src/types/game.ts` (PlayerAssessment interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (player_assessments table)

### 4.1 Top-Level Fields

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Transform | Test Data |
|----------|---------|---------------|-------------|----------|-----------|-----------|
| `overall` | `number` | `overall_rating` | `numeric(3,1)` | Yes | Direct | 🔍 |
| `notes` | `string` | `notes` | `text` | Yes | Direct | 🔍 |
| `minutesPlayed` | `number` | `minutes_played` | `integer` | Yes | Direct | 🔍 |
| `createdBy` | `string` | `created_by` | `text` | Yes | Direct | 🔍 |
| `createdAt` | `number` | `created_at` | `bigint NOT NULL` | No | Direct (epoch ms) | 🔍 |

### 4.2 Nested Sliders Object → Flattened Columns

| TS Field | TS Type | Schema Column | Schema Type | Test Data |
|----------|---------|---------------|-------------|-----------|
| `sliders.intensity` | `number` | `intensity` | `numeric(3,1)` | 🔍 |
| `sliders.courage` | `number` | `courage` | `numeric(3,1)` | 🔍 |
| `sliders.duels` | `number` | `duels` | `numeric(3,1)` | 🔍 |
| `sliders.technique` | `number` | `technique` | `numeric(3,1)` | 🔍 |
| `sliders.creativity` | `number` | `creativity` | `numeric(3,1)` | 🔍 |
| `sliders.decisions` | `number` | `decisions` | `numeric(3,1)` | 🔍 |
| `sliders.awareness` | `number` | `awareness` | `numeric(3,1)` | 🔍 |
| `sliders.teamwork` | `number` | `teamwork` | `numeric(3,1)` | 🔍 |
| `sliders.fair_play` | `number` | `fair_play` | `numeric(3,1)` | 🔍 |
| `sliders.impact` | `number` | `impact` | `numeric(3,1)` | 🔍 |

---

## 5. Season → seasons Table

**TypeScript**: `src/types/index.ts` (Season interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (seasons table)

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Test Data |
|----------|---------|---------------|-------------|----------|---------|-----------|
| `id` | `string` | `id` | `text PRIMARY KEY` | No | - | 🔍 |
| `name` | `string` | `name` | `text NOT NULL` | No | - | 🔍 |
| `location` | `string?` | `location` | `text` | Yes | - | 🔍 |
| `periodCount` | `1 \| 2?` | `period_count` | `integer CHECK(1,2)` | Yes | - | 🔍 |
| `periodDuration` | `number?` | `period_duration` | `integer` | Yes | - | 🔍 |
| `startDate` | `string?` | `start_date` | `date` | Yes | - | 🔍 |
| `endDate` | `string?` | `end_date` | `date` | Yes | - | 🔍 |
| `gameDates` | `string[]?` | `game_dates` | `date[]` | Yes | - | 🔍 |
| `archived` | `boolean?` | `archived` | `boolean` | Yes | `false` | 🔍 |
| `notes` | `string?` | `notes` | `text` | Yes | - | 🔍 |
| `color` | `string?` | `color` | `text` | Yes | - | 🔍 |
| `badge` | `string?` | `badge` | `text` | Yes | - | 🔍 |
| `ageGroup` | `string?` | `age_group` | `text` | Yes | - | 🔍 |
| `gameType` | `'soccer' \| 'futsal'?` | `game_type` | `text CHECK(...)` | Yes | - | 🔍 |
| `gender` | `'boys' \| 'girls'?` | `gender` | `text CHECK(...)` | Yes | - | 🔍 |
| `leagueId` | `string?` | `league_id` | `text` | Yes | - | 🔍 |
| `customLeagueName` | `string?` | `custom_league_name` | `text` | Yes | - | 🔍 |
| `clubSeason` | `string?` | `club_season` | `text` | Yes | - | 🔍 |
| `teamPlacements` | `Record<string, TeamPlacement>?` | `team_placements` | `jsonb` | Yes | `'{}'` | 🔍 |

---

## 6. Tournament → tournaments Table

**TypeScript**: `src/types/index.ts` (Tournament interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (tournaments table)

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Test Data |
|----------|---------|---------------|-------------|----------|---------|-----------|
| `id` | `string` | `id` | `text PRIMARY KEY` | No | - | 🔍 |
| `name` | `string` | `name` | `text NOT NULL` | No | - | 🔍 |
| `location` | `string?` | `location` | `text` | Yes | - | 🔍 |
| `periodCount` | `1 \| 2?` | `period_count` | `integer CHECK(1,2)` | Yes | - | 🔍 |
| `periodDuration` | `number?` | `period_duration` | `integer` | Yes | - | 🔍 |
| `startDate` | `string?` | `start_date` | `date` | Yes | - | 🔍 |
| `endDate` | `string?` | `end_date` | `date` | Yes | - | 🔍 |
| `gameDates` | `string[]?` | `game_dates` | `date[]` | Yes | - | 🔍 |
| `archived` | `boolean?` | `archived` | `boolean` | Yes | `false` | 🔍 |
| `notes` | `string?` | `notes` | `text` | Yes | - | 🔍 |
| `color` | `string?` | `color` | `text` | Yes | - | 🔍 |
| `badge` | `string?` | `badge` | `text` | Yes | - | 🔍 |
| `level` | `string?` | `level` | `text` | Yes | - | 🔍 |
| `ageGroup` | `string?` | `age_group` | `text` | Yes | - | 🔍 |
| `series` | `TournamentSeries[]?` | `series` | `jsonb` | Yes | - | 🔍 |
| `awardedPlayerId` | `string?` | `awarded_player_id` | `text` | Yes | - | 🔍 |
| `teamPlacements` | `Record<string, TeamPlacement>?` | `team_placements` | `jsonb` | Yes | `'{}'` | 🔍 |
| `gameType` | `'soccer' \| 'futsal'?` | `game_type` | `text CHECK(...)` | Yes | - | 🔍 |
| `gender` | `'boys' \| 'girls'?` | `gender` | `text CHECK(...)` | Yes | - | 🔍 |
| `clubSeason` | `string?` | `club_season` | `text` | Yes | - | 🔍 |

---

## 7. Personnel → personnel Table

**TypeScript**: `src/types/personnel.ts` (Personnel interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (personnel table)

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Test Data |
|----------|---------|---------------|-------------|----------|---------|-----------|
| `id` | `string` | `id` | `text PRIMARY KEY` | No | - | 🔍 |
| `name` | `string` | `name` | `text NOT NULL` | No | - | 🔍 |
| `role` | `PersonnelRole` | `role` | `text NOT NULL` | No | `'other'` | 🔍 |
| `email` | `string?` | `email` | `text` | Yes | - | 🔍 |
| `phone` | `string?` | `phone` | `text` | Yes | - | 🔍 |
| `certifications` | `string[]?` | `certifications` | `text[]` | Yes | `'{}'` | 🔍 |
| `notes` | `string?` | `notes` | `text` | Yes | - | 🔍 |
| `createdAt` | `string` | `created_at` | `timestamptz` | No | `now()` | 🔍 |
| `updatedAt` | `string` | `updated_at` | `timestamptz` | No | `now()` | 🔍 |

**Transform**: `certifications: personnel.certifications ?? []` (forward) / `certifications ?? []` (reverse)

**CRITICAL**: `removePersonnelMember` implements CASCADE DELETE - removes personnel ID from all games' `gamePersonnel` arrays.

---

## 8. Team → teams Table

**TypeScript**: `src/types/index.ts` (Team interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (teams table)

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Test Data |
|----------|---------|---------------|-------------|----------|---------|-----------|
| `id` | `string` | `id` | `text PRIMARY KEY` | No | - | 🔍 |
| `name` | `string` | `name` | `text NOT NULL` | No | - | 🔍 |
| `boundSeasonId` | `string?` | `bound_season_id` | `text` | Yes | - | 🔍 |
| `boundTournamentId` | `string?` | `bound_tournament_id` | `text` | Yes | - | 🔍 |
| `boundTournamentSeriesId` | `string?` | `bound_tournament_series_id` | `text` | Yes | - | 🔍 |
| `gameType` | `'soccer' \| 'futsal'?` | `game_type` | `text CHECK(...)` | Yes | - | 🔍 |
| `color` | `string?` | `color` | `text` | Yes | - | 🔍 |
| `ageGroup` | `string?` | `age_group` | `text` | Yes | - | 🔍 |
| `notes` | `string?` | `notes` | `text` | Yes | - | 🔍 |
| `createdAt` | `string` | `created_at` | `timestamptz` | No | `now()` | 🔍 |
| `updatedAt` | `string` | `updated_at` | `timestamptz` | No | `now()` | 🔍 |
| `archived` | `boolean?` | `archived` | `boolean` | Yes | `false` | 🔍 |

---

## 9. Player (Master Roster) → players Table

**TypeScript**: `src/types/index.ts` (Player interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (players table)

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Test Data |
|----------|---------|---------------|-------------|----------|---------|-----------|
| `id` | `string` | `id` | `text PRIMARY KEY` | No | - | 🔍 |
| `name` | `string` | `name` | `text NOT NULL` | No | - | 🔍 |
| `nickname` | `string?` | `nickname` | `text` | Yes | - | 🔍 |
| `jerseyNumber` | `string?` | `jersey_number` | `text` | Yes | - | 🔍 |
| `isGoalie` | `boolean?` | `is_goalie` | `boolean` | Yes | `false` | 🔍 |
| `color` | `string?` | `color` | `text` | Yes | - | 🔍 |
| `notes` | `string?` | `notes` | `text` | Yes | - | 🔍 |
| `receivedFairPlayCard` | `boolean?` | `received_fair_play_card` | `boolean` | Yes | `false` | 🔍 |

**Note**: `relX`/`relY` are NOT stored in master roster (ephemeral per-game data).

---

## 10. TeamPlayer → team_players Table

**TypeScript**: `src/types/index.ts` (TeamPlayer interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (team_players table)

| TS Field | TS Type | Schema Column | Schema Type | Notes |
|----------|---------|---------------|-------------|-------|
| `id` | `string` | `player_id` | `text` | Master roster ID |
| - | - | `id` | `text PRIMARY KEY` | `{team_id}_{player_id}` |
| (all Player fields) | - | - | - | Snapshotted |

---

## 11. AppSettings → user_settings Table

**TypeScript**: `src/types/settings.ts` (AppSettings interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (user_settings table)

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Default | Test Data |
|----------|---------|---------------|-------------|----------|---------|-----------|
| `currentGameId` | `string \| null` | `current_game_id` | `text` | Yes | - | 🔍 |
| `lastHomeTeamName` | `string?` | `last_home_team_name` | `text` | Yes | - | 🔍 |
| `language` | `string?` | `language` | `text` | Yes | `'fi'` | 🔍 |
| `hasSeenAppGuide` | `boolean?` | `has_seen_app_guide` | `boolean` | Yes | `false` | 🔍 |
| `useDemandCorrection` | `boolean?` | `use_demand_correction` | `boolean` | Yes | `false` | 🔍 |
| `isDrawingModeEnabled` | `boolean?` | `is_drawing_mode_enabled` | `boolean` | Yes | `false` | 🔍 |
| `clubSeasonStartDate` | `string?` | `club_season_start_date` | `text` | Yes | `'2000-11-15'` | 🔍 |
| `clubSeasonEndDate` | `string?` | `club_season_end_date` | `text` | Yes | `'2000-10-20'` | 🔍 |
| `hasConfiguredSeasonDates` | `boolean?` | `has_configured_season_dates` | `boolean` | Yes | `false` | 🔍 |

### 11.1 Deprecated Fields (Dropped in Migration)

These fields exist in old test data but are NOT in current types or schema:
- `autoBackupEnabled`
- `autoBackupIntervalHours`
- `lastBackupTime`
- `backupEmail`
- `encryptionEnabled`
- `encryptionPassphrase`
- `backupIntervalDays`
- `lastBackupAt`

---

## 12. PlayerStatAdjustment → player_adjustments Table

**TypeScript**: `src/types/index.ts` (PlayerStatAdjustment interface)
**Schema**: `docs/02-technical/database/supabase-schema.md` (player_adjustments table)

| TS Field | TS Type | Schema Column | Schema Type | Nullable | Test Data |
|----------|---------|---------------|-------------|----------|-----------|
| `id` | `string` | `id` | `text PRIMARY KEY` | No | 🔍 |
| `playerId` | `string` | `player_id` | `text NOT NULL` | No | 🔍 |
| `seasonId` | `string?` | `season_id` | `text` | Yes | 🔍 |
| `teamId` | `string?` | `team_id` | `text` | Yes | 🔍 |
| `tournamentId` | `string?` | `tournament_id` | `text` | Yes | 🔍 |
| `externalTeamName` | `string?` | `external_team_name` | `text` | Yes | 🔍 |
| `opponentName` | `string?` | `opponent_name` | `text` | Yes | 🔍 |
| `scoreFor` | `number?` | `score_for` | `integer` | Yes | 🔍 |
| `scoreAgainst` | `number?` | `score_against` | `integer` | Yes | 🔍 |
| `gameDate` | `string?` | `game_date` | `date` | Yes | 🔍 |
| `homeOrAway` | `'home' \| 'away' \| 'neutral'?` | `home_or_away` | `text CHECK(...)` | Yes | 🔍 |
| `includeInSeasonTournament` | `boolean?` | `include_in_season_tournament` | `boolean` | Yes | 🔍 |
| `gamesPlayedDelta` | `number` | `games_played_delta` | `integer NOT NULL` | No | 🔍 |
| `goalsDelta` | `number` | `goals_delta` | `integer NOT NULL` | No | 🔍 |
| `assistsDelta` | `number` | `assists_delta` | `integer NOT NULL` | No | 🔍 |
| `fairPlayCardsDelta` | `number?` | `fair_play_cards_delta` | `integer` | Yes | 🔍 |
| `note` | `string?` | `note` | `text` | Yes | 🔍 |
| `createdBy` | `string?` | `created_by` | `text` | Yes | 🔍 |
| `appliedAt` | `string` | `applied_at` | `timestamptz NOT NULL` | No | 🔍 |

---

## 13. Critical Transform Rules

### 13.1 Empty String ↔ NULL Normalization

All nullable string FK fields and optional string fields that use `''` in app:

```typescript
// Forward (App → DB)
season_id: game.seasonId === '' ? null : game.seasonId,
tournament_id: game.tournamentId === '' ? null : game.tournamentId,
tournament_series_id: game.tournamentSeriesId === '' ? null : game.tournamentSeriesId,
tournament_level: game.tournamentLevel === '' ? null : game.tournamentLevel,
team_id: game.teamId === '' ? null : game.teamId,
game_time: game.gameTime === '' ? null : game.gameTime,
game_location: game.gameLocation === '' ? null : game.gameLocation,
age_group: game.ageGroup === '' ? null : game.ageGroup,
league_id: game.leagueId === '' ? null : game.leagueId,
custom_league_name: game.customLeagueName === '' ? null : game.customLeagueName,

// Reverse (DB → App)
seasonId: game.season_id ?? '',
tournamentId: game.tournament_id ?? '',
// etc.
```

### 13.2 isPlayed Default (CRITICAL)

```typescript
// Forward: undefined/missing → true (legacy migration behavior)
is_played: game.isPlayed ?? true,

// Reverse: Direct (schema has NOT NULL DEFAULT false, but migration normalizes)
isPlayed: game.is_played,
```

### 13.3 Player Array Merge (CRITICAL)

```typescript
// Forward: Merge availablePlayers + playersOnField + selectedPlayerIds
const selectedIds = new Set(game.selectedPlayerIds);
const onFieldMap = new Map(game.playersOnField.map(p => [p.id, p]));

return game.availablePlayers.map(player => {
  const onFieldPlayer = onFieldMap.get(player.id);
  const isOnField = !!onFieldPlayer;
  const isSelected = selectedIds.has(player.id);

  return {
    // ...
    is_selected: isSelected || isOnField,  // NORMALIZE: on_field → selected
    on_field: isOnField,
    rel_x: isOnField ? onFieldPlayer.relX : null,
    rel_y: isOnField ? onFieldPlayer.relY : null,
  };
});
```

### 13.4 Assessment Sliders Flatten/Unflatten

```typescript
// Forward: Nested → Flat columns
intensity: a.sliders.intensity,
courage: a.sliders.courage,
// etc.

// Reverse: Flat columns → Nested
sliders: {
  intensity: a.intensity,
  courage: a.courage,
  // etc.
}
```

---

## 14. Verification Checklist

### Before Implementation

- [ ] Run transforms against ALL games in testdata.json
- [ ] Verify no constraint violations
- [ ] Verify round-trip fidelity (App → DB → App = original)
- [ ] Check every 🔍 in this document against test data

### Per-Table Verification

- [ ] games: 30+ fields mapped
- [ ] game_players: Player arrays correctly merged
- [ ] game_events: Order preserved via order_index
- [ ] player_assessments: Sliders flattened correctly
- [ ] game_tactical_data: JSONB fields preserved
- [ ] seasons: All fields including teamPlacements jsonb
- [ ] tournaments: All fields including series jsonb
- [ ] personnel: role NOT NULL, cascade delete documented
- [ ] teams: All fields including bindings
- [ ] players: Master roster (no relX/relY)
- [ ] team_players: Composite ID format
- [ ] user_settings: Deprecated fields documented
- [ ] player_adjustments: Delta fields correct

---

## 15. Known Edge Cases

1. **Players on field but not in selectedPlayerIds** - Normalize: set is_selected=true
2. **isPlayed undefined** - Default to true (legacy migration behavior)
3. **Empty strings in FK fields** - Convert to NULL
4. **Deleted players in old games** - game_players has snapshot, no FK
5. **Same player on multiple teams** - team_players uses composite ID
6. **Uniqueness conflicts** - Schema uses simple name uniqueness, app has composite rules
