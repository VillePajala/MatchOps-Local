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

import React from 'react';

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
    <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
    <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
    <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50 pointer-events-none" />
    <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50 pointer-events-none" />
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

const buttonBaseStyle =
  "px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed";

export const primaryButtonStyle =
  "px-6 py-2 rounded-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400/30";

export const secondaryButtonStyle =
  "px-6 py-2 rounded-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-slate-600 text-white hover:bg-slate-500 border border-slate-400/30";

export const dangerButtonStyle =
  "px-6 py-2 rounded-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 text-white hover:bg-red-500 border border-red-400/30";

export const successButtonStyle =
  "px-6 py-2 rounded-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 text-white hover:bg-green-500 border border-green-400/30";

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

export const ModalContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
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

export const ScrollableContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex-1 overflow-y-auto min-h-0 ${className}`}>
    {children}
  </div>
);

// ============================================================================
// Wizard Modal Styles (Migration, Import dialogs)
// ============================================================================

export const wizardBackdropStyle =
  "fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4";

export const wizardModalStyle =
  "relative w-full max-w-md bg-slate-800 border border-slate-700 rounded-xl shadow-2xl";

export const wizardModalLargeStyle =
  "relative w-full max-w-lg bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-[85vh] flex flex-col";

export const wizardHeaderStyle =
  "flex items-center justify-between px-6 py-4 border-b border-slate-700";

export const wizardTitleStyle =
  "text-lg font-semibold text-slate-100";

export const wizardContentStyle =
  "px-6 py-5";

export const wizardFooterStyle =
  "px-6 py-4 border-t border-slate-700 flex gap-3 justify-end";

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
