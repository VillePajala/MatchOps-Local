'use client';

import React, { useState, useEffect, useRef } from 'react';
// Import Heroicons (Outline style)
import {
    HiOutlineArrowUturnLeft,
    HiOutlineArrowUturnRight,
    HiOutlineTrash,
    HiOutlineBackspace, // Icon for Clear Drawings
    HiOutlineStopCircle,
    HiOutlineClock,
    HiOutlineClipboardDocumentList, // Replaces FaClipboardList
    HiOutlineClipboard, // Icon for Tactics Board
    HiOutlineCog6Tooth, // Settings icon
    HiOutlineBookOpen, // Import for Training Resources
    HiOutlineArrowTopRightOnSquare, // External link icon
    HiOutlineChevronLeft, // Chevron for Back button
    HiOutlineQuestionMarkCircle, // Icon for help
    HiOutlinePlusCircle, // Icon for adding discs
    // HiOutlineMinusCircle, // Icon for adding opponent discs
    // HiOutlineFolderArrowDown,   // Icon for Save Game As... (COMMENTED OUT)
    HiOutlineFolderOpen,       // Icon for Load Game...
    HiOutlineArrowPath,        // CORRECT Icon for Reset Stats
    HiOutlineUsers,            // Icon for Manage Roster
    HiOutlineArchiveBoxArrowDown, // Use this for Quick Save
    // ADD New Icons
    HiOutlineAdjustmentsHorizontal, // For Game Settings
    HiOutlineDocumentArrowDown,   // For Export Data
    HiOutlineSquares2X2,       // For Place All Players on Field
    // HiOutlineXCircle, // REMOVE unused
    // HiOutlineRectangleGroup, // REMOVE unused
    HiOutlineTrophy,
    HiBars3, // Hamburger menu icon
} from 'react-icons/hi2'; // Using hi2 for Heroicons v2 Outline
// REMOVE FaClock, FaUsers, FaCog (FaFutbol remains)
import { FaFutbol } from 'react-icons/fa';

// Import translation hook
import { useTranslation } from 'react-i18next';
import logger from '@/utils/logger';

// Define props for ControlBar
interface ControlBarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onResetField: () => void;
  onClearDrawings: () => void;
  onAddOpponent: () => void;
  showLargeTimerOverlay: boolean;
  onToggleLargeTimerOverlay: () => void;
  onToggleTrainingResources: () => void; // Add prop for training modal
  onToggleGoalLogModal: () => void; // Add prop for goal modal
  onToggleGameStatsModal: () => void;
  onOpenLoadGameModal: () => void; // NEW PROP
  onStartNewGame: () => void; // CHANGED from onResetGameStats
  onOpenRosterModal: () => void; // Add prop for opening roster modal
  onQuickSave: () => void; // Add prop for quick save
  onOpenGameSettingsModal: () => void;
  isGameLoaded: boolean; // To enable/disable the settings button
  onPlaceAllPlayers: () => void; // New prop for placing all players on the field
  highlightRosterButton: boolean; // <<< ADD prop for highlighting
  onOpenSeasonTournamentModal: () => void;
  isTacticsBoardView: boolean;
  onToggleTacticsBoard: () => void;
  onAddHomeDisc: () => void;
  onAddOpponentDisc: () => void;
  onToggleInstructionsModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenPlayerAssessmentModal: () => void;
  onOpenTeamManagerModal: () => void;
}

