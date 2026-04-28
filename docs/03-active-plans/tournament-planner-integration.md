# Tournament Planner Integration — Design Plan

**Status:** in execution · **Last updated:** 2026-04-28 · **Owner:** @valoraami
**Companion docs:**
- [tournament-planner-integration-survey.md](./tournament-planner-integration-survey.md) — technical findings from the MatchOps-Local code base
- [tournament-planner-integration-pr-plan.md](./tournament-planner-integration-pr-plan.md) — executable PR-by-PR breakdown
- [tournament-planner-integration-safety.md](./tournament-planner-integration-safety.md) — process rules

## Drift since this doc was written (2026-04-28)

The standalone planner has evolved while this design plan was on the shelf. The data contract is still ~90% intact; three small drifts to note:

1. **Period model is closer than the doc implies.** Standalone now stores canonical `numberOfPeriods` + `periodDurationMinutes`, exactly matching MatchOps-Local's existing fields. One less transform than this doc anticipated when integration code lands.
2. **Role stamina tag.** Each formation role in the standalone now carries `sub: 'never' | 'preserved' | 'preferred'` (used by the fair-share suggester). When the `roles?` map lands on `FormationPreset` (Phase 1, the doc's #1 risk fix), this tag should land alongside it — same data shape, same time. Otherwise the suggester can't be reused.
3. **Standalone interactivity grew.** Detail view, multi-sub workflow, segment-level Move/Replace/Remove, role-aware fair-share, double-position validation, scrubbed pitch + timeline. Phase 1's "starting-XI editor with drag-drop, ported from the standalone's swap engine" is now bigger than the original 1.5-week estimate — closer to 2.5 weeks.

The phase ordering (0 → 0.5 → 1 → 2 → 3 → 4 → 5) still holds. See `tournament-planner-integration-pr-plan.md` for the executable form.


## Summary

Integrate multi-game lineup planning into MatchOps-Local as a first-class feature accessed from a new top-level menu entry **"Planning"**. The coach picks a set of existing games, launches the planner on them, designs starting lineups + timed substitutions across the whole set, and applies the result back to the individual game records. Plans can be saved, reopened, and swapped as contingency versions. No new lineup-only entity is introduced — plans drive the actual `Game` data.

This supersedes the earlier proposal (captured as Alternative A at the bottom) which modelled each game's plan as its own `PlannedLineup` entity.

## Problem today

- Games in MatchOps-Local are authored one at a time. There's no UI to see a tournament-wide lineup view — who plays which position across all the games, who's under/over-minuted, who subs off where.
- Substitutions are logged reactively during the match; there's no way to pre-plan "Tomas for Roope at 14:00 in game 3" and have the app remind you when the time arrives.
- Coaches currently plan in spreadsheets or on paper, then manually retype the starting XI into each game.
- A standalone companion tool (`/home/villepajala/projects/matchops-planner/`) exists and works well, but its plans don't flow back into MatchOps-Local.

## Goal

One menu item away from:
1. Selecting any set of existing games (homogeneous in team + format at MVP).
2. Designing the plan in a multi-game view (starting XIs + scheduled subs per game).
3. Watching a tournament-wide minutes dashboard update live as you edit.
4. Saving the plan with a name (optional — working drafts auto-save).
5. Pressing **Apply** to push every lineup and scheduled sub into the underlying `Game` records in a single confirmed batch.
6. During the live match, the game timer fires a banner at each scheduled sub time: *"Planned: OUT Roope / IN Tomas at CDM · Apply · Skip"*.

## Proposed architecture — "plan is game data, plus a session wrapper"

Two data additions to MatchOps-Local, and nothing more:

### 1. `Game.scheduledSubs` — a generic scheduled-substitution list (phase 0)

Lives on the existing Game record. Useful on its own even without the planner — a coach who wants timed sub reminders during live play benefits regardless.

```ts
interface Game {
  // ... existing fields
  scheduledSubs?: ScheduledSub[];
}

interface ScheduledSub {
  id: string;
  timeSeconds: number;           // any valid time in game, not just halftime
  outPlayer: PlayerId;           // matches the standalone planner's JSON envelope
  inPlayer: PlayerId;
  positionRole: PositionRole;    // the slot the sub affects
  status: 'pending' | 'fired' | 'skipped';
}
```

Timer behaviour: when `gameState.timeSeconds` crosses a pending `ScheduledSub.timeSeconds`, raise a banner UI ("OUT Roope / IN Tomas at CDM · Apply · Skip"). Apply creates a normal `substitution` GameEvent and marks the scheduled sub `fired`; Skip marks it `skipped`. Either way the banner dismisses and the timer continues.

### 2. `PlanningSession` — the coach-facing "plan" entity

Lives at the user/team scope. Points at a set of games. Carries a **draft snapshot** of each game's lineup + scheduled subs so the plan can be reopened, iterated on, and versioned without mutating the underlying game data.

```ts
interface PlanningSession {
  id: string;
  teamId: string;
  name: string;                        // "Lauto 80 Verne-5", "Jasper-sick contingency"
  gameIds: string[];                   // 1..N games covered
  draft: Record<GameId, PlanDraft>;    // keyed snapshot, one entry per gameId
  isActive: boolean;                   // one per (team, gameIds) at a time; drives live sub banners
  appliedAt?: string;                  // ISO timestamp; null until first Apply
  updatedAt: string;
  createdAt: string;
}

interface PlanDraft {
  startingXI: Record<PositionRole, PlayerId>;   // lineup at minute 0
  bench: PlayerId[];                             // remaining roster
  scheduledSubs: Array<Omit<ScheduledSub, 'status'>>;  // all pending at plan time
}
```

Key properties:

- **The draft is a snapshot.** Plans don't live-read from the Game records; they hold their own lineup copy. That's what enables contingency versions ("Jasper-sick" plan stored alongside "default" plan for the same games) without duplicating games themselves.
- **Apply is an explicit action** that reads the draft and writes `startingXI` → `Game.playersOnField` + `Game.selectedPlayerIds` (resolving roles to `relX/relY` via the game's formation preset), and `scheduledSubs` → `Game.scheduledSubs`. Confirmation modal shows a per-game diff preview first.
- **After Apply, plan and game can drift.** If the coach edits a game directly post-apply (say at half-time), the plan doesn't silently overwrite on next open. Reopening a plan shows the draft; re-applying is always opt-in.
- **Only one session can be `isActive: true`** per (team, game-set). That's the one whose scheduled subs fire as live banners. Flipping active between contingencies takes one tap.
- **Auto-saved drafts**: every mutation updates `updatedAt` in localStorage immediately (phone-rings protection) and syncs via `SyncedDataStore` in the background like every other entity.

### 3. The planner UI (ported from the standalone, rebuilt in React/Tailwind)

Accessed from the new **"Planning"** menu item.

- **Landing screen** (empty state or list of saved sessions): "New plan" button + list of previously saved `PlanningSession` rows.
- **Game picker**: multi-select over games for the active team. Selections constrained to homogeneous sets (same team, format, game duration) at MVP — the button is disabled with an explanatory hint otherwise.
- **Editor**: ribbon of selected games → the pitch card → bench drawer → substitution timeline strip below the pitch → tournament-wide Minutes tab → Session tab (save/rename/Apply/version-swap).
- **Timeline editor (phase 2)**: a horizontal 0:00→end bar per game, drag markers to add/move subs, tap a marker to edit its out/in/position.
- **Minutes view**: the same quick-scan chip grid + multi-player comparison focus pane the standalone has today. Fairness math recomputes from the draft (intervals between subs) so it handles arbitrary sub timing.

### 4. Mobile vs desktop

- Planner is responsive. Phone: swipable carousel (one game at a time). Tablet / desktop: grid of cards.
- Live game UI is untouched; scheduled-sub banners slot into the existing banner mechanism.
- Planning is the only screen that feels better with a bigger display. That's fine — coaches plan at home on a laptop and use the phone on match day.

## Decisions (closed)

| # | Decision | Rationale |
|---|---|---|
| D1 | New menu item labelled **"Planning"** | Two syllables, noun, matches *"Games" / "Stats" / "Players"* pattern |
| D2 | Plan data flows into `Game.playersOnField` + `Game.selectedPlayerIds` on Apply — **no new `PlannedLineup` entity** | Schema minimalism, no cross-entity sync drift, live game is always authoritative |
| D3 | `PlanningSession` entity exists **only** to let coaches save, reopen, and version plans | Without it, "contingency versions" would require duplicating games or saving JSON blobs manually |
| D4 | Draft is a snapshot (not a live reference to games) | Required for contingency versions; makes Apply a meaningful event; keeps plan/game drift explicit |
| D5 | `scheduledSubs` is a **general Game field**, not a plan-only concept | Reused by the live-match path independent of the planner — highest leverage feature in the roadmap |
| D6 | MVP: homogeneous game selection only (same team, format, duration) | Heterogeneous sets make the pitch grid + fairness math messy; revisit only if coaches demand it |
| D7 | Plans cloud-sync via the existing `SyncedDataStore` path | Consistent with every other entity; no special case |
| D8 | Scheduled subs during live play are **advisory** (banner + confirm), not automatic | Lowers risk; coach always in control. "Strict auto-sub" could be added later but isn't MVP |

## Open questions (still to decide)

1. **Formation role ↔ coordinate bridge.** The planner thinks in named roles (LB, CDM, ST); MatchOps-Local stores positions as `relX/relY`. Options:
   - (a) Extend `FormationPreset` with a `roleCoordinates` table.
   - (b) Add a parallel `RoleLayout` entity linked to formations.
   - (c) Store both on the game (a `positionRole` per `playersOnField` entry).
   Pick before phase 1.
2. **Auto-active on open.** When a coach opens a game that has an active plan, do we auto-apply the starting XI, or just show a "plan available — apply?" prompt? Default: prompt. Worth a short test with a real user.
3. **Migration from the standalone.** Offer a one-time import that reads the standalone's JSON export and creates `PlanningSession` records. When? Could be a phase 5 nice-to-have.
4. **Plan-to-plan copy.** "Duplicate this plan as a contingency" UX. Trivial once the entity exists but not critical for MVP.

## Data-model constraints to respect

From `CLAUDE.md`:

- **Rule 3** (Player array normalization): `playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers`. On Apply, ensure `selectedPlayerIds` includes every player referenced in the plan.
- **Rule 4** (Event order preserved via `order_index`): fired scheduled subs must be inserted as `substitution` GameEvents at the correct order_index.
- **Rule 11** (Event CRUD uses full-save): scheduled subs live on `Game.scheduledSubs`, not `gameEvents`. They transform into GameEvents only on fire/apply.
- **Rule 12** (Cloud = local-first + sync): `PlanningSession` and `Game.scheduledSubs` go through `SyncedDataStore` like every other entity.
- **Rule 14** (saveGame validation parity): `savePlanningSession` needs a validator — every player in `draft.*.startingXI` must exist in the team roster; role keys must be valid for the game's formation; sub times must be in range.

## Implementation phases

**Phase 0 — Scheduled subs as a standalone feature** (≈ 1 week)
- Add `scheduledSubs?: ScheduledSub[]` to Game.
- Game settings UI to add/edit/delete a sub.
- Timer hook + banner UI during live play.
- Ships independently of the planner. Useful on its own.

**Phase 0.5 — External planner bridge (interim UX, optional)** (≈ 2–2.5 weeks)
- MatchOps-Local: "Planning" menu item + saved-session landing (empty for now) + game picker with homogeneous-set constraint + JSON exporter.
- Standalone (`matchops-planner`): JSON importer that reads roster + formation + games from the bundle; generalize hardcoded 11-players / 5-games / 8-positions; JSON re-exporter that injects the edited plan back into the same envelope.
- Coach workflow: pick games in MatchOps-Local → download bundle → open in standalone → edit → export → manually re-type starting XIs into each game at kickoff.
- Nothing written back automatically; no Apply flow; no playtime capture.
- **Conditions for taking this shortcut:**
  - The JSON envelope must be the exact shape the eventual internal `PlanningSession.draft` will use, versioned via `formatVersion: 1`. Bridge ships the real contract, not a throwaway one.
  - Standalone generalization must be capped at ~1.5 weeks. If architectural friction pushes it longer, skip this phase and port to React instead (Phase 1 below).
- **What survives into the full integration:** menu item, game picker, JSON contract shape. Nothing thrown away.
- **What's temporary:** the standalone acting as the editor, and the coach manually re-typing lineups at match time.

**Phase 1 — Planning menu + in-memory editor** (≈ 1.5 weeks)
- New "Planning" menu item.
- Game picker (homogeneous-set constraint).
- Starting-XI editor with drag-drop / tap-to-swap, ported from the standalone's swap engine.
- Apply-now workflow writing to Game records. No save yet; leaving the page loses the draft.

**Phase 2 — Timeline sub editor** (≈ 1.5 weeks)
- Per-game timeline strip below the pitch card.
- Drag markers to add/move subs, tap to edit out/in/position.
- Fairness math recomputes from intervals between subs (not fixed halves).
- Scheduled subs flow into Game on Apply.

**Phase 3 — `PlanningSession` entity** (≈ 1 week)
- `DataStore` methods: `getPlanningSessions`, `savePlanningSession`, `deletePlanningSession`, `setActiveSession`.
- `LocalDataStore` + `SupabaseDataStore` implementations.
- UI: Save / Rename / Delete / Duplicate, landing-screen session list.
- Auto-saved working draft in localStorage keyed by (team, gameIds-hash).

**Phase 4 — Apply preview + safety** (≈ 1 week)
- Diff preview modal ("Game 2: 3 changes — Verne → bench H2, Tomas → CDM, schedule 14:00 sub").
- Per-game opt-out during Apply.
- Post-Apply undo for 30s (restore pre-apply snapshot from a transient cache).

**Phase 5 — Minutes dashboard + versioning polish** (≈ 1 week)
- Port the quick-scan chip grid + multi-player focus comparison.
- Priority-player signalling (★, over/under fair share).
- Active-session toggle when a coach has multiple plans for the same game set.
- One-time importer from the standalone's JSON for legacy plans.

**Total effort: 6–7 weeks** as scoped. Each phase ships something usable; no phase depends on a later phase.

## The silent long-term win

Once `Game.scheduledSubs` and actual played minutes both live in the data layer, the app accumulates something it doesn't have today: **per-player playtime history across games, per position**. That unlocks:

- Season-long fairness audit ("who's chronically under-minuted?").
- Position-development tracking ("how often did Jooa actually play ST this season vs planned?").
- Fatigue signals ("these three players each logged 3 full 80s in a row").
- Pre-match briefing material ("Alexandra 15% under fair share this tournament — let's sit Niilo H. this H2").

No extra infrastructure needed — these are aggregations over data the planner and live timer already persist. Build the views opportunistically as the data matures; get the data shape right from phase 0 so nothing needs backfilling.

## Risks worth naming now

1. **Formation role bridge.** The biggest unknown in the schema work. If `FormationPreset` isn't a clean abstraction today, fix it before phase 1 or the planner will carry a fragile ad-hoc mapping forever.
2. **Scope creep from standalone feature parity.** The standalone has accumulated a lot of UI polish (swipe animations, micro-interactions, chip styling). Decide early how much of that is table-stakes vs nice-to-have. Target: port the information architecture faithfully, let the visual details inherit from MatchOps-Local's design system.
3. **Swap engine porting.** The standalone's `performSwap` has several corner-case fixes (cross-half bench overflow, merge unwind, same-position cross-half flip). Port it with property-based tests that enforce *"each player in exactly one slot per half"* and regression tests for each bug the standalone already fixed.
4. **Apply destructiveness.** Coaches will press Apply at the wrong moment. A solid diff preview + 30s undo window makes this a minor annoyance rather than a data-loss event. Treat it as load-bearing UX, not a nice-to-have.

## Migration path for the standalone

- Keep the standalone at its Vercel URL through phase 5.
- Phase 5 ships a one-time "Import plan from standalone JSON" flow that creates `PlanningSession` records from the standalone's export format.
- Deprecate the standalone a release or two after phase 5. Leave it online read-only for historical plans until users confirm migration.

---

## Alternative A — `PlannedLineup` per game (earlier proposal, superseded)

The first draft of this document proposed a separate `PlannedLineup` entity for every game, linked to the Game by `gameId`. Apply flow: game-open checks if a `PlannedLineup` exists and prompts to apply. Versioning was one `isActive` flag per game's lineup pool.

**Why we moved away from it:**

- Two entities diverge over time; Game and PlannedLineup would always need reconciliation. Tracking three states (game lineup, plan lineup, last-applied) is more state than a coach needs to reason about.
- Versioning at the *game* level is backwards. Coaches think of contingencies at the *plan* level — "the Jasper-sick plan" covers the whole weekend, not game-by-game. The current design (one `PlanningSession` with N game drafts) matches that mental model.
- `scheduledSubs` wants to live on Game anyway for the live timer to consume it. Once that's accepted, having the plan's schedule ALSO live in a parallel entity is duplication.

The `PlannedLineup` approach is still a defensible choice if the coach's mental model is "lineups are per-game artifacts and a plan is just a convenient editing surface". Flag if user research later suggests that framing.

## Alternative B — Overlay mode on the existing Tournament screen (considered, not chosen)

Treat planning as a *mode* on the existing Tournament detail screen rather than a new route. The list-of-games view morphs into a pitch grid when "Planning mode" is toggled on.

**Why not:**

- Only works if every plan lives under a Tournament. Coaches plan across ad-hoc game sets (a league weekend, two friendlies, a mixed selection) that aren't always formally grouped.
- The current design's "pick any set of games" step is strictly more flexible; a Tournament-only subset can be a first-run default if needed.

## Alternative C — Do nothing (status quo)

Keep the standalone at its Vercel URL. Coaches export to JSON and manually retype the starting XI into each game at match time.

Legitimate short-term choice if integration effort is unavailable. Everything above is the long-term investment.

## Related

- Standalone tool: `/home/villepajala/projects/matchops-planner/` (currently at v26, deployed on Vercel)
- GitHub issue: #369 (MatchOps-Local repo)
