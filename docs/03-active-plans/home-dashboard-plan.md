# Home dashboard view (toggleable)

## What it is
A second, information-rich version of the Home screen's **Pelit** tab, that the coach
can turn on or off from the gear sheet. "Simple" = today's launcher (unchanged).
"Dashboard" = the launcher plus at-a-glance info that fills the space the big
"MatchOps" hero wastes on a returning user.

The old view is never deleted; the dashboard is additive and opt-in. Default = simple,
so nobody's Home changes until they choose it.

This PR is **phase 1: the toggle + the Pelit-tab dashboard only.** The other tabs'
dashboard bits (roster counts, Kilpailut card, Tilastot tiles) are a later PR.

Branch: `feature/home-dashboard-view` -> one PR into `feature/two-level-structure`.

## The toggle
- New setting `homeView: 'simple' | 'dashboard'` in `AppSettings` (default `'simple'`).
- Lives in the gear sheet as a toggle row ("Kojelauta" / "Dashboard view") so it is
  reachable straight from Home, as asked.
- Persists like any app setting (`updateAppSettings`), syncs in cloud mode.

## What the dashboard shows (Pelit tab, returning user only)
Rendered only when `homeView === 'dashboard'` AND `!isFirstTimeUser` AND `hasSavedGames`.
Otherwise the simple launcher renders exactly as today.

1. **Resume card** - the in-progress game as an informative card (opponent, score,
   period/elapsed, home/away), replacing the plain "Jatka" button. Same footprint.
   Only when `canResume`.
2. **Vuosi bar** - one line: the CURRENT club season's aggregate - games played, W-D-L,
   goals for-against. Taps through to overall stats.
3. **Recent strip** - horizontal, swipeable row of the last games (result pill +
   opponent + score + date), each deep-linking to that game (Load Game -> that id).
4. Primary actions stay: New Game, Saved games, Planner, Taso (paired to save a row).

The big "MatchOps" hero shrinks to a compact top wordmark in dashboard mode for
returning users. First-run / empty state keeps the full hero (a real welcome).

## Data rules (the important part)
The summary is computed ONCE in `page.tsx`'s existing Home re-check effect (where
`hasSavedGames`/`canResume` are already computed from `getSavedGames`), and passed to
`StartScreen` as a `homeSummary` prop - `StartScreen` stays presentational.

**"Season" = the club season (Vuosi), never one of the coach's Kaudet.**
- The current club season is derived from today's date via `getClubSeasonForDate`
  using the coach's configured `clubSeasonStartDate`/`clubSeasonEndDate` from settings.
- The Vuosi bar and any home aggregate include only games whose `gameDate` falls in
  the current club season, and only played games (`isPlayed !== false`).
- Friendlies (`isFriendly === true`) are EXCLUDED from the Vuosi record, same as the
  competitive stats rule elsewhere (a friendly never counts toward the season record).
- If season dates are not configured (`hasConfiguredSeasonDates` false), the Vuosi bar
  still works off the default window, but shows a neutral label (no "24/25" implied
  precision) - or is simply hidden until configured. Decision: **hide the Vuosi bar
  until `hasConfiguredSeasonDates`**, so we never show a wrong/again-guessed year.

**Record maths (example).** Current club season has 8 played, non-friendly games:
5 wins, 2 draws, 1 loss, goals 18-9 -> bar shows "Vuosi 24/25 · 8 peliä · 5-2-1 · 18-9".
Win/draw/loss is from the coach's perspective (respect `homeOrAway`).

**Recent strip.** Last N (N=6) PLAYED games by `gameDate` desc, friendly or not (recent
history is fine to show all); each card: result letter (V/T/H from the coach's view,
colour-coded), opponent, score, short date, and the competition/context tag if any.
Tapping opens that exact game (reuse the existing load-by-id path).

**Resume card.** Uses the same resumable game the "Jatka" button already targets;
reads opponent, score, home/away, and period/elapsed for display. No new persistence.

## Reuse (no new engines)
- Club season window: `getClubSeasonForDate` + settings dates (already used by stats).
- Record/goal aggregation: the same filtering the stats modal uses
  (`filterGameIds` with `clubSeasonFilter` = current, `includeFriendlies: false`) +
  the overall win/draw/loss tally. Extract a small pure helper so Home and Stats agree.
- Recent list + result: derive from `savedGames` (sort, slice, compute result).

## Phase 2 (separate PR, on feature/home-dashboard-phase2)
The other tabs' dashboard content, all gated behind the same `homeView` toggle:
- **Joukkue**: a one-line roster/teams/personnel count header + a "Valmennus"
  group label pulling Warmup + Coaching Materials out of the loose "who" rows.
- **Kilpailut**: a club-season context card (Vuosi label + record + "N kautta ·
  N turnausta") above the Kaudet/Turnaukset rows. No single "active" season -
  the card shows the club-season context and how many exist.
- **Tilastot**: a three-tile overview of the current club season (Tulokset
  W-D-L, Maaliero, top scorer) above the four stat rows.

Data: `buildHomeSummary` extended with `counts` (players/teams/personnel/
seasons/tournaments) and `topScorer` (current club season, from goal events +
roster names). Counts + top scorer are enriched a beat after the fast Pelit
build, from the existing fire-and-forget entity fetch in checkAppState. All
club-season summaries stay keyed to the Vuosi window (never a user Kausi).

## Out of scope
- Any change to the four-tab structure or the gear sheet contents.
- "Running/active" detection for individual Kaudet/Turnaukset (counts only).

## Acceptance
- Toggle off (default): Home is byte-for-byte today's launcher.
- Toggle on, returning user with games: resume card + Vuosi bar (if dates configured)
  + recent strip + actions; compact wordmark.
- Toggle on, first-run / no games: full hero + Get Started, no dashboard clutter.
- Vuosi record matches the stats modal's overall-for-this-club-season numbers exactly.
- Friendlies never affect the Vuosi record.
- All existing StartScreen tests still pass; new tests cover the toggle branch,
  the Vuosi maths (incl. friendly exclusion + undated-game handling), and recent order.