const ControlBar: React.FC<ControlBarProps> = ({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onResetField,
  onClearDrawings,
  onAddOpponent,
  showLargeTimerOverlay,
  onToggleLargeTimerOverlay,
  onToggleTrainingResources,
  onToggleGoalLogModal,
  onToggleGameStatsModal,
  onOpenLoadGameModal,
  onStartNewGame,
  onOpenRosterModal,
  onQuickSave,
  onOpenGameSettingsModal,
  isGameLoaded,
  onPlaceAllPlayers,
  highlightRosterButton, // <<< Receive prop
  onOpenSeasonTournamentModal,
  isTacticsBoardView,
  onToggleTacticsBoard,
  onAddHomeDisc,
  onAddOpponentDisc,
  onToggleInstructionsModal,
  onOpenSettingsModal,
  onOpenPlayerAssessmentModal,
  onOpenTeamManagerModal,
}) => {
  const { t } = useTranslation(); // Standard hook
  logger.log('[ControlBar Render] Received highlightRosterButton prop:', highlightRosterButton); // <<< Log prop value
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  
  // Touch/Mouse drag handling state
  const dragStartX = useRef<number>(0);
  const dragStartTime = useRef<number>(0);
  
  // --- RE-ADD BUTTON STYLES --- 
  // Consistent Button Styles - Adjusted active state
  const baseButtonStyle = "text-slate-100 font-semibold py-1.5 px-2 w-9 h-9 flex items-center justify-center rounded-md shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900";
  
  // Specific Colors - Added specific hover backgrounds
  const secondaryColor = "bg-slate-700 hover:bg-slate-600 focus:ring-slate-500";
  const resetColor = "bg-red-600 hover:bg-red-500 focus:ring-red-500";
  const clearColor = "bg-amber-600 hover:bg-amber-500 focus:ring-amber-500 text-white";
  const logGoalColor = "bg-blue-600 hover:bg-blue-500 focus:ring-blue-500"; 
  // --- END RE-ADD BUTTON STYLES --- 


  const handleSettingsButtonClick = () => {
    setIsSettingsMenuOpen(!isSettingsMenuOpen);
    setDragOffset(0); // Reset drag offset when toggling
  };

  // Drag gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragStartX.current = e.touches[0].clientX;
      dragStartTime.current = Date.now();
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches.length === 1) {
      const currentX = e.touches[0].clientX;
      const diff = currentX - dragStartX.current;
      
      // Only allow leftward drags (negative diff)
      if (diff <= 0) {
        const newOffset = Math.max(-320, diff); // Clamp to panel width
        setDragOffset(newOffset);
        
        // Prevent page scroll when drag exceeds 10px
        if (Math.abs(diff) > 10) {
          e.preventDefault();
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      // If dragged beyond 30% of panel width (-96px), close
      if (dragOffset < -96) {
        setIsSettingsMenuOpen(false);
      }
      setDragOffset(0);
      setIsDragging(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartX.current = e.clientX;
    setIsDragging(true);
    
    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - dragStartX.current;
      if (diff <= 0) {
        setDragOffset(Math.max(-320, diff));
      }
    };
    
    const handleMouseUp = () => {
      if (dragOffset < -96) {
        setIsSettingsMenuOpen(false);
      }
      setDragOffset(0);
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Close settings menu if clicking outside or on overlay
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setIsSettingsMenuOpen(false);
        setDragOffset(0);
      }
    };

    if (isSettingsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSettingsMenuOpen]);

  const iconSize = "w-5 h-5"; // Standard icon size class

  // Helper to wrap handlers to also close the menu & reset view
  const wrapHandler = (handler: () => void) => () => {
    handler();
    setIsSettingsMenuOpen(false);
    setDragOffset(0);
  };
  
  const handleOverlayClick = () => {
    setIsSettingsMenuOpen(false);
    setDragOffset(0);
  };

  // Callback to handle StartNewGame button click
  const handleStartNewGame = () => {
    onStartNewGame();
    setIsSettingsMenuOpen(false);
    setDragOffset(0);
  };

  return (
    <div className="bg-gradient-to-b from-slate-800 to-slate-900 p-2 shadow-md flex flex-wrap justify-center items-center gap-x-4 gap-y-2 relative z-40">
      {/* Left Group: Undo/Redo */}
      <div className="flex items-center gap-1">
        <button onClick={onUndo} disabled={!canUndo} className={`${baseButtonStyle} ${secondaryColor}`} title={t('controlBar.undo', 'Undo')}>
            <HiOutlineArrowUturnLeft className={iconSize}/>
        </button>
        <button onClick={onRedo} disabled={!canRedo} className={`${baseButtonStyle} ${secondaryColor}`} title={t('controlBar.redo', 'Redo')}>
            <HiOutlineArrowUturnRight className={iconSize}/>
        </button>
      </div>

      {/* Center Group: Field Actions */}
      <div className="flex items-center gap-1">
        <button 
          onClick={onToggleTacticsBoard} 
          className={`${baseButtonStyle} ${isTacticsBoardView ? 'bg-indigo-600 hover:bg-indigo-500 focus:ring-indigo-500' : secondaryColor}`} 
          title={t(isTacticsBoardView ? 'controlBar.toggleTacticsBoardHide' : 'controlBar.toggleTacticsBoardShow') ?? (isTacticsBoardView ? "Show Players" : "Show Tactics Board")}
        >
            <HiOutlineClipboard className={iconSize}/>
        </button>
        {isTacticsBoardView ? (
          <>
            <button onClick={onAddHomeDisc} className={`${baseButtonStyle} bg-purple-600 hover:bg-purple-500 focus:ring-purple-500`} title={t('controlBar.addHomeDisc', 'Add Home Disc') ?? "Add Home Disc"}>
              <HiOutlinePlusCircle className={iconSize}/>
            </button>
            <button onClick={onAddOpponentDisc} className={`${baseButtonStyle} bg-red-600 hover:bg-red-500 focus:ring-red-500`} title={t('controlBar.addOpponentDisc', 'Add Opponent Disc') ?? "Add Opponent Disc"}>
              <HiOutlinePlusCircle className={iconSize}/>
            </button>
            <button onClick={onClearDrawings} className={`${baseButtonStyle} ${clearColor}`} title={t('controlBar.clearDrawings', 'Clear Drawings')}>
                <HiOutlineBackspace className={iconSize}/>
            </button>
            <button onClick={onResetField} className={`${baseButtonStyle} ${resetColor}`} title={t('controlBar.resetField', 'Reset Field')}>
                <HiOutlineTrash className={iconSize}/>
            </button>
          </>
        ) : (
          <>
        <button onClick={onPlaceAllPlayers} className={`${baseButtonStyle} bg-purple-600 hover:bg-purple-500 focus:ring-purple-500`} title={t('controlBar.placeAllPlayers', 'Place All Players on Field')}>
            <HiOutlineSquares2X2 className={iconSize}/>
        </button>
        <button onClick={onAddOpponent} className={`${baseButtonStyle} bg-red-600 hover:bg-red-500 focus:ring-red-500`} title={t('controlBar.addOpponent', 'Add Opponent')}>
            <HiOutlinePlusCircle className={iconSize}/>
        </button>
        <button onClick={onClearDrawings} className={`${baseButtonStyle} ${clearColor}`} title={t('controlBar.clearDrawings', 'Clear Drawings')}>
            <HiOutlineBackspace className={iconSize}/>
        </button>
        <button onClick={onResetField} className={`${baseButtonStyle} ${resetColor}`} title={t('controlBar.resetField', 'Reset Field')}>
            <HiOutlineTrash className={iconSize}/>
        </button>
          </>
        )}
      </div>

      {/* Right Group: Live/Info Actions & Settings */}
      <div className="flex items-center gap-1">
        {/* Log Goal (Moved Here, Use FaFutbol Icon) */}
        <button onClick={onToggleGoalLogModal} className={`${baseButtonStyle} ${logGoalColor}`} title={t('controlBar.logGoal', 'Log Goal') ?? "Log Goal"}>
            <FaFutbol size={18} />
        </button>

        {/* <<< ADD Roster Settings Button >>> */}
        <button 
            id="roster-button" // Add an ID for potential coach mark targeting later
            onClick={onOpenRosterModal}
            className={`${baseButtonStyle} ${highlightRosterButton ? 'bg-indigo-600 hover:bg-indigo-500 focus:ring-indigo-500 animate-pulse' : secondaryColor}`}
            title={t('controlBar.rosterSettings', 'Roster Settings') ?? "Roster Settings"}
        >
            <HiOutlineUsers className={iconSize} />
        </button>

        {/* <<< ADD Game Settings Button >>> */}
        <button
            onClick={onOpenGameSettingsModal}
            // Disable if no game is loaded? Keep enabled for consistency?
            // Let's keep it enabled, the modal itself might handle the state.
            // disabled={!isGameLoaded} 
            className={`${baseButtonStyle} ${secondaryColor}`}
            title={t('controlBar.gameSettings', 'Game Settings') ?? "Game Settings"}
        >
            <HiOutlineAdjustmentsHorizontal className={iconSize} />
        </button>

        <button
          onClick={onToggleInstructionsModal}
          className={`${baseButtonStyle} ${secondaryColor}`}
          title={t('controlBar.appGuide', 'App Guide')}
        >
            <HiOutlineQuestionMarkCircle className={iconSize} />
        </button>

        {/* Toggle Overlay Button */}
        <button
          onClick={onToggleLargeTimerOverlay}
          className={`${baseButtonStyle} bg-green-600 hover:bg-green-700 focus:ring-green-500`}
          title={t(showLargeTimerOverlay ? 'controlBar.toggleTimerOverlayHide' : 'controlBar.toggleTimerOverlayShow') ?? (showLargeTimerOverlay ? "Hide Large Timer" : "Show Large Timer")}
        >
            {showLargeTimerOverlay ? <HiOutlineStopCircle className={iconSize} /> : <HiOutlineClock className={iconSize} />}
        </button>
        
        
        {/* Settings Menu Button (REMAINING) */}
        <div className="relative" ref={settingsMenuRef}>
          <button
            onClick={handleSettingsButtonClick}
            className={`${baseButtonStyle} ${secondaryColor}`}
            title={t('controlBar.settings', 'Settings')}
          >
            <HiBars3 className={`${iconSize} transition-transform duration-150 ${isSettingsMenuOpen ? 'rotate-90' : ''}`} />
          </button>

          {/* Overlay (scrim) - only when menu is open */}
          {isSettingsMenuOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-40"
              onClick={handleOverlayClick}
            />
          )}

          {/* Settings Side Panel */}
          <div 
            ref={settingsMenuRef}
            className={`fixed top-0 left-0 h-full w-80 z-50 flex flex-col bg-slate-800/98 backdrop-blur-sm shadow-xl border-r border-slate-600/50 ${
              isDragging ? '' : 'transition-transform duration-300 ease-in-out'
            } ${
              isSettingsMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={isDragging ? { transform: `translateX(${dragOffset}px)` } : {}}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-700/80 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-yellow-300">{t('controlBar.menu.title', 'Menu')}</h3>
              <button 
                onClick={() => { setIsSettingsMenuOpen(false); setDragOffset(0); }} 
                className="text-slate-400 hover:text-slate-200 p-1 rounded"
                title={t('common.closeMenu', 'Close Menu') ?? undefined}
              >
                <HiOutlineChevronLeft className="w-5 h-5"/>
              </button>
            </div>
            {/* Navigation content */}
            <nav className="flex flex-col p-4 space-y-1 overflow-y-auto flex-1">
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
                  <HiOutlineUsers className="w-5 h-5 mr-2" /> {t('controlBar.manageTeams', 'Manage Teams')}
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
        </div>
      </div>
    </div>
  );
};

export default ControlBar;