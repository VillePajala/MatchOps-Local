# Planner UI Parity Plan — Make the In-App Planner Match the Standalone

> **Status note, 2026-05-18:** This is the detailed parity implementation reference. For the short canonical roadmap and branch policy, start with [planner-roadmap.md](./planner-roadmap.md).

**Status:** Draft. PR #404 (master cutover) is on hold pending this rework.
**Branch:** `feature/planner-integration` (data model, security, sync — keep)
**Standalone reference:** `/home/villepajala/projects/matchops-planner/index.html` (single-file vanilla JS, 5,203 lines)
**In-app components today:** `src/components/Planning*.tsx` (eight files, all wrong-idiom)

---

## 1. Why the integration looks and behaves nothing like the standalone

The 10 review passes we ran on PR #404 were correctness reviews — security, data integrity, sync, types, tests. **Not one of them compared the rendered output to the standalone.** What we built is a structurally-correct, well-validated, cloud-synced planner — but its surface is wrong.

The standalone is a **visual, direct-manipulation timeline planner**. The user sees substitutions as adjacent colored blocks under each pitch position, and clicks any block to add/edit/remove subs.

What we built is a **form-driven editor**. The user types `MM:SS` into a text input, picks a role and player from dropdowns, and clicks "Add" — substitutions appear as a list of rows below the form. The pitch above only shows the starting XI. Highlight chips below show "who plays where" but with intrinsic-text-width pills, no proportional segments, no half-time line, no segment-color escalation.

The UX divergence isn't bugs — it's that **eight components are solving the wrong problem at the surface**:

| Standalone primitive | Our equivalent | Idiom mismatch |
|---|---|---|
| `chip-row` (flex container, `.slot { flex: 1; min-width: 0 }` equal-weight chips, half-time `<div class="ht-divider">` overlay, `data-segidx` color escalation) | `PlanningChipGrid.tsx` (`inline-flex items-center px-2 py-0.5` intrinsic-width buttons) | Visual timeline → highlight toggle |
| Chip click → bottom sheet ("Track across all games", "Add sub at minute…", "Move sub…", "Replace incoming player…", "Remove sub at X'") + gear-icon position sheet (segments list + "Add sub at minute…") | Pitch role click → halftime-split shortcut panel only | Direct manipulation → fixed-action panel |
| Drag-drop / tap-to-swap between any two chips **in the same game** (field, bench, sub segment) | Drag between role slots only (starting XI swap) | Segment-graph swap → starter swap |
| Bench drawer with kickoff + halftime panels | No bench drawer; bench is a flat row beside the pitch | Time-aware bench → time-blind bench |
| Single / Grid view toggle (one game vs all 5 side-by-side, breakpoint ≥900px); horizontal swipe on detail switches active game | Tab strip (one game at a time) | Multi-game oversight → focused single-game |
| Tournament totals strip above the pitch (`.game-min-strip` / `.strip-cell` cells, 11-column grid) | No equivalent (`PlanningTotalsTable` lives below, not embedded with pitch cards) | At-a-glance tournament view → separate panel |
| Detail overlay (full pitch + time scrubber + per-role timeline rows with `dt-half` halftime guide) | None | Deep-dive scrub view → no equivalent |
| Player pills color-graded by tournament minutes vs fair share, chip-min-bar embedded inside each chip (`width: Math.min(100, r*80)%`, hue from `hueForRatio`) | `PlanningMinutesDashboard` separate panel below | Embedded gradient → separate panel |
| `PlanningTimeline.tsx` form (typed MM:SS + dropdowns) | — | n/a — **this primitive doesn't exist in the standalone** |

**Summary:** Subtractions: PlanningTimeline form, PlanningChipGrid as highlight-only widget. Additions: chip-row primitive, position bottom sheet, bench drawer, view toggle, tournament-totals strip, detail overlay. Reshapes: PlanningEditor's pitch goes from "starter slots" to "pos-box with chip-row beneath each". The data model layer is fine — the visual layer is rebuilt.

---

## 2. Architecture decision: rework, do not start over

**Recommendation: rebuild the UI layer on top of the existing data model. Do not start the integration over.**

### Keep (these are good)

- All 12 SQL migrations 028–039 (already applied to staging)
- `src/datastore/validation.ts` — including the newly-added DoS caps
- `src/datastore/LocalDataStore.ts` — planning-session CRUD, the `setActiveSession` lock, the new cascade-deletes
- `src/datastore/SupabaseDataStore.ts` — RLS, RPC wiring, `transformPlanningSessionFromDb`
- `src/datastore/SyncedDataStore.ts` — local-first sync queue
- `src/utils/planExport.ts` / `planBundle.ts` / `planFromImport.ts` / `planToExport.ts` — bundle import/export with all the security hardening
- `src/utils/planFairness.ts` — segment math (the chip-row needs this exact API)
- `src/utils/planSwapEngine.ts`, `src/utils/planApply.ts`, `src/utils/applyPreview.ts`, `src/utils/applySnapshot.ts` — apply pipeline, undo
- `src/types/planningSession.ts` — `PlanningSession`, `PlanDraft`, `resolveIncludedGameIds`
- `src/hooks/usePlanningSessionQueries.ts` — React Query plumbing
- All 5,500+ tests on the data layer

### Replace (UI primitives that don't match the standalone)

- `src/components/PlanningChipGrid.tsx` — keep the file path, replace contents with the chip-row primitive
- `src/components/PlanningEditor.tsx` — pitch render is reshaped; tab-strip becomes ribbon + view-toggle
- `src/components/PlanningModal.tsx` — list view is fine; editor view shells the new `PitchCard`s

### Add (primitives that don't exist yet)

