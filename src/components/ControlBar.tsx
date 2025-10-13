'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  HiOutlineWrench,
  HiBars3,
  HiOutlineChevronLeft,
  HiOutlineArchiveBoxArrowDown,
  HiOutlineFolderOpen,
  HiOutlineArrowPath,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineUsers,
  HiOutlineUserGroup,
  HiOutlineTrophy,
  HiOutlineClipboardDocumentList,
  HiOutlineClipboard,
  HiOutlineBookOpen,
  HiOutlineDocumentArrowDown,
  HiOutlineQuestionMarkCircle,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineCog6Tooth,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineTrash,
  HiOutlineBackspace,
  HiOutlinePlusCircle,
  HiOutlineSquares2X2,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { FaFutbol } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

// Design tokens for consistent sizing and spacing
const DESIGN_TOKENS = {
  // Button dimensions
  BUTTON_SIZE: 'w-10 h-10',
  BUTTON_HEIGHT: 'h-10',

  // Icon dimensions
  ICON_SIZE: 'w-5 h-5',
  ICON_SIZE_PX: 20,

  // Timer display
  TIMER_FONT_SIZE: 'text-2xl',

  // Drag behavior (pixels)
  DRAG_MAX_DISTANCE: -320,
  DRAG_CLOSE_THRESHOLD: -96,
  DRAG_MIN_DISTANCE: 10,

  // Menu dimensions
  MENU_WIDTH: 'w-80',
  MENU_WIDTH_PX: 320,
} as const;

// Helper to format time
const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

interface ControlBarProps {
  // Timer
  timeElapsedInSeconds: number;
  isTimerRunning: boolean;
  onToggleLargeTimerOverlay: () => void;
  // Field Tools (for panel)
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onResetField: () => void;
  onClearDrawings: () => void;
  onAddOpponent: () => void;
  isTacticsBoardView: boolean;
  onToggleTacticsBoard: () => void;
  onAddHomeDisc: () => void;
  onAddOpponentDisc: () => void;
  onPlaceAllPlayers: () => void;
  // Goal
  onToggleGoalLogModal: () => void;
  // Menu (existing functionality)
  onToggleTrainingResources: () => void;
  onToggleGameStatsModal: () => void;
  onOpenLoadGameModal: () => void;
  onStartNewGame: () => void;
  onOpenRosterModal: () => void;
  onQuickSave: () => void;
  onOpenGameSettingsModal: () => void;
  isGameLoaded: boolean;
  onOpenSeasonTournamentModal: () => void;
  onToggleInstructionsModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenPlayerAssessmentModal: () => void;
  onOpenTeamManagerModal: () => void;
}

