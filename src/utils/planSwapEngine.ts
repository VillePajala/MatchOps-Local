/**
 * In-memory swap engine for the planner editor (PR 5b).
 *
 * Operates on a `PlanDraft` shape — the in-memory representation of a
 * single game's lineup before Apply. Pure: all operations return a new
 * draft, never mutate the input. Decisions deferred to PR 6 (timeline
 * editor): cross-half splits, merge-unwind, double-position checks.
 */

export type PlayerId = string;
export type RoleName = string;

/**
 * In-memory plan draft for one game.
 *
 * - `startingXI[roleName] = playerId` for assigned slots.
 *   Empty roles are absent from the map (not present with value `''`).
 * - `bench` = roster − values(startingXI), in stable order.
 */
export interface PlanDraft {
  startingXI: Record<RoleName, PlayerId>;
  bench: PlayerId[];
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
      return { startingXI: nextStartingXI, bench: nextBench };
    }

    // Field → bench
    const fieldPlayer = draft.startingXI[fieldRole];
    if (!fieldPlayer) return draft; // empty slot, nothing to bench

    const nextStartingXI = { ...draft.startingXI };
    delete nextStartingXI[fieldRole];
    return {
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
  return { startingXI: {}, bench: [...roster] };
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
