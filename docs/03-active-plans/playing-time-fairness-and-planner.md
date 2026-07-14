# Playing-Time Planner — Phased Build Plan

**Status:** 🚧 Planning (DRAFT) · Big bet (P4) · Not started
**Last updated:** 2026-07-03

> The coach need is simple to state and hard to build: **take a set of games (a
> tournament), plan the kokoonpanot + subs across all of them at once, and make
> the playing time come out as equal as possible by the end.** A standalone tool
> already does this (`~/projects/matchops-planner`); the job is to make it live
> natively in the app and, eventually, feed the actual games.

---

## 1. Learn from the last attempt (it was a disaster)

A previous in-app integration exists at tag `archive/planner-integration`. It
was abandoned - "it worked the wrong way and looked awful." The diff explains
why, and every reason is a process failure, not "integration is impossible":

- **It was one big bang** - ~**92,000 lines, 159 files**: the planner, cloud
  persistence, scheduled-subs schema, and the game binding all in a single
  branch. Nothing could be validated in isolation.
- **It bolted the standalone HTML into the app** (`tournament-planner/planner.html`,
  1,450 lines). A separate UI grafted in → didn't match the field/roster/styling
  ("looked awful") and a second data model fighting the real one ("worked the
  wrong way").
- **It committed to deep schema first** - a whole `planning_sessions` cloud
  subsystem (10+ migrations: active-session, parent scopes, composite PKs,
  included-game-ids…), `scheduled_subs` columns, and a rewritten save-game RPC -
  before the UX was proven.

**The rule this time:** small, isolated, verified slices; native UI (no embedded
HTML); **local-first, no cloud schema, no game binding until the planner itself
is proven.** Mine the standalone project for **algorithm + UX ideas only**.

## 2. The reframe: two phases, the risky half fenced off

For the tournament use case the planner is **self-contained**: its inputs are
just roster + N games + game length + availability; its output is per-game
lineups + subs with a fair-minutes read. It needs **no season-long ledger, no
cloud, and no game-binding** to deliver its value.

- **Phase 1 — the native planner (self-contained).** Rebuild the standalone tool
  natively in-app, reusing the app's SoccerField/roster/formations, plan stored
  as a **local blob** (like assessments/positions). No cloud, no assignment.
  *This alone is the coaching tool.*
- **Phase 2 — the assignment (only after Phase 1 is solid).** Write a game's
  planned XI + subs into the actual game, and surface the subs as timer prompts.
  Small and additive on top of a proven planner.

Everything that blew up last time lives in Phase 2 (and mostly in the deferred
cloud piece) - so it can't recur if Phase 1 ships first.

## 3. How it works — the coach's view

**Before the tournament (home, laptop) — Phase 1:**
1. Open **"Plan playing time"** for the tournament (or set it up: 5 games ×
   25 min, 11 players, formation 2-1-2-2).
2. Game by game, **drag each kid onto the field** into a slot and set the
   **half-time swap** (who comes on for whom). The bench shows who's resting.
3. A panel lists every kid's **total minutes across all games**, coloured
   **red → green**. Swap a green kid for a red one in game 3's second half → the
   numbers **recolour instantly**.
4. Flip between games, nudging, until the whole squad is greenish. The things the
   app *can't* judge (shape, matchups, a kid's preferred role) stay the coach's
   eye; the app just makes the minutes visible and switching effortless.
5. **Save** ("Sunday v2"). It's on the phone for match day.

