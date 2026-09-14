'use client';

import React from 'react';

/**
 * A section divider drawn as the halfway line.
 *
 * WHY THIS SHAPE. The app's identity is the pitch, and the most recognisable
 * marking on any pitch is the halfway line: a rule across the width with a
 * circle at its centre. That happens to be exactly what a section divider
 * already is - a horizontal line separating two halves - so this is the one
 * place the football vocabulary and the layout need are the same object,
 * rather than decoration applied on top of one.
 *
 * An earlier attempt at "pitch markings" only recoloured existing hairlines
 * from grey to white and claimed the idea. This draws the actual geometry.
 *
 * Deliberately restrained: no arcs, no penalty boxes, no corner flags. One
 * motif, used where a section genuinely begins, so it reads as an identity
 * rather than a theme. Scattering pitch furniture through the chrome would be
 * the decoration this replaces.
 *
 * @module PitchRule
 * @category Components
 */
export interface PitchRuleProps {
  /** Optional heading rendered under the line, in the section's own voice. */
  children?: React.ReactNode;
  className?: string;
}

export const PitchRule: React.FC<PitchRuleProps> = ({ children, className = '' }) => (
  <div className={className}>
    <svg
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      className="w-full h-2 text-white/15"
      aria-hidden="true"
      focusable="false"
    >
      {/* The line stops short of the circle on each side, exactly as the paint
          does - a line drawn straight through would read as a strikethrough. */}
      <line x1="0" y1="4" x2="42" y2="4" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      <line x1="58" y1="4" x2="100" y2="4" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      {/* preserveAspectRatio is none so the line spans any width, which would
          squash a circle into an ellipse - so the centre mark is drawn as a
          rect with a full radius, whose corners stay round under that scale. */}
      <rect
        x="46"
        y="1"
        width="8"
        height="6"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
    {children && (
      <div className="mt-1.5 text-xs font-semibold text-slate-400 text-center">{children}</div>
    )}
  </div>
);

export default PitchRule;
