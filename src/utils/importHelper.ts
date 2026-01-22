/**
 * Import Helper Utilities
 *
 * Provides file picker-based import for the Welcome Screen.
 * Uses the existing importFullBackup function for actual import logic.
 *
 * @see src/utils/fullBackup.ts
 */

import { importFullBackup } from './fullBackup';
import type { BackupRestoreResult } from '@/components/BackupRestoreResultsModal';
import logger from './logger';

export interface ImportFromFilePickerResult {
  /** Whether import succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Import result details if succeeded */
  result?: BackupRestoreResult;
  /** Whether user cancelled the file picker */
  cancelled?: boolean;
}

/**
 * Opens a file picker and imports the selected backup file.
 *
 * Used by the Welcome Screen for "Import Backup" functionality.
 * Wraps the existing importFullBackup function with file picker UI.
 *
 * @param showToast - Optional toast function for user feedback
 * @returns Promise resolving to import result
 *
 * @example
 * ```typescript
 * const result = await importFromFilePicker();
 * if (result.success) {
 *   // Import succeeded, proceed to StartScreen
 * } else if (result.cancelled) {
 *   // User cancelled, stay on Welcome Screen
 * } else {
 *   // Import failed, show error
 *   console.error(result.error);
 * }
 * ```
 */
export async function importFromFilePicker(
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void
): Promise<ImportFromFilePickerResult> {
  return new Promise((resolve) => {
    // Track if we've already resolved to prevent double-resolution
    let resolved = false;

    // Create hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    // Cleanup function to remove the input element and focus listener
    function cleanup() {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
      window.removeEventListener('focus', handleWindowFocus);
    }

    // Resolve helper that prevents double-resolution
    function safeResolve(result: ImportFromFilePickerResult) {
      if (!resolved) {
        resolved = true;
        resolve(result);
        cleanup();
      }
    }

    // Handle file selection
    input.onchange = async (event) => {
      // Remove focus listener immediately to prevent race condition
      // where the focus timeout could fire after file selection
      window.removeEventListener('focus', handleWindowFocus);

      try {
        const file = (event.target as HTMLInputElement).files?.[0];

        if (!file) {
          safeResolve({ success: false, cancelled: true });
          return;
        }

        logger.info(`[importHelper] Reading backup file: ${file.name}`);

        // Read file contents
        const jsonContent = await readFileAsText(file);

        // Import using existing full backup import
        // confirmed=true to skip the confirmation dialog (user already chose to import)
        // delayReload=true so we can handle navigation ourselves
        const result = await importFullBackup(
          jsonContent,
          undefined, // onImportSuccess - we'll handle this ourselves
          showToast,
          true, // confirmed
          true  // delayReload
        );

        if (result) {
          logger.info('[importHelper] Backup import succeeded', {
            games: result.statistics.gamesImported,
            players: result.statistics.playersImported,
          });
          safeResolve({ success: true, result });
        } else {
          // importFullBackup returns null if user cancelled the confirmation dialog
          // (shouldn't happen with confirmed=true, but handle gracefully)
          logger.info('[importHelper] Import cancelled or returned no result');
          safeResolve({ success: false, cancelled: true });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[importHelper] Backup import failed:', error);
        safeResolve({ success: false, error: errorMessage });
      }
    };

    // Handle cancel (user closes file picker without selecting)
    // Note: oncancel is not supported in all browsers (e.g., Safari)
    input.oncancel = () => {
      logger.info('[importHelper] File picker cancelled by user (oncancel)');
      safeResolve({ success: false, cancelled: true });
    };

    // Fallback for browsers that don't fire oncancel (e.g., Safari):
    // When window regains focus after file picker closes, check if a file was selected.
    // Use a delay to allow onchange to fire first if a file was selected.
    //
    // The 300ms delay is chosen to:
    // 1. Be long enough for onchange to fire in most browsers (typically < 100ms)
    // 2. Be short enough for responsive UX (user doesn't wait long after closing picker)
    // 3. Account for slower devices where event processing may take longer
    // Note: The race condition with onchange is prevented by removing the focus listener
    // at the start of onchange handler, not by this timeout alone.
    const CANCEL_DETECTION_DELAY_MS = 300;

    function handleWindowFocus() {
      setTimeout(() => {
        if (!resolved && (!input.files || input.files.length === 0)) {
          logger.info('[importHelper] File picker cancelled by user (focus fallback)');
          safeResolve({ success: false, cancelled: true });
        }
      }, CANCEL_DETECTION_DELAY_MS);
    }

    // Add focus listener for cancel detection fallback
    window.addEventListener('focus', handleWindowFocus);

    // Add to DOM and trigger click
    try {
      document.body.appendChild(input);
      input.click();
    } catch (error) {
      // input.click() can fail in some browsers/security contexts
      logger.error('[importHelper] Failed to open file picker:', error);
      cleanup();
      resolve({ success: false, error: 'Failed to open file picker' });
    }
  });
}

/**
 * Read a File object as text.
 *
 * @param file - File to read
 * @returns Promise resolving to file contents as string
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        resolve(content);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };

    reader.readAsText(file);
  });
}