**On tournament day (phone) — Phase 2:**
6. Create game 1 (or it's linked to the plan). It **opens with the planned XI
   already on the field** - no re-doing the lineup.
7. The timer **nudges at the planned sub time**: "~12:30 - Niilo on for Jasper
   (CDM)." Tap to confirm - or don't (a kid's hurt, the game's chaos). **Reality
   always wins; the plan is a guide.**
8. Between games, adjust games 4-5 on the phone, re-balance, carry on.

**The loop:** plan the set for equal minutes → each game opens pre-loaded → play
& confirm → adjust the rest between games.

## 4. Phase 1 — PR split (native, self-contained planner)

| PR | Scope |
|----|-------|
| **1.1 Minutes engine** | Pure, tested utility: per-player planned minutes across the plan, fair-share target, and deviation (the red→green math). No UI. |
| **1.2 Plan setup + local save** | Entry point + a plan object (roster, #games, game length, formation), stored as a local blob with auto-save. |
| **1.3 Per-game lineup** | Place players into formation slots for one game, **reusing the existing SoccerField + formations** (the "native, not bolted-on HTML" fix). Bench area. |
| **1.4 Subs per game** | The half-time swap schedule per game (who on/off, into which slot). |
| **1.5 Multi-game view + fair-minutes colouring** | The payoff: all games together, per-kid cumulative minutes coloured red→green, cross-game highlight of one player, bench warnings. Depends on 1.1 + 1.3/1.4. |
| **1.6 Plan versions + JSON** | Named snapshots (save/load/rename/delete) + export/import for cross-device/sharing. Polish. |

Phase 1 delivers the whole planning value with **zero cloud, zero game binding**.

## 5. Phase 2 — PR split (assignment)

**Locked decision — how a plan reaches a real game: "prefill on creation" (option A).**
A planner game stays an abstract template (roster slots, formation, periods, subs) with
no match metadata (opponent, kickoff time, season/tournament). Real games are still
created the normal way — you're setting opponent/time/tournament on match day anyway —
and new-game setup gains a **"Prefill from plan"** step: pick a plan + which plan-game, and
the new game opens with that planned starting XI, `selectedPlayerIds`, and planned subs
already loaded. The real game owns the match metadata; the planner owns the lineup.

Prefill is a **one-time copy at creation, not a live binding** — nothing to keep in sync,
nothing drifts, and live substitution events (reality) always win. Rejected alternatives:
(B) "create games from the planner" just moves the metadata entry work and adds a stateful
plan↔game link that can drift; (C) "attach a plan to an existing tournament and map by
order" is a cleaner convenience *if* the tournament is always built first — keep it as an
optional later add-on, not the primary path. The motivating pain: without prefill, matching
a real game to the plan means re-tapping the whole XI from memory with no side-by-side view.

**Locked decision — optional team source in planner setup (mirrors new-game creation).**
The planner setup gains an **optional Team selector**, working exactly like new-game setup:
pick a team and the plan inherits that team's **roster** (pre-selecting the matching master-
roster players — team-roster ids differ, so the match is by player name, per
`NewGameSetupModal`) and its **linked competition's period durations** (`periodCount` /
`periodDuration` off the bound season or tournament, defaulting to 2 / 15). Only if you choose
a team. Leave it blank and you get today's behaviour (full master roster, durations set by
hand). When a team is chosen, store an optional `teamId` on the plan. (Formation is *not*
team-driven — teams carry no formation; the planner keeps its player-count-based default.)

Why this matters: it makes prefill **lossless by construction**. If the plan and the real
game both derive from the *same* team + competition, then at prefill time the rosters match
exactly, the period lengths match, and the planned sub minutes line up with the real game
clock — so the roster-mismatch edge case below essentially disappears. It also reuses a flow
the coach already knows rather than inventing a new "team-scoping" concept.

**Prefill precedence (option A) — the three sources are layers, not competitors:**
- **Team** → the player pool (`availablePlayers`) + roster (formation is not team-driven).
- **Competition (season/tournament)** → match metadata + settings (age group, game type, durations).
- **Planner** → the lineup only: starting XI field positions, `selectedPlayerIds`, sub schedule.

