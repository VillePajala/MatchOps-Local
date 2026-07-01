# Game Lifecycle & Completeness - Plan

**Status**: 🟡 In progress. Decisions locked 2026-07-01. **Phase 1 DONE 2026-07-01**:
`src/utils/gameCompleteness.ts` (+ tests) + `GameWrapUpCard` ("Finish this game" checklist) on the
`GameStatsModal` current-game tab, routing report/positions/competition to Game Settings. **Phase 2
TODO**: `LoadGameModal` row pill + stats-header roll-up.
**Roadmap**: P2 (UX & quality polish).
**Origin**: feedback that producing a *complete* game record (competition + team linked, settings
done, events logged, post-game assessments + positions + report) is a **scattered procedure** spread
across the timer, control bar, game settings, the assessment modal, and the stats page - with no
spine tying it together and no view of "is this game done?".

## The problem (named)

The app models a full game **lifecycle** - setup -> play -> wrap-up -> output - but the UI never
*exposes* it. Each step lives in its own surface, so the procedure only exists in the coach's head
and "is this game complete?" is invisible. The flexibility (edit anything, anywhere, any time) is
good; the cost is no guidance and no completeness signal. The fix is **connective tissue**, not new
editors: a per-game completeness model, a post-game wrap-up checklist that points at the existing
editors, and completeness indicators so incomplete games don't silently produce half-stats.

