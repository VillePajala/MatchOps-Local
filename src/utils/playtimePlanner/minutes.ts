/**
 * Playing-Time Planner — minutes engine (Phase 1, PR 1.1).
 *
 * Pure, UI-agnostic math for the tournament planner: given a plan (a roster and
 * a set of games, each with on-field slots and a substitution schedule), work
 * out how many seconds each player is planned to be on the pitch, what an equal
 * share would be, and how far each player sits above or below it. This is the
 * "red -> green" fairness read the coach balances against.
 *
 * Design notes:
 * - **Seconds are the canonical unit.** Callers convert their minute-based game
 *   lengths to `totalSeconds` before calling in; the engine never guesses.
 * - **Fairness = share of available field time**, not raw cumulative minutes: a
 *   player who is only available for some games is judged against the time that
 *   was actually on offer while they could play (games they are not in simply
 *   are not `included`, or they hold no slots there).
 * - **Nothing here mutates.** It reads a plan and returns a fresh summary, so it
 *   is safe to call on every edit to recolour the balance instantly.
 *
 * Mined from the standalone `matchops-planner` (segment walk + fair-share math);
 * rebuilt natively and typed. See `playing-time-fairness-and-planner.md`.
 */

/** A single on-field position within one game (e.g. a formation role). */
export interface PlannedSlot {
  /** Stable identifier for the slot, unique within its game. */
  slotId: string;
  /** Player in this slot at kickoff; `null` for an empty slot. */
  startPlayerId: string | null;
}

/** A planned substitution: at `timeSeconds`, `inPlayerId` takes over `slotId`. */
export interface PlannedSub {
  /** Slot the change happens in. Subs referencing an unknown slot are ignored. */
  slotId: string;
  /** Seconds from kickoff when the incoming player takes the slot. */
  timeSeconds: number;
  /** Player coming on; `null` empties the slot from this time. */
  inPlayerId: string | null;
}

/** One game in the plan. */
export interface PlannedGame {
  /** Players not attending this game - they earn no share from it. */
  absentIds?: string[];
  id: string;
  /** Full playing time in seconds (sum of all periods). */
  totalSeconds: number;
  /** On-field slots. Slot count is the number of players on the pitch. */
  slots: PlannedSlot[];
  /** Substitution schedule (order within a slot is resolved by time). */
  subs: PlannedSub[];
  /** Whether this game counts toward the tournament fair-share read. */
  included: boolean;
}

/** A whole plan: the roster and the games it is spread across. */
export interface PlannedPlan {
  games: PlannedGame[];
  /** Full roster under consideration. */
  playerIds: string[];
  /**
   * Number of players sharing the available field time (the fair-share
   * denominator). Defaults to `playerIds.length`.
   */
  rosterSize?: number;
}

/** A contiguous stretch during which one slot is held by one player (or none). */
export interface SlotSegment {
  slotId: string;
  startSeconds: number;
  endSeconds: number;
  /** Player holding the slot for this stretch; `null` when the slot is empty. */
  playerId: string | null;
}

/** Where a player sits relative to an equal share of the field time. */
export type FairnessBand = 'under' | 'fair' | 'over' | 'none';

export interface PlayerMinutes {
  playerId: string;
  /** Planned seconds on the field across all **included** games. */
  totalSeconds: number;
  /** Seconds per game, index-aligned to `plan.games` (all games, included or not). */
  perGameSeconds: number[];
  /** `totalSeconds / fairShareSeconds`; `null` when no field time is available. */
  ratio: number | null;
  /** `totalSeconds - fairShareSeconds` (positive = over share); `0` when ratio is null. */
  deviationSeconds: number;
  band: FairnessBand;
}

export interface PlanMinutes {
  /** One entry per roster player, in `plan.playerIds` order. */
  players: PlayerMinutes[];
  /** Equal share per player in seconds; `null` when nothing is available. */
  fairShareSeconds: number | null;
  /** Total field-seconds on offer across included games (Σ duration × slot count). */
  totalAvailableSeconds: number;
  /** How many games are `included`. */
  includedGameCount: number;
}

/**
 * Ratio band edges. A player within [LOWER, UPPER) of an equal share is "fair";
 * below is "under" (red), at/above is "over" (green/blue). Matches the
 * standalone's disc palette thresholds.
 */
export const FAIR_SHARE_LOWER = 0.85;
export const FAIR_SHARE_UPPER = 1.15;

/** Classify a fair-share ratio into a band. `null` ratio -> `'none'`. */
export function fairnessBand(ratio: number | null): FairnessBand {
  if (ratio === null) return 'none';
  if (ratio < FAIR_SHARE_LOWER) return 'under';
  if (ratio >= FAIR_SHARE_UPPER) return 'over';
  return 'fair';
}

/**
 * Walk one slot's substitution schedule into contiguous segments.
 *
 * The slot's `startPlayerId` holds it from kickoff; each sub (in time order)
 * hands it to the incoming player from that moment on. Sub times are clamped to
 * `[0, totalSeconds]`; a sub at or before the current segment start produces no
 * segment for the outgoing player (so a kickoff-time sub means the starter never
 * actually plays). An unknown `slotId` (no matching slot in the game) has no
 * on-field position and returns no segments - so its subs never grant playtime.
 */
