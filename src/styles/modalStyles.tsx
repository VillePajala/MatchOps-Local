/**
 * Shared Modal Design System
 *
 * Provides consistent styling across all management modals:
 * - RosterSettingsModal
 * - TeamManagerModal
 * - SeasonTournamentManagementModal
 *
 * Visual Language:
 * - Dark slate backgrounds with subtle gradients
 * - Indigo accent color for primary actions
 * - Yellow for titles/highlights
 * - Gradient buttons with depth
 * - Consistent spacing and shadows
 */

import React, { useCallback, useRef, useSyncExternalStore } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';

// ============================================================================
// Container & Layout Styles
// ============================================================================

export const modalContainerStyle =
  "bg-slate-800 rounded-none shadow-xl flex flex-col border-0 overflow-hidden";

/**
 * Background effect layers for modal
 * Use these divs inside the modal container for consistent visual effects
 */
export const ModalBackgroundEffects: React.FC = () => (
  <>
    {/* Exactly the GameSettings layer set - an extra bottom glow here made
        these modals read subtly hazier than the rest of the app. */}
    <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
    <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
    <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50 pointer-events-none" />
  </>
);

// ============================================================================
// Typography Styles
// ============================================================================

export const titleStyle =
  "text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg";

export const labelStyle =
  "text-sm font-medium text-slate-300 mb-1";

export const subtextStyle =
  "text-xs text-slate-400";

// ============================================================================
// Card & Section Styles
// ============================================================================

export const cardStyle =
  "bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner";

export const itemRowStyle =
  "bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 transition-colors";

export const itemRowEditingStyle =
  "bg-slate-700/75 border-indigo-500";

// ============================================================================
// Input Styles
// ============================================================================

export const inputBaseStyle =
  "block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 sm:text-sm text-white placeholder-slate-400";

export const textareaStyle =
  `${inputBaseStyle} resize-none`;

export const selectStyle =
  inputBaseStyle;

// ============================================================================
// Button Styles
// ============================================================================

// Button padding: py-3 provides ~44px touch target (iOS guideline minimum)
const _buttonBaseStyle =
  "px-4 py-3 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed";

export const primaryButtonStyle =
  "px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400/30";

export const secondaryButtonStyle =
  "px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-slate-600 text-white hover:bg-slate-500 border border-slate-400/30";

export const dangerButtonStyle =
  "px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 text-white hover:bg-red-500 border border-red-400/30";

export const successButtonStyle =
  "px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 text-white hover:bg-green-500 border border-green-400/30";

// ============================================================================
// Icon Button Styles
// ============================================================================

export const iconButtonBaseStyle =
  "p-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const iconButtonEditStyle =
  `${iconButtonBaseStyle} text-slate-400 hover:text-indigo-400`;

export const iconButtonDangerStyle =
  `${iconButtonBaseStyle} text-slate-400 hover:text-red-500`;

export const iconButtonSuccessStyle =
  `${iconButtonBaseStyle} text-green-400 hover:bg-slate-600`;

export const iconButtonCancelStyle =
  `${iconButtonBaseStyle} text-slate-400 hover:bg-slate-600`;

// ============================================================================
// Badge Styles
// ============================================================================

export const badgeArchivedStyle =
  "inline-flex items-center px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded";

export const badgeAwardStyle =
  "inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded";

// ============================================================================
// Header/Footer Styles
// ============================================================================

export const headerStyle =
  "flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0";

export const footerStyle =
  "px-6 py-3 bg-slate-800/50 border-t border-slate-700/20 backdrop-blur-sm flex justify-end items-center gap-4 flex-shrink-0";

// ============================================================================
// Helper Components
// ============================================================================

