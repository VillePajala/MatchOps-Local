'use client'; // Need this for client-side interactions like canvas

import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Player } from '@/types'; // Import Player from types
import { Point, Opponent, TacticalDisc } from '@/types'; // Import Point and Opponent from page
import type { GameType } from '@/types/game';
import { getFieldConfig } from '@/config/fieldConfigs';
import {
  drawFieldBackground,
  drawFieldMarkings,
} from '@/utils/fieldDrawing';
import tinycolor from 'tinycolor2';
import logger from '@/utils/logger';
import { isSidelinePosition, getPositionLabel } from '@/utils/positionLabels';
import type { PlannedGhost } from '@/utils/playtimePlanner/ghostSubs';
import type { PlannedChain } from '@/utils/playtimePlanner/plannedChains';
import type { SubSlot } from '@/utils/formations';

// Define props for SoccerField
interface SoccerFieldProps {
  players: Player[];
  opponents: Opponent[];
  drawings: Point[][];
  showPlayerNames: boolean;
  showPositionLabels?: boolean;
  /** Game type determines field visualization (soccer field vs futsal court) */
  gameType?: GameType;
  onPlayerDrop: (playerId: string, relX: number, relY: number) => void; // Use relative coords
  onPlayerMove: (playerId: string, relX: number, relY: number) => void; // Use relative coords
  /** movedPlayerIds scopes the position-driven goalie rule to the disc(s)
   *  the coach actually moved (see useFieldCoordination). */
  onPlayerMoveEnd: (movedPlayerIds?: string[]) => void;
  onDrawingStart: (point: Point) => void; // Point already uses relative
  onDrawingAddPoint: (point: Point) => void; // Point already uses relative
  onDrawingEnd: () => void;
  onPlayerRemove: (playerId: string) => void;
  onPlayersSwap?: (playerAId: string, playerBId: string) => void;
  // Opponent handlers
  onOpponentMove: (opponentId: string, relX: number, relY: number) => void; // Use relative coords
  onOpponentMoveEnd: (opponentId: string) => void;
  onOpponentRemove: (opponentId: string) => void;
  // Touch drag props
  draggingPlayerFromBarInfo: Player | null; 
  onPlayerDropViaTouch: (relX: number, relY: number) => void; // Use relative coords
  onPlayerDragCancelViaTouch: () => void;
  // ADD prop for timer display
  timeElapsedInSeconds: number;
  isTacticsBoardView: boolean;
  tacticalDiscs: TacticalDisc[];
  onTacticalDiscMove: (discId: string, relX: number, relY: number) => void;
  onTacticalDiscMoveEnd: () => void;
  onTacticalDiscRemove: (discId: string) => void;
  onToggleTacticalDiscType: (discId: string) => void;
  tacticalBallPosition: Point | null;
  onTacticalBallMove: (position: Point) => void;
  onTacticalBallMoveEnd: () => void;
  isDrawingEnabled: boolean;
  formationSnapPoints?: Point[];
  /** Sub slots for substitution planning - shows labeled positions on sideline */
  subSlots?: SubSlot[];
  /**
   * Faint markers for planned entries no real disc represents - a player the
   * plan brings on at a position they are not currently waiting at.
   *
   * Purely drawn: never hit-tested, never dragged, never part of `players`.
   * They are a reminder of the plan, not a record of the match.
   */
  plannedGhosts?: PlannedGhost[];
  /** Full plan view: one divided pill per position. Drawn on an otherwise
   *  empty field - the caller withholds discs, sideline and opponents. */
  plannedChains?: PlannedChain[];
}

/**
 * Ref handle for SoccerField - exposes canvas for export
 */
export interface SoccerFieldHandle {
  /** Get the canvas element for export */
  getCanvas: () => HTMLCanvasElement | null;
  /** Render field at specified resolution for high-quality export */
  renderForExport: (scale?: number) => HTMLCanvasElement | null;
}

// Constants
const PLAYER_RADIUS = 20;
// Player/opponent tokens on the live field (and the formation/sub-slot snap
// circles that mirror them) read better a touch larger. The tactical-board
// discs and the tactical hit-test deliberately keep PLAYER_RADIUS so the
// tactics view stays at its current size.
const FIELD_PLAYER_RADIUS = 24;
const BALL_IMAGE_OVERSCAN = 2.1; // Slightly oversized to eliminate edge artifacts when clipping
const DOUBLE_TAP_TIME_THRESHOLD = 300; // ms
const DOUBLE_TAP_POS_THRESHOLD = 15; // pixels
const TAP_TO_DRAG_THRESHOLD = 10; // pixels
const TAP_TO_DRAG_THRESHOLD_SQ = TAP_TO_DRAG_THRESHOLD * TAP_TO_DRAG_THRESHOLD;
const FORMATION_SNAP_THRESHOLD_PX = 36; // pixels
const FORMATION_SNAP_THRESHOLD_SQ = FORMATION_SNAP_THRESHOLD_PX * FORMATION_SNAP_THRESHOLD_PX;
/** Free space kept between a disc and the canvas edge. */
const DISC_EDGE_GAP = 4;
/** A sideline chip's centre sits this far above the disc's bottom edge. */
const SIDELINE_CHIP_RISE = 4;
/** A rail disc's name sits this far above centre when a chip is under it. */
const RAIL_NAME_LIFT = 3;

/**
 * Where a disc (player, sub slot, planned-sub marker) is DRAWN horizontally,
 * and where a tap finds it - the hit-tests use this same function, so a tap
 * lands exactly where the disc is painted.
 *
 * The stored relX is untouched. This only keeps the whole disc on the
 * canvas: the sideline column is stored at relX 0.96, which on a 360-412px
 * phone put the disc's centre 15-17px from the edge with a 24px radius - the
 * screen edge sliced the slots and the subs waiting in them. Anything closer
 * to an edge than one radius plus a small gap is drawn just inside it;
 * everything else is drawn exactly at relX * width, as it always was.
 * Exported for tests.
 */
export function discCenterX(relX: number, width: number, radius: number): number {
  const x = relX * width;
  const min = radius + DISC_EDGE_GAP;
  const max = width - radius - DISC_EDGE_GAP;
  if (!Number.isFinite(x) || max <= min) return x;
  return Math.min(Math.max(x, min), max);
}

// ---------------------------------------------------------------------------
// The planned-subs rail.
//
// The sub slots are STORED where generateSubSlots puts them (relX 0.96, relY
// next to their formation row, so LB/RB pairs stack close together), and a
// sub parked in a slot is stored at exactly those coordinates. That data is
// untouched. What changes is where a slot - and whatever waits in it - is
// DRAWN: an evenly spaced column down the right sideline, in the slots' own
// top-to-bottom order (ST at the top ... RB at the bottom), so neighbouring
// slots can never overlap.
//
// Everything that finds a slot on screen - drawing, the tap/selection hit
// tests, the drop snap, placing a player from the bar - goes through
// computeSubRail/subRailIndexFor, so a tap lands exactly where a slot or a
// waiting sub is painted.
// ---------------------------------------------------------------------------

/** Radius of a rail slot and of the disc waiting in it: a 40px circle. */
export const SUB_RAIL_RADIUS = 20;
/** Free space between a rail slot's edge and the right touchline. */
const SUB_RAIL_TOUCHLINE_GAP = 6;
/** The touchline's inset from the canvas edge (fieldDrawing LINE_MARGIN). */
const FIELD_LINE_MARGIN = 5;
/**
 * Highest first-slot centre when there is room: below the field tools
 * (12-52px) and the plan-view label under them (60-~94px), which sit over
 * the same right-hand strip (FieldContainer).
 */
const SUB_RAIL_TOP = 120;
/** When the column needs the room it may start higher - but stays below the tool row. */
const SUB_RAIL_TOP_MIN = 76;
/** Widest spacing between slot centres; fewer slots sit as a centred group. */
const SUB_RAIL_MAX_STEP = 68;
/** Narrowest spacing: a 44px tap target each, so they never overlap. */
const SUB_RAIL_MIN_STEP = 44;
/** A tap within this distance of a rail slot's centre lands on it (44px target). */
const SUB_RAIL_HIT_RADIUS = 22;

/** Where a rail slot is drawn, in the canvas units the caller passed. */
export interface RailSpot {
  x: number;
  y: number;
  r: number;
}

/**
 * Where each sub slot is drawn: one entry per slot, in the same order as
 * `slots`. W and H are the canvas size in output pixels; `scale` is output
 * pixels per CSS pixel (1 on screen, 2 for the image export), so the export
 * shows exactly the screen's layout. Exported for tests.
 */
export function computeSubRail(slots: readonly SubSlot[] | undefined, W: number, H: number, scale = 1): RailSpot[] {
  const n = slots?.length ?? 0;
  if (!slots || n === 0 || !(W > 0) || !(H > 0) || !(scale > 0)) return [];
  const cssW = W / scale;
  const cssH = H / scale;
  const r = SUB_RAIL_RADIUS;
  const x = cssW - FIELD_LINE_MARGIN - SUB_RAIL_TOUCHLINE_GAP - r;
  const bottom = cssH - FIELD_LINE_MARGIN - SUB_RAIL_TOUCHLINE_GAP - r;

  // Fixed order: top to bottom as stored (generateSubSlots stacks a row's
  // slots left to right, so LB comes before RB); ties keep their order.
  const order = slots
    .map((_, i) => i)
    .sort((a, b) => slots[a].relY - slots[b].relY || a - b);

  let top = Math.min(SUB_RAIL_TOP, bottom);
  let step = n > 1 ? Math.min(SUB_RAIL_MAX_STEP, (bottom - top) / (n - 1)) : 0;
  if (n > 1 && step < SUB_RAIL_MIN_STEP) {
    // Not enough room below the preferred top: start higher (never above
    // the tool row) and space evenly over what there is.
    top = Math.min(Math.max(SUB_RAIL_TOP_MIN, bottom - SUB_RAIL_MIN_STEP * (n - 1)), bottom);
    step = Math.max(0, (bottom - top) / (n - 1));
  }
  // A column shorter than the band sits in its middle.
  const start = top + Math.max(0, (bottom - top) - step * (n - 1)) / 2;

  const spots: RailSpot[] = new Array(n);
  order.forEach((slotIndex, k) => {
    spots[slotIndex] = { x: x * scale, y: (start + k * step) * scale, r: r * scale };
  });
  return spots;
}

/**
 * The slot a stored position belongs to (index into `slots`), or -1. Only a
 * sideline position can be in a slot - a player on the pitch near the right
 * touchline is drawn where they stand. The nearest slot wins when two are
 * within SUB_SLOT_OCCUPATION_THRESHOLD. Exported for tests.
 */
export function subRailIndexFor(relX: number, relY: number, slots: readonly SubSlot[] | undefined): number {
  if (!slots || slots.length === 0 || !isSidelinePosition(relX)) return -1;
  let best = -1;
  let bestD = Infinity;
  slots.forEach((slot, i) => {
    const dx = Math.abs(relX - slot.relX);
    const dy = Math.abs(relY - slot.relY);
    if (dx < SUB_SLOT_OCCUPATION_THRESHOLD && dy < SUB_SLOT_OCCUPATION_THRESHOLD && dx + dy < bestD) {
      best = i;
      bestD = dx + dy;
    }
  });
  return best;
}

/**
 * How close (relY) a sub parked by hand has to be to a slot to be drawn in
 * it. Wider than SUB_SLOT_OCCUPATION_THRESHOLD on purpose: a sub nudged a
 * little off its slot used to sit half over the neighbouring slot, and on the
 * rail it would sit over a different slot entirely. The planned-sub ghosts
 * already treat such a disc as occupying the slot (ghostSubs uses half the
 * slot spacing), so drawing it there matches them.
 */
const SUB_RAIL_CAPTURE = 0.07;

/**
 * Which sideline discs are drawn in which rail slot: player id -> slot index.
 * Closest pairs first, one disc per slot; a disc that loses its slot to a
 * closer one is drawn where it stands. Exported for tests.
 */
export function assignRailSlots(players: readonly Player[], slots: readonly SubSlot[] | undefined): Map<string, number> {
  const assigned = new Map<string, number>();
  if (!slots || slots.length === 0) return assigned;
  const pairs: { id: string; i: number; d: number }[] = [];
  players.forEach((p) => {
    if (typeof p.relX !== 'number' || typeof p.relY !== 'number' || !isSidelinePosition(p.relX)) return;
    slots.forEach((slot, i) => {
      const dx = Math.abs((p.relX as number) - slot.relX);
      const dy = Math.abs((p.relY as number) - slot.relY);
      if (dx < SUB_SLOT_OCCUPATION_THRESHOLD && dy < SUB_RAIL_CAPTURE) pairs.push({ id: p.id, i, d: dx + dy });
    });
  });
  pairs.sort((a, b) => a.d - b.d);
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (assigned.has(pair.id) || taken.has(pair.i)) continue;
    assigned.set(pair.id, pair.i);
    taken.add(pair.i);
  }
  return assigned;
}

/** Where a disc is drawn: on the rail, or where it stands. */
interface DiscPlacement {
  x: number;
  y: number;
  r: number;
  /** Index of the rail slot it is drawn in, or -1. */
  railIndex: number;
}

/**
 * The rail laid out for one frame (or one hit test): where each slot is, which
 * disc sits in which, and where any disc or stored point is drawn. Built by the
 * live draw, the export and every hit test from the same inputs, so what is
 * tapped is what is painted.
 */
