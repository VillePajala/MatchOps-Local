import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { DictationControls } from '@/hooks/useDictationCapture';
import { useTranslation } from 'react-i18next';
import logger from '@/utils/logger';
import { HiOutlineCamera, HiOutlineBookOpen, HiOutlineXMark, HiOutlineMapPin, HiOutlineUserPlus } from 'react-icons/hi2';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import ErrorBoundary from '@/components/ErrorBoundary';
import TimerOverlay from '@/components/TimerOverlay';
import ShootoutModal from '@/components/ShootoutModal';
import SoccerField, { SoccerFieldHandle } from '@/components/SoccerField';
import { exportFieldAsImage, isExportSupported } from '@/utils/export';
import { useExportMetadata } from '@/hooks/useExportMetadata';
import { usePlannedSubPrompts } from '@/hooks/usePlannedSubPrompts';
import { useToast } from '@/contexts/ToastProvider';
import { useAssessmentsEnabled } from '@/hooks/useAssessmentsEnabled';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useModalContextOptional } from '@/contexts/ModalProvider';
import { isSubTimerShown, readSubTimerChoice, writeSubTimerChoice } from '@/utils/subTimerVisibility';
import type {
  Player,
  Team,
  Season,
  Tournament,
  TacticalDisc,
  Point,
  AppState,
  ShootoutKick
} from '@/types';
import type { SubSlot } from '@/utils/formations';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { HiOutlineListBullet } from 'react-icons/hi2';
import { usePlannedChains } from '@/hooks/usePlannedChains';
import { isExtraTimePeriod } from '@/utils/matchStructure';
import {
  matchFieldToolStyle,
  matchFieldToolOnStyle,
  primaryButtonStyle,
  dialogContainerStyle,
  dialogTitleStyle,
  dialogBodyStyle,
  iconButtonCancelStyle,
} from '@/styles/modalStyles';


/**
 * Withheld collections for the chain view, which shows the plan on an empty
 * pitch. Module-level so their identity is stable - a fresh `[]` each render
 * would retrigger the field's memoised draw on every tick.
 */
const EMPTY_PLAYERS: Player[] = [];
const EMPTY_OPPONENTS: AppState['opponents'] = [];
const EMPTY_SUB_SLOTS: SubSlot[] = [];
const EMPTY_SNAP_POINTS: Point[] = [];
/** How long a field tool's name pill stays up after the tool is switched on. */
export const FIELD_TOOL_PILL_VISIBLE_MS = 1500;
/** Its fade-out; matches the pill's `duration-300` class. */
export const FIELD_TOOL_PILL_FADE_MS = 300;

/**
 * Player drag/drop handlers for moving roster members on the field.
 */
export interface PlayerInteractions {
  move: (playerId: string, relX: number, relY: number) => void;
  moveEnd: (movedPlayerIds?: string[]) => void;
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
  /**
   * The timer's "Maali meille": logs our goal at once (the score moves) and
   * opens the quick "Kuka teki?" sheet (D16). Not the goal-log form.
   */
  quickGoal: () => void;
  onOpenPlayerAssessmentModal: () => void;
  onFinishGame?: () => void;
  logOpponentGoal: (timeInSeconds: number) => void;
  substitutionMade: () => void;
  setSubInterval: (minutes: number) => void;
  startPauseTimer: () => void;
  resetTimer: () => void;
  /** End the current period now (review 4.31); the timer view confirms first. */
  endPeriodNow?: () => void;
  /** Start extra time at full time (review 11.1). */
  startExtraTime?: (periods: number, minutes: number) => void;
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
  /** Bumped after a plan is re-applied so the planned-sub prompts re-read the store. */
  plannedSubsRefreshKey?: number;
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
  onTogglePositionLabels: (value: boolean) => void;
  onWentToOvertimeChange: (value: boolean) => void;
  onShootoutKicksChange: (kicks: ShootoutKick[]) => void;
  onWentToPenaltiesChange: (value: boolean) => void;
  interactions: FieldInteractions;
  timerInteractions: TimerInteractions;
  /** Kirjuri voice notes (PR 2) - recorder controls for the timer overlay. */
  dictation?: DictationControls;
}

