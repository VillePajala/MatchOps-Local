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
  HiOutlineCog6Tooth,
  HiOutlineTableCells,
  HiOutlineScale,
  HiOutlineBookOpen,
} from 'react-icons/hi2';
import { TASO_URL, mapsDirectionsUrl } from '@/config/externalLinks';
import { MdDirectionsCar } from 'react-icons/md';
import FormationPicker from './FormationPicker';
import SteadyDigits from '@/components/SteadyDigits';
import { useTranslation } from 'react-i18next';
import { debug } from '@/utils/debug';
import logger from '@/utils/logger';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';
import { matchGlassStyle, matchCapsuleButtonStyle, sectionLabelStyle, dialogTitleStyle } from '@/styles/modalStyles';

// Design tokens for consistent sizing and spacing
const DESIGN_TOKENS = {
  // Icon dimensions
  ICON_SIZE: 'w-[22px] h-[22px]',
  ICON_SIZE_PX: 22,

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
  /** Finishing progress for the current game, or null when it does not apply. */
  finishProgress?: { done: number; total: number } | null;
  /** Absent when the assessment feature is switched off in settings. */
  onOpenPlayerAssessmentModal?: () => void;
  /** W10 (menu watchpoint, restored on proven friction day one): quick
   *  access to the planner right after creating/entering a game. Opens the
   *  HOST planner over the match. */
  onOpenPlanner?: () => void;
  /**
   * Open THIS game's plan in the planner. Supplied only when the game was
   * created from a plan, so the row appears exactly when there is something to
   * open.
   *
   * This is not the planner entry that restructure 3.1 removed from the match
   * menu. That one was a general "open the planner", which belongs on Home
   * because it CREATES games; this is a contextual jump to the plan this match
   * already came from, and it cannot be reached any other way.
   */
  onOpenThisGamePlan?: () => void;
  /** R6: game-day reference material stays reachable mid-match. */
  onOpenTraining?: () => void;
  onOpenRules?: () => void;
  /** App settings (where the AI provider key lives), without going via Home. */
  onOpenAppSettings?: () => void;
  onGoToStartScreen?: () => void;
  /** The current match's pinned position, for the directions row. */
  locationLat?: number;
  locationLng?: number;
  /** The written address; the map routes to it rather than to the pin when present. */
  locationAddress?: string;
}

/** One row of the side menu: a 48px target, Inter, white on navy. */
const MENU_ROW =
  'w-full flex items-center gap-3 min-h-12 px-3 rounded-2xl font-ui text-[15px] font-medium text-ink hover:bg-white/[0.06] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action';
