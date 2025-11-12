'use client'; // Need this for client-side interactions like canvas

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Player } from '@/types'; // Import Player from types
import { Point, Opponent, TacticalDisc } from '@/types'; // Import Point and Opponent from page
import tinycolor from 'tinycolor2';
import logger from '@/utils/logger';

// Define props for SoccerField
interface SoccerFieldProps {
  players: Player[];
  opponents: Opponent[];
  drawings: Point[][];
  showPlayerNames: boolean;
  onPlayerDrop: (playerId: string, relX: number, relY: number) => void; // Use relative coords
  onPlayerMove: (playerId: string, relX: number, relY: number) => void; // Use relative coords
  onPlayerMoveEnd: () => void;
  onDrawingStart: (point: Point) => void; // Point already uses relative
  onDrawingAddPoint: (point: Point) => void; // Point already uses relative
  onDrawingEnd: () => void;
  onPlayerRemove: (playerId: string) => void;
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
  onTacticalDiscRemove: (discId: string) => void;
  onToggleTacticalDiscType: (discId: string) => void;
  tacticalBallPosition: Point | null;
  onTacticalBallMove: (position: Point) => void;
  isDrawingEnabled: boolean;
}

// Constants
const PLAYER_RADIUS = 20;
const DOUBLE_TAP_TIME_THRESHOLD = 300; // ms
const DOUBLE_TAP_POS_THRESHOLD = 15; // pixels

// Background cache for performance optimization
const backgroundCache: Map<string, HTMLCanvasElement> = new Map();

// Helper function to generate a noise pattern on an off-screen canvas
const createNoisePattern = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity: number
): CanvasPattern | null => {
  // Check if running in a browser environment
  if (typeof document === 'undefined') return null;

  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = width;
  noiseCanvas.height = height;
  const noiseCtx = noiseCanvas.getContext('2d');
  if (!noiseCtx) return null;

  const imageData = noiseCtx.createImageData(width, height);
  const data = imageData.data;
  const alpha = opacity * 255;
  for (let i = 0; i < data.length; i += 4) {
    // A simple black/white noise
    const randomValue = Math.random() > 0.5 ? 255 : 0;
    data[i] = randomValue;     // R
    data[i + 1] = randomValue; // G
    data[i + 2] = randomValue; // B
    data[i + 3] = alpha;       // Alpha
  }
  noiseCtx.putImageData(imageData, 0, 0);

  const pattern = ctx.createPattern(noiseCanvas, 'repeat');
  return pattern;
};

// Removed: formatTime helper - unused function (time display not implemented in SoccerField component)

