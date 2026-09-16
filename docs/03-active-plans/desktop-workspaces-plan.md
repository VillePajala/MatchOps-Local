# Desktop Workspaces — Ground-Up Plan

**Status:** 📋 Planning (DRAFT) · Big bet (P4) · Not started
**Last updated:** 2026-09-16
**Supersedes the approach in:** #360 (phone-frame column)
**Mocks:** https://claude.ai/code/artifact/c7b07907-81de-42e4-9b5c-2e5beaf2173c

> The desktop app is not the phone app made wider. It is the same components,
> **permanently arranged**. A modal is an apology for a small screen — it covers
> what you were looking at because there is nowhere else to put it. On a laptop
> there is somewhere else to put it, so on desktop **MatchOps has no modals**.

---

## 1. Learn from the last attempt

There is an abandoned branch at tag `archive/desktop-responsive-modals`. Its
final commit says what it was doing:

> *"Add `renderMode` prop to GameSettingsModal enabling inline panel rendering
> in the desktop side panel… Also apply 2-column desktop layouts to
> SeasonDetailsModal and TournamentDetailsModal."*

That is the expensive route, and it fails for a structural reason rather than a
technical one: **it forks every modal into two designs that both have to be
maintained forever.** Twenty-eight modals, each with a phone form and a desktop
form, is fifty-six surfaces. The next feature has to be built twice, and the two
drift — which is the same failure mode as the 147 translation fallbacks that had
quietly diverged from what the app displayed.

Issue #360 then proposed the opposite extreme: constrain everything to a
phone-width column and put a gradient on the flanks. That is cheap and honest,
and it buys nothing. It makes the app *not look broken* on a laptop. It does not
make a single task easier.

**This plan is a third option:** one set of components, rendered either as a
sheet (phone) or as a panel (desktop), arranged into workspaces. No forked
designs, and the space is actually used.

---

## 2. What is genuinely hard on the phone

Not a wish list — these are the things the code itself shows are hard, with the
evidence.

| Hard on a phone | Evidence in this repo |
|---|---|
| **Holding two numbers side by side** | The Playing-Time Planner has three views (games / balance / lineup) that are *tabs*. You change a lineup, switch tab, and find out what it did. |
| **Long forms** | `GameSettingsModal` is **2,228 lines** with three sections (Teams & Roster, Game Details, Game Configuration). On a phone it is a full-screen takeover you scroll and dismiss before you can see the pitch again. |
| **Seeing more than a handful of rows** | Prod has **214 games** and **159 distinct opponent strings**. A phone list shows six. |
| **Precise pointing** | The known `relX 0.96` sideline-clipping bug exists because the edge of a small pitch is hard to hit with a thumb. |
| **Typing** | Voice notes (Kirjuri) exist *because* typing a match report on a touchline phone is not realistic. The notes still have to be written out somewhere. |
| **Cross-referencing while editing** | The owner's own description: pitch **and** roster stats **and** game settings, open together. Currently three separate takeovers. |
| **Bulk selection** | Selecting a squad of 11 from 18, assigning positions, editing a roster — all one-at-a-time today. |

The through-line: **the phone is excellent at capture and poor at comparison.**
Every genuine desktop win is a comparison the phone forces you to hold in your
head.

---

## 3. The architecture already supports this

This is the part that makes the plan cheap, and it was not designed for desktop —
it just happens to fit.

**`ModalProvider` already owns every open/closed flag centrally.** Eighteen
`isXOpen` booleans, plus `selectedPlayerForStats`, `plannerTarget`,
`clubStatsInitialTab`, `competitionManagerKind`. The desktop shell does not need
new state to know what should be visible — **it reads the same provider and
renders panels instead of modals.**

**Modals are already hosted in two places, not scattered.**

- `ClubModalsHost` — club scope, rendered on both screens: TrainingResources,
  RulesDirectory, Settings, Instructions, SeasonTournament, Personnel, Roster,
  TeamManager, LoadGame, NewGameSetup, PlaytimePlanner, GameStats (aggregate).
- `ModalManager` — match scope: GameSettings, GameStats (current), GoalLog,
  PlayerAssessment, Confirmation.

Two files decide what is on screen. A desktop shell replaces **two hosts**, not
twenty-eight call sites.

**The match screen is already decomposed.** `GameContainer` renders
`ControlBar`, `FieldContainer`, `GameInfoBar`, `PlayerBar` as separate
components. Those are panels already; they are simply stacked rather than
docked.

**`selectedPlayerForStats` is a prototype of the inspector.** The pattern is
half-invented already: something is selected, and a surface elsewhere shows it.

**What does not exist:** any `useMediaQuery`/breakpoint hook, and responsive
styling is thin (60 `sm:`, 37 `md:`, 13 `lg:` across all components). There is
no desktop layout to unpick — which is a benefit, not a gap.

---

## 4. The three primitives

Everything below is built from exactly three ideas. If these are right the
workspaces are arrangement; if they are wrong every workspace inherits it.

### 4.1 `Surface` — one component, two presentations

