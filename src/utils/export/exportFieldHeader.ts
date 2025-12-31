/**
 * Header and Footer Rendering for Field Export
 *
 * Handles drawing the header section (score, team names, metadata)
 * and footer section (watermark) on exported field images.
 */

import logger from '@/utils/logger';
import { truncateText, formatDate } from './exportFieldUtils';
import type { FieldExportOptions } from './types';

// Header configuration constants
export const OVERLAY_PADDING = 16;
export const OVERLAY_FONT_SIZE_MIN = 14;
export const OVERLAY_FONT_SIZE_MAX = 32;
export const OVERLAY_FONT_SIZE_DIVISOR = 40;
const LOGO_LOAD_TIMEOUT_MS = 3000;

// Header row height multipliers (relative to fontSize)
const HEADER_SCORE_HEIGHT = 2.5;
const HEADER_TEAM_HEIGHT = 1.2;
const HEADER_META_ROW_1_SPACING = 1.3;
const HEADER_META_ROW_2_SPACING = 1.2;
// Reduced spacing when no metadata rows are present
const HEADER_NO_META_SPACING = 0.5;

/**
 * Calculate responsive font size based on canvas width
 */
export const calculateFontSize = (width: number): number =>
  Math.max(OVERLAY_FONT_SIZE_MIN, Math.min(OVERLAY_FONT_SIZE_MAX, width / OVERLAY_FONT_SIZE_DIVISOR));

/**
 * Calculate the height needed for the header section dynamically
 * based on what content will actually be rendered.
 */
export const calculateHeaderHeight = (
  width: number,
  options?: FieldExportOptions
): number => {
  const fontSize = calculateFontSize(width);

  // Base rows: score + team names (always present)
  let heightMultiplier = HEADER_SCORE_HEIGHT + HEADER_TEAM_HEIGHT;

  // Row 3: primary metadata (date, time, age group) - only if any present
  const hasPrimaryMeta = options?.gameDate || options?.gameTime || options?.ageGroup;
  if (hasPrimaryMeta) {
    heightMultiplier += HEADER_META_ROW_1_SPACING;
  }

  // Row 4: secondary metadata (season/tournament, location) - only if any present
  const hasSecondaryMeta = options?.seasonName || options?.tournamentName || options?.gameLocation;
  if (hasSecondaryMeta) {
    heightMultiplier += HEADER_META_ROW_2_SPACING;
  }

  // Minimal spacing when no metadata - just enough padding below team names
  if (!hasPrimaryMeta && !hasSecondaryMeta) {
    heightMultiplier += HEADER_NO_META_SPACING;
  }

  return fontSize * heightMultiplier + OVERLAY_PADDING * 3;
};

/**
 * Load the MatchOps logo image with race condition protection
 */
export const loadLogo = (): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    let resolved = false;

    const img = new Image();
    img.crossOrigin = 'anonymous'; // Prevent canvas tainting

    img.onload = () => {
      if (!resolved) {
        resolved = true;
        resolve(img);
      }
    };

    img.onerror = () => {
      if (!resolved) {
        resolved = true;
        logger.warn('[exportFieldHeader] Failed to load logo, continuing without it');
        resolve(null);
      }
    };

    // Timeout for slow connections
    setTimeout(() => {
      if (!resolved && !img.complete) {
        resolved = true;
        logger.warn('[exportFieldHeader] Logo loading timed out, continuing without it');
        resolve(null);
      }
    }, LOGO_LOAD_TIMEOUT_MS);

    img.src = '/logos/app-logo-yellow.png';
  });
};

/**
 * Draw game info header section (above the field, not overlaying it)
 * @internal Exported for testing
 */
