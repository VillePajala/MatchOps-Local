'use client';

import { useEffect, useRef, RefObject } from 'react';

/**
 * Selector for focusable elements within a modal.
 *
 * Covers standard interactive elements. Does NOT include:
 * - <details>/<summary> (rarely used in modals)
 * - [contenteditable] (not used in this app's modals)
 * - <audio>/<video> with controls (not used in modals)
 *
 * If these are needed in the future, add them to this selector.
 */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(', ');

/**
 * Manages inert state for focus trapping across multiple modals.
 * Uses reference counting to handle nested modals correctly.
 *
 * Singleton pattern with reset capability for testing.
 */
class FocusTrapManager {
  private refCount = 0;
  private appRoot: HTMLElement | null = null;

  getAppRoot(): HTMLElement | null {
    // Cache the app root lookup
    if (!this.appRoot) {
      this.appRoot = document.getElementById('__next') ||
        document.querySelector('body > div:first-child') as HTMLElement | null;
    }
    return this.appRoot;
  }

  increment(): void {
    this.refCount++;
    const appRoot = this.getAppRoot();
    if (this.refCount === 1 && appRoot) {
      appRoot.setAttribute('inert', '');
    }
  }

  decrement(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    const appRoot = this.getAppRoot();
    if (this.refCount === 0 && appRoot) {
      appRoot.removeAttribute('inert');
    }
  }

  /** Reset state - exposed for testing only */
  reset(): void {
    this.refCount = 0;
    const appRoot = this.getAppRoot();
    if (appRoot) {
      appRoot.removeAttribute('inert');
    }
    this.appRoot = null;
  }

  getRefCount(): number {
    return this.refCount;
  }
}

export const focusTrapManager = new FocusTrapManager();

/**
 * Focus trap hook for modal dialogs
 *
 * Traps keyboard focus within a modal when open:
 * - Tab cycles through focusable elements
 * - Shift+Tab cycles backwards
 * - Focus wraps from last to first and vice versa
 *
 * Also applies `inert` attribute to main app content to prevent
 * background interaction while modal is open.
 *
 * @param ref - Ref to the modal container element
 * @param isOpen - Whether the modal is currently open
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean
): void {
  // Store the listener in a ref to ensure we always remove the exact same function
  // This prevents potential memory leaks if the effect re-runs mid-transition
  const listenerRef = useRef<((event: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    if (!isOpen || !ref.current) return;

    const modal = ref.current;

    // Find all focusable elements within the modal
    const getFocusableElements = (): HTMLElement[] => {
      return Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // NESTED MODAL SAFETY: If focus is inside this modal, handle Tab.
      // If focus is NOT inside this modal (e.g., in a nested modal rendered via portal),
      // do NOT intercept - let the nested modal's handler handle it.
      if (!modal.contains(document.activeElement)) {
        // Focus is outside this modal. Check if it's in another modal (nested modal case).
        // If document.activeElement is in a dialog/modal, don't steal focus.
        const activeElement = document.activeElement as HTMLElement;
        const isInAnotherModal = activeElement?.closest('[role="dialog"], [aria-modal="true"]');
        if (isInAnotherModal && isInAnotherModal !== modal) {
          // Focus is in a different modal - don't interfere
          return;
        }

        // Focus is truly outside all modals - bring it into this modal
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      // Focus is inside this modal - handle Tab wrapping
      // Shift+Tab on first element -> go to last
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
      // Tab on last element -> go to first
      else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    // Store reference for reliable cleanup
    listenerRef.current = handleKeyDown;

    // Apply inert to main app content using the manager
    // This handles reference counting for nested modals
    //
    // SAFETY CHECK: We must verify that:
    // 1. appRoot exists
    // 2. appRoot is not the modal itself
    // 3. modal doesn't contain appRoot (shouldn't happen, but defensive)
    // 4. appRoot doesn't contain modal (CRITICAL: if modal is inside appRoot,
    //    setting appRoot to inert would make the modal inert too!)
    //
    // For portal-based modals (rendered to document.body), appRoot won't contain modal.
    // For non-portal modals (rendered inside #__next), we must NOT set inert.
    const appRoot = focusTrapManager.getAppRoot();
    const shouldManageInert = appRoot &&
      appRoot !== modal &&
      !modal.contains(appRoot) &&
      !appRoot.contains(modal);

    if (shouldManageInert) {
      focusTrapManager.increment();
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      // Use the stored reference to ensure we remove the exact listener we added
      if (listenerRef.current) {
        document.removeEventListener('keydown', listenerRef.current);
        listenerRef.current = null;
      }

      if (shouldManageInert) {
        focusTrapManager.decrement();
      }
    };
  }, [ref, isOpen]);
}

export default useFocusTrap;