Every current modal becomes a **surface**: its content, with no opinion about
its frame. A surface renders inside either:

- `<Sheet>` — the existing full-screen modal chrome. **Phone, unchanged.**
- `<Panel>` — a docked region with a header and its own scroll. **Desktop.**

The critical rule, and the whole reason the last attempt failed:

> **A surface has ONE layout.** It is a single column that works at 320px and at
> 480px. It does not get a two-column desktop variant. Desktop gains come from
> having *several surfaces open at once*, never from re-laying-out one surface.

`GameSettingsModal`'s three sections stay stacked in a 320px-wide panel. That is
fine — the win is that the pitch is still visible beside it.

### 4.2 `Selection` — app-wide, one thing at a time

A single piece of global state:

```ts
type Selection =
  | { kind: 'player';   id: string }
  | { kind: 'game';     id: string }
  | { kind: 'goal';     gameId: string; index: number }
  | { kind: 'team';     id: string }
  | { kind: 'season' | 'tournament'; id: string }
  | null;
```

Set by clicking **anything, anywhere** — a disc on the pitch, a row in a list, a
goal in the log. The inspector panel renders whatever it points at.

This is what deletes a whole category of modal. `PlayerDetailsModal`,
`PlayerAssessmentModal`, `GoalLogModal`'s editor, `SeasonDetailsModal`,
`TournamentDetailsModal`, `UnifiedTeamModal` all stop being *things you open*
and become *what the inspector is currently showing*.

It also pays on the phone: the inspector is a surface, so on a phone it is the
sheet those modals already are. **One component, both platforms** — the opposite
of the archived attempt.

### 4.3 `Workspace` — a named set of open panels

```ts
interface Workspace {
  id: 'build' | 'match' | 'finish' | 'club' | 'season';
  regions: { left?: SurfaceId[]; centre: SurfaceId; right?: SurfaceId[]; dock?: SurfaceId[] };
}
```

A workspace is *not* a screen. It is a declaration of which surfaces are already
open and where. Switching workspace changes the furniture; **the centre often
does not change at all** — the pitch stays put between Build, Match and Finish.

---

## 5. The workspaces

### 5.1 Build — Thursday evening, setting up Saturday

| Region | Surface | Today |
|---|---|---|
| Left | Roster **with season minutes** | `RosterSettingsModal` + planner fairness |
| Centre | Pitch, as a workbench | `FieldContainer` |
| Right | Match details, all three sections | `GameSettingsModal` |
| Dock | All four periods at once | `PlaytimePlannerModal` lineup view |

The move that only works here: drag a player onto the pitch and **three things
move at once** — the bench list, his minutes bar on the left, and the projected
"+10'" on the right. On a phone those are three screens, so the connection has
to be held in your head, and in practice it is not: the same two children sit
out again.

**Needs one genuinely new thing: availability.** There is no "who is coming"
field anywhere in the data model. It is the single most useful item on this
screen and it is a feature, not a layout.

### 5.2 Match — only where a laptop is courtside

Pitch centre, squad + live minutes left, timer pinned top, event log right.
Nothing is ever covered; imbalance is visible **while it can still be fixed**.

**Gated on a question only the owner can answer:** is a laptop ever actually at
the side of the pitch? Plausible in a futsal hall, not in February rain. If the
answer is "futsal, sometimes", build it and say so. If not, skip it — it is the
one workspace that could be lovely and unopened.

### 5.3 Finish — Sunday morning

| Region | Surface | Today |
|---|---|---|
| Left | The completeness checklist as a worklist | `GameWrapUpCard` |
| Centre | Pitch showing where people actually played | `FieldContainer` (read-only) |
| Right | Goal log, editable in place | `GoalLogModal` |
| Far right | **What this match changed** | *new* |

The checklist is **not invented for this plan** — `gameCompleteness.ts` already
computes those seven items (squad selected, goals logged, scorers named, match
report, positions played, voice notes to review, competition & team). On a phone
it is a card you scroll past and each fix is a separate modal.

The far-right panel is the only new idea, and it is the argument for the whole
project: season record, head-to-head against this opponent, the minutes ledger —
and a button that **pushes the finding into next Thursday's lineup**. Sunday's
review becomes Thursday's prep without anyone having to remember.

### 5.4 Club — roster, teams, personnel

List left, inspector right, membership below. The least exciting and the most
used. Editing eight players becomes eight clicks instead of eight
open-edit-close cycles.

### 5.5 Season — May, and whenever someone asks

Record, per-opponent table, player table, match log, **and the fairness spread**
on one page. Everything exists except that last number — *"349 minutes between
most and least played, about 15 per game"* — which is the one a parent actually
asks about and which no screen says today.

This is also the desktop face of match-ops.com, which matters while go-to-market
is running.

---

## 6. What every modal becomes

