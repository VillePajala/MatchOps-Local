'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FaPlay, FaPause, FaUndo } from 'react-icons/fa'; // Import icons
import { useTranslation } from 'react-i18next'; // Import translation hook
import { IntervalLog, SubAlertLevel } from '@/types'; // Import types
import type { PlannedSubGroup } from '@/hooks/usePlannedSubPrompts';
import { formatTime } from '@/utils/time';
import SteadyDigits from '@/components/SteadyDigits';
import logger from '@/utils/logger';
import ConfirmationModal from './ConfirmationModal';
import { HiOutlineMicrophone, HiOutlineChevronDown, HiOutlineMinus, HiOutlinePlus } from 'react-icons/hi2';
import { chipStyle, chipSelectedStyle, inlineFieldStyle, sectionLabelStyle } from '@/styles/modalStyles';
import type { DictationControls } from '@/hooks/useDictationCapture';
import { clockContinuation } from '@/utils/clockContinuation';
import { liveScoreNumeralClass } from '@/utils/gameResult';
import { formatAppDecimal } from '@/utils/localeFormat';
import { extraTimePeriodCount, isExtraTimePeriod, isLastPeriod, periodEndSeconds, type MatchStructure } from '@/utils/matchStructure';


interface TimerOverlayProps {
  timeElapsedInSeconds: number;
  subAlertLevel: SubAlertLevel;
  onSubstitutionMade: () => void;
  completedIntervalDurations: IntervalLog[];
  subIntervalMinutes: number;
  onSetSubInterval: (minutes: number) => void;
  isTimerRunning: boolean;
  onStartPauseTimer: () => void;
  onResetTimer: () => void;
  /** End the current period now (review 4.31). Shown while a period is in play. */
  onEndPeriod?: () => void;
  /**
   * The "Goal for us" button. The match host wires quick goal entry here (D16:
   * the goal is logged at once, then "Who scored?"); the name is historical.
   */
  onToggleGoalLogModal?: () => void;
  onOpenPlayerAssessmentModal?: () => void;
  /** Phase 1b (7c): the one CTA at game end - closes the overlay and opens the
   *  Finish this game spine. When wired, it replaces the assess-players button
   *  (assessments are step 5 of the spine). */
  onFinishGame?: () => void;
  onRecordOpponentGoal?: () => void;
  teamName: string;
  opponentName: string;
  homeScore: number;
  awayScore: number;
  homeOrAway: 'home' | 'away';
  // Game Structure props
  numberOfPeriods: 1 | 2;
  periodDurationMinutes: number;
  currentPeriod: number;
  gameStatus: 'notStarted' | 'inProgress' | 'periodEnd' | 'gameEnd';
  lastSubTime: number | null;
  onOpponentNameChange: (name: string) => void;
  onTeamNameChange: (name: string) => void;
  /** Overtime / penalties — reachable from the overlay once the game has started */
  wentToOvertime?: boolean;
  onWentToOvertimeChange?: (value: boolean) => void;
  onRecordShootout?: () => void;
  /** Start extra time at full time (review 11.1). Absent: no extra-time panel. */
  onStartExtraTime?: (periods: number, minutes: number) => void;
  extraTimePeriods?: number;
  extraTimeMinutes?: number;
  /** Pre-fills the extra-time length: futsal 5 min, football 15 min. */
  gameType?: 'soccer' | 'futsal';
  onClose?: () => void;
  isLoaded: boolean;
  /**
   * Playing-Time Planner: the next planned change to show (see
   * usePlannedSubPrompts) - the latest due group, or the first one still ahead
   * (`due: false`). A group without `due` is treated as due.
   */
  plannedSubGroup?: (PlannedSubGroup & { due?: boolean }) | null;
  /** How many earlier groups were also due (shown as "+N earlier"). */
  plannedSubsEarlier?: number;
  /** Kirjuri voice notes (PR 2): press-hold recorder controls; absent = feature not wired. */
  dictation?: DictationControls;
  /**
   * Shows "Sub done" (D13). The basic layout will pass false to hide it;
   * the full layout keeps it. Defaults to shown.
   */
  showSubTimerReset?: boolean;
}

/**
 * The big clock's width in em: SteadyDigits' boxes (0.56em per digit, 0.24em
 * per colon), the 0.06em right padding that holds the italic overhang, and
 * 0.08em of slack so the last digit never touches the edge.
 */
const clockWidthEm = (text: string): number => {
  let em = 0.06 + 0.08;
  for (const ch of text) em += ch === ':' ? 0.24 : 0.56;
  return Math.round(em * 100) / 100;
};

