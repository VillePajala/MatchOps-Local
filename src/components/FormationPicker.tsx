'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';
import { createPortal } from 'react-dom';
import { HiOutlineSquares2X2, HiOutlineXMark } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import {
  FIELD_SIZES,
  PRESETS_BY_SIZE,
  getRecommendedFieldSize,
  type FormationPreset,
  type FieldSize,
} from '@/config/formationPresets';
import {
  matchCapsuleButtonStyle,
  primaryButtonStyle,
  titleStyle,
  subtextStyle,
  sectionLabelStyle,
  neutralBadgeStyle,
  modalCloseButtonStyle,
  useModalCloseVisible,
} from '@/styles/modalStyles';

// Match ControlBar design tokens
const ICON_SIZE = 'w-[22px] h-[22px]';
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
  /**
   * Told whether the full-screen (phone) sheet is showing, so the host can
   * hide the floating control capsule while it is - the capsule used to sit
   * over the sheet's last rows. The desktop dropdown does not count: it is
   * anchored to the capsule's own button.
   */
  onSheetOpenChange?: (open: boolean) => void;
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
  /** Mobile sheet only: closes it from its own X (shown where there is no back gesture). */
  onClose?: () => void;
}> = ({ selectedPlayerCount, recommendedSize, onSelectAuto, onSelectPreset, isMobile, onClose }) => {
  const { t } = useTranslation();
  const showClose = useModalCloseVisible();

  // Mobile: a full-screen sheet like the other popups; desktop: a compact
  // dropdown. Both in the navy house style - one amber primary (Auto).
  const headerClass = isMobile
    ? "relative z-10 flex justify-center items-center pt-10 pb-4 px-6 shrink-0"
    : "relative z-10 px-4 py-3 border-b border-hairline shrink-0 text-center";
  const titleClass = isMobile
    ? titleStyle
    : "font-display text-xl font-bold text-ink";
  const subtitleClass = isMobile ? `${subtextStyle} mt-1` : "font-ui text-xs text-ink-3 mt-0.5";
  const contentClass = isMobile
    ? "relative z-10 overflow-y-auto flex-1 px-4 pt-2 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] space-y-4"
    : "relative z-10 overflow-y-auto min-h-0 flex-1 p-2 space-y-2";
  const autoButtonClass = isMobile
    ? `${primaryButtonStyle} w-full min-h-[52px]`
    : `${primaryButtonStyle} w-full`;
  const cardClass = isMobile ? "p-3" : "p-2";
  const sizeHeaderClass = isMobile
    ? `${sectionLabelStyle} normal-case px-1 py-1 flex items-center gap-2 mb-2`
    : `${sectionLabelStyle} normal-case px-1 py-0.5 flex items-center gap-2 mb-1.5`;
  const badgeClass = neutralBadgeStyle;
  const gridClass = isMobile ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-1.5";
  const presetButtonClass = isMobile
    ? "min-h-14 px-4 text-left font-ui text-base rounded-2xl transition-colors s1-raised text-ink hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
    : "min-h-11 px-3 text-left font-ui text-sm rounded-xl transition-colors s1-raised text-ink hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-action";
  const presetNameClass = "font-semibold";
  const presetCountClass = isMobile ? "text-ink-3 text-sm ml-2" : "text-ink-3 text-xs ml-1.5";

  return (
    <>
      {/* Header */}
      <div className={headerClass}>
        {/* The capsule (whose button opened this sheet) is hidden while it is
            open, so where there is no back gesture the sheet closes itself. */}
        {isMobile && onClose && showClose && (
          <button
            type="button"
            onClick={onClose}
            className={`absolute top-3 right-3 flex ${modalCloseButtonStyle}`}
            aria-label={t('common.close', 'Close')}
            title={t('common.close', 'Close')}
          >
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        )}
        <div className="text-center">
          <h2 className={titleClass}>
            {t('formations.title', 'Formations')}
          </h2>
          <p className={subtitleClass}>
            {t('formations.playerCount', '{{count}} players selected', { count: selectedPlayerCount })}
          </p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className={contentClass}>
        {/* Auto option - the menu's one primary action */}
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
            className={`s1-list ${cardClass}`}
          >
            {/* Size header */}
            <div className={sizeHeaderClass}>
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
  onSheetOpenChange,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const sheetOpen = isOpen && isMobile;
  useEffect(() => {
    onSheetOpenChange?.(sheetOpen);
  }, [sheetOpen, onSheetOpenChange]);
  // Unmounting with the sheet open must not leave the host's capsule hidden.
  const onSheetOpenChangeRef = useRef(onSheetOpenChange);
  useEffect(() => { onSheetOpenChangeRef.current = onSheetOpenChange; }, [onSheetOpenChange]);
  useEffect(() => () => onSheetOpenChangeRef.current?.(false), []);
  // Back closes the picker first, not the match under it (review 7.9).
  useHardwareBackSubLevel(isOpen, () => setIsOpen(false));
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

  // Mobile overlay - use portal to escape ControlBar's stacking context.
  // Full screen; the host hides the control capsule while it is open (see
  // onSheetOpenChange).
  const mobileOverlay = isOpen && isMobile && typeof document !== 'undefined' ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed inset-0 z-30 flex flex-col s1-canvas font-ui overflow-hidden"
      role="menu"
      aria-orientation="vertical"
    >
      <MenuContent
        selectedPlayerCount={selectedPlayerCount}
        recommendedSize={recommendedSize}
        onSelectAuto={handleSelectAuto}
        onSelectPreset={handleSelectPreset}
        isMobile={true}
        onClose={() => setIsOpen(false)}
      />
    </div>,
    document.body
  ) : null;

  // Desktop dropdown - rendered through portal
  const desktopDropdown = isOpen && !isMobile && typeof document !== 'undefined' ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed overflow-hidden flex flex-col overscroll-contain rounded-[22px] s1-canvas font-ui shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),0_20px_40px_-12px_rgb(12_4_13/0.9)]"
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
        data-testid="tour-formation"
        disabled={disabled}
        className={matchCapsuleButtonStyle}
        title={t('controlBar.formationMenu', 'Formation menu')}
        aria-label={t('controlBar.formationMenu', 'Formation menu')}
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
