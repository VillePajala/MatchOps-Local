'use client';

import React from 'react';

interface RatingBarProps {
  value: number;
  max?: number;
  /**
   * Text shown to the right of the bar. Defaults to the numeric value; pass a
   * word band (e.g. "Consistent · 7.4") for the development view.
   */
  valueLabel?: string;
}

const RatingBar: React.FC<RatingBarProps> = ({ value, max = 10, valueLabel }) => {
  const pct = Math.min(Math.max(value, 0), max) / max * 100;
  const hue = 120 * (value / max); // red to green
  const color = `hsl(${hue}, 70%, 50%)`;
  return (
    <div className="flex items-center space-x-2 w-full">
      {/* min-w keeps the bar usefully wide even on narrow phones, so the fill
          reads proportionally instead of collapsing to a sliver. */}
      <div className="flex-1 min-w-[48px] h-2 bg-slate-700 rounded relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-24 shrink-0 text-xs text-yellow-400 text-right whitespace-nowrap overflow-hidden text-ellipsis">
        {valueLabel ?? value.toFixed(1)}
      </span>
    </div>
  );
};

export default RatingBar;
