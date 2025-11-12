import type { BuildGameContainerVMInput } from '@/viewModels/gameContainer';

export const sampleGameContainerVMInput: BuildGameContainerVMInput = {
  gameSessionState: {
    teamName: 'PePo Lila',
    opponentName: 'Ilves',
    homeScore: 2,
    awayScore: 1,
    homeOrAway: 'home',
    gameEvents: [
      { id: 'g1', type: 'goal', time: 60, scorerId: 'p1' },
      { id: 'g2', type: 'goal', time: 120, scorerId: 'p2', assisterId: 'p1' },
    ],
    timeElapsedInSeconds: 135,
    isTimerRunning: true,
    subAlertLevel: 'warning',
    lastSubConfirmationTimeSeconds: 90,
    numberOfPeriods: 2,
    periodDurationMinutes: 25,
    currentPeriod: 1,
    gameStatus: 'inProgress',
  },
  playersForCurrentGame: [
    { id: 'p1', name: 'Elias' },
    { id: 'p2', name: 'Otto', isGoalie: true },
  ],
  draggingPlayerFromBarInfo: { id: 'p2', name: 'Otto', isGoalie: true },
};

export const invalidGameContainerVMInput = {
  gameSessionState: {
    // missing required string fields or wrong types will make it invalid
    teamName: 123,
    opponentName: null,
  },
  playersForCurrentGame: 'not-an-array',
} as unknown;

