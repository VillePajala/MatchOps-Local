import { renderHook, act } from '@testing-library/react';
import { useFocusTrap } from '../useFocusTrap';
import logger from '@/utils/logger';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type KeydownHandler = (event: KeyboardEvent) => void;

const createFocusableContainer = () => {
  const container = document.createElement('div');
  const firstButton = document.createElement('button');
  firstButton.textContent = 'First';
  const middleButton = document.createElement('button');
  middleButton.textContent = 'Middle';
  const lastButton = document.createElement('button');
  lastButton.textContent = 'Last';

  container.appendChild(firstButton);
  container.appendChild(middleButton);
  container.appendChild(lastButton);
  document.body.appendChild(container);

  return {
    container,
    firstButton,
    middleButton,
    lastButton,
  };
};

const captureKeydownHandler = () => {
  const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
  const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
  let handler: KeydownHandler | null = null;

  addEventListenerSpy.mockImplementation((type, listener) => {
    if (type === 'keydown') {
      handler = listener as KeydownHandler;
    }
  });

  return {
    getHandler: () => handler,
    addEventListenerSpy,
    removeEventListenerSpy,
  };
};

describe('useFocusTrap', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /**
   * Tests critical focus trapping behavior for keyboard navigation.
   * @critical
   */
  it('should trap focus within container on Tab', () => {
    const { container, firstButton, lastButton } = createFocusableContainer();
    const containerRef = { current: container };
    const { getHandler } = captureKeydownHandler();

    renderHook(() => useFocusTrap(containerRef, true));

    lastButton.focus();
    const event = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    act(() => {
      getHandler()?.(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(firstButton);
  });

  /**
   * Tests focus cycling from last to first element on Tab.
   * @critical
   */
  it('should cycle focus from last to first element on Tab', () => {
    const { container, firstButton, lastButton } = createFocusableContainer();
    const containerRef = { current: container };
    const { getHandler } = captureKeydownHandler();

    renderHook(() => useFocusTrap(containerRef, true));

    lastButton.focus();
    const event = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    act(() => {
      getHandler()?.(event);
    });

    expect(document.activeElement).toBe(firstButton);
  });

  /**
   * Tests focus cycling from first to last element on Shift+Tab.
   * @critical
   */
  it('should cycle focus from first to last on Shift+Tab', () => {
    const { container, firstButton, lastButton } = createFocusableContainer();
    const containerRef = { current: container };
    const { getHandler } = captureKeydownHandler();

    renderHook(() => useFocusTrap(containerRef, true));

    firstButton.focus();
    const event = {
      key: 'Tab',
      shiftKey: true,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    act(() => {
      getHandler()?.(event);
    });

    expect(document.activeElement).toBe(lastButton);
  });

  /**
   * Tests Escape key handling to close the modal when enabled.
   * @critical
   */
  it('should close modal on Escape key when enabled', () => {
    const { container } = createFocusableContainer();
    const containerRef = { current: container };
    const onClose = jest.fn();
    const { getHandler } = captureKeydownHandler();

    renderHook(() => useFocusTrap(containerRef, true, onClose));

    const event = {
      key: 'Escape',
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    act(() => {
      getHandler()?.(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Tests Escape key disabling via options.
   * @edge-case
   */
  it('should not close on Escape when disableEscape is true', () => {
    const { container } = createFocusableContainer();
    const containerRef = { current: container };
    const onClose = jest.fn();
    const { getHandler } = captureKeydownHandler();

    renderHook(() => useFocusTrap(containerRef, true, onClose, { disableEscape: true }));

    const event = {
      key: 'Escape',
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    act(() => {
      getHandler()?.(event);
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * Tests restoring focus to the previously focused element on close.
   * @critical
   */
  it('should restore focus to previous element on close', () => {
    const { container } = createFocusableContainer();
    const containerRef = { current: container };
    const triggerButton = document.createElement('button');
    triggerButton.textContent = 'Trigger';
    document.body.appendChild(triggerButton);
    triggerButton.focus();

    const { rerender } = renderHook(
      ({ isOpen }) => useFocusTrap(containerRef, isOpen),
      { initialProps: { isOpen: true } }
    );

    expect(document.activeElement).not.toBe(triggerButton);

    act(() => {
      rerender({ isOpen: false });
    });

    expect(document.activeElement).toBe(triggerButton);
  });

  /**
   * Tests initial focus element selection when provided.
   * @critical
   */
  it('should focus initial element when initialFocusRef provided', () => {
    const { container, middleButton } = createFocusableContainer();
    const containerRef = { current: container };
    const initialFocusRef = { current: middleButton };

    renderHook(() => useFocusTrap(containerRef, true, undefined, { initialFocusRef }));

    expect(document.activeElement).toBe(middleButton);
  });

  /**
   * Tests handling containers with no focusable elements.
   * @edge-case
   */
  it('should handle container with no focusable elements gracefully', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const containerRef = { current: container };
    const { getHandler } = captureKeydownHandler();

    renderHook(() => useFocusTrap(containerRef, true));

    const event = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    act(() => {
      getHandler()?.(event);
    });

    expect(logger.warn).toHaveBeenCalledWith(
      '[useFocusTrap] No focusable elements found in container. Focus trap cannot cycle.'
    );
  });

  /**
   * Tests event listener cleanup on unmount.
   * @critical
   */
  it('should clean up event listeners on unmount', () => {
    const { container } = createFocusableContainer();
    const containerRef = { current: container };
    const { getHandler, addEventListenerSpy, removeEventListenerSpy } = captureKeydownHandler();

    const { unmount } = renderHook(() => useFocusTrap(containerRef, true));

    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', getHandler());

    act(() => {
      unmount();
    });

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', getHandler());
  });
});
