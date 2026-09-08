'use client';

/**
 * "Something is happening" for the AI work that takes seconds (Kirjuri).
 *
 * Transcription and drafting both go out to the coach's provider and come back
 * whenever they come back. Without a moving thing on screen, a wait reads as a
 * button that did not work - which is exactly how it was reported.
 *
 * Deliberately subtle: a small spinner beside a line of text, in the muted tone
 * the surrounding cards use, not a blocking overlay. The coach is waiting for a
 * paragraph, not for the app.
 *
 * Announced to screen readers politely so it is heard once rather than nagged,
 * and it stops moving for anyone who asked the system for less motion.
 */

import React from 'react';

export interface WorkingIndicatorProps {
  /** What is happening, in the coach's words. */
  label: string;
  /** Optional progress, e.g. "2/5", shown after the label. */
  detail?: string;
  className?: string;
  'data-testid'?: string;
}

const WorkingIndicator: React.FC<WorkingIndicatorProps> = ({
  label,
  detail,
  className = '',
  'data-testid': testId = 'working-indicator',
}) => (
  <p
    className={`flex items-center gap-2 text-xs text-slate-400 ${className}`}
    role="status"
    aria-live="polite"
    data-testid={testId}
  >
    <svg
      className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-400 motion-reduce:animate-none"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
    <span>
      {label}
      {detail ? ` ${detail}` : ''}
    </span>
  </p>
);

export default WorkingIndicator;