export const ModalContainer: React.FC<{
  children: React.ReactNode;
  /** Ref to the modal root, so consumers can wire useFocusTrap (house modal behaviour). */
  containerRef?: React.Ref<HTMLDivElement>;
  /** Accessible dialog name; providing it also stamps role="dialog" + aria-modal. */
  'aria-label'?: string;
}> = ({ children, containerRef, 'aria-label': ariaLabel }) => (
  <div
    ref={containerRef}
    className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display"
    {...(ariaLabel ? { role: 'dialog', 'aria-modal': true, 'aria-label': ariaLabel, tabIndex: -1 } : {})}
  >
    <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full flex flex-col`}>
      <ModalBackgroundEffects />
      <div className="relative z-10 flex flex-col min-h-0 h-full">
        {children}
      </div>
    </div>
  </div>
);

export const ModalHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className={headerStyle}>
    <h2 className={titleStyle}>{title}</h2>
  </div>
);

export const ModalFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={footerStyle}>
    {children}
  </div>
);

export const ScrollableContent: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** Optional scroll listener (e.g. collapse-on-scroll chrome). */
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  'data-testid'?: string;
}> = ({ children, className = '', onScroll, 'data-testid': testId }) => (
  <div className={`flex-1 overflow-y-auto min-h-0 ${className}`} onScroll={onScroll} data-testid={testId}>
    {children}
  </div>
);

// ============================================================================
// Collapsing modal chrome (modal-chrome slimming, 2026-07-17)
// ============================================================================
//
// Generalizes the Playing-Time Planner's bespoke collapse-on-scroll so every
// modal can drop its footer and reclaim phone space:
//  - the TITLE ROW (X close + title + a small pinned action cluster) is
//    always visible - iOS/desktop have no hardware back, so a modal must
//    keep one on-screen exit;
//  - the COLLAPSING REGION (tabs, add buttons, read-only counters - anything
//    non-title, per owner decision 2026-07-17) shrinks away on scroll-down
//    and returns on scroll-up.
// The small action cluster stays pinned (a Save that vanishes when you
// scroll to a form's end helps no one); the bulky extras collapse.

export interface CollapsingHeaderController {
  outerRef: React.RefObject<HTMLDivElement | null>;
  innerRef: React.RefObject<HTMLDivElement | null>;
  /** Wire to the ScrollableContent's onScroll. */
  onScroll: React.UIEventHandler<HTMLDivElement>;
  /** Fully reveal the region (call when the collapsing content changes, e.g. tab switch). */
  reset: () => void;
}

/** Imperative collapse-on-scroll for a modal's non-title chrome. */
export function useCollapsingHeader(): CollapsingHeaderController {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const lastYRef = useRef(0);

  const apply = useCallback((offset: number) => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const h = inner.offsetHeight;
    const clamped = Math.max(0, Math.min(h, offset));
    offsetRef.current = clamped;
    outer.style.height = `${h - clamped}px`;
    inner.style.transform = `translateY(-${clamped}px)`;
    inner.setAttribute('aria-hidden', clamped >= h && h > 0 ? 'true' : 'false');
  }, []);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const y = e.currentTarget.scrollTop;
    const delta = y - lastYRef.current;
    lastYRef.current = y;
    if (delta === 0) return;
    // At (or rubber-banding past) the top the region is always fully shown.
    apply(y <= 0 ? 0 : offsetRef.current + delta);
  }, [apply]);

  const reset = useCallback(() => {
    lastYRef.current = 0;
    offsetRef.current = 0;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (outer && inner) {
      outer.style.height = '';
      inner.style.transform = '';
      inner.setAttribute('aria-hidden', 'false');
    }
  }, []);

  return { outerRef, innerRef, onScroll, reset };
}

// The close X shows ONLY where there is no reliable back affordance (owner
// decision 2026-07-17, refined): a desktop pointer (mouse) OR an iOS
// home-screen PWA (standalone Safari has no back gesture at all). It is
// hidden on Android TWA (hardware back) and mobile Safari (browser back +
// edge-swipe), where a visible X is redundant. See useModalCloseVisible.
export const modalCloseButtonStyle =
  "items-center justify-center p-2 -m-2 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-shrink-0";

function subscribeCloseVisibility(cb: () => void): () => void {
  const mq = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: fine)')
    : null;
  mq?.addEventListener?.('change', cb);
  return () => mq?.removeEventListener?.('change', cb);
}

function getCloseVisibilitySnapshot(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const finePointer = window.matchMedia?.('(pointer: fine)')?.matches ?? true;
  return finePointer || nav.standalone === true;
}

/** True where the modal X should show: desktop pointer OR iOS standalone PWA.
 *  SSR/test snapshot is `true` (show), so no missing-X flash and tests find it. */
export function useModalCloseVisible(): boolean {
  return useSyncExternalStore(subscribeCloseVisibility, getCloseVisibilitySnapshot, () => true);
}

// Sticky single-primary bottom bar (owner decision 2026-07-17): the ONE
// commit action for a form/wizard modal, pinned and thumb-reachable -
// replaces the old Cancel+Save footer (Cancel is the header X / hardware
// back). Utilities do NOT live here; they go inline by their content.
export const modalStickyBarStyle =
  "flex-shrink-0 px-4 py-2.5 border-t border-slate-700/30 bg-slate-800/60 backdrop-blur-sm";

export const ModalStickyPrimary: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, disabled, children, className = '' }) => (
  <div className={`${modalStickyBarStyle} ${className}`}>
    {/* Sized to match the in-modal quick-fill buttons (py-2 / text-sm) - the
        full-height version read as too heavy (owner feedback 2026-07-17). */}
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full px-4 py-2 rounded-md text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400/30 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  </div>
);

/**
 * Full-width solid on/off toggle - the house replacement for a settings
 * checkbox (owner: no checkboxes for settings; always solid, full-width).
 * `aria-pressed` carries the state; indigo when on, slate when off. Matches
 * the "Show archived" / "Show only unplayed" filter toggles.
 */
export const ModalToggleButton: React.FC<{
  pressed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}> = ({ pressed, onToggle, children, disabled, className = '' }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={pressed}
    disabled={disabled}
    className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${pressed ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} ${className}`}
  >
    {children}
  </button>
);

