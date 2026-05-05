// Pure helpers for the H1/H2 split affordance — single source of truth for the two-period halftime assumption.

import type { AppState } from '@/types/game';
import type { PlanDraft, RoleName, PlayerId } from './planSwapEngine';
import { gameDurationSec } from './planFormatters';

// Halftime in seconds; rounded so it lines up with sub.timeSeconds
// (validator requires integer). Returns 0 for missing / zero-duration
// AND for 1-period games (no half-time exists in a single-period match
// — futsal coaches would otherwise see the affordance and create a
// sub at "half" that doesn't correspond to any real game break).
export function halftimeSec(game: AppState | undefined): number {
  if (!game) return 0;
  const dur = gameDurationSec(game);
  if (dur <= 0) return 0;
  if (game.numberOfPeriods !== 2) return 0;
  return Math.round(dur / 2);
}

// 'complex' = 2+ subs OR single sub off-half; the panel hides and
// the coach uses the timeline editor instead.
export type RoleSplitState =
  | { kind: 'no-sub'; canSplit: boolean }
  | {
      kind: 'split';
      starter: PlayerId | undefined;
      subId: string;
      subPlayer: PlayerId;
    }
  | { kind: 'complex' };

export function classifyRoleSplit(
  draft: PlanDraft,
  role: RoleName,
  game: AppState | undefined,
): RoleSplitState {
  const half = halftimeSec(game);
  const roleSubs = draft.scheduledSubs.filter((s) => s.positionRole === role);

  if (roleSubs.length === 0) {
    // "Split at half" is meaningful only if there's a bench player to
    // bring in AND the game has a non-zero halftime. An empty bench
    // would create a sub with inPlayer = undefined which the engine
    // rejects.
    const canSplit = half > 0 && draft.bench.length > 0;
    return { kind: 'no-sub', canSplit };
  }
  // The `half > 0` guard prevents a 1-period game (or a game with
  // gameDurationSec === 0) from misclassifying a sub at timeSeconds=0
  // as a half-time split. Without it, halftimeSec returns 0 for
  // 1-period games and any sub at 0s would silently surface the
  // Keep-starter / Keep-sub UI.
  if (
    half > 0 &&
    roleSubs.length === 1 &&
    roleSubs[0].timeSeconds === half
  ) {
    return {
      kind: 'split',
      starter: draft.startingXI[role],
      subId: roleSubs[0].id,
      subPlayer: roleSubs[0].inPlayer,
    };
  }
  return { kind: 'complex' };
}

// Caller passes `newSubId` (e.g. `generateId('sub')`) so this util stays pure.
export function addHalftimeSplit(
  draft: PlanDraft,
  role: RoleName,
  game: AppState | undefined,
  newSubId: string,
): PlanDraft {
  const state = classifyRoleSplit(draft, role, game);
  if (state.kind !== 'no-sub' || !state.canSplit) return draft;

  const half = halftimeSec(game);
  const inPlayer = draft.bench[0];
  // Defensive guard — classifyRoleSplit already ensured bench is
  // non-empty, but a stale draft slipping through here would otherwise
  // emit a sub with `inPlayer: undefined`.
  if (!inPlayer) return draft;

  // Remove inPlayer from bench so the sub-fired event leaves the
  // bench accurate post-Apply. The swap engine handles the field-
  // side mechanics on Apply; here we mirror its bench bookkeeping
  // for the planner's preview.
  const nextBench = draft.bench.filter((id) => id !== inPlayer);

  return {
    ...draft,
    bench: nextBench,
    scheduledSubs: [
      ...draft.scheduledSubs,
      {
        id: newSubId,
        timeSeconds: half,
        inPlayer,
        positionRole: role,
      },
    ].sort((a, b) => a.timeSeconds - b.timeSeconds),
  };
}

// Collapse a half-time split to its starter; sub player returns to bench.
export function keepStarter(
  draft: PlanDraft,
  role: RoleName,
  game: AppState | undefined,
): PlanDraft {
  const state = classifyRoleSplit(draft, role, game);
  if (state.kind !== 'split') return draft;
  // Defensive: if the sub player is already on the bench (timeline-
  // editor-created splits can leave them there), don't duplicate.
  // The split UI never adds a player who's still on the bench, but
  // a sub created via the timeline editor + later collapsed via this
  // shortcut could otherwise produce a doubled bench entry.
  const benchHasSub = draft.bench.includes(state.subPlayer);
  return {
    ...draft,
    bench: benchHasSub ? draft.bench : [...draft.bench, state.subPlayer],
    scheduledSubs: draft.scheduledSubs.filter((s) => s.id !== state.subId),
  };
}

// Collapse a half-time split, promoting the sub player to starter; old starter goes to bench.
export function keepSub(
  draft: PlanDraft,
  role: RoleName,
  game: AppState | undefined,
): PlanDraft {
  const state = classifyRoleSplit(draft, role, game);
  if (state.kind !== 'split') return draft;
  const nextStartingXI = { ...draft.startingXI };
  nextStartingXI[role] = state.subPlayer;
  // The original starter (if any) returns to the bench. A role with
  // no starter at the time of the split is unusual but possible
  // (imported drafts); we just don't push anything onto bench.
  // Same dedup defense as keepStarter — a starter who's somehow
  // already on the bench (legacy / imported draft) doesn't get
  // doubled.
  const starterAlreadyBench =
    state.starter !== undefined && draft.bench.includes(state.starter);
  const nextBench =
    state.starter && !starterAlreadyBench
      ? [...draft.bench, state.starter]
      : draft.bench;
  return {
    ...draft,
    startingXI: nextStartingXI,
    bench: nextBench,
    scheduledSubs: draft.scheduledSubs.filter((s) => s.id !== state.subId),
  };
}
