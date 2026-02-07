import React, { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import logger from '@/utils/logger';
import { HiOutlineCamera, HiOutlineBookOpen, HiOutlineXMark } from 'react-icons/hi2';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import ErrorBoundary from '@/components/ErrorBoundary';
import TimerOverlay from '@/components/TimerOverlay';
import SoccerField, { SoccerFieldHandle } from '@/components/SoccerField';
import { exportFieldAsImage, isExportSupported } from '@/utils/export';
import { useExportMetadata } from '@/hooks/useExportMetadata';
import { useToast } from '@/contexts/ToastProvider';
import type {
  Player,
  Team,
  Season,
  Tournament,
  TacticalDisc,
  Point,
  AppState
} from '@/types';
import type { SubSlot } from '@/utils/formations';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import { DEFAULT_GAME_ID } from '@/config/constants';

/**
 * Player drag/drop handlers for moving roster members on the field.
 */
export interface PlayerInteractions {
  move: (playerId: string, relX: number, relY: number) => void;
  moveEnd: () => void;
  remove: (playerId: string) => void;
  drop: (playerId: string, relX: number, relY: number) => void;
  swap: (playerAId: string, playerBId: string) => void;
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
  discMoveEnd: () => void;
  discRemove: (discId: string) => void;
  discToggleType: (discId: string) => void;
  ballMove: (point: Point) => void;
  ballMoveEnd: () => void;
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
    formationSnapPoints?: Point[];
    subSlots?: SubSlot[];
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
  orphanedGameInfo: { teamId: string; teamName?: string } | null;
  onOpenNewGameSetup?: () => void;
  onOpenRosterModal?: () => void;
  onOpenSeasonTournamentModal?: () => void;
  onOpenTeamManagerModal: () => void;
  onOpenTeamReassignModal?: () => void;
  onOpenRulesModal?: () => void;
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
  teams: _teams,
  seasons,
  tournaments,
  orphanedGameInfo: _orphanedGameInfo,
  onOpenNewGameSetup,
  onOpenRosterModal,
  onOpenSeasonTournamentModal: _onOpenSeasonTournamentModal,
  onOpenTeamManagerModal: _onOpenTeamManagerModal,
  onOpenTeamReassignModal: _onOpenTeamReassignModal,
  onOpenRulesModal,
  onTeamNameChange,
  onOpponentNameChange,
  interactions,
  timerInteractions,
}: FieldContainerProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const fieldRef = useRef<SoccerFieldHandle>(null);

  // Track if user has dismissed the first-game setup overlay
  const [isSetupOverlayDismissed, setIsSetupOverlayDismissed] = useState(false);

  // Assemble export metadata using dedicated hook
  const exportMetadata = useExportMetadata({
    gameSessionState,
    seasons,
    tournaments,
    locale: i18n.language,
  });

  const handleExportField = useCallback(async () => {
    if (!isExportSupported()) {
      showToast(t('export.notSupported', 'Export not supported in this browser'), 'error');
      return;
    }

    // Use renderForExport for high-quality output (2x resolution)
    const canvas = fieldRef.current?.renderForExport(2);
    if (!canvas) {
      showToast(t('export.noCanvas', 'Could not capture field'), 'error');
      return;
    }

    try {
      await exportFieldAsImage(canvas, {
        ...exportMetadata,
        includeOverlay: true,
        scale: 1, // Already rendered at high res, no additional scaling needed
      });
      // Download triggered — no success toast needed
    } catch (error) {
      logger.error('[FieldContainer] Export failed:', error);
      showToast(t('export.failed', 'Failed to export field'), 'error');
    }
  }, [exportMetadata, showToast, t]);

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
              <h3 className="text-lg font-semibold mb-2">{t('errors.soccerFieldCrashed', 'Soccer Field Crashed')}</h3>
              <p className="text-sm">{t('errors.pleaseRefreshPage', 'Please refresh the page to continue.')}</p>
            </div>
          </div>
        }
      >
        <SoccerField
          ref={fieldRef}
          players={fcPlayersOnField}
          opponents={fcOpponents}
          drawings={fcIsTactics ? fcTacticalDrawings : fcDrawings}
          gameType={gameSessionState.gameType}
          onPlayerMove={players.move}
          onPlayerMoveEnd={players.moveEnd}
          onPlayerRemove={players.remove}
          onPlayersSwap={players.swap}
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
          onTacticalDiscMoveEnd={tactical.discMoveEnd}
          onTacticalDiscRemove={tactical.discRemove}
          onToggleTacticalDiscType={tactical.discToggleType}
          tacticalBallPosition={fcTacticalBall || { relX: 0.5, relY: 0.5 }}
          onTacticalBallMove={tactical.ballMove}
          onTacticalBallMoveEnd={tactical.ballMoveEnd}
          isDrawingEnabled={fcIsDrawingEnabled}
          formationSnapPoints={fieldVM.formationSnapPoints}
          subSlots={fieldVM.subSlots}
        />
      </ErrorBoundary>

      {/* Sync status indicator - top left */}
      <div className="absolute top-4 left-4 z-20">
        <SyncStatusIndicator variant="field" />
      </div>

      {/* Field action buttons - always visible */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        {/* Rules button */}
        {onOpenRulesModal && (
          <button
            onClick={onOpenRulesModal}
            className="p-2 bg-slate-700/80 hover:bg-slate-600 text-white rounded-lg shadow-lg transition-colors backdrop-blur-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none"
            title={t('rulesDirectory.buttonTitle', 'View rules')}
            aria-label={t('rulesDirectory.buttonTitle', 'View rules')}
          >
            <HiOutlineBookOpen className="w-5 h-5" />
          </button>
        )}
        {/* Export button */}
        {isExportSupported() && (
          <button
            onClick={handleExportField}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleExportField();
              }
            }}
            className="p-2 bg-slate-700/80 hover:bg-slate-600 text-white rounded-lg shadow-lg transition-colors backdrop-blur-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none"
            title={t('export.buttonTitle', 'Export field as image')}
            aria-label={t('export.buttonTitle', 'Export field as image')}
          >
            <HiOutlineCamera className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* First game setup guidance - dismissible overlay */}
      {tmInitialLoad &&
        currentGameId === DEFAULT_GAME_ID &&
        !isSetupOverlayDismissed &&
        fcPlayersOnField.length === 0 &&
        fcDrawings.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="relative bg-slate-800/95 border border-indigo-500/50 rounded-xl p-10 max-w-lg mx-4 pointer-events-auto shadow-2xl backdrop-blur-sm">
              {/* Dismiss button */}
              <button
                onClick={() => setIsSetupOverlayDismissed(true)}
                className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                aria-label={t('common.dismiss', 'Dismiss')}
              >
                <HiOutlineXMark className="w-5 h-5" />
              </button>

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
                          'firstGame.descNoPlayersSimple',
                          'Set up your team roster to start tracking games.'
                        )
                      : t(
                          'firstGame.desc',
                          "Create a game to start tracking player positions, recording goals, and analyzing your team's performance."
                        )}
                  </p>
                </div>

                {/* Single primary CTA */}
                {availablePlayers.length === 0 ? (
                  <button
                    onClick={() => onOpenRosterModal?.()}
                    className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors shadow-lg"
                  >
                    {t('firstGame.setupRoster', 'Set Up Team Roster')}
                  </button>
                ) : (
                  <button
                    onClick={() => onOpenNewGameSetup?.()}
                    className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors shadow-lg"
                  >
                    {t('firstGame.createGame', 'Create Your First Match')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Persistent banner when on default game - minimal bottom pill for field visibility */}
      {tmInitialLoad && currentGameId === DEFAULT_GAME_ID && (isSetupOverlayDismissed || fcPlayersOnField.length > 0 || fcDrawings.length > 0) && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40">
          <div className="bg-black/70 border border-white/10 rounded-full px-4 py-2 shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-white/90 font-medium">
                {fcPlayersOnField.length > 0 || fcDrawings.length > 0
                  ? t('firstGame.workspaceWarning', "Temporary workspace - won't be saved")
                  : t('firstGame.noGameCreated', 'No game created')}
              </span>
              <button
                onClick={() => onOpenNewGameSetup?.()}
                className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
              >
                + {t('firstGame.createGameShort', 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orphaned game banner removed - warning in TeamManagerModal is sufficient.
          Functionality (orphanedGameInfo, TeamReassignModal) kept for potential future use. */}
    </div>
  );
}
