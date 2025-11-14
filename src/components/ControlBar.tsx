'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
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
  HiOutlineIdentification,
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { debug } from '@/utils/debug';

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

// Transition fallback in case 'transitionend' isn't fired (reduced motion, etc.)
const PANEL_CLOSE_FALLBACK_MS = 300;

// Helper to format time
const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
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
  // Tactical Tools (separate history)
  onTacticalUndo: () => void;
  onTacticalRedo: () => void;
  canTacticalUndo: boolean;
  canTacticalRedo: boolean;
  onResetField: () => void;
  onClearDrawings: () => void;
  onAddOpponent: () => void;
  isTacticsBoardView: boolean;
  onToggleTacticsBoard: () => void;
  onAddHomeDisc: () => void;
  onAddOpponentDisc: () => void;
  onPlaceAllPlayers: () => void;
  isDrawingEnabled: boolean;
  onToggleDrawingMode: () => void;
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
  onOpenPersonnelManager: () => void;
}

const ControlBar: React.FC<ControlBarProps> = ({
  timeElapsedInSeconds,
  isTimerRunning,
  onToggleLargeTimerOverlay,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onTacticalUndo,
  onTacticalRedo,
  canTacticalUndo,
  canTacticalRedo,
  onResetField,
  onClearDrawings,
  onAddOpponent,
  isTacticsBoardView,
  onToggleTacticsBoard,
  onAddHomeDisc,
  onAddOpponentDisc,
  onPlaceAllPlayers,
  isDrawingEnabled,
  onToggleDrawingMode,
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
  onOpenPersonnelManager,
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

  // Immediate handler: for actions that do not open modals (e.g., quick save, external links)
  const wrapImmediate = (handler: () => void) => () => {
    handler();
    setIsSettingsMenuOpen(false);
    setDragOffset(0);
  };

  // Track pending transition listener and fallback timeout for cleanup
  const pendingTransitionRef = useRef<{ panel: HTMLDivElement | null; onEnd: (e: TransitionEvent) => void } | null>(null);
  const pendingTimeoutIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount to avoid leaking listeners/timeouts
      if (pendingTransitionRef.current?.panel && pendingTransitionRef.current.onEnd) {
        pendingTransitionRef.current.panel.removeEventListener('transitionend', pendingTransitionRef.current.onEnd);
      }
      if (pendingTimeoutIdRef.current !== null) {
        clearTimeout(pendingTimeoutIdRef.current);
      }
      pendingTransitionRef.current = null;
      pendingTimeoutIdRef.current = null;
    };
  }, []);

  // Close menu and open modal when the close transition finishes (best UX).
  // Fallback timer ensures handler still fires if transitionend doesn't.
  const closeMenuThen = (handler: () => void) => {
    const panel = settingsMenuRef.current;
    setIsSettingsMenuOpen(false);
    setDragOffset(0);

    // Clear any previous pending listener/timeout before setting new ones
    if (pendingTransitionRef.current?.panel && pendingTransitionRef.current.onEnd) {
      pendingTransitionRef.current.panel.removeEventListener('transitionend', pendingTransitionRef.current.onEnd);
    }
    if (pendingTimeoutIdRef.current !== null) {
      clearTimeout(pendingTimeoutIdRef.current);
      pendingTimeoutIdRef.current = null;
    }
    pendingTransitionRef.current = null;

    if (!panel) {
      // No panel ref — call on next tick
      setTimeout(handler, 0);
      return;
    }

    let done = false;
    const cleanup = () => {
      done = true;
      if (pendingTransitionRef.current?.panel && pendingTransitionRef.current.onEnd) {
        pendingTransitionRef.current.panel.removeEventListener('transitionend', pendingTransitionRef.current.onEnd);
      }
      if (pendingTimeoutIdRef.current !== null) {
        clearTimeout(pendingTimeoutIdRef.current);
        pendingTimeoutIdRef.current = null;
      }
      pendingTransitionRef.current = null;
    };

    const onEnd = (e: TransitionEvent) => {
      if (e.target === panel) {
        cleanup();
        handler();
      }
    };

    // Attach and track the listener
    panel.addEventListener('transitionend', onEnd, { once: true });
    pendingTransitionRef.current = { panel, onEnd };

    // Fallback if transitionend doesn't fire
    pendingTimeoutIdRef.current = window.setTimeout(() => {
      if (!done) {
        cleanup();
        handler();
      }
    }, PANEL_CLOSE_FALLBACK_MS);
  };

  const wrapModal = (handler: () => void) => () => closeMenuThen(handler);

  const handleOverlayClick = () => {
    setIsSettingsMenuOpen(false);
    setDragOffset(0);
  };

  const handleStartNewGame = () => closeMenuThen(onStartNewGame);

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
            {/* Tactics Button - Opens field tools + enters tactics mode + enables drawing */}
            <button
              onClick={() => {
                setIsFieldToolsOpen(true);
                if (!isTacticsBoardView) {
                  onToggleTacticsBoard();
                }
                if (!isDrawingEnabled) {
                  onToggleDrawingMode(); // Safe - hook handles errors internally via callback
                }
              }}
              className={`${DESIGN_TOKENS.BUTTON_SIZE} flex items-center justify-center rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 active:scale-95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={t('controlBar.toggleTacticsBoardShow', 'Tactics Board')}
              aria-label={t('controlBar.toggleTacticsBoardShow', 'Tactics Board')}
            >
              <HiOutlineClipboard className={iconSize} />
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

            {/* Clickable Timer Display - Fixed height and width */}
            <button
              onClick={onToggleLargeTimerOverlay}
              className={`${DESIGN_TOKENS.BUTTON_HEIGHT} w-28 bg-slate-700/80 hover:bg-slate-600/80 px-6 rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-slate-900`}
              title={t('controlBar.openTimer', 'Open Timer')}
              aria-label={t('controlBar.openTimer', 'Open Timer')}
            >
              <span className={`${DESIGN_TOKENS.TIMER_FONT_SIZE} font-bold tabular-nums leading-none transition-colors ${isTimerRunning ? 'text-green-400' : 'text-slate-300'}`}>
                {formatTime(timeElapsedInSeconds)}
              </span>
            </button>

            {/* Reset Field Button - Square shape (with confirmation) */}
            <button
              onClick={onResetField}
              className={`${DESIGN_TOKENS.BUTTON_SIZE} flex items-center justify-center rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 active:scale-95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={t('controlBar.resetField', 'Reset Field')}
              aria-label={t('controlBar.resetField', 'Reset Field')}
            >
              <HiOutlineTrash className={iconSize} />
            </button>

            {/* Menu Button - Square shape (rightmost) */}
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
            {/* Close/Back Button - Exits entire tactics workflow */}
            <button
              onClick={() => {
                setIsFieldToolsOpen(false);
                // Exit tactics mode if currently in it
                if (isTacticsBoardView) {
                  onToggleTacticsBoard();
                }
                // Disable drawing mode if currently enabled
                if (isDrawingEnabled) {
                  onToggleDrawingMode(); // Safe - hook handles errors internally via callback
                }
              }}
              className={`${buttonStyle} bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={t('common.back', 'Back')}
              aria-label={t('common.back', 'Back')}
            >
              <HiOutlineXMark className={iconSize} />
            </button>

            {/* Undo - Context-aware (tactical vs normal) */}
            <button
              onClick={() => {
                // P3: Gate logging behind DEBUG flag (hot path performance)
                if (debug.enabled('tactical')) {
                  try {
                    // eslint-disable-next-line no-console
                    console.debug('[ControlBar] Undo clicked', { isTacticsBoardView });
                  } catch {}
                }
                return isTacticsBoardView ? onTacticalUndo() : onUndo();
              }}
              disabled={isTacticsBoardView ? !canTacticalUndo : !canUndo}
              className={`${buttonStyle} ${(isTacticsBoardView ? canTacticalUndo : canUndo) ? 'bg-slate-700 hover:bg-slate-600 focus:ring-slate-500' : 'bg-slate-800 opacity-50 cursor-not-allowed'}`}
              title={t('controlBar.undo', 'Undo')}
            >
              <HiOutlineArrowUturnLeft className={iconSize} />
            </button>

            {/* Redo - Context-aware (tactical vs normal) */}
            <button
              onClick={() => {
                // P3: Gate logging behind DEBUG flag (hot path performance)
                if (debug.enabled('tactical')) {
                  try {
                    // eslint-disable-next-line no-console
                    console.debug('[ControlBar] Redo clicked', { isTacticsBoardView });
                  } catch {}
                }
                return isTacticsBoardView ? onTacticalRedo() : onRedo();
              }}
              disabled={isTacticsBoardView ? !canTacticalRedo : !canRedo}
              className={`${buttonStyle} ${(isTacticsBoardView ? canTacticalRedo : canRedo) ? 'bg-slate-700 hover:bg-slate-600 focus:ring-slate-500' : 'bg-slate-800 opacity-50 cursor-not-allowed'}`}
              title={t('controlBar.redo', 'Redo')}
            >
              <HiOutlineArrowUturnRight className={iconSize} />
            </button>

            {/* Add Home Disc (only visible in tactics board mode) - Purple color */}
            {isTacticsBoardView && (
              <button
                onClick={onAddHomeDisc}
                className={`${buttonStyle} bg-purple-700/80 hover:bg-purple-600 focus:ring-purple-500 border-purple-500/30`}
                title={t('controlBar.addHomeDisc', 'Add Home Disc')}
              >
                <HiOutlinePlusCircle className={iconSize} />
              </button>
            )}

            {/* Add Opponent / Add Opponent Disc - Red color */}
            <button
              onClick={isTacticsBoardView ? onAddOpponentDisc : onAddOpponent}
              className={`${buttonStyle} bg-red-700/80 hover:bg-red-600 focus:ring-red-500 border-red-500/30`}
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
              className={`${buttonStyle} bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
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
        data-testid="settings-side-panel"
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
            <button onClick={wrapImmediate(onQuickSave)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineArchiveBoxArrowDown className="w-5 h-5 mr-2" /> {t('controlBar.saveGame', 'Save')}
            </button>
            <button onClick={wrapModal(onOpenLoadGameModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
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
              onClick={wrapModal(onOpenGameSettingsModal)}
              className={`w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors ${
                !isGameLoaded ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={!isGameLoaded}
            >
              <HiOutlineAdjustmentsHorizontal className="w-5 h-5 mr-2" /> {t('controlBar.gameSettingsButton', 'Game Settings')}
            </button>
            <button onClick={wrapModal(onOpenRosterModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineUsers className="w-5 h-5 mr-2" /> {t('controlBar.manageRoster', 'Manage Roster')}
            </button>
            <button onClick={wrapModal(onOpenTeamManagerModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineUserGroup className="w-5 h-5 mr-2" /> {t('controlBar.manageTeams', 'Manage Teams')}
            </button>
            <button onClick={wrapModal(onOpenPersonnelManager)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineIdentification className="w-5 h-5 mr-2" /> {t('controlBar.personnelManager', 'Personnel Manager')}
            </button>
            <button onClick={wrapModal(onOpenSeasonTournamentModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineTrophy className="w-5 h-5 mr-2" /> {t('controlBar.manageSeasonsAndTournaments', 'Manage Seasons & Tournaments')}
            </button>
          </div>

          {/* Section: Analysis & Tools */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.analysisTools', 'Analysis & Tools')}
            </h4>
            <button onClick={wrapModal(onToggleGameStatsModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineClipboardDocumentList className="w-5 h-5 mr-2" />{t('controlBar.stats', 'Stats')}
            </button>
            <button
              onClick={wrapModal(onOpenPlayerAssessmentModal)}
              className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors"
              title={t('instructionsModal.controlBar.assessPlayers') ?? undefined}
            >
              <HiOutlineClipboard className="w-5 h-5 mr-2" />{t('controlBar.assessPlayers', 'Assess Players')}
            </button>
            <button onClick={wrapModal(onToggleTrainingResources)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineBookOpen className="w-5 h-5 mr-2" />{t('controlBar.training', 'Training')}
            </button>
            <button onClick={wrapModal(onOpenSettingsModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineDocumentArrowDown className="w-5 h-5 mr-2" />{t('controlBar.backupRestore', 'Backup & Restore')}
            </button>
          </div>

          {/* Section: Resources */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.resources', 'Resources')}
            </h4>
            <button onClick={wrapModal(onToggleInstructionsModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
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
              onClick={wrapImmediate(() => {})}
            >
              <HiOutlineArrowTopRightOnSquare className="w-5 h-5 mr-2" />{t('controlBar.tasoLink', 'Taso')}
            </a>
            <a
              href={process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "https://match-ops-hub.vercel.app"}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors"
              onClick={wrapImmediate(() => {})}
            >
              <HiOutlineArrowTopRightOnSquare className="w-5 h-5 mr-2" />
              {t('controlBar.marketingSite', 'Docs & Features')}
            </a>
          </div>

          {/* Section: Settings */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.settings', 'Settings')}
            </h4>
            <button onClick={wrapModal(onOpenSettingsModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineCog6Tooth className="w-5 h-5 mr-2" /> {t('controlBar.appSettings', 'App Settings')}
            </button>
          </div>
        </nav>
      </div>
    </>
  );
};

export default ControlBar;
