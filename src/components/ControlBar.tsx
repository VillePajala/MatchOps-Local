'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  HiBars3,
  HiOutlineChevronLeft,
  HiOutlineArchiveBoxArrowDown,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineClipboardDocumentList,
  HiOutlineClipboardDocumentCheck,
  HiOutlineClipboard,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineTrash,
  HiOutlineBackspace,
  HiOutlinePlusCircle,
  HiOutlineXMark,
  HiOutlineHome,
  HiOutlineTableCells,
  HiOutlineScale,
  HiOutlineBookOpen,
} from 'react-icons/hi2';
import FormationPicker from './FormationPicker';
import { useTranslation } from 'react-i18next';
import { debug } from '@/utils/debug';
import logger from '@/utils/logger';

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
  onPlaceAllPlayers: (presetId: string | null) => void;
  selectedPlayerCount: number;
  isDrawingEnabled: boolean;
  onToggleDrawingMode: () => void;
  // Menu (3.1 shrink: MATCH-scope only - every club/app surface opens from
  // Home now; the one way back is "Koti", mirrored by hardware back).
  onToggleGameStatsModal: () => void;
  /** "Joukkueen tilastot ->" - opens the HOST club-stats surface over the match. */
  onOpenTeamStats?: () => void;
  onQuickSave: () => void;
  onOpenGameSettingsModal: () => void;
  isGameLoaded: boolean;
  onOpenPlayerAssessmentModal: () => void;
  /** W10 (menu watchpoint, restored on proven friction day one): quick
   *  access to the planner right after creating/entering a game. Opens the
   *  HOST planner over the match. */
  onOpenPlanner?: () => void;
  /** R6: game-day reference material stays reachable mid-match. */
  onOpenTraining?: () => void;
  onOpenRules?: () => void;
  onGoToStartScreen?: () => void;
}

