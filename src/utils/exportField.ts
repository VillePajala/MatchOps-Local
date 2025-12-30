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
const BLOB_CREATION_TIMEOUT_MS = 30000;
const URL_REVOKE_DELAY_MS = 5000;

// Header row height multipliers (relative to fontSize)
const HEADER_SCORE_HEIGHT = 2.5;
const HEADER_TEAM_HEIGHT = 1.2;
const HEADER_META_ROW_1_SPACING = 1.3;
const HEADER_META_ROW_2_SPACING = 1.2;
const HEADER_TOTAL_HEIGHT_MULTIPLIER =
  HEADER_SCORE_HEIGHT + HEADER_TEAM_HEIGHT + HEADER_META_ROW_1_SPACING + HEADER_META_ROW_2_SPACING;
const WINDOWS_RESERVED_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

/**
 * Sanitize filename for safe downloads.
 * Transliterates Finnish/Nordic characters before removing special chars.
 * @internal Exported for testing
 */
export const sanitizeFilename = (name: string): string => {
  let clean = name
    // Transliterate Finnish/Nordic characters (preserve case)
    .replace(/Ä/g, 'A').replace(/ä/g, 'a')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Å/g, 'A').replace(/å/g, 'a')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    // Remove remaining special characters
    .replace(/[^a-zA-Z0-9\-_ ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, MAX_FILENAME_LENGTH)
    .replace(/^_+|_+$/g, '');

  // Prefix Windows reserved names to prevent filesystem issues
  if (WINDOWS_RESERVED_NAMES.includes(clean.toUpperCase())) {
    clean = `_${clean}`;
  }

  return clean || 'export';
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
  /** Game location/venue */
  gameLocation?: string;
  /** Age group (e.g., "U12", "P11") */
  ageGroup?: string;
  /** Season name (e.g., "Spring 2024") */
  seasonName?: string;
  /** Tournament name (e.g., "City Cup") */
  tournamentName?: string;
  /** Game type (used for filename only) */
  gameType?: 'soccer' | 'futsal';
  /** Translated game type label for overlay (e.g., "Jalkapallo", "Futsal") */
  gameTypeLabel?: string;
  /** Translated prefix for filename (e.g., "Jalkapallo", "Soccer") - replaces "field" */
  filenamePrefix?: string;
  /** Locale for date formatting (e.g., 'en', 'fi') */
  locale?: string;
  /** Export scale multiplier (default: 1 for native resolution) */
  scale?: number;
}

/**
 * Generate a filename for the exported image
 * @internal Exported for testing
 */
export const generateFilename = (options: FieldExportOptions): string => {
  // Use translated prefix or fall back to 'field'
  const prefix = options.filenamePrefix
    ? sanitizeFilename(options.filenamePrefix)
    : 'field';
  const parts: string[] = [prefix];

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
 * Truncate text to fit within a maximum width using binary search.
 * O(n log n) instead of O(n²) for long strings.
 * @internal Exported for testing
 */
export const truncateText = (
  text: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D
): string => {
  if (ctx.measureText(text).width <= maxWidth) return text;

  // Binary search for the optimal truncation point
  let low = 0;
  let high = text.length;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const testText = text.slice(0, mid) + '…';
    if (ctx.measureText(testText).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low > 0 ? text.slice(0, low) + '…' : '…';
};

/**
 * Format date for display (localized if possible)
 */
const formatDate = (dateStr: string, locale?: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

/**
 * Calculate the height needed for the header section
 */
const calculateHeaderHeight = (width: number): number => {
  const fontSize = Math.max(OVERLAY_FONT_SIZE_MIN, Math.min(OVERLAY_FONT_SIZE_MAX, width / OVERLAY_FONT_SIZE_DIVISOR));
  return fontSize * HEADER_TOTAL_HEIGHT_MULTIPLIER + OVERLAY_PADDING * 3;
};

/**
 * Load the MatchOps logo image with race condition protection
 */
const loadLogo = (): Promise<HTMLImageElement | null> => {
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
        logger.warn('[exportField] Failed to load logo, continuing without it');
        resolve(null);
      }
    };

    // Timeout for slow connections
    setTimeout(() => {
      if (!resolved && !img.complete) {
        resolved = true;
        logger.warn('[exportField] Logo loading timed out, continuing without it');
        resolve(null);
      }
    }, 3000);

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
  const fontSize = Math.max(OVERLAY_FONT_SIZE_MIN, Math.min(OVERLAY_FONT_SIZE_MAX, width / OVERLAY_FONT_SIZE_DIVISOR));

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
  const row4Y = row3Y + fontSize * 1.2;
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
const drawFooter = (
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

/**
 * Export a canvas element as a downloadable image
 *
 * @example
 * ```typescript
 * await exportFieldAsImage(canvas, {
 *   teamName: 'Eagles',
 *   opponentName: 'Hawks',
 *   includeOverlay: true,
 *   score: { home: 2, away: 1 }
 * });
 * ```
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
  // Clamp scale to reasonable range: 0.5x (half) to 4x (ultra high-res)
  const scale = Math.max(0.5, Math.min(4, options.scale ?? 1));
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';

  try {
    const sourceWidth = canvas.width;
    const sourceHeight = canvas.height;
    const fieldWidth = Math.round(sourceWidth * scale);
    const fieldHeight = Math.round(sourceHeight * scale);

    // Load logo for header (if overlay enabled)
    const logo = options.includeOverlay ? await loadLogo() : null;

    // Calculate header and footer sizes at scaled resolution
    const headerHeight = options.includeOverlay ? calculateHeaderHeight(fieldWidth) : 0;
    const footerHeight = options.includeOverlay ? Math.round(24 * scale) : 0;

    // Create export canvas with space for header + field + footer
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = fieldWidth;
    exportCanvas.height = headerHeight + fieldHeight + footerHeight;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) {
      logger.error('[exportField] Failed to get 2d context - possible WebGL exhaustion or memory pressure');
      throw new Error('Failed to get canvas context - try closing other tabs');
    }

    // Draw header section at top (with smoothing for crisp logo)
    if (options.includeOverlay) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      drawHeader(ctx, fieldWidth, headerHeight, options, logo);
    }

    // Draw the field at native resolution (disable smoothing for 1:1 pixel copy)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, headerHeight);

    // Draw footer section at bottom (re-enable smoothing)
    if (options.includeOverlay) {
      ctx.imageSmoothingEnabled = true;
      drawFooter(ctx, fieldWidth, headerHeight + fieldHeight, footerHeight);
    }

    // Log canvas size for debugging
    logger.log(`[exportField] Canvas size: ${exportCanvas.width}x${exportCanvas.height}`);

    // Convert to blob - try toBlob first, fall back to toDataURL
    let blob: Blob;
    try {
      blob = await new Promise<Blob>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('toBlob timed out'));
        }, BLOB_CREATION_TIMEOUT_MS);

        exportCanvas.toBlob(
          (b) => {
            clearTimeout(timeoutId);
            if (b) resolve(b);
            else reject(new Error('toBlob returned null'));
          },
          mimeType,
          quality
        );
      });
    } catch (toBlobError) {
      // Fallback to toDataURL method
      logger.warn('[exportField] toBlob failed, trying toDataURL fallback:', toBlobError);
      const dataUrl = exportCanvas.toDataURL(mimeType, quality);
      const response = await fetch(dataUrl);
      blob = await response.blob();
    }

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

    // Delay cleanup for slower devices where download may not have started yet
    setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS);

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
