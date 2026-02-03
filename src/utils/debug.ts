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

/**
 * Expose Supabase diagnostics on window for easy console access.
 *
 * After calling this, you can run diagnostics from the browser console:
 * ```js
 * await window.runSupabaseDiagnostics()
 * ```
 *
 * Call this once during app initialization (e.g., in a useEffect).
 */
export function exposeSupabaseDiagnostics(): void {
  if (typeof window === 'undefined') return;

  // Define the global function
  (window as unknown as { runSupabaseDiagnostics?: () => Promise<unknown> }).runSupabaseDiagnostics = async () => {
    const { runSupabaseDiagnostics } = await import('@/datastore/factory');
    return runSupabaseDiagnostics();
  };

  // Log instructions to console (eslint-disable needed for user-facing debug instruction)
  // eslint-disable-next-line no-console
  console.log('[Debug] Supabase diagnostics available. Run: await window.runSupabaseDiagnostics()');
}
