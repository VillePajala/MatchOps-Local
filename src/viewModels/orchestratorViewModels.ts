import type { ComponentProps } from 'react';
import type ControlBar from '@/components/ControlBar';
import type { FieldContainerProps, FieldInteractions } from '@/components/HomePage/containers/FieldContainer';
import type { UseFieldCoordinationReturn } from '@/components/HomePage/hooks/useFieldCoordination';
import type { UseTimerManagementReturn } from '@/components/HomePage/hooks/useTimerManagement';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import type { Player, Season, Tournament, Team } from '@/types';
import type { ReducerDrivenModals } from '@/types';
import { DEFAULT_GAME_ID } from '@/config/constants';

/**
 * View-Model Builders for useGameOrchestration
 *
 * Extracted from useGameOrchestration (Step 2.4) to reduce complexity.
 * These builders transform hook data into props objects for presentation components.
 */

function assertPresent<T>(value: T, name: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(`${name} is required`);
  }
}

/**
 * Input parameters for building FieldInteractions
 */
export interface BuildFieldInteractionsInput {
  fieldCoordination: UseFieldCoordinationReturn;
}

/**
 * Input parameters for building FieldContainerProps
 */
export interface BuildFieldContainerPropsInput {
  gameSessionState: GameSessionState;
  fieldCoordination: UseFieldCoordinationReturn;
  timerManagement: UseTimerManagementReturn;
  currentGameId: string | null;
  availablePlayers: Player[];
  teams: Team[];
  seasons: Season[];
  tournaments: Tournament[];
  showFirstGameGuide: boolean;
  hasCheckedFirstGameGuide: boolean;
  firstGameGuideStep: number;
  orphanedGameInfo: { teamId: string; teamName?: string } | null;
  initialLoadComplete: boolean;
  reducerDrivenModals: ReducerDrivenModals;
  setIsTeamManagerOpen: (open: boolean) => void;
  setFirstGameGuideStep: (step: number) => void;
  handleFirstGameGuideClose: () => void;
  setIsTeamReassignModalOpen: (open: boolean) => void;
  handleTeamNameChange: (name: string) => void;
  setOpponentName: (name: string) => void;
  fieldInteractions: FieldInteractions;
}

/**
 * Input parameters for building ControlBarProps
 */
export interface BuildControlBarPropsInput {
  timerManagement: UseTimerManagementReturn;
  fieldCoordination: UseFieldCoordinationReturn;
  tacticalHistory: { canUndo: boolean; canRedo: boolean };
  currentGameId: string | null;
  handleToggleLargeTimerOverlay: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleToggleTrainingResources: () => void;
  setIsGameStatsModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsLoadGameModalOpen: (open: boolean) => void;
  handleStartNewGame: () => void;
  openRosterModal: () => void;
  quickSave: () => void;
  setIsGameSettingsModalOpen: (open: boolean) => void;
  setIsSeasonTournamentModalOpen: (open: boolean) => void;
  setIsInstructionsModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsSettingsModalOpen: (open: boolean) => void;
  openPlayerAssessmentModal: () => void;
  setIsTeamManagerOpen: (open: boolean) => void;
  setIsPersonnelManagerOpen: (open: boolean) => void;
}

/**
 * Builds the FieldInteractions object from fieldCoordination hook
 *
 * @example
 * const interactions = buildFieldInteractions({ fieldCoordination });
 * // Pass to FieldContainer.interactions
 */
export function buildFieldInteractions(input: BuildFieldInteractionsInput): FieldInteractions {
  const { fieldCoordination }: { fieldCoordination: UseFieldCoordinationReturn } = input;
  assertPresent(fieldCoordination, 'fieldCoordination');

  return {
    players: {
      move: fieldCoordination.handlePlayerMove,
      moveEnd: fieldCoordination.handlePlayerMoveEnd,
      remove: fieldCoordination.handlePlayerRemove,
      drop: fieldCoordination.handleDropOnField,
    },
    opponents: {
      move: fieldCoordination.handleOpponentMove,
      moveEnd: fieldCoordination.handleOpponentMoveEnd,
      remove: fieldCoordination.handleOpponentRemove,
    },
    drawing: {
      start: fieldCoordination.handleDrawingStart,
      addPoint: fieldCoordination.handleDrawingAddPoint,
      end: fieldCoordination.handleDrawingEnd,
    },
    tactical: {
      drawingStart: fieldCoordination.handleTacticalDrawingStart,
      drawingAddPoint: fieldCoordination.handleTacticalDrawingAddPoint,
      drawingEnd: fieldCoordination.handleTacticalDrawingEnd,
      discMove: fieldCoordination.handleTacticalDiscMove,
      discRemove: fieldCoordination.handleTacticalDiscRemove,
      discToggleType: fieldCoordination.handleToggleTacticalDiscType,
      ballMove: fieldCoordination.handleTacticalBallMove,
    },
    touch: {
      playerDrop: fieldCoordination.handlePlayerDropViaTouch,
      playerDragCancel: fieldCoordination.handlePlayerDragCancelViaTouch,
    },
  };
}

