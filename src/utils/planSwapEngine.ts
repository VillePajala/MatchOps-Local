/**
 * In-memory swap engine for the planner editor.
 *
 * Operates on a `PlanDraft` — the in-memory representation of a single
 * game's lineup before Apply. Pure: all operations return a new draft,
 * never mutate the input. Cross-half splits, merge-unwind, and
 * double-position checks belong with the timeline editor and live in a
 * separate module when that lands.
 */

export type PlayerId = string;
export type RoleName = string;

/**
 * Draft-time scheduled substitution. Mirrors AppState's ScheduledSub
 * but omits two runtime fields:
 *
 * - `status`: drafts haven't been applied yet (set on Apply as
 *   `'pending'`).
 * - `outPlayer`: the player going off is whatever occupies the role
 *   immediately before this sub fires. Storing it on the draft makes
 *   it go stale every time the user edits the pitch — sub at LB
 *   originally said `outPlayer: 'p1'`, then the coach swapped p2 onto
 *   LB, and now the sub still pretends p1 is leaving. Computed
 *   lazily at display + Apply time via `getRoleSegments`.
 */
export interface DraftScheduledSub {
  id: string;
  /** Game-clock seconds at which the sub fires. Must be >= 0. */
  timeSeconds: number;
  inPlayer: PlayerId;
  /** Role/slot the sub affects. Must match a role name in the formation. */
  positionRole: RoleName;
}

/**
 * In-memory plan draft for one game.
 *
 * - `startingXI[roleName] = playerId` for assigned slots.
 *   Empty roles are absent from the map (not present with value `''`).
 * - `bench` = roster − values(startingXI), in stable order.
 * - `scheduledSubs` = pre-planned substitutions over the game timeline,
 *   sorted by `timeSeconds` ascending. Status is set on Apply.
 */
export interface PlanDraft {
  startingXI: Record<RoleName, PlayerId>;
  bench: PlayerId[];
  scheduledSubs: DraftScheduledSub[];
}

/**
 * Sentinel for the bench in swap operations. Pick a string value that
 * cannot collide with any role name in the formation registry (`__BENCH__`
 * matches the standalone planner's convention).
 */
export const BENCH = '__BENCH__' as const;

export type SwapTarget = RoleName | typeof BENCH;

export interface SwapInput {
  source: SwapTarget;
  target: SwapTarget;
  /**
   * When source/target is BENCH, identifies which bench player to move.
   * Required when the operation involves a bench player (otherwise the
   * engine wouldn't know which of N bench players is being acted on).
   *
   * Silently ignored on field-to-field ops (no bench involvement).
   * Callers wiring drag/drop handlers can pass it unconditionally without
   * branching on the swap kind.
   */
  benchPlayerId?: PlayerId;
}

/**
 * Performs a single swap on a draft and returns the new draft. Returns
 * the input unchanged for invalid operations:
 * - Source equals target (same role-to-same-role).
 * - Bench-to-bench (no field interaction).
 * - Bench operation without benchPlayerId.
 * - Bench operation with a benchPlayerId not in the bench.
 *
 * Field-to-field: swaps the two role assignments. If one role is empty,
 * the other player moves into that role and the original slot becomes
 * empty.
 *
 * Bench-to-field: bench player takes the role; any displaced field
 * player goes to the bench tail.
 *
 * Field-to-bench: field player goes to the bench tail; the role becomes
 * empty.
 */
export function performSwap(draft: PlanDraft, op: SwapInput): PlanDraft {
  const { source, target, benchPlayerId } = op;

  if (source === target) return draft;
  if (source === BENCH && target === BENCH) return draft;

  // Bench involvement
  if (source === BENCH || target === BENCH) {
    const fieldRole = (source === BENCH ? target : source) as RoleName;
    const isBenchToField = source === BENCH;

    if (isBenchToField) {
      if (!benchPlayerId) return draft;
      if (!draft.bench.includes(benchPlayerId)) return draft;

      const displaced = draft.startingXI[fieldRole];
      const nextStartingXI = {
        ...draft.startingXI,
        [fieldRole]: benchPlayerId,
      };
      const nextBench = draft.bench.filter((p) => p !== benchPlayerId);
      if (displaced) nextBench.push(displaced);
      return { ...draft, startingXI: nextStartingXI, bench: nextBench };
    }

    // Field → bench
    const fieldPlayer = draft.startingXI[fieldRole];
    if (!fieldPlayer) return draft; // empty slot, nothing to bench

    const nextStartingXI = { ...draft.startingXI };
    delete nextStartingXI[fieldRole];
    return {
      ...draft,
      startingXI: nextStartingXI,
      bench: [...draft.bench, fieldPlayer],
    };
  }

  // Field-to-field swap
  const srcPlayer = draft.startingXI[source];
  const tgtPlayer = draft.startingXI[target];
  if (!srcPlayer && !tgtPlayer) return draft;

  const nextStartingXI = { ...draft.startingXI };
  if (tgtPlayer) {
    nextStartingXI[source] = tgtPlayer;
  } else {
    delete nextStartingXI[source];
  }
  if (srcPlayer) {
    nextStartingXI[target] = srcPlayer;
  } else {
    delete nextStartingXI[target];
  }
  return { ...draft, startingXI: nextStartingXI };
}

/**
 * Build an empty draft from a roster and a role list. Every player goes
 * to the bench; startingXI is empty. Stable order: bench follows roster
 * order.
 */
export function createEmptyDraft(roster: readonly PlayerId[]): PlanDraft {
  return { startingXI: {}, bench: [...roster], scheduledSubs: [] };
}

/**
 * Roster invariant: every player in startingXI ∪ bench appears exactly
 * once. Returns the violations as { duplicates, missing } so the caller
 * can surface specific problems. Empty arrays = healthy.
 */
export function checkRosterIntegrity(
  draft: PlanDraft,
  roster: readonly PlayerId[],
): { duplicates: PlayerId[]; missing: PlayerId[]; orphans: PlayerId[] } {
  const onField = Object.values(draft.startingXI);
  const seen = new Map<PlayerId, number>();
  for (const p of [...onField, ...draft.bench]) {
    seen.set(p, (seen.get(p) ?? 0) + 1);
  }

  const rosterSet = new Set(roster);
  const duplicates: PlayerId[] = [];
  const orphans: PlayerId[] = []; // players in draft but not roster
  for (const [p, count] of seen) {
    if (count > 1) duplicates.push(p);
    if (!rosterSet.has(p)) orphans.push(p);
  }
  const missing = roster.filter((p) => !seen.has(p));
  return { duplicates, missing, orphans };
}
