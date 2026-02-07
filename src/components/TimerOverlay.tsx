'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FaPlay, FaPause, FaUndo } from 'react-icons/fa'; // Import icons
import { useTranslation } from 'react-i18next'; // Import translation hook
import { IntervalLog, SubAlertLevel } from '@/types'; // Import types
import { formatTime } from '@/utils/time';
import logger from '@/utils/logger';
import ConfirmationModal from './ConfirmationModal';


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
  onToggleGoalLogModal?: () => void;
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
  onClose?: () => void;
  isLoaded: boolean;
}

const TimerOverlay: React.FC<TimerOverlayProps> = ({
  timeElapsedInSeconds,
  subAlertLevel,
  onSubstitutionMade,
  completedIntervalDurations,
  subIntervalMinutes,
  onSetSubInterval,
  isTimerRunning,
  onStartPauseTimer,
  onResetTimer,
  onToggleGoalLogModal = () => { logger.warn('onToggleGoalLogModal handler not provided'); },
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
  onClose,
  isLoaded,
}) => {
  const { t } = useTranslation(); // Initialize translation hook

  // --- State for Opponent Name Editing ---
  const [isEditingOpponentName, setIsEditingOpponentName] = useState(false);
  const [editedOpponentName, setEditedOpponentName] = useState(opponentName);
  const opponentInputRef = useRef<HTMLInputElement>(null);
  // --- End State ---

  // --- State for Confirmation Modals ---
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showOpponentGoalConfirm, setShowOpponentGoalConfirm] = useState(false);
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

  // Determine text color based on alert status directly from prop
  let textColor = 'text-slate-100'; // Base text color
  if (subAlertLevel === 'due') {
    textColor = 'text-red-400'; // Use a subtler red
  } else if (subAlertLevel === 'warning') {
    textColor = 'text-orange-300'; // Use a subtler orange
  }

  // Determine background color - REMOVE alert level logic
  const bgColor = 'bg-slate-900/85'; // Always use default background
  
  // Consistent button styles (simplified for overlay)
  const timerButtonStyle = "text-white font-semibold py-2 px-5 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors duration-150 flex items-center justify-center space-x-2";
  const controlButtonStyle = "text-slate-100 font-bold py-1 px-3 rounded shadow bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-lg active:scale-95";
  const controlValueStyle = "text-slate-100 font-bold text-lg tabular-nums w-8 mx-2 text-center";
  const controlLabelStyle = "text-sm font-medium text-slate-300 mr-2";
  // Add action button styles for consistency - flat style with subtle border
  const actionButtonBase = "text-white font-bold py-2.5 px-4 rounded-sm pointer-events-auto text-base transition-colors";
  const primaryActionStyle = `${actionButtonBase} bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 border border-indigo-400/30`;
  const secondaryActionStyle = `${actionButtonBase} bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 border border-indigo-400/30`;
  const dangerActionStyle = `${actionButtonBase} bg-red-700 hover:bg-red-600 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900 border border-red-500/30`;
  
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
  
  // Determine button text based on game status using translations
  let startPauseButtonText = t('timerOverlay.startButton', 'Start'); // Default to Start
  if (gameStatus === 'inProgress') {
    startPauseButtonText = isTimerRunning ? t('timerOverlay.pauseButton', 'Pause') : t('timerOverlay.resumeButton', 'Resume');
  } else if (gameStatus === 'periodEnd') {
    startPauseButtonText = currentPeriod < numberOfPeriods 
      ? t('timerOverlay.startPeriodButton', 'Start Period {{period}}', { period: currentPeriod + 1 })
      : t('timerOverlay.gameOverButton', 'Game Over');
  } else if (gameStatus === 'gameEnd') {
    startPauseButtonText = t('timerOverlay.gameOverButton', 'Game Over');
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

  // Determine score colors based on homeOrAway status
  const userTeamColor = 'text-green-400';
  const opponentTeamColor = 'text-red-400';

  const homeScoreDisplayColor = homeOrAway === 'home' ? userTeamColor : opponentTeamColor;
  const awayScoreDisplayColor = homeOrAway === 'away' ? userTeamColor : opponentTeamColor;

  // Compact period label for pill UI
  let periodPillLabel: string | null = null;
  if (gameStatus === 'gameEnd') {
    periodPillLabel = t('timerOverlay.fullTime', 'FT');
  } else {
    periodPillLabel = `${currentPeriod}/${numberOfPeriods}`;
  }

  const handleOpponentGoalClick = () => {
    setShowOpponentGoalConfirm(true);
  };

  const handleOpponentGoalConfirmed = () => {
    onRecordOpponentGoal();
    setShowOpponentGoalConfirm(false);
  };

  // Game specs string, e.g., "2 x 20 min"
  const gameSpecs = numberOfPeriods === 1
    ? `${periodDurationMinutes} min`
    : `${numberOfPeriods} x ${periodDurationMinutes} min`;

  return (
    <div className={`fixed inset-x-0 top-0 bottom-14 z-30 flex flex-col items-center p-3 pt-6 ${bgColor} backdrop-blur-lg`}>
      <div className="w-full max-w-lg flex flex-col items-center mt-2 sm:mt-4 md:mt-6">
        {/* Game Score Display - MOVED TO TOP ABOVE TIMER */}
        <div className="mb-4">
          <div className="flex items-center justify-center gap-3 text-xl font-semibold">
            <span className="text-slate-400">{displayHomeTeamName}</span>
            <span className={`text-2xl font-bold ${homeScoreDisplayColor}`}>{homeScore}</span>
            <span className="text-slate-500">-</span>
            <span className={`text-2xl font-bold ${awayScoreDisplayColor}`}>{awayScore}</span>
            {/* --- Opponent Name Display/Edit --- */}
            {isEditingOpponentName ? (
                <input
                    ref={opponentInputRef}
                    type="text"
                    value={editedOpponentName}
                    onChange={handleOpponentInputChange}
                    onBlur={handleSaveOpponentName} // Save on blur
                    onKeyDown={handleOpponentKeyDown}
                    className="bg-slate-700 text-slate-100 text-xl font-semibold outline-none rounded px-2 py-0.5 w-28" // Adjust width as needed
                    onClick={(e) => e.stopPropagation()} // Prevent triggering underlying handlers
                />
            ) : (
                <span
                    className="text-slate-400 cursor-pointer hover:text-slate-300"
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
        <div className="mb-2">
          <span className={`text-9xl sm:text-[10rem] font-bold tabular-nums ${textColor}`}>
            {formatTime(timeElapsedInSeconds)}
          </span>
        </div>

        {/* Time Since Last Substitution + Period pill + Game specs */}
        <div className="mb-3 text-center flex items-center justify-center gap-3">
          {gameStatus !== 'notStarted' && (
            <span className="text-sm font-medium text-slate-400">
              {t('timerOverlay.timeSinceLastSubCombined', 'Last sub:')}{' '}
              <span className="tabular-nums text-slate-300 font-semibold">{formatTime(timeSinceLastSub)}</span>
            </span>
          )}
          {periodPillLabel && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-700 text-slate-200 border border-slate-600">
              {periodPillLabel}
            </span>
          )}
          <span className="text-xs font-medium text-slate-400">{gameSpecs}</span>
        </div>

        {/* Timer Controls */}
        <div className="flex items-center gap-3 mb-3"> 
          <button 
            onClick={onStartPauseTimer} 
            disabled={gameStatus === 'gameEnd' || !isLoaded} // Disable when game ended OR NOT LOADED
            className={`${timerButtonStyle} ${isTimerRunning ? 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-400' : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'} ${gameStatus === 'gameEnd' || !isLoaded ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label={isTimerRunning ? t('timerOverlay.pauseButton', 'Pause') : t('timerOverlay.startButton', 'Start')}
          >
            {isTimerRunning ? <FaPause size={16}/> : <FaPlay size={16}/>} 
            <span>{startPauseButtonText}</span>
          </button>
          {/* Compact reset: icon-only + confirm */}
          <button 
            onClick={handleConfirmReset}
            className={`${timerButtonStyle} bg-slate-700 hover:bg-slate-600 focus:ring-slate-500 px-3`}
            title={t('timerOverlay.resetButton', 'Reset') ?? undefined}
            aria-label={t('timerOverlay.resetButton', 'Reset')}
            disabled={timeElapsedInSeconds === 0 && gameStatus === 'notStarted'} // Only disable if truly at start
          >
            <FaUndo size={14}/>
          </button>
        </div>
        
        {/* Game Setup & Interval Controls Section */}
        <div className="bg-slate-800/80 backdrop-blur-sm p-2 rounded-lg w-full mb-3 space-y-2">
          {/* Substitution Interval Control (only when game not started) */}
          {gameStatus === 'notStarted' && (
              <div className="flex items-center justify-center">
              <span className={controlLabelStyle}>{t('timerOverlay.subIntervalLabel', 'Sub Interval:')}</span>
              <div className="flex items-center">
                <button
                  onClick={() => onSetSubInterval(subIntervalMinutes - 0.5)}
                  disabled={subIntervalMinutes <= 0.5}
                  className={controlButtonStyle} aria-label={t('timerOverlay.decreaseInterval', 'Decrease interval')}>
                  -
                </button>
                <span className={controlValueStyle}>
                  {Number.isInteger(subIntervalMinutes) ? subIntervalMinutes : subIntervalMinutes.toFixed(1)}
                </span>
                <button
                  onClick={() => onSetSubInterval(subIntervalMinutes + 0.5)}
                  className={controlButtonStyle} aria-label={t('timerOverlay.increaseInterval', 'Increase interval')}>
                  +
                </button>
              </div>
              </div>
            )}
            
          {/* Main Action Buttons Section - Improved layout */}
          <div className="flex flex-col space-y-2">
            {/* Primary Action Button - Remove pulsingClass */}
            <div className="flex justify-center">
              <button 
                onClick={handleConfirmSubClick}
                disabled={!(gameStatus === 'inProgress' && isTimerRunning)}
                aria-disabled={!(gameStatus === 'inProgress' && isTimerRunning)}
                title={!(gameStatus === 'inProgress' && isTimerRunning) ? t('timerOverlay.disabledWhenPaused', 'Disabled while paused') ?? undefined : undefined}
                className={`${primaryActionStyle} w-full ${!(gameStatus === 'inProgress' && isTimerRunning) ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {t('timerOverlay.confirmSubButton', 'Vaihto tehty')}
              </button>
            </div>
            
            {/* Goal Buttons - Side by side layout */}
            <div className="flex gap-2 pt-1">
              <button 
                onClick={onToggleGoalLogModal} 
                className={`${secondaryActionStyle} flex-1`}
                title={`${displayHomeTeamName} ${t('timerOverlay.goalSuffix', 'goal')}`}
              >
                {t('timerOverlay.teamGoalButton', 'Kirjaa maali')}
              </button>
              <button 
                onClick={handleOpponentGoalClick} 
                className={`${dangerActionStyle} flex-1`}
                title={`${displayAwayTeamName} ${t('timerOverlay.goalSuffix', 'goal')}`}
              >
                {t('timerOverlay.opponentGoalButton', 'Vastustaja +1')}
              </button>
            </div>
          </div>
        </div>

        {/* Play Time History - show recent items only to reduce clutter */}
        {completedIntervalDurations.length > 0 && (
          <div className="bg-slate-800/60 backdrop-blur-sm p-2 rounded-lg max-h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50">
            <h3 className="text-xs font-semibold mb-1 text-center text-slate-300">{t('timerOverlay.historyTitle', 'Play Time History')}</h3>
            <ul className="list-none text-sm space-y-0.5 text-center">
              {completedIntervalDurations.slice(0, 5).map((log, displayIndex) => {
                const minutes = Math.floor(log.duration / 60);
                const seconds = log.duration % 60;
                const isLatest = displayIndex === 0;

                // Simple color - latest bright, others dimmed
                const colorClass = isLatest ? 'text-slate-200' : 'text-slate-500';

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

      {/* ADD CLOSE BUTTON HERE */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          aria-label={t('common.close', 'Close')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

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
