# Player Positions Per Game - Plan

**Status**: ✅ **DONE 2026-07-01** (PR A #574 local-first + PR B #575 cloud sync, both merged).
- PR A: `positions.ts` config, `playerPositions` on the game/session state (threaded like
  `gameNotes`), `PlayerPositionsEditor` in `GameSettingsModal` (Line-up section under the report),
  recap Lineup block, i18n `playingPositions.*` (EN/FI), tests.
- PR B: `player_positions jsonb` on `games` (migration 035, recreates `save_game_with_relations`
  from 032 + one upsert line) + `SupabaseDataStore` forward/reverse transforms. Migration applied +
  verified on **staging and prod** 2026-07-01.
- Later (not built): "apply from formation" prefill; a per-player "positions played / versatility"
  stat once the data accrues; custom positions; a read-only line-up card in the stats view.
**Roadmap**: P3 (`UNIFIED-ROADMAP.md`, "Post-game positions played").
**Origin**: recap conversation - "define which positions each player actually played, listed in the
ottelukooste so other coaches know who played where."

## Intent

A **post-game** step (done in peace, alongside the otteluraportti) where the coach assigns the
position(s) each player played that game. It surfaces in two shapes:

- **Entry (in-app)**: per **player** - each squad player gets one or more positions (multi-position
  is rare but allowed, e.g. a kid who played CB then RB).
- **Display (shareable recap)**: per **position** - the ottelukooste lists the **formation labels**
  as the keys and the player nickname(s) as the value, so another coach reads the line-up at a
  glance. A position with two players lists both; a player in two positions appears under both.

Not live tracking. It is the coach's post-game summary judgement, which sidesteps the
"positions change constantly mid-game" objection.

## What it looks like

**Recap block (position-keyed, back-to-front order):**
```
Lineup
GK: Aapo
CB: Emma, Noah
ST: Liam

Match report:
...
```

**In-app editor (player-keyed):** the squad as rows, each row = player name + tappable position
chips (multi-select), matching the assessment-selector chip pattern.

## Data model (id-keyed, non-destructive - the assessment pattern)

- **AppState**: add `playerPositions?: { [playerId: string]: string[] }` (arrays of position ids).
  Keyed by player id, values are position ids - same id-keyed-JSONB philosophy as assessment
  `slider_values` (see CLAUDE.md Rule 5). Legacy games have no field → treated as `{}`.
- **Local**: `LocalDataStore` already persists the whole `AppState`, so local mode works with no
  migration. A missing field is an empty map.
- **Cloud**: one **additive** migration - a nullable `player_positions jsonb` column on `games`.
  - Forward (`SupabaseDataStore` / sync transform): `player_positions: game.playerPositions ?? {}`.
  - Reverse: `playerPositions: row.player_positions ?? {}`.
  - `save_game_with_relations` writes it as a normal `games` column (it lives on the game row, not a
    child table) - confirm the RPC's games upsert is column-generic or add the column there.
  - **Decision**: a jsonb map on `games` (v1) over a `game_players.positions` column. It is the
    least-invasive migration (one column, one transform pair, no child-row RPC change) and matches
    how assessments are stored. `game_players.positions` is the "more normalised later" option if we
    ever need to query positions relationally.

## Position vocabulary (single source of truth, sport-aware)

New config `src/config/positions.ts` (mirrors `assessmentMetrics.ts` as the source of truth):

- Each position: `{ id, category: 'gk'|'def'|'mid'|'att', sports: ('soccer'|'futsal')[] }`.
- Labels + abbreviations come from i18n (`positions.<id>.label` / `positions.<id>.abbrev`), EN + FI,
  so the recap can use short abbreviations (GK, CB, ST) that are still localisable (FI: MV, KP, HY…).
- **Soccer set** (works for 11 and smaller): GK, RB, CB, LB, RWB, LWB, CDM, CM, CAM, RM, LM, RW, LW,
  ST. **Futsal set**: GK, FIXO (def), ALA ×L/R (wing), PIVO (pivot).
- The editor + recap show only the set for the game's `gameType` (`AppState.gameType`, legacy →
  soccer). Ordering is fixed back-to-front so both the chips and the recap read GK-first.
- **Decision (2026-07-01): one flat, freely-assignable detailed list** - any position can be assigned
  to any player, independent of the match formation. The formation presets are only `{relX, relY}`
  coordinates with no position labels, so there is nothing clean to derive; and post-game reality
  often differs from the nominal formation (rotation). "Apply from formation" prefill stays a later
  nicety. No simplified youth set for v1.

## UI (consistent with existing app styles)

Add a **"Kokoonpano / Line-up"** section to `GameSettingsModal`, directly under the Otteluraportti
section (same post-game surface the coach is already in), reusing the exact section styling:

- Section wrapper: `bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner` with an
  `h3` header `text-lg font-semibold text-slate-200 mb-4` (identical to the report section).
- New component `PlayerPositionsEditor`:
  - Rows = the game's **selected squad** (`selectedPlayerIds`), one player per row, name left.
  - Position chips right, wrapping (`flex flex-wrap gap-1`), reusing the assessment-selector chip
    style: `px-2 py-1 rounded-md text-xs font-medium transition-colors`, selected
    `bg-indigo-600 text-white`, else `bg-slate-800/40 text-slate-300 hover:bg-slate-800/60`,
    `aria-pressed` for multi-select toggles.
  - Blank = not recorded (no forced entry); font-display + slate palette throughout.
- A read-only line-up summary can also render in the `GameStatsModal` current-game tab later; v1
  keeps entry in one place.

## Recap integration

`buildGameRecap` already assembles independent blocks, so add a **Lineup block** after Assists and
before the Match report:

- Invert `playerPositions` (player→positions) into position→players.
- Render only positions that have players, in the fixed back-to-front order; each line
  `{abbrev}: {nick1, nick2}` (nickname or first name; opponents are never involved here).
- i18n: `recap.lineup` header ("Lineup" / "Kokoonpano"); position abbreviations from
  `positions.<id>.abbrev`.
- Pure + unit-tested (single/multi position per player, multiple players per position, empty → block
  omitted, deleted-player fallback).

## Phasing

- **Phase 1 (this plan)**: `positions.ts` config; `playerPositions` on `AppState`; local persistence;
  cloud `player_positions` jsonb migration + forward/reverse transforms (`SupabaseDataStore` + sync)
  + RPC check; `PlayerPositionsEditor` in `GameSettingsModal`; recap Lineup block; i18n EN/FI; tests.
  Cloud is included in Phase 1 (the Play build is cloud-only, so it must sync). ~1-2 PRs.
- **Later**: "apply from field / formation preset" prefill (the app already knows on-field placement);
  a per-player "positions played / versatility" stat once the data accrues; custom positions;
  futsal-specific refinement; a read-only line-up card in the stats view.

## Effort

Medium. The editor UI and the cloud migration are the bulk; the config, recap block, and transforms
are small and follow existing patterns (assessment storage, block-based recap).

## Locked decisions (2026-07-01)

1. **Vocabulary**: one flat, freely-assignable detailed sport-aware list (not formation-derived, no
   simplified youth set for v1).
2. **Recap placement**: Lineup block after Assists, before the Match report.
3. **Editor home**: `GameSettingsModal` only (no stats-view surface for v1).
4. **Storage**: jsonb map on `games` (`player_positions`) - simplest, matches the assessment pattern;
   enough for display in-app + recap. `game_players.positions` (normalised, enables cross-game
   position querying) is deferred until a "positions played / versatility" stat is built.

## Remaining detail to settle during build

- FI abbreviations wording for each position (e.g. GK → MV).
