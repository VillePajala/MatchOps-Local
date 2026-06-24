# Playing-Time Fairness & Multi-Game Sub Planner — Planning Doc

**Status:** 🚧 **Planning in progress (DRAFT)** · Big bet (P4) · Not started
**Last updated:** 2026-06-24

> This is a deliberately whole-system plan. It unifies three things that are
> useless apart: **logging actual playing time**, **tracking the running balance
> inside contexts**, and a **planner** that allocates subs across a *set* of
> games to even out playing time by the end. Build piecemeal and it won't fit
> together — so we design it as one.

---

## 1. Vision

Help a youth coach deliver **fair playing time** — where "fair" is measured as
**share of available time**, and balanced not per game but across **every context
the app has**: game → tournament → season → club season → competition. A single
game is allowed to be lopsided; fairness is the *end result over the context*.

## 2. Locked decisions

- **Fairness metric = share of available time** (not raw cumulative minutes). A
  player who missed games (injury/absence) is judged on the time they were
  *available for*, so absences don't unfairly inflate "owed" minutes.
- **Aggregate across all contexts** the app already models: per game, per
  tournament, per season, per club season, per competition/league.
- **Designed as one whole** — capture + context ledger + planner are halves of a
  single loop, planned together.

## 3. The loop (the system)

```
 capture (post-game confirm, per player)
      │
      ▼
 aggregate share per CONTEXT  (extends existing performanceBySeason/Tournament)
      │
      ▼
 surface deficits in the Season/Tournament/Competition view  ← coach reads
      │
      ▼
 PLAN the next set of games to even out the context  ← the planner
      │
      └────────► play ────────► back to capture
```

The unit that matters is the **context**, not the game.

## 4. Part A — Capture (per game)

- **Post-game per-player playing-time confirm** — no in-game friction, no
  automated guessing. The coach fills it in with hindsight (knows about the
  injury sub, the kid who left early), so it reflects reality.
- Stored **normalized to a comparable unit** (minutes or % of game) so it
  aggregates across different-length games.
- **OPEN: input granularity** — buckets (Full/¾/½/¼/DNP) vs slider (0–100%) vs
  minutes. Whatever the UI, it must normalize to a share so it can aggregate.
- Why not real-time / derive-from-field: real-time sub logging fights the app's
  "make management easier" purpose and breaks down in chaos (injuries,
  double-subs); deriving from the field produces wrong data because the field
  isn't kept in sync with reality live. (Analysis done 2026-06-24.)

## 5. Part B — Context ledger (tracking)

- Roll up **share of available time per player** across each context. Slots into
  the existing per-context stats aggregation (`performanceBySeason` /
  `performanceByTournament` in `playerStats.ts`) — same shape, one more measure.
- **Surface in the Season / Tournament / Competition view** (Competitions modal):
  a per-player cumulative-share list, sorted "who's owed time," showing each
  player's share **and deviation** from the group (e.g. "Venla −12% of share").
  At a glance: who to lean on next.

## 6. Part C — The Planner (the hard part)

The previously-scrapped Tournament Planner (#369) was an attempt at the *forward*
half of this. Requirements now:

- **Input:** a **set** of upcoming games (e.g. "the next 4") **plus the existing
  context history as the base** (the already-played share is the starting point).
- **Output:** a plan of **subs within each game** AND optimized so the
  **end-of-context share is ~equal** across players. I.e. it plans the 4 games
  *in parallel*, not independently.
- **Show:** projected share **per planned game** AND **cumulative in the full
  context** (so the coach sees both the per-game rotation and where it lands the
  season/competition balance).
- **Constraints:** per-game player availability, positions/goalie, min/max shift
  length, number of subs, etc.
- **Reality:** the plan is a guide; the post-game confirm corrects what actually
  happened, and the ledger updates — so the *next* plan re-optimizes from truth.

This is fundamentally an **optimization / constraint-satisfaction problem**:
allocate minutes across players × games to minimize share variance subject to
constraints. It needs careful design — both the algorithm and the UX of
reviewing/adjusting a multi-game plan without overwhelming the coach.

## 7. Open questions (need careful thought before any code)

- **Optimization model** — objective (minimize share variance?), constraints,
  and how much is auto-solved vs coach-adjusted. Degenerate cases (more players
  than minutes, uneven availability).
- **Input granularity** (Part A) — buckets vs slider vs minutes.
- **Availability entry** — how the coach says who's coming to which upcoming game.
- **Positions** — is fairness pure minutes, or minutes-by-position/role?
- **Planner UX** — reviewing/tweaking a parallel multi-game plan; what's editable.
- **In-app vs standalone** — the prior Planner was scrapped; decide architecture
  (old code at tag `archive/planner-integration`).
- **Share math** — exact definition of "available time" (squad size, game length,
  partial availability).

## 8. Phasing (proposed)

1. **Phase 1 — Capture + context ledger.** Post-game playing-time confirm +
   per-context cumulative-share view. Coach balances *manually* by reading
   deficits. **Delivers real value standalone**, no planner needed.
2. **Phase 2 — Single-game planner.** Seed one game's rotation from the deficits.
3. **Phase 3 — Multi-game parallel optimization.** Plan a *set* of games together
   against the context base; show per-game + full-context projected share. The
   full vision.

## 9. Relationship to the roadmap

- **Absorbs / reframes #381** (substitution "who came off") — we're tracking
  *playing time*, not sub events.
- **Absorbs the Tournament Planner — full replan (#369)** — that's Part C / the
  forward half.
- Sits in **P4 (big bets)**; this doc is the planning that P4 items require.
