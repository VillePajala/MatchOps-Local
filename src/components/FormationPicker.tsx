'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineSquares2X2 } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import {
  FIELD_SIZES,
  PRESETS_BY_SIZE,
  getRecommendedFieldSize,
  type FormationPreset,
  type FieldSize,
} from '@/config/formationPresets';

// Match ControlBar design tokens
const BUTTON_SIZE = 'w-10 h-10';
const ICON_SIZE = 'w-5 h-5';
const DROPDOWN_MAX_WIDTH_PX = 224; // Tailwind w-56

type DropdownLayout = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

interface FormationPickerProps {
  /** Callback when a formation is selected (preset ID or 'auto') */
  onSelectFormation: (presetId: string | null) => void;
  /** Number of selected players (for recommendations) */
  selectedPlayerCount: number;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

/**
 * Formation preset picker dropdown
 *
 * Shows a button that opens a dropdown with formation presets
 * grouped by field size. Recommends appropriate formations based
 * on the current player count.
 *
 * Uses a portal to render the dropdown outside the ControlBar DOM tree
 * to avoid clipping issues with overflow:auto.
 */
const FormationPicker: React.FC<FormationPickerProps> = React.memo(({
  onSelectFormation,
  selectedPlayerCount,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownLayout, setDropdownLayout] = useState<DropdownLayout>({
    left: 0,
    top: 0,
    width: DROPDOWN_MAX_WIDTH_PX,
    maxHeight: 400,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Recommended field size based on player count
  const recommendedSize = getRecommendedFieldSize(selectedPlayerCount);

  const updateDropdownLayout = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

    const viewportPadding = 12;
    const gap = 8;

    const width = Math.min(DROPDOWN_MAX_WIDTH_PX, Math.max(0, viewportWidth - viewportPadding * 2));
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      Math.max(viewportPadding, viewportWidth - viewportPadding - width)
    );

    const spaceAbove = rect.top - viewportPadding;
    const spaceBelow = viewportHeight - rect.bottom - viewportPadding;
    const placeAbove = spaceAbove >= spaceBelow;

    if (placeAbove) {
      const maxHeight = Math.max(0, spaceAbove - gap);
      setDropdownLayout({
        left: Math.round(left),
        bottom: Math.round(viewportHeight - rect.top + gap),
        width: Math.floor(width),
        maxHeight: Math.floor(maxHeight),
      });
      return;
    }

    const top = rect.bottom + gap;
    const maxHeight = Math.max(0, viewportHeight - top - viewportPadding);
    setDropdownLayout({
      left: Math.round(left),
      top: Math.round(top),
      width: Math.floor(width),
      maxHeight: Math.floor(maxHeight),
    });
  }, []);

  // Update dropdown layout when open + on viewport changes
  useEffect(() => {
    if (!isOpen) return;

    updateDropdownLayout();

    window.addEventListener('resize', updateDropdownLayout);
    window.addEventListener('scroll', updateDropdownLayout, true);
    window.visualViewport?.addEventListener('resize', updateDropdownLayout);
    window.visualViewport?.addEventListener('scroll', updateDropdownLayout);

    return () => {
      window.removeEventListener('resize', updateDropdownLayout);
      window.removeEventListener('scroll', updateDropdownLayout, true);
      window.visualViewport?.removeEventListener('resize', updateDropdownLayout);
      window.visualViewport?.removeEventListener('scroll', updateDropdownLayout);
    };
  }, [isOpen, updateDropdownLayout]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleButtonClick = useCallback(() => {
    if (!disabled) {
      setIsOpen(prev => !prev);
    }
  }, [disabled]);

  const handleSelectAuto = useCallback(() => {
    onSelectFormation(null);  // null = auto mode
    setIsOpen(false);
  }, [onSelectFormation]);

  const handleSelectPreset = useCallback((preset: FormationPreset) => {
    onSelectFormation(preset.id);
    setIsOpen(false);
  }, [onSelectFormation]);

  // Use pre-computed presets grouped by field size (avoids recalculation on every render)

  // Dropdown content (rendered via portal)
  const dropdownContent = isOpen && typeof document !== 'undefined' ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed bg-slate-800 border border-slate-600/50 rounded-lg shadow-xl overflow-hidden flex flex-col overscroll-contain"
      style={{
        left: dropdownLayout.left,
        top: dropdownLayout.top,
        bottom: dropdownLayout.bottom,
        width: dropdownLayout.width,
        maxHeight: dropdownLayout.maxHeight,
        zIndex: 9999,
      }}
      role="menu"
      aria-orientation="vertical"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700/50 bg-slate-800/80 shrink-0">
        <p className="text-xs text-slate-400">
          {t('formations.playerCount', '{{count}} players selected', { count: selectedPlayerCount })}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto min-h-0 flex-1">
        {/* Auto option */}
        <button
          onClick={handleSelectAuto}
          className="w-full px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-700/50 flex items-center gap-2 transition-colors"
          role="menuitem"
        >
          <span className="font-medium">{t('formations.auto', 'Auto')}</span>
          <span className="text-slate-400 text-xs">
            {t('formations.autoDescription', 'Based on player count')}
          </span>
        </button>

        {/* Field size groups */}
        {FIELD_SIZES.map(size => (
          <div key={size}>
            {/* Size header */}
            <div className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-t border-slate-700/50 ${
              size === recommendedSize ? 'text-green-400 bg-green-900/20' : 'text-slate-500 bg-slate-800/50'
            }`}>
              {size}
              {size === recommendedSize && (
                <span className="ml-2 text-green-400/80 normal-case font-normal">
                  {t('formations.recommended', 'Recommended')}
                </span>
              )}
            </div>

            {/* Presets for this size */}
            {PRESETS_BY_SIZE[size].map(preset => (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className="w-full px-3 py-2 pl-6 text-left text-sm text-slate-200 hover:bg-slate-700/50 transition-colors flex items-center justify-between"
                role="menuitem"
              >
                <span>{preset.name}</span>
                <span className="text-slate-500 text-xs">
                  {preset.playerCount + 1} {t('formations.players', 'players')}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        disabled={disabled}
        className={`${BUTTON_SIZE} flex items-center justify-center rounded-md shadow-sm border border-slate-600/30 transition-all duration-200 active:scale-95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
          disabled
            ? 'bg-slate-800 opacity-50 cursor-not-allowed'
            : 'bg-slate-700 hover:bg-slate-600 focus:ring-slate-500'
        }`}
        title={t('controlBar.placeAllPlayers', 'Place All Players')}
        aria-label={t('controlBar.placeAllPlayers', 'Place All Players')}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <HiOutlineSquares2X2 className={ICON_SIZE} />
      </button>

      {/* Dropdown via Portal */}
      {dropdownContent}
    </>
  );
});

FormationPicker.displayName = 'FormationPicker';

export default FormationPicker;
