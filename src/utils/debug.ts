/**
 * Debug flag helper
 *
 * Usage:
 * - NEXT_PUBLIC_DEBUG: comma-separated categories (e.g., "home,history,tactical")
 * - NEXT_PUBLIC_DEBUG_ALL=1: enables all categories
 *
 * Categories:
 * - 'home': HomePage render cycles and state updates
 * - 'history': Undo/redo history operations (main field)
 * - 'tactical': Tactical view undo/redo and drawing operations
 *
 * Example:
 *   if (debug.enabled('home')) { logger.log('...'); }
 */
export type DebugCategory = 'home' | 'history' | 'tactical';

// Note: NEXT_PUBLIC_* env vars are replaced at build time by Next.js,
// so static module-level initialization is correct and intentional here.
// The values are inlined during the build process, not read at runtime.
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