interface RailScene {
  rail: RailSpot[];
  /** Slot indexes a disc is drawn in. */
  filled: Set<number>;
  player: (p: Player) => DiscPlacement;
  coords: (relX: number, relY: number) => DiscPlacement;
}

function buildRailScene(
  players: readonly Player[],
  slots: readonly SubSlot[] | undefined,
  W: number,
  H: number,
  scale: number,
  fieldRadius: number,
  /** A disc being dragged: drawn under the finger, never pulled onto the rail. */
  excludeId: string | null = null,
): RailScene {
  const rail = computeSubRail(slots, W, H, scale);
  const assigned = assignRailSlots(excludeId ? players.filter((p) => p.id !== excludeId) : players, slots);
  const filled = new Set(assigned.values());
  const at = (relX: number, relY: number, i: number): DiscPlacement =>
    i >= 0 && rail[i]
      ? { x: rail[i].x, y: rail[i].y, r: rail[i].r, railIndex: i }
      : { x: discCenterX(relX, W, fieldRadius), y: relY * H, r: fieldRadius, railIndex: -1 };
  const player = (p: Player): DiscPlacement => at(p.relX as number, p.relY as number, assigned.get(p.id) ?? -1);
  const coords = (relX: number, relY: number): DiscPlacement => {
    // A stored point a disc stands on is drawn where that disc is.
    const owner = players.find((p) => p.relX === relX && p.relY === relY && assigned.has(p.id));
    if (owner) return player(owner);
    return at(relX, relY, subRailIndexFor(relX, relY, slots));
  };
  return { rail, filled, player, coords };
}

/**
 * An empty rail slot: a dashed 1.5px ring (white ~55%) on a faint navy well,
 * with the place it is for (11px) inside it.
 */
