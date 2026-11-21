'use client';

import React, { useEffect, useId, useRef } from 'react';
import { SOCCER_FIELD_CONFIG } from '@/config/fieldConfigs';
import { drawFieldBackground, drawFieldMarkings } from '@/utils/fieldDrawing';
import { PITCH_LENGTH, PITCH_WIDTH, type ArrowKind, type ConceptPlayer, type Point } from './types';
import type { ResolvedArrow, ResolvedStep, ResolvedZone } from './resolveStep';

/**
 * The Pelitapa board: the match view's own grass and lines (painted by the
 * same fieldDrawing code on a canvas), with an SVG layer on top for zones,
 * arrows, discs and the ball, in pixel space so discs stay round.
 *
 * Movement between steps is a CSS transition on each disc's transform (the
 * browser interpolates on the compositor); arrows draw themselves in after
 * the move, zones fade in. All of it is switched off under
 * prefers-reduced-motion, and for a move over a `cut` step (`instant`).
 *
 * `still` draws a small static picture (the library's card thumbnails):
 * no motion classes, no names or labels, sizes scaled to the board.
 */

/** Width : length of the board (the concept's 68 x 100 grid). */
export const PITCH_ASPECT = PITCH_WIDTH / PITCH_LENGTH;

const NAVY = '#0f172a';
const AMBER = '#ffb224';
const RUN_AMBER = '#ffd27a';
const PRESS_RED = '#ff8a80';
const OPP_RED = '#ef4444';
const DEFAULT_MOVE_MS = 900;
const ARROW_DRAW_MS = 650;

export interface DiscLabel {
  name: string;
  /** Accessible name for the disc button. */
  ariaLabel: string;
}

interface PelitapaPitchProps {
  width: number;
  height: number;
  players: readonly ConceptPlayer[];
  resolved: ResolvedStep;
  /** Names on our discs, by concept player id. */
  labels: Record<string, DiscLabel | undefined>;
  onDiscTap?: (conceptPlayerId: string) => void;
  /** Jump to this step without moving the players (a new variation). */
  instant?: boolean;
  /** A small, static thumbnail. */
  still?: boolean;
}

const ARROW_STYLE: Record<ArrowKind, { color: string; width: number; dash?: string }> = {
  pass: { color: '#ffffff', width: 1 },
  long: { color: '#ffffff', width: 1 },
  shot: { color: '#ffffff', width: 1.7 },
  drib: { color: '#ffffff', width: 0.85 },
  run: { color: RUN_AMBER, width: 0.9, dash: '2.4 1.7' },
  press: { color: PRESS_RED, width: 0.9, dash: '1.1 1.1' },
};

function GrassCanvas({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFieldBackground(ctx, width, height, SOCCER_FIELD_CONFIG);
    drawFieldMarkings(ctx, width, height, SOCCER_FIELD_CONFIG);
  }, [width, height]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width, height, display: 'block' }}
    />
  );
}

/** The path of an arrow in pixels, and the direction it arrives in (for the head). */
function arrowGeometry(a: ResolvedArrow, px: (p: Point) => Point, unit: number, shorten: number) {
  const [x1, y1] = px(a.from);
  const [x2raw, y2raw] = px(a.to);
  const len = Math.hypot(x2raw - x1, y2raw - y1) || 1;
  // Stop short of a disc at the far end so the head is not hidden under it.
  const cut = Math.min(shorten, len * 0.35);
  const ux = (x2raw - x1) / len;
  const uy = (y2raw - y1) / len;
  const x2 = x2raw - ux * cut;
  const y2 = y2raw - uy * cut;
  // Start just off the disc it leaves from.
  const start = a.fromId ? Math.min(shorten * 0.9, len * 0.3) : 0;
  const sx = x1 + ux * start;
  const sy = y1 + uy * start;

  if (a.kind === 'drib') {
    // Zigzag, then a straight lead-in for the head.
    const total = Math.hypot(x2 - sx, y2 - sy);
    const lead = Math.min(total * 0.25, unit * 3.2);
    const zig = total - lead;
    const wave = unit * 2.4;
    const amp = unit * 0.9;
    const n = Math.max(2, Math.round(zig / wave));
    const nx = -uy;
    const ny = ux;
    let d = `M${sx.toFixed(1)} ${sy.toFixed(1)}`;
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * zig;
      const s = i === n ? 0 : i % 2 === 1 ? amp : -amp;
      d += ` L${(sx + ux * t + nx * s).toFixed(1)} ${(sy + uy * t + ny * s).toFixed(1)}`;
    }
    d += ` L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    return { d, end: [x2, y2] as Point, dir: [ux, uy] as Point, mid: [(sx + x2) / 2, (sy + y2) / 2] as Point };
  }

  if (a.bend !== 0) {
    const mx = (sx + x2) / 2;
    const my = (sy + y2) / 2;
    const l = Math.hypot(x2 - sx, y2 - sy);
    const cx = mx + -uy * a.bend * l;
    const cy = my + ux * a.bend * l;
    const tx = x2 - cx;
    const ty = y2 - cy;
    const tl = Math.hypot(tx, ty) || 1;
    return {
      d: `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      end: [x2, y2] as Point,
      dir: [tx / tl, ty / tl] as Point,
      // The curve's point at t = 0.5.
      mid: [0.25 * sx + 0.5 * cx + 0.25 * x2, 0.25 * sy + 0.5 * cy + 0.25 * y2] as Point,
    };
  }

  return {
    d: `M${sx.toFixed(1)} ${sy.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`,
    end: [x2, y2] as Point,
    dir: [ux, uy] as Point,
    mid: [(sx + x2) / 2, (sy + y2) / 2] as Point,
  };
}