- `src/components/planning/PitchCard.tsx` — formation-row pitch with chip-row beneath each role
- `src/components/planning/ChipRow.tsx` — flex-1 segment chips with half-time overlay, segment colors, chip-min-bar
- `src/components/planning/PositionSheet.tsx` — bottom sheet for the position click menu
- `src/components/planning/AddSubSheet.tsx`, `MoveSubSheet.tsx`, `ReplacePlayerSheet.tsx` — sub-action sheets
- `src/components/planning/BenchDrawer.tsx` — kickoff + halftime bench rows
- `src/components/planning/Ribbon.tsx` — game-selector ribbon (replaces PlanningEditor's tab strip)
- `src/components/planning/ViewToggle.tsx` — Single / Grid switch
- `src/components/planning/TournamentTotalsStrip.tsx` — color-graded player chips above the games
- `src/components/planning/GameDetailOverlay.tsx` — full pitch + scrubber + role timelines
- `src/components/planning/PlayerDisc.tsx` — pitch disc (used by the detail overlay)
- `src/components/planning/RoleTimeline.tsx` — horizontal segment timeline used inside the detail overlay

### Delete (no equivalent in the standalone)

- `src/components/PlanningTimeline.tsx` — the form-based sub editor (replaced by PositionSheet's "Add sub at minute…" action)
- `src/components/PlanningMinutesDashboard.tsx` (likely; folded into TournamentTotalsStrip + chip-min-bar)
- `src/components/PlanningTotalsTable.tsx` (likely; folded into TournamentTotalsStrip — reassess after Phase 2)

### Rewrite, not relocate

The new components live under `src/components/planning/` (subdirectory, namespaced). The existing flat-named components (`PlanningModal.tsx`, `PlanningEditor.tsx`) stay at the current paths so import sites don't churn. Internally, they'll compose the new primitives.

---

## 3. Standalone-feature → action map (full punch list)

Each row corresponds to one feature listed in `matchops-planner/README.md` ("Features" section) plus things only visible by reading the source. **Action** column says what we do for each.

| # | Feature | Standalone source | Our state | Action |
|---|---|---|---|---|
| 1 | Multi-game grid view (`display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr))`, all 5 cards side-by-side, desktop default ≥900px) | `index.html:1501-1506, 3015-3043` | None | **Add** `Ribbon` + `ViewToggle` + grid layout in `PlanningEditor` |
| 2 | Per-game pitch card with formation rows | `index.html:3116-3170, 1977-1989` | Half-pitch with starter slots only | **Reshape** `PlanningEditor` pitch → `PitchCard` |
| 3 | Per-role chip-row with N+1 segment chips. Standalone uses **equal-weight** chips (`.slot { flex: 1; min-width: 0 }`); a `--seg-flex` custom property is set on each chip but **no CSS rule consumes it** — so chips render equal-width regardless. Half-time `<div class="ht-divider">` overlay (note: standalone CSS does not set `left: var(--ht-pct)`, the divider currently lacks horizontal positioning). `data-segidx` color escalation (segment 0 white, 1 yellow, 2 orange, 3+ red). Full-game green for unsubbed roles. **Our rebuild decision (PR-P1):** use proportional widths via `flex: var(--seg-flex)` AND fix the ht-divider to `left: var(--ht-pct)` — this is a deliberate improvement over standalone, not a faithful port | `index.html:451-491, 3144-3164, 3079-3110` | `PlanningChipGrid` is intrinsic-width pills, no halftime line, no segment colors | **Add** `ChipRow.tsx`, **delete** existing `PlanningChipGrid` body |
| 4 | Chip minute-badge (`12'` on non-first segments) | `index.html:3097-3104, 493-504` | None | Inside `ChipRow` |
| 5 | Chip-min-bar (HSL hue from `playerRatio` via `hueForRatio` clamped to [0.4,1.5] → hue [0,150]; fill width `Math.min(100, r * 80)%` so ratio 1.0 → 80%, ratio ≥1.25 → 100%; embedded inside each chip) | `index.html:3091-3095 (chip render), 2829 (hueForRatio), 2815 (playerRatio)` | `PlanningMinutesDashboard` pills are separate (ratio rendered as a row pill, not embedded in segment chips) | Inside `ChipRow` chip render |
| 5b | `.slot.plays-both` red inner box-shadow when one player appears in 2+ segments of the same role (rendered via `playsBothAtHalf(player)` helper) | `index.html:592 (CSS), 3154-3158 (hook), 2842 (helper)` | None | Inside `ChipRow` chip render |
| 6 | Click chip → bottom sheet with: "Track across all games", "Add sub at minute…", and (only when `startSec > 0`) "Move sub to minute…", "Replace incoming player…", "Remove sub at X' (out → in)". Subtitle: `Position: <role> · from kickoff` or `· from <minute>'`. On touch, sheet opens via 500 ms long-press (single tap is reserved for tap-pair swap). On desktop, sheet opens via right-click (`contextmenu`) | `index.html:3995-4049, openSegmentSheet` (also: long-press at 3344, contextmenu at 3341) | Pitch role click opens halftime-split shortcut panel only | **Add** `PositionSheet` + 3 sub-action sheets |
| 7 | Position-level gear icon → "Position: X" sheet listing every segment + top "Add sub at minute…" action + Cancel | `index.html:4055-4109, openPositionSheet` | None | Inside `PositionSheet` |
| 8 | Drag-drop / tap-to-swap between any two chips **in the same game** (field segments, bench chips, mixed). Cross-game swap is rejected: `onDragOver`/`onDrop` early-return if `s.dataset.game !== dragSource.game` (`index.html:3895, 3905`); `onChipClick` re-selects on different-game tap (`index.html:3935`) | `index.html:2911-2935, 3879-3940, performSwap` | Drag-drop between starter role slots only; no segment-aware swap | **Extend** `PlanningEditor` drag handlers to operate on `(gameIdx, role, startSec)` triple, not just role names |
| 9 | Bench drawer per game: kickoff bench row + halftime bench row (when half exists). Halftime row label is dynamic: `After <halfMin>'` where `halfMin = Math.round(halfSec/60 * 2) / 2`, rendered without trailing `.0` (so 25-min game → "After 12.5'", 24-min game → "After 12'") | `index.html:3173-3201, benchAtSec; 3191-3193 label format` | Bench is a flat list beside the pitch; no halftime view | **Add** `BenchDrawer.tsx` |
| 10 | Bench warning chip class (`benched-both`) for players who never play in **this game** (per-game check, not tournament-wide) | `index.html:3185-3187, benchedBothHalves(gi) at 2852-2858` | None | Inside `BenchDrawer` |
| 11 | Game ribbon: horizontal scroll-snap row of game cards with active-game amber accent + per-game include-in-totals dot. Single mode also supports horizontal swipe on `#game-detail` to switch active game (threshold `dx>60px`, `|dx|>1.4*|dy|`, `dt<700ms`); calls `animateGameSwitch` for slide-in transition | `index.html:275-366, 3044-3077; swipe at 5095-5120` | Tab strip with checkbox | **Add** `Ribbon.tsx` (replaces tab strip in single mode) |
| 12 | Tournament totals strip — color-graded `.strip-cell` buttons above the pitch (red→yellow→green by ratio via `ratioColors`), 11-column grid (`grid-template-columns: repeat(11, 1fr)`), shows total minutes per player tournament-wide. Click toggles cross-game highlight | `index.html:3206-3360 region (renderTournamentTotalsHtml at 3209-3236, click handler at 3323), 668-718 (.game-min-strip / .strip-cell CSS)` | `PlanningTotalsTable` lives below; ratio gradient lives in `PlanningMinutesDashboard` | **Add** `TournamentTotalsStrip.tsx` (consolidate the two existing components into this one). Note: standalone's Minutes-tab `.pt-chip` (lines 720-870) is a **different** primitive — pill-shaped, not strip-cell; do not conflate |
| 13 | Click pill or chip → multi-select highlight; same player highlights everywhere across all games. Standalone applies `.slot.highlighted { outline: 3px solid #f57c00; }` (orange — distinct from tap-pair-selected amber `var(--accent) #fbbf24`) | `index.html:highlightedPlayers Set at 2868-2874, isHighlighted, anyHighlightActive; CSS at 578-582` | We have a highlight set but it's per-editor-instance and doesn't cross games (one `PlanningEditor` per session) | **Extend** highlight to a `Set<PlayerId>` lifted to the modal level; pass through props |
| 14 | Saved versions: save / rename / load / delete plan snapshots, JSON export/import for cross-device backup | `index.html:2336-2391 (saveVersion/deleteVersion/renameVersion/applyVersion); 3575+ (renderPlans)` | We have named versions (parent/child sessions) + bundle export/import | Already done in data layer; expose in the new Plans view |
| 15 | Auto-save to localStorage after every change; "✓ HH:MM" save indicator in app bar | `index.html:saveAll, showSaved 2305-2321` | We have auto-save + the saved indicator | Move indicator placement into the app-bar style header |
| 16 | Detail overlay: full-pitch view with player discs at relX/relY (colored via `discColors` — red <0.85 / amber <1.15 / blue otherwise; **no green**, distinct from `ratioColors`), scrubber bar that scrubs through game time, per-role timeline rows. Each role row uses absolute `left:%` / `width:%` positioning (NOT flex) and renders a `dt-half` dashed amber halftime guide (`index.html:4986-4988`) | `index.html:1076-1373 (CSS), 4980+ (rendering), 2845-2850 (discColors)` | None | **Add** `GameDetailOverlay` + `PlayerDisc` + `RoleTimeline` (Phase 5 — last) |
| 17 | Undo/redo with 40-snapshot history (`HISTORY_MAX = 40`, `pushHistory` runs after every mutation) | `index.html:2202-2224` | We have post-Apply Undo via `applySnapshot`, but no live undo/redo of edits in the editor | Phase-3 add-on (live edit undo) |
| 18 | Same-player-at-two-roles guard with state banner (`wouldCauseDoublePosition` at 2711-2720; banner via `refreshStateBanner`). Note: a working version of this check already exists in our codebase at `PlanningTimeline.tsx:278-297` using `getRoleSegments` — extract before deletion in PR-P2 | `index.html:wouldCauseDoublePosition (2711-2720), refreshStateBanner` | Validator catches at save time; live check exists in PlanningTimeline form | Add a banner inside `PitchCard` for in-progress conflicts; reuse extracted util |
| 19 | Formation registry covering 3v3 / 5v5 / 8v8 / 11v11 with stamina tags (`preserved` / `preferred` / `never`) used by suggester | `index.html:1801-1970, FORMATIONS` | We have `FORMATION_PRESETS` at `src/config/formationPresets.ts:449` per preset but stamina tags are local | Port stamina tags into our preset config |
| 20 | Auto-suggest sub at half (Phase-3 only — call out as deferred) | (not core) | None | Defer |

**Standalone primitives intentionally NOT carried to the rebuild's chip-row:** Priority `★` indicator. In the standalone, `★` exists only on the Minutes-tab `.pt-chip` (`index.html:757-761`) — it does NOT appear on chip-row segment chips or on `.strip-cell` totals cells. Our existing `PlanningChipGrid` does render priority on chips; carrying that forward into the new `ChipRow` is a **deviation from standalone** that we accept (see §11.12). Document the deviation; do not pretend it's parity.

---

## 4. Phased implementation plan

Five phases, each shippable on its own merit. Phases 1–4 are required to ship parity; Phase 5 (detail overlay) is a nice-to-have that can land later.

Each phase ends with: code changes pushed, tests added, the existing test suite still green, and a single PR opened against `feature/planner-integration` (or, if PR #404 has been re-opened or replaced, against the new working branch).

### Phase 0 — Setup (½ day)

**Goal:** clean ground for the rebuild.

1. Open a new working branch off `feature/planner-integration`: `git checkout -b feature/planner-ui-parity feature/planner-integration`. Don't merge PR #404 to master yet — PR #404 stays in "data foundation" status. We'll rebase or fold the UI rework into it later.
2. Add the standalone HTML to the repo as a reference fixture: copy `matchops-planner/index.html` to `src/components/planning/_reference/standalone.html` (symlink would do too, but a copy survives the standalone's evolution and pins exactly what we're matching). `.gitignore` if you'd rather not commit it; note the path in this plan.
3. Create the directory `src/components/planning/` and a stub `index.ts` re-export.
4. Document the chip-row visual contract in `src/components/planning/CONTRACT.md`: one row, N+1 chips per role, proportional widths via `flex: <segMin>`, half-time overlay, segment colors. Embed the relevant standalone CSS verbatim as the source of truth for visual parity.

**Done when:** branch exists, directory scaffolding in place, reference HTML accessible from anywhere in the codebase.

---

### Phase 1 — `ChipRow` primitive + `PitchCard` shell (~3 days)

**Goal:** one game's pitch renders exactly like the standalone's `pitch-card`. No interactivity yet — just the visual.

#### Files

- **New:** `src/components/planning/ChipRow.tsx`
- **New:** `src/components/planning/PitchCard.tsx`
- **New:** `src/components/planning/styles/chip-row.module.css` (or Tailwind layer if you prefer; the standalone's CSS uses raw rules + custom property `--seg-flex` which Tailwind doesn't model cleanly — module CSS is simpler)
- **New:** `src/components/planning/__tests__/ChipRow.test.tsx`
- **New:** `src/components/planning/__tests__/PitchCard.test.tsx`
- **Modify:** `src/components/PlanningEditor.tsx` — replace the pitch+role-button JSX (lines ~1435-1487 today) with `<PitchCard ... />`. Keep the formation selector + apply button in place.
- **Delete:** the body of `src/components/PlanningChipGrid.tsx` and update `PlanningEditor` to stop importing it. Keep the file as a thin re-export of `ChipRow` for one release so any external test imports keep compiling, then delete in Phase 2.

#### Implementation

`RoleSegment` shape (from `getCellSegments(game, role)` in `index.html:2635-2654`):

```ts
interface RoleSegment {
  startSec: number;   // segment start (inclusive)
  endSec: number;     // segment end (exclusive)
  player: string;     // player identifier — name in standalone, playerId in our port
  segIdx: number;     // 0-based segment index in time order; drives data-segidx color escalation
}
```

`ChipRow.tsx` accepts:

```ts
interface Props {
  gameId: string;
  roleName: string;
  segs: RoleSegment[];          // from getCellSegments (rebuild util ports the standalone helper)
  gameDurationSec: number;
  halfTimeSec: number;          // 0 = no half-time line
  playerLabel: (id: string) => string;
  playerRatio: (id: string) => number | null; // for chip-min-bar — see Phase 1 hygiene constraint
  highlightedIds: Set<string>;
  tapSelected: { game: string; role: string; startSec: number } | null;
  onChipClick: (segStartSec: number) => void;
  onChipDragStart: (segStartSec: number) => void;
  onChipDrop: (sourceStartSec: number) => void;
  // ...
}
```

Render:

```tsx
<div className="chip-row" style={{ '--ht-pct': htPct } as React.CSSProperties}>
  {segs.map((seg, i) => (
    <ChipSlot
      key={`${seg.startSec}-${seg.player}`}
      seg={seg}
      segIdx={i}
      flexWeight={Math.max(1, Math.round((seg.endSec - seg.startSec) / 60))}
      // ...
    />
  ))}
  {halfTimeSec > 0 && <div className="ht-divider" />}
</div>
```

**Standalone vs our rebuild — deliberate deviations:**
- Standalone sets `--seg-flex` on each `.slot` element via inline style but **no CSS rule consumes it** — every chip ends up equal-weight (`.slot { flex: 1; min-width: 0 }`). Our rebuild adds the missing CSS rule `.slot { flex: var(--seg-flex, 1); min-width: 0 }` so chips render proportionally. This is a deliberate improvement over the standalone.
- Standalone's `.ht-divider` rule lacks a `left` property; the divider has no horizontal positioning. `--ht-pct` is set on `.chip-row` but never read. Our rebuild adds `.ht-divider { left: var(--ht-pct); }` so the line lands at the half-time minute. Also a deliberate improvement.

If the team would rather match the standalone bit-for-bit (equal-width chips, no positioned divider), drop both rules. Pick one explicitly — do not silently leave it ambiguous in code review.

`PitchCard.tsx`:
- Renders the formation rows (`formationRows(preset)`) — port `formationRows` from the standalone (`index.html:1977-1989`) into a new util, or pull from our `FORMATION_PRESETS` (at `src/config/formationPresets.ts:449`) if rows are already grouped.
- Each row is a flex of `pos-box` containers; each `pos-box` has `<header>{role.name}</header>` + `<ChipRow ... />`.
- `.pitch` background is grass-green (`linear-gradient(to bottom, #4caf50, #388e3c)`); `.pos-box` sits on green with `background: rgba(0,0,0,0.18)`.
- Header gets a gear icon (`pos-menu-btn`) that opens `PositionSheet` (Phase 2).
- Pure rendering at this phase — no edit handlers wired.

Visuals **must match** standalone's CSS. Copy the relevant rules from `index.html:398-720` into the module stylesheet (or Tailwind's `@layer components`):

- `.pitch-card`, `.pitch`, `.pitch-row`, `.pos-box`, `.pos-label`
- `.chip-row`, `.slot`, `.slot[data-segidx="N"]`, `.chip-row.full-game .slot`, `.slot.plays-both` (red inner box-shadow when one player appears in 2+ segments of the same role)
- `.slot.tap-selected` (amber outline `var(--accent) #fbbf24`), `.slot.highlighted` (orange outline `#f57c00` — distinct from tap-selected; cross-game highlight)
- `.chip-min-tag`, `.chip-min-bar`, `.chip-min-fill`
- `.ht-divider`

Pin exact values. Don't redesign.

#### Tests (new file `ChipRow.test.tsx`)

- 0 subs at LB → 1 chip with `chip-row.full-game` class, full-width
- 1 sub at LB at 600s of a 1500s game → 2 chips with `--seg-flex: 10` and `--seg-flex: 15` (rebuild's deliberate proportional rule → 40% / 60% of width). If the team chose standalone-faithful equal-width chips instead, assert both chips at 50% width and skip the `--seg-flex` consumption test.
- 2 subs → 3 chips, `data-segidx` attributes 0, 1, 2
- Player appearing in 2+ segments of the same role → those chips have `plays-both` class (red inner box-shadow)
- Half-time at 750s → `.ht-divider` rendered with `--ht-pct: 50%` (rebuild positions divider at that pct; standalone CSS does not)
- No half-time → no divider
- Cross-game highlighted player → chip has `highlighted` class with orange outline (`#f57c00`)
- Tap-pair-selected chip → `tap-selected` class with amber outline (`var(--accent)`)
- chip-min-bar fill width math (`Math.min(100, r * 80)%`): ratio 0.5 → 40% width, ratio 1.0 → 80% width, ratio ≥1.25 → 100% width
- chip-min-bar hue (clamped to [0.4,1.5] → hue [0,150]): ratio 0.5 → ~hue 14 (red), ratio 1.0 → ~hue 82 (yellow), ratio 1.3 → ~hue 123 (green)

#### Acceptance

Open the existing PlanningEditor for a session. The pitch above the form now renders pos-boxes with chip-rows underneath, visually identical to the standalone. The form below still works (we haven't touched it yet).

---

### Phase 2 — Position sheet + segment-aware swap (~3 days)

**Goal:** the chip-row becomes interactive. Click a chip → bottom sheet with the standalone's full action set. Drag-drop between chips works for field segments and bench chips. Form-based PlanningTimeline is removed.

#### Files

- **New:** `src/components/planning/PositionSheet.tsx` (gear-icon sheet — segments list + "Add sub at minute…" + Cancel)
- **New:** `src/components/planning/ChipSheet.tsx` (per-chip sheet — "Track across all games", "Add sub at minute…", and when `startSec > 0`: "Move sub to minute…", "Replace incoming player…", "Remove sub at X' (out → in)"). Subtitle template: `Position: <role> · from kickoff` or `· from <minute>'`
- **New:** `src/components/planning/AddSubSheet.tsx`
- **New:** `src/components/planning/MoveSubSheet.tsx`
- **New:** `src/components/planning/ReplacePlayerSheet.tsx`
- **New:** `src/components/planning/BenchDrawer.tsx`
- **New:** `src/utils/planConflicts.ts` — extract the existing double-position guard from `PlanningTimeline.tsx:278-297` (currently throws with i18n key `planningTimeline.errDoublePosition`); export `wouldCauseDoublePosition(game, role, atSec, player)` for shared use. Port the standalone's invariant `repairOutPlayers(t)` (`index.html:2689`) alongside.
- **New:** `src/utils/planSwapEngine.ts` (already exists — extend with segment-aware swap helpers; port `_segmentPlayer`, `_setSegmentPlayer`, `performSwap` from `index.html:2893-2935`)
- **Modify:** `ChipRow.tsx` — wire onClick (tap-pair on touch & desktop), 500ms long-press → open ChipSheet (touch), `contextmenu` → open ChipSheet (desktop), onDragStart/onDrop (call segment swap)
- **Modify:** `PitchCard.tsx` — gear icon opens PositionSheet; bench drawer below the pitch
- **Modify:** `src/components/PlanningEditor.tsx` — remove `<PlanningTimeline>`, remove drag handlers (now inside ChipRow)
- **Delete:** `src/components/PlanningTimeline.tsx`, `src/components/__tests__/PlanningTimeline.test.tsx`
- **Delete:** the now-empty `PlanningChipGrid.tsx`, `src/components/__tests__/PlanningChipGrid.test.tsx`
- **Delete:** the corresponding 35-key i18n entries under `planningTimeline.*` (preserve `planningTimeline.errDoublePosition` only if it's reused — otherwise relocate to `planConflicts.errDoublePosition`)

#### Sub-action sheet contracts

Each sheet returns a `DraftScheduledSub` operation (add / update / remove) that the editor applies via `setDraft`. They never write to the data store directly — they're pure UI that emits operations.

Example: `AddSubSheet`:

```ts
interface Props {
  gameId: string;
  roleName: string;
  gameDurationSec: number;
  defaultMinute?: number;
  onAdd: (sub: DraftScheduledSub) => void;
  onCancel: () => void;
}
```

Body: number-typed minute input (with the same validation as `PlanningTimeline.tsx`'s `parseMMSS`, which the extracted util in `planConflicts.ts` should preserve), bench-player picker (only players actually on bench at that moment — `wouldCauseDoublePosition` from `index.html:2711-2720`, extracted into our shared util), Confirm/Cancel buttons.

`MoveSubSheet`: same shape, prepopulates with the existing sub's minute.

`ReplacePlayerSheet`: just the bench picker; same `wouldCauseDoublePosition` guard.

#### Bottom sheet host

The standalone uses a single `#bottom-sheet` div toggled by `openSheet(title, sub, actions, opts)`. The cleanest React translation: a `<Sheet>` provider at the modal level + `useSheet()` hook that the chip-row / pos-menu / detail overlay all call.

Or use an existing modal/sheet utility in the codebase if there's one (search `src/components/` for `Modal`/`Sheet`/`BottomSheet`). If none exists, add `src/components/ui/BottomSheet.tsx` — generic, takes title, body, actions, returns onClose.

#### Tests

- `PositionSheet` (gear-icon sheet): renders one segment list item per `RoleSegment`; "Add sub at minute…" action always present; Cancel action present
- `ChipSheet` (per-chip sheet): "Track across all games" + "Add sub at minute…" always present; "Move sub to minute…", "Replace incoming player…", "Remove sub at X'" only when `startSec > 0` (i.e. not the starting-XI segment); subtitle text matches `Position: <role> · from kickoff` or `· from <minute>'`
- `AddSubSheet`: rejects minute=0 and minute>=duration; rejects double-position (player already on field at that moment in another role)
- Drag-drop integration test (Testing Library + dnd events): drag chip A to chip B at same role swaps players; drag chip A to chip B at different role swaps both segments' players for those time intervals
- Drag-drop **same-game-only**: dragging across games rejects (no cross-game swap allowed); standalone enforces this via `s.dataset.game !== dragSource.game` early-return at `index.html:3895` and `:3905`
- Tap-pair **same-game-only**: tapping chip A in Game 1, then chip B in Game 2 re-selects (does NOT swap); standalone behaviour at `index.html:3935`
- Touch long-press: 500ms press-and-hold on a chip opens ChipSheet; touchmove/touchend cancel the timer (`index.html:3344`)
- Desktop right-click: `contextmenu` on a chip opens ChipSheet (`index.html:3341`); plain click is reserved for tap-pair swap
- Bench drag: drag bench chip to field chip → bench player comes on for that segment, field player goes to bench
- `repairOutPlayers` invariant: after every swap, scheduled-sub `outPlayer` fields match the player on field at the previous segment (port from `index.html:2689`)

#### Acceptance

- All sub-edit flows go through the chip click sheet — no more typing MM:SS into a form
- Drag-drop works between any two chips **in the same game** (cross-game rejected)
- Tap-pair swap works on touch and desktop (same-game only); long-press (touch) and right-click (desktop) are the chip-sheet entry points
- The form-based `PlanningTimeline` is gone; its double-position guard lives in `src/utils/planConflicts.ts`

---

### Phase 3 — Ribbon + view toggle + multi-game oversight (~2 days)

**Goal:** the planner shows all games at once on desktop (Grid mode) or one focused game with a ribbon-card selector on mobile (Single mode). The tab strip is replaced.

#### Files

- **New:** `src/components/planning/Ribbon.tsx`
- **New:** `src/components/planning/ViewToggle.tsx`
- **Modify:** `src/components/PlanningEditor.tsx` — top of the rendered tree becomes:
  ```tsx
  <ViewToggle value={viewMode} onChange={setViewMode} />
  {viewMode === 'single' ? <Ribbon ... /> : null}
  <PlanName ... />
  {viewMode === 'single'
    ? <PitchCard gameId={activeGameId} ... />
    : <div className="games-grid">{gameIds.map(id => <PitchCard key={id} gameId={id} ... />)}</div>}
  ```

#### Persistence

`viewMode` is kept in `localStorage` keyed `'matchops-local-planner-view-mode'` (app-namespaced; the standalone uses `'matchops-planner-view-mode'` at `index.html:2182` — we deliberately rename to avoid sharing storage with a possibly-co-installed standalone). Default = `grid` if `window.innerWidth >= 900`, else `single` (matches standalone default at `index.html:2188`).

`activeGameId` is editor-local state (`useState`), no persistence needed.

#### CSS

Port the `view-toggle` and `games-grid` rules from `index.html:1474-1506`. The grid uses `display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 14px;`.

#### Touch swipe-to-change-game (Single mode)

Port the `touchstart`/`touchend` handler from `index.html:5095-5120`. Attach to the active card / detail container. Threshold: `dx > 60px`, `|dx| > 1.4 * |dy|`, `dt < 700ms`. On valid swipe, switch active game and play `animateGameSwitch` (slide-in transition).

#### Tests

- View toggle persists choice across remounts
- Grid mode renders N pitch cards
- Single mode renders 1 pitch card + a ribbon with N entries; clicking a ribbon entry switches the active game
- Single mode horizontal swipe (dx > 60px, mostly horizontal, <700ms) switches active game; vertical swipe and slow horizontal drags do not
- Ribbon include-dot toggles `includedGameIds` correctly

#### Acceptance

The user opens the planner on desktop and sees all 5 games side-by-side. On a phone, they see one game card with a horizontal-scrolling ribbon above. Same data, two layouts, switchable.

---

### Phase 4 — Tournament totals strip + bench drawer + cross-game highlight (~2 days)

**Goal:** the surface above and beside the pitch matches the standalone. Player chips light up across every game when clicked. Bench chips warn for never-plays.

#### Files

- **New:** `src/components/planning/TournamentTotalsStrip.tsx`
- **Modify:** `src/components/planning/BenchDrawer.tsx` (Phase 2 stub) — render kickoff + halftime rows, mark `benched-both` chips
- **Modify:** `src/components/PlanningEditor.tsx` — lift highlight state from per-game-instance to editor-level; pass to all `PitchCard`s
- **Delete:** `src/components/PlanningMinutesDashboard.tsx` and its tests (folded into TournamentTotalsStrip)
- **Delete:** `src/components/PlanningTotalsTable.tsx` and its tests (same — re-evaluate after this phase to confirm folded fully)
- Remove unused i18n keys from `planningMinutesDashboard.*` and `planningTotalsTable.*`

#### TournamentTotalsStrip layout

Port `.game-min-strip` / `.strip-cell` from `index.html:668-718` and the rendering helper `renderTournamentTotalsHtml` at `index.html:3209-3236`. One **strip-cell button** per player (rectangular, 11-column grid: `grid-template-columns: repeat(11, 1fr)`), sorted by total seconds ascending (under-played at top), HSL background gradient via `playerRatio` → `ratioColors(r)` (red <0.85 / yellow 0.85-1.15 / green ≥1.15 — see Phase 1 for the formula), click toggles highlight (`index.html:3323`). Strip sits **above** the pitch cards in both Single and Grid modes.

**Do not confuse with `.pt-chip`:** the standalone's Minutes-tab `.pt-chip` (lines 720-870) is a separate pill-shaped primitive used in a different tab. It is NOT what TournamentTotalsStrip should mirror. The `.pt-chip` block is also where the `prio` (★) class lives — and that is intentionally NOT carried into TournamentTotalsStrip's strip-cells (see §3 footer).

#### Cross-game highlight

Today, each `PlanningEditor` instance has its own `highlightedPlayerIds` state. With the new TournamentTotalsStrip and multi-game grid, the highlight set must be **modal-level state** so clicking p3 in Game 1's chip row also lights up p3 in Game 4's chip row.

In `PlanningEditor`:
```ts
const [highlightedIds, setHighlightedIds] = useState<Set<PlayerId>>(new Set());
const toggleHighlight = useCallback((id: PlayerId) => { ... }, []);
```

Pass `highlightedIds` + `toggleHighlight` to every `PitchCard` AND to `TournamentTotalsStrip`.

#### `benchedBothHalves` warning

Port the helper `benchedBothHalves(gi)` from `index.html:2852-2858` — it computes the set of players who never play **in this specific game** (per-game check, not tournament-wide). Mark those bench chips with `benched-both` class for visual warning (red ring or similar). For tournament-wide "never-plays anywhere" indication, use the ⚠ badge on the totals strip pill (§11.3).

#### BenchDrawer label format

Halftime row label is dynamic per `index.html:3191-3193`:

```js
const halfMinLabel = Math.round(halfSec / 60 * 2) / 2;
const halfMinStr = halfMinLabel % 1 === 0 ? String(halfMinLabel) : halfMinLabel.toFixed(1);
const label = "After " + halfMinStr + "'";
```

So for a 25-min game (halfSec = 750) the label is `After 12.5'`; for a 24-min game it's `After 12'`. Implement the same formatting in our `BenchDrawer` rather than hardcoding any specific minute.

#### Tests

- `TournamentTotalsStrip`: strip-cells sorted ascending by `totalSeconds`; click toggles highlight; HSL hue formula matches standalone (`ratioColors(r)`)
- Cross-game highlight visual: clicking p3 in Game 1's chip row → all p3 chips across Games 2-5 outline orange `#f57c00` (NOT amber — amber is reserved for tap-pair-selected chips); strip-cell highlights too
- `BenchDrawer`: kickoff row + halftime row when half exists; halftime row label format `After <X>'` matches the `Math.round(halfSec/60 * 2) / 2` formula for several inputs (24/25/30 min); never-plays-in-this-game bench chips have `benched-both` class

#### Acceptance

A coach opens the planner. They see the tournament-totals strip across the top with Liam at the far left in red (low minutes). They click Liam's strip-cell — every chip across every game outlines orange (`#f57c00`) wherever Liam appears, and bench chips show his name greyed-warning where he never plays. They tap one bench chip in Game 4, the chip sheet opens, they swap him in — totals strip + chip-row across Game 4 update immediately.

---

### Phase 5 — Detail overlay (deferred / nice-to-have, ~3-4 days)

**Goal:** clicking the eye-icon on a pitch card opens a full-screen overlay with a bigger pitch (full field, not half), player discs at relX/relY, a time scrubber across the top, and per-role timeline rows below.

#### Files

- **New:** `src/components/planning/GameDetailOverlay.tsx`
- **New:** `src/components/planning/PlayerDisc.tsx`
- **New:** `src/components/planning/TimeScrubber.tsx`
- **New:** `src/components/planning/RoleTimeline.tsx`

#### Mechanics

Port `index.html:1076-1373 (CSS) + renderDetailModal/renderDetailScrubber` (search the standalone for the implementation block). The pitch is `aspect-ratio: 0.66`, with player discs absolutely-positioned at each role's `relX, relY`. The scrubber is a range input from 0..gameDurationSec; moving it re-renders disc names from `playerAtRoleSec(game, role, scrubSec)` (`index.html:2658`).

**Disc colors:** use `discColors(r)` from `index.html:2845-2850` — red <0.85 / amber 0.85-1.15 / blue ≥1.15. Notably **no green band** (intentional — green discs would blend into the grass-green pitch). This is a **distinct palette** from `ratioColors(r)` used by chip-min-bar and the totals strip; do not reuse the chip-row palette here.

**Role-timeline rows** below the pitch use a **different primitive** from `ChipRow`:
- Each segment is rendered with absolute `left: <pct>%` / `width: <pct>%` (NOT flex weights). See the rendering at `index.html:4983-4984`.
- Each role row also renders a `dt-half` dashed amber halftime guide at the half-time minute (`index.html:4986-4988`). The earlier-draft claim "no half-time line because the scrubber shows it" was wrong — the standalone DOES draw a per-row halftime guide.

This is why PR-P1's hygiene constraint matters: if the formation `(relX, relY)` data and the `playerRatio`/`hueForRatio` utils are kept pure (not coupled to chip-row's render layer), PR-P5 can plug into them directly without refactoring back into PR-P1.

#### Tests

- Disc renders at the correct (relX, relY) for the role
- Disc color uses `discColors(r)` (red <0.85 / amber <1.15 / blue otherwise; no green); fails if it accidentally re-uses `ratioColors`
- Scrubber at second N → discs show `playerAtRoleSec(...)` for second N
- Each role-timeline row renders a `dt-half` halftime guide at the half-time minute (when `halfSec > 0`)
- Each role-timeline segment uses absolute `left:%` / `width:%` (assertable via `data-segidx` + computed style)
- Click a disc → toggles cross-game highlight (same Set as Phase 4 — chip outlines orange `#f57c00`)

#### Acceptance

A coach can scrub through any game's substitution timeline visually, see who's on field at each second, and click any disc to highlight that player across all games.

---

### Phase 6 — Cleanup, docs, parity verification (~1 day)

**Goal:** the in-app planner is shippable. Documentation reflects the new structure. The standalone reference is checked once more for any feature gaps.

1. Walk through the standalone's README "Features" section. Each bullet either ships or is documented as deferred in `docs/03-active-plans/planner-ui-parity-plan.md` § 7 (Deferred).
2. Manual side-by-side test: open `matchops-planner/index.html` and the running PlanningModal in adjacent windows, walk through a full 5-game plan-and-edit flow. Note every divergence; either fix or add to "Deferred" with a justification.
3. Update `docs/03-active-plans/tournament-planner-integration-pr-plan.md` to point to this plan as the UI half of the integration (and call out that the data half from PR #404 is unchanged).
4. Update `CLAUDE.md` Architecture Overview if any new top-level pattern surfaced (e.g., the `BottomSheet` provider).
5. Run `npm run build`, `npm test`, `npm run lint`, type check. Fix anything red.
6. Open the PR. Title: `feat(planner): UI parity with standalone matchops-planner (Phases 1-5)`. Description includes the standalone's README "Features" bullets with checkboxes for verified-shipped vs deferred.

---

## 5. Test strategy

| Layer | Coverage | Tools |
|---|---|---|
| `ChipRow` rendering | Per-test: 0/1/2/3 subs, half-time present/absent, highlight/dim, chip-min-bar hue, `--seg-flex` proportional weights | Jest + Testing Library + DOM assertions on `data-segidx`, computed style |
| `PositionSheet` actions | Each menu item triggers the right operation; `Add sub at minute…` validates time + double-position | Jest + Testing Library |
| Drag-drop swap | Field↔Field same-role, Field↔Field different-role, Field↔Bench, Bench↔Field | Testing Library `fireEvent.dragStart` / `dragOver` / `drop` |
| Cross-game highlight | One highlight set drives all `PitchCard`s + `TournamentTotalsStrip` | Render two `PitchCard`s, click in one, assert chip class in the other |
| `Ribbon` + `ViewToggle` | Toggle persists across remounts; ribbon active state follows `activeGameId` | Jest + `localStorage` mock |
| `GameDetailOverlay` | Scrubber moves discs; disc click toggles highlight | Jest + Testing Library |
| Visual parity | Snapshot the rendered HTML of one chip-row against the standalone's HTML for the same input draft | Inline snapshot in `ChipRow.test.tsx`; the standalone's HTML pinned in a fixture |
| Existing data-layer tests | Stay green throughout. Anything that fails because we deleted `PlanningTimeline`/`PlanningChipGrid`/`PlanningMinutesDashboard` is a test on a deleted primitive — delete the test alongside the primitive | n/a |

---

## 6. Effort estimate

| Phase | Estimate (one engineer, focused) |
|---|---|
| 0. Setup | ½ day |
| 1. ChipRow + PitchCard | 3 days |
| 2. Position sheet + segment swap | 3 days |
| 3. Ribbon + view toggle | 2 days |
| 4. Totals strip + bench drawer + cross-game highlight | 2 days |
| 5. Detail overlay (deferrable) | 3-4 days |
| 6. Cleanup + parity walkthrough | 1 day |
| **Phases 1-4 + 6 (shippable parity)** | **~11 days** |
| **Including Phase 5** | **~14-15 days** |

Add 30-50% buffer for review cycles, surprises, browser-specific drag-drop quirks, and a likely round of UX tweaks once a real coach uses it.

---

## 7. Deferred / out of scope

- **Roster management UI inside the planner** — the standalone has a settings tab for editing the roster; MatchOps-Local already has its own roster manager (`masterRosterManager.ts` + corresponding modal). Plug into that instead of porting the standalone's settings tab.
- **Tournament structure editor** — the standalone seeds a specific tournament shape (5 games × 25 min × 8v8). MatchOps-Local games are user-created. The planner reads the user's saved games as-is; no editing of tournament shape inside the planner.
- **Live undo/redo on edits** — the standalone has 40-snapshot history (`pushHistory`/`undo`/`redo`). We have post-Apply Undo only. Worth adding in a follow-up but not required for parity. (Phase-3 add-on if there's time.)
- **Multi-tab safe planner state** — the standalone is single-tab by design. We have `withKeyLock` (single-tab) and acknowledged transient cross-tab races. Match the standalone — single-tab is fine.
- **Suggestion engine for halftime subs** — the standalone has a fair-share-aware sub suggester. Defer.

---

## 8. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Drag-drop in jsdom-tests is finicky; library swaps break our coverage | Medium | Use `@testing-library/user-event` with HTML5 drag events; for swap logic, prefer pure-function tests on `performSwap` over DOM-event tests |
| Bottom sheet keyboard / focus management adds A11y debt | Medium | Reuse `useFocusTrap` (already in `src/hooks/useFocusTrap.ts`); model the sheet stack so closing one returns focus to the trigger |
| `chip-min-bar` HSL gradient looks different in dark mode vs the standalone's dark theme | Low | Standalone IS dark; copy the exact HSL formula from `hueForRatio` |
| Replacing PlanningTimeline removes a test surface; some integration tests reference it | Low-Medium | Inventory references first (`grep -r PlanningTimeline src/`), update each call site as part of the deletion commit |
| Multi-game grid view with 5 cards × 11 chip-rows × 8 chips = ~440 chips; perf on mobile | Low | Each chip is a `<div>`, not a component instance. Even 1k chips render in <30ms. The existing `subsByRole` WeakMap memoisation in `planFairness.ts` already helps |
| The standalone's seed data uses player names as IDs (`'Verne'`, `'Petja'`); we use UUIDs. The chip-row needs a label-from-id lookup | Low | Already have `playerLabel(id)` pattern in `PlanningEditor.tsx`; pass it down into `ChipRow` |

---

## 9. Disposition for PR #404

**Don't merge to master in current shape.** Two options, in preference order:

**Option A (recommended):** keep PR #404 open against master as the data-layer foundation. After Phase 4 (the shippable parity point) lands on `feature/planner-ui-parity`, fast-forward `feature/planner-integration` to that tip, force-push, refresh PR #404. Reviewers see one combined diff: data + parity-correct UI. Single migration window post-merge.

**Option B:** close PR #404. Open a new PR `feature/planner-ui-parity → master` that subsumes both data and UI. PR #404 stays as an archived reference. Slightly more confusion for the audit trail but cleaner branch state.

Either way: **the user merges to master, not the agent.** This stands.

---

## 10. Live-game plan presentation (post-parity follow-up)

This section is the **second half** of the planner story: the in-app behavior **during a live game** after a plan has been Applied. The §4 phases ship the planning surface (Saturday-night work). This section ships the playing surface (Sunday-morning work). It's a separate work-stream — does not block PR #404, doesn't block §4 — but the planner's value is fully realized only when both halves are in.

Land §4 (planner UI parity) first. Land §10 (live-game presentation) after. They share the `PositionSheet` primitive and the `ChipRow`-style segment-pill idiom; otherwise they're independent.

### 10.1 What ships today (verified by reading the code)

- `AppState.scheduledSubs[]` — array of `{ id, timeSeconds, outPlayer, inPlayer, positionRole, status: 'pending' | 'fired' | 'skipped' }` per game (see `src/types/game.ts:108-119`).
- `applyDraftToGame` writes the planned subs into this field at Apply time.
- `useGameSessionReducer.ts:388-396` — on every `SET_TIMER_ELAPSED` action (the elapsed-time tick action; the action type literal is at line 147), when `isTimerRunning` is true and no prompt is active, scans `scheduledSubs` for the earliest `pending` whose `timeSeconds <= timeElapsedInSeconds` and assigns it to `activeScheduledSubPrompt`.
- `useGameSessionReducer.ts:364-403` (the tick block) — `pause` clears `activeScheduledSubPrompt`. Subs do not fire while paused. Re-evaluated on resume.
- `ScheduledSubBanner` (`src/components/ScheduledSubBanner.tsx:39,47`) — fixed-position banner at `top: 12px`, `z-index: 70` (above modals). Renders `OUT X / IN Y at <role>` with two buttons: Apply (emerald) and Skip (slate). Tapping buttons dispatches `APPLY_SCHEDULED_SUB` (action literal at line 165 — creates a `substitution` `GameEvent`, marks sub `fired`, clears prompt) or `SKIP_SCHEDULED_SUB` (action literal at line 164 — marks sub `skipped`, clears prompt).
- `ScheduledSubsSection` (`src/components/ScheduledSubsSection.tsx`, mounted inside `GameSettingsModal.tsx:1661`) — list-and-edit view of all subs for the current game. Coach can add / edit / delete manually. Used pre-planner-era; still works alongside the planner-applied subs. Note: this is a **second writer** to `scheduledSubs` and may conflict with `LivePlanTimeline` (§10.3.1) — see open question 10.9.6.
- `HomePage.tsx:94` — wires the banner once at the top of the live-game tree. The reducer holds the prompt; the banner reflects.
- `useGameOrchestration.ts:117-2376` — the wiring layer between reducer state and `<ScheduledSubBanner>` / live-game tree. New L2 reducer actions (`SNOOZE_SCHEDULED_SUB`, `UNDO_SKIP_SCHEDULED_SUB`, `EXPIRE_SKIP_UNDO`) need handlers wired through this hook around lines 2357-2376.

### 10.2 What's missing — the gap between Apply and game-time

The data flow is correct end-to-end. The visible UX is one banner per sub at the moment it fires. A coach who planned 4 subs in advance for a 25-minute game has **no on-screen evidence** of those plans for the first 11:59 of play, then a banner appears, then they decide, then silence again until the next sub. The plan's investment doesn't surface during the game.

Specifically:

| Gap | Impact |
|---|---|
| No persistent timeline of upcoming subs visible during play | Coach has to open Game Settings → Scheduled Subs to recall what they planned. Five-tap detour while 12 kids are running. |
| No pre-roll on the banner (fires AT due time) | Coach gets a gunshot prompt mid-attack. Football is fluid; needs a 30s runway to apply at the next stoppage. |
| No on-pitch indication that a player is about to be subbed | The pitch shows current state only. Verne about to come off at minute 12 looks identical to Verne playing the full game. |
| No undo on Skip | Tapped Skip by accident → that sub is lost for the game. No recovery. |
| No snooze on Apply | "Yes I'll do this sub but not at exactly minute 12 — give me 30 seconds for the play to end." Today: Apply now or lose the prompt. |
| No re-Apply guard for games-in-progress | Mid-tournament re-Apply (after game 1 played, game 2 in progress) overwrites pending subs without acknowledging fired/skipped history. |
| No visual distinction between fired / skipped / pending in the live UI | Past decisions are invisible during the live game. Coach can't see "I already skipped the 18' sub". |
| No sound / haptic on banner appearance | On a noisy field, the banner can be missed entirely. |

### 10.3 The four components to add

#### 10.3.1 `LivePlanTimeline` — the persistent upcoming-subs strip

A horizontal strip of segment pills, one per scheduled sub for the current game, pinned somewhere visible during play. Reuses the `ChipRow` visual language from §4 Phase 1 — proportional widths if mounted full game-width, or fixed-width pills if mounted in a thin top bar.

**Placement.** Two candidates, prefer A:

- **A. Below the timer overlay, above the soccer field** — full game-width thin strip (~36-40px tall). Coach's eye goes there for time anyway. Always visible during active play.
- **B. Inside the bottom `ControlBar`** — saves vertical real estate but crowds the timer/buttons. Reject unless A doesn't fit on phones.

**Visual contract:**

```
 0:00  ─── 12:00 ─── 18:30 ─── 22:15 ─── 25:00
         │            │           │
        [12'         [18'30      [22'15
        Verne→        Mira→       Onni→
        Niilo]        Pekka]      Liam]
       upcoming      next-due    upcoming
       (amber)       (bold amber  (amber)
                     pulsing)
```

- Each pill = one `ScheduledSub`. Width: fixed (~80px) on mobile; proportional to `timeSeconds` placement on desktop wider screens.
- Color by status:
  - `pending`, due > 60s away → amber (`#fbbf24`), normal weight
  - `pending`, due ≤ 60s away → bold amber, pulsing ring
  - `pending`, due NOW (banner showing) → bold amber, solid ring (matches banner)
  - `pending`, overdue (now > timeSeconds, banner snoozed/skipped) → red (`#ef4444`)
  - `fired` → emerald (`#22c55e`), checkmark
  - `skipped` → slate-gray (`#64748b`), strikethrough
- Content per pill: time badge `12'`, player initials or arrow (`V→N`), role glyph (small text `CAM`).
- Empty state: when `scheduledSubs` is empty or all-skipped/fired, the strip collapses (zero height) — don't take real estate when there's nothing to show.
- Click a pill → opens a small `PositionSheet`-style sheet with actions: "Apply now", "Skip", "Move to minute…", "Replace incoming player…", "Remove". Same primitive as the planner's position sheet, restricted to live-game-relevant actions.

**Props (for `LivePlanTimeline.tsx`):**

```ts
interface LivePlanTimelineProps {
  scheduledSubs: ScheduledSub[];
  gameDurationSec: number;       // for proportional layout (desktop)
  elapsedSec: number;            // current clock for "now" line
  isRunning: boolean;            // affects pulse animations
  onApplyNow: (subId: string) => void;
  onSkip: (subId: string) => void;
  onEdit: (subId: string) => void;     // opens the edit sheet
  onRemove: (subId: string) => void;
  playerLabel: (playerId: string) => string;
}
```

**File:** `src/components/LivePlanTimeline.tsx` (new) + `__tests__/LivePlanTimeline.test.tsx`.

#### 10.3.2 `ScheduledSubBanner` v2 — pre-roll countdown + snooze

Modify the existing banner to:

- **Open 30 seconds before due time** (not at due time). Show countdown: `Coming up: Verne → Niilo at CAM in 0:28`. Buttons: `[Apply now]` `[Snooze 30s]` `[Skip]`.
- **At due time** the title transitions to `Sub due: Verne → Niilo at CAM` — same buttons. Pulsing amber ring escalates.
- **Late firing**: if the user snoozed and the sub is now `t > timeSeconds + 30`, title becomes `Overdue: Verne → Niilo at CAM (1:15 late)`. Pulse turns red. Same buttons.
- **Snooze 30s** dispatches a new reducer action `SNOOZE_SCHEDULED_SUB { subId, untilSec }`. Sub stays `pending`; the reducer's tick check ignores subs whose `_snoozedUntil > elapsedSec`.
- **One banner at a time** stays the rule — but the pre-roll opens it earlier. If two subs are due within 30s of each other (e.g., 12'00 and 12'25), the first opens its pre-roll at 11'30; if user Applies at 12'00, the second's pre-roll opens at 11'55 — naturally serialized.
- Optional: a **vibrate / sound chime** on the transition from pre-roll to due. Use `navigator.vibrate(200)` if available; play a short audio clip for the chime. Both gated by a setting (default off until a coach asks). Out of MVP.

**State machine changes** (`useGameSessionReducer.ts`):

```ts
// New ephemeral field — not persisted to storage.
type ScheduledSubExt = ScheduledSub & {
  _snoozedUntilSec?: number;  // resumes prompting after this elapsed time
};

// Tick check inside SET_TIMER_ELAPSED (replaces the existing block at lines 388-396)
const PROMPT_LEAD_SEC = 30;
if (!activePrompt && state.scheduledSubs && state.scheduledSubs.length > 0) {
  const dueSub = state.scheduledSubs.find(
    s =>
      s.status === 'pending' &&
      // pre-roll: open 30s early
      s.timeSeconds <= elapsedSec + PROMPT_LEAD_SEC &&
      // honor snooze
      (s._snoozedUntilSec ?? 0) <= elapsedSec
  );
  if (dueSub) state.activeScheduledSubPrompt = dueSub;
}

// New action
case 'SNOOZE_SCHEDULED_SUB': {
  const { subId, untilSec } = action.payload;
  const next = (state.scheduledSubs ?? []).map(s =>
    s.id === subId ? { ...s, _snoozedUntilSec: untilSec } : s
  );
  return { ...state, scheduledSubs: next, activeScheduledSubPrompt: undefined };
}
```

The `_snoozedUntilSec` is intentionally underscore-prefixed and **not persisted**. The strip-on-save must happen in two places because of our dual-mode storage:
1. **Cloud path:** `SupabaseDataStore.transformGameToTables` (raw `scheduledSubs` write happens around line 3043) needs a sanitiser that drops `_snoozedUntilSec` from each entry before insert/upsert.
2. **Local path:** `LocalDataStore` writes the `AppState` JSON unfiltered to IndexedDB — there is no per-field transform. So the strip must happen reducer-side via a `sanitizeForPersist(state)` helper called before save, OR by keeping the snooze in a parallel ephemeral map (e.g. `state.snoozedUntilByScheduledSubId`) that is excluded from the `AppState` serialisation contract entirely.

The "parallel map" approach is cleaner — recommend that one. Snooze is a within-session state that doesn't survive a refresh. (Acceptable trade-off; alternatively could persist, low-value.)

**File:** modify `src/components/ScheduledSubBanner.tsx` + add tests for the three states (pre-roll, due, overdue) and snooze.

#### 10.3.3 On-pitch upcoming-sub markers

Subtle ring on the player tokens of players about to be subbed. Lightweight visual cue — coach's peripheral vision picks it up without breaking attention.

**Logic:** for each `pending` sub in the next 60 seconds (configurable threshold `MARKER_LEAD_SEC = 60`), find the player tokens for `outPlayer` and `inPlayer` on the field/bench respectively, add a class:

- `outPlayer` (currently on field) → `data-upcoming-out="true"` → renders a thin amber ring + "→" glyph
- `inPlayer` (currently on bench) → `data-upcoming-in="true"` → renders a thin emerald ring + "←" glyph

When the sub's pre-roll opens (30s in `ScheduledSubBanner`), the marker pulses. When fired, the marker clears and the actual swap renders.

**File:** modify `src/components/SoccerField.tsx` (or wherever the player tokens render) to read upcoming-sub IDs from a new selector `useUpcomingSubs()` hook. Hook computes:

```ts
function useUpcomingSubs(scheduledSubs: ScheduledSub[], elapsedSec: number, leadSec = 60) {
  return useMemo(() => {
    const out = new Set<string>();
    const in_ = new Set<string>();
    for (const s of scheduledSubs) {
      if (s.status !== 'pending') continue;
      if (s.timeSeconds > elapsedSec + leadSec) continue;
      if (s.timeSeconds < elapsedSec) continue; // already overdue, banner handles
      if (s.outPlayer) out.add(s.outPlayer);
      if (s.inPlayer) in_.add(s.inPlayer);
    }
    return { upcomingOut: out, upcomingIn: in_ };
  }, [scheduledSubs, elapsedSec, leadSec]);
}
```

Updates on every clock tick — but the Set identity stays stable until membership changes, so `useMemo` keeps it cheap.

**File:** `src/hooks/useUpcomingSubs.ts` (new) + `src/components/SoccerField.tsx` (modify, ~15 lines added). Add CSS class `.player-token[data-upcoming-out="true"]` etc. in the soccer field's stylesheet.

#### 10.3.4 Skip-undo toast

After Skip, a transient toast slides up from the bottom-right with a 30-second window to revert. Same pattern as `PlanningUndoBanner` (already shipped) but for in-game skips.

**Visual:** small dark pill, bottom-right, 30s countdown:

```
┌──────────────────────────────────────┐
│ Skipped sub at 12'                   │
│ Verne → Niilo (CAM)                  │
│             [ Undo ]  · 28s          │
└──────────────────────────────────────┘
```

Tapping Undo dispatches a new reducer action `UNDO_SKIP_SCHEDULED_SUB { subId }` that sets the sub back to `status: 'pending'`. If the sub is now overdue (elapsed > timeSeconds), it re-prompts immediately (the tick check picks it up). If still upcoming, it re-prompts at the original schedule.

After 30s without Undo, the toast fades out; the skip is permanent.

**State machine:**

```ts
// New transient state
recentSkip?: { subId: string; expiresAtMs: number };

// New actions
case 'SKIP_SCHEDULED_SUB': {
  const next = (state.scheduledSubs ?? []).map(s =>
    s.id === action.payload ? { ...s, status: 'skipped' as const } : s
  );
  return {
    ...state,
    scheduledSubs: next,
    activeScheduledSubPrompt: undefined,
    // 30s undo window
    recentSkip: { subId: action.payload, expiresAtMs: Date.now() + 30_000 },
  };
}
case 'UNDO_SKIP_SCHEDULED_SUB': {
  const next = (state.scheduledSubs ?? []).map(s =>
    s.id === action.payload ? { ...s, status: 'pending' as const } : s
  );
  return { ...state, scheduledSubs: next, recentSkip: undefined };
}
case 'EXPIRE_SKIP_UNDO': {
  return { ...state, recentSkip: undefined };
}
```

The toast component listens to `recentSkip` and starts a 30s countdown via `setTimeout`. On expiry, dispatches `EXPIRE_SKIP_UNDO`. Same component pattern as `PlanningUndoBanner` (which survives the parity rework unchanged — see §13.3).

**File:** `src/components/SkipUndoToast.tsx` (new) + tests. Mounted alongside `ScheduledSubBanner` in `HomePage.tsx`.

### 10.4 Re-Apply protection for games in progress

Today's `PlanningApplyPreview` shows per-game diff: "3 subs to add, 1 player dropped (not in game roster)". It does **not** check whether the target game has already-fired or already-skipped subs from a previous play-through.

Real scenario: coach Applied Saturday night, game 1 played (4 subs fired Sunday morning), at half-time of game 2 they realize Liam is sick, edit the plan, hit Apply. Without protection, game 1's `scheduledSubs` are wiped with new pending entries — but the substitutions already happened (those events are in `gameEvents`), so the game now has substitution events with no matching scheduled-sub records. Cosmetic divergence; not data loss; but confusing in the game stats view.

Worse for game 2: it's mid-play. Some subs fired, some didn't. Re-Apply currently just overwrites. Coach loses any "skipped" markers from the played-half.

**The fix:**

In `applyDraftToGame` (`src/utils/planApply.ts`), before overwriting `scheduledSubs`, partition the existing array:

```ts
const existing = game.scheduledSubs ?? [];
const preserved = existing.filter(s => s.status === 'fired' || s.status === 'skipped');
const newPlanned = computeNewSubsFromDraft(draft, ...);
// Preserve the played history; replace only pending entries with the new plan.
const merged = [...preserved, ...newPlanned];
```

**In the preview**, surface the warning per-game:

```
Game 1 (already played) — 4 fired subs preserved; 0 new pending added (game is over).
Game 2 (in progress, 12:30 elapsed) — 2 fired + 1 skipped preserved; 3 new pending added.
Game 3 — 5 new pending added.
Game 4 — 5 new pending added.
Game 5 — 5 new pending added.

[ Cancel ]  [ Apply ]
```

Each line is also a checkbox so the coach can opt out of re-applying to game 2 specifically (e.g., "leave game 2 alone, I'll handle the second half live").

**File:** modify `src/utils/planApply.ts` (the partition logic), modify `src/components/PlanningApplyPreview.tsx` (the per-game UI for the new partition), modify `src/utils/applyPreview.ts` (the diff helper). Add tests for: re-apply preserves fired/skipped; re-apply partition shows correct counts; coach can opt-out per-game.

### 10.5 Phased plan (live-game work)

Three phases. Independent of §4. Phases L1 + L2 are required for the planner to feel "lived" during the game; L3 is polish.

#### Phase L1 — Visibility (~3 days)

**Goal:** the coach sees their plan during the game.

1. `LivePlanTimeline` component (full visual, click → action sheet, status colors)
2. On-pitch `useUpcomingSubs` hook + ring markers in `SoccerField`
3. Tests for both
4. Wire in `HomePage.tsx` between the timer overlay and the field

**Done when:** opening a live game with 4 scheduled subs shows the strip with 4 amber pills; minute 11:30 starts pulsing the next-due pill and ringing the affected pitch tokens; Apply / Skip via banner updates the strip immediately.

#### Phase L2 — Pre-roll, snooze, skip-undo (~2 days)

**Goal:** the coach has time to react and recover from mistakes.

1. Modify `ScheduledSubBanner` for 30s pre-roll countdown
2. Add `SNOOZE_SCHEDULED_SUB` action + `_snoozedUntilSec` field (transient) — wire the new action handler through `useGameOrchestration.ts:2357-2376`
3. `SkipUndoToast` component + `recentSkip` state + `UNDO_SKIP_SCHEDULED_SUB` + `EXPIRE_SKIP_UNDO` actions — same hook wiring
4. Verify the snooze field is stripped on persist for **both** storage paths: `SupabaseDataStore.transformGameToTables` (cloud) and the `AppState` JSON written by `LocalDataStore` (local). Recommend a parallel ephemeral map outside `AppState` serialisation (see §10.3.2).
5. Tests for all three states (pre-roll, due, overdue) + snooze + undo

**Done when:** banner opens at -30s with countdown; snooze button defers 30s; skip toast appears for 30s post-skip with working undo.

#### Phase L3 — Re-Apply protection (~1.5 days)

**Goal:** mid-tournament re-Apply doesn't blow away game history.

1. Partition logic in `applyDraftToGame`
2. Per-game status counts in `applyPreview.ts`
3. Per-game opt-out checkboxes in `PlanningApplyPreview.tsx`
4. Tests for: preserve fired, preserve skipped, partition counts, opt-out
5. New i18n keys for the per-game status descriptors

**Done when:** re-Apply over a game with fired subs preserves them; the preview lists each game with a status badge; coach can uncheck a game to skip re-applying.

### 10.6 Polish (defer; can ship later)

- **Sound chime / haptic vibrate** on banner pre-roll → due transition. Settings toggle, default off.
- **"Apply at next stoppage" smart timer** — when banner is in pre-roll, watch for whistle taps in the game log; offer "Apply now (whistle just blew)" as a third button.
- **Per-sub event annotation** — tag the resulting `substitution` `GameEvent` with `plannedAtSec`, `plannedFromSession` so post-game stats can show "planned vs fired" deltas.
- **Tournament-day overview** — when the coach opens MatchOps-Local on Sunday morning, the home view shows a compact "Today's plans" widget with each game's plan status (5 subs planned, 4 pending, 0 fired). Out of scope for the planner-parity work but a natural follow-on.

### 10.7 Test strategy

| Area | Coverage | Notes |
|---|---|---|
| `LivePlanTimeline` rendering | Empty / all-pending / mixed status / overdue / snoozed states | Snapshot tests with a fixed `scheduledSubs` array |
| `LivePlanTimeline` actions | Click Apply pill → dispatches APPLY; click Skip → SKIP; click Edit → opens sheet | Testing Library + mocked dispatch |
| `useUpcomingSubs` hook | Returns correct out/in sets at 0s / 60s before / at moment / after due / on skipped | Pure unit test, no rendering |
| Banner pre-roll / due / overdue | Render banner at elapsed=11'30" of a sub at 12'00; assert title transitions | Fake timers + advance; assert text changes |
| Snooze action | Dispatch SNOOZE; tick clock; assert prompt does not re-open until snooze expires | Reducer-only test |
| Skip undo toast | Dispatch SKIP; toast renders; click Undo within 30s → sub back to pending; wait 30s → toast unmounts, sub stays skipped | Fake timers + Testing Library |
| Re-Apply preserves fired/skipped | Game with [fired, fired, skipped, pending]; re-Apply with new pending → result has [fired, fired, skipped, ...new pending] | Pure unit test on `applyDraftToGame` |
| Re-Apply per-game opt-out | Coach unchecks game 2 in preview; Apply only writes to game 1 + 3..5 | Component test |

### 10.8 Effort estimate

| Phase | Estimate |
|---|---|
| L1. Visibility (timeline + pitch markers) | 3 days |
| L2. Pre-roll / snooze / skip-undo | 2 days |
| L3. Re-Apply protection | 1.5 days |
| **Total live-game work** | **~6.5 days** |

Add 30% for review cycles and field-test feedback (this is UI on a use surface where coaches will catch things in actual usage that no engineer will).

### 10.9 Open questions

1. **Does the timer pause-clear logic match snooze semantics?** Today, pause clears the active prompt. Should snooze also be canceled on pause, or persist across pause/resume? **Default proposal:** snooze persists; pause-clear only affects `activeScheduledSubPrompt` (the visible banner), not the underlying `_snoozedUntilSec`. Coach's snooze intent survives a pause.

2. **What if a coach manually adds a sub via `ScheduledSubsSection` mid-game that's already overdue (e.g., adds a sub at 8' when clock is at 12')?** Today: it'd fire immediately on next tick. With pre-roll: it'd skip pre-roll (since the lead window has already passed) and fire as overdue. **Default proposal:** add-overdue path enters at the "due" state, not pre-roll. Acceptable.

3. **Two subs at the same role at the same minute** (one is a swap, the other is part of a halftime double-sub). The reducer's `find` returns one and ignores the other until the first is handled. UI should show the strip with both visible so the coach knows there are two. **Default proposal:** strip already shows both regardless of which is currently prompting. No change needed.

4. **Game restart / period change** — when a period ends, does pre-roll for the next period's first sub start during halftime? **Default proposal:** no — pre-roll only fires while `isTimerRunning`. Banner appears 30s into the second half if the first sub is at 13'00 of total (i.e., 30s into Q2 if Q1 was 12:30). Acceptable.

5. **Cross-period sub timing** — `timeSeconds` is total elapsed, not period-relative. A sub at 13:00 sits in Q2 for a 12:30-period game. Verify the strip and banner display this correctly. **Default proposal:** no change to data model; the strip uses total elapsed for layout.

6. **`ScheduledSubsSection` (manual editor) vs `LivePlanTimeline`** — both write to the same `scheduledSubs` field. A coach editing in `ScheduledSubsSection` while `LivePlanTimeline` is open for the same game could race. **Default proposal:** for now, treat `ScheduledSubsSection` as authoritative on edit (it dispatches a full re-save through the existing flow); `LivePlanTimeline` re-reads from state on each render so it picks up changes naturally. Test both edits in the same game don't lose data; document the lack of optimistic-locking explicitly.

### 10.10 Disposition

L1+L2 should ship in the same PR as a unit (the visibility + react-time UX is one product feature). L3 (re-Apply protection) can ship in a separate smaller PR before L1+L2 if the data-integrity concern is judged urgent. Prefer L1+L2 first because L3 is data-integrity protection for a path that, in practice, isn't blocking.

Both PRs land **after** §4 (planner UI parity) is in. They reuse the §4 `PositionSheet` primitive; building it twice would be waste.

---

## 11. Gaps in the plan as written — decisions to commit before kickoff

A second-pass review of §1–§10 surfaced these decisions that need to be in the plan, not just in chat history. Each is a yes/no commit so the PR work below can land deterministically.

### 11.1 Drop the "same format" picker restriction

**Today's behavior** (PR #404 picker, verified against `src/components/PlanningGamePicker.tsx:63-69`): the `isHomogeneousWith` helper enforces that all selected games share `teamId/teamName` AND `numberOfPeriods` AND `periodDurationMinutes`. There is **no** check on `gameType` and **no** check on formation/preset (earlier draft of this plan misstated that — corrected 2026-05-10). The validation runs through `computeValidation` (line 102) and disables the Continue button (line 226).

**Decision:** drop the period-count + period-duration restriction. Keep team scope (structural via `teamId`/RLS — already enforced and not the part being relaxed). Per-game formation lands separately in §11.2.

**Why:** chip-row math is per-game already (`getCellSegments` + `gameDurationSec` per row). The "form-mode" sub editor needed a single `min(durationSec)` to validate typed minute input — that form goes away in §4 Phase 2 (replaced by per-game `AddSubSheet` which only validates against THIS game's duration). The format restriction was an artifact of the form, not a structural data invariant.

**What changes:**
- `src/components/PlanningGamePicker.tsx` — delete `isHomogeneousWith` (lines 63-69) and the heterogeneity branch inside `computeValidation` (lines 102-119). Replace with a team-scope-only check (which already exists alongside).
- `src/components/PlanningGamePicker.tsx:226` — the Continue button's `disabled` flag now only reflects empty-selection / mixed-team violations, not format violations.
- `public/locales/{en,fi}/common.json` — remove the `planningGamePicker.heterogeneousSet` i18n key (and any other "mixed format" copy).
- `src/datastore/validation.ts` — confirm `validatePlanningSession` doesn't enforce period uniformity across game IDs. (It doesn't today; calling it out so a future maintainer doesn't add it.)
- Test changes: any test that currently asserts "rejects games with mixed durations" inverts to "accepts mixed durations". Add a positive test in `src/datastore/__tests__/validation.test.ts` locking the absence of cross-game restrictions.

**Lands in:** PR-PRE-1 (precondition for the parity work).

### 11.2 Move `presetId` (formation) from session-level to per-game-draft

**Today's behavior:** `PlanningSession.draft[gid].presetId` exists per game in the type today, but the editor's UI has one formation selector at the top that applies the chosen preset to every game when changed. Reading the existing draft model shows the field already supports per-game; the editor just doesn't use it.

**Decision:** move the formation selector from editor-level (one per session) to per-pitch-card (one per game). The preset still defaults to the same value across all games when a plan is freshly created.

**Why:** real coaches sometimes vary formation per opponent (4-3-3 against fast teams, 4-4-2 against slow teams). Forcing all games in a plan to share formation defeats the point of one plan covering several upcoming games.

**What changes:**
- `src/components/planning/PitchCard.tsx` — header includes a small formation `<select>` (or a tap-to-cycle button) bound to `draft[gid].presetId`.
- `src/components/PlanningEditor.tsx` — remove the editor-level formation selector. The formation-change confirm modal moves into per-card flow (when a card's preset change would lose sub assignments, prompt-confirm at the card level).
- Tests: per-card preset change applies only to that card's draft; other cards untouched.

**Lands in:** PR-P1 (alongside the PitchCard primitive that needs the per-card header anyway).

### 11.3 Per-game roster (squad) awareness inside the planner

**Today's behavior:** the planner reads `roster` (the team's master roster) and uses it for every game. Per-game `availablePlayers` differences are silent: at Apply time, players who aren't in a specific game's `availablePlayers` are dropped with a warning count. The editor doesn't show the coach which players are unavailable in which games.

**Decision:** the planner respects per-game `availablePlayers` for sub picker AND surfaces it visually.

**What changes:**
- `AddSubSheet` and `ReplacePlayerSheet` bench picker filters to that specific game's `availablePlayers`, not the team's master roster.
- `BenchDrawer` shows only that game's available bench, not the full team squad.
- `TournamentTotalsStrip` adds a small ⚠ badge on a player's pill if they're not in some included game's `availablePlayers` (e.g., "Liam · not in Game 1's squad"). Single-tap on the badge → tooltip listing which games.
- `ChipRow` chip rendering: if a chip's player isn't in this game's `availablePlayers` (planned but unavailable), render with a dashed border + warning hue. Click → opens position sheet with a "Replace player…" prompt up top.

**Why:** Liam is sick for game 3. Coach planned him in game 3's CAM. Currently they only see this at Apply time as a warning count. Better: visible everywhere in the editor so they fix it before Apply.

**Lands in:** PR-P2 (alongside the sub-action sheets that need the filtered bench picker) for the picker filtering. The visual badges land in PR-P4 (totals strip). The dashed-border ChipRow indicator lands in PR-P1 (simple CSS change).

### 11.4 "Applied at" indicator on each pitch card

**Today's behavior:** `PlanningSession.appliedAt` exists on the row but isn't surfaced in the editor. After re-Apply, the value updates silently.

**Decision:** each pitch card header shows a small badge: `Applied 14:32 yesterday` / `Not yet applied` / `Applied — game in progress`. On hover/tap → tooltip with the precise timestamp + the user-friendly meaning ("This game's substitutions were last written from this plan at 14:32 on 2026-05-07").

**Why:** mid-tournament, coach opens the plan to make adjustments. Are the changes they're making fresh ones, or are they re-iterating on already-applied subs? The badge tells them.

**What changes:**
- `PitchCard` header receives an `appliedAt: string | undefined` prop and renders the badge.
- `PlanningEditor` passes `editingSession.appliedAt` (which is already in the data store).
- Three states: never-applied (gray dash), applied-and-game-not-started, applied-and-game-played (i.e. game has events past the latest applied sub time).

**Lands in:** PR-P1 (header is part of the PitchCard primitive).

### 11.5 Game-status indicators on cards (played / in-progress / upcoming)

**Today's behavior:** the planner doesn't know whether a game has been played yet. Every card looks the same.

**Decision:** each pitch card shows its game's status: ✅ played, 🟡 in progress, ⚪ upcoming. Inferred from the saved game's data — `gameStatus`, `timeElapsedInSeconds`, `gameEvents.length` — read-only signal, not a planner-level field.

**Why:** sometimes you'd want to plan for the games that haven't happened yet without changing the past. Status indicators let the coach skim 5 cards and know which 2 are still ahead.

**What changes:**
- `PitchCard` reads game state, computes status badge.
- Optional refinement: in Grid mode, played-game cards collapse to a smaller "summary" mode (locked, not editable). Click to expand to full edit. Defer this UI flourish; just the badge in PR-P1.

**Lands in:** PR-P1 (header badge). Played-card collapse-to-summary deferred to PR-P6 (cleanup).

### 11.6 Drag-drop dual support (desktop + mobile tap-to-swap)

**Today's behavior:** existing `PlanningEditor` uses HTML5 drag-drop only — desktop-friendly, broken on touch.

**Decision:** every chip swap supports BOTH (a) HTML5 drag-drop on desktop, (b) tap-source-then-tap-target on touch.

**Why:** the standalone supports both via `onChipClick`'s tap-pair semantics + `onDragStart/onDragOver/onDrop` for drag. We need parity. Mobile is the primary planning device for half-time tweaks at the field.

**What changes:**
- `ChipRow` exposes both interaction surfaces: `draggable={true}` + `onClick` that participates in the tap-pair state machine.
- A `tapSelected` modal-level state (`{ gameId, role, startSec, benchPlayer? } | null`) tracks the first tap; second tap to a different chip executes swap.
- Visual: `tap-selected` chip gets a strong amber ring; until the second tap arrives.
- Tests: cover both interaction paths in the same test file.

**Lands in:** PR-P2 (alongside the swap engine).

### 11.7 Bottom sheet primitive — new shared component

**Today's behavior:** no generic bottom sheet exists. Existing modals (`PlanningModal`, `GameSettingsModal`, etc.) are full-screen dialogs.

**Decision:** add `src/components/ui/BottomSheet.tsx` — a generic primitive with backdrop, slide-up animation, focus trap, ESC-to-close, return-focus-to-trigger. Use across `PositionSheet`, `AddSubSheet`, `MoveSubSheet`, `ReplacePlayerSheet`, the live-game `LivePlanTimeline` action sheets.

**Why:** standalone reuses one `#bottom-sheet` div via `openSheet(title, sub, actions, opts)`. We need the React equivalent. Building it once and using it 5+ times is correct.

**A11y contract:**
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (sheet title id).
- Reuses `useFocusTrap` (already in `src/hooks/useFocusTrap.ts`).
- ESC closes; backdrop tap closes; both return focus to the trigger element.
- Open animation respects `prefers-reduced-motion`.
- Keyboard: Tab cycles within the sheet; arrow keys navigate inside `PositionSheet`'s action list (roving tabindex).

**Lands in:** PR-P2 (the first PR that needs it).

### 11.8 Visual-parity smoke test

**Today's behavior:** no automated check that our render matches the standalone.

**Decision:** add a Playwright smoke test in `tests/e2e/planner-parity.spec.ts` that:
1. Loads `matchops-planner/index.html` from disk in one browser context with a pinned localStorage seed
2. Loads `/planning` in MatchOps-Local with the same seed (via test fixtures)
3. Takes screenshots of: chip-row for one role with 0/1/2/3 subs, pitch card single mode, grid mode all 5 games, position sheet open
4. Compares screenshots side-by-side as test artifacts (not pixel-strict — visual review on PR)

**Why:** the 10 review passes on PR #404 missed parity because no automated check enforced it. Even a manual-review screenshot artifact on every PR forces the question "does this still look like the standalone".

**Lands in:** PR-PRE-2 (sets up the harness; subsequent PRs add screenshots).

### 11.9 i18n strategy and key budget

**Today's behavior:** `i18n-validation.test.ts` hard-codes the EN and FI key counts. Each new key bumps the assertion + needs an FI translation.

**Decision:** every PR in this plan that adds new visible strings:
1. Adds keys to `public/locales/en/common.json`
2. Adds matching FI keys to `public/locales/fi/common.json` (never blank)
3. Adds the key literal to `src/i18n-types.ts`
4. Bumps the count in `i18n-validation.test.ts` with a one-line "Planner UI parity PR-Pn: +N keys (X)" comment

For each PR, the description must include a "i18n keys added" section listing the new keys and FI translations. Saves translator round-trips.

**Estimate per PR:**
- PR-PRE-1 / PR-PRE-2: 0 keys (no UI changes)
- PR-P1 (PitchCard, ChipRow): ~6 keys (per-card formation label, applied-at badge variants, game-status badges, chip-row aria-labels, full-game/segment status text)
- PR-P2 (sheets + swap): ~15 keys (4 sheets × ~3 keys each: title, primary action, cancel)
- PR-P3 (ribbon + view toggle): ~5 keys (Single, Grid, ribbon include toggle, ribbon time format)
- PR-P4 (totals strip + bench drawer): ~8 keys (strip title, pill aria-labels, bench-row labels for kickoff vs halftime, never-plays warning)
- PR-P5 (detail overlay): ~10 keys (overlay title, scrubber labels, role-timeline aria-labels)
- PR-P6 (cleanup): 0 keys
- PR-L1 (timeline visibility): ~5 keys (timeline title, status aria-labels, action sheet for live edit)
- PR-L2 (banner + skip undo): ~6 keys (countdown, snooze button, skip-undo toast, overdue label)
- PR-L3 (re-apply protection): ~4 keys (preview status descriptors)

**Total new keys across all PRs:** ~59. Plus deletions: ~35 keys removed (PlanningTimeline form, PlanningChipGrid old strings, PlanningMinutesDashboard, PlanningTotalsTable). Net: ~+24 keys.

### 11.10 Feature flag strategy — DECIDED AGAINST

**Decision (2026-05-09):** **no feature flag.** All parity work lands on `feature/planner-integration` (the integration branch). Production users only see the work via PR #404 (currently Draft) when it's refreshed and merged to master after the full sequence is done. The integration branch IS the staging environment; no per-feature flag needed.

**Rationale:** the original feature-flag proposal assumed the new editor would ship incrementally to production users. With single-cutover via PR #404, there's no incremental production exposure to gate. The "kill switch" for the old form-mode editor isn't a flag — it's the deletion of `PlanningTimeline.tsx` in PR-P2 once `feature/planner-integration` carries the new editor.

**What this removes from the plan:**
- No `NEXT_PUBLIC_PLANNER_UI_V2` env var, no `next.config.ts` change
- No Settings toggle for "Try the new planner UI"
- No editor-version branching in `PlanningModal`
- PR-PRE-2 reduces in scope (now scaffolding + parity harness only, ~½ day instead of 1 day)

**See also:** §13.2 PR #404 disposition (single cutover after all PRs ship).

### 11.11 Live-edit undo / redo (deferred decision, document the deferral)

**Today's behavior:** post-Apply Undo (30s window) only. Within the editor, no undo of individual sub adds/removes/swaps.

**Decision:** **defer** to a follow-up. The standalone has 40-snapshot history (`pushHistory`/`undo`/`redo`). We don't need parity on this for PR-P1..P6.

**Future PR:** PR-P7 (post-parity). Add `editorHistory: PlanningSession[]` ref + Ctrl+Z / Ctrl+Y handlers in `PlanningEditor`. Memory: a snapshot per edit, capped at 40, JSON.stringify size bounded. Out of scope for parity; valuable; well-isolated.

### 11.12 Player priority flag carry-over

**Today's behavior:** `Player.isPriority` exists at the roster level. PlanningChipGrid renders ★ on priority chips. Standalone has the same concept (`PRIORITY` set + `prio` chip class).

**Decision:** keep priority rendering in the new ChipRow + TournamentTotalsStrip. No new logic — just preserve the existing visual.

**Lands in:** PR-P1 (ChipRow renders ★ on priority players, same as today).

### 11.13 What we are NOT taking from the standalone

These appear in the standalone but should NOT cross over:

- **`STORAGE_KEY_V3` / `VERSIONS_KEY` migration logic** — we have our own data layer
- **`buildSeedTournament()` hardcoded Pepo Violetti seed** — we read user-created games
- **The "Settings" tab for editing the roster** — MatchOps-Local has its own roster manager
- **The PWA install banner / state recovery banner** — handled by the parent app
- **The hardcoded `PLAYERS` global** — we use per-team rosters
- **The standalone's bottom-nav (Games / Minutes / Plans / Settings)** — that's app-shell concern; ours is integrated into the existing modal
- **Service worker, manifest, install logic** — all parent-app concern

Documenting these so they don't accidentally creep in via copy-paste.

---

## 12. PR breakdown with verification gates

The implementation work is split into discrete PRs landing on `feature/planner-integration` (or its successor — see §13). Each PR follows the **same verification loop** that PR #404 followed, with explicit acceptance gates.

### 12.1 Verification loop (per PR)

For every PR in §12.4 below, the cadence is:

1. **Open the PR** against `feature/planner-integration` (target). Title format: `feat(planner): PR-Pn / PR-Ln description`. Body uses the §12.3 template.
2. **CI runs automatically** — Build, Type Check, Lint, Test, Security Scan, Critical Path Guards. All must pass before review.
3. **Claude Code Review** runs (~10-15 min for a substantive review) and posts findings as PR comments. Codex review may also fire.
4. **Address findings** in fix-pass commits on the same branch. Each fix-pass is its own commit with message `PR-Pn fix-pass-K: <topic>`. Ten or fewer expected per PR; PR #404 needed eight before convergence — that's the upper expectation.
5. **Repeat steps 2–4** until reviewer says APPROVE (or "Approve with minor notes" where the notes are deferred follow-ups, not blockers). Throughout this loop, the human user reviews progress at any cadence; the agent's autonomous loop drives the PR cycles.
6. **User merges the PR** (the agent **does not** merge — directive carried over from PR #404).
7. **Move to the next PR.**

The agent stops between PRs unless explicitly told to continue. This prevents one bad PR from cascading into bad branches in dependent PRs.

### 12.2 PR acceptance criteria — universal gates

Every PR must, before user-merge:

- [ ] All CI green (Test, Type Check, Lint, Build, Security, Critical Path Guards)
- [ ] Claude Code Review at APPROVE (Conditional Approve acceptable if the conditions are met before merge)
- [ ] No regression in existing tests (count >= prior, no skipped without justification)
- [ ] i18n key count assertions in `i18n-validation.test.ts` updated (EN + FI in lockstep)
- [ ] `src/i18n-types.ts` updated for any new keys
- [ ] PR description includes: scope summary, files changed list (auto-generated via `gh pr diff --stat`), i18n keys added, manual smoke-test checklist, any deferred items
- [ ] Manual smoke test (per-PR section in §12.4) executed and noted in description
- [ ] No new `console.error`/`console.warn` calls outside `logger.*`
- [ ] No new `any` in production code; `unknown` + type assertions instead
- [ ] No new `setTimeout` in tests (use `waitFor` / fake timers per CLAUDE.md)
- [ ] Visual-parity smoke screenshot artifact attached (after PR-PRE-2 lands)

### 12.3 PR description template

```markdown
## Scope
<1-2 sentences of what this PR ships, mapped to §12.4 row>

## Why
<the user-visible problem this PR solves>

## Changes
- New: <bullet list of new files/components>
- Modified: <bullet list>
- Deleted: <bullet list>
- Tests: <new test files / new test cases in existing files>

## i18n keys added (en + fi)
- `planningSomething.foo` — "Foo" / "Foo"
- `planningSomething.bar` — "Bar" / "Baari"
- (Total: N keys)

## Manual smoke test
- [ ] <step 1>
- [ ] <step 2>
- [ ] <step 3>
- Screenshots: <link or attach>

## Acceptance
- [ ] CI green
- [ ] Claude review APPROVE
- [ ] Smoke test passes
- [ ] No new ESLint disables
- [ ] No regression vs prior PR

## Deferred
- <follow-up items not in this PR>

## Verification loop status
- Push: <commit sha>
- CI: <pass/fail link>
- Reviews: <pass-1 → pass-N>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 12.4 The PRs

#### PR-PRE-1 — Format-restriction relax + per-game preset confirmation (~1 day)

**Sequence position:** First. Blocks PR-P1.

**Scope:** drop the picker's same-format restriction (§11.1). Verify `validatePlanningSession` does not enforce period uniformity across game IDs.

**Branch:** `feature/planner-pre-1-format-flex` off `feature/planner-integration`.

**Files:**
- `src/components/PlanningGamePicker.tsx` — delete `isHomogeneousWith` (lines 63-69); delete the heterogeneity branch inside `computeValidation` (lines 102-119); leave the team-scope and empty-selection checks intact; update the `disabled` flag on the Continue button (line 226) accordingly
- `public/locales/en/common.json`, `public/locales/fi/common.json` — remove `planningGamePicker.heterogeneousSet` and any other "mixed format" copy keys
- `src/i18n-types.ts` — remove the deleted key literal(s)
- `src/__tests__/i18n-validation.test.ts` — bump EN + FI counts down by the number of removed keys (lockstep)
- `src/components/__tests__/PlanningGamePicker.test.tsx` — invert "rejects mixed durations" tests; add "accepts mixed durations of same team"
- `src/datastore/__tests__/validation.test.ts` — add a positive test asserting validatePlanningSession accepts mixed-duration game IDs (locks the absence of restriction)
- `docs/03-active-plans/planner-ui-parity-plan.md` — link from §11.1 to this PR

**Acceptance criteria (in addition to §12.2):**
- Picker accepts a session with games of different `periodDurationMinutes`
- Picker still rejects games from different teams (unchanged)
- Picker still rejects an empty selection (unchanged)
- All existing planner data tests stay green

**Manual smoke test:**
- [ ] Create two test games on the same team with different period durations
- [ ] Open Planning → New plan → both games appear and can be ticked
- [ ] Continue → editor opens with both games
- [ ] Save the plan; reload; plan persists correctly

**Estimate:** 1 day with review cycles.

---

#### PR-PRE-2 — Planning subdir scaffolding + parity test harness (~½ day)

**Sequence position:** Second. Blocks PR-P1.

**Scope:** create `src/components/planning/` subdirectory with `index.ts` + `CONTRACT.md`, set up the visual-parity test harness in `tests/e2e/planner-parity.spec.ts` (§11.8). Pin `matchops-planner/index.html` as a test fixture. **No feature flag** — the flag work was decided against in §11.10 (single cutover via PR #404, no incremental production exposure).

**Branch:** `feature/planner-pre-2-scaffolding` off `feature/planner-pre-1-format-flex`.

**Files:**
- `src/components/planning/` (new dir) + `index.ts` + `CONTRACT.md`
- `tests/fixtures/planner/standalone-snapshot.html` — pinned copy of `matchops-planner/index.html` (committed; survives standalone evolution)
- `tests/e2e/planner-parity.spec.ts` (new) — Playwright spec that loads both, screenshots side-by-side
- `.github/workflows/ci.yml` — confirm Playwright runs (or add stage)

**Acceptance criteria:**
- `src/components/planning/index.ts` exports nothing yet (placeholder)
- `CONTRACT.md` documents the chip-row visual contract with the standalone CSS rules embedded as the source of truth
- Playwright harness runs in CI; screenshots attached as artifacts (no actual planner rendering yet — just the harness shell + the standalone fixture)
- No behavior change anywhere in the app

**Manual smoke test:**
- [ ] CI run: parity-spec workflow runs, produces screenshot artifact (only standalone visible at this point)
- [ ] Open `src/components/planning/CONTRACT.md` — visual contract documented with embedded CSS

**Estimate:** ½ day.

---

#### PR-P1 — `ChipRow` primitive + `PitchCard` shell (~3 days)

**Sequence position:** After PR-PRE-1 + PR-PRE-2.

**Scope:** §4 Phase 1. Pure visual primitive. Replaces the existing pitch+role-button JSX in PlanningEditor; the form-mode `PlanningTimeline` survives one more PR (deleted in PR-P2).

**Branch:** `feature/planner-p1-chiprow` off `feature/planner-pre-2-scaffolding`.

**Detailed file list:** see §4 Phase 1.

**Plus from §11:**
- §11.2 — per-card formation `<select>` in `PitchCard` header, bound to `draft[gid].presetId`
- §11.3 (partial) — chip-row chip with dashed border for player not in this game's `availablePlayers`
- §11.4 — `appliedAt` badge in `PitchCard` header
- §11.5 — game-status badge in `PitchCard` header
- §11.12 — priority ★ rendering on chips

**Hygiene constraints (enable PR-P5 deferral, see §14.5):**
- **Port** `playerRatio` and `hueForRatio` from the standalone (`index.html:2815, 2829`) into `src/utils/planFairness.ts` (or a new `src/utils/planColors.ts`) as exported pure functions — do NOT inline the formula inside ChipRow. Both chip-min-bar (here) and PR-P5's player discs use the same util (PR-P5 also adds `discColors` from `index.html:2845-2850` — keep that next to its siblings). Standalone `playerRatio(player)` reads module globals (`tournament`, `included`, `PLAYERS`); the React port must thread those as explicit args. Failure mode if skipped: PR-P5 duplicates the formula and any future ratio-formula tweak has to be made in two places.
- Keep formation `(relX, relY)` as pure coordinate data on the preset — do NOT bake "always rendered as half-pitch" into the preset shape. PR-P1 renders half-field; PR-P5 renders full-field; same data, different rendering layer. Failure mode if skipped: PR-P5 either redefines the coordinate system or the preset gains a "view-mode" hack.
- Lift `highlightedPlayerIds: Set<PlayerId>` to PlanningEditor level (already done at `PlanningEditor.tsx:339` per current code — this hygiene line says "preserve the lift, do not regress to per-component state"). Treat the Set immutably (always `new Set(prev)` clone before mutate); existing code at lines 344-355, 362-381 already does so. The `useEffect` at lines 361-405 that purges stale highlights on preset change will need per-card scoping when formation moves per-game (§11.2) — adjust here, not later.

**Acceptance criteria:**
- Pitch card visual matches the standalone fixture (Playwright screenshot review)
- Chip-row test fixtures: 0/1/2/3 subs, half-time present/absent, full-game-green for unsubbed roles
- Per-card formation selector changes that card's preset only
- Applied-at badge shows correct text for never-applied / applied-and-fresh / applied-after-game-played states
- Game-status badge: ✅ played, 🟡 in progress, ⚪ upcoming
- `playerRatio` + `hueForRatio` are exported utils, not inline functions inside ChipRow
- Existing form-mode editor (PlanningTimeline) still works (deleted in PR-P2, not here)

**Manual smoke test:**
- [ ] Open planner → see PitchCard with chip-row layout (no more role-button slots)
- [ ] Add a sub via the existing form (still present until PR-P2) → chip-row updates to show 2 chips
- [ ] Verify visual: half-time line at 50%, segment colors progress white→yellow→orange
- [ ] Per-card formation selector: change Game 2 to a different preset → only Game 2's pitch reshapes; other games unchanged
- [ ] Applied-at badge: never-applied state shows "Not yet applied"; after Apply → "Applied HH:MM today"

**Estimate:** 3 days + review cycles.

---

#### PR-P2 — Position sheet + segment-aware swap + drag-drop (~3 days)

**Sequence position:** After PR-P1.

**Scope:** §4 Phase 2 + §11.6 (dual interaction) + §11.7 (BottomSheet primitive).

**Branch:** `feature/planner-p2-sheets` off `feature/planner-p1-chiprow`.

**Files** (per §4 Phase 2 + new):
- `src/components/ui/BottomSheet.tsx` (new — generic primitive per §11.7)
- `src/components/ui/__tests__/BottomSheet.test.tsx`
- `src/components/planning/PositionSheet.tsx`
- `src/components/planning/AddSubSheet.tsx`
- `src/components/planning/MoveSubSheet.tsx`
- `src/components/planning/ReplacePlayerSheet.tsx`
- `src/components/planning/BenchDrawer.tsx`
- `src/components/planning/__tests__/*.test.tsx` for each
- `src/utils/planSwapEngine.ts` — extend with `_segmentPlayer`, `_setSegmentPlayer`, `performSwap` per §4 Phase 2
- `src/utils/__tests__/planSwapEngine.test.ts` — extend tests for segment swap
- `src/components/planning/ChipRow.tsx` — wire onClick (PositionSheet) + drag handlers
- `src/components/PlanningEditor.tsx` — remove `<PlanningTimeline>` JSX
- **Delete:** `src/components/PlanningTimeline.tsx`, `src/components/__tests__/PlanningTimeline.test.tsx`
- **Delete:** the now-empty body of `src/components/PlanningChipGrid.tsx` and its test (replaced by re-export from PR-P1; here we delete fully)
- i18n: ~15 keys added per §11.9 budget; ~10-15 keys removed (`planningTimeline.*`)

**Acceptance criteria:**
- Touch 500ms long-press on chip → ChipSheet opens with the right action set per chip type (starting-XI vs sub segment vs bench)
- Desktop right-click (`contextmenu`) on chip → ChipSheet opens
- Gear icon on `pos-box` → PositionSheet opens (segments list + "Add sub at minute…" + Cancel)
- Add Sub at minute: validates time range, validates against `wouldCauseDoublePosition` (extracted to `src/utils/planConflicts.ts`), filtered bench picker per §11.3
- Drag-drop **same-game-only**: field↔field same-role swap, field↔field different-role swap, field↔bench, bench↔field; cross-game drag rejected (matches `index.html:3895, 3905`)
- Tap-to-swap **same-game-only**: tap chip A → amber ring (`var(--accent)`); tap chip B in same game → swap; tap chip B in different game → re-selects (no swap); tap A again → cancel (matches `index.html:3935`)
- `repairOutPlayers` invariant holds after every swap (out-player on each sub matches who was on field at the previous segment)
- ESC closes sheet, returns focus to trigger
- Backdrop click closes sheet
- Existing `PlanningTimeline` form is gone — no test references remain
- Double-position guard preserved: `src/utils/planConflicts.ts` exports `wouldCauseDoublePosition`; `AddSubSheet` and `ReplacePlayerSheet` consume it; the standalone i18n key `planningTimeline.errDoublePosition` is either reused or relocated to `planConflicts.errDoublePosition`
- i18n key delta accounted for in `i18n-validation.test.ts` (added vs removed)

**Manual smoke test:**
- [ ] Touch (DevTools): long-press a chip → ChipSheet opens; Add sub at minute → enter 12:00 → pick player → confirm → chip-row updates
- [ ] Desktop: right-click a chip → ChipSheet opens; plain click is reserved for tap-pair swap
- [ ] Drag chip A onto chip B at same role in same game → chip-row shows swapped names
- [ ] Drag chip A in Game 1 onto chip B in Game 2 → drop is rejected (no swap)
- [ ] Drag bench chip onto field chip in same game → bench drawer + chip-row update consistently
- [ ] On mobile (DevTools touch emulation): tap chip A in Game 1, tap chip B in Game 1 → swap; tap chip A in Game 1, tap chip C in Game 2 → re-selects (no swap)
- [ ] ESC + backdrop click both close the sheet
- [ ] No `PlanningTimeline` form visible anywhere in the editor

**Estimate:** 3 days + review cycles.

---

#### PR-P3 — Ribbon + view toggle (~2 days)

**Sequence position:** After PR-P2.

**Scope:** §4 Phase 3. Multi-game grid view + game-selector ribbon.

**Branch:** `feature/planner-p3-ribbon` off `feature/planner-p2-sheets`.

**Files:** see §4 Phase 3. Plus:
- `localStorage` adapter wrapping the view-mode persistence (`src/utils/plannerViewModePersistence.ts`)
- Tests for ribbon click → game switch animation; view toggle persists across remounts

**Acceptance criteria:**
- Grid mode renders all picked games as a CSS grid (`grid-template-columns: repeat(auto-fit, minmax(360px, 1fr))`)
- Single mode renders one PitchCard + horizontal-scrolling ribbon
- Single-mode horizontal swipe (`dx > 60px`, `|dx| > 1.4 * |dy|`, `dt < 700ms`) switches active game with slide animation
- View toggle persists choice in `localStorage` (`'matchops-local-planner-view-mode'`); default chosen by viewport width (`>=900px → grid`)
- Ribbon entry click switches active game with subtle slide animation
- Include-dot per ribbon entry toggles `includedGameIds` correctly

**Manual smoke test:**
- [ ] Desktop: planner opens in Grid mode by default with all picked games visible
- [ ] Click Single toggle → ribbon appears, only one card visible
- [ ] Click another ribbon entry → card switches, animation plays
- [ ] On touch (Chrome DevTools touch emulation): horizontal swipe on the active card → next game; vertical swipe does nothing
- [ ] Toggle include-dot → totals strip updates immediately
- [ ] Refresh page → view mode preference persisted

**Estimate:** 2 days + review cycles.

---

#### PR-P4 — Tournament totals strip + cross-game highlight + bench drawer states (~2 days)

**Sequence position:** After PR-P3.

**Scope:** §4 Phase 4. Plus §11.3 visual badges for unavailable players.

**Branch:** `feature/planner-p4-totals` off `feature/planner-p3-ribbon`.

**Files:** see §4 Phase 4. Plus:
- §11.3 — `TournamentTotalsStrip` pill gets ⚠ badge for player unavailable in any included game
- **Delete:** `src/components/PlanningMinutesDashboard.tsx` + tests
- **Delete:** `src/components/PlanningTotalsTable.tsx` + tests
- i18n: ~8 keys added; ~10-15 keys removed

**Hygiene constraint (enable PR-P5 deferral, see §14.5):**
- **Preserve** the `highlightedPlayerIds: Set<PlayerId>` lift at `PlanningEditor.tsx:339` (already in place on `feature/planner-integration` HEAD; see lines 344-355 and 362-381 for immutable mutation pattern). Do NOT regress to per-component local state inside any sub-tree. Pass via props to `PitchCard`, `ChipRow`, `BenchDrawer`, `TournamentTotalsStrip` and (when PR-P5 ships) `PlayerDisc`. Failure mode if regressed: PR-P5 either re-implements its own highlight set (broken cross-context highlight) or has to refactor closed PR-P4 work.

**Acceptance criteria:**
- Totals strip pills sorted ascending by total seconds
- Click pill → highlights that player in every chip in every game
- Click pill again → clears highlight
- Bench drawer shows kickoff row and (when half-time exists) a halftime row
- Never-plays bench chips have `benched-both` warning style
- Unavailable-in-some-game pill has ⚠ badge with tooltip listing affected games
- `highlightedPlayerIds` state lives at PlanningEditor level (or modal level), passed as props — verifiable by grepping for the state declaration

**Manual smoke test:**
- [ ] Open editor with 5 games → totals strip shows 11+ player strip-cells sorted by minutes (`.game-min-strip` / `.strip-cell`, 11-column grid)
- [ ] Click Liam (low-minute strip-cell) → all his chips across all games outline **orange** (`#f57c00`) — distinct from the amber tap-pair-selected color
- [ ] One game has Liam absent from `availablePlayers` → his strip-cell has ⚠
- [ ] Bench drawer: kickoff row has 3 players, post-halftime row has 4; halftime label format matches `After <halfMin>'` formula (e.g., "After 12.5'" for a 25-min game)
- [ ] Open a game where one player never plays → that bench chip has `benched-both` red inner shadow

**Estimate:** 2 days + review cycles.

---

#### PR-P5 — Detail overlay (deferrable, ~3-4 days)

**Sequence position:** After PR-P4. Optional for parity-shippable.

**Scope:** §4 Phase 5.

**Branch:** `feature/planner-p5-detail` off `feature/planner-p4-totals`.

**Acceptance criteria:** see §4 Phase 5.

**Estimate:** 3-4 days + review cycles.

---

#### PR-P6 — Cleanup + parity walkthrough (~1 day)

**Sequence position:** After PR-P4 (or P5 if shipped).

**Scope:** §4 Phase 6.

**Branch:** `feature/planner-p6-cleanup` off `feature/planner-p4-totals` (or `feature/planner-p5-detail` if PR-P5 shipped).

**Tasks:**
1. Walk standalone README "Features" against ours — verify each ships
2. Visual-parity Playwright smoke: snapshot all key surfaces; manual review
3. Lint pass: remove any dead code left from earlier deletions (PlanningTimeline / PlanningChipGrid old body / PlanningMinutesDashboard / PlanningTotalsTable)
4. Update `tournament-planner-integration-pr-plan.md` cross-references
5. Update `CLAUDE.md` Architecture Overview if any new pattern surfaced (e.g., `BottomSheet` provider)

**Acceptance criteria:**
- All standalone README features marked ✓ shipped or ⏭ deferred (in §7)
- No dead code in `src/components/` (no `Planning*.tsx` orphans)
- Final i18n key count matches expected (across all PRs in this plan)

**Manual smoke test:**
- [ ] Open `matchops-planner/index.html` and our planner side-by-side; play through one full coaching session (open plan → edit → apply); list every divergence; either fix or document

**Estimate:** 1 day + review cycles.

---

#### PR-P6.5 — Finnish translation polish pass (~½ day)

**Sequence position:** After PR-P6, before PR-L1 (or before PR #404 master cutover if live-game work is split out).

**Scope:** all FI strings added across PR-P1..P6 (and PR-P5 if shipped) get a focused review by a real Finnish translator (or you, if your Finnish is good). Mechanical-mirror FI strings written by the agent during each P-PR are refined for tone, idiom, and consistency with the rest of the app's existing Finnish copy.

**Branch:** `feature/planner-p6-5-fi-polish` off `feature/planner-p6-cleanup`.

**Files:**
- `public/locales/fi/common.json` — refine ~24 net new keys added across the parity work; no EN changes
- Any related test fixtures that reference FI strings (e.g., manual-smoke-test wording in tests that asserts FI text)

**Acceptance criteria:**
- All ~24 net new FI keys reviewed by a fluent Finnish speaker
- No EN keys changed (this PR is FI-only)
- All existing tests pass (FI string changes don't break tests that match by regex / partial)
- Coach-facing UI scanned in FI locale for awkward phrasing

**Manual smoke test:**
- [ ] Switch app to Finnish locale; open planner; walk every surface (list, picker, editor, position sheets, bench drawer, totals strip)
- [ ] Confirm no English bleeds through; no awkward translations

**Estimate:** ½ day (excluding translator turnaround time, which is async)

---

#### PR-L1 — Live-game timeline + on-pitch markers (~3 days)

**Sequence position:** After PR-P6 (parity stable; reuse `PositionSheet`).

**Scope:** §10 Phase L1.

**Branch:** `feature/planner-l1-live-visibility` off `feature/planner-p6-cleanup`.

**Acceptance criteria:** see §10.5 Phase L1.

**Estimate:** 3 days + review cycles.

---

#### PR-L2 — Banner v2 (pre-roll, snooze) + skip-undo toast (~2 days)

**Sequence position:** After PR-L1.

**Scope:** §10 Phase L2.

**Branch:** `feature/planner-l2-banner-v2` off `feature/planner-l1-live-visibility`.

**Acceptance criteria:** see §10.5 Phase L2.

**Estimate:** 2 days + review cycles.

---

#### PR-L3 — Re-Apply protection (~1.5 days)

**Sequence position:** After PR-L2 (or earlier — independent).

**Scope:** §10 Phase L3.

**Branch:** `feature/planner-l3-reapply-guard` off `feature/planner-l2-banner-v2`.

**Acceptance criteria:** see §10.5 Phase L3.

**Estimate:** 1.5 days + review cycles.

### 12.5 Total scope

| PR | Estimate | Cumulative | Optional? |
|---|---|---|---|
| PR-PRE-1 | 1d | 1d | required |
| PR-PRE-2 | 0.5d | 1.5d | required (reduced after §11.10 flag decision) |
| PR-P1 | 3d | 4.5d | required |
| PR-P2 | 3d | 7.5d | required |
| PR-P3 | 2d | 9.5d | required |
| PR-P4 | 2d | 11.5d | required |
| PR-P6 | 1d | 12.5d | required for shippable parity |
| PR-P6.5 | 0.5d | 13d | required (FI translator polish) |
| PR-P5 | 3-4d | 16-17d | optional (deferred per §14.5) |
| PR-L1 | 3d | 19-20d | required for live-game value |
| PR-L2 | 2d | 21-22d | required |
| PR-L3 | 1.5d | 22.5-23.5d | required |

**Shippable parity (P-only, no detail overlay):** ~13 days
**Plus live-game (P + L, no detail overlay):** ~19 days
**Everything (P5 + L):** ~22-24 days

Each estimate **excludes** review-cycle iterations. Empirical data from PR #404: 1-2× the implementation time spent on fix-passes. So plan for 1.5× of the above as a wall-clock estimate. Roughly: 20 days for shippable parity, 30-35 days for the full suite.

---

## 13. Branch graph and disposition

### 13.1 Branch graph

```
master
  │
  └── feature/planner-integration  ← integration branch; carries every PR below
        │
        ├── PR #404 ← DRAFT (only path to master; stays draft until everything ships)
        │
        ├── feature/planner-pre-1-format-flex     ← PR-PRE-1   (targets feature/planner-integration)
        │     └── feature/planner-pre-2-scaffolding ← PR-PRE-2 (targets feature/planner-integration)
        │           └── feature/planner-p1-chiprow ← PR-P1     (targets feature/planner-integration)
        │                 └── feature/planner-p2-sheets ← PR-P2 (targets feature/planner-integration)
        │                       └── feature/planner-p3-ribbon ← PR-P3 (targets feature/planner-integration)
        │                             └── feature/planner-p4-totals ← PR-P4 (targets feature/planner-integration)
        │                                   └── feature/planner-p6-cleanup ← PR-P6 (targets feature/planner-integration)
        │                                         └── feature/planner-p6-5-fi-polish ← PR-P6.5 (targets feature/planner-integration)
        │                                               ├── feature/planner-p5-detail ← PR-P5 (optional, deferred)
        │                                               └── feature/planner-l1-live-visibility ← PR-L1 (targets feature/planner-integration)
        │                                                     └── feature/planner-l2-banner-v2 ← PR-L2
        │                                                           └── feature/planner-l3-reapply-guard ← PR-L3
        │
        └── (final state) feature/planner-integration carries data layer + parity-correct UI + live-game UX
```

**Critical invariant:** every PR-PRE-*, PR-P*, PR-L*, PR-P6.5 PR targets `feature/planner-integration` as its merge base. Each branch is rebased onto the integration tip before its PR opens (or after the previous PR merges). Master is touched **only** via PR #404, **only** at the end of the sequence, **only** by the user.

### 13.2 PR #404 disposition (final)

**Status:** PR #404 is currently **Draft** (converted 2026-05-09 per §14.1). A linking comment points at this plan as the implementation record.

After PR-P6.5 lands on `feature/planner-integration` (or PR-L3 if live-game work is in scope for the cutover), refresh PR #404:
- Mark Ready for Review (un-draft)
- New PR description points at this plan
- Reviewers see one combined diff: data layer (already approved at 10 review passes) + parity-correct UI + (optionally) live-game UX
- One round of final review focusing on the new surface
- User merges to master in one cutover

The data layer changes already in PR #404 (10 review passes, 5500+ tests, 12 migrations) are preserved as part of `feature/planner-integration`. Nothing is thrown away.

**The user (not the agent) merges PR #404 to master.** This stands.

### 13.3 What survives the pivot

Concrete inventory of what's on `feature/planner-integration` HEAD that survives the parity rework:

**Survives unchanged:**
- `src/datastore/validation.ts` (the per-draft caps stay; format-uniformity check loosened in PR-PRE-1 if it's there)
- `src/datastore/LocalDataStore.ts` (cascade-deletes from commit `1687f95c` for planning sessions on team/game delete; planning CRUD; setActiveSession lock; `withKeyLock`)
- `src/datastore/SupabaseDataStore.ts` (RLS, RPC wiring) — note: PR-L3 may extend the cloud cascade-delete to match local
- `src/datastore/SyncedDataStore.ts` (sync queue) — note: cascade behaviour through this layer must match LocalDataStore
- `src/components/ScheduledSubsSection.tsx` — manual sub editor mounted inside `GameSettingsModal.tsx:1661`; survives the rework. May coexist with `LivePlanTimeline` (PR-L1) writing to the same `scheduledSubs` field — see §10.9.6.
- `src/components/PlanningUndoBanner.tsx` — post-Apply undo banner; survives unchanged. PR-L2's `SkipUndoToast` follows the same component pattern.
- `src/hooks/useGameSessionReducer.ts` — survives; PR-L2 adds new actions (`SNOOZE_SCHEDULED_SUB`, `UNDO_SKIP_SCHEDULED_SUB`, `EXPIRE_SKIP_UNDO`)
- `src/components/HomePage/hooks/useGameOrchestration.ts` — survives; PR-L2 wires the new reducer-action handlers through here (around lines 2357-2376)
- `src/utils/applySnapshot.ts` (`captureApplyableFields` at line 34, `UNDO_WINDOW_MS = 30_000` at line 51)
- `src/utils/plan*.ts` — all of them: `planExport`, `planBundle`, `planFromImport`, `planToExport`, `planFairness`, `planSwapEngine`, `planApply`, `applyPreview`, `applySnapshot`, `planMinutesAggregate`, `planTotals`, `planHalftimeSplit`, `planFormatters`
- `src/types/planningSession.ts` (`PlanningSession.parentSessionId?: string` at line 88; `string | undefined`, NOT nullable — preserved by recent commits `7a907914`, `cf471f26`, `d111defc`)
- `src/types/game.ts` (`ScheduledSub` interface at lines 108-119; `ScheduledSubStatus = 'pending' | 'fired' | 'skipped'`)
- `src/hooks/usePlanningSessionQueries.ts` (`SavePlanningSessionVariables` exported at line 48; `PlanningModal.stampedSessionRef.parentSessionId: string | undefined` shape)
- `src/hooks/useFocusTrap.ts` — reused by PR-P2's `BottomSheet` primitive
- `src/config/formationPresets.ts` (`FORMATION_PRESETS` exported at line 449)
- All 12 SQL migrations 028-039
- All 5500+ existing tests on the data layer

**Modified by the parity work:**
- `src/components/PlanningModal.tsx` — list view stays; editor view replaced. Dynamically imported by `ModalManager.tsx:24,255` (the dynamic-import wrapper means tests must use the `dynamic` mock). No feature flag — single cutover via PR #404 to master
- `src/components/PlanningEditor.tsx` — large rewrite of the rendered tree (PitchCard + ribbon + totals strip composition); state machine stays similar. The `highlightedPlayerIds` lift at line 339 + the stale-purge `useEffect` at lines 361-405 need per-card scoping when formation moves per-game (§11.2). Pitch+role-button JSX confirmed at lines 1435-1487 (target of PR-P1's reshape)
- `src/components/PlanningGamePicker.tsx` — format-uniformity rule removed (PR-PRE-1): delete `isHomogeneousWith` (lines 63-69) + `computeValidation` heterogeneity branch (lines 102-119)
- `src/components/PlanningChipGrid.tsx` — body replaced with re-export of `ChipRow` (PR-P1), then deleted (PR-P2)
- `src/components/HomePage.tsx:94` — banner wiring; PR-L2 mounts `SkipUndoToast` here too
- `src/utils/planSwapEngine.ts` — extended with segment-aware swap helpers (PR-P2). `PlanDraft.presetId?: string` at line 54 already supports per-game preset
- `src/utils/planApply.ts` — partition logic for re-Apply protection (PR-L3)
- `src/datastore/SyncedDataStore.ts`, `src/datastore/SupabaseDataStore.ts` — extend cascade-delete on team/game delete to match LocalDataStore (PR-L3 or PR-P2, whichever touches cascade first)

**Deleted by the parity work:**
- `src/components/PlanningTimeline.tsx` (PR-P2) — but first extract its working double-position guard at lines 278-297 + `parseMMSS` at line 54 into `src/utils/planConflicts.ts`. Don't drop working code in favor of a fresh port from the standalone.
- `src/components/__tests__/PlanningTimeline.test.tsx` (PR-P2)
- `src/components/PlanningChipGrid.tsx` (PR-P2 — after PR-P1 reduces it to a re-export)
- `src/components/__tests__/PlanningChipGrid.test.tsx` (PR-P2)
- `src/components/PlanningMinutesDashboard.tsx` (PR-P4)
- `src/components/PlanningTotalsTable.tsx` (PR-P4)
- All corresponding tests
- ~25-35 i18n keys across en + fi (`planningTimeline.*`, plus dashboard / totals-table strings — preserve `planningTimeline.errDoublePosition` if reused, otherwise relocate)

**Net change:** roughly equal lines added vs deleted; data layer untouched; UI reborn.

---

## 14. Decisions resolved before kickoff

All four user-owned decisions resolved 2026-05-09 (see §15 decision log). Agent-owned decisions confirmed at the same time. Plan validated against both the standalone reference and MatchOps-Local code on 2026-05-10 (multi-agent pass; corrections applied in-place — see §15).

| # | Decision | Resolution | Date | Owner |
|---|---|---|---|---|
| 14.1 | PR #404 disposition | **Convert to Draft now**, refresh after PR-P6.5; user merges to master in single cutover | 2026-05-09 | User |
| 14.2 | Feature flag default in production | **No flag** — single cutover via PR #404 (user's call); §11.10 updated | 2026-05-09 | User |
| 14.3 | Per-game formation selector UI shape | `<select>` element in PitchCard header | 2026-05-09 | Agent |
| 14.4 | Move post-Apply Undo banner to a toast? | Keep current UndoBanner for parity work; revisit after PR-L2 ships toast | 2026-05-09 | Agent |
| 14.5 | Detail overlay (PR-P5) | **Defer.** Ship PR-PRE-1..P6.5 first (~13d). PR-P5 lands when capacity allows. Hygiene constraints in PR-P1 + PR-P4 acceptance keep deferral painless. | 2026-05-09 | User |
| 14.6 | Live-game work (PR-L*) sequencing | Land after parity (PR-L1 reuses PR-P2's BottomSheet) | 2026-05-09 | Agent |
| 14.7 | Player-priority badge on `LivePlanTimeline`? | Yes; consistent with editor totals strip | 2026-05-09 | Agent |
| 14.8 | Touch tap-pair selection state | Modal-level (`tapSelected`); cross-game blocked | 2026-05-09 | Agent |
| 14.9 | ChipRow keyboard navigation | Tab through DOM order; Enter/Space opens sheet; arrow keys within sheet | 2026-05-09 | Agent |
| 14.10 | Visual-parity smoke test as merge gate? | Attach as artifact; reviewers eyeball; not auto-blocking | 2026-05-09 | Agent |
| 14.11 | Finnish translation strategy | **Agent drafts FI per PR; translator polish in PR-P6.5** before PR #404 master cutover | 2026-05-09 | User |
| 14.12 | Plan deleted while game's subs are applied — keep subs? | Yes, subs stay on the game (Apply copies; plan is a template). Document in `LocalDataStore.deletePlanningSession` JSDoc when PR-P2 touches it. | 2026-05-09 | Agent |

**Kickoff is now unblocked.** Agent can begin PR-PRE-1 work on `feature/planner-pre-1-format-flex` branch off `feature/planner-integration`.

---

## 15. Decision log

- **2026-05-07:** PR #404 review converged at "APPROVE — ready to merge" after 10 review passes, but the user's manual UAT exposed a fundamental UX divergence from the standalone planner. Plan written; rebuild-on-data-foundation approach chosen over start-over.
- **2026-05-08:** Live-game plan presentation (§10) added to the plan. The original parity work (§4) is the planning surface; §10 is the playing surface. Both halves are required for the planner's value to land with coaches.
- **2026-05-08:** Plan reviewed for missing pieces (§11) and converted into PR splits with verification gates (§12). 11 PRs total: 2 preconditions, 6 parity (P-series), 3 live-game (L-series). Estimated wall-clock: ~20 days for shippable parity (PR-PRE-1 → PR-P6), ~30-35 days for the full suite. PR #404 converts to Draft pending PR-P4; user merges to master after that.
- **2026-05-09:** All four user-owned open decisions resolved (§14):
  - 14.1 — PR #404 converted to Draft (executed via `gh pr ready 404 --undo`); linking comment posted
  - 14.2 — **No feature flag.** User's override: integration branch IS the staging environment; production sees nothing until PR #404 merges to master in single cutover. PR-PRE-2 scope reduced from 1d to ½d (drop flag plumbing, keep scaffolding + parity test harness)
  - 14.5 — Detail overlay (PR-P5) deferred. Hygiene constraints added to PR-P1 acceptance (extract `playerRatio`/`hueForRatio` to shared util; keep formation `(relX,relY)` as pure coordinate data) and PR-P4 acceptance (lift `highlightedPlayerIds` Set to PlanningEditor/modal level) so deferral stays painless
  - 14.11 — Agent drafts FI per PR; PR-P6.5 added to sequence for translator polish before PR #404 master cutover
  - All eight agent-owned decisions confirmed at proposal values
  - Total scope updated: 12 PRs (PRE-1, PRE-2, P1-P4, P6, P6.5, L1-L3, optional P5). Shippable parity ~13 implementation days.
- **2026-05-10:** Multi-agent validation pass (one against standalone `matchops-planner/index.html`, one against MatchOps-Local code on `feature/planner-integration` HEAD). Findings applied in-place across §1, §3, §4 Phases 1-5, §10, §11.1, §13.3, and PRs PRE-1, P1, P2, P3, P4. Highlights:
  - **Standalone misreads corrected:** chip widths are equal-weight in the standalone (`--seg-flex` set but no CSS rule consumes it); `.ht-divider` has no `left` rule today; chip-min-bar fill width is `Math.min(100, r * 80)%` (so ratio 1.0 → 80%, ratio ≥1.25 → 100%); grid layout is `display: grid` not `flex: 1`; detail overlay role-timeline rows DO render a `dt-half` halftime guide and use absolute `left:%`/`width:%` (not flex). Rebuild's deliberate deviations (consume `--seg-flex`, position `ht-divider`, render priority `★` on chips) are now flagged as deviations rather than parity claims.
  - **TournamentTotalsStrip CSS source corrected:** mirror `.game-min-strip` / `.strip-cell` (lines 668-718, 11-column grid), NOT `.pt-chip` (lines 720-870; that's a separate Minutes-tab primitive).
  - **Standalone interactions added:** touch swipe-to-change-game (PR-P3); 500 ms long-press to open chip sheet on touch (PR-P2); right-click `contextmenu` to open chip sheet on desktop (PR-P2); drag-drop and tap-pair are **same-game-only** (PR-P2); `.slot.plays-both` red inner box-shadow (PR-P1); `BenchDrawer` halftime label dynamic format `After <Math.round(halfSec/60 * 2)/2>'` (PR-P4); cross-game `highlighted` outline is orange `#f57c00`, NOT amber (PR-P4); `discColors` (no green band) distinct from `ratioColors` (PR-P5); `RoleSegment` shape documented (`{startSec, endSec, player, segIdx}`); `repairOutPlayers` invariant (PR-P2).
  - **Plan-vs-code drift corrected:**
    - `UPDATE_TIMER` action does not exist; the tick action is `SET_TIMER_ELAPSED` (literal at `useGameSessionReducer.ts:147`; tick block at `:388-396`). Fixed §10.1 and §10.3.2.
    - `transformGameToDb` does not exist; the cloud transform is `transformGameToTables` in `SupabaseDataStore.ts` (raw `scheduledSubs` write near line 3043). LocalDataStore writes JSON unfiltered, so the `_snoozedUntilSec` strip must happen reducer-side (recommend a parallel ephemeral map outside `AppState` serialisation). Fixed §10.3.2 and §10.5 Phase L2.
    - §1 + §11.1 overstated the format-uniformity check: actual `isHomogeneousWith` (`PlanningGamePicker.tsx:63-69`) checks team + periods + duration only — no `gameType`, no formation. Fixed.
    - PR-PRE-1 file list now points at the actual code shape: delete `isHomogeneousWith` + `computeValidation` heterogeneity branch (lines 102-119); remove `planningGamePicker.heterogeneousSet` i18n key.
    - PR-P1 hygiene constraint reworded from "Extract" to "Port" — `playerRatio`/`hueForRatio` don't exist in our codebase yet (verified via grep).
    - PR-P4 hygiene constraint reworded to "preserve, do not regress" — `highlightedPlayerIds` is already lifted to `PlanningEditor.tsx:339` (with immutable mutation pattern at lines 344-381). Stale-purge `useEffect` at lines 361-405 needs per-card scoping when formation moves per-game (§11.2).
  - **Inventory additions to §13.3:** `ScheduledSubsSection.tsx` (survives, second writer to `scheduledSubs`), `PlanningUndoBanner.tsx` (survives, pattern reused by `SkipUndoToast`), `useGameOrchestration.ts` (PR-L2 wires new actions there), `useFocusTrap.ts` (PR-P2 reuses), `FORMATION_PRESETS` at `src/config/formationPresets.ts:449`, recent commits `1687f95c` (planning-session cascade-deletes — needs cloud-path parity in PR-L3).
  - **PR-P2 file list addition:** extract working double-position guard from `PlanningTimeline.tsx:278-297` + `parseMMSS` (line 54) into `src/utils/planConflicts.ts` BEFORE deleting the file. Plus `repairOutPlayers` invariant test.
  - **§10.9 added open question 6:** `ScheduledSubsSection` vs `LivePlanTimeline` write conflict on the same `scheduledSubs` field.
  - All other claims confirmed against source. Plan is now consistent with both reference implementations as of 2026-05-10.