const TimerOverlay: React.FC<TimerOverlayProps> = ({
  timeElapsedInSeconds,
  subAlertLevel,
  onSubstitutionMade,
  completedIntervalDurations,
  subIntervalMinutes,
  onSetSubInterval,
  isTimerRunning,
  onStartPauseTimer,
  dictation,
  onResetTimer,
  onEndPeriod,
  onToggleGoalLogModal = () => { logger.warn('onToggleGoalLogModal handler not provided'); },
  onOpenPlayerAssessmentModal,
  onFinishGame,
  onRecordOpponentGoal = () => { logger.warn('onRecordOpponentGoal handler not provided'); },
  teamName = "Team",
  opponentName = "Opponent",
  homeScore = 0,
  awayScore = 0,
  homeOrAway,
  // Game Structure props
  numberOfPeriods = 2,
  periodDurationMinutes = 10,
  currentPeriod = 1,
  gameStatus = 'notStarted',
  lastSubTime = null,
  onOpponentNameChange = () => { logger.warn('onOpponentNameChange handler not provided'); },
  onTeamNameChange = () => { logger.warn('onTeamNameChange handler not provided'); },
  wentToOvertime = false,
  onWentToOvertimeChange = () => {},
  onRecordShootout = () => {},
  onStartExtraTime,
  extraTimePeriods,
  extraTimeMinutes,
  gameType,
  onClose,
  isLoaded,
  plannedSubGroup = null,
  plannedSubsEarlier = 0,
  showSubTimerReset = true,
}) => {
  const { t } = useTranslation(); // Initialize translation hook

  // --- State for Opponent Name Editing ---
  const [isEditingOpponentName, setIsEditingOpponentName] = useState(false);
  const [editedOpponentName, setEditedOpponentName] = useState(opponentName);
  const opponentInputRef = useRef<HTMLInputElement>(null);
  // --- End State ---

  // --- State for Confirmation Modals ---
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEndPeriodConfirm, setShowEndPeriodConfirm] = useState(false);
  const structure: MatchStructure = { numberOfPeriods, periodDurationMinutes, extraTimePeriods, extraTimeMinutes };
  const extraPeriodsPlanned = extraTimePeriodCount(structure);
  // The extra-time panel's choices (review 11.1): 2 periods, futsal 5 / football 15 min.
  const [extraPeriodsChoice, setExtraPeriodsChoice] = useState(2);
  // Untouched, the length follows the game type (it may load after the overlay mounts).
  const [extraMinutesTyped, setExtraMinutesChoice] = useState<number | null>(null);
  const extraMinutesChoice = extraMinutesTyped ?? (gameType === 'futsal' ? 5 : 15);
  const extraMinutesValid = Number.isInteger(extraMinutesChoice) && extraMinutesChoice >= 1 && extraMinutesChoice <= 60;
  const onLastPeriod = isLastPeriod(structure, currentPeriod);
  const endPeriodLabel = onLastPeriod
    ? t('timerOverlay.endMatchButton', 'End match')
    : t('timerOverlay.endPeriodButton', 'End period');
  const periodEndClock = formatTime(periodEndSeconds(structure, currentPeriod));
  const [showOpponentGoalConfirm, setShowOpponentGoalConfirm] = useState(false);
  // Overtime/penalties are edge-of-game actions; keep them collapsed so the
  // substitution-interval list keeps its room. Open by default if OT is already on.
  const [showEndGameControls, setShowEndGameControls] = useState(wentToOvertime);
  // Full-time extra-time panel: closed behind a quiet link until asked for.
  const [showExtraTimePanel, setShowExtraTimePanel] = useState(false);
  // --- End State ---

  // Determine display names (must be before useEffect that depends on it)
  const displayHomeTeamName = homeOrAway === 'home' ? teamName : opponentName;
  const displayAwayTeamName = homeOrAway === 'home' ? opponentName : teamName;

  // --- Effects for Opponent Name Editing ---
  useEffect(() => {
    // Sync edited name with currently displayed name (which changes based on homeOrAway)
    setEditedOpponentName(displayAwayTeamName);
    if (isEditingOpponentName) {
      // Logic here (currently commented out or placeholder)
    }
  }, [displayAwayTeamName, isEditingOpponentName]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingOpponentName) {
      opponentInputRef.current?.focus();
      opponentInputRef.current?.select();
    }
  }, [isEditingOpponentName]);
  // --- End Effects ---

  // The clock is white; the substitution timer walks it through orange to red
  // (a status escalation, not decoration - see config/palette STATUS).
  const clockAlertClass =
    subAlertLevel === 'due' ? 'text-red-400' : subAlertLevel === 'warning' ? 'text-orange-300' : null;

  // Buttons: ONE amber primary (start/pause, or the end-of-game hand-off),
  // everything else quiet. Pills of 56px+ - usable with cold thumbs.
  const focusRingClass = "focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-carbon";
  const actionButtonBase = `min-h-14 px-4 rounded-full flex items-center justify-center gap-2.5 font-ui font-bold text-[clamp(15px,4.5vw,17px)] pointer-events-auto transition-[filter,background-color,color] active:scale-[0.98] disabled:cursor-not-allowed ${focusRingClass}`;
  const primaryActionStyle = `${actionButtonBase} s1-primary disabled:opacity-50`;
  /** Quiet: an outline on near-nothing; disabled reads dimmer still. */
  const secondaryActionStyle = `${actionButtonBase} s1-ghost text-ink disabled:text-ink-3 disabled:bg-transparent disabled:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09)]`;
  /** A light solid pill with dark text: the team's own goal. */
  const lightActionStyle = `${actionButtonBase} bg-[#f0e4f0] text-carbon shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] hover:bg-white`;
  /** Red outline: a result against us (or a live recording). */
  const dangerActionStyle = `${actionButtonBase} text-loss bg-[rgb(255_107_107/0.07)] shadow-[inset_0_0_0_1px_rgb(255_107_107/0.5)] hover:bg-[rgb(255_107_107/0.12)]`;
  const stepperButtonStyle = `w-[46px] h-[46px] rounded-full flex items-center justify-center text-ink bg-surface-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),inset_0_0_0_1px_rgb(255_255_255/0.05)] hover:bg-[#3b2040] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${focusRingClass}`;
  
  // Kirjuri (PR 2): the first press explains + asks for the mic (the app's
  // first runtime permission) before any recording starts.
  const [showDictationIntro, setShowDictationIntro] = React.useState(false);
  const dictationDisabled =
    !!dictation && (!dictation.isSupported || !dictation.available || dictation.permission === 'denied');
  const dictationTitle = !dictation
    ? undefined
    : !dictation.isSupported
      ? t('dictation.unsupported', 'Voice notes are not supported on this device.')
      : !dictation.available
        ? t('dictation.noGame', 'Open a game before dictating.')
        : dictation.permission === 'denied'
          ? t('dictation.permissionDenied', "Microphone access was denied. Allow it in your phone's app settings to dictate notes.")
          : t('dictation.holdToTalk', 'Hold to dictate');
  const handleDictationPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!dictation || dictationDisabled) return;
    if (dictation.needsIntro) {
      setShowDictationIntro(true);
      return;
    }
    dictation.start();
  };
  const handleDictationRelease = () => {
    dictation?.stop();
  };

  const handleConfirmSubClick = () => {
    onSubstitutionMade();
  };

  const handleConfirmReset = () => {
    setShowResetConfirm(true);
  };

  const handleResetConfirmed = () => {
    onResetTimer();
    setShowResetConfirm(false);
  };

  // Calculate time since last substitution
  const timeSinceLastSub = lastSubTime === null ? timeElapsedInSeconds : timeElapsedInSeconds - lastSubTime;
  // "Since sub" only means something once a substitution has been made; until
  // then it would just repeat the period clock.
  const hasMadeSub = completedIntervalDurations.length > 0;
  // The sub-interval adjuster opens from the interval in the info line, so
  // nothing appears or disappears when the clock starts.
  const [showIntervalAdjuster, setShowIntervalAdjuster] = useState(false);
  const intervalText = Number.isInteger(subIntervalMinutes) ? String(subIntervalMinutes) : formatAppDecimal(subIntervalMinutes);
  
  // Full time came early and the period length/count has since been corrected:
  // Start continues the clock instead of staying disabled (review 1.11).
  const continueAfterEnd =
    gameStatus === 'gameEnd'
      ? clockContinuation({ ...structure, timeElapsedInSeconds })
      : null;
  // Nothing to start: the game is over, or a break with no period after it.
  const startDisabled =
    (gameStatus === 'gameEnd' && continueAfterEnd === null) ||
    (gameStatus === 'periodEnd' && onLastPeriod) ||
    !isLoaded;

  // Determine button text based on game status using translations
  let startPauseButtonText = t('timerOverlay.startButton', 'Start'); // Default to Start
  if (gameStatus === 'inProgress') {
    startPauseButtonText = isTimerRunning ? t('timerOverlay.pauseButton', 'Pause') : t('timerOverlay.resumeButton', 'Resume');
  } else if (gameStatus === 'periodEnd') {
    startPauseButtonText = !onLastPeriod
      ? (isExtraTimePeriod(structure, currentPeriod + 1)
        ? t('timerOverlay.startExtraTimePeriod', 'Start extra time {{n}}', { n: currentPeriod + 1 - numberOfPeriods })
        : t('timerOverlay.startPeriodButton', 'Start Period {{period}}', { period: currentPeriod + 1 }))
      : t('timerOverlay.gameOverButton', 'Game Over');
  } else if (gameStatus === 'gameEnd') {
    startPauseButtonText =
      continueAfterEnd?.kind === 'resume'
        ? t('timerOverlay.resumeButton', 'Resume')
        : continueAfterEnd?.kind === 'nextPeriod'
          ? t('timerOverlay.startPeriodButton', 'Start Period {{period}}', { period: continueAfterEnd.period })
          : t('timerOverlay.gameOverButton', 'Game Over');
  }
  
  // --- Handlers for Opponent Name Editing ---
  const handleStartEditingOpponent = () => {
    setEditedOpponentName(displayAwayTeamName); // Reset to currently displayed name on edit start
    setIsEditingOpponentName(true);
  };

  const handleOpponentInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEditedOpponentName(event.target.value);
  };

  const handleSaveOpponentName = () => {
    const trimmedName = editedOpponentName.trim();
    if (trimmedName && trimmedName !== displayAwayTeamName) {
      // Determine which handler to call based on homeOrAway
      // When homeOrAway === 'home': away team is opponent (use onOpponentNameChange)
      // When homeOrAway === 'away': away team is user's team (use onTeamNameChange)
      if (homeOrAway === 'home') {
        onOpponentNameChange(trimmedName);
      } else {
        onTeamNameChange(trimmedName);
      }
    }
    setIsEditingOpponentName(false);
  };

  // An opponent name being edited is saved when the overlay closes too (review 4.17):
  // back with the cursor in the field closed it without a blur and lost the name.
  const saveOpponentOnCloseRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveOpponentOnCloseRef.current = () => {
      if (isEditingOpponentName) handleSaveOpponentName();
    };
  });
  useEffect(() => () => saveOpponentOnCloseRef.current(), []);

  const handleCancelEditOpponent = () => {
    setIsEditingOpponentName(false);
    setEditedOpponentName(displayAwayTeamName); // Reset to currently displayed name
  };

  const handleOpponentKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSaveOpponentName();
    } else if (event.key === 'Escape') {
      handleCancelEditOpponent();
    }
  };
  // --- End Handlers ---

  // The score shows the LIVE situation from our side: both numbers green while
  // we lead, red while we trail, neutral white when level (0-0 included). One
  // colour for the whole score - the old per-team colours showed a 0-0 as one
  // red and one green zero.
  const scoreNumeralClass = liveScoreNumeralClass(homeScore, awayScore, homeOrAway);

  // Compact period label for pill UI. At full time we show no pill - the
  // stopped clock and game-over state already convey the end, and a terse
  // "FT"/"LP" marker read unclearly (esp. in Finnish).
  const periodPillLabel: string | null =
    gameStatus === 'gameEnd'
      ? null
      : isExtraTimePeriod(structure, currentPeriod)
        ? t('timerOverlay.extraTimePill', 'ET {{n}}/{{total}}', { n: currentPeriod - numberOfPeriods, total: extraPeriodsPlanned })
        : `${currentPeriod}/${numberOfPeriods}`;

  const handleOpponentGoalClick = () => {
    setShowOpponentGoalConfirm(true);
  };

  const handleOpponentGoalConfirmed = () => {
    onRecordOpponentGoal();
    setShowOpponentGoalConfirm(false);
  };

  // Game specs string, e.g., "2 x 20 min"
  const regulationSpecs = numberOfPeriods === 1
    ? `${periodDurationMinutes} min`
    : `${numberOfPeriods} × ${periodDurationMinutes} min`;
  const gameSpecs = extraPeriodsPlanned > 0
    ? `${regulationSpecs} + ${extraPeriodsPlanned} × ${extraTimeMinutes} min ${t('timerOverlay.extraTimeShort', 'ET')}`
    : regulationSpecs;
  // Full time, nothing left to continue, and no extra time yet: offer it (review 11.1).
  const offerExtraTime = Boolean(onStartExtraTime) && gameStatus === 'gameEnd'
    && extraPeriodsPlanned === 0 && continueAfterEnd === null && !isTimerRunning;
  const scoreLevel = homeScore === awayScore;
  const clockText = formatTime(timeElapsedInSeconds);
  // Full time with somewhere to go (D3b): the hand-off is the one big action
  // and the clock steps down to a small readout above it.
  const finishMode = gameStatus === 'gameEnd' && Boolean(onFinishGame);
  // The next planned change (D3c): a group due now, amber, for its short due
  // window (usePlannedSubPrompts); otherwise the next one ahead, quiet. Never
  // after full time - the plan has nothing left to say then.
  const shownSubGroup = gameStatus === 'gameEnd' ? null : plannedSubGroup;
  const shownSubDue = shownSubGroup !== null && shownSubGroup.due !== false;
  // A change planned for the end of a regulation period happens at the break.
  const shownSubAtBreak = shownSubGroup !== null
    && Array.from({ length: Math.max(0, numberOfPeriods - 1) }, (_, i) => periodEndSeconds(structure, i + 1))
      .includes(shownSubGroup.timeSeconds);

  return (
    // Full screen over the pitch; the control capsule (z-40) floats over its
    // bottom edge. The capsule sits in the match control strip (GameContainer):
    // 1px border + 12px top padding + the 56px capsule (ControlBar h-14) +
    // 12px bottom padding + the safe-area inset = 81px + inset. The content
    // scrolls with that much room plus a 24px gap, so the last row always
    // clears the capsule - including the inset, which lifts it on phones with
    // a gesture bar.
    <div
      className="fixed inset-0 z-30 flex flex-col items-center px-4 pt-[30px] pb-[calc(81px+24px+env(safe-area-inset-bottom,0px))] overflow-y-auto font-ui text-ink backdrop-blur-lg"
      style={{ background: 'radial-gradient(110% 38% at 50% -8%, rgb(54 26 60 / 0.7) 0%, transparent 72%), rgb(23 10 24 / 0.975)' }}
    >
      <div className="w-full max-w-lg flex flex-col items-center">
        {/* Game Score Display - MOVED TO TOP ABOVE TIMER.
            3-column grid so long team names wrap inside their own column while
            the score stays fixed in the centre and vertically centred against
            both names (a plain flex row let the score drift when a name wrapped). */}
        {/* Both names in ONE style (white, same size), each in its own
            equal column so the score sits in the middle whatever they are
            called. minmax(0,1fr) lets a column narrow below its text: a long
            name shrinks (clamp) and then wraps to at most two lines and
            truncates, instead of pushing into the score. */}
        <div className="mb-4 w-full">
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 text-[clamp(13px,3.9vw,17px)] font-semibold">
            <span className="text-ink text-right leading-tight line-clamp-2 break-words text-balance" title={displayHomeTeamName}>{displayHomeTeamName}</span>
            <span className="flex items-center justify-center gap-2.5 whitespace-nowrap">
              {/* NUMBERS LEAD (owner, 2026-09-16). The team names stay at
                  text-xl; only the score grows, because the score is what is
                  glanced at from the touchline and the names are already
                  known. SteadyDigits so a two-digit score cannot shunt the
                  centred row sideways - the same Rajdhani problem the clock
                  below has. */}
              <SteadyDigits className={`font-display italic font-extrabold text-[40px] leading-none pr-[3px] ${scoreNumeralClass}`}>
                {String(homeScore)}
              </SteadyDigits>
              <span className="text-ink-3 text-[22px]">-</span>
              <SteadyDigits className={`font-display italic font-extrabold text-[40px] leading-none pr-[3px] ${scoreNumeralClass}`}>
                {String(awayScore)}
              </SteadyDigits>
            </span>
            {/* --- Opponent Name Display/Edit --- */}
            {isEditingOpponentName ? (
                <input
                    ref={opponentInputRef}
                    type="text"
                    value={editedOpponentName}
                    onChange={handleOpponentInputChange}
                    onBlur={handleSaveOpponentName} // Save on blur
                    onKeyDown={handleOpponentKeyDown}
                    className={`${inlineFieldStyle} w-full! min-w-0 justify-self-start`}
                    onClick={(e) => e.stopPropagation()} // Prevent triggering underlying handlers
                />
            ) : (
                <span
                    className="text-ink text-left leading-tight line-clamp-2 break-words text-balance cursor-pointer"
                    onClick={handleStartEditingOpponent} // Click to edit
                    title={t('timerOverlay.editOpponentNameTitle', 'Click to edit opponent name') ?? undefined}
                >
                    {displayAwayTeamName}
                </span>
            )}
            {/* --- End Opponent Name --- */}
          </div>
        </div>
      
        {/* Timer Display */}
        {/* SteadyDigits boxes every digit, so the clock cannot slide sideways
            as digits tick over. ONE line, always: the font size is the
            content box's width (cqw, from the container below) divided by the
            clock's boxed width in em, so it fits exactly at any phone width
            and text size. The boxed width depends only on how many characters
            the clock has, never on which digits, so the size holds still
            while it ticks (it steps down once, at 100:00). */}
        <div className="mb-1 w-full" style={{ containerType: 'inline-size' }} data-testid="timer-clock">
          <div
            className="flex justify-center whitespace-nowrap"
            style={{ fontSize: finishMode ? '2.75rem' : `min(10rem, calc(100cqw / ${clockWidthEm(clockText)}))` }}
          >
            <SteadyDigits className={`block font-display italic font-extrabold leading-none tracking-[-0.01em] pr-[0.06em] ${clockAlertClass ?? 's1-numeral'}`}>
              {clockText}
            </SteadyDigits>
          </div>
        </div>

        {/* Info line: period pill · game length · sub interval. The interval
            is a button that opens the - / + adjuster below, so the row is the
            same before kick-off and while the clock runs - nothing shifts the
            buttons under the coach's thumb. */}
        <div className="text-center flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
          {periodPillLabel && (
            <span className="inline-flex items-center px-3 py-[5px] rounded-full text-sm font-bold bg-white/[0.12] shadow-[inset_0_1px_0_rgb(255_255_255/0.16)] text-ink">
              {periodPillLabel}
            </span>
          )}
          <span className="text-[15px] font-medium text-ink-2 whitespace-nowrap">{gameSpecs}</span>
          <span className="text-ink-3" aria-hidden="true">·</span>
          <button
            type="button"
            data-testid="timer-sub-interval"
            onClick={() => setShowIntervalAdjuster((v) => !v)}
            aria-expanded={showIntervalAdjuster}
            title={t('timerOverlay.subIntervalLabel', 'Sub Interval:').replace(/:\s*$/, '')}
            className={`inline-flex items-center gap-1 min-h-11 -my-2 px-2 rounded-full text-[15px] font-medium text-ink-2 whitespace-nowrap hover:text-ink hover:bg-white/[0.06] ${focusRingClass}`}
          >
            {t('timerOverlay.subIntervalInline', 'sub {{minutes}} min', { minutes: intervalText })}
            <HiOutlineChevronDown aria-hidden className={`w-4 h-4 text-ink-3 transition-transform ${showIntervalAdjuster ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {/* Time since the last substitution - only once there has been one.
            The row keeps its height either way, so the first sub does not
            push the buttons down. */}
        <div className="mb-4 mt-1 h-6 flex items-center justify-center text-sm font-medium text-ink-3" data-testid="timer-since-sub">
          {hasMadeSub && gameStatus !== 'notStarted' && (
            <span>
              {t('timerOverlay.sinceSub', 'Since sub')}{' '}
              <SteadyDigits className="text-ink-2 font-semibold">{formatTime(timeSinceLastSub)}</SteadyDigits>
            </span>
          )}
        </div>

        {/* Full time (D3b): one clear hand-off into "Finish this game", right
            under the clock, which has stepped down to a small readout. */}
        {finishMode && onFinishGame && (
          <button
            type="button"
            onClick={() => { onClose?.(); onFinishGame(); }}
            data-testid="timer-finish-game"
            className={`${primaryActionStyle} w-full min-h-16 text-xl mb-4`}
          >
            {/* No count here (review R7): an "x/y" on this button read as steps
                to work through. What is left lives on the finish screen. */}
            {t('timerOverlay.finishGameButton', 'Finish this game')}
          </button>
        )}

        {/* Substitution interval adjuster, opened from the info line. */}
        {showIntervalAdjuster && (
          <div className="w-full mb-4 s1-list min-h-[60px] flex items-center justify-between gap-3 pl-[18px] pr-2">
            {/* The label's trailing colon is a leftover of the inline layout. */}
            <span className="text-base font-medium text-ink">{t('timerOverlay.subIntervalLabel', 'Sub Interval:').replace(/:\s*$/, '')}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onSetSubInterval(subIntervalMinutes - 0.5)}
                // 1 minute is the real minimum (the reducer clamps to it, review 4.33):
                // at 1 the button used to stay enabled and do nothing.
                disabled={subIntervalMinutes <= 1}
                className={stepperButtonStyle} aria-label={t('timerOverlay.decreaseInterval', 'Decrease interval')}>
                <HiOutlineMinus className="w-6 h-6" aria-hidden="true" />
              </button>
              <span className="min-w-11 px-1 text-center font-display italic font-extrabold text-[30px] leading-none text-ink">
                {intervalText}
              </span>
              <button
                onClick={() => onSetSubInterval(subIntervalMinutes + 0.5)}
                className={stepperButtonStyle} aria-label={t('timerOverlay.increaseInterval', 'Increase interval')}>
                <HiOutlinePlus className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Timer Controls */}
        <div className="flex w-full items-center gap-3 mb-3">
          <button
            onClick={onStartPauseTimer}
            data-testid="tour-timer-startpause"
            disabled={startDisabled} // Game over (nothing left to play) OR not loaded
            className={`${finishMode ? secondaryActionStyle : primaryActionStyle} flex-1 ${finishMode ? 'min-h-14 text-base' : 'min-h-16 text-xl'}`}
            aria-label={isTimerRunning ? t('timerOverlay.pauseButton', 'Pause') : t('timerOverlay.startButton', 'Start')}
          >
            {isTimerRunning ? <FaPause size={18}/> : <FaPlay size={18}/>}
            <span>{startPauseButtonText}</span>
          </button>
          {/* End the period now (review 4.31): the referee blew early, or the clock
              was set up longer than the match. Confirmed first - one stray tap must
              never end a half. */}
          {onEndPeriod && gameStatus === 'inProgress' && (
            <button
              type="button"
              onClick={() => setShowEndPeriodConfirm(true)}
              data-testid="timer-end-period"
              className={`${secondaryActionStyle} min-h-16 text-base`}
            >
              {endPeriodLabel}
            </button>
          )}
          {/* Compact reset: icon-only + confirm */}
          <button
            onClick={handleConfirmReset}
            className={`w-16 h-16 shrink-0 rounded-full flex items-center justify-center text-ink s1-glass hover:brightness-125 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${focusRingClass}`}
            title={t('timerOverlay.resetButton', 'Reset') ?? undefined}
            aria-label={t('timerOverlay.resetButton', 'Reset')}
            disabled={timeElapsedInSeconds === 0 && gameStatus === 'notStarted'} // Only disable if truly at start
          >
            <FaUndo size={18}/>
          </button>
        </div>

        {/* Goal buttons, straight under start/pause (owner, 2026-11-19):
            the two taps a coach makes mid-play stay on the first screen at
            every phone size, never below the plan or behind the capsule.
            Our goal is the common one: a light solid button at ~60% of the
            row; the opponent's goal stays a red outline at ~40% (7:5, so
            "Vastustaja +1" still fits one line on a 320px phone). */}
        <div className="grid w-full grid-cols-[7fr_5fr] gap-2.5 mb-5" data-testid="timer-goal-buttons">
          <button
            type="button"
            onClick={onToggleGoalLogModal}
            data-testid="tour-log-goal"
            className={`${lightActionStyle} min-w-0 px-3 whitespace-nowrap`}
            title={`${displayHomeTeamName} ${t('timerOverlay.goalSuffix', 'goal')}`}
          >
            {t('timerOverlay.teamGoalButton', 'Goal for us')}
          </button>
          <button 
            onClick={handleOpponentGoalClick} 
            className={`${dangerActionStyle} min-w-0 px-2 whitespace-nowrap text-[clamp(14px,4.3vw,17px)]!`}
            title={`${displayAwayTeamName} ${t('timerOverlay.goalSuffix', 'goal')}`}
          >
            {t('timerOverlay.opponentGoalButton', 'Opponent +1')}
          </button>
        </div>

        {/* Full time: extra time / penalties is a quiet link (review R7), not a
            second amber button under "Finish this game" - most matches end
            here. The link opens the same panel. */}
        {offerExtraTime && !showExtraTimePanel && (
          <button
            type="button"
            onClick={() => setShowExtraTimePanel(true)}
            data-testid="extra-time-link"
            className={`mb-3 min-h-11 px-3 rounded-full text-[15px] font-medium text-ink-2 underline underline-offset-4 decoration-white/30 hover:text-ink ${focusRingClass}`}
          >
            {t('timerOverlay.extraTimeLink', 'Extra time or penalties')}
          </button>
        )}
        {offerExtraTime && showExtraTimePanel && (
          <div
            data-testid="extra-time-panel"
            className="w-full mb-3 p-4 s1-list"
          >
            <div className="text-base font-semibold text-ink">{t('timerOverlay.extraTimeTitle', 'Extra time')}</div>
            {scoreLevel && (
              <p className="text-sm text-ink-2 mt-0.5">{t('timerOverlay.extraTimeLevelHint', 'The score is level.')}</p>
            )}
            <div className="flex items-center gap-2 mt-3">
              {[1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setExtraPeriodsChoice(n)}
                  aria-pressed={extraPeriodsChoice === n}
                  aria-label={t('timerOverlay.extraTimePeriodCount', '{{count}} periods', { count: n })}
                  className={`${extraPeriodsChoice === n ? chipSelectedStyle : chipStyle} min-h-11 px-4`}
                >
                  {n} ×
                </button>
              ))}
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                value={Number.isFinite(extraMinutesChoice) ? extraMinutesChoice : ''}
                onChange={(e) => setExtraMinutesChoice(Number.parseInt(e.target.value, 10))}
                aria-label={t('timerOverlay.extraTimeMinutes', 'Minutes per period')}
                className={`${inlineFieldStyle} w-20! text-center`}
              />
              <span className="text-sm text-ink-3">{t('timerOverlay.minutesShort', 'min')}</span>
            </div>
            {/* Stacked on narrow phones: "Rangaistuspotkut" is one long word. */}
            <div className="flex flex-col min-[400px]:flex-row gap-2 mt-3">
              <button
                type="button"
                data-testid="start-extra-time"
                disabled={!extraMinutesValid}
                onClick={() => onStartExtraTime?.(extraPeriodsChoice, extraMinutesChoice)}
                className={`${secondaryActionStyle} flex-1 text-base`}
              >
                {t('timerOverlay.startExtraTime', 'Start extra time')}
              </button>
              <button type="button" onClick={onRecordShootout} className={`${secondaryActionStyle} flex-1 text-base`}>
                {t('timerOverlay.recordShootout', 'Penalties')}
              </button>
            </div>
          </div>
        )}

        {/* The next planned change (Playing-Time Planner, D3c): every change
            planned for one moment, as one block. Persistent - no dismiss, no
            "OK", and it records nothing: it moves on by itself once its time
            has passed. Amber while due, quiet while still ahead. Shown
            before kick-off and through the breaks (half-time is exactly when
            planned subs happen), never after full time.
            Compact (owner, 2026-11-19): two short lines with the disc names
            (nickname, else first name) behind an arrow - up = on, down = off.
            Screen readers get the words "On"/"Off" and the full names instead
            (sr-only text; the arrows and short names are aria-hidden). */}
        {shownSubGroup && (
          <div
            role="status"
            data-testid="planned-sub-group"
            data-due={shownSubDue ? 'true' : 'false'}
            className={`w-full mb-3 px-4 py-3 text-left rounded-[18px] ${
              shownSubDue
                ? 'bg-[linear-gradient(180deg,rgb(250_221_21/0.16),rgb(250_221_21/0.07))] shadow-[inset_0_0_0_1.5px_rgb(250_221_21/0.75)]'
                : 's1-list'
            }`}
          >
            <div className={`text-xs font-bold uppercase tracking-[0.14em] ${shownSubDue ? 'text-action' : 'text-ink-3'}`}>
              {t('timerOverlay.plannedSubTitle', 'Next change')} · {formatTime(shownSubGroup.timeSeconds)}
              {shownSubAtBreak && (
                <span className="normal-case tracking-normal"> ({t('timerOverlay.plannedSubAtBreak', 'at the break')})</span>
              )}
              {shownSubDue && plannedSubsEarlier > 0 && (
                <span className="ml-2 normal-case tracking-normal font-medium text-ink-3">
                  {t('timerOverlay.plannedSubsEarlier', '+{{count}} earlier', { count: plannedSubsEarlier })}
                </span>
              )}
            </div>
            <p
              className="mt-1 flex items-baseline gap-2 text-[15px] font-semibold text-ink"
              data-testid="planned-sub-on"
            >
              <span aria-hidden="true" className="w-3 shrink-0 text-center text-win">↑</span>
              <span aria-hidden="true" className="min-w-0">{shownSubGroup.inShortNames.join(', ')}</span>
              <span className="sr-only">{t('timerOverlay.plannedSubsOn', 'On')}: {shownSubGroup.inNames.join(', ')}</span>
            </p>
            {shownSubGroup.outNames.length > 0 && (
              <p
                className="flex items-baseline gap-2 text-[15px] font-medium text-ink-2"
                data-testid="planned-sub-off"
              >
                <span aria-hidden="true" className="w-3 shrink-0 text-center text-loss">↓</span>
                <span aria-hidden="true" className="min-w-0">{shownSubGroup.outShortNames.join(', ')}</span>
                <span className="sr-only">{t('timerOverlay.plannedSubsOff', 'Off')}: {shownSubGroup.outNames.join(', ')}</span>
              </p>
            )}
          </div>
        )}

        {/* Secondary actions, below the plan (owner, 2026-11-19): the
            legacy assess hand-off, "Sub done", dictation, and the
            overtime / penalties expander. */}
        <div className="w-full mb-3 space-y-3">
          <div className="flex flex-col gap-2.5">
            {/* Legacy fallback for hosts that do not wire onFinishGame. */}
            {gameStatus === 'gameEnd' && !onFinishGame && onOpenPlayerAssessmentModal && (
              <button
                type="button"
                onClick={() => { onClose?.(); onOpenPlayerAssessmentModal(); }}
                className={`${primaryActionStyle} w-full`}
              >
                {t('timerOverlay.assessPlayersButton', 'Assess players')}
              </button>
            )}
            {/* Sub done (D13; was "Substitution made"): restarts the
                interval countdown and records nothing about who came on. A
                quiet pill, dimmed while the clock is stopped. Hidden where the
                host says so (the basic layout). */}
            {showSubTimerReset && (
            <div className="flex justify-center">
              <button 
                onClick={handleConfirmSubClick}
                disabled={!(gameStatus === 'inProgress' && isTimerRunning)}
                aria-disabled={!(gameStatus === 'inProgress' && isTimerRunning)}
                title={!(gameStatus === 'inProgress' && isTimerRunning) ? t('timerOverlay.disabledWhenPaused', 'Disabled while paused') ?? undefined : undefined}
                className={`${secondaryActionStyle} w-full`}
              >
                {t('timerOverlay.confirmSubButton', 'Sub done')}
              </button>
            </div>
            )}
            
            {/* Kirjuri voice note (PR 2): one full-width press-hold row.
                Release = stop. Space/Enter toggle for keyboards. */}
            {dictation && (
              <>
                <button
                  type="button"
                  data-testid="dictation-hold"
                  onPointerDown={handleDictationPress}
                  onPointerUp={handleDictationRelease}
                  onPointerCancel={handleDictationRelease}
                  onPointerLeave={handleDictationRelease}
                  onContextMenu={(event) => event.preventDefault()}
                  onKeyDown={(event) => {
                    if (event.key !== ' ' && event.key !== 'Enter') return;
                    event.preventDefault();
                    if (event.repeat) return; // a held key must not toggle on every auto-repeat
                    if (dictation.isRecording) dictation.stop();
                    else if (dictation.needsIntro) setShowDictationIntro(true);
                    else if (!dictationDisabled) dictation.start();
                  }}
                  disabled={dictationDisabled}
                  aria-disabled={dictationDisabled}
                  aria-pressed={dictation.isRecording}
                  title={dictationTitle}
                  className={`${dictation.isRecording ? dangerActionStyle : secondaryActionStyle} w-full touch-none select-none`}
                >
                  <HiOutlineMicrophone aria-hidden className={`h-5 w-5 ${dictation.isRecording ? 'animate-pulse' : ''}`} />
                  <span>
                    {dictation.isRecording
                      ? t('dictation.recording', 'Recording...')
                      : t('dictation.holdToTalk', 'Hold to dictate')}
                  </span>
                  {dictation.clipCount > 0 && !dictation.isRecording && (
                    <span
                      data-testid="dictation-clip-count"
                      className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-ink"
                      aria-label={t('dictation.clipCount', '{{count}} voice notes', { count: dictation.clipCount })}
                    >
                      {dictation.clipCount}
                    </span>
                  )}
                </button>
                <ConfirmationModal
                  isOpen={showDictationIntro}
                  title={t('dictation.firstRunTitle', 'Voice notes')}
                  message={t(
                    'dictation.firstRunBody',
                    'Hold the button and speak - one observation per note. Recordings stay on this phone. PePo Ops will now ask for microphone access.',
                  )}
                  confirmLabel={t('dictation.firstRunConfirm', 'Continue')}
                  cancelLabel={t('common.cancel', 'Cancel')}
                  variant="primary"
                  onConfirm={() => {
                    setShowDictationIntro(false);
                    dictation.acknowledgeIntro();
                  }}
                  onCancel={() => setShowDictationIntro(false)}
                />
              </>
            )}
          </div>

          {/* Overtime / penalties — edge-of-game actions, tucked behind an
              expander so the substitution-interval list keeps its room. Still
              one tap away at any game state (the timer often lags reality). */}
          <div className="s1-list">
            <button
              type="button"
              onClick={() => setShowEndGameControls((v) => !v)}
              aria-expanded={showEndGameControls}
              className={`w-full min-h-14 flex items-center justify-between gap-2 pl-[18px] pr-3.5 rounded-[22px] text-base font-medium text-ink-2 hover:text-ink ${focusRingClass}`}
            >
              <span className="flex items-center gap-2">
                {wentToOvertime && <span className="text-action" aria-hidden>✓</span>}
                <span className="text-left">{t('timerOverlay.wentToOvertime', 'Overtime')} / {t('timerOverlay.recordShootout', 'Penalties')}</span>
              </span>
              <HiOutlineChevronDown aria-hidden className={`w-6 h-6 text-ink-3 transition-transform ${showEndGameControls ? 'rotate-180' : ''}`} />
            </button>
            {showEndGameControls && (
              <div className="flex gap-2 px-3 pb-3">
                {/* OT as a toggle chip (matches the button UI), not a bare checkbox */}
                <button
                  type="button"
                  onClick={() => onWentToOvertimeChange(!wentToOvertime)}
                  aria-pressed={wentToOvertime}
                  className={`${wentToOvertime ? chipSelectedStyle : chipStyle} flex-1 justify-center min-h-12 text-[15px]`}
                >
                  {wentToOvertime ? '✓ ' : ''}{t('timerOverlay.wentToOvertime', 'Overtime')}
                </button>
                <button
                  type="button"
                  onClick={onRecordShootout}
                  className={`${secondaryActionStyle} flex-1 min-h-12 text-[15px]`}
                >
                  {t('timerOverlay.recordShootout', 'Penalties')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Play Time History - show recent items only to reduce clutter */}
        {completedIntervalDurations.length > 0 && (
          <div className="w-full s1-list p-3 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
            <h3 className={`${sectionLabelStyle} mb-1.5 text-center`}>{t('timerOverlay.historyTitle', 'Play Time History')}</h3>
            <ul className="list-none text-sm space-y-0.5 text-center">
              {completedIntervalDurations.slice(0, 5).map((log, displayIndex) => {
                const minutes = Math.floor(log.duration / 60);
                const seconds = log.duration % 60;
                const isLatest = displayIndex === 0;

                // Simple color - latest bright, others dimmed
                const colorClass = isLatest ? 'text-ink' : 'text-ink-3';

                // Format time: show minutes only if > 0
                const timeDisplay = minutes > 0
                  ? `${minutes} m ${seconds} s`
                  : `${seconds} s`;

                return (
                  <li
                    key={`${log.timestamp}-${displayIndex}`}
                    className={`font-medium ${colorClass}`}
                  >
                    {timeDisplay}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Close affordance removed: the overlay is dismissed via the bottom-bar
          timer button (same toggle as onClose) and the Android back button, so
          the corner X was a redundant control. onClose stays wired for the
          internal "close then open assessments" path. */}

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={showResetConfirm}
        title={t('timerOverlay.confirmResetTitle', 'Reset Timer')}
        message={t('timerOverlay.confirmReset', 'Reset the match clock?')}
        onConfirm={handleResetConfirmed}
        onCancel={() => setShowResetConfirm(false)}
        confirmLabel={t('common.reset', 'Reset')}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={showEndPeriodConfirm}
        title={endPeriodLabel}
        message={onLastPeriod
          ? t('timerOverlay.confirmEndMatch', 'End the match now? The clock moves to {{time}}, full time.', { time: periodEndClock })
          : t('timerOverlay.confirmEndPeriod', 'End period {{period}} now? The clock moves to {{time}}, the end of the period.', {
            period: currentPeriod,
            time: periodEndClock,
          })}
        onConfirm={() => { setShowEndPeriodConfirm(false); onEndPeriod?.(); }}
        onCancel={() => setShowEndPeriodConfirm(false)}
        confirmLabel={endPeriodLabel}
        variant="primary"
      />

      <ConfirmationModal
        isOpen={showOpponentGoalConfirm}
        title={t('timerOverlay.confirmOpponentGoalTitle', 'Record Opponent Goal')}
        message={t('timerOverlay.confirmOpponentGoal', 'Add opponent goal?')}
        onConfirm={handleOpponentGoalConfirmed}
        onCancel={() => setShowOpponentGoalConfirm(false)}
        confirmLabel={t('common.confirm', 'Confirm')}
        variant="primary"
      />
    </div>
  );
};

export default TimerOverlay; 
