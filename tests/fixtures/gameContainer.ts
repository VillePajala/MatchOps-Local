/**
 * Test Fixtures for GameContainer
 *
 * Provides factory functions for creating GameContainerProps test data.
 * Reduces duplication across test files.
 */

import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import type { GameContainerProps } from '@/components/HomePage/containers/GameContainer';
import type { GameContainerViewModel } from '@/viewModels/gameContainer';

/**
 * Create GameContainerProps for testing
 *
 * @param overrides - Partial props to override defaults
 * @returns Complete GameContainerProps object
 *
 * @example
 * ```typescript
 * const props = createGameContainerProps({
 *   currentGameId: 'custom_game_id',
 *   isDrawingEnabled: true,
 * });
 * ```
 */
export function createGameContainerProps(
  overrides?: Partial<GameContainerProps>
): GameContainerProps {
  const defaultViewModel: GameContainerViewModel = {
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
    timer: {
      timeElapsedInSeconds: initialGameSessionStatePlaceholder.timeElapsedInSeconds ?? 0,
      isTimerRunning: initialGameSessionStatePlaceholder.isTimerRunning ?? false,
      subAlertLevel: initialGameSessionStatePlaceholder.subAlertLevel ?? 'none',
      lastSubConfirmationTimeSeconds: initialGameSessionStatePlaceholder.lastSubConfirmationTimeSeconds ?? 0,
      numberOfPeriods: initialGameSessionStatePlaceholder.numberOfPeriods ?? 2,
      periodDurationMinutes: initialGameSessionStatePlaceholder.periodDurationMinutes ?? 10,
      currentPeriod: initialGameSessionStatePlaceholder.currentPeriod ?? 1,
      gameStatus: initialGameSessionStatePlaceholder.gameStatus ?? 'notStarted',
    },
  };

  return {
    viewModel: defaultViewModel,
    gameSessionState: initialGameSessionStatePlaceholder,
    currentGameId: 'game_123',
    draggingPlayerFromBarInfo: null,
    isDrawingEnabled: false,
    showLargeTimerOverlay: false,
    initialLoadComplete: true,
    orphanedGameInfo: null,
    showFirstGameGuide: false,
    hasCheckedFirstGameGuide: false,
    firstGameGuideStep: 0,
    // Handlers
    handlePlayerDragStartFromBar: jest.fn(),
    handleDeselectPlayer: jest.fn(),
    handlePlayerTapInBar: jest.fn(),
    handleToggleGoalieForModal: jest.fn(),
    handleTeamNameChange: jest.fn(),
    handleOpponentNameChange: jest.fn(),
    setIsTeamReassignModalOpen: jest.fn(),
    handleToggleLargeTimerOverlay: jest.fn(),
    handleToggleGoalLogModal: jest.fn(),
    handleLogOpponentGoal: jest.fn(),
    handlePlayerMove: jest.fn(),
    handlePlayerMoveEnd: jest.fn(),
    handlePlayerRemove: jest.fn(),
    handleDropOnField: jest.fn(),
    handlePlayerDropViaTouch: jest.fn(),
    handlePlayerDragCancelViaTouch: jest.fn(),
    setIsRosterModalOpen: jest.fn(),
    setIsNewGameSetupModalOpen: jest.fn(),
    handleOpenTeamManagerModal: jest.fn(),
    setIsSeasonTournamentModalOpen: jest.fn(),
    setShowFirstGameGuide: jest.fn(),
    setFirstGameGuideStep: jest.fn(),
    handleUndo: jest.fn(),
    handleRedo: jest.fn(),
    handleTacticalUndo: jest.fn(),
    handleTacticalRedo: jest.fn(),
    canTacticalUndo: false,
    canTacticalRedo: false,
    handleResetField: jest.fn(),
    handleClearDrawingsForView: jest.fn(),
    handlePlaceAllPlayers: jest.fn(),
    handleToggleTrainingResources: jest.fn(),
    handleToggleGameStatsModal: jest.fn(),
    handleOpenLoadGameModal: jest.fn(),
    handleStartNewGame: jest.fn(),
    openRosterModal: jest.fn(),
    handleQuickSaveGame: jest.fn(),
    handleOpenGameSettingsModal: jest.fn(),
    handleOpenSeasonTournamentModal: jest.fn(),
    handleToggleInstructionsModal: jest.fn(),
    handleOpenSettingsModal: jest.fn(),
    openPlayerAssessmentModal: jest.fn(),
    handleOpenPersonnelManager: jest.fn(),
    handleToggleDrawingMode: jest.fn(),
    ...overrides,
  };
}
