import { render, screen, fireEvent, act } from '@testing-library/react';
import React, { useRef } from 'react';
import { useFocusTrap } from '../useFocusTrap';

// Test component that uses the hook
function TestModal({ isOpen, testId = 'modal' }: { isOpen: boolean; testId?: string }) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  if (!isOpen) return null;

  return (
    <div ref={modalRef} data-testid={testId}>
      <button data-testid={`${testId}-first-button`}>First</button>
      <input data-testid={`${testId}-input`} type="text" />
      <button data-testid={`${testId}-last-button`}>Last</button>
    </div>
  );
}

// Wrapper for backwards compatibility with existing tests
function SimpleTestModal({ isOpen }: { isOpen: boolean }) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  if (!isOpen) return null;

  return (
    <div ref={modalRef} data-testid="modal">
      <button data-testid="first-button">First</button>
      <input data-testid="input" type="text" />
      <button data-testid="last-button">Last</button>
    </div>
  );
}

// Test component with disabled elements
function TestModalWithDisabled({ isOpen }: { isOpen: boolean }) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  if (!isOpen) return null;

  return (
    <div ref={modalRef} data-testid="modal">
      <button data-testid="first-button">First</button>
      <button disabled data-testid="disabled-button">Disabled</button>
      <button data-testid="last-button">Last</button>
    </div>
  );
}

// Helper to reset the module's internal state between tests
// The inertRefCount is a module-level variable that persists between tests
beforeEach(() => {
  // Reset by ensuring no modals are "open" from previous tests
  jest.resetModules();
});

describe('useFocusTrap', () => {
  beforeEach(() => {
    // Create a mock app root for inert testing
    const appRoot = document.createElement('div');
    appRoot.id = '__next';
    document.body.appendChild(appRoot);
  });

  afterEach(() => {
    // Clean up
    const appRoot = document.getElementById('__next');
    if (appRoot) {
      appRoot.removeAttribute('inert');
      document.body.removeChild(appRoot);
    }
  });

  describe('Tab cycling', () => {
    it('should wrap focus from last element to first on Tab', () => {
      render(<SimpleTestModal isOpen={true} />);

      const lastButton = screen.getByTestId('last-button');
      const firstButton = screen.getByTestId('first-button');

      // Focus the last button
      act(() => {
        lastButton.focus();
      });
      expect(document.activeElement).toBe(lastButton);

      // Press Tab - should wrap to first element
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });

      expect(document.activeElement).toBe(firstButton);
    });

    it('should wrap focus from first element to last on Shift+Tab', () => {
      render(<SimpleTestModal isOpen={true} />);

      const firstButton = screen.getByTestId('first-button');
      const lastButton = screen.getByTestId('last-button');

      // Focus the first button
      act(() => {
        firstButton.focus();
      });
      expect(document.activeElement).toBe(firstButton);

      // Press Shift+Tab - should wrap to last element
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

      expect(document.activeElement).toBe(lastButton);
    });

    it('should allow normal Tab navigation between elements', () => {
      render(<SimpleTestModal isOpen={true} />);

      const firstButton = screen.getByTestId('first-button');

      // Focus the first button
      act(() => {
        firstButton.focus();
      });

      // Press Tab - should NOT prevent default since we're not at the last element
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: false,
        bubbles: true,
      });
      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

      document.dispatchEvent(event);

      // When not at last element, preventDefault should NOT be called
      // (browser handles normal Tab navigation)
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should bring focus into modal when focus is outside', () => {
      render(<SimpleTestModal isOpen={true} />);

      const firstButton = screen.getByTestId('first-button');

      // Focus is on body (outside modal)
      act(() => {
        document.body.focus();
      });

      // Press Tab - should bring focus to first element in modal
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });

      expect(document.activeElement).toBe(firstButton);
    });

    it('should bring focus to last element when Shift+Tab and focus is outside', () => {
      render(<SimpleTestModal isOpen={true} />);

      const lastButton = screen.getByTestId('last-button');

      // Focus is on body (outside modal)
      act(() => {
        document.body.focus();
      });

      // Press Shift+Tab - should bring focus to last element in modal
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

      expect(document.activeElement).toBe(lastButton);
    });

    it('should skip disabled elements', () => {
      render(<TestModalWithDisabled isOpen={true} />);

      const firstButton = screen.getByTestId('first-button');
      const lastButton = screen.getByTestId('last-button');

      // Focus the last button
      act(() => {
        lastButton.focus();
      });

      // Press Tab - should wrap to first (skipping disabled)
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });

      expect(document.activeElement).toBe(firstButton);
    });
  });

  describe('inert attribute', () => {
    it('should apply inert attribute to app root when modal opens', () => {
      const { rerender } = render(<SimpleTestModal isOpen={false} />);

      const appRoot = document.getElementById('__next');
      expect(appRoot?.hasAttribute('inert')).toBe(false);

      // Open modal
      rerender(<SimpleTestModal isOpen={true} />);

      expect(appRoot?.hasAttribute('inert')).toBe(true);
    });

    it('should remove inert attribute when modal closes', () => {
      const { rerender } = render(<SimpleTestModal isOpen={true} />);

      const appRoot = document.getElementById('__next');
      expect(appRoot?.hasAttribute('inert')).toBe(true);

      // Close modal
      rerender(<SimpleTestModal isOpen={false} />);

      expect(appRoot?.hasAttribute('inert')).toBe(false);
    });

    it('should keep inert when one of multiple modals closes', () => {
      // Render two modals, both open
      const { rerender } = render(
        <>
          <TestModal isOpen={true} testId="modal-a" />
          <TestModal isOpen={true} testId="modal-b" />
        </>
      );

      const appRoot = document.getElementById('__next');
      expect(appRoot?.hasAttribute('inert')).toBe(true);

      // Close modal A, modal B still open
      rerender(
        <>
          <TestModal isOpen={false} testId="modal-a" />
          <TestModal isOpen={true} testId="modal-b" />
        </>
      );

      // Should still be inert because modal B is open
      expect(appRoot?.hasAttribute('inert')).toBe(true);

      // Close modal B too
      rerender(
        <>
          <TestModal isOpen={false} testId="modal-a" />
          <TestModal isOpen={false} testId="modal-b" />
        </>
      );

      // Now should not be inert
      expect(appRoot?.hasAttribute('inert')).toBe(false);
    });
  });

  describe('keyboard events', () => {
    it('should not interfere with non-Tab keys', () => {
      render(<SimpleTestModal isOpen={true} />);

      const firstButton = screen.getByTestId('first-button');
      act(() => {
        firstButton.focus();
      });

      // Press Enter - should not affect focus
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      });
      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

      document.dispatchEvent(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(firstButton);
    });

    it('should not trap focus when modal is closed', () => {
      render(<SimpleTestModal isOpen={false} />);

      // Modal is not rendered, so Tab should work normally
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
      });
      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

      document.dispatchEvent(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean up event listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      const { unmount } = render(<SimpleTestModal isOpen={true} />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });
});
