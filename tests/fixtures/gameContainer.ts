/**
 * Test Fixtures for GameContainer
 *
 * Provides factory functions for creating GameContainerProps test data.
 * Reduces duplication across test files.
 */

import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import type { GameContainerProps } from '@/components/HomePage/containers/GameContainer';

/**
 * Create GameContainerProps for testing
 *
 * @param overrides - Partial props to override defaults
 * @returns Complete GameContainerProps object
 *
 * @example
 * ```typescript
 * const props = createGameContainerProps({
 *   playerBar: { players: [mockPlayer], selectedPlayerIdFromBar: null, gameEvents: [] },
 * });
 * ```
 */
export function createGameContainerProps(
  overrides?: Partial<GameContainerProps>
): GameContainerProps {
  return {
    playerBar: {
      players: [],
      selectedPlayerIdFromBar: null,
      gameEvents: [],
    },
    gameInfo: {
      teamName: initialGameSessionStatePlaceholder.teamName,
      opponentName: initialGameSessionStatePlaceholder.opponentName,
      homeScore: initialGameSessionStatePlaceholder.homeScore,
      awayScore: initialGameSessionStatePlaceholder.awayScore,
      homeOrAway: initialGameSessionStatePlaceholder.homeOrAway,
    },
    onPlayerDragStartFromBar: jest.fn(),
    onBarBackgroundClick: jest.fn(),
    onPlayerTapInBar: jest.fn(),
    onToggleGoalie: jest.fn(),
    onTeamNameChange: jest.fn(),
    onOpponentNameChange: jest.fn(),
    orphanedGameInfo: null,
    onOpenTeamReassignModal: jest.fn(),
    fieldProps: {
      gameSessionState: initialGameSessionStatePlaceholder,
      players: [],
      drawings: [],
      opponents: [],
      showPlayerNames: true,
      draggingPlayerFromBarInfo: null,
      isDrawingEnabled: false,
      showLargeTimerOverlay: false,
      onToggleLargeTimerOverlay: jest.fn(),
      onPlayerMove: jest.fn(),
      onPlayerMoveEnd: jest.fn(),
      onPlayerRemove: jest.fn(),
      onDropOnField: jest.fn(),
      onPlayerDropViaTouch: jest.fn(),
      onPlayerDragCancelViaTouch: jest.fn(),
      onUndo: jest.fn(),
      onRedo: jest.fn(),
      onTacticalUndo: jest.fn(),
      onTacticalRedo: jest.fn(),
      canTacticalUndo: false,
      canTacticalRedo: false,
      onResetField: jest.fn(),
      onClearDrawingsForView: jest.fn(),
      onPlaceAllPlayers: jest.fn(),
      onToggleGoalLogModal: jest.fn(),
      onLogOpponentGoal: jest.fn(),
      timerProps: {
        timeElapsedInSeconds: initialGameSessionStatePlaceholder.timeElapsedInSeconds ?? 0,
        isTimerRunning: initialGameSessionStatePlaceholder.isTimerRunning ?? false,
        subAlertLevel: initialGameSessionStatePlaceholder.subAlertLevel ?? 'none',
        lastSubConfirmationTimeSeconds: initialGameSessionStatePlaceholder.lastSubConfirmationTimeSeconds ?? 0,
        numberOfPeriods: initialGameSessionStatePlaceholder.numberOfPeriods ?? 2,
        periodDurationMinutes: initialGameSessionStatePlaceholder.periodDurationMinutes ?? 10,
        currentPeriod: initialGameSessionStatePlaceholder.currentPeriod ?? 1,
        gameStatus: initialGameSessionStatePlaceholder.gameStatus ?? 'notStarted',
      },
    } as unknown as GameContainerProps['fieldProps'],
    controlBarProps: {
      isGameLoaded: true,
      onToggleTrainingResources: jest.fn(),
      onToggleGameStatsModal: jest.fn(),
      onOpenLoadGameModal: jest.fn(),
      onStartNewGame: jest.fn(),
      onOpenRosterModal: jest.fn(),
      onQuickSaveGame: jest.fn(),
      onOpenGameSettingsModal: jest.fn(),
      onOpenSeasonTournamentModal: jest.fn(),
      onToggleInstructionsModal: jest.fn(),
      onOpenSettingsModal: jest.fn(),
      onOpenPlayerAssessmentModal: jest.fn(),
      onOpenPersonnelManager: jest.fn(),
      onToggleDrawingMode: jest.fn(),
      onOpenTeamManagerModal: jest.fn(),
      initialLoadComplete: true,
      showFirstGameGuide: false,
      hasCheckedFirstGameGuide: false,
      firstGameGuideStep: 0,
      setShowFirstGameGuide: jest.fn(),
      setFirstGameGuideStep: jest.fn(),
    } as unknown as GameContainerProps['controlBarProps'],
    ...overrides,
  };
}
