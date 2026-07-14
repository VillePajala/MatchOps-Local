# Two-Level App Structure — Club Home vs Match Mode

Status: delivery plan locked (2026-07-14) - see §6/§7. Planner shipped; this
is next. All work on `feature/two-level-structure`; ONE final PR to master.
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

1. ~~Finalize the Playing-Time Planner~~ DONE (shipped to master 2026-07-14) —
   it is the in-app proof of the manager-first + peer-tabs pattern.
2. Phases 0→1→2→3 in order on the feature branch (decision 2026-07-14: Phase 0
   does NOT ship separately - master stays untouched until the final PR).
3. Phase 4 re-evaluated afterwards; explicitly OUT of this branch's scope.

## 6. Delivery plan — PR by PR (decided 2026-07-14)

**Workflow**: everything lands on `feature/two-level-structure` (cut from
master). Every slice below is a PR AGAINST THAT BRANCH - CI and the Claude
review run on each (verified: only the Release Notes Guard is master-only).
Master gets ONE PR at the very end, when all phases are done and accepted.
Same rhythm as the planner: small verified batches (tsc → targeted jest →
eslint → build), user tests on the Vercel preview at each checkpoint.

| PR | Scope | Done when |
|----|-------|-----------|
| **0.1 Menu scope split** | Hamburger regrouped into "Tämä ottelu" / "Joukkue & sovellus"; "Game Settings" → "Ottelun tiedot". Pure JSX + i18n. | Menu tests updated; every existing item reachable under its new group. |
| **0.2 Stats entry split** | Menu offers "Ottelun tilastot" (opens GameStats on the current-game tab) and "Joukkueen tilastot" (opens on the aggregate tabs). No modal internals change. | Both entries deep-link to the right tab; tests assert the tab. |
| **1.1 Auto-resume guardrail** | Launch auto-resume reads the PERSISTED game status (stronger than the planned session key - survives process kills): in-progress AND period-break (half-time!) games land straight in the match. Decision extracted to `launchResume.ts`. Ships FIRST so game-day speed can never regress unnoticed. | Tests pin all four statuses + first-check gating; half-time gap closed. |
| **1.2 Home shell (strangler)** | StartScreen becomes Home: hero header kept (logo/tagline/glows, slightly shorter), house tab bar (Pelit · Joukkue · Kaudet · Tilastot) + ⚙ corner. Tabs only OPEN THE EXISTING MODALS. `page.tsx`'s `'start'` branch renders it; field boot path untouched. | All four tabs + gear open their modals; StartScreen tests reworked to Home. |
| **1.3 Pelit front page** | Tab content v1: "Jatka ottelua" card (when live), pinned "Uusi peli", saved-games entry (opens LoadGameModal), Ottelusuunnittelu entry. Cloud/subscribe/Play-store rows move under ⚙ / welcome flow. | Front page shows ONLY hero + those items (anti-clutter rule holds). **User preview checkpoint.** |
| **1.4 Gear bucket** | ⚙ sheet: app settings, Backup & Restore, cloud account, language, user guide, external resources, rules directory. Entries open existing modals. | Every Device/Account-scope item reachable ONLY via ⚙. |
| **L.0a ClubModalsHost scaffold + Training/Rules** | Page-level host rendered on BOTH screens; the two truly trivial modals (isOpen/onClose only, state already in ModalProvider) prove the pattern - including the hardware-back contract below. | Both open from Home with the game view UNMOUNTED; hardware back closes the modal. |
| **L.0b Lift Settings + Instructions** | Settings' ~12 handlers (language, backup, hard reset, cloud ops) extract into a page-usable hook; Instructions' open-state moves into ModalProvider (Settings' "show app guide" chain must keep working from Home). Opening them from Home no longer mounts the match at all; closing lands on whatever screen you were on - the 2-lite goal falls out for free, wave by wave. Dual-render guard: a modal must never render in both the host and ModalManager. | Gear-sheet items open with the game view UNMOUNTED (assert no game-view testid); close returns to Home. |
| **L.1 Lift SeasonTournament + Personnel** | Query-backed CRUD with mutation hooks - least coupled. Hook instances move to the host; ModalManager rows deleted; suites follow. | Kilpailut tab + Taustahenkilöt row work with no game mounted. |
| **L.2 Lift Roster + TeamManager** | useRoster ownership moves to the host; the game view consumes roster data via the query cache as it already does. Watch: single ownership of any LOCAL state (selectedTeamForRoster moves into the host). | Pelaajat/Joukkueet rows work with no game mounted; in-match roster editing unregressed. |
| **L.3 Lift LoadGame + NewGameSetup (level crossing)** | The two modals that END in the match. Page exposes one small `enterMatch(gameId?)` contract: save current-game id, switch screen, let the game view's existing load path take over. Replaces today's mount-the-game-first flow AND the planner's session-key hack (planner joins the host here too - it is already self-contained). | Pick a saved game from Home -> match opens loaded; create game -> match opens set up; cancel either -> still on Home. |
| **L.4 Lift GameStats (aggregate)** | The Tilastot tab renders host-level GameStats opening on the aggregate side (PR 0.2's initialTab). The current-game tab STAYS with the match modal - matching the final match-menu design. | Team stats from Home with no game mounted; match stats in-game unregressed. |
| **3.1 Match menu shrink** | Match menu to ~7 items (Ottelun tiedot, Arvioi pelaajat, Otteluraportti, Ottelun tilastot + "Joukkueen tilastot →" link, **Taso link** - owner decision 2026-07-14: Taso is a game-day workflow tool (lineups before, results after), it stays in-game, Tallenna/Tallenna nimellä, ← Koti). Hardware back mirrors ← Koti. | Reachability table (§2) holds exactly; menu tests updated. |
| **3.2 Roster bridge** | Game player picker gets inline "lisää seuran listaan" (writes club roster + selects). The ONLY club-write from match scope. | Test: added player lands in club roster AND the game selection. |
| **F Final** | Docs (§7 status here, UNIFIED-ROADMAP), release-notes entry (the guard needs it), full-suite run, then the ONE PR `feature/two-level-structure` → master. | The 9 scenario walkthroughs in §2 all pass on the preview; review verdict posted; user merges. |

### The facade, named (owner discussion 2026-07-15)

After 2-lite, Home is structurally a FACADE: every tab tap mounts the full
match view underneath and floats the existing modal over it; "close -> Home"
is a screen swap. Known risks of living with this: (1) match machinery
(orchestration, autosave wiring, timers, queries) boots on every Home
interaction - wasted work + a standing source of on-mount side effects;
(2) back-button/transition fragility (pitch can flash on slow devices);
(3) conceptual debt - future features keep landing in the game tree because
that is where modals live, which makes phase 4 harder every month.
**OWNER DECISION 2026-07-15: the lift IS the final architecture.** Modals
are kept (no dissolving, ever); their RENDERING moves out of the game tree
into a page-level ClubModalsHost, wave by wave (L.0-L.4 above). Key enabling
fact: ModalProvider (open/close state) already lives at page level - only
rendering + data wiring move. After L.4 the facade is gone: Home opens
modals without mounting the match, closes land back where you were, and the
game tree contains only match-scope surfaces (GameSettings, assessment,
goal log, current-game stats). Phase 4 remains parked and becomes EASIER
after the lift (fewer things depend on mounting the game).

### Modal governance (owner + review discussion, 2026-07-15, binding)

- **Tasks live in modals; glanceable content lives on pages.** Modals are the
  app's navigation for bounded tasks (manage roster, competitions, settings);
  pages/tabs carry only content you glance at (resume card, entry rows, and -
  later, optionally - a recent-games teaser).
- **Hardware back must close the topmost lifted modal** - never exit the app,
  never reveal the pitch. This is an ACCEPTANCE CRITERION of every L-wave,
  proven first in L.0a and audited per lifted modal.
- **Modal scope rule** (the anti-clutter rule's sibling): a new feature earns
  a place inside an existing scope-true modal or justifies a NEW modal - it
  never widens one into a junk drawer. (GameStats' five tabs are the cautionary
  precedent.)

## 7. Process rules for this branch (planner lessons, binding)

- **Merge gate (binding, 2026-07-14): a sub-PR merges ONLY when the Claude
  review has posted an Approve for the exact current head.** CI green alone
  never merges. Review requests changes -> fix -> push -> wait for the fresh
  review of the NEW head -> loop until it approves.
- **Verify before push, per batch**: `npx tsc --noEmit` → targeted jest
  (`--no-coverage`) → eslint on touched files → `npm run build` → restore
  `public/changelog.json` + `public/sw.js` before committing.
- **Full suite** (`npm test`, ~5.4k tests - it covers `tests/` too, the
  planner's blind spot) at EVERY phase boundary AND before the master PR.
- **Weekly `master` → feature merge** to stop drift; release-notes conflicts
  resolve as: our entries keep position, master's new entries slot by date.
- **A dissolved modal's test suite is reworked in the SAME PR** that dissolves
  it - never deferred (planner: ~25 tests per shell change is one sitting).
- **i18n**: key-count guard + `npm run generate:i18n-types` in the same PR as
  any key change; `t()` fallbacks byte-match the en JSON.
- **No schema/DB changes anywhere in this scope.** No migrations, no DataStore
  interface changes. If one seems needed, stop - the plan is wrong somewhere.
- **Phase 4 (`unsaved_game` retirement) is out of scope** - any PR that starts
  touching `DEFAULT_GAME_ID` semantics gets split out and parked.
- Cleanup after the final merge: archive tag on the feature branch tip, delete
  all step branches (same as `archive/playtime-planner-history`).
