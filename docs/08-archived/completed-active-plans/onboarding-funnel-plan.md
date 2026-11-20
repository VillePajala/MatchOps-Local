# New-user experience — execution plan

**Status:** ready to build · **Roadmap:** P2 · **Created:** 2026-07-27 (revised same day)
**Prerequisite:** none blocking. Small, mostly-reuse changes; each ships independently.

> **This doc replaced the "in-context resource-creation funnel" plan.** A code walk of the actual
> new-user path (see §1) showed the funnel was oversized for the real problem: there are **no
> dead-ends** today — a new coach can reach a playable game. What exists is a few small rough spots.
> The funnel is **parked** as an appendix (§6), to revisit only if real usage shows people stalling.

## 1. What a new user actually hits today (the evidence)

Traced empty-club → first playable game. Findings:

- **No genuine dead-ends.** Every required step is enforced with a toast or an explicit confirm. A new coach *can* get to a game by pressing the obvious amber "New Game".
- **Rough spot A — a dead first screen.** In the cloud build (`hideLocalModeEntry`, `page.tsx:175-178`), `WelcomeScreen` renders a "Choose how you want to get started" hero above **one** button ("Use Cloud Sync"). Local-mode button, backup link, and settings note are all hidden. It's a choice screen with no choice → a wasted tap **plus a reload** before the real first screen (`LoginScreen`).
- **Rough spot B — a clunky bounce.** New Game with zero players is intercepted by a "No Players" confirm → "Add Players" → roster modal. After adding, the user is dumped back to **Home**, with nothing telling them to re-tap New Game. The good inline "add your first player" input that already exists in the setup modal (`NewGameSetupModal.tsx:891`) is unreachable for the truly-empty user.
- **Rough spot C — the blank field.** The one genuinely unguided moment: after Start, the coach faces an empty green field with discs in the top bar and no cue that you **tap a disc, then tap the field** to place it (and that dragging works only for discs *already on* the field — there is no drag-from-bar; see §3 note).

## 2. The three fixes (smallest to largest)

| # | Fix | Effort | Risk | Kills |
|---|---|---|---|---|
| 1 | **Auto-place the team on new-game start** | S | Low | Rough spot C (the blank field) |
| 2 | **Skip WelcomeScreen in the cloud build** | S | Low | Rough spot A (dead first screen) |
| 3 | **Return to New Game after adding players** | S-M | Low-Med | Rough spot B (the bounce) |

No feature flag, no panel stack, no home-screen real-estate cost.

### Fix 1 — Auto-place the team on new-game start (primary)

**The whole placement engine already exists.** `handlePlaceAllPlayers(presetId | null)` (`useFieldCoordination.ts:594`) with `null` = the "Auto" path, which calls `calculateFormationPositions(playerCount)` (`utils/formations.ts:73`) to spread **any** number of selected players into sensible defense→attack rows. It's exposed up as `onPlaceAllPlayers` (`useGameOrchestration.ts:2229`). `getRecommendedFieldSize()` already maps player count → field size.

**The change:** on a **fresh** game start, automatically invoke the Auto placement once, using the selected players. The coach hits Start and their team is already on the pitch — the blank-field moment stops existing.

Rules:
- **Auto (`null`)** — works for any selected-player count; no formation choice to make.
- **Fresh games only.** Resumed/loaded games keep their saved positions — never overwrite them.
- **Non-sticky.** It's a starting arrangement, not a lock: the coach can tap a specific formation, or drag/swap, immediately. Players beyond the field size stay on the bar as subs (existing place-all behavior).
- Default-on (non-destructive + instantly changeable). A toggle can come later only if any coach dislikes it.

This **demotes the guide** (was "Fix A"): with the field pre-filled there's no blank-field gap to explain, so auto-opening/reordering the guide is no longer needed. Leave the guide manual-open.

### Fix 2 — Skip WelcomeScreen in the cloud build

