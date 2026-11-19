/**
 * The "next game + its one-game plan" pair (Onboarding v3, step 4-5).
 *
 * After the setup wizard the coach names the next game ("Milloin seuraava
 * peli?"); only then is a real game created, together with a one-game
 * playing-time plan built by the planner's existing suggestion. The game is
 * linked to the plan (plan link + planned-sub schedule) exactly like a game a
 * coach creates from the planner by hand, so every existing re-apply path keeps
 * working on it.
 *
 * Nothing here is UI: storage and game creation are injected, so the order of
 * operations and the rollback on failure are unit-tested without a DataStore.
 * The planner's own utils are reused unchanged - this module composes them.
 */

import type { AppState, GameType, Player } from '@/types';
import type { StartNewGameRequest } from '@/components/HomePage/utils/newGameHandlers';
import { getDefaultPresetIdForSize, type FieldSize } from '@/config/formationPresets';
import { createPlan } from '@/utils/playtimePlanner/storage';
import { suggestFairShareLineup } from '@/utils/playtimePlanner/suggest';
import { buildPrefillFromPlan } from '@/utils/playtimePlanner/prefill';
import { reapplyPlanToGame, type ReapplyBlockedReason } from '@/utils/playtimePlanner/reapply';
import type { PlanLink } from '@/utils/playtimePlanner/planLinks';
import type { PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import { gameTotalSeconds, type PlanGame, type PlaytimePlan } from '@/utils/playtimePlanner/types';
import logger from '@/utils/logger';

/** What the wizard knows when the coach taps "Tee suunnitelma". */
export interface NextGamePairInput {
  team: { id: string; name: string };
  /** The squad, in the order the coach entered it. */
  players: Player[];
  fieldSize: FieldSize;
  gameType: GameType;
  /** '' when the coach did not give one. */
  ageGroup: string;
  numberOfPeriods: 1 | 2;
  periodMinutes: number;
  /** YYYY-MM-DD */
  gameDate: string;
  /** Already resolved - never empty (validateGame requires it). */
  opponentName: string;
}

export interface NextGamePair {
  gameId: string;
  planId: string;
  planGameId: string;
}

export interface CreateNextGamePairDeps {
  savePlan: (plan: PlaytimePlan) => Promise<PlaytimePlan | null>;
  deletePlan: (id: string) => Promise<boolean>;
  /** Persists the game (and its plan link + planned subs); null = failed/blocked. */
  createGame: (request: StartNewGameRequest) => Promise<{ gameId: string } | null>;
}

/** Build the one-game plan in memory and fill it with the planner's suggestion. */
export function buildFirstPlan(input: NextGamePairInput): PlaytimePlan {
  const plan = createPlan({
    name: `${input.team.name} – ${input.opponentName}`,
    players: input.players.map((p) => ({ id: p.id, name: p.name })),
    gameCount: 1,
    formationId: getDefaultPresetIdForSize(input.fieldSize),
    numberOfPeriods: input.numberOfPeriods,
    periodMinutes: input.periodMinutes,
    teamId: input.team.id,
    gameLabel: () => input.opponentName,
  });
  return suggestFairShareLineup(plan);
}

/** The new-game request for the planned game (unplayed, no competition). */
export function buildNextGameRequest(
  input: NextGamePairInput,
  plan: PlaytimePlan,
): StartNewGameRequest {
  const planGame = plan.games[0];
  const prefill = buildPrefillFromPlan(plan, planGame, input.players);
  return {
    initialSelectedPlayerIds: prefill.selectedPlayerIds,
    homeTeamName: input.team.name,
    opponentName: input.opponentName,
    gameDate: input.gameDate,
    gameLocation: '',
    fieldNumber: '',
    gameTime: '',
    seasonId: null,
    tournamentId: null,
    numPeriods: input.numberOfPeriods,
    periodDuration: input.periodMinutes,
    homeOrAway: 'home',
    demandFactor: 1,
    ageGroup: input.ageGroup,
    tournamentLevel: '',
    tournamentSeriesId: null,
    // A game that has not been played yet ("Ei vielä pelattu").
    isPlayed: false,
    isFriendly: false,
    teamId: input.team.id,
    availablePlayersForGame: input.players,
    selectedPersonnelIds: [],
    leagueId: '',
    customLeagueName: '',
    gameType: input.gameType,
    gender: undefined,
    formationPresetId: planGame.formationId,
    prefill: {
      // Same merge as NewGameSetupModal: starters + the parked incoming subs.
      playersOnField: [...prefill.playersOnField, ...prefill.sidelinePlayers],
      plannedSubs: prefill.plannedSubs,
      formationSnapPoints: prefill.formationSnapPoints,
      sourcePlanId: plan.id,
      sourcePlanGameId: planGame.id,
    },
  };
}

/**
 * Create the plan, then the game from it. If the game cannot be created the
 * plan is removed again, so a failure never leaves a plan without its game.
 * Throws on failure (the caller shows the message and lets the coach retry).
 */
export async function createNextGamePair(
  deps: CreateNextGamePairDeps,
  input: NextGamePairInput,
): Promise<NextGamePair> {
  if (input.players.length === 0) throw new Error('createNextGamePair: no players');
  const plan = buildFirstPlan(input);
  const saved = await deps.savePlan(plan);
  if (!saved) throw new Error('createNextGamePair: plan save failed');

  let created: { gameId: string } | null = null;
  try {
    created = await deps.createGame(buildNextGameRequest(input, saved));
  } catch (error) {
    logger.error('[nextGamePair] game creation threw:', error);
  }
  if (!created) {
    await deps.deletePlan(saved.id).catch((err) => {
      logger.warn('[nextGamePair] plan rollback failed:', err);
      return false;
    });
    throw new Error('createNextGamePair: game creation failed');
  }
  return { gameId: created.gameId, planId: saved.id, planGameId: saved.games[0].id };
}

// ── Edits from the compact plan screen ──────────────────────────────────────

/** Fisher-Yates on a copy, with an injectable random source (tests). */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * "Sekoita uudelleen": a new suggestion from a shuffled roster order (the
 * suggester breaks ties by roster order, and in a first game every player is
 * tied). The plan's own roster order is kept - only the lineup changes.
 */
export function reshufflePlan(plan: PlaytimePlan, random: () => number = Math.random): PlaytimePlan {
  const order = shuffled(plan.players, random);
  const suggested = suggestFairShareLineup({ ...plan, players: order });
  return { ...suggested, players: plan.players };
}

/**
 * Change the planned game's length without throwing the lineup away: periods
 * and minutes change, and every planned change keeps its relative moment
 * (a half-time change stays at half time). With no previous length to scale
 * from, a fresh suggestion is made instead.
 */
export function changePlanGameLength(
  plan: PlaytimePlan,
  planGameId: string,
  numberOfPeriods: 1 | 2,
  periodMinutes: number,
): PlaytimePlan {
  const minutes = Math.max(1, Math.round(periodMinutes));
  let needsSuggest = false;
  const games = plan.games.map((g): PlanGame => {
    if (g.id !== planGameId) return g;
    const oldTotal = gameTotalSeconds(g);
    const next: PlanGame = { ...g, numberOfPeriods, periodMinutes: minutes };
    const newTotal = gameTotalSeconds(next);
    if (oldTotal <= 0) {
      needsSuggest = true;
      return next;
    }
    return {
      ...next,
      subs: g.subs.map((s) => ({
        ...s,
        timeSeconds: Math.min(newTotal - 1, Math.max(1, Math.round((s.timeSeconds * newTotal) / oldTotal))),
      })),
    };
  });
  const updated = { ...plan, games };
  return needsSuggest ? suggestFairShareLineup(updated) : updated;
}

export interface SyncPairedGameDeps {
  savePlan: (plan: PlaytimePlan) => Promise<PlaytimePlan | null>;
  getGame: (gameId: string) => Promise<AppState | null>;
  saveGame: (gameId: string, game: AppState) => Promise<AppState>;
  getPlanLink: (gameId: string) => Promise<PlanLink | null>;
  getMasterRoster: () => Promise<Player[]>;
  setGameSubs: (gameId: string, subs: PlannedGameSub[]) => Promise<boolean>;
}

export interface SyncPairedGameResult {
  /** The lineup was re-applied to the game. */
  applied: boolean;
  reason?: ReapplyBlockedReason;
}

/**
 * Save the edited plan and bring its game in line: the game-level fields in
 * `gamePatch` (date, length) are written, and the plan's lineup + planned subs
 * are re-applied while the game is still unplayed (the planner's own re-apply,
 * which never touches a started game). Throws when a write fails.
 */
export async function syncPairedGame(
  deps: SyncPairedGameDeps,
  plan: PlaytimePlan,
  gameId: string,
  gamePatch?: Partial<Pick<AppState, 'gameDate' | 'numberOfPeriods' | 'periodDurationMinutes'>>,
): Promise<SyncPairedGameResult> {
  const saved = await deps.savePlan(plan);
  if (!saved) throw new Error('syncPairedGame: plan save failed');
  const stored = await deps.getGame(gameId);
  if (!stored) throw new Error('syncPairedGame: game missing');
  const game: AppState = gamePatch ? { ...stored, ...gamePatch } : stored;

  const result = await reapplyPlanToGame(
    {
      // The plan just saved IS the plan - no second read that could race the write.
      getPlan: async (id) => (id === saved.id ? saved : null),
      getPlanLink: deps.getPlanLink,
      getMasterRoster: deps.getMasterRoster,
      saveGame: deps.saveGame,
      setGameSubs: deps.setGameSubs,
    },
    gameId,
    game,
  );
  if (result.ok) return { applied: true };
  // Not re-applicable (e.g. the match already started): the game-level change
  // still lands, the lineup on the game is left as it is.
  if (gamePatch) await deps.saveGame(gameId, game);
  return { applied: false, reason: result.reason };
}
