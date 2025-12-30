/**
 * Field drawing utilities for soccer and futsal visualizations.
 *
 * @remarks
 * This module provides functions to draw field/court markings based on
 * the field configuration. It supports both soccer fields and futsal courts
 * with their distinct visual elements.
 */

import type { FieldConfig } from '@/types/fieldConfig';

/**
 * Creates a noise pattern for grass texture effect.
 * @internal Used only by drawFieldBackground
 */
function createNoisePattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity: number
): CanvasPattern | null {
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
    const randomValue = Math.random() > 0.5 ? 255 : 0;
    data[i] = randomValue;
    data[i + 1] = randomValue;
    data[i + 2] = randomValue;
    data[i + 3] = alpha;
  }
  noiseCtx.putImageData(imageData, 0, 0);

  return ctx.createPattern(noiseCanvas, 'repeat');
}

/**
 * Draws the field background (base color and texture).
 */
export function drawFieldBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: FieldConfig
): void {
  const { style } = config;

  // 1. Base field color
  ctx.fillStyle = style.fieldColor;
  ctx.fillRect(0, 0, W, H);

  // 2. Add texture for grass fields
  if (style.showGrassTexture) {
    // Cloud-like pattern
    const cloudPattern = createNoisePattern(ctx, 400, 400, 0.02);
    if (cloudPattern) {
      ctx.fillStyle = cloudPattern;
      ctx.fillRect(0, 0, W, H);
    }

    // Fine grain pattern
    const grainPattern = createNoisePattern(ctx, 100, 100, 0.03);
    if (grainPattern) {
      ctx.fillStyle = grainPattern;
      ctx.fillRect(0, 0, W, H);
    }

    // Mowing stripes
    if (style.stripeCount > 0) {
      const stripeWidth = W / style.stripeCount;
      ctx.globalCompositeOperation = 'soft-light';
      for (let i = 0; i < style.stripeCount; i++) {
        ctx.fillStyle = (i % 2 === 0) ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)';
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, H);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // 3. Lighting overlays
  const linearGradient = ctx.createLinearGradient(0, 0, 0, H);
  linearGradient.addColorStop(0, 'rgba(0, 0, 0, 0.03)');
  linearGradient.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
  ctx.fillStyle = linearGradient;
  ctx.fillRect(0, 0, W, H);

  const hotspotRadius = H * 0.8;
  const radialGradient = ctx.createRadialGradient(
    W / 2, H * 0.3, 0,
    W / 2, H * 0.3, hotspotRadius
  );
  radialGradient.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
  radialGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = radialGradient;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Sets up line drawing style with shadows.
 * @param ctx - Canvas 2D rendering context
 * @param config - Field configuration containing style settings
 * @param scale - Scale factor for line width and shadows (default: 1)
 */
function setupLineStyle(
  ctx: CanvasRenderingContext2D,
  config: FieldConfig,
  scale: number = 1
): void {
  ctx.strokeStyle = config.style.lineColor;
  ctx.lineWidth = config.style.lineWidth * scale;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 2 * scale;
  ctx.shadowOffsetY = 1 * scale;
}

/**
 * Resets shadow effects after drawing.
 * @param ctx - Canvas 2D rendering context
 */
function resetShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Draws the outer boundary and halfway line.
 * @param ctx - Canvas 2D rendering context
 * @param W - Field width in pixels
 * @param H - Field height in pixels
 * @param lineMargin - Margin from canvas edge in pixels
 */
function drawBoundaryAndHalfway(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  lineMargin: number
): void {
  // Outer boundary
  ctx.beginPath();
  ctx.strokeRect(lineMargin, lineMargin, W - 2 * lineMargin, H - 2 * lineMargin);

  // Halfway line
  ctx.beginPath();
  ctx.moveTo(lineMargin, H / 2);
  ctx.lineTo(W - lineMargin, H / 2);
  ctx.stroke();
}

/**
 * Draws the center circle and center spot.
 * @param ctx - Canvas 2D rendering context
 * @param W - Field width in pixels
 * @param H - Field height in pixels
 * @param config - Field configuration containing center circle settings
 * @param scale - Scale factor for spot radius (default: 1)
 */
function drawCenterCircle(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: FieldConfig,
  scale: number = 1
): void {
  const centerRadius = Math.min(W, H) * config.centerCircle.radius;

  // Center circle
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, centerRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Center spot (no shadow)
  resetShadow(ctx);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  const spotRadius = 3 * scale;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, spotRadius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws corner arcs at all four corners.
 * @param ctx - Canvas 2D rendering context
 * @param W - Field width in pixels
 * @param H - Field height in pixels
 * @param config - Field configuration containing corner arc settings
 * @param lineMargin - Margin from canvas edge in pixels
 */
function drawCornerArcs(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: FieldConfig,
  lineMargin: number
): void {
  const cornerRadius = Math.min(W, H) * config.cornerArc.radius;

  // Top-left
  ctx.beginPath();
  ctx.arc(lineMargin, lineMargin, cornerRadius, 0, Math.PI / 2);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.arc(W - lineMargin, lineMargin, cornerRadius, Math.PI / 2, Math.PI);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.arc(lineMargin, H - lineMargin, cornerRadius, Math.PI * 1.5, 0);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.arc(W - lineMargin, H - lineMargin, cornerRadius, Math.PI, Math.PI * 1.5);
  ctx.stroke();
}

/**
 * Draws goals at both ends of the field.
 * @param ctx - Canvas 2D rendering context
 * @param W - Field width in pixels
 * @param H - Field height in pixels
 * @param config - Field configuration containing goal dimensions
 * @param lineMargin - Margin from canvas edge in pixels
 */
function drawGoals(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: FieldConfig,
  lineMargin: number
): void {
  const goalWidth = W * config.goal.width;
  const goalHeight = config.goal.height;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

  // Top goal
  ctx.fillRect((W - goalWidth) / 2, lineMargin, goalWidth, goalHeight);

  // Bottom goal
  ctx.fillRect((W - goalWidth) / 2, H - lineMargin - goalHeight, goalWidth, goalHeight);
}

/**
 * Draws soccer-specific field markings (rectangular penalty areas).
 */
export function drawSoccerMarkings(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: FieldConfig,
  scale: number = 1
): void {
  const lineMargin = 5 * scale;
  const centerRadius = Math.min(W, H) * config.centerCircle.radius;
  const penaltyBoxWidth = W * config.penaltyArea.width;
  const penaltyBoxHeight = H * config.penaltyArea.height;
  const goalBoxWidth = W * config.goalArea.width;
  const goalBoxHeight = H * config.goalArea.height;
  const penaltySpotDist = H * config.penaltySpotDistance;

  setupLineStyle(ctx, config, scale);

  // Outer boundary and halfway line
  drawBoundaryAndHalfway(ctx, W, H, lineMargin);

  // Center circle
  drawCenterCircle(ctx, W, H, config, scale);

  // Re-setup line style after center circle (which resets shadow)
  setupLineStyle(ctx, config, scale);

  // Top Penalty Area
  const topPenaltyX = (W - penaltyBoxWidth) / 2;
  ctx.beginPath();
  ctx.rect(topPenaltyX, lineMargin, penaltyBoxWidth, penaltyBoxHeight);
  ctx.stroke();

  // Top Penalty Arc (the D)
  if (config.penaltyArc.enabled) {
    ctx.beginPath();
    ctx.arc(W / 2, lineMargin + penaltyBoxHeight, centerRadius * config.penaltyArc.radiusMultiplier, 0, Math.PI, false);
    ctx.stroke();
  }

  // Top Goal Area (6-yard box)
  if (config.goalArea.enabled) {
    const topGoalX = (W - goalBoxWidth) / 2;
    ctx.beginPath();
    ctx.strokeRect(topGoalX, lineMargin, goalBoxWidth, goalBoxHeight);
  }

  // Bottom Penalty Area
  const bottomPenaltyY = H - lineMargin - penaltyBoxHeight;
  ctx.beginPath();
  ctx.rect(topPenaltyX, bottomPenaltyY, penaltyBoxWidth, penaltyBoxHeight);
  ctx.stroke();

  // Bottom Penalty Arc (the D)
  if (config.penaltyArc.enabled) {
    ctx.beginPath();
    ctx.arc(W / 2, H - lineMargin - penaltyBoxHeight, centerRadius * config.penaltyArc.radiusMultiplier, Math.PI, 0, false);
    ctx.stroke();
  }

  // Bottom Goal Area (6-yard box)
  if (config.goalArea.enabled) {
    const topGoalX = (W - goalBoxWidth) / 2;
    const bottomGoalY = H - lineMargin - goalBoxHeight;
    ctx.beginPath();
    ctx.strokeRect(topGoalX, bottomGoalY, goalBoxWidth, goalBoxHeight);
  }

  // Corner arcs
  drawCornerArcs(ctx, W, H, config, lineMargin);

  // Reset shadow for spots and goals
  resetShadow(ctx);

  // Penalty spots
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  const spotRadius = 3 * scale;

  // Top penalty spot
  ctx.beginPath();
  ctx.arc(W / 2, lineMargin + penaltySpotDist, spotRadius, 0, Math.PI * 2);
  ctx.fill();

  // Bottom penalty spot
  ctx.beginPath();
  ctx.arc(W / 2, H - lineMargin - penaltySpotDist, spotRadius, 0, Math.PI * 2);
  ctx.fill();

  // Goals
  drawGoals(ctx, W, H, config, lineMargin);
}

/**
 * Draws futsal-specific court markings (arc-shaped penalty areas).
 */
export function drawFutsalMarkings(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: FieldConfig,
  scale: number = 1
): void {
  const lineMargin = 5 * scale;
  const centerX = W / 2;
  const goalHalfWidth = (W * config.goal.width) / 2;
  const leftPostX = centerX - goalHalfWidth;
  const rightPostX = centerX + goalHalfWidth;

  // Ensure the 6m arc doesn't clip outside the side lines in narrow layouts.
  const maxArcRadiusFromSides = Math.max(0, Math.min(leftPostX - lineMargin, (W - lineMargin) - rightPostX));
  const penaltyArcRadius = Math.min(H * config.penaltyArea.height, maxArcRadiusFromSides);
  const penaltySpotDist = Math.min(H * config.penaltySpotDistance, penaltyArcRadius);

  setupLineStyle(ctx, config, scale);

  // Outer boundary and halfway line
  drawBoundaryAndHalfway(ctx, W, H, lineMargin);

  // Center circle
  drawCenterCircle(ctx, W, H, config, scale);

  // Re-setup line style after center circle
  setupLineStyle(ctx, config, scale);

  // === PENALTY AREAS (D-shape) ===
  // Official futsal marking: two quarter circles (radius 6m) from the outside of each goalpost,
  // connected by a straight line parallel to the goal line (at 6m).
  const topGoalLineY = lineMargin;
  const bottomGoalLineY = H - lineMargin;

  // === TOP PENALTY AREA ===
  ctx.beginPath();
  // Start from the outer point on the goal line (left side), arc down to the 6m line,
  // draw the flat 6m line between posts, then arc back up to the goal line (right side).
  ctx.moveTo(leftPostX - penaltyArcRadius, topGoalLineY);
  ctx.arc(leftPostX, topGoalLineY, penaltyArcRadius, Math.PI, Math.PI / 2, true);
  ctx.lineTo(rightPostX, topGoalLineY + penaltyArcRadius);
  ctx.arc(rightPostX, topGoalLineY, penaltyArcRadius, Math.PI / 2, 0, true);
  ctx.stroke();

  // === BOTTOM PENALTY AREA ===
  ctx.beginPath();
  ctx.moveTo(leftPostX - penaltyArcRadius, bottomGoalLineY);
  ctx.arc(leftPostX, bottomGoalLineY, penaltyArcRadius, Math.PI, -Math.PI / 2, false);
  ctx.lineTo(rightPostX, bottomGoalLineY - penaltyArcRadius);
  ctx.arc(rightPostX, bottomGoalLineY, penaltyArcRadius, -Math.PI / 2, 0, false);
  ctx.stroke();

  // Corner arcs (smaller in futsal - 25cm)
  drawCornerArcs(ctx, W, H, config, lineMargin);

  // Substitution zones (if enabled)
  if (config.substitutionZone?.enabled) {
    const zoneLength = H * config.substitutionZone.length;
    const zonePosition = H * config.substitutionZone.position;

    // Set dashed line style for substitution zones
    ctx.setLineDash([5 * scale, 5 * scale]);

    // Left side - top zone (above halfway)
    ctx.beginPath();
    ctx.moveTo(lineMargin, H / 2 - zonePosition);
    ctx.lineTo(lineMargin, H / 2 - zonePosition - zoneLength);
    ctx.stroke();

    // Left side - bottom zone (below halfway)
    ctx.beginPath();
    ctx.moveTo(lineMargin, H / 2 + zonePosition);
    ctx.lineTo(lineMargin, H / 2 + zonePosition + zoneLength);
    ctx.stroke();

    // Right side - top zone
    ctx.beginPath();
    ctx.moveTo(W - lineMargin, H / 2 - zonePosition);
    ctx.lineTo(W - lineMargin, H / 2 - zonePosition - zoneLength);
    ctx.stroke();

    // Right side - bottom zone
    ctx.beginPath();
    ctx.moveTo(W - lineMargin, H / 2 + zonePosition);
    ctx.lineTo(W - lineMargin, H / 2 + zonePosition + zoneLength);
    ctx.stroke();

    // Reset to solid line
    ctx.setLineDash([]);
  }

  // Reset shadow for spots and goals
  resetShadow(ctx);

  // Penalty spots
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  const spotRadius = 3 * scale;

  // First penalty spot (6m)
  ctx.beginPath();
  ctx.arc(W / 2, lineMargin + penaltySpotDist, spotRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(W / 2, H - lineMargin - penaltySpotDist, spotRadius, 0, Math.PI * 2);
  ctx.fill();

  // Second penalty spot (10m) - if enabled
  if (config.secondPenaltySpot?.enabled) {
    const secondSpotDist = H * config.secondPenaltySpot.distance;

    // Top second penalty spot
    ctx.beginPath();
    ctx.arc(W / 2, lineMargin + secondSpotDist, spotRadius, 0, Math.PI * 2);
    ctx.fill();

    // Bottom second penalty spot
    ctx.beginPath();
    ctx.arc(W / 2, H - lineMargin - secondSpotDist, spotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Goals
  drawGoals(ctx, W, H, config, lineMargin);
}

/**
 * Draws field markings based on game type.
 * Main entry point for drawing field lines.
 */
export function drawFieldMarkings(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: FieldConfig,
  scale: number = 1
): void {
  if (config.gameType === 'futsal') {
    drawFutsalMarkings(ctx, W, H, config, scale);
  } else {
    drawSoccerMarkings(ctx, W, H, config, scale);
  }
}

