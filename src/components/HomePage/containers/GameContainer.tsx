/**
 * GameContainer Component
 *
 * Main container for game UI rendering.
 * Extracted from HomePage.tsx as part of P0 refactoring.
 *
 * This component handles:
 * - Player bar and game info display
 * - Soccer field rendering
 * - Control bar
 * - Timer overlay
 * - First-time user experience
 * - Orphaned game warnings
 *
 * @param props - Game state and handlers from useGameOrchestration
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

// Components
import SoccerField from '@/components/SoccerField';
import PlayerBar from '@/components/PlayerBar';
import ControlBar from '@/components/ControlBar';
import TimerOverlay from '@/components/TimerOverlay';
import GameInfoBar from '@/components/GameInfoBar';
import ErrorBoundary from '@/components/ErrorBoundary';
import { setStorageItem } from '@/utils/storage';
import logger from '@/utils/logger';

// Icons
import {
  HiOutlineSquares2X2,
  HiOutlinePlusCircle,
  HiOutlineBackspace,
  HiOutlineTrash,
  HiOutlineClipboard,
  HiOutlineUsers,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineQuestionMarkCircle,
  HiBars3,
} from 'react-icons/hi2';

// Types
import type { Player } from '@/types';
import type { UseGameOrchestrationReturn } from '../hooks/useGameOrchestration';
import type { GameContainerViewModel } from '@/viewModels/gameContainer';
import { DEFAULT_GAME_ID } from '@/config/constants';

const barStyle = "flex-shrink-0 bg-slate-800 border-b border-slate-700";

export interface GameContainerProps extends Partial<UseGameOrchestrationReturn> {
  // Optional view-model (introduced in L2-2.4.1). Not yet consumed.
  viewModel?: GameContainerViewModel;
  draggingPlayerFromBarInfo: Player | null;
  isDrawingEnabled: boolean;
  showLargeTimerOverlay: boolean;
  initialLoadComplete: boolean;
  orphanedGameInfo: { teamId: string; teamName?: string } | null;
  showFirstGameGuide: boolean;
  hasCheckedFirstGameGuide: boolean;
  firstGameGuideStep: number;

  // Handlers
  handlePlayerDragStartFromBar: (player: Player) => void;
  handleDeselectPlayer: () => void;
  handlePlayerTapInBar: (player: Player) => void;
  handleToggleGoalieForModal: (playerId: string) => void;
  handleTeamNameChange: (name: string) => void;
  handleOpponentNameChange: (name: string) => void;
  setIsTeamReassignModalOpen: (open: boolean) => void;
  handleToggleLargeTimerOverlay: () => void;
  handleToggleGoalLogModal: () => void;
  handleLogOpponentGoal: (currentTime: number) => void;
  handlePlayerMove: (playerId: string, relX: number, relY: number) => void;
  handlePlayerMoveEnd: () => void;
  handlePlayerRemove: (playerId: string) => void;
  handleDropOnField: (playerId: string, relX: number, relY: number) => void;
  handlePlayerDropViaTouch: (relX: number, relY: number) => void;
  handlePlayerDragCancelViaTouch: () => void;
  setIsRosterModalOpen: (open: boolean) => void;
  setIsNewGameSetupModalOpen: (open: boolean) => void;
  handleOpenTeamManagerModal: () => void;
  setIsSeasonTournamentModalOpen: (open: boolean) => void;
  setShowFirstGameGuide: (show: boolean) => void;
  setFirstGameGuideStep: (step: number) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleResetField: () => void;
  handleClearDrawingsForView: () => void;
  handlePlaceAllPlayers: () => void;
  handleToggleTrainingResources: () => void;
  handleToggleGameStatsModal: () => void;
  handleOpenLoadGameModal: () => void;
  handleStartNewGame: () => void;
  openRosterModal: () => void;
  handleQuickSaveGame: () => void;
  handleOpenGameSettingsModal: () => void;
  handleOpenSeasonTournamentModal: () => void;
  handleToggleInstructionsModal: () => void;
  handleOpenSettingsModal: () => void;
  openPlayerAssessmentModal: () => void;
  handleOpenPersonnelManager: () => void;
  handleToggleDrawingMode: () => void;
}

export function GameContainer(props: GameContainerProps) {
  const { t } = useTranslation();

  const {
    gameSessionState,
    playersForCurrentGame,
    playersOnField,
    opponents,
    drawings,
    isTacticsBoardView,
    tacticalDrawings,
    tacticalDiscs,
    tacticalBallPosition,
    isDrawingEnabled,
    canUndo,
    canRedo,
    timeElapsedInSeconds,
    isTimerRunning,
    subAlertLevel,
    lastSubConfirmationTimeSeconds,
    availablePlayers,
    teams,
    seasonsQueryResultData,
    tournamentsQueryResultData,
    currentGameId,
    handleAddOpponent,
    handleOpponentMove,
    handleOpponentMoveEnd,
    handleOpponentRemove,
    handleDrawingStart,
    handleDrawingAddPoint,
    handleDrawingEnd,
    handleTacticalDrawingStart,
    handleTacticalDrawingAddPoint,
    handleTacticalDrawingEnd,
    handleTacticalDiscMove,
    handleTacticalDiscRemove,
    handleToggleTacticalDiscType,
    handleTacticalBallMove,
    handleToggleTacticsBoard,
    handleAddTacticalDisc,

    draggingPlayerFromBarInfo,
    showLargeTimerOverlay,
    initialLoadComplete,
    orphanedGameInfo,
    showFirstGameGuide,
    hasCheckedFirstGameGuide,
    firstGameGuideStep,

    handlePlayerDragStartFromBar,
    handleDeselectPlayer,
    handlePlayerTapInBar,
    handleToggleGoalieForModal,
    handleTeamNameChange,
    handleOpponentNameChange,
    setIsTeamReassignModalOpen,
    handleToggleLargeTimerOverlay,
    handleSubstitutionMade,
    handleSetSubInterval,
    handleStartPauseTimer,
    handleResetTimer,
    handleToggleGoalLogModal,
    handleLogOpponentGoal,
    handlePlayerMove,
    handlePlayerMoveEnd,
    handlePlayerRemove,
    handleDropOnField,
    handlePlayerDropViaTouch,
    handlePlayerDragCancelViaTouch,
    setIsRosterModalOpen,
    setIsNewGameSetupModalOpen,
    handleOpenTeamManagerModal,
    setIsSeasonTournamentModalOpen,
    setShowFirstGameGuide,
    setFirstGameGuideStep,
    handleUndo,
    handleRedo,
    handleResetField,
    handleClearDrawingsForView,
    handlePlaceAllPlayers,
    handleToggleTrainingResources,
    handleToggleGameStatsModal,
    handleOpenLoadGameModal,
    handleStartNewGame,
    openRosterModal,
    handleQuickSaveGame,
    handleOpenGameSettingsModal,
    handleOpenSeasonTournamentModal,
    handleToggleInstructionsModal,
    handleOpenSettingsModal,
    openPlayerAssessmentModal,
    handleOpenPersonnelManager,
    handleToggleDrawingMode,
  } = props;

  if (!gameSessionState) return null;

  // L2-2.4.2: Prefer view-model data for read-only subsets (parity fallback to props)
  const vm = props.viewModel;
  const playerBarPlayers = vm?.playerBar?.players ?? (playersForCurrentGame || []);
  const playerBarSelectedId = vm?.playerBar?.selectedPlayerIdFromBar ?? draggingPlayerFromBarInfo?.id ?? null;
  const playerBarGameEvents = vm?.playerBar?.gameEvents ?? gameSessionState.gameEvents;

  const infoTeamName = vm?.gameInfo?.teamName ?? gameSessionState.teamName;
  const infoOpponentName = vm?.gameInfo?.opponentName ?? gameSessionState.opponentName;
  const infoHomeScore = vm?.gameInfo?.homeScore ?? gameSessionState.homeScore;
  const infoAwayScore = vm?.gameInfo?.awayScore ?? gameSessionState.awayScore;
  const infoHomeOrAway = vm?.gameInfo?.homeOrAway ?? gameSessionState.homeOrAway;

  return (
    <main className="flex flex-col h-[100dvh] bg-slate-900 text-slate-50" data-testid="home-page">
      {/* Top Section: Player Bar, Game Info */}
      <div className={barStyle}>
        <ErrorBoundary fallback={
          <div className="p-4 bg-red-900/20 border border-red-700 text-red-300">
            Player bar crashed. Please refresh the page.
          </div>
        }>
          <PlayerBar
            players={playerBarPlayers}
            onPlayerDragStartFromBar={handlePlayerDragStartFromBar || (() => {})}
            selectedPlayerIdFromBar={playerBarSelectedId}
            onBarBackgroundClick={handleDeselectPlayer || (() => {})}
            gameEvents={playerBarGameEvents}
            onPlayerTapInBar={handlePlayerTapInBar || (() => {})}
            onToggleGoalie={handleToggleGoalieForModal || (() => {})}
          />
        </ErrorBoundary>
        <GameInfoBar
          teamName={infoTeamName}
          opponentName={infoOpponentName}
          homeScore={infoHomeScore}
          awayScore={infoAwayScore}
          onTeamNameChange={handleTeamNameChange || (() => {})}
          onOpponentNameChange={handleOpponentNameChange || (() => {})}
          homeOrAway={infoHomeOrAway}
        />
      </div>

      {/* Orphaned Game Warning Banner */}
      {orphanedGameInfo && (
        <div className="bg-amber-500/20 border-b border-amber-500/30 px-4 py-2">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-xl">⚠️</span>
              <span className="text-amber-300 text-sm font-medium">
                {t('orphanedGame.banner', 'Original team "{{teamName}}" no longer exists. Using master roster.', {
                  teamName: orphanedGameInfo.teamName || t('orphanedGame.unknownTeam', 'Unknown Team')
                })}
              </span>
            </div>
            <button
              onClick={() => setIsTeamReassignModalOpen?.(true)}
              className="px-3 py-1 bg-amber-500/30 hover:bg-amber-500/40 text-amber-300 rounded-md text-sm font-medium transition-colors"
            >
              {t('orphanedGame.reassignButton', 'Reassign to Team')}
            </button>
          </div>
        </div>
      )}

      {/* Main Content: Soccer Field */}
      <div className="flex-grow relative bg-black overflow-hidden">
        {showLargeTimerOverlay && (
          <TimerOverlay
            timeElapsedInSeconds={timeElapsedInSeconds || 0}
            subAlertLevel={subAlertLevel || 'none'}
            onSubstitutionMade={handleSubstitutionMade || (() => {})}
            completedIntervalDurations={gameSessionState.completedIntervalDurations || []}
            subIntervalMinutes={gameSessionState.subIntervalMinutes}
            onSetSubInterval={handleSetSubInterval || (() => {})}
            isTimerRunning={isTimerRunning || false}
            onStartPauseTimer={handleStartPauseTimer || (() => {})}
            onResetTimer={handleResetTimer || (() => {})}
            onToggleGoalLogModal={handleToggleGoalLogModal || (() => {})}
            onRecordOpponentGoal={() => handleLogOpponentGoal?.(timeElapsedInSeconds || 0)}
            teamName={gameSessionState.teamName}
            opponentName={gameSessionState.opponentName}
            homeScore={gameSessionState.homeScore}
            awayScore={gameSessionState.awayScore}
            homeOrAway={gameSessionState.homeOrAway}
            lastSubTime={lastSubConfirmationTimeSeconds || 0}
            numberOfPeriods={gameSessionState.numberOfPeriods}
            periodDurationMinutes={gameSessionState.periodDurationMinutes}
            currentPeriod={gameSessionState.currentPeriod}
            gameStatus={gameSessionState.gameStatus}
            onOpponentNameChange={handleOpponentNameChange || (() => {})}
            onClose={handleToggleLargeTimerOverlay || (() => {})}
            isLoaded={initialLoadComplete || false}
          />
        )}

        <ErrorBoundary fallback={
          <div className="flex items-center justify-center h-full bg-red-900/20 border border-red-700 text-red-300">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Soccer Field Crashed</h3>
              <p className="text-sm">Please refresh the page to continue.</p>
            </div>
          </div>
        }>
          <SoccerField
            players={playersOnField || []}
            opponents={opponents || []}
            drawings={isTacticsBoardView ? (tacticalDrawings || []) : (drawings || [])}
            onPlayerMove={handlePlayerMove || (() => {})}
            onPlayerMoveEnd={handlePlayerMoveEnd || (() => {})}
            onPlayerRemove={handlePlayerRemove || (() => {})}
            onOpponentMove={handleOpponentMove || (() => {})}
            onOpponentMoveEnd={handleOpponentMoveEnd || (() => {})}
            onOpponentRemove={handleOpponentRemove || (() => {})}
            onPlayerDrop={handleDropOnField || (() => {})}
            showPlayerNames={gameSessionState.showPlayerNames}
            onDrawingStart={isTacticsBoardView ? (handleTacticalDrawingStart || (() => {})) : (handleDrawingStart || (() => {}))}
            onDrawingAddPoint={isTacticsBoardView ? (handleTacticalDrawingAddPoint || (() => {})) : (handleDrawingAddPoint || (() => {}))}
            onDrawingEnd={isTacticsBoardView ? (handleTacticalDrawingEnd || (() => {})) : (handleDrawingEnd || (() => {}))}
            draggingPlayerFromBarInfo={draggingPlayerFromBarInfo || null}
            onPlayerDropViaTouch={handlePlayerDropViaTouch || (() => {})}
            onPlayerDragCancelViaTouch={handlePlayerDragCancelViaTouch || (() => {})}
            timeElapsedInSeconds={timeElapsedInSeconds || 0}
            isTacticsBoardView={isTacticsBoardView || false}
            tacticalDiscs={tacticalDiscs || []}
            onTacticalDiscMove={handleTacticalDiscMove || (() => {})}
            onTacticalDiscRemove={handleTacticalDiscRemove || (() => {})}
            onToggleTacticalDiscType={handleToggleTacticalDiscType || (() => {})}
            tacticalBallPosition={tacticalBallPosition || { relX: 0.5, relY: 0.5 }}
            onTacticalBallMove={handleTacticalBallMove || (() => {})}
            isDrawingEnabled={isDrawingEnabled || false}
          />
        </ErrorBoundary>

        {/* First Game Setup Overlay */}
        {initialLoadComplete && currentGameId === DEFAULT_GAME_ID && (playersOnField || []).length === 0 && (drawings || []).length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="bg-slate-800/95 border border-indigo-500/50 rounded-xl p-10 max-w-lg mx-4 pointer-events-auto shadow-2xl backdrop-blur-sm">
              <div className="text-center">
                <div className="mb-4">
                  <div className="w-16 h-16 mx-auto bg-indigo-600/20 rounded-full flex items-center justify-center mb-3">
                    <div className="text-3xl">⚽</div>
                  </div>
                  <h3 className="text-2xl font-bold text-indigo-300 mb-2">
                    {(availablePlayers || []).length === 0
                      ? t('firstGame.titleNoPlayers', 'Ready to get started?')
                      : t('firstGame.title', 'Ready to track your first game?')
                    }
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    {(availablePlayers || []).length === 0
                      ? t('firstGame.descNoPlayers', 'First, set up your team roster, then create your first game to start tracking player positions, goals, and performance.')
                      : t('firstGame.desc', 'Create a game to start tracking player positions, recording goals, and analyzing your team\'s performance.')
                    }
                  </p>
                </div>

                <div className="space-y-3">
                  {(availablePlayers || []).length === 0 ? (
                    <>
                      <button
                        onClick={() => setIsRosterModalOpen?.(true)}
                        className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors shadow-lg"
                      >
                        {t('firstGame.setupRoster', 'Set Up Team Roster')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsNewGameSetupModalOpen?.(true)}
                        className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors shadow-lg"
                      >
                        {t('firstGame.createGame', 'Create Your First Match')}
                      </button>

                      <button
                        onClick={handleOpenTeamManagerModal}
                        className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors shadow-lg ${
                          (teams || []).length > 0
                            ? 'bg-slate-600 hover:bg-slate-500 text-slate-300 border border-slate-500'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {(teams || []).length > 0
                          ? t('firstGame.manageTeams', 'Manage Teams')
                          : t('firstGame.createTeam', 'Create First Team')
                        }
                      </button>

                      <button
                        onClick={() => setIsSeasonTournamentModalOpen?.(true)}
                        className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors border border-slate-600 ${
                          (seasonsQueryResultData && seasonsQueryResultData.length > 0) || (tournamentsQueryResultData && tournamentsQueryResultData.length > 0)
                            ? 'bg-slate-600 hover:bg-slate-500 text-slate-300'
                            : 'bg-slate-700 hover:bg-slate-600 text-white'
                        }`}
                      >
                        {(seasonsQueryResultData && seasonsQueryResultData.length > 0) || (tournamentsQueryResultData && tournamentsQueryResultData.length > 0)
                          ? t('firstGame.manageSeasonsAndTournaments', 'Manage Seasons & Tournaments')
                          : t('firstGame.createSeasonFirst', 'Create Season/Tournament First')
                        }
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Temporary Workspace Warning (shows at top when using workspace) */}
        {initialLoadComplete && currentGameId === DEFAULT_GAME_ID && ((playersOnField || []).length > 0 || (drawings || []).length > 0) && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40">
            <div className="bg-amber-600/95 border border-amber-500/50 rounded-lg px-6 py-3 shadow-xl backdrop-blur-sm max-w-md">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-3 h-3 bg-amber-200 rounded-full animate-pulse flex-shrink-0"></div>
                <span className="text-amber-100 font-medium flex-1">{t('firstGame.workspaceWarning', 'Temporary workspace - changes won\'t be saved')}</span>
                <button
                  onClick={() => setIsNewGameSetupModalOpen?.(true)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-900 rounded-md text-xs font-semibold transition-colors shadow-sm flex-shrink-0"
                >
                  {t('firstGame.createRealGame', 'Create real game')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* First Game Interface Guide - compact carousel */}
        {hasCheckedFirstGameGuide && showFirstGameGuide && currentGameId !== DEFAULT_GAME_ID && (
          <FirstGameGuide
            step={firstGameGuideStep || 0}
            onStepChange={setFirstGameGuideStep || (() => {})}
            onClose={() => {
              setShowFirstGameGuide?.(false);
              setStorageItem('hasSeenFirstGameGuide', 'true').catch(error => {
                logger.debug('Failed to store first game guide dismissal (non-critical)', { error });
              });
            }}
          />
        )}
      </div>

      {/* Bottom Section: Control Bar (always visible) */}
      <div className={barStyle}>
        <ControlBar
          timeElapsedInSeconds={timeElapsedInSeconds || 0}
          isTimerRunning={isTimerRunning || false}
          onToggleLargeTimerOverlay={handleToggleLargeTimerOverlay || (() => {})}
          onUndo={handleUndo || (() => {})}
          onRedo={handleRedo || (() => {})}
          canUndo={canUndo || false}
          canRedo={canRedo || false}
          onResetField={handleResetField || (() => {})}
          onClearDrawings={handleClearDrawingsForView || (() => {})}
          onAddOpponent={handleAddOpponent || (() => {})}
          onPlaceAllPlayers={handlePlaceAllPlayers || (() => {})}
          isTacticsBoardView={isTacticsBoardView || false}
          onToggleTacticsBoard={handleToggleTacticsBoard || (() => {})}
          onAddHomeDisc={() => handleAddTacticalDisc?.('home')}
          onAddOpponentDisc={() => handleAddTacticalDisc?.('opponent')}
          onToggleGoalLogModal={handleToggleGoalLogModal || (() => {})}
          onToggleTrainingResources={handleToggleTrainingResources || (() => {})}
          onToggleGameStatsModal={handleToggleGameStatsModal || (() => {})}
          onOpenLoadGameModal={handleOpenLoadGameModal || (() => {})}
          onStartNewGame={handleStartNewGame || (() => {})}
          onOpenRosterModal={openRosterModal || (() => {})}
          onQuickSave={handleQuickSaveGame || (() => {})}
          onOpenGameSettingsModal={handleOpenGameSettingsModal || (() => {})}
          isGameLoaded={!!currentGameId && currentGameId !== DEFAULT_GAME_ID}
          onOpenSeasonTournamentModal={handleOpenSeasonTournamentModal || (() => {})}
          onToggleInstructionsModal={handleToggleInstructionsModal || (() => {})}
          onOpenSettingsModal={handleOpenSettingsModal || (() => {})}
          onOpenPlayerAssessmentModal={openPlayerAssessmentModal || (() => {})}
          onOpenTeamManagerModal={handleOpenTeamManagerModal || (() => {})}
          onOpenPersonnelManager={handleOpenPersonnelManager || (() => {})}
          isDrawingEnabled={isDrawingEnabled || false}
          onToggleDrawingMode={handleToggleDrawingMode || (() => {})}
        />
      </div>
    </main>
  );
}

// First Game Guide Component (extracted for clarity)
function FirstGameGuide({
  step,
  onStepChange,
  onClose,
}: {
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none px-6 py-12">
      <div className="relative bg-slate-800/95 rounded-2xl p-7 sm:p-8 max-w-md sm:max-w-lg w-full pointer-events-auto shadow-2xl backdrop-blur-sm max-h-[85vh] flex flex-col ring-1 ring-indigo-400/30">
        {/* Header */}
        <div className="text-center mb-3">
          <h2 className="text-xl sm:text-2xl font-bold text-indigo-300 leading-snug max-w-[20ch] mx-auto">
            {t('firstGameGuide.title', 'Welcome to Your First Game!')}
          </h2>
          <p className="text-slate-300 text-sm mt-1">
            {t('firstGameGuide.subtitle', "Let's quickly go over the basics")}
          </p>
          <div className="h-px bg-indigo-400/20 mt-3" />
        </div>

        {/* Slides */}
        <div className="flex-1 overflow-hidden">
          {step === 0 && (
            <GuideStepOne />
          )}
          {step === 1 && (
            <GuideStepTwo />
          )}
          {step === 2 && (
            <GuideStepThree />
          )}
          {step === 3 && (
            <GuideStepFour />
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-center gap-3 mt-4">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              onClick={() => onStepChange(i)}
              className={`h-3 w-3 rounded-full ${step === i ? 'bg-indigo-300' : 'bg-slate-600'} transition-colors`}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => onStepChange(Math.max(0, step - 1))}
            className="inline-flex items-center justify-center gap-2 px-4 h-10 bg-slate-700/80 hover:bg-slate-600/80 rounded-lg text-slate-200 ring-1 ring-white/10 shadow-sm transition-colors text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M12.78 15.53a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 010-1.06l4.5-4.5a.75.75 0 111.06 1.06L8.81 10l3.97 3.97a.75.75 0 010 1.06z" clipRule="evenodd" />
            </svg>
            {t('common.backButton', 'Back')}
          </button>
          {step < 3 ? (
            <button
              onClick={() => onStepChange(Math.min(3, step + 1))}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg font-semibold text-white transition-colors text-sm bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-900/30 ring-1 ring-white/10"
            >
              {t('common.next', 'Next')}
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M7.22 4.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06L11.19 10 7.22 6.03a.75.75 0 010-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg font-semibold text-white transition-colors text-sm bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-900/30 ring-1 ring-white/10"
            >
              {t('firstGameGuide.gotIt', "Got it, let's start!")}
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M7.22 4.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06L11.19 10 7.22 6.03a.75.75 0 010-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Guide step components (simplified for space)
function GuideStepOne() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.playerSelection', 'Player Selection (Top Bar)')}
      </h3>
      <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
        <li>{t('firstGameGuide.tapToSelect', 'Tap player disc to select')}</li>
        <li>{t('firstGameGuide.goalieInstructions', 'When player is on field, tap shield icon to set as goalie')}</li>
        <li>{t('firstGameGuide.tapFieldPlace', 'Tap field to place player')}</li>
      </ul>
    </div>
  );
}

function GuideStepTwo() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.theField', 'The Field')}
      </h3>
      <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
        <li>{t('firstGameGuide.dragToAdjust', 'Drag players by dragging')}</li>
        <li>{t('firstGameGuide.doubleTapRemove', 'Double-tap to remove a player from the field')}</li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.placeAllTip', 'Place all players at once with:')}</span>
          <HiOutlineSquares2X2 aria-hidden className="inline-block align-[-2px] ml-2 text-purple-300" size={18} />
        </li>
        <li>{t('firstGameGuide.drawTactics', 'You can draw on the field with your finger')}</li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.addOpponentTip', 'Add opponents with:')}</span>
          <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-red-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.clearDrawingsTip', 'Clear drawings with:')}</span>
          <HiOutlineBackspace aria-hidden className="inline-block align-[-2px] ml-2 text-amber-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.resetFieldTip', 'Reset field with:')}</span>
          <HiOutlineTrash aria-hidden className="inline-block align-[-2px] ml-2 text-red-400" size={18} />
        </li>
      </ul>
    </div>
  );
}

function GuideStepThree() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.tacticalView', 'Tactical View')}
      </h3>
      <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
        <li>
          <span className="text-slate-200">{t('firstGameGuide.tacticalSwitchTip', 'Switch to tactical mode by pressing:')}</span>
          <HiOutlineClipboard aria-hidden className="inline-block align-[-2px] ml-2 text-indigo-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.addHomeDiscTip', 'Add a home disc with:')}</span>
          <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-purple-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.addOpponentDiscTip', 'Add an opponent disc with:')}</span>
          <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-red-300" size={18} />
        </li>
        <li>{t('firstGameGuide.drawLinesTip', 'Draw lines on the field with your finger')}</li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.clearDrawingsTip', 'Clear drawings with:')}</span>
          <HiOutlineBackspace aria-hidden className="inline-block align-[-2px] ml-2 text-amber-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.resetFieldTip', 'Reset field with:')}</span>
          <HiOutlineTrash aria-hidden className="inline-block align-[-2px] ml-2 text-red-400" size={18} />
        </li>
      </ul>
    </div>
  );
}

function GuideStepFour() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.quickActions', 'Quick Actions (Bottom Bar)')}
      </h3>
      <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
        <li>
          <span className="text-slate-200">{t('firstGameGuide.undoRedoTip', 'Undo/Redo your last actions:')}</span>
          <span className="inline-flex items-center ml-2 gap-1 align-[-2px]">
            <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 010 8h-1" /></svg>
            <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 10l4 4-4 4" /><path d="M19 14H8a4 4 0 010-8h1" /></svg>
          </span>
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.logGoalTip', 'Log a goal:')}</span>
          <span className="inline-block align-[-2px] ml-2 text-blue-300">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg>
          </span>
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.rosterTip', 'Open roster settings:')}</span>
          <HiOutlineUsers aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.gameSettingsTip', 'Open game settings:')}</span>
          <HiOutlineAdjustmentsHorizontal aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.statsTip', 'Show stats:')}</span>
          <HiOutlineClipboardDocumentList aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.timerOverlayTip', 'Show/hide large timer:')}</span>
          <HiOutlineClock aria-hidden className="inline-block align-[-2px] ml-2 text-green-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.helpTip', 'Open help:')}</span>
          <HiOutlineQuestionMarkCircle aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.menuTip', 'Open the menu for more:')}</span>
          <HiBars3 aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
        </li>
      </ul>
    </div>
  );
}
