/**
 * Utility functions for field export
 *
 * Contains pure helper functions for filename sanitization, text formatting,
 * and text truncation used by the export system.
 */

// Export configuration constants
export const MAX_FILENAME_LENGTH = 100;
export const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
];

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
export const formatDate = (dateStr: string, locale?: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};
