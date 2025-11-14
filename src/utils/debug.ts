/**
 * Debug flag helper
 *
 * Usage:
 * - NEXT_PUBLIC_DEBUG: comma-separated categories (e.g., "home,history")
 * - NEXT_PUBLIC_DEBUG_ALL=1: enables all categories
 *
 * Example:
 *   if (debug.enabled('home')) { logger.log('...'); }
 */
export type DebugCategory = 'home' | 'history';

const enabledCategories = new Set(
  (process.env.NEXT_PUBLIC_DEBUG || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

const debugAll = process.env.NEXT_PUBLIC_DEBUG_ALL === '1';

export const debug = {
  enabled(category?: DebugCategory): boolean {
    if (debugAll) return true;
    if (!category) return enabledCategories.size > 0;
    return enabledCategories.has(category);
  },
};

export default debug;
