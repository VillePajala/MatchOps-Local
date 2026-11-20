# Game Recap Generator - Plan (pre-plan / exploration)

**Status**: ✅ Phase 1 shipped 2026-07-01. Single-game factual recap (score/result incl.
penalties, our scorers + assisters, coach's `gameNotes`); "Recap" button in `GameStatsModal` ->
preview modal with Share (OS text share sheet) + Copy. Pure `buildGameRecap` (`src/utils/gameRecap.ts`,
unit-tested); modal `src/components/GameRecapModal.tsx`; i18n `recap.*`. The "maybe later" toggles
(competition/clean-sheet lines, warm-tone, milestones/timeline) remain unbuilt by design.
**Roadmap**: P3 feature backlog (`UNIFIED-ROADMAP.md`).

## Intent

A one-tap way for the coach to produce a ready-to-paste **text recap** of a game (or a
match day) to drop into the team chat (WhatsApp/SMS/email). Leans into the app's strengths:
all the data already exists, nothing leaves the device unless the coach shares it, and
text-sharing via the OS share sheet is reliable (unlike file-sharing - see the backup
share-sheet saga). No in-app messaging to build or moderate.

## Decisions locked (2026-06-26)

- **Tone**: Factual (compact, scannable). Warm/prose tone deferred (possible later toggle).
- **Player names**: Nickname if set, else first name. Our players only - opponent scorers
  stay anonymous (matches the app's existing opponent-anonymity pattern).
- **Delivery**: Share sheet (text) as primary + Copy to clipboard as fallback.
- **Surface**: A "Recap" button in the per-game stats view (`GameStatsModal`).

## Key finding: the coach-notes field already exists

The "coach writes the report in game settings" need is **already supported**:

- `AppState.gameNotes: string` - persisted per-game field (`src/types/game.ts:111`).
- Editable in **Game Settings** today (`GameSettingsModal.tsx`: `onGameNotesChange`,
  `notesTextareaRef` textarea, `handleStartInlineEdit('notes')`).
- Syncs to cloud (`game_notes` column, `src/types/supabase.ts`).

So the recap just **pulls `gameNotes` in as the report body** - no new field. This is what
turns a stat line into the coach's actual report.

## Single-game recap content

Sample (factual, includes `gameNotes`):

```
Tigers 3-2 Lions (W)
26.6.2026 · Central Park · U11
Goals: Liam 2, Emma 1
Assists: Noah 1

Coach's notes:
Tough first half, but we controlled it after the break. Great pressing from midfield.
```

**Core lines (Phase 1):**
- Header: `{team} {teamGoals}-{oppGoals} {opponent} ({W/L/D})` - team goals first regardless
  of home/away; result from `resolveGameResult` (handles draws + shootouts).
- Meta line: date · venue (`gameLocation`) · age group - omit any empty segment.
- `Goals:` our scorers aggregated (count desc), omitted if none.
- `Assists:` from `assisterId`, omitted if none.
- `Coach's notes:` block from `gameNotes`, omitted if empty.

**Should add to the default:**
- Competition + round (season/tournament name) on the meta line.
- "won on penalties" note when `resolveGameResult` decided it via shootout (else "2-2 (W)"
  reads as an error).
- Clean sheet / keeper shout-out when 0 conceded (fairness-neutral positive).

**Optional toggles (later):**
- "Everyone played" / minutes line (leans into fair-playing-time ethos).
- Milestones ("Liam's 25th goal", "Emma's 50th appearance") - reuses the milestone idea.
- Goal timeline ("0-1, 1-1, 2-1...").
- Next game, if scheduled.
- Top performer - keep opt-in / team-framed; singling out one kid in a parent chat can
  backfire in youth sport.

## Multi-game "match day" recap - descoped (2026-06-28)

**Decision**: NOT building a combined multi-game recap. A youth match day is often 2+ games
back-to-back, but the coach can just paste the two single-game recaps into the team chat and
add a line of their own. One recap per game is enough; the combining happens in the chat, not
the app. This keeps the feature to a single pure formatter + one button - no multi-select UI,
no cross-game aggregation, no day-level notes field.

If coaches later ask for a true one-shot combined recap, the building blocks already exist
(the season/tournament stats tabs in `GameStatsModal` already aggregate W-L-D, GF/GA, and
combined scorers/assists across games via `useTournamentSeasonStats` / `useGameStats`) - so
it stays cheap to add. Until then, out of scope.

**Note for the P4 planner**: the "group games by date" idea still matters there (same-day
fair playing time - a kid who sat most of game 1 should start game 2). That grouping lives
with the planner, not here.

## Phasing

**Single-game only - no further phases planned.**

- **Phase 1 (Low effort, the whole feature)**: single-game factual recap incl. `gameNotes`;
  "Recap" button in `GameStatsModal`; share-as-text + copy. Pure
  `buildGameRecap(game, players, options)` function; i18n EN/FI; reuse `resolveGameResult` +
  existing scorer aggregation. No schema changes.
- **Maybe later (only if asked)**: "won on penalties" / clean-sheet / competition lines;
  optional warm-tone toggle; milestones/timeline toggles. Multi-game combining is out of
  scope (see above) - coaches paste two single-game recaps into the chat.

## Implementation sketch

- `src/utils/gameRecap.ts` -> `buildGameRecap(game: AppState, players: Player[], opts?, t): string`
  (pure, unit-tested across: win/loss/draw, shootout result, away-game score order, no goals,
  missing venue/age, empty notes, deleted-player fallback).
- Names: `player.nickname || firstToken(player.name)`.
- Delivery: `navigator.share({ title, text })` (text share is broadly supported; no file
  allowlist issues) + `navigator.clipboard.writeText` fallback. A small preview screen with
  Share / Copy buttons.
- i18n keys: `recap.*` (title, share, copy, copied, goals, assists, coachNotes, resultWin/
  Loss/Draw, onPenalties, ...). Update the i18n key-count guard.

## Open questions (deferred)

- Include competition name (needs season/tournament name lookup) in v1 or later?
- Where else to surface the recap (post-game-end prompt?) beyond the stats view.
