import React from 'react';

interface FloatingAddButtonProps {
  onClick: () => void;
  /** Accessible label / tooltip, e.g. "Add Team". */
  label: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A round floating "+" action button pinned to the bottom-right of a modal.
 * Frees the header bar for content while keeping the primary "add" action
 * reachable over a scrolling list. The nearest positioned ancestor must be
 * `relative` (the modal card already is); the list needs bottom padding so its
 * last row isn't hidden behind the button.
 */
export default function FloatingAddButton({ onClick, label, disabled = false, className = '' }: FloatingAddButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`absolute bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg border border-indigo-400/30 transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
