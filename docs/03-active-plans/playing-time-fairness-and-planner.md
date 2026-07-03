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
| **2.3 Timer sub-prompts** | During the game, surface the planned subs as prompts; the coach confirms live as normal substitution events (deviation-safe). |
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

## 7. Open questions (before Phase 1.5 / the optimizer)

- **How much is auto-solved vs coach-adjusted?** Likely: coach places lineups,
  the app *shows* imbalance and lets them fix it (no black-box solver at first).
  A real optimizer (minimise share variance under constraints) is a later option.
- **Availability entry** - how the coach marks who's coming to which game.
- **Minutes granularity** - the standalone uses full-game vs half-rotation slots;
  is one half-time window enough, or arbitrary sub times?
- **Positions in fairness** - pure minutes, or minutes-by-line too (ties into the
  position-diversity feature we just shipped)?
- **Formation source** - reuse the app's formation presets for the slot layout.

## 8. Relationship to the rest

- **Absorbs the scrapped Tournament Planner (#369)** - this is its forward half.
- **Standalone MVP** (`~/projects/matchops-planner`): the source of the algorithm
  and UX; mined for concepts, not runtime.
- **Old in-app code**: tag `archive/planner-integration` (what not to do).
- Sits in **P4 (big bets)**; this doc is the planning P4 requires. Nothing is
  built yet - Phase 1.1 (the pure minutes engine) is the safe first slice.
