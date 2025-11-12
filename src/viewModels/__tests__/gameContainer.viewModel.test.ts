import { buildGameContainerViewModel } from '@/viewModels/gameContainer';
import type { BuildGameContainerVMInput } from '@/viewModels/gameContainer';

describe('buildGameContainerViewModel (2.4.0)', () => {
  it('maps core session fields to view-model groups', () => {
    const source: BuildGameContainerVMInput = {
      gameSessionState: {
        teamName: 'PePo Lila',
        opponentName: 'Ilves',
        homeScore: 3,
        awayScore: 1,
        homeOrAway: 'home',
        gameEvents: [
          { id: 'g1', type: 'goal', time: 120, scorerId: 'p1' },
          { id: 'g2', type: 'opponentGoal', time: 240 },
        ],
        timeElapsedInSeconds: 245,
        isTimerRunning: true,
        subAlertLevel: 'warning',
        lastSubConfirmationTimeSeconds: 180,
        numberOfPeriods: 2,
        periodDurationMinutes: 25,
        currentPeriod: 1,
        gameStatus: 'inProgress',
      },
      playersForCurrentGame: [
        { id: 'p1', name: 'Elias', isGoalie: false },
        { id: 'p2', name: 'Otto', isGoalie: true },
      ],
      draggingPlayerFromBarInfo: { id: 'p2', name: 'Otto', isGoalie: true },
    };

    const vm = buildGameContainerViewModel(source);

    // Player bar mapping
    expect(vm.playerBar.players.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(vm.playerBar.selectedPlayerIdFromBar).toBe('p2');
    expect(vm.playerBar.gameEvents).toHaveLength(2);

    // Game info mapping
    expect(vm.gameInfo).toEqual({
      teamName: 'PePo Lila',
      opponentName: 'Ilves',
      homeScore: 3,
      awayScore: 1,
      homeOrAway: 'home',
    });

    // Timer overlay mapping
    expect(vm.timer).toMatchObject({
      timeElapsedInSeconds: 245,
      isTimerRunning: true,
      subAlertLevel: 'warning',
      lastSubConfirmationTimeSeconds: 180,
      numberOfPeriods: 2,
      periodDurationMinutes: 25,
      currentPeriod: 1,
      gameStatus: 'inProgress',
    });
  });

  it('handles null draggingPlayerFromBarInfo', () => {
    const source: BuildGameContainerVMInput = {
      gameSessionState: {
        teamName: 'Team',
        opponentName: 'Opponent',
        homeScore: 0,
        awayScore: 0,
        homeOrAway: 'away',
        gameEvents: [],
        timeElapsedInSeconds: 0,
        isTimerRunning: false,
        subAlertLevel: 'none',
        lastSubConfirmationTimeSeconds: 0,
        numberOfPeriods: 2,
        periodDurationMinutes: 20,
        currentPeriod: 1,
        gameStatus: 'notStarted',
      },
      playersForCurrentGame: [],
      draggingPlayerFromBarInfo: null,
    };

    const vm = buildGameContainerViewModel(source);
    expect(vm.playerBar.selectedPlayerIdFromBar).toBeNull();
  });
});

