'use client';

import { useEffect, RefObject } from 'react';

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
  useEffect(() => {
    if (!isOpen || !ref.current) return;

    const modal = ref.current;

    // Find all focusable elements within the modal
    const getFocusableElements = (): HTMLElement[] => {
      const selector = [
        'button:not([disabled])',
        '[href]:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"]):not([disabled])',
      ].join(', ');

      return Array.from(modal.querySelectorAll<HTMLElement>(selector));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // If focus is outside modal, bring it inside
      if (!modal.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

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

    // Apply inert to main app content using the manager
    // This handles reference counting for nested modals
    const appRoot = focusTrapManager.getAppRoot();
    const shouldManageInert = appRoot && appRoot !== modal && !modal.contains(appRoot);

    if (shouldManageInert) {
      focusTrapManager.increment();
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      if (shouldManageInert) {
        focusTrapManager.decrement();
      }
    };
  }, [ref, isOpen]);
}

export default useFocusTrap;
