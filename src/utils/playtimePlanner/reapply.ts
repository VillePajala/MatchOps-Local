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
