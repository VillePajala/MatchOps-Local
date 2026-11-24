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

  // Tiles in the navy house style: raised navy, an amber ring for the one
  // state that is "on" (tactics), red only for the opponent icon.
  const buttonStyle = "flex flex-col items-center justify-center min-h-[72px] p-3 rounded-2xl font-ui transition-[filter,background-color] duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-action";
  const tileStyle = "s1-raised text-ink hover:bg-white/[0.07]";
  const tileOnStyle = "s1-seg-on text-ink shadow-[inset_0_0_0_1.5px_var(--color-action)]";
  const labelStyle = "text-xs font-semibold mt-1 text-ink-2";
  const iconSize = "w-6 h-6";

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="field-tools-backdrop"
        className="fixed inset-0 bg-[rgb(12_4_13/0.6)] z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 s1-canvas rounded-[28px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_20px_40px_-12px_rgb(12_4_13/0.9)] p-4 animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-2xl font-bold text-ink">
            {t('fieldTools.title', 'Field Tools')}
          </h3>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-full s1-raised text-ink-2 hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
            aria-label={t('common.close', 'Close')}
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-3 gap-2 min-w-[280px]">
          {/* Undo */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`${buttonStyle} ${tileStyle}`}
            title={t('controlBar.undo', 'Undo')}
          >
            <HiOutlineArrowUturnLeft className={iconSize} />
            <span className={labelStyle}>
              {t('controlBar.undo', 'Undo')}
            </span>
          </button>

          {/* Redo */}
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`${buttonStyle} ${tileStyle}`}
            title={t('controlBar.redo', 'Redo')}
          >
            <HiOutlineArrowUturnRight className={iconSize} />
            <span className={labelStyle}>
              {t('controlBar.redo', 'Redo')}
            </span>
          </button>

          {/* Tactics Toggle */}
          <button
            onClick={onToggleTacticsBoard}
            className={`${buttonStyle} ${isTacticsBoardView ? tileOnStyle : tileStyle}`}
            title={t(isTacticsBoardView ? 'controlBar.toggleTacticsBoardHide' : 'controlBar.toggleTacticsBoardShow') ?? 'Tactics'}
          >
            <HiOutlineClipboard className={iconSize} />
            <span className={labelStyle}>
              {t('fieldTools.tactics', 'Tactics')}
            </span>
          </button>

          {/* Conditional: Place All Players OR Add Home Disc */}
          {!isTacticsBoardView ? (
            <button
              onClick={onPlaceAllPlayers}
              className={`${buttonStyle} ${tileStyle}`}
              title={t('controlBar.placeAllPlayers', 'Place All Players on Field')}
            >
              <HiOutlineSquares2X2 className={iconSize} />
              <span className={labelStyle}>
                {t('fieldTools.placeAll', 'Place All')}
              </span>
            </button>
          ) : (
            <button
              onClick={onAddHomeDisc}
              className={`${buttonStyle} ${tileStyle}`}
              title={t('controlBar.addHomeDisc', 'Add Home Disc')}
            >
              <HiOutlinePlusCircle className={iconSize} />
              <span className={labelStyle}>
                {t('fieldTools.addHome', 'Add Home')}
              </span>
            </button>
          )}

          {/* Add Opponent / Add Opponent Disc */}
          <button
            onClick={isTacticsBoardView ? onAddOpponentDisc : onAddOpponent}
            className={`${buttonStyle} ${tileStyle}`}
            title={isTacticsBoardView ? t('controlBar.addOpponentDisc', 'Add Opponent Disc') : t('controlBar.addOpponent', 'Add Opponent')}
          >
            <HiOutlinePlusCircle className={`${iconSize} text-loss`} />
            <span className={labelStyle}>
              {t('fieldTools.addOpponent', 'Add Opp')}
            </span>
          </button>

          {/* Clear Drawings */}
          <button
            onClick={onClearDrawings}
            className={`${buttonStyle} ${tileStyle}`}
            title={t('controlBar.clearDrawings', 'Clear Drawings')}
          >
            <HiOutlineBackspace className={iconSize} />
            <span className={labelStyle}>
              {t('fieldTools.clear', 'Clear')}
            </span>
          </button>

          {/* Reset Field */}
          <button
            onClick={onResetField}
            className={`${buttonStyle} ${tileStyle}`}
            title={t('controlBar.resetField', 'Reset Field')}
          >
            <HiOutlineTrash className={iconSize} />
            <span className={labelStyle}>
              {t('fieldTools.reset', 'Reset')}
            </span>
          </button>
        </div>
      </div>
    </>
  );
};

export default FieldToolsPanel;
