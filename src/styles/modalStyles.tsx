/**
 * Shared Modal Design System
 *
 * The popup building blocks every modal composes: containers, the header with
 * its close control, form fields, buttons, switches, dialogs and wizards.
 *
 * Visual language: the S1 "Syke Refined" system (tokens and `.s1-*` surfaces
 * in src/app/globals.css, first used by the home screen):
 * - Navy everywhere: the carbon canvas, raised surfaces one step lighter.
 * - Titles are WHITE Barlow Condensed italic (`font-display`); controls and
 *   text inside the shared pieces use Inter (`font-ui`). The app-wide body
 *   font stays Rajdhani until the last redesign step, so a modal's own text
 *   keeps it until that modal is restyled.
 * - Amber is reserved for the ONE primary action and for selection (`action`).
 *   Green and red mean results (and red, destruction). No purple or indigo.
 * - Pill buttons and touch targets of at least 44px; visible focus rings.
 */

import React, { useCallback, useRef, useSyncExternalStore } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';

/**
 * The house focus ring: amber, only for keyboard focus (`focus-visible`), so a
 * tap does not leave a ring behind on a touch screen.
 */
const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-carbon';

// ============================================================================
// Container & Layout Styles
// ============================================================================

/** The full-screen modal surface: carbon with one soft light from above. */
export const modalContainerStyle =
  "s1-canvas rounded-none flex flex-col border-0 overflow-hidden";

/**
 * Background effect layers for a modal - now none.
 *
 * This used to lay an indigo soft-light wash over the modal. The S1 system has
 * no purple anywhere and puts the one light in the canvas itself
 * (`modalContainerStyle`), so the layer is gone. The export stays so callers
 * keep compiling; it renders nothing.
 */
export const ModalBackgroundEffects: React.FC = () => null;

// ============================================================================
// Typography Styles
// ============================================================================

/** Popup title: white, Barlow Condensed italic, 30px. */
export const titleStyle =
  "font-display text-3xl font-bold italic tracking-[0.01em] text-ink";

/** A field's label (13px Inter, secondary ink). */
export const labelStyle =
  "block font-ui text-[13px] font-medium text-ink-2 mb-1.5";

/**
 * The explanatory line under a setting or field. 14px, tertiary ink - one step
 * quieter than `labelStyle`, so a field's label and its help text stay
 * distinguishable.
 */
export const subtextStyle =
  "font-ui text-sm leading-snug text-ink-3";

/**
 * Section label above a group of fields or a list: small, uppercase, tracked.
 * The form system's heading level below the title.
 */
export const sectionLabelStyle =
  "font-ui text-xs font-semibold uppercase tracking-[0.14em] text-ink-3";

// ============================================================================
// Card & Section Styles
// ============================================================================

/** A grouped surface (form section, list): solid navy, 22px radius. */
export const cardStyle =
  "s1-list p-4";

export const itemRowStyle =
  "bg-white/[0.03] border border-hairline rounded-2xl hover:bg-white/[0.06] transition-colors";

export const itemRowEditingStyle =
  "bg-surface-2 border-action/60";

// ============================================================================
// Input Styles
// ============================================================================

/**
 * Text field: a 52px dark inset well, 14px radius, 16px text (16px also stops
 * iOS Safari zooming in on focus). Focus draws an amber ring.
 */
export const inputBaseStyle =
  "block w-full min-h-[52px] rounded-[14px] border-0 bg-carbon px-3.5 py-3 font-ui text-base font-medium text-ink placeholder:font-normal placeholder:text-ink-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10),inset_0_2px_4px_rgb(2_6_23/0.5)] transition-shadow focus:outline-none focus:shadow-[inset_0_0_0_1.5px_var(--color-action),0_0_0_4px_rgb(255_178_36/0.14)] disabled:opacity-50 disabled:cursor-not-allowed";

export const textareaStyle =
  `${inputBaseStyle} resize-none`;

/** A select is the same field with a chevron (`.s1-select`) and dark native options. */
export const selectStyle =
  `${inputBaseStyle} s1-select pr-10 [color-scheme:dark]`;

// ============================================================================
// Choice chips
// ============================================================================

