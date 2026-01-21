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
const DROPDOWN_MAX_WIDTH_PX = 300;
const VIEWPORT_PADDING = 12;
const MOBILE_BREAKPOINT = 640;

interface FormationPickerProps {
  /** Callback when a formation is selected (preset ID or 'auto') */
  onSelectFormation: (presetId: string | null) => void;
  /** Number of selected players (for recommendations) */
  selectedPlayerCount: number;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

/**
 * Shared menu content component for both mobile and desktop
 */
const MenuContent: React.FC<{
  selectedPlayerCount: number;
  recommendedSize: FieldSize;
  onSelectAuto: () => void;
  onSelectPreset: (preset: FormationPreset) => void;
  isMobile: boolean;
}> = ({ selectedPlayerCount, recommendedSize, onSelectAuto, onSelectPreset, isMobile }) => {
  const { t } = useTranslation();

  // Size classes - mobile matches other modal styling (like RosterSettingsModal)
  const headerClass = isMobile
    ? "relative z-10 flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 shrink-0"
    : "relative z-10 px-4 py-3 border-b border-slate-700/20 shrink-0 text-center";
  const titleClass = isMobile
    ? "text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg"
    : "text-sm font-bold text-yellow-400";
  const subtitleClass = isMobile ? "text-sm text-slate-400 mt-1" : "text-xs text-slate-400 mt-0.5";
  const contentClass = isMobile
    ? "relative z-10 overflow-y-auto flex-1 p-6 pb-20 space-y-4"
    : "relative z-10 overflow-y-auto min-h-0 flex-1 p-2 space-y-2";
  const autoButtonClass = isMobile
    ? "w-full px-4 py-2 text-center text-sm rounded-sm font-medium transition-colors bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400/30"
    : "w-full px-3 py-2 text-center text-sm rounded-sm font-medium transition-colors bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400/30";
  const cardClass = isMobile ? "p-4 rounded-lg" : "p-2 rounded-lg";
  const sizeHeaderClass = isMobile
    ? "px-1 py-1 text-sm font-semibold uppercase tracking-wider flex items-center gap-2 mb-2"
    : "px-1 py-0.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 mb-1.5";
  const badgeClass = isMobile
    ? "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 normal-case"
    : "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/20 text-yellow-400 normal-case";
  const gridClass = isMobile ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-1.5";
  const presetButtonClass = isMobile
    ? "px-4 py-4 text-left text-base rounded-lg transition-all bg-gradient-to-br from-slate-600/50 to-slate-800/30 text-slate-100 hover:from-slate-600/60 hover:to-slate-800/40"
    : "px-3 py-2 text-left text-sm rounded-lg transition-all bg-gradient-to-br from-slate-600/50 to-slate-800/30 text-slate-100 hover:from-slate-600/60 hover:to-slate-800/40";
  const presetNameClass = "font-medium";
  const presetCountClass = isMobile ? "text-slate-400 text-sm ml-2" : "text-slate-400 text-xs ml-1.5";

  return (
    <>
      {/* Background effects (from modalStyles) */}
      <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />

      {/* Header */}
      <div className={headerClass}>
        <div className="text-center">
          <h2 className={titleClass}>
            {t('formations.title', 'Place players on field')}
          </h2>
          <p className={subtitleClass}>
            {t('formations.playerCount', '{{count}} players selected', { count: selectedPlayerCount })}
          </p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className={contentClass}>
        {/* Auto option - primary indigo button like "Add Player" */}
        <button
          onClick={onSelectAuto}
          className={autoButtonClass}
          role="menuitem"
        >
          {t('formations.auto', 'Auto')}
        </button>

        {/* Field size groups */}
        {FIELD_SIZES.map(size => (
          <div
            key={size}
            className={`bg-gradient-to-br from-slate-900/60 to-slate-800/40 ${cardClass} border shadow-inner ${
              size === recommendedSize ? 'border-yellow-500/50' : 'border-slate-700'
            }`}
          >
            {/* Size header */}
            <div
              className={`${sizeHeaderClass} ${
                size === recommendedSize ? 'text-yellow-400' : 'text-slate-400'
              }`}
            >
              {size}
              {size === recommendedSize && (
                <span className={badgeClass}>
                  {t('formations.recommended', 'Recommended')}
                </span>
              )}
            </div>

            {/* Presets grid */}
            <div className={gridClass}>
              {PRESETS_BY_SIZE[size].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => onSelectPreset(preset)}
                  className={presetButtonClass}
                  role="menuitem"
                >
                  <span className={presetNameClass}>{preset.name}</span>
                  <span className={presetCountClass}>
                    ({preset.playerCount + 1})
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

/**
 * Formation preset picker dropdown
 *
 * Mobile: Full-screen overlay rendered directly (like TimerOverlay)
 * Desktop: Anchored dropdown via portal
 */
const FormationPicker: React.FC<FormationPickerProps> = React.memo(({
  onSelectFormation,
  selectedPlayerCount,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [desktopLayout, setDesktopLayout] = useState({
    left: 0,
    bottom: 0,
    width: DROPDOWN_MAX_WIDTH_PX,
    maxHeight: 400,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const justOpenedRef = useRef(false);

  const recommendedSize = getRecommendedFieldSize(selectedPlayerCount);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Update desktop layout when open
  const updateDesktopLayout = useCallback(() => {
    if (!buttonRef.current || isMobile) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rect = buttonRef.current.getBoundingClientRect();
    const gap = 8;

    const width = Math.min(DROPDOWN_MAX_WIDTH_PX, viewportWidth - VIEWPORT_PADDING * 2);

    let left = rect.left;
    if (left + width > viewportWidth - VIEWPORT_PADDING) {
      left = viewportWidth - VIEWPORT_PADDING - width;
    }
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    }

    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const maxHeight = Math.min(400, spaceAbove - gap);

    setDesktopLayout({
      left: Math.round(left),
      bottom: Math.round(viewportHeight - rect.top + gap),
      width: Math.floor(width),
      maxHeight: Math.max(100, Math.floor(maxHeight)),
    });
  }, [isMobile]);

  useEffect(() => {
    if (!isOpen || isMobile) return;

    updateDesktopLayout();
    window.addEventListener('resize', updateDesktopLayout);
    window.addEventListener('scroll', updateDesktopLayout, true);

    return () => {
      window.removeEventListener('resize', updateDesktopLayout);
      window.removeEventListener('scroll', updateDesktopLayout, true);
    };
  }, [isOpen, isMobile, updateDesktopLayout]);

  // Close on outside click
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

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleButtonClick = useCallback(() => {
    if (disabled) return;
    setIsOpen(prev => {
      if (!prev) {
        justOpenedRef.current = true;
        setTimeout(() => {
          justOpenedRef.current = false;
        }, 100);
      }
      return !prev;
    });
  }, [disabled]);

  const handleSelectAuto = useCallback(() => {
    onSelectFormation(null);
    setIsOpen(false);
  }, [onSelectFormation]);

  const handleSelectPreset = useCallback((preset: FormationPreset) => {
    onSelectFormation(preset.id);
    setIsOpen(false);
  }, [onSelectFormation]);

  // Mobile overlay - use portal to escape ControlBar's stacking context
  // Positioned to end exactly at ControlBar's top edge (bottom-14 = 56px = ControlBar height)
  // z-30 keeps it BEHIND ControlBar (z-40) so ControlBar remains visible
  const mobileOverlay = isOpen && isMobile && typeof document !== 'undefined' ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed inset-x-0 top-0 bottom-14 z-30 flex flex-col bg-slate-800 overflow-hidden"
      role="menu"
      aria-orientation="vertical"
    >
      <MenuContent
        selectedPlayerCount={selectedPlayerCount}
        recommendedSize={recommendedSize}
        onSelectAuto={handleSelectAuto}
        onSelectPreset={handleSelectPreset}
        isMobile={true}
      />
    </div>,
    document.body
  ) : null;

  // Desktop dropdown - rendered through portal
  const desktopDropdown = isOpen && !isMobile && typeof document !== 'undefined' ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed overflow-hidden flex flex-col overscroll-contain rounded-lg border border-slate-700 shadow-2xl bg-slate-800"
      style={{
        left: desktopLayout.left,
        bottom: desktopLayout.bottom,
        width: desktopLayout.width,
        maxHeight: desktopLayout.maxHeight,
        zIndex: 9999,
      }}
      role="menu"
      aria-orientation="vertical"
    >
      <MenuContent
        selectedPlayerCount={selectedPlayerCount}
        recommendedSize={recommendedSize}
        onSelectAuto={handleSelectAuto}
        onSelectPreset={handleSelectPreset}
        isMobile={false}
      />
    </div>,
    document.body
  ) : null;

  return (
    <>
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
      {mobileOverlay}
      {desktopDropdown}
    </>
  );
});

FormationPicker.displayName = 'FormationPicker';

export default FormationPicker;
