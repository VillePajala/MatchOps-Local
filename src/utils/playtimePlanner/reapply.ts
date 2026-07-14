// Playing-Time Planner - Phase 3.2: re-apply an (edited) plan to a game already
// created from it. Pure guard + merge here; a thin dependency-injected handler
// wires it to storage. The heavy lifting (turning a planned game into a lineup)
// is reused from `buildPrefillFromPlan` - a re-apply is just: recompute the
// prefill against the *current* plan + planned game, overwrite ONLY the lineup
// fields, and preserve everything that is "what happened" (score, events, etc.).
import type { AppState } from '@/types';
import type { PlaytimePlan, PlanGame } from './types';
import type { PlannedGameSub } from './gameSubs';
import type { PlanLink, PlanLinksCollection } from './planLinks';
import { buildPrefillFromPlan } from './prefill';
import logger from '@/utils/logger';

/** Why a re-apply could not proceed (drives the UI's disabled reason / toast). */
export type ReapplyBlockedReason =
  | 'no-link' // game was not created from a plan
  | 'plan-missing' // the source plan (or planned game) was deleted
  | 'played' // game already started / has events - never clobber it
  | 'empty-roster'; // game has no roster - re-applying would wipe the lineup to empty

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
  /** Display names for missingPlayerIds (from the plan roster; id as fallback). */
  missingNames?: string[];
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
  // Defensive: an empty roster would resolve zero starters and silently wipe the
  // on-field lineup to a blank field. Shouldn't happen for a plan-linked game,
  // but block explicitly rather than "succeed" into an empty lineup.
  if (roster.length === 0) return { ok: false, reason: 'empty-roster' };
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

  const planNameById = new Map(plan.players.map((p) => [p.id, p.name]));
  return {
    ok: true,
    patch: {
      playersOnField: mergedOnField,
      selectedPlayerIds,
      formationSnapPoints: prefill.formationSnapPoints,
    },
    plannedSubs: prefill.plannedSubs,
    missingPlayerIds: prefill.missingPlayerIds,
    // Names, not counts: "skipped: Eino" tells the coach exactly whose roster
    // membership to fix; a bare number sends them hunting.
    missingNames: prefill.missingPlayerIds.map((id) => planNameById.get(id) ?? id),
  };
}

/** Storage seam - injected so the handler stays pure/testable. */
export interface ReapplyDeps {
  getPlan: (id: string) => Promise<PlaytimePlan | null>;
  getPlanLink: (gameId: string) => Promise<PlanLink | null>;
  saveGame: (id: string, game: AppState) => Promise<AppState>;
  setGameSubs: (gameId: string, subs: PlannedGameSub[]) => Promise<boolean>;
}

/**
 * Resolve the game's source plan (via the local plan-link store), rebuild the
 * lineup, and persist the lineup-only patch + the planned sub schedule. Everything
 * that is "what happened" (opponent, date, score, events, assessments, notes,
 * personnel, period config, isPlayed) is preserved via the spread. Returns a
 * result the UI can toast.
 */
export async function reapplyPlanToGame(
  deps: ReapplyDeps,
  gameId: string,
  game: AppState,
): Promise<ReapplyResult> {
  const link = await deps.getPlanLink(gameId);
  if (!link) return { ok: false, reason: 'no-link' };

  const plan = await deps.getPlan(link.planId);
  const planGame = plan?.games.find((g) => g.id === link.planGameId);
  if (!plan || !planGame) return { ok: false, reason: 'plan-missing' };

  const result = buildReapplyPatch(game, plan, planGame);
  if (!result.ok || !result.patch) return result;

  const patched: AppState = { ...game, ...result.patch };
  await deps.saveGame(gameId, patched);
  // setGameSubs reports failure via `false` (it catches internally, never throws).
  // A stale sub schedule under a new lineup must not read as success. The lineup
  // write has already landed, so revert it (best-effort) to keep storage
  // internally consistent, then throw so the caller's error path runs; a retry
  // re-applies cleanly.
  if (!(await deps.setGameSubs(gameId, result.plannedSubs ?? []))) {
    try {
      await deps.saveGame(gameId, game);
    } catch (revertError) {
      logger.error('[playtimePlanner] Lineup revert after subs-write failure also failed:', revertError);
    }
    throw new Error('Planned-subs write failed after lineup save');
  }
  return result;
}