function headPath(end: Point, dir: Point, size: number): string {
  const [ex, ey] = end;
  const [dx, dy] = dir;
  const bx = ex - dx * size;
  const by = ey - dy * size;
  const w = size * 0.62;
  return `M${ex.toFixed(1)} ${ey.toFixed(1)} L${(bx - dy * w).toFixed(1)} ${(by + dx * w).toFixed(1)} L${(bx + dy * w).toFixed(1)} ${(by - dx * w).toFixed(1)} Z`;
}

function Zone({
  zone,
  px,
  W,
  unit,
  still,
}: {
  zone: ResolvedZone;
  px: (p: Point) => Point;
  W: number;
  unit: number;
  still?: boolean;
}) {
  const common = {
    fill: 'rgba(255,178,36,0.16)',
    stroke: 'rgba(255,178,36,0.75)',
    strokeWidth: Math.max(1.2, unit * 0.32),
    strokeDasharray: `${unit * 1.2} ${unit * 0.9}`,
  };
  let shape: React.ReactNode;
  let labelAt: Point;
  switch (zone.kind) {
    case 'rect': {
      const [x, y] = px([zone.x, zone.y]);
      const [x2, y2] = px([zone.x + zone.w, zone.y + zone.h]);
      shape = <rect x={x} y={y} width={x2 - x} height={y2 - y} rx={unit * 1.5} {...common} />;
      labelAt = [(x + x2) / 2, y + unit * 2.6];
      break;
    }
    case 'ellipse': {
      const [cx, cy] = px([zone.cx, zone.cy]);
      const [ex, ey] = px([zone.cx + zone.rx, zone.cy + zone.ry]);
      shape = <ellipse cx={cx} cy={cy} rx={ex - cx} ry={ey - cy} {...common} />;
      labelAt = [cx, cy];
      break;
    }
    case 'band': {
      const h = zone.h ?? 8;
      const [, y] = px([0, zone.y - h / 2]);
      const [, y2] = px([0, zone.y + h / 2]);
      shape = <rect x={0} y={y} width={W} height={y2 - y} {...common} />;
      labelAt = [W / 2, (y + y2) / 2];
      break;
    }
    case 'poly': {
      const pts = zone.points.map(px);
      shape = (
        <polygon
          points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
          {...common}
          strokeLinejoin="round"
        />
      );
      labelAt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
      break;
    }
    case 'link': {
      const [[x1, y1], [x2, y2]] = zone.points.map(px);
      shape = (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={Math.max(1.2, unit * 0.36)}
          strokeDasharray={`${unit * 1.1} ${unit * 0.8}`}
          strokeLinecap="round"
        />
      );
      labelAt = [(x1 + x2) / 2, (y1 + y2) / 2];
      break;
    }
  }
  return (
    <g className={still ? undefined : 'pt-zone'}>
      {shape}
      {zone.label && !still && (
        <text
          x={labelAt[0]}
          y={labelAt[1]}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ffe2a8"
          style={{ font: `700 ${Math.max(11, unit * 2)}px var(--font-inter), Inter, sans-serif`, paintOrder: 'stroke' }}
          stroke="rgba(15,23,42,0.6)"
          strokeWidth={3}
        >
          {zone.label}
        </text>
      )}
    </g>
  );
}