export const drawHeader = (
  ctx: CanvasRenderingContext2D,
  width: number,
  headerHeight: number,
  options: FieldExportOptions,
  logo: HTMLImageElement | null
): void => {
  const padding = OVERLAY_PADDING;
  const fontSize = calculateFontSize(width);

  ctx.save();

  // Dark background for header
  ctx.fillStyle = '#1e293b'; // Slate-800
  ctx.fillRect(0, 0, width, headerHeight);

  // === LOGOS on left and right ===
  if (logo) {
    const logoHeight = headerHeight - padding * 2;
    const aspectRatio = logo.width / logo.height;
    const logoWidth = logoHeight * aspectRatio;
    // Left logo
    ctx.drawImage(logo, padding, padding, logoWidth, logoHeight);
    // Right logo
    ctx.drawImage(logo, width - padding - logoWidth, padding, logoWidth, logoHeight);
  }

  // Content stays centered on full width
  const centerX = width / 2;

  // === ROW 1: Score (large, centered) ===
  const row1Y = padding + fontSize * 1.2;
  if (options.score) {
    ctx.font = `bold ${fontSize * 2.5}px Rajdhani, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const scoreText = `${options.score.home} - ${options.score.away}`;
    ctx.fillText(scoreText, centerX, row1Y);
  }

  // === ROW 2: Team names ===
  const row2Y = row1Y + fontSize * 2;
  const teamText = options.teamName || 'Team';
  const opponentText = options.opponentName || 'Opponent';
  const isHome = options.homeOrAway === 'home';
  const matchupText = isHome
    ? `${teamText}  vs  ${opponentText}`
    : `${opponentText}  vs  ${teamText}`;

  ctx.font = `bold ${fontSize * 1.2}px Rajdhani, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  const truncatedMatchup = truncateText(matchupText, width - padding * 2, ctx);
  ctx.fillText(truncatedMatchup, centerX, row2Y);

  // === ROW 3: Primary metadata (date, time, age group) ===
  const row3Y = row2Y + fontSize * 1.8;
  const primaryMeta: string[] = [];

  // Date and time
  if (options.gameDate) {
    primaryMeta.push(formatDate(options.gameDate, options.locale));
  }
  if (options.gameTime) {
    primaryMeta.push(options.gameTime);
  }

  // Age group
  if (options.ageGroup) {
    primaryMeta.push(options.ageGroup);
  }

  ctx.font = `${fontSize}px Rajdhani, sans-serif`;
  ctx.fillStyle = '#94a3b8'; // Slate-400
  ctx.textAlign = 'center';

  if (primaryMeta.length > 0) {
    const primaryText = primaryMeta.join('  ·  ');
    const truncatedPrimary = truncateText(primaryText, width - padding * 2, ctx);
    ctx.fillText(truncatedPrimary, centerX, row3Y);
  }

  // === ROW 4: Secondary metadata (season/tournament, location) ===
  // Position depends on whether primary row was rendered
  const row4Y = primaryMeta.length > 0 ? row3Y + fontSize * 1.2 : row3Y;
  const secondaryMeta: string[] = [];

  // Season or Tournament (show one, prefer tournament if both present)
  if (options.tournamentName) {
    secondaryMeta.push(`🏆 ${options.tournamentName}`);
  } else if (options.seasonName) {
    secondaryMeta.push(`📅 ${options.seasonName}`);
  }

  // Location
  if (options.gameLocation) {
    secondaryMeta.push(`📍 ${options.gameLocation}`);
  }

  if (secondaryMeta.length > 0) {
    const secondaryText = secondaryMeta.join('  ·  ');
    const truncatedSecondary = truncateText(secondaryText, width - padding * 2, ctx);
    ctx.fillText(truncatedSecondary, centerX, row4Y);
  }

  ctx.restore();
};

/**
 * Draw subtle watermark footer (below the field)
 */
export const drawFooter = (
  ctx: CanvasRenderingContext2D,
  width: number,
  yOffset: number,
  footerHeight: number
): void => {
  const fontSize = Math.max(10, Math.min(14, width / 50));

  ctx.save();

  // Dark background
  ctx.fillStyle = '#0f172a'; // Slate-900
  ctx.fillRect(0, yOffset, width, footerHeight);

  // Watermark
  ctx.font = `${fontSize}px Rajdhani, sans-serif`;
  ctx.fillStyle = '#475569'; // Slate-600
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MatchOps', width / 2, yOffset + footerHeight / 2);

  ctx.restore();
};
