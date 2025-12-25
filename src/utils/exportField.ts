/**
 * Field Export Utility
 *
 * Exports the soccer/tactics field as a PNG image.
 * Can optionally include metadata overlay (team names, date, score).
 */

import logger from '@/utils/logger';

/**
 * Sanitize filename for safe downloads
 */
const sanitizeFilename = (name: string): string => {
  return name
    .replace(/[^a-zA-Z0-9\-_. ]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
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
 */
const generateFilename = (options: FieldExportOptions): string => {
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
 */
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
  const padding = 16;
  const fontSize = Math.max(14, Math.min(20, width / 35));
  const headerHeight = fontSize * 2.5 + padding;
  const footerHeight = fontSize * 2 + padding;

  ctx.save();

  // === HEADER BAR ===
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, width, headerHeight);

  ctx.textBaseline = 'middle';
  const headerY = headerHeight / 2;

  // Score on the left (large)
  if (options.score) {
    ctx.font = `bold ${fontSize * 1.6}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    const scoreText = `${options.score.home} - ${options.score.away}`;
    ctx.fillText(scoreText, padding, headerY);
  }

  // Team names in center
  const teamText = options.teamName || 'Team';
  const opponentText = options.opponentName || 'Opponent';
  const isHome = options.homeOrAway === 'home';
  const matchupText = isHome
    ? `${teamText} vs ${opponentText}`
    : `${opponentText} vs ${teamText}`;

  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  const matchupWidth = ctx.measureText(matchupText).width;
  ctx.fillText(matchupText, (width - matchupWidth) / 2, headerY);

  // Date/time on the right
  const dateTimeParts: string[] = [];
  if (options.gameDate) {
    dateTimeParts.push(formatDate(options.gameDate));
  }
  if (options.gameTime) {
    dateTimeParts.push(options.gameTime);
  }
  if (dateTimeParts.length > 0) {
    ctx.font = `${fontSize * 0.9}px system-ui, sans-serif`;
    ctx.fillStyle = '#cccccc';
    const dateTimeText = dateTimeParts.join(' · ');
    const dateTimeWidth = ctx.measureText(dateTimeText).width;
    ctx.fillText(dateTimeText, width - dateTimeWidth - padding, headerY);
  }

  // === FOOTER BAR ===
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, height - footerHeight, width, footerHeight);

  const footerY = height - footerHeight / 2;
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

  // Footer left side: metadata
  if (footerItems.length > 0) {
    ctx.font = `${fontSize * 0.85}px system-ui, sans-serif`;
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(footerItems.join('  ·  '), padding, footerY);
  }

  // Footer right side: period and timer
  const rightItems: string[] = [];

  if (options.currentPeriod && options.numberOfPeriods) {
    rightItems.push(`Period ${options.currentPeriod}/${options.numberOfPeriods}`);
  }

  if (options.timeElapsedInSeconds !== undefined && options.timeElapsedInSeconds > 0) {
    rightItems.push(`⏱ ${formatTime(options.timeElapsedInSeconds)}`);
  }

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
    let exportCanvas = canvas;

    if (options.includeOverlay) {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;

      const ctx = exportCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
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

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    logger.log('[exportField] Field exported successfully:', filename);
  } catch (error) {
    logger.error('[exportField] Failed to export field:', error);
    throw error;
  }
};

/**
 * Check if field export is supported in the current browser
 */
export const isExportSupported = (): boolean => {
  if (typeof document === 'undefined') return false;

  const canvas = document.createElement('canvas');
  return typeof canvas.toBlob === 'function';
};
