# Overtime + Penalty Shootout — Implementation Plan

**Status**: approved 2026-06-24 · **Risk**: Medium (no timer work) · **Owner**: in progress

## Goal
Knockout games decided in extra time or on penalties are counted **correctly** (a 3-3 won on penalties is a **Win**, not a Draw), with the shootout **logged kick-by-kick** like the match score is built from goals. The match clock is **never touched**.

## Locked decisions
- A penalty/OT win counts as a **Win** in the W/L/D record (not the official "draw, won on pens").
- The shootout is logged **per kick** (your players named; opponents anonymous), and the result is **derived from the kicks** — no fixed format is enforced (handles best-of-3, single-pair sudden death, "only 3 rounds", etc.).
- **Overtime needs no timer and almost no new code**: extra-time goals are logged as normal goals (works after full time → fold into the score → score decides the result). The "went to overtime" checkbox stays as a label.
- Per-player **shootout stats are deferred** — but every kick is stored (with shooter), so a future stats feature can use it.

## The core rule — `resolveGameResult(game)`
1. Not played → `N/A`.
2. Score unequal (incl. OT goals, which are in the score) → `W`/`L` by `homeOrAway`.
3. Score level **and** a shootout has a winner → `W`/`L` from the shootout winner.
4. Otherwise (incl. tied/incomplete shootout) → `D`.

## Data model
`shootoutKicks?: ShootoutKick[]` on the game, where
`ShootoutKick = { id: string; team: 'home' | 'away'; scorerId?: string; scored: boolean; order: number }`.
- Tally + winner are **derived** (pure fn), not stored.
- `wentToPenalties` becomes derived (kicks present); `wentToOvertime` stays a manual label.
- Stored as **JSONB** in cloud → future per-kick fields (e.g. `goalkeeperId`, `missType`) are additive with **no migration**.

## PR breakdown
- **PR 1 — Result engine (no persistence, no UI):** ✅ `ShootoutKick` type, `src/utils/shootout.ts` (tally/winner), `src/utils/gameResult.ts` (`resolveGameResult`), and unify the **in-app** W/L/D sites (playerStats game-by-game, GameStatsModal team record, LoadGameModal highlight). Back-compat: existing games resolve exactly as today (verified — existing suites unchanged). Pure-function tests. _No shootout data is written yet, so no data-loss risk._
- **PR 2 — Persistence + shootout UI:** migration `032_add_shootout_kicks.sql` (`shootout_kicks jsonb`), RPC update, `SupabaseDataStore` transforms, zod schema; `ShootoutModal` (free-form kick log, GoalLog-style) + Game Settings entry point; **unify the remaining result sites (`exportExcel` ×6)** alongside the UI; i18n EN/FI; UI tests. (exportExcel is deferred here because no shootout data exists until this PR, so there's zero interim inconsistency.)

## Test burden
`resolveGameResult` all branches (reg W/L/D, level+shootout W/L, level-no-shootout D, home/away inversion, legacy no-shootout, not-played N/A) · tally/winner derivation · transform round-trip incl. null · stats snapshot (legacy unchanged; a shootout game flips D→W) · migration fresh-apply on staging.

## Future work (explicitly deferred)
- **Format presets / hints** (best-of-3, best-of-5, sudden-death "mathematically decided") — guidance only, never a constraint.
- **Deep shootout stats**: per-player kicks taken/scored, conversion %, decisive-kick record, splits by season/tournament/opponent; **goalkeeper save %** (needs additive per-kick fields: keeper id + save-vs-off-target). All cheap/additive thanks to JSONB.
- **Timer-hardening refactor** (separate project): single source of truth = period segments with wall-clock timestamps. Would end the recurring reload/background clock bugs **and** make a real timed-OT period feasible. Do this only when we actually want the timed OT clock; the work above remains valid regardless.
