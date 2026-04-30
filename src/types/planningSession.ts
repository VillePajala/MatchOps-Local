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
   * When true, scheduled subs from this session's drafts fire as live
   * banners during play. At most one active session per (team, gameIds-set).
   */
  isActive: boolean;
  /** ISO timestamp of the most recent Apply, or undefined if never applied. */
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}
