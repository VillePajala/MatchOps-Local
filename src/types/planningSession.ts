/**
 * Tournament-planner Phase 3 — `PlanningSession` entity.
 *
 * A persistent, coach-facing "plan" pointing at one or more games. Carries a
 * per-game draft snapshot so plans can be reopened, renamed, and versioned
 * (e.g., "Jasper-sick contingency" alongside the default plan) without
 * mutating the underlying Game records. Apply is the explicit action that
 * pushes a draft into Game.playersOnField / Game.scheduledSubs.
 *
 * @see docs/03-active-plans/tournament-planner-integration.md
 *      (section "PlanningSession — the coach-facing plan entity")
 */

import type { PlanDraft } from '@/utils/planSwapEngine';

/**
 * Persistent plan entity. Lives at the user/team scope.
 *
 * `draft` is keyed by gameId and snapshots — not a live reference back into
 * the games store. That snapshot semantics is what enables contingency
 * versions to coexist for the same game set.
 *
 * `isActive` is a soft constraint: at most one active session per (team,
 * gameIds-set) at any time. The constraint is enforced at the handler layer
 * (`setActiveSession`) rather than via a DB unique index because comparing
 * gameIds-sets requires sorted-array equality, not a single-column key.
 *
 * `appliedAt` is null until the first Apply; subsequent Applies update it.
 * After Apply, the plan and the game can drift — re-opening shows the
 * draft as it was, not the game's current state.
 */
export interface PlanningSession {
  id: string;
  teamId: string;
  name: string;
  /** Game.id values this plan covers. 1..N games, all sharing team/format/duration. */
  gameIds: string[];
  /**
   * Per-game draft snapshot, keyed by gameId. Each entry is a `PlanDraft`
   * (startingXI, bench, scheduledSubs).
   */
  draft: Record<string, PlanDraft>;
  /**
   * Marks this session as the team's "default" / current contingency for
   * the editor. At most one active session per (team, gameIds-set);
   * activating one deactivates the others atomically (RPC 033).
   *
   * Live banner behavior is **not** driven by this flag — banners fire
   * from `Game.scheduledSubs`, which is populated by the explicit Apply
   * action. Future enhancement: hook the active session into the live
   * timer so flipping contingencies changes runtime behavior without
   * re-Applying.
   */
  isActive: boolean;
  /** ISO timestamp of the most recent Apply, or undefined if never applied. */
  appliedAt?: string;
  /**
   * Per-game include-in-totals flags. Drives which games the minutes
   * dashboard aggregates over.
   *
   * - `undefined` (default for legacy sessions and brand-new sessions) is
   *   read as "all gameIds included" — the most-permissive interpretation.
   * - An array enumerates the included subset; gameIds not in the array
   *   are excluded from minutes/fairness calculations but still saved
   *   and applyable.
   *
   * Schema: nullable `text[]` column added in migration 037; absent on
   * cloud rows that predate 037.
   */
  includedGameIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Default include-resolution: NULL/undefined means "all gameIds".
 * Centralised so every aggregator agrees on the legacy semantic.
 */
export const resolveIncludedGameIds = (
  session: Pick<PlanningSession, 'gameIds' | 'includedGameIds'>,
): string[] => {
  if (session.includedGameIds === undefined) return [...session.gameIds];
  // Filter to gameIds actually on the session — guards against drift.
  const set = new Set(session.includedGameIds);
  return session.gameIds.filter((g) => set.has(g));
};
