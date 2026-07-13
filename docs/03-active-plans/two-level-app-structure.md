# Two-Level App Structure — Club Home vs Match Mode

Status: planned (2026-07-13). Do AFTER the Playing-Time Planner is finalized.
Owner decision that triggered this: "the app is too complicated... we are
mixing 2 levels of settings and menus and views - app/the big picture &
individual game."

## 1. Problem

The app boots INTO a match (phantom `unsaved_game`, `DEFAULT_GAME_ID`) and all
club-level management hangs off a hamburger inside that match view. Menus group
by function type, not scope, so the user must memorize which button touches the
thing on screen and which touches the whole club:

- "Game Management": Save (this match) + Load/New (game library) + Planner
  (club tool) + Assess/Report (this match) — three scopes in one group.
- "Setup & Configuration": Game Settings (THIS match) next to Roster / Teams /
  Personnel / Seasons & Tournaments (club entities).
- Stats: one modal whose tabs span both scopes (current game vs season/
  tournament/overall/player).
- "Analysis & Tools" hides Backup & Restore — a third, device-level scope.

There are actually THREE levels: **Match** (field, timer, lineup, events,
assessment, report) · **Club/Season** (roster, teams, personnel, competitions,
cross-game stats, planner) · **Device/Account** (app settings, backup, cloud,
language, resources).

Precedent that this fix works: the planner had the same disease at feature
scale (manager functions mixed into the editing view) and was fixed with
manager-first + peer tabs (2026-07-13). This plan is the same move at app
scale.

## 2. Target information architecture

Two views, one bridge each way:

```
HOME (club)                          MATCH (one game)
┌──────────────────────────┐        ┌──────────────────────────┐
│ Pelit | Joukkue |         │  open/ │ Field, PlayerBar, timer, │
│ Kaudet | Tilastot    [⚙] │ ─────▶ │ tactics, drawing          │
│ [▶ Jatka ottelua]         │  new   │ Menu: match-only items   │
└──────────────────────────┘ ◀───── └──────────────────────────┘
                              ← Koti
```

