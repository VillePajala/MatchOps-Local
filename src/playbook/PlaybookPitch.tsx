'use client';

import React, { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { SOCCER_FIELD_CONFIG } from '@/config/fieldConfigs';
import { drawFieldBackground, drawFieldMarkings } from '@/utils/fieldDrawing';
import { DISC_RADIUS_RATIO, OPP_DISC_SCALE, PITCH_LENGTH, PITCH_WIDTH, type ArrowKind, type ConceptPlayer, type Point } from './types';
import type { ResolvedArrow, ResolvedStep, ResolvedZone } from './resolveStep';
import { bendControl, easeStandard, quadPoint, type StepMotion } from './motion';

/**
 * The Playbook board: the match view's own grass and lines (painted by the
 * same fieldDrawing code on a canvas), with an SVG layer on top for zones,
 * arrows, discs and the ball, in pixel space so discs stay round.
 *
 * Movement between steps follows `motion` (planMotion): each moving disc and
 * the ball are moved frame by frame (requestAnimationFrame, writing the
 * transform straight to the element - no React render per frame) along the
 * curve of the arrow that announced the move, or straight; the duration
 * grows with the longest move. Arrows draw themselves in after the move,
 * zones fade in. All of it is switched off under prefers-reduced-motion, and
 * for a move over a `cut` step (`instant`).
 *
 * `still` draws a small static picture (the library's card thumbnails):
 * no motion classes, no names or labels, sizes scaled to the board.
 */

/** Width : length of the board (the concept's 68 x 100 grid). */
export const PITCH_ASPECT = PITCH_WIDTH / PITCH_LENGTH;

const NAVY = '#170a18';
const AMBER = '#fadd15';
const RUN_AMBER = '#ffe97a';
const PRESS_RED = '#ff8a80';
const OPP_RED = '#ef4444';
const DEFAULT_MOVE_MS = 900;
const BALL_KEY = '__ball';

const translatePx = (p: Point) => `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const ARROW_DRAW_MS = 650;

export interface DiscLabel {
  name: string;
  /** Accessible name for the disc button. */
  ariaLabel: string;
}

interface PlaybookPitchProps {
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
  /** How the players and the ball travel into this step; null/undefined = they jump. */
  motion?: StepMotion | null;
  /** Focus mode: discs and names at DISC_RADIUS_RATIO of the (larger) board, with no clamp. */
  focus?: boolean;
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
    // The same curve a player follows (planMotion): the quadratic over the
    // FULL chord, then the piece between the two shortened ends (blossoming),
    // so the drawn arrow lies exactly on the path the disc travels.
    const p0: Point = [x1, y1];
    const p1: Point = [x2raw, y2raw];
    const c = bendControl(p0, p1, a.bend);
    const t0 = start / len;
    const t1 = 1 - cut / len;
    const blossom = (u: number, v: number): Point => [
      (1 - u) * (1 - v) * p0[0] + (u * (1 - v) + v * (1 - u)) * c[0] + u * v * p1[0],
      (1 - u) * (1 - v) * p0[1] + (u * (1 - v) + v * (1 - u)) * c[1] + u * v * p1[1],
    ];
    const s0 = blossom(t0, t0);
    const q = blossom(t0, t1);
    const e = blossom(t1, t1);
    const tx = e[0] - q[0];
    const ty = e[1] - q[1];
    const tl = Math.hypot(tx, ty) || 1;
    return {
      d: `M${s0[0].toFixed(1)} ${s0[1].toFixed(1)} Q${q[0].toFixed(1)} ${q[1].toFixed(1)} ${e[0].toFixed(1)} ${e[1].toFixed(1)}`,
      end: e,
      dir: [tx / tl, ty / tl] as Point,
      mid: quadPoint(s0, q, e, 0.5),
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
    fill: 'rgba(250,221,21,0.16)',
    stroke: 'rgba(250,221,21,0.75)',
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
          stroke="rgba(23,10,24,0.6)"
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

/**
 * Disc radii in pixels for a board `width` pixels wide. Thumbnails and focus
 * mode use exactly DISC_RADIUS_RATIO of the pitch width (the size lintConcept
 * checks against); a focus-mode board is bigger, so its discs grow with it.
 * The normal view clamps the size so discs stay tappable on a phone and do not
 * balloon on a wide screen.
 */
export function discRadii(width: number, { still = false, focus = false }: { still?: boolean; focus?: boolean } = {}) {
  const exact = width * DISC_RADIUS_RATIO;
  const r = still || focus ? exact : Math.max(16, Math.min(30, exact));
  return { r, rOpp: r * OPP_DISC_SCALE };
}

export default function PlaybookPitch({
  width: W,
  height: H,
  players,
  resolved,
  labels,
  onDiscTap,
  instant = false,
  still = false,
  motion,
  focus = false,
}: PlaybookPitchProps) {
  // Several boards can be on one page (library thumbnails): ids must be unique.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const unit = W / 100; // 1% of the pitch width
  const { r, rOpp } = discRadii(W, { still, focus });
  const px = (p: Point): Point => [(p[0] / PITCH_WIDTH) * W, (p[1] / PITCH_LENGTH) * H];
  const moveMs = instant ? 0 : (motion?.durationMs ?? resolved.step.durationMs ?? DEFAULT_MOVE_MS);
  const highlights = new Set(resolved.highlights);
  const stepKey = resolved.index;
  const lineBase = still ? Math.max(1, W * 0.008) : Math.max(2.2, W * 0.0068);
  const whiteFill = `url(#pt-white-${uid})`;
  const keeperFill = `url(#pt-keeper-${uid})`;

  // The ball sits off its holder's disc (top right), so it follows the disc size.
  const ballOffset = (holder?: string): Point => {
    if (!holder) return [0, 0];
    const hr = players.find((p) => p.id === holder)?.side === 'opp' ? rOpp : r;
    return [hr * 0.72, -hr * 0.72];
  };
  // Where every disc and the ball end up at this step, in pixels.
  const finals = new Map<string, Point>();
  for (const p of players) finals.set(p.id, px(resolved.positions[p.id]));
  if (resolved.ball) {
    const [bx, by] = px(resolved.ball.at);
    const [ox, oy] = ballOffset(resolved.ball.holder);
    finals.set(BALL_KEY, [bx + ox, by + oy]);
  }

  // --- Motion: frame by frame along the planned paths (see the header comment).
  const discEls = useRef(new Map<string, SVGGElement>());
  const ballEl = useRef<SVGGElement | null>(null);
  /** Where each element is drawn right now (pixels), as the last frame left it. */
  const live = useRef(new Map<string, Point>());
  const frame = useRef<number | null>(null);
  const latest = useRef<{ finals: Map<string, Point>; px: (p: Point) => Point; ballOffset: (h?: string) => Point } | null>(null);
  useLayoutEffect(() => {
    latest.current = { finals, px, ballOffset };
  });
  const stopFrames = () => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  };
  // A new board size re-renders every element at its new place: a move in
  // flight cannot continue in the old pixels.
  useLayoutEffect(() => {
    stopFrames();
    live.current.clear();
  }, [W, H]);
  useEffect(() => () => stopFrames(), []);
  useLayoutEffect(() => {
    const cur = latest.current;
    if (still || !cur) return;
    const put = (key: string, p: Point) => {
      const el = key === BALL_KEY ? ballEl.current : discEls.current.get(key);
      if (el) el.style.transform = translatePx(p);
      live.current.set(key, p);
    };
    const reduced =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!motion || motion.durationMs <= 0 || reduced || typeof requestAnimationFrame !== 'function') {
      // Jump: everything straight to its place (also ends a move in flight).
      stopFrames();
      cur.finals.forEach((p, key) => put(key, p));
      return;
    }
    // Nothing moves into this step (e.g. the last step -> the question): let a
    // move in flight finish rather than cutting it short.
    if (Object.keys(motion.players).length === 0 && !motion.ball) return;
    stopFrames();

    const tracks: { key: string; at: (e: number) => Point }[] = [];
    cur.finals.forEach((fin, key) => {
      const planned = key === BALL_KEY ? motion.ball : motion.players[key];
      const was = live.current.get(key);
      if (planned) {
        const p0 = cur.px(planned.from);
        const p1 = cur.px(planned.to);
        const [o0x, o0y] = key === BALL_KEY && motion.ball ? cur.ballOffset(motion.ball.fromHolder) : [0, 0];
        const [o1x, o1y] = key === BALL_KEY && motion.ball ? cur.ballOffset(motion.ball.toHolder) : [0, 0];
        if (!was || Math.hypot(was[0] - (p0[0] + o0x), was[1] - (p0[1] + o0y)) < 2) {
          const c = bendControl(p0, p1, planned.bend);
          tracks.push({
            key,
            at: (e) => {
              const [x, y] = planned.bend === 0 ? lerp(p0, p1, e) : quadPoint(p0, c, p1, e);
              return [x + o0x + (o1x - o0x) * e, y + o0y + (o1y - o0y) * e];
            },
          });
          return;
        }
        // Interrupted mid-move: carry on straight from where it is now.
      }
      if (was && Math.hypot(was[0] - fin[0], was[1] - fin[1]) > 0.5) {
        tracks.push({ key, at: (e) => lerp(was, fin, e) });
      }
    });
    if (tracks.length === 0) return;

    const duration = motion.durationMs;
    tracks.forEach((tr) => put(tr.key, tr.at(0)));
    let t0: number | null = null;
    const tick = (now: number) => {
      if (t0 === null) t0 = now;
      const k = Math.min(1, (now - t0) / duration);
      const e = easeStandard(k);
      tracks.forEach((tr) => put(tr.key, tr.at(e)));
      frame.current = k < 1 ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
    // Only a new step's motion restarts this; a re-render (a name change) must
    // not. Sizes and positions are read through `latest`.
  }, [motion, still]);

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
        borderRadius: focus ? 0 : still ? 10 : 14,
        overflow: 'hidden',
        boxShadow:
          still || focus ? undefined : '0 30px 60px -30px rgba(0,0,0,.8), inset 0 0 0 2px rgba(255,255,255,.06)',
        ['--pt-move' as string]: `${moveMs}ms`,
        ['--pt-draw' as string]: `${ARROW_DRAW_MS}ms`,
      }}
    >
      <GrassCanvas width={W} height={H} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }} data-testid="playbook-board">
        {/* Zones fade in with the step. */}
        <g key={`z${stepKey}`} style={{ ['--pt-delay' as string]: `${Math.round(moveMs * 0.5)}ms` }}>
          {resolved.zones.map((z, i) => (
            <Zone key={i} zone={z} px={px} W={W} unit={unit} still={still} />
          ))}
        </g>

        {/* Arrows draw themselves in once the players have moved. */}
        <g key={`a${stepKey}`} data-testid="playbook-arrows">
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
                  stroke="rgba(23,10,24,0.28)"
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
                  stroke="rgba(23,10,24,0.25)"
                  strokeWidth={1}
                  strokeLinejoin="round"
                />
                {badge > 0 && (
                  <g className="pt-head" data-testid="playbook-arrow-label">
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
              ref={(el) => {
                if (el) discEls.current.set(p.id, el);
                else discEls.current.delete(p.id);
              }}
              style={{ transform: translatePx([x, y]) }}
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
                  fill="rgba(250,221,21,0.18)"
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
                    <circle r={Math.max(r - 1, r * 0.85)} fill="none" stroke="#822174" strokeWidth={still ? Math.max(0.8, r * 0.14) : 2.5} />
                  ) : (
                    <circle r={r - 0.75} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={still ? Math.max(0.6, r * 0.1) : 1.5} />
                  )}
                  {label?.name && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      y={0.5}
                      fill={keeper ? '#2a0826' : '#fff'}
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
                <circle r={rOpp} fill="rgba(23,10,24,0.28)" stroke={OPP_RED} strokeWidth={still ? Math.max(1, rOpp * 0.22) : Math.max(2.5, rOpp * 0.16)} />
              )}
              {tappable && <circle r={r + 4} fill="transparent" />}
            </g>
          );
        })}

        {resolved.ball && (() => {
          const at = finals.get(BALL_KEY) as Point;
          const br = still ? Math.max(2.2, r * 0.4) : Math.max(5.5, r * 0.32);
          return (
            <g ref={ballEl} style={{ transform: translatePx(at) }} data-testid="playbook-ball">
              <circle r={br} cy={1.5} fill="rgba(0,0,0,0.35)" />
              <circle r={br} fill="#fff" stroke={NAVY} strokeWidth={still ? br * 0.3 : Math.max(1.5, br * 0.28)} />
            </g>
          );
        })()}

        <defs>
          {/* PePo club preview: club-violet discs, the keeper PePo yellow. */}
          <radialGradient id={`pt-white-${uid}`} cx="0.35" cy="0.28" r="0.75">
            <stop offset="0" stopColor="#a6339a" />
            <stop offset="0.55" stopColor="#822174" />
            <stop offset="1" stopColor="#5c1653" />
          </radialGradient>
          <radialGradient id={`pt-keeper-${uid}`} cx="0.35" cy="0.28" r="0.75">
            <stop offset="0" stopColor="#fff27a" />
            <stop offset="0.55" stopColor="#fadd15" />
            <stop offset="1" stopColor="#f2b705" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
