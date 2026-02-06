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
import type { SubSlot } from '@/utils/formations';

// Define props for SoccerField
interface SoccerFieldProps {
  players: Player[];
  opponents: Opponent[];
  drawings: Point[][];
  showPlayerNames: boolean;
  /** Game type determines field visualization (soccer field vs futsal court) */
  gameType?: GameType;
  onPlayerDrop: (playerId: string, relX: number, relY: number) => void; // Use relative coords
  onPlayerMove: (playerId: string, relX: number, relY: number) => void; // Use relative coords
  onPlayerMoveEnd: () => void;
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
const BALL_IMAGE_OVERSCAN = 2.1; // Slightly oversized to eliminate edge artifacts when clipping
const DOUBLE_TAP_TIME_THRESHOLD = 300; // ms
const DOUBLE_TAP_POS_THRESHOLD = 15; // pixels
const TAP_TO_DRAG_THRESHOLD = 10; // pixels
const TAP_TO_DRAG_THRESHOLD_SQ = TAP_TO_DRAG_THRESHOLD * TAP_TO_DRAG_THRESHOLD;
const FORMATION_SNAP_THRESHOLD_PX = 36; // pixels
const FORMATION_SNAP_THRESHOLD_SQ = FORMATION_SNAP_THRESHOLD_PX * FORMATION_SNAP_THRESHOLD_PX;
export const SUB_SLOT_OCCUPATION_THRESHOLD = 0.04; // relative coordinate tolerance for slot occupation check

// Visual styling constants for formation positions and sub slots
const FIELD_POSITION_ALPHA_EMPTY = 0.35;
const FIELD_POSITION_ALPHA_OCCUPIED = 0.15;
const SUB_SLOT_ALPHA_EMPTY = 0.45;
const SUB_SLOT_ALPHA_OCCUPIED = 0.25;
// Note: Sideline players use desaturation only (no alpha) for visual distinction
const SIDELINE_DESATURATION_PERCENT = 60;
const POSITION_LABEL_FONT_SIZE = 14;

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
  gameType: GameType = 'soccer'
): HTMLCanvasElement => {
  const cacheKey = `${W}x${H}-${isTacticsView ? 'tactics' : 'normal'}-${gameType}`;

  // Check if we have a cached version (uses LRU cache)
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  // Get field configuration for the game type
  const fieldConfig = getFieldConfig(gameType);

  // Create offscreen canvas for background
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = W;
  offscreenCanvas.height = H;
  const offscreenCtx = offscreenCanvas.getContext('2d');
  if (!offscreenCtx) throw new Error('Could not get offscreen context');

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

  const maybeSnapPlayerToFormation = useCallback((playerId: string, currentRelPos: Point | null) => {
    logger.debug('[Snap] Called maybeSnapPlayerToFormation', {
      playerId,
      currentRelPos,
      snapPointsCount: formationSnapPoints?.length ?? 0,
      isTacticsBoardView
    });

    if (isTacticsBoardView) {
      logger.debug('[Snap] Skipping - tactics board view');
      return;
    }
    if (!formationSnapPoints || formationSnapPoints.length === 0) {
      logger.debug('[Snap] Skipping - no formation snap points available');
      return;
    }
    if (!currentRelPos) {
      logger.debug('[Snap] Skipping - no current position');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return;

    let bestPoint: Point | null = null;
    let bestDistSq = Infinity;

    for (const point of formationSnapPoints) {
      const dxPx = (currentRelPos.relX - point.relX) * rect.width;
      const dyPx = (currentRelPos.relY - point.relY) * rect.height;
      const distSq = dxPx * dxPx + dyPx * dyPx;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestPoint = point;
      }
    }

    const bestDistPx = Math.sqrt(bestDistSq);
    logger.debug('[Snap] Best snap point found', {
      bestPoint,
      bestDistPx,
      thresholdPx: FORMATION_SNAP_THRESHOLD_PX
    });

    if (!bestPoint || bestDistSq > FORMATION_SNAP_THRESHOLD_SQ) {
      logger.debug('[Snap] Skipping - distance exceeds threshold');
      return;
    }

    // Capture bestPoint for use in closure (TypeScript narrowing)
    const snapTarget = bestPoint;

    // Avoid snapping into an occupied spot (tap-to-move handles explicit moves to empty positions).
    const occupied = players.some(p => {
      if (p.id === playerId) return false;
      // Validate coordinates are finite numbers. typeof check provides TypeScript type narrowing
      // and handles undefined, null, strings, and other non-numeric values
      if (typeof p.relX !== 'number' || typeof p.relY !== 'number' || !Number.isFinite(p.relX) || !Number.isFinite(p.relY)) return false;
      const dxPx = (p.relX - snapTarget.relX) * rect.width;
      const dyPx = (p.relY - snapTarget.relY) * rect.height;
      const distSq = dxPx * dxPx + dyPx * dyPx;
      return distSq <= PLAYER_RADIUS * PLAYER_RADIUS;
    });

    if (occupied) {
      logger.debug('[Snap] Skipping - snap position is occupied');
      return;
    }

    logger.debug('[Snap] Snapping player to formation position', {
      playerId,
      from: currentRelPos,
      to: snapTarget
    });
    onPlayerMove(playerId, snapTarget.relX, snapTarget.relY);
    lastPlayerDragRelPosRef.current = snapTarget;
  }, [formationSnapPoints, isTacticsBoardView, onPlayerMove, players]);

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
    const playerRadius = PLAYER_RADIUS * scale;
    const opponentRadius = PLAYER_RADIUS * 0.9 * scale;

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

    // Draw players with polished enamel effect (only in non-tactical view)
    if (!isTacticsBoardView) {
      players.forEach(player => {
        if (typeof player.relX !== 'number' || typeof player.relY !== 'number') return;
        const absX = player.relX * W;
        const absY = player.relY * H;

        // Check if sideline player for desaturation (no transparency - desaturation is enough)
        const isSidelinePlayer = isSidelinePosition(player.relX);

        // Polished enamel disc effect (matches on-screen display)
        let baseColor = tinycolor(player.isGoalie ? '#F97316' : (player.color || '#7E22CE'));

        // Desaturate sideline players for visual distinction
        if (isSidelinePlayer) {
          baseColor = baseColor.desaturate(SIDELINE_DESATURATION_PERCENT);
        }

        // 1. Base Disc Color
        ctx.beginPath();
        ctx.arc(absX, absY, playerRadius, 0, Math.PI * 2);
        ctx.fillStyle = baseColor.toString();
        ctx.fill();

        // 2. Create clipping mask for gradient effects
        ctx.save();
        ctx.beginPath();
        ctx.arc(absX, absY, playerRadius, 0, Math.PI * 2);
        ctx.clip();

        // 3. Top-left Highlight (Sheen)
        const highlightGradient = ctx.createRadialGradient(
          absX - playerRadius * 0.3, absY - playerRadius * 0.3, 0,
          absX - playerRadius * 0.3, absY - playerRadius * 0.3, playerRadius * 1.2
        );
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlightGradient;
        ctx.fillRect(absX - playerRadius, absY - playerRadius, playerRadius * 2, playerRadius * 2);

        // 4. Bottom-right Inner Shadow for depth
        const shadowGradient = ctx.createRadialGradient(
          absX + playerRadius * 0.4, absY + playerRadius * 0.4, 0,
          absX + playerRadius * 0.4, absY + playerRadius * 0.4, playerRadius * 1.5
        );
        shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
        shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadowGradient;
        ctx.fillRect(absX - playerRadius, absY - playerRadius, playerRadius * 2, playerRadius * 2);

        // 5. Restore and add white border
        ctx.restore();
        ctx.beginPath();
        ctx.arc(absX, absY, playerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();

        // Player name with engraved effect (matches on-screen display)
        if (showPlayerNames) {
          const text = player.nickname || player.name || '';
          ctx.font = `600 ${12 * scale}px Rajdhani, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // 1. Dark shadow on top-left for "pressed-in" look
          ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.fillText(text, absX - 0.5 * scale, absY - 0.5 * scale);

          // 2. Light highlight on bottom-right
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.fillText(text, absX + 0.5 * scale, absY + 0.5 * scale);

          // 3. Main text fill
          ctx.fillStyle = '#F0F0F0';
          ctx.fillText(text, absX, absY);
        }

        // Position label below disc (matches on-screen display)
        const isGoalkeeper = player.relY >= 0.90;
        const isAtSnapPoint = formationSnapPoints?.some(point =>
          Math.abs(player.relX! - point.relX) < SUB_SLOT_OCCUPATION_THRESHOLD &&
          Math.abs(player.relY! - point.relY) < SUB_SLOT_OCCUPATION_THRESHOLD
        );

        // For sideline players, find matching sub slot to get their target position label
        const matchingSubSlot = isSidelinePlayer && subSlots?.find(slot =>
          Math.abs(player.relX! - slot.relX) < SUB_SLOT_OCCUPATION_THRESHOLD &&
          Math.abs(player.relY! - slot.relY) < SUB_SLOT_OCCUPATION_THRESHOLD
        );

        // Show position label for:
        // - On-field players at formation snap points (except goalkeepers)
        // - Sideline players at sub slots (show the target position like "CB", "LW")
        const shouldShowPositionLabel = matchingSubSlot || (isAtSnapPoint && !isGoalkeeper);

        if (shouldShowPositionLabel) {
          // Use sub slot's positionLabel for sideline players, otherwise compute from coordinates
          const labelKey = matchingSubSlot
            ? matchingSubSlot.positionLabel
            : getPositionLabel(player.relX, player.relY).label;
          const translatedLabel = t(`positions.${labelKey}`);

          ctx.font = `700 ${POSITION_LABEL_FONT_SIZE * scale}px Rajdhani, sans-serif`;

          // Sideline players: label to the LEFT (matches sub slot rendering)
          // On-field players: label BELOW the disc
          if (matchingSubSlot) {
            const labelX = absX - playerRadius - 6 * scale;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';

            // Black outline for visibility
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 2 * scale;
            ctx.strokeText(translatedLabel, labelX, absY);

            // White fill
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillText(translatedLabel, labelX, absY);
          } else {
            const labelY = absY + playerRadius + 10 * scale;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            // Black outline for visibility
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.lineWidth = 2.5 * scale;
            ctx.strokeText(translatedLabel, absX, labelY);

            // White fill
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(translatedLabel, absX, labelY);
          }
        }

      });
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

        // Draw shadow first
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5 * scale;
        ctx.shadowOffsetX = 1 * scale;
        ctx.shadowOffsetY = 2 * scale;

        ctx.beginPath();
        ctx.arc(absX, absY, tacticalDiscRadius, 0, Math.PI * 2);

        // Fill colors based on disc type (matches main draw)
        if (disc.type === 'home') {
          ctx.fillStyle = '#7E22CE'; // Purple
        } else if (disc.type === 'opponent') {
          ctx.fillStyle = '#DC2626'; // Red
        } else if (disc.type === 'goalie') {
          ctx.fillStyle = '#F97316'; // Orange
        }
        ctx.fill();
        ctx.restore();

        // Add white border
        ctx.beginPath();
        ctx.arc(absX, absY, tacticalDiscRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();
      });
    }

    return exportCanvas;
  }, [players, opponents, drawings, tacticalDiscs, tacticalBallPosition, ballImage, isTacticsBoardView, showPlayerNames, gameType, formationSnapPoints, subSlots, t]);

  // Expose canvas via ref for export functionality
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    renderForExport,
  }), [renderForExport]);

  // --- Drawing Logic ---
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

    // Set the canvas buffer size to match the physical pixels
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
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
        logger.warn("Canvas dimensions are invalid, skipping draw:", { W, H });
      }
      return;
    }

    // --- Draw Cached Background ---
    // Use prerendered background for performance
    const backgroundCanvas = createFieldBackgroundCached(context, W, H, isTacticsBoardView, gameType);
    context.drawImage(backgroundCanvas, 0, 0);

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
    const opponentRadius = PLAYER_RADIUS * 0.9; // Use original radius
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

        // Draw shadow first
        context.save();
        context.shadowColor = 'rgba(0, 0, 0, 0.5)';
        context.shadowBlur = 5;
        context.shadowOffsetX = 1;
        context.shadowOffsetY = 2;
        
        context.beginPath();
        context.arc(absX, absY, tacticalDiscRadius, 0, Math.PI * 2);

        // Fill colors per specification
        if (disc.type === 'home') {
          context.fillStyle = '#7E22CE'; // Purple
        } else if (disc.type === 'opponent') {
          context.fillStyle = '#DC2626'; // Red
        } else if (disc.type === 'goalie') {
          context.fillStyle = '#F97316'; // Orange
        }

        context.fill();
        context.restore();
        
        // Add border per specification
        context.beginPath();
        context.arc(absX, absY, tacticalDiscRadius, 0, Math.PI * 2);
        context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        context.lineWidth = 1.5;
        context.stroke();
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
      const positionRadius = PLAYER_RADIUS;

      formationSnapPoints.forEach(point => {
        // Skip GK position (at bottom) and sideline positions
        if (point.relY > 0.9 || isSidelinePosition(point.relX)) return;

        const absX = point.relX * W;
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

    // --- Draw Sub Slots (before players so they appear behind) ---
    if (subSlots && subSlots.length > 0 && !isTacticsBoardView) {
      const slotRadius = PLAYER_RADIUS;

      subSlots.forEach(slot => {
        const absX = slot.relX * W;
        const absY = slot.relY * H;

        // Check if slot is occupied by a player
        const isOccupied = isPositionOccupied(players, slot.relX, slot.relY);

        context.globalAlpha = isOccupied ? SUB_SLOT_ALPHA_OCCUPIED : SUB_SLOT_ALPHA_EMPTY;

        // Dashed circle outline
        context.beginPath();
        context.setLineDash([4, 4]);
        context.arc(absX, absY, slotRadius, 0, Math.PI * 2);
        context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        context.lineWidth = 1.5;
        context.stroke();
        context.setLineDash([]);

        // Position label to the left of slot (avoids overlap with stacked players)
        const translatedSlotLabel = t(`positions.${slot.positionLabel}`);
        context.font = `700 ${POSITION_LABEL_FONT_SIZE}px Rajdhani, sans-serif`;
        context.textAlign = 'right';
        context.textBaseline = 'middle';
        const labelX = absX - slotRadius - 6;

        // Black outline for visibility
        context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        context.lineWidth = 2;
        context.strokeText(translatedSlotLabel, labelX, absY);

        // White fill
        context.fillStyle = 'rgba(255, 255, 255, 0.8)';
        context.fillText(translatedSlotLabel, labelX, absY);

        context.globalAlpha = 1.0;
      });
    }

    // --- Draw Players ---
    const playerRadius = PLAYER_RADIUS;
    if (!isTacticsBoardView) {
    players.forEach(player => {
      if (typeof player.relX !== 'number' || typeof player.relY !== 'number') {
        return;
      }
      const absX = player.relX * W;
      const absY = player.relY * H;
      if (!Number.isFinite(absX) || !Number.isFinite(absY)) {
        logger.warn("Skipping player due to non-finite calculated position", { player, absX, absY });
        return;
      }

      // Check if sideline player for desaturation (no transparency - desaturation is enough)
      const isSidelinePlayer = isSidelinePosition(player.relX);

      // --- Start Refined "Polished Enamel" Disc Redesign ---
      let baseColor = tinycolor(player.isGoalie ? '#F97316' : (player.color || '#7E22CE'));

      // Desaturate sideline players for visual distinction
      if (isSidelinePlayer) {
        baseColor = baseColor.desaturate(SIDELINE_DESATURATION_PERCENT);
      }

      // 1. Base Disc Color
      context.beginPath();
      context.arc(absX, absY, playerRadius, 0, Math.PI * 2);
      context.fillStyle = baseColor.toString();
      context.fill();

      // 2. Create a clipping mask for the subsequent effects
      context.save();
      context.beginPath();
      context.arc(absX, absY, playerRadius, 0, Math.PI * 2);
      context.clip();

      // 3. Top-left Highlight (Sheen)
      const highlightGradient = context.createRadialGradient(
        absX - playerRadius * 0.3, absY - playerRadius * 0.3, 0,
        absX - playerRadius * 0.3, absY - playerRadius * 0.3, playerRadius * 1.2
      );
      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
      highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = highlightGradient;
      context.fillRect(absX - playerRadius, absY - playerRadius, playerRadius * 2, playerRadius * 2);

      // 4. Bottom-right Inner Shadow for depth
      const shadowGradient = context.createRadialGradient(
        absX + playerRadius * 0.4, absY + playerRadius * 0.4, 0,
        absX + playerRadius * 0.4, absY + playerRadius * 0.4, playerRadius * 1.5
      );
      shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
      shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = shadowGradient;
      context.fillRect(absX - playerRadius, absY - playerRadius, playerRadius * 2, playerRadius * 2);

      // 5. Restore from clipping mask and add border
      context.restore();
      context.beginPath();
      context.arc(absX, absY, playerRadius, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      context.lineWidth = 1.5;
      context.stroke();

      // Draw selection ring for swap mode
      if (selectedPlayerForSwapId === player.id) {
        context.save();
        context.beginPath();
        context.arc(absX, absY, playerRadius + 4, 0, Math.PI * 2);
        context.shadowColor = 'rgba(250, 204, 21, 0.6)';
        context.shadowBlur = 8;
        context.strokeStyle = 'rgba(250, 204, 21, 0.95)';
        context.lineWidth = 3;
        context.stroke();
        context.restore();
      }

      // --- End Disc Redesign ---

      // Draw player name with clean "engraved" effect
      if (showPlayerNames) {
        // Reset alpha so names are fully visible
        if (isSidelinePlayer) {
          context.globalAlpha = 1.0;
        }
        context.font = '600 12px Rajdhani, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        const text = player.nickname || player.name;

        // 1. Dark shadow on top-left for the "pressed-in" look
        context.fillStyle = 'rgba(0, 0, 0, 0.25)';
        context.fillText(text, absX - 0.5, absY - 0.5);

        // 2. Light highlight on bottom-right
        context.fillStyle = 'rgba(255, 255, 255, 0.25)';
        context.fillText(text, absX + 0.5, absY + 0.5);

        // 3. Main text fill
        context.fillStyle = '#F0F0F0';
        context.fillText(text, absX, absY);

        // 4. Position label below disc (only for on-field players at formation snap points, skip GK)
        // Note: player.relX/relY are verified as numbers at the start of forEach (line 936-938)
        const isGoalkeeper = player.relY >= 0.90;
        const isAtSnapPoint = formationSnapPoints?.some(point =>
          Math.abs(player.relX! - point.relX) < SUB_SLOT_OCCUPATION_THRESHOLD &&
          Math.abs(player.relY! - point.relY) < SUB_SLOT_OCCUPATION_THRESHOLD
        );

        if (!isSidelinePlayer && isAtSnapPoint && !isGoalkeeper) {
          const positionInfo = getPositionLabel(player.relX!, player.relY!);
          const translatedLabel = t(`positions.${positionInfo.label}`);
          const labelY = absY + playerRadius + 10;

          context.font = `700 ${POSITION_LABEL_FONT_SIZE}px Rajdhani, sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'top';

          // Black outline for visibility
          context.strokeStyle = 'rgba(0, 0, 0, 0.6)';
          context.lineWidth = 2.5;
          context.strokeText(translatedLabel, absX, labelY);

          // White fill
          context.fillStyle = 'rgba(255, 255, 255, 0.9)';
          context.fillText(translatedLabel, absX, labelY);
        }
      }

    });
    }

    // --- Restore context ---
    context.restore();
  }, [players, opponents, drawings, showPlayerNames, isTacticsBoardView, tacticalDiscs, tacticalBallPosition, ballImage, gameType, selectedPlayerForSwapId, subSlots, t, formationSnapPoints]);

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
            // Call draw whenever the observed element size changes
            draw();
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

  // Force redraw when app returns from background (Android TWA / iOS Safari bfcache fix)
  // The ResizeObserver won't fire if the canvas size hasn't changed, but the canvas context
  // might be stale after a long background period. This ensures a fresh redraw on resume.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Clear the background cache to force fresh rendering
        // This handles cases where the canvas context became invalid
        backgroundCache.clear();
        // Use requestAnimationFrame to ensure layout is complete before drawing
        requestAnimationFrame(() => {
          try {
            draw();
          } catch (error) {
            logger.error('[SoccerField] Failed to redraw canvas after resume:', error);
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [draw]); // Effect re-runs when `draw` changes, ensuring handler uses latest version

  // --- Event Handlers --- 

  // --- Event Position Helper ---
  // Function to get the relative position of an event within the canvas
  const getRelativeEventPosition = (
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
  };

  // Helper to check if a point (clientX, clientY) is within a player disk - Corrected Canvas Logic
  const isPointInPlayer = useCallback((eventClientX: number, eventClientY: number, player: Player): boolean => {
    const canvas = canvasRef.current;
    if (!canvas || player.relX === undefined || player.relY === undefined) return false;
    const rect = canvas.getBoundingClientRect();
    // Calculate absolute player center based on canvas size and relative coordinates
    const absPlayerX = player.relX * rect.width;
    const absPlayerY = player.relY * rect.height;
    // Calculate absolute event position relative to the canvas origin
    const absEventX = eventClientX - rect.left;
    const absEventY = eventClientY - rect.top;
    // Calculate distance squared
    const dx = absEventX - absPlayerX;
    const dy = absEventY - absPlayerY;
    // Compare distance squared to radius squared
    return dx * dx + dy * dy <= PLAYER_RADIUS * PLAYER_RADIUS;
  }, []); // No dependencies needed as PLAYER_RADIUS is constant and rect is read inside

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
    const opponentRadiusSq = (PLAYER_RADIUS * 0.9) * (PLAYER_RADIUS * 0.9);
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

  // Helper to find an empty position (formation snap point or sub slot) at the given coordinates
  const findEmptyPositionAtPoint = useCallback((eventClientX: number, eventClientY: number): { relX: number; relY: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const absEventX = eventClientX - rect.left;
    const absEventY = eventClientY - rect.top;
    const hitRadiusSq = PLAYER_RADIUS * PLAYER_RADIUS;

    // Check formation snap points first
    if (formationSnapPoints && formationSnapPoints.length > 0) {
      for (const point of formationSnapPoints) {
        const absPointX = point.relX * rect.width;
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

    // Check sub slots
    if (subSlots && subSlots.length > 0) {
      for (const slot of subSlots) {
        const absSlotX = slot.relX * rect.width;
        const absSlotY = slot.relY * rect.height;
        const dx = absEventX - absSlotX;
        const dy = absEventY - absSlotY;
        if (dx * dx + dy * dy <= hitRadiusSq) {
          // Check if this position is unoccupied
          if (!isPositionOccupied(players, slot.relX, slot.relY)) {
            return { relX: slot.relX, relY: slot.relY };
          }
        }
      }
    }

    return null;
  // canvasRef is intentionally omitted - refs are stable and don't trigger re-renders
  }, [formationSnapPoints, subSlots, players]);

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
      onPlayerDrop(draggingPlayerFromBarInfo.id, relPos.relX, relPos.relY);
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
        if (draggingPlayerId) {
          const currentPos = lastPlayerDragRelPosRef.current ?? null;
          maybeSnapPlayerToFormation(draggingPlayerId, currentPos);
        }
        onPlayerMoveEnd();
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
          onPlayerDropViaTouch(relPos.relX, relPos.relY);
          touchExceededTapThresholdRef.current = true;
          touchStartTargetRef.current = null;
          setActiveTouchId(null); 
          return; 
      }

    const now = Date.now();
    let tappedTargetId: string | null = null;
    let tappedTargetType: 'player' | 'opponent' | 'tactical' | 'ball' | 'emptyPosition' | null = null;
    let emptyPositionCoords: { relX: number; relY: number } | undefined;

    // Check for ball first, as it might be on top of other elements
    if (isPointInBall(touch.clientX, touch.clientY)) {
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
      isPointInBall, isTacticsBoardView, tacticalDiscs, onToggleTacticalDiscType, onTacticalDiscRemove, isPointInTacticalDisc,
      players, onPlayerRemove, isPointInPlayer, opponents, onOpponentRemove, isPointInOpponent,
    draggingPlayerFromBarInfo, onPlayerDropViaTouch,
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
  }, [activeTouchId, isDrawing, isDraggingPlayer, isDraggingOpponent, draggingPlayerId, draggingOpponentId, onPlayerMove, onOpponentMove, onDrawingAddPoint, isDraggingTacticalDisc, draggingTacticalDiscId, onTacticalDiscMove, isDraggingBall, onTacticalBallMove, isTacticsBoardView]);

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
      if (playerId) {
        const currentPos = lastPlayerDragRelPosRef.current ?? null;
        maybeSnapPlayerToFormation(playerId, currentPos);
      }
      onPlayerMoveEnd();
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
          onPlayerMoveEnd(); // Trigger goalie detection and history save
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

    onPlayerDrop(droppedPlayerId, relX, relY); // Pass relative coords
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