function paintEmptyRailSlot(
  ctx: CanvasRenderingContext2D,
  spot: RailSpot,
  label: string | null,
  scale: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
  ctx.fill();
  ctx.setLineDash([4 * scale, 3.5 * scale]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.5 * scale;
  ctx.stroke();
  ctx.setLineDash([]);
  if (label) {
    ctx.font = `700 ${11 * scale}px ${chipFontFamily()}`;
    setCanvasLetterSpacing(ctx, `${0.04 * 11 * scale}px`);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillText(label, spot.x, spot.y + 0.5 * scale);
  }
  ctx.restore();
}

/** A position chip waiting to be painted after every disc. */
interface PendingChip {
  label: string;
  x: number;
  y: number;
  size: number;
}

/**
 * The position chip a player's disc carries, or null. A sub waiting in a rail
 * slot carries that slot's place (11px, on the disc's lower half - the rail
 * is tight); a player on the pitch at a formation point carries the place it
 * stands in (12px, overlapping the disc's lower edge); the keeper carries
 * none. Shared by the live field and the image export.
 */
function positionChipFor(
  player: Player,
  spot: DiscPlacement,
  railSlot: SubSlot | undefined,
  scale: number,
  showPositionLabels: boolean,
  formationSnapPoints: readonly Point[] | undefined,
  translate: (key: string) => string,
): PendingChip | null {
  if (!showPositionLabels || typeof player.relX !== 'number' || typeof player.relY !== 'number') return null;
  if (railSlot) {
    return {
      label: translate(`positions.${railSlot.positionLabel}`),
      x: spot.x,
      y: spot.y + spot.r - SIDELINE_CHIP_RISE * scale,
      size: 11,
    };
  }
  if (isSidelinePosition(player.relX) || player.relY >= 0.9) return null;
  const relX = player.relX;
  const relY = player.relY;
  const isAtSnapPoint = formationSnapPoints?.some(point =>
    Math.abs(relX - point.relX) < SUB_SLOT_OCCUPATION_THRESHOLD &&
    Math.abs(relY - point.relY) < SUB_SLOT_OCCUPATION_THRESHOLD
  );
  if (!isAtSnapPoint) return null;
  return {
    label: translate(`positions.${getPositionLabel(relX, relY).label}`),
    x: spot.x,
    y: spot.y + spot.r + 1 * scale,
    size: 12,
  };
}

/**
 * Draw the planned-substitution markers.
 *
 * ONE function for both render paths on purpose. These markers first shipped
 * wired into the export path only, so the toggle appeared and the live field
 * stayed blank; a shared helper makes that particular mistake impossible to
 * repeat rather than merely unlikely.
 *
 * The mark is deliberately not another ring. The sideline slot already draws a
 * dashed circle here, so a ghost ring inside it put two dashed circles and a
 * grey position label in one spot. Instead the EXISTING slot circle is filled
 * and given a solid edge - "this empty slot is spoken for" - and a dotted
 * thread runs back to the player's real disc, because the same name appearing
 * twice on the field only means something once you can see the two are one
 * player.
 *
 * A ghost never overlaps a real disc. A sub parked by hand a little off its
 * slot (the owner's Eino) used to sit half on top of the neighbouring ghost
 * (Niilo): the ghost now slides along the rail, up to one radius, to the
 * nearest spot clear of every real disc and every ghost already drawn. If
 * there is no such spot the real disc is effectively standing on that slot,
 * and the ghost is left out - the same rule as a disc sitting exactly on it.
 */
function drawPlannedGhosts(
  ctx: CanvasRenderingContext2D,
  ghosts: readonly PlannedGhost[],
  W: number,
  place: (relX: number, relY: number) => { x: number; y: number; r: number },
  discs: readonly { x: number; y: number; r: number }[] = [],
): void {
  const placed: { x: number; y: number; r: number }[] = [];
  ctx.save();
  ghosts.forEach((ghost) => {
    // A ghost stands in a sub slot, so it is drawn where the slot is (the rail).
    const spot = place(ghost.relX, ghost.relY);
    const radius = spot.r;
    const gx = spot.x;
    const gy = findClearGhostY(gx, spot.y, radius, [...discs, ...placed]);
    if (gy === null) return;
    placed.push({ x: gx, y: gy, r: radius });

    // The thread home, drawn first so the circle sits on top of its end.
    if (typeof ghost.fromRelX === 'number' && typeof ghost.fromRelY === 'number') {
      const from = place(ghost.fromRelX, ghost.fromRelY);
      const fx = from.x;
      const fy = from.y;
      const dx = gx - fx;
      const dy = gy - fy;
      const len = Math.hypot(dx, dy);
      // Start and end on the circles' edges, not their centres, so the thread
      // never crosses either disc's face.
      if (len > radius + from.r) {
        const ux = dx / len;
        const uy = dy / len;
        ctx.beginPath();
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.3)';
        ctx.moveTo(fx + ux * from.r, fy + uy * from.r);
        ctx.lineTo(gx - ux * radius, gy - uy * radius);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // The booked slot: a faint face plus a solid edge, covering the dashed
    // empty-slot ring already drawn underneath at this same radius.
    ctx.beginPath();
    ctx.arc(gx, gy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.1)';
    ctx.fill();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
    ctx.stroke();

    // The name. The sideline column sits at relX 0.96, so on a narrow phone a
    // centred name runs off the canvas - clamp it back inside rather than let
    // it be sliced.
    // 13px, shrinking (to 11px) to stay inside the circle.
    let size = 13;
    ctx.font = `700 ${size}px ${discFontFamily()}`;
    while (size > 11 && ctx.measureText(ghost.name).width > radius * 2 - 4) {
      size -= 1;
      ctx.font = `700 ${size}px ${discFontFamily()}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const half = ctx.measureText(ghost.name).width / 2;
    const tx = Math.min(Math.max(gx, half + 2), W - half - 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(ghost.name, tx, gy);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
    ctx.fillText(ghost.name, tx, gy);
  });
  ctx.restore();
}

/** Where each placed player's disc is drawn, for keeping ghosts off them. */
function placedDiscs(
  players: readonly Player[],
  place: (p: Player) => { x: number; y: number; r: number },
): { x: number; y: number; r: number }[] {
  return players
    .filter((p) => typeof p.relX === 'number' && typeof p.relY === 'number')
    .map(place);
}

/** Breathing room kept between a ghost and any disc next to it. */
const GHOST_CLEARANCE = 2;

/**
 * The y nearest `y0` (within one radius, 2px steps) where a ghost of `radius`
 * centred at `x` overlaps none of `others`; null when there is none.
 * Exported for tests.
 */
export function findClearGhostY(
  x: number,
  y0: number,
  radius: number,
  others: readonly { x: number; y: number; r: number }[],
): number | null {
  const clear = (y: number) =>
    others.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r + radius + GHOST_CLEARANCE);
  for (let d = 0; d <= radius; d += 2) {
    if (clear(y0 - d)) return y0 - d;
    if (d > 0 && clear(y0 + d)) return y0 + d;
  }
  return null;
}

/** Rounded rectangle path, by hand - ctx.roundRect is not everywhere yet. */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Disc and label styling (match view redesign, "full-screen pitch").
//
// Pure paint: these helpers draw at a centre and radius they are handed and
// never touch hit-testing, snapping or coordinate maths. Both render paths
// (the live field and the image export) call the same helpers, so the export
// can never drift from the screen.
// ---------------------------------------------------------------------------

/** The navy of the app's chrome; names on light discs and label chips. */
const DISC_NAVY = '#0f172a';
/** Amber: selection only. */
const DISC_ACTION = '#ffb224';
/**
 * The colour every disc used to default to. A player with no colour of their
 * own - or this legacy default stored on them - gets the new default look; a
 * colour the coach chose is still honoured.
 */
const LEGACY_DEFAULT_DISC_COLOR = '#7e22ce';

export function hasCustomDiscColor(color?: string): boolean {
  return !!color && color.trim().toLowerCase() !== LEGACY_DEFAULT_DISC_COLOR;
}

/**
 * Canvas cannot read a CSS variable, and next/font gives its families hashed
 * names, so the family is looked up from the variable on <body> once it is
 * there. Until then the fallback is used and nothing is cached.
 */
const canvasFontCache = new Map<string, string>();
function canvasFontFamily(cssVar: string, fallback: string): string {
  const hit = canvasFontCache.get(cssVar);
  if (hit) return hit;
  let family = '';
  if (typeof document !== 'undefined' && document.body && typeof getComputedStyle === 'function') {
    try {
      family = getComputedStyle(document.body).getPropertyValue(cssVar).trim();
    } catch {
      family = '';
    }
  }
  if (!family) return fallback;
  const resolved = `${family}, ${fallback}`;
  canvasFontCache.set(cssVar, resolved);
  return resolved;
}
/** Barlow Condensed: names on discs (the home screen's display face). */
const discFontFamily = (): string =>
  canvasFontFamily('--font-barlow-condensed', "'Barlow Condensed', 'Arial Narrow', sans-serif");
/** Inter: position chips and small labels. */
const chipFontFamily = (): string =>
  canvasFontFamily('--font-inter', 'Inter, system-ui, sans-serif');

/** Letter spacing where the canvas supports it (Chromium); a no-op elsewhere. */
function setCanvasLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof spaced.letterSpacing === 'string') spaced.letterSpacing = value;
}

interface PlayerDiscStyle {
  isGoalie?: boolean;
  color?: string;
  /** Waiting on the sideline: a touch quieter than the eleven. */
  sideline?: boolean;
  /**
   * Waiting in a planned-subs rail slot, i.e. coming in: the smaller rail
   * disc at ~82% white with a thin amber ring.
   */
  comingIn?: boolean;
}

/** Where the default white disc's gradient ends: a clean light grey. */
const DISC_WHITE_END = '#e6e9ee';

/**
 * One player disc: white with a navy name by default, navy with a white ring
 * for the keeper, or the coach's own colour with a white name. Returns the
 * colour the name should be painted in.
 */
function paintPlayerDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  scale: number,
  { isGoalie, color, sideline, comingIn }: PlayerDiscStyle,
): string {
  const custom = !isGoalie && hasCustomDiscColor(color);
  const restingWhite = comingIn && !isGoalie && !custom;

  // Lift off the grass: a soft shadow under the disc only.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 8 * scale;
  ctx.shadowOffsetY = 3 * scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (isGoalie) {
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#2a3854');
    g.addColorStop(1, DISC_NAVY);
    ctx.fillStyle = g;
  } else if (custom) {
    let base = tinycolor(color);
    if (sideline) base = base.desaturate(SIDELINE_DESATURATION_PERCENT);
    ctx.fillStyle = base.toString();
  } else if (restingWhite) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  } else {
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, DISC_WHITE_END);
    ctx.fillStyle = g;
    if (sideline) ctx.globalAlpha = 0.84;
  }
  ctx.fill();
  ctx.restore();

  // Coming in: a thin amber ring just outside the disc.
  if (comingIn) {
    ctx.beginPath();
    ctx.arc(x, y, r + 1.5 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = DISC_ACTION;
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();
  }

  ctx.beginPath();
  if (isGoalie) {
    // The keeper is the inverse of the field discs: navy inside a white ring.
    ctx.arc(x, y, r - 1 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * scale;
  } else if (custom) {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5 * scale;
  } else {
    // A hairline edge so a white disc still has an outline on a light stripe.
    ctx.arc(x, y, r - 0.5 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.lineWidth = 1 * scale;
  }
  ctx.stroke();

  return isGoalie || custom ? '#ffffff' : DISC_NAVY;
}

/**
 * The name on a disc, with a little letter spacing (+0.02em). Short names (5
 * letters or fewer) a size up; anything that would spill far past the disc
 * shrinks (down to 11px) instead. `baseSize` is the size for a longer name.
 */
function paintDiscName(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  r: number,
  scale: number,
  fill: string,
  baseSize = 15,
): void {
  if (!text) return;
  ctx.save();
  const family = discFontFamily();
  let size = Array.from(text).length <= 5 ? baseSize + 1 : baseSize;
  const setFont = () => {
    ctx.font = `700 ${size * scale}px ${family}`;
    setCanvasLetterSpacing(ctx, `${0.02 * size * scale}px`);
  };
  setFont();
  const maxWidth = r * 2 - 6 * scale;
  while (size > 11 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    setFont();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y + 0.5 * scale);
  ctx.restore();
}

/**
 * A position label as a full navy pill, readable on any grass stripe. Painted
 * after every disc, overlapping the lower edge of its own, so no neighbouring
 * disc can cover it. `anchor` says which point (x, y) is: the chip's centre,
 * or its right edge. `fontSize` is 12 on the pitch, 11 on the subs rail.
 */
function paintPositionChip(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  scale: number,
  anchor: 'center' | 'right' = 'center',
  fontSize = 12,
): void {
  ctx.save();
  ctx.font = `700 ${fontSize * scale}px ${chipFontFamily()}`;
  setCanvasLetterSpacing(ctx, `${0.06 * fontSize * scale}px`);
  const w = Math.max(28 * scale, ctx.measureText(label).width + 13 * scale);
  const h = (fontSize + 6) * scale;
  const cx = anchor === 'right' ? x - w / 2 : x;
  roundedRectPath(ctx, cx - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = DISC_NAVY;
  ctx.fill();
  // A faint edge, so the pill still separates from a navy keeper disc.
  ctx.lineWidth = 1 * scale;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, y + 0.5 * scale);
  ctx.restore();
}

/**
 * A tactics-board disc: home white (like the field discs), keeper navy in a
 * white ring, opponent red.
 */
function paintTacticalDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  scale: number,
  type: TacticalDisc['type'],
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 5 * scale;
  ctx.shadowOffsetX = 1 * scale;
  ctx.shadowOffsetY = 2 * scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (type === 'home') {
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, DISC_WHITE_END);
    ctx.fillStyle = g;
  } else if (type === 'opponent') {
    ctx.fillStyle = '#DC2626'; // Red
  } else if (type === 'goalie') {
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#2a3854');
    g.addColorStop(1, DISC_NAVY);
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  if (type === 'home') {
    ctx.arc(x, y, r - 0.5 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = 1 * scale;
  } else if (type === 'goalie') {
    ctx.arc(x, y, r - 1 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * scale;
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5 * scale;
  }
  ctx.stroke();
}

const CHAIN_ROW_H = 17;
const CHAIN_PAD = 5;

/**
 * One hue per wave of substitutions, so every change happening at the same
 * minute looks the same wherever it is on the pitch.
 *
 * Amber leads deliberately: a plan with a single substitution minute - the
 * common case - looks exactly as it did before this existed, and amber goes on
 * meaning "when". Later waves take hues that hold up on grass at a glance.
 *
 * Colour is an ACCELERATOR, never the information: the minute is printed on
 * every row regardless, so a coach who cannot tell these hues apart loses
 * speed and nothing else. Waves beyond the palette wrap, which is fine for the
 * same reason - two distant minutes sharing a hue costs a second look, not a
 * wrong substitution.
 */
const CHAIN_WAVE_COLORS = ['#F59E0B', '#38BDF8', '#A78BFA', '#34D399', '#FB7185'] as const;
const waveColor = (i: number): string =>
  CHAIN_WAVE_COLORS[((i % CHAIN_WAVE_COLORS.length) + CHAIN_WAVE_COLORS.length) % CHAIN_WAVE_COLORS.length];

/**
 * Draw the full plan: one divided pill per position.
 *
 * The third state of the field's plan toggle, and the only one that stands
 * alone - the caller hands us an otherwise empty field (no discs, no sideline,
 * no opponents) because the chains need every pixel of that space.
 *
 * The pill is the planner's own mark: position tag and starter on top, then
 * each incoming player tagged with their minute. A coach reads one convention
 * in both places.
 *
 * Chains of three or more run in TWO COLUMNS rather than growing downward.
 * Centre-column positions sit as little as 0.14 apart - about 60px on a phone -
 * so a tall pill would sit on its neighbour's head. Width is the cheap
 * direction here, now that the sideline column is gone.
 */
function drawPlannedChains(
  ctx: CanvasRenderingContext2D,
  chains: readonly PlannedChain[],
  W: number,
  H: number,
): void {
  ctx.save();
  ctx.textBaseline = 'middle';

  chains.forEach((chain) => {
    // A position nobody leaves has nothing to schedule. It still has to be
    // there - a hole in the eleven reads as a bug - but it recedes, so the
    // positions that DO change something come forward on their own.
    const settled = chain.entries.length === 0;

    const cols = chain.entries.length >= 3 ? 2 : 1;
    const rows = Math.ceil(chain.entries.length / cols);

    // One gutter for every minute in this pill, wide enough for the longest,
    // so the names line up in a column instead of stepping in and out as the
    // minutes go from 5' to 30'.
    ctx.font = `700 12px ${chipFontFamily()}`;
    let gutter = 0;
    chain.entries.forEach((e) => {
      gutter = Math.max(gutter, ctx.measureText(`${e.minute}'`).width);
    });
    gutter += 6;

    // Width is driven by the widest thing in the pill, so nothing is clipped.
    ctx.font = `500 12px ${chipFontFamily()}`;
    let cellW = 0;
    chain.entries.forEach((e) => {
      cellW = Math.max(cellW, gutter + ctx.measureText(e.name).width);
    });
    cellW += 10;
    ctx.font = `700 14px ${discFontFamily()}`;
    const nameW = ctx.measureText(chain.starterName ?? '-').width;
    ctx.font = `700 12px ${chipFontFamily()}`;
    const tagW = ctx.measureText(chain.positionLabel).width;
    const headW = tagW + 6 + nameW;
    const pillW = Math.max(headW + CHAIN_PAD * 2, cols * cellW + CHAIN_PAD * 2);
    const pillH = CHAIN_PAD * 2 + (1 + rows) * CHAIN_ROW_H;

    // Keep the whole pill on the canvas - the formation reaches relX 0.25/0.75
    // and relY 0.92, so an unclamped pill leaves the pitch at the edges.
    const cx = Math.min(Math.max(chain.relX * W, pillW / 2 + 2), W - pillW / 2 - 2);
    const cy = Math.min(Math.max(chain.relY * H, pillH / 2 + 2), H - pillH / 2 - 2);
    const x = cx - pillW / 2;
    const y = cy - pillH / 2;

    // A soft shadow, because grass is a busy, mid-tone texture and a flat dark
    // panel on it reads as smudge rather than card.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    roundedRectPath(ctx, x, y, pillW, pillH, 6);
    ctx.fillStyle = settled ? 'rgba(15, 23, 42, 0.62)' : 'rgba(15, 23, 42, 0.88)';
    ctx.fill();
    ctx.restore();

    // Only a pill with something to say gets an edge.
    if (!settled) {
      roundedRectPath(ctx, x, y, pillW, pillH, 6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.stroke();
    }

    // Header: the position, then who starts it. The name outranks the tag -
    // the coach knows the shape, they are looking for the person.
    const headY = y + CHAIN_PAD + CHAIN_ROW_H / 2;
    ctx.textAlign = 'left';
    ctx.font = `700 12px ${chipFontFamily()}`;
    ctx.fillStyle = settled ? 'rgba(148, 163, 184, 0.65)' : 'rgba(148, 163, 184, 0.95)';
    ctx.fillText(chain.positionLabel, x + CHAIN_PAD, headY);
    ctx.font = `700 14px ${discFontFamily()}`;
    ctx.fillStyle = chain.starterName
      ? settled
        ? 'rgba(255, 255, 255, 0.72)'
        : '#FFFFFF'
      : 'rgba(148, 163, 184, 0.6)';
    ctx.fillText(chain.starterName ?? '-', x + CHAIN_PAD + tagW + 6, headY);

    if (settled) {
      return;
    }

    // Hairline under the header, echoing the planner's divided pill.
    const divY = y + CHAIN_PAD + CHAIN_ROW_H;
    ctx.beginPath();
    ctx.moveTo(x + CHAIN_PAD, divY);
    ctx.lineTo(x + pillW - CHAIN_PAD, divY);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.stroke();

    chain.entries.forEach((entry, i) => {
      const col = cols === 1 ? 0 : i % cols;
      const row = cols === 1 ? i : Math.floor(i / cols);
      const ex = x + CHAIN_PAD + col * cellW;
      const ey = divY + CHAIN_ROW_H / 2 + row * CHAIN_ROW_H;
      const hue = waveColor(entry.waveIndex);

      // A wash of the wave's hue behind the row. The tag alone is a small mark
      // to find across eight pills; a tinted band is visible without being
      // read, which is what "who goes on together" needs to be.
      //
      // Width comes from the PILL, not the cell. The pill is as wide as the
      // header when a starter's name is longer than any entry, and sizing the
      // band off cellW left a dark strip at the right edge - a row highlight
      // that stops short reads as a half-filled progress bar.
      const bandW = cols === 1 ? pillW - CHAIN_PAD * 2 + 4 : cellW - 6;
      roundedRectPath(ctx, ex - 2, ey - CHAIN_ROW_H / 2 + 1, bandW, CHAIN_ROW_H - 2, 3);
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = hue;
      ctx.fill();
      ctx.globalAlpha = 1;

      // The minute carries the colour: on the touchline you scan for WHEN.
      // Right-aligned in its gutter so 5' and 30' share an edge.
      ctx.font = `700 12px ${chipFontFamily()}`;
      ctx.fillStyle = hue;
      ctx.textAlign = 'right';
      ctx.fillText(`${entry.minute}'`, ex + gutter - 6, ey);
      ctx.textAlign = 'left';
      ctx.font = `500 12px ${chipFontFamily()}`;
      ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
      ctx.fillText(entry.name, ex + gutter, ey);
    });
  });

  ctx.restore();
}

/** What a drop near the formation points should do. Exported for tests. */
export type SnapAction =
  | { type: 'swap'; occupantId: string }
  | { type: 'snap'; point: Point }
  | { type: 'none' };

/**
 * Pure decision core of maybeSnapPlayerToFormation (review #739: the
 * swap-on-drop branch needed direct test coverage). Nearest snap point within
 * threshold: free -> snap; held by exactly ONE other disc -> swap with it
 * (the keeper-spot handover case); ambiguous/beyond threshold -> none.
 */
export function resolveSnapAction(
  snapPoints: Point[] | undefined,
  players: Player[],
  playerId: string,
  currentRelPos: Point | null,
  rectWidth: number,
  rectHeight: number,
  /**
   * Where a snap point is DRAWN, in pixels. Sub-slot points are drawn on the
   * planned-subs rail, away from their stored coordinates, and the drop must
   * snap to what the coach sees. Default: the stored position.
   */
  toScreen?: (point: Point) => { x: number; y: number },
): SnapAction {
  if (!snapPoints || snapPoints.length === 0 || !currentRelPos) return { type: 'none' };
  if (!Number.isFinite(rectWidth) || !Number.isFinite(rectHeight) || rectWidth <= 0 || rectHeight <= 0) {
    return { type: 'none' };
  }

  let bestPoint: Point | null = null;
  let bestDistSq = Infinity;
  const dropX = currentRelPos.relX * rectWidth;
  const dropY = currentRelPos.relY * rectHeight;
  for (const point of snapPoints) {
    const at = toScreen ? toScreen(point) : { x: point.relX * rectWidth, y: point.relY * rectHeight };
    const dxPx = dropX - at.x;
    const dyPx = dropY - at.y;
    const distSq = dxPx * dxPx + dyPx * dyPx;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestPoint = point;
    }
  }
  if (!bestPoint || bestDistSq > FORMATION_SNAP_THRESHOLD_SQ) return { type: 'none' };
  const snapTarget = bestPoint;

  const occupants = players.filter(p => {
    if (p.id === playerId) return false;
    if (typeof p.relX !== 'number' || typeof p.relY !== 'number' || !Number.isFinite(p.relX) || !Number.isFinite(p.relY)) return false;
    const dxPx = (p.relX - snapTarget.relX) * rectWidth;
    const dyPx = (p.relY - snapTarget.relY) * rectHeight;
    return dxPx * dxPx + dyPx * dyPx <= FIELD_PLAYER_RADIUS * FIELD_PLAYER_RADIUS;
  });

  if (occupants.length === 1) return { type: 'swap', occupantId: occupants[0].id };
  if (occupants.length > 1) return { type: 'none' };
  return { type: 'snap', point: snapTarget };
}
export const SUB_SLOT_OCCUPATION_THRESHOLD = 0.04; // relative coordinate tolerance for slot occupation check

// Visual styling constants for formation positions and sub slots
const FIELD_POSITION_ALPHA_EMPTY = 0.35;
const FIELD_POSITION_ALPHA_OCCUPIED = 0.15;
// Sideline players: a custom colour is desaturated, the default white disc softened.
const SIDELINE_DESATURATION_PERCENT = 60;

/**
 * Check if a position is occupied by any player
 * @exported for testing
 */
export function isPositionOccupied(
  players: Player[],
  targetX: number,
  targetY: number,
  threshold: number = SUB_SLOT_OCCUPATION_THRESHOLD
): boolean {
  return players.some(p =>
    p.relX !== undefined && p.relY !== undefined &&
    Math.abs(p.relX - targetX) < threshold &&
    Math.abs(p.relY - targetY) < threshold
  );
}

/**
 * LRU (Least Recently Used) cache for background canvases.
 * Prevents memory leak from unbounded cache growth during window resizing.
 * Max size of 10 entries should cover typical use (normal + tactics for 5 resolutions).
 */
const MAX_CACHE_SIZE = 10;
const backgroundCache: Map<string, HTMLCanvasElement> = new Map();

// Generation counter folded into every cache key. Android can silently discard
// the backing store of an offscreen canvas while the page is hidden - the map
// then holds a same-size but BLANK bitmap, and blitting it paints nothing (the
// owner-reported "flat green field, no lines"). Bumping the generation on every
// hide/show transition makes all pre-background entries unreachable, so the
// first draw after resume must re-render the background from scratch. Race-free
// versus an in-flight draw (unlike clear(), which an old-key write could undo).
let backgroundCacheGeneration = 0;
export const invalidateFieldBackgroundCache = (): void => {
  backgroundCacheGeneration += 1;
  backgroundCache.clear();
};

/**
 * Gets an item from the LRU cache, moving it to "most recently used" position.
 */
const getFromCache = (key: string): HTMLCanvasElement | undefined => {
  if (!backgroundCache.has(key)) return undefined;

  // Move to end (most recently used) by deleting and re-adding
  const value = backgroundCache.get(key)!;
  backgroundCache.delete(key);
  backgroundCache.set(key, value);
  return value;
};

/**
 * Adds an item to the LRU cache, evicting oldest entry if at max size.
 */
const addToCache = (key: string, value: HTMLCanvasElement): void => {
  // If key exists, delete it first (will be re-added at end)
  if (backgroundCache.has(key)) {
    backgroundCache.delete(key);
  }

  // Evict oldest entry if at max size
  if (backgroundCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = backgroundCache.keys().next().value;
    if (oldestKey !== undefined) {
      backgroundCache.delete(oldestKey);
    }
  }

  backgroundCache.set(key, value);
};

// Removed: createNoisePattern helper - now imported from @/utils/fieldDrawing

// Removed: formatTime helper - unused function (time display not implemented in SoccerField component)

// Helper function to create and cache the field background
const createFieldBackgroundCached = (
  context: CanvasRenderingContext2D,
  W: number,
  H: number,
  isTacticsView: boolean,
  gameType: GameType = 'soccer',
  dpr: number = 1
): HTMLCanvasElement => {
  // dpr is part of the key: the cache holds a device-resolution bitmap, so a
  // DPR change (e.g. moving to an external display) must miss and re-render.
  const cacheKey = `g${backgroundCacheGeneration}-${W}x${H}@${dpr}-${isTacticsView ? 'tactics' : 'normal'}-${gameType}`;

  // Check if we have a cached version (uses LRU cache)
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  // Get field configuration for the game type
  const fieldConfig = getFieldConfig(gameType);

  // Create offscreen canvas for background at PHYSICAL resolution so the field
  // lines stay crisp - a CSS-pixel (1x) cache blitted onto the DPR-scaled main
  // canvas gets upscaled and looks smudgy on 2x/3x phone screens.
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = W * dpr;
  offscreenCanvas.height = H * dpr;
  const offscreenCtx = offscreenCanvas.getContext('2d');
  if (!offscreenCtx) throw new Error('Could not get offscreen context');
  // Draw in CSS-pixel coordinates; the scale maps them to physical pixels.
  offscreenCtx.scale(dpr, dpr);

  // Draw field background (surface color, texture, lighting)
  drawFieldBackground(offscreenCtx, W, H, fieldConfig);

  // Draw field markings (lines, areas, spots)
  drawFieldMarkings(offscreenCtx, W, H, fieldConfig);

  // Cache the result using LRU cache (prevents memory leak from unbounded growth)
  addToCache(cacheKey, offscreenCanvas);
  return offscreenCanvas;
};

const SoccerFieldInner = forwardRef<SoccerFieldHandle, SoccerFieldProps>(({
  players,
  opponents,
  drawings,
  showPlayerNames,
  showPositionLabels = true,
  gameType = 'soccer',
  onPlayerDrop,
  onPlayerMove,
  onPlayerMoveEnd,
  onDrawingStart,
  onDrawingAddPoint,
  onDrawingEnd,
  onPlayerRemove,
  onPlayersSwap,
  onOpponentMove,
  onOpponentMoveEnd,
  onOpponentRemove,
  draggingPlayerFromBarInfo,
  onPlayerDropViaTouch,
  onPlayerDragCancelViaTouch,
  // Removed: timeElapsedInSeconds - unused prop (time display not implemented in SoccerField component)
  isTacticsBoardView,
  tacticalDiscs,
  onTacticalDiscMove,
  onTacticalDiscMoveEnd,
  onTacticalDiscRemove,
  onToggleTacticalDiscType,
  tacticalBallPosition,
  onTacticalBallMove,
  onTacticalBallMoveEnd,
  isDrawingEnabled,
  formationSnapPoints,
  subSlots,
  plannedGhosts,
  plannedChains,
}, ref) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDraggingPlayer, setIsDraggingPlayer] = useState<boolean>(false);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [isDraggingOpponent, setIsDraggingOpponent] = useState<boolean>(false);
  const [draggingOpponentId, setDraggingOpponentId] = useState<string | null>(null);
  const [isDraggingTacticalDisc, setIsDraggingTacticalDisc] = useState<boolean>(false);
  const [draggingTacticalDiscId, setDraggingTacticalDiscId] = useState<string | null>(null);
  const [isDraggingBall, setIsDraggingBall] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [activeTouchId, setActiveTouchId] = useState<number | null>(null);
  const [lastTapInfo, setLastTapInfo] = useState<{ time: number; x: number; y: number; targetId: string | null; targetType: 'player' | 'opponent' | 'tactical' | 'ball' | 'emptyPosition' | null } | null>(null);
  const [selectedPlayerForSwapId, setSelectedPlayerForSwapId] = useState<string | null>(null);
  const [ballImage, setBallImage] = useState<HTMLImageElement | null>(null);

  const touchStartTargetRef = useRef<{
    clientX: number;
    clientY: number;
    targetId: string | null;
    targetType: 'player' | 'opponent' | 'tactical' | 'ball' | 'emptyPosition' | null;
    emptyPositionCoords?: { relX: number; relY: number };
  } | null>(null);
  const touchExceededTapThresholdRef = useRef<boolean>(false);
  const suppressTapActionRef = useRef<boolean>(false);
  const lastPlayerDragRelPosRef = useRef<Point | null>(null);
  // Where the dragged disc STARTED - needed so a drop onto an occupied snap
  // point can SWAP (the occupant goes to the origin, not to the drop point).
  const playerDragOriginRef = useRef<Point | null>(null);
  // Latest players list for identity-free handlers (adding `players` to the
  // touch handlers' deps would re-register native listeners every drag frame).
  const playersListRef = useRef(players);
  useEffect(() => {
    playersListRef.current = players;
  }, [players]);
  const touchDraggingPlayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = '/ball.png';
    img.onload = () => setBallImage(img);
  }, []);

  useEffect(() => {
    if (isTacticsBoardView) {
      setSelectedPlayerForSwapId(null);
    }
  }, [isTacticsBoardView]);

  useEffect(() => {
    if (!selectedPlayerForSwapId) return;
    if (players.some(p => p.id === selectedPlayerForSwapId)) return;
    setSelectedPlayerForSwapId(null);
  }, [players, selectedPlayerForSwapId]);

  // Debug: Log when formationSnapPoints changes
  useEffect(() => {
    logger.debug('[SoccerField] formationSnapPoints updated:', {
      count: formationSnapPoints?.length ?? 0,
      points: formationSnapPoints
    });
  }, [formationSnapPoints]);

  /**
   * Snap a dropped disc onto the nearest free formation point - or, when that
   * point is held by exactly one other disc, SWAP with it (owner field-glitch
   * report: dropping on the keeper spot used to silently refuse because the
   * old goalie "occupied" it - no snap, no orange handover). Returns true when
   * the drop was fully handled as a swap (the caller must NOT fire its own
   * move-end - the swap emits one for BOTH discs).
   */
  /**
   * Drop handler over resolveSnapAction (the pure, tested core): snap onto a
   * free point, or SWAP with a single occupant (owner field-glitch report -
   * the keeper spot used to silently refuse while the old goalie held it).
   * Returns true when handled as a swap (caller must not fire its own
   * move-end; the swap emits one for BOTH discs).
   */
  const maybeSnapPlayerToFormation = useCallback((playerId: string, currentRelPos: Point | null): boolean => {
    if (isTacticsBoardView) return false;
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();

    const rail = computeSubRail(subSlots, rect.width, rect.height);
    const action = resolveSnapAction(
      formationSnapPoints, players, playerId, currentRelPos, rect.width, rect.height,
      (point) => {
        const i = subRailIndexFor(point.relX, point.relY, subSlots);
        return i >= 0 && rail[i] ? rail[i] : { x: point.relX * rect.width, y: point.relY * rect.height };
      },
    );
    if (action.type === 'none') return false;

    if (action.type === 'swap') {
      const origin = playerDragOriginRef.current;
      const occupant = players.find(p => p.id === action.occupantId);
      if (origin && occupant && typeof occupant.relX === 'number' && typeof occupant.relY === 'number') {
        logger.debug('[Snap] Occupied snap point - swapping', { playerId, occupantId: occupant.id });
        onPlayerMove(occupant.id, origin.relX, origin.relY);
        onPlayerMove(playerId, occupant.relX, occupant.relY);
        onPlayerMoveEnd([playerId, occupant.id]);
        lastPlayerDragRelPosRef.current = null;
        playerDragOriginRef.current = null;
        return true;
      }
      return false;
    }

    logger.debug('[Snap] Snapping player to formation position', { playerId, from: currentRelPos, to: action.point });
    onPlayerMove(playerId, action.point.relX, action.point.relY);
    lastPlayerDragRelPosRef.current = action.point;
    return false;
  }, [formationSnapPoints, subSlots, isTacticsBoardView, onPlayerMove, onPlayerMoveEnd, players]);

  /**
   * Renders the field at high resolution for export.
   *
   * @remarks
   * In tactical view mode, only tactical elements (discs, ball, drawings) are rendered.
   * Regular player/opponent discs are excluded to match the on-screen tactical display.
   * The ball is rendered with circular clipping to mask the white background of the PNG.
   *
   * @param exportScale - Resolution multiplier (default: 2 for retina quality)
   * @returns High-resolution canvas element, or null if canvas unavailable
   */
  const renderForExport = useCallback((exportScale: number = 2): HTMLCanvasElement | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const W = rect.width * exportScale;
    const H = rect.height * exportScale;

    if (W <= 0 || H <= 0) return null;

    // Create temporary high-res canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = W;
    exportCanvas.height = H;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return null;

    // Get field configuration for the current game type
    const fieldConfig = getFieldConfig(gameType);

    // Render background at full export resolution (no cache)
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = W;
    bgCanvas.height = H;
    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) return null;

    // Draw field background using config-based utilities
    drawFieldBackground(bgCtx, W, H, fieldConfig);

    // Draw field markings using config-based utilities (handles both soccer and futsal)
    drawFieldMarkings(bgCtx, W, H, fieldConfig, exportScale);

    // Draw background to export canvas
    ctx.drawImage(bgCanvas, 0, 0);

    // Scale factor for elements
    const scale = exportScale;
    const playerRadius = FIELD_PLAYER_RADIUS * scale;
    const opponentRadius = FIELD_PLAYER_RADIUS * 0.9 * scale;

    // Draw drawings
    ctx.strokeStyle = '#FB923C';
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawings.forEach(path => {
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(path[0].relX * W, path[0].relY * H);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].relX * W, path[i].relY * H);
      }
      ctx.stroke();
    });

    // Draw opponents (if not tactics board view) with polished enamel effect
    if (!isTacticsBoardView) {
      opponents.forEach(opponent => {
        if (typeof opponent.relX !== 'number' || typeof opponent.relY !== 'number') return;
        const absX = opponent.relX * W;
        const absY = opponent.relY * H;

        const baseColor = tinycolor('#DC2626'); // Opponent Red

        // 1. Base Disc Color
        ctx.beginPath();
        ctx.arc(absX, absY, opponentRadius, 0, Math.PI * 2);
        ctx.fillStyle = baseColor.toString();
        ctx.fill();

        // 2. Create clipping mask for gradient effects
        ctx.save();
        ctx.beginPath();
        ctx.arc(absX, absY, opponentRadius, 0, Math.PI * 2);
        ctx.clip();

        // 3. Top-left Highlight (Sheen)
        const highlightGradient = ctx.createRadialGradient(
          absX - opponentRadius * 0.3, absY - opponentRadius * 0.3, 0,
          absX - opponentRadius * 0.3, absY - opponentRadius * 0.3, opponentRadius * 1.2
        );
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlightGradient;
        ctx.fillRect(absX - opponentRadius, absY - opponentRadius, opponentRadius * 2, opponentRadius * 2);

        // 4. Bottom-right Inner Shadow for depth
        const shadowGradient = ctx.createRadialGradient(
          absX + opponentRadius * 0.4, absY + opponentRadius * 0.4, 0,
          absX + opponentRadius * 0.4, absY + opponentRadius * 0.4, opponentRadius * 1.5
        );
        shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
        shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadowGradient;
        ctx.fillRect(absX - opponentRadius, absY - opponentRadius, opponentRadius * 2, opponentRadius * 2);

        // 5. Restore and add white border
        ctx.restore();
        ctx.beginPath();
        ctx.arc(absX, absY, opponentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();
      });
    }

    // The planned-subs rail, laid out exactly as on screen (scaled).
    const scene = buildRailScene(players, subSlots, W, H, scale, playerRadius);

    // Empty rail slots (an occupied one is covered by its disc).
    if (!isTacticsBoardView && subSlots && subSlots.length > 0) {
      subSlots.forEach((slot, i) => {
        const spot = scene.rail[i];
        if (!spot || scene.filled.has(i)) return;
        paintEmptyRailSlot(ctx, spot, showPositionLabels ? t(`positions.${slot.positionLabel}`) : null, scale);
      });
    }

    // Planned-sub ghosts: drawn BEFORE the players so a real disc always wins
    // the pixels, and skipped entirely on the tactics board, which is about
    // shapes rather than the squad.
    if (!isTacticsBoardView && plannedGhosts && plannedGhosts.length > 0) {
      drawPlannedGhosts(ctx, plannedGhosts, W, scene.coords, placedDiscs(players, scene.player));
    }
    if (!isTacticsBoardView && plannedChains && plannedChains.length > 0) {
      drawPlannedChains(ctx, plannedChains, W, H);
    }

    // Draw players (only in non-tactical view) - same paint as the live field.
    if (!isTacticsBoardView) {
      const chips: PendingChip[] = [];
      players.forEach(player => {
        if (typeof player.relX !== 'number' || typeof player.relY !== 'number') return;
        const spot = scene.player(player);
        const onRail = spot.railIndex >= 0;

        // Sideline players read a touch quieter than the eleven.
        const isSidelinePlayer = isSidelinePosition(player.relX);

        const nameColor = paintPlayerDisc(ctx, spot.x, spot.y, spot.r, scale, {
          isGoalie: player.isGoalie,
          color: player.color,
          sideline: isSidelinePlayer,
          comingIn: onRail,
        });

        const chip = positionChipFor(player, spot, onRail ? subSlots?.[spot.railIndex] : undefined, scale, showPositionLabels, formationSnapPoints, t);
        if (chip) chips.push(chip);

        if (showPlayerNames) {
          // On the rail the chip sits on the disc's lower half: lift the name clear of it.
          const nameY = onRail && chip ? spot.y - RAIL_NAME_LIFT * scale : spot.y;
          paintDiscName(ctx, player.nickname || player.name || '', spot.x, nameY, spot.r, scale, nameColor, onRail ? 13 : 15);
        }
      });
      chips.forEach((chip) => paintPositionChip(ctx, chip.label, chip.x, chip.y, scale, 'center', chip.size));
    }

    // Draw ball (only in tactics board view) with circular clipping to remove white background
    if (isTacticsBoardView && tacticalBallPosition && ballImage) {
      const ballRadius = PLAYER_RADIUS * 0.6 * scale;
      const bx = tacticalBallPosition.relX * W;
      const by = tacticalBallPosition.relY * H;

      // Save context for clipping
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 5 * scale;
      ctx.shadowOffsetX = 2 * scale;
      ctx.shadowOffsetY = 3 * scale;

      // Create circular clipping path to mask out white background
      ctx.beginPath();
      ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Draw image slightly larger to cut off edge artifacts
      const imageSize = ballRadius * BALL_IMAGE_OVERSCAN;
      ctx.drawImage(ballImage, bx - imageSize / 2, by - imageSize / 2, imageSize, imageSize);

      // Restore from clipping mask
      ctx.restore();

      // Draw border on top to hide any artifacts
      ctx.beginPath();
      ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1 * scale;
      ctx.stroke();
    }

    // Draw tactical discs (matches on-screen display with shadow effect)
    if (isTacticsBoardView) {
      const tacticalDiscRadius = PLAYER_RADIUS * 0.9 * scale;
      tacticalDiscs.forEach(disc => {
        if (typeof disc.relX !== 'number' || typeof disc.relY !== 'number') return;
        const absX = disc.relX * W;
        const absY = disc.relY * H;

        paintTacticalDisc(ctx, absX, absY, tacticalDiscRadius, scale, disc.type);
      });
    }

    return exportCanvas;
  }, [players, opponents, drawings, tacticalDiscs, tacticalBallPosition, ballImage, isTacticsBoardView, showPlayerNames, showPositionLabels, gameType, formationSnapPoints, subSlots, plannedGhosts, plannedChains, t]);

  // Expose canvas via ref for export functionality
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    renderForExport,
  }), [renderForExport]);

  // --- Drawing Logic ---
  // Latest draw() reachable from stable listeners/timers (identity-free), so a
  // pending resume repaint can never be cancelled by a deps-driven cleanup.
  const drawRef = useRef<() => void>(() => {});
  // Bounded retry when a draw lands during transient zero-size layout (the
  // documented 100dvh glitch after returning from background): bailing with no
  // retry left the field permanently blank when layout settled back to the SAME
  // size (ResizeObserver then never fires). ~20 frames covers the settle.
  const zeroSizeRetriesRef = useRef(0);
  const MAX_ZERO_SIZE_RETRIES = 20;
  // Resume path requests an unconditional backing-store reallocation: Android
  // can return the MAIN canvas blank from hibernation with its size unchanged,
  // and only re-assigning width/height reliably re-creates the store.
  const forceCanvasReallocRef = useRef(false);

  const draw = useCallback(() => { 
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    // --- High-DPI Scaling --- 
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect(); 
    const cssWidth = rect.width;
    const cssHeight = rect.height;

    // Set the canvas buffer size to match the physical pixels. The resume path
    // forces the assignment even at unchanged size - see forceCanvasReallocRef.
    if (forceCanvasReallocRef.current || canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      forceCanvasReallocRef.current = false;
    }

    // Reset transform to default state before applying new scaling
    context.resetTransform();
    // Scale the context to draw in CSS pixels
    context.scale(dpr, dpr);
    // --- End High-DPI Scaling ---

    // Now use cssWidth and cssHeight for drawing calculations (W/H equivalent)
    const W = cssWidth;
    const H = cssHeight;

    // *** SAFETY CHECK: Ensure calculated CSS dimensions are valid ***
    if (W <= 0 || H <= 0 || !Number.isFinite(W) || !Number.isFinite(H)) {
      if (typeof jest === 'undefined') {
        logger.warn("Canvas dimensions are invalid, retrying draw:", { W, H });
      }
      // Transient layout (e.g. dvh settling after resume): retry a bounded
      // number of frames instead of giving up - if the final size equals the
      // pre-background size, no resize event will ever re-trigger us.
      if (zeroSizeRetriesRef.current < MAX_ZERO_SIZE_RETRIES && typeof requestAnimationFrame === 'function') {
        zeroSizeRetriesRef.current += 1;
        requestAnimationFrame(() => drawRef.current());
      }
      return;
    }
    zeroSizeRetriesRef.current = 0;

    // --- Draw Cached Background ---
    // Use prerendered background for performance
    // Background failure degrades gracefully (review of the flat-field bug):
    // a throw here used to abort the WHOLE draw via the ResizeObserver's
    // catch - discs, lines, everything. Now the frame renders without the
    // background instead.
    let backgroundCanvas: HTMLCanvasElement | null = null;
    try {
      backgroundCanvas = createFieldBackgroundCached(context, W, H, isTacticsBoardView, gameType, dpr);
    } catch (error) {
      logger.error('[SoccerField] Background render failed - drawing without it:', error);
    }
    if (backgroundCanvas) {
      // The cache is a physical-resolution bitmap - blit it into the CSS-pixel
      // box (drawImage honours the current dpr scale) so it maps 1:1 to device
      // pixels and the lines render crisp.
      context.drawImage(backgroundCanvas, 0, 0, W, H);
    }

    // --- Draw Tactical Mode Overlays ---
    if (isTacticsBoardView) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      context.lineWidth = 2;
      context.strokeRect(0, 0, W, H);

      // Draw Tactical Grid Overlay
      context.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      context.lineWidth = 1;
      const gridSpacing = 40;

      // Draw vertical lines
      for (let x = gridSpacing; x < W; x += gridSpacing) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, H);
        context.stroke();
      }

      // Draw horizontal lines
      for (let y = gridSpacing; y < H; y += gridSpacing) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(W, y);
        context.stroke();
      }
    }

    // --- Draw User Drawings --- (lineWidth only change needed)
    context.strokeStyle = '#FB923C';
    context.lineWidth = 3; // No DPR scaling
    context.lineCap = 'round';
    context.lineJoin = 'round';
    drawings.forEach(path => {
      if (path.length < 2) return;
      
      // Calculate absolute positions using CSS dimensions (W/H)
      const startX = path[0].relX * W;
      const startY = path[0].relY * H;
      if (!Number.isFinite(startX) || !Number.isFinite(startY)) {
        logger.warn("Skipping drawing path due to non-finite start point", path[0]);
        return; 
      }

      context.beginPath();
      context.moveTo(startX, startY);
      
      for (let i = 1; i < path.length; i++) {
        const pointX = path[i].relX * W;
        const pointY = path[i].relY * H;
        if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) {
          logger.warn("Skipping drawing segment due to non-finite point", path[i]);
          context.stroke(); 
          context.beginPath();
          context.moveTo(pointX, pointY);
          continue;
        }
        context.lineTo(pointX, pointY);
      }
      context.stroke();
    });

    // --- Draw Opponents --- (No manual scaling needed)
    context.lineWidth = 1.5;
    const opponentRadius = FIELD_PLAYER_RADIUS * 0.9;
    if (!isTacticsBoardView) {
    opponents.forEach(opponent => {
      if (typeof opponent.relX !== 'number' || typeof opponent.relY !== 'number') {
        logger.warn("Skipping opponent due to invalid relX/relY", opponent);
        return;
      }
      // Calculate absolute positions using CSS dimensions (W/H)
      const absX = opponent.relX * W;
      const absY = opponent.relY * H;
      if (!Number.isFinite(absX) || !Number.isFinite(absY)) {
        logger.warn("Skipping opponent due to non-finite calculated position", { opponent, absX, absY });
        return;
      }

      const baseColor = tinycolor('#DC2626'); // Opponent Red

      // 1. Base Disc Color
      context.beginPath();
      context.arc(absX, absY, opponentRadius, 0, Math.PI * 2);
      context.fillStyle = baseColor.toString();
      context.fill();

      // 2. Create a clipping mask
      context.save();
      context.beginPath();
      context.arc(absX, absY, opponentRadius, 0, Math.PI * 2);
      context.clip();

      // 3. Top-left Highlight (Sheen)
      const highlightGradient = context.createRadialGradient(
        absX - opponentRadius * 0.3, absY - opponentRadius * 0.3, 0,
        absX - opponentRadius * 0.3, absY - opponentRadius * 0.3, opponentRadius * 1.2
      );
      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
      highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = highlightGradient;
      context.fillRect(absX - opponentRadius, absY - opponentRadius, opponentRadius * 2, opponentRadius * 2);

      // 4. Bottom-right Inner Shadow for depth
      const shadowGradient = context.createRadialGradient(
        absX + opponentRadius * 0.4, absY + opponentRadius * 0.4, 0,
        absX + opponentRadius * 0.4, absY + opponentRadius * 0.4, opponentRadius * 1.5
      );
      shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
      shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = shadowGradient;
      context.fillRect(absX - opponentRadius, absY - opponentRadius, opponentRadius * 2, opponentRadius * 2);
      
      // 5. Restore and add border
      context.restore();
      context.beginPath();
      context.arc(absX, absY, opponentRadius, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      context.lineWidth = 1.5;
      context.stroke();
    });
    }

    // --- Draw Tactical Discs ---
    if (isTacticsBoardView) {
      const tacticalDiscRadius = PLAYER_RADIUS * 0.9;
      tacticalDiscs.forEach(disc => {
        const absX = disc.relX * W;
        const absY = disc.relY * H;
        if (!Number.isFinite(absX) || !Number.isFinite(absY)) {
          logger.warn("Skipping tactical disc due to non-finite calculated position", { disc, absX, absY });
          return;
        }

        paintTacticalDisc(context, absX, absY, tacticalDiscRadius, 1, disc.type);
      });
    }

    // --- Draw Tactical Ball ---
    if (isTacticsBoardView && tacticalBallPosition && ballImage) {
      const ballRadius = PLAYER_RADIUS * 0.6; // Increased size
      const absX = tacticalBallPosition.relX * W;
      const absY = tacticalBallPosition.relY * H;
      
      context.save();
      context.shadowColor = 'rgba(0, 0, 0, 0.4)';
      context.shadowBlur = 5;
      context.shadowOffsetX = 2;
      context.shadowOffsetY = 3;

      // Create a circular clipping path
      context.beginPath();
      context.arc(absX, absY, ballRadius, 0, Math.PI * 2);
      context.closePath();
      context.clip();

      // Slightly enlarge the image to cut off any edge artifacts
      const imageSize = ballRadius * BALL_IMAGE_OVERSCAN;
      context.drawImage(ballImage, absX - imageSize / 2, absY - imageSize / 2, imageSize, imageSize);
      
      // Restore from clipping mask before drawing the border
      context.restore();

      // Draw a clean border on top to hide any artifacts
      context.beginPath();
      context.arc(absX, absY, ballRadius, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      context.lineWidth = 1;
      context.stroke();
    }

    // --- Draw Field Formation Positions (solid circles where players snap) ---
    if (formationSnapPoints && formationSnapPoints.length > 0 && !isTacticsBoardView) {
      const positionRadius = FIELD_PLAYER_RADIUS;

      formationSnapPoints.forEach(point => {
        // Skip GK position (at bottom) and sideline positions
        if (point.relY > 0.9 || isSidelinePosition(point.relX)) return;

        const absX = discCenterX(point.relX, W, positionRadius);
        const absY = point.relY * H;

        // Check if position is occupied by a player
        const isOccupied = isPositionOccupied(players, point.relX, point.relY);

        context.globalAlpha = isOccupied ? FIELD_POSITION_ALPHA_OCCUPIED : FIELD_POSITION_ALPHA_EMPTY;

        // Solid circle outline (not dashed)
        context.beginPath();
        context.arc(absX, absY, positionRadius, 0, Math.PI * 2);
        context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        context.lineWidth = 1.5;
        context.stroke();

        context.globalAlpha = 1.0;
      });
    }

    // --- The planned-subs rail (see computeSubRail) ---
    // A disc being dragged is drawn under the finger, never pulled onto the
    // rail mid-drag; the drop snaps it into a slot if it lands on one.
    const scene = buildRailScene(players, subSlots, W, H, 1, FIELD_PLAYER_RADIUS, draggingPlayerId);

    // Empty rail slots, before the players. An occupied slot is not drawn -
    // the disc waiting in it is the same size and covers it.
    if (subSlots && subSlots.length > 0 && !isTacticsBoardView) {
      subSlots.forEach((slot, i) => {
        const spot = scene.rail[i];
        if (!spot || scene.filled.has(i)) return;
        paintEmptyRailSlot(context, spot, showPositionLabels ? t(`positions.${slot.positionLabel}`) : null, 1);
      });
    }

    // --- Draw Planned Ghosts ---
    // Faint name markers on rail slots a planned sub enters later but no
    // disc is waiting at. Drawn AFTER the empty slots (so the slot ring stays
    // underneath) and BEFORE the players, so a real disc always wins.
    if (!isTacticsBoardView && plannedGhosts && plannedGhosts.length > 0) {
      drawPlannedGhosts(context, plannedGhosts, W, scene.coords, placedDiscs(players, scene.player));
    }
    if (!isTacticsBoardView && plannedChains && plannedChains.length > 0) {
      drawPlannedChains(context, plannedChains, W, H);
    }

    // --- Draw Players ---
    if (!isTacticsBoardView) {
    // Every chip is painted after every disc, so the next disc down cannot hide it.
    const chips: PendingChip[] = [];
    players.forEach(player => {
      if (typeof player.relX !== 'number' || typeof player.relY !== 'number') {
        return;
      }
      const spot = scene.player(player);
      if (!Number.isFinite(spot.x) || !Number.isFinite(spot.y)) {
        logger.warn("Skipping player due to non-finite calculated position", { playerId: player.id, absX: spot.x, absY: spot.y });
        return;
      }
      const onRail = spot.railIndex >= 0;

      // Sideline players read a touch quieter than the eleven.
      const isSidelinePlayer = isSidelinePosition(player.relX);

      const nameColor = paintPlayerDisc(context, spot.x, spot.y, spot.r, 1, {
        isGoalie: player.isGoalie,
        color: player.color,
        sideline: isSidelinePlayer,
        comingIn: onRail,
      });

      // Selection ring for swap mode: amber means "selected".
      if (selectedPlayerForSwapId === player.id) {
        context.save();
        context.beginPath();
        context.arc(spot.x, spot.y, spot.r + 4, 0, Math.PI * 2);
        context.shadowColor = 'rgba(255, 178, 36, 0.6)';
        context.shadowBlur = 8;
        context.strokeStyle = DISC_ACTION;
        context.lineWidth = 3;
        context.stroke();
        context.restore();
      }

      if (showPlayerNames) {
        const chip = positionChipFor(player, spot, onRail ? subSlots?.[spot.railIndex] : undefined, 1, showPositionLabels, formationSnapPoints, t);
        if (chip) chips.push(chip);
        // Rail discs are smaller: their names run a size smaller too (~14px),
        // lifted clear of the chip on the disc's lower half.
        const nameY = onRail && chip ? spot.y - RAIL_NAME_LIFT : spot.y;
        paintDiscName(context, player.nickname || player.name, spot.x, nameY, spot.r, 1, nameColor, onRail ? 13 : 15);
      }

    });
    chips.forEach((chip) => paintPositionChip(context, chip.label, chip.x, chip.y, 1, 'center', chip.size));
    }

    // --- End of draw ---
  }, [players, opponents, drawings, showPlayerNames, showPositionLabels, isTacticsBoardView, tacticalDiscs, tacticalBallPosition, ballImage, gameType, selectedPlayerForSwapId, draggingPlayerId, subSlots, t, formationSnapPoints, plannedGhosts, plannedChains]);

  // Add the new ResizeObserver effect
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement; // Observe the parent which dictates size
    if (!parent || typeof ResizeObserver === 'undefined') {
        // Fallback for test environment or browsers without ResizeObserver
        if (typeof jest === 'undefined') {
          logger.warn('ResizeObserver not supported or parent not found');
        }
        // Consider adding back the window resize listener as a fallback?
        draw(); // Initial draw attempt
        return;
    }

    const resizeObserver = new ResizeObserver(entries => {
        // We are only observing one element, so entries[0] is fine
        if (entries[0]) {
            // Call draw whenever the observed element size changes. Guarded:
            // an exception here (e.g. drawImage from an invalidated source
            // canvas) would otherwise be swallowed by the observer and leave a
            // silently empty frame.
            try {
              draw();
            } catch (error) {
              logger.error('[SoccerField] Draw failed in ResizeObserver callback:', error);
            }
        }
    });

    // Start observing the parent element
    resizeObserver.observe(parent);

    // Cleanup function to disconnect the observer when the component unmounts
    return () => {
        resizeObserver.unobserve(parent);
        resizeObserver.disconnect();
    };
  }, [draw]); // Dependency on `draw` ensures the observer always uses the latest version

  // Keep drawRef pointing at the latest draw (listeners below are identity-free).
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // Names and chips use the app's web fonts; a canvas paints with whatever is
  // loaded at draw time, so repaint once the fonts have arrived.
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) return;
    let cancelled = false;
    const repaint = () => {
      if (!cancelled) drawRef.current();
    };
    fonts.ready?.then(repaint).catch(() => {});
    fonts.addEventListener?.('loadingdone', repaint);
    return () => {
      cancelled = true;
      fonts.removeEventListener?.('loadingdone', repaint);
    };
  }, []);

  // A hide/show while this component was UNMOUNTED (start screen, modals)
  // never reaches the listeners below - the module cache can then hold
  // same-key bitmaps whose backing store Android discarded, and the first
  // draw blits a blank background under perfectly healthy discs (owner
  // screenshot, guided-tour first entry). One background re-render per
  // match mount is trivial; trusting a pre-mount bitmap is not.
  useEffect(() => {
    invalidateFieldBackgroundCache();
  }, []);

  // Force redraw when the app returns from background (Android TWA / iOS Safari
  // bfcache). The ResizeObserver won't fire if the canvas size hasn't changed,
  // but both the cached background bitmap AND the main canvas backing store can
  // come back blank after a background period (owner-reported: flat green field
  // with no lines). Resilience over the old one-shot rAF:
  //  - the cache GENERATION is bumped (all pre-background bitmaps unreachable),
  //  - the main canvas backing store is force-reallocated on the next draw,
  //  - the repaint runs after a double rAF (layout settled) AND again after a
  //    delay, surviving a late WebView restore that overwrites the first paint,
  //  - pageshow (bfcache), window focus, and the app's own 'app-resume' event
  //    are handled too - some Android restore paths never fire visibilitychange.
  // Empty deps: everything routes through refs, so a pending repaint can never
  // be cancelled by a deps-driven effect cleanup mid-resume.
  useEffect(() => {
    let rafId1: number | null = null;
    let rafId2: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const paint = () => {
      try {
        drawRef.current();
      } catch (error) {
        logger.error('[SoccerField] Failed to redraw canvas after resume:', error);
      }
    };

    const scheduleResumeRedraw = () => {
      invalidateFieldBackgroundCache();
      forceCanvasReallocRef.current = true;
      if (rafId1 !== null) cancelAnimationFrame(rafId1);
      if (rafId2 !== null) cancelAnimationFrame(rafId2);
      if (timeoutId !== null) clearTimeout(timeoutId);
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(paint);
      });
      // Second pass: a late WebView restore can replace the first paint with a
      // blank hibernation snapshot; repainting shortly after makes it stick.
      timeoutId = setTimeout(() => {
        forceCanvasReallocRef.current = true;
        paint();
      }, 300);
    };

    // Focus alone (desktop alt-tab, devtools clicks) must NOT invalidate the
    // cache and reallocate the canvas - only a focus following a real
    // background period, where the backing stores may have been discarded.
    let wasHidden = false;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasHidden = true;
        // Entering background: retire the current bitmaps immediately so any
        // draw racing the freeze can't repopulate the map with doomed entries.
        invalidateFieldBackgroundCache();
      } else {
        wasHidden = false;
        scheduleResumeRedraw();
      }
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        wasHidden = false;
        scheduleResumeRedraw();
      }
    };
    const handleFocus = () => {
      // Recovery net for restore paths where visibilitychange never fired
      // visible again (some Android multi-window/screen-off sequences).
      if (!document.hidden && wasHidden) {
        wasHidden = false;
        scheduleResumeRedraw();
      }
    };
    const handleAppResume = () => {
      wasHidden = false;
      scheduleResumeRedraw();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('app-resume', handleAppResume);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('app-resume', handleAppResume);
      if (rafId1 !== null) cancelAnimationFrame(rafId1);
      if (rafId2 !== null) cancelAnimationFrame(rafId2);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, []);

  // --- Event Handlers --- 

  // --- Event Position Helper ---
  // Function to get the relative position of an event within the canvas
  // Memoized with empty deps — only reads canvasRef (stable ref)
  const getRelativeEventPosition = useCallback((
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement> | TouchEvent,
    specificTouchId?: number | null
  ): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e) { // Handle both React and native TouchEvents
        let touch: Touch | React.Touch | undefined;
        // Access changedTouches directly - it exists on both types
        const touches = e.changedTouches;
        if (specificTouchId !== undefined && specificTouchId !== null) {
            // Find the specific touch by identifier
            touch = Array.from(touches).find(t => t.identifier === specificTouchId);
        } else if (touches.length > 0) {
             // Fallback to the first changed touch if no specific ID
             touch = touches[0];
        }

        if (!touch) return null;
        clientX = touch.clientX;
        clientY = touch.clientY;
    } else { // It's a MouseEvent
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Check for invalid dimensions before calculating relative position
    if (rect.width <= 0 || rect.height <= 0) {
        logger.warn("Canvas has invalid dimensions, cannot calculate relative position.");
        return null;
    }

    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;

    // Clamp values between 0 and 1 (optional, but good practice)
    const clampedX = Math.max(0, Math.min(1, relX));
    const clampedY = Math.max(0, Math.min(1, relY));

    return { relX: clampedX, relY: clampedY };
  }, []);

  // Helper to check if a point (clientX, clientY) is within a player disk - Corrected Canvas Logic
  const isPointInPlayer = useCallback((eventClientX: number, eventClientY: number, player: Player): boolean => {
    const canvas = canvasRef.current;
    if (!canvas || player.relX === undefined || player.relY === undefined) return false;
    const rect = canvas.getBoundingClientRect();
    // The player's centre where it is DRAWN: on the subs rail when waiting
    // in a slot, otherwise where it stands (discCenterX keeps edge discs on
    // the canvas). Rail discs take a 44px target.
    const spot = buildRailScene(players, subSlots, rect.width, rect.height, 1, FIELD_PLAYER_RADIUS).player(player);
    const hitRadius = spot.railIndex >= 0 ? SUB_RAIL_HIT_RADIUS : FIELD_PLAYER_RADIUS;
    // Calculate absolute event position relative to the canvas origin
    const absEventX = eventClientX - rect.left;
    const absEventY = eventClientY - rect.top;
    // Calculate distance squared
    const dx = absEventX - spot.x;
    const dy = absEventY - spot.y;
    // Compare distance squared to radius squared
    return dx * dx + dy * dy <= hitRadius * hitRadius;
  }, [players, subSlots]);

  // Helper to check if a point (clientX, clientY) is within an opponent disk - Corrected Canvas Logic
  const isPointInOpponent = useCallback((eventClientX: number, eventClientY: number, opponent: Opponent): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    // Calculate absolute opponent center
    const absOpponentX = opponent.relX * rect.width;
    const absOpponentY = opponent.relY * rect.height;
    // Calculate absolute event position relative to canvas
    const absEventX = eventClientX - rect.left;
    const absEventY = eventClientY - rect.top;
    // Calculate distance squared
    const dx = absEventX - absOpponentX;
    const dy = absEventY - absOpponentY;
    // Compare distance squared to radius squared (opponent radius is slightly smaller)
    const opponentRadiusSq = (FIELD_PLAYER_RADIUS * 0.9) * (FIELD_PLAYER_RADIUS * 0.9);
    return dx * dx + dy * dy <= opponentRadiusSq;
  }, []); // No dependencies needed

  const isPointInTacticalDisc = useCallback((eventClientX: number, eventClientY: number, disc: TacticalDisc): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const absDiscX = disc.relX * rect.width;
    const absDiscY = disc.relY * rect.height;
    const absEventX = eventClientX - rect.left;
    const absEventY = eventClientY - rect.top;
    const dx = absEventX - absDiscX;
    const dy = absEventY - absDiscY;
    return dx * dx + dy * dy <= PLAYER_RADIUS * PLAYER_RADIUS;
  }, []);

  const isPointInBall = useCallback((eventClientX: number, eventClientY: number): boolean => {
    if (!tacticalBallPosition) return false;
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const ballRadius = PLAYER_RADIUS; // Use a larger radius for hit detection
    const absBallX = tacticalBallPosition.relX * rect.width;
    const absBallY = tacticalBallPosition.relY * rect.height;
    const absEventX = eventClientX - rect.left;
    const absEventY = eventClientY - rect.top;
    const dx = absEventX - absBallX;
    const dy = absEventY - absBallY;
    return dx * dx + dy * dy <= ballRadius * ballRadius;
  }, [tacticalBallPosition]);

  /** Index of the sub slot whose rail circle is under a canvas point (44px target), or -1. */
  const subRailSlotAt = useCallback((absX: number, absY: number, width: number, height: number): number => {
    if (!subSlots || subSlots.length === 0) return -1;
    const rail = computeSubRail(subSlots, width, height);
    let best = -1;
    let bestDistSq = SUB_RAIL_HIT_RADIUS * SUB_RAIL_HIT_RADIUS;
    for (let i = 0; i < subSlots.length; i++) {
      const spot = rail[i];
      if (!spot) continue;
      const distSq = (absX - spot.x) ** 2 + (absY - spot.y) ** 2;
      if (distSq <= bestDistSq) {
        best = i;
        bestDistSq = distSq;
      }
    }
    return best;
  }, [subSlots]);

  /**
   * Where a player picked from the bar lands for a tap at a canvas point. On
   * a rail slot that is the slot itself - its stored coordinates, so the sub
   * is recorded as waiting in it, as before the rail moved slots away from
   * their stored spots. Anywhere else: exactly where the tap was.
   */
  const placementTarget = useCallback((clientX: number, clientY: number, fallback: Point): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return fallback;
    const rect = canvas.getBoundingClientRect();
    const i = subRailSlotAt(clientX - rect.left, clientY - rect.top, rect.width, rect.height);
    const slot = i >= 0 ? subSlots?.[i] : undefined;
    return slot ? { relX: slot.relX, relY: slot.relY } : fallback;
  }, [subRailSlotAt, subSlots]);

  // Helper to find an empty position (formation snap point or sub slot) at the given coordinates
  const findEmptyPositionAtPoint = useCallback((eventClientX: number, eventClientY: number): { relX: number; relY: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const absEventX = eventClientX - rect.left;
    const absEventY = eventClientY - rect.top;
    const hitRadiusSq = FIELD_PLAYER_RADIUS * FIELD_PLAYER_RADIUS;

    // Check formation snap points first
    if (formationSnapPoints && formationSnapPoints.length > 0) {
      for (const point of formationSnapPoints) {
        const absPointX = discCenterX(point.relX, rect.width, FIELD_PLAYER_RADIUS);
        const absPointY = point.relY * rect.height;
        const dx = absEventX - absPointX;
        const dy = absEventY - absPointY;
        if (dx * dx + dy * dy <= hitRadiusSq) {
          // Check if this position is unoccupied
          if (!isPositionOccupied(players, point.relX, point.relY)) {
            return { relX: point.relX, relY: point.relY };
          }
        }
      }
    }

    // Check sub slots - where the rail draws them. A slot with a disc drawn
    // in it is not empty, even when that disc stands a little off it.
    const slotIndex = subRailSlotAt(absEventX, absEventY, rect.width, rect.height);
    const slot = slotIndex >= 0 ? subSlots?.[slotIndex] : undefined;
    if (
      slot &&
      !isPositionOccupied(players, slot.relX, slot.relY) &&
      !buildRailScene(players, subSlots, rect.width, rect.height, 1, FIELD_PLAYER_RADIUS).filled.has(slotIndex)
    ) {
      return { relX: slot.relX, relY: slot.relY };
    }

    return null;
  // canvasRef is intentionally omitted - refs are stable and don't trigger re-renders
  }, [formationSnapPoints, subSlots, subRailSlotAt, players]);

  // --- Mouse/Touch Handlers (Logic largely the same, but use CSS size for abs calcs) ---
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const relPos = getRelativeEventPosition(e);
      if (!relPos) return;

    if (isTacticsBoardView) {
      if (e.detail === 2) {
        for (const disc of tacticalDiscs) {
          if (isPointInTacticalDisc(e.clientX, e.clientY, disc)) {
            if (disc.type === 'home') {
              onToggleTacticalDiscType(disc.id);
            } else {
              onTacticalDiscRemove(disc.id);
            }
            return;
          }
        }
      }
      if (isPointInBall(e.clientX, e.clientY)) {
        setIsDraggingBall(true);
        if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
        return;
      }
      for (const disc of tacticalDiscs) {
        if (isPointInTacticalDisc(e.clientX, e.clientY, disc)) {
          setIsDraggingTacticalDisc(true);
          setDraggingTacticalDiscId(disc.id);
          if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
          return;
        }
      }
    } else {
    // *** Check if placing a tapped player ***
    if (draggingPlayerFromBarInfo) {
      logger.log("Field MouseDown: Placing player from bar tap:", draggingPlayerFromBarInfo.id);
      const target = placementTarget(e.clientX, e.clientY, relPos);
      onPlayerDrop(draggingPlayerFromBarInfo.id, target.relX, target.relY);
      // IMPORTANT: Clear the selection state after placing
      // This needs to happen in the parent (page.tsx), 
      // so we might need a new callback prop like `onPlayerPlaceFromBar()` 
      // OR rely on handleDropOnField in page.tsx to clear it.
        // For now, let's assume handleDropOnField in page.tsx clears draggingPlayerFromBarInfo.
      // For now, let's assume handleDropOnField in page.tsx clears draggingPlayerFromBarInfo.
      return; // Don't proceed with other actions
    }

    // Double-click check
    if (e.detail === 2) {
      for (const player of players) {
        // Pass event clientX/Y and the player object
        if (isPointInPlayer(e.clientX, e.clientY, player)) {
          onPlayerRemove(player.id);
          return;
        }
      }
      for (const opponent of opponents) {
        // Pass event clientX/Y and the opponent object
        if (isPointInOpponent(e.clientX, e.clientY, opponent)) {
          onOpponentRemove(opponent.id);
          return;
        }
      }
    }

      // Drag check
      for (const player of players) {
        // Pass event clientX/Y and the player object
        if (isPointInPlayer(e.clientX, e.clientY, player)) {
          setSelectedPlayerForSwapId(null);
          lastPlayerDragRelPosRef.current = { relX: player.relX ?? relPos.relX, relY: player.relY ?? relPos.relY };
          playerDragOriginRef.current = lastPlayerDragRelPosRef.current;
          setIsDraggingPlayer(true);
          setDraggingPlayerId(player.id);
          if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
          return;
        }
      }
    for (const opponent of opponents) {
        // Pass event clientX/Y and the opponent object
        if (isPointInOpponent(e.clientX, e.clientY, opponent)) {
            setIsDraggingOpponent(true);
            setDraggingOpponentId(opponent.id);
            if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
            return;
          }
        }
    }

    // Start drawing (only if drawing mode is enabled AND in tactics mode)
    // Guard against stale isDrawingEnabled from storage when tactics mode is off
    if (isDrawingEnabled && isTacticsBoardView) {
      setIsDrawing(true);
      onDrawingStart(relPos); // Pass relative pos
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
  };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const relPos = getRelativeEventPosition(e);
      if (!relPos) return;

      if (isDraggingTacticalDisc && draggingTacticalDiscId) {
        onTacticalDiscMove(draggingTacticalDiscId, relPos.relX, relPos.relY);
      } else if (isDraggingPlayer && draggingPlayerId) {
        lastPlayerDragRelPosRef.current = relPos;
        onPlayerMove(draggingPlayerId, relPos.relX, relPos.relY); // Pass relative
      } else if (isDraggingOpponent && draggingOpponentId) {
        onOpponentMove(draggingOpponentId, relPos.relX, relPos.relY); // Pass relative
      } else if (isDrawing) {
        onDrawingAddPoint(relPos); // Pass relative
    } else {
      // Hover check
      let hovering = false;
      if (isTacticsBoardView) {
        for (const disc of tacticalDiscs) {
          if (isPointInTacticalDisc(e.clientX, e.clientY, disc)) { hovering = true; break; }
        }
      } else {
      for (const player of players) {
        // Pass event clientX/Y and the player object
        if (isPointInPlayer(e.clientX, e.clientY, player)) { hovering = true; break; }
      }
      if (!hovering) {
          for (const opponent of opponents) {
              // Pass event clientX/Y and the opponent object
              if (isPointInOpponent(e.clientX, e.clientY, opponent)) { hovering = true; break; }
            }
          }
      }
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hovering ? 'grab' : 'default';
      }
    }
  };

    const handleMouseUp = () => {
      if (isDraggingBall) {
        onTacticalBallMoveEnd();
        setIsDraggingBall(false);
      } else if (isDraggingTacticalDisc) {
        onTacticalDiscMoveEnd();
        setIsDraggingTacticalDisc(false);
        setDraggingTacticalDiscId(null);
      } else if (isDraggingPlayer) {
        let handledAsSwap = false;
        if (draggingPlayerId) {
          const currentPos = lastPlayerDragRelPosRef.current ?? null;
          handledAsSwap = maybeSnapPlayerToFormation(draggingPlayerId, currentPos);
        }
        if (!handledAsSwap) onPlayerMoveEnd(draggingPlayerId ? [draggingPlayerId] : undefined);
        playerDragOriginRef.current = null;
        setIsDraggingPlayer(false);
        setDraggingPlayerId(null);
        lastPlayerDragRelPosRef.current = null;
      } else if (isDraggingOpponent && draggingOpponentId) {
          onOpponentMoveEnd(draggingOpponentId);
          setIsDraggingOpponent(false);
          setDraggingOpponentId(null);
      } else if (isDrawing) {
        onDrawingEnd();
        setIsDrawing(false);
      }
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
    };

  const handleMouseLeave = () => {
    handleMouseUp(); // Treat leave same as mouse up
  };

  // If drawing mode is disabled while an active drawing is in progress, end it gracefully
  useEffect(() => {
    if (!isDrawingEnabled && isDrawing) {
      onDrawingEnd();
      setIsDrawing(false);
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
    }
  }, [isDrawingEnabled, isDrawing, onDrawingEnd]);

  // --- Touch Handlers ---
  const handleTouchStart = useCallback((e: TouchEvent) => {
      if (e.touches.length > 1) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const touchId = touch.identifier;
      setActiveTouchId(touchId);
      const relPos = getRelativeEventPosition(e, touchId);
      if (!relPos) { setActiveTouchId(null); return; }

    touchExceededTapThresholdRef.current = false;
    suppressTapActionRef.current = false;
    touchStartTargetRef.current = null;
    touchDraggingPlayerIdRef.current = null;

      // *** Check if placing a tapped player ***
      if (draggingPlayerFromBarInfo) {
          logger.log("Field TouchStart: Placing player from bar tap:", draggingPlayerFromBarInfo.id);
          // Don't preventDefault here for placing, allow potential scroll if placement fails
          const target = placementTarget(touch.clientX, touch.clientY, relPos);
          onPlayerDropViaTouch(target.relX, target.relY);
          touchExceededTapThresholdRef.current = true;
          touchStartTargetRef.current = null;
          setActiveTouchId(null); 
          return; 
      }

    const now = Date.now();
    let tappedTargetId: string | null = null;
    let tappedTargetType: 'player' | 'opponent' | 'tactical' | 'ball' | 'emptyPosition' | null = null;
    let emptyPositionCoords: { relX: number; relY: number } | undefined;

    // Check for ball first, as it might be on top of other elements.
    // Only in tactics view (matching the mouse path): the ball is only drawn
    // there, but its position is always defined — an ungated hit-test creates
    // an invisible touch dead zone in normal view at the ball's position
    // (default: center field, the kickoff spot).
    if (isTacticsBoardView && isPointInBall(touch.clientX, touch.clientY)) {
      tappedTargetType = 'ball';
    } else if (isTacticsBoardView) {
      // Tactical disc interactions
      for (const disc of tacticalDiscs) {
        if (isPointInTacticalDisc(touch.clientX, touch.clientY, disc)) {
          tappedTargetId = disc.id;
          tappedTargetType = 'tactical';
          break;
        }
      }
      } else {
        // Normal view player/opponent interactions
        for (const player of players) {
          if (isPointInPlayer(touch.clientX, touch.clientY, player)) {
            tappedTargetId = player.id;
            tappedTargetType = 'player';
            break;
          }
        }
      if (!tappedTargetId) {
        for (const opponent of opponents) {
          if (isPointInOpponent(touch.clientX, touch.clientY, opponent)) {
            tappedTargetId = opponent.id;
            tappedTargetType = 'opponent';
            break;
          }
        }
      }
      // Check for empty position tap (formation snap points or sub slots)
      // UX design: Only enabled when a player is selected. User flow:
      // 1. Tap a player to select them (highlighted with selection ring)
      // 2. Tap an empty position to move the selected player there
      // This prevents accidental moves and makes the interaction intentional.
      if (!tappedTargetId && selectedPlayerForSwapId) {
        const emptyPos = findEmptyPositionAtPoint(touch.clientX, touch.clientY);
        if (emptyPos) {
          tappedTargetType = 'emptyPosition';
          emptyPositionCoords = emptyPos;
        }
      }
      }

      touchStartTargetRef.current = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        targetId: tappedTargetId,
        targetType: tappedTargetType,
        emptyPositionCoords,
      };

      if (!isTacticsBoardView && tappedTargetType !== 'player' && tappedTargetType !== 'emptyPosition') {
        setSelectedPlayerForSwapId(null);
      }

      // Double Tap Logic
      const absEventX = touch.clientX - rect.left;
      const absEventY = touch.clientY - rect.top;
      if (lastTapInfo && (tappedTargetId && lastTapInfo.targetId === tappedTargetId || tappedTargetType === 'ball' && lastTapInfo.targetType === 'ball')) {
      const timeDiff = now - lastTapInfo.time;
      const distDiff = Math.sqrt(Math.pow(absEventX - lastTapInfo.x, 2) + Math.pow(absEventY - lastTapInfo.y, 2));
      if (timeDiff < DOUBLE_TAP_TIME_THRESHOLD && distDiff < DOUBLE_TAP_POS_THRESHOLD) {
          if (tappedTargetType === 'player' && tappedTargetId) {
            onPlayerRemove(tappedTargetId);
            setSelectedPlayerForSwapId(prev => (prev === tappedTargetId ? null : prev));
          } else if (tappedTargetType === 'opponent' && tappedTargetId) {
            onOpponentRemove(tappedTargetId);
          } else if (tappedTargetType === 'tactical' && tappedTargetId) {
            const disc = tacticalDiscs.find(d => d.id === tappedTargetId);
            if (disc) {
            if (disc.type === 'home') {
              onToggleTacticalDiscType(disc.id);
            } else {
              onTacticalDiscRemove(disc.id);
            }
          }
          }
          setLastTapInfo(null);
          setActiveTouchId(null);
          suppressTapActionRef.current = true;
          touchStartTargetRef.current = null;
          touchExceededTapThresholdRef.current = true;
          e.preventDefault();
          return;
        }
      }
      setLastTapInfo({ time: now, x: absEventX, y: absEventY, targetId: tappedTargetId, targetType: tappedTargetType });

      // Start Dragging or Drawing
      if (tappedTargetType === 'ball') {
        setIsDraggingBall(true);
        touchExceededTapThresholdRef.current = true;
        e.preventDefault();
      } else if (tappedTargetType === 'player' && tappedTargetId) {
        // Player drag is started on touch-move once the finger moves past a threshold.
        e.preventDefault();
      } else if (tappedTargetType === 'opponent' && tappedTargetId) {
        setIsDraggingOpponent(true);
        setDraggingOpponentId(tappedTargetId);
        touchExceededTapThresholdRef.current = true;
        e.preventDefault();
      } else if (tappedTargetType === 'tactical' && tappedTargetId) {
        setIsDraggingTacticalDisc(true);
        setDraggingTacticalDiscId(tappedTargetId);
        touchExceededTapThresholdRef.current = true;
        e.preventDefault();
      } else if (!draggingPlayerFromBarInfo && isDrawingEnabled && isTacticsBoardView) {
        // Only allow drawing in tactics mode (guard against stale isDrawingEnabled)
        // If a previous stroke didn't finalize (missed touchend), finalize it now
        if (isDrawing) {
        onDrawingEnd();
        setIsDrawing(false);
      }
        setIsDrawing(true);
        onDrawingStart(relPos);
        touchExceededTapThresholdRef.current = true;
        e.preventDefault();
      }
    }, [
      getRelativeEventPosition,
      isPointInBall, isTacticsBoardView, tacticalDiscs, onToggleTacticalDiscType, onTacticalDiscRemove, isPointInTacticalDisc,
      players, onPlayerRemove, isPointInPlayer, opponents, onOpponentRemove, isPointInOpponent,
    draggingPlayerFromBarInfo, onPlayerDropViaTouch, placementTarget,
    lastTapInfo, onDrawingStart, isDrawingEnabled, isDrawing, onDrawingEnd,
    findEmptyPositionAtPoint, selectedPlayerForSwapId
  ]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
      if (activeTouchId === null) return;

      const currentTouch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId);
      if (!currentTouch) return;

      let isDraggingPlayerForMove = isDraggingPlayer;
      let draggingPlayerIdForMove = draggingPlayerId;
      const touchStartTarget = touchStartTargetRef.current;

      if (
        !isDraggingPlayerForMove &&
        !isDraggingBall &&
        !isDraggingOpponent &&
        !isDraggingTacticalDisc &&
        !isDrawing &&
        !isTacticsBoardView &&
        touchStartTarget?.targetType === 'player' &&
        touchStartTarget.targetId
      ) {
        const dx = currentTouch.clientX - touchStartTarget.clientX;
        const dy = currentTouch.clientY - touchStartTarget.clientY;
        const distSq = dx * dx + dy * dy;
      if (distSq >= TAP_TO_DRAG_THRESHOLD_SQ) {
        touchExceededTapThresholdRef.current = true;
        setSelectedPlayerForSwapId(null);
        setIsDraggingPlayer(true);
        setDraggingPlayerId(touchStartTarget.targetId);
        {
          const origin = playersListRef.current.find(p => p.id === touchStartTarget.targetId);
          playerDragOriginRef.current =
            origin && typeof origin.relX === 'number' && typeof origin.relY === 'number'
              ? { relX: origin.relX, relY: origin.relY }
              : null;
        }
        touchDraggingPlayerIdRef.current = touchStartTarget.targetId;
        isDraggingPlayerForMove = true;
        draggingPlayerIdForMove = touchStartTarget.targetId;
      }
    }

      if (isDraggingBall || isDraggingPlayerForMove || isDraggingOpponent || isDrawing || isDraggingTacticalDisc) {
        e.preventDefault();
      }

      const pos = getRelativeEventPosition(e, activeTouchId);
      if (!pos) return;

      if (isDraggingBall) {
        onTacticalBallMove(pos);
      } else if (isDraggingTacticalDisc && draggingTacticalDiscId) {
        onTacticalDiscMove(draggingTacticalDiscId, pos.relX, pos.relY);
    } else if (isDraggingPlayerForMove && draggingPlayerIdForMove) {
      lastPlayerDragRelPosRef.current = pos;
      touchDraggingPlayerIdRef.current = draggingPlayerIdForMove;
      onPlayerMove(draggingPlayerIdForMove, pos.relX, pos.relY);
    } else if (isDraggingOpponent && draggingOpponentId) {
      onOpponentMove(draggingOpponentId, pos.relX, pos.relY);
    } else if (isDrawing) {
      onDrawingAddPoint(pos);
    }
  }, [getRelativeEventPosition, activeTouchId, isDrawing, isDraggingPlayer, isDraggingOpponent, draggingPlayerId, draggingOpponentId, onPlayerMove, onOpponentMove, onDrawingAddPoint, isDraggingTacticalDisc, draggingTacticalDiscId, onTacticalDiscMove, isDraggingBall, onTacticalBallMove, isTacticsBoardView]);

  const finalizeTouchEnd = useCallback(() => {
      const touchStartTarget = touchStartTargetRef.current;
      const shouldHandleTap =
        !suppressTapActionRef.current &&
        !touchExceededTapThresholdRef.current &&
        !isDraggingBall &&
        !isDraggingTacticalDisc &&
        !isDraggingPlayer &&
        !isDraggingOpponent &&
        !isDrawing;

      if (isDraggingBall) {
        onTacticalBallMoveEnd();
        setIsDraggingBall(false);
      } else if (isDraggingTacticalDisc) {
        onTacticalDiscMoveEnd();
        setIsDraggingTacticalDisc(false);
        setDraggingTacticalDiscId(null);
    } else if (isDraggingPlayer || touchDraggingPlayerIdRef.current) {
      const playerId = draggingPlayerId ?? touchDraggingPlayerIdRef.current;
      let handledAsSwap = false;
      if (playerId) {
        const currentPos = lastPlayerDragRelPosRef.current ?? null;
        handledAsSwap = maybeSnapPlayerToFormation(playerId, currentPos);
      }
      if (!handledAsSwap) onPlayerMoveEnd(playerId ? [playerId] : undefined);
      playerDragOriginRef.current = null;
      setIsDraggingPlayer(false);
      setDraggingPlayerId(null);
      lastPlayerDragRelPosRef.current = null;
      touchDraggingPlayerIdRef.current = null;
    } else if (isDraggingOpponent && draggingOpponentId) {
      onOpponentMoveEnd(draggingOpponentId);
      setIsDraggingOpponent(false);
      setDraggingOpponentId(null);
    } else if (isDrawing) {
      onDrawingEnd();
      setIsDrawing(false);
    } else if (isDraggingTacticalDisc) {
      onTacticalDiscMoveEnd();
      setIsDraggingTacticalDisc(false);
      setDraggingTacticalDiscId(null);
    }

      if (draggingPlayerFromBarInfo) {
        onPlayerDragCancelViaTouch();
      }

      if (!isTacticsBoardView && shouldHandleTap) {
        if (touchStartTarget?.targetType === 'player' && touchStartTarget.targetId) {
          const tappedPlayerId = touchStartTarget.targetId;
          if (!selectedPlayerForSwapId) {
            setSelectedPlayerForSwapId(tappedPlayerId);
          } else if (selectedPlayerForSwapId === tappedPlayerId) {
            setSelectedPlayerForSwapId(null);
          } else {
            onPlayersSwap?.(selectedPlayerForSwapId, tappedPlayerId);
            setSelectedPlayerForSwapId(null);
          }
        } else if (touchStartTarget?.targetType === 'emptyPosition' && touchStartTarget.emptyPositionCoords && selectedPlayerForSwapId) {
          // Move selected player to empty position
          onPlayerMove(selectedPlayerForSwapId, touchStartTarget.emptyPositionCoords.relX, touchStartTarget.emptyPositionCoords.relY);
          onPlayerMoveEnd([selectedPlayerForSwapId]); // Trigger goalie detection and history save
          setSelectedPlayerForSwapId(null);
        } else if (!touchStartTarget?.targetType) {
          setSelectedPlayerForSwapId(null);
        }
      }

    touchStartTargetRef.current = null;
    touchExceededTapThresholdRef.current = false;
    suppressTapActionRef.current = false;
    touchDraggingPlayerIdRef.current = null;
    setActiveTouchId(null);
  }, [
    isDraggingBall,
    isDraggingTacticalDisc,
    isDraggingPlayer,
      isDraggingOpponent,
      draggingOpponentId,
      isDrawing,
      draggingPlayerFromBarInfo,
      onPlayerMoveEnd,
      onOpponentMoveEnd,
      onDrawingEnd,
    onPlayerDragCancelViaTouch,
    isTacticsBoardView,
    onPlayersSwap,
    onPlayerMove,
    selectedPlayerForSwapId,
    draggingPlayerId,
    maybeSnapPlayerToFormation,
    onTacticalDiscMoveEnd,
    onTacticalBallMoveEnd,
  ]);

  // Keep a stable ref for active touch ID to avoid re-registering native listeners
  const activeTouchIdRef = useRef<number | null>(null);
  useEffect(() => { activeTouchIdRef.current = activeTouchId; }, [activeTouchId]);
  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json'); 
    if (!data) return;
    let droppedPlayerId: string;
    try {
        const parsedData = JSON.parse(data);
        droppedPlayerId = parsedData.id;
        if (!droppedPlayerId) throw new Error("ID missing");
    } catch (error) { logger.error("Drop data error:", error); return; }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); // Use CSS rect
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); // Use rect.width
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)); // Use rect.height

    const target = placementTarget(e.clientX, e.clientY, { relX, relY });
    onPlayerDrop(droppedPlayerId, target.relX, target.relY); // Pass relative coords
    if (canvasRef.current) canvasRef.current.style.cursor = 'default';
  };

  // --- Effect for Manual Event Listeners --- 
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Add listeners manually with passive: false for start/move so we can preventDefault
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    // End/cancel: native listeners to reliably catch stroke ends even if finger leaves canvas
    const nativeTouchEnd = (e: TouchEvent) => {
      // If we track a specific touch, ensure its end is part of this event
      const trackedId = activeTouchIdRef.current;
      if (trackedId !== null) {
        let ended = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === trackedId) { ended = true; break; }
        }
        if (!ended) return;
      }
      finalizeTouchEnd();
    };
    canvas.addEventListener('touchend', nativeTouchEnd, { passive: true });
    canvas.addEventListener('touchcancel', nativeTouchEnd, { passive: true });

    // Cleanup function to remove the listeners
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', nativeTouchEnd);
      canvas.removeEventListener('touchcancel', nativeTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, finalizeTouchEnd]); // Stable listener; uses refs for touch id

  // --- Render Canvas ---
  // Use field-specific background color to prevent flash when loading futsal games
  const fieldBackgroundColor = getFieldConfig(gameType).style.fieldColor;

  return (
    <div
      className="w-full h-full relative"
      style={{ backgroundColor: fieldBackgroundColor }}
      data-testid="soccer-field"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t('soccerField.ariaLabel', 'Soccer field with player positions and tactical drawings')}
        className="absolute top-0 left-0 w-full h-full touch-none" // Added touch-none
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      />
      {/* Optional: Render player names/numbers as separate HTML elements over the canvas? */}
    </div>
  );
});

SoccerFieldInner.displayName = 'SoccerField';

// Wrap with React.memo for performance
const SoccerField = React.memo(SoccerFieldInner);

export default SoccerField; 