// Helper function to create and cache the field background
const createFieldBackground = (
  context: CanvasRenderingContext2D,
  W: number,
  H: number,
  isTacticsView: boolean
): HTMLCanvasElement => {
  const cacheKey = `${W}x${H}-${isTacticsView ? 'tactics' : 'normal'}`;
  
  // Check if we have a cached version
  if (backgroundCache.has(cacheKey)) {
    return backgroundCache.get(cacheKey)!;
  }

  // Create offscreen canvas for background
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = W;
  offscreenCanvas.height = H;
  const offscreenCtx = offscreenCanvas.getContext('2d');
  if (!offscreenCtx) throw new Error('Could not get offscreen context');

  // 1. Base solid grass color
  offscreenCtx.fillStyle = '#427B44';
  offscreenCtx.fillRect(0, 0, W, H);

  // 2. Add dual noise patterns
  const cloudPattern = createNoisePattern(offscreenCtx, 400, 400, 0.02);
  if (cloudPattern) {
    offscreenCtx.fillStyle = cloudPattern;
    offscreenCtx.fillRect(0, 0, W, H);
  }
  
  const grainPattern = createNoisePattern(offscreenCtx, 100, 100, 0.03);
  if (grainPattern) {
    offscreenCtx.fillStyle = grainPattern;
    offscreenCtx.fillRect(0, 0, W, H);
  }

  // 3. Mowing stripes with soft-light blend mode
  const numStripes = 9;
  const stripeWidth = W / numStripes;
  offscreenCtx.globalCompositeOperation = 'soft-light';
  
  for (let i = 0; i < numStripes; i++) {
    const x = i * stripeWidth;
    offscreenCtx.fillStyle = (i % 2 === 0) ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)';
    offscreenCtx.fillRect(x, 0, stripeWidth, H);
  }
  
  offscreenCtx.globalCompositeOperation = 'source-over';

  // 4. Lighting overlays
  const linearGradient = offscreenCtx.createLinearGradient(0, 0, 0, H);
  linearGradient.addColorStop(0, 'rgba(0, 0, 0, 0.03)');
  linearGradient.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
  offscreenCtx.fillStyle = linearGradient;
  offscreenCtx.fillRect(0, 0, W, H);
  
  const hotspotRadius = H * 0.8;
  const radialGradient = offscreenCtx.createRadialGradient(
    W / 2, H * 0.3, 0,
    W / 2, H * 0.3, hotspotRadius
  );
  radialGradient.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
  radialGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  offscreenCtx.fillStyle = radialGradient;
  offscreenCtx.fillRect(0, 0, W, H);

  // 5. Draw field lines and markings with shadows
  offscreenCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  offscreenCtx.lineWidth = 2;
  offscreenCtx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  offscreenCtx.shadowBlur = 2;
  offscreenCtx.shadowOffsetY = 1;
  
  const lineMargin = 5;
  const centerRadius = Math.min(W, H) * 0.08;
  const penaltyBoxWidth = W * 0.6;
  const penaltyBoxHeight = H * 0.18;
  const goalBoxWidth = W * 0.3;
  const goalBoxHeight = H * 0.07;
  const penaltySpotDist = H * 0.12;
  const cornerRadius = Math.min(W, H) * 0.02;

  // Outer boundary
  offscreenCtx.beginPath();
  offscreenCtx.strokeRect(lineMargin, lineMargin, W - 2 * lineMargin, H - 2 * lineMargin);

  // Halfway line
  offscreenCtx.beginPath();
  offscreenCtx.moveTo(lineMargin, H / 2);
  offscreenCtx.lineTo(W - lineMargin, H / 2);
  offscreenCtx.stroke();

  // Center circle
  offscreenCtx.beginPath();
  offscreenCtx.arc(W / 2, H / 2, centerRadius, 0, Math.PI * 2);
  offscreenCtx.stroke();

  // Top Penalty Area & Arc
  offscreenCtx.beginPath();
  const topPenaltyX = (W - penaltyBoxWidth) / 2;
  offscreenCtx.rect(topPenaltyX, lineMargin, penaltyBoxWidth, penaltyBoxHeight);
  offscreenCtx.stroke();
  offscreenCtx.beginPath();
  offscreenCtx.arc(W / 2, lineMargin + penaltyBoxHeight, centerRadius * 0.8, 0, Math.PI, false);
  offscreenCtx.stroke();

  // Top Goal Area
  offscreenCtx.beginPath();
  const topGoalX = (W - goalBoxWidth) / 2;
  offscreenCtx.strokeRect(topGoalX, lineMargin, goalBoxWidth, goalBoxHeight);
  offscreenCtx.stroke();

  // Bottom Penalty Area & Arc
  offscreenCtx.beginPath();
  const bottomPenaltyY = H - lineMargin - penaltyBoxHeight;
  offscreenCtx.rect(topPenaltyX, bottomPenaltyY, penaltyBoxWidth, penaltyBoxHeight);
  offscreenCtx.stroke();
  offscreenCtx.beginPath();
  offscreenCtx.arc(W / 2, H - lineMargin - penaltyBoxHeight, centerRadius * 0.8, Math.PI, 0, false);
  offscreenCtx.stroke();

  // Bottom Goal Area
  offscreenCtx.beginPath();
  const bottomGoalY = H - lineMargin - goalBoxHeight;
  offscreenCtx.strokeRect(topGoalX, bottomGoalY, goalBoxWidth, goalBoxHeight);
  offscreenCtx.stroke();

  // Corner Arcs
  offscreenCtx.beginPath();
  offscreenCtx.arc(lineMargin, lineMargin, cornerRadius, 0, Math.PI / 2);
  offscreenCtx.stroke();
  offscreenCtx.beginPath();
  offscreenCtx.arc(W - lineMargin, lineMargin, cornerRadius, Math.PI / 2, Math.PI);
  offscreenCtx.stroke();
  offscreenCtx.beginPath();
  offscreenCtx.arc(lineMargin, H - lineMargin, cornerRadius, Math.PI * 1.5, 0);
  offscreenCtx.stroke();
  offscreenCtx.beginPath();
  offscreenCtx.arc(W - lineMargin, H - lineMargin, cornerRadius, Math.PI, Math.PI * 1.5);
  offscreenCtx.stroke();

  // Reset shadow effects
  offscreenCtx.shadowColor = 'transparent';
  offscreenCtx.shadowBlur = 0;
  offscreenCtx.shadowOffsetY = 0;
  
  // Draw filled spots (no shadow)
  offscreenCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  const spotRadius = 3;
  // Center Spot
  offscreenCtx.beginPath();
  offscreenCtx.arc(W / 2, H / 2, spotRadius, 0, Math.PI * 2);
  offscreenCtx.fill();
  // Top Penalty Spot
  offscreenCtx.beginPath();
  offscreenCtx.arc(W / 2, lineMargin + penaltySpotDist, spotRadius, 0, Math.PI * 2);
  offscreenCtx.fill();
  // Bottom Penalty Spot
  offscreenCtx.beginPath();
  offscreenCtx.arc(W / 2, H - lineMargin - penaltySpotDist, spotRadius, 0, Math.PI * 2);
  offscreenCtx.fill();

  // Draw Goals
  const goalWidth = W * 0.15;
  const goalHeight = 5;
  offscreenCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  offscreenCtx.fillRect((W - goalWidth) / 2, lineMargin, goalWidth, goalHeight);
  offscreenCtx.fillRect((W - goalWidth) / 2, H - lineMargin - goalHeight, goalWidth, goalHeight);

  // Cache the result
  backgroundCache.set(cacheKey, offscreenCanvas);
  return offscreenCanvas;
};

