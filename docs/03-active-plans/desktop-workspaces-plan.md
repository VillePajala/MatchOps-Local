# Desktop Workspaces — Ground-Up Plan

**Status:** 📋 Planning (DRAFT) · Big bet (P4) · Not started
**Last updated:** 2026-09-16
**Supersedes the approach in:** #360 (phone-frame column)
**Mocks:** https://claude.ai/code/artifact/c7b07907-81de-42e4-9b5c-2e5beaf2173c

> The desktop app is not the phone app made wider. It is the same components,
> **permanently arranged**. A modal is an apology for a small screen — it covers
> what you were looking at because there is nowhere else to put it. On a laptop
> there is somewhere else, so on desktop **MatchOps has no modals**.

Everything below is measured from this repo on 2026-09-16. Where a number
appears, it was counted, not estimated.

---

## 1. Learn from the last attempt

Tag `archive/desktop-responsive-modals`. Its final commit says what it did:

> *"Add `renderMode` prop to GameSettingsModal enabling inline panel rendering
> in the desktop side panel… Also apply 2-column desktop layouts to
> SeasonDetailsModal and TournamentDetailsModal."*

It fails structurally, not technically: **it forks every modal into two designs
that both have to be maintained.** 28 modals becomes 56 surfaces; the next
feature is built twice and the two drift. That is not hypothetical here — 147
translation fallbacks had silently diverged from what the app actually displayed
(#843), for exactly the reason that two copies of one truth always diverge.

Issue #360 then proposed the opposite: a phone-width column with a gradient on
the flanks. Cheap, honest, and it buys nothing. It stops the app *looking
broken* without making one task easier.

**This is a third route**, and its viability rests on findings §3–§5.

---

## 2. What is genuinely hard on the phone

| Hard on a phone | Measured evidence |
|---|---|
| **Comparison** | The Playing-Time Planner's three views (games / balance / lineup) are *tabs*. Change a lineup, switch tab, discover what it did. |
| **Long forms** | `GameSettingsModal` = **2,228 lines**, three sections. A full-screen takeover you must dismiss to see the pitch again. |
| **Many rows** | Prod: **214 games**, **159 distinct opponent strings**. A phone list shows six. |
| **Precise pointing** | The known `relX 0.96` sideline-clipping bug exists because the edge of a small pitch is hard to hit with a thumb. |
| **Typing** | Voice notes exist *because* typing a report on a touchline phone is not realistic. They still have to be written out somewhere. |
| **Cross-referencing while editing** | Pitch + roster stats + match settings together. Three takeovers today. |

The through-line: **the phone is excellent at capture and poor at comparison.**

---

## 3. Finding: the codebase contains two opposite data patterns

| Modal | Props | Why |
|---|---|---|
| `GameSettingsModal` | **68** | Prop-drilled |
| `NewGameSetupModal` | **49** | Prop-drilled |
| `GameStatsModal` | **45** | Prop-drilled |
| `LoadGameModal` | 19 | Prop-drilled |
| **`PlaytimePlannerModal`** | **7** | **Loads its own data** |

`useGameOrchestration` is a **2,644-line** hook that assembles two bundles
(`gameContainerProps`, `modalManagerProps`); `HomePage` is a 101-line
composition root that renders them. `ModalManager` receives three bags:
**8 state + 17 data + 56 handlers.**

**Why this matters for panels, and why it is *not* the blocker I first assumed:**
a docked panel needs its data live and continuously, not at open-time. The bags
already are live — they are recomputed every render. So data reaching four
simultaneous panels is **already solved**; the shell distributes the same bags.

**What it does mean:** the planner's pattern (self-loading, 7 props) is the one
that scales to workspaces, and the prop-drilled pattern is the one that makes
every new panel a 60-prop threading exercise. That is a direction for new work,
not a prerequisite. **Do not refactor 2,644 lines before starting.**

---

## 4. Finding: the seam is two symbols, not twenty-eight files

This is what makes the plan cheap, and it is a direct dividend of yesterday's
`modalStyles` consolidation (#826).

```
MODAL_BACKDROP          used by 23 of 28 modals
CollapsibleModalHeader  used by 23 of 28 modals
modalContainerStyle     used by 6
ModalContainer          used by 2
```

**23 of 28 modals build their shell from the same two symbols.** A `Panel` is
those two symbols resolving differently. Put a `FrameContext` above them and
23 modals become panels **without individual edits** — the exact opposite of
`renderMode` on each.

The 8 that do *not* share the chrome are:

> BackupRestoreResults · CloudAuth · Confirmation · ImportResults ·
> PendingSyncWarning · PlaytimePlanner · ReConsent · UpgradePrompt

Which is almost precisely the list that **should stay modal anyway** —
confirmations, auth, one-shot result reports — plus the planner, which becomes a
workspace. **The split has already happened; nobody noticed.**

---

## 5. Finding: four assumptions of exclusivity, and they are the real work

Every modal today assumes it is the only thing on screen. Four mechanisms
encode that, and all four break when four panels are open:

| Mechanism | Files | Breaks how |
|---|---|---|
| `useFocusTrap` | **14** | Four traps fight; focus cannot leave the first |
| `useEscapeToClose` | **17** | Escape becomes ambiguous — which panel closes? |
| `useModalHardwareBack` / `SubLevel` | **22** | Back pops a stack that is no longer a stack |
| `aria-modal` (via `ModalContainer`) | all dialog-labelled | Four `aria-modal` regions is invalid; a screen reader is told the rest of the page is inert |

**This is the actual engineering**, and my first pass of this plan did not
mention any of it. The fix is one idea rather than four:

```ts
type Frame = 'sheet' | 'panel';
```

- **`sheet`** — today's behaviour exactly. Traps focus, owns Escape, pushes a
  back entry, stamps `aria-modal`.
- **`panel`** — none of those. It is a labelled `region`, focus flows through it
  in DOM order, Escape belongs to the workspace, back navigates workspaces.

Each of the four hooks takes the frame into account and no-ops in `panel` mode.
Four small changes in four shared hooks, not twenty-eight in components.

---

## 6. Finding: the desktop-only capabilities the app has *zero* of

Panels are the obvious win. These are the ones that are impossible on a phone
and currently impossible here too — measured:

| Capability | Today | Why it matters |
|---|---|---|
| **Keyboard** | **0** arrow-key handlers app-wide | Arrow-nudging a disc gives pixel precision — and **directly fixes the known `relX 0.96` sideline bug**, which exists because thumbs cannot hit an edge |
| **Multi-select** | **0** uses of `shiftKey` / `ctrlKey` / `metaKey` anywhere | Selecting a squad of 11 from 18 is 11 taps. Shift-click makes it two |
| **Drag between surfaces** | Only `PlayerDisk` is draggable | Roster → pitch, player → period. The planner's whole job |
| **Pointer precision** | Pitch is `onMouseDown/Move/Up` only | No hover affordances, no cursor states, no right-click |

The keyboard line is the strongest argument in this document: it is an
**accessibility gap and a bug fix and a desktop feature at once**, and it costs
almost nothing next to a workspace shell.

---

## 7. The three primitives

### 7.1 `Surface` — one component, two frames

Every modal becomes a surface: its content, with no opinion about its frame.
Rendered inside `<Sheet>` (phone, unchanged) or `<Panel>` (desktop), decided by
`FrameContext` (§5).

> **A surface has ONE layout.** One column that works at 320px and 480px. It
> never gains a two-column desktop variant. Desktop gains come from *several
> surfaces open at once*, never from re-laying-out one.

That rule is the whole difference from the archive, and it wants a **test**, not
a convention — a lint or unit check that no surface file contains `lg:grid-cols`
or a `renderMode`-shaped prop.

### 7.2 `Selection` — app-wide, one thing

```ts
type Selection =
  | { kind: 'player'; id: string }
  | { kind: 'game';   id: string }
  | { kind: 'goal';   gameId: string; index: number }
  | { kind: 'team' | 'season' | 'tournament'; id: string }
  | null;
```

Set by clicking anything anywhere. An inspector panel renders whatever it points
at, which retires `PlayerDetails`, `PlayerAssessment`, `SeasonDetails`,
`TournamentDetails`, `UnifiedTeam` and the goal editor as *things you open*.

`ModalProvider` already carries `selectedPlayerForStats` — the pattern is
half-invented. **Step 2 must replace it, not sit beside it**, or there are two
sources of truth about what is selected.

Because a surface is frame-agnostic, the inspector is the same component the
phone shows as a sheet. One implementation, both platforms.

### 7.3 `Workspace` — a named set of open panels

```ts
interface Workspace {
  id: 'build' | 'match' | 'finish' | 'club' | 'season';
  regions: { left?: SurfaceId[]; centre: SurfaceId; right?: SurfaceId[]; dock?: SurfaceId[] };
}
```

Not a screen — a declaration of what is already open. **The centre often does
not change between workspaces**: the pitch stays put across Build, Match and
Finish. The furniture moves.

---

## 8. The workspaces

### 8.1 Build — Thursday evening

Left: roster **with season minutes**. Centre: pitch as workbench. Right:
`GameSettingsModal`'s three sections, docked. Dock: **all four periods at once**.

Drag a player on and three things move together — bench list, his minutes bar,
the projected `+10'`. On a phone those are three screens, so the connection is
held in the head, and in practice it is not: the same two children sit out again.

**Needs one new thing: availability.** There is no "who is coming" field in the
data model. Most useful item on the screen; a feature, not a layout.

### 8.2 Match — gated on a question

Pitch centre, squad + live minutes left, timer pinned, event log right. Nothing
is covered; imbalance is visible **while it can still be fixed**.

**Only build it if a laptop is genuinely courtside.** Plausible in a futsal hall,
not in February rain. This is a question about how coaches work, and the owner
is the one who knows.

### 8.3 Finish — Sunday morning

Left: the completeness checklist as a worklist. Centre: pitch showing where
people actually played. Right: goal log, editable in place. Far right: **what
this match changed**.

`gameCompleteness.ts` **already computes** those seven items (squad, goals,
scorers, report, positions, voice notes, competition). On a phone it is a card
you scroll past.

The far-right panel is the only new idea and it is the argument for the project:
season record, head-to-head, the minutes ledger — and a button that pushes the
finding into **next Thursday's lineup**. The loop closes without anyone
remembering.

### 8.4 Club — roster, teams, personnel

List, inspector, membership. Least glamorous, most used. **This is where
multi-select earns its place**: editing eight players becomes one selection.

### 8.5 Season — May, and whenever someone asks

Record, per-opponent table, player table, match log, **and the fairness spread**
— *"349 minutes between most and least played, ~15 per game"* — which no screen
says today and which is the number a parent actually asks about.

Also the desktop face of match-ops.com while go-to-market runs.

---

## 9. What every modal becomes

| Modal | Becomes |
|---|---|
| GameSettings · GoalLog · LoadGame · RosterSettings · TeamManager · PersonnelManager · SeasonTournamentManagement · OpponentNameSweep · RulesDirectory · TrainingResources · Instructions · RuleViewer | **Panel** |
| SeasonDetails · TournamentDetails · UnifiedTeam · PlayerDetails · PlayerAssessment | **Inspector** |
| PlaytimePlanner · GameStats | **Workspace** (their tabs become regions) |
| NewGameSetup | **Mostly disappears** — it *is* Build |
| Confirmation · CloudAuth · Settings · UpgradePrompt · ReConsent · PendingSync · ImportResults · BackupRestoreResults · Recap · Shootout | **Stay modal** — interruptions should interrupt |

Ten stay modal. **Eight of those ten are already the ones that do not share the
modal chrome** (§4) — the codebase had already sorted them.

---

## 10. Build order

Each step ships alone and is useful before the next exists. No big bang — the
explicit lesson from both the planner and desktop archives.

**Step 0 — The spike. One afternoon. Decides everything.**
One max-width wrapper with a `transform`, then open three modals. `transform`
creates a containing block for `position: fixed` descendants, which is how the
fixed-position surfaces get constrained for free — but the app uses
`backdrop-blur` in **22 files**, and `backdrop-filter` inside a transformed
ancestor is a known cross-browser trouble spot. **If the blur breaks, the cheap
path is gone and this document needs rewriting. Do not plan past it.**

**Step 1 — `FrameContext` + the four hooks.** Teach `useFocusTrap`,
`useEscapeToClose`, `useModalHardwareBack` and the `aria-modal` stamp to no-op in
`panel` mode. **Zero visual change** — everything is still a sheet. This is the
step that makes everything else possible and it touches four shared files.

**Step 2 — `Panel` + prove it on one surface.** Give `MODAL_BACKDROP` and
`CollapsibleModalHeader` a panel presentation. Convert `RosterSettingsModal`
(359 lines, 12 props, self-contained) and show one component in both frames.

**Step 3 — `Selection` + inspector.** Two kinds only (`player`, `game`).
**Replace** `selectedPlayerForStats`. Make the phone render the inspector as its
sheet, proving the pattern on both platforms before it spreads.

**Step 4 — Workspace shell + breakpoint.** Below the breakpoint, today's app
exactly.

**Step 5 — Season workspace.** Cheapest, everything exists, immediately
showable, doubles as a marketing surface. **Ship it and find out whether dense
reads as powerful or as intimidating — before committing to the rest.**

**Step 6 — Keyboard.** Arrow-nudge on the pitch, tab order through the squad,
Escape owned by the workspace. Fixes `relX 0.96`. Cheap, and it is the step that
makes the app feel native on a laptop rather than resized.

**Step 7 — Finish workspace.** Highest value per unit of work; checklist and
goal log exist. The loop closes here.

**Step 8 — Build workspace.** Needs **availability** first.

**Step 9 — Club workspace + multi-select.**

**Step 10 — Match workspace.** Only if the §8.2 question says yes.

---

## 11. What could kill this

- **The `backdrop-blur` interaction.** Step 0 exists solely to find out.
- **Density reading as intimidation.** The phone app is liked partly *because* it
  shows one thing. Step 5 is first so this is tested cheaply.
- **A surface growing a desktop variant.** The moment one does, the archive
  repeats. Needs a test, not a convention.
- **Two selection states.** If `Selection` and `selectedPlayerForStats` coexist
  they will disagree.
- **Refactor gravity.** `useGameOrchestration` is 2,644 lines and will look like
  it must be split first. **It must not.** §3 shows the bags already work.
- **Scope gravity.** Every workspace suggests a feature. Availability is already
  one. Ship arrangement first.

---

## 12. What NOT to do

- **Do not port `renderMode`.** The archived mistake, by name.
- **Do not touch the phone layout.** Saturday works.
- **Do not build a desktop navigation concept.** The five workspaces *are* the
  navigation.
- **Do not start with Match** because it is the most fun to design. Its premise
  is the least certain.
- **Do not refactor the orchestration hook first.**

---

## 13. Open questions for the owner

1. **Is a laptop ever actually at a game?** Decides whether §8.2 is built at all.
2. **Availability** — worth a data-model addition, or is a coach's head enough?
   The difference between Build being useful and decorative.
3. **How dense is too dense?** Step 5 is the cheap test; the answer is taste and
   it is the owner's.