const ControlBar: React.FC<ControlBarProps> = ({
  timeElapsedInSeconds,
  isTimerRunning,
  onToggleLargeTimerOverlay,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onResetField,
  onClearDrawings,
  onAddOpponent,
  isTacticsBoardView,
  onToggleTacticsBoard,
  onAddHomeDisc,
  onAddOpponentDisc,
  onPlaceAllPlayers,
  onToggleGoalLogModal,
  onToggleTrainingResources,
  onToggleGameStatsModal,
  onOpenLoadGameModal,
  onStartNewGame,
  onOpenRosterModal,
  onQuickSave,
  onOpenGameSettingsModal,
  isGameLoaded,
  onOpenSeasonTournamentModal,
  onToggleInstructionsModal,
  onOpenSettingsModal,
  onOpenPlayerAssessmentModal,
  onOpenTeamManagerModal,
}) => {
  const { t } = useTranslation();
  const [isFieldToolsOpen, setIsFieldToolsOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number>(0);

  // Button styles - square buttons, compact height, professional polish
  const buttonStyle = `${DESIGN_TOKENS.BUTTON_SIZE} flex items-center justify-center rounded-md shadow-sm transition-all duration-200 active:scale-95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 border border-slate-600/30`;
  const iconSize = DESIGN_TOKENS.ICON_SIZE;

  // Settings menu handlers
  const handleSettingsButtonClick = () => {
    setIsSettingsMenuOpen(!isSettingsMenuOpen);
    setDragOffset(0);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragStartX.current = e.touches[0].clientX;
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches.length === 1) {
      const diff = e.touches[0].clientX - dragStartX.current;
      if (diff <= 0) {
        setDragOffset(Math.max(DESIGN_TOKENS.DRAG_MAX_DISTANCE, diff));
        if (Math.abs(diff) > DESIGN_TOKENS.DRAG_MIN_DISTANCE) e.preventDefault();
      }
    }
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      if (dragOffset < DESIGN_TOKENS.DRAG_CLOSE_THRESHOLD) setIsSettingsMenuOpen(false);
      setDragOffset(0);
      setIsDragging(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartX.current = e.clientX;
    setIsDragging(true);

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - dragStartX.current;
      if (diff <= 0) setDragOffset(Math.max(DESIGN_TOKENS.DRAG_MAX_DISTANCE, diff));
    };

    const handleMouseUp = () => {
      if (dragOffset < DESIGN_TOKENS.DRAG_CLOSE_THRESHOLD) setIsSettingsMenuOpen(false);
      setDragOffset(0);
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setIsSettingsMenuOpen(false);
        setDragOffset(0);
      }
    };

    if (isSettingsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSettingsMenuOpen]);

  const wrapHandler = (handler: () => void) => () => {
    handler();
    setIsSettingsMenuOpen(false);
    setDragOffset(0);
  };

  const handleOverlayClick = () => {
    setIsSettingsMenuOpen(false);
    setDragOffset(0);
  };

  const handleStartNewGame = () => {
    onStartNewGame();
    setIsSettingsMenuOpen(false);
    setDragOffset(0);
  };

  return (
    <>
      {/* Bottom Bar - Reduced padding from p-4 to p-2 */}
      <div className="relative bg-gradient-to-b from-slate-800 to-slate-900 p-2 shadow-xl border-t border-slate-700 backdrop-blur-md flex justify-center items-center gap-2 z-40 overflow-x-auto">
        {/* Modal background effects for unified feel */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
        {!isFieldToolsOpen ? (
          /* Collapsed State - Normal View */
          <>
            {/* Field Tools Button - Square shape */}
            <button
              onClick={() => setIsFieldToolsOpen(true)}
              className={`${DESIGN_TOKENS.BUTTON_SIZE} flex items-center justify-center rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 active:scale-95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={t('controlBar.fieldTools', 'Field Tools')}
              aria-label={t('controlBar.fieldTools', 'Field Tools')}
            >
              <HiOutlineWrench className={iconSize} />
            </button>

            {/* Place All Players Button - Square shape */}
            <button
              onClick={onPlaceAllPlayers}
              className={`${DESIGN_TOKENS.BUTTON_SIZE} flex items-center justify-center rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 active:scale-95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={t('controlBar.placeAllPlayers', 'Place All Players')}
              aria-label={t('controlBar.placeAllPlayers', 'Place All Players')}
            >
              <HiOutlineSquares2X2 className={iconSize} />
            </button>

            {/* Clickable Timer Display - Fixed height */}
            <button
              onClick={onToggleLargeTimerOverlay}
              className={`${DESIGN_TOKENS.BUTTON_HEIGHT} bg-slate-700/80 hover:bg-slate-600/80 px-6 rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-slate-900`}
              title={t('controlBar.openTimer', 'Open Timer')}
              aria-label={t('controlBar.openTimer', 'Open Timer')}
            >
              <span className={`${DESIGN_TOKENS.TIMER_FONT_SIZE} font-bold tabular-nums leading-none transition-colors ${isTimerRunning ? 'text-green-400' : 'text-slate-300'}`}>
                {formatTime(timeElapsedInSeconds)}
              </span>
            </button>

            {/* Goal Button - Square shape */}
            <button
              onClick={onToggleGoalLogModal}
              className={`${DESIGN_TOKENS.BUTTON_SIZE} flex items-center justify-center rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 active:scale-95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={t('controlBar.logGoal', 'Log Goal')}
              aria-label={t('controlBar.logGoal', 'Log Goal')}
            >
              <FaFutbol size={DESIGN_TOKENS.ICON_SIZE_PX} />
            </button>

            {/* Menu Button - Square shape */}
            <button
              onClick={handleSettingsButtonClick}
              className={`${DESIGN_TOKENS.BUTTON_SIZE} flex items-center justify-center rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 active:scale-95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={t('controlBar.settings', 'Menu')}
              aria-label={t('controlBar.settings', 'Menu')}
            >
              <HiBars3 className={`${iconSize} transition-transform duration-150 ${isSettingsMenuOpen ? 'rotate-90' : ''}`} />
            </button>
          </>
        ) : (
          /* Expanded State - Field Tools Mode */
          <>
            {/* Close/Back Button */}
            <button
              onClick={() => setIsFieldToolsOpen(false)}
              className={`${buttonStyle} bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={t('common.back', 'Back')}
              aria-label={t('common.back', 'Back')}
            >
              <HiOutlineXMark className={iconSize} />
            </button>

            {/* Undo */}
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`${buttonStyle} ${canUndo ? 'bg-slate-700 hover:bg-slate-600 focus:ring-slate-500' : 'bg-slate-800 opacity-50 cursor-not-allowed'}`}
              title={t('controlBar.undo', 'Undo')}
            >
              <HiOutlineArrowUturnLeft className={iconSize} />
            </button>

            {/* Redo */}
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`${buttonStyle} ${canRedo ? 'bg-slate-700 hover:bg-slate-600 focus:ring-slate-500' : 'bg-slate-800 opacity-50 cursor-not-allowed'}`}
              title={t('controlBar.redo', 'Redo')}
            >
              <HiOutlineArrowUturnRight className={iconSize} />
            </button>

            {/* Tactics Toggle */}
            <button
              onClick={onToggleTacticsBoard}
              className={`${buttonStyle} ${isTacticsBoardView ? 'bg-slate-600 hover:bg-slate-500 focus:ring-slate-500' : 'bg-slate-700 hover:bg-slate-600 focus:ring-slate-500'}`}
              title={t(isTacticsBoardView ? 'controlBar.toggleTacticsBoardHide' : 'controlBar.toggleTacticsBoardShow') ?? 'Tactics'}
            >
              <HiOutlineClipboard className={iconSize} />
            </button>

            {/* Add Home Disc (only visible in tactics board mode) */}
            {isTacticsBoardView && (
              <button
                onClick={onAddHomeDisc}
                className={`${buttonStyle} bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
                title={t('controlBar.addHomeDisc', 'Add Home Disc')}
              >
                <HiOutlinePlusCircle className={iconSize} />
              </button>
            )}

            {/* Add Opponent / Add Opponent Disc */}
            <button
              onClick={isTacticsBoardView ? onAddOpponentDisc : onAddOpponent}
              className={`${buttonStyle} bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={isTacticsBoardView ? t('controlBar.addOpponentDisc', 'Add Opponent Disc') : t('controlBar.addOpponent', 'Add Opponent')}
            >
              <HiOutlinePlusCircle className={iconSize} />
            </button>

            {/* Clear Drawings */}
            <button
              onClick={onClearDrawings}
              className={`${buttonStyle} bg-amber-700/40 hover:bg-amber-700/60 focus:ring-amber-600`}
              title={t('controlBar.clearDrawings', 'Clear Drawings')}
            >
              <HiOutlineBackspace className={iconSize} />
            </button>

            {/* Reset Field */}
            <button
              onClick={onResetField}
              className={`${buttonStyle} bg-red-700/40 hover:bg-red-700/60 focus:ring-red-600`}
              title={t('controlBar.resetField', 'Reset Field')}
            >
              <HiOutlineTrash className={iconSize} />
            </button>
          </>
        )}
      </div>

      {/* Settings Menu Overlay */}
      {isSettingsMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={handleOverlayClick} />
      )}

      {/* Settings Side Panel */}
      <div
        ref={settingsMenuRef}
        className={`fixed top-0 left-0 h-full ${DESIGN_TOKENS.MENU_WIDTH} z-50 flex flex-col bg-slate-800/98 backdrop-blur-sm shadow-xl border-r border-slate-600/50 overflow-hidden ${
          isDragging ? '' : 'transition-transform duration-300 ease-in-out'
        } ${isSettingsMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={isDragging ? { transform: `translateX(${dragOffset}px)` } : {}}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {/* Modal background effects for unified feel */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
        {/* Header */}
        <div className="relative px-4 py-3 border-b border-slate-700/80 flex justify-between items-center z-10">
          <h3 className="text-lg font-semibold text-yellow-300">{t('controlBar.menu.title', 'Menu')}</h3>
          <button
            onClick={() => { setIsSettingsMenuOpen(false); setDragOffset(0); }}
            className="text-slate-400 hover:text-slate-200 p-1 rounded"
            title={t('common.closeMenu', 'Close Menu') ?? undefined}
          >
            <HiOutlineChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation content */}
        <nav className="relative flex flex-col p-4 space-y-1 overflow-y-auto flex-1 z-10">
          {/* Section: Game Management */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.gameManagement', 'Game Management')}
            </h4>
            <button onClick={wrapHandler(onQuickSave)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineArchiveBoxArrowDown className="w-5 h-5 mr-2" /> {t('controlBar.saveGame', 'Save')}
            </button>
            <button onClick={wrapHandler(onOpenLoadGameModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineFolderOpen className="w-5 h-5 mr-2" /> {t('controlBar.loadGame', 'Load Game...')}
            </button>
            <button onClick={handleStartNewGame} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineArrowPath className="w-5 h-5 mr-2" /> {t('controlBar.newGameButton', 'New Game')}
            </button>
          </div>

          {/* Section: Setup & Configuration */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.setupConfig', 'Setup & Configuration')}
            </h4>
            <button
              onClick={wrapHandler(onOpenGameSettingsModal)}
              className={`w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors ${
                !isGameLoaded ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={!isGameLoaded}
            >
              <HiOutlineAdjustmentsHorizontal className="w-5 h-5 mr-2" /> {t('controlBar.gameSettingsButton', 'Game Settings')}
            </button>
            <button onClick={wrapHandler(onOpenRosterModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineUsers className="w-5 h-5 mr-2" /> {t('controlBar.manageRoster', 'Manage Roster')}
            </button>
            <button onClick={wrapHandler(onOpenTeamManagerModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineUserGroup className="w-5 h-5 mr-2" /> {t('controlBar.manageTeams', 'Manage Teams')}
            </button>
            <button onClick={wrapHandler(onOpenSeasonTournamentModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineTrophy className="w-5 h-5 mr-2" /> {t('controlBar.manageSeasonsAndTournaments', 'Manage Seasons & Tournaments')}
            </button>
          </div>

          {/* Section: Analysis & Tools */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.analysisTools', 'Analysis & Tools')}
            </h4>
            <button onClick={wrapHandler(onToggleGameStatsModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineClipboardDocumentList className="w-5 h-5 mr-2" />{t('controlBar.stats', 'Stats')}
            </button>
            <button
              onClick={wrapHandler(onOpenPlayerAssessmentModal)}
              className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors"
              title={t('instructionsModal.controlBar.assessPlayers') ?? undefined}
            >
              <HiOutlineClipboard className="w-5 h-5 mr-2" />{t('controlBar.assessPlayers', 'Assess Players')}
            </button>
            <button onClick={wrapHandler(onToggleTrainingResources)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineBookOpen className="w-5 h-5 mr-2" />{t('controlBar.training', 'Training')}
            </button>
            <button onClick={wrapHandler(onOpenSettingsModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineDocumentArrowDown className="w-5 h-5 mr-2" />{t('controlBar.backupRestore', 'Backup & Restore')}
            </button>
          </div>

          {/* Section: Resources */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.resources', 'Resources')}
            </h4>
            <button onClick={wrapHandler(onToggleInstructionsModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineQuestionMarkCircle className="w-5 h-5 mr-2" /> {t('controlBar.howItWorks')}
            </button>
            <a
              href="https://www.palloliitto.fi/valmentajien-materiaalit-jalkapallo"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { setIsSettingsMenuOpen(false); setDragOffset(0); }}
              className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors"
            >
              <HiOutlineArrowTopRightOnSquare className="w-5 h-5 mr-2" />
              {t('controlBar.coachingMaterials', 'Coaching Materials')}
            </a>
            <a
              href="https://taso.palloliitto.fi"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors"
              onClick={wrapHandler(() => {})}
            >
              <HiOutlineArrowTopRightOnSquare className="w-5 h-5 mr-2" />{t('controlBar.tasoLink', 'Taso')}
            </a>
          </div>

          {/* Section: Settings */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.settings', 'Settings')}
            </h4>
            <button onClick={wrapHandler(onOpenSettingsModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineCog6Tooth className="w-5 h-5 mr-2" /> {t('controlBar.appSettings', 'App Settings')}
            </button>
          </div>
        </nav>
      </div>
    </>
  );
};

export default ControlBar;