const SoccerField: React.FC<SoccerFieldProps> = ({
  players,
  opponents,
  drawings,
  showPlayerNames,
  onPlayerDrop,
  onPlayerMove,
  onPlayerMoveEnd,
  onDrawingStart,
  onDrawingAddPoint,
  onDrawingEnd,
  onPlayerRemove,
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
  onTacticalDiscRemove,
  onToggleTacticalDiscType,
  tacticalBallPosition,
  onTacticalBallMove,
  isDrawingEnabled
}) => {
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
  const [lastTapInfo, setLastTapInfo] = useState<{ time: number; x: number; y: number; targetId: string | null; targetType: 'player' | 'opponent' | 'tactical' | 'ball' | null } | null>(null);
  const [ballImage, setBallImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = '/ball.png';
    img.onload = () => setBallImage(img);
  }, []);

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
    const backgroundCanvas = createFieldBackground(context, W, H, isTacticsBoardView);
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
      const imageSize = ballRadius * 2.1;
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

      // --- Start Refined "Polished Enamel" Disc Redesign ---
      const baseColor = tinycolor(player.isGoalie ? '#F97316' : (player.color || '#7E22CE'));

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
      
      // --- End Disc Redesign ---

      // Draw player name with clean "engraved" effect
      if (showPlayerNames) {
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
      }
    });
    }

    // --- Restore context --- 
    context.restore();
  }, [players, opponents, drawings, showPlayerNames, isTacticsBoardView, tacticalDiscs, tacticalBallPosition, ballImage]); // Remove gameEvents dependency

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

    // Start drawing (only if drawing mode is enabled)
    if (isDrawingEnabled) {
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
      setIsDraggingBall(false);
    } else if (isDraggingTacticalDisc) {
      setIsDraggingTacticalDisc(false);
      setDraggingTacticalDiscId(null);
    } else if (isDraggingPlayer) {
      onPlayerMoveEnd();
      setIsDraggingPlayer(false);
      setDraggingPlayerId(null);
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

    // *** Check if placing a tapped player ***
    if (draggingPlayerFromBarInfo) {
        logger.log("Field TouchStart: Placing player from bar tap:", draggingPlayerFromBarInfo.id);
        // Don't preventDefault here for placing, allow potential scroll if placement fails
        onPlayerDropViaTouch(relPos.relX, relPos.relY);
        setActiveTouchId(null); 
        return; 
    }

    const now = Date.now();
    let tappedTargetId: string | null = null;
    let tappedTargetType: 'player' | 'opponent' | 'tactical' | 'ball' | null = null;

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
        e.preventDefault();
        return;
      }
    }
    setLastTapInfo({ time: now, x: absEventX, y: absEventY, targetId: tappedTargetId, targetType: tappedTargetType });

    // Start Dragging or Drawing
    if (tappedTargetType === 'ball') {
      setIsDraggingBall(true);
      e.preventDefault();
    } else if (tappedTargetType === 'player' && tappedTargetId) {
      setIsDraggingPlayer(true);
      setDraggingPlayerId(tappedTargetId);
      e.preventDefault();
    } else if (tappedTargetType === 'opponent' && tappedTargetId) {
      setIsDraggingOpponent(true);
      setDraggingOpponentId(tappedTargetId);
      e.preventDefault();
    } else if (tappedTargetType === 'tactical' && tappedTargetId) {
      setIsDraggingTacticalDisc(true);
      setDraggingTacticalDiscId(tappedTargetId);
      e.preventDefault();
    } else if (!draggingPlayerFromBarInfo && isDrawingEnabled) {
      setIsDrawing(true);
      onDrawingStart(relPos);
      e.preventDefault();
    }
  }, [
    isPointInBall, isTacticsBoardView, tacticalDiscs, onToggleTacticalDiscType, onTacticalDiscRemove, isPointInTacticalDisc,
    players, onPlayerRemove, isPointInPlayer, opponents, onOpponentRemove, isPointInOpponent,
    draggingPlayerFromBarInfo, onPlayerDropViaTouch,
    lastTapInfo, onDrawingStart, isDrawingEnabled
  ]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (activeTouchId === null) return;

    const currentTouch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId);
    if (!currentTouch) return;

    if (isDraggingBall || isDraggingPlayer || isDraggingOpponent || isDrawing || isDraggingTacticalDisc) {
      e.preventDefault();
    }
    
    const pos = getRelativeEventPosition(e, activeTouchId);
    if (!pos) return;

    if (isDraggingBall) {
      onTacticalBallMove(pos);
    } else if (isDraggingTacticalDisc && draggingTacticalDiscId) {
      onTacticalDiscMove(draggingTacticalDiscId, pos.relX, pos.relY);
    } else if (isDraggingPlayer && draggingPlayerId) {
      onPlayerMove(draggingPlayerId, pos.relX, pos.relY);
    } else if (isDraggingOpponent && draggingOpponentId) {
      onOpponentMove(draggingOpponentId, pos.relX, pos.relY);
    } else if (isDrawing) {
      onDrawingAddPoint(pos);
    }
  }, [activeTouchId, isDrawing, isDraggingPlayer, isDraggingOpponent, draggingPlayerId, draggingOpponentId, onPlayerMove, onOpponentMove, onDrawingAddPoint, isDraggingTacticalDisc, draggingTacticalDiscId, onTacticalDiscMove, isDraggingBall, onTacticalBallMove]);

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (activeTouchId !== null) {
      let touchEnded = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          touchEnded = true;
          break;
        }
      }
      if (!touchEnded) return;
    }

    if (isDraggingBall) {
      setIsDraggingBall(false);
    } else if (isDraggingTacticalDisc) {
      setIsDraggingTacticalDisc(false);
      setDraggingTacticalDiscId(null);
    } else if (isDraggingPlayer) {
      onPlayerMoveEnd();
      setIsDraggingPlayer(false);
      setDraggingPlayerId(null);
    } else if (isDraggingOpponent && draggingOpponentId) {
      onOpponentMoveEnd(draggingOpponentId);
      setIsDraggingOpponent(false);
      setDraggingOpponentId(null);
    } else if (isDrawing) {
      onDrawingEnd();
      setIsDrawing(false);
    } else if (isDraggingTacticalDisc) {
      setIsDraggingTacticalDisc(false);
      setDraggingTacticalDiscId(null);
    }

    if (draggingPlayerFromBarInfo) {
      onPlayerDragCancelViaTouch();
    }

    setActiveTouchId(null);
  };

  // --- HTML Drag and Drop Handlers (Needs update for CSS size) ---
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

    // Add listeners manually with passive: false
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Cleanup function to remove the listeners
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleTouchStart, handleTouchMove]); // Re-run if the handler function instances change

  // --- Render Canvas ---
  return (
    <div className={`w-full h-full relative bg-green-700`} data-testid="soccer-field">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full touch-none" // Added touch-none
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchEnd={handleTouchEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      />
      {/* Optional: Render player names/numbers as separate HTML elements over the canvas? */}
    </div>
  );
};

export default SoccerField; 