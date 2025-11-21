import React from 'react';
import { useTranslation } from 'react-i18next';
import ErrorBoundary from '@/components/ErrorBoundary';
import TimerOverlay from '@/components/TimerOverlay';
import SoccerField from '@/components/SoccerField';
import { FirstGameGuide } from '@/components/HomePage/components/FirstGameGuide';
import { DEFAULT_GAME_ID } from '@/config/constants';
import type {
  Player,
  Team,
  Season,
  Tournament,
  TacticalDisc,
  Point,
  AppState
} from '@/types';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';

/**
 * Player drag/drop handlers for moving roster members on the field.
 */
export interface PlayerInteractions {
  move: (playerId: string, relX: number, relY: number) => void;
  moveEnd: () => void;
  remove: (playerId: string) => void;
  drop: (playerId: string, relX: number, relY: number) => void;
}

/**
 * Opponent drag/drop handlers used when editing opposition markers.
 */
export interface OpponentInteractions {
  move: (playerId: string, relX: number, relY: number) => void;
  moveEnd: () => void;
  remove: (playerId: string) => void;
}

/**
 * Freehand drawing handlers for tactical scribbles in classic field view.
 */
export interface DrawingInteractions {
  start: (point: Point) => void;
  addPoint: (point: Point) => void;
  end: () => void;
}

/**
 * Tactics board handlers for discs/ball drawing overlays.
 */
export interface TacticalInteractions {
  drawingStart: (point: Point) => void;
  drawingAddPoint: (point: Point) => void;
  drawingEnd: () => void;
  discMove: (discId: string, relX: number, relY: number) => void;
  discRemove: (discId: string) => void;
  discToggleType: (discId: string) => void;
  ballMove: (point: Point) => void;
}

/**
 * Touch-specific fallbacks for drag/drop gestures (mobile long-press placement).
 */
export interface TouchInteractions {
  playerDrop: (relX: number, relY: number) => void;
  playerDragCancel: () => void;
}

/**
 * Grouped interaction handlers consumed by SoccerField and Timer overlay.
 * Each sub-object focuses on a distinct responsibility to simplify memoization.
 */
export interface FieldInteractions {
  players: PlayerInteractions;
  opponents: OpponentInteractions;
  drawing: DrawingInteractions;
  tactical: TacticalInteractions;
  touch: TouchInteractions;
}

export interface TimerInteractions {
  toggleLargeOverlay: () => void;
  toggleGoalLogModal: () => void;
  logOpponentGoal: (timeInSeconds: number) => void;
  substitutionMade: () => void;
  setSubInterval: (minutes: number) => void;
  startPauseTimer: () => void;
  resetTimer: () => void;
}

export interface FieldContainerProps {
  // Optional grouped state to reduce prop count (2.4.4)
  fieldVM: {
    playersOnField: AppState['playersOnField'];
    opponents: AppState['opponents'];
    drawings: AppState['drawings'];
    isTacticsBoardView: boolean;
    tacticalDrawings: Point[][];
    tacticalDiscs: TacticalDisc[];
    tacticalBallPosition: Point | null;
    draggingPlayerFromBarInfo: Player | null;
    isDrawingEnabled: boolean;
  };
  timerVM: {
    timeElapsedInSeconds: number;
    isTimerRunning: boolean;
    subAlertLevel: GameSessionState['subAlertLevel'];
    lastSubConfirmationTimeSeconds: number;
    showLargeTimerOverlay: boolean;
    initialLoadComplete: boolean;
  };
  gameSessionState: GameSessionState;
  currentGameId: string | null;
  availablePlayers: Player[];
  teams: Team[];
  seasons: Season[];
  tournaments: Tournament[];
  showFirstGameGuide: boolean;
  hasCheckedFirstGameGuide: boolean;
  firstGameGuideStep: number;
  orphanedGameInfo: { teamId: string; teamName?: string } | null;
  onOpenNewGameSetup?: () => void;
  onOpenRosterModal?: () => void;
  onOpenSeasonTournamentModal?: () => void;
  onOpenTeamManagerModal: () => void;
  onGuideStepChange?: (step: number) => void;
  onGuideClose: () => void;
  onOpenTeamReassignModal?: () => void;
  onTeamNameChange: (name: string) => void;
  onOpponentNameChange: (name: string) => void;
  interactions: FieldInteractions;
  timerInteractions: TimerInteractions;
}