/**
 * Slimmed modal header: always-visible X + centered title + optional pinned
 * action cluster (primary + utilities), with an optional collapsing region
 * below (`children`). Replaces the per-modal header div + the footer.
 */
export const CollapsibleModalHeader: React.FC<{
  title: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Lock the close control (e.g. while an in-flight op must not be
      interrupted by closing the modal). Mirrors the old footer Done's
      `disabled`. */
  closeDisabled?: boolean;
  /** Pinned top-right cluster: primary action + utilities (Q2). Stays visible. */
  actions?: React.ReactNode;
  /** Collapsing region below the title row (tabs, add buttons, counters). */
  children?: React.ReactNode;
  collapse?: CollapsingHeaderController;
}> = ({ title, onClose, closeLabel = 'Close', closeDisabled, actions, children, collapse }) => {
  const showClose = useModalCloseVisible();
  return (
  <div className="flex-shrink-0">
    {/* Balanced fixed-width side slots keep the title centered whether or not
        the X shows (hidden on phones) - a bare auto-column shoved it off
        center (owner feedback 2026-07-17). */}
    <div className="flex items-center gap-2 pt-8 pb-3 px-4 backdrop-blur-sm bg-slate-900/20">
      <div className="flex items-center justify-start basis-10 shrink-0">
        <button type="button" onClick={onClose} disabled={closeDisabled} aria-label={closeLabel} title={closeLabel} className={`${showClose ? 'flex' : 'hidden'} ${modalCloseButtonStyle} disabled:opacity-50 disabled:cursor-not-allowed`}>
          <HiOutlineXMark className="w-6 h-6" />
        </button>
      </div>
      {/* No truncation: the full title must always show (owner feedback
          2026-07-17). Original prominence (text-3xl from titleStyle),
          centered, wrapping to a second line for long titles. */}
      <h2 className={`${titleStyle} flex-1 text-center text-balance leading-tight min-w-0`}>{title}</h2>
      <div className="flex items-center justify-end gap-1.5 basis-10 shrink-0">{actions}</div>
    </div>
    {children && (
      <div ref={collapse?.outerRef} className="overflow-hidden border-b border-slate-700/20">
        <div ref={collapse?.innerRef}>{children}</div>
      </div>
    )}
  </div>
  );
};

// ============================================================================
// Dialog/Overlay Backdrop Styles
// ============================================================================

/**
 * Standard backdrop for all dialog-style overlays.
 * Provides consistent visual treatment with dark background + ambient glows.
 */