/** A name inside a disc, Barlow Condensed like the match view; long names shrink. */
function discFontSize(name: string, r: number): number {
  const chars = Array.from(name).length;
  const base = r * 0.78;
  // Barlow Condensed 700 averages ~0.5em per character.
  const fit = (r * 2 - 6) / (Math.max(chars, 1) * 0.5);
  return Math.max(10, Math.min(base, fit));
}

export default function PelitapaPitch({
  width: W,
  height: H,
  players,
  resolved,
  labels,
  onDiscTap,
  instant = false,
  still = false,
}: PelitapaPitchProps) {
  // Several boards can be on one page (library thumbnails): ids must be unique.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const unit = W / 100; // 1% of the pitch width
  const r = still ? W * 0.042 : Math.max(16, Math.min(30, W * 0.043));
  const rOpp = r * 0.74;
  const px = (p: Point): Point => [(p[0] / PITCH_WIDTH) * W, (p[1] / PITCH_LENGTH) * H];
  const moveMs = instant ? 0 : (resolved.step.durationMs ?? DEFAULT_MOVE_MS);
  const highlights = new Set(resolved.highlights);
  const stepKey = resolved.index;
  const lineBase = still ? Math.max(1, W * 0.008) : Math.max(2.2, W * 0.0068);
  const whiteFill = `url(#pt-white-${uid})`;
  const keeperFill = `url(#pt-keeper-${uid})`;

  // Our discs above theirs, highlighted ones on top.
  const ordered = [...players].sort((a, b) => {
    const rank = (p: ConceptPlayer) => (p.side === 'opp' ? 0 : highlights.has(p.id) ? 2 : 1);
    return rank(a) - rank(b);
  });

  return (
    <div
      className="pt-pitch"
      style={{
        position: 'relative',
        width: W,
        height: H,
        borderRadius: still ? 10 : 14,
        overflow: 'hidden',
        boxShadow: still ? undefined : '0 30px 60px -30px rgba(0,0,0,.8), inset 0 0 0 2px rgba(255,255,255,.06)',
        ['--pt-move' as string]: `${moveMs}ms`,
        ['--pt-draw' as string]: `${ARROW_DRAW_MS}ms`,
      }}
    >
      <GrassCanvas width={W} height={H} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }} data-testid="pelitapa-board">
        {/* Zones fade in with the step. */}
        <g key={`z${stepKey}`} style={{ ['--pt-delay' as string]: `${Math.round(moveMs * 0.5)}ms` }}>
          {resolved.zones.map((z, i) => (
            <Zone key={i} zone={z} px={px} W={W} unit={unit} still={still} />
          ))}
        </g>

        {/* Arrows draw themselves in once the players have moved. */}
        <g key={`a${stepKey}`} data-testid="pelitapa-arrows">
          {resolved.arrows.map((a, i) => {
            const style = ARROW_STYLE[a.kind];
            const sw = lineBase * style.width;
            const shorten = a.toId ? r * 1.08 : r * 0.35;
            const g = arrowGeometry(a, px, unit, shorten);
            const head = still ? Math.max(3.5, sw * 3.1) : Math.max(8, sw * 3.1);
            const delay = Math.round((instant ? 120 : moveMs * 0.7) + i * 180);
            const maskId = `pt-m-${uid}-${stepKey}-${i}`;
            // A still board has no draw-in: no mask needed.
            const mask = still ? undefined : `url(#${maskId})`;
            const badge = a.label && !still ? Math.max(11, r * 0.48) : 0;
            return (
              <g key={i} data-arrow-kind={a.kind} style={{ ['--pt-delay' as string]: `${delay}ms` }}>
                {!still && (
                  <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                    <path
                      className="pt-draw"
                      d={g.d}
                      pathLength={1}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={sw + 6 + (a.kind === 'drib' ? unit * 2.2 : 0)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </mask>
                )}
                <path
                  d={g.d}
                  fill="none"
                  stroke="rgba(15,23,42,0.28)"
                  strokeWidth={sw + 2}
                  strokeDasharray={style.dash ? style.dash.split(' ').map((v) => Number(v) * sw).join(' ') : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  mask={mask}
                  transform="translate(0 1)"
                />
                <path
                  d={g.d}
                  fill="none"
                  stroke={style.color}
                  strokeWidth={sw}
                  strokeDasharray={style.dash ? style.dash.split(' ').map((v) => Number(v) * sw).join(' ') : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  mask={mask}
                />
                <path
                  className={still ? undefined : 'pt-head'}
                  d={headPath(g.end, g.dir, head)}
                  fill={style.color}
                  stroke="rgba(15,23,42,0.25)"
                  strokeWidth={1}
                  strokeLinejoin="round"
                />
                {badge > 0 && (
                  <g className="pt-head" data-testid="pelitapa-arrow-label">
                    <circle cx={g.mid[0]} cy={g.mid[1]} r={badge} fill={NAVY} stroke={AMBER} strokeWidth={Math.max(1.5, badge * 0.12)} />
                    <text
                      x={g.mid[0]}
                      y={g.mid[1] + 0.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={AMBER}
                      style={{ font: `700 ${(badge * 1.15).toFixed(1)}px var(--font-barlow-condensed), 'Barlow Condensed', 'Arial Narrow', sans-serif` }}
                    >
                      {a.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* Players: one transformed group each, so the move is a transition. */}
        {ordered.map((p) => {
          const [x, y] = px(resolved.positions[p.id]);
          const us = p.side === 'us';
          const keeper = p.role === 'gk';
          const label = us ? labels[p.id] : undefined;
          const lit = highlights.has(p.id);
          const tappable = us && !!onDiscTap;
          return (
            <g
              key={p.id}
              className={still ? undefined : 'pt-move'}
              style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }}
              data-player={p.id}
              data-highlighted={lit ? 'true' : undefined}
              role={tappable ? 'button' : undefined}
              tabIndex={tappable ? 0 : undefined}
              aria-label={tappable ? label?.ariaLabel : undefined}
              onClick={tappable ? () => onDiscTap(p.id) : undefined}
              onKeyDown={
                tappable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onDiscTap(p.id);
                      }
                    }
                  : undefined
              }
              cursor={tappable ? 'pointer' : undefined}
            >
              {lit && (
                <circle
                  className={still ? undefined : 'pt-ring'}
                  r={(us ? r : rOpp) + (still ? r * 0.35 : Math.max(4, r * 0.2))}
                  fill="rgba(255,178,36,0.18)"
                  stroke={AMBER}
                  strokeOpacity={0.85}
                  strokeWidth={still ? Math.max(1, r * 0.16) : Math.max(2.5, r * 0.13)}
                />
              )}
              {us ? (
                <>
                  {!still && <circle r={r} cy={r * 0.12} fill="rgba(0,0,0,0.35)" style={{ filter: 'blur(3px)' }} />}
                  <circle r={r} fill={keeper ? keeperFill : whiteFill} />
                  {keeper ? (
                    <circle r={Math.max(r - 1, r * 0.85)} fill="none" stroke="#fff" strokeWidth={still ? Math.max(0.8, r * 0.14) : 2} />
                  ) : (
                    <circle r={r - 0.5} fill="none" stroke="rgba(15,23,42,0.18)" strokeWidth={1} />
                  )}
                  {label?.name && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      y={0.5}
                      fill={keeper ? '#fff' : NAVY}
                      textRendering="geometricPrecision"
                      style={{
                        font: `700 ${discFontSize(label.name, r).toFixed(1)}px var(--font-barlow-condensed), 'Barlow Condensed', 'Arial Narrow', sans-serif`,
                      }}
                    >
                      {label.name}
                    </text>
                  )}
                </>
              ) : (
                <circle r={rOpp} fill="rgba(15,23,42,0.28)" stroke={OPP_RED} strokeWidth={still ? Math.max(1, rOpp * 0.22) : Math.max(2.5, rOpp * 0.16)} />
              )}
              {tappable && <circle r={r + 4} fill="transparent" />}
            </g>
          );
        })}

        {resolved.ball && (() => {
          const [bx, by] = px(resolved.ball.at);
          const held = !!resolved.ball.holder;
          const holder = held ? players.find((p) => p.id === resolved.ball?.holder) : undefined;
          const hr = holder?.side === 'opp' ? rOpp : r;
          const br = still ? Math.max(2.2, r * 0.4) : Math.max(5.5, r * 0.32);
          const ox = held ? hr * 0.72 : 0;
          const oy = held ? -hr * 0.72 : 0;
          return (
            <g className={still ? undefined : 'pt-move'} style={{ transform: `translate(${(bx + ox).toFixed(1)}px, ${(by + oy).toFixed(1)}px)` }} data-testid="pelitapa-ball">
              <circle r={br} cy={1.5} fill="rgba(0,0,0,0.35)" />
              <circle r={br} fill="#fff" stroke={NAVY} strokeWidth={still ? br * 0.3 : Math.max(1.5, br * 0.28)} />
            </g>
          );
        })()}

        <defs>
          <linearGradient id={`pt-white-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e6e9ee" />
          </linearGradient>
          <linearGradient id={`pt-keeper-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a3854" />
            <stop offset="1" stopColor={NAVY} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
