// Playing-Time Planner - Phase 3.2: re-apply an (edited) plan to a game already
// created from it. Pure guard + merge here; a thin dependency-injected handler
// wires it to storage. The heavy lifting (turning a planned game into a lineup)
// is reused from `buildPrefillFromPlan` - a re-apply is just: recompute the
// prefill against the *current* plan + planned game, overwrite ONLY the lineup
// fields, and preserve everything that is "what happened" (score, events, etc.).
import type { AppState } from '@/types';
import type { PlaytimePlan, PlanGame } from './types';
import type { PlannedGameSub } from './gameSubs';
import { buildPrefillFromPlan } from './prefill';

/** Why a re-apply could not proceed (drives the UI's disabled reason / toast). */
export type ReapplyBlockedReason =
  | 'no-link' // game was not created from a plan
  | 'plan-missing' // the source plan (or planned game) was deleted
  | 'played'; // game already started / has events - never clobber it

export interface ReapplyResult {
  ok: boolean;
  /** Set when `ok` is false. */
  reason?: ReapplyBlockedReason;
  /** Lineup-only patch to merge onto the game (set when `ok`). */
  patch?: Pick<AppState, 'playersOnField' | 'selectedPlayerIds' | 'formationSnapPoints'>;
  /** Planned sub schedule to store for the game (set when `ok`). */
  plannedSubs?: PlannedGameSub[];
  /** Planned players not in the game's roster (surfaced in the toast). */
  missingPlayerIds?: string[];
  /** Counts for the summary toast. */
  startersCount?: number;
  subsCount?: number;
}

/**
 * True when re-applying would clobber a game that has already been played.
 * The core safety rule: re-apply only touches games still in `notStarted` with
 * no recorded events.
 */
export function isGamePlayed(game: AppState): boolean {
  return game.gameStatus !== 'notStarted' || (game.gameEvents?.length ?? 0) > 0;
}

/**
 * Pure: recompute the lineup from the current plan and return a lineup-only patch,
 * or a blocked result. No IO. Uses the game's OWN roster (`availablePlayers`) so a
 * roster that drifted since creation stays valid and Rule 3 keeps holding
 * (playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers).
 */
export function buildReapplyPatch(
  game: AppState,
  plan: PlaytimePlan,
  planGame: PlanGame,
): ReapplyResult {
  if (isGamePlayed(game)) return { ok: false, reason: 'played' };

  const roster = game.availablePlayers ?? [];
  const prefill = buildPrefillFromPlan(plan, planGame, roster);

  // Same reconciliation as game creation (newGameHandlers): starters + parked subs
  // go on the field, filtered to the roster; everyone on the field stays selected.
  const availableIdSet = new Set(roster.map((p) => p.id));
  const mergedOnField = [...prefill.playersOnField, ...prefill.sidelinePlayers].filter((p) =>
    availableIdSet.has(p.id),
  );
  const selectedPlayerIds = [
    ...new Set([...prefill.selectedPlayerIds, ...mergedOnField.map((p) => p.id)]),
  ].filter((id) => availableIdSet.has(id));

  return {
    ok: true,
    patch: {
      playersOnField: mergedOnField,
      selectedPlayerIds,
      formationSnapPoints: prefill.formationSnapPoints,
    },
    plannedSubs: prefill.plannedSubs,
    missingPlayerIds: prefill.missingPlayerIds,
    startersCount: prefill.playersOnField.length,
    subsCount: prefill.sidelinePlayers.length,
  };
}

/** Storage seam - injected so the handler stays pure/testable. */
export interface ReapplyDeps {
  getPlan: (id: string) => Promise<PlaytimePlan | null>;
  saveGame: (id: string, game: AppState) => Promise<AppState | null>;
  setGameSubs: (gameId: string, subs: PlannedGameSub[]) => Promise<boolean>;
}

/**
 * Resolve the game's source plan, rebuild the lineup, and persist the lineup-only
 * patch + the planned sub schedule. Everything that is "what happened" (opponent,
 * date, score, events, assessments, notes, personnel, period config, isPlayed) is
 * preserved via the spread. Returns a result the UI can toast.
 */
export async function reapplyPlanToGame(
  deps: ReapplyDeps,
  gameId: string,
  game: AppState,
): Promise<ReapplyResult> {
  if (!game.sourcePlanId || !game.sourcePlanGameId) return { ok: false, reason: 'no-link' };

  const plan = await deps.getPlan(game.sourcePlanId);
  const planGame = plan?.games.find((g) => g.id === game.sourcePlanGameId);
  if (!plan || !planGame) return { ok: false, reason: 'plan-missing' };

  const result = buildReapplyPatch(game, plan, planGame);
  if (!result.ok || !result.patch) return result;

  const patched: AppState = { ...game, ...result.patch };
  await deps.saveGame(gameId, patched);
  await deps.setGameSubs(gameId, result.plannedSubs ?? []);
  return result;
}

/** Summary of a bulk re-apply across every game linked to one planned game. */
export interface BulkReapplyResult {
  /** Games linked to this planned game (before the played filter). */
  matched: number;
  /** Games actually re-saved. */
  updated: number;
  /** Linked games skipped because they had already been played. */
  skippedPlayed: number;
  /** Total planned player slots skipped across all updated games (roster drift). */
  missingTotal: number;
}

/** Storage seam for the bulk path - loads every saved game to find the linked ones. */
export interface BulkReapplyDeps {
  getAllGames: () => Promise<Record<string, AppState>>;
  saveGame: (id: string, game: AppState) => Promise<AppState | null>;
  setGameSubs: (gameId: string, subs: PlannedGameSub[]) => Promise<boolean>;
}

/**
 * Re-apply one planned game to EVERY (unplayed) real game created from it - the
 * injury case: edit the plan once, propagate to all games in one action. Played
 * games are skipped (never clobbered), not counted as failures. The plan + planned
 * game are passed in (the planner already has them), so no per-game plan lookup.
 */
export async function reapplyPlanToLinkedGames(
  deps: BulkReapplyDeps,
  plan: PlaytimePlan,
  planGameId: string,
): Promise<BulkReapplyResult> {
  const summary: BulkReapplyResult = { matched: 0, updated: 0, skippedPlayed: 0, missingTotal: 0 };
  const planGame = plan.games.find((g) => g.id === planGameId);
  if (!planGame) return summary;

  const all = await deps.getAllGames();
  for (const [gameId, game] of Object.entries(all)) {
    if (game.sourcePlanId !== plan.id || game.sourcePlanGameId !== planGameId) continue;
    summary.matched += 1;

    const result = buildReapplyPatch(game, plan, planGame);
    if (!result.ok || !result.patch) {
      if (result.reason === 'played') summary.skippedPlayed += 1;
      continue;
    }
    await deps.saveGame(gameId, { ...game, ...result.patch });
    await deps.setGameSubs(gameId, result.plannedSubs ?? []);
    summary.updated += 1;
    summary.missingTotal += result.missingPlayerIds?.length ?? 0;
  }
  return summary;
}

/**
 * Count unplayed real games linked to each planned game in a plan, keyed by
 * planned-game id. Drives the planner's "update N games" affordance. Played games
 * are excluded (they can't be re-applied).
 */
export function countReapplicableGames(
  games: Record<string, AppState>,
  planId: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const game of Object.values(games)) {
    if (game.sourcePlanId !== planId || !game.sourcePlanGameId) continue;
    if (isGamePlayed(game)) continue;
    counts[game.sourcePlanGameId] = (counts[game.sourcePlanGameId] ?? 0) + 1;
  }
  return counts;
}