Navigation rules:
- App launch: live match open → auto-resume straight into MATCH (session key,
  same pattern as the planner's `matchops_planner_active_plan`). Otherwise HOME.
- Exactly one level-crossing affordance each way: open/create a game from
  Home; "← Koti" in the match menu. Hardware back mirrors it.
- Game-day guardrail: the coach at the pitch NEVER pays an extra tap — resume
  must be automatic, "Jatka ottelua" card is the fallback.

### Reachability table (every item has exactly ONE home, chosen by scope)

| Where | Items |
|---|---|
| Home / **Pelit** (default tab) | Saved-games list (search/filter; LoadGameModal dissolves here), pinned **Uusi peli**, **Jatka ottelua** card when a match is live, per-row 3-dot (open/delete/duplicate/export), **Ottelusuunnittelu** (it creates games) |
| Home / **Joukkue** | Master roster, Teams, Personnel (+ Training materials) |
| Home / **Kaudet & turnaukset** | Seasons, Tournaments |
| Home / **Tilastot** | Season / tournament / overall / player stats (split OUT of GameStatsModal) |
| Home / **⚙ gear** (not a tab) | App settings, Backup & Restore, cloud account, language, user guide, external resources, rules directory |
| **Match menu** (~6 items) | Ottelun tiedot (ex-"Game Settings"), Arvioi pelaajat, Otteluraportti, Ottelun tilastot (this game only, with ONE labeled link "Joukkueen tilastot →" to Home/Tilastot), Tallenna / Tallenna nimellä, ← Koti |
| Match bar (unchanged) | Timer, tactics board, drawing, reset, undo/redo |

One-way street: club→match at need-time only. The game's player picker gets an
inline "lisää seuran listaan" (writes to club roster + selects); match never
edits club anywhere else.

### Scenario flows (acceptance walkthroughs)

1. Game day: open app → auto-resume into live match; else Home→Pelit→Uusi peli
   →setup→Match. No club item visible during the game.
2. After final whistle: Match → assess → report → ← Koti; game tops the list.
3. New kid mid-week: Home→Joukkue→add player. No game context opens.
4. Season setup: Home→Kaudet (create/bind) + Joukkue (rosters).
5. Tournament prep: Home→Pelit→Ottelusuunnittelu (existing planner flow);
   created games appear in the Pelit list.
6. "How much has Aarne played?": Home→Tilastot→player. (Today: 2 scope hops.)
7. Mid-match season stats: Ottelun tilastot → "Joukkueen tilastot →" link.
8. First launch: Welcome → Home; empty states ARE the onboarding ("create your
   first game" / "add your players").
9. Backgrounded mid-match: resume lands back in the match.

## 3. Visual direction — keeping the start screen beautiful

The current StartScreen's appeal = the hero treatment (gradient logo, tagline,
sky-glow blobs, noise texture). It got cluttered because it was a flat
LAUNCHER — every feature demanded a front-page button as a peer.

Keep the hero, give it a body:
- **Hero stays as Home's header**: logo + tagline + glow blobs exactly as now,
  slightly shorter; gear + language toggle in its corners.
- Under the hero: the **house tab bar** (GameStats/planner tab tokens) with the
  four tabs, then the tab's content on the noise-texture background.
- The front page (Pelit tab) shows ONLY: hero, Jatka-card (when live), pinned
  Uusi peli, the games list. Cloud/subscribe rows, Get-on-Google-Play,
  RecommendedSetupCard move under ⚙ / welcome flow.
- Anti-clutter rule (enforced in review): a new feature NEVER earns a Home
  button; it earns a place inside one tab or the match menu, chosen by scope.

## 4. Phases, work estimate, risk

Foundation fact: `page.tsx` already switches `screen: 'start' | 'home'` — the
Home slots into the existing 'start' branch. No router, no app re-plumbing.

| Phase | Content | Size | Risk |
|---|---|---|---|
| **0. Menu scope-split + renames** | Hamburger regrouped into "Tämä ottelu" / "Joukkue & sovellus"; "Game Settings"→"Ottelun tiedot"; stats menu entry split (match vs team). Pure JSX + i18n. | 1–2 days | **Low** (menu tests, i18n guard) |
| **1. Home shell (strangler)** | StartScreen → tabbed Home; tabs OPEN THE EXISTING MODALS (Load/Roster/Teams/Kaudet/Stats) instead of embedding them; Resume card; auto-resume session key; field boot path unchanged. | ~1–2 wks | **Low-med** (additive; existing modals untouched) |
| **2. Dissolve modals into tabs** | One modal per PR: LoadGame→Pelit list, Roster/Teams/Personnel→Joukkue, SeasonTournament→Kaudet, GameStats split (match tab stays in match). Modal internals become tab content; orchestration wiring per modal. | ~2–4 wks total, incremental | **Medium** (each PR touches orchestration + that modal's test suite; test surface is the real cost) |
| **3. Match-menu shrink + crossings** | Match menu to ~6 items; "Joukkueen tilastot →" link; inline add-to-club-roster in the game picker. | 2–4 days | **Low** |
| **4. Retire `unsaved_game`** | Match context exists only while a real game is open; Home needs no game. | Large | **High** — touches `page.tsx` (1.3k lines) + `useGameOrchestration` (12 documented eslint-disables for hook-order patterns), autosave/timer assumptions. Separate decision AFTER 0–3 have settled; 0–3 deliver the UX win without it. |

Total for phases 0–3: roughly **4–7 weeks of planner-style sessions**. Phase 4
is optional debt-paydown, not required for the user-facing win.

Risk register + mitigations:
- `page.tsx` orchestration coupling → strangler pattern: Home first only
  NAVIGATES to existing modals (phase 1); dissolving is per-modal PRs (phase 2).
- Test surface (~4,500 tests; each dissolved modal has a suite) → one modal per
  PR, suite reworked in the same PR (planner tab-restructure showed ~25 tests
  per shell change is manageable in one sitting).
- Game-day speed regression → auto-resume is phase 1, with a test, before
  anything else changes.
- PWA resume paths → reuse the proven session-key pattern (PLANNER_OPEN_KEY /
  planner active-plan key).
- i18n churn → each phase updates the key-count guard as usual.

## 5. Sequencing

1. Finalize the Playing-Time Planner (current work) — it also becomes the
   in-app proof of the manager-first + peer-tabs pattern.
2. Phase 0 can ship any time (independent, tiny, immediate relief).
3. Phases 1→2→3 in order. Phase 4 re-evaluated afterwards.
