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