This plan covers pieces **#1 (wrap-up checklist)** and **#2 (completeness indicators)**. Pre-game
setup coherence (#3) is noted at the end but out of scope here.

## Completeness model (the shared spine)

A pure util `src/utils/gameCompleteness.ts`:

```
computeGameCompleteness(game: AppState, opts?: { squadSize?: number }): GameCompleteness
```

`GameCompleteness` = per-check status, reused by both the checklist and the badges:

| Check | "Done" when | Notes |
|-------|-------------|-------|
| **Result** | `gameStatus === 'gameEnd'` (or `isPlayed` + score entered) | Score is always numeric; this is really "the game was actually played/finished". |
| **Setup - team** | `teamId` set | Linked to a team. |
| **Setup - competition** | `seasonId` **or** `tournamentId` set | Linked to a season/tournament (either satisfies). |
| **Roster** | `selectedPlayerIds.length > 0` | A squad was chosen. |
| **Positions** | at least one player in `playerPositions` (report coverage `done/total` over the squad) | Optional-but-encouraged; contributes coverage, not a hard gate. |
| **Assessments** | count of squad players with `game.assessments?.[id]` (`done/total`) | Informational count, never required for "complete". |
| **Report** | `gameNotes.trim()` non-empty | The Otteluraportti. |

Return shape (sketch):
```ts
interface GameCompleteness {
  applicable: boolean;                 // false for isPlayed === false (planned/unplayed games)
  result: boolean;
  team: boolean;
  competition: boolean;
  roster: boolean;
  positions: { done: number; total: number };
  assessments: { done: number; total: number };
  report: boolean;
  // Rolled up for badges: 'empty' | 'partial' | 'complete'. "Core" = result +
  // report (+ competition/team); positions/assessments count toward partial->
  // complete but are never mandatory, so the coach is nudged, not nagged.
  overall: 'empty' | 'partial' | 'complete';
}
```

**Principles**
- **Only for played games** (`isPlayed !== false`); planned games return `applicable: false` and show
  nothing.
- **A helper, not a gate.** Nothing blocks saving/closing. "Complete" is guidance; the core is
  *result + report*, with positions/assessments as encouraged extras.
- Pure + unit-tested (each check, the played/planned split, the roll-up thresholds, empty game).
- Labels stay at the call sites (i18n), so the util is i18n-free like `gameRecap.ts`.

## #1 - Post-game wrap-up checklist

A **"Finish this game"** card at the top of the **current-game tab in `GameStatsModal`** (the natural
post-game review surface; it already has the game, `savedGames`, `availablePlayers`, and the recap).
Each row = a check with a ✓ / partial / ✗ state, a count where relevant, and a tap that jumps to the
existing editor:

- **Result** -> (info; ✓ once the game is finished)
- **Competition & team** -> opens Game Settings (`onOpenSettings`, already wired here)
- **Line-up / positions** (`2/11`) -> opens Game Settings (the Line-up section)
- **Assessments** (`3/11`) -> opens the assessment modal
- **Match report** -> opens Game Settings (the report section) / inline

No new editors - the card is a **router with progress** over what already exists. Collapses to a
one-line summary once everything core is done (so it isn't in the way for finished games).

**Optional trigger:** when `gameStatus` reaches `'gameEnd'`, a gentle prompt ("Wrap up this game?")
can open the stats page on this card. Reuses the existing period/game-end flow; low priority, additive.

## #2 - Completeness indicators

Make the state visible where games are seen:

- **`LoadGameModal` rows** - a compact indicator next to the existing `NOT PLAYED` badge: a small
  progress glyph or terse summary (e.g. `Report ✓ · Pos ✗ · 3/11`, or a 3-4 segment bar). The modal
  already has per-game badge rendering + filtering, so this slots in. Optional later: a "needs
  finishing" filter (partial games).
- **`GameStatsModal` header** - the same roll-up for the current game, so the checklist's state is
  glanceable even when collapsed.

Both read the same `computeGameCompleteness`, so the checklist and the badges never disagree.

## Phasing

- **Phase 1**: `gameCompleteness.ts` + the wrap-up checklist card on the stats page (routes to
  existing editors). Delivers the "follow the list" experience on its own. ~1 PR.
- **Phase 2**: completeness indicators in `LoadGameModal` rows + the stats header. ~1 PR.
- **Phase 3**: **entry points.** ✅ **Started 2026-07-01** - a **"Game report"** menu item in the
  control bar's Game Management section (next to "Assess Players") opens the current-game view
  directly, so writing the report / checking readiness no longer means going through "Statistics".
  _Remaining:_ a `gameEnd` auto-open/prompt (defer - it must not clash with the existing post-game
  assessment prompt); optionally rename the stats current-game tab to "This game" vs cross-game
  "Statistics"; a "needs finishing" filter in Load Game.

## Out of scope (here)

- **#3 pre-game setup coherence** (a new-game wizard / setup-complete check ensuring competition +
  team + format + roster before kickoff) - the front-half scatter. Worth doing, separate plan.
- Changing any existing editor. This feature only *connects* and *surfaces* them.

## Locked decisions (2026-07-01)

1. **Core = Result + Roster + Report.** A game is `complete` when it was finished, a squad was
   recorded, and the report is written. Competition/team link, positions and assessments are
   **recommended, never required** - they contribute to an optional `enriched` flag (a subtle star)
   but never block `complete`. Rationale: friendlies without a competition must still be able to read
   `complete`; positions/assessments are enrichment.
2. **Completeness never depends on the timer / `gameEnd`.** Resolving the "game finished but the
   timer never hit max" concern: the model uses **`isPlayed !== false`** as the only "was this
   played" signal (it defaults true, so after-the-fact and never-timed games qualify). We do **not**
   check `gameStatus === 'gameEnd'` - that was the unreliable bit. So there is **no "Result/finished"
   blocker and no "mark finished" wiring**; a planned game (`isPlayed === false`) simply returns
   `applicable: false` and shows nothing. Core reduces to **Report + Roster** (both meaningful);
   "finished" drops out of the checks entirely.
3. **Load Game indicator = a status pill** matching the existing `NOT PLAYED` badge: an amber
   "Incomplete" pill on played-but-partial games; complete games show nothing (or a faint check). **No
   counts in the list** (noise across many rows). The detailed breakdown lives in the wrap-up card;
   the stats header gets a small 3-segment roll-up (result / report / extras).
4. **No age-band flexing in v1.** Because positions/assessments are non-core, a younger team that
   skips them still reads `complete` - so nothing penalises them without any age logic. Keep the model
   uniform; revisit later (it ties to the assessment age bands).

## Still-open (during build)

- Exact `enriched` threshold (all extras vs "most").
- Stats-header roll-up visual (3-segment bar vs a small ring).
