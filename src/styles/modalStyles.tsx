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
  "text-sm font-medium text-slate-200 mb-1";

export const subtextStyle =
  "text-xs text-slate-300";

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
  "block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 sm:text-sm text-white placeholder-slate-300";

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
  `${buttonBaseStyle} bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-lg`;

export const secondaryButtonStyle =
  `${buttonBaseStyle} bg-gradient-to-b from-slate-600 to-slate-700 text-slate-200 hover:from-slate-700 hover:to-slate-600`;

export const dangerButtonStyle =
  `${buttonBaseStyle} bg-gradient-to-b from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 shadow-lg`;

export const successButtonStyle =
  `${buttonBaseStyle} bg-gradient-to-b from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800`;

// ============================================================================
// Icon Button Styles
// ============================================================================

// p-2.5 = 10px padding on each side + 20px icon = 40px minimum touch target
// For better accessibility, using p-3 = 12px padding = 44px with 20px icon
export const iconButtonBaseStyle =
  "p-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const iconButtonEditStyle =
  `${iconButtonBaseStyle} text-slate-300 hover:text-indigo-400`;

export const iconButtonDangerStyle =
  `${iconButtonBaseStyle} text-slate-300 hover:text-red-500`;

export const iconButtonSuccessStyle =
  `${iconButtonBaseStyle} text-green-400 hover:bg-slate-600`;

export const iconButtonCancelStyle =
  `${iconButtonBaseStyle} text-slate-300 hover:bg-slate-600`;

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