export function FieldContainer({
  fieldVM,
  timerVM,
  gameSessionState,
  currentGameId,
  plannedSubsRefreshKey,
  availablePlayers,
  dictation,
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
  onTogglePositionLabels,
  onWentToOvertimeChange,
  onShootoutKicksChange,
  onWentToPenaltiesChange,
  interactions,
  timerInteractions,
}: FieldContainerProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const assessmentsEnabled = useAssessmentsEnabled();
  const appLayout = useAppLayout();
  const [isShootoutModalOpen, setIsShootoutModalOpen] = useState(false);
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
    quickGoal,
    onOpenPlayerAssessmentModal,
    onFinishGame,
    logOpponentGoal,
    substitutionMade,
    setSubInterval,
    startPauseTimer,
    resetTimer,
    endPeriodNow,
    startExtraTime,
  } = timerInteractions;

  // Consolidated locals (prefer VMs when provided)
  const fcPlayersOnField = fieldVM.playersOnField;
  /**
   * How much of the plan is on screen. One control, two views:
   *
   *  lineup - the players on the field plus the waiting subs, parked as real
   *           discs on their sideline sub slots. The default.
   *  chains - the plan ALONE: every position with its full substitution
   *           schedule and minutes. Not a layer on the lineup; it replaces
   *           it, because the chains need the whole field to be readable.
   *
   * DELIBERATELY NOT PERSISTED. The chain view is a momentary look at the
   * plan, so the field opens on the lineup every time - remembering the
   * chains would leave a coach facing an empty pitch with no discs on it.
   */
  const [planView, setPlanView] = useState<'lineup' | 'chains'>('lineup');
  const plannedChains = usePlannedChains(
    currentGameId === DEFAULT_GAME_ID ? null : currentGameId,
    fieldVM.formationSnapPoints,
    fcPlayersOnField,
  );
  const hasChainView = plannedChains.length > 0;
  /**
   * The name pill under the tools is a brief confirmation, not a standing
   * label: it appears when a tap switches the view, naming the view it
   * switched to, then fades out so it does not sit on the grass and the
   * players. The filled button carries the state afterwards; the button's
   * aria-label and aria-pressed carry it for screen readers. Nothing shows on
   * first render - only a tap earns a pill.
   */
  const [planPill, setPlanPill] = useState<'hidden' | 'shown' | 'fading'>('hidden');
  const planPillTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearPlanPillTimers = useCallback(() => {
    planPillTimers.current.forEach(clearTimeout);
    planPillTimers.current = [];
  }, []);
  useEffect(() => clearPlanPillTimers, [clearPlanPillTimers]);
  const togglePlanView = useCallback(() => {
    setPlanView(planView === 'chains' ? 'lineup' : 'chains');
    clearPlanPillTimers();
    setPlanPill('shown');
    planPillTimers.current = [
      setTimeout(() => setPlanPill('fading'), FIELD_TOOL_PILL_VISIBLE_MS),
      setTimeout(() => setPlanPill('hidden'), FIELD_TOOL_PILL_VISIBLE_MS + FIELD_TOOL_PILL_FADE_MS),
    ];
  }, [planView, clearPlanPillTimers]);
  const showingChains = planView === 'chains' && hasChainView;
  // A toggle has to say what it just became, or the second tap is a guess.
  // The label doubles as the button's accessible name.
  const planViewLabel = showingChains
    ? t('fieldTools.planViewChains', 'Substitutions and minutes')
    : t('fieldTools.planViewLineup', 'Lineup');
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

  // Playing-Time Planner: the due group of planned subs for the timer overlay. A
  // pure function of the clock and the schedule - deliberately NOT of the discs on
  // the field, which coaches don't move during play (see usePlannedSubPrompts).
  const plannedPrompts = usePlannedSubPrompts(
    currentGameId === DEFAULT_GAME_ID ? null : currentGameId,
    tmTime,
    availablePlayers,
    plannedSubsRefreshKey,
  );
  // The plan covers regulation time only (review 11.1): in extra time its last group
  // would stay "due" for the rest of the match, so the reminders stop at full time.
  const inExtraTime = isExtraTimePeriod(gameSessionState, gameSessionState.currentPeriod);
  const plannedSubGroup = inExtraTime ? null : plannedPrompts.current;
  const plannedSubsEarlier = inExtraTime ? 0 : plannedPrompts.overdueEarlier;

  // ONE sub mechanism by default: a game with planned subs shows the plan's
  // block, a game without shows the interval sub timer. The coach's per-game
  // "Show sub timer" choice overrides that (device-local, see
  // utils/subTimerVisibility). Tagged with the game, read again on a switch.
  const liveGameId = currentGameId === DEFAULT_GAME_ID ? null : currentGameId;
  const [subTimerChoice, setSubTimerChoiceState] = useState(() => ({
    gameId: liveGameId,
    choice: readSubTimerChoice(liveGameId),
  }));
  let currentSubTimerChoice = subTimerChoice;
  if (subTimerChoice.gameId !== liveGameId) {
    currentSubTimerChoice = { gameId: liveGameId, choice: readSubTimerChoice(liveGameId) };
    setSubTimerChoiceState(currentSubTimerChoice);
  }
  const hasPlan = plannedPrompts.hasPlan;
  // While the schedule loads (hasPlan null) neither the plan nor the timer is
  // known to be the one; the coach's own choice still applies at once.
  const showSubTimer = hasPlan === null
    ? currentSubTimerChoice.choice === true
    : isSubTimerShown(currentSubTimerChoice.choice, hasPlan);
  const setShowSubTimer = useCallback((show: boolean) => {
    if (liveGameId) writeSubTimerChoice(liveGameId, show);
    setSubTimerChoiceState({ gameId: liveGameId, choice: show });
  }, [liveGameId]);
  const modalContext = useModalContextOptional();
  const setIsPlaytimePlannerOpen = modalContext?.setIsPlaytimePlannerOpen;
  const openPlanner = useCallback(() => setIsPlaytimePlannerOpen?.(true), [setIsPlaytimePlannerOpen]);

  return (
    // The pitch's own box: the whole area between the match view's top panel
    // and its control strip (see GameContainer), nothing overlapping it. The
    // canvas fills it, so relative player coordinates map to this box exactly.
    <div className="absolute inset-0 overflow-hidden">
      {/* DELIBERATE: the planned-sub nudge (inside TimerOverlay) is only
          visible while the large timer overlay is open - the same surface the
          existing interval sub-alerts use. On game day the overlay IS the
          match screen; a coach who keeps it closed has opted out of clock-side
          coaching aids. Revisit only if planner users report missed nudges. */}
      {tmShowOverlay && (
        <TimerOverlay
          timeElapsedInSeconds={tmTime}
          subAlertLevel={showSubTimer ? tmSubAlert : 'none'}
          onSubstitutionMade={substitutionMade}
          completedIntervalDurations={gameSessionState.completedIntervalDurations || []}
          subIntervalMinutes={gameSessionState.subIntervalMinutes}
          onSetSubInterval={setSubInterval}
          isTimerRunning={tmIsRunning}
          onStartPauseTimer={startPauseTimer}
          onResetTimer={resetTimer}
          onEndPeriod={endPeriodNow}
          onStartExtraTime={startExtraTime}
          extraTimePeriods={gameSessionState.extraTimePeriods}
          extraTimeMinutes={gameSessionState.extraTimeMinutes}
          gameType={gameSessionState.gameType}
          plannedSubGroup={plannedSubGroup}
          plannedSubsEarlier={plannedSubsEarlier}
          onToggleGoalLogModal={quickGoal}
          // Basic layout: no "Nollaa vaihtoajastin" (D13) - the plan's
          // reminders are the basic coach's sub timing.
          showSubTimerReset={appLayout !== 'basic'}
          showSubTimer={showSubTimer}
          hasPlan={hasPlan === true}
          onShowSubTimerChange={liveGameId ? setShowSubTimer : undefined}
          onOpenPlanner={setIsPlaytimePlannerOpen ? openPlanner : undefined}
          onOpenPlayerAssessmentModal={assessmentsEnabled ? onOpenPlayerAssessmentModal : undefined}
          onFinishGame={onFinishGame}
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
          wentToOvertime={gameSessionState.wentToOvertime}
          onWentToOvertimeChange={onWentToOvertimeChange}
          onRecordShootout={() => setIsShootoutModalOpen(true)}
          onClose={toggleLargeOverlay}
          isLoaded={tmInitialLoad}
          dictation={dictation}
        />
      )}

      <ShootoutModal
        isOpen={isShootoutModalOpen}
        onClose={() => setIsShootoutModalOpen(false)}
        availablePlayers={availablePlayers}
        squadIds={gameSessionState.selectedPlayerIds}
        initialKicks={gameSessionState.shootoutKicks ?? []}
        homeOrAway={gameSessionState.homeOrAway}
        teamName={gameSessionState.teamName}
        opponentName={gameSessionState.opponentName}
        onSave={(kicks) => {
          onShootoutKicksChange(kicks);
          // Recording a shootout marks the game decided by penalties (auto-check only).
          if (kicks.length > 0) onWentToPenaltiesChange(true);
        }}
      />

      <ErrorBoundary
        fallback={
          <div className="flex items-center justify-center h-full s1-canvas font-ui text-ink-2">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">{t('errors.soccerFieldCrashed', 'Soccer Field Crashed')}</h3>
              <p className="text-sm">{t('errors.pleaseRefreshPage', 'Please refresh the page to continue.')}</p>
            </div>
          </div>
        }
      >
        <SoccerField
          ref={fieldRef}
          players={showingChains ? EMPTY_PLAYERS : fcPlayersOnField}
          opponents={showingChains ? EMPTY_OPPONENTS : fcOpponents}
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
          showPositionLabels={gameSessionState.showPositionLabels ?? true}
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
          formationSnapPoints={showingChains ? EMPTY_SNAP_POINTS : fieldVM.formationSnapPoints}
          subSlots={showingChains ? EMPTY_SUB_SLOTS : fieldVM.subSlots}
          plannedChains={showingChains ? plannedChains : undefined}
        />
      </ErrorBoundary>

      {/* While a player picked from the bar waits for a spot, the touchline
          lights amber: the whole pitch is the target. Paint only - the amber
          ring on the picked disc names who is placed; there is no notice. */}
      {fcDraggingFromBar && (
        <div
          className="absolute inset-[3px] rounded-[5px] ring-2 ring-action pointer-events-none z-[15]"
          data-testid="placement-outline"
          aria-hidden="true"
        />
      )}

      {/* Sync status indicator - top left corner of the pitch. The tools sit
          in the grass above the penalty area, clear of the subs rail (which
          starts below them, see SUB_RAIL_TOP in SoccerField). */}
      <div className="absolute top-[12px] left-[14px] z-20">
        <SyncStatusIndicator variant="field" />
      </div>

      {/* Field action buttons - always visible */}
      <div className="absolute top-[12px] right-[14px] z-20 flex gap-2">
        {/* Rules button */}
        {onOpenRulesModal && (
          <button
            onClick={onOpenRulesModal}
            className={matchFieldToolStyle}
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
            className={matchFieldToolStyle}
            title={t('export.buttonTitle', 'Export field as image')}
            aria-label={t('export.buttonTitle', 'Export field as image')}
          >
            <HiOutlineCamera className="w-5 h-5" />
          </button>
        )}
        {/* Position labels toggle */}
        <button
          onClick={() => onTogglePositionLabels(!(gameSessionState.showPositionLabels ?? true))}
          className={matchFieldToolStyle}
          title={t('field.togglePositionLabels', 'Toggle position labels')}
          aria-label={t('field.togglePositionLabels', 'Toggle position labels')}
          aria-pressed={gameSessionState.showPositionLabels ?? true}
        >
          <HiOutlineMapPin className={`w-5 h-5 ${(gameSessionState.showPositionLabels ?? true) ? 'text-white' : 'text-ink-3'}`} />
        </button>
        {/* Plan view toggle. Hidden entirely when the game has no plan to show,
            rather than shown dead: a control that cannot change anything is
            noise on the busiest screen in the app. */}
        {hasChainView && (
          <button
            onClick={togglePlanView}
            data-testid="toggle-plan-view"
            className={showingChains ? matchFieldToolOnStyle : matchFieldToolStyle}
            title={planViewLabel}
            aria-label={planViewLabel}
            aria-pressed={showingChains}
          >
            {showingChains ? (
              <HiOutlineListBullet className="w-5 h-5" />
            ) : (
              <HiOutlineUserPlus className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {/* Which view a tap just switched to. The icon alone only tells the
          person who built it, so the control names its state - but only for
          a moment: see planPill. Hidden from screen readers, which get the
          same name from the button. */}
      {hasChainView && planPill !== 'hidden' && (
        <div
          className="absolute top-[60px] right-[14px] z-20 pointer-events-none"
          data-testid="field-tool-pill"
          aria-hidden="true"
        >
          <span
            className={`inline-flex items-center px-3 py-[7px] rounded-full bg-[rgb(15_23_42/0.86)] font-ui text-[13px] font-semibold text-white shadow-[0_10px_18px_-10px_rgb(2_6_23/0.8)] transition-opacity duration-300 motion-reduce:transition-none ${planPill === 'fading' ? 'opacity-0' : 'opacity-100'}`}
          >
            {planViewLabel}
          </span>
        </div>
      )}

      {/* First game setup guidance - dismissible overlay */}
      {tmInitialLoad &&
        currentGameId === DEFAULT_GAME_ID &&
        !isSetupOverlayDismissed &&
        fcPlayersOnField.length === 0 &&
        fcDrawings.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className={`relative ${dialogContainerStyle} pt-10 pointer-events-auto font-ui`}>
              {/* Dismiss button */}
              <button
                onClick={() => setIsSetupOverlayDismissed(true)}
                className={`absolute top-2 right-2 ${iconButtonCancelStyle}`}
                aria-label={t('common.dismiss', 'Dismiss')}
              >
                <HiOutlineXMark className="w-5 h-5" />
              </button>

              <div className="text-center">
                <div className="mb-4">
                  <div className="w-16 h-16 mx-auto s1-raised rounded-full flex items-center justify-center mb-3">
                    <div className="text-3xl">⚽</div>
                  </div>
                  <h3 className={`${dialogTitleStyle} mb-2`}>
                    {availablePlayers.length === 0
                      ? t('firstGame.titleNoPlayers', 'Ready to get started?')
                      : t('firstGame.title', 'Ready to create your first match!')}
                  </h3>
                  <p className={`${dialogBodyStyle} mb-6`}>
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
                    className={`${primaryButtonStyle} w-full min-h-[52px]`}
                  >
                    {t('firstGame.setupRoster', 'Add players')}
                  </button>
                ) : (
                  <button
                    onClick={() => onOpenNewGameSetup?.()}
                    className={`${primaryButtonStyle} w-full min-h-[52px]`}
                  >
                    {t('firstGame.createGame', 'Create Match')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Demo watermark — diagonal text across the field when on default game */}
      {tmInitialLoad && currentGameId === DEFAULT_GAME_ID && (isSetupOverlayDismissed || fcPlayersOnField.length > 0 || fcDrawings.length > 0) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden select-none" aria-hidden="true">
          <span className="text-white/[0.07] text-[min(25vw,10rem)] font-black tracking-[0.3em] -rotate-[30deg] uppercase">
            DEMO
          </span>
        </div>
      )}

      {/* Orphaned game banner removed - warning in TeamManagerModal is sufficient.
          Functionality (orphanedGameInfo, TeamReassignModal) kept for potential future use. */}
    </div>
  );
}