Rules: team/competition prefill runs **first** (pool + metadata + settings); planner prefill
runs **last** and writes **only the lineup layer** — it never overwrites opponent, competition,
or the team pool. If the field already holds a manual lineup, prefill **confirms before
replacing**. Roster mismatch (a planned player not on the linked team — only possible for a
no-team / freehand plan): **apply anyway and warn** ("N planned players aren't on Team X"),
because the plan is the coach's explicit intent for that game. Game length: the real game's
clock always wins; planned sub times are copied as-is and clamp if the real game is shorter.

**Implementation note:** the planned **XI** needs no new game field — prefill copies it into
the game's existing `playersOnField`/`selectedPlayerIds`. Only the **planned sub schedule**
needs new local storage on the game (PR 2.1), so the timer (2.3) can prompt it. Keep it
local-only (like `playerPositions`); cloud is deferred (2.4).

| PR | Scope |
|----|-------|
| **2.0 Optional team source in planner setup** | Add an optional Team selector to planner setup, mirroring new-game creation: on pick, prefill roster + durations (from linked competition) + default formation, and store an optional `teamId` on the plan. Pure planner-side, no game-model change — safest first step. |
| **2.1 Planned sub schedule store (local, keyed by game id)** | A **separate local-only store** (`gameSubs.ts`, keyed by real game id) holds the planned sub schedule — NOT a field on the synced game model. Decided this way on purpose: it touches zero DataStore/cloud transforms (the area that blew up last time), and it survives a cloud pull that replaces the game blob. Cloud sync deferred (2.4). (The planned XI reuses existing `playersOnField`/`selectedPlayerIds` — no new field.) |
| **2.2 Prefill from plan in new-game setup** | Add a "Prefill from plan" step: pick a plan + plan-game → the new game opens with the planned XI on the field, `selectedPlayerIds`, and planned subs. One-time copy, not a persistent binding. Follows the precedence rules above. |
| **2.3 Timer sub-prompts** | During the game, surface the planned subs as prompts in the timer overlay; the coach confirms live as normal substitution events (deviation-safe). **Decided**: the nudge **persists until dismissed** (matches the existing "sub due" alert), fires once per planned sub, is advisory only (never auto-swaps the field), and planned times are literal - a sub time past the final whistle simply never fires. Read-only from the 2.1 store via a `usePlannedSubPrompts(gameId, elapsed, players)` hook; wired in `FieldContainer` → `TimerOverlay`. |
| **2.4 Cloud sync of plans** *(deferred, maybe never)* | Only if cross-device demands more than local + JSON export. This is exactly the part the last attempt over-built - do it last, or not at all. |
| **2.5 Attach-to-tournament prefill** *(optional convenience)* | For coaches who build the tournament up front: bind a plan to a tournament and map plan-games to real games by order, prefilling each on creation. Additive on top of 2.2. |

## 6. Principles / locked decisions

- **Fairness = share of available time**, not raw cumulative minutes (a kid who
  missed games is judged on the time they were available for).
- **Reality corrects the plan.** The plan is a guide; live substitution events
  (and, later, any post-game confirm) are the truth. No auto-execution of subs.
- **Native, not bolted-on.** Reuse the app's field/roster/formations; never embed
  the standalone HTML. That was the "looked awful."
- **Local-first.** Plans live in local storage; cloud is deferred and optional.
- **Multi-game navigation is make-or-break.** The optimizer handles the
  *measurable* (minutes); the coach handles the unmeasured (shape, matchups,
  development). So frictionless game-to-game flipping with a **persistent
  cross-game balance that ripples on each change** is as important as any math.
- **Not the ledger.** A season-long "who's owed minutes" ledger is a *different*
  feature; the tournament planner is self-contained and does not need it.

## 7. Open questions — status 2026-07-13

- **How much is auto-solved vs coach-adjusted?** ANSWERED: coach places lineups
  with live fairness feedback (ramp discs, totals strip, Minutes tab); "Suggest
  fair lineups" (greedy fair-share generator) is the one-tap starting point.
  A variance-minimising optimizer stays a later option; no current need.