| Modal | Becomes | Note |
|---|---|---|
| GameSettings (2228) | Panel · Build, Finish | Three sections, one column, docked |
| PlaytimePlanner (2790) | Workspace (Build dock) | Its tabs become regions |
| NewGameSetup (1765) | **Mostly disappears** | It is Build. Its fields are the Match details panel |
| GameStats (1686) | Workspace (Season) + panel (Finish) | Its tabs become regions |
| LoadGame (728) | Panel · any workspace | A list; the inspector shows the game |
| GoalLog (691) | Panel · Finish, Match | |
| TeamManager (684) | Panel · Club | |
| RosterSettings (359) | Panel · Club, Build | |
| PersonnelManager (416) | Panel · Club | |
| SeasonTournamentManagement (533) | Panel · Club | |
| SeasonDetails (674) | **Inspector** | |
| TournamentDetails (571) | **Inspector** | |
| UnifiedTeam (945) | **Inspector** | |
| PlayerDetails (236) | **Inspector** | |
| PlayerAssessment (252) | **Inspector** | Flag-hidden today |
| Shootout (283) | Sheet on both | Short, modal, genuinely interruptive |
| Settings (1369) | Sheet on both | Rare, app-scope, correctly a takeover |
| CloudAuth (664) | Sheet on both | |
| Confirmation / UpgradePrompt / PendingSync | Sheet on both | Interruptions are *supposed* to interrupt |
| Instructions / RulesDirectory / TrainingResources / RuleViewer | Panel · own workspace or sheet | Reference material reads well beside work |
| OpponentNameSweep (260) | Panel · Club | |
| ImportResults / BackupRestoreResults / Recap | Sheet on both | Result reports, inherently one-shot |

**Roughly six modals stay modal**, and they are the ones that *should* interrupt:
confirmations, auth, settings, one-shot results. Everything else is a panel or
the inspector.

---

## 7. Build order

Each step ships on its own and is useful before the next exists. No big bang —
that is the explicit lesson from both the planner and desktop archives.

**Step 0 — The spike (one afternoon, decides everything).**
Put one max-width wrapper with a `transform` on the app and open three modals.
`transform` creates a containing block for `position: fixed` descendants, which
is how all 15 fixed-position files get constrained for free — but the app uses
`backdrop-blur` in **22 files**, and `backdrop-filter` inside a transformed
ancestor is a known cross-browser trouble spot. **If the blur breaks, the whole
cheap path is gone and this plan needs rewriting.** Find out first.

**Step 1 — `Surface` + `Panel` + `Sheet`.** No visual change on phone. Convert
*one* modal (`RosterSettingsModal`, 359 lines, self-contained) to prove a single
component renders in both frames.

**Step 2 — `Selection` + the inspector.** The keystone. Do it with two kinds
(`player`, `game`) only, and make the phone use the inspector surface as its
sheet, so the pattern is proved on both platforms before it spreads.

**Step 3 — Workspace shell.** The five-tab top bar, the region grid, and a
breakpoint hook. Below the breakpoint it renders exactly today's app.

**Step 4 — Season workspace.** Cheapest, everything exists, immediately
showable, doubles as a marketing surface. Ship it and see whether dense reads as
powerful or as intimidating **before** committing to the rest.

**Step 5 — Finish workspace.** Highest value per unit of work; the checklist and
goal log already exist. This is where the loop closes.

**Step 6 — Build workspace.** Needs **availability** first, which is its own
feature with its own design question.

**Step 7 — Club workspace.** Most used, most work, least glamorous.

**Step 8 — Match workspace.** Only if Step 0 of the owner's own judgement says a
laptop is ever courtside.

---

## 8. What could kill this

- **The `backdrop-blur` interaction.** Step 0 exists solely to find out. Do not
  plan past it.
- **Density reading as intimidation.** The phone app is liked partly *because* it
  shows one thing at a time. "Everything open at once" is how professional tools
  work and also how they frighten people. Step 4 is deliberately first so this is
  tested on a cheap surface rather than discovered at Step 7.
- **Surfaces quietly growing desktop variants.** The moment one surface gets a
  two-column desktop layout, the fork is back and the archive repeats itself.
  This wants a test, not a convention.
- **Selection becoming a second source of truth.** If `Selection` and the
  existing `selectedPlayerForStats` both exist, they will disagree. Step 2 must
  *replace* it, not sit beside it.
- **Scope gravity.** Every workspace will suggest a feature. Availability is
  already one. Ship the arrangement first; features after.

---

## 9. What NOT to do

- **Do not build a desktop navigation concept.** The five workspaces *are* the
  navigation. Adding a sidebar of screens on top of them is how this becomes an
  admin console.
- **Do not touch the phone layout.** Saturday already works. Every step here is
  additive above a breakpoint.
- **Do not port `renderMode`.** That is the archived mistake, by name.
- **Do not start with the Match workspace** because it is the most fun to design.
  It is the one whose premise is least certain.

---

## 10. Open questions for the owner

1. **Is a laptop ever actually at a game?** Decides whether 5.2 is built at all.
2. **Availability** — is "who is coming" worth a data-model addition, or is a
   coach's head good enough? It is the difference between Build being useful and
   being decorative.
3. **How dense is too dense?** Step 4 is the cheap test, but the answer is a
   taste judgement and it is the owner's.