export function FieldContainer({
  fieldVM,
  timerVM,
  gameSessionState,
  currentGameId,
  availablePlayers,
  teams,
  seasons,
  tournaments,
  showFirstGameGuide,
  hasCheckedFirstGameGuide,
  firstGameGuideStep,
  orphanedGameInfo,
  onOpenNewGameSetup,
  onOpenRosterModal,
  onOpenSeasonTournamentModal,
  onOpenTeamManagerModal,
  onGuideStepChange,
  onGuideClose,
  onOpenTeamReassignModal,
  onTeamNameChange,
  onOpponentNameChange,
  interactions,
  timerInteractions,
}: FieldContainerProps) {
  const { t } = useTranslation();

  const { players, opponents, drawing, tactical, touch } = interactions;

  const {
    toggleLargeOverlay,
    toggleGoalLogModal,
    logOpponentGoal,
    substitutionMade,
    setSubInterval,
    startPauseTimer,
    resetTimer,
  } = timerInteractions;

  const handleGuideStepChange = (step: number) => {
    onGuideStepChange?.(step);
  };

  // Consolidated locals (prefer VMs when provided)
  const fcPlayersOnField = fieldVM.playersOnField;
  const fcOpponents = fieldVM.opponents;
  const fcDrawings = fieldVM.drawings;
  const fcIsTactics = fieldVM.isTacticsBoardView;
  const fcTacticalDrawings = fieldVM.tacticalDrawings;
  const fcTacticalDiscs = fieldVM.tacticalDiscs;
  const fcTacticalBall = fieldVM.tacticalBallPosition ?? { relX: 0.5, relY: 0.5 };
  const fcDraggingFromBar = fieldVM.draggingPlayerFromBarInfo;
  const fcIsDrawingEnabled = fieldVM.isDrawingEnabled;

  const tmTime = timerVM.timeElapsedInSeconds;
  const tmIsRunning = timerVM.isTimerRunning;
  const tmSubAlert = timerVM.subAlertLevel;
  const tmLastSub = timerVM.lastSubConfirmationTimeSeconds;
  const tmShowOverlay = timerVM.showLargeTimerOverlay;
  const tmInitialLoad = timerVM.initialLoadComplete;

  return (
    <div className="flex-grow relative bg-black overflow-hidden">
      {tmShowOverlay && (
        <TimerOverlay
          timeElapsedInSeconds={tmTime}
          subAlertLevel={tmSubAlert}
          onSubstitutionMade={substitutionMade}
          completedIntervalDurations={gameSessionState.completedIntervalDurations || []}
          subIntervalMinutes={gameSessionState.subIntervalMinutes}
          onSetSubInterval={setSubInterval}
          isTimerRunning={tmIsRunning}
          onStartPauseTimer={startPauseTimer}
          onResetTimer={resetTimer}
          onToggleGoalLogModal={toggleGoalLogModal}
          onRecordOpponentGoal={() => logOpponentGoal(tmTime)}
          teamName={gameSessionState.teamName}
          opponentName={gameSessionState.opponentName}
          homeScore={gameSessionState.homeScore}
          awayScore={gameSessionState.awayScore}
          homeOrAway={gameSessionState.homeOrAway}
          lastSubTime={tmLastSub}
          numberOfPeriods={gameSessionState.numberOfPeriods}
          periodDurationMinutes={gameSessionState.periodDurationMinutes}
          currentPeriod={gameSessionState.currentPeriod}
          gameStatus={gameSessionState.gameStatus}
          onOpponentNameChange={onOpponentNameChange}
          onTeamNameChange={onTeamNameChange}
          onClose={toggleLargeOverlay}
          isLoaded={tmInitialLoad}
        />
      )}

      <ErrorBoundary
        fallback={
          <div className="flex items-center justify-center h-full bg-red-900/20 border border-red-700 text-red-300">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Soccer Field Crashed</h3>
              <p className="text-sm">Please refresh the page to continue.</p>
            </div>
          </div>
        }
      >
        <SoccerField
          players={fcPlayersOnField}
          opponents={fcOpponents}
          drawings={fcIsTactics ? fcTacticalDrawings : fcDrawings}
          onPlayerMove={players.move}
          onPlayerMoveEnd={players.moveEnd}
          onPlayerRemove={players.remove}
          onOpponentMove={opponents.move}
          onOpponentMoveEnd={opponents.moveEnd}
          onOpponentRemove={opponents.remove}
          onPlayerDrop={players.drop}
          showPlayerNames={gameSessionState.showPlayerNames}
          onDrawingStart={fcIsTactics ? tactical.drawingStart : drawing.start}
          onDrawingAddPoint={fcIsTactics ? tactical.drawingAddPoint : drawing.addPoint}
          onDrawingEnd={fcIsTactics ? tactical.drawingEnd : drawing.end}
          draggingPlayerFromBarInfo={fcDraggingFromBar}
          onPlayerDropViaTouch={touch.playerDrop}
          onPlayerDragCancelViaTouch={touch.playerDragCancel}
          timeElapsedInSeconds={tmTime}
          isTacticsBoardView={fcIsTactics}
          tacticalDiscs={fcTacticalDiscs || []}
          onTacticalDiscMove={tactical.discMove}
          onTacticalDiscRemove={tactical.discRemove}
          onToggleTacticalDiscType={tactical.discToggleType}
          tacticalBallPosition={fcTacticalBall || { relX: 0.5, relY: 0.5 }}
          onTacticalBallMove={tactical.ballMove}
          isDrawingEnabled={fcIsDrawingEnabled}
        />
      </ErrorBoundary>

      {/* First game setup guidance */}
      {tmInitialLoad &&
        currentGameId === DEFAULT_GAME_ID &&
        fcPlayersOnField.length === 0 &&
        fcDrawings.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="bg-slate-800/95 border border-indigo-500/50 rounded-xl p-10 max-w-lg mx-4 pointer-events-auto shadow-2xl backdrop-blur-sm">
              <div className="text-center">
                <div className="mb-4">
                  <div className="w-16 h-16 mx-auto bg-indigo-600/20 rounded-full flex items-center justify-center mb-3">
                    <div className="text-3xl">⚽</div>
                  </div>
                  <h3 className="text-2xl font-bold text-indigo-300 mb-2">
                    {availablePlayers.length === 0
                      ? t('firstGame.titleNoPlayers', 'Ready to get started?')
                      : t('firstGame.title', 'Ready to track your first game?')}
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    {availablePlayers.length === 0
                      ? t(
                          'firstGame.descNoPlayers',
                          'First, set up your team roster, then create your first game to start tracking player positions, goals, and performance.'
                        )
                      : t(
                          'firstGame.desc',
                          "Create a game to start tracking player positions, recording goals, and analyzing your team's performance."
                        )}
                  </p>
                </div>

                <div className="space-y-3">
                  {availablePlayers.length === 0 ? (
                    <button
                      onClick={() => onOpenRosterModal?.()}
                      className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors shadow-lg"
                    >
                      {t('firstGame.setupRoster', 'Set Up Team Roster')}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => onOpenNewGameSetup?.()}
                        className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors shadow-lg"
                      >
                        {t('firstGame.createGame', 'Create Your First Match')}
                      </button>

                      <button
                      onClick={onOpenTeamManagerModal}
                        className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors shadow-lg ${
                          teams.length > 0
                            ? 'bg-slate-600 hover:bg-slate-500 text-slate-300 border border-slate-500'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {teams.length > 0
                          ? t('firstGame.manageTeams', 'Manage Teams')
                          : t('firstGame.createTeam', 'Create First Team')}
                      </button>

                      <button
                      onClick={() => onOpenSeasonTournamentModal?.()}
                        className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors shadow-lg ${
                          seasons.length > 0 || tournaments.length > 0
                            ? 'bg-slate-600 hover:bg-slate-500 text-slate-300 border border-slate-500'
                            : 'bg-violet-600 hover:bg-violet-500 text-white'
                        }`}
                      >
                        {seasons.length > 0 || tournaments.length > 0
                          ? t('firstGame.manageSeasonsAndTournaments', 'Manage Seasons & Tournaments')
                          : t('firstGame.createSeasonFirst', 'Create Season/Tournament First')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      {tmInitialLoad &&
        currentGameId === DEFAULT_GAME_ID &&
        (fcPlayersOnField.length > 0 || fcDrawings.length > 0) && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40">
            <div className="bg-amber-600/95 border border-amber-500/50 rounded-lg px-6 py-3 shadow-xl backdrop-blur-sm max-w-md">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-3 h-3 bg-amber-200 rounded-full animate-pulse flex-shrink-0"></div>
                <span className="text-amber-100 font-medium flex-1">
                  {t('firstGame.workspaceWarning', "Temporary workspace - changes won't be saved")}
                </span>
                <button
                  onClick={() => onOpenNewGameSetup?.()}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-900 rounded-md text-xs font-semibold transition-colors shadow-sm flex-shrink-0"
                >
                  {t('firstGame.createRealGame', 'Create real game')}
                </button>
              </div>
            </div>
          </div>
        )}

      {hasCheckedFirstGameGuide && showFirstGameGuide && currentGameId !== DEFAULT_GAME_ID && (
        <FirstGameGuide
          step={firstGameGuideStep}
          onStepChange={handleGuideStepChange}
          onClose={onGuideClose}
        />
      )}

      {orphanedGameInfo && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 max-w-4xl w-full px-4">
          <div className="bg-amber-500/20 border border-amber-500/30 px-4 py-2 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-xl">⚠️</span>
              <span className="text-amber-300 text-sm font-medium">
                {t('orphanedGame.banner', 'Original team "{{teamName}}" no longer exists. Using master roster.', {
                  teamName: orphanedGameInfo.teamName || t('orphanedGame.unknownTeam', 'Unknown Team')
                })}
              </span>
            </div>
            <button
              onClick={() => onOpenTeamReassignModal?.()}
              className="px-3 py-1 bg-amber-500/30 hover:bg-amber-500/40 text-amber-300 rounded-md text-sm font-medium transition-colors"
            >
              {t('orphanedGame.reassignButton', 'Reassign to Team')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