export function computeSlotSegments(game: PlannedGame, slotId: string): SlotSegment[] {
  const slot = game.slots.find((s) => s.slotId === slotId);
  if (!slot) return [];

  const duration = Math.max(0, game.totalSeconds);
  const subs = game.subs
    .filter((s) => s.slotId === slotId)
    .slice()
    .sort((a, b) => a.timeSeconds - b.timeSeconds);

  const segments: SlotSegment[] = [];
  let curPlayer = slot.startPlayerId;
  let curStart = 0;

  for (const sub of subs) {
    const t = Math.max(curStart, Math.min(duration, sub.timeSeconds));
    if (t > curStart) {
      segments.push({ slotId, startSeconds: curStart, endSeconds: t, playerId: curPlayer });
    }
    curPlayer = sub.inPlayerId;
    curStart = t;
  }
  if (duration > curStart) {
    segments.push({ slotId, startSeconds: curStart, endSeconds: duration, playerId: curPlayer });
  }
  return segments;
}

/** Distinct slot ids in a game, so a malformed duplicate slot can't double-count. */
const uniqueSlotIds = (game: PlannedGame): Set<string> => new Set(game.slots.map((s) => s.slotId));

/** Seconds each player spends on the field in a single game. */
function gamePlayerSeconds(game: PlannedGame): Map<string, number> {
  const totals = new Map<string, number>();
  for (const slotId of uniqueSlotIds(game)) {
    for (const seg of computeSlotSegments(game, slotId)) {
      if (seg.playerId == null) continue;
      const dur = seg.endSeconds - seg.startSeconds;
      totals.set(seg.playerId, (totals.get(seg.playerId) ?? 0) + dur);
    }
  }
  return totals;
}

/** Convenience: seconds a single player is on the field in one game. */
export function playerSecondsInGame(game: PlannedGame, playerId: string): number {
  return gamePlayerSeconds(game).get(playerId) ?? 0;
}

/**
 * Compute the full fairness read for a plan: per-player planned minutes,
 * the equal share, and each player's deviation/band. Pure — no mutation.
 */
export function computePlanMinutes(plan: PlannedPlan): PlanMinutes {
  // Per-game player seconds, computed once per game (not per player).
  const perGameTotals = plan.games.map((g) => gamePlayerSeconds(g));

  let totalAvailableSeconds = 0;
  let includedGameCount = 0;
  plan.games.forEach((g) => {
    if (!g.included) return;
    // A game NOBODY attends grants no minutes to anyone - counting its
    // capacity would inflate the plan-wide share (the balance header) with
    // time that cannot be earned.
    const absent = new Set(g.absentIds ?? []);
    if (plan.playerIds.length > 0 && plan.playerIds.every((id) => absent.has(id))) return;
    includedGameCount += 1;
    const slotCount = uniqueSlotIds(g).size;
    totalAvailableSeconds += Math.max(0, g.totalSeconds) * slotCount;
  });

  // Fair share needs both available time and a real roster to divide by. A
  // non-positive roster (empty, or an explicit 0) means "no share yet" -> null,
  // rather than dividing by a phantom roster of 1.
  const rosterSize = plan.rosterSize ?? plan.playerIds.length;
  const fairShareSeconds =
    totalAvailableSeconds > 0 && rosterSize > 0 ? totalAvailableSeconds / rosterSize : null;

  // Per-player fair share honours ABSENCES: each included game's capacity is
  // split among the players actually attending it, and a player's share is the
  // sum over the games they attend. With no absences this reduces exactly to
  // the plan-wide share above (capacity_g / rosterSize summed).
  const attendingShare = new Map<string, number>();
  plan.games.forEach((g) => {
    if (!g.included) return;
    const absent = new Set(g.absentIds ?? []);
    const attending = plan.playerIds.filter((id) => !absent.has(id));
    if (attending.length === 0) return;
    // The per-game denominator honours an explicit rosterSize the same way the
    // plan-wide share does: absentees vacate their seat and the rest of the
    // (possibly notional) roster splits the capacity. When rosterSize equals
    // playerIds.length this is exactly attending.length.
    const absentCount = plan.playerIds.length - attending.length;
    const attendingCount = rosterSize - absentCount;
    if (attendingCount <= 0) return;
    const capacity = Math.max(0, g.totalSeconds) * uniqueSlotIds(g).size;
    const slice = capacity / attendingCount;
    attending.forEach((id) => attendingShare.set(id, (attendingShare.get(id) ?? 0) + slice));
  });
  const hasAbsences = plan.games.some((g) => g.included && (g.absentIds?.length ?? 0) > 0);

  const players: PlayerMinutes[] = plan.playerIds.map((playerId) => {
    const perGameSeconds = perGameTotals.map((totals) => totals.get(playerId) ?? 0);
    const totalSeconds = plan.games.reduce(
      (sum, g, i) => sum + (g.included ? perGameSeconds[i] : 0),
      0,
    );
    // Without absences keep the exact legacy math (identical result, zero
    // float drift for the tests); with absences use the per-player share.
    // A player absent from EVERY game has no share -> null ratio (neutral).
    const share = hasAbsences ? attendingShare.get(playerId) ?? 0 : fairShareSeconds ?? 0;
    const ratio = share > 0 ? totalSeconds / share : null;
    const deviationSeconds = share > 0 ? totalSeconds - share : 0;
    return { playerId, totalSeconds, perGameSeconds, ratio, deviationSeconds, band: fairnessBand(ratio) };
  });

  return { players, fairShareSeconds, totalAvailableSeconds, includedGameCount };
}
