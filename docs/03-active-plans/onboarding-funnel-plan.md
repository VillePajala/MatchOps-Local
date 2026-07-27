# In-context resource-creation funnel (new-user onboarding) — plan

**Status:** planned (design pass) · **Roadmap:** P2 · **Created:** 2026-07-27
**Prerequisite:** none blocking — the two-level structure, dashboard, and marketing revamp are shipped. Build on its own branch.

## 1. Problem & goal

When a brand-new coach signs up, they land in the two-level Home with an empty club. The old first-run walkthrough was removed during the dashboard/two-level work, and nothing guided replaced it. Result: a functional but **unguided** first run — exactly the wrong first impression right before any marketing push.

**Goal:** make **game creation itself the onboarding funnel.** The coach just wants to create a game; the flow surfaces each missing prerequisite (team, players, competition, personnel) at the moment it's relevant, with an inline way to create it. Setup happens as a byproduct; concepts are introduced in context, never as upfront prep. This is a leaky-bucket fix that gates the go-to-market work.

## 2. Decided design (from the 2026-07-22 stress-tested notes — these are settled)

- **Game creation IS the funnel.** No separate onboarding screen or forced wizard.
- **Inline create is ALWAYS available** on every selector — not first-time-only (first-time-only reintroduces the "disappearing button" confusion). **Prominence adapts:** a hero call ("Create your first team") when the picker is empty; a quiet "+ Add new" when populated. The empty state is just the zero case of a capability that always exists.
- **Render as inline panels WITHIN the New Game modal** (an internal panel/wizard stack), NEVER as detours that open the full manager modals. This is what keeps state-preservation and hardware-back safe.
- **Nesting bottoms out at depth 2:** game → create team → create competition (team creation can bind a competition). Players / competition / personnel are leaf panels.
- **Home tabs stay** the full management surface (edit/delete/bulk/advanced/prep-ahead). Two doors to the same room: **create in context (game flow), manage in bulk (Home).**
- **Everything past the true minimum is skippable** — the flow introduces, never blocks. Only players are near-essential (need a lineup); even those are inline-added.
- **One shared create-form component per resource** used by BOTH the Home manager and the funnel panel, so both produce identical artifacts.

## 3. Resources & funnel behavior

| Resource | Depth | Manager modal (bulk) | Funnel panel | Notes |
|---|---|---|---|---|
| **Team** | 1 (can push competition → 2) | `TeamManagerModal` / `UnifiedTeamModal` | `TeamCreateForm` panel | A team can bind a season/tournament → this is the only depth-2 path. Prototype this first. |
| **Players** | 1 (leaf) | `RosterSettingsModal` | inline add-player (**already exists**: `NewGameSetupModal.onAddPlayerToRoster`) | Near-essential; generalize the existing POC into the shared form. |
| **Competition** (season / tournament) | 1 (leaf; also reachable at depth 2 from team) | `SeasonTournamentManagementModal` | `CompetitionCreateForm` panel | Fully skippable. Decide: expose both season + tournament create, or one entry that picks. |
| **Personnel** | 1 (leaf) | `PersonnelManagerModal` | `PersonnelCreateForm` panel | Fully skippable. Lowest priority. |

## 4. Open specifics — proposed answers (the actual design pass)

### 4a. Missing-prerequisite detection + prompt
No heavy "prerequisite engine." The New Game modal already has the resource counts (via the existing React Query reads). Each section drives **adaptive prominence** off emptiness:
- **No team** → team section leads with a hero "Create your first team" inline panel.
- **No players** → roster/selection section leads with "Add your first player."
- **Competition / personnel** → always the quiet "+ Add", never hero (skippable).

The "guidance" is emergent: a first-timer opening New Game is naturally walked name → team → players → (optional competition) → start, because each empty step is prominent. **Decision to confirm:** passive adaptive-prominence only, or ALSO a one-line gentle stepper header for the fully-empty club ("Let's set up your first game — 1. team, 2. players")? Recommend starting passive; add the stepper only if testing shows people stall.

### 4b. Panel stack + hardware-back
- The New Game modal owns an **internal panel stack** (array). Opening a create panel pushes; save/cancel/back pops.
- Each panel depth registers `useHardwareBackSubLevel(active, onBack)` (exists: `src/hooks/useModalHardwareBack.ts:233`), `active` when that depth is the top of the stack. Back pops the top panel; when the stack is empty, the modal's own back closes → Home.
- Depth-2 (game → team → competition) = two stacked panels, each with its own sub-level hook. No global sentinel juggling (mirrors the two-level hardware-back approach).

### 4c. Cloud-sync / data
Inline creates call the **same DataStore methods** as the managers (`createTeam`, `createSeason`/`createTournament`, add-player/roster, `createPersonnelMember`) → `SyncedDataStore` handles local-first write + background cloud sync automatically. After a create, invalidate/refetch the relevant query so the new resource appears in the funnel's selector immediately (optimistic insert acceptable). No special data path.

### 4d. Shared create-form extraction
Extract `TeamCreateForm`, `CompetitionCreateForm`, `PlayerCreateForm`, `PersonnelCreateForm` from their manager modals; render the same component in the manager (bulk) and the funnel panel. The existing inline add-player (`NewGameSetupModal` + `onAddPlayerToRoster`, `addToClubRoster*` i18n) is the proof-of-concept to generalize.

## 5. Build order (phased, low-risk)
1. **Team picker inline-create** — the hardest case (depth-2 competition binding + hardware-back). Proves the whole pattern. Extract `TeamCreateForm`.
2. **Players** — formalize the existing POC into `PlayerCreateForm`; wire adaptive prominence.
3. **Competition** — `CompetitionCreateForm` panel (leaf + the depth-2 entry from team).
4. **Personnel** — `PersonnelCreateForm` panel.
5. **Adaptive-prominence polish** — hero-when-empty across all sections; optional first-run stepper (per 4a decision).

## 6. Non-goals / scope guards
- Not a forced wizard, not blocking — introduces, never gates.
- Does not remove or duplicate Home management (bulk stays in Home).
- No separate onboarding screen.
- Reuses existing create logic — no parallel create paths that could drift from the managers.

## 7. Decisions needed from owner
1. Competition panel: expose **both** season + tournament create, or a single entry that asks which?
2. Fully-empty club: **passive** adaptive prominence only, or add a gentle **first-run stepper** header?
3. Fate of the earlier onboarding leftovers — the demo-field overlay + gear "getting started" tracker: keep alongside the funnel, or retire them once the funnel lands?