- **Availability entry** — DONE: per-game "absent" fold-out on the field view
  (`absentIds` on PlanGame); absent players are skipped by Suggest and drop out
  of that game's fair-share math (`normalizePlanAbsences` self-heals on load).
- **Minutes granularity** — ANSWERED: arbitrary sub minutes (stepper ±1/±5),
  multiple sub windows per slot (stacked pills).
- **Positions in fairness** — DEFERRED: v1 is pure minutes; minutes-by-line
  revisit only if coaches ask.
- **Formation source** — DONE: app formation presets drive slot geometry.

Nothing remains open: availability shipped, plan cloud sync shipped (§11), the
preview test round is done. Last step is the merge chain (PR #649 → master,
prod migrations 036-038 first - see the PROD MERGE CHECKLIST in §11).

## 8. Relationship to the rest

- **Absorbs the scrapped Tournament Planner (#369)** - this is its forward half.
- **Standalone MVP** (`~/projects/matchops-planner`): the source of the algorithm
  and UX; mined for concepts, not runtime.
- **Old in-app code**: tag `archive/planner-integration` (what not to do).
- Sits in **P4 (big bets)**; this doc is the planning P4 requires. Nothing is
  built yet - Phase 1.1 (the pure minutes engine) is the safe first slice.

## 9. Phase 3 — Re-apply a plan to games already created from it

### The problem
A coach builds a plan, creates real games from its planned games, then something
changes mid-tournament (an injury, a no-show, a formation rethink). They edit the
plan - but today that edit goes nowhere: `buildPrefillFromPlan` is a **one-time
copy** at game creation and the game keeps no reference back to the plan. So the
coach has to hand-fix every already-created game. This phase closes that loop.

### Current state (verified)
- No back-reference: a created game stores `playersOnField`, `formationSnapPoints`,
  `selectedPlayerIds`, and (locally, keyed by game id) `plannedSubs` via
  `gameSubs.ts` - but **no `planId`/`planGameId`**.
- The prefill already produces exactly the shape a re-apply needs
  (`buildPrefillFromPlan` → starters + sideline subs + snap points + subs +
  `missingPlayerIds`), so re-apply is mostly *plumbing + guards*, not new algorithm.

### Data model (Phase 3.1, REVISED after deep review)
The link (which plan + planned game a real game came from) lives in a
**separate local-only store** (`src/utils/playtimePlanner/planLinks.ts`, key
`PLAYTIME_PLAN_LINKS_KEY`, map `gameId -> {planId, planGameId}`), written at
creation next to the planned subs.

It was first shipped as `sourcePlanId`/`sourcePlanGameId` on `AppState`, but the
deep review proved that fragile in two independent ways:
1. the autosave snapshot (`createGameSnapshot`) rebuilds the game blob from
   session state and dropped the fields on the first save after creation;
2. in cloud mode a background hydrate on app start replaces the local blob with
   the cloud copy (which never had the fields - no transform/column).
The keyed store has the same survival property as the 2.1 sub store: nothing
rebuilds it, so the link outlives autosaves and cloud pulls. Games created
before this ship have no link and simply can't be re-applied (acceptable; no
migration). (Status: **shipped**, reworked on `feat/playtime-3.5-link-store`.)

### Core (Phase 3.2) - pure + one handler
- **Reuse `buildPrefillFromPlan`.** A re-apply is: recompute the prefill against
  the *current* plan + planned game + *current* roster, then **overwrite only the
  lineup fields**, preserving game identity and history:
  - Overwrite: `playersOnField` (starters + parked subs), `formationSnapPoints`,
    `selectedPlayerIds` (reconciled - same Rule 3 union already added to
    `newGameHandlers`), and the local `gameSubs` (via `setGameSubs`).
  - Preserve: opponent/date/time/location, score, `gameEvents`, assessments,
    notes, personnel, period config, `isPlayed`/`gameStatus` - everything that is
    "what happened", not "who lines up".
