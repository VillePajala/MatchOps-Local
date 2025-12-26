'use client';

import React, { useEffect, useRef } from 'react';
import {
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineTrash,
  HiOutlineBackspace,
  HiOutlinePlusCircle,
  HiOutlineClipboard,
  HiOutlineSquares2X2,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';

interface FieldToolsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Undo/Redo
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // Tactics
  isTacticsBoardView: boolean;
  onToggleTacticsBoard: () => void;
  // Field actions
  onPlaceAllPlayers: () => void;
  onAddOpponent: () => void;
  onAddHomeDisc: () => void;
  onAddOpponentDisc: () => void;
  onClearDrawings: () => void;
  onResetField: () => void;
}

const FieldToolsPanel: React.FC<FieldToolsPanelProps> = ({
  isOpen,
  onClose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isTacticsBoardView,
  onToggleTacticsBoard,
  onPlaceAllPlayers,
  onAddOpponent,
  onAddHomeDisc,
  onAddOpponentDisc,
  onClearDrawings,
  onResetField,
}) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Add a small delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const buttonStyle = "flex flex-col items-center justify-center p-3 rounded-lg transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const iconSize = "w-6 h-6";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 bg-slate-800/98 backdrop-blur-lg rounded-2xl shadow-2xl border border-slate-600/50 p-4 animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-slate-200">
            {t('fieldTools.title', 'Field Tools')}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md hover:bg-slate-700/50 transition-colors"
            aria-label="Close"
          >
            <HiOutlineXMark className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-3 gap-2 min-w-[280px]">
          {/* Undo */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`${buttonStyle} ${canUndo ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800'}`}
            title={t('controlBar.undo', 'Undo')}
          >
            <HiOutlineArrowUturnLeft className={iconSize} aria-hidden="true" />
            <span className="text-xs mt-1 text-slate-200">
              {t('controlBar.undo', 'Undo')}
            </span>
          </button>

          {/* Redo */}
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`${buttonStyle} ${canRedo ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800'}`}
            title={t('controlBar.redo', 'Redo')}
          >
            <HiOutlineArrowUturnRight className={iconSize} aria-hidden="true" />
            <span className="text-xs mt-1 text-slate-200">
              {t('controlBar.redo', 'Redo')}
            </span>
          </button>

          {/* Tactics Toggle */}
          <button
            onClick={onToggleTacticsBoard}
            className={`${buttonStyle} ${isTacticsBoardView ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-700 hover:bg-slate-600'}`}
            title={t(isTacticsBoardView ? 'controlBar.toggleTacticsBoardHide' : 'controlBar.toggleTacticsBoardShow') ?? 'Tactics'}
          >
            <HiOutlineClipboard className={iconSize} aria-hidden="true" />
            <span className="text-xs mt-1 text-slate-200">
              {t('fieldTools.tactics', 'Tactics')}
            </span>
          </button>

          {/* Conditional: Place All Players OR Add Home Disc */}
          {!isTacticsBoardView ? (
            <button
              onClick={onPlaceAllPlayers}
              className={`${buttonStyle} bg-indigo-600 hover:bg-indigo-500`}
              title={t('controlBar.placeAllPlayers', 'Place All Players')}
            >
              <HiOutlineSquares2X2 className={iconSize} aria-hidden="true" />
              <span className="text-xs mt-1 text-slate-200">
                {t('fieldTools.placeAll', 'Place All')}
              </span>
            </button>
          ) : (
            <button
              onClick={onAddHomeDisc}
              className={`${buttonStyle} bg-indigo-600 hover:bg-indigo-500`}
              title={t('controlBar.addHomeDisc', 'Add Home Disc')}
            >
              <HiOutlinePlusCircle className={iconSize} aria-hidden="true" />
              <span className="text-xs mt-1 text-slate-200">
                {t('fieldTools.addHome', 'Add Home')}
              </span>
            </button>
          )}

          {/* Add Opponent / Add Opponent Disc */}
          <button
            onClick={isTacticsBoardView ? onAddOpponentDisc : onAddOpponent}
            className={`${buttonStyle} bg-red-600 hover:bg-red-500`}
            title={isTacticsBoardView ? t('controlBar.addOpponentDisc', 'Add Opponent Disc') : t('controlBar.addOpponent', 'Add Opponent')}
          >
            <HiOutlinePlusCircle className={iconSize} aria-hidden="true" />
            <span className="text-xs mt-1 text-slate-200">
              {t('fieldTools.addOpponent', 'Add Opp')}
            </span>
          </button>

          {/* Clear Drawings */}
          <button
            onClick={onClearDrawings}
            className={`${buttonStyle} bg-amber-600 hover:bg-amber-500`}
            title={t('controlBar.clearDrawings', 'Clear Drawings')}
          >
            <HiOutlineBackspace className={iconSize} aria-hidden="true" />
            <span className="text-xs mt-1 text-slate-200">
              {t('fieldTools.clear', 'Clear')}
            </span>
          </button>

          {/* Reset Field */}
          <button
            onClick={onResetField}
            className={`${buttonStyle} bg-red-600 hover:bg-red-500`}
            title={t('controlBar.resetField', 'Reset Field')}
          >
            <HiOutlineTrash className={iconSize} aria-hidden="true" />
            <span className="text-xs mt-1 text-slate-200">
              {t('fieldTools.reset', 'Reset')}
            </span>
          </button>
        </div>
      </div>
    </>
  );
};

export default FieldToolsPanel;