/**
 * Builds FieldContainerProps from game state and hooks
 *
 * @example
 * const fieldContainerProps = buildFieldContainerProps({
 *   gameSessionState,
 *   fieldCoordination,
 *   timerManagement,
 *   currentGameId,
 *   availablePlayers,
 *   teams,
 *   seasons,
 *   tournaments,
 *   showFirstGameGuide,
 *   hasCheckedFirstGameGuide,
 *   firstGameGuideStep,
 *   orphanedGameInfo,
 *   initialLoadComplete,
 *   reducerDrivenModals,
 *   setIsTeamManagerOpen,
 *   setFirstGameGuideStep,
 *   handleFirstGameGuideClose,
 *   setIsTeamReassignModalOpen,
 *   handleTeamNameChange,
 *   setOpponentName,
 *   fieldInteractions,
 * });
 */
export function buildFieldContainerProps(input: BuildFieldContainerPropsInput): FieldContainerProps {
  const {
    gameSessionState,
    fieldCoordination,
    timerManagement,
    currentGameId,
    availablePlayers,
    teams,
    seasons,
    tournaments,
    showFirstGameGuide,
    hasCheckedFirstGameGuide,
    firstGameGuideStep,
    orphanedGameInfo,
    initialLoadComplete,
    reducerDrivenModals,
    setIsTeamManagerOpen,
    setFirstGameGuideStep,
    handleFirstGameGuideClose,
    setIsTeamReassignModalOpen,
    handleTeamNameChange,
    setOpponentName,
    fieldInteractions,
  }: {
    gameSessionState: GameSessionState;
    fieldCoordination: UseFieldCoordinationReturn;
    timerManagement: UseTimerManagementReturn;
    currentGameId: string | null;
    availablePlayers: Player[];
    teams: Team[];
    seasons: Season[];
    tournaments: Tournament[];
    showFirstGameGuide: boolean;
    hasCheckedFirstGameGuide: boolean;
    firstGameGuideStep: number;
    orphanedGameInfo: { teamId: string; teamName?: string } | null;
    initialLoadComplete: boolean;
    reducerDrivenModals: ReducerDrivenModals;
    setIsTeamManagerOpen: (open: boolean) => void;
    setFirstGameGuideStep: (step: number) => void;
    handleFirstGameGuideClose: () => void;
    setIsTeamReassignModalOpen: (open: boolean) => void;
    handleTeamNameChange: (name: string) => void;
    setOpponentName: (name: string) => void;
    fieldInteractions: FieldInteractions;
  } = input;

  assertPresent(fieldCoordination, 'fieldCoordination');
  assertPresent(timerManagement, 'timerManagement');

  return {
    gameSessionState,
    fieldVM: {
      playersOnField: fieldCoordination.playersOnField,
      opponents: fieldCoordination.opponents,
      drawings: fieldCoordination.drawings,
      isTacticsBoardView: fieldCoordination.isTacticsBoardView,
      tacticalDrawings: fieldCoordination.tacticalDrawings,
      tacticalDiscs: fieldCoordination.tacticalDiscs,
      tacticalBallPosition: fieldCoordination.tacticalBallPosition,
      draggingPlayerFromBarInfo: fieldCoordination.draggingPlayerFromBarInfo,
      isDrawingEnabled: fieldCoordination.isDrawingEnabled,
    },
    timerVM: {
      timeElapsedInSeconds: timerManagement.timeElapsedInSeconds,
      isTimerRunning: timerManagement.isTimerRunning,
      subAlertLevel: timerManagement.subAlertLevel,
      lastSubConfirmationTimeSeconds: timerManagement.lastSubConfirmationTimeSeconds,
      showLargeTimerOverlay: timerManagement.showLargeTimerOverlay,
      initialLoadComplete,
    },
    currentGameId,
    availablePlayers,
    teams,
    seasons,
    tournaments,
    showFirstGameGuide,
    hasCheckedFirstGameGuide,
    firstGameGuideStep,
    orphanedGameInfo,
    onOpenNewGameSetup: reducerDrivenModals.newGameSetup.open,
    onOpenRosterModal: reducerDrivenModals.roster.open,
    onOpenSeasonTournamentModal: reducerDrivenModals.seasonTournament.open,
    onOpenTeamManagerModal: () => setIsTeamManagerOpen(true),
    onGuideStepChange: setFirstGameGuideStep,
    onGuideClose: handleFirstGameGuideClose,
    onOpenTeamReassignModal: () => setIsTeamReassignModalOpen(true),
    onTeamNameChange: handleTeamNameChange,
    onOpponentNameChange: setOpponentName,
    interactions: fieldInteractions,
    timerInteractions: timerManagement.timerInteractions,
  };
}