const ControlBar: React.FC<ControlBarProps> = React.memo(({
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
  selectedPlayerCount,
  isDrawingEnabled,
  onToggleDrawingMode,
  onToggleGameStatsModal,
  onOpenTeamStats,
  onQuickSave,
  onOpenGameSettingsModal,
  isGameLoaded,
  onOpenPlayerAssessmentModal,
  onOpenPlanner,
  onOpenTraining,
  onOpenRules,
  onGoToStartScreen,
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

  // Track drag offset in ref for mouseup to read current value (avoids stale closure)
  const dragOffsetRef = useRef(0);
  // Track active mouse handlers to prevent listener leaks on rapid clicks
  const mouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpRef = useRef<(() => void) | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Clean up any existing listeners first (prevents leak on rapid clicks)
    if (mouseMoveRef.current) document.removeEventListener('mousemove', mouseMoveRef.current);
    if (mouseUpRef.current) document.removeEventListener('mouseup', mouseUpRef.current);

    dragStartX.current = e.clientX;
    dragOffsetRef.current = 0;
    setIsDragging(true);

    const handleMouseMove = (ev: MouseEvent) => {
      const diff = ev.clientX - dragStartX.current;
      if (diff <= 0) {
        const clamped = Math.max(DESIGN_TOKENS.DRAG_MAX_DISTANCE, diff);
        dragOffsetRef.current = clamped;
        setDragOffset(clamped);
      }
    };

    const handleMouseUp = () => {
      if (dragOffsetRef.current < DESIGN_TOKENS.DRAG_CLOSE_THRESHOLD) setIsSettingsMenuOpen(false);
      setDragOffset(0);
      setIsDragging(false);
      dragOffsetRef.current = 0;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      mouseMoveRef.current = null;
      mouseUpRef.current = null;
    };

    mouseMoveRef.current = handleMouseMove;
    mouseUpRef.current = handleMouseUp;
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
      // Clean up mouse drag listeners if unmount happens mid-drag
      if (mouseMoveRef.current) document.removeEventListener('mousemove', mouseMoveRef.current);
      if (mouseUpRef.current) document.removeEventListener('mouseup', mouseUpRef.current);
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


  return (
    <>
      {/* Bottom Bar - Reduced padding from p-4 to p-2 */}
      <div className="relative bg-gradient-to-b from-slate-800 to-slate-900 p-2 shadow-xl border-t border-slate-700 backdrop-blur-md flex justify-center items-center gap-2 z-40 overflow-x-auto">
        {/* Modal background effects for unified feel */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
        {!isFieldToolsOpen ? (
          /* Collapsed State - Normal View. W2: Home pinned LEFT and Menu
             pinned RIGHT with the tool cluster truly centered between two
             equal spacers - the timer stays visually centered. */
          <>
            {/* Left spacer - balances the Menu on the right so the tool cluster
                (timer) stays centered. The bar-level Home button was removed
                (owner feedback): the way back to Home is the menu "Koti" entry,
                mirrored by hardware back. */}
            <div className="flex-1 flex items-center justify-start" />

            <div className="flex items-center gap-2">
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

            {/* Formation Picker - Place players with preset formations */}
            <FormationPicker
              onSelectFormation={onPlaceAllPlayers}
              selectedPlayerCount={selectedPlayerCount}
            />

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

            </div>

            {/* Menu Button - Square shape (rightmost) */}
            <div className="flex-1 flex items-center justify-end">
            <button
              onClick={handleSettingsButtonClick}
              className={`${DESIGN_TOKENS.BUTTON_SIZE} flex items-center justify-center rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 active:scale-95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 bg-slate-700 hover:bg-slate-600 focus:ring-slate-500`}
              title={t('controlBar.menu.title', 'Menu')}
              aria-label={t('controlBar.menu.title', 'Menu')}
            >
              <HiBars3 className={`${iconSize} transition-transform duration-150 ${isSettingsMenuOpen ? 'rotate-90' : ''}`} />
            </button>
            </div>
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
                  logger.debug('[ControlBar] Undo clicked', { isTacticsBoardView });
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
                  logger.debug('[ControlBar] Redo clicked', { isTacticsBoardView });
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
        <div className="fixed inset-0 bg-black/50 z-40" onClick={handleOverlayClick} aria-hidden="true" />
      )}

      {/* Settings Side Panel */}
      <div
        ref={settingsMenuRef}
        data-testid="settings-side-panel"
        aria-hidden={!isSettingsMenuOpen}
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
            title={t('common.closeMenu', 'Close Menu')}
          >
            <HiOutlineChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation content */}
        <nav className="relative flex flex-col p-4 space-y-1 overflow-y-auto flex-1 z-10">
          {/* 3.1 menu shrink: MATCH scope only. Every club/app entry
              (load/new game, roster, teams, personnel, seasons, planner,
              training, rules, backup, settings, sign out, external
              resources) lives on Home now - the reachability table in
              two-level-app-structure.md SS2 gives each item exactly one
              home. Taso stays: it is a game-day workflow tool (owner
              decision 2026-07-14). "Koti" is the one way back (also the
              bar-level Home button + hardware back). */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.thisMatch', 'This match')}
            </h4>
            <button onClick={wrapImmediate(onQuickSave)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineArchiveBoxArrowDown className="w-5 h-5 mr-2" /> {t('controlBar.saveGame', 'Save')}
            </button>
            <button
              onClick={wrapModal(onOpenGameSettingsModal)}
              className={`w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors ${
                !isGameLoaded ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={!isGameLoaded}
            >
              <HiOutlineAdjustmentsHorizontal className="w-5 h-5 mr-2" /> {t('controlBar.gameSettingsButton', 'Match details')}
            </button>
            <button
              onClick={wrapModal(onOpenPlayerAssessmentModal)}
              className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors"
              title={t('instructionsModal.controlBar.assessPlayers')}
            >
              <HiOutlineClipboard className="w-5 h-5 mr-2" />{t('controlBar.assessPlayers', 'Assess Players')}
            </button>
            <button onClick={wrapModal(onToggleGameStatsModal)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
              <HiOutlineClipboardDocumentCheck className="w-5 h-5 mr-2" />{t('controlBar.gameReport', 'Game report')}
            </button>
            {/* Deep-review: the separate "Match stats" entry was identical to
                Game report (same modal, same landing) - collapsed into one.
                Aggregate stats live behind "Team stats ->". */}
            {onOpenTeamStats && (
              <button onClick={wrapModal(onOpenTeamStats)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
                <HiOutlineClipboardDocumentList className="w-5 h-5 mr-2" />
                {t('controlBar.teamStats', 'Team stats')}
                <span className="ml-auto text-slate-500" aria-hidden="true">&rarr;</span>
              </button>
            )}
            {onOpenPlanner && (
              <button onClick={wrapModal(onOpenPlanner)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
                <HiOutlineTableCells className="w-5 h-5 mr-2" />
                {t('controlBar.planner', 'Match planner')}
                <span className="ml-auto text-slate-500" aria-hidden="true">&rarr;</span>
              </button>
            )}
          </div>

          {/* Taso: game-day workflow tool (lineups before, results after). */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('controlBar.menu.resources', 'Resources')}
            </h4>
            {onOpenTraining && (
              <button onClick={wrapModal(onOpenTraining)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
                <HiOutlineBookOpen className="w-5 h-5 mr-2" />{t('controlBar.training', 'Warmup Plan')}
              </button>
            )}
            {onOpenRules && (
              <button onClick={wrapModal(onOpenRules)} className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors">
                <HiOutlineScale className="w-5 h-5 mr-2" />{t('controlBar.rulesDirectory', 'Rules')}
              </button>
            )}
            <a
              href="https://taso.palloliitto.fi"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors"
              onClick={wrapImmediate(() => {})}
            >
              <HiOutlineArrowTopRightOnSquare className="w-5 h-5 mr-2" />
              {t('controlBar.tasoLink', 'Taso')}
            </a>
          </div>

          {/* The one way back to club scope (mirrored by hardware back).
              Autosave makes leaving always safe. */}
          {onGoToStartScreen && (
            <div className="pt-2 border-t border-slate-700/60">
              <button
                onClick={wrapImmediate(onGoToStartScreen)}
                className="w-full flex items-center px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/75 rounded-lg transition-colors"
              >
                <HiOutlineHome className="w-5 h-5 mr-2" />
                {t('controlBar.home', 'Home')}
              </button>
            </div>
          )}
        </nav>
      </div>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only compare DATA props that affect render output.
  // Callbacks are intentionally excluded because:
  // 1. They don't affect what ControlBar displays (only data props do)
  // 2. They're stable references (useCallback/useState setters)
  // 3. Default shallow comparison of 28 props would defeat React.memo
  //
  // MAINTAINER NOTE: If you add a new DATA prop (not a callback), add it here!
  // Current data props: timeElapsedInSeconds, isTimerRunning, canUndo, canRedo,
  // canTacticalUndo, canTacticalRedo, isTacticsBoardView, isDrawingEnabled, isGameLoaded,
  // selectedPlayerCount, onGoToStartScreen (truthiness), onOpenTeamStats (truthiness)
  //
  // Return true = props equal (skip re-render), false = props changed (re-render)
  return (
    prevProps.timeElapsedInSeconds === nextProps.timeElapsedInSeconds &&
    prevProps.isTimerRunning === nextProps.isTimerRunning &&
    prevProps.canUndo === nextProps.canUndo &&
    prevProps.canRedo === nextProps.canRedo &&
    prevProps.canTacticalUndo === nextProps.canTacticalUndo &&
    prevProps.canTacticalRedo === nextProps.canTacticalRedo &&
    prevProps.isTacticsBoardView === nextProps.isTacticsBoardView &&
    prevProps.isDrawingEnabled === nextProps.isDrawingEnabled &&
    prevProps.isGameLoaded === nextProps.isGameLoaded &&
    prevProps.selectedPlayerCount === nextProps.selectedPlayerCount &&
    !!prevProps.onGoToStartScreen === !!nextProps.onGoToStartScreen &&
    !!prevProps.onOpenTeamStats === !!nextProps.onOpenTeamStats
  );
});

ControlBar.displayName = 'ControlBar';

export default ControlBar;