When `hideLocalModeEntry` is true, WelcomeScreen has no job. Boot the new user straight to `LoginScreen` (sign-up), where "Use Cloud Sync" sends them anyway.
- **Language toggle is safe** — `LoginScreen` has its own FI/EN switch (`LoginScreen.tsx:48-65`), so nothing is lost.
- **Wiring notes:** hide `LoginScreen`'s `onBack` ("back to Welcome") in forced-cloud (nowhere back to). Implementation reuses the existing tested Play-Store skip path (auto-`enableCloudMode()` → `setWelcomeSeen()` → `reload` → LoginScreen), just broadened to the whole cloud build — so the one-time reload is **retained** (it's the proven mechanism; removing it was optional polish, not done).
- **Keep WelcomeScreen** in the code for the non-cloud / `NEXT_PUBLIC_INTERNAL_TESTING` config where local mode *is* offered — gate the skip on the same `hideLocalModeEntry`.

### Fix 3 — Return to New Game after adding players

After the "No Players" → "Add Players" → roster detour completes, return the user **into New Game setup**, not to Home. The detour becomes a step, not a bounce. (Alternatively/additionally, make the modal's existing inline add-player reachable in the truly-empty case so there's no detour at all — but the return-to-setup fix is the minimum.)

## 3. The resulting new-user path

**Sign up (LoginScreen) → Home / Games tab (amber New Game hero) → tap New Game → prompted to add players → back into setup → Start → team is already on the pitch → play.**

No dead taps, no blank field, no unexplained bounce.

> **Placement contract (for any guide/help copy):** the bar→field action is **tap-to-activate then tap-the-field**. Dragging only repositions discs **already on the field**. There is **no drag-from-bar** and we are **not** adding it (cross-surface canvas drag = real engineering + new touch-bug class, for a path the formation button already covers). Copy must never say "drag a player from the bar".

## 4. Build order

1. **Fix 1 (auto-place)** — highest payoff, pure reuse. Ship first.
2. **Fix 2 (skip Welcome)** — independent; every new user benefits.
3. **Fix 3 (return to setup)** — independent.

Each is its own small PR to master (real code → branch + review per repo rules). None depend on the others.

## 5. Non-goals

- Not building the resource-creation funnel (parked, §6).
- Not adding drag-from-bar placement.
- Not adding a first-run wizard/stepper or a Home-screen setup checklist (the checklist was already dropped — it can't earn its vertical space without making Home scrollable).
- Not auto-opening the how-it-works guide (Fix 1 removes the need).

## 6. Parked — the in-context resource-creation funnel (revisit only if data shows stalls)

Kept so the design work isn't lost. Build only if real new-user telemetry/feedback shows coaches stalling on setup that these three fixes don't resolve.

**Idea:** make game creation itself the onboarding — surface each missing prerequisite (team, players, competition, personnel) at the moment it's relevant with an **always-available** inline create, rendered as panels *within* the New Game modal (never detours to the manager modals). Home stays the bulk-management surface. Everything past the true minimum (players) is skippable.

**Code reality found during design (why it'd be cheaper than first thought):**
- Create forms are **already extracted** as reusable `mode="create"` detail modals (`UnifiedTeamModal`, `PlayerDetailsModal`, `SeasonDetailsModal`, `TournamentDetailsModal`, `PersonnelDetailsModal`) — embed, don't rebuild.
- Emptiness/counts are already in `NewGameSetupModal` props — adaptive prominence is free.
- The multi-depth hardware-back pattern exists (`PlaytimePlannerModal:1488`, `UnifiedTeamModal:512`).
- **Defer depth-2** (create-a-competition-while-creating-a-team doesn't exist today and an empty club has none to bind) → the "panel stack" collapses to a single active-create-panel slot + one `useHardwareBackSubLevel`.

**If revived, resolved design decisions (owner, 2026-07-27):** competition = single entry that asks season/tournament; passive adaptive prominence only (no stepper); retire the old demo-field overlay + gear tracker when it lands. Build order: team panel first (first real pushed panel), then players, competition, personnel, polish.