export const dialogBackdropStyle =
  "fixed inset-0 bg-slate-900 flex items-center justify-center font-display";

/**
 * Standard dialog container style for smaller modals (confirmation, etc.)
 */
export const dialogContainerStyle =
  "bg-slate-800 p-6 rounded-lg border border-slate-600 shadow-2xl max-w-md w-full mx-4";

/**
 * Dialog backdrop with ambient glow effects.
 * Use this component instead of raw dialogBackdropStyle for better visuals.
 */
export const DialogBackdrop: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ children, className = '', onClick }) => (
  <div
    className={`fixed inset-0 bg-slate-900 flex items-center justify-center font-display overflow-hidden ${className}`}
    onClick={onClick}
  >
    {/* Ambient glow effects - matches AuthModal/WelcomeScreen */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Blue glow - top right */}
      <div className="absolute -top-[20%] -right-[15%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-3xl" />
      {/* Blue glow - bottom left */}
      <div className="absolute -bottom-[15%] -left-[10%] w-[55%] h-[55%] bg-sky-500/15 rounded-full blur-3xl" />
    </div>
    {/* Content */}
    <div className="relative z-10 flex items-center justify-center w-full h-full p-4">
      {children}
    </div>
  </div>
);

// ============================================================================
// Wizard Modal Styles (Migration, Import dialogs)
// ============================================================================

/**
 * @deprecated Use WizardBackdrop component instead for consistent visuals.
 */
export const wizardBackdropStyle =
  "fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4";

/**
 * Wizard backdrop with ambient glow effects.
 * Use this component for all wizard-style modals (Migration, Import, etc.)
 */
export const WizardBackdrop: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ children, className = '', onClick }) => (
  <div
    className={`fixed inset-0 z-[80] bg-slate-900 flex items-center justify-center font-display overflow-hidden ${className}`}
    onClick={onClick}
  >
    {/* Ambient glow effects - matches AuthModal/WelcomeScreen */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Blue glow - top right */}
      <div className="absolute -top-[20%] -right-[15%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-3xl" />
      {/* Blue glow - bottom left */}
      <div className="absolute -bottom-[15%] -left-[10%] w-[55%] h-[55%] bg-sky-500/15 rounded-full blur-3xl" />
    </div>
    {/* Content */}
    <div className="relative z-10 flex items-center justify-center w-full h-full p-4">
      {children}
    </div>
  </div>
);

export const wizardModalStyle =
  "relative w-full max-w-md bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-[90vh] flex flex-col";

export const wizardModalLargeStyle =
  "relative w-full max-w-lg bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-[85vh] flex flex-col";

export const wizardHeaderStyle =
  "flex items-center justify-between px-6 py-4 border-b border-slate-600";

export const wizardTitleStyle =
  "text-lg font-semibold text-slate-100";

export const wizardContentStyle =
  "px-6 py-5 overflow-y-auto flex-1 min-h-0";

export const wizardFooterStyle =
  "px-6 py-4 border-t border-slate-600 flex gap-3 justify-end";

// Data summary boxes
export const dataSummaryBoxStyle =
  "bg-slate-900/50 rounded-lg p-4";

export const dataSummaryTitleStyle =
  "text-sm font-medium text-slate-300 mb-2 flex items-center gap-2";

// Status indicator dots
export const localDataDotStyle = "w-2 h-2 rounded-full bg-amber-400";
export const cloudDataDotStyle = "w-2 h-2 rounded-full bg-sky-400";

// Alert boxes
export const warningBoxStyle =
  "bg-amber-900/30 border border-amber-700 rounded-lg p-4";

export const errorBoxStyle =
  "bg-red-900/30 border border-red-700 rounded-lg p-4";

export const successBoxStyle =
  "bg-green-900/30 border border-green-700 rounded-lg p-4";

export const infoBoxStyle =
  "bg-sky-900/30 border border-sky-700 rounded-lg p-4";

// Progress bar
export const progressBarContainerStyle =
  "h-3 bg-slate-700 rounded-full overflow-hidden";

export const progressBarFillStyle =
  "h-full transition-all duration-300";

// Close button (X)
export const wizardCloseButtonStyle =
  "text-slate-400 hover:text-slate-200 transition-colors";
