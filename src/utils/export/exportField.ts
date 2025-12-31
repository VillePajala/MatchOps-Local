/**
 * Core Field Export Logic
 *
 * Exports the soccer/tactics field as a PNG image.
 * Can optionally include metadata overlay (team names, date, score).
 */

import logger from '@/utils/logger';
import { sanitizeFilename } from './exportFieldUtils';
import { calculateHeaderHeight, loadLogo, drawHeader, drawFooter } from './exportFieldHeader';
import type { FieldExportOptions } from './types';

// Export configuration constants
const BLOB_CREATION_TIMEOUT_MS = 30000;
const URL_REVOKE_DELAY_MS = 5000;

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
    const headerHeight = options.includeOverlay
      ? calculateHeaderHeight(fieldWidth, options)
      : 0;
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
