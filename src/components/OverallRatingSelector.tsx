'use client';

import React from 'react';

const segmentBase =
  'flex min-w-0 min-h-11 items-center justify-center rounded-lg font-ui text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-carbon';

/**
 * One segment of a rating row (the per-metric levels and the overall 1-10).
 * - chosen by the coach: lifted navy with the amber ring (the selection);
 * - the untouched default: only a faint grey outline, so a value nobody has
 *   given yet does not read as a rating;
 * - the rest: quiet navy cells.
 */
export function ratingSegmentClass(selected: boolean, untouched: boolean): string {
  if (selected && !untouched) {
    return `${segmentBase} font-bold text-ink s1-seg-on shadow-[inset_0_0_0_1.5px_var(--color-action),0_2px_6px_-2px_rgb(2_6_23/0.75)]`;
  }
  if (selected) {
    return `${segmentBase} font-medium text-ink-3 shadow-[inset_0_0_0_1.5px_rgb(148_163_184/0.45)]`;
  }
  return `${segmentBase} font-medium text-ink-3 bg-white/[0.04] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] hover:bg-white/[0.08]`;
}

interface OverallRatingSelectorProps {
  value: number;
  onChange: (value: number) => void;
  /** Group label, also shown above the row with the chosen number ("Overall · 7"). */
  label?: string;
  /** Not rated yet: `value` is only the default (see AssessmentLevelSelector). */
  untouched?: boolean;
}

const OverallRatingSelector: React.FC<OverallRatingSelectorProps> = ({ value, onChange, label, untouched = false }) => {
  const numbers = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-sm text-ink-2">
          <span className="font-medium">{label}</span>
          <span className={untouched ? 'text-ink-3/70' : 'font-semibold text-ink'}>{' · '}{value}</span>
        </span>
      )}
      {/* One even row of ten, the same segments as the metrics below; two rows of
          five under 360px so every segment keeps a usable width. */}
      <div className="grid grid-cols-5 min-[360px]:grid-cols-10 gap-1" role="group" aria-label={label}>
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            aria-label={n.toString()}
            aria-pressed={value === n && !untouched}
            className={ratingSegmentClass(value === n, untouched)}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
};

export default OverallRatingSelector;
