/**
 * Focus Trap Hook for Modal Accessibility (WCAG 2.1 AA)
 *
 * Provides focus management for modal dialogs:
 * - Traps focus within the modal (Tab/Shift+Tab cycle)
 * - Auto-focuses first focusable element on open
 * - Handles Escape key to close
 * - Returns focus to trigger element on close
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useFocusTrap(containerRef, isOpen, onClose);
 */

import { useEffect, useRef, RefObject } from 'react';

// Selector for all focusable elements
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface UseFocusTrapOptions {
  /** Element to focus on open (if not provided, focuses first focusable) */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Disable escape key handling (if modal handles it separately) */
  disableEscape?: boolean;
  /** Disable auto-focus on open */
  disableAutoFocus?: boolean;
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose?: () => void,
  options: UseFocusTrapOptions = {}
): void {
  const { initialFocusRef, disableEscape = false, disableAutoFocus = false } = options;
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    // Store the element that had focus before modal opened
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    // Auto-focus initial element or first focusable
    if (!disableAutoFocus) {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else {
        const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        firstFocusable?.focus();
      }
    }

    // Get all focusable elements in container
    const getFocusableElements = (): HTMLElement[] => {
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    };

    // Handle Tab key to trap focus
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape key handler
      if (!disableEscape && event.key === 'Escape' && onClose) {
        event.preventDefault();
        onClose();
        return;
      }

      // Tab key focus trapping
      if (event.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

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
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Return focus to the element that triggered the modal
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose, containerRef, initialFocusRef, disableEscape, disableAutoFocus]);
}

export default useFocusTrap;
