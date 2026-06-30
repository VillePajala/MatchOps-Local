'use client';

import React from 'react';

export interface RadarAxis {
  key: string;
  label: string;
  /** Current level (canonical scale). */
  current: number;
  /** Baseline / "season start" level (canonical scale). */
  baseline: number;
}

interface PlayerDevelopmentRadarProps {
  axes: RadarAxis[];
  /** Top of the scale (canonical max, e.g. 10). */
  max: number;
  currentLabel: string;
  baselineLabel: string;
}

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 82;
const RINGS = [0.25, 0.5, 0.75, 1];

const at = (r: number, angle: number): [number, number] => [
  CENTER + r * Math.cos(angle),
  CENTER + r * Math.sin(angle),
];

/**
 * "Now vs then" development radar: two overlaid polygons across the player's
 * qualities - current form (solid) vs the season-start baseline (dashed) - so
 * the whole-player trajectory reads at a glance (shape expanding = developing).
 */
const PlayerDevelopmentRadar: React.FC<PlayerDevelopmentRadarProps> = ({ axes, max, currentLabel, baselineLabel }) => {
  const n = axes.length;
  if (n < 3) return null;
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const polygon = (pick: (a: RadarAxis) => number) =>
    axes
      .map((ax, i) => {
        const level = Math.min(max, Math.max(0, pick(ax)));
        const [x, y] = at(RADIUS * (level / max), angleFor(i));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[260px]" role="img" aria-label={`${currentLabel} vs ${baselineLabel}`}>
        {RINGS.map((f, ri) => (
          <polygon
            key={ri}
            points={axes.map((_, i) => { const [x, y] = at(RADIUS * f, angleFor(i)); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ')}
            fill="none"
            stroke="#334155"
            strokeWidth={0.5}
          />
        ))}
        {axes.map((ax, i) => {
          const [x, y] = at(RADIUS, angleFor(i));
          const [lx, ly] = at(RADIUS + 14, angleFor(i));
          const anchor = lx > CENTER + 2 ? 'start' : lx < CENTER - 2 ? 'end' : 'middle';
          return (
            <g key={ax.key}>
              <line x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#334155" strokeWidth={0.5} />
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="fill-slate-400" style={{ fontSize: 7 }}>
                {ax.label}
              </text>
            </g>
          );
        })}
        <polygon points={polygon((a) => a.baseline)} fill="rgba(148,163,184,0.10)" stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 2" />
        <polygon points={polygon((a) => a.current)} fill="rgba(129,140,248,0.25)" stroke="#818cf8" strokeWidth={1.5} />
      </svg>
      <div className="flex gap-4 text-xs mt-1 text-slate-300">
        <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-indigo-400" />{currentLabel}</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-slate-400" />{baselineLabel}</span>
      </div>
    </div>
  );
};

export default PlayerDevelopmentRadar;