/**
 * Builds ControlBarProps from hooks and handlers
 *
 * @example
 * const controlBarProps = buildControlBarProps({
 *   timerManagement,
 *   fieldCoordination,
 *   tacticalHistory,
 *   currentGameId,
 *   handleToggleLargeTimerOverlay,
 *   handleUndo,
 *   handleRedo,
 *   handleToggleTrainingResources,
 *   setIsGameStatsModalOpen,
 *   setIsLoadGameModalOpen,
 *   handleStartNewGame,
 *   openRosterModal,
 *   quickSave,
 *   setIsGameSettingsModalOpen,
 *   setIsSeasonTournamentModalOpen,
 *   setIsInstructionsModalOpen,
 *   setIsSettingsModalOpen,
 *   openPlayerAssessmentModal,
 *   setIsTeamManagerOpen,
 *   setIsPersonnelManagerOpen,
 * });
 */
export function buildControlBarProps(input: BuildControlBarPropsInput): ComponentProps<typeof ControlBar> {
  const {
    timerManagement,
    fieldCoordination,
    tacticalHistory,
    currentGameId,
    handleToggleLargeTimerOverlay,
    handleUndo,
    handleRedo,
    handleToggleTrainingResources,
    setIsGameStatsModalOpen,
    setIsLoadGameModalOpen,
    handleStartNewGame,
    openRosterModal,
    quickSave,
    setIsGameSettingsModalOpen,
    setIsSeasonTournamentModalOpen,
    setIsInstructionsModalOpen,
    setIsSettingsModalOpen,
    openPlayerAssessmentModal,
    setIsTeamManagerOpen,
    setIsPersonnelManagerOpen,
  }: {
    timerManagement: UseTimerManagementReturn;
    fieldCoordination: UseFieldCoordinationReturn;
    tacticalHistory: { canUndo: boolean; canRedo: boolean };
    currentGameId: string | null;
    handleToggleLargeTimerOverlay: () => void;
    handleUndo: () => void;
    handleRedo: () => void;
    handleToggleTrainingResources: () => void;
    setIsGameStatsModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    setIsLoadGameModalOpen: (open: boolean) => void;
    handleStartNewGame: () => void;
    openRosterModal: () => void;
    quickSave: () => void;
    setIsGameSettingsModalOpen: (open: boolean) => void;
    setIsSeasonTournamentModalOpen: (open: boolean) => void;
    setIsInstructionsModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    setIsSettingsModalOpen: (open: boolean) => void;
    openPlayerAssessmentModal: () => void;
    setIsTeamManagerOpen: (open: boolean) => void;
    setIsPersonnelManagerOpen: (open: boolean) => void;
  } = input;

  assertPresent(timerManagement, 'timerManagement');
  assertPresent(fieldCoordination, 'fieldCoordination');

  return {
    timeElapsedInSeconds: timerManagement.timeElapsedInSeconds,
    isTimerRunning: timerManagement.isTimerRunning,
    onToggleLargeTimerOverlay: handleToggleLargeTimerOverlay,
    onUndo: handleUndo,
    onRedo: handleRedo,
    canUndo: fieldCoordination.canUndoField,
    canRedo: fieldCoordination.canRedoField,
    onTacticalUndo: fieldCoordination.handleTacticalUndo,
    onTacticalRedo: fieldCoordination.handleTacticalRedo,
    canTacticalUndo: tacticalHistory.canUndo,
    canTacticalRedo: tacticalHistory.canRedo,
    onResetField: fieldCoordination.handleResetFieldClick,
    onClearDrawings: fieldCoordination.handleClearDrawingsForView,
    onAddOpponent: fieldCoordination.handleAddOpponent,
    onPlaceAllPlayers: fieldCoordination.handlePlaceAllPlayers,
    isTacticsBoardView: fieldCoordination.isTacticsBoardView,
    onToggleTacticsBoard: fieldCoordination.handleToggleTacticsBoard,
    onAddHomeDisc: () => fieldCoordination.handleAddTacticalDisc('home'),
    onAddOpponentDisc: () => fieldCoordination.handleAddTacticalDisc('opponent'),
    isDrawingEnabled: fieldCoordination.isDrawingEnabled,
    onToggleDrawingMode: fieldCoordination.handleToggleDrawingMode,
    onToggleTrainingResources: handleToggleTrainingResources,
    onToggleGameStatsModal: () => setIsGameStatsModalOpen(prev => !prev),
    onOpenLoadGameModal: () => setIsLoadGameModalOpen(true),
    onStartNewGame: handleStartNewGame,
    onOpenRosterModal: openRosterModal,
    onQuickSave: quickSave,
    onOpenGameSettingsModal: () => setIsGameSettingsModalOpen(true),
    isGameLoaded: Boolean(currentGameId && currentGameId !== DEFAULT_GAME_ID),
    onOpenSeasonTournamentModal: () => setIsSeasonTournamentModalOpen(true),
    onToggleInstructionsModal: () => setIsInstructionsModalOpen(prev => !prev),
    onOpenSettingsModal: () => setIsSettingsModalOpen(true),
    onOpenPlayerAssessmentModal: openPlayerAssessmentModal,
    onOpenTeamManagerModal: () => setIsTeamManagerOpen(true),
    onOpenPersonnelManager: () => setIsPersonnelManagerOpen(true),
  };
}
