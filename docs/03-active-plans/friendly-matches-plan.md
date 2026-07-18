# Friendly Matches (Harjoitusottelut)

## Status (implementation)

- **Done:** the data layer (isFriendly on the model, local + cloud transforms,
  migration 039, generated types); the stats rules (filterGameIds Friendlies
  scope + includeFriendlies; calculatePlayerStats + overallTeamStats exclude
  friendlies by default); the **New Game "Friendly match" toggle**; the stats
  modal **Friendlies tab + "Include friendly matches" toggle**; EN/FI i18n.
  All tested; no regressions.
- **Deploy gate:** migration 039 must be applied to staging (verify) then prod
  BEFORE cloud users rely on it. The code is forward-compatible (the flag is
  silently dropped for cloud until the column exists; local works fully), so
  merging without the migration causes no errors - only unpersisted cloud flags.
- **Also done:** a **Game Settings "Friendly match" toggle** to reclassify an
  existing (or old) game - persisted directly via mutateGameDetails; the
  whitelist save preserves the flag.
- **Deferred (fast-follow):** a dedicated "Harjoitusottelut" entry point in the
  Start screen's Kilpailut tab - which only exists on the (unmerged) two-level
  restructure, so on master the Friendlies STATS tab is the access point.

## What it is

A way to mark a game as a **friendly / practice match** and keep its stats out of
the competitive record by default — while still recording everything, so a coach
can see the full picture whenever they want.

Today a game links to a season and/or a tournament, and a game with neither just
falls into "Overall" invisibly. That means a 10-0 practice romp quietly inflates
a player's career totals next to hard-earned competitive goals. This feature
makes friendlies an explicit, separable thing.

## The one principle

**Every game is always recorded and viewable. The friendly flag only controls
whether a game counts in the *competitive* aggregate numbers.** Nothing is ever
hidden or lost — a coach can always fold friendlies back in with one toggle.

## Data rules

Grouped by concern, with examples.

### 1. What makes a game a friendly

- A game has an explicit `isFriendly` flag (a "Friendly match" toggle in New Game
  and in Game Settings). Off by default.
- It is **explicit on purpose.** We do NOT infer "friendly" from "no season and
  no tournament" — otherwise a real competitive game the coach forgot to tag
  would be silently dropped from the record. A friendly is a friendly because the
  coach said so.
- A game can be a friendly AND still carry a season/tournament tag if the coach
  sets both (unusual, but allowed — see rule 3 for how that resolves).
  - *Example:* "Sat pre-season scrimmage vs Rivals" → `isFriendly = true`, no
    season, no tournament.

### 2. Existing games and the default

- Games created before this feature have no `isFriendly` value. They read as
  **not friendly** (competitive), so nothing changes retroactively and no data
  migration is needed.
  - *Example:* every current saved game keeps counting exactly as it does now.

### 3. What counts where

- **Season** and **Tournament** scopes: unchanged. They only ever include games
  tagged with that season/tournament. Friendlies normally have neither, so they
  never appear there.
  - *Edge:* if a coach marks a game friendly AND assigns it a season, the
    friendly flag wins for the competitive record — it is treated as a friendly
    and excluded from that season's competitive totals (it still shows in the
    Friendlies view). Keep this simple: **`isFriendly` always excludes from
    competitive totals, regardless of any season/tournament tag.**
- **Overall** and **per-player career totals**: by default **exclude** friendlies.
  This is the behavior change — today they include everything.
  - *Example:* a player with 8 competitive goals and 4 friendly goals shows **8**
    in Overall by default.
- **Friendlies** scope (new): shows friendly games only — goals, assists, cards,
  minutes, and positions/roles (friendlies are where roles get rotated, so this
  reuses the Balance/Positions read).
  - *Example:* "In friendlies this season: Alex 4 goals, played 5 positions."

### 4. The "Include friendly matches" toggle

- A toggle in the stats modal. **Off by default.**
- When **on**, friendlies are folded into **Overall and per-player totals** only.
  It cannot add them to a specific season or tournament (they have none), so in
  practice it only affects Overall/player numbers.
  - *Example:* same player as above — toggle on → Overall shows **12** goals
    (8 competitive + 4 friendly).
- Season/Tournament/Friendlies scopes are unaffected by this toggle.

### 5. Minutes / playing-time and the planner

- The playing-time planner is independent of this (it plans hypothetical games,
  not saved results). No change there.
- Within the stats **Friendlies** scope, minutes and positions aggregate over
  friendly games the same way Season/Tournament scopes aggregate over theirs.

## Where the coach sees it

- **New Game setup:** a "Friendly match" toggle (house full-width toggle button).
- **Game Settings:** the same toggle, so an existing game can be reclassified.
- **Stats modal:** a **Friendlies** scope alongside Season / Tournament / Overall,
  plus the **Include friendly matches** toggle.
- **Kilpailut tab (Start screen):** the original "Harjoitusottelut" idea becomes
  a row here that opens the Friendlies stats scope — so friendlies live beside
  Kaudet and Turnaukset without a separate bespoke modal.

## What it touches (scope)

- **Types:** add `isFriendly?: boolean` to the game model.
- **Local data:** read/write the flag; default undefined → false on read.
- **Cloud data:** add an `is_friendly` column (Supabase migration), plus the
  forward/reverse transforms (empty/undefined → false), following the existing
  game-transform rules. Production-grade: verify against staging before prod.
- **Stats aggregation:** `calculatePlayerStats` / the game-stats hook exclude
  `isFriendly` games from Overall/player totals unless the include-toggle is on;
  add a Friendlies filter/scope.
- **UI:** New Game toggle, Game Settings toggle, stats Friendlies scope + include
  toggle, Kilpailut row.
- **i18n:** EN/FI for the toggle, the scope label, and the include toggle.
- **Tests:** aggregation with/without friendlies, the include toggle, the
  reclassify-in-settings path, and cloud transform round-trip.

Estimated ~1-2 days of focused work, dominated by the cloud column + transform +
the stats aggregation changes rather than the UI.

## Decisions already made

- Explicit flag, not implicit (no-season-no-tournament ≠ friendly).
- Friendlies excluded from competitive stats **by default**.
- One "Include friendly matches" toggle folds them into **Overall/player totals
  only**.
- Existing games default to not-friendly (no migration).
- `isFriendly` always excludes from competitive totals even if a season/tournament
  tag is also present.
- The New Game "Friendly match" toggle and the season/tournament selection are
  **independent** — both settable, no gating between them.
- The Friendlies scope shows the **per-player breakdown plus a simple results
  line** (games / record) to start — no elaborate standings.