/**
 * Tap-to-pick chip (e.g. a suggested opponent name): a 36px ghost pill.
 * Pair the selected state with a check icon so selection does not rely on
 * colour alone.
 */
export const chipStyle =
  `inline-flex items-center gap-1.5 min-h-9 px-3.5 rounded-full font-ui text-sm font-medium text-ink-2 bg-white/[0.03] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] transition-colors hover:bg-white/[0.07] disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;

/** The chosen chip: raised navy with an amber ring. */
export const chipSelectedStyle =
  `inline-flex items-center gap-1.5 min-h-9 px-3.5 rounded-full font-ui text-sm font-semibold text-ink s1-seg-on shadow-[inset_0_0_0_1.5px_var(--color-action),0_2px_6px_-2px_rgb(2_6_23/0.75)] disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;

// ============================================================================
// Button Styles
// ============================================================================

// Pills with a 44px minimum height (touch target). `min-h` rather than a fixed
// height so callers that add their own padding still get a full target.
const buttonBaseStyle =
  `inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2.5 rounded-full font-ui text-[15px] font-semibold transition-[filter,background-color,color] disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;

/**
 * The ONE primary action on a surface: the amber-to-orange pill.
 *
 * Its fill is a gradient (background-image), so a caller cannot recolour it
 * with a `bg-*` colour utility - use `dangerButtonStyle` for a destructive
 * confirm instead of overriding this one.
 */
export const primaryButtonStyle =
  `${buttonBaseStyle} s1-primary`;

/** Everything that is not the primary action: an outline on near-nothing. */
export const secondaryButtonStyle =
  `${buttonBaseStyle} s1-ghost text-ink`;

/** A destructive action (delete, reset): solid red, white text. */
export const dangerButtonStyle =
  `${buttonBaseStyle} bg-red-600 text-white hover:bg-red-500 shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]`;

/**
 * Kept for compatibility. Green is reserved for results in the S1 system, so a
 * "confirm" action is simply the primary action.
 */
export const successButtonStyle =
  primaryButtonStyle;

// ============================================================================
// Icon Button Styles
// ============================================================================

export const iconButtonBaseStyle =
  `inline-flex items-center justify-center min-h-11 min-w-11 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;

export const iconButtonEditStyle =
  `${iconButtonBaseStyle} text-ink-3 hover:text-ink hover:bg-white/[0.06]`;

export const iconButtonDangerStyle =
  `${iconButtonBaseStyle} text-ink-3 hover:text-red-400 hover:bg-red-500/10`;

export const iconButtonSuccessStyle =
  `${iconButtonBaseStyle} text-action hover:bg-white/[0.06]`;

export const iconButtonCancelStyle =
  `${iconButtonBaseStyle} text-ink-3 hover:text-ink hover:bg-white/[0.06]`;

// ============================================================================
// Badge Styles
// ============================================================================

export const badgeArchivedStyle =
  "inline-flex items-center h-[22px] px-2.5 rounded-full bg-white/[0.08] font-ui text-xs font-semibold text-ink-2";

export const badgeAwardStyle =
  "inline-flex items-center gap-1 h-[22px] px-2.5 rounded-full bg-action/[0.08] shadow-[inset_0_0_0_1px_rgb(255_178_36/0.45)] font-ui text-xs font-semibold text-action";

// ============================================================================
// Header/Footer Styles
// ============================================================================

export const headerStyle =
  "flex justify-center items-center pt-10 pb-4 px-6 flex-shrink-0";

