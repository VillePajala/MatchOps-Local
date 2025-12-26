/**
 * @jest-environment jsdom
 *
 * Tests for useFocusTrap hook - accessibility focus management
 *
 * @critical Tests core focus trap functionality for modal accessibility (WCAG 2.1 AA)
 */

import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';
import { act } from 'react';

describe('useFocusTrap', () => {
  let container: HTMLDivElement;
  let button1: HTMLButtonElement;
  let button2: HTMLButtonElement;
  let input: HTMLInputElement;
  let mockOnClose: jest.Mock;

  beforeEach(() => {
    // Create a container with focusable elements
    container = document.createElement('div');
    button1 = document.createElement('button');
    button1.textContent = 'First Button';
    button2 = document.createElement('button');
    button2.textContent = 'Second Button';
    input = document.createElement('input');
    input.type = 'text';

    container.appendChild(button1);
    container.appendChild(input);
    container.appendChild(button2);
    document.body.appendChild(container);

    mockOnClose = jest.fn();
  });

  afterEach(() => {
    document.body.removeChild(container);
    jest.clearAllMocks();
  });

  /**
   * Tests that first focusable element receives focus when modal opens
   * @critical
   */
  describe('Auto-focus on open', () => {
    it('should focus first focusable element when isOpen becomes true', () => {
      const { rerender } = renderHook(
        ({ isOpen }) => {
          const ref = useRef<HTMLDivElement>(container);
          useFocusTrap(ref, isOpen, mockOnClose);
          return ref;
        },
        { initialProps: { isOpen: false } }
      );

      expect(document.activeElement).not.toBe(button1);

      act(() => {
        rerender({ isOpen: true });
      });

      expect(document.activeElement).toBe(button1);
    });

    it('should not auto-focus when disableAutoFocus is true', () => {
      const initialActiveElement = document.activeElement;

      renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, true, mockOnClose, { disableAutoFocus: true });
        return ref;
      });

      expect(document.activeElement).toBe(initialActiveElement);
    });

    it('should focus initialFocusRef element when provided', () => {
      renderHook(() => {
        const containerRef = useRef<HTMLDivElement>(container);
        const initialFocusRef = useRef<HTMLInputElement>(input);
        useFocusTrap(containerRef, true, mockOnClose, { initialFocusRef });
        return containerRef;
      });

      expect(document.activeElement).toBe(input);
    });
  });

  /**
   * Tests Escape key handling
   * @critical
   */
  describe('Escape key handling', () => {
    it('should call onClose when Escape is pressed', () => {
      renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, true, mockOnClose);
        return ref;
      });

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(event);
      });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when disableEscape is true', () => {
      renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, true, mockOnClose, { disableEscape: true });
        return ref;
      });

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(event);
      });

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should not call onClose when onClose is not provided', () => {
      renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, true, undefined);
        return ref;
      });

      // Should not throw
      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(event);
      });
    });
  });

  /**
   * Tests Tab key focus trapping
   * @critical
   */
  describe('Tab focus trapping', () => {
    it('should cycle focus from last to first element on Tab', () => {
      renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, true, mockOnClose);
        return ref;
      });

      // Focus the last element
      act(() => {
        button2.focus();
      });
      expect(document.activeElement).toBe(button2);

      // Press Tab - should go to first element
      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
        document.dispatchEvent(event);
      });

      expect(document.activeElement).toBe(button1);
    });

    it('should cycle focus from first to last element on Shift+Tab', () => {
      renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, true, mockOnClose);
        return ref;
      });

      // Focus is on first element after open
      expect(document.activeElement).toBe(button1);

      // Press Shift+Tab - should go to last element
      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true });
        document.dispatchEvent(event);
      });

      expect(document.activeElement).toBe(button2);
    });
  });

  /**
   * Tests focus restoration on close
   * @critical
   */
  describe('Focus restoration', () => {
    it('should restore focus to previous element when modal closes', () => {
      // Create an external button to focus before opening modal
      const externalButton = document.createElement('button');
      externalButton.textContent = 'External';
      document.body.appendChild(externalButton);
      externalButton.focus();

      expect(document.activeElement).toBe(externalButton);

      const { unmount } = renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, true, mockOnClose);
        return ref;
      });

      // Focus moved to first element in container
      expect(document.activeElement).toBe(button1);

      // Unmount (close modal)
      act(() => {
        unmount();
      });

      // Focus should return to external button
      expect(document.activeElement).toBe(externalButton);

      document.body.removeChild(externalButton);
    });
  });

  /**
   * Tests that hook does nothing when isOpen is false
   */
  describe('Inactive state', () => {
    it('should not add event listeners when isOpen is false', () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, false, mockOnClose);
        return ref;
      });

      expect(addEventListenerSpy).not.toHaveBeenCalled();
      addEventListenerSpy.mockRestore();
    });

    it('should not focus any element when isOpen is false', () => {
      const initialActiveElement = document.activeElement;

      renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, false, mockOnClose);
        return ref;
      });

      expect(document.activeElement).toBe(initialActiveElement);
    });
  });

  /**
   * Tests cleanup on unmount
   */
  describe('Cleanup', () => {
    it('should remove event listeners on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      const { unmount } = renderHook(() => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, true, mockOnClose);
        return ref;
      });

      act(() => {
        unmount();
      });

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });
});