/** The leading icon of a side-menu row. */
const MENU_ICON = 'w-5 h-5 shrink-0 text-ink-3';
/** Shape of a row that leaves the app. Taso is currently the only one. */
const EXTERNAL_LINK_ROW = MENU_ROW;

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
  finishProgress,
  onOpenPlayerAssessmentModal,
  onOpenPlanner,
  onOpenThisGamePlan,
  onOpenTraining,
  onOpenRules,
  onOpenAppSettings,
  onGoToStartScreen,
  locationLat,
  locationLng,
  locationAddress,
}) => {
  const { t } = useTranslation();
  // Directions, not a search: see mapsDirectionsUrl. A typed-only location
  // yields null and the row disappears.
  const venueMapUrl = mapsDirectionsUrl(locationLat, locationLng, locationAddress);
  const [isFieldToolsOpen, setIsFieldToolsOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number>(0);

  // Round buttons inside the floating capsule (48px; 44px in the busier
  // field-tools row so all seven fit a phone's width).
  const buttonStyle = matchCapsuleButtonStyle;
  const iconSize = DESIGN_TOKENS.ICON_SIZE;

  /** Exits the whole tactics workflow - the X button and a hardware back. */
  const closeFieldTools = () => {
    setIsFieldToolsOpen(false);
    // Exit tactics mode if currently in it
    if (isTacticsBoardView) {
      onToggleTacticsBoard();
    }
    // Disable drawing mode if currently enabled
    if (isDrawingEnabled) {
      onToggleDrawingMode(); // Safe - hook handles errors internally via callback
    }
  };

  // Back closes an open panel before it leaves the match (review 7.9): the side
  // menu and the field tools are match-scope surfaces like the modals, which
  // already follow this rule. Preemptive sub-guards, above the match's own guard.
  useHardwareBackSubLevel(isFieldToolsOpen, closeFieldTools);
  useHardwareBackSubLevel(isSettingsMenuOpen, () => {
    setIsSettingsMenuOpen(false);
    setDragOffset(0);
  });

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
      {/* The control bar: a floating navy capsule over the grass. The glass is
          on THIS element, not on a wrapper, so the fixed side menu below is
          not trapped inside a backdrop-filter containing block. */}
      {/* Sized to fit a 360px phone without scrolling: 44px buttons, a 100px
          clock pill and a gap that narrows with the screen (6px, 4px at 320).
          overflow-x-auto stays only as a last resort for the seven-button
          field-tools row on the very narrowest screens. */}
      <div className={`relative z-40 flex justify-center items-center gap-[min(6px,1.25vw)] h-14 max-w-full px-1.5 rounded-full overflow-x-auto font-ui ${matchGlassStyle}`}>
        {!isFieldToolsOpen ? (
          /* Collapsed State - Normal View. Since the bar-level Home button was
             removed (owner feedback: Home is the menu "Koti" entry + hardware
             back), the remaining buttons - tactics, formation, timer, reset,
             menu - are ONE centered group (the parent is justify-center); no
             more left/right spacers stranding the menu on the far right. */
          <>
            <div className="flex items-center gap-[min(6px,1.25vw)]">
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
              className={matchCapsuleButtonStyle}
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
              data-testid="tour-timer-button"
              className="h-11 w-[100px] shrink-0 flex items-center justify-center gap-1.5 pr-1 rounded-full bg-white/[0.12] shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] hover:bg-white/[0.16] transition-colors active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-carbon"
              title={t('controlBar.openTimer', 'Open Timer')}
              aria-label={t('controlBar.openTimer', 'Open Timer')}
            >
              {/* Running: an amber pulse of light; stopped: a quiet dot. */}
              <span
                className={`w-2 h-2 shrink-0 rounded-full ${isTimerRunning ? 'bg-action shadow-[0_0_0_3px_rgb(255_178_36/0.2),0_0_10px_rgb(255_178_36/0.7)]' : 'bg-ink-3'}`}
                aria-hidden="true"
              />
              {/* SteadyDigits boxes each digit, so the clock - and every
                  button beside it in this row - cannot shift once a second. */}
              <SteadyDigits className="font-display italic font-extrabold text-[26px] leading-none whitespace-nowrap text-ink">
                {formatTime(timeElapsedInSeconds)}
              </SteadyDigits>
            </button>

            {/* Reset Field Button - Square shape (with confirmation) */}
            <button
              onClick={onResetField}
              className={matchCapsuleButtonStyle}
              title={t('controlBar.resetField', 'Reset Field')}
              aria-label={t('controlBar.resetField', 'Reset Field')}
            >
              <HiOutlineTrash className={iconSize} />
            </button>

            {/* Menu Button - Square shape (rightmost of the centered group) */}
            <button
              onClick={handleSettingsButtonClick}
              className={matchCapsuleButtonStyle}
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
              onClick={closeFieldTools}
              className={buttonStyle}
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
              className={buttonStyle}
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
              className={buttonStyle}
              title={t('controlBar.redo', 'Redo')}
            >
              <HiOutlineArrowUturnRight className={iconSize} />
            </button>

            {/* Add Home Disc (only visible in tactics board mode). The icon is
                the disc it adds: white, like the home discs on the board. */}
            {isTacticsBoardView && (
              <button
                onClick={onAddHomeDisc}
                className={buttonStyle}
                title={t('controlBar.addHomeDisc', 'Add Home Disc')}
              >
                <HiOutlinePlusCircle className={`${iconSize} text-white`} />
              </button>
            )}

            {/* Add Opponent / Add Opponent Disc - the red of the opponent discs */}
            <button
              onClick={isTacticsBoardView ? onAddOpponentDisc : onAddOpponent}
              className={buttonStyle}
              title={isTacticsBoardView ? t('controlBar.addOpponentDisc', 'Add Opponent Disc') : t('controlBar.addOpponent', 'Add Opponent')}
            >
              <HiOutlinePlusCircle className={`${iconSize} text-loss`} />
            </button>

            {/* Clear Drawings */}
            <button
              onClick={onClearDrawings}
              className={buttonStyle}
              title={t('controlBar.clearDrawings', 'Clear Drawings')}
            >
              <HiOutlineBackspace className={iconSize} />
            </button>

            {/* Reset Field */}
            <button
              onClick={onResetField}
              className={buttonStyle}
              title={t('controlBar.resetField', 'Reset Field')}
            >
              <HiOutlineTrash className={iconSize} />
            </button>
          </>
        )}
      </div>

      {/* Settings Menu Overlay */}
      {isSettingsMenuOpen && (
        <div className="fixed inset-0 bg-[rgb(2_6_23/0.6)] z-40" onClick={handleOverlayClick} aria-hidden="true" />
      )}

      {/* Settings Side Panel. Closed, it parks 64px further left than its own
          width: its drop shadow reaches 48px past its right edge, and parked
          at exactly -100% that shadow lay over the pitch as a dark strip down
          the screen edge. */}
      <div
        ref={settingsMenuRef}
        data-testid="settings-side-panel"
        aria-hidden={!isSettingsMenuOpen}
        className={`fixed top-0 left-0 h-full ${DESIGN_TOKENS.MENU_WIDTH} max-w-[86vw] z-50 flex flex-col s1-canvas font-ui rounded-r-[28px] shadow-[20px_0_40px_-12px_rgb(2_6_23/0.8),inset_-1px_0_0_rgb(255_255_255/0.07)] overflow-hidden ${
          isDragging ? '' : 'transition-transform duration-300 ease-in-out'
        } ${isSettingsMenuOpen ? 'translate-x-0' : '-translate-x-[calc(100%+64px)]'}`}
        style={isDragging ? { transform: `translateX(${dragOffset}px)` } : {}}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {/* Header */}
        <div className="relative pl-5 pr-3 pt-6 pb-3 flex justify-between items-center z-10">
          <h3 className={dialogTitleStyle}>{t('controlBar.menu.title', 'Menu')}</h3>
          <button
            onClick={() => { setIsSettingsMenuOpen(false); setDragOffset(0); }}
            className="w-11 h-11 flex items-center justify-center rounded-full s1-raised text-ink-2 hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
            title={t('common.closeMenu', 'Close Menu')}
          >
            <HiOutlineChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation content */}
        <nav className="relative flex flex-col px-3 pb-6 pt-2 space-y-0.5 overflow-y-auto flex-1 z-10">
          {/* 3.1 menu shrink: MATCH scope only. Every club/app entry
              (load/new game, roster, teams, personnel, seasons, planner,
              training, rules, backup, settings, sign out, external
              resources) lives on Home now - the reachability table in
              two-level-app-structure.md SS2 gives each item exactly one
              home. Taso stays: it is a game-day workflow tool (owner
              decision 2026-07-14). "Koti" is the one way back (also the
              bar-level Home button + hardware back). */}
          <div className="mb-4">
            <h4 className={`${sectionLabelStyle} px-3 mb-1.5`}>
              {t('controlBar.menu.thisMatch', 'This match')}
            </h4>
            <button onClick={wrapImmediate(onQuickSave)} className={MENU_ROW}>
              <HiOutlineArchiveBoxArrowDown className={MENU_ICON} /> {t('controlBar.saveGame', 'Quick Save')}
            </button>
            <button
              onClick={wrapModal(onOpenGameSettingsModal)}
              className={`${MENU_ROW} ${
                !isGameLoaded ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={!isGameLoaded}
            >
              <HiOutlineAdjustmentsHorizontal className={MENU_ICON} /> {t('controlBar.gameSettingsButton', 'Match details')}
            </button>
            {onOpenPlayerAssessmentModal && (
              <button
                onClick={wrapModal(onOpenPlayerAssessmentModal)}
                className={MENU_ROW}
                title={t('instructionsModal.controlBar.assessPlayers')}
              >
                <HiOutlineClipboard className={MENU_ICON} />{t('controlBar.assessPlayers', 'Record Performance')}
              </button>
            )}
            <button onClick={wrapModal(onToggleGameStatsModal)} className={MENU_ROW}>
              <HiOutlineClipboardDocumentCheck className={MENU_ICON} />
              {t('controlBar.gameReport', 'Finish this game')}
              {finishProgress && (
                  // State, not a permanent badge: it appears because the match
                  // is unfinished and turns green when it is done, so the menu
                  // answers "is there anything left" without opening a screen.
                <span
                  className="ml-auto flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-ink-2"
                  data-testid="menu-finish-progress"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      finishProgress.done >= finishProgress.total ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}
                    aria-hidden="true"
                  />
                  {finishProgress.done}/{finishProgress.total}
                </span>
              )}
            </button>
            {/* Deep-review: the separate "Match stats" entry was identical to
                Finish this game (same modal, same landing) - collapsed into one.
                Aggregate stats live behind "Team stats ->". */}
            {onOpenTeamStats && (
              <button onClick={wrapModal(onOpenTeamStats)} className={MENU_ROW}>
                <HiOutlineClipboardDocumentList className={MENU_ICON} />
                {t('controlBar.teamStats', 'Team stats')}
                <span className="ml-auto text-ink-3" aria-hidden="true">&rarr;</span>
              </button>
            )}
            {onOpenPlanner && (
              <button onClick={wrapModal(onOpenPlanner)} className={MENU_ROW}>
                <HiOutlineTableCells className={MENU_ICON} />
                {t('controlBar.planner', 'Match planner')}
                <span className="ml-auto text-ink-3" aria-hidden="true">&rarr;</span>
              </button>
            )}
            {onOpenThisGamePlan && (
              <button
                onClick={wrapModal(onOpenThisGamePlan)}
                data-testid="open-this-game-plan"
                className={MENU_ROW}
              >
                <HiOutlineTableCells className={MENU_ICON} />
                {t('controlBar.thisGamePlan', "This game's plan")}
                <span className="ml-auto text-ink-3" aria-hidden="true">&rarr;</span>
              </button>
            )}
          </div>

          {/* Taso: game-day workflow tool (lineups before, results after). */}
          <div className="mb-4">
            <h4 className={`${sectionLabelStyle} px-3 mb-1.5`}>
              {t('controlBar.menu.resources', 'Resources')}
            </h4>
            {onOpenTraining && (
              <button onClick={wrapModal(onOpenTraining)} className={MENU_ROW}>
                <HiOutlineBookOpen className={MENU_ICON} />{t('controlBar.training', 'Warmup Plan')}
              </button>
            )}
            {onOpenRules && (
              <button onClick={wrapModal(onOpenRules)} className={MENU_ROW}>
                <HiOutlineScale className={MENU_ICON} />{t('controlBar.rulesDirectory', 'Rules')}
              </button>
            )}
            {/* Directions, when this match has a pinned venue. Sits with the
                other game-day destinations rather than under settings: it is
                used on the way OUT of the door, not while configuring. */}
            {venueMapUrl ? (
              <a
                href={venueMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={EXTERNAL_LINK_ROW}
                onClick={wrapImmediate(() => {})}
              >
                <MdDirectionsCar className={MENU_ICON} />
                {t('controlBar.driveToVenue', 'Directions to the venue')}
              </a>
            ) : null}
            <a
              href={TASO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={EXTERNAL_LINK_ROW}
              onClick={wrapImmediate(() => {})}
            >
              <HiOutlineArrowTopRightOnSquare className={MENU_ICON} />
              {t('controlBar.tasoLink', 'Taso')}
            </a>
          </div>

          {/* App settings sat behind Home, so changing anything during a match
              meant leaving the match to do it - and the AI provider key lives
              there, which is exactly what a coach needs mid-session when
              transcription says it is not connected. */}
          {(onOpenAppSettings || onGoToStartScreen) && (
            <div className="pt-2 border-t border-hairline">
              {onOpenAppSettings && (
                <button
                  onClick={wrapModal(onOpenAppSettings)}
                  data-testid="menu-app-settings"
                  className={MENU_ROW}
                >
                  <HiOutlineCog6Tooth className={MENU_ICON} />
                  {t('controlBar.appSettings', 'Settings')}
                </button>
              )}
              {/* The one way back to club scope (mirrored by hardware back).
                  Autosave makes leaving always safe. */}
              {onGoToStartScreen && (
                <button
                  onClick={wrapImmediate(onGoToStartScreen)}
                  className={MENU_ROW}
                >
                  <HiOutlineHome className={MENU_ICON} />
                  {t('controlBar.home', 'Home')}
                </button>
              )}
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
