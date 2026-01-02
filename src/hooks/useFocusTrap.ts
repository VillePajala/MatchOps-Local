'use client';

import { useEffect, RefObject } from 'react';

// Reference counter for nested modals
// When count > 0, app root should be inert
let inertRefCount = 0;

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
        '[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
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

    // Apply inert to main app content (sibling of modal portal)
    // The modal is portaled to document.body, so we mark other body children as inert
    // Use reference counting to handle nested modals correctly
    const appRoot = document.getElementById('__next') || document.querySelector('body > div:first-child');
    if (appRoot && appRoot !== modal && !modal.contains(appRoot)) {
      inertRefCount++;
      if (inertRefCount === 1) {
        appRoot.setAttribute('inert', '');
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Only remove inert when all modals have closed
      if (appRoot) {
        inertRefCount = Math.max(0, inertRefCount - 1);
        if (inertRefCount === 0) {
          appRoot.removeAttribute('inert');
        }
      }
    };
  }, [ref, isOpen]);
}

export default useFocusTrap;
