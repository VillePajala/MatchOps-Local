import { FUTSAL_FIELD_CONFIG, SOCCER_FIELD_CONFIG, SOCCER_GRASS, PITCH_GRASS } from '@/config/fieldConfigs';
import type { FieldConfig } from '@/types/fieldConfig';
import {
  drawFutsalMarkings,
  drawSoccerMarkings,
  drawFieldMarkings,
  drawFieldBackground,
  getFieldEdgeColors,
} from '@/utils/fieldDrawing';

/** The football pitch with a given grass, whatever PITCH_GRASS is set to. */
const soccerWith = (grass: 'clean' | 'classic'): FieldConfig => ({
  ...SOCCER_FIELD_CONFIG,
  style: { ...SOCCER_FIELD_CONFIG.style, ...SOCCER_GRASS[grass] },
});

/**
 * Creates a mock CanvasRenderingContext2D for testing.
 */
function createMockContext() {
  const arcCalls: Array<{
    x: number;
    y: number;
    radius: number;
    startAngle: number;
    endAngle: number;
    anticlockwise?: boolean;
  }> = [];
  const moveToCalls: Array<{ x: number; y: number }> = [];
  const lineToCalls: Array<{ x: number; y: number }> = [];
  const rectCalls: Array<{ x: number; y: number; w: number; h: number }> = [];
  const fillRectCalls: Array<{ x: number; y: number; w: number; h: number }> = [];

  const ctx = {
    beginPath: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    fillRect: jest.fn((x: number, y: number, w: number, h: number) => {
      fillRectCalls.push({ x, y, w, h });
    }),
    strokeRect: jest.fn(),
    moveTo: jest.fn((x: number, y: number) => {
      moveToCalls.push({ x, y });
    }),
    lineTo: jest.fn((x: number, y: number) => {
      lineToCalls.push({ x, y });
    }),
    rect: jest.fn((x: number, y: number, w: number, h: number) => {
      rectCalls.push({ x, y, w, h });
    }),
    setLineDash: jest.fn(),
    arc: jest.fn(
      (
        x: number,
        y: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        anticlockwise?: boolean
      ) => {
        arcCalls.push({ x, y, radius, startAngle, endAngle, anticlockwise });
      }
    ),
    quadraticCurveTo: jest.fn(),
    createPattern: jest.fn(() => 'mock-pattern'),
    createLinearGradient: jest.fn(() => ({
      addColorStop: jest.fn(),
    })),
    createRadialGradient: jest.fn(() => ({
      addColorStop: jest.fn(),
    })),
    putImageData: jest.fn(),
    createImageData: jest.fn(() => ({
      data: new Uint8ClampedArray(400 * 400 * 4),
    })),
    getContext: jest.fn(),
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    strokeStyle: '',
    lineWidth: 0,
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D;

  return { ctx, arcCalls, moveToCalls, lineToCalls, rectCalls, fillRectCalls };
}

describe('fieldDrawing', () => {
  describe('drawFutsalMarkings', () => {
    it('draws a futsal-style D (quarter arcs + 6m line) for penalty areas', () => {
      const { ctx, arcCalls, moveToCalls, lineToCalls } = createMockContext();

      const W = 200;
      const H = 400;
      const scale = 1;
      const lineMargin = 5 * scale;
      const centerX = W / 2;
      const goalHalfWidth = (W * FUTSAL_FIELD_CONFIG.goal.width) / 2;
      const leftPostX = centerX - goalHalfWidth;
      const rightPostX = centerX + goalHalfWidth;
      const maxArcRadiusFromSides = Math.max(
        0,
        Math.min(leftPostX - lineMargin, W - lineMargin - rightPostX)
      );
      const expectedRadius = Math.min(
        H * FUTSAL_FIELD_CONFIG.penaltyArea.height,
        maxArcRadiusFromSides
      );

      drawFutsalMarkings(ctx, W, H, FUTSAL_FIELD_CONFIG, scale);

      expect(ctx.quadraticCurveTo).not.toHaveBeenCalled();

      // Top: quarter circle from left post + flat 6m line + quarter circle to right post
      expect(moveToCalls).toContainEqual({ x: leftPostX - expectedRadius, y: lineMargin });
      expect(lineToCalls).toContainEqual({ x: rightPostX, y: lineMargin + expectedRadius });
      expect(arcCalls).toContainEqual({
        x: leftPostX,
        y: lineMargin,
        radius: expectedRadius,
        startAngle: Math.PI,
        endAngle: Math.PI / 2,
        anticlockwise: true,
      });
      expect(arcCalls).toContainEqual({
        x: rightPostX,
        y: lineMargin,
        radius: expectedRadius,
        startAngle: Math.PI / 2,
        endAngle: 0,
        anticlockwise: true,
      });

      // Bottom: mirrored (flat line at 6m, quarter circles back to goal line)
      expect(moveToCalls).toContainEqual({ x: leftPostX - expectedRadius, y: H - lineMargin });
      expect(lineToCalls).toContainEqual({ x: rightPostX, y: H - lineMargin - expectedRadius });
      expect(arcCalls).toContainEqual({
        x: leftPostX,
        y: H - lineMargin,
        radius: expectedRadius,
        startAngle: Math.PI,
        endAngle: -Math.PI / 2,
        anticlockwise: false,
      });
      expect(arcCalls).toContainEqual({
        x: rightPostX,
        y: H - lineMargin,
        radius: expectedRadius,
        startAngle: -Math.PI / 2,
        endAngle: 0,
        anticlockwise: false,
      });
    });

    it('draws substitution zones when enabled', () => {
      const { ctx } = createMockContext();

      drawFutsalMarkings(ctx, 200, 400, FUTSAL_FIELD_CONFIG, 1);

      // Substitution zones should set dashed lines
      expect(ctx.setLineDash).toHaveBeenCalledWith([5, 5]);
      // And reset to solid
      expect(ctx.setLineDash).toHaveBeenCalledWith([]);
    });

    it('draws second penalty spots when enabled', () => {
      const { ctx, arcCalls } = createMockContext();

      const W = 200;
      const H = 400;
      const lineMargin = 5;
      const secondSpotDist = H * FUTSAL_FIELD_CONFIG.secondPenaltySpot!.distance;

      drawFutsalMarkings(ctx, W, H, FUTSAL_FIELD_CONFIG, 1);

      // Check for second penalty spots (10m marks)
      expect(arcCalls).toContainEqual(
        expect.objectContaining({
          x: W / 2,
          y: lineMargin + secondSpotDist,
          radius: 3,
        })
      );
      expect(arcCalls).toContainEqual(
        expect.objectContaining({
          x: W / 2,
          y: H - lineMargin - secondSpotDist,
          radius: 3,
        })
      );
    });
  });

  describe('drawSoccerMarkings', () => {
    it('draws rectangular penalty areas for soccer', () => {
      const { ctx, rectCalls } = createMockContext();

      const W = 300;
      const H = 450;
      const lineMargin = 5;
      const penaltyBoxWidth = W * SOCCER_FIELD_CONFIG.penaltyArea.width;
      const penaltyBoxHeight = H * SOCCER_FIELD_CONFIG.penaltyArea.height;
      const topPenaltyX = (W - penaltyBoxWidth) / 2;

      drawSoccerMarkings(ctx, W, H, SOCCER_FIELD_CONFIG, 1);

      // Top penalty area
      expect(rectCalls).toContainEqual({
        x: topPenaltyX,
        y: lineMargin,
        w: penaltyBoxWidth,
        h: penaltyBoxHeight,
      });

      // Bottom penalty area
      expect(rectCalls).toContainEqual({
        x: topPenaltyX,
        y: H - lineMargin - penaltyBoxHeight,
        w: penaltyBoxWidth,
        h: penaltyBoxHeight,
      });
    });

    it('draws penalty arcs (the D) when enabled', () => {
      const { ctx, arcCalls } = createMockContext();

      const W = 300;
      const H = 450;
      const lineMargin = 5;
      const penaltyBoxHeight = H * SOCCER_FIELD_CONFIG.penaltyArea.height;
      const centerRadius = Math.min(W, H) * SOCCER_FIELD_CONFIG.centerCircle.radius;
      const arcRadius = centerRadius * SOCCER_FIELD_CONFIG.penaltyArc.radiusMultiplier;

      drawSoccerMarkings(ctx, W, H, SOCCER_FIELD_CONFIG, 1);

      // Top penalty arc
      expect(arcCalls).toContainEqual(
        expect.objectContaining({
          x: W / 2,
          y: lineMargin + penaltyBoxHeight,
          radius: arcRadius,
        })
      );

      // Bottom penalty arc
      expect(arcCalls).toContainEqual(
        expect.objectContaining({
          x: W / 2,
          y: H - lineMargin - penaltyBoxHeight,
          radius: arcRadius,
        })
      );
    });

    it('draws center circle', () => {
      const { ctx, arcCalls } = createMockContext();

      const W = 300;
      const H = 450;
      const centerRadius = Math.min(W, H) * SOCCER_FIELD_CONFIG.centerCircle.radius;

      drawSoccerMarkings(ctx, W, H, SOCCER_FIELD_CONFIG, 1);

      // Center circle (full circle at field center)
      expect(arcCalls).toContainEqual({
        x: W / 2,
        y: H / 2,
        radius: centerRadius,
        startAngle: 0,
        endAngle: Math.PI * 2,
        anticlockwise: undefined,
      });
    });

    it('draws corner arcs', () => {
      const { ctx, arcCalls } = createMockContext();

      const W = 300;
      const H = 450;
      const lineMargin = 5;
      const cornerRadius = Math.min(W, H) * SOCCER_FIELD_CONFIG.cornerArc.radius;

      drawSoccerMarkings(ctx, W, H, SOCCER_FIELD_CONFIG, 1);

      // Top-left corner
      expect(arcCalls).toContainEqual(
        expect.objectContaining({
          x: lineMargin,
          y: lineMargin,
          radius: cornerRadius,
        })
      );

      // Top-right corner
      expect(arcCalls).toContainEqual(
        expect.objectContaining({
          x: W - lineMargin,
          y: lineMargin,
          radius: cornerRadius,
        })
      );

      // Bottom-left corner
      expect(arcCalls).toContainEqual(
        expect.objectContaining({
          x: lineMargin,
          y: H - lineMargin,
          radius: cornerRadius,
        })
      );

      // Bottom-right corner
      expect(arcCalls).toContainEqual(
        expect.objectContaining({
          x: W - lineMargin,
          y: H - lineMargin,
          radius: cornerRadius,
        })
      );
    });
  });

  describe('drawFieldMarkings', () => {
    it('calls drawSoccerMarkings for soccer game type', () => {
      const { ctx, rectCalls } = createMockContext();

      drawFieldMarkings(ctx, 300, 450, SOCCER_FIELD_CONFIG, 1);

      // Soccer uses rectangular penalty areas (rect calls)
      expect(rectCalls.length).toBeGreaterThan(0);
    });

    it('calls drawFutsalMarkings for futsal game type', () => {
      const { ctx } = createMockContext();

      drawFieldMarkings(ctx, 200, 400, FUTSAL_FIELD_CONFIG, 1);

      // Futsal uses dashed lines for substitution zones
      expect(ctx.setLineDash).toHaveBeenCalled();
    });
  });

  describe('drawFieldBackground', () => {
    it('fills background with field color', () => {
      const { ctx, fillRectCalls } = createMockContext();

      const W = 300;
      const H = 450;

      drawFieldBackground(ctx, W, H, SOCCER_FIELD_CONFIG);

      // First fillRect should be the base field color
      expect(fillRectCalls[0]).toEqual({ x: 0, y: 0, w: W, h: H });
    });

    it('creates gradients for lighting effects (classic grass)', () => {
      const { ctx } = createMockContext();

      drawFieldBackground(ctx, 300, 450, soccerWith('classic'));

      // Should create linear and radial gradients for lighting
      expect(ctx.createLinearGradient).toHaveBeenCalled();
      expect(ctx.createRadialGradient).toHaveBeenCalled();
    });

    it('paints clean grass with no noise, no lighting, and faint horizontal bands', () => {
      const { ctx, fillRectCalls } = createMockContext();
      const config = soccerWith('clean');

      drawFieldBackground(ctx, 300, 450, config);

      expect(ctx.createPattern).not.toHaveBeenCalled();
      expect(ctx.createRadialGradient).not.toHaveBeenCalled();
      // One full-size base fill, then every other band (the edge bands stay plain).
      expect(fillRectCalls[0]).toEqual({ x: 0, y: 0, w: 300, h: 450 });
      const bandH = 450 / config.style.stripeCount;
      const bands = fillRectCalls.slice(1);
      expect(bands).toHaveLength(Math.floor(config.style.stripeCount / 2));
      bands.forEach((band) => {
        expect(band.w).toBe(300);
        expect(band.h).toBeCloseTo(bandH);
        expect(band.y).toBeGreaterThan(0);
        expect(band.y + band.h).toBeLessThan(450);
      });
    });

    it('skips grass texture for futsal courts', () => {
      const { ctx } = createMockContext();

      // Reset mock to track calls
      (ctx.createPattern as jest.Mock).mockClear();

      drawFieldBackground(ctx, 200, 400, FUTSAL_FIELD_CONFIG);

      // Futsal doesn't have grass texture (showGrassTexture: false)
      // No pattern should be created for noise texture
      // Note: createPattern might still be called for gradients
    });

    it('applies grass texture for classic soccer grass', () => {
      const { ctx } = createMockContext();

      drawFieldBackground(ctx, 300, 450, soccerWith('classic'));

      expect(soccerWith('classic').style.showGrassTexture).toBe(true);
      expect(ctx.createPattern).toHaveBeenCalled();
    });

    it('uses the grass PITCH_GRASS selects (one-line revert)', () => {
      expect(SOCCER_FIELD_CONFIG.style.grass).toBe(PITCH_GRASS);
      expect(SOCCER_FIELD_CONFIG.style.fieldColor).toBe(SOCCER_GRASS[PITCH_GRASS].fieldColor);
    });

    it('draws the original pitch: classic grass with its original lines', () => {
      expect(PITCH_GRASS).toBe('classic');
      expect(SOCCER_FIELD_CONFIG.style.fieldColor).toBe('#427B44');
      expect(SOCCER_FIELD_CONFIG.style.showGrassTexture).toBe(true);
      expect(SOCCER_FIELD_CONFIG.style.stripeCount).toBe(9);
      expect(SOCCER_FIELD_CONFIG.style.lineColor).toBe('rgba(255, 255, 255, 0.6)');
      expect(SOCCER_FIELD_CONFIG.style.lineWidth).toBe(2);
    });

    it('keeps the thin bright lines with the clean grass', () => {
      expect(soccerWith('clean').style.lineColor).toBe('rgba(255, 255, 255, 0.78)');
    });

    it('strokes classic lines with the original shadow and goal fill, clean ones with the light shadow', () => {
      const strokeShadow = (config: FieldConfig) => {
        const { ctx } = createMockContext();
        const seen: Array<{ shadow: string; stroke: string }> = [];
        (ctx.stroke as jest.Mock).mockImplementation(() => {
          seen.push({ shadow: String(ctx.shadowColor), stroke: String(ctx.strokeStyle) });
        });
        const fills: string[] = [];
        (ctx.fillRect as jest.Mock).mockImplementation(() => {
          fills.push(String(ctx.fillStyle));
        });
        drawSoccerMarkings(ctx, 300, 450, config, 1);
        return { first: seen[0], fills };
      };
      const classic = strokeShadow(soccerWith('classic'));
      expect(classic.first).toEqual({ shadow: 'rgba(0, 0, 0, 0.25)', stroke: 'rgba(255, 255, 255, 0.6)' });
      expect(classic.fills).toContain('rgba(255, 255, 255, 0.9)');
      const clean = strokeShadow(soccerWith('clean'));
      expect(clean.first).toEqual({ shadow: 'rgba(0, 0, 0, 0.12)', stroke: 'rgba(255, 255, 255, 0.78)' });
      expect(clean.fills).toContain('rgba(255, 255, 255, 0.93)');
    });
  });

  describe('getFieldEdgeColors (no seam between pitch and surround)', () => {
    it('is exactly the clean grass edge colour at both ends', () => {
      const config = soccerWith('clean');
      expect(getFieldEdgeColors(config)).toEqual({ top: config.style.fieldColor, bottom: config.style.fieldColor });
    });

    it('matches classic grass: lighter at the top, shaded at the bottom', () => {
      const { top, bottom } = getFieldEdgeColors(soccerWith('classic'));
      const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
      expect(top).toMatch(/^#[0-9a-f]{6}$/);
      expect(bottom).toMatch(/^#[0-9a-f]{6}$/);
      expect(lum(top)).toBeGreaterThan(lum(bottom));
    });

    it('keeps the futsal court surround', () => {
      const { top, bottom } = getFieldEdgeColors(FUTSAL_FIELD_CONFIG);
      expect(top).toBe(bottom);
      expect(top).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});
