/**
 * GameContainer View-Model (Step 2.4.0)
 *
 * Pure types + adapter only. No runtime wiring yet.
 * The goal is to define a small, cohesive view-model that HomePage can
 * construct and pass to GameContainer in later microsteps.
 */

import type { Player } from '@/types';
import type { GameEvent } from '@/types';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';

// ——— View-Model Types ———

export interface PlayerBarViewModel {
  players: Player[];
  selectedPlayerIdFromBar: string | null;
  gameEvents: GameEvent[];
}

export interface GameInfoViewModel {
  teamName: string;
  opponentName: string;
  homeScore: number;
  awayScore: number;
  homeOrAway: GameSessionState['homeOrAway'];
}

export interface TimerOverlayViewModel {
  timeElapsedInSeconds: number;
  isTimerRunning: boolean;
  subAlertLevel: GameSessionState['subAlertLevel'];
  lastSubConfirmationTimeSeconds: number;
  numberOfPeriods: GameSessionState['numberOfPeriods'];
  periodDurationMinutes: number;
  currentPeriod: number;
  gameStatus: GameSessionState['gameStatus'];
}

export interface GameContainerViewModel {
  playerBar: PlayerBarViewModel;
  gameInfo: GameInfoViewModel;
  timer: TimerOverlayViewModel;
}

// ——— Adapter Input Type ———

/**
 * Minimal input to derive the view-model.
 * Intentionally does not depend on the entire UseGameOrchestrationReturn
 * so tests can pass lightweight fixtures.
 */
export interface BuildGameContainerVMInput {
  gameSessionState: Pick<
    GameSessionState,
    | 'teamName'
    | 'opponentName'
    | 'homeScore'
    | 'awayScore'
    | 'homeOrAway'
    | 'gameEvents'
    | 'timeElapsedInSeconds'
    | 'isTimerRunning'
    | 'subAlertLevel'
    | 'lastSubConfirmationTimeSeconds'
    | 'numberOfPeriods'
    | 'periodDurationMinutes'
    | 'currentPeriod'
    | 'gameStatus'
  >;
  playersForCurrentGame: Player[];
  draggingPlayerFromBarInfo?: Player | null;
}

// ——— Adapter ———

/**
 * Builds a view-model for GameContainer from HomePage state.
 *
 * @param input - Minimal required state from HomePage
 * @returns Grouped view-model with playerBar, gameInfo, and timer data
 *
 * @example
 * const vm = buildGameContainerViewModel({
 *   gameSessionState: currentGameState,
 *   playersForCurrentGame: rosterPlayers,
 *   draggingPlayerFromBarInfo: selectedPlayer
 * });
 */
export function buildGameContainerViewModel(
  input: BuildGameContainerVMInput
): GameContainerViewModel {
  const { gameSessionState, playersForCurrentGame, draggingPlayerFromBarInfo } = input;

  const playerBar: PlayerBarViewModel = {
    players: playersForCurrentGame,
    selectedPlayerIdFromBar: draggingPlayerFromBarInfo?.id ?? null,
    gameEvents: gameSessionState.gameEvents,
  };

  const gameInfo: GameInfoViewModel = {
    teamName: gameSessionState.teamName,
    opponentName: gameSessionState.opponentName,
    homeScore: gameSessionState.homeScore,
    awayScore: gameSessionState.awayScore,
    homeOrAway: gameSessionState.homeOrAway,
  };

  const timer: TimerOverlayViewModel = {
    timeElapsedInSeconds: gameSessionState.timeElapsedInSeconds,
    isTimerRunning: gameSessionState.isTimerRunning,
    subAlertLevel: gameSessionState.subAlertLevel,
    lastSubConfirmationTimeSeconds: gameSessionState.lastSubConfirmationTimeSeconds,
    numberOfPeriods: gameSessionState.numberOfPeriods,
    periodDurationMinutes: gameSessionState.periodDurationMinutes,
    currentPeriod: gameSessionState.currentPeriod,
    gameStatus: gameSessionState.gameStatus,
  };

  return { playerBar, gameInfo, timer };
}

/**
 * Runtime type guard for BuildGameContainerVMInput.
 * Lightweight validation to help callers before building the view-model.
 */
export function isValidGameContainerVMInput(
  input: unknown
): input is BuildGameContainerVMInput {
  if (!input || typeof input !== 'object') return false;
  const anyInput = input as Record<string, unknown>;

  const gss = anyInput.gameSessionState as Record<string, unknown> | undefined;
  const players = anyInput.playersForCurrentGame as unknown;

  if (!gss || typeof gss !== 'object') return false;
  if (!Array.isArray(players)) return false;

  // Check a minimal set of required fields and their types
  const requiredString = ['teamName', 'opponentName'] as const;
  for (const key of requiredString) {
    if (typeof gss[key] !== 'string') return false;
  }

  const requiredNumber = ['homeScore', 'awayScore', 'timeElapsedInSeconds', 'lastSubConfirmationTimeSeconds', 'periodDurationMinutes', 'currentPeriod'] as const;
  for (const key of requiredNumber) {
    if (typeof gss[key] !== 'number') return false;
  }

  if (gss['gameEvents'] && !Array.isArray(gss['gameEvents'])) return false;
  if (typeof gss['isTimerRunning'] !== 'boolean') return false;

  // Basic enum-ish checks (strings acceptable here)
  if (typeof gss['homeOrAway'] !== 'string') return false;
  if (typeof gss['gameStatus'] !== 'string') return false;
  if (typeof gss['subAlertLevel'] !== 'string') return false;

  return true;
}
