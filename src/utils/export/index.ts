/**
 * Field Export Module
 *
 * Public API for exporting soccer/tactics field as images.
 *
 * @example
 * ```typescript
 * import { exportFieldAsImage, isExportSupported } from '@/utils/export';
 *
 * if (isExportSupported()) {
 *   await exportFieldAsImage(canvas, {
 *     teamName: 'Eagles',
 *     opponentName: 'Hawks',
 *     includeOverlay: true,
 *     score: { home: 2, away: 1 }
 *   });
 * }
 * ```
 */

// Types
export type { FieldExportOptions } from './types';

// Core export functions
export { exportFieldAsImage, generateFilename, isExportSupported } from './exportField';

// Header rendering
export { drawHeader, drawFooter, calculateHeaderHeight, calculateFontSize, loadLogo } from './exportFieldHeader';

// Utility functions
export {
  sanitizeFilename,
  truncateText,
  formatDate,
} from './exportFieldUtils';