export const footerStyle =
  "px-4 py-3 border-t border-hairline flex justify-end items-center gap-3 flex-shrink-0";

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
    className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`}
    {...(ariaLabel ? { role: 'dialog', 'aria-modal': true, 'aria-label': ariaLabel, tabIndex: -1 } : {})}
  >
    <div className={`${modalContainerStyle} relative h-full w-full`}>
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
//
// A 44px round raised button. No display utility here: callers add `flex` or
// `hidden` from useModalCloseVisible.
export const modalCloseButtonStyle =
  `items-center justify-center w-11 h-11 rounded-full s1-raised text-ink-2 hover:text-ink transition-colors flex-shrink-0 ${focusRing}`;

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
  "flex-shrink-0 px-4 pt-3 pb-4 border-t border-hairline";

export const ModalStickyPrimary: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Optional stable anchor (e.g. for the guided tour's spotlight). */
  dataTestId?: string;
}> = ({ onClick, disabled, children, className = '', dataTestId }) => (
  <div className={`${modalStickyBarStyle} ${className}`}>
    {/* The amber pill at 48px: a full-width thumb target, kept below the
        mocks' 56px because the full-height version read as too heavy (owner
        feedback 2026-07-17). */}
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      className={`flex w-full items-center justify-center gap-2 min-h-12 px-5 rounded-full font-ui text-base font-bold s1-primary transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
    >
      {children}
    </button>
  </div>
);

/**
 * A settings switch: label on the left, a 50x30 track with a thumb on the
 * right, amber when on (amber = selection). Replaces the full-width on/off BUTTON that used to carry
 * these settings (owner, 2026-09-30: a button that is indigo when on and
 * slate when off reads as "a button to press" in both states, so nobody could
 * tell Harjoitusottelu or Sisällytä kausitilastoihin on from off). The state
 * lives in the thumb's position and the track colour; `role="switch"` and
 * `aria-checked` announce it. Still one full-width row, still solid.
 */