- **Handler `reapplyPlanToGame(gameId)`**: load game → resolve the plan link
  from the local link store → `getPlan` + find planned game → `getMasterRoster` (or the
  game's own roster) → `buildPrefillFromPlan` → merge patch → `saveGame` +
  `setGameSubs`. Returns a result the UI can toast (`missingPlayerIds`, counts).

### Guards (non-negotiable)
- **Unplayed only.** Re-apply is blocked (or hard-warned) when
  `gameStatus !== 'notStarted'` / the game already has `gameEvents` - never clobber
  a game that has been played. This is the main safety rule.
- **Plan/planned game must still exist.** If deleted, disable the action with a
  reason ("the source plan was deleted").
- **Destructive to manual edits.** Any hand-tweaks to the game's lineup since
  creation are overwritten → always behind a confirm.
- **Rule 3.** Reuse the reconciliation already in `newGameHandlers`
  (playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers) so a roster that drifted
  since creation stays valid.

### UI (Phase 3.3)
- **Per-game (primary):** a "Re-apply plan" button in `GameSettingsModal`, shown
  only when the game has a plan link (local link store) and is unplayed. Confirm → toast result
  (e.g. "Lineup updated from *Plan name*; 1 planned player not in the roster").
- **Bulk (secondary, high value for the injury case):** from the planner overview,
  each planned game shows "N games use this - update them". One tap re-applies to
  **all unplayed games** whose plan link matches, with a single confirm and
  a summary toast. This is what makes an injury edit propagate in one action.

### Phased PR split
1. **3.1 Link** ✅ *shipped (revised)* - plan link in a local-only store, threaded through
   creation, store them. (No behaviour change; pure plumbing + a test that a
   plan-created game carries the link.)
2. **3.2 Core** - `reapplyPlanToGame` handler + pure merge, guards, tests
   (unplayed-only, Rule 3, missing-player reporting, subs overwrite).
3. **3.3 Per-game UI** ✅ *shipped* - the GameSettingsModal footer button (shown
   only for an unplayed plan-created game) + confirm + toast, wired to a
   `handleReapplyPlan` in `useGameOrchestration` that pushes the rebuilt lineup into
   live state and bumps a refresh key so `usePlannedSubPrompts` re-reads the new
   schedule.
4. **3.4 Bulk UI** ✅ *shipped* - planner-overview "Update N games from this" per
   planned game (count of unplayed linked games via `countReapplicableGames`),
   confirm, then `reapplyPlanToLinkedGames` re-applies to every unplayed linked
   game (played games skipped), invalidates the saved-games cache, and toasts a
   summary. Completes the injury flow: edit the plan once, propagate in one tap.

### Decisions (locked 2026-07-04)
1. **Entry points: both.** Per-game "Re-apply plan" in `GameSettingsModal` **and**
   a bulk "update all unplayed games from this planned game" in the planner.
2. **Played games: hard-blocked.** Never re-apply to a game with events/score
   (`gameStatus !== 'notStarted'` or `gameEvents.length > 0`). Bulk re-apply skips
   them and reports it in the toast (no silent caps).
3. **Overwrite scope: lineup only.** Overwrite `playersOnField` (starters +
   sideline subs), `formationSnapPoints`, reconciled `selectedPlayerIds`, and the
   local `gameSubs`. Leave opponent/date/time/location, **period length/count**,
   notes, personnel, score, events untouched (coach-owned game identity).
4. **Roster source: the game's own roster.** Reconcile against the roster the game
   was created with (its team roster if team-linked, else master), not blindly the
   master roster — so a team-linked game stays consistent and a player who left the
   team is dropped.
5. **Undo: none.** The confirm dialog + unplayed-only guard are the safety net
   (small blast radius; always asks first). No snapshot/revert in 3.x.

## 10. Design decisions to think about (parked 2026-07-12, do NOT fix yet)

1. **App-wide modal chrome modernization (parked; the planner is the pilot).**
   Two planner departures read fresher than the house style and are candidates
   for adoption EVERYWHERE, as one styling pass:
   - **Bare list items** (no `cardStyle` wrapper): planner lists sit directly
     on the modal background; competitions wraps in the dark card with
     negative margins (`-mx-2 sm:-mx-4 md:-mx-6`). Decide one way for the
     whole app.
   - **Collapse-on-scroll chrome** (shipped in the planner 2026-07-13): the
     tab strip slides away on scroll DOWN and returns on the first scroll UP
     (4px hysteresis, 56px threshold; `ScrollableContent` now takes
     `onScroll`). Candidate for every modal with pinned navigation or a
     pinned action: GameStats' tab bar, TeamManager/RosterSettings'
     pinned Add buttons, SeasonTournament's add-button grid. Content area
     wins on phones; access stays one small scroll-up away.
   - **Background layer set** (root-caused 2026-07-13: THE "feels different"
     culprit was one extra bottom glow layer): house modals disagree today -
     SeasonTournament paints 2 layers, GameSettings 3, ModalBackgroundEffects
     now matches GameSettings' 3. The pass should standardize ONE layer set
     across all modals.
   Decide all of it together so modals don't fork into visual generations.
2. **DONE (2026-07-12). Plan manager layout vs house convention.** House pattern (TeamManager,
   RosterSettings, SeasonTournament): create-new is a full-width primary button
   PINNED at the top under the header (fixed section, not in the scroll);
   utility actions (import/export) live LEFT-aligned in the footer. Plan
   manager currently has "New plan" + "Import JSON" at the bottom of the
   scroll content. Align when styling direction is decided.
3. **DONE (2026-07-12) - ribbon tabs + pencil rename. Game rename placement + game tabs.** Renaming currently lives as an
   inline input at the top of the game view - hard to discover. Idea: make the
   game tabs bigger (standalone-planner ribbon style: label + name + include
   dot) so tabs carry the game name, and move renaming somewhere explicit.
4. **DONE (2026-07-12) - moved to footer (left) in field views. Undo/redo placement.** The undo/redo row as the first element of the game
   view breaks up the composition. Candidates: field-view toolbar row (with
   Sub/Clear/Auto-fill), floating corner buttons, or the footer.

## 11. Cloud sync for plans — design (drafted 2026-07-13, build after feature is perfected)

Goal: a Play-Store (cloud-mode) user gets their plans on every device; local
mode stays exactly as-is. Three local stores must sync: `soccerPlaytimePlans`,
`soccerPlaytimePlanLinks`, `soccerPlaytimeGameSubs`.

**Options considered**
- A. One row PER PLAN (`playtime_plans`: id, user_id, name, archived,
  updated_at, `data` jsonb) + tiny `playtime_plan_links` and
  `playtime_game_subs` tables. Per-plan last-write-wins matches the per-plan
  debounced autosave; no field-by-field transforms (the blob stays the app's
  own schema, versioned by `plan.version`).
- B. One blob row per user holding all three collections. Simplest possible,
  but whole-collection LWW: editing plan A on the phone and plan B on the
  laptop loses one of them.

**Recommendation: A.** Small schema, honest conflict unit, and it rides the
existing machinery: extend `DataStore` with plan methods, implement in
LocalDataStore (delegating to today's storage.ts logic) and SupabaseDataStore
(jsonb upsert), let SyncedDataStore queue writes like every other entity.
`storage.ts` becomes a thin shim over `getDataStore()` so the modal does not
change at all.

**PR split (~1-2 weeks total)**
1. Schema + RLS migration (3 tables), staging-first per CLAUDE.md rules.
2. DataStore interface + Local/Supabase implementations + transforms tests
   (blob passthrough; only casing/updated_at mapping).
3. storage.ts shim swap + SyncedDataStore wiring (offline queue).
4. First-sync migration (push existing local plans up on cloud sign-in) +
   E2E against staging.

**Risks / notes**
- Conflict semantics: per-plan LWW is acceptable at this scale (single coach);
  document it. Links/gameSubs rows are keyed per game — natural LWW units.
- The planner's key-locked local writes and the sync queue already coexist for
  games; same pattern, no new locking.
- Import/export JSON stays the universal escape hatch either way.

## 12. Actual playing time — segments on the game record (planned 2026-07-13)

Vision (owner): use the planner to get ACTUAL played minutes through seasons
and competitions, down to minutes-by-position per player. Decision: actuals do
NOT live in plans ("fixing plans after games" was considered and rejected).

**Principle: plan = intent, game = record.** Facts about a played match belong
on that game's record. Plans are editable/duplicatable/deletable/local-only;
games are per-match, synced, backed up, and already feed every stats view.
Storing actuals on games means: deleting a plan never deletes history, games
without a plan (most league games) still get stats, and cloud sync is free.

**Data: playing-time segments on the game**
`playedSegments: { playerId, position, fromSec, toSec }[]` (names TBD).
- Relationship to the EXISTING `playerPositions: Record<playerId, string[]>`
  (Game Settings > player positions, no time dimension): segments are its
  time-aware generalization. Keep the field; derive it automatically from
  segments when they exist (a segment set implies the position tags), and keep
  the Game Settings editor as the quick manual path for games nobody will
  enter times for. Position-diversity stats keep working from either source;
  minutes-by-position exists only where segments do (stay honest, no fake
  even-splits).
- Planner slot → position tag mapping comes from the formation preset (slots
  already carry positions).

**Capture flow (cheap first, live later)**
1. Post-game confirm: a game created from a plan shows "Toteutuiko
   suunnitelma?" - planned lineup + subs pre-filled as proposed segments;
   coach confirms or nudges (sub minute, no-shows). ~30 s because the plan did
   the typing. Corrections land on the GAME; the plan stays untouched.
2. Later: live capture - the match timer's sub confirmations write segments in
   real time, making the post-game sheet a no-op. Shares its data shape with
   the parked timer-hardening refactor (wall-clock period segments): one
   investment, two payoffs.
3. Stats last: minutes per player per season/tournament, minutes vs fair share
   over time, minutes by position, position diversity. Drops into the existing
   Stats aggregation (it already reads saved games).

**Why this matters beyond the planner:** this is the "richer data collection"
prerequisite the roadmap's AI-assistant bet names. "How much has Aarne played
in defense this season?" becomes answerable.

**Sequencing:** after planner finalization + cloud sync. Own initiative:
PR 1 game-schema field + derivation of playerPositions, PR 2 confirm sheet,
PR 3 stats views, PR 4 (later) live capture with the timer refactor.

### §11 addendum — deep-review outcome (2026-07-13)

Reviewed the full sync chain adversarially. Fixed:
1. `clear_all_user_data` RPC missed the playtime tables ("Clear cloud data"
   left ghost plans that hydration would resurrect) — migration 037 (verbatim
   020 + three DELETEs), applied to staging. Account DELETION was never
   affected (auth.users ON DELETE CASCADE).
2. `SupabaseDataStore.savePlaytimePlan` re-stamped `updatedAt` at PUSH time,
   letting a late offline push beat a genuinely newer edit — now preserves the
   edit-time stamp end to end (local stamp → queue → cloud row).
3. Migration wizard (`migrationService`, the first-sign-in "Sync") pushed
   entity-by-entity and MISSED plans/links/subs — added.
4. Full reverse migration (cloud→local) missed them too — added via the
   timestamp-preserving restore helpers.
5. Prefill selected ABSENT players into the real game's squad — excluded.

Verified safe (no change needed): delete-account (cascade), local
clearAllUserData (whole-DB wipe includes planner keys), fullBackup restore
(writes plans back), SyncQueue dedup (update+delete coalesces to delete; the
namespaced `plan:` entityId cannot collide), stale absentIds after roster
edits (filter direction makes them inert).

Known accepted limitation (parity with all other entities): a locally deleted
plan whose delete op is still queued can be transiently resurrected by
background hydration until the queue drains.

**PROD MERGE CHECKLIST: apply migrations 036 AND 037 to prod (with the
CLAUDE.md diff check) BEFORE merging to master.**

### §11 addendum #2 — resumed agents' findings (2026-07-13, all fixed)

1. **HIGH: planner keys lived in the SHARED legacy DB** (localPlanStore used
   the global storage adapter while every other entity uses the per-user
   database). On a shared device user B inherited user A's plans, and the
   sign-in wizard would upload them into B's cloud; clearAllUserData's
   per-user wipe missed them. FIX: localPlanStore is now a factory over
   injected JSON IO, bound by LocalDataStore to ITS adapter; fullBackup and
   the migrations route through the DataStore. (Feature unreleased, so no
   production data migration needed; preview-device plans can be moved via
   Vie/Tuo JSON if they "disappear" after this lands.)
2. **Blind-upsert push could regress the cloud row** (last-pusher-wins even
   with honest stamps; hydration is pull-only so divergence persisted). FIX:
   migration 038's `save_playtime_plan` RPC makes the write conditional
   (applies only when the incoming edit stamp >= stored) - true per-plan LWW.
3. **playtime_plan_links got an FK** (user_id, plan_id) -> playtime_plans ON
   DELETE CASCADE (038): a lost delete-links op can no longer leave immortal
   orphan links, and a backoff-retried link upsert after plan deletion now
   fails instead of resurrecting.
4. Version gates: hydration SKIPS newer-schema blobs; local save never
   down-stamps a higher plan.version.
5. queueSync's store-closing guard now surfaces via the queue-error listener
   (was a silent local-only write).
6. `setPlaytimeGameSubs([])` clears the cloud row (cleared-subs state now
   propagates); bulk paths read the WHOLE subs collection
   (getAllPlaytimeGameSubs on the DataStore) instead of link keys, so subs
   outliving their link still sync/backup.
7. Restore-report counts include plan push failures; the executor's conflict
   deleter mirrors the delete-for-plan routing; the modal logs (not swallows)
   links-cleanup failures.

**Scope decisions (final review round, 2026-07-14):**
- **No `game_id` FK on `playtime_plan_links`/`playtime_game_subs`** -
  deliberate: a link/subs row can reach the cloud before its game row (sync
  queue ordering is not guaranteed across entity types), so a DB cascade
  would reject legitimate writes. Instead, cloud `deleteGame` cascades both
  tables app-side, atomically with the game delete - the queued companion
  cleanup ops remain as a second net. A DB-level FK stays a possible
  follow-up if sync ordering is ever made strict.
- **`deletePlaytimePlan` has no LWW guard** (a queued offline save can
  re-insert a plan deleted on another device). This matches every other
  entity app-wide (games included) - not planner-specific; accepted at
  current scale, revisit with any future app-wide delete-tombstone work.
- **Plan links/subs are unconditional upserts** (no conditional-LWW RPC like
  the plan blob) - deliberate: they are per-game rows whose loss/staleness
  is self-healing from the plan itself, not worth an RPC each.

**PROD MERGE CHECKLIST (updated): apply migrations 036 + 037 + 038 to prod
BEFORE merging to master.** Exact steps:
1. Diff prod's live function against 037's base:
   `SELECT pg_get_functiondef('clear_all_user_data'::regproc)` on PROD vs
   migration 020 - compare the DELETE table list/order, SECURITY DEFINER,
   search_path, and grants (prod has drifted from files before - see 029).
   Apply 037 only if the sole differences are comments/whitespace.
2. Apply 036, then 037, then 038 (all re-runnable: policy drops, constraint
   drop-first, orphan cleanup are built in).
3. Run supabase/migrations/__tests__/036_038_playtime.verification.sql
   (RLS form, LWW true/false, FK block + cascade, clear-all coverage).
4. Only then merge/deploy the app.
