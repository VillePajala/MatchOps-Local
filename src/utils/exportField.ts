/**
 * Field Export Utility
 *
 * Exports the soccer/tactics field as a PNG image.
 * Can optionally include metadata overlay (team names, date, score).
 */

import logger from '@/utils/logger';

// Export configuration constants
const MAX_FILENAME_LENGTH = 100;
const OVERLAY_PADDING = 16;
const OVERLAY_FONT_SIZE_MIN = 14;
const OVERLAY_FONT_SIZE_MAX = 32;
const OVERLAY_FONT_SIZE_DIVISOR = 40;

/**
 * Sanitize filename for safe downloads
 * @internal Exported for testing
 */
export const sanitizeFilename = (name: string): string => {
  return name
    .replace(/[^a-zA-Z0-9\-_ ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, MAX_FILENAME_LENGTH)
    .replace(/^_+|_+$/g, '');
};

/**
 * Export options for field image
 */
export interface FieldExportOptions {
  /** Team name to include in filename */
  teamName?: string;
  /** Opponent name to include in filename */
  opponentName?: string;
  /** Game date for filename (YYYY-MM-DD) */
  gameDate?: string;
  /** Game time of day (HH:MM) */
  gameTime?: string;
  /** Image format (default: 'png') */
  format?: 'png' | 'jpeg';
  /** JPEG quality 0-1 (default: 0.92) */
  quality?: number;
  /** Add metadata overlay on image */
  includeOverlay?: boolean;
  /** Score to show on overlay */
  score?: { home: number; away: number };
  /** Whether team is home or away */
  homeOrAway?: 'home' | 'away';
  /** Current period number */
  currentPeriod?: number;
  /** Total number of periods */
  numberOfPeriods?: number;
  /** Elapsed time in seconds */
  timeElapsedInSeconds?: number;
  /** Game location/venue */
  gameLocation?: string;
  /** Age group (e.g., "U12", "P11") */
  ageGroup?: string;
  /** Game type */
  gameType?: 'soccer' | 'futsal';
}

/**
 * Generate a filename for the exported image
 * @internal Exported for testing
 */
export const generateFilename = (options: FieldExportOptions): string => {
  const parts: string[] = ['field'];

  if (options.teamName) {
    parts.push(sanitizeFilename(options.teamName));
  }

  if (options.opponentName) {
    parts.push('vs');
    parts.push(sanitizeFilename(options.opponentName));
  }

  if (options.gameDate) {
    parts.push(options.gameDate);
  } else {
    parts.push(new Date().toISOString().split('T')[0]);
  }

  const extension = options.format === 'jpeg' ? 'jpg' : 'png';
  return `${parts.join('_')}.${extension}`;
};

/**
 * Format seconds to MM:SS
 * @internal Exported for testing
 */
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Truncate text to fit within a maximum width
 * @internal Exported for testing
 */
export const truncateText = (
  text: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D
): string => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (ctx.measureText(truncated + '…').width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.length > 0 ? truncated + '…' : '…';
};

/**
 * Format date for display (localized if possible)
 */
const formatDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

/**
 * Draw metadata overlay on a canvas with header and footer bars
 */
const drawOverlay = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: FieldExportOptions
): void => {
  const padding = OVERLAY_PADDING;
  const fontSize = Math.max(OVERLAY_FONT_SIZE_MIN, Math.min(OVERLAY_FONT_SIZE_MAX, width / OVERLAY_FONT_SIZE_DIVISOR));
  const headerHeight = fontSize * 2.5 + padding;
  const footerHeight = fontSize * 2 + padding;

  ctx.save();

  // === HEADER BAR ===
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, width, headerHeight);

  ctx.textBaseline = 'middle';
  const headerY = headerHeight / 2;

  // Calculate reserved widths for header layout
  let scoreWidth = 0;
  let dateTimeWidth = 0;

  // Score on the left (large)
  if (options.score) {
    ctx.font = `bold ${fontSize * 1.6}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    const scoreText = `${options.score.home} - ${options.score.away}`;
    scoreWidth = ctx.measureText(scoreText).width + padding * 2;
    ctx.fillText(scoreText, padding, headerY);
  }

  // Calculate date/time width first (for matchup truncation)
  const dateTimeParts: string[] = [];
  if (options.gameDate) {
    dateTimeParts.push(formatDate(options.gameDate));
  }
  if (options.gameTime) {
    dateTimeParts.push(options.gameTime);
  }
  if (dateTimeParts.length > 0) {
    ctx.font = `${fontSize * 0.9}px system-ui, sans-serif`;
    const dateTimeText = dateTimeParts.join(' · ');
    dateTimeWidth = ctx.measureText(dateTimeText).width + padding * 2;
  }

  // Team names in center (with truncation to fit between score and date)
  // Convention: home team listed first (standard sports notation)
  const teamText = options.teamName || 'Team';
  const opponentText = options.opponentName || 'Opponent';
  const isHome = options.homeOrAway === 'home';
  const matchupText = isHome
    ? `${teamText} vs ${opponentText}`
    : `${opponentText} vs ${teamText}`;

  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  const maxMatchupWidth = width - scoreWidth - dateTimeWidth - padding * 2;
  const truncatedMatchup = truncateText(matchupText, maxMatchupWidth, ctx);
  const matchupWidth = ctx.measureText(truncatedMatchup).width;
  ctx.fillText(truncatedMatchup, (width - matchupWidth) / 2, headerY);

  // Date/time on the right
  if (dateTimeParts.length > 0) {
    ctx.font = `${fontSize * 0.9}px system-ui, sans-serif`;
    ctx.fillStyle = '#cccccc';
    const dateTimeText = dateTimeParts.join(' · ');
    const dtWidth = ctx.measureText(dateTimeText).width;
    ctx.fillText(dateTimeText, width - dtWidth - padding, headerY);
  }

  // === FOOTER BAR ===
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, height - footerHeight, width, footerHeight);

  const footerY = height - footerHeight / 2;

  // Calculate right side width first (for left side truncation)
  let footerRightWidth = 0;
  const rightItems: string[] = [];

  if (options.currentPeriod && options.numberOfPeriods) {
    rightItems.push(`Period ${options.currentPeriod}/${options.numberOfPeriods}`);
  }

  if (options.timeElapsedInSeconds !== undefined && options.timeElapsedInSeconds >= 0) {
    rightItems.push(`⏱ ${formatTime(options.timeElapsedInSeconds)}`);
  }

  if (rightItems.length > 0) {
    ctx.font = `bold ${fontSize * 0.9}px system-ui, sans-serif`;
    const rightText = rightItems.join('  ·  ');
    footerRightWidth = ctx.measureText(rightText).width + padding * 2;
  }

  // Footer left side: metadata (with truncation)
  const footerItems: string[] = [];

  // Game type icon/text
  if (options.gameType) {
    footerItems.push(options.gameType === 'futsal' ? '⚽ Futsal' : '⚽ Soccer');
  }

  // Age group
  if (options.ageGroup) {
    footerItems.push(options.ageGroup);
  }

  // Location
  if (options.gameLocation) {
    footerItems.push(`📍 ${options.gameLocation}`);
  }

  if (footerItems.length > 0) {
    ctx.font = `${fontSize * 0.85}px system-ui, sans-serif`;
    ctx.fillStyle = '#aaaaaa';
    const footerLeftText = footerItems.join('  ·  ');
    // Reserve space for watermark in center (~80px) and right items
    const maxFooterLeftWidth = width / 2 - padding * 2 - 40;
    const truncatedFooter = truncateText(footerLeftText, maxFooterLeftWidth, ctx);
    ctx.fillText(truncatedFooter, padding, footerY);
  }

  // Footer right side: period and timer
  if (rightItems.length > 0) {
    ctx.font = `bold ${fontSize * 0.9}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    const rightText = rightItems.join('  ·  ');
    const rightWidth = ctx.measureText(rightText).width;
    ctx.fillText(rightText, width - rightWidth - padding, footerY);
  }

  // MatchOps watermark (subtle, bottom center)
  ctx.font = `${fontSize * 0.7}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  const watermark = 'MatchOps';
  const watermarkWidth = ctx.measureText(watermark).width;
  ctx.fillText(watermark, (width - watermarkWidth) / 2, footerY);

  ctx.restore();
};

/**
 * Export a canvas element as a downloadable image
 *
 * @param canvas - The canvas element to export
 * @param options - Export options
 * @returns Promise that resolves when download is triggered
 */
export const exportFieldAsImage = async (
  canvas: HTMLCanvasElement,
  options: FieldExportOptions = {}
): Promise<void> => {
  const format = options.format || 'png';
  const quality = options.quality || 0.92;
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';

  try {
    // Create a copy of the canvas if we need to add overlay
    // Note: This temporarily doubles memory usage for large canvases (e.g., 4K displays)
    // The temporary canvas is garbage collected after blob creation completes
    let exportCanvas = canvas;

    if (options.includeOverlay) {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;

      const ctx = exportCanvas.getContext('2d');
      if (!ctx) {
        logger.error('[exportField] Failed to get 2d context - possible WebGL exhaustion or memory pressure');
        throw new Error('Failed to get canvas context - try closing other tabs');
      }

      // Draw original canvas
      ctx.drawImage(canvas, 0, 0);

      // Draw overlay
      drawOverlay(ctx, canvas.width, canvas.height, options);
    }

    // Convert to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      exportCanvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create image blob'));
        },
        mimeType,
        quality
      );
    });

    // Generate filename
    const filename = generateFilename(options);

    // Trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up immediately - modern browsers queue the download before revoke takes effect
    URL.revokeObjectURL(url);

    logger.log('[exportField] Field exported successfully:', filename);
  } catch (error) {
    logger.error('[exportField] Failed to export field:', error);
    throw error;
  }
};

/**
 * Check if field export is supported in the current browser
 * Verifies: canvas.toBlob, URL.createObjectURL, and anchor download attribute
 */
export const isExportSupported = (): boolean => {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;

  const canvas = document.createElement('canvas');
  const anchor = document.createElement('a');

  return (
    typeof canvas.toBlob === 'function' &&
    typeof URL.createObjectURL === 'function' &&
    'download' in anchor
  );
};