export const ModalSwitch: React.FC<{
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** One short line under the label, e.g. what "on" means. */
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}> = ({ checked, onToggle, children, hint, disabled, className = '' }) => {
  // The hint describes the switch; it must not become part of its name, or
  // "Harjoitusottelu" would read as "Harjoitusottelu Ei näy kilpailutilastoissa".
  const hintId = React.useId();
  return (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-describedby={hint ? hintId : undefined}
    onClick={onToggle}
    disabled={disabled}
    className={`w-full min-h-14 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-left font-ui text-[15px] font-medium text-ink bg-white/[0.03] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] transition-colors hover:bg-white/[0.05] disabled:opacity-50 disabled:cursor-not-allowed ${focusRing} ${className}`}
  >
    <span className="min-w-0">
      <span className="block">{children}</span>
      {hint && <span id={hintId} aria-hidden="true" className="block text-[13px] font-normal leading-snug text-ink-3 mt-0.5">{hint}</span>}
    </span>
    <span
      aria-hidden="true"
      className={`relative flex-none w-[50px] h-[30px] rounded-full transition-colors ${checked ? 'bg-action' : 'bg-white/10 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)]'}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-6 h-6 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.5)] transition-transform ${checked ? 'translate-x-5 bg-white' : 'bg-ink-2'}`}
      />
    </span>
  </button>
  );
};

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
  /**
   * Id stamped on the <h2>, so the modal that owns this header can point its
   * `aria-labelledby` at the title already on screen.
   *
   * Ten modals had no accessible name at all, and most of them render a title
   * that depends on state ("New player" vs "Edit player"). Duplicating that
   * expression into an aria-label would have meant two sources of truth for
   * the same words; naming the element the user can already see does not.
   *
   * Generate it with React.useId() in the caller so two open modals cannot
   * collide.
   */
  titleId?: string;
}> = ({ title, onClose, closeLabel = 'Close', closeDisabled, actions, children, collapse, titleId }) => {
  const showClose = useModalCloseVisible();
  // Balanced fixed-width side slots keep the title centered when the X shows or
  // a right-side action cluster is present. But on phones (X hidden) with no
  // actions, those 40px slots just steal width and wrap otherwise-one-line
  // titles - so collapse both to give the title the full row (owner feedback).
  const reserveSides = showClose || !!actions;
  const sideSlot = reserveSides ? 'basis-11' : 'basis-0';
  return (
  <div className="flex-shrink-0">
    <div className="flex items-center gap-2 pt-8 pb-3 px-4">
      <div className={`flex items-center justify-start ${sideSlot} shrink-0`}>
        <button type="button" onClick={onClose} disabled={closeDisabled} aria-label={closeLabel} title={closeLabel} className={`${showClose ? 'flex' : 'hidden'} ${modalCloseButtonStyle} disabled:opacity-50 disabled:cursor-not-allowed`}>
          <HiOutlineXMark className="w-5 h-5" />
        </button>
      </div>
      {/* No truncation: the full title must always show (owner feedback
          2026-07-17). Full prominence (text-3xl from titleStyle),
          centered, wrapping to a second line for long titles. `break-words`
          so even a single long word (e.g. a Finnish compound) wraps instead
          of overflowing/clipping. */}
      <h2 id={titleId} className={`${titleStyle} flex-1 text-center text-balance break-words leading-tight min-w-0`}>{title}</h2>
      <div className={`flex items-center justify-end gap-1.5 ${sideSlot} shrink-0`}>{actions}</div>
    </div>
    {children && (
      <div ref={collapse?.outerRef} className="overflow-hidden border-b border-hairline">
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
 * Standard backdrop for all dialog-style overlays: the carbon canvas.
 */
export const dialogBackdropStyle =
  "fixed inset-0 s1-canvas flex items-center justify-center";

/**
 * Standard dialog container style for smaller modals (confirmation, etc.):
 * a solid navy card with the list surface's 22px radius.
 */
export const dialogContainerStyle =
  "s1-list p-6 max-w-md w-full mx-4";

/** Title of a centered dialog or wizard: white Barlow Condensed italic. */
export const dialogTitleStyle =
  "font-display text-2xl font-bold italic leading-tight text-ink";

/** Body copy of a centered dialog. */
export const dialogBodyStyle =
  "font-ui text-[15px] leading-relaxed text-ink-2";

/**
 * Full-screen dialog backdrop on the carbon canvas.
 *
 * The two blurred sky-blue glows this used to carry are gone: blue is not in
 * the S1 palette, and a blur costs a compositor pass on the cheap Android
 * hardware this app is meant to run well on. The canvas carries its own light.
 */
export const DialogBackdrop: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ children, className = '', onClick }) => (
  <div
    className={`${dialogBackdropStyle} overflow-hidden ${className}`}
    onClick={onClick}
  >
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
 * Wizard backdrop on the carbon canvas (see DialogBackdrop).
 * Use this component for all wizard-style modals (Migration, Import, etc.)
 */
export const WizardBackdrop: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ children, className = '', onClick }) => (
  <div
    className={`fixed inset-0 z-[80] s1-canvas flex items-center justify-center overflow-hidden ${className}`}
    onClick={onClick}
  >
    <div className="relative z-10 flex items-center justify-center w-full h-full p-4">
      {children}
    </div>
  </div>
);

export const wizardModalStyle =
  "relative w-full max-w-md s1-list max-h-[90vh] flex flex-col";

export const wizardModalLargeStyle =
  "relative w-full max-w-lg s1-list max-h-[85vh] flex flex-col";

export const wizardHeaderStyle =
  "flex items-center justify-between gap-3 px-5 py-3 border-b border-hairline";

export const wizardTitleStyle =
  dialogTitleStyle;

export const wizardContentStyle =
  "px-5 py-5 overflow-y-auto flex-1 min-h-0";

export const wizardFooterStyle =
  "px-5 py-4 border-t border-hairline flex gap-3 justify-end";

// Data summary boxes: a dark inset well inside the wizard card.
export const dataSummaryBoxStyle =
  "bg-carbon/60 rounded-2xl p-4 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]";

export const dataSummaryTitleStyle =
  "font-ui text-[13px] font-semibold text-ink-2 mb-2 flex items-center gap-2";

// Status indicator dots (data identity: this device vs the cloud)
export const localDataDotStyle = "w-2 h-2 rounded-full bg-action";
export const cloudDataDotStyle = "w-2 h-2 rounded-full bg-sky-400";

// Alert boxes: a tinted well with a matching hairline ring.
export const warningBoxStyle =
  "rounded-2xl p-4 bg-action/[0.08] shadow-[inset_0_0_0_1px_rgb(255_178_36/0.35)]";

export const errorBoxStyle =
  "rounded-2xl p-4 bg-loss/[0.08] shadow-[inset_0_0_0_1px_rgb(255_107_107/0.35)]";

export const successBoxStyle =
  "rounded-2xl p-4 bg-win/[0.08] shadow-[inset_0_0_0_1px_rgb(63_224_140/0.35)]";

export const infoBoxStyle =
  "rounded-2xl p-4 bg-white/[0.04] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)]";

// Progress bar
export const progressBarContainerStyle =
  "h-3 bg-white/10 rounded-full overflow-hidden";

export const progressBarFillStyle =
  "h-full transition-all duration-300";

// Close button (X): the same 44px round raised button as the modal header's.
export const wizardCloseButtonStyle =
  `inline-flex items-center justify-center w-11 h-11 flex-shrink-0 rounded-full s1-raised text-ink-2 hover:text-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;


// ---------------------------------------------------------------------------
// Backdrops and stacking order
//
// These arrived later than the rest of this file and briefly lived in
// src/config/modalStyles.ts - a second module with the same name, which is
// exactly the confusion this file exists to prevent. Moved here so there is
// ONE place to look for modal chrome.
//
// They sit alongside dialogBackdropStyle/wizardBackdropStyle rather than
// replacing them: those two carry their own ambient-glow components, and
// folding four backdrop concepts into one is a change that deserves to be
// made on purpose rather than as a side effect of moving files.
// ---------------------------------------------------------------------------

/**
 * The one backdrop.
 *
 * No blur. Three modals had `backdrop-blur-sm` and twenty did not; matching
 * the twenty changes the fewest pixels, and a blur behind a full-screen sheet
 * costs a compositor pass on exactly the cheap Android hardware this app is
 * meant to run well on.
 *
 * Written `bg-black/70` rather than the `bg-black bg-opacity-70` it replaces:
 * same output, but the opacity utility is Tailwind 3 syntax and this project
 * is on Tailwind 4. *
 * No font class: the backdrops used to carry `font-display`, which did nothing
 * until the S1 redesign defined it as Barlow Condensed - at which point it
 * would have switched every modal's text to the display face. A modal's text
 * inherits the app font; the shared pieces set `font-ui`/`font-display`
 * themselves.
 */
export const MODAL_BACKDROP =
  'fixed inset-0 bg-black/70 flex items-center justify-center';

/**
 * The backdrop for something that opens ON TOP of another surface and has to
 * be resolved before anything else: a confirm, a blocking progress overlay.
 *
 * Lighter than the plain backdrop but blurred, which is the point - the parent
 * stays visible enough to keep your place, and out of focus enough to say
 * "this one first". The app already did this in three places and simply had
 * not named it; one inline delete confirm had drifted to an unblurred 50% and
 * is brought back in line here.
 *
 * The blur cost that rules it out for ordinary modals is acceptable here
 * because these are short-lived and rarely more than one deep.
 */
export const MODAL_BACKDROP_BLOCKING =
  'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center';

/**
 * What sits on top of what.
 *
 * The ladder was inferred from what the app already does, not invented - the
 * numbers are the ones in use, given names so the next modal picks a rung
 * instead of guessing a number one higher than whatever it must beat.
 *
 * Gaps between rungs are intentional: something will eventually need to sit
 * between two of these, and it should not have to renumber the ladder.
 */
export const Z_LAYER = {
  /** Field overlays and in-page affordances that sit above the pitch. */
  fieldOverlay: 'z-[25]',
  /**
   * Scrim behind a slide-up PANEL or menu - the field tools sheet, the control
   * bar menu. Not a modal backdrop: a panel is dismissed by tapping past it
   * rather than resolved, so its scrim is lighter and sits below the modal
   * layer on purpose.
   */
  panelScrim: 'z-[40]',
  /** A blocking overlay owned by a screen rather than a dialog. */
  screenOverlay: 'z-[50]',
  /** The ordinary modal layer - most of the app's dialogs. */
  modal: 'z-[60]',
  /** A modal opened FROM a modal, which must cover its parent. */
  modalNested: 'z-[70]',
  /** Full-screen takeovers: wizards, first-run, the guided tour. */
  takeover: 'z-[80]',
  /** Confirms and destructive prompts - always above their subject. */
  confirm: 'z-[85]',
  /** Toasts, which must clear everything including a confirm. */
  toast: 'z-[100]',
} as const;

export type ZLayer = keyof typeof Z_LAYER;