/** Summary of a bulk re-apply across every game linked to one planned game. */
export interface BulkReapplyResult {
  /** Games linked to this planned game (before the played filter). */
  matched: number;
  /** Games actually re-saved. */
  updated: number;
  /** Ids of the re-saved games (lets the caller refresh live state if one is open). */
  updatedIds: string[];
  /** Linked games skipped because they had already been played. */
  skippedPlayed: number;
  /** Linked games skipped because their roster is empty (nothing to apply). */
  skippedNoRoster: number;
  /** Linked games whose write failed (storage error) - surfaced, never silent. */
  failed: number;
  /** Total planned player slots skipped across all updated games (roster drift). */
  missingTotal: number;
  /** Unique display names of the skipped planned players (for the toast). */
  missingNames: string[];
}

/** Storage seam for the bulk path - loads every saved game to find the linked ones. */
export interface BulkReapplyDeps {
  getAllGames: () => Promise<Record<string, AppState>>;
  getAllPlanLinks: () => Promise<PlanLinksCollection>;
  saveGame: (id: string, game: AppState) => Promise<AppState>;
  setGameSubs: (gameId: string, subs: PlannedGameSub[]) => Promise<boolean>;
}

/**
 * Re-apply one planned game to EVERY (unplayed) real game created from it - the
 * injury case: edit the plan once, propagate to all games in one action. Linked
 * games are found via the local plan-link store. Played games are skipped (never
 * clobbered), not counted as failures. The plan + planned game are passed in (the
 * planner already has them), so no per-game plan lookup.
 */
export async function reapplyPlanToLinkedGames(
  deps: BulkReapplyDeps,
  plan: PlaytimePlan,
  planGameId: string,
): Promise<BulkReapplyResult> {
  const summary: BulkReapplyResult = {
    matched: 0,
    updated: 0,
    updatedIds: [],
    skippedPlayed: 0,
    skippedNoRoster: 0,
    failed: 0,
    missingTotal: 0,
    missingNames: [],
  };
  const missingNameSet = new Set<string>();
  const planGame = plan.games.find((g) => g.id === planGameId);
  if (!planGame) return summary;

  const [all, links] = await Promise.all([deps.getAllGames(), deps.getAllPlanLinks()]);
  for (const [gameId, game] of Object.entries(all)) {
    const link = links[gameId];
    if (link?.planId !== plan.id || link.planGameId !== planGameId) continue;
    summary.matched += 1;

    const result = buildReapplyPatch(game, plan, planGame);
    if (!result.ok || !result.patch) {
      // Every matched-but-not-updated game lands in SOME counter, so
      // matched === updated + skippedPlayed + skippedNoRoster + failed holds
      // and the caller's toast never silently under-reports.
      if (result.reason === 'played') summary.skippedPlayed += 1;
      else summary.skippedNoRoster += 1;
      continue;
    }
    // Each game's write is isolated: one bad blob must not abort the batch (the
    // already-updated games would otherwise be unreported and the caller could
    // never refresh live state for them). Failures are counted, never silent.
    // setGameSubs reports failure via `false` - treat that as a failure too, and
    // revert the already-landed lineup write (best-effort) so the game's stored
    // lineup and sub schedule stay consistent with each other.
    try {
      await deps.saveGame(gameId, { ...game, ...result.patch });
      if (!(await deps.setGameSubs(gameId, result.plannedSubs ?? []))) {
        try {
          await deps.saveGame(gameId, game);
        } catch (revertError) {
          logger.error('[playtimePlanner] Lineup revert after subs-write failure also failed:', revertError);
        }
        throw new Error('Planned-subs write failed after lineup save');
      }
    } catch (error) {
      logger.error(`[playtimePlanner] Bulk re-apply failed for game "${gameId}":`, error);
      summary.failed += 1;
      continue;
    }
    summary.updated += 1;
    summary.updatedIds.push(gameId);
    summary.missingTotal += result.missingPlayerIds?.length ?? 0;
    for (const name of result.missingNames ?? []) missingNameSet.add(name);
  }
  summary.missingNames = [...missingNameSet];
  return summary;
}

/**
 * Count unplayed real games linked to each planned game in a plan, keyed by
 * planned-game id. Links come from the local plan-link store; the games map is
 * only consulted for the played check (a link whose game no longer exists counts
 * for nothing). Drives the planner's "update N games" affordance.
 */
export function countReapplicableGames(
  games: Record<string, AppState>,
  links: PlanLinksCollection,
  planId: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [gameId, link] of Object.entries(links)) {
    if (link.planId !== planId) continue;
    const game = games[gameId];
    if (!game || isGamePlayed(game)) continue;
    counts[link.planGameId] = (counts[link.planGameId] ?? 0) + 1;
  }
  return counts;
}
